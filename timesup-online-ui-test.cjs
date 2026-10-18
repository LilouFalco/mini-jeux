/* Naval online UI test: real naval-online.js + real SQL (pglite), no network, no Supabase.
 * Two browser pages = two users. PGLITE_MODULE / PLAYWRIGHT_MODULE env override module paths. */
const {PGlite}=require(process.env.PGLITE_MODULE||'/tmp/onlineqa/node_modules/@electric-sql/pglite');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
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
 for (const engine of ['chromium','webkit']) {
 const browser=await pw[engine].launch();
 const departure=users.map(()=>({calls:0}));
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
  await page.goto(base+'/timesup.html?mode=online');return {page,logs};
 };

 const pages = [];
 for(let i=0;i<4;i++) pages.push(await mk(i));
 const snap=async i=>{const rooms=await rpc(i,'online_my_rooms_game',{p_game:'timesup'});return rpc(i,'online_room_status',{p_room:rooms[0].id})};
 const refresh=async i=>{await pages[i].page.getByRole('button',{name:'Actualiser',exact:true}).click();};
 const room='Time '+engine+' '+Date.now()%1e6;
 for(let i=0;i<4;i++){
  const p=pages[i].page;
  await p.waitForSelector('#online-pseudo');await p.fill('#online-pseudo','Test '+i);await p.fill('#online-room-name',room);
  await p.getByRole('button',{name:i?'Rejoindre':'Créer',exact:true}).click();await p.waitForSelector('#tu-ready');
  if(i===1){await refresh(0);assert.equal(await pages[0].page.locator('#tu-start').isDisabled(),true,'two cannot start');}
  await p.click('#tu-ready');await p.waitForFunction(()=>document.querySelector('#tu-ready')?.textContent.includes('Pas encore'));
 }
 await refresh(0);await pages[0].page.click('#tu-start');await pages[0].page.waitForSelector('#tu-begin');
 const call=async(i,kind)=>{const s=await snap(i);return rpc(i,'online_hidden_action',{p_room:s.id,p_instance:s.instance,p_version:s.version,p_action:require('crypto').randomUUID(),p_kind:kind,p_data:{}})};
 await pages[0].page.click('#tu-begin');await pages[0].page.waitForSelector('#tu-card');
 let st=await snap(0);const first=st.hidden.card;assert.equal(st.hidden.remaining,16);
 assert(Date.parse(st.hidden.deadline)>Date.now()+55000);
 for(let i=1;i<4;i++){const h=(await snap(i)).hidden;assert.equal(h.card,null);assert(!('deck'in h));assert(!('pile'in h));await refresh(i);assert.equal(await pages[i].page.locator('#tu-card').count(),0);}
 await assert.rejects(()=>call(2,'found'),/NOT_YOUR_TURN/);
 await pages[0].page.click('#tu-pass');await pages[0].page.waitForFunction(x=>document.querySelector('#tu-card')?.textContent!==x,first);
 assert.equal((await snap(0)).hidden.remaining,16);
 // Deadline is owned by SQL. Accelerate only the stored deadline to avoid a real minute.
 await db.query("update app_private.hidden_games set state=jsonb_set(state,'{deadline}',to_jsonb((now()-interval '1 second')::text)) where room_id=$1",[st.id]);
 await assert.rejects(()=>call(0,'found'),/TURN_EXPIRED/);
 await refresh(1);await pages[1].page.waitForSelector('#tu-end');await pages[1].page.click('#tu-end');await pages[1].page.waitForSelector('#tu-begin');
 assert.equal((await snap(1)).turn,2);
 // All 48 found actions through browser UI, alternating actors at round boundaries.
 for(let round=0;round<3;round++){
  st=await snap(0);const idx=st.turn-1,p=pages[idx].page;await refresh(idx);await p.waitForSelector('#tu-begin');await p.click('#tu-begin');await p.waitForSelector('#tu-card');
  for(let j=0;j<16;j++){await p.click('#tu-found');await p.waitForFunction(n=>{const t=document.querySelector('#online-content')?.textContent||'';return n===1?!document.querySelector('#tu-found'):t.includes((n-1)+' cartes restantes')},16-j);}
  st=await snap(0);if(round<2)assert.equal(st.hidden.round,round+1);
 }
 st=await snap(0);assert.equal(st.status,'finished');assert.equal(Object.values(st.hidden.scores).reduce((a,b)=>a+b,0),48);
 for(let i=0;i<4;i++){await refresh(i);await pages[i].page.waitForSelector('#tu-result');assert.equal(await pages[i].page.locator('#tu-card').count(),0);assert.deepEqual(pages[i].logs,[]);}
 // Reload preserves identity and finished room, with explicit resume.
 await pages[0].page.reload();await pages[0].page.waitForSelector('.online-resume');await pages[0].page.locator('.online-resume').first().click();await pages[0].page.waitForSelector('#tu-result');
 await rpc(0,'online_depart_room',{p_room:st.id});
 for(const p of pages) await p.page.context().close();
 await browser.close();console.log(engine+' real SQL + four distinct browser identities PASS');
 }
 srv.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
