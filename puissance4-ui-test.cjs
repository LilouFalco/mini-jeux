const {chromium}=require('/tmp/qa/node_modules/playwright');
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const p=await br.newPage({viewport:{width:390,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:28461/puissance4.html');
await p.click('[data-mode=two]');await p.waitForTimeout(100);
for(const c of [0,1,0,1,0,1,0])await p.locator('#colbtns button').nth(c).click();
const t=await p.textContent('#status');if(!/gagné/.test(t))throw new Error(t);
if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('overflow');
await p.screenshot({path:'/tmp/p4a.png'});
await p.click('[data-mode=hard]');await p.waitForTimeout(100);await p.locator('#colbtns button').nth(3).click();await p.waitForTimeout(900);
if(await p.locator('.pcell.p2').count()!==1)throw new Error('no ai move');
if(errs.length)throw new Error(errs.join());console.log('ui ok');await br.close()})()