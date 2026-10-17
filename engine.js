/* Yakazu constraints: singleton runs deliberately impose no constraint. */
(function(root){
'use strict';
const shuffle=a=>{for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a};
function model(n,black){
 const runs=[], memberships=Array.from({length:n*n},()=>[]);
 for(let axis=0;axis<2;axis++)for(let line=0;line<n;line++){
  let run=[];const flush=()=>{if(run.length>=2){let k=runs.length;runs.push(run);run.forEach(i=>memberships[i].push(k));}run=[]};
  for(let pos=0;pos<n;pos++){let i=axis?pos*n+line:line*n+pos;if(black[i])flush();else run.push(i)}flush();
 }
 const cells=black.map((b,i)=>b?-1:i).filter(i=>i>=0);
 return {n,black,runs,memberships,cells,valid:cells.every(i=>memberships[i].length),max:Math.max(...runs.map(r=>r.length))};
}
function solve(m,givens,limit=2,budget=60000,random=false){
 let a=givens.slice(),used=m.runs.map(()=>0),count=0,solution=null,nodes=0,aborted=false;
 if(!m.valid)return {count:0,aborted:false};
 for(const i of m.cells)if(a[i]){
  for(const k of m.memberships[i]){let bit=1<<a[i];if(a[i]<1||a[i]>m.runs[k].length||(used[k]&bit))return {count:0,aborted:false};used[k]|=bit;}
 }
 function visit(){
  if(++nodes>budget){aborted=true;return}
  let pick=-1,opts=null;
  for(const i of m.cells)if(!a[i]){
   let mask=(1<<(m.max+1))-2;
   for(const k of m.memberships[i])mask &= ((1<<(m.runs[k].length+1))-2)&~used[k];
   let values=[];for(let v=1;v<=m.max;v++)if(mask&(1<<v))values.push(v);
   if(!values.length)return;
   if(!opts||values.length<opts.length){pick=i;opts=values;if(values.length===1)break}
  }
  if(pick<0){count++;if(!solution)solution=a.slice();return}
  if(random)shuffle(opts);
  for(const v of opts){a[pick]=v;for(const k of m.memberships[pick])used[k]|=1<<v;
   visit();for(const k of m.memberships[pick])used[k]&=~(1<<v);a[pick]=0;
   if(count>=limit||aborted)return;
  }
 }
 visit();return {count,solution,aborted,nodes};
}
const settings=[{n:5,keep:.4},{n:7,keep:.3},{n:9,keep:.23},{n:10,keep:.18}];
function generate(level){
 const {n,keep}=settings[level];let m,result;
 for(let trial=0;trial<180;trial++){
  let black=Array.from({length:n*n},()=>Math.random()<.19);
  m=model(n,black);if(!m.valid||m.cells.length<n*n*.56||!black.some(Boolean))continue;
  result=solve(m,Array(n*n).fill(0),1,7000,true);
  if(result.solution&&!result.aborted)break;result=null;
 }
 // Guaranteed valid fallback: one large square with a black border.
 if(!result){let black=Array.from({length:n*n},(_,i)=>i%n===n-1||Math.floor(i/n)===n-1);m=model(n,black);result=solve(m,Array(n*n).fill(0),1,200000,true)}
 if(!result?.solution)throw Error('Génération indisponible');
 const solution=result.solution,givens=solution.slice();let remaining=m.cells.length,target=Math.ceil(remaining*keep);
 for(const i of shuffle(m.cells.slice())){
  if(remaining<=target)break;let old=givens[i];givens[i]=0;
  const test=solve(m,givens,2,16000);
  if(test.count!==1||test.aborted)givens[i]=old;else remaining--;
 }
 return {n,black:m.black,solution,givens,level,id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)};
}
function errors(m,values){
 const bad=new Set();
 for(const run of m.runs){const seen=new Map();for(const i of run)if(values[i]){
  const v=values[i];if(v<1||v>run.length)bad.add(i);
  if(seen.has(v)){bad.add(i);bad.add(seen.get(v))}else seen.set(v,i);
 }}
 return [...bad];
}
const api={model,solve,generate,errors,settings};
if(typeof module!=='undefined')module.exports=api;else root.Yakazu=api;
})(globalThis);
