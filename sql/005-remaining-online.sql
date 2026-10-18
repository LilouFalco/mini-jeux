-- LOCAL REVIEW ONLY. NOT APPLIED. 005 remaining multiplayer projections ONLY.
-- Requires frozen 001 + 002 + 003 and ALREADY APPLIED 004 normal Qui est-ce rules.
-- Does not execute/reapply 004 or modify any action function.
-- Adds member-only views, retaining legacy Petit Bac answers/marks fields.
begin;
do $preflight$
declare fn regprocedure; def text;
begin
 fn:=to_regprocedure('app_private.online_hidden_action_v2(uuid,uuid,bigint,uuid,text,jsonb)');
 if fn is null
 or to_regprocedure('public.online_room_status(uuid)') is null
 or to_regprocedure('app_private.pb_view(uuid)') is null
 or to_regprocedure('app_private.hidden_view(uuid)') is null
 then raise exception 'MIGRATION_005_REQUIRES_001_002_003'; end if;
 def:=pg_get_functiondef(fn);
 -- Both exact 004 changes must already exist. Inspect only; NEVER rewrite actions.
 if position('elsif r.game=''quiestce'' and p_kind=''endturn'' then' in def)=0
 or position('r.status:=''finished'';r.winner:=case when hit then m.seat else 3-m.seat end;' in def)=0
 then raise exception 'MIGRATION_005_REQUIRES_ALREADY_APPLIED_004'; end if;
end $preflight$;

-- 005 Undercover exposes only the terminal winner, never other players' roles or words.
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
  return jsonb_build_object('own',own,'alive',s->'alive','phase',s->'phase','votesCast',coalesce((select jsonb_agg(key) from jsonb_object_keys(coalesce(s->'votes','{}')) key),'[]'::jsonb))
   || case when r.status='finished' then jsonb_build_object('winner',s->'winner') else '{}'::jsonb end;
 elsif r.game='timesup' then
  return jsonb_build_object('phase',s->'phase','round',s->'round','scores',s->'scores','remaining',jsonb_array_length(coalesce(s->'pile','[]')),
   'deadline',s->'deadline','card',case when r.turn=m.seat and s->>'phase'='turn' then s->'pile'->0 else null end);
 end if;
 raise exception 'GAME_UNAVAILABLE';
end $$;

-- 005 Petit Bac adds seat-based projections while retaining legacy UUID keys.
create or replace function app_private.pb_view(rid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s app_private.pb_rounds; u uuid:=app_private.actor(); people jsonb;
 answers_by_seat jsonb; marks_by_seat jsonb;
begin
 if not exists(select 1 from app_private.members where room_id=rid and uid=u) then raise exception 'NOT_MEMBER'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('seat',seat,'name',name) order by seat),'[]'::jsonb)
 into people from app_private.members where room_id=rid;
 select * into s from app_private.pb_rounds where room_id=rid;
 if not found then
  return jsonb_build_object('phase','waiting','players',people,'answersBySeat','{}'::jsonb,'marksBySeat','{}'::jsonb);
 end if;
 -- Same privacy boundary as legacy answers: only the caller until scoring.
 select coalesce(jsonb_object_agg(m.seat::text,s.answers->m.uid::text),'{}'::jsonb)
 into answers_by_seat from app_private.members m
 where m.room_id=rid and s.answers ? m.uid::text
 and (s.phase in ('scoring','finished') or m.uid=u);
 select coalesce(jsonb_object_agg(m.seat::text,s.marks->m.uid::text),'{}'::jsonb)
 into marks_by_seat from app_private.members m
 where m.room_id=rid and s.marks ? m.uid::text
 and (s.phase in ('scoring','finished') or m.uid=u);
 return jsonb_build_object('phase',s.phase,'letter',s.letter,'categories',s.categories,
 'answers',case when s.phase in ('scoring','finished') then s.answers else jsonb_build_object(u::text,s.answers->u::text) end,
 'marks',s.marks,'deadline',s.deadline,'round',s.round_no,
 'players',people,'answersBySeat',answers_by_seat,'marksBySeat',marks_by_seat);
end $$;

-- Helpers remain private. CREATE OR REPLACE retains ownership and existing ACLs;
-- explicit revocation also fails closed if default privileges were changed.
revoke all on function app_private.hidden_view(uuid),app_private.pb_view(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
