const D=require('./demineur-engine.js'),assert=require('node:assert/strict');
const mk=(R,C,mines,safe)=>{const m=D.place(R,C,mines,safe);return {R,C,mines:m,counts:D.countsOf(m,R,C),state:new Array(R*C).fill(0)}};
for(const s of D.settings){for(let k=0;k<200;k++){const safe=Math.floor(Math.random()*s.R*s.C),m=D.place(s.R,s.C,s.mines,safe);
 assert.equal(m.reduce((a,b)=>a+b,0),s.mines);assert.equal(m[safe],0);for(const j of D.neighbors(safe,s.R,s.C))assert.equal(m[j],0,'3x3 free');}
 // corner first click still works
 for(const safe of [0,s.C-1,(s.R-1)*s.C,s.R*s.C-1]){const g=mk(s.R,s.C,s.mines,safe);const r=D.reveal(g,safe);assert(!r.hit);assert(r.opened>=4,'opens an area');assert.equal(g.counts[safe],0);}
 console.log(s.name,s.R+'x'+s.C,s.mines,'mines, exact counts + first-click safe 3x3 incl. corners PASS');}
// counts & flood on a known board
{const mines=[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1];const g={R:5,C:5,mines,counts:D.countsOf(mines,5,5),state:new Array(25).fill(0)};
 assert.deepEqual(g.counts.slice(0,3),[-1,1,0]);const r=D.reveal(g,12);assert(!r.hit);assert.equal(g.state[0],0);assert.equal(g.state[24],0);assert.equal(g.state[1],1);assert.equal(g.state[23],1);
 // flagged cells are not opened by flood
 const g2={R:5,C:5,mines,counts:g.counts,state:new Array(25).fill(0)};g2.state[13]=2;D.reveal(g2,12);assert.equal(g2.state[13],2);
 // chord: correct flags open neighbours
 const g3={R:5,C:5,mines,counts:g.counts,state:g.state.slice()};g3.state[0]=2;let c=D.chord(g3,1);assert(c.did&&!c.hit);assert.equal(g3.state[5],1);
 // chord with wrong flag loses
 const g4={R:5,C:5,mines,counts:g.counts,state:g.state.slice()};g4.state[5]=2;c=D.chord(g4,1);assert(c.did&&c.hit,'wrong flag loses');
 // chord with wrong count does nothing
 const g5={R:5,C:5,mines,counts:g.counts,state:g.state.slice()};c=D.chord(g5,1);assert(!c.did);
 // reveal mine = hit; win detection
 const g6={R:5,C:5,mines,counts:g.counts,state:new Array(25).fill(0)};assert(D.reveal(g6,0).hit);
 const g7={R:5,C:5,mines,counts:g.counts,state:mines.map(m=>m?0:1)};assert(D.won(g7));g7.state[3]=0;assert(!D.won(g7));}
console.log('demineur engine PASS');