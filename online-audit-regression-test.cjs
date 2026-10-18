'use strict';
// Native PostgreSQL16, Unix socket only; external network blocked by existing guard.
// Auth and Realtime are local stubs, not live Supabase.
const guard=require('./test-guard.cjs');
const {Client}=require('/tmp/onlineqa/node_modules/pg');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sql7-regress-')),bin='/usr/lib/postgresql/16/bin/';
const port=49173,data=path.join(root,'data');let db,started=false;
(async()=>{
 execFileSync(bin+'initdb',['-D',data,'-A','trust','--no-locale','--encoding=UTF8'],{stdio:'pipe'});
 execFileSync(bin+'pg_ctl',['-D',data,'-l',path.join(root,'log'),'-o',"-c listen_addresses='' -k "+root+' -p '+port,'-w','start'],{stdio:'pipe'});started=true;
 db=new Client({host:root,port,user:os.userInfo().username,database:'postgres'});await db.connect();
 await db.query(`create role anon;create role authenticated;create schema auth;create schema realtime;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table realtime.messages(extension text);alter table realtime.messages enable row level security;
 create table realtime.sent(payload jsonb,event text,topic text,private boolean);
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(p jsonb,e text,t text,b boolean) returns void language sql as $$insert into realtime.sent values(p,e,t,b)$$;`);
 for(const f of ['001-online.sql','002-online-puissance4.sql','002-online-puissance4.sql'])await db.query(fs.readFileSync(path.join(__dirname,'sql',f),'utf8'));
 const ids=Array.from({length:12},()=>randomUUID());for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
 const rpc=async(i,name,args=[])=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);
  await db.query('set role authenticated');
  try{return(await db.query('select public.'+name+'('+args.map((_,j)=>'$'+(j+1)).join(',')+') value',args)).rows[0].value}
  finally{await db.query('reset role')}
 };
 let r;
 const get=async(i=0)=>r=await rpc(i,'online_get_room',[r.id]);
 const setup=async(game,n)=>{
  await db.query('delete from app_private.rooms;delete from app_private.rate_limits');
  r=await rpc(0,'online_create_room_game',[game,'Audit regression','A',randomUUID()]);
  for(let i=1;i<n;i++)await rpc(i,'online_join_room_game',[game,r.name,'P'+i]);
 };
 const act=async(i,k,d={},game='hidden')=>{await get(i);return rpc(i,'online_'+game+'_action',[r.id,r.instance,r.version,randomUUID(),k,d])};
 const ready=async(n,game='hidden')=>{for(let i=0;i<n;i++)await act(i,'ready',{},game)};
 const fail=(fn,msg)=>assert.rejects(fn,e=>e.message.includes(msg));
 // Query shape prevents ProjectSet-before-sort, repeated real games prove variable seats.
 const source=fs.readFileSync(path.join(__dirname,'sql/sources/002-hidden.sql'),'utf8');
 assert.match(source,/select x from unnest\(seats\) as t\(x\) order by random\(\)/);
 for(const n of [3,9]){
  const positions=new Set();
  for(let trial=0;trial<24;trial++){
   await setup('undercover',n);await ready(n);await act(0,'start');
   const bad=[];for(let i=0;i<n;i++){await get(i);if(r.hidden.own.role==='undercover'){bad.push(r.seat);positions.add(r.seat)}}
   assert.equal(bad.length,n>=9?2:1);
  }
  assert.ok(positions.size>1,'impostor seats must vary');console.log('PASS Undercover native randomized positions',n,[...positions].sort((a,b)=>a-b));
 }
 // Only public snapshots used to choose scoring targets, no submitted UUID keys.
 await setup('petitbac',2);await ready(2,'petitbac');await act(0,'start',{},'petitbac');await act(1,'stop',{},'petitbac');await get();
 assert.deepEqual(r.petitbac.answers,{});assert.ok(r.members.every(m=>!('uid' in m)));
 await fail(()=>act(0,'mark',{seat:99,category:'prenom',points:0},'petitbac'),'INVALID_MARK');
 await fail(()=>act(0,'mark',{seat:null,category:'prenom',points:0},'petitbac'),'INVALID_MARK');
 const members=r.members,categories=r.petitbac.categories;
 for(const m of members)for(const category of categories)await act(0,'mark',{seat:m.seat,category,points:0},'petitbac');
 await act(0,'finish',{},'petitbac');await get();assert.equal(r.status,'finished');
 assert.equal(Object.keys(r.petitbac.marks).length,2);
 assert.ok(Object.values(r.petitbac.marks).every(m=>Object.values(m).every(p=>p===0)));
 await act(0,'next',{},'petitbac');await get();assert.equal(r.petitbac.phase,'waiting');
 console.log('PASS Petit Bac native zero submissions, seat scoring both players, finish and next');
 // Odd lobbies explicitly cannot start, min four and max twelve unchanged.
 for(const n of [5,7]){
  await setup('timesup',n);await ready(n);await get();const version=r.version;
  await fail(()=>act(0,'start'),'EVEN_PLAYERS_REQUIRED');await get();assert.equal(r.status,'waiting');assert.equal(r.version,version);
 }
 console.log('PASS Time’s Up native odd 5/7 lobbies rejected without mutation');
 for(const n of [4,6,12]){
  await setup('timesup',n);await ready(n);await act(0,'start');
  // Sequential even lobby wrap always alternates parity teams.
  for(let j=0;j<n+2;j++){await get();const previous=r.turn;await act(previous-1,'begin');await act(previous-1,'end');await get();assert.notEqual((r.turn-1)%2,(previous-1)%2)}
  console.log('PASS Time’s Up native alternating teams incl wrap',n);
 }
 await setup('timesup',4);await ready(4);await act(0,'start');
 for(let round=0;round<3;round++){
  await get();const previous=r.turn;assert.equal(r.hidden.round,round);
  await act(previous-1,'begin');
  for(let j=0;j<16;j++)await act(previous-1,'found');
  await get();
  if(round<2){assert.equal(r.hidden.round,round+1);assert.equal(r.hidden.phase,'ready');assert.equal(r.turn,previous+1);assert.notEqual((previous-1)%2,(r.turn-1)%2);assert.equal(r.hidden.deadline,null)}
  else{assert.equal(r.status,'finished');assert.equal(r.hidden.phase,'finished')}
 }
 assert.equal(Object.values(r.hidden.scores).reduce((a,b)=>a+b,0),48);
 console.log('PASS Time’s Up native complete decks advance opposing team, all three rounds and 48 points');
 guard.assertClean('native SQL audit regressions');console.log('PASS native PostgreSQL16 targeted four audit fixes, no external network');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 if(db)await db.end().catch(()=>{});
 if(started)execFileSync(bin+'pg_ctl',['-D',data,'-m','immediate','-w','stop'],{stdio:'pipe'});
 fs.rmSync(root,{recursive:true,force:true});
});
