/* Mots fléchés: random templates (clue cells) filled by constraint search over the curated list. */
(function(root){
'use strict';
const WORDS=root.MFWORDS||(typeof require!=='undefined'?require('./mf-words.js'):[]);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const settings=[
 {name:'Facile',sizes:[[6,6],[7,6],[6,7]],maxRun:5,hard:false,black:.2},
 {name:'Moyen',sizes:[[7,7],[8,6],[6,8]],maxRun:6,hard:false,black:.19},
 {name:'Difficile',sizes:[[8,8],[9,7],[7,9]],maxRun:6,hard:true,black:.2},
 {name:'Extr\u00eame',sizes:[[9,9],[10,8],[8,10]],maxRun:7,hard:true,black:.2}];
function runsOf(R,C,black){
 const slots=[];
 for(let r=0;r<R;r++){let s=null;for(let c=0;c<=C;c++){if(c<C&&!black[r*C+c]){if(!s)s=[];s.push(r*C+c)}else{if(s&&s.length>=2)slots.push({dir:'r',cells:s,start:s[0]});s=null}}}
 for(let c=0;c<C;c++){let s=null;for(let r=0;r<=R;r++){if(r<R&&!black[r*C+c]){if(!s)s=[];s.push(r*C+c)}else{if(s&&s.length>=2)slots.push({dir:'d',cells:s,start:s[0]});s=null}}}
 return slots;
}
function template(R,C,set){
 for(let tries=0;tries<300;tries++){
  const black=new Array(R*C).fill(false);
  for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(!r||!c||Math.random()<set.black)black[r*C+c]=true;
  for(let pass=0;pass<30;pass++){
   let changed=false;const cover=new Array(R*C).fill(0);
   for(const s of runsOf(R,C,black)){
    const L=s.cells.length;
    if(L===2){black[s.cells[Math.random()<.5?0:1]]=true;changed=true}
    else if(L>set.maxRun){black[s.cells[2+Math.floor(Math.random()*(L-4))]]=true;changed=true}
    else s.cells.forEach(i=>cover[i]=1);
   }
   if(changed)continue;
   for(let i=0;i<R*C;i++)if(!black[i]&&!cover[i]){black[i]=true;changed=true}
   if(!changed)break;
  }
  const slots=runsOf(R,C,black);
  if(slots.some(s=>s.cells.length<3||s.cells.length>set.maxRun))continue;
  const white=black.map((b,i)=>b?-1:i).filter(i=>i>=0);
  if(white.length<R*C*.52||white.length>R*C*.8)continue;
  const cov=new Set(slots.flatMap(s=>s.cells));if(white.some(i=>!cov.has(i)))continue;
  const seen=new Set([white[0]]),q=[white[0]];
  while(q.length){const i=q.pop(),r=Math.floor(i/C),c=i%C;for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const rr=r+dr,cc=c+dc;if(rr<0||cc<0||rr>=R||cc>=C)continue;const j=rr*C+cc;if(!black[j]&&!seen.has(j)){seen.add(j);q.push(j)}}}
  if(seen.size!==white.length)continue;
  const sets=slots.length;if(sets<(R*C)/5)continue;
  return {black,slots};
 }
 return null;
}
function fill(R,C,tpl,set,budget){
 const pool=WORDS.filter(w=>set.hard||w[2]===1);
 const byLen={};for(const w of pool)(byLen[w[0].length]=byLen[w[0].length]||[]).push(w);
 const letters=new Array(R*C).fill(''),used=new Set(),slots=tpl.slots,chosen=new Array(slots.length).fill(null);
 let nodes=0;
 const cands=(s,limit)=>{
  const out=[];
  for(const w of byLen[s.cells.length]||[]){
   if(used.has(w[0]))continue;let ok=true;
   for(let k=0;k<s.cells.length;k++){const l=letters[s.cells[k]];if(l&&l!==w[0][k]){ok=false;break}}
   if(ok){out.push(w);if(limit&&out.length>=limit)break}
  }return out;
 };
 const rec=()=>{
  if(++nodes>budget)return false;
  let best=-1,bl=null,bn=1e9;
  for(let i=0;i<slots.length;i++){
   if(chosen[i])continue;const l=cands(slots[i]);
   if(!l.length)return false;if(l.length<bn){bn=l.length;best=i;bl=l}
  }
  if(best<0)return true;
  shuffle(bl);const s=slots[best];
  for(const w of bl.slice(0,12)){
   const old=s.cells.map(i=>letters[i]);
   s.cells.forEach((i,k)=>letters[i]=w[0][k]);used.add(w[0]);chosen[best]=w;
   if(rec())return true;
   s.cells.forEach((i,k)=>letters[i]=old[k]);used.delete(w[0]);chosen[best]=null;
   if(nodes>budget)return false;
  }return false;
 };
 return rec()?{letters,chosen}:null;
}
function generate(level,deadlineMs=15000){
 const set=settings[level];if(!set)throw Error('niveau');
 const t0=Date.now();
 while(Date.now()-t0<deadlineMs){
  const [R,C]=set.sizes[Math.floor(Math.random()*set.sizes.length)];
  const tpl=template(R,C,set);if(!tpl)continue;
  const f=fill(R,C,tpl,set,400+R*C*8);if(!f)continue;
  const cells=[];
  for(let i=0;i<R*C;i++)cells.push(tpl.black[i]?{t:'c',clues:[]}:{t:'w',ch:f.letters[i]});
  tpl.slots.forEach((s,k)=>{
   const w=f.chosen[k],clueCell=s.dir==='r'?s.start-1:s.start-C;
   cells[clueCell].clues.push({dir:s.dir,text:w[1],len:s.cells.length,cells:s.cells,word:w[0]});
  });
  return {level,R,C,cells,id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),words:f.chosen.length};
 }
 throw Error('generation');
}
/* independent validator used by tests and when loading a saved grid */
function validate(g){
 const {R,C,cells}=g;if(cells.length!==R*C)return 'size';
 const black=cells.map(c=>c.t==='c'),slots=runsOf(R,C,black),seen=new Set();
 const dict=new Map(WORDS.map(w=>[w[0],w[1]]));
 for(const s of slots){
  const word=s.cells.map(i=>cells[i].ch).join('');
  if(!dict.has(word))return 'not a word '+word;
  if(seen.has(word))return 'duplicate '+word;seen.add(word);
  const clueCell=s.dir==='r'?s.start-1:s.start-C;
  if(s.dir==='r'&&s.start%C===0)return 'no clue cell';if(s.dir==='d'&&s.start<C)return 'no clue cell';
  if(!black[clueCell])return 'clue cell not black';
  const cl=cells[clueCell].clues.find(x=>x.dir===s.dir);
  if(!cl||cl.word!==word||cl.text!==dict.get(word)||cl.len!==s.cells.length)return 'clue mismatch '+word;
 }
 for(let i=0;i<R*C;i++)if(black[i]){for(const cl of cells[i].clues){if(!slots.some(s=>s.dir===cl.dir&&s.start===(cl.dir==='r'?i+1:i+C)))return 'orphan clue'}}
 else if(!slots.some(s=>s.cells.includes(i)))return 'free cell';
 return null;
}
root.MotsFleches={settings,generate,validate,WORDS};
if(typeof module!=='undefined')module.exports=root.MotsFleches;
})(typeof self!=='undefined'?self:globalThis);
