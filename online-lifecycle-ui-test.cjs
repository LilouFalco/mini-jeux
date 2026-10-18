// Guarded mock-transport browser tests for the room lifecycle client. No Supabase, no real users.
const G=require('./test-guard.cjs'),pw=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function makeServer(game){
 const S={rooms:new Map(),calls:[],failDepart:false,delay:0,pages:[],terminatedIds:new Set()};
 const size=game==='puissance4'?42:9;
 const snap=(r,uid)=>{const m=r.members.find(x=>x.uid===uid);return {id:r.id,name:r.name,instance:'i1',version:r.version,seat:m.seat,host:m.host,status:'waiting',topic:'mini:'+r.id+':0',
  members:r.members.map(x=>({seat:x.seat,name:x.name,host:x.host,ready:false})),board:Array(size).fill(0),line:[],turn:1,winner:0};};
 S.terminate=(r,who,reason)=>{S.terminatedIds.add(r.id);r.dead={terminated:true,id:r.id,name:who,reason};S.rooms.delete(r.name);
  for(const p of S.pages)p.evaluate(m=>window.__notify?.(m),{topic:'mini:'+r.id+':0',event:'terminated',payload:{terminated:true,id:r.id,name:'FAKE-PAYLOAD',reason:'host_left',board:[9]}}).catch(()=>{});};
 S.rpc=async(uid,name,a)=>{
  S.calls.push({uid,name});
  if(S.delay&&/status|heartbeat|list|mine/.test(name))await sleep(S.delay);
  const byId=()=>[...S.rooms.values()].find(r=>r.id===a.p_room)||null;
  switch(name){
   case 'online_create_room':case 'online_create_room_game':{const r={id:'00000000-0000-4000-8000-'+String(S.rooms.size+1+S.terminatedIds.size).padStart(12,'0'),name:a.p_name,version:1,members:[{uid,seat:1,host:true,name:a.p_pseudo}]};S.rooms.set(r.name,r);return {data:snap(r,uid)};}
   case 'online_join_room':case 'online_join_room_game':{const r=S.rooms.get(a.p_name);if(!r)return {error:{message:'ROOM_NOT_FOUND'}};if(!r.members.find(m=>m.uid===uid))r.members.push({uid,seat:2,host:false,name:a.p_pseudo});r.version++;return {data:snap(r,uid)};}
   case 'online_list_rooms':case 'online_list_rooms_game':return {data:[...S.rooms.values()].map(r=>({name:r.name,host:r.members[0].name,count:r.members.length,capacity:2,status:'waiting',game}))};
   case 'online_my_rooms':case 'online_my_rooms_game':return {data:[...S.rooms.values()].filter(r=>r.members.find(m=>m.uid===uid)).map(r=>({id:r.id,name:r.name,game}))};
   case 'online_get_room':return {error:{message:'FORBIDDEN_GET_ROOM'}};
   case 'online_room_status':case 'online_heartbeat':{const r=byId();if(!r){const d=[...S.terminatedIds].includes(a.p_room);return {data:{terminated:true,id:a.p_room,name:S.lastWho||'Lulu',reason:'player_left'}};}return {data:snap(r,uid)};}
   case 'online_depart_room':{if(S.failDepart)return {error:{message:'network',code:'08006'}};const r=byId();if(r){S.who=r.members.find(m=>m.uid===uid).name;S.lastWho=S.who;S.terminate(r,S.who,'player_left');}return {data:{terminated:true,id:a.p_room}};}
  }
  return {error:{message:'UNKNOWN '+name}};
 };
 return S;
}
async function newPage(browser,S,uid,game,clock){
 const c=await G.newContext(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.on('dialog',d=>d.accept());
 S.pages.push(p);
 await p.exposeFunction('__rpc',(n,a)=>S.rpc(uid,n,a));
 await p.exposeFunction('__log',m=>(S.log=S.log||[]).push(m));
 if(clock)await p.clock.install();
 await p.addInitScript(()=>{
  Object.defineProperty(document,'visibilityState',{get:()=>window.__hidden?'hidden':'visible',configurable:true});
  const channels=new Set();
  const c={realtime:{setAuth:async()=>{}},removeChannel:async ch=>channels.delete(ch),
   channel:(topic,cfg)=>{const ch={topic,cfg,hs:[],tracked:null,on:(t,f,fn)=>{ch.hs.push([t,f,fn]);return ch;},track:async x=>{ch.tracked=x;window.__tracked=x;},subscribe:fn=>{channels.add(ch);queueMicrotask(()=>fn('SUBSCRIBED'));return ch;}};window.__ch=ch;return ch;}};
  window.__notify=m=>{for(const ch of channels)if(ch.topic===m.topic)for(const [t,f,fn] of ch.hs)if(t==='broadcast'&&f.event===m.event)fn({payload:m.payload});};
  window.__presenceLeave=key=>{for(const ch of channels)for(const [t,f,fn] of ch.hs)if(t==='presence'&&f.event==='leave')fn({key});};
  window.MiniOnline={client:async()=>c,rpc:async(n,a)=>{const r=await window.__rpc(n,a);if(r.error)throw r.error;return r.data;},friendly:e=>e.message};
 });
 await p.goto(BASE+game+'.html');await p.waitForSelector('#online-toggle');
 return p;
}
async function enter(p,pseudo,room,create){
 await p.locator('#online-toggle').click();await p.waitForSelector('#online-pseudo');
 await p.locator('#online-pseudo').fill(pseudo);await p.locator('#online-room-name').fill(room);
 await p.getByRole('button',{name:create?'Créer':'Rejoindre',exact:true}).click();await p.waitForSelector('.online-members');
}
const status=p=>p.locator('#online-status').textContent();
(async()=>{
 for(const [engine,type]of [['chromium',pw.chromium],['webkit',pw.webkit]]){
  const browser=await G.launch(type,engine);
  for(const game of ['morpion','puissance4']){
   const tag=engine+' '+game;
   const S=makeServer(game);
   const a=await newPage(browser,S,'ua',game),b=await newPage(browser,S,'ub',game);
   await enter(a,'Rose','Salon',true);await enter(b,'Lulu','Salon',false);
   await a.waitForFunction(()=>document.querySelectorAll('.online-members span').length===2);
   assert.equal((await a.evaluate(()=>window.__tracked)).seat,1,tag+' presence payload own seat');
   // presence fake leave: no depart, status checked instead
   const before=S.calls.length;
   await a.evaluate(()=>window.__presenceLeave('seat2'));await sleep(300);
   const after=S.calls.slice(before).map(c=>c.name);
   assert.ok(!after.includes('online_depart_room'),tag+' presence must not depart');assert.ok(after.includes('online_heartbeat'),tag+' presence checks authority');
   await a.evaluate(()=>window.__presenceLeave('seat1'));await sleep(100);
   // failed depart stays
   S.failDepart=true;await b.getByRole('button',{name:'Quitter le salon'}).click();await sleep(300);
   assert.equal(await b.locator('.online-members span').count(),2,tag+' failed depart stays');
   // failed Accueil stays, success navigates
   await b.locator('[data-home-link]').first().click();await sleep(300);
   assert.ok(b.url().includes(game+'.html'),tag+' failed home stays');
   assert.ok((await status(b)).length>0);
   S.failDepart=false;
   const nav=b.waitForURL(u=>!u.pathname.endsWith(game+'.html'),{timeout:5000});
   await b.locator('[data-home-link]').first().click();await nav;
   assert.ok(S.terminatedIds.size===1,tag+' accueil departed');
   // A receives terminated broadcast with fake payload: must fetch authoritative status
   await a.waitForSelector('#online-pseudo');await a.waitForFunction(()=>document.querySelector('#online-status').textContent==='Lulu a quitté le salon.');
   await sleep(500);assert.equal(await status(a),'Lulu a quitté le salon.',tag+' stable message');
   assert.equal(S.calls.filter(c=>c.name==='online_get_room').length,0,tag+' no get_room');
   // in-flight race: slow status while terminated arrives, then lobby refresh also slow
   const a2=a,c2=await newPage(browser,S,'uc',game);
   await enter(a2,'Rose','Salon2',true);await enter(c2,'Pia','Salon2',false);
   S.delay=400;
   const hb=a2.evaluate(()=>document.querySelector('#online-root button')&&true);
   await a2.getByRole('button',{name:'Actualiser'}).first().click().catch(()=>{});
   await c2.getByRole('button',{name:'Quitter le salon'}).click();
   await a2.waitForSelector('#online-pseudo',{timeout:8000});
   await a2.waitForFunction(()=>document.querySelector('#online-status').textContent.endsWith('a quitté le salon.'),null,{timeout:8000});
   S.delay=0;
   assert.equal(a2.errors.length,0,tag+' no page errors '+a2.errors);
   // still usable after
   await a2.locator('#online-room-name').fill('Salon3');await a2.getByRole('button',{name:'Créer',exact:true}).click();await a2.waitForSelector('.online-members');
   assert.equal(await a2.locator('#online-root button').first().isEnabled(),true,tag+' no deadlock');
   for(const p of [a,b,c2,a2])assert.equal(p.errors.length,0,tag+' errors '+p.errors);
   // heartbeat not paused when hidden
   const S2=makeServer(game);const h=await newPage(browser,S2,'ua',game,true);
   await enter(h,'Rose','Horloge',true);await h.evaluate(()=>{window.__hidden=true;});
   const n0=S2.calls.filter(c=>c.name==='online_heartbeat').length;
   for(let i=0;i<3;i++){await h.clock.runFor(10100);await sleep(50);}
   const n1=S2.calls.filter(c=>c.name==='online_heartbeat').length;
   assert.ok(n1-n0>=3,tag+' heartbeat while hidden '+(n1-n0));
   console.log('PASS',tag);
  }
  await browser.close();
 }
 console.log('guard violations',JSON.stringify(G.violations?.length??0));
})().catch(e=>{console.error(e);process.exit(1)});
