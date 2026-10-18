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


 await db.exec(sql2);const sql4=fs.readFileSync(__dirname+'/sql/004-quiestce-rules.sql','utf8');await db.exec(sql4);await db.exec(sql4);
 const fail=async(fn,code)=>assert.rejects(fn,e=>String(e.message).includes(code));
 const setup=async()=>{await db.exec('delete from app_private.rooms;delete from app_private.rate_limits;');
  let r=await rpc(0,'online_create_room_game',['quiestce','Secret q','A',uuid()]);await rpc(1,'online_join_room_game',['quiestce','Secret q','P1']);
  const get=async(i=0)=>r=await rpc(i,'online_get_room',[r.id]);
  const act=async(i,k,d={})=>{await get(i);return rpc(i,'online_hidden_action',[r.id,r.instance,r.version,uuid(),k,d])};
  await act(0,'configure',{choice:3});await act(1,'configure',{choice:5});await act(0,'ready');await act(1,'ready');await act(0,'start');return {r,get,act}};
 let {get,act}=await setup();
 assert.equal((await get()).turn,1);
 await fail(()=>act(1,'endturn'),'NOT_YOUR_TURN');
 await fail(()=>act(0,'endturn',{x:1}),'INVALID_ACTION');
 await act(0,'endturn');assert.equal((await get()).turn,2);
 await fail(()=>act(0,'endturn'),'NOT_YOUR_TURN');
 await fail(()=>act(0,'guess',{choice:5}),'NOT_YOUR_TURN');
 await act(1,'endturn');assert.equal((await get()).turn,1);
 await act(0,'guess',{choice:5});let g=await get();assert.equal(g.status,'finished');assert.equal(g.winner,1);
 await fail(()=>act(0,'endturn'),'WRONG_PHASE');
 ({get,act}=await setup());
 await act(0,'guess',{choice:9});g=await get();assert.equal(g.status,'finished');assert.equal(g.winner,2,'wrong guess loses');
 assert.equal(g.hidden.lastGuess.correct,false);assert.equal(JSON.stringify(g.hidden).includes('"choice":5')&&g.hidden.own.choice!==5,false);
 ({get,act}=await setup());
 await fail(()=>act(0,'guess',{choice:99}),'INVALID_CHOICE');
 console.log('PASS 004 quiestce rules: endturn authz/phase/data, wrong guess loses, right wins, idempotent migration');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
