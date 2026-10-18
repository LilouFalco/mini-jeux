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
 await db.exec(sql);await db.exec(sql);
 const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
 for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
 const uuid=()=>require('crypto').randomUUID();
 const rpc=async(i,name,args=[])=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]||'']);
  await db.exec('set role authenticated');
  try{return (await db.query('select public.'+name+'('+args.map((_,j)=>'$'+(j+1)).join(',')+') as value',args)).rows[0].value;}
  finally{await db.exec('reset role');}
 };
 const fail=async(fn,code)=>{await assert.rejects(fn,e=>String(e.message).includes(code));};
 const key=uuid();
 let r=await rpc(0,'online_create_room',['  Salon   Rose  ','<b>Lilou</b>',key]);
 assert.equal(r.name,'Salon Rose');assert.equal(r.members[0].name,'<b>Lilou</b>');
 assert.equal((await rpc(0,'online_create_room',['Salon Rose','<b>Lilou</b>',key])).id,r.id);
 await fail(()=>rpc(1,'online_create_room',['salon rose','Lulu',uuid()]),'NAME_TAKEN');
 await fail(()=>rpc(2,'online_get_room',[r.id]),'NOT_MEMBER');
 await fail(()=>rpc(2,'online_action',[r.id,r.instance,r.version,uuid(),'place',0]),'NOT_MEMBER');
 const original=r;
 await rpc(1,'online_join_room',['SALON ROSE','Lulu']);
 await fail(()=>rpc(2,'online_join_room',['Salon Rose','Spy']),'ROOM_FULL');
 const get=i=>rpc(i,'online_get_room',[r.id]);
 const action=async(i,kind,cell=null)=>{r=await get(i);return rpc(i,'online_action',[r.id,r.instance,r.version,uuid(),kind,cell]);};
 await action(0,'ready');await action(1,'ready');await action(0,'start');r=await get(0);
 await fail(()=>rpc(1,'online_action',[r.id,r.instance,r.version,uuid(),'place',0]),'NOT_YOUR_TURN');
 const moveId=uuid(), args=[r.id,r.instance,r.version,moveId,'place',0];
 const ack=await rpc(0,'online_action',args);
 assert.deepEqual(await rpc(0,'online_action',args),ack);
 await fail(()=>rpc(0,'online_action',[...args.slice(0,5),1]),'ACTION_REUSED');
 await fail(()=>rpc(0,'online_action',[r.id,r.instance,r.version,uuid(),'place',1]),'STALE_VERSION');
 for(const [i,cell] of [[1,3],[0,1],[1,4],[0,2]])await action(i,'place',cell);
 r=await get(0);assert.equal(r.status,'finished');assert.equal(r.winner,1);assert.deepEqual(r.line,[0,1,2]);
 await action(0,'rematch');await action(0,'ready');await action(1,'ready');await action(0,'start');
 r=await get(0);const oldTopic=r.topic,oldInstance=r.instance;
 const leaveArgs=[r.id,r.instance,r.version,uuid(),'leave',null];
 await rpc(0,'online_action',leaveArgs);
 r=await get(1);assert.equal(r.status,'waiting');assert.equal(r.host,true);assert.equal(r.members.length,1);
 assert.notEqual(r.instance,oldInstance);assert.notEqual(r.topic,oldTopic);assert.deepEqual(r.board,[0,0,0,0,0,0,0,0,0]);assert.equal(r.members[0].ready,false);
 assert.equal(await rpc(0,'online_can_receive',[r.topic]),false);assert.equal(await rpc(1,'online_can_receive',[oldTopic]),false);
 assert.equal(await rpc(1,'online_can_receive',[r.topic]),true);
 const sent=(await db.query('select * from realtime.sent where topic=$1 order by ctid desc limit 1',[oldTopic])).rows[0];
 assert.equal(sent.private,true);assert.deepEqual(Object.keys(sent.payload).sort(),['instance','version']);
 assert.equal(sent.payload.version,r.version);
 const afterLeave=r.version;
 await rpc(0,'online_action',leaveArgs);assert.equal((await get(1)).version,afterLeave);
 await fail(()=>rpc(0,'online_action',args),'NOT_MEMBER');
 // A new player takes the free seat; the remaining player can host a working match.
 await rpc(2,'online_join_room',['Salon Rose','New']);
 await action(1,'ready');await action(2,'ready');await action(1,'start');r=await get(1);
 assert.equal(r.status,'playing');assert.equal(r.members.length,2);
 const seatOne=r.members.find(m=>m.seat===1);assert.equal(seatOne.name,'New');
 // Draw reducer and old-instance protection.
 await fail(()=>rpc(2,'online_action',[r.id,oldInstance,r.version,uuid(),'place',0]),'STALE_VERSION');
 for(const [i,c] of [[2,0],[1,1],[2,2],[1,4],[2,3],[1,5],[2,7],[1,6],[2,8]])await action(i,'place',c);
 r=await get(1);assert.equal(r.status,'finished');assert.equal(r.winner,0);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(()=>db.query('select * from app_private.rooms'),/permission denied/);
  await assert.rejects(()=>db.query('select app_private.snapshot($1)',[r.id]),/permission denied/);
  await db.exec('reset role');
 }
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 await db.exec('set role anon');await assert.rejects(()=>db.query('select public.online_list_rooms()'),/permission denied/);await db.exec('reset role');
 console.log('PASS SQL compile/repeat, roles, membership, name normalization, capacity, turn, winner/draw, receipt replay, stale instance, leave old-topic hint + rotation, waiting reset and replacement restart');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
