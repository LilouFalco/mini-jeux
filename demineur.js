'use strict';
const $=s=>document.querySelector(s),D=Demineur,KEY='lilou-demineur-v1';
let game=null,selected=0,pendingLevel=0,flagMode=false,compact=false,pressTimer=null,suppress=0;
const save=()=>{if(game)try{localStorage.setItem(KEY,JSON.stringify({...game,compact}))}catch{}};
function load(){
 try{
  const g=JSON.parse(localStorage.getItem(KEY)),s=D.settings[g?.level];if(!s||g.R!==s.R||g.C!==s.C||g.total!==s.mines)return false;
  const n=g.R*g.C;if(!Array.isArray(g.state)||g.state.length!==n||!g.state.every(v=>v===0||v===1||v===2))return false;
  if(g.mines!==null){if(!Array.isArray(g.mines)||g.mines.length!==n||g.mines.reduce((a,b)=>a+(b?1:0),0)!==s.mines)return false;g.counts=D.countsOf(g.mines,g.R,g.C)}
  else if(g.state.some(v=>v===1))return false;
  if(!Number.isFinite(g.elapsed)||g.elapsed<0)return false;
  game=g;compact=!!g.compact;return true;
 }catch{return false}
}
const time=()=>{const s=game?.elapsed||0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const message=t=>{$('#status').textContent=t};
function start(level){
 const s=D.settings[level];
 game={level,R:s.R,C:s.C,total:s.mines,mines:null,counts:null,state:new Array(s.R*s.C).fill(0),elapsed:0,over:false,won:false,lost:-1,id:Date.now().toString(36)};
 selected=Math.floor(s.R/2)*s.C+Math.floor(s.C/2);build();save();message('Le premier clic ouvre toujours une zone sûre.');
}
function fitMobile(){const b=document.querySelector('#board'),sc=document.querySelector('.board-scroll');if(!b||!sc||!game)return;
 b.classList.add('fixedfit');const cs=getComputedStyle(sc),w=sc.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-(b.offsetWidth-b.clientWidth),h=sc.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom)-(b.offsetHeight-b.clientHeight);
 if(w<=0||h<=0)return;const px=Math.max(3,Math.min(44,Math.floor(Math.min(w/game.C,h/game.R)*2)/2));b.style.setProperty('--cs',px+'px')}
addEventListener('resize',()=>fitMobile());if(window.visualViewport)visualViewport.addEventListener('resize',()=>fitMobile());addEventListener('orientationchange',()=>setTimeout(fitMobile,150));
addEventListener('DOMContentLoaded',()=>{const sc=document.querySelector('.board-scroll');if(sc&&window.ResizeObserver)new ResizeObserver(()=>fitMobile()).observe(sc)});
function build(){
 const b=$('#board');b.style.setProperty('--c',game.C);b.dataset.size=game.R+'x'+game.C;b.classList.toggle('compact',compact);b.replaceChildren();requestAnimationFrame(fitMobile);
 for(let i=0;i<game.R*game.C;i++){
  const c=document.createElement('button');c.type='button';c.className='cell';c.dataset.i=i;c.setAttribute('role','gridcell');
  c.addEventListener('click',()=>{if(suppress>Date.now())return;selected=i;act(i)});
  c.addEventListener('contextmenu',e=>{e.preventDefault();selected=i;flag(i)});
  c.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||e.button>0)return;clearTimeout(pressTimer);pressTimer=setTimeout(()=>{suppress=Date.now()+700;selected=i;flag(i);if(navigator.vibrate)navigator.vibrate(15)},420)});
  for(const ev of ['pointerup','pointerleave','pointercancel','pointermove'])c.addEventListener(ev,e=>{if(ev==='pointermove'&&Math.abs(e.movementX)+Math.abs(e.movementY)<3)return;clearTimeout(pressTimer)});
  c.addEventListener('focus',()=>{if(selected!==i){selected=i;$('#selection').textContent=label(i)}});
  b.append(c);
 }
 document.querySelectorAll('[data-level]').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.level===game.level)));
 $('#flagmode').setAttribute('aria-pressed',String(flagMode));
 render();fitMobile();
}
const label=i=>{const r=Math.floor(i/game.C)+1,c=i%game.C+1,s=game.state[i];return 'Ligne '+r+', colonne '+c+', '+(s===2?'cœur posé':s===0?'cachée':game.mines&&game.mines[i]?'mine':game.counts[i]>0?game.counts[i]+' mines autour':'vide')};
function render(){
 const cells=$('#board').children,over=game.over;
 for(let i=0;i<game.R*game.C;i++){
  const c=cells[i],s=game.state[i],mine=game.mines&&game.mines[i];let cls='cell',txt='';
  if(s===1&&!mine){cls+=' open';const n=game.counts[i];if(n>0){cls+=' n'+n;txt=n}}
  else if(s===1&&mine){cls+=' open mine'+(game.lost===i?' boom':'');txt='✹'}
  else if(s===2){cls+=' flag';txt='♥';if(over&&!mine)cls+=' wrong'}
  else if(over&&mine){cls+=' open mine';txt='✹'}
  if(i===selected)cls+=' selected';
  c.className=cls;c.textContent=txt;c.tabIndex=i===selected?0:-1;c.setAttribute('aria-label',label(i));
 }
 const flags=game.state.filter(v=>v===2).length;$('#mines').textContent=game.total-flags;
 const safe=game.R*game.C-game.total,open=game.state.filter((v,i)=>v===1&&!(game.mines&&game.mines[i])).length;
 $('#meter').max=safe;$('#meter').value=open;$('#timer').textContent=time();
 $('#selection').textContent=game.over?(game.won?'Grille terminée.':'Une mine a explosé.'):label(selected);
 $('#board').classList.toggle('over',over);
}
function end(won,cell){
 game.over=true;game.won=won;game.lost=won?-1:cell;
 if(won)game.state=game.state.map((v,i)=>game.mines[i]?2:v);
 render();save();
 $('#win-eyebrow').textContent=won?'TOUT EST À SA PLACE':'AÏE, UNE MINE';$('#win-title').textContent=won?'Bien joué !':'Pas cette fois';
 $('#win-text').textContent=won?'Grille terminée en '+time()+'. Toutes les cases sûres sont ouvertes !':'Tu avais ouvert '+game.state.filter((v,i)=>v===1&&!game.mines[i]).length+' cases sûres en '+time()+'. On recommence tout doucement ?';
 $('#win').showModal();message(won?'Bravo, tout est déminé !':'Boum… mais ce n’est qu’un jeu, une autre grille t’attend.');
}
function firstReveal(i){
 if(game.mines)return;
 game.mines=D.place(game.R,game.C,game.total,i);game.counts=D.countsOf(game.mines,game.R,game.C);
}
function open(i){
 if(game.over)return;
 if(game.state[i]===2)return;
 if(game.state[i]===1){const r=D.chord(game,i);if(!r.did){message(game.counts[i]>0?'Pose autant de cœurs que le chiffre pour ouvrir les voisines d’un coup.':'Cette case est déjà ouverte.');return}
  if(r.hit){const bad=D.neighbors(i,game.R,game.C).find(j=>game.state[j]===1&&game.mines[j]);end(false,bad);return}}
 else{firstReveal(i);const r=D.reveal(game,i);if(r.hit){end(false,i);return}}
 if(D.won(game))end(true);else{render();save()}
}
function flag(i){
 if(game.over||game.state[i]===1)return;
 game.state[i]=game.state[i]===2?0:2;message(game.state[i]===2?'Cœur posé.':'Cœur retiré.');render();save();
}
function act(i){if(flagMode&&game.state[i]!==1)flag(i);else open(i)}
function request(level){
 pendingLevel=level;
 if(game&&!game.over&&game.state.some(v=>v!==0))$('#confirm').showModal();else start(level);
}
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>request(+b.dataset.level)));
$('#new').onclick=()=>request(game?.level||0);
$('#flagmode').onclick=()=>{flagMode=!flagMode;$('#flagmode').setAttribute('aria-pressed',String(flagMode));message(flagMode?'Mode cœur activé : touche pour poser ou retirer un cœur.':'Mode ouverture activé.')};
{const rd=$('#rules-dialog'),rb=$('#rules-btn');rb.onclick=()=>rd.showModal();$('#rules-close').onclick=()=>rd.close();rd.addEventListener('close',()=>rb.focus({preventScroll:true}))}
$('#next').onclick=()=>{$('#win').close();start(game.level)};
$('#stay').onclick=()=>$('#win').close();
$('#cancel').onclick=()=>$('#confirm').close();
$('#replace').onclick=()=>{$('#confirm').close();start(pendingLevel)};
document.addEventListener('keydown',e=>{
 if(!game||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,summary,a')||(e.target.closest('button')&&!e.target.classList.contains('cell')))return;
 if(e.key.startsWith('Arrow')){
  e.preventDefault();let r=Math.floor(selected/game.C),c=selected%game.C;
  if(e.key==='ArrowDown')r=Math.min(game.R-1,r+1);if(e.key==='ArrowUp')r=Math.max(0,r-1);if(e.key==='ArrowLeft')c=Math.max(0,c-1);if(e.key==='ArrowRight')c=Math.min(game.C-1,c+1);
  selected=r*game.C+c;render();$('#board').children[selected].focus({preventScroll:false});
 }else if(e.key==='Enter'||e.key===' '){e.preventDefault();act(selected)}
 else if(e.key.toLowerCase()==='f'){flag(selected)}
});
setInterval(()=>{if(game&&game.mines&&!game.over&&!document.hidden&&!document.querySelector('dialog[open]')){game.elapsed++;$('#timer').textContent=time();if(game.elapsed%5===0)save()}},1000);
document.addEventListener('visibilitychange',save);addEventListener('pagehide',save);
if(load()){build();message(game.over?'Ta dernière partie est sauvegardée. Une autre grille ?':'Ta partie reprend exactement ici.')}else start(0);

if('serviceWorker' in navigator){
 addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>{const saved=document.querySelector('.autosave');if(saved)saved.textContent='♡ Sauvegarde auto · prêt hors connexion.'}).catch(()=>{}));
}
