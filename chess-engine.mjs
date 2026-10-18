import {Chess,DEFAULT_POSITION} from './vendor/chess.mjs';
export {Chess,DEFAULT_POSITION};
// chess.js ends on claimable draws. This app deliberately uses FIDE's
// automatic fivefold/75-move limits instead; mate always takes precedence.
export const positionKey=fen=>fen.split(' ').slice(0,4).join(' ');
export function repetitions(g){
 const h=g.history({verbose:true}), key=positionKey(g.fen());
 return (h.length?Number(positionKey(h[0].before)===key):1)+h.filter(m=>positionKey(m.after)===key).length;
}
export function claimable(g){return g.isThreefoldRepetition()||g.isDrawByFiftyMoves()}
export function result(g,claimed=false){
 if(g.isCheckmate())return {over:true,kind:'mate',winner:g.turn()==='w'?'b':'w',text:'Échec et mat'};
 if(g.isStalemate())return {over:true,kind:'stalemate',text:'Match nul · pat'};
 if(g.isInsufficientMaterial())return {over:true,kind:'material',text:'Match nul · matériel insuffisant'};
 if(Number(g.fen().split(' ')[4])>=150)return {over:true,kind:'75',text:'Match nul · règle des 75 coups'};
 if(g.isThreefoldRepetition()&&repetitions(g)>=5)return {over:true,kind:'fivefold',text:'Match nul · cinq répétitions'};
 if(claimed)return {over:true,kind:'claim',text:'Match nul · nulle réclamée'};
 return {over:false};
}
export function restore(s){
 if(!s||s.v!==1||!Array.isArray(s.moves)||s.moves.length>20000||!['easy','medium','hard','two'].includes(s.mode))throw Error('Invalid save');
 const g=new Chess(s.start||DEFAULT_POSITION);
 for(const m of s.moves)g.move(m,{strict:true});
 return g;
}
export function serialize(g,opts={}){
 const h=g.history({verbose:true});
 return {v:1,start:h[0]?.before||g.fen(),moves:h.map(m=>m.san),...opts};
}
export const VALUES={p:100,n:320,b:335,r:500,q:900,k:0};
function evaluation(g){
 let score=0;
 for(const row of g.board())for(const p of row)if(p){
 const f=p.square.charCodeAt(0)-97,r=Number(p.square[1])-1,adv=p.color==='w'?r:7-r;
 const center=3.5-Math.abs(f-3.5)+3.5-Math.abs(r-3.5);
 let pos=p.type==='p'?adv*9+center*3:p.type==='n'?center*13:p.type==='b'?center*7:p.type==='q'?center*3:p.type==='r'?adv*2:-center*4;
 score+=(p.color==='w'?1:-1)*(VALUES[p.type]+pos);
 }return score*(g.turn()==='w'?1:-1);
}
const moveOrder=m=>(m.san.includes('#')?100000:0)+(m.captured?10*VALUES[m.captured]-VALUES[m.piece]:0)+(m.promotion?VALUES[m.promotion]:0)+(m.san.includes('+')?40:0);
const order=ms=>ms.sort((a,b)=>moveOrder(b)-moveOrder(a));
export function bestMove(g,level='easy',options={}){
 const start=performance.now(),budget=options.budget??(level==='hard'?1400:level==='medium'?450:60);
 const maxDepth=options.depth??(level==='hard'?4:level==='medium'?2:1);
 let nodes=0,completed=0;const STOP={};
 const root=order(g.moves({verbose:true}));if(!root.length)return {move:null,depth:0,nodes};
 if(level==='easy')return {move:root[Math.floor((options.random?.()??Math.random())*root.length)],depth:0,nodes:0};
 let best=root[0];
 function search(depth,alpha,beta,ply){
  if((++nodes&31)===0&&performance.now()-start>budget)throw STOP;
  const ms=order(g.moves({verbose:true}));
  if(!ms.length)return g.isCheck()?-100000+ply:0;
  if(g.isInsufficientMaterial()||g.isThreefoldRepetition()||g.isDrawByFiftyMoves())return 0;
  if(depth<=0)return evaluation(g);
  for(const m of ms){g.move(m);let value;try{value=-search(depth-1,-beta,-alpha,ply+1)}finally{g.undo()}
   if(value>=beta)return value;alpha=Math.max(alpha,value);
  }return alpha;
 }
 for(let d=1;d<=maxDepth;d++){
  let candidate=best,score=-Infinity,alpha=-Infinity;
  const sorted=[best,...root.filter(m=>m!==best)];
  try{for(const m of sorted){g.move(m);let v;try{v=-search(d-1,-Infinity,-alpha,1)}finally{g.undo()}
    if(v>score){score=v;candidate=m}alpha=Math.max(alpha,v);
   }best=candidate;completed=d;
  }catch(e){if(e!==STOP)throw e;break}
  if(performance.now()-start>budget)break;
 }
 return {move:{from:best.from,to:best.to,...(best.promotion?{promotion:best.promotion}:{})},depth:completed,nodes};
}
