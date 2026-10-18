// Future separately authorized bootstrap only. Never run automatically.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert.equal(process.env.ONLINE_BOOTSTRAP_TWO,'AUTHORIZED','explicit future authorization required');
const files=(process.env.ONLINE_SESSION_FILES||'').split(',').filter(Boolean);
assert.equal(files.length,2);
for(const f of files){assert.ok(path.resolve(f).startsWith('/tmp/'));const dir=path.dirname(path.resolve(f));assert.notEqual(dir,'/tmp');fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);assert.ok(!fs.existsSync(f),'refuse to overwrite saved identity');}
const pw=require('/tmp/qa/node_modules/playwright');
(async()=>{
 const browser=await pw.chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
 try{for(const file of files){
 const c=await browser.newContext({serviceWorkers:'block'});let attempts=0;
 await c.route('**/auth/v1/signup',r=>++attempts===1?r.continue():r.abort('blockedbyclient'));
 const p=await c.newPage();
 p.on('response',async r=>{if(r.status()===429&&r.url().includes('/auth/v1/signup')){const h=await r.allHeaders();const metadata={observedAt:new Date().toISOString(),status:429,date:h.date||null,retryAfter:h['retry-after']||null};const f=path.join(path.dirname(file),'auth429-metadata.json');fs.writeFileSync(f,JSON.stringify(metadata,null,2),{mode:0o600});fs.chmodSync(f,0o600);}});
 try{
 await p.goto((process.env.BASE||'http://localhost:28461/')+'morpion.html');await p.locator('#online-toggle').click();
 await p.waitForSelector('#online-pseudo',{timeout:20000});
 const state=await c.storageState();assert.ok(state.origins.some(o=>o.localStorage.some(x=>x.name==='mini-online-auth-v1')));
 fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});fs.chmodSync(file,0o600);
 }finally{await c.close();}
 }}finally{await browser.close();}
})().catch(()=>{console.error('Bootstrap stopped; no retries. Inspect protected safe metadata if present.');process.exit(1)});
