const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const pages=['index','sudoku','binairo','mots-fleches','demineur','morpion','puissance4'];
for(const w of [390,360]){const c=await br.newContext({viewport:{width:w,height:780},hasTouch:true,isMobile:true,deviceScaleFactor:2});
for(const f of pages){const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(B+(f==='index'?'':f+'.html'));await p.waitForTimeout(400);
 assert(await p.locator('.mbar:visible').count(),'bar '+f);assert.equal(await p.locator('.mbar button').count(),4);
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(ov<=1,'overflow '+f+' '+w+' '+ov);
 const small=await p.evaluate(()=>[...document.querySelectorAll('.mbar button,.mback,.mclose')].filter(e=>e.offsetParent&&(e.getBoundingClientRect().height<44||e.getBoundingClientRect().width<44)).length);assert.equal(small,0,'tap size '+f);
 assert(!(await p.locator('.has-mnav>main>header').isVisible()),'old header hidden');
 const pos=await p.evaluate(()=>{const r=document.querySelector('.mbar').getBoundingClientRect();return Math.round(r.bottom)===innerHeight});assert(pos,'bar fixed bottom');
 await p.locator('.mbar button[data-k=deux]').tap();assert.equal(await p.locator('.msheet:visible .mtile').count(),5);assert.equal(await p.locator('.msheet a.mtile').count(),2);assert.equal(await p.locator('.msheet .mtile.soon').count(),3);
 await p.keyboard.press('Escape');assert(!(await p.locator('.msheet:visible').count()));
 await p.locator('.mbar button[data-k=home]').tap();assert.equal(await p.locator('.msheet a.mtile').count(),7);if(f==='index'&&w===390)await p.screenshot({path:'/tmp/mob-home-sheet.png'});
 await p.locator('.mbar button[data-k=home]').tap();assert(!(await p.locator('.msheet:visible').count()));
 await p.locator('.mbar button[data-k=lol]').tap();assert.equal(await p.locator('.msheet a.mtile').count(),0);assert.equal(await p.locator('.msheet .mtile.soon').count(),1);await p.locator('.mclose').tap();
 const vp=await p.evaluate(()=>document.querySelector('meta[name=viewport]').content);assert(/user-scalable=no/.test(vp));
 if(w===390)await p.screenshot({path:'/tmp/mob-'+f+'.png'});
 assert(!errs.length,errs.join());await p.close()}
// navigate via tile
const p=await c.newPage();await p.goto(B+'demineur.html');await p.locator('.mbar button[data-k=deux]').tap();await p.locator('.msheet a.mtile',{hasText:'Morpion'}).tap();await p.waitForURL(/morpion/);
await p.locator('.mback').tap();await p.waitForURL(u=>!/morpion/.test(u.href));await c.close()}
// desktop unchanged
const d=await br.newPage({viewport:{width:1440,height:900}});await d.goto(B+'demineur.html');
assert(!(await d.locator('.mbar').isVisible()));assert(!(await d.locator('.mtop').isVisible()));assert(await d.locator('.games').isVisible());assert(await d.locator('.intro').isVisible());
await d.screenshot({path:'/tmp/mob-desktop.png'});console.log('mobile nav ok');await br.close()})().catch(e=>{console.error(e);process.exit(1)})