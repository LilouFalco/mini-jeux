const M=require('./morpion-engine.js');let bad=0;
function all(b,p){const w=M.winner(b);if(w){if(w.p===1)bad++;return}if(M.full(b))return;if(p===2){const m=M.best(b.slice(),2);for(const x of m){b[x]=2;all(b,1);b[x]=0}}else for(let i=0;i<9;i++)if(!b[i]){b[i]=1;all(b,2);b[i]=0}}
all(Array(9).fill(0),1);const b=Array(9).fill(0);b[4]=1;all(b,2);
if(bad)throw new Error('AI lost '+bad);console.log('ok hard AI never loses');