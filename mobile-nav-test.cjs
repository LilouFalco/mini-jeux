const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const pages=['index','yakazu','sudoku','binairo','mots-fleches','demineur','morpion','puissance4'];
for(const w of [390,360]){const c=await br.newContext({viewport:{width:w,height:780},hasTouch:true,isMobile:true,deviceScaleFactor:2});
for(const f of pages){const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(B+(f==='index'?'':f+'.html'));await p.waitForTimeout(400);
 assert(await p.locator('.mbar:visible').count(),'bar '+f);assert.equal(await p.locator('.mbar button').count(),3);
 assert.deepEqual(await p.locator('.mbar button span').allTextContents(),['SOLO','DUO','MULTI']);
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(ov<=1,'overflow '+f+' '+w+' '+ov);
 const small=await p.evaluate(()=>[...document.querySelectorAll('.mbar button,.mback,.mclose,.mode')].filter(e=>e.offsetParent&&(e.getBoundingClientRect().height<44||e.getBoundingClientRect().width<44)).length);assert.equal(small,0,'tap size '+f);
 assert(!(await p.locator('.has-mnav>main>header').isVisible()),'old header hidden');
 assert(await p.evaluate(()=>Math.round(document.querySelector('.mbar').getBoundingClientRect().bottom)===innerHeight),'bar fixed');
 const counts={solo:[9,7],duo:[5,2],multi:[3,0]};
 for(const k of ['solo','duo','multi']){await p.locator('.mbar button[data-k='+k+']').tap();assert.equal(await p.locator('.msheet:visible .mtile').count(),counts[k][0],k+' tiles');assert.equal(await p.locator('.msheet a.mtile').count(),counts[k][1],k+' links');await p.keyboard.press('Escape');assert(!(await p.locator('.msheet:visible').count()))}
 await p.locator('.mbar button[data-k=solo]').tap();await p.locator('.mbar button[data-k=solo]').tap();assert(!(await p.locator('.msheet:visible').count()));
 assert(/user-scalable=no/.test(await p.evaluate(()=>document.querySelector('meta[name=viewport]').content)));
 if(w===390){await p.screenshot({path:'/tmp/mob-'+f+'.png'});if(f==='index'){await p.locator('.mbar button[data-k=duo]').tap();await p.waitForTimeout(600);await p.screenshot({path:"/tmp/mob-sheet-duo.png"})}}
 assert(!errs.length,errs.join());await p.close()}
// home choices
let p=await c.newPage();await p.goto(B);await p.evaluate(()=>localStorage.clear());await p.reload();assert.equal(await p.locator('.mode').count(),3);assert(await p.locator('#glist').isHidden());
await p.locator('.mode[data-k=multi]').tap();assert.equal(await p.locator('.gtile').count(),3);assert.equal(await p.locator('.gtile a, a.gtile').count(),0);
await p.locator('.mode[data-k=duo]').tap();await p.locator('a.gtile',{hasText:'Morpion'}).tap();await p.waitForURL(/morpion\.html\?mode=duo/);
assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-morpion-v1')||'{}').mode||document.querySelector('[data-mode][aria-pressed=true]').dataset.mode),'two');
assert.equal(await p.locator('.mbar button[aria-current=page]').getAttribute('data-k'),'duo');
await p.locator('.mback').tap();await p.waitForURL(u=>!/morpion/.test(u.href));assert.equal(await p.locator('.mode[aria-pressed=true]').getAttribute('data-k'),'duo','mode remembered');
await p.goto(B+'puissance4.html?mode=solo');assert.equal(await p.locator('[data-mode][aria-pressed=true]').getAttribute('data-mode'),'easy');
await p.goto(B+'puissance4.html?mode=duo');assert.equal(await p.locator('[data-mode][aria-pressed=true]').getAttribute('data-mode'),'two');
await p.goto(B+'yakazu.html');assert(await p.locator('#board .cell').first().waitFor().then(()=>true));
await c.close()}
const d=await br.newPage({viewport:{width:1440,height:900}});await d.goto(B);assert(!(await d.locator('.mbar').isVisible()));assert.equal(await d.locator('.mode').count(),3);
await d.locator('.mode[data-k=solo]').click();assert.equal(await d.locator('a.gtile').count(),7);await d.screenshot({path:'/tmp/desk-home.png'});
await d.goto(B+'demineur.html');assert(!(await d.locator('.mbar').isVisible()));assert(await d.locator('.games').isVisible());assert(await d.locator('.intro').isVisible());
await d.goto(B+'yakazu.html');assert(await d.locator('.games a[href="yakazu.html"]').isVisible());
console.log('mobile nav + home ok');await br.close()})().catch(e=>{console.error(e);process.exit(1)})