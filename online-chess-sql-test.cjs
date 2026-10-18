/* PostgreSQL WASM tests only. Supabase Auth and realtime.send are explicit stubs.
 * npm install --prefix /tmp/onlineqa @electric-sql/pglite@0.3.14
 */
const {PGlite}=require(process.env.PGLITE_MODULE||'/tmp/onlineqa/node_modules/@electric-sql/pglite');
const assert=require('node:assert/strict'), fs=require('node:fs');
(async()=>{
 const db=new PGlite(), sql=fs.readFileSync(__dirname+'/sql/001-online.sql','utf8');
 await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema realtime;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table realtime.messages(extension text);
 create table realtime.sent(payload jsonb,event text,topic text,private boolean);
 create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
 create function realtime.send(p jsonb,e text,t text,b boolean) returns void language sql as $$ insert into realtime.sent values(p,e,t,b) $$;
 alter table realtime.messages enable row level security;
 `);
 const sql2=fs.readFileSync(__dirname+'/sql/002-online-puissance4.sql','utf8');
 await db.exec(sql);await db.exec(sql);
 const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007'];
 for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
 const uuid=()=>require('crypto').randomUUID();
 const rpc=async(i,name,args=[])=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]||'']);
  await db.exec('set role authenticated');
  try{return (await db.query('select public.'+name+'('+args.map((_,j)=>'$'+(j+1)).join(',')+') as value',args)).rows[0].value;}
  finally{await db.exec('reset role');}
 };


 await db.exec(sql2);await db.exec(sql2);
 const fail=async(fn,code)=>assert.rejects(fn,e=>String(e.message).includes(code));
 let r=await rpc(0,'online_create_room_game',['chess','Echecs Rose','A',uuid()]);
 await rpc(1,'online_join_room_game',['chess','Echecs Rose','B']);
 const get=async(i=0)=>r=await rpc(i,'online_get_room',[r.id]);
 const act=async(i,k,data={})=>{await get(i);return rpc(i,'online_chess_action',[r.id,r.instance,r.version,uuid(),k,data]);};
 await fail(()=>act(1,'start'),'HOST_ONLY');
 await act(0,'ready');await act(1,'ready');await act(0,'start');await get();
 await fail(()=>rpc(2,'online_chess_action',[r.id,r.instance,r.version,uuid(),'move',{uci:'e2e4'}]),'NOT_MEMBER');
 await fail(()=>act(1,'move',{uci:'e7e5'}),'NOT_YOUR_TURN');
 await fail(()=>act(0,'move',{uci:'a9a1'}),'INVALID_MOVE');
 await fail(()=>act(0,'move',{uci:'e2e4',moves:[]}),'INVALID_MOVE');
 await fail(()=>act(0,'move',{uci:null}),'INVALID_MOVE');
 await get();const args=[r.id,r.instance,r.version,uuid(),'move',{uci:'e2e4'}];
 const ack=await rpc(0,'online_chess_action',args);assert.deepEqual(await rpc(0,'online_chess_action',args),ack);
 await fail(()=>rpc(1,'online_chess_action',[r.id,r.instance,r.version,uuid(),'move',{uci:'e7e5'}]),'STALE_VERSION');
 await act(1,'move',{uci:'e7e5'});await get();assert.deepEqual(r.chess.moves,['e2e4','e7e5']);
 // Deliberately NOT legality-enforcing: a bypassing player may submit a well-shaped illegal move.
 await act(0,'move',{uci:'e1e5'});await get();assert.equal(r.chess.moves.at(-1),'e1e5');
 await act(0,'report',{result:'white'});await get();assert.equal(r.status,'playing');
 await act(1,'report',{result:'draw'});await get();assert.equal(r.status,'playing');
 await act(1,'report',{result:'white'});await get();assert.equal(r.status,'finished');assert.equal(r.winner,1);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from app_private.chess_rounds'),/permission denied/);await db.exec('reset role');
 console.log('PASS casual chess SQL: repeat install, membership, host, readiness, turns, payload bounds, append-only, version/replay, mutual results, table denial; legality explicitly NOT enforced');
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
