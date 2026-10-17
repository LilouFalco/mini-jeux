/* Sudoku generator: unique 9x9 puzzles, verified by a solution counter. */
(function(root){
'use strict';
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const PEERS=[],UNITS=[];
for(let i=0;i<81;i++){const r=Math.floor(i/9),c=i%9,s=new Set();for(let k=0;k<9;k++){s.add(r*9+k);s.add(k*9+c)}const br=r-r%3,bc=c-c%3;for(let a=0;a<3;a++)for(let b=0;b<3;b++)s.add((br+a)*9+bc+b);s.delete(i);PEERS.push([...s])}
for(let k=0;k<9;k++){UNITS.push(Array.from({length:9},(_,j)=>k*9+j),Array.from({length:9},(_,j)=>j*9+k),Array.from({length:9},(_,j)=>(Math.floor(k/3)*3+Math.floor(j/3))*9+(k%3)*3+j%3))}
const settings=[{name:'Facile',clues:44,singles:true},{name:'Moyen',clues:35,singles:true},{name:'Difficile',clues:29,singles:false},{name:'Extr\u00eame',clues:24,singles:false,hard:true}];
const BITS=[0,1,2,4,8,16,32,64,128,256],bitv=b=>31-Math.clz32(b)+1,pop=b=>{let n=0;while(b){b&=b-1;n++}return n};
function candidates(g){const cand=new Array(81).fill(511);for(let i=0;i<81;i++)if(g[i]){cand[i]=0;for(const p of PEERS[i])cand[p]&=~BITS[g[i]]}return cand}
function valid(g){for(let i=0;i<81;i++)if(g[i])for(const p of PEERS[i])if(g[p]===g[i])return false;return true}
/* counts solutions up to limit (MRV backtracking with bitmasks) */
function count(grid,limit=2){
 const g=grid.slice();if(!valid(g))return 0;let n=0;
 const rec=()=>{
  let best=-1,bc=10,bm=0;
  for(let i=0;i<81;i++)if(!g[i]){let m=511;for(const p of PEERS[i])if(g[p])m&=~BITS[g[p]];const c=pop(m);if(c<bc){bc=c;best=i;bm=m;if(c<=1)break}}
  if(best<0){n++;return}
  if(!bc)return;
  for(let v=1;v<=9&&n<limit;v++)if(bm&BITS[v]){g[best]=v;rec();g[best]=0}
 };rec();return n;
}
function solve(grid){const g=grid.slice();const rec=()=>{let best=-1,bc=10,bm=0;for(let i=0;i<81;i++)if(!g[i]){let m=511;for(const p of PEERS[i])if(g[p])m&=~BITS[g[p]];const c=pop(m);if(c<bc){bc=c;best=i;bm=m;if(c<=1)break}}if(best<0)return true;for(let v=1;v<=9;v++)if(bm&BITS[v]){g[best]=v;if(rec())return true;g[best]=0}return false};return rec()?g:null}
function fullGrid(){const g=new Array(81).fill(0);const rec=()=>{let best=-1,bc=10,bm=0;for(let i=0;i<81;i++)if(!g[i]){let m=511;for(const p of PEERS[i])if(g[p])m&=~BITS[g[p]];const c=pop(m);if(c<bc){bc=c;best=i;bm=m;if(c<=1)break}}if(best<0)return true;for(const v of shuffle([1,2,3,4,5,6,7,8,9]))if(bm&BITS[v]){g[best]=v;if(rec())return true;g[best]=0}return false};rec();return g}
/* true if naked and hidden singles alone solve the puzzle */
function singlesSolvable(grid){
 const g=grid.slice();let cand=candidates(g);
 for(;;){
  let moved=false;
  for(let i=0;i<81;i++)if(!g[i]){if(!cand[i])return false;if(pop(cand[i])===1){const v=bitv(cand[i]);g[i]=v;cand[i]=0;for(const p of PEERS[i])cand[p]&=~BITS[v];moved=true}}
  if(!moved)for(const u of UNITS){for(let v=1;v<=9;v++){if(u.some(i=>g[i]===v))continue;const spots=u.filter(i=>!g[i]&&cand[i]&BITS[v]);if(spots.length===1){const i=spots[0];g[i]=v;cand[i]=0;for(const p of PEERS[i])cand[p]&=~BITS[v];moved=true}}}
  if(!moved)break;
 }
 return g.every(Boolean);
}
function generate(level){
 const s=settings[level];if(!s)throw Error('niveau');
 for(let attempt=0;attempt<40;attempt++){
  const solution=fullGrid(),puzzle=solution.slice();let clues=81;
  const order=shuffle(Array.from({length:81},(_,i)=>i));
  for(const i of order){
   if(clues<=s.clues)break;
   const v=puzzle[i];puzzle[i]=0;
   if(count(puzzle,2)!==1||(s.singles&&!singlesSolvable(puzzle)))puzzle[i]=v;else clues--;
  }
  if(clues>s.clues+(level===0?3:level===1?4:level===2?5:6))continue;
  if(s.hard&&singlesSolvable(puzzle)&&attempt<30)continue;
  if(level===2&&singlesSolvable(puzzle)&&attempt<10)continue;
  return {level,puzzle,solution,id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),clues};
 }
 throw Error('generation');
}
root.Sudoku={settings,generate,count,solve,singlesSolvable,valid,PEERS};
if(typeof module!=='undefined')module.exports=root.Sudoku;
})(typeof self!=='undefined'?self:globalThis);
