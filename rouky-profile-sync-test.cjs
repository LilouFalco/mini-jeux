const {chromium,webkit}=require('/tmp/qa/node_modules/playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const PORT=process.argv[2],ORIGIN='http://127.0.0.1:'+PORT,ROOT=__dirname;const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/json'};
(async()=>{let n=0;for(const eng of [chromium,webkit]){const b=await eng.launch();for(const game of ['morpion','puissance4']){
const c=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});let ext=0;
await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==ORIGIN){ext++;return r.abort()}const f=u.pathname==='/'?'index.html':u.pathname.slice(1);if(['online-config.js','vendor/supabase-2.118.0.js'].includes(f))return r.fulfill({contentType:'application/javascript',body:''});try{r.fulfill({contentType:mime[path.extname(f)]||'text/plain',body:fs.readFileSync(path.join(ROOT,f))})}catch{r.fulfill({status:404,body:''})}});
await c.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');window.MiniOnline={};localStorage.setItem('mini-online-pseudo','SavedGuest')});
await c.addInitScript(()=>{window.MiniOnline={client:async()=>({}),rpc:async(n)=>{if(n.includes('list_rooms')||n.includes('my_rooms'))return [];throw Error('MOCK_STOP')},friendly:()=>'MOCK_STOP'}});
const p=await c.newPage();await p.goto(ORIGIN+'/'+game+'.html?mode=online');await p.waitForFunction(()=>window.RoukyProfile&&document.querySelector('.mbar'));
await p.locator('#online-pseudo').waitFor();
// profile -> lobby
await p.evaluate(()=>RoukyProfile.save({pseudo:'ProfileNew'}));await p.getByRole('button',{name:'Hors ligne',exact:true}).click();await p.locator('#online-toggle').click();await p.locator('#online-pseudo').waitFor();assert.equal(await p.locator('#online-pseudo').inputValue(),'ProfileNew');
// lobby -> profile
await p.waitForFunction(()=>!document.querySelector('.online-actions button').disabled);await p.locator('#online-pseudo').fill('LobbyNew');await p.locator('#online-room-name').fill('MockRoom');await p.getByRole('button',{name:'Créer',exact:true}).click();await p.waitForTimeout(300);
let r=await p.evaluate(()=>({g:RoukyProfile.get().pseudo,a:localStorage.getItem('mini-online-pseudo'),k:localStorage.getItem('mini-online-nickname'),auth:localStorage.getItem('mini-online-auth-v1')}));
assert.deepEqual([r.g,r.a,r.k,r.auth],['LobbyNew','LobbyNew','LobbyNew',null]);
await p.reload();await p.waitForFunction(()=>window.RoukyProfile);r=await p.evaluate(()=>RoukyProfile.get().pseudo);assert.equal(r,'LobbyNew');
// XSS-ish pseudo stays sanitized
await p.evaluate(()=>RoukyProfile.save({pseudo:'<img src=x onerror=alert(1)>\u202e'}));const x=await p.evaluate(()=>RoukyProfile.get().pseudo);assert(!/\u202e/.test(x));assert.equal(await p.locator('img[src=x]').count(),0);
assert.equal(ext,0);n++;await c.close()}await b.close()}console.log('profile/lobby sync PASS',n,'contexts')})().catch(e=>{console.error(e.message.slice(0,500));process.exit(1)})