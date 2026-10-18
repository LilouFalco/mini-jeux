-- 004: Qui est-ce LoL normal rules. LOCAL REVIEW ONLY, NOT APPLIED.
-- Adds kind 'endturn' (turn holder ends their question turn, no data) and makes a wrong
-- final guess a loss for the guesser. Patches the existing function body in place and
-- fails loudly if the expected text is not found (no silent no-op).
do $$
declare fn regprocedure; def text; n text;
begin
 fn:=to_regprocedure('app_private.online_hidden_action_v2(uuid,uuid,bigint,uuid,text,jsonb)');
 if fn is null then fn:=to_regprocedure('public.online_hidden_action(uuid,uuid,bigint,uuid,text,jsonb)'); end if;
 if fn is null then raise exception 'MIGRATION_004_NO_FUNCTION'; end if;
 def:=pg_get_functiondef(fn);
 if position('p_kind=''endturn''' in def)>0 then return; end if;
 n:=replace(def,'if hit then r.status:=''finished'';r.winner:=m.seat;else r.turn:=3-r.turn;end if;',
  'r.status:=''finished'';r.winner:=case when hit then m.seat else 3-m.seat end;');
 if n=def then raise exception 'MIGRATION_004_GUESS_PATTERN_NOT_FOUND'; end if;
 def:=n;
 n:=replace(def,' elsif r.game=''undercover'' and p_kind=''vote'' then',
  ' elsif r.game=''quiestce'' and p_kind=''endturn'' then
  if p_data<>''{}''::jsonb then raise exception ''INVALID_ACTION''; end if;
  if r.status<>''playing'' then raise exception ''WRONG_PHASE''; end if;
  if r.turn<>m.seat then raise exception ''NOT_YOUR_TURN''; end if;
  r.turn:=3-r.turn;
 elsif r.game=''undercover'' and p_kind=''vote'' then');
 if n=def then raise exception 'MIGRATION_004_VOTE_ANCHOR_NOT_FOUND'; end if;
 execute n;
end $$;
