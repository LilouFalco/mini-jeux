/* Démineur engine: mines are placed on the first reveal only, never in the 3x3 around it. */
(function(root){
'use strict';
const settings=[{name:'Facile',R:9,C:9,mines:10},{name:'Moyen',R:16,C:16,mines:40},{name:'Difficile',R:16,C:30,mines:99},{name:'Extr\u00eame',R:24,C:30,mines:160}];
const neighbors=(i,R,C)=>{const r=Math.floor(i/C),c=i%C,o=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr>=0&&cc>=0&&rr<R&&cc<C)o.push(rr*C+cc)}return o};
function place(R,C,count,safe,rnd=Math.random){
 const banned=new Set([safe,...neighbors(safe,R,C)]),pool=[];
 for(let i=0;i<R*C;i++)if(!banned.has(i))pool.push(i);
 if(pool.length<count)throw Error('too many mines');
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 const mines=new Array(R*C).fill(0);for(const i of pool.slice(0,count))mines[i]=1;return mines;
}
const countsOf=(mines,R,C)=>mines.map((m,i)=>m?-1:neighbors(i,R,C).reduce((a,j)=>a+mines[j],0));
/* state: 0 hidden, 1 revealed, 2 flag. returns {hit:boolean,opened:number} and mutates state */
function reveal(g,i){
 if(g.state[i]!==0)return {hit:false,opened:0};
 if(g.mines[i]){g.state[i]=1;return {hit:true,opened:0,cell:i}}
 let opened=0;const stack=[i];
 while(stack.length){const k=stack.pop();if(g.state[k]!==0)continue;g.state[k]=1;opened++;
  if(g.counts[k]===0)for(const j of neighbors(k,g.R,g.C))if(g.state[j]===0)stack.push(j)}
 return {hit:false,opened};
}
function chord(g,i){
 if(g.state[i]!==1||g.counts[i]<=0)return {hit:false,opened:0,did:false};
 const nb=neighbors(i,g.R,g.C);if(nb.filter(j=>g.state[j]===2).length!==g.counts[i])return {hit:false,opened:0,did:false};
 let hit=false,opened=0;for(const j of nb)if(g.state[j]===0){const r=reveal(g,j);opened+=r.opened;if(r.hit)hit=true}
 return {hit,opened,did:true};
}
const won=g=>g.mines.every((m,i)=>m||g.state[i]===1);
root.Demineur={settings,neighbors,place,countsOf,reveal,chord,won};
if(typeof module!=='undefined')module.exports=root.Demineur;
})(typeof self!=='undefined'?self:globalThis);
