const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]])for(const offline of [false,true]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(B+'quiestce.html');
if(offline){await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>caches.keys().then(k=>k.length>0));await p.waitForTimeout(3000);await c.setOffline(true)}
for(const guesser of [0,1])for(const correct of [true,false]){
 await p.evaluate(()=>localStorage.clear());await p.reload();
 await p.locator('#go').tap();await p.waitForTimeout(600);await p.locator('#ok').tap();await p.locator('.qc').nth(3).tap();await p.locator('#conf').tap();await p.waitForTimeout(600);await p.locator('#ok').tap();await p.locator('.qc').nth(5).tap();await p.locator('#conf').tap();await p.waitForTimeout(600);await p.locator('#ok').tap();
 if(guesser===1){await p.locator('#end').tap();await p.waitForTimeout(600);await p.locator('#ok').tap()}
 const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-quiestce-v1')));assert.deepEqual(st.secret,[3,5]);
 const target=st.secret[1-guesser];const pick=correct?target:(target===0?1:0);
 await p.locator('#guess').tap();await p.locator('button.qc[data-i="'+pick+'"]').tap();await p.locator('#conf').tap();await p.waitForSelector('#again');
 const s2=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-quiestce-v1')));const winner=correct?guesser:1-guesser;
 assert.equal(s2.winner,winner,n+' off='+offline+' g'+guesser+' correct='+correct);assert.equal(s2.w[winner],1);
 const txt=await p.locator('.qe.end').innerText();assert(txt.includes(correct?'Bien deviné':'Raté'),txt);assert(txt.includes((winner===0?'Lilou':'Lulu')+' gagne'),txt)}
assert.equal(errs.length,0,errs.join());console.log('ok',n,'offline='+offline);await br.close()}console.log('qe win ok')})().catch(e=>{console.log('FAIL',e.message.slice(0,300));process.exit(1)})