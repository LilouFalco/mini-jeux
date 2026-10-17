const assert=require('node:assert/strict'),E=require('./engine');
const solution=[4,0,1,2,3,2,3,4,5,1,1,4,2,3,5,3,2,5,1,4,0,1,3,4,2];
const black=solution.map(v=>!v),m=E.model(5,black);
assert(m.valid);assert.deepEqual(E.errors(m,solution),[]);
assert(m.memberships[0].length===1);assert.equal(solution[0],4);
const bad=solution.slice();bad[0]=2;assert(E.errors(m,bad).includes(0));
const givens=Array(25).fill(0);for(const i of [4,9,12,14,15,23])givens[i]=solution[i];
let ex=E.solve(m,givens,2);assert.equal(ex.count,1);assert.deepEqual(ex.solution,solution);
for(let level=0;level<4;level++)for(let round=0;round<10;round++){
 const t=Date.now(),p=E.generate(level),mod=E.model(p.n,p.black),s=E.solve(mod,p.givens,2,1000000);
 assert(mod.valid);assert(p.black.some(Boolean));assert.equal(s.count,1);assert(!s.aborted);assert.deepEqual(s.solution,p.solution);assert.deepEqual(E.errors(mod,p.solution),[]);
 for(const run of mod.runs)assert.deepEqual(run.map(i=>p.solution[i]).sort((a,b)=>a-b),Array.from({length:run.length},(_,i)=>i+1));
 console.log('level',level,'round',round,'ms',Date.now()-t,'givens',p.givens.filter(Boolean).length);
}
console.log('Official example + singleton + 40 unique generated puzzles PASS');
