/* Binairo / Takuzu: even grids, unique solutions verified by a solution counter. Empty cells are -1. */
(function(root){
'use strict';
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const settings=[{name:'Facile',n:6,keep:.5,prop:true},{name:'Moyen',n:8,keep:.42,prop:true},{name:'Difficile',n:10,keep:.34,prop:false},{name:'Extr\u00eame',n:12,keep:0,prop:false}];
const lines=n=>{const L=[];for(let r=0;r<n;r++)L.push(Array.from({length:n},(_,c)=>r*n+c));for(let c=0;c<n;c++)L.push(Array.from({length:n},(_,r)=>r*n+c));return L};
const LINES={};const linesOf=n=>LINES[n]||(LINES[n]=lines(n));
/* checks local rules (counts, triples) and identical complete lines; returns false on contradiction */
function consistent(g,n){
 const L=linesOf(n),half=n/2,done=[];
 for(const line of L){
  let z=0,o=0;for(let k=0;k<n;k++){const v=g[line[k]];if(v===0)z++;else if(v===1)o++;
   if(k>=2&&v>=0&&g[line[k-1]]===v&&g[line[k-2]]===v)return false}
  if(z>half||o>half)return false;
  if(z+o===n)done.push(line);
 }
 for(let a=0;a<done.length;a++)for(let b=a+1;b<done.length;b++){const A=done[a],B=done[b];if((A[0]%n===0&&A[1]===A[0]+1)!==(B[0]%n===0&&B[1]===B[0]+1))continue;if(A.every((x,k)=>g[x]===g[B[k]]))return false}
 return true;
}
/* propagation: forced values from rules; returns false on contradiction */
function propagate(g,n){
 const L=linesOf(n),half=n/2;let changed=true;
 while(changed){
  changed=false;
  for(const line of L){
   let z=0,o=0;for(const i of line){if(g[i]===0)z++;else if(g[i]===1)o++}
   if(z>half||o>half)return false;
   if(z+o<n){
    if(z===half){for(const i of line)if(g[i]<0){g[i]=1;changed=true}}
    else if(o===half){for(const i of line)if(g[i]<0){g[i]=0;changed=true}}
   }
   for(let k=0;k<n;k++){
    if(k+1<n&&g[line[k]]>=0&&g[line[k]]===g[line[k+1]]){
     if(k>0&&g[line[k-1]]<0){g[line[k-1]]=1-g[line[k]];changed=true}else if(k>0&&g[line[k-1]]===g[line[k]])return false;
     if(k+2<n&&g[line[k+2]]<0){g[line[k+2]]=1-g[line[k]];changed=true}else if(k+2<n&&g[line[k+2]]===g[line[k]])return false;
    }
    if(k+2<n&&g[line[k]]>=0&&g[line[k]]===g[line[k+2]]&&g[line[k+1]]<0){g[line[k+1]]=1-g[line[k]];changed=true}
   }
  }
  if(!consistent(g,n))return false;
 }
 return true;
}
function count(grid,n,limit=2,wantFirst){
 let found=0,first=null;
 const rec=g=>{
  if(found>=limit)return;
  if(!propagate(g,n))return;
  const i=g.indexOf(-1);
  if(i<0){found++;if(!first)first=g.slice();return}
  for(const v of [0,1]){const h=g.slice();h[i]=v;rec(h);if(found>=limit)return}
 };
 rec(grid.slice());return wantFirst?{found,first}:found;
}
function propSolvable(grid,n){const g=grid.slice();return propagate(g,n)&&g.indexOf(-1)<0}
function randomSolution(n){
 for(;;){
  const rec=g=>{
   if(!propagate(g,n))return null;
   const e=[];for(let i=0;i<g.length;i++)if(g[i]<0)e.push(i);
   if(!e.length)return g;
   const i=e[Math.floor(Math.random()*e.length)];
   for(const v of shuffle([0,1])){const h=g.slice();h[i]=v;const r=rec(h);if(r)return r}
   return null;
  };
  const r=rec(new Array(n*n).fill(-1));if(r)return r;
 }
}
function valid(g,n){return g.length===n*n&&g.every(v=>v===0||v===1)&&consistent(g,n)}
function generate(level){
 const s=settings[level];if(!s)throw Error('niveau');const n=s.n;
 const solution=randomSolution(n),puzzle=solution.slice();let clues=n*n;
 const floor=Math.round(n*n*s.keep),t0=Date.now();
 for(const i of shuffle(Array.from({length:n*n},(_,i)=>i))){
  if(clues<=floor||Date.now()-t0>1200)break;
  const v=puzzle[i];puzzle[i]=-1;
  if(count(puzzle,n,2)!==1||(s.prop&&!propSolvable(puzzle,n)))puzzle[i]=v;else clues--;
 }
 return {level,n,puzzle,solution,id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),clues};
}
root.Binairo={settings,generate,count,propagate,propSolvable,valid,consistent};
if(typeof module!=='undefined')module.exports=root.Binairo;
})(typeof self!=='undefined'?self:globalThis);
