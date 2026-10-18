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
  if r.game='timesup' and (n%2<>0 or n>12) then raise exception 'EVEN_PLAYERS_REQUIRED'; end if;
  if r.game in ('naval','quiestce') and (select count(*) from jsonb_object_keys(s->'players'))<>2 then raise exception 'NOT_CONFIGURED'; end if;
  if r.game='naval' then s:=s||jsonb_build_object('shots','{}'::jsonb,'phase','playing');
  elsif r.game='quiestce' then s:=s||jsonb_build_object('choices',(select jsonb_agg(i) from generate_series(0,23)i),'phase','playing');
  elsif r.game='undercover' then
   select value into pair from jsonb_array_elements('[["Café","Thé"],["Plage","Piscine"],["Pizza","Tarte"],["Vélo","Trottinette"],["Stylo","Crayon"],["Cinéma","Théâtre"],["Savon","Shampoing"],["Train","Tramway"],["Pull","Gilet"],["Montagne","Colline"],["Lait","Crème"],["Chocolat","Caramel"],["Ahri","Evelynn"],["Jinx","Vi"],["Yasuo","Yone"],["Lux","Syndra"],["Zed","Talon"],["Thresh","Blitzcrank"],["Garen","Darius"],["Ashe","Caitlyn"],["Baron Nashor","Dragon"],["Lee Sin","Jarvan IV"],["Tour","Inhibiteur"],["Ranked","Normal"],["Mario","Sonic"],["Minecraft","Terraria"],["Pokémon","Digimon"],["Fortnite","Apex Legends"],["Les Sims","Animal Crossing"],["Switch","PlayStation"],["Zelda","Final Fantasy"],["Pac-Man","Tetris"],["Overwatch","Valorant"],["Stardew Valley","Animal Crossing"],["Mario Kart","Crash Team Racing"],["Manette","Clavier"],["Naruto","Sasuke"],["Luffy","Zoro"],["Goku","Vegeta"],["Tanjiro","Zenitsu"],["Eren","Levi"],["Totoro","Ponyo"],["Sailor Moon","Card Captor Sakura"],["One Piece","Naruto"],["Demon Slayer","Jujutsu Kaisen"],["Attack on Titan","Fullmetal Alchemist"],["Studio Ghibli","Pixar"],["Death Note","Code Geass"],["Britney Spears","Christina Aguilera"],["Lady Gaga","Katy Perry"],["Beyoncé","Rihanna"],["Madonna","Cher"],["Dua Lipa","Ariana Grande"],["Taylor Swift","Olivia Rodrigo"],["Sabrina Carpenter","Chappell Roan"],["Shakira","Jennifer Lopez"],["RuPaul","Tyra Banks"],["Drag Race","Project Runway"],["Kylie Minogue","Dua Lipa"],["Paillettes","Strass"],["Gloss","Rouge à lèvres"],["Vernis","Faux ongles"],["Licorne","Papillon"],["Bubble tea","Milkshake"],["Barbie","Hello Kitty"],["Skincare","Maquillage"],["Sac à main","Pochette"],["Talons","Ballerines"],["Journal intime","Bullet journal"],["Peluche","Poupée"],["Brunch","Goûter"],["Rose","Fuchsia"]]'::jsonb) order by random() limit 1;
   select array_agg(x) into seats from (select x from unnest(seats) as t(x) order by random())z;
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
      else
       select coalesce(min(seat),seats[1]) into nextseat from app_private.members where room_id=p_room and seat>r.turn;
       r.turn:=nextseat;
       select jsonb_agg(card) into deck from (select card from jsonb_array_elements(s->'deck')card order by random())z;s:=s||jsonb_build_object('round',idx,'pile',deck,'phase','ready','deadline',null);end if;
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
