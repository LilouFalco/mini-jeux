const pw=require('/tmp/qa/node_modules/playwright'),assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/',KEY='lilou-chess-v1';
(async()=>{
for(const eng of ['chromium','webkit']){
const br=await pw[eng].launch(eng==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{}),c=await br.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true}),p=await c.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
await p.goto(B);await p.waitForFunction(async()=>{const c=await caches.open('lilou-yakazu-v25');return (await c.keys()).length>200&&!!(await c.match(new URL('chess-worker.mjs',location.href).href))},{},{timeout:60000});
await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
const assets=await p.evaluate(async()=>{const c=await caches.open('lilou-yakazu-v25');return Promise.all(['chess.html','chess.css','chess.mjs','chess-engine.mjs','chess-worker.mjs','vendor/chess.mjs','vendor/chess-LICENSE.txt'].map(async f=>{const r=await c.match(new URL(f,location.href).href);return r?.status}))});assert.deepEqual(assets,Array(7).fill(200));
await c.setOffline(true);
await p.goto(B+'chess.html?mode=solo');await p.waitForSelector('.chess-cell');assert.equal(await p.locator('.chess-cell').count(),64);
await p.locator('#settings').tap();await p.locator('#mode').selectOption('medium');assert(!(await p.locator('#options').isVisible()));
await p.locator('[data-square=e2]').tap();await p.locator('[data-square=e4]').tap();await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).moves.length===2,KEY,{timeout:10000});assert((await p.locator('#status').textContent()).includes('Lilou'));
await p.reload();await p.waitForSelector('.chess-cell');assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).moves.length,KEY),2);
await p.goto(B+'chess.html?mode=duo');assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).mode,KEY),'two');
await p.locator('[data-square=d2]').tap();await p.locator('[data-square=d4]').tap();await p.locator('[data-square=d7]').tap();await p.locator('[data-square=d5]').tap();assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).moves.length,KEY),2);
await p.locator('.mbar button[data-k=solo]').tap();assert.equal(await p.locator('.msheet a[href="chess.html?mode=solo"]').count(),1);await p.locator('.mclose').tap();
console.log(eng,'offline cached UI + module worker + reload + duo pass');assert.deepEqual(errors,[]);await br.close();
}
})().catch(e=>{console.error(e);process.exit(1)});
