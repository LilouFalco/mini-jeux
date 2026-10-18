-- Mini-jeux online v1. Paste this entire file in Supabase SQL Editor and Run.
-- Requires Anonymous Sign-Ins enabled separately in Authentication.
-- Does not enable any game other than morpion. No service-role client key.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
create table if not exists app_private.rooms (
 id uuid primary key default gen_random_uuid(),
 game text not null check(game in ('morpion','puissance4','naval','quiestce','chess','undercover','timesup','petitbac')),
 name text not null check(char_length(name) between 3 and 40),
 lookup_name text not null,
 host_uid uuid not null references auth.users(id),
 create_key uuid not null,
 capacity int not null default 2 check(capacity between 2 and 12),
 status text not null default 'waiting' check(status in ('waiting','playing','finished','closed')),
 version bigint not null default 1,
 instance uuid not null default gen_random_uuid(),
 epoch uuid not null default gen_random_uuid(),
 board int[] not null default array[0,0,0,0,0,0,0,0,0],
 turn int not null default 1,
 winner int not null default 0,
 line int[] not null default '{}',
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 minutes',
 unique(host_uid,create_key)
);
create unique index if not exists online_room_active_name on app_private.rooms(lookup_name) where status <> 'closed';
create table if not exists app_private.members (
 room_id uuid not null references app_private.rooms(id) on delete cascade,
 uid uuid not null references auth.users(id),
 seat int not null check(seat between 1 and 12),
 name text not null check(char_length(name) between 1 and 24),
 ready boolean not null default false,
 seen_at timestamptz not null default now(),
 primary key(room_id,uid), unique(room_id,seat)
);
create table if not exists app_private.receipts (
 room_id uuid not null references app_private.rooms(id) on delete cascade,
 uid uuid not null references auth.users(id),
 action_id uuid not null,
 request jsonb not null,
 ack jsonb not null,
 primary key(room_id,uid,action_id)
);
create table if not exists app_private.rate_limits (
 uid uuid not null references auth.users(id) on delete cascade,
 kind text not null,
 bucket bigint not null,
 count int not null,
 primary key(uid,kind)
);
alter table app_private.rooms enable row level security;
alter table app_private.members enable row level security;
alter table app_private.receipts enable row level security;
alter table app_private.rate_limits enable row level security;
revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on all sequences in schema app_private from public,anon,authenticated;
alter default privileges in schema app_private revoke all on tables from public,anon,authenticated;
alter default privileges in schema app_private revoke execute on functions from public,anon,authenticated;

create or replace function app_private.actor() returns uuid language plpgsql stable
set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 return auth.uid();
end $$;

create or replace function app_private.clean_text(v text, lo int, hi int) returns text
language plpgsql immutable set search_path = '' as $$
declare t text;
begin
 if v is null or octet_length(v)>512 then raise exception 'INVALID_NAME'; end if;
 -- Reject controls, zero width and bidi controls before collapsing whitespace.
 if v ~ '[[:cntrl:]]' or v ~ U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF]' then raise exception 'INVALID_NAME'; end if;
 t := btrim(regexp_replace(normalize(v,NFKC),'[[:space:]]+',' ','g'));
 if char_length(t) < lo or char_length(t)>hi then raise exception 'INVALID_NAME'; end if;
 return t;
end $$;

create or replace function app_private.throttle(k text, max_count int) returns void
language plpgsql security definer set search_path = '' as $$
declare n int; u uuid := app_private.actor(); b bigint := floor(extract(epoch from now())/60);
begin
 insert into app_private.rate_limits(uid,kind,bucket,count) values(u,k,b,1)
 on conflict(uid,kind) do update set bucket=excluded.bucket,
 count=case when app_private.rate_limits.bucket=excluded.bucket then app_private.rate_limits.count+1 else 1 end
 returning count into n;
 if n>max_count then raise exception 'RATE_LIMIT'; end if;
end $$;

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
 'board',r.board,'turn',r.turn,'winner',r.winner,'line',r.line,'expires_at',r.expires_at);
end $$;

create or replace function app_private.notify(rid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r app_private.rooms;
begin
 select * into r from app_private.rooms where id=rid;
 perform realtime.send(jsonb_build_object('version',r.version,'instance',r.instance),
 'changed','mini:'||r.id::text||':'||r.epoch::text,true);
end $$;

create or replace function public.online_list_rooms(p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 perform app_private.actor();
 if p_offset is null or p_offset<0 or p_offset>1000 then raise exception 'INVALID_PAGE'; end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
 select r.id,r.game,r.name,r.status,r.capacity,r.expires_at,
 (select name from app_private.members where room_id=r.id and uid=r.host_uid) as host,
 (select count(*) from app_private.members where room_id=r.id) as count
 from app_private.rooms r where r.expires_at>now() and r.status<>'closed'
 order by r.created_at desc limit 30 offset p_offset
 ) x;
 return result;
end $$;

create or replace function public.online_my_rooms() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'status',r.status))
 from app_private.rooms r join app_private.members m on m.room_id=r.id
 where m.uid=app_private.actor() and r.expires_at>now() and r.status<>'closed'),'[]'::jsonb);
end $$;

create or replace function public.online_get_room(p_room uuid) returns jsonb
language sql security definer set search_path = '' as $$
 select app_private.snapshot(p_room);
$$;

create or replace function public.online_create_room(p_name text,p_pseudo text,p_action uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.actor(); n text; pseudo text; rid uuid; old app_private.rooms;
begin
 if p_action is null then raise exception 'INVALID_ACTION'; end if;
 n := app_private.clean_text(p_name,3,40); pseudo := app_private.clean_text(p_pseudo,1,24);
 -- Serialize per-user room quotas and creation retries, even across tabs.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into old from app_private.rooms where host_uid=u and create_key=p_action;
 if found then
  if old.name<>n then raise exception 'ACTION_REUSED'; end if;
  return app_private.snapshot(old.id);
 end if;
 perform app_private.throttle('create',3);
 update app_private.rooms set status='closed' where expires_at<=now() and status<>'closed';
 if (select count(*) from app_private.rooms where host_uid=u and status in ('waiting','playing') and expires_at>now())>=2
 or (select count(*) from app_private.members m join app_private.rooms r on r.id=m.room_id where m.uid=u and r.status in ('waiting','playing') and r.expires_at>now())>=3
 then raise exception 'ROOM_LIMIT'; end if;
 begin
  insert into app_private.rooms(game,name,lookup_name,host_uid,create_key)
  values('morpion',n,lower(n),u,p_action) returning id into rid;
 exception when unique_violation then raise exception 'NAME_TAKEN'; end;
 insert into app_private.members(room_id,uid,seat,name) values(rid,u,1,pseudo);
 perform app_private.notify(rid);
 return app_private.snapshot(rid);
end $$;

create or replace function public.online_join_room(p_name text,p_pseudo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.actor(); r app_private.rooms; s int; pseudo text; n text;
begin
 n:=lower(app_private.clean_text(p_name,3,40)); pseudo:=app_private.clean_text(p_pseudo,1,24);
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 perform app_private.throttle('join',20);
 select * into r from app_private.rooms where lookup_name=n and status<>'closed' for update;
 if r.id is null or r.expires_at<=now() then raise exception 'ROOM_NOT_FOUND'; end if;
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

create or replace function public.online_heartbeat(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=app_private.actor();
begin
 -- No shared version change: not a gameplay action.
 perform app_private.throttle('heartbeat',12);
 update app_private.members set seen_at=now() where room_id=p_room and uid=u;
 if not found then raise exception 'NOT_MEMBER'; end if;
 update app_private.rooms set expires_at=now()+interval '30 minutes' where id=p_room and expires_at>now() and status<>'closed';
 return app_private.snapshot(p_room);
end $$;

create or replace function public.online_action(
 p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_cell int default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid:=app_private.actor(); r app_private.rooms; m app_private.members;
 req jsonb; prev app_private.receipts; ack jsonb; w int:=0; ln int[]:='{}';
 a int; b int; c int; trip int[]; remain int;
begin
 if p_action is null or p_instance is null or p_version is null or p_kind is null
 or p_kind not in ('ready','unready','start','place','rematch','leave')
 or (p_kind='place' and (p_cell is null or p_cell<0 or p_cell>8))
 or (p_kind<>'place' and p_cell is not null) then raise exception 'INVALID_ACTION'; end if;
 select * into r from app_private.rooms where id=p_room for update;
 if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into m from app_private.members where room_id=p_room and uid=u;
 req:=jsonb_build_object('instance',p_instance,'version',p_version,'kind',p_kind,'cell',p_cell);
 -- A departed actor may only replay its own exact committed leave acknowledgement.
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
 if r.game<>'morpion' then raise exception 'GAME_UNAVAILABLE'; end if;
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
  if r.board[p_cell+1]<>0 then raise exception 'CELL_OCCUPIED'; end if;
  r.board[p_cell+1]:=m.seat;
  foreach trip slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]] loop
   a:=trip[1]; b:=trip[2]; c:=trip[3];
   if r.board[a]<>0 and r.board[a]=r.board[b] and r.board[b]=r.board[c] then w:=r.board[a]; ln:=array[a-1,b-1,c-1]; exit; end if;
  end loop;
  if w<>0 or not (0=any(r.board)) then r.status:='finished'; r.winner:=w; r.line:=ln;
  else r.turn:=3-r.turn; end if;
 elsif p_kind='rematch' then
  if r.status<>'finished' or (select count(*) from app_private.members where room_id=p_room)<>2 then raise exception 'WRONG_PHASE'; end if;
  -- Each player consents by readying again in the new waiting phase.
  r.status:='waiting'; r.instance:=gen_random_uuid(); r.board:=array[0,0,0,0,0,0,0,0,0]; r.turn:=1; r.winner:=0; r.line:='{}';
  update app_private.members set ready=false where room_id=p_room;
 elsif p_kind='leave' then
  delete from app_private.members where room_id=p_room and uid=u;
  select count(*) into remain from app_private.members where room_id=p_room;
  r.epoch:=gen_random_uuid(); -- cached authorization cannot see future topics
  if remain=0 then r.status:='closed';
  else
   select uid into r.host_uid from app_private.members where room_id=p_room order by seat limit 1;
   if r.status='playing' then r.status:='finished'; r.winner:=3-m.seat; r.line:='{}'; end if;
  end if;
 end if;
 update app_private.rooms set status=r.status,instance=r.instance,epoch=r.epoch,host_uid=r.host_uid,
 board=r.board,turn=r.turn,winner=r.winner,line=r.line,version=version+1,expires_at=now()+interval '30 minutes' where id=p_room returning version into r.version;
 ack:=jsonb_build_object('version',r.version,'left',p_kind='leave');
 insert into app_private.receipts(room_id,uid,action_id,request,ack) values(p_room,u,p_action,req,ack);
 perform app_private.notify(p_room);
 return ack;
end $$;

-- Called by Realtime RLS; never accepts a claimed actor ID.
create or replace function public.online_can_receive(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app_private.rooms r join app_private.members m on m.room_id=r.id
 where m.uid=auth.uid() and r.status<>'closed' and r.expires_at>now()
 and p_topic='mini:'||r.id::text||':'||r.epoch::text);
$$;

-- Deny browser access to helpers, even when the schema is later exposed accidentally.
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.online_list_rooms(int) from public,anon,authenticated;
revoke all on function public.online_my_rooms() from public,anon,authenticated;
revoke all on function public.online_get_room(uuid) from public,anon,authenticated;
revoke all on function public.online_create_room(text,text,uuid) from public,anon,authenticated;
revoke all on function public.online_join_room(text,text) from public,anon,authenticated;
revoke all on function public.online_heartbeat(uuid) from public,anon,authenticated;
revoke all on function public.online_action(uuid,uuid,bigint,uuid,text,int) from public,anon,authenticated;
revoke all on function public.online_can_receive(text) from public,anon,authenticated;
grant execute on function public.online_list_rooms(int),public.online_my_rooms(),public.online_get_room(uuid),
 public.online_create_room(text,text,uuid),public.online_join_room(text,text),public.online_heartbeat(uuid),
 public.online_action(uuid,uuid,bigint,uuid,text,int),public.online_can_receive(text) to authenticated;
drop policy if exists mini_online_receive on realtime.messages;
create policy mini_online_receive on realtime.messages for select to authenticated
using (extension='broadcast' and public.online_can_receive((select realtime.topic())));
-- No INSERT policy or grant is added: clients cannot publish game updates.
notify pgrst,'reload schema';
commit;
