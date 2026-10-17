const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';
const E=require('./qe-engine.js');const fs=require('fs');
assert.equal(E.ROSTER.length,173);for(const c of E.ROSTER)assert(fs.existsSync('lol/'+c.id+'.webp'),c.id);
for(let k=0;k<200;k++){const a=E.pick(24);assert.equal(new Set(a).size,24)}
assert.equal(E.judge(['a','b'],['a','b'],0,1),0);assert.equal(E.judge(['a','b'],['a','b'],0,0),1);
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]])for(const [w,h] of [[360,640],[390,844]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const fit=async tag=>{const r=await p.evaluate(()=>{const b=document.querySelector('.mbar').getBoundingClientRect().top;let out=[];document.querySelectorAll('#v button,#v .qc,#v input').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.bottom>b+.5||r.right>innerWidth+.5||r.left<-.5))out.push(e.className||e.id)});const q=document.querySelector('.qc img');return{sh:document.documentElement.scrollHeight-innerHeight,out,img:q?Math.round(q.getBoundingClientRect().width):0}});assert.equal(r.sh,0,tag+' scroll');assert.equal(r.out.length,0,tag+' out '+r.out);return r};
await p.goto(B+'quiestce.html');await p.evaluate(()=>localStorage.clear());await p.reload();await fit('setup');
await p.locator('#go').tap();assert(await p.locator('#ok').isDisabled(),'cover locked');await p.waitForTimeout(600);
assert.equal(await p.locator('.qc').count(),0,'no board on cover');await p.locator('#ok').tap();
assert.equal(await p.locator('.qc').count(),24);const f1=await fit('pick');assert(f1.img>=40,'img '+f1.img);
const champs=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-quiestce-v1')).champs);assert.equal(new Set(champs).size,24);
await p.locator('.qc').nth(3).tap();await p.locator('#conf').tap();await p.waitForTimeout(600);
assert.equal(await p.locator('.qc').count(),0,'secret hidden at handoff');
// double tap on ok must not reveal player2 board
await p.locator('#ok').tap();await p.waitForTimeout(0);
const champs2=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-quiestce-v1')).champs);assert.deepEqual(champs,champs2,'same champions both');
await p.locator('.qc').nth(5).tap();await p.locator('#conf').tap();await p.waitForTimeout(600);
let st=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-quiestce-v1')));assert.deepEqual(st.secret,[3,5]);
await p.locator('#ok').tap();await p.waitForSelector('#end');await fit('play');
await p.locator('.qc').nth(0).tap();await p.locator('.qc').nth(1).tap();assert.equal(await p.locator('.qc.x').count(),2);
await p.locator('#end').tap();await p.waitForTimeout(600);assert.equal(await p.locator('.qc').count(),0);await p.locator('#ok').tap();
assert.equal(await p.locator('.qc.x').count(),0,'separate elimination boards');await p.locator('.qc').nth(2).tap();
// secret view toggle & background privacy
await p.locator('#me').tap();assert(await p.locator('.secret').count());
await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
assert.equal(await p.locator('.qc').count(),0,'hidden on background');assert.equal(await p.locator('.secret').count(),0);
await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false})});await p.waitForTimeout(600);await p.locator('#ok').tap();
assert.equal(await p.locator('.secret').count(),0);
// guess wrong -> other wins ; reload mid game persists
await p.reload();await p.waitForSelector('#ok');assert.equal(await p.locator('.qc').count(),0,'reload covered');await p.waitForTimeout(600);await p.locator('#ok').tap();
await p.locator('#guess').tap();await fit('guess');await p.locator('.qc').nth(0).tap();await p.locator('#conf').tap();
await p.waitForSelector('#again');await fit('end');const txt=await p.locator('.qe.end').innerText();assert(/gagne la manche/.test(txt));
await p.locator('#again').tap();await p.waitForSelector('#go');assert.equal(errs.length,0,errs.join());console.log('ok',n,w,h);await br.close()}
console.log('qe ok')})().catch(e=>{console.log('FAIL',e.message.slice(0,400));process.exit(1)})