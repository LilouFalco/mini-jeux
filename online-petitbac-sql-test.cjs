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

 await db.exec(sql); await db.exec(sql2); await db.exec(sql2);
 const fail=async(fn,code)=>assert.rejects(fn,e=>String(e.message).includes(code));
 let r=await rpc(0,'online_create_room_game',['petitbac','Bac Rose','Lilou',uuid()]);
 assert.equal(r.capacity,10); assert.equal(r.petitbac.phase,'waiting');
 await rpc(1,'online_join_room_game',['petitbac','Bac Rose','Lulu']);
 await fail(()=>rpc(2,'online_get_room',[r.id]),'NOT_MEMBER');
 await fail(()=>rpc(2,'online_petitbac_action',[r.id,r.instance,r.version,uuid(),'ready',{}]),'NOT_MEMBER');
 const get=async(i=0)=>r=await rpc(i,'online_get_room',[r.id]);
 const act=async(i,k,data={})=>{await get(i);return rpc(i,'online_petitbac_action',[r.id,r.instance,r.version,uuid(),k,data]);};
 await fail(()=>act(1,'start'),'HOST_ONLY');
 await fail(()=>act(0,'start'),'NOT_READY');
 await act(0,'ready');await act(1,'ready');await act(0,'start');
 await get(); assert.equal(r.status,'playing');assert.match(r.petitbac.letter,/^[A-V]$/);
 await fail(()=>rpc(0,'online_action',[r.id,r.instance,r.version,uuid(),'place',0]),'GAME_UNAVAILABLE');
 await fail(()=>act(0,'submit',{bad:'x'}),'INVALID_ANSWERS');
 await fail(()=>act(0,'submit',{prenom:4,ville:'',animal:'',metier:'',objet:'',pays:''}),'INVALID_ANSWERS');
 const answer={prenom:'SECRET',ville:'',animal:'',metier:'',objet:'',pays:''};
 await get(); const args=[r.id,r.instance,r.version,uuid(),'submit',answer];
 const ack=await rpc(0,'online_petitbac_action',args);assert.deepEqual(await rpc(0,'online_petitbac_action',args),ack);
 await fail(()=>rpc(0,'online_petitbac_action',[...args.slice(0,4),'stop',{}]),'ACTION_REUSED');
 await fail(()=>rpc(0,'online_petitbac_action',[r.id,r.instance,r.version,uuid(),'submit',answer]),'STALE_VERSION');
 await get(1);assert.ok(!JSON.stringify(r).includes('SECRET'));
 await get(0);assert.equal(r.petitbac.answers[ids[0]].prenom,'SECRET');
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from app_private.pb_rounds'),/permission denied/);
 await db.exec('reset role');
 const events=(await db.query('select payload from realtime.sent')).rows;
 assert.ok(events.every(e=>Object.keys(e.payload).sort().join(',')==='instance,version'));
 await act(1,'stop'); await get(1); assert.equal(r.petitbac.answers[ids[0]].prenom,'SECRET');
 await fail(()=>act(1,'mark',{seat:1,category:'prenom',points:10}),'HOST_ONLY');
 await fail(()=>act(0,'mark',{seat:3,category:'prenom',points:10}),'INVALID_MARK');
 await fail(()=>act(0,'mark',{seat:1,category:'prenom',points:999}),'INVALID_MARK');
 await fail(()=>act(0,'mark',{seat:1,category:'prenom',points:null}),'INVALID_MARK');
 await fail(()=>act(0,'finish'),'MISSING_MARKS');
 for(const seat of [1,2]) for(const category of Object.keys(answer)) await act(0,'mark',{seat,category,points:5});
 await act(0,'finish');await get(); assert.equal(r.status,'finished'); assert.equal(r.petitbac.phase,'finished');
 await fail(()=>act(0,'submit',answer),'WRONG_PHASE');
 await act(0,'next');await get();assert.equal(r.petitbac.phase,'waiting');assert.equal(r.members.every(m=>!m.ready),true);
 await act(0,'ready');await act(1,'ready');await act(0,'start');await get();assert.equal(r.petitbac.round,2);
 await fail(()=>act(0,'timeout'),'TIMER_RUNNING');
 await db.query("update app_private.pb_rounds set deadline=now()-interval '1 second' where room_id=$1",[r.id]);
 await fail(()=>act(0,'submit',answer),'ROUND_EXPIRED');await act(1,'timeout');await get();assert.equal(r.petitbac.phase,'scoring');
 const oldTopic=r.topic;const leave=[r.id,r.instance,r.version,uuid()];
 await rpc(0,'online_game_leave',leave);assert.deepEqual(await rpc(0,'online_game_leave',leave),{version:r.version+1,left:true});
 await get(1);assert.equal(r.status,'waiting');assert.equal(r.host,true);assert.notEqual(r.topic,oldTopic);
 await fail(()=>rpc(0,'online_get_room',[r.id]),'NOT_MEMBER');
 assert.equal(r.petitbac.phase,'waiting');
 console.log('PASS Petit Bac local SQL: repeat install, capacity, membership, host, readiness, phase, validation, private answers, table denial, minimal broadcast, replay, stale version, human marks 0/5/10, completion');
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
