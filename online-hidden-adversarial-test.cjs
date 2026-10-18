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
 const sql2=fs.readFileSync(__dirname+'/sql/002-online-puissance4.sql','utf8');await db.exec(sql);await db.exec(sql2);await db.exec(sql2);
 const ids=[1,2,3,4,5,6,7].map(i=>'10000000-0000-4000-8000-00000000000'+i);for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
 const uuid=()=>require('crypto').randomUUID();
 const rpc=async(i,name,args=[])=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]||'']);await db.exec('set role authenticated');try{return (await db.query('select public.'+name+'('+args.map((_,j)=>'$'+(j+1)).join(',')+') as value',args)).rows[0].value;}finally{await db.exec('reset role');}};
 const fail=async(fn,code)=>assert.rejects(fn,e=>String(e.message).includes(code));
 const leaks=(o,secrets)=>{const s=JSON.stringify(o);for(const x of secrets)assert.ok(!s.includes(x),'LEAK '+x)};
 for(const game of ['naval','quiestce','undercover','timesup']){
  await db.exec('delete from app_private.rooms;delete from app_private.rate_limits');
  const n=game==='timesup'?4:game==='undercover'?3:2;
  let r=await rpc(0,'online_create_room_game',[game,'Adv '+game,'A',uuid()]);
  for(let i=1;i<n;i++)await rpc(i,'online_join_room_game',[game,'Adv '+game,'P'+i]);
  const get=async(i=0)=>r=await rpc(i,'online_get_room',[r.id]);
  const act=async(i,k,data={},id=uuid())=>{await get(i);return rpc(i,'online_hidden_action',[r.id,r.instance,r.version,id,k,data]);};
  // generic RPC must not drive hidden games
  await get();await assert.rejects(()=>rpc(0,'online_action',[r.id,r.instance,r.version,uuid(),0]));
  // anon cannot call
  await db.exec('set role anon');await assert.rejects(()=>db.query("select public.online_hidden_action($1,$1,0,$1,'ready','{}')",[r.id]),/permission denied/);await db.exec('reset role');
  // replay idempotent, reuse with other payload rejected, stale rejected
  await get();const aid=uuid();const a1=await rpc(0,'online_hidden_action',[r.id,r.instance,r.version,aid,'ready',{}]);
  const a2=await rpc(0,'online_hidden_action',[r.id,r.instance,r.version,aid,'ready',{}]);assert.deepEqual(a1,a2);
  await fail(()=>rpc(0,'online_hidden_action',[r.id,r.instance,r.version,aid,'unready',{}]),'ACTION_REUSED');
  await fail(()=>rpc(0,'online_hidden_action',[r.id,r.instance,r.version-1,uuid(),'unready',{}]),'STALE_VERSION');
  await fail(()=>rpc(0,'online_hidden_action',[r.id,uuid(),r.version,uuid(),'unready',{}]),'STALE_VERSION');
  // oversize / non-object payload
  await fail(()=>act(0,'ready',{x:'a'.repeat(5000)}),'INVALID_ACTION');
  await fail(()=>act(0,'nonsense'),'');
  // unknown kind must not change version
  const v0=(await get()).version;await assert.rejects(()=>act(0,'drop_table',{}));assert.equal((await get()).version,v0);
  if(game==='naval'){
   const fleets=[[[0,1,2,3,4],[10,11,12,13],[20,21,22],[30,31,32],[40,41]],[[5,6,7,8,9],[15,16,17,18],[25,26,27],[35,36,37],[45,46]]];
   for(const bad of [[[0,1,2,3,4],[10,11,12,13],[20,21,22],[30,31,32],[4,14]],[[9,10],[20,21,22],[30,31,32],[40,41,42,43],[50,51,52,53,54]],[[0,2],[10,11,12,13],[20,21,22],[30,31,32],[40,41,42,43,44]],[[95,105],[10,11,12,13],[20,21,22],[30,31,32],[40,41,42,43,44]],[[-1,0],[10,11,12,13],[20,21,22],[30,31,32],[40,41,42,43,44]]])
    await fail(()=>act(0,'configure',{ships:bad}),'INVALID_FLEET');
   for(let i=0;i<2;i++)await act(i,'configure',{ships:fleets[i]});
   for(let i=0;i<2;i++)await act(i,'ready');await act(0,'start');
   for(const i of [0,1]){await get(i);leaks(r.hidden.shots,[]);const foe=fleets[1-i].flat();assert.ok(!('players' in r.hidden));assert.ok(!JSON.stringify(r.hidden.own).includes(JSON.stringify(fleets[1-i][0])),'foe fleet leaked');}
   await get();const first=r.turn-1;await fail(()=>act(1-first,'shoot',{cell:50}),'NOT_YOUR_TURN');
   await fail(()=>act(first,'shoot',{cell:100}),'INVALID_CELL');await fail(()=>act(first,'shoot',{cell:'1;drop'}),'INVALID_CELL');await fail(()=>act(first,'shoot',{cell:1,x:2}),'INVALID_CELL');
   await act(first,'shoot',{cell:77});await act(1-first,'shoot',{cell:77});await fail(()=>act(first,'shoot',{cell:77}),'ALREADY_SHOT');
  }
  if(game==='quiestce'){
   for(let i=0;i<2;i++)await act(i,'configure',{choice:3+i*10});
   await fail(()=>act(0,'configure',{choice:99}),'');
   for(let i=0;i<2;i++)await act(i,'ready');await act(0,'start');
   await get(0);assert.ok(!JSON.stringify(r.hidden).includes('13'.repeat(1))||r.hidden.own.choice===3);assert.equal(r.hidden.own.choice,3);
   await get(1);assert.equal(r.hidden.own.choice,13);
   await fail(()=>rpc(6,'online_get_room',[r.id]),'NOT_MEMBER');
  }
  if(game==='undercover'){
   for(let i=0;i<n;i++)await act(i,'ready');await act(0,'start');
   const own=[];for(let i=0;i<n;i++){await get(i);own.push(r.hidden.own);}
   assert.equal(own.filter(o=>o.role==='undercover').length,1);
   const civ=own.find(o=>o.role==='civil'),und=own.find(o=>o.role==='undercover');assert.notEqual(civ.word,und.word);
   for(let i=0;i<n;i++){await get(i);const others=own.filter((_,j)=>j!==i).map(o=>o.word).filter(w=>w!==own[i].word);leaks(r.hidden,others);}
   await fail(()=>act(0,'vote',{seat:7}),'');await fail(()=>act(0,'vote',{seat:'x'}),'');
   await fail(()=>act(0,'vote',{seat:0}),'INVALID_VOTE');
   await act(0,'vote',{seat:2});await get(2);assert.ok(!JSON.stringify(r.hidden).includes('"votes"'),'votes leaked');
  }
  if(game==='timesup'){
   for(let i=0;i<n;i++)await act(i,'ready');await act(0,'start');await act(0,'begin');
   await get(0);const card=r.hidden.card;assert.equal(typeof card,'string');
   for(const i of [1,2,3]){await get(i);assert.equal(r.hidden.card,null);leaks(r.hidden,[card]);}
   await fail(()=>act(2,'found'),'NOT_YOUR_TURN');
   await act(0,'found');await get(0);assert.notEqual(r.hidden.card,card);
  }
  const rows=(await db.query('select payload from realtime.sent')).rows;assert.ok(rows.every(x=>Object.keys(x.payload).sort().join(',')==='instance,version'));
  // outsider can never receive private topic
  await get();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[6]]);await db.exec('set role authenticated');
  assert.equal((await db.query('select public.online_can_receive($1) v',[r.topic])).rows[0].v,false);await db.exec('reset role');
  console.log('PASS hidden ADVERSARIAL',game);
 }
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});