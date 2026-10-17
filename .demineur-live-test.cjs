const {chromium}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/',K='lilou-demineur-v1';
const st=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),K);
(async()=>{const b=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
 for(const width of [1440,390,360]){
  const mobile=width<600,c=await b.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'demineur.html');await p.waitForSelector('#board .cell');
  assert((await p.locator('.games a').count())>=5);
  const dims=[[9,9],[16,16],[16,30],[24,30]],tot=[10,40,99,160];
  for(let l=0;l<4;l++){if(l>0){await p.locator('[data-level="'+l+'"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace')}
   await p.waitForFunction(([l,n])=>document.querySelectorAll('#board .cell').length===n,[l,dims[l][0]*dims[l][1]]);
   const g=await st(p);assert.equal(g.R,dims[l][0]);assert.equal(g.C,dims[l][1]);assert.equal(g.total,tot[l]);assert.equal(g.mines,null);
   assert.equal(await p.textContent('#mines'),String(tot[l]));}
  await p.locator('[data-level="0"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace');
  await p.waitForFunction(()=>document.querySelectorAll('#board .cell').length===81);
  // flags before first reveal are kept; first reveal safe 3x3 incl. flag cell protected
  const cell=i=>p.locator('.cell[data-i="'+i+'"]');
  await cell(0).dispatchEvent('contextmenu');assert.equal(await p.textContent('#mines'),'9');
  await p.click('#flagmode');await cell(80).click();assert.equal(await p.textContent('#mines'),'8');await cell(80).click();assert.equal(await p.textContent('#mines'),'9');await p.click('#flagmode');
  await cell(40).click();
  let g=await st(p);assert(g.mines);assert.equal(g.mines.reduce((a,x)=>a+x,0),10);assert.equal(g.mines[40],0);for(const j of [30,31,32,39,41,48,49,50])assert.equal(g.mines[j],0);
  assert.equal(g.state[0],2,'flag kept');assert(g.state.filter(v=>v===1).length>=9,'area opened');
  // long press (touch) flags and does not also reveal
  if(mobile){const hidden=g.state.findIndex((v,i)=>v===0&&!g.mines[i]);const box=await cell(hidden).boundingBox();await cell(hidden).scrollIntoViewIfNeeded();
   const cdp=await c.newCDPSession(p);const bb=await cell(hidden).boundingBox(),x=bb.x+bb.width/2,y=bb.y+bb.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.waitForTimeout(650);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(100);
   g=await st(p);assert.equal(g.state[hidden],2,'long press flags');await cell(hidden).dispatchEvent('contextmenu');await p.waitForTimeout(800);}
  // chord: pick opened number cell, flag its mines, chord opens other neighbours
  g=await st(p);
  const nb=(i)=>{const r=Math.floor(i/9),cc=i%9,o=[];for(let a=-1;a<=1;a++)for(let d=-1;d<=1;d++){if(!a&&!d)continue;const rr=r+a,c2=cc+d;if(rr>=0&&c2>=0&&rr<9&&c2<9)o.push(rr*9+c2)}return o};
  const counts=g.mines.map((m,i)=>m?-1:nb(i).reduce((a,j)=>a+g.mines[j],0));
  const num=g.state.findIndex((v,i)=>v===1&&counts[i]>0&&nb(i).some(j=>g.state[j]===0&&!g.mines[j]));
  if(num>=0){for(const j of nb(num))if(g.mines[j]&&g.state[j]===0){await cell(j).dispatchEvent('contextmenu')}
   for(const j of nb(num))if(g.state[j]===2&&!g.mines[j]){await cell(j).dispatchEvent('contextmenu')}
   await cell(num).click();g=await st(p);assert(nb(num).every(j=>g.mines[j]||g.state[j]===1||g.state[j]===2),'chord opened neighbours');assert(!g.over);}
  // save + reload
  const before=await st(p);await p.reload();await p.waitForSelector('#board .cell');const after=await st(p);assert.deepEqual(after.state,before.state);assert.deepEqual(after.mines,before.mines);
  // wrong chord loses
  g=await st(p);
  // win: open every safe cell
  for(let i=0;i<81;i++){g=await st(p);if(g.over)break;if(!g.mines[i]&&g.state[i]===2)await cell(i).dispatchEvent('contextmenu');if(!g.mines[i]&&g.state[i]!==1)await cell(i).evaluate(el=>el.click())}
  await p.waitForSelector('#win[open]');g=await st(p);assert(g.won&&g.over);assert.match(await p.textContent('#win-text'),/termin/);
  await p.screenshot({path:'/tmp/dem-win-'+width+'.png'});await p.click('#stay');
  // loss
  await p.click('#new');await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('lilou-demineur-v1')).over&&document.querySelector('#board .cell'));
  await cell(40).click();g=await st(p);const m=g.mines.findIndex(v=>v);await cell(m).evaluate(el=>el.click());
  await p.waitForSelector('#win[open]');g=await st(p);assert(g.over&&!g.won);assert.match(await p.textContent('#win-title'),/Pas cette fois/);await p.click('#stay');
  assert((await cell(m).getAttribute('class')).includes('boom'));
  // wrong flag + chord loses
  await p.click('#new');if(await p.locator('#confirm[open]').count())await p.click('#replace');await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('lilou-demineur-v1')).over);
  await cell(40).click();g=await st(p);
  const num2=g.state.findIndex((v,i)=>v===1&&counts0(g,i)>0&&nbs(i).some(j=>g.state[j]===0));
  function nbs(i){const r=Math.floor(i/9),cc=i%9,o=[];for(let a=-1;a<=1;a++)for(let d=-1;d<=1;d++){if(!a&&!d)continue;const rr=r+a,c2=cc+d;if(rr>=0&&c2>=0&&rr<9&&c2<9)o.push(rr*9+c2)}return o}
  function counts0(g,i){return g.mines[i]?-1:nbs(i).reduce((a,j)=>a+g.mines[j],0)}
  if(num2>=0){const n=counts0(g,num2);const hid=nbs(num2).filter(j=>g.state[j]===0);const safeHid=hid.filter(j=>!g.mines[j]);
   if(safeHid.length>=n&&hid.some(j=>g.mines[j])){for(const j of safeHid.slice(0,n))await cell(j).dispatchEvent('contextmenu');await cell(num2).click();await p.waitForSelector('#win[open]');g=await st(p);assert(g.over&&!g.won,'wrong flags lose');await p.click('#stay')}}
  // keyboard
  await p.click('#new');if(await p.locator('#confirm[open]').count())await p.click('#replace');await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('lilou-demineur-v1')).over&&!JSON.parse(localStorage.getItem('lilou-demineur-v1')).mines);await cell(39).focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('f');
  g=await st(p);assert.equal(g.state[40],2);await p.keyboard.press('f');
  // compact toggle + overflow of page
  await p.click('#zoom');assert((await p.locator('#board').getAttribute('class')).includes('compact'));await p.click('#zoom');
  for(let l=0;l<4;l++){await p.locator('[data-level="'+l+'"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace');await p.waitForFunction(([n])=>document.querySelectorAll('#board .cell').length===n,[dims[l][0]*dims[l][1]]);
   const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(ov<=1,'page overflow '+ov+' level '+l);
   const sc=await p.evaluate(()=>{const s=document.querySelector('.board-scroll');return [s.scrollWidth>s.clientWidth,s.scrollHeight>s.clientHeight]});if(l===3)assert(sc[0]||sc[1],'big board scrolls');}
  await p.locator('.cell').nth(5).click();await p.screenshot({path:'/tmp/dem-big-'+width+'.png',fullPage:true});
  assert.equal(errors.length,0,errors.join('\n'));console.log(width+' demineur levels/counts, flags, longpress, chord, win/loss, save, keyboard, scroll PASS');await c.close();}
 await b.close()})().catch(e=>{console.error(e);process.exit(1)});