const pw=require('/tmp/qa/node_modules/playwright'),assert=require('assert');
const B=process.env.BASE||'http://localhost:28461/';
(async()=>{for(const eng of ['chromium','webkit']){
const br=await pw[eng].launch(eng==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{}),p=await br.newPage({viewport:{width:360,height:640},serviceWorkers:'block'});await p.goto(B+'chess.html?mode=solo');
const r=await p.evaluate(async()=>{
 let ticks=0;const interval=setInterval(()=>ticks++,10);
 const answer=await new Promise((resolve,reject)=>{const w=new Worker('chess-worker.mjs',{type:'module'}),t=setTimeout(()=>{w.terminate();reject(Error('Timeout'))},10000);w.onerror=reject;w.onmessage=e=>{clearTimeout(t);w.terminate();resolve(e.data)};w.postMessage({id:7,save:{v:1,mode:'hard',moves:['e4']}})});
 clearInterval(interval);return {ticks,answer};
});assert(r.ticks>5,'worker must not block main-thread timer');assert.equal(r.answer.id,7);assert(r.answer.move);assert(r.answer.depth>=2);
const claim=await p.evaluate(async()=>await new Promise((resolve,reject)=>{const w=new Worker('chess-worker.mjs',{type:'module'});w.onerror=reject;w.onmessage=e=>{w.terminate();resolve(e.data)};w.postMessage({id:8,save:{v:1,mode:'hard',start:'4k2r/8/8/8/8/8/8/R3K3 b - - 100 1',moves:[]}})}));assert(claim.claim);
console.log(eng,'worker hard depth',r.answer.depth,'main-thread ticks',r.ticks,'AI draw claim pass');await br.close();
}})().catch(e=>{console.error(e);process.exit(1)});
