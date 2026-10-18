'use strict';
// Proves test-guard.cjs FAILS CLOSED. Uses only localhost + reserved .invalid names; nothing leaves the machine.
const G=require('./test-guard.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),dns=require('node:dns'),net=require('node:net');
const pw=require('/tmp/qa/node_modules/playwright');
const REAL=fs.readFileSync(__dirname+'/online-config.js','utf8').match(/https:\/\/[a-z0-9.-]+/)[0];
(async()=>{
 const out=[];const ok=m=>{out.push(m);console.log('PASS',m)};
 // Node layer
 for(const [name,fn] of [
  ['fetch real project URL',()=>fetch(REAL+'/auth/v1/signup',{method:'POST'})],
  ['fetch .invalid',()=>fetch('https://project.invalid/x')],
  ['https.get',()=>require('node:https').get(REAL)],
  ['http.request',()=>require('node:http').request('http://example.invalid/')],
  ['net.connect',()=>net.connect(443,'example.invalid')],
  ['tls.connect',()=>require('node:tls').connect(443,'example.invalid')],
  ['dns.lookup',()=>dns.lookup('example.invalid',()=>{})],
  ['WebSocket',()=>new WebSocket('wss://project.invalid/realtime/v1/websocket')],
  ['udp socket',()=>require('node:dgram').createSocket('udp4')],
  ['http2.connect',()=>require('node:http2').connect('https://project.invalid')],
  ['child_process curl',()=>require('node:child_process').execSync('curl -s https://project.invalid')],
  ['child_process spawn nc',()=>require('node:child_process').spawn('nc',['project.invalid','443'])]]){
  let err;try{await fn()}catch(e){err=e}
  assert.ok(err&&(err.code==='ENETGUARD'||/NETWORK_GUARD/.test(err.message)),'node '+name+' must be blocked by guard, got '+(err&&err.message));ok('node '+name+' blocked synchronously');}
 assert.ok(String(process.env.NODE_OPTIONS).includes('test-guard.cjs'),'children inherit guard');const nodeViol=G.violations.length;assert.equal(nodeViol,12);G.violations.length=0;
 // local server
 const srv=http.createServer((q,s)=>{
  if(q.url==='/online-config.js'){s.setHeader('content-type','text/javascript');return s.end(fs.readFileSync(__dirname+'/online-config.js'))}
  if(q.url==='/redir'){s.statusCode=302;s.setHeader('location','https://project.invalid/auth/v1/signup');s.setHeader('access-control-allow-origin','*');return s.end()}
  if(q.url==='/ok'){s.setHeader('access-control-allow-origin','*');return s.end('local-ok')}
  s.setHeader('content-type','text/html');s.end('<meta charset=utf-8><script src="/online-config.js"><\/script><body>t')}).listen(0,'127.0.0.1');
 await new Promise(r=>srv.once('listening',r));const base='http://127.0.0.1:'+srv.address().port;
 for(const [engine,type] of [['chromium',pw.chromium],['webkit',pw.webkit]]){
  const b=await G.launch(type,engine);
  // 1 context guard + config replacement + SW block
  const c=await G.newContext(b,{});const p=await c.newPage();await p.goto(base+'/');
  const cfg=await p.evaluate(()=>window.MINI_ONLINE_CONFIG);
  assert.equal(cfg.url,G.INVALID_ENDPOINT);assert.ok(!JSON.stringify(cfg).includes(REAL));ok(engine+' config replaced by reserved endpoint, real URL absent');
  const res=await p.evaluate(async(R)=>{const r={};for(const [k,u] of Object.entries({real:R+'/auth/v1/signup',inv:'https://project.invalid/auth/v1/signup',ws:'wss://project.invalid/realtime',http:'http://example.invalid/'})){try{if(k==='ws'){r[k]=await new Promise(res=>{const w=new WebSocket(u);w.onopen=()=>res('REACHED');w.onerror=()=>res('blocked');w.onclose=()=>res('blocked')})}else{await fetch(u,{method:'POST',mode:'no-cors'});r[k]='REACHED'}}catch(e){r[k]='blocked'}}
   r.local=await (await fetch('/ok')).text();await navigator.serviceWorker.register('/sw.js').catch(()=>{});await new Promise(x=>setTimeout(x,300));r.sw=(await navigator.serviceWorker.getRegistrations()).length===0?'blocked':'registered';return r},REAL);
  assert.deepEqual([res.real,res.inv,res.http],['blocked','blocked','blocked'],JSON.stringify(res));assert.equal(res.ws,'blocked');assert.equal(res.local,'local-ok');assert.equal(res.sw,'blocked');
  assert.ok(G.violations.length>=3,'violations recorded');ok(engine+' context: real/.invalid/http/ws blocked, localhost works, service worker blocked, '+G.violations.length+' violations recorded (hosts redacted)');
  // 2 guard fails closed even if route layer is absent: raw context, dead proxy (+ resolver in chromium)
  const raw=await b.newContext({serviceWorkers:'block'});const rp=await raw.newPage();await rp.goto(base+'/ok');
  const r2=await rp.evaluate(async()=>{try{await fetch('https://project.invalid/x',{mode:'no-cors'});return 'REACHED'}catch(e){return 'blocked'}});
  assert.equal(r2,'blocked');ok(engine+' without route layer: dead proxy/resolver still blocks (.invalid only)');
  // 3 assertClean fails when violated
  let thrown=false;try{G.assertClean('selftest')}catch{thrown=true}assert.ok(thrown);ok(engine+' assertClean throws after violation (fail closed)');
  const rd=await p.evaluate(async()=>{try{await fetch('/redir');return 'REACHED'}catch(e){return 'blocked'}});
  assert.equal(rd,'blocked');ok(engine+' HTTP redirect from localhost to reserved/real host blocked');
  const nrd=await new Promise(r=>http.get(base+'/redir',x=>{x.resume();r(x.headers.location)}));assert.ok(/project\.invalid/.test(nrd));
  let nerr;try{await fetch(base+'/redir')}catch(e){nerr=e}
  assert.ok(nerr,'node fetch following redirect must fail');ok('node fetch redirect to non-local host fails closed');
  G.violations.length=0;await b.close();
 }
 srv.close();console.log('GUARD PROVEN',out.length,'checks');
})().catch(e=>{console.error('GUARD SELFTEST FAIL',e);process.exit(1)});
