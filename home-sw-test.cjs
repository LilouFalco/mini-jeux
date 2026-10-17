const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
assert.deepEqual(await (async()=>{await p.goto('about:blank');return[]})(),[]);
await p.goto(B);assert.equal(await p.evaluate(()=>caches.keys().then(k=>k.length)),0|await p.evaluate(()=>0));
await p.waitForFunction(()=>/Prêt hors connexion/.test(document.body.textContent),null,{timeout:20000});
const sw=await (await fetch(B+'sw.js')).text();const ver=sw.match(/lilou-yakazu-v\d+/)[0];
const files=[...sw.match(/FILES=\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]).filter(x=>/\.(html|js|css)$|^\.\/$/.test(x));
const miss=await p.evaluate(async([v,f])=>{const ca=await caches.open(v);const o=[];for(const x of f)if(!(await ca.match(new URL(x,location.href).href)))o.push(x);return o},[ver,files]);
assert.equal(miss.length,0,n+' ready shown before precache complete: '+miss);
await c.setOffline(true);await p.reload();await p.waitForSelector('.mode[data-k=solo]');
await p.locator('.mode[data-k=duo]').tap();await p.locator('.msheet a.mtile',{hasText:'Morpion'}).tap();await p.waitForURL(/morpion/);await p.waitForSelector('#board .mcell');
await p.locator('#board .mcell').first().tap();assert(await p.locator('#board .mcell').first().textContent(),n+' morpion not playable offline');
await p.goto(B);await p.locator('.mode[data-k=solo]').tap();await p.locator('.msheet a.mtile',{hasText:'Sudoku'}).tap();await p.waitForURL(/sudoku/);await p.waitForSelector('#board .cell, #board *');
assert.equal(errs.length,0,errs.join());console.log(n,'home sw fresh/offline ok');await br.close()}})().catch(e=>{console.log('FAIL',e.message.slice(0,300));process.exit(1)})