'use strict';
const $=s=>document.querySelector(s),B=Binairo,KEY='lilou-binairo-v1';
let game=null,selected=-1,busy=false,pendingLevel=0,worker=null;
const save=()=>{if(game)try{localStorage.setItem(KEY,JSON.stringify(game))}catch{}};
function load(){
 try{
  const g=JSON.parse(localStorage.getItem(KEY));if(!g||!B.settings[g.level])return false;const n=g.n;if(n!==B.settings[g.level].n)return false;
  if(!['puzzle','solution','values'].every(k=>Array.isArray(g[k])&&g[k].length===n*n))return false;
  if(!B.valid(g.solution,n)||!g.puzzle.every((v,i)=>v===-1||v===g.solution[i]))return false;
  if(B.count(g.puzzle,n,2)!==1)return false;
  if(!g.values.every((v,i)=>(v===-1||v===0||v===1)&&(g.puzzle[i]===-1||v===g.puzzle[i]))||!Number.isFinite(g.elapsed)||g.elapsed<0)return false;
  game=g;return true;
 }catch{return false}
}
const time=()=>{const s=game?.elapsed||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const message=t=>{$('#status').textContent=t};
const lock=on=>document.querySelectorAll('.controls button,.levels button').forEach(b=>b.disabled=on);
function start(level){
 busy=true;$('#loading').hidden=false;lock(true);message('La fabrique à grilles est au travail…');
 worker?.terminate();worker=new Worker('binairo-worker.js');
 const fail=()=>{busy=false;$('#loading').hidden=true;lock(false);message('La grille n’a pas pu être créée. Réessaie avec « Nouvelle grille ».')};
 worker.onerror=fail;
 worker.onmessage=({data})=>{
  if(data.error){fail();return}
  const p=data.puzzle;game={level:p.level,n:p.n,id:p.id,puzzle:p.puzzle,solution:p.solution,values:p.puzzle.slice(),elapsed:0,hints:0,won:false,check:$('#check').checked};
  selected=game.puzzle.findIndex(v=>v<0);busy=false;$('#loading').hidden=true;lock(false);build();save();message('Une nouvelle grille, un nouveau petit défi.');worker.terminate();worker=null;
 };worker.postMessage(level);
}
function build(){
 const b=$('#board'),n=game.n;b.style.setProperty('--n',n);b.dataset.size=n;b.replaceChildren();
 for(let i=0;i<n*n;i++){const c=document.createElement('button');c.type='button';c.className='cell';c.dataset.i=i;
  c.addEventListener('click',()=>{selected=i;cycle(i)});
  c.addEventListener('focus',()=>{if(selected!==i){selected=i;render()}});b.append(c)}
 $('#check').checked=!!game.check;
 document.querySelectorAll('[data-level]').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.level===game.level)));
 render();
}
function render(){
 const n=game.n,bad=new Set(game.check?game.values.map((v,i)=>v>=0&&v!==game.solution[i]?i:-1).filter(i=>i>=0):[]),cells=$('#board').children;
 for(let i=0;i<n*n;i++){
  const c=cells[i],v=game.values[i];
  c.className='cell'+(game.puzzle[i]>=0?' given':'')+(v===0?' zero':v===1?' one':'')+(i===selected?' selected':'')+(bad.has(i)?' error':'');
  c.textContent=v>=0?v:'';c.tabIndex=i===selected?0:-1;
  c.setAttribute('aria-label','Ligne '+(Math.floor(i/n)+1)+', colonne '+(i%n+1)+(v>=0?', '+v:', vide')+(game.puzzle[i]>=0?', indice fixe':'')+(bad.has(i)?', erreur':''));
 }
 const editable=game.puzzle.map((v,i)=>v<0?i:-1).filter(i=>i>=0),filled=editable.filter(i=>game.values[i]>=0).length;
 $('#progress').textContent=filled+' / '+editable.length;$('#meter').max=editable.length;$('#meter').value=filled;$('#timer').textContent=time();
 $('#selection').textContent=selected<0?'Touche une case : vide, 0, puis 1.':game.puzzle[selected]>=0?'Ce chiffre est un indice de départ.':'Case sélectionnée';
 $('#board').classList.toggle('complete',game.won);
}
function set(i,v){
 if(busy||!game||game.won)return;if(game.puzzle[i]>=0){message('Ce chiffre fait partie des indices de départ.');return}
 game.values[i]=v;message('Un chiffre à la fois, sans pression.');finish();render();save();
}
function cycle(i){const v=game.values[i];if(game.puzzle[i]>=0){selected=i;render();message('Ce chiffre fait partie des indices de départ.');return}set(i,v<0?0:v===0?1:-1)}
function finish(){
 if(game.values.every((v,i)=>v===game.solution[i])){
  game.won=true;$('#win-text').textContent='Grille terminée en '+time()+'. '+(game.hints?'Tu as utilisé '+game.hints+' indice'+(game.hints>1?'s':'')+'.':'Sans aucun indice. Jolie petite victoire !');
  $('#win').showModal();message('Bravo, tous les chiffres ont trouvé leur place !');
 }
}
function request(level){
 if(busy)return;pendingLevel=level;
 if(game&&!game.won&&game.values.some((v,i)=>game.puzzle[i]<0&&v>=0))$('#confirm').showModal();else start(level);
}
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>request(+b.dataset.level)));
document.querySelectorAll('#pad button').forEach(b=>b.addEventListener('click',()=>{if(selected<0){message('Choisis d’abord une case.');return}set(selected,+b.dataset.v)}));
$('#new').onclick=()=>request(game?.level||0);
$('#erase').onclick=()=>{if(selected<0){message('Choisis d’abord une case.');return}set(selected,-1)};
$('#check').onchange=()=>{if(game){game.check=$('#check').checked;render();save()}};
$('#hint').onclick=()=>{
 if(busy||!game||game.won)return;
 const wrong=game.values.findIndex((v,i)=>v>=0&&v!==game.solution[i]);
 if(wrong>=0){selected=wrong;game.check=true;$('#check').checked=true;render();message('La case signalée contient une erreur. À toi de la corriger.');save();return}
 const empty=selected>=0&&game.values[selected]<0?selected:game.values.findIndex(v=>v<0);
 if(empty<0)return;selected=empty;game.values[empty]=game.solution[empty];game.hints++;finish();render();save();if(!game.won)message('Un petit coup de pouce pour cette case.');
};
$('#next').onclick=()=>{$('#win').close();start(game.level)};
$('#stay').onclick=()=>$('#win').close();
$('#cancel').onclick=()=>$('#confirm').close();
$('#replace').onclick=()=>{$('#confirm').close();start(pendingLevel)};
document.addEventListener('keydown',e=>{
 if(!game||busy||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,summary,a'))return;
 if(e.key==='0'||e.key==='1'){if(selected>=0){e.preventDefault();set(selected,+e.key)}}
 else if(e.key===' '||e.key==='Enter'){if(selected>=0){e.preventDefault();cycle(selected)}}
 else if(['Backspace','Delete'].includes(e.key)){e.preventDefault();if(selected>=0)set(selected,-1)}
 else if(e.key.startsWith('Arrow')){
  e.preventDefault();const n=game.n;let i=selected>=0?selected:0,r=Math.floor(i/n),c=i%n;
  if(e.key==='ArrowDown')r=Math.min(n-1,r+1);if(e.key==='ArrowUp')r=Math.max(0,r-1);if(e.key==='ArrowLeft')c=Math.max(0,c-1);if(e.key==='ArrowRight')c=Math.min(n-1,c+1);
  selected=r*n+c;render();$('#board').children[selected].focus({preventScroll:true});
 }
});
setInterval(()=>{if(game&&!game.won&&!busy&&!document.hidden&&!document.querySelector('dialog[open]')){game.elapsed++;$('#timer').textContent=time();if(game.elapsed%5===0)save()}},1000);
document.addEventListener('visibilitychange',save);addEventListener('pagehide',save);
if(load()){selected=game.puzzle.findIndex((v,i)=>v<0&&game.values[i]<0);if(selected<0)selected=0;build();message(game.won?'Ta dernière victoire est sauvegardée. Une autre grille ?':'Ta petite pause reprend exactement ici.')}else start(0);

if('serviceWorker' in navigator){
 addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{const saved=document.querySelector('.autosave');if(saved)saved.textContent='♡ Sauvegarde auto · prêt hors connexion.'}).catch(()=>{}));
}
