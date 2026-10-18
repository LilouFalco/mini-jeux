-- Rouky Games 004: private profile per anonymous/permanent auth user.
-- Paste in Supabase SQL Editor and Run. Safe to re-run. Email is NOT stored here (it stays in auth.users).
begin;
create table if not exists app_private.profiles (
 uid uuid primary key references auth.users(id) on delete cascade,
 pseudo text not null check(char_length(pseudo) between 1 and 24),
 skin int not null check(skin between 0 and 5),
 hair int not null check(hair between 0 and 5),
 shirt int not null check(shirt between 0 and 3),
 cat boolean not null,
 updated_ms bigint not null check(updated_ms > 0)
);
alter table app_private.profiles enable row level security;  -- no policy: clients never touch the table directly
revoke all on app_private.profiles from public,anon,authenticated;

create or replace function public.profile_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := app_private.actor(); r app_private.profiles;
begin
 select * into r from app_private.profiles where uid=u;
 if not found then return null; end if;
 return jsonb_build_object('pseudo',r.pseudo,'avatar',jsonb_build_object('skin',r.skin,'hair',r.hair,'shirt',r.shirt,'cat',r.cat),'updated_ms',r.updated_ms);
end $$;

create or replace function public.profile_save(p_pseudo text,p_avatar jsonb,p_ts bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := app_private.actor(); n text; sk int; ha int; sh int; ct boolean; r app_private.profiles;
 now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
 n := app_private.clean_text(p_pseudo,1,24);
 if p_avatar is null or jsonb_typeof(p_avatar) is distinct from 'object' or jsonb_typeof(p_avatar->'cat') is distinct from 'boolean'
  or jsonb_typeof(p_avatar->'skin') is distinct from 'number' or jsonb_typeof(p_avatar->'hair') is distinct from 'number' or jsonb_typeof(p_avatar->'shirt') is distinct from 'number'
  then raise exception 'INVALID_ACTION'; end if;
 sk:=(p_avatar->>'skin')::numeric::int; ha:=(p_avatar->>'hair')::numeric::int; sh:=(p_avatar->>'shirt')::numeric::int; ct:=(p_avatar->>'cat')::boolean;
 if sk not between 0 and 5 or ha not between 0 and 5 or sh not between 0 and 3 then raise exception 'INVALID_ACTION'; end if;
 if p_ts is null or p_ts<=0 or p_ts>now_ms+300000 then raise exception 'INVALID_ACTION'; end if;
 insert into app_private.profiles as t(uid,pseudo,skin,hair,shirt,cat,updated_ms) values(u,n,sk,ha,sh,ct,p_ts)
 on conflict (uid) do update set pseudo=excluded.pseudo,skin=excluded.skin,hair=excluded.hair,shirt=excluded.shirt,cat=excluded.cat,updated_ms=excluded.updated_ms
 where t.updated_ms < excluded.updated_ms;  -- an older device/offline edit never overwrites a newer row
 select * into r from app_private.profiles where uid=u;
 return jsonb_build_object('pseudo',r.pseudo,'updated_ms',r.updated_ms);
end $$;

revoke all on function public.profile_get() from public,anon,authenticated;
revoke all on function public.profile_save(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.profile_get(),public.profile_save(text,jsonb,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
