// Actual ONLINE CHESS Supabase run (Auth, RPC, private realtime). Explicit parent-gated opt-in only. NEVER signs up, never prints tokens.
const pw=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const BASE=process.env.BASE;
if(!BASE)throw Error('BASE required (own server, never the Rouky one on 28461)');
const SELF=process.env.ONLINE_SELFTEST==='1';
if(!SELF&&process.env.ONLINE_LIVE!=='1')throw Error('Set ONLINE_LIVE=1 for separately authorized live execution');
if(!SELF)(()=>{const f=process.env.ONLINE_LIVE_GATE_FILE||'/tmp/yakazu-secure/live-gate';let st;
 try{st=fs.statSync(f)}catch{throw Error('Live run blocked: no parent gate file')}
 if((st.mode&0o077)!==0)throw Error('Live run blocked: gate file permissions');
 const m=/^APPROVED (\d+)\s*$/.exec(fs.readFileSync(f,'utf8'));
 if(!m||Date.now()-Number(m[1])>600000||Date.now()<Number(m[1]))throw Error('Live run blocked: gate invalid or expired');
 fs.unlinkSync(f);})();
const files=(process.env.ONLINE_SESSION_FILES||'').split(',').filter(Boolean);
assert.equal(files.length,2,'two existing saved sessions required; no signups');
assert.equal(new Set(files.map(f=>path.resolve(f))).size,2,'distinct session files');
for(const f of files){
 assert.ok(path.resolve(f).startsWith('/tmp/')&&path.dirname(path.resolve(f))!=='/tmp','sessions must be in a private /tmp subdirectory');
 assert.ok(fs.existsSync(f),'missing saved session');fs.chmodSync(f,0o600);
 const st=JSON.parse(fs.readFileSync(f,'utf8'));
 assert.ok(st.origins?.some(o=>o.origin===new URL(BASE).origin&&o.localStorage?.some(x=>x.name==='mini-online-auth-v1')),'saved Auth session for BASE origin required');
}
async function rpc(p,name,args={}){return p.evaluate(async({name,args})=>{const c=await MiniOnline.client();const {data,error}=await c.rpc(name,args);return {data,error:error&&{code:error.code,message:error.message}}},{name,args})}
const mv=async(p,a,b)=>{await p.locator('#oc-board [data-square='+a+']').click();await p.locator('#oc-board [data-square='+b+']').click()};
const net=[[],[]];let LABEL='init',ENG='-';const L=(l)=>{LABEL=l;fs.writeSync(1,'STEP '+ENG+' '+l+'\n')};
const natural=(p,fn,arg,timeout)=>p.waitForFunction(fn,arg,{timeout});
const status=p=>p.locator('#online-status').textContent();
(async()=>{
 for(const engine of ['chromium','webkit']){
  const br=await pw[engine].launch(engine==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
  ENG=engine;const errors=[],ctxs=[],pages=[],report=[];L('launch');
  async function boot(i){
   const c=ctxs[i]||await br.newContext({storageState:files[i],viewport:i?{width:390,height:844}:{width:360,height:640},serviceWorkers:'block'});
   if(!ctxs[i]){ctxs[i]=c;await c.route('**/auth/v1/signup',r=>r.abort('blockedbyclient'));if(SELF)await c.route(u=>new URL(u).origin!==new URL(BASE).origin,r=>r.fulfill({status:503,contentType:'application/json',body:'{"msg":"selftest offline"}'}));}
   const p=await c.newPage();p.on('pageerror',e=>{errors.push(e.message);net[i].push({pageerror:e.message.slice(0,120)})});p.on('requestfailed',q=>net[i].push({failed:new URL(q.url()).pathname.slice(0,60),why:(q.failure()||{}).errorText}));p.on('response',r=>{const u=new URL(r.url());if(/\/rest\/v1\/rpc\/|\/auth\/v1\//.test(u.pathname)){const e={ep:u.pathname.split('/').slice(-1)[0],st:r.status(),L:LABEL};if(r.status()>=400)r.text().then(t=>{e.msg=t.replace(/eyJ[\w.-]+/g,'<jwt>').slice(0,160)}).catch(()=>{});net[i].push(e);if(net[i].length>25)net[i].shift()}});pages[i]=p;L('boot player '+(i+1));
   await p.goto(BASE+'chess.html');await p.locator('#online-toggle').click();await p.waitForSelector('#online-pseudo',{timeout:20000});
   fs.writeFileSync(files[i],JSON.stringify(await c.storageState()),{mode:0o600});fs.chmodSync(files[i],0o600);
   return p;
  }
  const snapAll=async(tag)=>{const o=[];for(const [i,p] of pages.entries()){o.push({i,tag,engine:ENG,label:LABEL,url:p.url().slice(0,60),net:net[i].slice(-10),errors:errors.slice(-3)});try{o.push({i,tag,url:p.url().slice(0,60),alert:await p.locator('.online-alert,[role=alert]').allTextContents().catch(()=>[]),net:net[i].slice(-10),status:(await p.locator('#online-status').textContent({timeout:2000})).slice(0,120),buttons:await p.evaluate(()=>[...document.querySelectorAll('#online-root button')].map(x=>x.textContent+(x.disabled?'(disabled)':''))),members:await p.evaluate(()=>[...document.querySelectorAll('.online-members span')].map(x=>x.textContent.replace(/\s+/g,' ').trim())),room:(await rpc(p,'online_my_rooms_game',{p_game:'chess'})).data?.map(r=>({id:r.id,v:r.version,n:r.members?.length,ready:r.members?.map(m=>m.ready)}))})}catch(e){o.push({i,tag,err:e.message.slice(0,80)})}}console.log('DIAG '+JSON.stringify(o));};
  async function lobbyBoth(tag){L('lobby '+tag);
   const room='TEST CHESS '+tag+' '+engine.slice(0,2)+Date.now().toString(36);
   for(let i=0;i<2;i++){
    const p=pages[i];
    // The lobby re-renders asynchronously after reload (list/mine responses) and can wipe typed input: fill, then verify values and click atomically in-page; refill if wiped.
    const want=['TEST joueur '+(i+1),room],label=i?'Rejoindre':'Créer';let sent=false;
    for(let k=0;k<6&&!sent;k++){
     await p.waitForFunction(l=>[...document.querySelectorAll('#online-root button')].some(x=>x.textContent===l&&!x.disabled),label,{timeout:30000});
     await p.locator('#online-pseudo').fill(want[0]);await p.locator('#online-room-name').fill(want[1]);
     sent=await p.evaluate(([w,l])=>{const a=document.querySelector('#online-pseudo'),b=document.querySelector('#online-room-name');if(!a||!b||a.value!==w[0]||b.value!==w[1])return false;const btn=[...document.querySelectorAll('#online-root button')].find(x=>x.textContent===l&&!x.disabled);if(!btn)return false;btn.click();return true},[want,label]);
     if(!sent)fs.writeSync(1,'LOBBY-INPUT-WIPED '+ENG+' p'+(i+1)+' attempt '+(k+1)+' (refill)\n');
    }
    assert.ok(sent,'could not submit lobby form with stable inputs');await p.waitForSelector('.online-members',{timeout:15000}).catch(async e=>{await snapAll(engine+' '+tag+' '+(i?'join':'create')+' no-members');await p.screenshot({path:'/tmp/yakazu-secure/chess-run/fail-lobby-'+engine+'-'+i+'.png'}).catch(()=>{});throw e});
   }
   // Observable synced state on BOTH clients (not just selector presence): both names rendered from a server snapshot.
   for(const [i,p] of pages.entries())await p.waitForFunction(()=>{const t=[...document.querySelectorAll('.online-members span')].map(x=>x.textContent).join('|');return t.includes('TEST joueur 1')&&t.includes('TEST joueur 2')},null,{timeout:20000}).catch(async e=>{await snapAll(engine+' '+tag+' members-not-synced p'+(i+1));throw e});
   return room;
  }
  const STALE='Le salon a été actualisé. Réessaie.';
  const checks=n=>p=>p.waitForFunction(n=>[...document.querySelectorAll('.online-members span')].filter(x=>x.textContent.includes('✓')).length>=n,n,{timeout:20000});
  // One ready with explicit stale handling: a STALE notice is recognised immediately, recorded, then ONE manual retry after the resync is observed (human behaviour; no product auto-retry).
  async function readyClick(p,other,n){
   await p.getByRole('button',{name:'Prête !'}).click();
   const h=await p.waitForFunction(STALE=>{if(document.querySelector('#online-status')?.textContent===STALE)return 'stale';if([...document.querySelectorAll('#online-root button')].some(b=>b.textContent==='Pas encore prête'))return 'ok';return false},STALE,{timeout:20000});
   let res=await h.jsonValue();
   if(res==='stale'){
    fs.writeSync(1,'STALE-OBSERVED '+ENG+' ready n='+n+' (one manual retry)\n');report.push('stale ready observed, one manual retry');
    await p.getByRole('button',{name:'Prête !'}).waitFor({timeout:5000});
    await p.getByRole('button',{name:'Prête !'}).click();
    await p.getByRole('button',{name:'Pas encore prête'}).waitFor({timeout:20000});
   }
   await checks(n)(other);await checks(n)(p);
  }
  async function startGame(){L('ready/start');
   const [a,b]=pages;
   await readyClick(a,b,1);await readyClick(b,a,2);
   await a.waitForFunction(()=>[...document.querySelectorAll('#online-root button')].some(x=>x.textContent==='Démarrer'&&!x.disabled),null,{timeout:20000}).catch(async e=>{await snapAll('start-not-enabled');await a.screenshot({path:'/tmp/yakazu-secure/chess-run/fail-start.png'});throw e});
   await a.getByRole('button',{name:'Démarrer'}).click();
   await a.waitForSelector('#oc-board',{timeout:15000});await b.waitForSelector('#oc-board',{timeout:15000});
  }
  const lobbyBack=p=>p.waitForSelector('#online-pseudo',{timeout:80000});
  const clean=async()=>{for(const p of pages){try{if(p.isClosed())continue;const r=await rpc(p,'online_my_rooms_game',{p_game:'chess'});for(const x of r.data||[])await rpc(p,'online_depart_room',{p_room:x.id})}catch{}}};
  const ok=(m)=>{report.push(m);console.log('PASS LIVE CHESS',engine,m)};
  try{
   await boot(0);await boot(1);
   for(const [i,p] of pages.entries()){const c={};for(const g of ['morpion','puissance4','naval','quiestce','chess','undercover','timesup','petitbac']){const r=await rpc(p,'online_my_rooms_game',{p_game:g}).catch(()=>({}));c[g]=(r.data||[]).length;if(r.error)c[g]='ERR '+r.error.code}fs.writeSync(1,'PRE-CENSUS '+ENG+' p'+(i+1)+' '+JSON.stringify(c)+'\n')}
   L('case1 mate');
   // 1. create/join/ready/start/fool's mate/result/opponent leave
   await lobbyBoth('mate');await startGame();
   let [a,b]=pages;
   for(const [p,x,y] of [[a,'f2','f3'],[b,'e7','e5'],[a,'g2','g4'],[b,'d8','h4']]){await p.waitForFunction(()=>!document.querySelector('#oc-board [data-locked=true]'),null,{timeout:15000});await mv(p,x,y);const o=p===a?b:a;await o.waitForFunction(sq=>document.querySelector('#oc-board [data-square='+sq+'] svg'),y,{timeout:15000});await p.waitForFunction(sq=>document.querySelector('#oc-board [data-square='+sq+'] svg'),y,{timeout:15000});}
   for(const p of pages)await natural(p,()=>/gagn/.test(document.querySelector('#online-status')?.textContent||''),null,20000);
   b.once('dialog',d=>d.accept());await b.getByRole('button',{name:'Quitter le salon'}).click();
   await natural(a,()=>/quitt|expir/.test(document.querySelector('#online-status')?.textContent||''),null,20000);await lobbyBack(a);await lobbyBack(b).catch(()=>{});
   ok('create/join/ready/start/foolsmate/result/opponent-leave notice+lobby');
   L('case2 host leave');
   // 2. host departure sends the opponent to the lobby with a notice
   await clean();for(const p of pages)await p.reload().then(()=>p.locator('#online-toggle').click()).then(()=>p.waitForSelector('#online-pseudo',{timeout:20000}));
   await lobbyBoth('hostleave');await startGame();[a,b]=pages;
   a.once('dialog',d=>d.accept());await a.getByRole('button',{name:'Quitter le salon'}).click();
   await natural(b,()=>/quitt|expir/.test(document.querySelector('#online-status')?.textContent||''),null,20000);await lobbyBack(b);
   ok('host departure: opponent notified and back to lobby');
   L('case3 desync');
   // 3. peer desync: a member appends an illegal move over RPC (server only checks syntax/turn). Both clients fail closed.
   await clean();for(const p of pages)await p.reload().then(()=>p.locator('#online-toggle').click()).then(()=>p.waitForSelector('#online-pseudo',{timeout:20000}));
   await lobbyBoth('desync');await startGame();[a,b]=pages;
   const mine=(await rpc(a,'online_my_rooms_game',{p_game:'chess'})).data[0];
   const room=(await rpc(a,'online_get_room',{p_room:mine.id})).data;
   const before=await Promise.all(pages.map(p=>p.evaluate(()=>document.querySelector('#oc-board').dataset.turn||document.querySelector('#turn-label,#online-turn')?.textContent||'')));
   const bad=await rpc(a,'online_chess_action',{p_room:room.id,p_instance:room.instance,p_version:room.version,p_action:crypto.randomUUID(),p_kind:'move',p_data:{uci:'e1e5'}});
   assert.equal(bad.error,null,'server accepts syntactically valid illegal UCI (documented SQL002 limitation)');
   for(const p of pages)await natural(p,()=>/illégal|invalide|incoh|Réponse|Historique/i.test(document.querySelector('#online-status')?.textContent||''),null,25000);
   for(const p of pages){
     assert.equal(await p.locator('#oc-board [data-square=e5] svg').count(),0,'illegal destination never rendered');
    assert.ok(await p.locator('#oc-board [data-square=e1] svg').count()>=1,'king still on e1');
   }
   const after=await Promise.all(pages.map(p=>p.evaluate(()=>document.querySelector('#oc-board').dataset.turn||document.querySelector('#turn-label,#online-turn')?.textContent||'')));
   assert.deepEqual(after,before,'turn indicator unchanged on both clients');
   const st=await rpc(b,'online_get_room',{p_room:room.id});assert.equal(st.error,null);
   ok('peer desync: illegal remote move rejected on sender+receiver, board unchanged, no crash');
   await clean();
   for(const p of pages)await p.reload().then(()=>p.locator('#online-toggle').click()).then(()=>p.waitForSelector('#online-pseudo',{timeout:20000}));
   L('case4 reconnect');
   // 4. reconnect < 45 s keeps the room (opponent offline ~15 s, natural waits on heartbeat/status, no sleep)
   await lobbyBoth('reconn');await startGame();[a,b]=pages;
   const r4=(await rpc(a,'online_my_rooms_game',{p_game:'chess'})).data[0];
   await ctxs[1].setOffline(true);
   // natural clock: two real 10 s heartbeats of the host while the opponent is offline (<45 s)
   for(let k=0;k<2;k++)await a.waitForResponse(q=>/online_heartbeat/.test(q.url())&&q.ok(),{timeout:30000});
   await ctxs[1].setOffline(false);
   await natural(b,async()=>{const c=await MiniOnline.client();return c.getChannels().some(x=>x.state==='joined')},null,20000);
   for(let k=0;k<1;k++)await a.waitForResponse(q=>/online_heartbeat/.test(q.url())&&q.ok(),{timeout:30000});
   assert.ok((await rpc(a,'online_my_rooms_game',{p_game:'chess'})).data.some(x=>x.id===r4.id),'room preserved after <45s reconnect');
   for(const p of pages)assert.ok(await p.locator('#oc-board').count()>=1,'still in game, no false leave');
   assert.ok(!/quitt/.test(await status(a)),'no false leave notice');
   ok('reconnect <45s: room preserved, no false leave');
   L('case5 disconnect');
   // 5. disconnect >45s terminates (natural lobby return + room deleted by the lease)
   await ctxs[1].setOffline(true);const t0=Date.now();
   await lobbyBack(a);assert.ok(Date.now()-t0>=35000,'real lease elapsed');
   await natural(a,()=>/quitt|expir/.test(document.querySelector('#online-status')?.textContent||''),null,15000);
   assert.ok(!(await rpc(a,'online_my_rooms_game',{p_game:'chess'})).data.some(x=>x.id===r4.id),'room gone after >45s');
   await ctxs[1].setOffline(false);await lobbyBack(b);
   ok('disconnect >45s: opponent returned to lobby with notice, room terminated');
   assert.deepEqual(errors,[]);
  }catch(e){fs.writeSync(1,'FAIL '+ENG+' @'+LABEL+' '+String(e.message).split('\n')[0].slice(0,200)+'\n');await snapAll('failure').catch(()=>{});for(const [i,p] of pages.entries())await p.screenshot({path:'/tmp/yakazu-secure/chess-run/fail-'+ENG+'-p'+(i+1)+'.png'}).catch(()=>{});throw e}
  finally{
   for(const c of ctxs)await c.setOffline(false).catch(()=>{});
   await clean();for(const [i,p] of pages.entries()){if(p.isClosed())continue;const r=await rpc(p,'online_my_rooms_game',{p_game:'chess'}).catch(()=>({}));fs.writeSync(1,'CLEANUP '+ENG+' p'+(i+1)+' remaining chess rooms: '+((r.data||[]).length)+'\n')}await br.close();
  }
 }
})().catch(e=>{console.error(e.message);process.exit(1)});
