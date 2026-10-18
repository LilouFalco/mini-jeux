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
