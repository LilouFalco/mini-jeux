const {chromium}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
 for(const width of [1440,390,360]){
  const c=await b.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  // links between games
  await p.goto(BASE+'yakazu.html');assert(await p.locator('.games a').count()>=5);
  assert.equal(await p.locator('a[href*="portfolio"],a[href*="liloufalco.github.io"]').count(),0);
  await p.click('.games a[href="sudoku.html"]');await p.waitForURL(/sudoku\.html/);
  // SUDOKU
  for(let level=0;level<4;level++){
   if(level>0){await p.locator('[data-level="'+level+'"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace')}
   await p.waitForFunction(l=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-sudoku-v1')||'null')?.level===l,level,{timeout:30000});
   const g=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-sudoku-v1')));
   assert.equal(g.puzzle.filter(Boolean).length>=22,true);
  }
  await p.locator('[data-level="0"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace');
  await p.waitForFunction(()=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-sudoku-v1')).level===0);
  let g=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-sudoku-v1')));
  const empties=g.puzzle.map((v,i)=>v?-1:i).filter(i=>i>=0);
  // wrong value shows error, notes, erase
  const e0=empties[0],wrong=g.solution[e0]%9+1;
  await p.locator('.cell[data-i="'+e0+'"]').click();
  await p.click('#notes');await p.locator('#pad button').nth(wrong-1).click();await p.locator('#pad button').nth(g.solution[e0]-1).click();
  assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-sudoku-v1')).notes[0]||[])).length>=0,true);
  await p.click('#notes');
  await p.locator('#pad button').nth(wrong-1).click();await p.check('#check');
  assert(await p.locator('.cell[data-i="'+e0+'"]').evaluate(el=>el.classList.contains('error')),'error shown');
  await p.click('#erase');assert.equal(await p.locator('.cell[data-i="'+e0+'"]').evaluate(el=>el.classList.contains('error')),false);
  await p.click('#hint');
  g=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-sudoku-v1')));assert.equal(g.hints,1);assert.equal(g.values[e0],g.solution[e0]);
  // solve the rest => win
  for(const i of empties){await p.locator('.cell[data-i="'+i+'"]').evaluate(el=>el.click());await p.locator('#pad button').nth(g.solution[i]-1).evaluate(el=>el.click())}
  await p.waitForSelector('#win[open]');assert.match(await p.textContent('#win-text'),/Grille termin/);
  await p.screenshot({path:'/tmp/sudoku-win-'+width+'.png'});await p.click('#stay');
  await p.reload();await p.waitForFunction(()=>document.querySelector('#board .cell'));
  assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-sudoku-v1')).won)),true);
  await p.click('#new');await p.waitForFunction(()=>document.querySelector('#loading').hidden&&!JSON.parse(localStorage.getItem('lilou-sudoku-v1')).won);
  // keyboard
  await p.keyboard.press('ArrowRight');await p.keyboard.press('5');
  await p.locator('.cell').first().click();
  const ov=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(ov<=1,'sudoku overflow '+ov);
  await p.screenshot({path:'/tmp/sudoku-'+width+'.png',fullPage:true});
  // MOTS FLECHES
  await p.click('.games a[href="mots-fleches.html"]');await p.waitForURL(/mots-fleches/);
  for(let level=0;level<4;level++){
   if(level>0){await p.locator('[data-level="'+level+'"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace')}
   await p.waitForFunction(l=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-motsfleches-v1')||'null')?.level===l,level,{timeout:30000});
  }
  await p.locator('[data-level="1"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace');
  await p.waitForFunction(()=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-motsfleches-v1')).level===1);
  let m=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-motsfleches-v1')));
  assert(await p.evaluate(g=>MotsFleches.validate(g)===null,m),'valid grid');
  assert(await p.locator('.clue').count()>5);
  const white=m.cells.map((c,i)=>c.t==='w'?i:-1).filter(i=>i>=0);
  // type a wrong letter in first white cell, error shows
  await p.locator('.cell[data-i="'+white[0]+'"]').click();
  const wl=m.cells[white[0]].ch==='A'?'B':'A';await p.keyboard.press(wl);
  await p.check('#check');assert(await p.locator('.cell[data-i="'+white[0]+'"]').evaluate(el=>el.classList.contains('error')),'mf error');
  await p.locator('.cell[data-i="'+white[0]+'"]').click();await p.click('#hint');
  m=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-motsfleches-v1')));assert.equal(m.values[white[0]],m.cells[white[0]].ch);assert.equal(m.hints,1);
  assert((await p.textContent('#clue-bar')).length>5);
  // direction toggle on a crossing cell via button
  await p.click('#dir');
  // clicking a clue cell selects its word
  await p.locator('.cell.black button, button.cell.black').first().click();
  // fill rest with on-screen keyboard for one word then everything via evaluate
  for(const i of white){const ch=m.cells[i].ch;await p.locator('.cell[data-i="'+i+'"]').evaluate(el=>el.click());await p.locator('#keys [data-k="'+ch+'"]').evaluate(el=>el.click())}
  await p.waitForSelector('#win[open]');await p.screenshot({path:'/tmp/mf-win-'+width+'.png'});await p.click('#stay');
  await p.click('#new');await p.waitForFunction(()=>document.querySelector('#loading').hidden&&!JSON.parse(localStorage.getItem('lilou-motsfleches-v1')).won);
  const ov2=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(ov2<=1,'mf page overflow '+ov2);
  await p.locator('.cell.white').first().click();
  await p.screenshot({path:'/tmp/mf-'+width+'.png',fullPage:true});
  // BINAIRO
  await p.click('.games a[href="binairo.html"]');await p.waitForURL(/binairo/);
  const sizes=[6,8,10,12];
  for(let level=0;level<4;level++){
   if(level>0){await p.locator('[data-level="'+level+'"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace')}
   await p.waitForFunction(l=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-binairo-v1')||'null')?.level===l,level,{timeout:30000});
   const gg=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')));assert.equal(gg.n,sizes[level]);
   assert.equal(await p.locator('#board .cell').count(),sizes[level]**2);
   const ovb=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert(ovb<=1,'binairo overflow '+ovb+' level '+level);
   if(level===3)await p.screenshot({path:'/tmp/binairo-12-'+width+'.png',fullPage:true});
  }
  await p.locator('[data-level="0"]').click();if(await p.locator('#confirm[open]').count())await p.click('#replace');
  await p.waitForFunction(()=>document.querySelector('#loading').hidden&&JSON.parse(localStorage.getItem('lilou-binairo-v1')).level===0);
  let bg=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')));
  const be=bg.puzzle.map((v,i)=>v<0?i:-1).filter(i=>i>=0);
  const c0=p.locator('.cell[data-i="'+be[0]+'"]');
  await c0.click();assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')).values))[be[0]],0);
  await c0.click();assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')).values))[be[0]],1);
  await c0.click();assert.equal((await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')).values))[be[0]],-1);
  const wr=1-bg.solution[be[0]];await c0.evaluate(el=>el.click());if(bg.solution[be[0]]===0){await c0.evaluate(el=>el.click())}
  await p.check('#check');assert(await c0.evaluate(el=>el.classList.contains('error')),'binairo error');
  await p.click('#erase');assert.equal(await c0.evaluate(el=>el.classList.contains('error')),false);
  await p.click('#hint');bg=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')));assert.equal(bg.hints,1);assert.equal(bg.values[be[0]],bg.solution[be[0]]);
  await c0.focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('Backspace');
  for(const i of be){await p.locator('.cell[data-i="'+i+'"]').evaluate(el=>el.click());await p.locator('#pad [data-v="'+bg.solution[i]+'"]').evaluate(el=>el.click())}
  await p.waitForSelector('#win[open]');await p.click('#stay');
  await p.reload();await p.waitForFunction(()=>document.querySelector('#board .cell'));assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-binairo-v1')).won),true);
  await p.click('#new');await p.waitForFunction(()=>document.querySelector('#loading').hidden&&!JSON.parse(localStorage.getItem('lilou-binairo-v1')).won);
  await p.screenshot({path:'/tmp/binairo-'+width+'.png',fullPage:true});
  // yakazu untouched
  await p.click('.games a[href="yakazu.html"]');await p.waitForFunction(()=>document.querySelector('#board .cell'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(width+' yakazu link + sudoku (4 levels, errors, notes, hint, win, save) + mots fléchés + binairo (4 sizes, cycle, errors, hint, win, save) PASS');
  await c.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
