'use strict';
// Local source assembly only. Never connects to a database.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let base=read('sql/sources/002-puissance4.sql');
base=base.replace('-- Adds Puissance 4 rooms. Morpion RPC names and signatures are unchanged and stay morpion-only.', '-- INCREMENTAL WORK IN PROGRESS: Seven-game draft bundle. Independent security review REQUIRED before application.\n-- Do not apply before independent security review. Dedicated hidden-state RPCs; chess legality is client-side by explicit casual-game agreement.');
base=base.replace('p_action,app_private.empty_board(p_game)) returning id',"p_action,app_private.empty_board(p_game)) returning id");
// Set capacity before joining; the creating snapshot is produced after this update.
base=base.replace(' insert into app_private.members(room_id,uid,seat,name) values(rid,u,1,pseudo);'," update app_private.rooms set capacity=case when p_game='petitbac' then 10 when p_game in ('undercover','timesup') then 12 else 2 end where id=rid;\n insert into app_private.members(room_id,uid,seat,name) values(rid,u,1,pseudo);");
// The old integer-cell RPC is never a handler for Petit Bac.
base=base.replace('if not app_private.online_game_ok(r.game) then', "if r.game not in ('morpion','puissance4') then");
base=base.replace(/notify pgrst,'reload schema';\s*commit;\s*$/, '');
let snapshot=read('sql/001-online.sql').match(/create or replace function app_private\.snapshot\(rid uuid\)[\s\S]*?end \$\$;/)[0];
snapshot=snapshot.replace("'expires_at',r.expires_at);", "'expires_at',r.expires_at) || case when r.game='petitbac' then jsonb_build_object('petitbac',app_private.pb_view(rid)) else '{}'::jsonb end || case when r.game='chess' then jsonb_build_object('chess',app_private.chess_view(rid)) else '{}'::jsonb end || case when r.game in ('naval','quiestce','undercover','timesup') then jsonb_build_object('hidden',app_private.hidden_view(rid)) else '{}'::jsonb end;");
const out=base+'\n'+read('sql/sources/002-petitbac.sql')+'\n'+read('sql/sources/002-chess.sql')+'\n'+read('sql/sources/002-hidden.sql')+'\n'+read('sql/sources/002-lifecycle.sql')+'\n'+snapshot+"\nnotify pgrst,'reload schema';\ncommit;\n";
fs.writeFileSync(path.join(root,'sql/002-online-puissance4.sql'),out);
