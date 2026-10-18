// Actual Supabase Auth, RPC, and private WebSockets. Explicit opt-in only.
const pw=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
if(process.env.ONLINE_LIVE!=='1')throw Error('Set ONLINE_LIVE=1 for separately authorized live execution');
const fs=require('node:fs'),path=require('node:path');
const sessionFiles=(process.env.ONLINE_SESSION_FILES||'').split(',').filter(Boolean);
assert.equal(sessionFiles.length,2,'ONLINE_SESSION_FILES requires two existing external storageState files; no new signups');
for(const file of sessionFiles){
 assert.ok(path.resolve(file).startsWith('/tmp/'),'sessions must be external /tmp files');
 const dir=path.dirname(path.resolve(file));assert.notEqual(dir,'/tmp','use a dedicated private session directory, not /tmp itself');
 assert.ok(fs.existsSync(dir),'missing saved session directory');fs.chmodSync(dir,0o700);
 assert.ok(fs.existsSync(file),'missing saved session; bootstrap separately');
 fs.chmodSync(file,0o600);
 const state=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.ok(state.origins?.some(o=>o.origin===new URL(BASE).origin&&o.localStorage?.some(x=>x.name==='mini-online-auth-v1')),'saved Auth session required for current BASE origin');
}
const report=[];
function shape(value){if(value===null)return 'null';if(Array.isArray(value))return ['array',...value.map(shape)];if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,shape(v)]));return typeof value;}
async function rpc(p,name,args={}) {return p.evaluate(async({name,args})=>{const c=await MiniOnline.client();const {data,error}=await c.rpc(name,args);return {data,error:error&&{code:error.code,message:error.message}}},{name,args});}
async function snap(p,id){const r=await rpc(p,'online_get_room',{p_room:id});assert.equal(r.error,null);return r.data;}
async function current(p){const r=await rpc(p,'online_my_rooms');assert.equal(r.error,null);assert.equal(r.data.length,1);return snap(p,r.data[0].id);}
async function act(p,s,kind,cell=null){return rpc(p,'online_action',{p_room:s.id,p_instance:s.instance,p_version:s.version,p_action:require('node:crypto').randomUUID(),p_kind:kind,p_cell:cell});}
(async()=>{
 for(const engine of ['chromium','webkit']){
 const browser=await pw[engine].launch(engine==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{}),contexts=[],pages=[],stats=[],errors=[];
 const room='TEST '+engine+' '+Date.now().toString(36);
 let roomId;
 try{
 for(let i=0;i<2;i++){
 const saved=sessionFiles[i];
 const c=await browser.newContext({...(require('node:fs').existsSync(saved)?{storageState:saved}:{}),viewport:i%2?{width:390,height:844}:{width:360,height:640},serviceWorkers:'block'});contexts.push(c);
 await c.route('**/auth/v1/signup',r=>r.abort('blockedbyclient'));
 await c.addInitScript(()=>{const orig=window.setInterval;window.setInterval=(fn,ms,...args)=>ms===20000?0:orig(fn,ms,...args);});
 const p=await c.newPage();
 p.on('response',async response=>{
  if(response.status()!==429||!response.url().includes('/auth/v1/'))return;
  const headers=await response.allHeaders();
  const metadata={observedAt:new Date().toISOString(),status:429,date:headers.date||null,retryAfter:headers['retry-after']||null};
  const file=path.join(path.dirname(saved),'auth429-metadata.json');
  fs.writeFileSync(file,JSON.stringify(metadata,null,2),{mode:0o600});fs.chmodSync(file,0o600);
 });
 pages.push(p);const st={changed:0,subscribed:0,rpc:0,heartbeat:0,payloadKeys:[],topics:[]};stats.push(st);
 p.on('pageerror',e=>errors.push(e.message));
 p.on('request',r=>{if(r.url().includes('/rest/v1/rpc/')){st.rpc++;if(r.url().endsWith('online_heartbeat'))st.heartbeat++;}});
 p.on('websocket',ws=>{ws.on('framereceived',f=>{try{
 let m;
 if(typeof f.payload==='string'){const raw=JSON.parse(f.payload);m=Array.isArray(raw)?{topic:raw[2],event:raw[3],payload:raw[4]}:raw;}
 else{const b=Buffer.from(f.payload);if(b[0]!==4)return;const r=b[1],i=b[2],a=b[3];m={topic:b.subarray(5,5+r).toString(),event:'broadcast',payload:{event:b.subarray(5+r,5+r+i).toString(),payload:JSON.parse(b.subarray(5+r+i+a).toString())}};}
 if(m.event==='broadcast'&&m.payload?.event==='changed'){if(!st.changed)console.log('first real socket changed',engine,i,JSON.stringify(shape(m.payload.payload)));st.changed++;const payload=m.payload.payload;st.payloadKeys.push(Object.keys(payload).sort().join(','));}
 if(m.event==='phx_reply'&&m.payload?.status==='ok'&&m.topic?.startsWith('realtime:mini:')){st.subscribed++;if(!st.topics.includes(m.topic))st.topics.push(m.topic);}
 }catch{}});});
 await p.goto(BASE+'morpion.html');await p.locator('#online-toggle').click();await p.waitForSelector('#online-pseudo',{timeout:20000});await p.waitForFunction(()=>document.querySelector('#online-status')?.textContent.includes('Choisis un nom'));
 fs.writeFileSync(saved,JSON.stringify(await c.storageState()),{mode:0o600});fs.chmodSync(saved,0o600);
 await p.locator('#online-pseudo').fill('TEST player '+(i+1));await p.locator('#online-room-name').fill(room);
 if(i===0){await p.getByRole('button',{name:'Créer',exact:true}).click();await p.waitForSelector('.online-members',{timeout:15000}).catch(async e=>{throw Error('enter player '+i+': '+await p.locator('#online-status').textContent());});if(!i)roomId=(await current(p)).id;}
 }
 assert.equal(pages.length,2,'exactly two authenticated browser pages');
 const [a,b]=pages,out=b;
 assert.equal((await snap(a,roomId)).members.length,1,'B must remain outside during access-control checks');
 assert.equal((await rpc(b,'online_my_rooms')).data.length,0,'B has not joined any test room');
 const deniedRead=await rpc(out,'online_get_room',{p_room:roomId});assert.match(deniedRead.error?.message||'',/NOT_MEMBER/);
 const s=await snap(a,roomId);const deniedAction=await act(out,s,'ready');assert.match(deniedAction.error?.message||'',/NOT_MEMBER/);
 const outsider=await out.evaluate(async topic=>{
 const c=await MiniOnline.client();await c.realtime.setAuth();window.__outsiderEvents=0;
 const status=await new Promise(resolve=>{const ch=c.channel(topic,{config:{private:true}}).on('broadcast',{event:'changed'},()=>window.__outsiderEvents++);window.__outsiderChannel=ch;ch.subscribe((s,e)=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(s))resolve({status:s,reason:e?.message||''});});});
 return status;
 },s.topic);assert.equal(outsider.status,'CHANNEL_ERROR','outsider private subscription rejected');
 // A current member may read private notifications, but must not publish them.
 const forged=await a.evaluate(async topic=>{
 const c=await MiniOnline.client();
 const ch=c.channel(topic+'',{config:{private:true,broadcast:{ack:true}}});
 const status=await new Promise(resolve=>ch.subscribe((s,e)=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(s))resolve({status:s,reason:e?.message||''});}));
 if(status.status!=='SUBSCRIBED'){await c.removeChannel(ch);return {join:status.status};}
 const result=await ch.send({type:'broadcast',event:'forged_test',payload:{test:true}});
 await c.removeChannel(ch);return {join:status.status,result};
 },s.topic);
 assert.equal(forged.join,'SUBSCRIBED');assert.notEqual(forged.result,'ok','member forged publication denied');
 const publicChannel=await out.evaluate(async()=>{
 const c=await MiniOnline.client(),ch=c.channel('TEST-public-'+crypto.randomUUID(),{config:{private:false}});
 const result=await new Promise(resolve=>ch.subscribe((s,e)=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(s))resolve({status:s,reason:e?.message||''});}));
 await c.removeChannel(ch);return result;
 });
 assert.equal(publicChannel.status,'CHANNEL_ERROR','public channels disabled');
 const noToken=await out.evaluate(async()=>{
 const c=MINI_ONLINE_CONFIG;
 const r=await fetch(c.url+'/rest/v1/rpc/online_my_rooms',{method:'POST',headers:{apikey:c.key,'Content-Type':'application/json'},body:'{}'});
 const j=await r.json();return {status:r.status,code:j.code,message:j.message};
 });assert.ok(noToken.status>=400);assert.match(noToken.message,/permission denied|JWT|authentication/i);
 const writes=await out.evaluate(async()=>{
 const c=await MiniOnline.client(),session=(await c.auth.getSession()).data.session,conf=MINI_ONLINE_CONFIG;
 const r=await fetch(conf.url+'/rest/v1/rooms',{method:'POST',headers:{apikey:conf.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json','Content-Profile':'app_private'},body:'{}'});const j=await r.json();return {status:r.status,code:j.code,message:j.message};
 });assert.ok(writes.status>=400);assert.match(writes.message,/schema|permission/i);
 assert.equal(await b.evaluate(()=>window.__outsiderEvents),0,'nonmember received no events before joining');
 await b.evaluate(async()=>{const c=await MiniOnline.client();if(window.__outsiderChannel)await c.removeChannel(window.__outsiderChannel);});
 await b.getByRole('button',{name:'Rejoindre',exact:true}).click();await b.waitForSelector('.online-members');
 await a.waitForFunction(()=>document.querySelectorAll('.online-members span').length===2,null,{timeout:5000});
 for(let i=0;i<2;i++){await pages[i].waitForFunction(async()=>{const c=await MiniOnline.client();return c.getChannels().some(ch=>ch.state==='joined');},null,{timeout:15000});assert.ok(stats[i].subscribed>0,'real channel subscribed');}
 async function start(){
 await a.getByRole('button',{name:'Prête !',exact:true}).click();
 await b.waitForFunction(()=>[...document.querySelectorAll('.online-members span')].some(x=>x.textContent.includes('player 1')&&x.textContent.includes('✓')),null,{timeout:5000});
 await b.getByRole('button',{name:'Prête !',exact:true}).click();
 await a.getByRole('button',{name:'Démarrer',exact:true}).click();
 await Promise.all([a.waitForSelector('.online-board'),b.waitForSelector('.online-board')]);
 }
 const latencies=[];
 async function move(p,other,cell){
 const before=stats[pages.indexOf(other)].changed,t=Date.now();
 await p.locator('.online-board .mcell').nth(cell).click();
 await other.waitForFunction(cell=>!!document.querySelectorAll('.online-board .mcell')[cell]?.textContent,cell,{timeout:5000});
 latencies.push(Date.now()-t);assert.ok(stats[pages.indexOf(other)].changed>before,'update from real broadcast');
 }
 await start();const stale=await snap(a,roomId);
 for(const [p,o,cell]of [[a,b,0],[b,a,3],[a,b,1],[b,a,4],[a,b,2]])await move(p,o,cell);
 assert.equal((await snap(a,roomId)).winner,1);
 console.log('first game evidence',JSON.stringify({engine,moves:latencies.length,maxUpdateMs:Math.max(...latencies),clients:stats.slice(0,2).map(x=>({changed:x.changed,subscribed:x.subscribed,rpc:x.rpc,heartbeat:x.heartbeat}))}));
 const staleResult=await act(b,stale,'place',8);assert.match(staleResult.error?.message||'',/STALE_VERSION/);
 const uidBefore=await b.evaluate(async()=>((await (await MiniOnline.client()).auth.getUser()).data.user.id));
 await b.reload();await b.locator('#online-toggle').click();await b.getByRole('button',{name:'Reprendre · '+room,exact:true}).click();await b.waitForSelector('.online-board');
 assert.equal(await b.evaluate(async()=>((await (await MiniOnline.client()).auth.getUser()).data.user.id)),uidBefore);
 assert.equal((await snap(b,roomId)).seat,2);
 await a.getByRole('button',{name:'Proposer une revanche'}).click();await b.waitForSelector('.online-members',{timeout:5000});
 await start();
 for(const [i,cell]of [0,1,2,4,3,5,7,6,8].entries())await move(i%2?b:a,i%2?a:b,cell);
 const draw=await snap(a,roomId);assert.equal(draw.status,'finished');assert.equal(draw.winner,0);
 const oldTopic=draw.topic,oldChanged=stats[1].changed,t=Date.now();
 a.on('dialog',d=>d.accept());await a.getByRole('button',{name:'Quitter le salon'}).click();await a.waitForSelector('#online-pseudo');
 await b.waitForFunction(()=>document.querySelectorAll('.online-members span').length===1,null,{timeout:5000});
 const removedRead=await rpc(a,'online_get_room',{p_room:roomId});assert.match(removedRead.error?.message||'',/NOT_MEMBER/);
 const remaining=await snap(b,roomId);assert.notEqual(remaining.topic,oldTopic);assert.ok(stats[1].changed>oldChanged);
 await b.waitForFunction(()=>[...document.querySelectorAll('#online-root button')].some(x=>x.textContent==='Démarrer'),null,{timeout:5000});
 await a.locator('#online-room-name').fill(room);await a.getByRole('button',{name:'Rejoindre',exact:true}).click();await a.waitForSelector('.online-members');
 // New epoch must actually receive future ready notifications.
 const readyBefore=stats[1].changed;
 await a.getByRole('button',{name:'Prête !',exact:true}).click();
 await b.waitForFunction(()=>[...document.querySelectorAll('.online-members span')].some(x=>x.textContent.includes('player 1')&&x.textContent.includes('✓')),null,{timeout:5000});
 assert.ok(stats[1].changed>readyBefore);assert.ok(stats[1].topics.includes('realtime:'+remaining.topic));
 await b.waitForFunction(()=>[...document.querySelectorAll('.online-members span')].some(x=>x.textContent.includes('player 1')&&x.textContent.includes('✓')),null,{timeout:5000});
 await b.getByRole('button',{name:'Prête !',exact:true}).click();await b.getByRole('button',{name:'Démarrer',exact:true}).click();
 await a.waitForSelector('.online-board');assert.equal((await snap(b,roomId)).status,'playing');
 assert.deepEqual(errors,[]);
 for(const st of stats.slice(0,2)){assert.equal(st.heartbeat,0);assert.ok(st.payloadKeys.every(k=>k==='instance,version'),'unexpected notification keys: '+[...new Set(st.payloadKeys)].join(';'));}
 report.push({engine,viewports:['360x640','390x844'],win:true,draw:true,reloadSameIdentityAndSeat:true,stale:'STALE_VERSION',outsiderRead:'NOT_MEMBER',outsiderAction:'NOT_MEMBER',outsiderSubscribe:outsider.status,outsiderEvents:0,noToken:{status:noToken.status,code:noToken.code},directWrite:{status:writes.status,code:writes.code},forgedPublication:forged.result,publicChannel:publicChannel.status,epochRotation:true,epochContinuation:true,maxUpdateMs:Math.max(...latencies),updates:latencies.length,clients:stats.slice(0,2).map(x=>({changed:x.changed,subscribed:x.subscribed,rpc:x.rpc,heartbeat:x.heartbeat})),leaveMs:Date.now()-t});
 }finally{
 // Never use admin deletion. Leave every membership owned by these test guests.
 for(const p of pages){try{
 const cleaned=await p.evaluate(async()=>{
  // Raw stored-token RPC only. Never call MiniOnline.client() in cleanup.
  let session;try{session=JSON.parse(localStorage.getItem('mini-online-auth-v1')||'null');}catch{return {skipped:true};}
  if(!session?.access_token||!window.MINI_ONLINE_CONFIG)return {skipped:true};
  const conf=MINI_ONLINE_CONFIG;
  async function call(name,args={}){
   const r=await fetch(conf.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:conf.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(args)});
   const j=await r.json();if(!r.ok)throw Error('cleanup RPC rejected '+r.status);return j;
  }
  const rooms=await call('online_my_rooms');let left=0;
  for(const room of rooms){const s=await call('online_get_room',{p_room:room.id});
   await call('online_action',{p_room:s.id,p_instance:s.instance,p_version:s.version,p_action:crypto.randomUUID(),p_kind:'leave',p_cell:null});left++;
  }
  const remaining=await call('online_my_rooms');return {left,remaining:remaining.length};
 });
 if(!cleaned.skipped){assert.equal(cleaned.remaining,0);console.log('cleanup evidence',engine,JSON.stringify(cleaned));}
 }catch(e){console.error('cleanup failure',e.message);}}

 for(const c of contexts)await c.close();await browser.close();
 }
 }
 console.log(JSON.stringify(report,null,2));
 require('node:fs').writeFileSync('/tmp/online-live-evidence.json',JSON.stringify(report,null,2)+'\n');
})().catch(e=>{console.error(e.stack);process.exit(1)});
