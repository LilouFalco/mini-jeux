const pw=require('/tmp/qa/node_modules/playwright'),assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/',KEY='lilou-chess-v1';
const get=async p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const move=async(p,a,b)=>{await p.locator('[data-square="'+a+'"]').tap();await p.locator('[data-square="'+b+'"]').tap()};
const seed=async(p,start,moves=[],mode='two',extra={})=>{await p.evaluate(({KEY,start,moves,mode,extra})=>localStorage.setItem(KEY,JSON.stringify({v:1,start,moves,mode,n1:'Lilou',n2:'Lulu',...extra})),{KEY,start,moves,mode,extra});await p.reload()};
(async()=>{
for(const eng of ['chromium','webkit']){
 const br=await pw[eng].launch(eng==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});const errors=[];
 for(const [w,h] of [[360,640],[390,844],[1440,900]]){
 const c=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:w<700,serviceWorkers:'block'}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(B+'chess.html?mode=duo');await p.waitForSelector('.chess-cell');assert.equal(await p.locator('.chess-cell').count(),64);
 const dims=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:innerWidth,sh:document.documentElement.scrollHeight,ch:innerHeight,b:document.querySelector('#chess-board').getBoundingClientRect().toJSON(),tools:[...document.querySelectorAll('.chess-tools button,#settings')].map(e=>e.getBoundingClientRect().toJSON())}));
 assert(dims.sw<=dims.cw+1);if(w<700){assert(dims.sh<=dims.ch+1);assert(dims.b.width>=290,'legible board '+JSON.stringify(dims));assert(dims.b.bottom<h-110)}for(const b of dims.tools){assert(b.height>=44);if(w<700)assert(b.bottom<=h);assert(b.x>=0&&b.right<=w)}
 await p.locator('[data-square=e2]').tap();assert.equal(await p.locator('.legal').count(),2);await p.locator('[data-square=e5]').tap();assert.equal((await get(p)).moves.length,0,'illegal click no move');
 await move(p,'e2','e4');assert.equal((await get(p)).moves[0],'e4');assert((await p.locator('#status').textContent()).includes('Lulu'));
 await move(p,'e7','e5');await p.locator('#undo').tap();assert.equal((await get(p)).moves.length,1);await p.reload();assert.equal((await get(p)).moves.length,1,'reload');
 await p.locator('#flip').tap();assert.equal(await p.locator('.chess-cell').first().getAttribute('data-square'),'h1');await p.reload();assert.equal(await p.locator('.chess-cell').first().getAttribute('data-square'),'h1');
 await p.locator('#new').tap();await p.locator('#cancel-new').tap();assert.equal((await get(p)).moves.length,1);await p.locator('#new').tap();await p.locator('#accept-new').tap();assert.equal((await get(p)).moves.length,0);
 await p.locator('#settings').tap();await p.locator('#n1').fill('<b>X</b>');assert.equal(await p.locator('#turn-label b').count(),0,'names not HTML');await p.locator('#mode').selectOption('hard');assert.equal((await get(p)).mode,'hard');
 await p.goto(B+'chess.html?mode=solo');await move(p,'e2','e4');
 // Undo during queued/running AI cancels both worker and stale callback.
 await p.locator('#undo').tap();await p.waitForTimeout(1900);assert.equal((await get(p)).moves.length,0);
 await move(p,'d2','d4');await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).moves.length===2,KEY,{timeout:10000});await p.locator('#undo').tap();assert.equal((await get(p)).moves.length,0,'undo complete pair');
 // Reload on AI turn resumes exactly one legal reply.
 await move(p,'e2','e4');await p.reload();await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).moves.length===2,KEY,{timeout:10000});await p.waitForTimeout(700);assert.equal((await get(p)).moves.length,2);
 // A new game invalidates a running worker.
 await p.locator('#undo').tap();await move(p,'c2','c4');await p.locator('#new').tap();await p.locator('#accept-new').tap();await p.waitForTimeout(1800);assert.equal((await get(p)).moves.length,0);
 // Every promotion is an explicit choice, cancel preserves the pawn.
 await p.goto(B+'chess.html?mode=duo');
 for(const type of ['q','r','b','n']){
 await seed(p,'4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
 await move(p,'a7','a8');assert(await p.locator('#promotion').isVisible());assert.equal((await get(p)).moves.length,0);await p.locator('#cancel-promotion').tap();assert.equal((await get(p)).moves.length,0);
 await move(p,'a7','a8');await p.locator('[data-promotion='+type+']').tap();assert((await get(p)).moves[0].includes('='+type.toUpperCase()));assert(!(await p.locator('#promotion').isVisible()));
 }
 // Threefold is claimable, not automatic. Fivefold is automatic.
 const cyc=['Nf3','Nf6','Ng1','Ng8'];
 await seed(p,undefined,[...cyc,...cyc]);assert(!(await p.locator('#status').textContent()).includes('Match nul'));
 await p.locator('#settings').tap();await p.locator('#claim').tap();assert((await get(p)).claimed);assert((await p.locator('#status').textContent()).includes('nulle réclamée'));await p.reload();assert((await get(p)).claimed);
 await seed(p,undefined,[...cyc,...cyc,...cyc,...cyc]);assert((await p.locator('#status').textContent()).includes('cinq répétitions'));await p.locator('[data-square=e2]').tap();assert.equal(await p.locator('.legal').count(),0);
 // Invalid claim with intended move doesn't play the move.
 await seed(p,'4k2r/8/8/8/8/8/8/R3K3 w - - 0 1');
 await p.locator('#settings').tap();await p.locator('#claim').tap();await move(p,'a1','a2');assert.equal((await get(p)).moves.length,0);assert((await p.locator('#status').textContent()).includes('ne permet pas'));
 await seed(p,'4k2r/8/8/8/8/8/8/R3K3 w - - 99 1');await p.locator('#settings').tap();await p.locator('#claim').tap();await move(p,'a1','a2');assert((await get(p)).claimed);assert.equal((await get(p)).moves.length,0,'intended move declared, not executed');
 await seed(p,'4k2r/8/8/8/8/8/8/R3K3 w - - 150 1');assert((await p.locator('#status').textContent()).includes('75 coups'));
 // corrupted save starts safely, without JS errors
 await p.evaluate(k=>localStorage.setItem(k,'{"v":1,"moves":["bad"],"mode":"two"}'),KEY);await p.reload();assert.equal((await get(p)).moves.length,0);
 await p.screenshot({path:'/tmp/chess-'+eng+'-'+w+'.png'});
 console.log(eng,w+'x'+h,'UI pass');await c.close();
 }
 assert.deepEqual(errors,[]);await br.close();
}
console.log('chess Chrome/WebKit all UI, cancellation, promotion, draws, save failure paths pass');
})().catch(e=>{console.error(e);process.exit(1)});
