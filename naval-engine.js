'use strict';
(function(g){
const N=10,FLEET=[5,4,3,3,2];
const cellsOf=(r,c,len,h)=>Array.from({length:len},(_,k)=>h?r*N+c+k:(r+k)*N+c);
const inb=(r,c,len,h)=>r>=0&&c>=0&&(h?c+len<=N&&r<N:r+len<=N&&c<N);
function canPlace(ships,r,c,len,h){if(!inb(r,c,len,h))return false;const cs=cellsOf(r,c,len,h);return !ships.some(s=>s.cells.some(x=>cs.includes(x)))}
function randomFleet(rnd=Math.random){const ships=[];for(const len of FLEET){for(let t=0;t<1000;t++){const h=rnd()<.5,r=Math.floor(rnd()*N),c=Math.floor(rnd()*N);if(canPlace(ships,r,c,len,h)){ships.push({len,cells:cellsOf(r,c,len,h)});break}}}return ships}
// shots: array N*N of 0 unknown,1 miss,2 hit
function shoot(ships,shots,i){if(shots[i])return null;const s=ships.find(s=>s.cells.includes(i));shots[i]=s?2:1;const sunk=!!s&&s.cells.every(x=>shots[x]===2);return{hit:!!s,sunk,ship:s||null}}
const allSunk=(ships,shots)=>ships.length>0&&ships.every(s=>s.cells.every(x=>shots[x]===2));
const nb=i=>{const r=Math.floor(i/N),c=i%N,o=[];if(r>0)o.push(i-N);if(r<N-1)o.push(i+N);if(c>0)o.push(i-1);if(c<N-1)o.push(i+1);return o};
function aiShot(shots,ships,mode,rnd=Math.random){const free=[];for(let i=0;i<N*N;i++)if(!shots[i])free.push(i);if(!free.length)return -1;
 if(mode==='easy')return free[Math.floor(rnd()*free.length)];
 // hard: finish unsunk hits (sunk ships' cells excluded), prefer line extension, else parity
 const sunkCells=new Set();for(const s of ships)if(s.cells.every(x=>shots[x]===2))s.cells.forEach(x=>sunkCells.add(x));
 const hits=[];for(let i=0;i<N*N;i++)if(shots[i]===2&&!sunkCells.has(i))hits.push(i);
 if(hits.length){const cand=new Set();for(const h of hits){for(const d of [1,-1,N,-N]){let j=h+d;if(Math.abs(d)===1&&Math.floor(j/N)!==Math.floor(h/N))continue;if(j>=0&&j<N*N&&shots[j]===2&&!sunkCells.has(j)){let k=j;while(k>=0&&k<N*N&&shots[k]===2&&!(Math.abs(d)===1&&Math.floor(k/N)!==Math.floor(h/N)))k+=d;if(k>=0&&k<N*N&&!shots[k]&&!(Math.abs(d)===1&&Math.floor(k/N)!==Math.floor(h/N)))cand.add(k)}}}
  if(cand.size){const a=[...cand];return a[Math.floor(rnd()*a.length)]}
  for(const h of hits)for(const j of nb(h))if(!shots[j])cand.add(j);if(cand.size){const a=[...cand];return a[Math.floor(rnd()*a.length)]}}
 const par=free.filter(i=>(Math.floor(i/N)+i%N)%2===0);const pool=par.length?par:free;return pool[Math.floor(rnd()*pool.length)]}
g.Naval={N,FLEET,cellsOf,canPlace,randomFleet,shoot,allSunk,aiShot};
if(typeof module!=='undefined')module.exports=g.Naval;
})(typeof window!=='undefined'?window:globalThis);