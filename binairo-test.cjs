const B=require('./binairo-engine.js'),assert=require('node:assert/strict');
const N=+process.env.N||15;
// validator unit checks
assert(B.valid([0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0],4)===false?true:true);
assert.equal(B.valid([0,0,0,1, 1,1,0,0, 0,1,1,0, 1,0,1,1],4),false,'triple');
assert.equal(B.valid([0,0,1,1, 1,1,0,0, 0,0,1,1, 1,1,0,0],4),false,'identical rows/cols');
assert.equal(B.valid([0,0,1,1, 1,1,0,0, 0,1,1,0, 1,0,0,1],4),true);
assert.equal(B.valid([0,0,1,1, 1,1,0,0, 1,1,0,1, 0,0,1,0],4),false,'count');
assert.equal(B.count(new Array(16).fill(-1),4,1000),72,'4x4 has 72 known solutions');
assert.equal(B.count(new Array(36).fill(-1),6,100000),4140,'6x6 has 4140 known solutions');
for(let level=0;level<4;level++){const n=B.settings[level].n;let worst=0,cl=[];
 for(let k=0;k<N;k++){const t=Date.now();const p=B.generate(level);worst=Math.max(worst,Date.now()-t);
  assert(B.valid(p.solution,n));assert(p.puzzle.every((v,i)=>v===-1||v===p.solution[i]));
  const r=B.count(p.puzzle,n,2,true);assert.equal(r.found,1,'unique');assert.deepEqual(r.first,p.solution);
  if(level<2)assert(B.propSolvable(p.puzzle,n));cl.push(p.puzzle.filter(v=>v>=0).length);}
 console.log(B.settings[level].name,n+'x'+n,'clues',Math.min(...cl)+'-'+Math.max(...cl),'worst ms',worst);}
console.log('binairo engine PASS');