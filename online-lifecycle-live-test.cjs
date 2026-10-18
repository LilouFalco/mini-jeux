// Actual PUISSANCE 4 Supabase Auth, RPC, and private WebSockets. Explicit opt-in only.
const pw=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
if(process.env.ONLINE_LIVE!=='1')throw Error('Set ONLINE_LIVE=1 for separately authorized live execution');
// Parent-controlled one-shot gate: ONLINE_LIVE=1 alone is NOT enough. The parent creates this file (mode 0600,
// text 'APPROVED <epoch-ms>') outside the repo right before an approved run; it expires after 10 min and is consumed.
(()=>{const fs=require('fs');const f=process.env.ONLINE_LIVE_GATE_FILE||'/tmp/yakazu-secure/live-gate';
 let st;try{st=fs.statSync(f)}catch{throw Error('Live run blocked: no parent gate file')}
 if((st.mode&0o077)!==0)throw Error('Live run blocked: gate file permissions');
 const m=/^APPROVED (\d+)\s*$/.exec(fs.readFileSync(f,'utf8'));
 if(!m||Date.now()-Number(m[1])>600000||Date.now()<Number(m[1]))throw Error('Live run blocked: gate invalid or expired');
 fs.unlinkSync(f);})();
const fs=require('node:fs'),path=require('node:path');
const sessionFiles=(process.env.ONLINE_SESSION_FILES||'').split(',').filter(Boolean);
assert.equal(new Set(sessionFiles.map(f=>path.resolve(f))).size,2,'session filenames must be distinct');
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

// Actual 003 lease and cron acceptance. No mock transport, shortened lease, fake clock, or signup.
const crypto=require('node:crypto');
const runId=crypto.randomUUID();
const evidence=process.env.LIFECYCLE_EVIDENCE||'/tmp/online-lifecycle-live-evidence.json';
const report=fs.existsSync(evidence)?JSON.parse(fs.readFileSync(evidence,'utf8')):[];
const sourceHash=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
function record(x){x={...x,runId,base:new URL(BASE).origin,sourceHash};report.push(x);fs.writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');console.log('PASS',JSON.stringify(x));}
async function rpc(p,name,args={}){
 return p.evaluate(async({name,args})=>{
  const c=await MiniOnline.client();const {data,error}=await c.rpc(name,args);
  if(error)throw Error(name+': '+error.code+' '+error.message);return data;
 },{name,args});
}
async function natural(p,ms){await p.evaluate(ms=>new Promise(r=>setTimeout(r,ms)),ms);}
async function boot(c,game,st){
 const p=await c.newPage();
 p.on('request',r=>{if(r.url().includes('/auth/v1/signup'))throw Error('signup forbidden');if(r.url().includes('/rest/v1/rpc/')){st.rpc++;if(r.url().endsWith('online_heartbeat'))st.heartbeat++;}});
 p.on('websocket',ws=>{st.sockets++;ws.on('framereceived',f=>{const m=require('./online-live-frame.cjs')(f.payload);if(!m)return;
 if(m.event==='presence_diff'||m.event==='presence_state')st.presence++;
 if(m.event==='broadcast'&&m.payload?.event==='terminated')st.terminated++;
 if(m.event==='broadcast'&&m.payload?.event==='changed')st.changed++;
 });});
 await p.goto(BASE+game+'.html');await p.locator('#online-toggle').click();
 await p.waitForFunction(()=>document.querySelector('#online-status')?.textContent.includes('Choisis un nom'),null,{timeout:30000});
 return p;
}
(async()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('sql/003-online-lifecycle.sql')).digest('hex'),'094a54d5738d7071688d25ecc2bfe3d6d85ba41582b9c47499e828683d25394e');
 // Reviewed app_private.my_rooms is a pure SELECT; unlike status/get_room/heartbeat it never expires rooms.
 for(const engine of (process.env.LIFECYCLE_ENGINE?[process.env.LIFECYCLE_ENGINE]:['chromium','webkit'])){
 const browser=await pw[engine].launch(engine==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{}),cs=[],ps=[],stats=[];
 let observer,owned=[];
 process.once('SIGTERM',()=>{fs.writeFileSync('/tmp/yakazu-secure/lifecycle-interrupted.json',JSON.stringify(owned),{mode:0o600});process.exit(143);});
 try{
 for(let i=0;i<2;i++){
  const c=await browser.newContext({storageState:sessionFiles[i],serviceWorkers:'block',viewport:{width:390,height:844}});
  await c.route('**/auth/v1/signup',r=>r.abort('blockedbyclient'));cs.push(c);
  stats.push({rpc:0,heartbeat:0,sockets:0,presence:0,terminated:0,changed:0});
 }
 for(const game of (process.env.LIFECYCLE_GAME?[process.env.LIFECYCLE_GAME]:['morpion','puissance4'])){
  for(let i=0;i<2;i++){if(ps[i]&&!ps[i].isClosed())await ps[i].close();ps[i]=await boot(cs[i],game,stats[i]);}
  // Observer shares identity 1, but never enters a room, subscribes, or runs a room heartbeat.
  if(observer)await observer.close();observer=await boot(cs[0],game,{rpc:0,heartbeat:0,sockets:0,presence:0,terminated:0,changed:0});
  const mine=()=>rpc(observer,'online_my_rooms_game',{p_game:game});
  async function make(){
   const name='TEST LC '+engine.slice(0,1)+' '+game.slice(0,1)+' '+Date.now().toString(36);
   await ps[0].locator('#online-pseudo').fill('TEST Hote');await ps[0].locator('#online-room-name').fill(name);
   await ps[0].getByRole('button',{name:'Créer',exact:true}).click();await ps[0].waitForSelector('.online-members');
   const rooms=await mine(),r=rooms.find(x=>x.name===name);assert.ok(r);owned.push({id:r.id,game});
   await ps[1].locator('#online-pseudo').fill('TEST Invite');await ps[1].locator('#online-room-name').fill(name);
   await ps[1].getByRole('button',{name:'Rejoindre',exact:true}).click();await ps[1].waitForSelector('.online-members');
   for(const p of ps)await p.waitForFunction(async()=>{const c=await MiniOnline.client();return c.getChannels().some(x=>x.state==='joined'&&x.params.config.private);},null,{timeout:20000});
   await ps[0].waitForFunction(()=>document.querySelectorAll('.online-members span').length===2);
   return r;
  }
  async function gone(r){
   assert.ok(!(await mine()).some(x=>x.id===r.id),'pure membership SELECT proves room deleted');
   owned=owned.filter(x=>x.id!==r.id);
  }
  for(const role of [0,1])for(const mode of ['explicit','tabclose','offline']){
   if(report.some(x=>x.engine===engine&&x.game===game&&x.role===(role?'opponent':'host')&&x.mode===mode&&x.roomDeleted))continue;
   const r=await make(),other=ps[1-role],began=Date.now(),h=stats[1-role].heartbeat;
   if(mode==='explicit'){ps[role].once('dialog',d=>d.accept());await ps[role].getByRole('button',{name:'Quitter le salon',exact:true}).click();}
   if(mode==='tabclose')await ps[role].close();
   if(mode==='offline')await cs[role].setOffline(true);
   await other.waitForSelector('#online-pseudo',{timeout:80000});
   await other.waitForFunction(name=>document.querySelector('#online-status')?.textContent.includes(name+' a quitté le salon'),role?'TEST Invite':'TEST Hote',{timeout:15000});
   if(mode!=='explicit'){assert.ok(Date.now()-began>=35000,'real lease elapsed');assert.ok(stats[1-role].heartbeat>h,'real 10-second heartbeats continued');}
   if(mode==='offline'){await cs[role].setOffline(false);await ps[role].waitForSelector('#online-pseudo',{timeout:20000});}
   await gone(r);
   if(mode==='tabclose')ps[role]=await boot(cs[role],game,stats[role]);
   record({engine,game,role:role?'opponent':'host',mode,ms:Date.now()-began,autoLobby:true,namedMessage:true,roomDeleted:true});
  }
  for(const role of [0,1]){
   if(report.some(x=>x.engine===engine&&x.game===game&&x.mode==='reconnect-before45'&&x.role===(role?'opponent':'host')&&x.preserved&&x.noFalseLeave))continue;
   const r=await make(),h=stats[role].heartbeat;
   await cs[role].setOffline(true);await natural(observer,15000);await cs[role].setOffline(false);
   await ps[role].waitForFunction(async()=>{const c=await MiniOnline.client();return c.getChannels().some(x=>x.state==='joined');},null,{timeout:15000});
   await natural(observer,12000);
   for(const p of ps)assert.equal(await p.locator('.online-members').count(),1);
   assert.ok((await mine()).some(x=>x.id===r.id));assert.ok(stats[role].heartbeat>h);
   ps[0].once('dialog',d=>d.accept());await ps[0].getByRole('button',{name:'Quitter le salon',exact:true}).click();
   await ps[1].waitForSelector('#online-pseudo');await gone(r);
   record({engine,game,mode:'reconnect-before45',role:role?'opponent':'host',preserved:true,noFalseLeave:true});
  }
  if(!report.some(x=>x.engine===engine&&x.game===game&&x.mode==='all-clients-closed-cron'&&x.pureSelectProof&&x.receiptAfterAbsence&&x.roomDeleted)){
  const r=await make();assert.ok((await mine()).some(x=>x.id===r.id),'pure SELECT baseline before closure');
  fs.writeFileSync('/tmp/yakazu-secure/lifecycle-cron-room.json',JSON.stringify({id:r.id,game,engine,closedAt:Date.now()}),{mode:0o600});
  const closedAt=Date.now();for(const p of ps)await p.close();
  // No room-specific RPC after closing either client. 120s covers full 45s lease + full minute cron window.
  await natural(observer,120000);
  assert.ok(!(await mine()).some(x=>x.id===r.id),'cron deleted ghost without any status/heartbeat/get-room call');
  const receipt=await rpc(observer,'online_room_status',{p_room:r.id});assert.equal(receipt.terminated,true);assert.match(receipt.reason,/^(host|player)_timeout$/);
  owned=owned.filter(x=>x.id!==r.id);
  record({engine,game,mode:'all-clients-closed-cron',ms:Date.now()-closedAt,pureSelectProof:true,receiptAfterAbsence:true,roomDeleted:true});
  for(let i=0;i<2;i++)ps[i]=await boot(cs[i],game,stats[i]);
  }
 }
 const prior=report.filter(x=>x.engine===engine&&x.mode==='transport-evidence');
 for(let i=0;i<2;i++)for(const key of ['heartbeat','presence','terminated'])assert.ok(stats[i][key]+prior.reduce((n,x)=>n+(x.clients?.[i]?.[key]||0),0)>0,engine+' client '+i+' missing actual '+key);
 record({engine,game:process.env.LIFECYCLE_GAME||'all',mode:'transport-evidence',clients:stats});
 }finally{
 // Cleanup only IDs created by THIS run. Never remove unrelated user rooms.
 for(const c of cs)await c.setOffline(false).catch(()=>{});
 if(observer&&!observer.isClosed())for(const r of owned){try{await rpc(observer,'online_depart_room',{p_room:r.id});}catch(e){console.error('test-room cleanup',e.message);}}
 for(let i=0;i<cs.length;i++){await cs[i].setOffline(false).catch(()=>{});try{fs.writeFileSync(sessionFiles[i],JSON.stringify(await cs[i].storageState()),{mode:0o600});fs.chmodSync(sessionFiles[i],0o600);}catch{}await cs[i].close();}
 await browser.close();
 }
 }
 console.log('ALL REAL LIFECYCLE CASES PASS');
})().catch(e=>{const failure={runId,at:new Date().toISOString(),engine:process.env.LIFECYCLE_ENGINE,game:process.env.LIFECYCLE_GAME,error:String(e.stack||e).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]')};fs.writeFileSync(evidence+'.failure.json',JSON.stringify(failure,null,2),{mode:0o600});console.error(failure.error);process.exitCode=1;});
