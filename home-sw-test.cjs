const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
assert.deepEqual(await (async()=>{await p.goto('about:blank');return[]})(),[]);
// A new browser context is empty, but navigation may already create the cache.
// Assert complete precache after ready below, not a racy zero-cache snapshot.
await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(B).origin?r.continue():r.abort()});await p.goto(B);
await p.waitForFunction(()=>/Prêt hors connexion/.test(document.body.textContent),null,{timeout:20000});
const sw=await (await fetch(B+'sw.js')).text();const ver=sw.match(/rouky-games-v\d+/)[0];
const files=[...sw.match(/FILES=\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]).filter(x=>/\.(html|js|css)$|^\.\/$/.test(x));
const PG=['yakazu','sudoku','binairo','demineur','champdle','chess','morpion','puissance4','naval','quiestce','petitbac','undercover','timesup'].map(x=>x+'.html');const pm=PG.filter(x=>!files.includes(x));assert.equal(pm.length,0,n+' pages missing from precache: '+pm);assert.equal(ver,'rouky-games-v37','cache version');
await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(B).origin?r.continue():r.abort()});
const miss=await p.evaluate(async([v,f])=>{const ca=await caches.open(v);const o=[];for(const x of f)if(!(await ca.match(new URL(x,location.href).href)))o.push(x);return o},[ver,files]);
assert.equal(miss.length,0,n+' ready shown before precache complete: '+miss);
await c.setOffline(true);await p.reload();await p.waitForSelector('.mbar button[data-k=solo]');
await p.locator('.mbar button[data-k=duo]').tap();await p.locator('.msheet a.mtile',{hasText:'Morpion'}).tap();await p.waitForURL(/morpion/);await p.waitForSelector('#board .mcell');
await p.locator('#board .mcell').first().tap();assert(await p.locator('#board .mcell').first().textContent(),n+' morpion not playable offline');
await p.goto(B);await p.locator('.mbar button[data-k=solo]').tap();await p.locator('.msheet a.mtile',{hasText:'Sudoku'}).tap();await p.waitForURL(/sudoku/);await p.waitForSelector('#board .cell, #board *');
assert.equal(errs.length,0,errs.join());console.log(n,'home sw fresh/offline ok');await br.close()}})().catch(e=>{console.log('FAIL',e.message.slice(0,300));process.exit(1)})