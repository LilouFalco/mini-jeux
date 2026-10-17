const M=require('./mf-engine.js'),W=require('./mf-words.js'),assert=require('node:assert/strict');
const N=+process.env.N||40;
// word list sanity
const seen=new Set();
for(const [w,d,l] of W){assert(/^[A-Z]{3,8}$/.test(w),w);assert(!seen.has(w),'dup '+w);seen.add(w);assert(d&&d.length>=4&&d.length<=40,'clue '+w);assert(l===1||l===2);
 for(const t of d.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().split(/[^A-Z]+/))assert(t!==w&&!(t.length>=5&&w.length>=5&&t.slice(0,5)===w.slice(0,5)),'clue contains answer '+w+' / '+d);}
const banned=['CON','PUTE','MERDE','CUL','SEXE','NAZI','VIOL','SALOPE','PUTAIN','BITE','CHIER','PD','NIQUE','TUER','DROGUE','TETON'];
for(const b of banned)assert(!seen.has(b),'banned '+b);
console.log('word list',W.length,'entries OK');
const stats=[];
for(let level=0;level<4;level++){const sizes={},times=[];let words=0;
 for(let k=0;k<N;k++){const t=Date.now();const g=M.generate(level);times.push(Date.now()-t);
  assert.equal(M.validate(g),null);sizes[g.R+'x'+g.C]=1;
  // independent re-check: every white run >=2 is a dictionary word, each has one clue with right arrow
  const {R,C,cells}=g;
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const i=r*C+c;
   if(cells[i].t==='w'){assert(cells[i].ch&&/^[A-Z]$/.test(cells[i].ch));
    const hs=c>0&&cells[i-1].t==='w',vs=r>0&&cells[i-C].t==='w',hn=c<C-1&&cells[i+1].t==='w',vn=r<R-1&&cells[i+C].t==='w';
    assert(hs||hn||vs||vn);}
   else for(const cl of cells[i].clues){const di=cl.dir==='r'?i+1:i+C;assert(cells[di]&&cells[di].t==='w','arrow points at white cell');assert.equal(cl.cells[0],di);}
  }
  words+=cells.filter(x=>x.t==='c').reduce((a,x)=>a+x.clues.length,0);
 }
 console.log(M.settings[level].name,'sizes',Object.keys(sizes).join(','),'max ms',Math.max(...times),'avg words',(words/N).toFixed(1));}
// validator catches tampering
const g=M.generate(0);const bad=JSON.parse(JSON.stringify(g));const wi=bad.cells.findIndex(c=>c.t==='w');bad.cells[wi].ch=bad.cells[wi].ch==='Z'?'Y':'Z';assert.notEqual(M.validate(bad),null);
console.log('mots fleches engine PASS');