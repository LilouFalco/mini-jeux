const V=require('./naval-engine.js');const assert=require('assert');
for(let t=0;t<200;t++){const f=V.randomFleet();assert.equal(f.length,5);const all=f.flatMap(s=>s.cells);assert.equal(new Set(all).size,17);assert(f.every(s=>s.cells.length===s.len))}
function sim(mode){let tot=0;for(let g=0;g<60;g++){const f=V.randomFleet(),sh=Array(100).fill(0);let n=0;while(!V.allSunk(f,sh)){const i=V.aiShot(sh,f,mode);assert(i>=0&&!sh[i]);V.shoot(f,sh,i);n++;assert(n<=100)}tot+=n}return tot/60}
const e=sim('easy'),h=sim('hard');console.log('avg shots easy',e.toFixed(1),'hard',h.toFixed(1));assert(h<e-15);assert(h<65);
assert(!V.canPlace([{cells:[0,1,2]}],0,1,2,true));assert(!V.canPlace([],0,9,2,true));console.log('naval ok')