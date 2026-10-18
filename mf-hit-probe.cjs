'use strict';
// Local-only guarded probe: for seeded random puzzles, does every clue (black) button receive its own click at its centre?
const G=require('./test-guard.cjs'),{chromium}=require('/tmp/qa/node_modules/playwright');
const BASE=process.env.BASE||'http://localhost:28461/';
(async()=>{const b=await G.launch(chromium,'chromium');const res=[];
for(const width of [1440,390,360])for(let seed=1;seed<=Number(process.env.SEEDS||12);seed++){
 const c=await G.newContext(b,{viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});const p=await c.newPage();
 await p.addInitScript(s=>{let a=s>>>0;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}},seed);
 await p.goto(BASE+'mots-fleches.html');await p.waitForFunction(()=>document.querySelector('#loading').hidden,null,{timeout:60000});
 const bad=await p.evaluate(()=>{const out=[];for(const e of document.querySelectorAll('.cell.black')){if(e.tagName!=='BUTTON')continue;e.scrollIntoView({block:"center",inline:"center"});const r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const t=document.elementFromPoint(x,y);if(t!==e&&!e.contains(t))out.push({i:e.dataset.i,rect:[r.x,r.y,r.width,r.height].map(Math.round),hit:t&&{cls:t.className,i:t.dataset&&t.dataset.i,tag:t.tagName,rect:(q=>[q.x,q.y,q.width,q.height].map(Math.round))(t.getBoundingClientRect()),cs:(k=>({tr:k.transform,top:k.top,pos:k.position,mt:k.marginTop,anim:k.animationName,trn:k.transition.slice(0,40)}))(getComputedStyle(t)),bsx:e.closest('.board-scroll')&&[e.closest('.board-scroll').scrollTop,e.closest('.board-scroll').scrollLeft],own:[...document.querySelectorAll('.cell')].indexOf(e),hitidx:[...document.querySelectorAll('.cell')].indexOf(t),n:document.querySelectorAll('.cell').length,C:document.querySelector('#board').dataset.size,bs:document.querySelector('#board').getBoundingClientRect().width,sy:scrollY},clues:e.getAttribute('aria-label').slice(0,40)})}return out});
 res.push({width,seed,blackButtons:await p.locator('.cell.black').evaluateAll(a=>a.filter(e=>e.tagName==='BUTTON').length),bad});await c.close()}
await b.close();G.assertClean('mf-hit-probe');
const fails=res.filter(r=>r.bad.length);console.log(JSON.stringify({runs:res.length,failingRuns:fails.length,sample:fails.slice(0,4)},null,1));})().catch(e=>{console.error(e);process.exit(1)});
