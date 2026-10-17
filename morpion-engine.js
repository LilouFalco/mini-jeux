'use strict';
(function(g){
const L=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner=b=>{for(const l of L)if(b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[1]]===b[l[2]])return{p:b[l[0]],line:l};return null};
const full=b=>b.every(Boolean);
function mm(b,p,me,d){const w=winner(b);if(w)return w.p===me?10-d:d-10;if(full(b))return 0;let best=p===me?-99:99;for(let i=0;i<9;i++)if(!b[i]){b[i]=p;const s=mm(b,p===1?2:1,me,d+1);b[i]=0;best=p===me?Math.max(best,s):Math.min(best,s)}return best}
function best(b,me){let bs=-99,m=[];for(let i=0;i<9;i++)if(!b[i]){b[i]=me;const s=mm(b,me===1?2:1,me,1);b[i]=0;if(s>bs){bs=s;m=[i]}else if(s===bs)m.push(i)}return m}
function aiMove(b,me,mode,rnd=Math.random){const free=[];for(let i=0;i<9;i++)if(!b[i])free.push(i);if(!free.length)return -1;const pool=mode==='hard'?best(b.slice(),me):free;return pool[Math.floor(rnd()*pool.length)]}
g.Morpion={winner,full,aiMove,best};
if(typeof module!=='undefined')module.exports=g.Morpion;
})(typeof window!=='undefined'?window:globalThis);