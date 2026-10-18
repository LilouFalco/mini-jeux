/* Petit Bac UI test with real SQL001-003 + applied004 fixture + canonical pending005. No external network.
 * Four mock browser identities; auth/realtime/cron explicitly stubbed. PGLITE_MODULE / PLAYWRIGHT_MODULE env override module paths. */
const guard=require('./test-guard.cjs');
const {PGlite}=require(process.env.PGLITE_MODULE||'/tmp/onlineqa/node_modules/@electric-sql/pglite');
const pw=require(process.env.PLAYWRIGHT_MODULE||'/opt/hako/lib/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const db=new PGlite();
 await db.exec("create role anon; create role authenticated; create schema auth; create schema realtime; create table auth.users(id uuid primary key);"+
 "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;"+
 "create table realtime.messages(extension text); create table realtime.sent(payload jsonb,event text,topic text,private boolean);"+
 "create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;"+
 "create function realtime.send(p jsonb,e text,t text,b boolean) returns void language sql as $$ insert into realtime.sent values(p,e,t,b) $$; alter table realtime.messages enable row level security;");
 await db.exec("create schema cron; create table cron.job(jobname text,active boolean default true,command text); create function cron.schedule(a text,b text,c text) returns bigint language sql as $$ insert into cron.job(jobname,command) values(a,c) returning 1::bigint $$;");
 // pg_cron is stubbed (no real scheduler in pglite); only the extension availability preflight is stripped.
 for(const f of ['001-online','002-online-puissance4','003-online-lifecycle']){let t=fs.readFileSync(path.join(__dirname,'sql',f+'.sql'),'utf8');if(f.startsWith('003'))t=t.replace(/ if not exists\(select 1 from pg_available_extensions[\s\S]*?create extension if not exists pg_cron;\n/,'');await db.exec(t)}
 const users=Array.from({length:4},(_,i)=>'20000000-0000-4000-8000-00000000000'+(i+1));
 const canonical=process.env.REMAINING_SQL_ROOT||'/tmp/remaining-sql/sql';
 const remaining=fs.readFileSync(canonical+'/005-remaining-online.sql','utf8');
 assert.equal(require('crypto').createHash('sha256').update(remaining).digest('hex'),'176b6a0be72f9c653144cc792604fb91a6909b5c365b89cafb10e3664e88b763');
 await db.exec(fs.readFileSync(canonical+'/test-fixtures/004-applied-rules.sql','utf8'));
 await db.exec(remaining);
 for(const u of users)await db.query('insert into auth.users values($1)',[u]);
 let chain=Promise.resolve();
 const rpc=(i,name,args)=>chain=chain.catch(()=>{}).then(async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[i]]);await db.exec('set role authenticated');
  const keys=Object.keys(args||{});
  try{return (await db.query('select public.'+name+'('+keys.map((k,j)=>(k==='p_data'?'$'+(j+1)+'::jsonb':'$'+(j+1))).join(',')+') as value',keys.map(k=>k==='p_data'?JSON.stringify(args[k]):args[k]))).rows[0].value}
  catch(e){const err=new Error(e.message);throw err}finally{await db.exec('reset role')}});
 const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.woff2':'font/woff2','.mjs':'text/javascript'};
 const srv=http.createServer((q,s)=>{const p=path.join(__dirname,decodeURIComponent(new URL(q.url,'http://x').pathname).replace(/\/$/,'/index.html'));if(!p.startsWith(__dirname)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){s.writeHead(404);return s.end()}s.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});s.end(fs.readFileSync(p))}).listen(0);
 const base='http://127.0.0.1:'+srv.address().port;
 for(const engine of ['chromium','webkit']) {
 const browser=await guard.launch(pw[engine],engine);
 const departure=users.map(()=>({calls:0}));
 const mk=async i=>{
  const ctx=await guard.newContext(browser,{viewport:{width:390,height:844}});const page=await ctx.newPage();
  // Fail closed on non-local requests; all RPC/auth/realtime below are local stubs.
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const logs=[];page.on('pageerror',e=>logs.push(e.message));
  await page.exposeFunction('__rpc',async(n,a)=>{
   if(n==='online_depart_room'){
    const d=departure[i];d.calls++;
    if(d.fail){d.fail=false;throw new Error('TEST_DEPART_FAILED')}
    if(d.gate)await d.gate;
   }
   return rpc(i,n,a);
  });
  await page.addInitScript(()=>{
   const handlers=[];
   window.__deliverRealtime=(event,payload)=>{for(const h of handlers)if(h.type==='broadcast'&&h.event===event)h.fn({payload})};
   const ch={on(type,filter,fn){handlers.push({type,event:filter.event,fn});return ch},subscribe(){return ch},track(){return Promise.resolve()}};
   window.MiniOnline={client:async()=>({realtime:{setAuth(){return Promise.resolve()}},channel:()=>ch,removeChannel:async()=>{}}),
    rpc:(n,a)=>window.__rpc(n,a).catch(e=>{const x=new Error(String(e.message).replace(/^Error: /,''));throw x}),friendly:e=>String(e.message)};
   window.confirm=()=>true;
  });
  await page.goto(base+'/petitbac.html?mode=online');return {page,logs,ctx};
 };

 // Prevent contract drift back to guessed UUID ordering or obsolete local SQL.
 const product=fs.readFileSync(__dirname+'/petitbac-online.js','utf8');
 assert.ok(product.includes('pb.answersBySeat') && product.includes('pb.marksBySeat') && product.includes('pb.players'));
 assert.ok(!/answers_by_seat|marks_by_seat|pb\.submitted/.test(product));
 assert.equal(fs.existsSync(__dirname+'/sql/004-petitbac-view.sql'),false);
 const clients=[];
 for(let i=0;i<4;i++)clients.push(await mk(i));
 const snap=async i=>{const rooms=await rpc(i,'online_my_rooms_game',{p_game:'petitbac'});return rpc(i,'online_room_status',{p_room:rooms[0].id})};
 const room='Bac '+engine;
 const refresh=async c=>{await c.page.getByRole('button',{name:'Actualiser',exact:true}).click();};
 for(let i=0;i<4;i++){
  const c=clients[i];
  await c.page.waitForSelector('#online-pseudo');
  await c.page.fill('#online-pseudo','Player '+i);
  await c.page.fill('#online-room-name',room);
  await c.page.getByRole('button',{name:i===0?'Créer':'Rejoindre',exact:true}).click();
  await c.page.waitForSelector('#pb-ready');
  await c.page.click('#pb-ready');
  await c.page.waitForFunction(()=>document.querySelector('#pb-ready')?.textContent==='Pas encore prête');
 }
 const A=clients[0],B=clients[1];
 await refresh(A);await A.page.waitForSelector('#pb-start:not([disabled])');await A.page.click('#pb-start');
 for(const c of clients){await refresh(c);await c.page.waitForSelector('#pb-submit');}
 const secrets=[];
 for(let i=0;i<4;i++){
  const c=clients[i];await refresh(c);secrets[i]='SECRET_'+engine+'_'+i;
  await c.page.fill('#pb-answer-prenom',secrets[i]);await c.page.click('#pb-submit');
  await c.page.waitForFunction(()=>!document.querySelector('#pb-submit')?.disabled);
  assert.equal((await snap(i)).petitbac.answersBySeat[i+1]?.prenom,secrets[i]);
 }
 for(let i=0;i<4;i++){
  const s=await snap(i);
  assert.deepEqual(s.petitbac.players,[1,2,3,4].map(seat=>({seat,name:'Player '+(seat-1)})));
  assert.deepEqual(Object.keys(s.petitbac.answersBySeat),[String(i+1)]);
  assert.equal(s.petitbac.answersBySeat[i+1].prenom,secrets[i]);
  assert.deepEqual(Object.keys(s.petitbac.answers),[users[i]],'legacy UID contract preserved');
  for(let j=0;j<4;j++)if(j!==i)assert.ok(!JSON.stringify(s).includes(secrets[j]),'no other answer in snapshot');
 }
 await refresh(B);await B.page.click('#pb-stop');await B.page.waitForSelector('.pb-review');
 for(const c of clients){await refresh(c);await c.page.waitForSelector('.pb-review');assert.equal(await c.page.locator('.pb-review').count(),4);for(const secret of secrets)assert.ok((await c.page.locator('#online-content').innerText()).includes(secret));}
 assert.equal(await B.page.locator('[data-points]').count(),0,'nonhost cannot score');
 assert.equal(await A.page.locator('#pb-finish').isDisabled(),true);
 await A.page.screenshot({path:'/tmp/petitbac-'+engine+'-review.png'});
 for(let seat=1;seat<=4;seat++)for(const cat of ['prenom','ville','animal','metier','objet','pays']){
  await A.page.locator('.pb-review[data-seat="'+seat+'"] [data-category="'+cat+'"][data-points="10"]').click();
  await A.page.waitForFunction(({seat,cat})=>document.querySelector('.pb-review[data-seat="'+seat+'"] [data-category="'+cat+'"][data-points="10"]')?.getAttribute('aria-pressed')==='true',{seat,cat});
 }
 await A.page.click('#pb-finish');await A.page.waitForSelector('#pb-next');
 const finished=await snap(0);assert.equal(finished.status,'finished');
 assert.deepEqual(Object.keys(finished.petitbac.marksBySeat).sort(),['1','2','3','4']);
 for(let seat=1;seat<=4;seat++){
  assert.equal(finished.petitbac.answersBySeat[String(seat)].prenom,secrets[seat-1]);
  assert.deepEqual(finished.petitbac.marksBySeat[String(seat)],{prenom:10,ville:10,animal:10,metier:10,objet:10,pays:10});
 }
 for(const c of clients){await refresh(c);assert.ok((await c.page.locator('#online-content').innerText()).includes('60 points'));}
 await A.page.reload();await A.page.waitForSelector('#online-pseudo');await A.page.getByRole('button',{name:'Reprendre · '+room,exact:true}).click();await A.page.waitForSelector('#pb-next');
 await A.page.click('#pb-next');await A.page.waitForSelector('#pb-ready');
 for(const c of clients){await refresh(c);await c.page.click('#pb-ready');await c.page.waitForFunction(()=>document.querySelector('#pb-ready')?.textContent==='Pas encore prête');}
 await refresh(A);await A.page.click('#pb-start');await A.page.waitForSelector('#pb-submit');
 await refresh(B);await B.page.fill('#pb-answer-prenom','draft-preserved');await refresh(B);assert.equal(await B.page.inputValue('#pb-answer-prenom'),'draft-preserved');
 // Unknown transport outcome and retry preserve request ID: SQL receipts reject changed reuse.
 let st=await snap(0);
 const args={p_room:st.id,p_instance:st.instance,p_version:st.version,p_action:require('crypto').randomUUID(),p_kind:'submit',p_data:Object.fromEntries(st.petitbac.categories.map(c=>[c,'']))};
 const ack=await rpc(0,'online_petitbac_action',args);assert.deepEqual(await rpc(0,'online_petitbac_action',args),ack);
 await db.query("update app_private.pb_rounds set deadline=now()-interval '1 second' where room_id=$1",[st.id]);
 await refresh(B);await refresh(B);await B.page.click('#pb-stop');await B.page.waitForSelector('.pb-review');
 assert.equal((await snap(1)).petitbac.phase,'scoring');
 // Membership/host authorization enforced by installed SQL, not hidden controls.
 let current=await snap(1);
 await assert.rejects(()=>rpc(1,'online_petitbac_action',{p_room:current.id,p_instance:current.instance,p_version:current.version,p_action:require('crypto').randomUUID(),p_kind:'mark',p_data:{seat:1,category:'prenom',points:10}}),/HOST_ONLY/);
 const events=(await db.query('select payload from realtime.sent')).rows;assert.ok(events.every(e=>Object.keys(e.payload).sort().join(',')==='instance,version'||e.payload.terminated===true),'broadcast payloads carry no secrets');
 // Explicit depart returns remaining clients to directory with 003 termination.
 await A.page.getByRole('button',{name:'Quitter le salon',exact:true}).click();await A.page.waitForSelector('#online-pseudo');
 await refresh(B);await B.page.waitForSelector('#online-pseudo');
 for(const c of clients){assert.deepEqual(c.logs,[]);await c.ctx.close();}
 const offline=await guard.newContext(browser,{viewport:{width:390,height:844}});
 const p=await offline.newPage();await p.goto(base+'/petitbac.html');await p.waitForSelector('#go');
 assert.equal(await p.locator('#online-root').isHidden(),true);
 await p.click('#rd');
 await p.click('#go');await p.waitForSelector('#stop');
 await p.waitForFunction(()=>!document.querySelector('#lt.spin'),null,{timeout:6000});
 await p.click('#stop');await p.waitForSelector('#done');
 await p.locator('[data-c=prenom][data-i="0"]').click();await p.locator('[data-c=prenom][data-i="0"]').click();
 await p.locator('[data-c=animal][data-i="1"]').click();
 assert.ok((await p.locator('.tot').innerText()).includes('Joueur 1 10'));
 assert.ok((await p.locator('.tot').innerText()).includes('Joueur 2 5'));
 await p.click('#done');await p.waitForSelector('#nx');
 const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('lilou-petitbac-v1')));
 assert.deepEqual(saved.tot,[10,5,0]);assert.equal(saved.rounds,1);
 await p.reload();await p.waitForSelector('#go');
 assert.equal(await p.locator('#online-root').isHidden(),true);
 await offline.close();
 await browser.close();
 console.log('PASS '+engine+' real SQL001002003+applied004-fixture+canonical005 four identities: ready/start/secret submit/reveal/host judging/finish/reload/rejoin/next/timeout/leave/offline UI');
 }
 srv.close();await db.close();guard.assertClean();
})().catch(e=>{console.error(e);process.exit(1)});
