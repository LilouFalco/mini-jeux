-- Mini-jeux 003. Run once (or repeat safely) after 001 + frozen 002.
-- One transaction: fail closed if automatic server cleanup cannot be installed.
-- Lease 45 seconds. Client checks at 10s; portable cron every minute.
begin;
do $$
begin
 if not exists(select 1 from pg_available_extensions where name='pg_cron') then
  raise exception 'PG_CRON_UNAVAILABLE: automatic cleanup is required; no changes installed';
 end if;
 create extension if not exists pg_cron;
 if to_regprocedure('cron.schedule(text,text,text)') is null then
  raise exception 'PG_CRON_UNSUPPORTED: automatic cleanup is required; no changes installed';
 end if;
end $$;

-- A private, short-lived receipt lets former members learn WHY their room ended.
-- No room contents, access tokens, or public directory entries survive deletion.
create table if not exists app_private.departures(
 room_id uuid not null, uid uuid not null references auth.users(id) on delete cascade,
 name text not null, reason text not null, expires_at timestamptz not null,
 primary key(room_id,uid)
);
alter table app_private.departures enable row level security;
revoke all on app_private.departures from public,anon,authenticated;

create or replace function app_private.terminate_room(rid uuid, departed uuid, why text)
returns void language plpgsql security definer set search_path='' as $$
declare r app_private.rooms; who text;
begin
 select * into r from app_private.rooms where id=rid for update;
 if not found then return; end if;
 select name into who from app_private.members where room_id=rid and uid=departed;
 who:=coalesce(who,'Une personne');
 insert into app_private.departures(room_id,uid,name,reason,expires_at)
 select rid,uid,who,why,clock_timestamp()+interval '10 minutes' from app_private.members where room_id=rid
 on conflict(room_id,uid) do update set name=excluded.name,reason=excluded.reason,expires_at=excluded.expires_at;
 -- Only a final invalidation, on the already-authorized old private channel.
 perform realtime.send(jsonb_build_object('id',rid,'terminated',true,'name',who,'reason',why),
  'terminated','mini:'||r.id::text||':'||r.epoch::text,true);
 delete from app_private.rooms where id=rid;
end $$;

create or replace function app_private.expire_room(rid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r app_private.rooms; gone app_private.members;
begin
 select * into r from app_private.rooms where id=rid for update;
 if not found then return; end if;
 if r.status='closed' or r.expires_at<=clock_timestamp() then
  perform app_private.terminate_room(rid,r.host_uid,'expired'); return;
 end if;
 select * into gone from app_private.members where room_id=rid
  and seen_at<=clock_timestamp()-interval '45 seconds'
  order by (uid=r.host_uid) desc,seat limit 1;
 if found then
  -- End the current session on ANY departure. Never transfer host or reuse secrets.
  -- This intentionally applies to multi-player games too, until restart semantics exist.
  perform app_private.terminate_room(rid,gone.uid,
   case when gone.uid=r.host_uid then 'host_timeout' else 'player_timeout' end);
 end if;
end $$;

create or replace function app_private.cleanup_online_rooms() returns void
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 -- SKIP LOCKED avoids blocking an active, authenticated heartbeat/action.
 for rid in select id from app_private.rooms order by id for update skip locked loop
  perform app_private.expire_room(rid);
 end loop;
 delete from app_private.departures where expires_at<=clock_timestamp();
end $$;

create or replace function public.online_room_status(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); d app_private.departures;
begin
 -- Authorization BEFORE cleanup: outsiders cannot manipulate a guessed room.
 if exists(select 1 from app_private.members where room_id=p_room and uid=u) then
  perform app_private.expire_room(p_room);
  if exists(select 1 from app_private.members where room_id=p_room and uid=u) then
   return app_private.snapshot(p_room);
  end if;
 end if;
 select * into d from app_private.departures where room_id=p_room and uid=u and expires_at>clock_timestamp();
 if found then return jsonb_build_object('id',p_room,'terminated',true,'name',d.name,'reason',d.reason);end if;
 raise exception 'NOT_MEMBER';
end $$;

create or replace function public.online_depart_room(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); r app_private.rooms; s jsonb;
begin
 select * into r from app_private.rooms where id=p_room for update;
 if not exists(select 1 from app_private.members where room_id=p_room and uid=u) then
  -- Safe idempotent retry, only for that actor's private departure receipt.
  return public.online_room_status(p_room);
 end if;
 perform app_private.terminate_room(p_room,u,case when r.host_uid=u then 'host_left' else 'player_left' end);
 return public.online_room_status(p_room);
end $$;

create or replace function public.online_heartbeat(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); s jsonb;
begin
 perform 1 from app_private.rooms where id=p_room for update;
 perform app_private.throttle('heartbeat',90);
 -- Never revive an already expired actor, even before the cron worker runs.
 s:=public.online_room_status(p_room);
 if coalesce((s->>'terminated')::boolean,false) then return s;end if;
 update app_private.members set seen_at=clock_timestamp() where room_id=p_room and uid=u;
 update app_private.rooms set expires_at=clock_timestamp()+interval '30 minutes' where id=p_room;
 return app_private.snapshot(p_room);
end $$;

-- Preserve frozen 002 gameplay implementation, but replace its legacy leave branch.
do $$ begin
 if to_regprocedure('app_private.online_action_v2(uuid,uuid,bigint,uuid,text,integer)') is null then
  alter function public.online_action(uuid,uuid,bigint,uuid,text,integer) set schema app_private;
  alter function app_private.online_action(uuid,uuid,bigint,uuid,text,integer) rename to online_action_v2;
 end if;
end $$;
create or replace function public.online_action(
 p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_cell int default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 if p_kind='leave' then return public.online_depart_room(p_room);end if;
 s:=public.online_heartbeat(p_room);
 if coalesce((s->>'terminated')::boolean,false) then return s;end if;
 return app_private.online_action_v2(p_room,p_instance,p_version,p_action,p_kind,p_cell);
end $$;
create or replace function public.online_game_leave(p_room uuid,p_instance uuid,p_version bigint,p_action uuid)
returns jsonb language sql security definer set search_path='' as $$
 select public.online_depart_room(p_room);
$$;

-- Dedicated game RPCs must obey the SAME lease as board games.
do $$ declare f text;
begin
 foreach f in array array['online_chess_action','online_petitbac_action','online_hidden_action'] loop
  if to_regprocedure('app_private.'||f||'_v2(uuid,uuid,bigint,uuid,text,jsonb)') is null then
   execute format('alter function public.%I(uuid,uuid,bigint,uuid,text,jsonb) set schema app_private',f);
   execute format('alter function app_private.%I(uuid,uuid,bigint,uuid,text,jsonb) rename to %I',f,f||'_v2');
  end if;
  execute format($wrap$
   create or replace function public.%I(p_room uuid,p_instance uuid,p_version bigint,p_action uuid,p_kind text,p_data jsonb default '{}')
   returns jsonb language plpgsql security definer set search_path='' as $body$
   declare s jsonb;
   begin
    if p_kind='leave' then return public.online_depart_room(p_room);end if;
    s:=public.online_heartbeat(p_room);
    if coalesce((s->>'terminated')::boolean,false) then return s;end if;
    return app_private.%I(p_room,p_instance,p_version,p_action,p_kind,p_data);
   end $body$;
  $wrap$,f,f||'_v2');
  execute format('revoke all on function public.%I(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated',f);
  execute format('grant execute on function public.%I(uuid,uuid,bigint,uuid,text,jsonb) to authenticated',f);
 end loop;
end $$;
-- Old clients and reconnect reads cannot bypass expiry checks.
create or replace function public.online_get_room(p_room uuid) returns jsonb
language sql security definer set search_path='' as $$
 select public.online_room_status(p_room);
$$;

-- Presence is advisory only. A browser can announce only to a room it belongs to.
-- Clients still cannot publish broadcast events or touch server lease timestamps.
drop policy if exists mini_online_presence_receive on realtime.messages;
create policy mini_online_presence_receive on realtime.messages for select to authenticated
 using(extension='presence' and public.online_can_receive((select realtime.topic())));
drop policy if exists mini_online_presence_send on realtime.messages;
create policy mini_online_presence_send on realtime.messages for insert to authenticated
 with check(extension='presence' and public.online_can_receive((select realtime.topic())));
-- Realtime evaluates these RLS policies; private helper and game tables remain denied.
grant select,insert on realtime.messages to authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.online_room_status(uuid),public.online_depart_room(uuid),
 public.online_action(uuid,uuid,bigint,uuid,text,int),public.online_game_leave(uuid,uuid,bigint,uuid),
 public.online_heartbeat(uuid) from public,anon,authenticated;
grant execute on function public.online_room_status(uuid),public.online_depart_room(uuid),
 public.online_action(uuid,uuid,bigint,uuid,text,int),public.online_game_leave(uuid,uuid,bigint,uuid),
 public.online_heartbeat(uuid) to authenticated;

-- Standard five-field cron syntax works without assuming sub-minute support.
-- schedule(name,...) replaces the same named job on repeat installation.
select cron.schedule('mini-jeux-room-cleanup','* * * * *','select app_private.cleanup_online_rooms()');
-- Fail the transaction if the scheduler silently failed to create an active job.
do $$ begin
 if not exists(select 1 from cron.job where jobname='mini-jeux-room-cleanup' and active
  and command='select app_private.cleanup_online_rooms()') then
  raise exception 'PG_CRON_INSTALL_FAILED: no lifecycle changes installed';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
