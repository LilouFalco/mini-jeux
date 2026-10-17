const {chromium}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
for(const width of [1440,390,360]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.BASE||'http://localhost:28461')+'/yakazu.html');await page.waitForFunction(()=>!!document.querySelector('#board .cell'));
 await page.waitForFunction(()=>document.querySelector('#loading').hidden);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lilou-yakazu-v1')));
 let g=await state(),i=g.givens.findIndex((v,i)=>!v&&!g.black[i]),v=g.solution[i];
 await page.locator('.cell[data-i="'+i+'"]').click();await page.locator('#notes').click();await page.locator('#pad button').nth(v-1).click();
 assert((await state()).notes[i].includes(v));await page.locator('#notes').click();
 await page.locator('#pad button').nth(v-1).click();assert.equal((await state()).values[i],v);
 await page.reload();await page.waitForSelector('#board .cell');assert.equal((await state()).values[i],v);
 await page.locator('.cell[data-i="'+i+'"]').click();await page.locator('#erase').click();assert.equal((await state()).values[i],0);
 let wrong=v===1?2:1;await page.locator('#pad button').nth(wrong-1).click();await page.locator('#check').check();assert(await page.locator('.cell[data-i="'+i+'"]').evaluate(e=>e.classList.contains('error')));
 await page.locator('#hint').click();assert.equal((await state()).values[i],wrong);await page.locator('#erase').click();await page.locator('#hint').click();assert.equal((await state()).values[i],v);
 await page.locator('[data-level="1"]').click();assert(await page.locator('#confirm').evaluate(e=>e.open));await page.locator('#cancel').click();assert.equal((await state()).level,0);
 for(let level=1;level<=3;level++){
  await page.locator('[data-level="'+level+'"]').click();
  if(await page.locator('#confirm').evaluate(e=>e.open))await page.locator('#replace').click();
  await page.waitForFunction(l=>document.querySelector('#loading').hidden&&document.querySelector('#board').dataset.size===String([5,7,9,10][l]),level);
  g=await state();assert.equal(g.level,level);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/yakazu-'+width+'-'+level+'.png',fullPage:true});
 }
 // Complete current puzzle through the actual input handler.
 await page.evaluate(()=>{
  const g=JSON.parse(localStorage.getItem('lilou-yakazu-v1'));
  for(let i=0;i<g.values.length;i++)if(!g.black[i]&&!g.givens[i]){
   document.querySelector('.cell[data-i="'+i+'"]').click();document.querySelectorAll('#pad button')[g.solution[i]-1].click();
  }
 });
 assert(await page.locator('#win').evaluate(e=>e.open));assert((await state()).won);
 await page.locator('#stay').click();await page.locator('#new').click();await page.waitForFunction(()=>document.querySelector('#loading').hidden&&!JSON.parse(localStorage.getItem('lilou-yakazu-v1')).won);
 assert.equal(errors.length,0,errors.join('\n'));console.log(width+' notes, entries, errors, hints, save, levels, overflow, win, next PASS');await page.close();
}
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
