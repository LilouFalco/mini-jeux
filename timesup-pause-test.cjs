const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';const K='lilou-timesup-v1';
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const st=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),K);
await p.goto(B+'timesup.html');await p.evaluate(()=>localStorage.clear());await p.reload();
assert((await p.locator('#c3').getAttribute('disabled'))!==null,'40 disabled with 30 cards');assert(/cartes avec ces/.test(await p.locator('.note').innerText()));
await p.locator('#go').tap();await p.waitForTimeout(700);await p.locator('#st').tap();await p.waitForSelector('#ok');
await p.waitForTimeout(350);await p.locator('#ok').tap();await p.waitForTimeout(1300);
await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.waitForSelector('#st');
let s=await st();assert.equal(s.pause.found,1);assert(s.pause.rem>26500&&s.pause.rem<28800,s.pause.rem);const rem=s.pause.rem;
assert(/Reprendre/.test(await p.locator('#st').innerText()));
await p.waitForTimeout(2500);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));s=await st();assert.equal(s.pause.rem,rem);
await p.reload();s=await st();assert.equal(s.pause.rem,rem);await p.locator('#resume').tap();await p.waitForSelector('#st');assert(/1 trouvée/.test(await p.locator('#st').innerText()));
await p.waitForTimeout(700);await p.locator('#st').tap();await p.waitForSelector('#ok');
const tm=parseInt(await p.locator('#tm').innerText());assert(tm<=Math.ceil(rem/1000)&&tm>=Math.floor(rem/1000)-1,tm+' vs '+rem);
await p.waitForTimeout(350);await p.locator('#ok').tap();assert.equal((await st()).pause,null);
assert.equal((await st()).G.found.length,2);
await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await st()).pause.found,2);
assert.equal(errs.length,0,errs.join());console.log('ok',n);await br.close()}console.log('pause ok')})().catch(e=>{console.log('FAIL',e.stack.slice(0,500));process.exit(1)})