const pw=require('/tmp/qa/node_modules/playwright');const assert=require('assert');const B=process.env.BASE||'http://localhost:28461/';const C=require('./champdle-engine.js');
assert.equal(C.DATA.length,173);assert.equal(C.daily('2026-10-17').id,C.daily('2026-10-17').id);
const d=new Set();for(let i=1;i<=60;i++)d.add(C.daily('2026-11-'+String(i%28+1).padStart(2,'0')).id);assert(d.size>5);
assert.equal(C.cmp(C.byId('Ahri'),C.byId('Ahri')).year,'ok');assert.equal(C.cmp(C.byId('Annie'),C.byId('Mel')).year,'up');assert.equal(C.cmp(C.byId('Mel'),C.byId('Annie')).year,'down');
assert.equal(C.search('nunu')[0].id,'Nunu');assert(C.search('kaisa').some(c=>c.id==='Kaisa'));assert.equal(C.search('ahri',['Ahri']).length,0);
(async()=>{for(const [n,t] of [['webkit',pw.webkit],['chromium',pw.chromium]])for(const [w,h] of [[360,640],[390,844],[1440,900]]){const br=await t.launch(n==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
const mob=w<700;const c=await br.newContext({viewport:{width:w,height:h},hasTouch:mob,isMobile:mob});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const fit=async tag=>{const r=await p.evaluate(()=>{const m=document.querySelector('.mbar');const b=m&&getComputedStyle(m).display!=='none'?m.getBoundingClientRect().top:innerHeight;let o=[];document.querySelectorAll('#v button,#v input').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&(r.bottom>b+.5||r.right>innerWidth+.5))o.push(e.id||e.className)});return{sh:document.documentElement.scrollHeight-innerHeight,o}});if(w<700){assert.equal(r.sh,0,tag+' scroll');assert.equal(r.o.length,0,tag+' '+r.o)}};
await p.goto(B+'champdle.html');await p.evaluate(()=>localStorage.clear());await p.reload();await fit('start');
const tgt=await p.evaluate(()=>Champdle.daily().id);
const play=async name=>{await p.fill('#q',name);await p.waitForSelector('.so');await p.locator('.so').first().dispatchEvent('pointerdown');};
await play('ahri');if(tgt!=='Ahri'){assert.equal(await p.locator('.cr').count(),1);assert.equal(await p.locator('.cr .cd').count(),8)}
for(const nm of ['zed','lux','garen','teemo','nunu','jax','mel','annie','sett','yone'])if(!(await p.locator('#next').count())){await play(nm);}
await fit('many');
await p.reload();assert(await p.locator('.cr').count()>=1,'persist');
await p.locator('[data-m=free]').click();assert.equal(await p.locator('.cr').count(),0);await fit('free');
const ft=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-champdle-v1')).free.target);const nm=await p.evaluate(id=>Champdle.byId(id).name,ft);await play(nm);await p.waitForSelector('#next');assert(/Trouvé en 1/.test(await p.locator('.cdone').innerText()));await fit('won');
await p.locator('#next').click();assert.equal(await p.locator('.cdone').count(),0);
await p.locator('[data-m=daily]').click();assert.equal(errs.length,0,errs.join());console.log('ok',n,w,h);await br.close()}console.log('champdle ok')})().catch(e=>{console.log('FAIL',e.message.slice(0,400));process.exit(1)})