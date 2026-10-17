'use strict';
(function(g){
const R=6,C=7;
const empty=()=>Array(R*C).fill(0);
const drop=(b,c)=>{for(let r=R-1;r>=0;r--)if(!b[r*C+c])return r;return -1};
function winner(b){const D=[[0,1],[1,0],[1,1],[1,-1]];for(let r=0;r<R;r++)for(let c=0;c<C;c++){const p=b[r*C+c];if(!p)continue;for(const[dr,dc]of D){const l=[];for(let k=0;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=R||cc<0||cc>=C||b[rr*C+cc]!==p)break;l.push(rr*C+cc)}if(l.length===4)return{p,line:l}}}return null}
const full=b=>b.slice(0,C).every(Boolean);
const moves=b=>{const m=[];for(const c of [3,2,4,1,5,0,6])if(drop(b,c)>=0)m.push(c);return m};
function score(b,me){const op=me===1?2:1;let s=0;const D=[[0,1],[1,0],[1,1],[1,-1]];for(let r=0;r<R;r++)for(let c=0;c<C;c++)for(const[dr,dc]of D){let a=0,o=0,ok=true;for(let k=0;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=R||cc<0||cc>=C){ok=false;break}const v=b[rr*C+cc];if(v===me)a++;else if(v===op)o++}if(!ok)continue;if(a&&!o)s+=[0,1,5,30][a]||0;if(o&&!a)s-=[0,1,6,40][o]||0}for(let r=0;r<R;r++)if(b[r*C+3]===me)s+=3;return s}
function mm(b,d,al,be,me,p){const w=winner(b);if(w)return w.p===me?100000+d:-100000-d;if(full(b))return 0;if(d===0)return score(b,me);const mv=moves(b);let best=p===me?-1e9:1e9;for(const c of mv){const r=drop(b,c);b[r*C+c]=p;const v=mm(b,d-1,al,be,me,p===1?2:1);b[r*C+c]=0;if(p===me){best=Math.max(best,v);al=Math.max(al,v)}else{best=Math.min(best,v);be=Math.min(be,v)}if(al>=be)break}return best}
function aiMove(b,me,mode,rnd=Math.random){const mv=moves(b);if(!mv.length)return -1;if(mode==='easy'){const op=me===1?2:1;for(const p of [me,op])for(const c of mv){const r=drop(b,c);b[r*C+c]=p;const w=winner(b);b[r*C+c]=0;if(w&&rnd()<.7)return c}return mv[Math.floor(rnd()*mv.length)]}
let best=-1e9,bc=mv[0];for(const c of mv){const r=drop(b,c);b[r*C+c]=me;const v=mm(b,5,-1e9,1e9,me,me===1?2:1);b[r*C+c]=0;if(v>best){best=v;bc=c}}return bc}
g.Puissance4={R,C,empty,drop,winner,full,aiMove};
if(typeof module!=='undefined')module.exports=g.Puissance4;
})(typeof window!=='undefined'?window:globalThis);