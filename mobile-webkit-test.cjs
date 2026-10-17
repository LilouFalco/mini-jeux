const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
const pages=['','yakazu.html','sudoku.html','binairo.html','mots-fleches.html','demineur.html','morpion.html?mode=duo','puissance4.html?mode=duo','naval.html','undercover.html?players=5'];
const only=process.env.ENGINE;let bad=0;const fail=(...a)=>{bad++;console.log('FAIL',...a)};
const tiles=async p=>p.evaluate(()=>[...document.querySelectorAll('.msheet .mtile')].map(e=>(e.getAttribute('href')||'soon')+'|'+e.textContent.trim()));
(async()=>{
for(const [eng,type] of [['webkit',pw.webkit],['chromium',pw.chromium]]){if(only&&only!==eng)continue;
 const br=await type.launch(eng==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
 for(const [w,h] of [[360,640],[390,844]]){for(const standalone of [false,true]){
  const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:eng!=='firefox',deviceScaleFactor:2});
  if(standalone)await c.addInitScript(()=>{const o=matchMedia.bind(window);window.matchMedia=q=>/display-mode:\s*standalone/.test(q)?Object.assign(o('all'),{matches:true,media:q}):o(q);Object.defineProperty(navigator,'standalone',{value:true})});
  const tag=eng+' '+w+'x'+h+(standalone?' standalone':'');const errs=[];
  const open=async path=>{const p=await c.newPage();p.on('pageerror',e=>errs.push(path+' '+e.message));await p.goto(B+path,{waitUntil:'load'});await p.waitForSelector('.mbar button[data-k=solo]');return p};
  // HOME: big cards == bottom tabs
  const p=await open('');
  for(const k of ['solo','duo','multi']){
   await p.locator('.mbar button[data-k='+k+']').tap();await p.waitForSelector('.msheet:not([hidden])');const viaTab=await tiles(p);const t1=await p.locator('#msh-t').textContent();
   await p.locator('.mclose').tap();await p.waitForSelector('.msheet',{state:'hidden'});
   await p.locator('.mode[data-k='+k+']').tap();await p.waitForSelector('.msheet:not([hidden])');const viaCard=await tiles(p);const t2=await p.locator('#msh-t').textContent();
   if(JSON.stringify(viaTab)!==JSON.stringify(viaCard)||t1!==t2||!viaTab.length)fail(tag,'home card!=tab',k);
   if(await p.locator('.glist:visible').count())fail(tag,'inline list visible',k);
   await p.keyboard.press('Escape');await p.waitForSelector('.msheet',{state:'hidden'})}
  // card -> tile -> game -> back
  await p.locator('.mode[data-k=solo]').tap();await p.waitForSelector('.msheet:not([hidden])');await p.locator('.msheet a.mtile',{hasText:'Sudoku'}).tap();await p.waitForURL(/sudoku/);await p.waitForSelector('.mback');
  await p.locator('.mback').tap();await p.waitForURL(u=>!/sudoku/.test(u.pathname));await p.waitForSelector('.mode[data-k=solo]');
  // backdrop closes, tab toggles
  await p.locator('.mbar button[data-k=duo]').tap();await p.waitForSelector('.msheet:not([hidden])');await p.locator('.mbar button[data-k=duo]').tap().catch(()=>{});
  if(await p.locator('.msheet:not([hidden])').count()){await p.touchscreen.tap(w/2,40);await p.waitForSelector('.msheet',{state:'hidden'})}
  await p.close();
  // EVERY PAGE
  for(const path of pages){const q=await open(path);
   const r=await q.evaluate(()=>{const d=document.documentElement;return{ns:d.scrollHeight===d.clientHeight&&d.scrollWidth<=d.clientWidth,bar:!!document.querySelector('.mbar:not([hidden])'),top:!!document.querySelector('.mtop')}});
   if(!r.ns||!r.bar||!r.top)fail(tag,path,JSON.stringify(r));
   for(const k of ['solo','duo','multi']){await q.locator('.mbar button[data-k='+k+']').tap();await q.waitForSelector('.msheet:not([hidden])');const n=(await tiles(q)).length;if(n<3)fail(tag,path,k,'tiles',n);await q.locator('.mclose').tap();await q.waitForSelector('.msheet',{state:'hidden'})}
   await q.evaluate(()=>window.scrollTo(0,400));await q.waitForTimeout(80);if(await q.evaluate(()=>scrollY)!==0)fail(tag,path,'page scrolled');
   if(path){await q.locator('.mback').tap();await q.waitForURL(u=>u.pathname.endsWith('/')||/index/.test(u.pathname));await q.waitForSelector('.mode[data-k=solo]')}
   await q.close()}
  // DEMINEUR all levels
  const d=await open('demineur.html');const dims=[[9,9],[16,16],[16,30],[24,30]];
  for(let l=0;l<4;l++){if(l>0){await d.locator('[data-level="'+l+'"]').tap();if(await d.locator('#confirm[open]').count())await d.locator('#replace').tap()}
   await d.waitForFunction(([n])=>document.querySelectorAll('#board .cell').length===n&&document.querySelector('#board').style.getPropertyValue('--cs'),[dims[l][0]*dims[l][1]]);await d.waitForTimeout(120);
   const m=await d.evaluate(()=>{const s=document.querySelector('.board-scroll'),b=document.querySelector('#board'),sr=s.getBoundingClientRect(),br=b.getBoundingClientRect(),cs=getComputedStyle(s),d=document.documentElement,bar=document.querySelector('.mbar').getBoundingClientRect().top;
    return{fit:br.left>=sr.left-1&&br.right<=sr.right+1&&br.top>=sr.top-1&&br.bottom<=sr.bottom+1&&br.bottom<=bar,noPan:s.scrollWidth<=s.clientWidth+1&&s.scrollHeight<=s.clientHeight+1,ta:cs.touchAction,ov:cs.overflowX+'/'+cs.overflowY,cell:Math.round(b.querySelector('.cell').getBoundingClientRect().width*10)/10,ns:d.scrollHeight===d.clientHeight,zoomHidden:getComputedStyle(document.querySelector('#zoom')).display==='none'}});
   if(!m.fit||!m.noPan||m.ta!=='none'||m.ov!=='hidden/hidden'||!m.ns||!m.zoomHidden||m.cell<6)fail(tag,'demineur L'+l,JSON.stringify(m));else console.log(tag,'demineur L'+l,'ok cell',m.cell);
   // touch drag must not scroll
   await d.evaluate(()=>{const s=document.querySelector('.board-scroll');s.scrollLeft=s.scrollTop=0});
   const bb=await d.locator('#board').boundingBox();await d.touchscreen.tap(bb.x+bb.width/2,bb.y+bb.height/2);
   const sc=await d.evaluate(()=>{const s=document.querySelector('.board-scroll');return[s.scrollLeft,s.scrollTop,scrollY]});if(sc.some(x=>x))fail(tag,'demineur scrolled L'+l,sc);
   const opened=await d.evaluate(()=>document.querySelectorAll('#board .cell.open').length);if(!opened)fail(tag,'tap opened nothing L'+l)}
  await d.close();
  // SW cache current
  const s=await open('sudoku.html');await s.evaluate(()=>navigator.serviceWorker.ready);const keys=await s.evaluate(()=>caches.keys());const sw=await (await fetch(B+'sw.js')).text();const ver=sw.match(/lilou-yakazu-v\d+/)[0];
  if(!keys.includes(ver))fail(tag,'sw cache',keys,ver);
  const files=[...sw.match(/FILES=\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(x=>x[1]).filter(x=>/\.(html|js|css|\/)$|^\.\/$/.test(x)&&!x.startsWith('fonts/'));
  const miss=await s.evaluate(async([v,f])=>{const ca=await caches.open(v);const o=[];for(const x of f){if(!(await ca.match(new URL(x,location.href).href)))o.push(x)}return o},[ver,files]);if(miss.length)fail(tag,'uncached',miss.join());
  await s.close();
  if(errs.length)fail(tag,'pageerrors',errs.slice(0,3).join(' | '));
  console.log(tag,'done');await c.close()}}
 await br.close()}
console.log(bad?'FAIL '+bad:'mobile webkit ok');process.exit(bad?1:0)})()