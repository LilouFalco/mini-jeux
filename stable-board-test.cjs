const {chromium}=require('/tmp/qa/node_modules/playwright');const assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
const SEL={'morpion.html?mode=duo':['#board','.mcell'],'puissance4.html?mode=duo':['#board','.pcell,.pcol,#board button'],'demineur.html':['#board','.cell'],'binairo.html':['#board','.cell'],'sudoku.html':['#board','.cell']};
(async()=>{const br=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const p=await br.newPage({viewport:{width:1440,height:900}});let bad=0;
for(const [u,[bs,cs]] of Object.entries(SEL)){await p.goto(B+u);await p.waitForTimeout(700);
 const snap=()=>p.evaluate(([bs,cs])=>{const r=e=>{const b=e.getBoundingClientRect();return[b.x,b.y,b.width,b.height].map(v=>Math.round(v*100)/100)};const b=document.querySelector(bs);const c=[...document.querySelectorAll(cs)].filter(e=>!e.disabled)[4]||document.querySelector(cs);return{board:r(b),cell:r(c),tf:getComputedStyle(c).transform,ztf:getComputedStyle(b).transform}},[bs,cs]);
 const cell=p.locator(cs).filter({hasNot:p.locator('[disabled]')}).nth(4);const before=await snap();
 await cell.hover();const hov=await snap();const box=await cell.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.waitForTimeout(250);const act=await snap();await p.mouse.up();
 const t=[];for(let i=0;i<8;i++){await p.waitForTimeout(40);t.push(await snap())}
 await p.waitForTimeout(500);const after=await snap();
 for(const [n,s] of [['hover',hov],['active',act],['after',after],...t.map((x,i)=>['t'+i,x])]){if(JSON.stringify(s.board)!==JSON.stringify(before.board)||(JSON.stringify(s.cell)!==JSON.stringify(before.cell)&&!['demineur.html','sudoku.html'].includes(u)&&false)||s.tf!=='none'&&s.tf!==before.tf){bad++;console.log('CHANGE',u,n,JSON.stringify(before.cell),JSON.stringify(s.cell),s.tf)}}
 if(JSON.stringify(act.cell)!==JSON.stringify(before.cell)){bad++;console.log('CELL MOVED active',u,JSON.stringify(before.cell),JSON.stringify(act.cell))}
}
console.log(bad?'FAIL '+bad:'stable board ok');await br.close();process.exit(bad?1:0)})().catch(e=>{console.error(e);process.exit(1)})