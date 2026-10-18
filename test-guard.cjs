'use strict';
// FAIL-CLOSED network guard for local test harnesses. Nothing here ever contacts a real host.
// Node: require() this file (or node -r ./test-guard.cjs). Browsers: launch()/newContext().
const net=require('node:net'),tls=require('node:tls'),dns=require('node:dns'),http=require('node:http'),https=require('node:https');
const INVALID_ENDPOINT='https://project.invalid';
const LOCAL=/^(localhost|127\.0\.0\.1|\[?::1\]?)$/i;
const violations=[];
function hostOf(x){try{return new URL(String(x)).hostname}catch{return String(x||'')}}
function isLocalHost(h){return LOCAL.test(String(h||''))}
function deny(kind,target){const h=hostOf(target);violations.push({kind,host:isLocalHost(h)?h:h.replace(/^[^.]+/,'*'),at:new Date().toISOString()});const e=new Error('NETWORK_GUARD: blocked '+kind+' to non-local host');e.code='ENETGUARD';throw e}
function installNodeGuard(){
 if(globalThis.__netGuard)return;globalThis.__netGuard=true;
 // children (node) inherit the guard; network CLIs and UDP/HTTP2 are refused outright
 const opt=' --require '+__filename;if(!String(process.env.NODE_OPTIONS||'').includes(__filename))process.env.NODE_OPTIONS=(process.env.NODE_OPTIONS||'')+opt;
 try{const dg=require('node:dgram');const cs=dg.createSocket;dg.createSocket=function(){deny('udp','udp socket')};dg.Socket.prototype.send=function(){deny('udp','udp send')}}catch{}
 try{const h2=require('node:http2');const c=h2.connect;h2.connect=function(u,...r){const t=hostOf(typeof u==='object'&&!(u instanceof URL)?(u.host||u.hostname):u);if(!isLocalHost(t))deny('http2',t);return c.call(this,u,...r)}}catch{}
 try{const cp=require('node:child_process');const BAD=/(^|[\s/;&|(])(curl|wget|nc|ncat|netcat|socat|ssh|scp|sftp|ftp|telnet|rsync|dig|nslookup|ping|git\s+(push|fetch|pull|clone|ls-remote)|npm|npx|pip3?|gh)(\s|$)/;
  for(const f of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']){const o=cp[f];cp[f]=function(cmd,...r){const line=[cmd,...(Array.isArray(r[0])?r[0]:[])].join(' ');if(f!=='fork'&&BAD.test(' '+line))deny('child_process',line.split(' ')[0]);return o.call(this,cmd,...r)}}}catch{}
 const sock=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...a){const o=a[0];if(o&&typeof o==='object'&&!o.path){if(!isLocalHost(o.host||'localhost'))deny('socket',o.host)}else if(typeof o==='number'||typeof o==='string'&&/^\d+$/.test(o)){const h=typeof a[1]==='string'?a[1]:'localhost';if(!isLocalHost(h))deny('socket',h)}return sock.apply(this,a)};
 const tc=tls.connect;tls.connect=function(...a){const o=typeof a[0]==='object'?a[0]:{};const h=o.host||o.servername||(typeof a[1]==='string'?a[1]:'');if(!isLocalHost(h))deny('tls',h);return tc.apply(this,a)};
 for(const f of ['lookup']){const orig=dns[f];dns[f]=function(h,...r){if(!isLocalHost(h))deny('dns',h);return orig.call(this,h,...r)}}
 for(const f of ['resolve','resolve4','resolve6','resolveAny'])if(dns[f]){const o=dns[f];dns[f]=function(h,...r){if(!isLocalHost(h))deny('dns',h);return o.call(this,h,...r)}}
 for(const m of [http,https])for(const f of ['request','get']){const o=m[f];m[f]=function(u,...r){const t=typeof u==='string'||u instanceof URL?hostOf(u):(u&&(u.hostname||u.host))||'localhost';if(!isLocalHost(String(t).replace(/:\d+$/,'')))deny('http',t);return o.call(this,u,...r)}}
 if(globalThis.fetch){const f=globalThis.fetch;globalThis.fetch=function(u,...r){const t=u&&u.url||u;if(!isLocalHost(hostOf(t)))deny('fetch',t);return f.call(this,u,...r)}}
 if(globalThis.WebSocket){const W=globalThis.WebSocket;globalThis.WebSocket=function(u,...r){if(!isLocalHost(hostOf(u)))deny('websocket',u);return new W(u,...r)};}
}
const DEAD_PROXY={server:'http://127.0.0.1:9',bypass:'localhost,127.0.0.1'};
function launchOptions(engine,extra={}){
 // Dead local proxy: any non-local traffic is sent to a closed local port. Chromium also gets a resolver that fails every name except localhost.
 const o={proxy:DEAD_PROXY,...extra};
 if(engine==='chromium'){o.executablePath=extra.executablePath||'/opt/hako/bin/google-chrome';o.args=['--no-sandbox','--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1','--disable-background-networking',...(extra.args||[])]}
 return o}
async function launch(type,engine,extra){return type.launch(launchOptions(engine,extra))}
const NON_LOCAL=/^(?:https?|wss?|ftp):\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$))/i;
async function newContext(browser,opts={},{mock}={}){
 const c=await browser.newContext({...opts,serviceWorkers:'block'});
 const seen=[];c.__guardSeen=seen;
 await c.route(NON_LOCAL,r=>{const u=r.request().url();seen.push({host:hostOf(u).replace(/^[^.]+/,'*')});violations.push({kind:'browser',host:hostOf(u).replace(/^[^.]+/,'*'),at:new Date().toISOString()});return r.abort('blockedbyclient')});
 if(c.routeWebSocket)await c.routeWebSocket(NON_LOCAL,ws=>{violations.push({kind:'browser-ws',host:hostOf(ws.url()).replace(/^[^.]+/,'*'),at:new Date().toISOString()});ws.close()});
 // Product config is replaced by a reserved, unresolvable endpoint; the real project URL can never be loaded.
 await c.route(/\/online-config\.js(?:\?.*)?$/,r=>r.fulfill({status:200,contentType:'text/javascript',body:'window.MINI_ONLINE_CONFIG=Object.freeze({url:"'+INVALID_ENDPOINT+'",key:"sb_publishable_INVALID_TEST_KEY"});'}));
 await c.addInitScript(()=>{window.__GUARDED=true});
 return c}
function assertClean(label){if(violations.length)throw new Error('NETWORK_GUARD violations'+(label?' in '+label:'')+': '+JSON.stringify(violations))}
module.exports={installNodeGuard,launch,launchOptions,newContext,violations,assertClean,INVALID_ENDPOINT,isLocalHost};
if(require.main!==module||process.env.NODE_OPTIONS&&0){}
installNodeGuard();
