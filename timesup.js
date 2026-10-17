'use strict';
(function(){
const U=window.TimesUp,KEY='lilou-timesup-v1',$=s=>document.querySelector(s),v=$('#v');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S={n:4,names:['Lilou','Lulu','','','','','','','','','',''],themes:['general'],count:30,sound:true,G:null,wins:[0,0]};
try{Object.assign(S,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const nm=i=>(S.names[i]||'').trim()||'Joueur '+(i+1);
const TN=['Équipe rose','Équipe crème'];
const RULES=['Fais deviner avec des phrases. Pas le mot, ni un mot de la même famille.','Un seul mot par carte. Tu peux le répéter.','Mime seulement. Aucun son, aucun mot.'];
let ph='setup',lock=0,left=30,turnFound=0,deadline=0,timer=null,cur=-1,ctx=null;
const G=()=>S.G;
function beep(f,d){if(!S.sound)return;try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=f;g.gain.value=.15;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+d)}catch(e){}}
function buzz(p){try{S.sound&&navigator.vibrate&&navigator.vibrate(p)}catch(e){}}
function stop(){if(timer){clearInterval(timer);timer=null}}
function draw(){stop();({setup,ready,play,after,roundend,final}[ph])()}
function setup(){const tk=Object.keys(U.THEMES),g=G();const avail=U.cards(S.themes,999).length;if(S.count>avail){S.count=[40,30,20].find(n=>n<=avail)||20;save()}
 v.innerHTML='<div class="uc"><h2>Joueurs</h2><div class="row stepper"><button id="m" aria-label="Moins">−</button><b id="cnt">'+S.n+'</b><button id="p" aria-label="Plus">+</button><span>joueurs</span></div><div class="names">'+Array.from({length:S.n},(_,i)=>'<input aria-label="Prénom '+(i+1)+'" data-i="'+i+'" maxlength="12" placeholder="Joueur '+(i+1)+'" value="'+esc(S.names[i]||'')+'">').join('')+'</div><h2>Thèmes</h2><div class="themes">'+tk.map(k=>'<button data-t="'+k+'" aria-pressed="'+S.themes.includes(k)+'">'+U.THEMES[k].n+'</button>').join('')+'</div><div class="row"><span>Cartes</span><button id="c1" aria-pressed="'+(S.count===20)+'"'+(20>avail&&20>20?' disabled':'')+'>20</button><button id="c2" aria-pressed="'+(S.count===30)+'"'+(30>avail&&30>20?' disabled':'')+'>30</button><button id="c3" aria-pressed="'+(S.count===40)+'"'+(40>avail&&40>20?' disabled':'')+'>40</button><button id="snd" aria-pressed="'+S.sound+'">Son</button></div><p class="note">'+avail+' cartes avec ces thèmes'+(avail<40?' (40 demande au moins 40)':'')+'</p><button id="go" class="primary big">Nouvelle partie</button>'+(g&&g.round<3?'<button id="resume" class="big">Reprendre la partie</button>':'')+'<p>Victoires : rose '+S.wins[0]+' · crème '+S.wins[1]+'</p></div>';
 $('#m').onclick=()=>{S.n=Math.max(4,S.n-1);save();setup()};$('#p').onclick=()=>{S.n=Math.min(12,S.n+1);save();setup()};
 v.querySelectorAll('input').forEach(i=>i.oninput=()=>{S.names[+i.dataset.i]=i.value;save()});
 v.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const t=b.dataset.t,a=S.themes;if(a.includes(t)){if(a.length>1)S.themes=a.filter(x=>x!==t)}else a.push(t);save();setup()});
 [20,30,40].forEach((n,i)=>$('#c'+(i+1)).onclick=()=>{S.count=n;save();setup()});$('#snd').onclick=()=>{S.sound=!S.sound;save();setup()};
 $('#go').onclick=()=>{S.pause=null;S.G=U.make(S.n,S.themes,S.count);save();lock=Date.now()+500;ph='ready';draw()};
 const r=$('#resume');if(r)r.onclick=()=>{lock=Date.now()+500;ph='ready';draw()}}
function board(g){return '<p class="score">Rose '+U.total(g,0)+' · Crème '+U.total(g,1)+' · '+g.pile.length+' carte'+(g.pile.length>1?'s':'')+' restante'+(g.pile.length>1?'s':'')+'</p>'}
function ready(){const g=G(),d=U.describer(g);
 v.innerHTML='<div class="uc"><div class="card"><p>Manche '+(g.round+1)+' sur 3</p><p>'+RULES[g.round]+'</p><p>Passe le téléphone à</p><div class="word">'+esc(nm(d))+'</div><p>'+TN[g.team]+' · les autres équipiers devinent.</p></div>'+board(g)+'<button id="st" class="primary big">'+(S.pause?'Reprendre ('+Math.ceil(S.pause.rem/1000)+' s, '+S.pause.found+' trouvée'+(S.pause.found>1?'s':'')+')':'Commencer (30 s)')+'</button><button id="home" class="big">Réglages</button></div>';
 const b=$('#st');b.disabled=lock>Date.now();if(b.disabled)setTimeout(()=>{if(b.isConnected)b.disabled=false},lock-Date.now()+20);
 b.onclick=()=>{if(Date.now()<lock)return;if(S.pause){turnFound=S.pause.found;deadline=Date.now()+S.pause.rem;S.pause=null;save()}else{turnFound=0;deadline=Date.now()+30000}ph='play';beep(660,.1);draw()};$('#home').onclick=()=>{ph='setup';draw()}}
function play(){const g=G(),c=U.top(g);if(c<0){endRound();return}
 v.innerHTML='<div class="uc"><div class="card"><p id="tm" class="timer"></p><div class="word" id="cd">'+esc(g.cards[c])+'</div><p>'+esc(nm(U.describer(g)))+' · '+RULES[g.round].split('.')[0]+'.</p></div><div class="row"><button id="ok" class="primary big">Trouvé</button><button id="pass" class="big">Passer</button></div>'+board(g)+'</div>';
 let last=-1;const tick=()=>{left=Math.max(0,Math.ceil((deadline-Date.now())/1000));const t=$('#tm');if(t)t.textContent=left+' s';if(left<=5&&left>0&&left!==last){beep(880,.06);last=left}if(left<=0){stop();beep(300,.5);buzz([200,100,200]);turnEnd()}};tick();timer=setInterval(tick,200);
 let l=Date.now()+250;$('#ok').onclick=()=>{if(Date.now()<l)return;l=Date.now()+250;U.found(g);turnFound++;save();buzz(30);if(U.roundDone(g)){endRound()}else draw()};
 $('#pass').onclick=()=>{if(Date.now()<l)return;l=Date.now()+250;U.pass(g);save();draw()}}
function turnEnd(){const g=G();S.pause=null;save();ph='after';lock=Date.now()+600;draw()}
function after(){const g=G();
 v.innerHTML='<div class="uc"><div class="card"><p>Temps écoulé !</p><div class="word">'+turnFound+' trouvée'+(turnFound>1?'s':'')+'</div><p>Pour '+TN[g.team]+'</p></div>'+board(g)+'<button id="nx" class="primary big">Équipe suivante</button></div>';
 const b=$('#nx');b.disabled=lock>Date.now();if(b.disabled)setTimeout(()=>{if(b.isConnected)b.disabled=false},lock-Date.now()+20);b.onclick=()=>{if(Date.now()<lock)return;U.endTurn(g);save();lock=Date.now()+500;ph='ready';draw()}}
function endRound(){const g=G();S.pause=null;U.endTurn(g);ph='roundend';save();draw()}
function roundend(){const g=G(),last=g.round>=2;
 v.innerHTML='<div class="uc"><div class="card"><p>Manche '+(g.round+1)+' terminée</p><div class="word">Rose '+g.scores[0][g.round]+' · Crème '+g.scores[1][g.round]+'</div><p>Total : rose '+U.total(g,0)+' · crème '+U.total(g,1)+'</p></div><button id="nx" class="primary big">'+(last?'Voir le résultat':'Manche '+(g.round+2))+'</button></div>';
 $('#nx').onclick=()=>{if(last){const w=U.winner(g);if(w>=0)S.wins[w]++;g.round=3;ph='final'}else{U.nextRound(g);lock=Date.now()+500;ph='ready'}save();draw()}}
function final(){const g=G(),w=U.winner(g);
 v.innerHTML='<div class="uc"><div class="card"><p>Fin de partie</p><div class="word">'+(w<0?'Égalité !':TN[w]+' gagne !')+'</div><p>Rose '+U.total(g,0)+' ('+g.scores[0].join(' / ')+') · Crème '+U.total(g,1)+' ('+g.scores[1].join(' / ')+')</p></div><button id="again" class="primary big">Rejouer</button></div>';
 $('#again').onclick=()=>{ph='setup';draw()}}
function cover(){if(ph==='play'){S.pause={rem:Math.max(1,deadline-Date.now()),found:turnFound};save();ph='ready';lock=Date.now()+600;draw()}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)cover()});addEventListener('pagehide',cover);addEventListener('blur',cover);
if(G()&&G().round>=3)S.G=null;draw();
window.__tu={S:()=>S,ph:()=>ph};
})();
