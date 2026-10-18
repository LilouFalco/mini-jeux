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
   or not (p_data ?& array['seat','category','points'])
   or jsonb_typeof(p_data->'seat') is distinct from 'number' or p_data->>'seat'!~'^[0-9]{1,2}$' or jsonb_typeof(p_data->'category')<>'string'
   or jsonb_typeof(p_data->'points')<>'number' or p_data->>'points' not in ('0','5','10') then raise exception 'INVALID_MARK'; end if;
  select uid into target from app_private.members where room_id=p_room and seat=(p_data->>'seat')::int;
  c:=p_data->>'category';
  if target is null or not s.categories ? c or not exists(select 1 from app_private.members where room_id=p_room and uid=target) then raise exception 'INVALID_MARK'; end if;
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
