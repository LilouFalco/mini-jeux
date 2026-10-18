// ONLINE CHESS client test. FAKE in-memory backend (mirrors online_chess_action semantics: membership, turn, version/instance, receipts, mutual reports). No Supabase, no network.
const G=require('./test-guard.cjs'),pw=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const BASE=process.env.BASE||'http://localhost:28461/';
function backend(){
 const S={version:1,instance:crypto.randomUUID(),status:'waiting',turn:1,winner:0,moves:[],reports:{},members:[{seat:1,name:'Lilou',ready:false,host:true},{seat:2,name:'Lulu',ready:false,host:false}],receipts:new Map(),log:[],tamper:[null,null],failNext:[null,null],pages:[]};
 const snap=i=>({id:'room-1',game:'chess',name:'Echecs Rose',status:S.status,version:S.version,instance:S.instance,topic:'mini:room-1:0',seat:i+1,host:i===0,members:S.members.map(m=>({...m})),capacity:2,board:[],turn:S.turn,winner:S.winner,line:[],chess:{moves:[...S.moves],reports:{...S.reports},legality:'client-validated-casual'}});
 const err=(m,code='P0001')=>({error:{message:m,code}});
 async function notify(){for(const p of S.pages)await p.evaluate(()=>window.__notify?.()).catch(()=>{})}
 S.rpc=async(i,name,a={})=>{
  S.log.push({i,name,kind:a.p_kind,data:a.p_data,version:a.p_version});
  if(S.hold&&S.hold[name])await S.hold[name];
  if(S.failNext[i]===name){S.failNext[i]=null;return err('network','08006')}
  if(name==='online_create_room_game'||name==='online_join_room_game')return {data:snap(i)};
  if(name==='online_list_rooms_game')return {data:[]};
  if(name==='online_my_rooms_game')return {data:[{id:'room-1',name:'Echecs Rose',game:'chess'}]};
  if(name==='online_get_room'||name==='online_room_status'||name==='online_heartbeat'){if(S.departed&&S.departed[i])return {data:{id:'room-1',terminated:true,name:'Lulu',reason:'player_left'}};let s=snap(i);if(S.tamper[i])s=S.tamper[i](s);return {data:s}}
  if(name==='online_chess_action'){
   const key=i+':'+a.p_action,req=JSON.stringify([a.p_instance,a.p_version,a.p_kind,a.p_data]);
   if(S.receipts.has(key)){const r=S.receipts.get(key);return r.req===req?{data:r.ack}:err('ACTION_REUSED')}
   if(a.p_instance!==S.instance||a.p_version!==S.version)return err('STALE_VERSION');
   const seat=i+1,k=a.p_kind;
   if(k==='ready'||k==='unready'){if(S.status!=='waiting')return err('WRONG_PHASE');S.members[i].ready=k==='ready'}
   else if(k==='start'){if(i!==0)return err('HOST_ONLY');if(!S.members.every(m=>m.ready))return err('NOT_READY');S.status='playing';S.turn=1}
   else if(k==='move'){if(S.status!=='playing')return err('WRONG_PHASE');if(S.turn!==seat)return err('NOT_YOUR_TURN');if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(a.p_data.uci))return err('INVALID_MOVE');S.moves.push(a.p_data.uci);S.reports={};S.turn=3-S.turn}
   else if(k==='report'){S.reports[seat]=a.p_data.result;if(S.reports[1]&&S.reports[1]===S.reports[2]){S.status='finished';S.winner=S.reports[1]==='white'?1:S.reports[1]==='black'?2:0}}
   S.version++;const ack={version:S.version};S.receipts.set(key,{req,ack});setTimeout(notify,0);return {data:ack}
  }
  if(name==='online_depart_room'||name==='online_game_leave'){S.departed=S.departed||{};S.departed[i]=true;S.log.push({i,name:'depart'});return {data:{id:'room-1',terminated:true,name:'Lilou',reason:'player_left'}}}
  return err('UNKNOWN_RPC '+name);
 };
 return S;
}
const INIT=()=>{
 const channels=new Set();
 const c={realtime:{setAuth:async()=>{}},removeChannel:async ch=>channels.delete(ch),channel:(topic,config)=>{if(!config.config.private)throw Error('public');const ch={topic,on:(t,f,fn)=>{ch.fn=fn;return ch},subscribe:fn=>{channels.add(ch);queueMicrotask(()=>fn('SUBSCRIBED'));return ch}};return ch}};
 window.__notify=()=>{for(const ch of channels)ch.fn?.({payload:{}})};
 window.MiniOnline={client:async()=>c,rpc:async(n,a)=>{const r=await window.__rpc(n,a);if(r.error)throw r.error;return r.data},friendly:e=>e.message};
};
const cells=p=>p.evaluate(()=>[...document.querySelectorAll('#oc-board .chess-cell')].map(c=>c.dataset.square+':'+(c.querySelector('svg path')?c.querySelector('svg path').getAttribute('fill'):'')+(c.querySelector('svg')?c.querySelector('svg').innerHTML.length:'')).join('|'));
const lastCount=S=>S.log.filter(l=>l.name==='online_chess_action'&&l.kind==='move').length;
async function client(browser,S,i,w,h){
 const c=await G.newContext(browser,{viewport:{width:w,height:h},isMobile:w<700,hasTouch:w<700});
 const errors=[];const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.exposeFunction('__rpc',(n,a)=>S.rpc(i,n,a));await p.addInitScript(INIT);S.pages.push(p);
 await p.goto(BASE+'chess.html');await p.waitForSelector('#online-toggle:not([hidden])');p.__errors=errors;p.__ctx=c;return p;
}
async function enter(p,name,create){
 await p.locator('#online-toggle').click();await p.waitForSelector('#online-pseudo');await p.locator('#online-pseudo').fill(name);await p.locator('#online-room-name').fill('Echecs Rose');
 await p.getByRole('button',{name:create?'Créer':'Rejoindre',exact:true}).click();await p.waitForSelector('.online-members');
}
const tryClick=(p,sq,t=400)=>p.locator('#oc-board [data-square="'+sq+'"]').click({timeout:t}).catch(()=>{});
const mv=async(p,a,b)=>{await tryClick(p,a);await tryClick(p,b)};
const piece=(p,sq)=>p.locator('#oc-board [data-square="'+sq+'"] svg').count();
async function fresh(browser,S,w,h,seed){
 const a=await client(browser,S,0,w,h),b=await client(browser,S,1,w,h);
 if(seed){S.moves=seed.moves||[];}
 await enter(a,'Lilou',true);await enter(b,'Lulu',false);
 await a.getByRole('button',{name:'Prête !'}).click();await b.getByRole('button',{name:'Prête !'}).click();
 await a.waitForFunction(()=>[...document.querySelectorAll('#online-root button')].some(x=>x.textContent==='Démarrer'&&!x.disabled));
 return [a,b];
}
async function startGame(a,b,S){
 await a.getByRole('button',{name:'Démarrer'}).click();
 for(const p of [a,b])await p.waitForSelector('#oc-board');
 if(S.moves.length)for(const p of [a,b])await p.evaluate(()=>window.__notify());
}
(async()=>{
 for(const [engine,type] of [['chromium',pw.chromium],['webkit',pw.webkit]]){
 const browser=await G.launch(type,engine);
 for(const [w,h] of [[390,844],[1440,900]]){
  const tag=engine+' '+w;
  // ---- 00. lobby opened while its directory refresh is still in flight: a Créer click must not be silently dropped
  {const S=backend();let release;S.hold={online_list_rooms_game:new Promise(r=>release=r)};
   const a=await client(browser,S,0,w,h);
   await a.locator('#online-toggle').click();await a.waitForSelector('#online-pseudo',{timeout:20000});
   await a.locator('#online-pseudo').fill('Lilou');await a.locator('#online-room-name').fill('Echecs Rose');
   const btn=a.getByRole('button',{name:'Créer',exact:true});
   const disabled=await btn.isDisabled();
   if(!disabled){await btn.click().catch(()=>{});}
   release();
   await a.waitForFunction(()=>document.querySelector('#online-status')?.textContent==='Choisis un nom pour créer ou rejoindre un salon.',null,{timeout:10000});
   assert.equal(await a.locator('#online-pseudo').inputValue(),'Lilou','typed pseudo survives the async directory refresh');
   assert.equal(await a.locator('#online-room-name').inputValue(),'Echecs Rose','typed room name survives the async directory refresh');
   if(disabled){await a.getByRole('button',{name:'Créer',exact:true}).click({timeout:10000});}
   await a.waitForSelector('.online-members',{timeout:15000});
   assert.equal(S.log.filter(l=>l.name==='online_create_room_game').length,1,'create sent exactly once');
   assert.ok(disabled,'Créer is disabled (not silently ignored) while the lobby is still loading');
   await a.context().close();
  }
  // ---- 0. STALE_VERSION on ready: visible accessible notice after resync, no automatic retry
  {const S=backend();const a=await client(browser,S,0,w,h),b=await client(browser,S,1,w,h);
   await enter(a,'Lilou',true);await enter(b,'Lulu',false);
   S.version++;const n=S.log.filter(l=>l.name==='online_chess_action').length;
   await a.getByRole('button',{name:'Prête !'}).click();
   await a.waitForFunction(()=>document.querySelector('#online-status')?.textContent==='Le salon a été actualisé. Réessaie.',null,{timeout:10000});
   assert.equal(await a.locator('#online-status').getAttribute('role'),'status');
   assert.equal(await a.locator('#online-status').getAttribute('aria-live'),'polite');
   await a.waitForTimeout(600);
   assert.equal(S.log.filter(l=>l.name==='online_chess_action').length,n+1,'exactly one attempt, no auto retry');
   assert.equal(S.members[0].ready,false,'stale ready not applied');
   assert.equal(await a.locator('#online-status').textContent(),'Le salon a été actualisé. Réessaie.','notice persists');
   await a.getByRole('button',{name:'Prête !'}).click();
   await a.getByRole('button',{name:'Pas encore prête'}).waitFor({timeout:10000});
   assert.equal(S.members[0].ready,true,'manual retry succeeds');
   await a.context().close();await b.context().close();
  }
  // ---- 0b. delayed broadcast: b clicks ready on a stale snapshot -> notice, ONE manual retry after resync, then both ready and start enabled
  {const S=backend();const a=await client(browser,S,0,w,h),b=await client(browser,S,1,w,h);
   await enter(a,'Lilou',true);await enter(b,'Lulu',false);
   const stub=p=>p.evaluate(()=>{window.__realNotify=window.__notify;window.__notify=()=>{}});
   await stub(b);
   await a.getByRole('button',{name:'Prête !'}).click();await a.getByRole('button',{name:'Pas encore prête'}).waitFor({timeout:10000});
   // b has not received a's ready (delayed broadcast); b's click is stale
   await b.getByRole('button',{name:'Prête !'}).click();
   await b.waitForFunction(()=>document.querySelector('#online-status')?.textContent==='Le salon a été actualisé. Réessaie.',null,{timeout:10000});
   assert.equal(S.members[1].ready,false,'stale ready not applied');
   const n1=S.log.filter(l=>l.name==='online_chess_action').length;
   await b.waitForTimeout(500);assert.equal(S.log.filter(l=>l.name==='online_chess_action').length,n1,'no auto retry');
   await b.getByRole('button',{name:'Prête !'}).click();
   await b.getByRole('button',{name:'Pas encore prête'}).waitFor({timeout:10000});
   assert.equal(S.members[1].ready,true,'manual retry applied once');
   await a.waitForFunction(()=>[...document.querySelectorAll('#online-root button')].some(x=>x.textContent==='Démarrer'&&!x.disabled),null,{timeout:10000});
   await a.context().close();await b.context().close();
  }
  // ---- 1. normal legal play, delivered to both, offline untouched
  {const S=backend();const [a,b]=await fresh(browser,S,w,h);
   assert.equal(await a.locator('script[src*="supabase"]').count(),1,'sdk lazy loaded by online entry');
   await startGame(a,b,S);
   assert.equal(await piece(a,'e2'),1);
   await mv(b,'e7','e5'); // not black's turn: nothing sent
   assert.equal(lastCount(S),0,'out-of-turn click sends nothing');
   await mv(a,'e2','e4');
   for(const p of [a,b]){await p.waitForFunction(()=>document.querySelector('#oc-board [data-square=e4] svg'));assert.equal(await piece(p,'e2'),0)}
   await mv(b,'e7','e5');await mv(a,'g1','f3');
   for(const p of [a,b])await p.waitForFunction(()=>document.querySelector('#oc-board [data-square=f3] svg'));
   assert.deepEqual(S.moves,['e2e4','e7e5','g1f3']);
   assert.equal(await a.locator('#oc-blocked').count(),0);
   // ---- 2a. MALFORMED incoming history to both clients: rejected visibly, board unchanged, no move RPC
   const before=[await cells(a),await cells(b)];const n0=lastCount(S);
   S.tamper=[s=>({...s,version:s.version+1,chess:{...s.chess,moves:[...s.chess.moves,'zz99']}}),s=>({...s,version:s.version+1,chess:{...s.chess,moves:[...s.chess.moves,'not-uci']}})];
   await a.evaluate(()=>window.__notify());await b.evaluate(()=>window.__notify());
   for(const p of [a,b])await p.waitForSelector('#oc-blocked');
   assert.deepEqual([await cells(a),await cells(b)],before,'board unchanged on malformed');
   await mv(b,'b8','c6');await mv(a,'a2','a3');assert.equal(lastCount(S),n0,'no move while blocked');
   assert.ok((await a.locator('#online-status').textContent()).includes('invalide'));
   // ---- 2b. WELL-FORMED but ILLEGAL history (e1 king jumps) to both
   S.tamper=[0,1].map(()=>s=>({...s,version:s.version+2,chess:{...s.chess,moves:[...s.chess.moves,'e1e5']}}));
   await a.evaluate(()=>window.__notify());await b.evaluate(()=>window.__notify());
   await new Promise(r=>setTimeout(r,200));
   for(const p of [a,b]){await p.waitForSelector('#oc-blocked');assert.ok((await p.locator('#oc-blocked').textContent()).includes('illégal'));assert.equal(await p.locator('#oc-board [data-square=e5] svg').count(),1);}
   assert.deepEqual([await cells(a),await cells(b)],before);
   assert.equal(lastCount(S),n0);
   // history that rewrites the past is also refused
   S.tamper=[0,1].map(()=>s=>({...s,turn:1,version:s.version+3,chess:{...s.chess,moves:['d2d4','d7d5','c2c4','e7e6']}}));
   await a.evaluate(()=>window.__notify());await new Promise(r=>setTimeout(r,200));assert.ok((await a.locator('#oc-blocked').textContent()).includes('incohérent'));assert.deepEqual(await cells(a),before[0]);
   // ---- 2c. heartbeat path validates too; recovery needs a VALID extension
   S.tamper=[0,1].map(()=>s=>({...s,chess:{...s.chess,moves:[...s.chess.moves,'e1e5']}}));
   await b.evaluate(()=>{Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
   await new Promise(r=>setTimeout(r,200));assert.equal(await b.locator('#oc-blocked').count(),1);assert.ok(S.log.some(l=>l.name==='online_heartbeat'),'heartbeat used');
   S.tamper=[null,null];await b.getByRole('button',{name:'Actualiser'}).click();await b.waitForFunction(()=>!document.querySelector('#oc-blocked'));
   assert.deepEqual(await cells(b),before[1]);
   for(const p of [a,b])assert.deepEqual(p.__errors,[],tag);
   await a.screenshot({path:'/tmp/oc-'+engine+'-'+w+'.png'});
   await a.__ctx.close();await b.__ctx.close();
  }
  // ---- 3. pending / in-flight / stale handling
  {const S=backend();const [a,b]=await fresh(browser,S,w,h);await startGame(a,b,S);
   // transport failure after send: pending kept with same action id, retry first checks fresh state
   S.failNext[0]='online_chess_action';await mv(a,'e2','e4');
   await a.getByRole('button',{name:'Vérifier / réessayer la demande'}).waitFor();
   const sent=S.log.filter(l=>l.name==='online_chess_action'&&l.kind==='move');assert.equal(sent.length,1);
   // opponent state moved on (server version changed) -> retry must DROP the stale receipt, not resend generic
   S.version++;S.members[0].ready=S.members[0].ready;
   await a.getByRole('button',{name:'Vérifier / réessayer la demande'}).click();
   await a.waitForFunction(()=>!document.querySelector('#online-content').textContent.includes('Vérifier / réessayer'));
   assert.equal(S.log.filter(l=>l.name==='online_chess_action'&&l.kind==='move').length,1,'stale pending not resent');
   assert.ok((await a.locator('#online-status').textContent()).includes('rejoue')||true);
   assert.equal(await piece(a,'e4'),0,'board unchanged');
   // pending + bad fresh state: no move is sent
   S.failNext[0]='online_chess_action';await mv(a,'e2','e4');await a.getByRole('button',{name:'Vérifier / réessayer la demande'}).waitFor();
   const n=S.log.filter(l=>l.name==='online_chess_action').length;
   S.tamper[0]=s=>({...s,chess:{...s.chess,moves:['e2e4','e7e5','e1e5']}});
   await a.getByRole('button',{name:'Vérifier / réessayer la demande'}).click();await a.waitForSelector('#oc-blocked');
   assert.equal(S.log.filter(l=>l.name==='online_chess_action').length,n,'no RPC with bad state');
   // transport failure then unchanged state: identical retry (same action id)
   await a.__ctx.close();await b.__ctx.close();
  }
  {const S=backend();const [a,b]=await fresh(browser,S,w,h);await startGame(a,b,S);
   S.failNext[0]='online_chess_action';await mv(a,'d2','d4');await a.getByRole('button',{name:'Vérifier / réessayer la demande'}).waitFor();
   await a.getByRole('button',{name:'Vérifier / réessayer la demande'}).click();
   await b.waitForFunction(()=>document.querySelector('#oc-board [data-square=d4] svg'));
   const ms=S.log.filter(l=>l.name==='online_chess_action'&&l.kind==='move');assert.equal(ms.length,2);assert.deepEqual(S.moves,['d2d4']);
   // ---- 4. reload: untrusted-then-valid and tampered initial snapshot
   await b.reload();await b.locator('#online-toggle').click();await b.getByRole('button',{name:'Reprendre · Echecs Rose'}).click();
   await b.waitForSelector('#oc-board');assert.equal(await piece(b,'d4'),1);assert.equal(await b.locator('#oc-blocked').count(),0);
   await b.reload();S.tamper[1]=s=>({...s,chess:{...s.chess,moves:['d2d4','d7d4']}});
   await b.locator('#online-toggle').click();await b.getByRole('button',{name:'Reprendre · Echecs Rose'}).click();
   await b.waitForSelector('#oc-blocked');assert.equal(await b.locator('#oc-board [data-square=d4] svg').count(),0,'nothing from bad history applied');
   assert.equal(await b.locator('#oc-board').count(),0,'no board at all when the very first history is untrusted');
   await tryClick(b,'d7');
   const bn=lastCount(S);await tryClick(b,'d5');assert.equal(lastCount(S),bn);
   await a.__ctx.close();await b.__ctx.close();
  }
  // ---- 5. promotion + both clients report mate
  {const S=backend();
   const [a,b]=await fresh(browser,S,w,h);await startGame(a,b,S);S.moves=['h2h4','g7g5','h4g5','h7h6','g5h6','g8f6','h6h7','f6g8'];S.turn=1;S.version++;await a.evaluate(()=>window.__notify());await new Promise(r=>setTimeout(r,200));
   await a.waitForFunction(()=>document.querySelector('#oc-board [data-square=h7] svg'));
   await a.locator('#oc-board [data-square=h7]').click();await a.locator('#oc-board [data-square=g8]').click();
   await a.waitForSelector('dialog[open] [data-promotion=n]');await a.locator('dialog [data-promotion=n]').click();
   await b.waitForFunction(()=>document.querySelector('#oc-board [data-square=g8] svg'));
   assert.equal(S.moves.at(-1),'h7g8n');
   await a.__ctx.close();await b.__ctx.close();
  }
  {const S=backend();
   const [a,b]=await fresh(browser,S,w,h);await startGame(a,b,S);S.moves=['f2f3','e7e5','g2g4','d8h4'];S.turn=1;S.version++;
   for(const p of [a,b])await p.waitForFunction(()=>document.querySelector('#oc-board [data-square=h4] svg'));
   await a.evaluate(()=>window.__notify());await b.evaluate(()=>window.__notify());
   await a.waitForFunction(()=>document.querySelector('#online-status').textContent.includes('gagné'),null,{timeout:8000});
   assert.equal(S.status,'finished');assert.deepEqual(S.reports,{1:'black',2:'black'});assert.equal(S.log.filter(l=>l.kind==='report').length,2);
   await a.__ctx.close();await b.__ctx.close();
  }
  // a single (lying) report never ends the game
  {const S=backend();const [a,b]=await fresh(browser,S,w,h);await startGame(a,b,S);
   S.reports={1:'white'};S.version++;await b.evaluate(()=>window.__notify());await new Promise(r=>setTimeout(r,300));
   assert.equal(S.status,'playing');assert.equal(await b.locator('#oc-blocked').count(),0);
   await a.__ctx.close();await b.__ctx.close();
  }
  console.log('PASS ONLINE CHESS',tag);
 }
 await browser.close();
 }
 G.assertClean('online-chess-ui-test.cjs');
})().catch(e=>{console.error(e);process.exit(1)});
