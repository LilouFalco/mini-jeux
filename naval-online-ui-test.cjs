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
 const users=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'];
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
 const browser=await pw.chromium.launch();
 const departure=[{calls:0},{calls:0}];
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
  await page.goto(base+'/naval.html?mode=online');return {page,logs};
 };
 const A=await mk(0),B=await mk(1);
 const snap=async i=>{const r=await rpc(i,'online_my_rooms_game',{p_game:'naval'});return rpc(i,'online_room_status',{p_room:r[0].id})};
 const room='Mer '+Date.now()%1e5;
 for(const [c,n,create] of [[A,'Alice',true],[B,'Bob',false]]){
  await c.page.waitForSelector('#online-pseudo',{timeout:8000}).catch(async e=>{console.log(c.logs,await c.page.locator('#online-root').innerText());throw e});await c.page.fill('#online-pseudo',n);await c.page.fill('#online-room-name',room);
  await c.page.click(create?'text=Créer':'text=Rejoindre');await c.page.waitForSelector('#on-rand');
 }
 const refresh=async c=>c.page.click('text=Actualiser');
 for(const c of [A,B]){await c.page.click('#on-rand');await c.page.click('#on-validate');await c.page.waitForSelector('#on-ready:not([disabled])',{timeout:6000}).catch(async e=>{console.log(c.logs,await c.page.locator('#online-status').innerText(),(await db.query('select state from app_private.hidden_games')).rows.length,await c.page.locator('#online-content').innerText());throw e});await c.page.click('#on-ready');await c.page.waitForFunction(()=>document.querySelector('#on-ready')?.textContent.includes('Pas encore'))}
 // Edit after ready: must unready first, then require ready again.
 await A.page.click('#on-edit');await A.page.waitForSelector('#on-validate');
 assert.equal((await snap(0)).members.find(m=>m.seat===1).ready,false,'edit unreadies');
 assert.equal(await A.page.locator('#on-ready:not([disabled])').count(),0,'ready locked while editing');
 await A.page.click('#on-rand');await A.page.click('#on-validate');await A.page.waitForSelector('#on-ready:not([disabled])');await A.page.click('#on-ready');
 await A.page.waitForFunction(()=>document.querySelector('#on-ready')?.textContent.includes('Pas encore'));
 await refresh(A);await A.page.waitForSelector('#on-start:not([disabled])');await A.page.click('#on-start');
 await A.page.waitForSelector('#on-target');await refresh(B);await B.page.waitForSelector('#on-target');
 // Secret check: no page DOM or snapshot has the enemy fleet. Compare data returned to each page.
 const sa=await snap(0),sb=await snap(1),stored=(await db.query("select state from app_private.hidden_games")).rows[0].state;
 const foeCellsB=JSON.stringify(stored.players['2'].cells),foeCellsA=JSON.stringify(stored.players['1'].cells);
 assert.deepEqual(Object.keys(sa.hidden).sort(),['own','phase','shots']);
 assert.equal(JSON.stringify(sa.hidden).includes('"players"'),false);assert.equal(JSON.stringify(sa.hidden.own.cells),foeCellsA);
 assert.equal(JSON.stringify(sb.hidden.own.cells),foeCellsB);assert.notEqual(foeCellsA,foeCellsB);
 assert.equal('ships' in (sa.hidden.shots||{}),false);
 // A is on turn: B cannot shoot, A shoots a cell
 assert.equal(await B.page.locator('#on-target .nc:not([disabled])').count(),0);
 await A.page.click('#on-target .nc[data-cell="0"]');await A.page.waitForFunction(()=>/touché|eau/.test(document.querySelector('#on-target [data-cell="0"]').getAttribute('aria-label')));
 assert.equal(await A.page.locator('#on-target .nc:not([disabled])').count(),0,'turn passed');
 // repeat shot rejected server side
 const sa2=await snap(0);await assert.rejects(()=>rpc(0,'online_hidden_action',{p_room:sa2.id,p_instance:sa2.instance,p_version:sa2.version,p_action:require('crypto').randomUUID(),p_kind:'shoot',p_data:{cell:0}}),/NOT_YOUR_TURN/);
 await refresh(B);await B.page.waitForFunction(()=>!document.querySelector('#on-target .nc:not([disabled])')===false);
 // A fires every enemy ship cell through the UI (test-only knowledge); B fires blind misses/hits.
 const todo=stored.players['2'].cells.filter(c=>c!==0);let bshots=0;
 for(let it=0;it<60;it++){
  const k=await snap(0);if(k.status==='finished')break;
  if(k.turn===1){await refresh(A);const cell=todo.shift();await A.page.click('#on-target .nc[data-cell="'+cell+'"]:not([disabled])');await A.page.waitForFunction(c=>/touché/.test(document.querySelector('#on-target [data-cell="'+c+'"]').getAttribute('aria-label')),cell)}
  else{await refresh(B);await B.page.waitForSelector('#on-target .nc:not([disabled])');const free=await B.page.locator('#on-target .nc:not([disabled])').first().getAttribute('data-cell');await B.page.click('#on-target .nc[data-cell="'+free+'"]:not([disabled])');bshots++}
 }
 const fin=await snap(0);assert.equal(fin.status,'finished');assert.equal(fin.winner,1);
 await refresh(A);await A.page.waitForFunction(()=>/gagné/.test(document.querySelector('#online-status').textContent));
 // Deliver actual SQL notifications through the stubbed broadcast transport, not a refresh click.
 const flushRealtime=async()=>{
  await chain;
  const sent=(await db.query('delete from realtime.sent returning event,payload')).rows;
  for(const msg of sent)for(const c of [A,B])
   await c.page.evaluate(m=>window.__deliverRealtime(m.event,m.payload),msg);
 };
 const exit=c=>c.page.getByRole('button',{name:'Hors ligne',exact:true});
 const closed=async c=>c.page.waitForFunction(()=>document.querySelector('#online-root').hidden,{timeout:3000});
 const peerLobby=async c=>{
  await flushRealtime();
  await c.page.waitForSelector('#online-pseudo',{timeout:3000});
  assert.match(await c.page.locator('#online-status').innerText(),/quitté/);
 };
 const noRoom=async()=>{
  await chain;
  assert.equal((await db.query('select count(*)::int as n from app_private.rooms')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from app_private.hidden_games')).rows[0].n,0);
 };
 let round=0;
 const newRoom=async()=>{
  const name='Sortie '+(++round);
  // Rotate final host to stay within the real SQL three-creates/minute quota.
  const seats=round===3?[[B,'Bob',true],[A,'Alice',false]]:[[A,'Alice',true],[B,'Bob',false]];
  for(const [c,n,create] of seats){
   if(await c.page.locator('#online-root').evaluate(e=>e.hidden))await c.page.click('#online-toggle');
   await c.page.waitForSelector('#online-pseudo');
   await c.page.fill('#online-pseudo',n);await c.page.fill('#online-room-name',name);
   await c.page.getByRole('button',{name:create?'Créer':'Rejoindre',exact:true}).click();
   await c.page.waitForSelector('#on-rand');
  }
 };
 // Host exits the completed match; peer reaches lobby from termination notification, under heartbeat interval.
 let before=departure[0].calls;
 await exit(A).click();await closed(A);await noRoom();await peerLobby(B);
 assert.equal(departure[0].calls,before+1,'host departure once');
 // Guest exits a waiting room.
 await newRoom();before=departure[1].calls;
 await exit(B).click();await closed(B);await noRoom();await peerLobby(A);
 assert.equal(departure[1].calls,before+1,'guest departure once');
 // Rejected departure must retain the online room and permit the same exit to be retried.
 await newRoom();const retained=await snap(0);departure[0].fail=true;before=departure[0].calls;
 await exit(A).click();
 await A.page.waitForFunction(()=>document.querySelector('#online-status').textContent.includes('TEST_DEPART_FAILED'));
 assert.equal(await A.page.locator('#online-root').evaluate(e=>e.hidden),false);
 assert.equal(await A.page.locator('#on-rand').count(),1);
 assert.equal((await snap(0)).id,retained.id);
 assert.equal((await snap(1)).id,retained.id);
 await exit(A).click();await closed(A);await noRoom();await peerLobby(B);
 assert.equal(departure[0].calls,before+2,'failure then successful retry');
 // Hold departure unresolved and dispatch two clicks synchronously. Busy guard must allow one RPC only.
 await newRoom();before=departure[1].calls;
 let release;departure[1].gate=new Promise(resolve=>{release=resolve});
 await exit(B).evaluate(b=>{b.click();b.click()});
 await B.page.waitForFunction(()=>document.querySelector('#on-rand').disabled);
 // A local RPC barrier ensures the exposed departure call has arrived without sleeps.
 await B.page.evaluate(()=>window.__rpc('online_my_rooms_game',{p_game:'naval'}));
 assert.equal(departure[1].calls,before+1,'double-click sends one departure while unresolved');
 assert.equal(await B.page.locator('#online-root').evaluate(e=>e.hidden),false);
 assert.equal((await snap(1)).id,(await snap(0)).id);
 release();departure[1].gate=null;
 await closed(B);await noRoom();await peerLobby(A);
 assert.equal(departure[1].calls,before+1,'still one departure after resolution');
 console.log('PASS naval exit regressions: host/guest immediate SQL deletion + broadcast peer lobby; failure retains room/retry; delayed double-click one RPC');
 for(const c of [A,B])assert.deepEqual(c.logs,[]);
 console.log('PASS naval online UI against real SQL: lobby, placement, ready/start, turns, hidden fleets, win; B shots',bshots);
 await browser.close();srv.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
