/* Naval online UI test: real naval-online.js + real SQL (pglite), no network, no Supabase.
 * Two browser pages = two users. PGLITE_MODULE / PLAYWRIGHT_MODULE env override module paths. */
const {PGlite}=require(process.env.PGLITE_MODULE||'/tmp/onlineqa/node_modules/@electric-sql/pglite');
const pw=require(process.env.PLAYWRIGHT_MODULE||'/tmp/qa/node_modules/playwright');
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
 await db.exec(fs.readFileSync(process.env.UNDERCOVER_004_FIXTURE || '/tmp/remaining-sql/sql/test-fixtures/004-applied-rules.sql','utf8'));
 const users=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003'];
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
 const browser=await pw[process.env.ENGINE||'chromium'].launch();
 const departure=[{calls:0},{calls:0},{calls:0}];
 const mk=async i=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();
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
  await page.goto(base+'/undercover.html?mode=online');return {page,logs};
 };

 const clients=await Promise.all([0,1,2].map(mk));
 const room='Undercover '+Date.now();
 for (let i=0;i<3;i++) {
  const p=clients[i].page;
  await p.waitForSelector('#online-pseudo');
  await p.fill('#online-pseudo',['Alice','Bob','Cleo'][i]);await p.fill('#online-room-name',room);
  await p.getByRole('button',{name:i===0?'Créer':'Rejoindre',exact:true}).click();
  await p.waitForSelector('#uc-ready');
 }
 const snap=async i=>{const rs=await rpc(i,'online_my_rooms_game',{p_game:'undercover'});return rpc(i,'online_room_status',{p_room:rs[0].id})};
 const act=async(i,kind,data={})=>{const r=await snap(i);return rpc(i,'online_hidden_action',{p_room:r.id,p_instance:r.instance,p_version:r.version,p_action:require('crypto').randomUUID(),p_kind:kind,p_data:data})};
 const refresh=async i=>{await clients[i].page.getByRole('button',{name:'Actualiser',exact:true}).click()};
 for(let i=0;i<3;i++){await clients[i].page.click('#uc-ready');await clients[i].page.waitForFunction(()=>document.querySelector('#uc-ready')?.textContent.includes('Pas encore'))}
 await refresh(0);await clients[0].page.click('#uc-start');
 for(let i=0;i<3;i++){await refresh(i);await clients[i].page.waitForSelector('#uc-reveal')}
 const stored=(await db.query('select state from app_private.hidden_games')).rows[0].state;
 const rs=await Promise.all([0,1,2].map(snap));
 for(let i=0;i<3;i++){
  const s=rs[i];assert.deepEqual(Object.keys(s.hidden).sort(),['alive','own','phase','votesCast']);
  assert.deepEqual(s.hidden.own,stored.players[s.seat]);assert(!('players' in s.hidden));assert(!('votes' in s.hidden));
  assert.equal(await clients[i].page.locator('#uc-secret .word').count(),0);
  await clients[i].page.click('#uc-reveal');assert.equal(await clients[i].page.locator('#uc-secret .word').textContent(),s.hidden.own.word);
  await clients[i].page.click('#uc-reveal');assert.equal(await clients[i].page.locator('#uc-secret .word').count(),0);
 }
 // A cyclic vote is tied, all remain alive and a fresh vote is allowed.
 for(let i=0;i<3;i++)await act(i,'vote',{seat:rs[(i+1)%3].seat});
 assert(Object.values((await snap(0)).hidden.alive).every(Boolean));
 assert.deepEqual((await snap(0)).hidden.votesCast,[]);
 const badIndex=rs.findIndex(r=>r.hidden.own.role==='undercover'), target=rs[badIndex].seat;
 for(let i=0;i<3;i++){
  await refresh(i);
  const seat=i===badIndex?rs[(i+1)%3].seat:target;
  await clients[i].page.click('#uc-votes [data-seat="'+seat+'"]');
  if(i<2) {
   await clients[i].page.waitForFunction(()=>document.querySelector('#online-content').textContent.includes('Vote enregistré'));
   assert.equal(await clients[i].page.locator('#uc-votes button:not([disabled])').count(),0);
   const s=await snap(i);assert(!('votes' in s.hidden));
  }
 }
 for(let i=0;i<3;i++){await refresh(i);await clients[i].page.waitForSelector('#uc-result');assert((await clients[i].page.locator('#uc-result').textContent()).includes('Résultat indisponible'))}
 assert.equal((await snap(0)).status,'finished');assert.equal((await snap(0)).winner,0);
 // Remaining-only canonical 005, after the already-applied 004 test fixture.
 const migration = process.env.UNDERCOVER_MIGRATION || '/tmp/remaining-sql/sql/005-remaining-online.sql';
 await db.exec(fs.readFileSync(migration,'utf8'));
 for(let i=0;i<3;i++){
  const r=await snap(i);assert.equal(r.hidden.winner,'civils');assert(!('players' in r.hidden));assert(!('votes' in r.hidden));
  await refresh(i);assert.equal(await clients[i].page.locator('#uc-result').textContent(),'Les civils ont gagné !');
  const fit=await clients[i].page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert(fit);
  assert.deepEqual(clients[i].logs,[]);
 }

 // Start a second round through real SQL. Active snapshots never reveal a team;
 // eliminate a civil to reach the impostors' terminal condition with three seats.
 await rpc(0,'online_depart_room',{p_room:rs[0].id});
 let second=await rpc(0,'online_create_room_game',{p_game:'undercover',p_name:'Second '+Date.now(),p_pseudo:'Alice',p_action:require('crypto').randomUUID()});
 for(let i=1;i<3;i++)await rpc(i,'online_join_room_game',{p_game:'undercover',p_name:second.name,p_pseudo:'P'+i});
 const s2=async i=>rpc(i,'online_room_status',{p_room:second.id});
 const a2=async(i,k,d={})=>{const s=await s2(i);return rpc(i,'online_hidden_action',{p_room:s.id,p_instance:s.instance,p_version:s.version,p_action:require('crypto').randomUUID(),p_kind:k,p_data:d})};
 for(let i=0;i<3;i++)await a2(i,'ready');await a2(0,'start');
 const ss=await Promise.all([0,1,2].map(s2));
 for(const s of ss){assert.equal(Object.hasOwn(s.hidden,'winner'),false);assert(!('votes' in s.hidden));}
 const civil=ss.findIndex(s=>s.hidden.own.role==='civil'),ct=ss[civil].seat;
 await assert.rejects(()=>a2(civil,'vote',{seat:ct}),/INVALID_VOTE/);
 for(let i=0;i<3;i++){
  await a2(i,'vote',{seat:i===civil?ss[(i+1)%3].seat:ct});
  if(i===0)await assert.rejects(()=>a2(i,'vote',{seat:i===civil?ss[(i+1)%3].seat:ct}),/ALREADY_VOTED/);
 }
 for(let i=0;i<3;i++){const s=await s2(i);assert.equal(s.status,'finished');assert.equal(s.hidden.winner,'impostors');assert(!('players' in s.hidden));assert(!('votes' in s.hidden));}
 // Non-member private snapshot access is denied, hidden table remains inaccessible.
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",['20000000-0000-4000-8000-000000000099']);
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from app_private.hidden_games'),/permission denied/);await db.exec('reset role');
 // Offline engine still deals and scores normally.
 const U=require('./undercover-engine');const g=U.deal(5,{mw:true,themes:['general']});assert.equal(g.roles.length,5);assert.equal(g.roles.filter(x=>x==='white').length,1);
 console.log('PASS',migration,process.env.ENGINE||'chromium','SQL001002003+004fixture+005 three identities start secret reveal hide tied/private votes finished honest fallback canonical005 terminal-only winner offline engine');
 await browser.close();srv.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
