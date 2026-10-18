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
 for(const game of ['naval','quiestce','undercover','timesup']) {
  await db.exec('delete from app_private.rooms;delete from app_private.rate_limits');
  const n=game==='timesup'?4:game==='undercover'?3:2;
  let r=await rpc(0,'online_create_room_game',[game,'Secret '+game,'A',uuid()]);
  for(let i=1;i<n;i++)await rpc(i,'online_join_room_game',[game,'Secret '+game,'P'+i]);
  const get=async(i=0)=>r=await rpc(i,'online_get_room',[r.id]);
  const act=async(i,k,data={})=>{await get(i);return rpc(i,'online_hidden_action',[r.id,r.instance,r.version,uuid(),k,data]);};
  await fail(()=>act(1,'start'),'HOST_ONLY');
  await get();await fail(()=>rpc(6,'online_hidden_action',[r.id,r.instance,r.version,uuid(),'ready',{}]),'NOT_MEMBER');
  if(game==='naval'){
   await fail(()=>act(0,'configure',{ships:[[0,1],[0,1],[0,1],[0,1],[0,1]]}),'INVALID_FLEET');
   for(let i=0;i<n;i++)await act(i,'configure',{ships:[[0,1,2,3,4],[10,11,12,13],[20,21,22],[30,31,32],[40,41]]});
   await get(1);assert.equal(Object.keys(r.hidden.own).includes('ships'),true);assert.ok(!('players' in r.hidden));
  }
  if(game==='quiestce')for(let i=0;i<n;i++)await act(i,'configure',{choice:i+5});
  for(let i=0;i<n;i++)await act(i,'ready');await act(0,'start');await get();assert.equal(r.status,'playing');
  await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from app_private.hidden_games'),/permission denied/);await db.exec('reset role');
  if(game==='naval'){
   await fail(()=>act(1,'shoot',{cell:99}),'NOT_YOUR_TURN');
   for(const cell of [0,1,2,3,4,10,11,12,13,20,21,22,30,31,32,40,41]){
    await act(0,'shoot',{cell});await get();if(r.status!=='finished')await act(1,'shoot',{cell:99-cell});
   }
   await get();assert.equal(r.status,'finished');assert.equal(r.winner,1);
  }else if(game==='quiestce'){
   await get(0);assert.equal(r.hidden.own.choice,5);assert.ok(!JSON.stringify(r.hidden).includes('players'));
   await act(0,'guess',{choice:6});await get();assert.equal(r.status,'finished');assert.equal(r.winner,1);
  }else if(game==='undercover'){
   await get(0);assert.ok(['civil','undercover'].includes(r.hidden.own.role));assert.equal('players' in r.hidden,false);
   await fail(()=>act(0,'vote',{seat:0}),'INVALID_VOTE');
   await act(0,'vote',{seat:2});await fail(()=>act(0,'vote',{seat:2}),'ALREADY_VOTED');
   await act(1,'vote',{seat:1});await act(2,'vote',{seat:1});await get();assert.equal(r.hidden.alive['1'],false);
  }else{
   await act(0,'begin');await get(0);assert.equal(typeof r.hidden.card,'string');
   await get(1);assert.equal(r.hidden.card,null);assert.equal('deck' in r.hidden,false);
   await fail(()=>act(1,'found'),'NOT_YOUR_TURN');
   await act(0,'found');await get();assert.equal(r.hidden.scores['0'],1);
   await act(0,'end');await get();assert.equal(r.turn,2);
  }
  assert.ok((await db.query('select payload from realtime.sent')).rows.every(x=>Object.keys(x.payload).sort().join(',')==='instance,version'));
  await get();
  const oldTopic=r.topic;const leave=[r.id,r.instance,r.version,uuid()];
  await rpc(0,'online_game_leave',leave);await rpc(0,'online_game_leave',leave);
  await get(1);assert.equal(r.status,'waiting');assert.notEqual(r.topic,oldTopic);
  assert.equal((await db.query('select count(*)::int n from app_private.hidden_games where room_id=$1',[r.id])).rows[0].n,0);
  await fail(()=>rpc(0,'online_get_room',[r.id]),'NOT_MEMBER');
  console.log('PASS hidden SQL local',game,'membership host phase private storage filtered snapshot gameplay');
 }
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
