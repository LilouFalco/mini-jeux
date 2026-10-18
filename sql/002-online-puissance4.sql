-- Mini-jeux online v2 (additive). Run AFTER 001-online.sql, in Supabase SQL Editor, as one block.
-- INCREMENTAL WORK IN PROGRESS: Seven-game draft bundle. Independent security review REQUIRED before application.
-- Do not apply before independent security review. Dedicated hidden-state RPCs; chess legality is client-side by explicit casual-game agreement.
-- Does not change keys, Auth settings, Realtime settings, or app_private grants.
begin;

do $$ begin
 if to_regclass('app_private.rooms') is null or to_regprocedure('public.online_action(uuid,uuid,bigint,uuid,text,integer)') is null
 then raise exception 'RUN_001_FIRST'; end if;
end $$;

alter table app_private.rooms drop constraint if exists rooms_board_shape;
alter table app_private.rooms add constraint rooms_board_shape check(
 game not in ('morpion','puissance4') or cardinality(board)=case game when 'puissance4' then 42 else 9 end);

create or replace function app_private.online_game_ok(g text) returns boolean
language sql immutable set search_path = '' as $$ select g in ('morpion','puissance4') $$;

create or replace function app_private.empty_board(g text) returns int[]
language sql immutable set search_path = '' as $$
 select case g when 'puissance4' then array_fill(0,array[42]) else array_fill(0,array[9]) end $$;

create or replace function app_private.create_room(p_name text,p_pseudo text,p_action uuid,p_game text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.actor(); n text; pseudo text; rid uuid; old app_private.rooms;
begin
 if p_action is null or p_game is null or not app_private.online_game_ok(p_game) then raise exception 'INVALID_ACTION'; end if;
 n := app_private.clean_text(p_name,3,40); pseudo := app_private.clean_text(p_pseudo,1,24);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into old from app_private.rooms where creator_uid=u and create_key=p_action;
 if found then
  if old.name<>n or old.game<>p_game then raise exception 'ACTION_REUSED'; end if;
  return app_private.snapshot(old.id);
 end if;
 perform app_private.throttle('create',3);
 update app_private.rooms set status='closed' where expires_at<=now() and status<>'closed';
 if (select count(*) from app_private.rooms where host_uid=u and status in ('waiting','playing') and expires_at>now())>=2
 or (select count(*) from app_private.members m join app_private.rooms r on r.id=m.room_id where m.uid=u and r.status in ('waiting','playing') and r.expires_at>now())>=3
 then raise exception 'ROOM_LIMIT'; end if;
 begin
  insert into app_private.rooms(game,name,lookup_name,host_uid,creator_uid,create_key,board)
  values(p_game,n,lower(n),u,u,p_action,app_private.empty_board(p_game)) returning id into rid;
 exception when unique_violation then raise exception 'NAME_TAKEN'; end;
 update app_private.rooms set capacity=case when p_game='petitbac' then 10 when p_game in ('undercover','timesup') then 12 else 2 end where id=rid;
 insert into app_private.members(room_id,uid,seat,name) values(rid,u,1,pseudo);
 perform app_private.notify(rid);
 return app_private.snapshot(rid);
end $$;

create or replace function app_private.join_room(p_name text,p_pseudo text,p_game text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.actor(); r app_private.rooms; s int; pseudo text; n text;
begin
 if p_game is null or not app_private.online_game_ok(p_game) then raise exception 'INVALID_ACTION'; end if;
 n:=lower(app_private.clean_text(p_name,3,40)); pseudo:=app_private.clean_text(p_pseudo,1,24);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform app_private.throttle('join',20);
 select * into r from app_private.rooms where lookup_name=n and status<>'closed' for update;
 -- A room of another game looks exactly like a missing room.
 if r.id is null or r.expires_at<=now() or r.game<>p_game then raise exception 'ROOM_NOT_FOUND'; end if;
 if exists(select 1 from app_private.members where room_id=r.id and uid=u) then return app_private.snapshot(r.id); end if;
 if r.status<>'waiting' then raise exception 'ROOM_STARTED'; end if;
 if (select count(*) from app_private.members where room_id=r.id)>=r.capacity then raise exception 'ROOM_FULL'; end if;
 if (select count(*) from app_private.members m join app_private.rooms rr on rr.id=m.room_id where m.uid=u and rr.status in ('waiting','playing') and rr.expires_at>now())>=3 then raise exception 'ROOM_LIMIT'; end if;
 select min(i) into s from generate_series(1,r.capacity) i where not exists(select 1 from app_private.members where room_id=r.id and seat=i);
 insert into app_private.members(room_id,uid,seat,name) values(r.id,u,s,pseudo);
 update app_private.rooms set version=version+1,expires_at=now()+interval '30 minutes' where id=r.id;
 perform app_private.notify(r.id);
 return app_private.snapshot(r.id);
end $$;

create or replace function app_private.list_rooms(p_offset int,p_game text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform app_private.actor();
 if p_offset is null or p_offset<0 or p_offset>1000 then raise exception 'INVALID_PAGE'; end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
 select r.id,r.game,r.name,r.status,r.capacity,r.expires_at,
 (select name from app_private.members where room_id=r.id and uid=r.host_uid) as host,
 (select count(*) from app_private.members where room_id=r.id) as count
 from app_private.rooms r where r.expires_at>now() and r.status<>'closed' and r.game=p_game
 order by r.created_at desc limit 30 offset p_offset
 ) x;
 return result;
end $$;

create or replace function app_private.my_rooms(p_game text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'status',r.status,'game',r.game))
 from app_private.rooms r join app_private.members m on m.room_id=r.id
 where m.uid=app_private.actor() and r.expires_at>now() and r.status<>'closed' and r.game=p_game),'[]'::jsonb);
end $$;

-- Old morpion RPCs: same names, same signatures, now explicitly morpion-only.
create or replace function public.online_create_room(p_name text,p_pseudo text,p_action uuid) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.create_room(p_name,p_pseudo,p_action,'morpion') $$;
create or replace function public.online_join_room(p_name text,p_pseudo text) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.join_room(p_name,p_pseudo,'morpion') $$;
create or replace function public.online_list_rooms(p_offset int default 0) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.list_rooms(p_offset,'morpion') $$;
create or replace function public.online_my_rooms() returns jsonb
language sql security definer set search_path = '' as $$ select app_private.my_rooms('morpion') $$;

-- Game-aware RPCs, new names so existing clients never hit an overload ambiguity.
create or replace function public.online_create_room_game(p_game text,p_name text,p_pseudo text,p_action uuid) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.create_room(p_name,p_pseudo,p_action,p_game) $$;
create or replace function public.online_join_room_game(p_game text,p_name text,p_pseudo text) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.join_room(p_name,p_pseudo,p_game) $$;
create or replace function public.online_list_rooms_game(p_game text,p_offset int default 0) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.list_rooms(p_offset,p_game) $$;
create or replace function public.online_my_rooms_game(p_game text) returns jsonb
language sql security definer set search_path = '' as $$ select app_private.my_rooms(p_game) $$;

create or replace function public.online_action(
 p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_cell int default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=app_private.actor(); r app_private.rooms; m app_private.members;
 req jsonb; prev app_private.receipts; ack jsonb; w int:=0; ln int[]:='{}';
 a int; b int; c int; trip int[]; remain int; old_topic text;
 row_i int; col_i int; dir_i int; k int; r2 int; c2 int; pc int; ok boolean; placed int;
 dr int[]:=array[0,1,1,1]; dc int[]:=array[1,0,1,-1];
begin
 if p_action is null or p_instance is null or p_version is null or p_kind is null
 or p_kind not in ('ready','unready','start','place','rematch','leave')
 or (p_kind='place' and (p_cell is null or p_cell<0 or p_cell>8))
 or (p_kind<>'place' and p_cell is not null) then raise exception 'INVALID_ACTION'; end if;
 select * into r from app_private.rooms where id=p_room for update;
 if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into m from app_private.members where room_id=p_room and uid=u;
 req:=jsonb_build_object('instance',p_instance,'version',p_version,'kind',p_kind,'cell',p_cell);
 select * into prev from app_private.receipts where room_id=p_room and uid=u and action_id=p_action;
 if found then
  if prev.request<>req then raise exception 'ACTION_REUSED'; end if;
  if m.uid is null and p_kind<>'leave' then raise exception 'NOT_MEMBER'; end if;
  return prev.ack;
 end if;
 if m.uid is null then raise exception 'NOT_MEMBER'; end if;
 if r.expires_at<=now() or r.status='closed' then raise exception 'ROOM_EXPIRED'; end if;
 perform app_private.throttle('action',90);
 if r.version<>p_version or r.instance<>p_instance then raise exception 'STALE_VERSION'; end if;
 if r.game not in ('morpion','puissance4') then raise exception 'GAME_UNAVAILABLE'; end if;
 if p_kind='place' and r.game='puissance4' and p_cell>6 then raise exception 'INVALID_ACTION'; end if;
 if p_kind in ('ready','unready') then
  if r.status<>'waiting' then raise exception 'WRONG_PHASE'; end if;
  update app_private.members set ready=(p_kind='ready'),seen_at=now() where room_id=p_room and uid=u;
 elsif p_kind='start' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if r.status<>'waiting' or (select count(*) from app_private.members where room_id=p_room and ready)<>2 then raise exception 'NOT_READY'; end if;
  r.status:='playing';
 elsif p_kind='place' then
  if r.status<>'playing' then raise exception 'WRONG_PHASE'; end if;
  if r.turn<>m.seat then raise exception 'NOT_YOUR_TURN'; end if;
  if r.game='morpion' then
   if r.board[p_cell+1]<>0 then raise exception 'CELL_OCCUPIED'; end if;
   r.board[p_cell+1]:=m.seat;
   foreach trip slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
    a:=trip[1]; b:=trip[2]; c:=trip[3];
    if r.board[a]<>0 and r.board[a]=r.board[b] and r.board[b]=r.board[c] then w:=r.board[a]; ln:=array[a-1,b-1,c-1]; exit; end if;
   end loop;
  else
   -- Gravity is decided here: the client only names a column.
   placed:=-1;
   for row_i in reverse 5..0 loop
    if r.board[row_i*7+p_cell+1]=0 then placed:=row_i; exit; end if;
   end loop;
   if placed<0 then raise exception 'COLUMN_FULL'; end if;
   r.board[placed*7+p_cell+1]:=m.seat;
   <<scan>>
   for row_i in 0..5 loop
    for col_i in 0..6 loop
     pc:=r.board[row_i*7+col_i+1];
     if pc=0 then continue; end if;
     for dir_i in 1..4 loop
      ok:=true;
      for k in 0..3 loop
       r2:=row_i+dr[dir_i]*k; c2:=col_i+dc[dir_i]*k;
       if r2<0 or r2>5 or c2<0 or c2>6 or r.board[r2*7+c2+1]<>pc then ok:=false; exit; end if;
      end loop;
      if ok then
       w:=pc; ln:=array[row_i*7+col_i,(row_i+dr[dir_i])*7+col_i+dc[dir_i],(row_i+2*dr[dir_i])*7+col_i+2*dc[dir_i],(row_i+3*dr[dir_i])*7+col_i+3*dc[dir_i]];
       exit scan;
      end if;
     end loop;
    end loop;
   end loop;
  end if;
  if w<>0 or not (0=any(r.board)) then r.status:='finished'; r.winner:=w; r.line:=ln;
  else r.turn:=3-r.turn; end if;
 elsif p_kind='rematch' then
  if r.status<>'finished' or (select count(*) from app_private.members where room_id=p_room)<>2 then raise exception 'WRONG_PHASE'; end if;
  r.status:='waiting'; r.instance:=gen_random_uuid(); r.board:=app_private.empty_board(r.game); r.turn:=1; r.winner:=0; r.line:='{}';
  update app_private.members set ready=false where room_id=p_room;
 elsif p_kind='leave' then
  delete from app_private.members where room_id=p_room and uid=u;
  select count(*) into remain from app_private.members where room_id=p_room;
  old_topic:='mini:'||r.id::text||':'||r.epoch::text;
  r.epoch:=gen_random_uuid();
  if remain=0 then r.status:='closed';
  else
   select uid into r.host_uid from app_private.members where room_id=p_room order by seat limit 1;
   r.status:='waiting'; r.instance:=gen_random_uuid();
   r.board:=app_private.empty_board(r.game); r.turn:=1; r.winner:=0; r.line:='{}';
   update app_private.members set ready=false where room_id=p_room;
  end if;
 end if;
 update app_private.rooms set status=r.status,instance=r.instance,epoch=r.epoch,host_uid=r.host_uid,
 board=r.board,turn=r.turn,winner=r.winner,line=r.line,version=version+1,expires_at=now()+interval '30 minutes' where id=p_room returning version into r.version;
 ack:=jsonb_build_object('version',r.version,'left',p_kind='leave');
 insert into app_private.receipts(room_id,uid,action_id,request,ack) values(p_room,u,p_action,req,ack);
 if old_topic is not null then
  perform realtime.send(jsonb_build_object('version',r.version,'instance',r.instance),'changed',old_topic,true);
 end if;
 perform app_private.notify(p_room);
 return ack;
end $$;

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.online_create_room_game(text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.online_join_room_game(text,text,text) from public,anon,authenticated;
revoke all on function public.online_list_rooms_game(text,int) from public,anon,authenticated;
revoke all on function public.online_my_rooms_game(text) from public,anon,authenticated;
grant execute on function public.online_create_room_game(text,text,text,uuid),public.online_join_room_game(text,text,text),
 public.online_list_rooms_game(text,int),public.online_my_rooms_game(text) to authenticated;
-- Re-assert the grants of the replaced 001 functions (CREATE OR REPLACE keeps them; this makes it explicit).
revoke all on function public.online_list_rooms(int),public.online_my_rooms(),public.online_create_room(text,text,uuid),
 public.online_join_room(text,text),public.online_action(uuid,uuid,bigint,uuid,text,int) from public,anon;
grant execute on function public.online_list_rooms(int),public.online_my_rooms(),public.online_create_room(text,text,uuid),
 public.online_join_room(text,text),public.online_action(uuid,uuid,bigint,uuid,text,int) to authenticated;

-- Incremental source, bundled into 002. Not a standalone installer.
-- Petit Bac uses the existing game's explicit human judging (0/5/10), not a dictionary.
create table if not exists app_private.pb_rounds (
 room_id uuid primary key references app_private.rooms(id) on delete cascade,
 phase text not null default 'waiting' check(phase in ('waiting','writing','scoring','finished')),
 letter text, categories jsonb not null default '["prenom","ville","animal","metier","objet","pays"]',
 deadline timestamptz, round_no integer not null default 0,
 answers jsonb not null default '{}', marks jsonb not null default '{}'
);
alter table app_private.pb_rounds add column if not exists deadline timestamptz;
alter table app_private.pb_rounds add column if not exists round_no integer not null default 0;
alter table app_private.pb_rounds enable row level security;
revoke all on app_private.pb_rounds from public,anon,authenticated;

create or replace function app_private.online_game_ok(g text) returns boolean
language sql immutable set search_path = '' as $$ select g in ('morpion','puissance4','petitbac') $$;

-- This helper never returns another player's answers before scoring.
create or replace function app_private.pb_view(rid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s app_private.pb_rounds; u uuid:=app_private.actor();
begin
 if not exists(select 1 from app_private.members where room_id=rid and uid=u) then raise exception 'NOT_MEMBER'; end if;
 select * into s from app_private.pb_rounds where room_id=rid;
 if not found then return jsonb_build_object('phase','waiting'); end if;
 return jsonb_build_object('phase',s.phase,'letter',s.letter,'categories',s.categories,
 'answers',case when s.phase in ('scoring','finished') then s.answers else jsonb_build_object(u::text,s.answers->u::text) end,
 'marks',s.marks,'deadline',s.deadline,'round',s.round_no);
end $$;

create or replace function public.online_petitbac_action(
 p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=app_private.actor(); r app_private.rooms; s app_private.pb_rounds;
 prev app_private.receipts; req jsonb; ack jsonb; member_count int; k text; v jsonb; target uuid; c text;
begin
 if p_action is null or p_instance is null or p_version is null or p_kind is null or p_data is null
 or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192
 or p_kind not in ('ready','unready','start','submit','stop','mark','finish','next','timeout') then raise exception 'INVALID_ACTION'; end if;
 select * into r from app_private.rooms where id=p_room for update;
 if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
 if not exists(select 1 from app_private.members where room_id=p_room and uid=u) then raise exception 'NOT_MEMBER'; end if;
 if r.game<>'petitbac' then raise exception 'GAME_UNAVAILABLE'; end if;
 req:=jsonb_build_object('instance',p_instance,'version',p_version,'kind',p_kind,'data',p_data);
 select * into prev from app_private.receipts where room_id=p_room and uid=u and action_id=p_action;
 if found then
  if prev.request<>req then raise exception 'ACTION_REUSED'; end if;
  return prev.ack;
 end if;
 if r.expires_at<=now() or r.status='closed' then raise exception 'ROOM_EXPIRED'; end if;
 if r.version<>p_version or r.instance<>p_instance then raise exception 'STALE_VERSION'; end if;
 perform app_private.throttle('action',90);
 insert into app_private.pb_rounds(room_id) values(p_room) on conflict do nothing;
 select * into s from app_private.pb_rounds where room_id=p_room for update;
 select count(*) into member_count from app_private.members where room_id=p_room;
 if p_kind in ('ready','unready') then
  if r.status<>'waiting' then raise exception 'WRONG_PHASE'; end if;
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  update app_private.members set ready=(p_kind='ready') where room_id=p_room and uid=u;
 elsif p_kind='start' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  if r.status<>'waiting' or member_count<2 or exists(select 1 from app_private.members where room_id=p_room and not ready) then raise exception 'NOT_READY'; end if;
  s.phase:='writing'; s.round_no:=s.round_no+1; s.deadline:=now()+interval '120 seconds'; s.letter:=substr('ABCDEFGHIJKLMNOPQRSTUV',1+floor(random()*22)::int,1);
  s.answers:='{}'; s.marks:='{}'; r.status:='playing';
 elsif p_kind='submit' then
  if s.phase<>'writing' then raise exception 'WRONG_PHASE'; end if;
  if s.deadline<=now() then raise exception 'ROUND_EXPIRED'; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>jsonb_array_length(s.categories) then raise exception 'INVALID_ANSWERS'; end if;
  for k,v in select * from jsonb_each(p_data) loop
   if not s.categories ? k or jsonb_typeof(v)<>'string' then raise exception 'INVALID_ANSWERS'; end if;
   perform app_private.clean_text(v#>>'{}',0,80);
  end loop;
  s.answers:=jsonb_set(s.answers,array[u::text],p_data);
 elsif p_kind in ('stop','timeout') then
  if p_kind='timeout' and s.deadline>now() then raise exception 'TIMER_RUNNING'; end if;
  if s.phase<>'writing' then raise exception 'WRONG_PHASE'; end if;
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  s.phase:='scoring';
 elsif p_kind='next' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if s.phase<>'finished' or p_data<>'{}'::jsonb then raise exception 'WRONG_PHASE'; end if;
  s.phase:='waiting';s.deadline:=null;s.answers:='{}';s.marks:='{}';r.status:='waiting';r.instance:=gen_random_uuid();
  update app_private.members set ready=false where room_id=p_room;
 elsif p_kind='mark' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if s.phase<>'scoring' then raise exception 'WRONG_PHASE'; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>3
   or not (p_data ?& array['player','category','points'])
   or jsonb_typeof(p_data->'player')<>'string' or jsonb_typeof(p_data->'category')<>'string'
   or jsonb_typeof(p_data->'points')<>'number' or p_data->>'points' not in ('0','5','10') then raise exception 'INVALID_MARK'; end if;
  target:=(p_data->>'player')::uuid; c:=p_data->>'category';
  if not s.categories ? c or not exists(select 1 from app_private.members where room_id=p_room and uid=target) then raise exception 'INVALID_MARK'; end if;
  s.marks:=jsonb_set(s.marks,array[target::text],coalesce(s.marks->target::text,'{}'::jsonb)||jsonb_build_object(c,p_data->'points'));
 elsif p_kind='finish' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if s.phase<>'scoring' then raise exception 'WRONG_PHASE'; end if;
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  if exists(select 1 from app_private.members m cross join jsonb_array_elements_text(s.categories) cat where m.room_id=p_room and not coalesce(s.marks->m.uid::text,'{}'::jsonb) ? cat) then raise exception 'MISSING_MARKS'; end if;
  s.phase:='finished'; r.status:='finished';
 end if;
 update app_private.pb_rounds set phase=s.phase,deadline=s.deadline,round_no=s.round_no,letter=s.letter,answers=s.answers,marks=s.marks where room_id=p_room;
 update app_private.rooms set status=r.status,instance=r.instance,version=version+1,expires_at=now()+interval '30 minutes' where id=p_room returning version into r.version;
 ack:=jsonb_build_object('version',r.version);
 insert into app_private.receipts(room_id,uid,action_id,request,ack) values(p_room,u,p_action,req,ack);
 perform app_private.notify(p_room);
 return ack;
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.online_petitbac_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.online_petitbac_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;

-- Casual chess: server enforces append-only ordering, NOT move legality.
create table if not exists app_private.chess_rounds(
 room_id uuid primary key references app_private.rooms(id) on delete cascade,
 moves jsonb not null default '[]', reports jsonb not null default '{}',
 check(jsonb_typeof(moves)='array' and jsonb_array_length(moves)<=2048)
);
alter table app_private.chess_rounds enable row level security;
revoke all on app_private.chess_rounds from public,anon,authenticated;
create or replace function app_private.chess_view(rid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from app_private.members where room_id=rid and uid=app_private.actor()) then raise exception 'NOT_MEMBER'; end if;
 return coalesce((select jsonb_build_object('moves',moves,'reports',reports,'legality','client-validated-casual') from app_private.chess_rounds where room_id=rid),'{}'::jsonb);
end $$;
create or replace function public.online_chess_action(p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.rooms; m app_private.members; s app_private.chess_rounds; u uuid:=app_private.actor(); req jsonb; prev app_private.receipts; ack jsonb;
begin
 if p_instance is null or p_action is null or p_version is null or p_kind is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>256 or p_kind not in ('ready','unready','start','move','report') then raise exception 'INVALID_ACTION'; end if;
 select * into r from app_private.rooms where id=p_room for update;
 if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into m from app_private.members where room_id=p_room and uid=u;
 if m.uid is null then raise exception 'NOT_MEMBER'; end if;
 if r.game<>'chess' then raise exception 'GAME_UNAVAILABLE'; end if;
 req:=jsonb_build_object('instance',p_instance,'version',p_version,'kind',p_kind,'data',p_data);
 select * into prev from app_private.receipts where room_id=p_room and uid=u and action_id=p_action;
 if found then if prev.request<>req then raise exception 'ACTION_REUSED'; end if; return prev.ack; end if;
 if r.expires_at<=now() or r.status='closed' then raise exception 'ROOM_EXPIRED'; end if;
 if r.version<>p_version or r.instance<>p_instance then raise exception 'STALE_VERSION'; end if;
 perform app_private.throttle('action',90);
 insert into app_private.chess_rounds(room_id) values(p_room) on conflict do nothing;
 select * into s from app_private.chess_rounds where room_id=p_room for update;
 if p_kind in ('ready','unready') then
  if r.status<>'waiting' then raise exception 'WRONG_PHASE'; end if;
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  update app_private.members set ready=p_kind='ready' where room_id=p_room and uid=u;
 elsif p_kind='start' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  if r.status<>'waiting' or (select count(*) from app_private.members where room_id=p_room and ready)<>2 then raise exception 'NOT_READY'; end if;
  r.status:='playing'; r.turn:=1;
 elsif p_kind='move' then
  if r.status<>'playing' then raise exception 'WRONG_PHASE'; end if;
  if r.turn<>m.seat then raise exception 'NOT_YOUR_TURN'; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'uci') is distinct from 'string' or (p_data->>'uci')!~'^[a-h][1-8][a-h][1-8][qrbn]?$' or substr(p_data->>'uci',1,2)=substr(p_data->>'uci',3,2) then raise exception 'INVALID_MOVE'; end if;
  if jsonb_array_length(s.moves)>=2048 then raise exception 'HISTORY_LIMIT'; end if;
  s.moves:=s.moves||jsonb_build_array(p_data->>'uci'); s.reports:='{}'; r.turn:=3-r.turn;
 elsif p_kind='report' then
  if r.status<>'playing' then raise exception 'WRONG_PHASE'; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'result') is distinct from 'string' or p_data->>'result' not in ('white','black','draw') then raise exception 'INVALID_RESULT'; end if;
  s.reports:=jsonb_set(s.reports,array[m.seat::text],p_data->'result');
  if s.reports->>'1'=s.reports->>'2' then r.status:='finished';r.winner:=case s.reports->>'1' when 'white' then 1 when 'black' then 2 else 0 end; end if;
 end if;
 update app_private.chess_rounds set moves=s.moves,reports=s.reports where room_id=p_room;
 update app_private.rooms set status=r.status,turn=r.turn,winner=r.winner,version=version+1,expires_at=now()+interval '30 minutes' where id=p_room returning version into r.version;
 ack:=jsonb_build_object('version',r.version);
 insert into app_private.receipts values(p_room,u,p_action,req,ack);
 perform app_private.notify(p_room); return ack;
end $$;
create or replace function app_private.online_game_ok(g text) returns boolean language sql immutable set search_path='' as $$select g in ('morpion','puissance4','petitbac','chess')$$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.online_chess_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.online_chess_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;

-- Dedicated server-owned hidden state. Never included wholesale in snapshots.
create table if not exists app_private.hidden_games(
 room_id uuid primary key references app_private.rooms(id) on delete cascade,
 state jsonb not null default '{}'
);
alter table app_private.hidden_games enable row level security;
revoke all on app_private.hidden_games from public,anon,authenticated;
create or replace function app_private.hidden_view(rid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.rooms; m app_private.members; s jsonb; own jsonb; foe text;
begin
 select * into m from app_private.members where room_id=rid and uid=app_private.actor();
 if m.uid is null then raise exception 'NOT_MEMBER'; end if;
 select * into r from app_private.rooms where id=rid;
 select state into s from app_private.hidden_games where room_id=rid;
 s:=coalesce(s,'{}');own:=coalesce(s->'players'->m.seat::text,'{}');
 if r.game='naval' then
  foe:=(3-m.seat)::text;
  return jsonb_build_object('own',own,'shots',coalesce(s->'shots','{}'),'phase',s->'phase');
 elsif r.game='quiestce' then
  return jsonb_build_object('own',own,'choices',s->'choices','phase',s->'phase','lastGuess',s->'lastGuess');
 elsif r.game='undercover' then
  return jsonb_build_object('own',own,'alive',s->'alive','phase',s->'phase','votesCast',coalesce((select jsonb_agg(key) from jsonb_object_keys(coalesce(s->'votes','{}')) key),'[]'::jsonb));
 elsif r.game='timesup' then
  return jsonb_build_object('phase',s->'phase','round',s->'round','scores',s->'scores','remaining',jsonb_array_length(coalesce(s->'pile','[]')),
   'deadline',s->'deadline','card',case when r.turn=m.seat and s->>'phase'='turn' then s->'pile'->0 else null end);
 end if;
 raise exception 'GAME_UNAVAILABLE';
end $$;
create or replace function public.online_hidden_action(p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.rooms; m app_private.members; u uuid:=app_private.actor(); s jsonb; req jsonb; prev app_private.receipts; ack jsonb;
 n int; k text; v jsonb; ship jsonb; cells int[]; occupied int[]:='{}'; lengths int[]:='{}'; ci int; a int; b int; step int; idx int; hit boolean; target int; alive jsonb; votes jsonb; best int; tied int; pc int; civ int; bad int; deck jsonb; pair jsonb; seats int[]; seat_i int; points int; nextseat int;
begin
 if p_action is null or p_instance is null or p_version is null or p_kind is null or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4096 then raise exception 'INVALID_ACTION'; end if;
 select * into r from app_private.rooms where id=p_room for update;
 if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into m from app_private.members where room_id=p_room and uid=u;
 if m.uid is null then raise exception 'NOT_MEMBER'; end if;
 if r.game not in ('naval','quiestce','undercover','timesup') then raise exception 'GAME_UNAVAILABLE'; end if;
 req:=jsonb_build_object('instance',p_instance,'version',p_version,'kind',p_kind,'data',p_data);
 select * into prev from app_private.receipts where room_id=p_room and uid=u and action_id=p_action;
 if found then if prev.request<>req then raise exception 'ACTION_REUSED'; end if; return prev.ack; end if;
 if r.expires_at<=now() or r.status='closed' then raise exception 'ROOM_EXPIRED'; end if;
 if r.instance<>p_instance or r.version<>p_version then raise exception 'STALE_VERSION'; end if;
 perform app_private.throttle('action',90);
 insert into app_private.hidden_games(room_id) values(p_room) on conflict do nothing;
 select state into s from app_private.hidden_games where room_id=p_room for update;
 s:=jsonb_build_object('players',coalesce(s->'players','{}'))||s;
 select array_agg(seat order by seat),count(*) into seats,n from app_private.members where room_id=p_room;
 if p_kind in ('ready','unready') then
  if r.status<>'waiting' or p_data<>'{}'::jsonb then raise exception 'WRONG_PHASE'; end if;
  update app_private.members set ready=p_kind='ready' where room_id=p_room and uid=u;
 elsif p_kind='configure' then
  if r.status<>'waiting' then raise exception 'WRONG_PHASE'; end if;
  if r.game='naval' then
   if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'ships') is distinct from 'array' or jsonb_array_length(p_data->'ships')<>5 then raise exception 'INVALID_FLEET'; end if;
   for ship in select value from jsonb_array_elements(p_data->'ships') loop
    if jsonb_typeof(ship)<>'array' or jsonb_array_length(ship) not between 2 and 5 then raise exception 'INVALID_FLEET'; end if;
    cells:='{}';
    for v in select value from jsonb_array_elements(ship) loop
     if jsonb_typeof(v)<>'number' or v::text!~'^[0-9]{1,2}$' then raise exception 'INVALID_FLEET'; end if;
     ci:=v::text::int;
     if ci=any(occupied) then raise exception 'INVALID_FLEET'; end if;
     cells:=array_append(cells,ci);occupied:=array_append(occupied,ci);
    end loop;
    select array_agg(x order by x) into cells from unnest(cells) x;
    step:=cells[2]-cells[1];
    if step not in (1,10) then raise exception 'INVALID_FLEET'; end if;
    for idx in 2..cardinality(cells) loop
     if cells[idx]-cells[idx-1]<>step or (step=1 and cells[idx]/10<>cells[1]/10) then raise exception 'INVALID_FLEET'; end if;
    end loop;
    lengths:=array_append(lengths,cardinality(cells));
   end loop;
   select array_agg(x order by x) into lengths from unnest(lengths) x;
   if lengths<>array[2,3,3,4,5] then raise exception 'INVALID_FLEET'; end if;
   s:=jsonb_set(s,array['players',m.seat::text],jsonb_build_object('ships',p_data->'ships','cells',to_jsonb(occupied)));
  elsif r.game='quiestce' then
   if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'choice') is distinct from 'number' or p_data->>'choice'!~'^[0-9]{1,2}$' or (p_data->>'choice')::int not between 0 and 23 then raise exception 'INVALID_CHOICE'; end if;
   s:=jsonb_set(s,array['players',m.seat::text],jsonb_build_object('choice',p_data->'choice'));
  else raise exception 'INVALID_ACTION'; end if;
 elsif p_kind='start' then
  if r.host_uid<>u then raise exception 'HOST_ONLY'; end if;
  if r.status<>'waiting' or p_data<>'{}'::jsonb or n<(case when r.game='timesup' then 4 when r.game='undercover' then 3 else 2 end) or exists(select 1 from app_private.members where room_id=p_room and not ready) then raise exception 'NOT_READY'; end if;
  if r.game in ('naval','quiestce') and (select count(*) from jsonb_object_keys(s->'players'))<>2 then raise exception 'NOT_CONFIGURED'; end if;
  if r.game='naval' then s:=s||jsonb_build_object('shots','{}'::jsonb,'phase','playing');
  elsif r.game='quiestce' then s:=s||jsonb_build_object('choices',(select jsonb_agg(i) from generate_series(0,23)i),'phase','playing');
  elsif r.game='undercover' then
   select value into pair from jsonb_array_elements('[["Café","Thé"],["Plage","Piscine"],["Pizza","Tarte"],["Vélo","Trottinette"],["Stylo","Crayon"],["Cinéma","Théâtre"],["Savon","Shampoing"],["Train","Tramway"],["Pull","Gilet"],["Montagne","Colline"],["Lait","Crème"],["Chocolat","Caramel"],["Ahri","Evelynn"],["Jinx","Vi"],["Yasuo","Yone"],["Lux","Syndra"],["Zed","Talon"],["Thresh","Blitzcrank"],["Garen","Darius"],["Ashe","Caitlyn"],["Baron Nashor","Dragon"],["Lee Sin","Jarvan IV"],["Tour","Inhibiteur"],["Ranked","Normal"],["Mario","Sonic"],["Minecraft","Terraria"],["Pokémon","Digimon"],["Fortnite","Apex Legends"],["Les Sims","Animal Crossing"],["Switch","PlayStation"],["Zelda","Final Fantasy"],["Pac-Man","Tetris"],["Overwatch","Valorant"],["Stardew Valley","Animal Crossing"],["Mario Kart","Crash Team Racing"],["Manette","Clavier"],["Naruto","Sasuke"],["Luffy","Zoro"],["Goku","Vegeta"],["Tanjiro","Zenitsu"],["Eren","Levi"],["Totoro","Ponyo"],["Sailor Moon","Card Captor Sakura"],["One Piece","Naruto"],["Demon Slayer","Jujutsu Kaisen"],["Attack on Titan","Fullmetal Alchemist"],["Studio Ghibli","Pixar"],["Death Note","Code Geass"],["Britney Spears","Christina Aguilera"],["Lady Gaga","Katy Perry"],["Beyoncé","Rihanna"],["Madonna","Cher"],["Dua Lipa","Ariana Grande"],["Taylor Swift","Olivia Rodrigo"],["Sabrina Carpenter","Chappell Roan"],["Shakira","Jennifer Lopez"],["RuPaul","Tyra Banks"],["Drag Race","Project Runway"],["Kylie Minogue","Dua Lipa"],["Paillettes","Strass"],["Gloss","Rouge à lèvres"],["Vernis","Faux ongles"],["Licorne","Papillon"],["Bubble tea","Milkshake"],["Barbie","Hello Kitty"],["Skincare","Maquillage"],["Sac à main","Pochette"],["Talons","Ballerines"],["Journal intime","Bullet journal"],["Peluche","Poupée"],["Brunch","Goûter"],["Rose","Fuchsia"]]'::jsonb) order by random() limit 1;
   select array_agg(x) into seats from (select unnest(seats)x order by random())z;
   s:=jsonb_build_object('players','{}'::jsonb,'alive','{}'::jsonb,'votes','{}'::jsonb,'phase','voting');
   for idx in 1..n loop
    s:=jsonb_set(s,array['players',seats[idx]::text],jsonb_build_object('role',case when idx<=(case when n>=9 then 2 else 1 end) then 'undercover' else 'civil' end,'word',pair->case when idx<=(case when n>=9 then 2 else 1 end) then 1 else 0 end));
    s:=jsonb_set(s,array['alive',seats[idx]::text],'true');
   end loop;
  else
   select jsonb_agg(word) into deck from (select word from jsonb_array_elements('["Ahri","Jinx","Mario","Zelda","Pikachu","Britney Spears","RuPaul","Totoro","Naruto","Pizza","Licorne","Tour Eiffel","Barbie","Minecraft","Karaoké","Sushi"]'::jsonb)word order by random())d;
   s:=jsonb_build_object('deck',deck,'pile',deck,'round',0,'scores','{}'::jsonb,'phase','ready');
  end if;
  r.status:='playing';r.turn:=seats[1];
 elsif r.status<>'playing' then raise exception 'WRONG_PHASE';
 elsif r.game='naval' and p_kind='shoot' then
  if r.turn<>m.seat then raise exception 'NOT_YOUR_TURN'; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'cell') is distinct from 'number' or p_data->>'cell'!~'^[0-9]{1,2}$' then raise exception 'INVALID_CELL'; end if;
  ci:=(p_data->>'cell')::int;k:=m.seat::text;
  if coalesce(s->'shots'->k,'{}') ? ci::text then raise exception 'ALREADY_SHOT'; end if;
  hit:=s->'players'->(3-m.seat)::text->'cells' @> jsonb_build_array(ci);
  s:=jsonb_set(s,array['shots',k],coalesce(s->'shots'->k,'{}')||jsonb_build_object(ci::text,hit));
  if (select count(*) from jsonb_each(s->'shots'->k) where value='true')=17 then r.status:='finished';r.winner:=m.seat; end if;
  r.turn:=3-r.turn;
 elsif r.game='quiestce' and p_kind='guess' then
  if r.turn<>m.seat then raise exception 'NOT_YOUR_TURN'; end if;
  if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'choice') is distinct from 'number' or p_data->>'choice'!~'^[0-9]{1,2}$' or (p_data->>'choice')::int not between 0 and 23 then raise exception 'INVALID_CHOICE'; end if;
  hit:=p_data->'choice'=s->'players'->(3-m.seat)::text->'choice';
  s:=s||jsonb_build_object('lastGuess',jsonb_build_object('seat',m.seat,'choice',p_data->'choice','correct',hit));
  if hit then r.status:='finished';r.winner:=m.seat;else r.turn:=3-r.turn;end if;
 elsif r.game='undercover' and p_kind='vote' then
  if (select count(*) from jsonb_object_keys(p_data))<>1 or jsonb_typeof(p_data->'seat') is distinct from 'number' or p_data->>'seat'!~'^[0-9]{1,2}$' then raise exception 'INVALID_VOTE'; end if;
  target:=(p_data->>'seat')::int;
  if s->'alive'->m.seat::text is distinct from 'true'::jsonb or s->'alive'->target::text is distinct from 'true'::jsonb or target=m.seat then raise exception 'INVALID_VOTE'; end if;
  if s->'votes' ? m.seat::text then raise exception 'ALREADY_VOTED'; end if;
  s:=jsonb_set(s,array['votes',m.seat::text],to_jsonb(target));
  if (select count(*) from jsonb_object_keys(s->'votes'))=(select count(*) from jsonb_each(s->'alive') where value='true') then
   select max(cnt) into best from (select count(*)cnt from jsonb_each(s->'votes') group by value)z;
   select count(*),min(z.vote_value::int) into tied,target from (select value::text vote_value from jsonb_each(s->'votes') group by value having count(*)=best)z;
   if tied=1 then s:=jsonb_set(s,array['alive',target::text],'false');end if;
   s:=jsonb_set(s,'{votes}','{}');civ:=0;bad:=0;
   for k,v in select * from jsonb_each(s->'alive') loop if v='true' then if s->'players'->k->>'role'='civil' then civ:=civ+1;else bad:=bad+1;end if;end if;end loop;
   if bad=0 or bad>=civ then r.status:='finished';s:=s||jsonb_build_object('winner',case when bad=0 then 'civils' else 'impostors' end);end if;
  end if;
 elsif r.game='timesup' and p_kind in ('begin','found','pass','end') then
  if p_data<>'{}'::jsonb then raise exception 'INVALID_ACTION'; end if;
  if p_kind='end' then
   if s->>'phase'<>'turn' or (m.seat<>r.turn and now()<(s->>'deadline')::timestamptz) then raise exception 'NOT_YOUR_TURN';end if;
   select coalesce(min(seat),seats[1]) into nextseat from app_private.members where room_id=p_room and seat>r.turn;
   r.turn:=nextseat;s:=s||jsonb_build_object('phase','ready','deadline',null);
  else
   if m.seat<>r.turn then raise exception 'NOT_YOUR_TURN';end if;
   if p_kind='begin' then
    if s->>'phase'<>'ready' then raise exception 'WRONG_PHASE';end if;
    s:=s||jsonb_build_object('phase','turn','deadline',now()+interval '60 seconds');
   else
    if s->>'phase'<>'turn' or now()>=(s->>'deadline')::timestamptz then raise exception 'TURN_EXPIRED';end if;
    if p_kind='found' then
     k:=((m.seat-1)%2)::text;points:=coalesce((s->'scores'->>k)::int,0)+1;
     s:=jsonb_set(s,array['scores',k],to_jsonb(points));s:=jsonb_set(s,'{pile}',(s->'pile')-0);
     if jsonb_array_length(s->'pile')=0 then
      idx:=(s->>'round')::int+1;
      if idx>=3 then r.status:='finished';s:=s||jsonb_build_object('phase','finished');
      else select jsonb_agg(card) into deck from (select card from jsonb_array_elements(s->'deck')card order by random())z;s:=s||jsonb_build_object('round',idx,'pile',deck,'phase','ready','deadline',null);end if;
     end if;
    elsif jsonb_array_length(s->'pile')>1 then s:=jsonb_set(s,'{pile}',((s->'pile')-0)||jsonb_build_array(s->'pile'->0));end if;
   end if;
  end if;
 else raise exception 'INVALID_ACTION';end if;
 update app_private.hidden_games set state=s where room_id=p_room;
 update app_private.rooms set status=r.status,turn=r.turn,winner=r.winner,version=version+1,expires_at=now()+interval '30 minutes' where id=p_room returning version into r.version;
 ack:=jsonb_build_object('version',r.version);insert into app_private.receipts values(p_room,u,p_action,req,ack);
 perform app_private.notify(p_room);return ack;
end $$;
create or replace function app_private.online_game_ok(g text) returns boolean language sql immutable set search_path='' as $$select g in ('morpion','puissance4','petitbac','chess','naval','quiestce','undercover','timesup')$$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.online_hidden_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.online_hidden_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;

-- Shared departure for non-board games. Resets secrets before allowing replacement players.
create or replace function public.online_game_leave(p_room uuid,p_instance uuid,p_version bigint,p_action uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r app_private.rooms; u uuid:=app_private.actor(); req jsonb; prev app_private.receipts; ack jsonb; old_topic text; n int;
begin
 if p_instance is null or p_version is null or p_action is null then raise exception 'INVALID_ACTION';end if;
 select * into r from app_private.rooms where id=p_room for update;
 if r.id is null then raise exception 'ROOM_NOT_FOUND';end if;
 req:=jsonb_build_object('instance',p_instance,'version',p_version,'kind','game_leave');
 select * into prev from app_private.receipts where room_id=p_room and uid=u and action_id=p_action;
 if found then if prev.request<>req then raise exception 'ACTION_REUSED';end if;return prev.ack;end if;
 if not exists(select 1 from app_private.members where room_id=p_room and uid=u) then raise exception 'NOT_MEMBER';end if;
 if r.expires_at<=now() or r.status='closed' then raise exception 'ROOM_EXPIRED';end if;
 if r.game in ('morpion','puissance4') then raise exception 'USE_BOARD_LEAVE';end if;
 if r.instance<>p_instance or r.version<>p_version then raise exception 'STALE_VERSION';end if;
 delete from app_private.members where room_id=p_room and uid=u;
 select count(*) into n from app_private.members where room_id=p_room;
 old_topic:='mini:'||r.id::text||':'||r.epoch::text;
 if n>0 then select uid into r.host_uid from app_private.members where room_id=p_room order by seat limit 1;end if;
 delete from app_private.hidden_games where room_id=p_room;
 delete from app_private.pb_rounds where room_id=p_room;
 delete from app_private.chess_rounds where room_id=p_room;
 update app_private.members set ready=false where room_id=p_room;
 update app_private.rooms set status=case when n=0 then 'closed' else 'waiting' end,
 host_uid=r.host_uid,turn=1,winner=0,instance=gen_random_uuid(),epoch=gen_random_uuid(),version=version+1,
 expires_at=now()+interval '30 minutes' where id=p_room returning * into r;
 ack:=jsonb_build_object('version',r.version,'left',true);
 insert into app_private.receipts values(p_room,u,p_action,req,ack);
 perform realtime.send(jsonb_build_object('version',r.version,'instance',r.instance),'changed',old_topic,true);
 perform app_private.notify(p_room);return ack;
end $$;
revoke all on function public.online_game_leave(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.online_game_leave(uuid,uuid,bigint,uuid) to authenticated;

create or replace function app_private.snapshot(rid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r app_private.rooms; m app_private.members; people jsonb;
begin
 select * into r from app_private.rooms where id=rid;
 select * into m from app_private.members where room_id=rid and uid=app_private.actor();
 if m.uid is null then raise exception 'NOT_MEMBER'; end if;
 if r.expires_at<=now() or r.status='closed' then raise exception 'ROOM_EXPIRED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',name,'ready',ready,
 'host',uid=r.host_uid) order by seat),'[]'::jsonb) into people
 from app_private.members where room_id=rid;
 return jsonb_build_object('id',r.id,'game',r.game,'name',r.name,'status',r.status,
 'version',r.version,'instance',r.instance,'topic','mini:'||r.id::text||':'||r.epoch::text,
 'seat',m.seat,'host',m.uid=r.host_uid,'members',people,'capacity',r.capacity,
 'board',r.board,'turn',r.turn,'winner',r.winner,'line',r.line,'expires_at',r.expires_at) || case when r.game='petitbac' then jsonb_build_object('petitbac',app_private.pb_view(rid)) else '{}'::jsonb end || case when r.game='chess' then jsonb_build_object('chess',app_private.chess_view(rid)) else '{}'::jsonb end || case when r.game in ('naval','quiestce','undercover','timesup') then jsonb_build_object('hidden',app_private.hidden_view(rid)) else '{}'::jsonb end;
end $$;
notify pgrst,'reload schema';
commit;
