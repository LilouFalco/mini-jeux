// PUISSANCE 4 online UI contract test. MOCK ONLY: isolated PostgreSQL WASM (migrations 001+002), simulated Auth/Realtime. Not evidence of live Supabase.
// No network requests to Supabase and no real users created.
const pw=require('/tmp/qa/node_modules/playwright'),{PGlite}=require(process.env.PGLITE_MODULE||'/tmp/onlineqa/node_modules/@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const BASE=process.env.BASE||'http://localhost:28461/';
(async()=>{
 for(const [engine,type]of [['chromium',pw.chromium],['webkit',pw.webkit]]){
 const browser=await type.launch(engine==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
 for(const [width,height]of [[360,640],[390,844]]){const prefix=process.env.SHOTS||'/tmp/p4-online-';
  const db=new PGlite();await db.exec(`
  create role anon;create role authenticated;create schema auth;create schema realtime;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table realtime.messages(extension text);alter table realtime.messages enable row level security;
  create table realtime.sent(payload jsonb,event text,topic text,private boolean);
  create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
  create function realtime.send(p jsonb,e text,t text,b boolean) returns void language sql as $$insert into realtime.sent values(p,e,t,b)$$;
  `);await db.exec(fs.readFileSync(__dirname+'/sql/001-online.sql','utf8'));await db.exec(fs.readFileSync(__dirname+'/sql/002-online-puissance4.sql','utf8'));
  const pages=[],contexts=[],errors=[],remote=[];let chain=Promise.resolve();
  const rpc=(i,name,args)=>{const job=chain.then(async()=>{
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",['10000000-0000-4000-8000-00000000000'+(i+1)]);
   await db.exec('set role authenticated');
   try{
    const vals=Object.values(args||{});const data=(await db.query('select public.'+name+'('+vals.map((_,j)=>'$'+(j+1)).join(',')+') as value',vals)).rows[0].value;
    await db.exec('reset role');
    const sent=(await db.query('delete from realtime.sent returning *')).rows;
    for(const msg of sent)for(const p of pages) await p.evaluate(msg=>window.__notify?.(msg),msg).catch(()=>{});
    return {data};
   }catch(e){await db.exec('reset role');return {error:{message:e.message,code:e.code||'P0001'}};}
  });chain=job.catch(()=>{});return job;};
  for(let i=0;i<2;i++){
   await db.query('insert into auth.users values($1)',['10000000-0000-4000-8000-00000000000'+(i+1)]);
   const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,serviceWorkers:'block'});contexts.push(c);
   await c.route('https://**',r=>{remote.push(r.request().url());r.abort();});
   const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.exposeFunction('__rpc',(name,args)=>rpc(i,name,args));
   await p.addInitScript(()=>{
    const channels=new Set();
    const c={realtime:{setAuth:async()=>{}},removeChannel:async ch=>channels.delete(ch),
     channel:(topic,config)=>{if(!config.config.private)throw Error('public channel');const ch={topic,on:(type,filter,fn)=>{ch.fn=fn;return ch;},subscribe:fn=>{channels.add(ch);queueMicrotask(()=>fn('SUBSCRIBED'));return ch;}};return ch;}};
    window.__notify=msg=>{for(const ch of channels)if(ch.topic===msg.topic)ch.fn?.({payload:msg.payload});};
    window.MiniOnline={client:async()=>c,rpc:async(name,args)=>{const r=await window.__rpc(name,args);if(r.error)throw r.error;return r.data;},friendly:e=>e.message};
   });
   await p.goto(BASE+'puissance4.html');await p.waitForSelector('#online-toggle');
   assert.equal(await p.locator('script[src*="supabase"]').count(),0,'SDK lazy');
   const navBefore=await p.evaluate(()=>[...document.querySelectorAll('.mbar button[data-k]')].map(x=>x.getAttribute('aria-current')));p.__nav=navBefore;
   await p.locator('[data-mode=two]').click();await p.locator('#colbtns button').nth(2).click();const offline=await p.evaluate(()=>localStorage.getItem('lilou-puissance4-v1'));assert.ok(offline&&JSON.parse(offline).b.some(Boolean));if(i===0)await p.screenshot({path:prefix+engine+'-'+width+'-offline.png'});
   await p.locator('#online-toggle').click();await p.waitForSelector('#online-pseudo');assert.equal(await p.evaluate(()=>localStorage.getItem('lilou-puissance4-v1')),offline);
   {const m=await p.evaluate(()=>({cur:[...document.querySelectorAll('.mbar button[data-k]')].filter(b=>b.getAttribute('aria-current')==='page').map(b=>b.dataset.k),bt:[...document.querySelectorAll('#online-root button')].filter(b=>b.offsetParent).map(b=>b.getBoundingClientRect().height),note:getComputedStyle(document.querySelector('.online-note')).color+'|'+getComputedStyle(document.querySelector('.online-note')).fontSize}));
    assert.deepEqual(m.cur,['duo'],'duo nav active');assert.ok(m.bt.every(h=>h>=43.5),'buttons>=44 '+m.bt);assert.equal(m.note,'rgb(107, 66, 82)|12px');}
   await p.locator('#online-pseudo').fill(i?'Lulu':'<img src=x onerror=alert(1)>'.slice(0,24));
   await p.locator('#online-room-name').fill('Notre salon');
   if(i===0)await p.getByRole('button',{name:'Créer',exact:true}).click();
   else await p.getByRole('button',{name:'Rejoindre',exact:true}).click();
   await p.waitForSelector('.online-members');
  }
  const [a,b]=pages;
  await a.waitForFunction(()=>document.querySelectorAll('.online-members span').length===2);
  assert.equal(await a.locator('.online-members img').count(),0,'XSS names plain text');
  await a.getByRole('button',{name:'Prête !',exact:true}).click();await b.getByRole('button',{name:'Prête !',exact:true}).click();
  await a.getByRole('button',{name:'Démarrer',exact:true}).waitFor({state:'visible'});
  await a.waitForFunction(()=>[...document.querySelectorAll('#online-root button')].some(b=>b.textContent==='Démarrer'&&!b.disabled));
  await a.getByRole('button',{name:'Démarrer',exact:true}).click();
  await a.waitForSelector('.online-board-p4');await b.waitForSelector('.online-board-p4');assert.equal(await a.locator('.online-col').count(),7);assert.equal(await a.locator('.online-board-p4 .pcell').count(),42);
  await b.waitForFunction(()=>[...document.querySelectorAll('.online-col')].every(x=>x.disabled),null,{timeout:5000});const turnA=await a.evaluate(()=>[...document.querySelectorAll('.online-col')].map(x=>x.disabled));assert.deepEqual(turnA,Array(7).fill(false),'only mover can drop');
  let n=0;for(const [p,c]of [[a,3],[b,3],[a,0],[b,0],[a,1],[b,1],[a,6],[b,6],[a,2],[b,2],[a,5]].slice(0,0));
  for(const [p,c]of [[a,0],[b,1],[a,0],[b,1],[a,0],[b,1],[a,0]]){n++;await p.locator('.online-col').nth(c).click();await p.waitForFunction(k=>document.querySelectorAll('.online-board-p4 .pcell:not(:empty)').length>=k,n);const other=p===a?b:a;await other.waitForFunction(k=>document.querySelectorAll('.online-board-p4 .pcell:not(:empty)').length>=k,n);}
  assert.equal(await a.locator('.online-board-p4 .pcell.win').count(),4);
  for(const p of pages){const m=await p.evaluate(()=>{const c=document.querySelector('#online-content'),g=document.querySelector('.online-board-p4').getBoundingClientRect(),cc=c.getBoundingClientRect();return {scroll:c.scrollHeight-c.clientHeight,inside:g.bottom<=cc.bottom+1&&g.top>=cc.top-1,w:g.width,h:g.height,cols:[...document.querySelectorAll('.online-col')].map(x=>x.getBoundingClientRect().height)}});console.log(engine,width,JSON.stringify(m),JSON.stringify(await p.evaluate(()=>({root:document.querySelector('#online-root').getBoundingClientRect().height,rootTop:document.querySelector('#online-root').getBoundingClientRect().top,kids:[...document.querySelector('#online-content').children].map(x=>x.className+':'+Math.round(x.getBoundingClientRect().height)),top:[...document.querySelector('#online-root').children].map(x=>x.className+':'+Math.round(x.getBoundingClientRect().height)),ih:innerHeight}))));assert.ok(m.scroll<=1&&m.inside,engine+' '+width+' board fully visible no inner scroll '+JSON.stringify(m));assert.ok(m.cols.every(h=>h>=43.5),'44px columns');}
  await a.screenshot({path:prefix+engine+'-'+width+'-'+height+'-online-win.png'});
  await a.waitForFunction(()=>document.querySelector('#online-status').textContent.includes('gagné'));await b.waitForFunction(()=>document.querySelector('#online-status').textContent.includes('gagné'));
  for(const p of pages){
   const fit=await p.evaluate(()=>({w:document.documentElement.scrollWidth<=innerWidth,h:document.documentElement.scrollHeight<=innerHeight}));
   assert.deepEqual(fit,{w:true,h:true},engine+' '+width+' fit');
  }
  // Reload preserves the server seat; lobby resume avoids another name join.
  await b.reload();await b.locator('#online-toggle').click();await b.getByRole('button',{name:'Reprendre · Notre salon',exact:true}).click();await b.waitForSelector('.online-board-p4');assert.equal(await b.locator('.online-board-p4 .pcell.win').count(),4);
  await a.getByRole('button',{name:'Proposer une revanche'}).click();await a.waitForSelector('.online-members');
  // Leave invalidates OLD channel. Remaining player must update without manual refresh.
  a.on('dialog',d=>d.accept());await a.getByRole('button',{name:'Quitter le salon'}).click();await a.waitForSelector('#online-pseudo');
  await b.waitForFunction(()=>document.querySelectorAll('.online-members span').length===1);
  await b.waitForFunction(()=>[...document.querySelectorAll('#online-root button')].some(x=>x.textContent==='Démarrer'));
  assert.equal(await b.locator('.online-board-p4').count(),0);
  await b.getByRole('button',{name:'Hors ligne',exact:true}).click();await b.waitForSelector('#online-root',{state:'hidden'});
  assert.deepEqual(await b.evaluate(()=>[...document.querySelectorAll('.mbar button[data-k]')].map(x=>x.getAttribute('aria-current'))),b.__nav,'nav restored');
  await b.locator('[data-mode=two]').click();assert.equal(await b.locator('#board .pcell').count(),42);
  assert.deepEqual(remote,[],'no live Supabase requests');assert.deepEqual(errors,[]);
  await a.screenshot({path:prefix+engine+'-'+width+'-'+height+'-lobby.png'});
  for(const c of contexts)await c.close();await db.close();console.log('PASS P4 MOCK',engine,width,height,'lobby/two-client/vertical-win/reload/leave-notification/offline-save/no page scroll');
 }
 await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
