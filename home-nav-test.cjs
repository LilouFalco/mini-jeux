const {chromium,webkit}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const PAGES=['yakazu','sudoku','mots-fleches','binairo','demineur','champdle','chess','morpion','puissance4','naval','quiestce','petitbac','undercover','timesup'].map(x=>x+'.html');
(async()=>{const B=process.env.BASE||'http://localhost:28461/';let n=0;const fails=[];
const sizes=[];for(const w of [320,360,390])for(const h of [640,667,844])sizes.push([w,h]);for(const s of [[1440,900],[1366,768],[768,900]])sizes.push(s);
for(const [en,E] of [['chromium',chromium],['webkit',webkit]]){const b=await E.launch();
for(const [w,h] of sizes){const mob=w<=700;const tag=en+' '+w+'x'+h;
 const c=await b.newContext({viewport:{width:w,height:h},isMobile:mob,hasTouch:mob,serviceWorkers:'block'});
 const p=await c.newPage();await p.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(B).origin?r.continue():r.abort()});
 const ck=(ok,msg)=>{n++;if(!ok)fails.push(tag+' '+msg)};
 const geom=()=>p.evaluate(()=>{const vw=innerWidth,vh=innerHeight;const vis=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0};
  const foc=[...document.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')];
  const rend=e=>e.checkVisibility&&e.checkVisibility({visibilityProperty:true});
  const hiddenFocusable=foc.filter(rend).filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width===0||r.height===0||parseFloat(s.opacity)===0||!!e.closest('[aria-hidden=true]')}).map(e=>e.outerHTML.slice(0,50));
  const scrollAnc=e=>{for(let a=e.parentElement;a&&a!==document.body&&a!==document.documentElement;a=a.parentElement){const s=getComputedStyle(a);if(/(auto|scroll)/.test(s.overflowY+s.overflowX)){const r=a.getBoundingClientRect();if(r.right<=vw+1&&r.left>=-1&&r.bottom<=vh+1&&r.top>=-1)return a}}return null};
  const off=foc.filter(rend).filter(e=>{if(e.closest('[hidden]'))return false;const r=e.getBoundingClientRect();return r.right>vw+1||r.left<-1||r.bottom>vh+1||r.top<-1}).filter(e=>!scrollAnc(e)).map(e=>e.outerHTML.slice(0,50));
  const t=document.querySelector('.mtop .mback'),s=document.querySelector('.mtop strong');let overlap=false;if(t&&s){const a=t.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(s);const q=r.getBoundingClientRect();overlap=q.width>0&&a.right>q.left+0.5&&a.left<q.right&&a.bottom>q.top&&a.top<q.bottom}
  const d=document.documentElement;return{sw:d.scrollWidth>vw,sh:d.scrollHeight>vh+1,off,hiddenFocusable,overlap}});
 await p.goto(B+'index.html');await p.waitForTimeout(250);let g=await geom();
 ck(!g.sw,'home hscroll');if(mob){ck(!g.sh,'home vscroll');ck(g.off.length===0,'home offscreen '+g.off);ck(await p.locator('.welcome').isVisible(),'welcome visible');ck(await p.locator('.modes').isHidden(),'big buttons hidden');
  ck(await p.locator('.welcome-art').isVisible()&&await p.locator('.welcome h2').innerText()==='Bienvenue chez Rouky','welcome content');
  const wb=await p.evaluate(()=>{const e=document.querySelector('.welcome').getBoundingClientRect(),m=document.querySelector('.mbar').getBoundingClientRect(),t=document.querySelector('.mtop').getBoundingClientRect();return e.top>=t.bottom-1&&e.bottom<=m.top+1});ck(wb,'welcome between bars');
  ck(g.hiddenFocusable.length===0,'home hiddenFocusable '+g.hiddenFocusable);
  for(const k of ['solo','duo','multi']){await p.locator('.mbar button[data-k='+k+']').click();ck(await p.locator('.msheet').isVisible(),'sheet '+k);const pn=await p.evaluate(()=>{const r=document.querySelector('.mpanel').getBoundingClientRect();return r.top>=0&&r.right<=innerWidth+1});ck(pn,'panel fits '+k);await p.locator('.mclose').click()}}
 else{ck((await p.locator('.mode').count())===4,'4 cards');ck(await p.locator('.welcome').isHidden(),'welcome hidden desktop');for(const m of await p.locator('.mode .mi').all()){const bb=await m.boundingBox();ck(bb.width>=40,'icon size')}}
 for(const pg of PAGES){await p.goto(B+pg);await p.waitForTimeout(150);const a=p.locator(mob?'.mtop .mback':'.home-back');
  ck(await a.isVisible(),pg+' back visible');if(!await a.isVisible())continue;const r=await a.boundingBox();ck(r.height>=43.9&&r.width>=43.9,pg+' target '+JSON.stringify(r));
  ck(await a.getAttribute('href')==='./'&&await a.getAttribute('data-home-link')!==null,pg+' href/marker');ck((await a.innerText()).trim().toLowerCase()==='accueil',pg+' label');
  ck(await p.locator('.games').count()===0,pg+' no games nav');
  g=await geom();ck(!g.sw,pg+' hscroll');ck(!g.overlap,pg+' top overlap');
  if(mob){ck(!g.sh,pg+' vscroll');ck(g.hiddenFocusable.length===0,pg+' hiddenFocusable '+g.hiddenFocusable);ck(g.off.length===0,pg+' offscreen '+g.off);ck(await p.locator('.mbar').isVisible(),pg+' mbar')}
  await a.focus();ck(await a.evaluate(e=>e===document.activeElement),pg+' focus')}
 await c.close()}await b.close()}
console.log('checks',n,'failures',fails.length);fails.slice(0,40).forEach(f=>console.log(' FAIL',f.slice(0,300)));process.exit(fails.length?1:0)})().catch(e=>{console.error(e);process.exit(1)})