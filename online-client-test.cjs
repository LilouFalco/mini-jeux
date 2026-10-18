const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/online-client.js','utf8');
(async()=>{
 let authCalls=0,createCalls=0,rpcCalls=0,opts;
 const store=new Map(), instance={auth:{getSession:async()=>({data:{session:store.has('session')?{}:null}}),
 signInAnonymously:async()=>{authCalls++;store.set('session','true');return {data:{}};}},
 rpc:async(n,a)=>{rpcCalls++;return n==='fail'?{error:{message:'ROOM_FULL'}}:{data:{n,a}};}};
 const context={window:{MINI_ONLINE_CONFIG:{url:'https://example.supabase.co',key:'public'},supabase:{createClient:(u,k,o)=>{createCalls++;opts=o;return instance;}}},
 localStorage:{setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},navigator:{onLine:true},fetch:async(u,o)=>o};
 vm.runInNewContext(source,context);const api=context.window.MiniOnline;
 assert.equal(authCalls,0);await api.client();await api.client();assert.equal(authCalls,1);assert.equal(createCalls,1);
 assert.equal(opts.auth.detectSessionInUrl,false);assert.equal(opts.auth.storageKey,'mini-online-auth-v1');assert.equal((await opts.global.fetch('x',{headers:{Authorization:'x'}})).cache,'no-store');
 assert.equal((await api.rpc('ok',{a:1})).n,'ok');await assert.rejects(()=>api.rpc('fail'),e=>e.message==='ROOM_FULL');
 assert.equal(rpcCalls,2);assert(api.friendly({message:'NAME_TAKEN'}).includes('existe'));
 assert(api.friendly({message:'anonymous_provider_disabled'}).includes('activation'));
 assert(api.friendly({code:'PGRST202'}).includes('activation'));
 assert(!api.friendly({message:'secret stacktoken'}).includes('secret'));
 console.log('PASS lazy guest restore, no duplicate sign-in, no-store, RPC errors sanitized, missing setup');
})().catch(e=>{console.error(e);process.exit(1)});
