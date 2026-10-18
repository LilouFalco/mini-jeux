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
