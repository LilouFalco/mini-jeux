const G=require('./test-guard.cjs'),{chromium}=require('/tmp/qa/node_modules/playwright'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
(async()=>{
 const b=await G.launch(chromium,'chromium');
 for(const scenario of ['sdk-failure','auth-disabled','storage-blocked']){
  const c=await G.newContext(b,{viewport:{width:360,height:640},isMobile:true,hasTouch:true}),p=await c.newPage(),errors=[],requests=[];
  p.on('pageerror',e=>errors.push(e.message));
  // Only the reserved endpoint may be mocked (registered after the guard so it wins); everything else stays blocked by the guard.
  await c.route(/^https:\/\/project\.invalid\//,r=>{
   requests.push(r.request().url());
   if(scenario==='auth-disabled')r.fulfill({status:422,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'anonymous_provider_disabled',msg:'Anonymous sign-ins are disabled'})});
   else r.abort();
  });
  if(scenario==='sdk-failure')await c.route('**/vendor/supabase-2.118.0.js',r=>r.abort());
  if(scenario==='storage-blocked')await p.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new Error('blocked')}});
  await p.goto(BASE+'morpion.html');
  assert.equal(requests.length,0,'offline screen must not contact Auth');
  await p.locator('#online-toggle').click();await p.waitForSelector('#online-content button');
  await p.waitForFunction(()=>!/Connexion au petit salon/.test(document.querySelector('#online-status').textContent));
  if(scenario==='auth-disabled')assert.ok(requests.some(u=>/\/auth\/v1\/signup/.test(u)),'mocked signup attempted on reserved endpoint only');
  const text=await p.locator('#online-status').textContent();
  if(scenario==='auth-disabled')assert(text.includes('activation'));
  if(scenario==='storage-blocked')assert(text.includes('stockage'));
  assert(!await p.locator('#online-content').textContent().then(s=>s.includes('undefined')));
  await p.getByRole('button',{name:'Hors ligne',exact:true}).click();
  await p.locator('[data-mode=two]').click();
  for(const i of [0,3,1,4,2])await p.locator('#board .mcell').nth(i).click();
  assert((await p.locator('#status').textContent()).includes('gagné'));
  assert.deepEqual(errors,[]);
  if(scenario!=='auth-disabled')assert.equal(requests.length,0);
  console.log('PASS',scenario,'clear error and offline game unaffected');await c.close();
 }
 await b.close();G.assertClean('online-failure-test');
})().catch(e=>{console.error(e);process.exit(1)});
