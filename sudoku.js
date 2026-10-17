'use strict';
const $=s=>document.querySelector(s),S=Sudoku,KEY='lilou-sudoku-v1';
let game=null,selected=-1,noteMode=false,busy=false,pendingLevel=0,worker=null;
const save=()=>{if(game)try{localStorage.setItem(KEY,JSON.stringify(game))}catch{}};
function load(){
 try{
  const g=JSON.parse(localStorage.getItem(KEY));if(!g||!S.settings[g.level])return false;
  if(!['puzzle','solution','values','notes'].every(k=>Array.isArray(g[k])&&g[k].length===81))return false;
  if(!g.solution.every(v=>Number.isInteger(v)&&v>=1&&v<=9)||!S.valid(g.solution)||!g.puzzle.every((v,i)=>v===0||v===g.solution[i]))return false;
  if(S.count(g.puzzle,2)!==1)return false;
  if(!g.values.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=9&&(!g.puzzle[i]||v===g.puzzle[i]))||!g.notes.every(a=>Array.isArray(a)&&a.every(v=>Number.isInteger(v)&&v>=1&&v<=9)))return false;
  if(!Number.isFinite(g.elapsed)||g.elapsed<0)return false;
  game=g;return true;
 }catch{return false}
}
const time=()=>{const s=game?.elapsed||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const message=t=>{$('#status').textContent=t};
const lock=on=>document.querySelectorAll('.controls button,.levels button').forEach(b=>b.disabled=on);
function start(level){
 busy=true;$('#loading').hidden=false;lock(true);message('La fabrique à grilles est au travail…');
 worker?.terminate();worker=new Worker('sudoku-worker.js');
 const fail=()=>{busy=false;$('#loading').hidden=true;lock(false);message('La grille n’a pas pu être créée. Réessaie avec « Nouvelle grille ».')};
 worker.onerror=fail;
 worker.onmessage=({data})=>{
  if(data.error){fail();return}
  const p=data.puzzle;game={level:p.level,id:p.id,puzzle:p.puzzle,solution:p.solution,values:p.puzzle.slice(),notes:p.puzzle.map(()=>[]),elapsed:0,hints:0,won:false,check:$('#check').checked};
  selected=game.puzzle.findIndex(v=>!v);noteMode=false;$('#notes').setAttribute('aria-pressed','false');
  busy=false;$('#loading').hidden=true;lock(false);build();save();message('Une nouvelle grille, un nouveau petit défi.');worker.terminate();worker=null;
 };worker.postMessage(level);
}
function build(){
 const b=$('#board');b.dataset.size=9;b.replaceChildren();
 for(let i=0;i<81;i++){
  const c=document.createElement('button'),r=Math.floor(i/9),k=i%9;c.type='button';c.dataset.i=i;
  c.className='cell'+(k%3===2&&k<8?' br':'')+(r%3===2&&r<8?' bb':'');
  c.addEventListener('click',()=>{selected=i;render()});c.addEventListener('focus',()=>{if(selected!==i){selected=i;render()}});b.append(c);
 }
 const pad=$('#pad');pad.replaceChildren();for(let v=1;v<=9;v++){const x=document.createElement('button');x.textContent=v;x.dataset.v=v;x.addEventListener('click',()=>input(v));pad.append(x)}
 $('#check').checked=!!game.check;
 document.querySelectorAll('[data-level]').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.level===game.level)));
 render();
}
function render(){
 const bad=new Set(game.check?game.values.map((v,i)=>v&&v!==game.solution[i]?i:-1).filter(i=>i>=0):[]),peers=new Set(selected>=0?S.PEERS[selected]:[]);
 const cells=$('#board').children;
 for(let i=0;i<81;i++){
  const c=cells[i],v=game.values[i];
  c.className=c.className.split(' ').filter(x=>x==='cell'||x==='br'||x==='bb').join(' ')+(game.puzzle[i]?' given':'')+(peers.has(i)?' peer':'')+(v&&selected>=0&&v===game.values[selected]?' same':'')+(i===selected?' selected':'')+(bad.has(i)?' error':'');
  c.replaceChildren();c.tabIndex=i===selected?0:-1;
  if(v)c.textContent=v;else if(game.notes[i].length){const n=document.createElement('span');n.className='note-grid';for(let k=1;k<=9;k++){const s=document.createElement('span');s.textContent=game.notes[i].includes(k)?k:'';n.append(s)}c.append(n)}
  c.setAttribute('aria-label','Ligne '+(Math.floor(i/9)+1)+', colonne '+(i%9+1)+(v?', '+v:', vide')+(game.puzzle[i]?', indice fixe':'')+(bad.has(i)?', erreur':''));
 }
 const editable=game.puzzle.map((v,i)=>v?-1:i).filter(i=>i>=0),filled=editable.filter(i=>game.values[i]).length;
 $('#progress').textContent=filled+' / '+editable.length;$('#meter').max=editable.length;$('#meter').value=filled;$('#timer').textContent=time();
 $('#selection').textContent=selected<0?'Choisis une case pour commencer.':game.puzzle[selected]?'Ce chiffre est un indice de départ.':'Case sélectionnée'+(noteMode?' · notes activées':'');
 [...$('#pad').children].forEach(b=>b.classList.toggle('done',game.values.filter(v=>v===+b.dataset.v).length>=9));
 $('#board').classList.toggle('complete',game.won);
}
function input(v){
 if(busy||!game||game.won)return;if(selected<0){message('Choisis d’abord une case.');return}
 if(game.puzzle[selected]){message('Ce chiffre fait partie des indices de départ.');return}
 if(noteMode&&v){if(game.values[selected]){message('Efface le chiffre avant d’ajouter des notes.');return}const a=game.notes[selected];game.notes[selected]=a.includes(v)?a.filter(n=>n!==v):[...a,v].sort((a,b)=>a-b)}
 else{game.values[selected]=v;game.notes[selected]=[];if(v)for(const p of S.PEERS[selected])game.notes[p]=game.notes[p].filter(n=>n!==v)}
 message(noteMode?'Tes pistes restent au crayon.':'Un chiffre à la fois, sans pression.');finish();render();save();
}
function finish(){
 if(game.values.every((v,i)=>v===game.solution[i])){
  game.won=true;$('#win-text').textContent='Grille terminée en '+time()+'. '+(game.hints?'Tu as utilisé '+game.hints+' indice'+(game.hints>1?'s':'')+'.':'Sans aucun indice. Jolie petite victoire !');
  $('#win').showModal();message('Bravo, tous les chiffres ont trouvé leur place !');
 }
}
function request(level){
 if(busy)return;pendingLevel=level;
 if(game&&!game.won&&game.values.some((v,i)=>!game.puzzle[i]&&(v||game.notes[i].length)))$('#confirm').showModal();else start(level);
}
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>request(+b.dataset.level)));
$('#new').onclick=()=>request(game?.level||0);
$('#erase').onclick=()=>input(0);
$('#notes').onclick=()=>{noteMode=!noteMode;$('#notes').setAttribute('aria-pressed',String(noteMode));if(game)render()};
$('#check').onchange=()=>{if(game){game.check=$('#check').checked;render();save()}};
$('#hint').onclick=()=>{
 if(busy||!game||game.won)return;
 const wrong=game.values.findIndex((v,i)=>v&&v!==game.solution[i]);
 if(wrong>=0){selected=wrong;game.check=true;$('#check').checked=true;render();message('La case signalée contient une erreur. À toi de la corriger.');save();return}
 const empty=selected>=0&&!game.values[selected]?selected:game.values.findIndex(v=>!v);
 if(empty<0)return;selected=empty;game.values[empty]=game.solution[empty];game.notes[empty]=[];game.hints++;finish();render();save();if(!game.won)message('Un petit coup de pouce pour cette case.');
};
$('#next').onclick=()=>{$('#win').close();start(game.level)};
$('#stay').onclick=()=>$('#win').close();
$('#cancel').onclick=()=>$('#confirm').close();
$('#replace').onclick=()=>{$('#confirm').close();start(pendingLevel)};
document.addEventListener('keydown',e=>{
 if(!game||busy||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,summary,a'))return;
 if(/^[1-9]$/.test(e.key)){e.preventDefault();input(+e.key)}
 else if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();input(0)}
 else if(e.key.toLowerCase()==='n')$('#notes').click();
 else if(e.key.startsWith('Arrow')){
  e.preventDefault();let i=selected>=0?selected:0,r=Math.floor(i/9),c=i%9;
  if(e.key==='ArrowDown')r=Math.min(8,r+1);if(e.key==='ArrowUp')r=Math.max(0,r-1);if(e.key==='ArrowLeft')c=Math.max(0,c-1);if(e.key==='ArrowRight')c=Math.min(8,c+1);
  selected=r*9+c;render();$('#board').children[selected].focus({preventScroll:true});
 }
});
setInterval(()=>{if(game&&!game.won&&!busy&&!document.hidden&&!document.querySelector('dialog[open]')){game.elapsed++;$('#timer').textContent=time();if(game.elapsed%5===0)save()}},1000);
document.addEventListener('visibilitychange',save);addEventListener('pagehide',save);
if(load()){selected=game.puzzle.findIndex((v,i)=>!v&&!game.values[i]);if(selected<0)selected=0;build();message(game.won?'Ta dernière victoire est sauvegardée. Une autre grille ?':'Ta petite pause reprend exactement ici.')}else start(0);

if('serviceWorker' in navigator){
 addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{const saved=document.querySelector('.autosave');if(saved)saved.textContent='♡ Sauvegarde auto · prêt hors connexion.'}).catch(()=>{}));
}
