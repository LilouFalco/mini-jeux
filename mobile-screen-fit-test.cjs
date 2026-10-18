const {chromium}=require('/tmp/qa/node_modules/playwright');
const B=process.env.BASE||'http://localhost:28461/';
const pages=['index','yakazu','sudoku','binairo','mots-fleches','demineur','morpion?mode=duo','puissance4?mode=duo'].concat(process.env.NAVAL?['naval']:[]);
const url=f=>B+(f==='index'?'':f.includes('?')?f.replace('?','.html?'):f+'.html');
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});let bad=0;const shots=process.env.SHOTS;
const measure=()=>{const d=document.documentElement;const top=document.querySelector('.mtop').getBoundingClientRect().bottom,bar=document.querySelector('.mbar').getBoundingClientRect().top;
 const els=[...document.querySelectorAll('main button,main input,main a,main .board-scroll,main .board-wrap>#board,main #board.sq,main #clue-bar')].filter(e=>e.offsetParent&&!e.disabled);const probs=[];
 for(const e of els){const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;const inside=r.top>=top-1&&r.bottom<=bar+1&&r.left>=-1&&r.right<=innerWidth+1;
  const cx=Math.min(Math.max(r.left+r.width/2,1),innerWidth-2),cy=Math.min(Math.max(r.top+r.height/2,top+1),bar-2);const hit=document.elementFromPoint(cx,cy);const reach=hit&&(e===hit||e.contains(hit)||hit.contains(e));
  const cell=e.classList.contains('cell')||e.classList.contains('nc')||e.classList.contains('mcell')||e.classList.contains('pcell')||e.classList.contains('pcol')||e.closest('#board')&&e.tagName==='BUTTON';
  if(cell)continue;if(!inside||!reach)probs.push((e.id||e.className||e.tagName)+' '+Math.round(r.top)+'-'+Math.round(r.bottom)+' '+(inside?'':'OUT ')+(reach?'':'COVERED'))}
 const b=document.querySelector('.board-scroll,#board');const br=b?b.getBoundingClientRect():null;
 return{noScroll:d.scrollHeight===d.clientHeight&&document.body.scrollHeight<=d.clientHeight&&d.scrollWidth<=d.clientWidth,probs,board:br?[Math.round(br.width),Math.round(br.height)]:null}};
for(const [w,h] of [[360,640],[390,844]]){const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true,deviceScaleFactor:2});
for(const f of pages){const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(url(f));await p.waitForTimeout(900);
 const levels=await p.locator('.levels button:not(#online-toggle)').count();const n=levels||1;
 for(let l=0;l<n;l++){if(levels){await p.locator('.levels button:not(#online-toggle)').nth(l).tap();await p.waitForTimeout(l?1200:200);const cf=p.locator('#replace');if(await cf.isVisible().catch(()=>false))await cf.tap();await p.waitForTimeout(800)}
  const r=await p.evaluate(measure);const ok=r.noScroll&&!r.probs.length&&!errs.length&&(!r.board||r.board[0]>=160);if(!ok)bad++;
  console.log(w+'x'+h,f,'L'+l,ok?'ok':'FAIL',JSON.stringify(r));if(shots)await p.screenshot({path:'/tmp/fit-'+w+'-'+f.split('?')[0]+'-'+l+'.png'})}
 // page itself must not scroll via touch drag/wheel
 await p.mouse.wheel(0,500);await p.waitForTimeout(100);const sy=await p.evaluate(()=>scrollY+document.documentElement.scrollTop);if(sy!==0){bad++;console.log('PAGE SCROLLED',f)}
 await p.close()}
await c.close()}
console.log(bad?'FAIL '+bad:'screen fit ok');await br.close();process.exit(bad?1:0)})()