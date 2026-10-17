'use strict';
const $=s=>document.querySelector(s),E=Yakazu,KEY='lilou-yakazu-v1';
let game=null,m=null,selected=-1,noteMode=false,busy=false,pendingLevel=0,worker=null;
function save(){if(game)try{localStorage.setItem(KEY,JSON.stringify(game))}catch{}}
function load(){
 try{
  const g=JSON.parse(localStorage.getItem(KEY));if(!g||!Number.isInteger(g.level)||!E.settings[g.level]||g.n!==E.settings[g.level].n)return false;
  const size=g.n*g.n;if(!['black','solution','givens','values','notes'].every(k=>Array.isArray(g[k])&&g[k].length===size))return false;
  const mod=E.model(g.n,g.black);if(!mod.valid||E.errors(mod,g.solution).length||!mod.cells.every(i=>Number.isInteger(g.solution[i])&&g.solution[i]>0))return false;
  if(!g.values.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=mod.max&&(!g.givens[i]||v===g.givens[i]))||!g.notes.every(a=>Array.isArray(a)&&a.every(v=>Number.isInteger(v)&&v>0&&v<=mod.max)))return false;
  if(!Number.isFinite(g.elapsed)||g.elapsed<0)return false;
  game=g;m=mod;return true;
 }catch{return false}
}
function time(){const s=game?.elapsed||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function message(text){$('#status').textContent=text}
function start(level){
 busy=true;$('#loading').hidden=false;document.querySelectorAll('.controls button,.levels button').forEach(b=>b.disabled=true);message('La fabrique à grilles est au travail…');
 worker?.terminate();worker=new Worker('worker.js');
 const fail=()=>{busy=false;$('#loading').hidden=true;document.querySelectorAll('.controls button,.levels button').forEach(b=>b.disabled=false);message('La grille n’a pas pu être créée. Réessaie avec « Nouvelle grille ».')};
 worker.onerror=fail;
 worker.onmessage=({data})=>{
  if(data.error){fail();return}
  const p=data.puzzle;game={...p,values:p.givens.slice(),notes:p.givens.map(()=>[]),elapsed:0,hints:0,won:false,check:$('#check').checked};
  m=E.model(p.n,p.black);selected=m.cells.find(i=>!p.givens[i]);noteMode=false;$('#notes').setAttribute('aria-pressed','false');
  busy=false;$('#loading').hidden=true;document.querySelectorAll('.controls button,.levels button').forEach(b=>b.disabled=false);
  build();save();message('Une nouvelle grille, un nouveau petit défi.');worker.terminate();worker=null;
 };worker.postMessage(level);
}
function build(){
 $('#board').style.setProperty('--n',game.n);$('#board').dataset.size=game.n;$('#board').replaceChildren();
 game.black.forEach((black,i)=>{
  const cell=document.createElement(black?'div':'button');cell.className=black?'cell black':'cell';cell.dataset.i=i;
  if(black)cell.setAttribute('aria-hidden','true');else{
   cell.type='button';cell.addEventListener('click',()=>select(i));cell.addEventListener('focus',()=>{if(selected!==i){selected=i;render()}});
  }$('#board').append(cell);
 });
 $('#pad').replaceChildren();for(let v=1;v<=m.max;v++){const b=document.createElement('button');b.textContent=v;b.setAttribute('aria-label','Placer '+v);b.addEventListener('click',()=>input(v));$('#pad').append(b)}
 $('#check').checked=!!game.check;
 document.querySelectorAll('[data-level]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.level===game.level)));
 render();
}
function select(i){selected=i;render()}
function render(){
 const bad=new Set(game.check?m.cells.filter(i=>game.values[i]&&game.values[i]!==game.solution[i]):[]),peers=new Set(selected>=0?m.memberships[selected].flatMap(k=>m.runs[k]):[]);
 for(const i of m.cells){
  const c=$('#board').children[i],v=game.values[i];
  c.className='cell'+(game.givens[i]?' given':'')+(peers.has(i)?' peer':'')+(v&&selected>=0&&v===game.values[selected]?' same':'')+(i===selected?' selected':'')+(bad.has(i)?' error':'');
  c.replaceChildren();c.tabIndex=i===selected?0:-1;
  if(v)c.textContent=v;else if(game.notes[i].length){const notes=document.createElement('span');notes.className='note-grid';for(let n=1;n<=m.max;n++){const s=document.createElement('span');s.textContent=game.notes[i].includes(n)?n:'';notes.append(s)}c.append(notes)}
  c.setAttribute('aria-label','Ligne '+(Math.floor(i/game.n)+1)+', colonne '+(i%game.n+1)+(v?', '+v:', vide')+(game.givens[i]?', indice fixe':'')+(bad.has(i)?', erreur':''));
  c.setAttribute('aria-pressed',String(i===selected));
 }
 const editable=m.cells.filter(i=>!game.givens[i]),filled=editable.filter(i=>game.values[i]).length;
 $('#progress').textContent=filled+' / '+editable.length;$('#meter').max=editable.length;$('#meter').value=filled;$('#timer').textContent=time();
 const max=selected>=0?Math.min(...m.memberships[selected].map(k=>m.runs[k].length)):m.max;
 $('#selection').textContent=selected<0?'Choisis une case pour commencer.':game.givens[selected]?'Ce chiffre est un indice de départ.':'Case sélectionnée · nombres de 1 à '+max+(noteMode?' · notes activées':'');
 [...$('#pad').children].forEach((b,i)=>{b.classList.toggle('unavailable',i+1>max);b.setAttribute('aria-label','Placer '+(i+1)+(i+1>max?' (hors plage pour cette case)':''))});
 $('#board').classList.toggle('complete',game.won);
}
function input(v){
 if(busy||!game||game.won)return;if(selected<0){message('Choisis d’abord une case.');return}
 if(game.givens[selected]){message('Ce chiffre fait partie des indices de départ.');return}
 if(v>m.max)return;
 if(noteMode&&v){if(game.values[selected]){message('Efface le chiffre avant d’ajouter des notes.');return}let a=game.notes[selected];game.notes[selected]=a.includes(v)?a.filter(n=>n!==v):[...a,v].sort((a,b)=>a-b)}
 else{game.values[selected]=v;game.notes[selected]=[]}
 message(noteMode?'Tes pistes restent au crayon.':'Un chiffre à la fois, sans pression.');finish();render();save();
}
function finish(){
 if(m.cells.every(i=>game.values[i]===game.solution[i])){
  game.won=true;$('#win-text').textContent='Grille terminée en '+time()+'. '+(game.hints?'Tu as utilisé '+game.hints+' indice'+(game.hints>1?'s':'')+'.':'Sans aucun indice. Jolie petite victoire !');
  $('#win').showModal();message('Bravo, tous les chiffres ont trouvé leur place !');
 }
}
function request(level){
 if(busy)return;pendingLevel=level;
 if(game&&!game.won&&m.cells.some(i=>!game.givens[i]&&(game.values[i]||game.notes[i].length)))$('#confirm').showModal();else start(level);
}
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>request(+b.dataset.level)));
$('#new').onclick=()=>request(game?.level||0);
$('#erase').onclick=()=>input(0);
$('#notes').onclick=()=>{noteMode=!noteMode;$('#notes').setAttribute('aria-pressed',String(noteMode));if(game)render()};
$('#check').onchange=()=>{if(game){game.check=$('#check').checked;render();save()}};
$('#hint').onclick=()=>{
 if(busy||!game||game.won)return;
 const wrong=m.cells.find(i=>game.values[i]&&game.values[i]!==game.solution[i]);
 if(wrong!==undefined){select(wrong);game.check=true;$('#check').checked=true;render();message('La case signalée contient une erreur. À toi de la corriger.');save();return}
 const empty=selected>=0&&!game.values[selected]?selected:m.cells.find(i=>!game.values[i]);
 if(empty===undefined)return;selected=empty;game.values[empty]=game.solution[empty];game.notes[empty]=[];game.hints++;finish();render();save();if(!game.won)message('Un petit coup de pouce pour cette case.');
};
$('#next').onclick=()=>{$('#win').close();start(game.level)};
$('#stay').onclick=()=>$('#win').close();
$('#cancel').onclick=()=>$('#confirm').close();
$('#replace').onclick=()=>{$('#confirm').close();start(pendingLevel)};
document.addEventListener('keydown',e=>{
 if(!game||busy||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,summary,a'))return;
 if(/^[0-9]$/.test(e.key)){e.preventDefault();input(e.key==='0'?10:+e.key)}
 else if(['Backspace','Delete'].includes(e.key)){e.preventDefault();input(0)}
 else if(e.key.toLowerCase()==='n'){$('#notes').click()}
 else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
  e.preventDefault();let i=selected>=0?selected:m.cells[0],dr=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0,dc=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
  let r=Math.floor(i/game.n)+dr,c=i%game.n+dc;
  while(r>=0&&r<game.n&&c>=0&&c<game.n){i=r*game.n+c;if(!game.black[i]){select(i);$('#board').children[i].focus({preventScroll:true});break}r+=dr;c+=dc}
 }
});
setInterval(()=>{if(game&&!game.won&&!busy&&!document.hidden&&!document.querySelector('dialog[open]')){game.elapsed++;$('#timer').textContent=time();if(game.elapsed%5===0)save()}},1000);
document.addEventListener('visibilitychange',save);addEventListener('pagehide',save);
if(load()){selected=m.cells.find(i=>!game.givens[i])??m.cells[0];build();message(game.won?'Ta dernière victoire est sauvegardée. Une autre grille ?':'Ta petite pause reprend exactement ici.')}else start(0);
