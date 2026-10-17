const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
for(const w of [1440,1024,390]){const p=await br.newPage({viewport:{width:w,height:900}});await p.goto((process.env.BASE||'http://localhost:28461/')+'morpion.html?mode=duo');await p.waitForTimeout(600);
const m=()=>p.evaluate(()=>{const b=document.querySelector('#board');const r=e=>{const x=e.getBoundingClientRect();return[x.x,x.y,x.width,x.height].map(v=>Math.round(v*100)/100).join()};return r(b)+'|'+[...document.querySelectorAll('.mcell')].map(r).join(';')});
const base=await m();const seq=[0,4,1,2,6,3,5];
for(const i of seq){const c=p.locator('.mcell').nth(i);const bx=await c.boundingBox();await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);await p.mouse.down();assert.equal(await m(),base,w+' down '+i);await p.mouse.up();for(let k=0;k<6;k++){await p.waitForTimeout(40);assert.equal(await m(),base,w+' after '+i+' t'+k)}}
await p.close()}
console.log('morpion stable ok');await br.close()})().catch(e=>{console.error(e.message);process.exit(1)})
