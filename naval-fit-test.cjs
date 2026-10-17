const {chromium}=require('/tmp/qa/node_modules/playwright');
const B=process.env.BASE||'http://localhost:28461/';
const M=()=>{const d=document.documentElement;const top=document.querySelector('.mtop').getBoundingClientRect().bottom,bar=document.querySelector('.mbar').getBoundingClientRect().top;const probs=[];
for(const e of document.querySelectorAll('main button,main input,main a')){if(!e.offsetParent||e.disabled)continue;const r=e.getBoundingClientRect();if(!r.width)continue;if(e.classList.contains('nc'))continue;if(r.top<top-1||r.bottom>bar+1||r.right>innerWidth+1)probs.push((e.id||e.className||e.tagName)+' '+Math.round(r.top)+'-'+Math.round(r.bottom))}
const nc=[...document.querySelectorAll('.nc')].filter(e=>e.offsetParent);let cell=null,out=0;if(nc.length){const r=nc[0].getBoundingClientRect();cell=Math.round(r.width);for(const e of nc){const q=e.getBoundingClientRect();if(q.bottom>bar+1||q.top<top-1||q.right>innerWidth+1)out++}}
return{noScroll:d.scrollHeight===d.clientHeight&&d.scrollWidth<=d.clientWidth,probs,cell,cellsOut:out}};
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});let bad=0;
for(const [w,h] of [[360,640],[390,844]]){const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const run=async(name,steps)=>{const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(B+'naval.html');await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForTimeout(500);
 const check=async tag=>{await p.waitForTimeout(250);const r=await p.evaluate(M);const ok=r.noScroll&&!r.probs.length&&!r.cellsOut&&(r.cell===null||r.cell>=14)&&!errs.length;if(!ok)bad++;console.log(w+'x'+h,name,tag,ok?'ok':'FAIL',JSON.stringify(r),errs.join());await p.screenshot({path:'/tmp/nv-'+w+'-'+name+'-'+tag+'.png'})};
 await steps(p,check);await p.close()};
await run('solo',async(p,ck)=>{await ck('setup');await p.locator('#start-auto').tap();await ck('place');await p.locator('#ok').tap();await p.waitForSelector('#g-main .nc');await ck('play1');await p.locator('#g-main .nc').nth(44).tap();await p.waitForTimeout(1200);await ck('play2')});
await run('manual',async(p,ck)=>{await p.locator('#start-manual').tap();await ck('manual');for(let k=0;k<5;k++)await p.locator('#g-main .nc').nth(k*20).tap();await ck('manual-done')});
await run('duo',async(p,ck)=>{await p.locator('[data-mode=two]').tap();await p.locator('#start-auto').tap();await ck('cover');await p.locator('#cover-btn').tap();await ck('p1place');await p.locator('#ok').tap();await ck('cover2')});
await c.close()}
console.log(bad?'FAIL '+bad:'naval fit ok');await br.close();process.exit(bad?1:0)})()