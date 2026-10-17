const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:n!=='firefox'});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(B+'undercover.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.locator('#go').tap();
const word=()=>p.locator('#hide').count();
await p.locator('#see').tap();assert(await word(),'secret shown');
// rapid double tap on hide: second tap lands on new #see at same position
await p.waitForTimeout(450);const h=await p.locator('#hide').boundingBox();
await p.evaluate(()=>{const h=document.querySelector('#hide');h.click();h.click();const s=document.querySelector('#see');if(s)s.click()});
assert.equal(await word(),0,n+' double click revealed next secret');
await p.touchscreen.tap(h.x+h.width/2,h.y+h.height/2);await p.touchscreen.tap(h.x+h.width/2,h.y+h.height/2);
assert.equal(await word(),0,n+' double tap revealed next');
await p.waitForTimeout(700);await p.locator('#see').tap();assert(await word(),'next shows after lock');
// background: hide
await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
assert.equal(await word(),0,n+' secret visible after background');
await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
assert.equal(await word(),0,n+' secret back after restore');
await p.waitForTimeout(700);assert(await p.locator('#see').count(),'cover with see button');
await p.evaluate(()=>{window.dispatchEvent(new Event('pagehide'))});
assert.equal(errs.length,0,errs.join());console.log(n,'undercover secret ok');await br.close()}})().catch(e=>{console.log('FAIL',e.message);process.exit(1)})