const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const P=require('./petitbac-engine.js');const B=process.env.BASE||'http://localhost:28461/';
assert(!/[WXYZKQUV]/.test(P.LETTERS.join('').replace(/[U]/g,'')));assert.equal(P.nextPts(0),5);assert.equal(P.nextPts(5),10);assert.equal(P.nextPts(10),0);
const seen=new Set();let used=[];for(let i=0;i<P.LETTERS.length;i++){const l=P.pickLetter(used);assert(!seen.has(l));seen.add(l);used.push(l)}
assert.deepEqual(P.totals(3,{a:[10,5,0],b:[5,5,10]}),[15,10,10]);assert.deepEqual(P.leaders([15,10,15]),[0,2]);
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]])for(const [w,h] of [[360,640],[390,844]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(B+'petitbac.html');await p.evaluate(()=>localStorage.clear());await p.reload();
const fit=async tag=>{const o=await p.evaluate(()=>({s:document.documentElement.scrollHeight,c:document.documentElement.clientHeight}));assert(o.s<=o.c,tag+' '+JSON.stringify(o))};
await fit('setup');for(let i=0;i<7;i++)await p.locator('#p').tap();assert.equal(await p.locator('#cnt').innerText(),'10');
await p.locator('[data-c=jv]').tap();await p.locator('[data-c=lol]').tap();await p.locator('[data-t="60"]').tap();
for(let i=0;i<7;i++)await p.locator('#m').tap();await p.locator('#go').tap();await p.waitForSelector('#stop');await fit('play');
const letter=await p.locator('#lt').innerText();assert(/^[A-Z]$/.test(letter));assert.equal(await p.locator('.cat').count(),8);
await p.waitForTimeout(700);await p.locator('#stop').tap();await p.waitForSelector('#done');await fit('score');
await p.locator('[data-c=prenom][data-i="0"]').tap();await p.locator('[data-c=prenom][data-i="0"]').tap();await p.locator('[data-c=animal][data-i="1"]').tap();
const tot=await p.locator('.tot').innerText();assert(tot.includes('Lilou 10')&&tot.includes('Lulu 5'),tot);
await p.locator('#done').scrollIntoViewIfNeeded();await p.locator('#done').tap();await p.waitForSelector('#nx');assert((await p.locator('.card').innerText()).includes('Lilou en tête'));await fit('total');
const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-petitbac-v1')));assert.deepEqual(st.tot,[10,5,0].slice(0,st.n));
await p.reload();await p.locator('#nx').count();await p.locator('#go').tap();await p.waitForSelector('#stop');await p.waitForTimeout(700);await p.locator('#stop').tap();await p.locator('#done').scrollIntoViewIfNeeded();await p.locator('[data-c=prenom][data-i="1"]').tap();await p.locator('#done').tap();await p.waitForSelector('#nx');
const st2=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-petitbac-v1')));assert.deepEqual(st2.tot,[10,10,0]);assert.equal(st2.rounds,2);
assert.equal(errs.length,0,errs.join());console.log('ok',n,w,h);await br.close()}console.log('petitbac ok')})().catch(e=>{console.log('FAIL',e.message.slice(0,400));process.exit(1)})