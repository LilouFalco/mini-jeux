/* Quiestce online UI test: real qe-online.js + real SQL (pglite), no network, no Supabase.
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
 for(const f of ['001-online','002-online-puissance4','003-online-lifecycle',...(process.env.QE_SIMPLE?[]:['004-quiestce-rules'])]){let t=fs.readFileSync(path.join(__dirname,'sql',f+'.sql'),'utf8');if(f.startsWith('003'))t=t.replace(/ if not exists\(select 1 from pg_available_extensions[\s\S]*?create extension if not exists pg_cron;\n/,'');await db.exec(t)}
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
 const browser=await pw[process.env.ENGINE||'chromium'].launch();
 const departure=[{calls:0},{calls:0}];
 const mk=async i=>{
  const ctx=await browser.newContext({viewport:{width:+(process.env.VW||390),height:+(process.env.VH||844)}});const page=await ctx.newPage();
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
  await page.addInitScript('window.QE_NORMAL_RULES='+(process.env.QE_SIMPLE?'false':'true'));await page.addInitScript(()=>{
   const handlers=[];
   window.__deliverRealtime=(event,payload)=>{for(const h of handlers)if(h.type==='broadcast'&&h.event===event)h.fn({payload})};
   const ch={on(type,filter,fn){handlers.push({type,event:filter.event,fn});return ch},subscribe(){return ch},track(){return Promise.resolve()}};
   window.MiniOnline={client:async()=>({realtime:{setAuth(){return Promise.resolve()}},channel:()=>ch,removeChannel:async()=>{}}),
    rpc:(n,a)=>window.__rpc(n,a).catch(e=>{const x=new Error(String(e.message).replace(/^Error: /,''));throw x}),friendly:e=>String(e.message)};
   window.confirm=()=>true;
  });
  await page.goto(base+'/quiestce.html?mode=online');return {page,logs};
 };
 const A=await mk(0),B=await mk(1);
 const snap=async i=>{const r=await rpc(i,'online_my_rooms_game',{p_game:'quiestce'});return rpc(i,'online_room_status',{p_room:r[0].id})};
 const room='Qui '+Date.now()%1e5;
 for(const [c,n,create] of [[A,'Alice',true],[B,'Bob',false]]){
  await c.page.waitForSelector('#online-pseudo',{timeout:8000}).catch(async e=>{console.log(c.logs,await c.page.locator('#online-root').innerText());throw e});await c.page.fill('#online-pseudo',n);await c.page.fill('#online-room-name',room);
  await c.page.click(create?'text=Créer':'text=Rejoindre');await c.page.waitForSelector('#on-pick');
 }
 const geom=async(c,sel,label,exp=24)=>{ // no overlapping targets: every tile is the hit target at its own centre, no pairwise overlap
  const n=await c.page.locator(sel).count();assert.equal(n,exp,label+' count');
  for(let i=0;i<n;i++){const t=c.page.locator(sel).nth(i);await t.scrollIntoViewIfNeeded();
   const r=await t.evaluate(e=>{const b=e.getBoundingClientRect(),h=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {hit:e===h||e.contains(h),w:b.width,h:b.height,l:b.left,r:b.right,t:b.top,b:b.bottom}});
   assert.ok(r.hit,label+' tile '+i+' intercepted');assert.ok(r.w>=40&&r.h>=40,label+' tile '+i+' too small '+r.w+'x'+r.h);}
  const rects=await c.page.locator(sel).evaluateAll(l=>l.map(e=>{const b=e.getBoundingClientRect();return [b.left,b.top+scrollY,b.right,b.bottom+scrollY,e.closest('.online-content').scrollTop]}));
  const abs=await c.page.locator(sel).evaluateAll(l=>{const root=l[0].closest('.online-content').getBoundingClientRect().top;const st=l[0].closest('.online-content').scrollTop;return l.map(e=>{const b=e.getBoundingClientRect();return [b.left,b.top-root+st,b.right,b.bottom-root+st]})});
  for(let i=0;i<abs.length;i++)for(let j=i+1;j<abs.length;j++){const a=abs[i],b=abs[j];assert.ok(a[2]<=b[0]+.5||b[2]<=a[0]+.5||a[3]<=b[1]+.5||b[3]<=a[1]+.5,label+' tiles '+i+','+j+' overlap');}
 };
 const refresh=async c=>c.page.click('text=Actualiser');
 // Both clients derive the same 24 champions from the room id.
 const names=async c=>c.page.locator('#on-pick .qc').evaluateAll(l=>l.map(x=>x.dataset.champ));
 await refresh(A);await refresh(B);
 const na=await names(A),nb=await names(B);assert.equal(na.length,24);assert.deepEqual(na,nb,'same board');assert.equal(new Set(na).size,24);
 assert.equal(await A.page.locator('#on-validate:not([disabled])').count(),0,'validate locked before choosing');
 await geom(A,'#on-pick .qc','pick');for(let i=0;i<24;i++){await A.page.locator('#on-pick .qc[data-i="'+i+'"]').click();assert.equal(await A.page.locator('#on-pick .qc.sel').getAttribute('data-i'),String(i),'native click selects '+i)}
 assert.equal(await A.page.locator('#on-validate:not([disabled])').count()>0,true);
 if(process.env.SHOT){await A.page.locator('#on-pick .qc[data-i="3"]').click();await A.page.screenshot({path:process.env.SHOT});await A.page.locator('#on-validate').scrollIntoViewIfNeeded();await A.page.screenshot({path:process.env.SHOT.replace('.png','-bottom.png')});}
 // A picks index 3, B picks index 7. A edits after ready.
 await A.page.click('#on-pick .qc[data-i="3"]');await A.page.click('#on-validate');await A.page.waitForSelector('#on-secret');
 await B.page.click('#on-pick .qc[data-i="7"]');await B.page.click('#on-validate');await B.page.waitForSelector('#on-secret');
 for(const c of [A,B]){await c.page.click('#on-ready');await c.page.waitForFunction(()=>document.querySelector('#on-ready')?.textContent.includes('Pas encore'))}
 await A.page.click('#on-edit');await A.page.waitForSelector('#on-pick');
 assert.equal((await snap(0)).members.find(m=>m.seat===1).ready,false,'edit unreadies');
 assert.equal(await A.page.locator('#on-ready:not([disabled])').count(),0,'ready locked while editing');
 await A.page.click('#on-pick .qc[data-i="3"]');await A.page.click('#on-validate');await A.page.waitForSelector('#on-secret');await A.page.click('#on-ready');
 await A.page.waitForFunction(()=>document.querySelector('#on-ready')?.textContent.includes('Pas encore'));
 await refresh(A);await A.page.waitForSelector('#on-start:not([disabled])');await A.page.click('#on-start');
 await A.page.waitForSelector('#on-board');await refresh(B);await B.page.waitForSelector('#on-board');
 // Secret checks: each snapshot has only its own choice, never the other.
 const sa=await snap(0),sb=await snap(1);
 assert.deepEqual(Object.keys(sa.hidden).sort(),['choices','lastGuess','own','phase']);
 assert.equal(JSON.stringify(sa.hidden).includes('"players"'),false);
 assert.equal(sa.hidden.own.choice,3);assert.equal(sb.hidden.own.choice,7);
 assert.equal(JSON.stringify(sa.hidden).includes('"choice":7'),false);assert.equal(JSON.stringify(sb.hidden).includes('"choice":3'),false);
 // The opponent's secret never appears in the other page's DOM: my-secret tile shows my own champion only.
 assert.equal(await A.page.locator('#on-me .qc').getAttribute('data-champ'),na[3]);assert.equal(await B.page.locator('#on-me .qc').getAttribute('data-champ'),na[7]);
 // Eliminating is local only; survives reload; the other client is unaffected.
 await A.page.click('#on-board .qc[data-i="0"]');await A.page.waitForSelector('#on-board .qc.x[data-i="0"]');
 assert.equal(await B.page.locator('#on-board .qc.x').count(),0,'eliminations are private');
 assert.equal((await snap(0)).version,sa.version,'eliminating sends nothing');
 await geom(A,'#on-board .qc','board');
 // Turn: seat 1 (A) guesses. B cannot.
 assert.equal(sa.turn,1);
 assert.equal(await B.page.locator('#on-guess:not([disabled])').count(),0,'B cannot guess out of turn');
 if(!process.env.QE_SIMPLE){ // normal rules: endturn flow, wrong guess loses
  assert.match(await A.page.locator('.online-note').first().innerText(),/Règle classique/);
 await A.page.click('#on-guess');await A.page.waitForSelector('#on-guess-grid');await geom(A,'#on-guess-grid .qc','guess',23);for(const i of [1,2,4,6,23]){await A.page.locator('#on-guess-grid .qc[data-i="'+i+'"]').click();assert.equal(await A.page.locator('#on-guess-grid .qc.sel').getAttribute('data-i'),String(i))}await A.page.click('#on-guess-back');await A.page.waitForSelector('#on-board');
  await A.page.click('#on-endturn');await A.page.waitForFunction(()=>document.querySelector('#on-endturn')?.dataset.locked==='true');
  assert.equal(await B.page.locator('#on-endturn[data-locked="false"]').count()+0,0);await refresh(B);await B.page.waitForSelector('#on-endturn[data-locked="false"]');
  await B.page.click('#on-guess');await B.page.click('#on-guess-grid .qc[data-i="9"]');await B.page.click('#on-guess-confirm');
  await B.page.waitForFunction(()=>/perdu|gagné/.test(document.querySelector('#online-status').textContent));
  const f0=await snap(0);assert.equal(f0.status,'finished');assert.equal(f0.winner,1,'wrong guess loses');
  console.log('PASS quiestce NORMAL rules UI: endturn, wrong guess loses');
 } else {
 assert.match(await A.page.locator('.online-note').first().innerText(),/Version simplifiée/);
 // A guesses wrong (index 5), turn passes to B.
 await A.page.click('#on-guess');await A.page.waitForSelector('#on-guess-grid');
 assert.equal(await A.page.locator('#on-guess-grid .qc[data-i="0"]').count(),0,'eliminated champion not offered');
  await geom(A,'#on-guess-grid .qc','guess',23);
 assert.equal(await A.page.locator('#on-guess-confirm:not([disabled])').count(),0);
 for(const i of [1,2,4,6,8,10,23]){await A.page.locator('#on-guess-grid .qc[data-i="'+i+'"]').click();assert.equal(await A.page.locator('#on-guess-grid .qc.sel').getAttribute('data-i'),String(i))}
 await A.page.click('#on-guess-grid .qc[data-i="5"]');
 await A.page.click('#on-guess-grid .qc[data-i="5"]');await A.page.click('#on-guess-confirm');
 await A.page.waitForSelector('#on-board');await A.page.waitForFunction(()=>/raté/.test(document.querySelector('#online-status').textContent));
 assert.equal(await A.page.locator('#on-guess:not([disabled])').count(),0,'turn passed');
 await refresh(B);await B.page.waitForFunction(()=>/raté/.test(document.querySelector('#online-status').textContent));await B.page.waitForSelector('#on-guess:not([disabled])');
 assert.equal((await snap(1)).hidden.lastGuess.correct,false);
 // Server rejects guessing out of turn and invalid indexes.
 const s1=await snap(0);
 await assert.rejects(()=>rpc(0,'online_hidden_action',{p_room:s1.id,p_instance:s1.instance,p_version:s1.version,p_action:require('crypto').randomUUID(),p_kind:'guess',p_data:{choice:3}}),/NOT_YOUR_TURN/);
 const s2=await snap(1);
 await assert.rejects(()=>rpc(1,'online_hidden_action',{p_room:s2.id,p_instance:s2.instance,p_version:s2.version,p_action:require('crypto').randomUUID(),p_kind:'guess',p_data:{choice:99}}),/INVALID_CHOICE/);
 // B guesses A's secret (index 3) and wins.
 await B.page.click('#on-guess');await B.page.waitForSelector('#on-guess-grid');await B.page.click('#on-guess-grid .qc[data-i="3"]');await B.page.click('#on-guess-confirm');
 await B.page.waitForFunction(()=>/gagné/.test(document.querySelector('#online-status').textContent));
 const fin=await snap(0);assert.equal(fin.status,'finished');assert.equal(fin.winner,2);
 await refresh(A);await A.page.waitForFunction(()=>/gagné/.test(document.querySelector('#online-status').textContent));
 assert.equal(await A.page.locator('#on-guess').count(),0,'no guess button after the end');
 }
 await A.page.waitForSelector('#online-status');
 // Leaving: host leaves, peer returns to lobby via the lifecycle.
 const exit=c=>c.page.getByRole('button',{name:'Hors ligne',exact:true});
 await exit(A).click();await A.page.waitForFunction(()=>document.querySelector('#online-root').hidden,{timeout:3000});
 await chain;assert.equal((await db.query('select count(*)::int as n from app_private.rooms')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from app_private.hidden_games')).rows[0].n,0);
 // The toggle is offered on the offline setup screen, and the offline game is back.
 await A.page.waitForSelector('#v .names');assert.equal(await A.page.locator('#online-toggle').isVisible(),true);
 // Offline two-player mode still reachable and untouched.
 await A.page.waitForSelector('#v .qe');assert.equal(await A.page.locator('#online-root').evaluate(e=>e.hidden),true);
 for(const c of [A,B])assert.deepEqual(c.logs,[]);
 console.log('PASS quiestce online UI against real SQL: same board, private secrets, edit unready, turn, wrong+right guess, private eliminations, leave');
 await browser.close();srv.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
