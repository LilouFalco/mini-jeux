const S=require('./sudoku-engine.js'),assert=require('node:assert/strict');
const N=+process.env.N||12;let t=Date.now();const stats=[];
for(let level=0;level<4;level++){let worst=0,clues=[];
 for(let k=0;k<N;k++){const t0=Date.now();const p=S.generate(level);worst=Math.max(worst,Date.now()-t0);
  assert.equal(p.solution.length,81);assert(S.valid(p.solution)&&p.solution.every(v=>v>=1&&v<=9));
  assert(p.puzzle.every((v,i)=>!v||v===p.solution[i]));
  assert.equal(S.count(p.puzzle,2),1,'unique');
  assert.deepEqual(S.solve(p.puzzle),p.solution);
  if(level<2)assert(S.singlesSolvable(p.puzzle));
  clues.push(p.puzzle.filter(Boolean).length);}
 console.log(S.settings[level].name,'clues',Math.min(...clues)+'-'+Math.max(...clues),'worst ms',worst);}
assert.equal(S.count(new Array(81).fill(0),2),2);
console.log('sudoku engine PASS');