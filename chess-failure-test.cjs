const pw=require('/tmp/qa/node_modules/playwright'),assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/',KEY='lilou-chess-v1';
(async()=>{for(const eng of ['chromium','webkit']){
const br=await pw[eng].launch(eng==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{}),c=await br.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true,serviceWorkers:'block'});
await c.addInitScript(()=>{window.Worker=class{constructor(){throw Error('Worker unavailable')}}});
const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(B+'chess.html?mode=solo');
await p.locator('[data-square=e2]').tap();await p.locator('[data-square=e4]').tap();await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).moves.length===2,KEY);assert((await p.locator('#status').textContent()).includes('secours légal'));
await p.locator('#undo').tap();assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).moves.length,KEY),0);
await p.locator('[data-square=d2]').tap();await p.locator('[data-square=d4]').tap();await p.locator('#new').tap();await p.locator('#accept-new').tap();await p.waitForTimeout(500);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).moves.length,KEY),0);
assert.deepEqual(errors,[]);console.log(eng,'missing worker legal fallback + reset/undo pass');await br.close();
}
// Local storage unavailable is nonfatal; playing/undo still works.
const br=await pw.chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}),c=await br.newContext({serviceWorkers:'block'});await c.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('Quota exceeded')};Storage.prototype.getItem=()=>{throw Error('Blocked storage')}});const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(B+'chess.html?mode=duo');await p.locator('[data-square=e2]').click();await p.locator('[data-square=e4]').click();assert((await p.locator('#last-move').textContent()).includes('e4'));await p.locator('#undo').click();assert((await p.locator('#last-move').textContent()).includes('Touche'));assert.deepEqual(errors,[]);await br.close();console.log('storage read/write errors safely handled');
})().catch(e=>{console.error(e);process.exit(1)});
