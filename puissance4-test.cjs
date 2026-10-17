const P=require('./puissance4-engine.js');
const b=P.empty();for(let r=0;r<4;r++)b[(5-r)*7+2]=1;if(!P.winner(b))throw 1;
const d=P.empty();for(let k=0;k<4;k++)d[(5-k)*7+k]=2;if(!P.winner(d))throw 2;
// hard AI blocks and wins
const w=P.empty();for(let c=0;c<3;c++)w[5*7+c]=2;if(P.aiMove(w,2,'hard')!==3)throw 3;
const bl=P.empty();for(let c=0;c<3;c++)bl[5*7+c]=1;if(P.aiMove(bl,2,'hard')!==3)throw 4;
// hard beats easy over games
let hw=0;for(let g=0;g<20;g++){const x=P.empty();let t=g%2?2:1;for(;;){const m=P.aiMove(x.slice(),t,t===(g%2?2:1)?'easy':'hard');const r=P.drop(x,m);x[r*7+m]=t;const q=P.winner(x);if(q){if(q.p===(g%2?1:2))hw++;break}if(P.full(x))break;t=t===1?2:1}}
if(hw<17)throw new Error('hard won '+hw);console.log('ok',hw+'/20');