const {chromium}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
const pages=[['sudoku.html','lilou-sudoku-v1'],['mots-fleches.html','lilou-motsfleches-v1'],['binairo.html','lilou-binairo-v1'],['demineur.html','lilou-demineur-v1']];
(async()=>{const b=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
 for(const width of [1440,390]){
  const c=await b.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'sudoku.html');await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller||true);
  await p.reload();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await p.waitForFunction(async()=>{const k=await caches.keys();return k.includes('lilou-yakazu-v23')&&(await (await caches.open('lilou-yakazu-v12')).keys()).length>=35});
  const cached=await p.evaluate(async()=>(await (await caches.open('lilou-yakazu-v23')).keys()).map(r=>new URL(r.url).pathname.split('/').pop()||'./'));
  for(const f of ['sudoku.html','mots-fleches.html','binairo.html','sudoku-worker.js','mf-worker.js','binairo-worker.js','demineur.html','demineur-engine.js','mf-words.js','games.css'])assert(cached.includes(f),'not cached '+f);
  await c.setOffline(true);
  for(const [page,key] of pages){
   await p.goto(BASE+page);await p.waitForFunction(()=>document.querySelector('#board .cell')&&document.querySelector('#loading').hidden);
   const ids=new Set();
   for(let level=0;level<4;level++){await p.locator('[data-level="'+level+'"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace');
    await p.waitForFunction(([k,l])=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem(k)).level===l,[key,level],{timeout:30000});ids.add(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).id,key));}
   assert.equal(ids.size,4);
   const saved=await p.evaluate(k=>localStorage.getItem(k),key);await p.reload();await p.waitForFunction(()=>document.querySelector('#board .cell'));
   assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),saved);
  }
  // saves are separate
  const keys=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('lilou-')));
  assert(['lilou-sudoku-v1','lilou-motsfleches-v1','lilou-binairo-v1'].every(k=>keys.includes(k)));
  await p.goto(BASE+'yakazu.html');await p.waitForFunction(()=>document.querySelector('#board .cell'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(width+' offline: 3 new pages cached, fresh generation x4 levels each, reload keeps separate saves PASS');await c.close();}
 await b.close()})().catch(e=>{console.error(e);process.exit(1)});