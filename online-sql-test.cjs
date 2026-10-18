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
 const _unused=0;const fail=async(fn,code)=>{await assert.rejects(fn,e=>String(e.message).includes(code));};
 // Upgrade in place: a morpion match started on 001 survives the 002 migration.
 let r;
 {
  const g=uuid();let u=await rpc(3,'online_create_room',['Avant migration','Old',g]);
  await rpc(4,'online_join_room',['Avant migration','Old2']);
  const act=async(i,kind,cell=null)=>{u=await rpc(i,'online_get_room',[u.id]);return rpc(i,'online_action',[u.id,u.instance,u.version,uuid(),kind,cell]);};
  await act(3,'ready');await act(4,'ready');await act(3,'start');await act(3,'place',0);
  await fail(()=>rpc(3,'online_create_room_game',['puissance4','Trop tot','X',uuid()]),'does not exist');
  await db.exec(sql2);await db.exec(sql2);
  await act(4,'place',3);await act(3,'place',1);await act(4,'place',4);await act(3,'place',2);
  u=await rpc(3,'online_get_room',[u.id]);assert.equal(u.status,'finished');assert.equal(u.winner,1);assert.equal(u.board.length,9);
  await act(3,'leave');await act(4,'leave');
 }
 const key=uuid();
 r=await rpc(0,'online_create_room',['  Salon   Rose  ','<b>Lilou</b>',key]);
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
 // Creation identity is immutable even after the organizer changes.
 const creator=(await db.query('select creator_uid,host_uid from app_private.rooms where id=$1',[r.id])).rows[0];
 assert.equal(creator.creator_uid,ids[0]);assert.equal(creator.host_uid,ids[1]);
 await fail(()=>rpc(0,'online_create_room',['Salon Rose','<b>Lilou</b>',key]),'NOT_MEMBER');
 await rpc(1,'online_heartbeat',[r.id]);
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

 // ---- Puissance 4 (002) ----
 const P4=require(__dirname+'/puissance4-engine.js');
 await db.exec('delete from app_private.rate_limits');
 const resetRate=()=>db.exec('delete from app_private.rate_limits');
 let q=await rpc(5,'online_create_room_game',['puissance4','  Quatre   Rose ','Pia',uuid()]);
 assert.equal(q.game,'puissance4');assert.equal(q.board.length,42);assert.ok(q.board.every(v=>v===0));assert.equal(q.name,'Quatre Rose');
 const pk=uuid();
 await fail(()=>rpc(5,'online_create_room_game',['chess','Autre jeu','Pia',uuid()]),'INVALID_ACTION');
 await fail(()=>rpc(5,'online_create_room_game',['naval','Autre jeu','Pia',uuid()]),'INVALID_ACTION');
 await fail(()=>rpc(5,'online_create_room_game',[null,'Autre jeu','Pia',uuid()]),'INVALID_ACTION');
 {const k2=uuid();const a=await rpc(5,'online_create_room_game',['puissance4','Idem salon','Pia',k2]);
  assert.equal((await rpc(5,'online_create_room_game',['puissance4','Idem salon','Pia',k2])).id,a.id);
  await fail(()=>rpc(5,'online_create_room_game',['morpion','Idem salon','Pia',k2]),'ACTION_REUSED');
  await fail(()=>rpc(5,'online_create_room',['Idem salon','Pia',k2]),'ACTION_REUSED');
  await rpc(5,'online_action',[a.id,a.instance,a.version,uuid(),'leave',null]);await resetRate();}
 // Morpion RPCs never see or enter a puissance4 room, and the reverse.
 await fail(()=>rpc(6,'online_join_room',['quatre rose','Spy']),'ROOM_NOT_FOUND');
 await fail(()=>rpc(6,'online_join_room_game',['morpion','Quatre Rose','Spy']),'ROOM_NOT_FOUND');
 await fail(()=>rpc(6,'online_get_room',[q.id]),'NOT_MEMBER');
 assert.equal((await rpc(6,'online_list_rooms',[0])).filter(x=>x.name==='Quatre Rose').length,0);
 assert.equal((await rpc(6,'online_list_rooms_game',['puissance4',0])).filter(x=>x.name==='Quatre Rose').length,1);
 assert.equal((await rpc(5,'online_my_rooms')).filter(x=>x.name==='Quatre Rose').length,0);
 assert.equal((await rpc(5,'online_my_rooms_game',['puissance4'])).filter(x=>x.name==='Quatre Rose'&&x.game==='puissance4').length,1);
 assert.equal((await rpc(5,'online_my_rooms_game',['morpion'])).length,0);
 await fail(()=>rpc(6,'online_list_rooms_game',['puissance4',-1]),'INVALID_PAGE');
 await rpc(6,'online_join_room_game',['puissance4','QUATRE ROSE','Quentin']);
 await fail(()=>rpc(2,'online_join_room_game',['puissance4','Quatre Rose','Spy']),'ROOM_FULL');
 await fail(()=>rpc(2,'online_action',[q.id,q.instance,q.version,uuid(),'place',0]),'NOT_MEMBER');
 const pget=i=>rpc(i,'online_get_room',[q.id]);
 const pact=async(i,kind,cell=null)=>{q=await pget(i);return rpc(i,'online_action',[q.id,q.instance,q.version,uuid(),kind,cell]);};
 const startP=async()=>{await pact(5,'ready');await pact(6,'ready');await pact(5,'start');q=await pget(5);};
 await startP();assert.equal(q.status,'playing');
 const seatU={1:5,2:6};
 await fail(()=>rpc(6,'online_action',[q.id,q.instance,q.version,uuid(),'place',0]),'NOT_YOUR_TURN');
 await fail(()=>rpc(5,'online_action',[q.id,q.instance,q.version,uuid(),'place',7]),'INVALID_ACTION');
 await fail(()=>rpc(5,'online_action',[q.id,q.instance,q.version,uuid(),'place',-1]),'INVALID_ACTION');
 await fail(()=>rpc(5,'online_action',[q.id,q.instance,q.version,uuid(),'place',null]),'INVALID_ACTION');
 // Gravity, receipts, stale protection.
 const gArgs=[q.id,q.instance,q.version,uuid(),'place',3];
 const gAck=await rpc(5,'online_action',gArgs);
 assert.deepEqual(await rpc(5,'online_action',gArgs),gAck);
 await fail(()=>rpc(5,'online_action',[...gArgs.slice(0,5),4]),'ACTION_REUSED');
 await fail(()=>rpc(6,'online_action',[q.id,q.instance,q.version,uuid(),'place',3]),'STALE_VERSION');
 q=await pget(6);assert.equal(q.board[38],1);assert.equal(q.turn,2);assert.equal(q.board.filter(Boolean).length,1);
 await pact(6,'place',3);q=await pget(5);assert.equal(q.board[31],2);assert.equal(q.board[38],1);
 // Full column denial: fill column 0 without any four.
 for(const i of [5,6,5,6,5,6].slice(0,0));
 await pact(5,'place',0);await pact(6,'place',0);await pact(5,'place',0);await pact(6,'place',0);
 q=await pget(5);assert.equal(q.status,'playing');
 await pact(5,'place',1);await pact(6,'place',0);await pact(5,'place',1);await pact(6,'place',0);
 q=await pget(5);assert.equal(q.board[0],2,'column 0 full');assert.equal(q.status,'playing');
 await fail(()=>pact(5,'place',0),'COLUMN_FULL');
 await pact(5,'leave');await resetRate();
 // Differential test against the offline engine: random full games incl. all lines, draws.
 let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const names=['Diff Un','Diff Deux'];
 const play=async(moves)=>{
  const name=names[0]+rnd();
  await resetRate();
  let room=await rpc(5,'online_create_room_game',['puissance4','Diff '+Math.floor(rnd()*1e9),'A',uuid()]);
  await rpc(6,'online_join_room_game',['puissance4',room.name,'B']);
  const act=async(i,kind,cell=null)=>{const s=await rpc(i,'online_get_room',[room.id]);return rpc(i,'online_action',[s.id,s.instance,s.version,uuid(),kind,cell]);};
  await act(5,'ready');await act(6,'ready');await act(5,'start');
  const board=P4.empty();let turn=1,res=null;
  for(const c of moves){
   await resetRate();
   await act(seatU[turn],'place',c);
   const r0=P4.drop(board,c);board[r0*7+c]=turn;
   const w=P4.winner(board),full=P4.full(board);
   const s=await rpc(5,'online_get_room',[room.id]);
   assert.deepEqual(s.board,board);
   if(w){assert.equal(s.status,'finished');assert.equal(s.winner,w.p);assert.deepEqual([...s.line].sort((x,y)=>x-y),[...w.line].sort((x,y)=>x-y));res='win'+w.p;break;}
   if(full){assert.equal(s.status,'finished');assert.equal(s.winner,0);assert.deepEqual(s.line,[]);res='draw';break;}
   assert.equal(s.status,'playing');assert.equal(s.turn,3-turn);turn=3-turn;
  }
  // finished rooms refuse further play and can be replayed after rematch
  if(res){const s=await rpc(5,'online_get_room',[room.id]);
   await fail(()=>rpc(seatU[s.turn]||5,'online_action',[s.id,s.instance,s.version,uuid(),'place',0]),'WRONG_PHASE');
   const oldInst=s.instance;await act(5,'rematch');const n=await rpc(5,'online_get_room',[room.id]);
   assert.equal(n.status,'waiting');assert.ok(n.board.every(v=>v===0));assert.equal(n.board.length,42);assert.notEqual(n.instance,oldInst);
   await fail(()=>rpc(5,'online_action',[s.id,oldInst,n.version,uuid(),'ready',null]),'STALE_VERSION');}
  await act(5,'leave');await act(6,'leave');
  return res;
 };
 const results={};
 // Random games, seeded.
 for(let g=0;g<40;g++){
  const b=P4.empty();let t=1;const moves=[];
  while(true){const mv=[0,1,2,3,4,5,6].filter(c=>P4.drop(b,c)>=0);const c=mv[Math.floor(rnd()*mv.length)];moves.push(c);b[P4.drop(b,c)*7+c]=t;if(P4.winner(b)||P4.full(b))break;t=3-t;}
  const res=await play(moves);results[res]=(results[res]||0)+1;
 }
 // Targeted lines: vertical, horizontal, both diagonals, and a drawn board found by search.
 const sc={vertical:[0,1,0,1,0,1,0],horizontal:[0,0,1,1,2,2,3],diagA:[0,1,1,2,2,3,2,3,3,6,3],diagB:[3,2,2,1,1,0,1,0,0,6,0]};
 for(const [k,mv] of Object.entries(sc)){const b=P4.empty();let t=1,end=null;for(const c of mv){b[P4.drop(b,c)*7+c]=t;if(P4.winner(b)){end=P4.winner(b);break}t=3-t}
  assert.ok(end,k+' scripted line wins in engine');const res=await play(mv.slice(0,mv.indexOf(mv[mv.length-1])>=0?mv.length:mv.length));assert.ok(/^win/.test(res),k);results[k]=res;}
 let drawMoves=null;
 for(let tries=0;tries<200000&&!drawMoves;tries++){
  const b=P4.empty();let t=1;const moves=[];
  while(true){const mv=[0,1,2,3,4,5,6].filter(c=>P4.drop(b,c)>=0);
   // bias toward alternating columns to avoid early wins
   const c=mv[Math.floor(rnd()*mv.length)];const w0=P4.drop(b,c);b[w0*7+c]=t;moves.push(c);
   if(P4.winner(b))break;if(P4.full(b)){drawMoves=moves;break}t=3-t;}
 }
 assert.ok(drawMoves,'found a drawn game');
 assert.equal(await play(drawMoves),'draw');results.drawScript='draw';
 assert.ok(results.win1>0&&results.win2>0,'both seats win somewhere '+JSON.stringify(results));
 // Leave resets to an empty 42 board and rotates topic; old topic hint is minimal.
 {await resetRate();let room=await rpc(5,'online_create_room_game',['puissance4','Depart P4','A',uuid()]);
  await rpc(6,'online_join_room_game',['puissance4','Depart P4','B']);
  const act=async(i,kind,cell=null)=>{const s=await rpc(i,'online_get_room',[room.id]);return rpc(i,'online_action',[s.id,s.instance,s.version,uuid(),kind,cell]);};
  await act(5,'ready');await act(6,'ready');await act(5,'start');await act(5,'place',2);
  const before=await rpc(5,'online_get_room',[room.id]);await act(5,'leave');
  const after=await rpc(6,'online_get_room',[room.id]);
  assert.equal(after.status,'waiting');assert.equal(after.board.length,42);assert.ok(after.board.every(v=>v===0));assert.equal(after.host,true);
  assert.notEqual(after.topic,before.topic);assert.equal(await rpc(5,'online_can_receive',[after.topic]),false);
  const sent=(await db.query('select payload from realtime.sent where topic=$1 order by ctid desc limit 1',[before.topic])).rows[0];
  assert.deepEqual(Object.keys(sent.payload).sort(),['instance','version']);
  await act(6,'leave');}
 // Directly forged boards of the wrong shape are rejected by the schema.
 await assert.rejects(()=>db.query("insert into app_private.rooms(game,name,lookup_name,host_uid,creator_uid,create_key,board) values('puissance4','Faux','faux',$1,$1,gen_random_uuid(),array[0,0,0])",[ids[0]]),/rooms_board_shape/);
 console.log('PASS puissance4 SQL semantics',JSON.stringify(results));
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(()=>db.query('select * from app_private.rooms'),/permission denied/);
  await assert.rejects(()=>db.query('select app_private.snapshot($1)',[r.id]),/permission denied/);
  await assert.rejects(()=>db.query('select app_private.create_room($1,$2,gen_random_uuid(),$3)',['abc','d','puissance4']),/permission denied/);await assert.rejects(()=>db.query('select app_private.my_rooms($1)',['morpion']),/permission denied/);await db.exec('reset role');
 }
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 await db.exec('set role anon');await assert.rejects(()=>db.query('select public.online_list_rooms()'),/permission denied/);await assert.rejects(()=>db.query("select public.online_list_rooms_game('puissance4')"),/permission denied/);await assert.rejects(()=>db.query("select public.online_create_room_game('puissance4','abc','d',gen_random_uuid())"),/permission denied/);await db.exec('reset role');
 console.log('PASS SQL compile/repeat, roles, membership, name normalization, capacity, turn, winner/draw, receipt replay, stale instance, leave old-topic hint + rotation, waiting reset and replacement restart');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
