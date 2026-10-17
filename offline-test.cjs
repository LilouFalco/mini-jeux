const {chromium}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
 for(const width of [1440,390]){
 const c=await b.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.BASE||'http://localhost:28461/');
 await p.evaluate(()=>navigator.serviceWorker.ready);
 await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const resources=await p.evaluate(async()=>{
 const manifest=await(await fetch('manifest.webmanifest')).json();
 const cache=await caches.open('lilou-yakazu-v2');return {manifest,keys:(await cache.keys()).map(r=>r.url)};
 });
 assert.equal(resources.manifest.display,'standalone');assert.equal(resources.manifest.icons.length,2);assert.equal(resources.keys.length,18);
 await p.waitForFunction(()=>!!localStorage.getItem('lilou-yakazu-v1'));
 await c.setOffline(true);await p.reload({waitUntil:'load'});
 await p.waitForFunction(()=>!!document.querySelector('#board .cell')&&document.querySelector('#loading').hidden);
 assert(await p.evaluate(()=>document.fonts.ready.then(()=>document.fonts.check('14px "DM Sans"'))));
 await p.evaluate(async()=>{for(const url of ['icons/icon-192.png','icons/icon-512.png','engine.js','worker.js','fonts.css','manifest.webmanifest']){const r=await fetch(url);if(!r.ok)throw Error(url)}});
 let first=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-yakazu-v1')).id);
 for(let level=0;level<4;level++){
 await p.locator('[data-level="'+level+'"]').click();await p.waitForFunction(l=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-yakazu-v1')).level===l,level);
 assert.notEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-yakazu-v1')).id),first);
 }
 await p.evaluate(()=>{const g=JSON.parse(localStorage.getItem('lilou-yakazu-v1'));const i=g.givens.findIndex((v,i)=>!v&&!g.black[i]);document.querySelector('.cell[data-i="'+i+'"]').click();document.querySelectorAll('#pad button')[g.solution[i]-1].click()});
 const saved=await p.evaluate(()=>localStorage.getItem('lilou-yakazu-v1'));
 await p.reload({waitUntil:'load'});assert.equal(await p.evaluate(()=>localStorage.getItem('lilou-yakazu-v1')),saved);
 assert.equal(errors.length,0,errors.join('\n'));await p.screenshot({path:'/tmp/yakazu-offline-'+width+'.png',fullPage:true});
 console.log(width+' offline reload, all assets, local fonts, four fresh puzzle levels, input and saved progress PASS');
 await c.close();
 }await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
