const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const E=require('./timesup-engine.js');const B=process.env.BASE||'http://localhost:28461/';
for(const th of Object.keys(E.THEMES)){const c=E.THEMES[th].c;assert(c.length>=30,th);assert.equal(new Set(c).size,c.length,th+' dup')}
const g=E.make(7,['general','lol'],30);assert.equal(g.cards.length,30);assert.equal(g.teams[0].length+g.teams[1].length,7);assert.equal(new Set(g.teams.flat()).size,7);
const d0=E.describer(g);E.found(g);assert.equal(g.pile.length,29);assert.equal(E.total(g,0),1);E.pass(g);assert.equal(g.pile.length,29);E.endTurn(g);assert.equal(g.team,1);E.endTurn(g);assert.notEqual(E.describer(g),d0);
while(!E.roundDone(g))E.found(g);assert(E.nextRound(g));assert.equal(g.pile.length,30);assert.throws(()=>E.make(3,['general'],30));
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]])for(const [w,h] of [[360,640],[390,844]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(B+'timesup.html');await p.evaluate(()=>localStorage.clear());await p.reload();
const fit=async tag=>{const o=await p.evaluate(()=>({s:document.documentElement.scrollHeight,c:document.documentElement.clientHeight}));assert(o.s<=o.c,tag+' scroll '+JSON.stringify(o))};
await fit('setup');await p.locator('#go').tap();await p.waitForTimeout(700);await fit('ready');
let seen=0;
for(let round=0;round<3;round++){
 let guard=0;while(!(await p.locator('#nx').count()&&(await p.locator('#nx').innerText()).match(/Manche|résultat/)&&await p.locator('.word').innerText().then(t=>t.includes('Rose')))&&guard++<200){
  if(await p.locator('#st').count()){await p.waitForTimeout(650);await p.locator('#st').tap();await p.waitForSelector('#ok');await fit('play')}
  else if(await p.locator('#ok').count()){const before=await p.locator('#cd').innerText();await p.waitForTimeout(300);await p.locator('#pass').tap();await p.waitForTimeout(300);await p.locator('#ok').tap();await p.waitForTimeout(300);seen++}
  else if(await p.locator('#nx').count()){await p.waitForTimeout(700);await p.locator('#nx').tap();await p.waitForTimeout(100)}
  else await p.waitForTimeout(100)}
 assert(guard<200,'round '+round+' stuck');await p.locator('#nx').tap();await p.waitForTimeout(100)}
await p.waitForSelector('#again');const txt=await p.locator('.card').innerText();assert(/gagne|Égalité/.test(txt),txt);
const st=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-timesup-v1')));assert.equal(st.wins[0]+st.wins[1]+ (txt.includes('Égalité')?1:0),1);
await p.locator('#again').tap();await fit('again');assert.equal(errs.length,0,errs.join());console.log('ok',n,w,h);await br.close()}
console.log('timesup ok')})().catch(e=>{console.log('FAIL',e.message.slice(0,400));process.exit(1)})