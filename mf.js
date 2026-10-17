'use strict';
const $=s=>document.querySelector(s),M=MotsFleches,KEY='lilou-motsfleches-v1';
let game=null,selected=-1,dir='r',busy=false,pendingLevel=0,worker=null,slots=[],slotOf=[];
const save=()=>{if(game)try{localStorage.setItem(KEY,JSON.stringify(game))}catch{}};
function index(){
 slots=[];slotOf=game.cells.map(()=>({}));
 game.cells.forEach((c,i)=>{if(c.t==='c')for(const cl of c.clues){const k=slots.length;slots.push({dir:cl.dir,cells:cl.cells,text:cl.text,word:cl.word,clueCell:i});for(const j of cl.cells)slotOf[j][cl.dir]=k}});
}
function load(){
 try{
  const g=JSON.parse(localStorage.getItem(KEY));if(!g||!M.settings[g.level]||!Array.isArray(g.cells)||!Number.isInteger(g.R)||!Number.isInteger(g.C))return false;
  if(g.R<3||g.C<3||g.R>14||g.C>14||M.validate(g))return false;
  if(!Array.isArray(g.values)||g.values.length!==g.R*g.C||!g.values.every((v,i)=>v===''||(typeof v==='string'&&/^[A-Z]$/.test(v)&&g.cells[i].t==='w'))||!Number.isFinite(g.elapsed)||g.elapsed<0)return false;
  game=g;if(!Array.isArray(game.revealed))game.revealed=[];index();return true;
 }catch{return false}
}
const time=()=>{const s=game?.elapsed||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const message=t=>{$('#status').textContent=t};
const lock=on=>document.querySelectorAll('.controls button,.levels button').forEach(b=>b.disabled=on);
function start(level){
 busy=true;$('#loading').hidden=false;lock(true);message('La fabrique à grilles est au travail…');
 worker?.terminate();worker=new Worker('mf-worker.js');
 const fail=()=>{busy=false;$('#loading').hidden=true;lock(false);message('La grille n’a pas pu être créée. Réessaie avec « Nouvelle grille ».')};
 worker.onerror=fail;
 worker.onmessage=({data})=>{
  if(data.error){fail();return}
  game={...data.grid,values:data.grid.cells.map(()=>''),revealed:[],elapsed:0,hints:0,won:false,check:$('#check').checked};index();
  const first=game.cells.findIndex(c=>c.t==='w');selected=first;dir=slotOf[first].r!==undefined?'r':'d';
  busy=false;$('#loading').hidden=true;lock(false);build();save();message('Une nouvelle grille, un nouveau petit défi.');worker.terminate();worker=null;
 };worker.postMessage(level);
}
function build(){
 const b=$('#board');b.style.setProperty('--c',game.C);b.dataset.size=game.C;b.replaceChildren();
 game.cells.forEach((c,i)=>{
  let el;
  if(c.t==='c'){
   el=document.createElement('button');el.type='button';el.className='cell black'+(c.clues.length?'':' empty');el.dataset.i=i;
   if(!c.clues.length){el=document.createElement('div');el.className='cell black empty';el.setAttribute('aria-hidden','true')}
   else{
    el.setAttribute('aria-label','Définition'+(c.clues.length>1?'s':'')+' : '+c.clues.map(k=>k.text+(k.dir==='r'?' (vers la droite, ':' (vers le bas, ')+k.len+' lettres)').join(' ; '));
    c.clues.forEach((k,n)=>{const d=document.createElement('div');d.className='clue '+k.dir;d.dataset.n=n;const s=document.createElement('span');s.textContent=k.text;if(k.text.split(' ').some(w=>w.length>9))d.classList.add('tight');d.append(s);el.append(d)});
    el.addEventListener('click',()=>{const k=c.clues[0];selected=k.cells[0];dir=k.dir;render()});
    el.dataset.i=i;
   }
  }else{
   el=document.createElement('button');el.type='button';el.className='cell white';el.dataset.i=i;
   el.addEventListener('click',()=>{if(selected===i&&slotOf[i].r!==undefined&&slotOf[i].d!==undefined)dir=dir==='r'?'d':'r';selected=i;if(slotOf[i][dir]===undefined)dir=dir==='r'?'d':'r';render()});
   el.addEventListener('focus',()=>{if(selected!==i){selected=i;if(slotOf[i][dir]===undefined)dir=dir==='r'?'d':'r';render()}});
  }
  b.append(el);
 });
 $('#check').checked=!!game.check;
 document.querySelectorAll('[data-level]').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.level===game.level)));
 render();
}
const curSlot=()=>selected>=0?slots[slotOf[selected][dir]]:null;
function render(){
 const sl=curSlot(),word=new Set(sl?sl.cells:[]),bad=new Set(game.check?game.cells.map((c,i)=>c.t==='w'&&game.values[i]&&game.values[i]!==c.ch?i:-1).filter(i=>i>=0):[]);
 game.cells.forEach((c,i)=>{
  const el=$('#board').children[i];
  if(c.t==='c'){el.querySelectorAll?.('.clue').forEach(d=>d.classList.toggle('active',!!sl&&sl.clueCell===i&&c.clues[+d.dataset.n].dir===sl.dir));return}
  const v=game.values[i];
  el.className='cell white'+(word.has(i)?' word':'')+(i===selected?' selected':'')+(bad.has(i)?' error':'')+(game.revealed.includes(i)?' revealed':'');
  el.textContent=v;el.tabIndex=i===selected?0:-1;
  el.setAttribute('aria-label','Ligne '+(Math.floor(i/game.C)+1)+', colonne '+(i%game.C+1)+(v?', '+v:', vide')+(bad.has(i)?', erreur':''));
 });
 const white=game.cells.map((c,i)=>c.t==='w'?i:-1).filter(i=>i>=0),filled=white.filter(i=>game.values[i]).length;
 $('#progress').textContent=filled+' / '+white.length;$('#meter').max=white.length;$('#meter').value=filled;$('#timer').textContent=time();
 $('#clue-bar').replaceChildren();
 if(sl){const b=document.createElement('b');b.textContent=(sl.dir==='r'?'→ ':'↓ ')+sl.cells.length+' lettres';const t=document.createElement('span');t.textContent=sl.text;$('#clue-bar').append(b,t);$('#selection').textContent='Mot de '+sl.cells.length+' lettres, sens '+(sl.dir==='r'?'horizontal':'vertical')+'.'}
 else{$('#clue-bar').textContent='Choisis une case pour voir sa définition.';$('#selection').textContent='Choisis une case pour commencer.'}
 $('#board').classList.toggle('complete',game.won);
}
function advance(back){
 const sl=curSlot();if(!sl)return;const k=sl.cells.indexOf(selected),n=k+(back?-1:1);
 if(n>=0&&n<sl.cells.length)selected=sl.cells[n];
}
function input(ch){
 if(busy||!game||game.won)return;if(selected<0||game.cells[selected].t!=='w'){message('Choisis d’abord une case blanche.');return}
 if(game.revealed.includes(selected)&&ch){advance();render();return}
 if(game.revealed.includes(selected)){message('Cette lettre a été révélée.');return}
 game.values[selected]=ch;message('Une lettre à la fois, sans pression.');
 if(ch)advance();finish();render();save();
}
function erase(){
 if(!game||busy||game.won||selected<0)return;
 if(game.values[selected]||game.revealed.includes(selected)){input('')}else{advance(true);input('')}
}
function finish(){
 if(game.cells.every((c,i)=>c.t!=='w'||game.values[i]===c.ch)){
  game.won=true;$('#win-text').textContent='Grille terminée en '+time()+'. '+(game.hints?'Tu as utilisé '+game.hints+' indice'+(game.hints>1?'s':'')+'.':'Sans aucun indice. Jolie petite victoire !');
  $('#win').showModal();message('Bravo, tous les mots sont à leur place !');
 }
}
function request(level){
 if(busy)return;pendingLevel=level;
 if(game&&!game.won&&game.values.some(Boolean))$('#confirm').showModal();else start(level);
}
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>request(+b.dataset.level)));
document.querySelectorAll('[data-k]').forEach(b=>b.addEventListener('click',()=>input(b.dataset.k)));
$('#new').onclick=()=>request(game?.level||0);
$('#erase').onclick=erase;
$('#dir').onclick=()=>{if(selected<0)return;const o=dir==='r'?'d':'r';if(slotOf[selected][o]!==undefined){dir=o;render()}else message('Un seul mot passe par cette case.')};
$('#check').onchange=()=>{if(game){game.check=$('#check').checked;render();save()}};
$('#hint').onclick=()=>{
 if(busy||!game||game.won)return;
 const wrong=game.cells.findIndex((c,i)=>c.t==='w'&&game.values[i]&&game.values[i]!==c.ch);
 let target=selected>=0&&game.cells[selected].t==='w'&&game.values[selected]!==game.cells[selected].ch?selected:-1;
 if(target<0)target=wrong>=0?wrong:game.cells.findIndex((c,i)=>c.t==='w'&&game.values[i]!==c.ch);
 if(target<0)return;
 selected=target;game.values[target]=game.cells[target].ch;if(!game.revealed.includes(target))game.revealed.push(target);game.hints++;
 if(slotOf[target][dir]===undefined)dir=dir==='r'?'d':'r';
 finish();render();save();if(!game.won)message('Une lettre révélée, pour te donner un coup de pouce.');
};
$('#next').onclick=()=>{$('#win').close();start(game.level)};
$('#stay').onclick=()=>$('#win').close();
$('#cancel').onclick=()=>$('#confirm').close();
$('#replace').onclick=()=>{$('#confirm').close();start(pendingLevel)};
document.addEventListener('keydown',e=>{
 if(!game||busy||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,summary,a'))return;
 if(/^[a-zA-Z]$/.test(e.key)){e.preventDefault();input(e.key.toUpperCase())}
 else if(['Backspace','Delete'].includes(e.key)){e.preventDefault();erase()}
 else if(e.key==='Tab'||e.key===' '){if(selected>=0&&e.key===' '){e.preventDefault();$('#dir').click()}}
 else if(e.key.startsWith('Arrow')){
  e.preventDefault();if(selected<0)return;let r=Math.floor(selected/game.C),c=selected%game.C;const dr=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0,dc=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
  r+=dr;c+=dc;while(r>=0&&c>=0&&r<game.R&&c<game.C){const i=r*game.C+c;if(game.cells[i].t==='w'){selected=i;if(slotOf[i][dir]===undefined)dir=dir==='r'?'d':'r';render();$('#board').children[i].focus({preventScroll:true});break}r+=dr;c+=dc}
 }
});
setInterval(()=>{if(game&&!game.won&&!busy&&!document.hidden&&!document.querySelector('dialog[open]')){game.elapsed++;$('#timer').textContent=time();if(game.elapsed%5===0)save()}},1000);
document.addEventListener('visibilitychange',save);addEventListener('pagehide',save);
if(load()){selected=game.cells.findIndex((c,i)=>c.t==='w'&&!game.values[i]);if(selected<0)selected=game.cells.findIndex(c=>c.t==='w');dir=slotOf[selected].r!==undefined?'r':'d';build();message(game.won?'Ta dernière victoire est sauvegardée. Une autre grille ?':'Ta petite pause reprend exactement ici.')}else start(0);

if('serviceWorker' in navigator){
 addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{const saved=document.querySelector('.autosave');if(saved)saved.textContent='♡ Sauvegarde auto · prêt hors connexion.'}).catch(()=>{}));
}
