const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});let bad=0;
for(const [w,h,m] of [[1440,900,0],[390,844,1],[360,640,1]]){const c=await br.newContext({viewport:{width:w,height:h},hasTouch:!!m,isMobile:!!m});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(B+'undercover.html?players=10');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(400);
const fit=async t=>{if(!m)return;await p.waitForTimeout(150);const r=await p.evaluate(()=>{const d=document.documentElement;const top=document.querySelector('.mtop').getBoundingClientRect().bottom,bar=document.querySelector('.mbar').getBoundingClientRect().top;const v=document.querySelector('#v');const out=[];for(const e of v.querySelectorAll('button,input')){if(e.disabled)continue;const q=e.getBoundingClientRect();const vr=v.getBoundingClientRect();if(q.bottom>vr.bottom+1||q.top<vr.top-1)out.push((e.id||e.textContent)+'')}return{ns:d.scrollHeight===d.clientHeight,out,vs:v.scrollHeight>v.clientHeight}});if(!r.ns){bad++;console.log(w,t,'PAGE SCROLLS')}console.log(w,t,JSON.stringify(r))};
assert.equal(await p.locator('.names input').count(),10);await fit('setup10');
await p.locator('#mw').click();await p.locator('[data-t=lol]').click();await p.locator('[data-t=anime]').click();
for(let k=0;k<7;k++)await p.locator('#m').click();assert.equal(await p.locator('#cnt').textContent(),'3');assert(await p.locator('#mw').isDisabled());
await p.locator('#p').click();await p.locator('#p').click();await p.locator('input').first().fill('Lilou');
await p.locator('#go').click();const words=[];
for(let i=0;i<5;i++){await p.locator('#see').click();words.push(await p.locator('.word').textContent());if(i==0)await fit('reveal');await p.locator('#hide').click()}
assert.equal(words.filter(x=>x==='Aucun mot').length,1);await fit('talk');
await p.locator('#vote').click();await fit('vote');
// eliminate until end
let guard=0;while(guard++<10){if(await p.locator('#again').count())break;if(await p.locator('#vote').count()){await p.locator('#vote').click();continue}
 if(await p.locator('#ok').count()){await p.locator('.plist button:not([disabled])').first().click();await p.locator('#ok').click();continue}
 if(await p.locator('#gok').count()){await p.locator('#gs').fill('zzz');await p.locator('#gok').click();continue}
 if(await p.locator('#nx').count()){await p.locator('#nx').click();continue}}
assert(await p.locator('#again').count(),'game ended');await fit('end');
const sc=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-undercover-v1')).scores);assert(Object.keys(sc).length>0,'scores');
await p.goto(B+'undercover.html');assert(await p.locator('#go').count());assert.equal(await p.locator('#cnt').textContent(),'5');
assert(!errs.length,errs.join());await c.close()}
console.log(bad?'FAIL':'undercover ui ok');await br.close();process.exit(bad?1:0)})()