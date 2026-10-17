const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
for(const w of [1440,390,360]){const p=await br.newPage({viewport:{width:w,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:28461/naval.html');
// vs AI auto
await p.click('#start-auto');await p.click('#ok');await p.waitForSelector('#g-main .nc');
for(let n=0;n<3000&&!(await p.locator('#again:visible').count());n++){const b=p.locator('#g-main .nc:not([disabled])');if(await b.count())await b.first().click({timeout:3000}).catch(()=>{});await p.waitForTimeout(await b.count()?30:200)}
assert(await p.locator('#again:visible').count(),'game finished');
// manual placement
await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.click('#start-manual');
for(let k=0;k<5;k++){await p.locator('#g-main .nc').nth(k*20).click()}
assert(!(await p.locator('#ok').isDisabled()),'fleet placed');
// two players
await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.click('[data-mode=two]');await p.click('#start-auto');
assert(await p.locator('#cover:visible').count(),'cover');await p.click('#cover-btn');await p.click('#ok');await p.click('#cover-btn');await p.click('#ok');assert(await p.locator('#cover:visible').count());await p.click('#cover-btn');
assert(await p.locator('#g-main .nc').count()===100);
if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('overflow '+w);
await p.screenshot({path:'/tmp/naval-'+w+'.png',fullPage:true});
assert(!errs.length,errs.join());console.log(w,'naval ui ok');await p.close()}
await br.close()})().catch(e=>{console.error(e);process.exit(1)})