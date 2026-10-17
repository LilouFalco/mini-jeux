'use strict';
(function(){
const P=window.PetitBac,KEY='lilou-petitbac-v1',$=s=>document.querySelector(s),v=$('#v');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S={n:3,names:['Lilou','Lulu','','','','','','','',''],cats:P.DEFAULT.slice(),time:90,sound:true,used:[],letter:'',marks:{},tot:null,rounds:0};
try{Object.assign(S,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const nm=i=>(S.names[i]||'').trim()||'Joueur '+(i+1);
let ph='setup',timer=null,deadline=0,ctx=null;
function beep(f,d){if(!S.sound)return;try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;g.gain.value=.15;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+d)}catch(e){}}
function stop(){if(timer){clearInterval(timer);timer=null}}
function draw(){stop();({setup:setup,play:play,score:score,total:total}[ph])()}
function setup(){const ck=Object.keys(P.CATS);
 v.innerHTML='<div class="uc"><h2>Joueurs</h2><div class="row stepper"><button id="m" aria-label="Moins">−</button><b id="cnt">'+S.n+'</b><button id="p" aria-label="Plus">+</button><span>joueurs</span></div><div class="names">'+Array.from({length:S.n},(_,i)=>'<input aria-label="Prénom '+(i+1)+'" data-i="'+i+'" maxlength="12" placeholder="Joueur '+(i+1)+'" value="'+esc(S.names[i]||'')+'">').join('')+'</div><h2>Catégories</h2><div class="themes">'+ck.map(k=>'<button data-c="'+k+'" aria-pressed="'+S.cats.includes(k)+'">'+P.CATS[k]+'</button>').join('')+'</div><div class="row"><span>Temps</span>'+[60,90,120].map(t=>'<button data-t="'+t+'" aria-pressed="'+(S.time===t)+'">'+t+' s</button>').join('')+'<button id="snd" aria-pressed="'+S.sound+'">Son</button></div><button id="go" class="primary big">'+(S.rounds?'Nouvelle manche':'Commencer')+'</button>'+(S.rounds?'<button id="rs" class="big">Scores à zéro</button>':'')+'</div>';
 $('#m').onclick=()=>{S.n=Math.max(2,S.n-1);save();setup()};$('#p').onclick=()=>{S.n=Math.min(10,S.n+1);save();setup()};
 v.querySelectorAll('input').forEach(i=>i.oninput=()=>{S.names[+i.dataset.i]=i.value;save()});
 v.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{const c=b.dataset.c;if(S.cats.includes(c)){if(S.cats.length>3)S.cats=S.cats.filter(x=>x!==c)}else if(S.cats.length<10)S.cats.push(c);save();setup()});
 v.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{S.time=+b.dataset.t;save();setup()});$('#snd').onclick=()=>{S.sound=!S.sound;save();setup()};
 $('#go').onclick=()=>{S.letter=P.pickLetter(S.used);S.used=S.used.concat(S.letter).slice(-12);S.marks={};S.cats.forEach(c=>{S.marks[c]=Array(S.n).fill(0)});deadline=Date.now()+S.time*1000;ph='play';save();draw()};
 const r=$('#rs');if(r)r.onclick=()=>{S.tot=null;S.rounds=0;save();setup()}}
function play(){
 v.innerHTML='<div class="uc"><div class="card"><p>La lettre est</p><div class="word" id="lt">'+S.letter+'</div><p id="tm" class="timer"></p></div><p>Écrivez un mot par catégorie sur papier :</p><div class="themes">'+S.cats.map(c=>'<span class="cat">'+P.CATS[c]+'</span>').join('')+'</div><button id="stop" class="primary big">STOP, j&#39;ai fini</button></div>';
 let last=-1;const tick=()=>{const l=Math.max(0,Math.ceil((deadline-Date.now())/1000));const t=$('#tm');if(t)t.textContent=l+' s';if(l<=5&&l>0&&l!==last){beep(880,.06);last=l}if(l<=0){stop();beep(300,.5);try{if(S.sound&&navigator.vibrate)navigator.vibrate([200,100,200])}catch(e){}toScore()}};tick();timer=setInterval(tick,200);
 const l0=Date.now()+600;$('#stop').onclick=()=>{if(Date.now()<l0)return;stop();beep(300,.3);toScore()}}
function toScore(){ph='score';save();draw()}
function score(){const t=P.totals(S.n,S.marks);
 v.innerHTML='<div class="uc"><h2>Lettre '+S.letter+' · points</h2><p>Touche un nom : 0, 5 ou 10. 10 = unique, 5 = en double, 0 = rien ou faux.</p><div class="sc">'+S.cats.map(c=>'<div class="scrow"><b>'+P.CATS[c]+'</b><div class="plist">'+Array.from({length:S.n},(_,i)=>'<button data-c="'+c+'" data-i="'+i+'">'+esc(nm(i))+' <span>'+S.marks[c][i]+'</span></button>').join('')+'</div></div>').join('')+'</div><p class="tot">Manche : '+Array.from({length:S.n},(_,i)=>esc(nm(i))+' '+t[i]).join(' · ')+'</p><button id="done" class="primary big">Valider la manche</button></div>';
 v.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{const c=b.dataset.c,i=+b.dataset.i;S.marks[c][i]=P.nextPts(S.marks[c][i]);save();const y=v.scrollTop;score();v.scrollTop=y});
 $('#done').onclick=()=>{const t2=P.totals(S.n,S.marks);S.tot=(S.tot&&S.tot.length===S.n?S.tot:Array(S.n).fill(0)).map((x,i)=>x+t2[i]);S.rounds++;ph='total';save();draw()}}
function total(){const t=S.tot,w=P.leaders(t);
 v.innerHTML='<div class="uc"><div class="card"><p>Après '+S.rounds+' manche'+(S.rounds>1?'s':'')+'</p><div class="word">'+w.map(nm).map(esc).join(' et ')+' en tête</div><p>'+t.map((x,i)=>esc(nm(i))+' '+x).join(' · ')+'</p></div><button id="nx" class="primary big">Manche suivante</button></div>';
 $('#nx').onclick=()=>{ph='setup';draw()}}
draw();
})();
