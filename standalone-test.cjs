const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
for(const w of [390,360]){const c=await br.newContext({viewport:{width:w,height:780},hasTouch:true,isMobile:true});
await c.addInitScript(()=>{const o=matchMedia.bind(window);window.matchMedia=q=>/display-mode:\s*standalone/.test(q)?Object.assign(o('all'),{matches:true,media:q}):o(q);document.documentElement.style.setProperty('--sai-b','34px');Object.defineProperty(navigator,'standalone',{value:true})});
const p=await c.newPage();for(const f of ['','demineur.html','morpion.html?mode=duo']){await p.goto(B+f);await p.waitForTimeout(300);
const r=await p.evaluate(()=>{const b=document.querySelector('.mbar').getBoundingClientRect();return{ov:document.documentElement.scrollWidth-innerWidth,bottom:Math.round(b.bottom),ih:innerHeight,btn:[...document.querySelectorAll('.mbar button')].map(e=>Math.round(e.getBoundingClientRect().height)),tabs:document.querySelectorAll('.mbar button').length,last:Math.round(document.body.scrollHeight)}});
assert(r.ov<=1&&r.bottom===r.ih&&r.tabs===3&&r.btn.every(h=>h>=44),JSON.stringify(r));}
await c.close()}
console.log('standalone-emulated ok (emulated matchMedia, not real device)');await br.close()})().catch(e=>{console.error(e);process.exit(1)})