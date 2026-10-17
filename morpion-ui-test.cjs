const {chromium}=require('/tmp/qa/node_modules/playwright');const {execSync}=require('child_process');
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const p=await br.newPage({viewport:{width:390,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:28461/morpion.html');
await p.click('[data-mode=two]');await p.waitForTimeout(100);
for(const i of [0,3,1,4,2])await p.locator('.mcell').nth(i).click();
const t=await p.textContent('#status');if(!/gagné/.test(t))throw new Error(t);
const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(ov)throw new Error('overflow');
await p.click('[data-mode=hard]');await p.waitForTimeout(100);await p.locator('.mcell').nth(4).click().catch(()=>{});await p.waitForTimeout(700);
if(!(await p.locator('.mcell.p2').count()))throw new Error('no ai move');
if(errs.length)throw new Error(errs.join());await p.screenshot({path:'/tmp/morpion.png'});console.log('ui ok');await br.close()})()