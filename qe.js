'use strict';
(function(){const Q=window.QE,$=s=>document.querySelector(s),v=$('#v'),KEY='lilou-quiestce-v1';
const esc=t=>String(t).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
let S={n1:'Lilou',n2:'Lulu',phase:'setup',p:0,next:'pick',champs:[],secret:[-1,-1],sel:-1,elim:[[],[]],w:[0,0],winner:-1,show:false};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.phase)S={...S,...s}}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
let lockUntil=0;const locked=()=>Date.now()<lockUntil;
const nm=p=>(p===0?S.n1:S.n2)||(p===0?'Joueur 1':'Joueur 2');
const img=i=>'<img src="lol/'+S.champs[i]+'.webp" alt="" width="96" height="96" draggable="false">';
function cell(i,cls){return '<button type="button" class="qc '+(cls||'')+'" data-i="'+i+'" aria-label="'+esc(Q.name(S.champs[i]))+(cls&&cls.includes('x')?' (éliminé)':'')+'">'+img(i)+'<span>'+esc(Q.name(S.champs[i]))+'</span></button>'}
function go(phase,extra){Object.assign(S,extra||{});S.phase=phase;S.show=false;lockUntil=Date.now()+500;save();draw()}
function cover(p,next){go('cover',{p,next,sel:-1})}
function setup(){v.innerHTML='<div class="qe"><div class="names"><label>Joueuse ♥ <input id="n1" maxlength="12" value="'+esc(S.n1)+'"></label><label>Joueur ✦ <input id="n2" maxlength="12" value="'+esc(S.n2)+'"></label></div><p class="hint">24 champions au hasard, les mêmes pour vous deux. Chacun choisit un secret, puis vous posez des questions à voix haute et barrez les champions éliminés sur votre propre grille.</p><p id="score" class="hint">'+esc(S.n1)+' '+S.w[0]+' - '+S.w[1]+' '+esc(S.n2)+'</p><button id="go" class="primary big">Nouvelle partie</button></div>';
 $('#n1').oninput=e=>{S.n1=e.target.value.slice(0,12);save()};$('#n2').oninput=e=>{S.n2=e.target.value.slice(0,12);save()};
 $('#go').onclick=()=>{S.champs=Q.pick(Q.N);S.secret=[-1,-1];S.elim=[Array(Q.N).fill(false),Array(Q.N).fill(false)];S.winner=-1;cover(0,'pick')}}
function coverv(){const msg=S.next==='pick'?'Choisis ton champion secret.':'À toi de jouer.';
 v.innerHTML='<div class="qe cover"><div class="card"><p>Passe le téléphone à</p><div class="word">'+esc(nm(S.p))+'</div><p>L\'autre ne regarde pas ! '+msg+'</p></div><button id="ok" class="primary big">C\'est moi</button></div>';
 const b=$('#ok');b.disabled=locked();if(b.disabled)setTimeout(()=>{if(b.isConnected)b.disabled=false},lockUntil-Date.now()+20);
 b.onclick=()=>{if(locked()||S.phase!=='cover')return;go(S.next)}}
function pickv(){v.innerHTML='<div class="qe"><p class="stage-title">'+esc(nm(S.p))+', touche ton champion secret</p><div id="qg" class="qg">'+S.champs.map((c,i)=>cell(i,i===S.sel?'sel':'')).join('')+'</div><div class="qbar"><button id="conf" class="primary" '+(S.sel<0?'disabled':'')+'>Ce sera lui · cacher</button></div></div>';
 document.querySelectorAll('.qc').forEach(b=>b.onclick=()=>{S.sel=+b.dataset.i;save();draw()});
 $('#conf').onclick=()=>{if(S.sel<0)return;S.secret[S.p]=S.sel;if(S.p===0)cover(1,'pick');else cover(0,'play')}}
function left(p){return S.elim[p].filter(x=>!x).length}
function playv(){const p=S.p;v.innerHTML='<div class="qe"><p class="stage-title">'+esc(nm(p))+' · il reste '+left(p)+' champions</p><div id="qg" class="qg">'+S.champs.map((c,i)=>cell(i,S.elim[p][i]?'x':'')).join('')+'</div><div class="qbar"><button id="me">'+(S.show?'Cacher mon secret':'Voir mon secret')+'</button><button id="guess">Je devine</button><button id="end" class="primary">Fin du tour</button></div>'+(S.show?'<div class="secret" role="status">Ton secret : <b>'+esc(Q.name(S.champs[S.secret[p]]))+'</b></div>':'')+'</div>';
 document.querySelectorAll('.qc').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;S.elim[p][i]=!S.elim[p][i];save();draw()});
 $('#me').onclick=()=>{S.show=!S.show;draw()};$('#guess').onclick=()=>{go('guess',{sel:-1})};
 $('#end').onclick=()=>{cover(1-p,'play')}}
function guessv(){const p=S.p,idx=S.champs.map((c,i)=>i).filter(i=>!S.elim[p][i]);
 v.innerHTML='<div class="qe"><p class="stage-title">'+esc(nm(p))+', c\'est lequel ?</p><div id="qg" class="qg">'+S.champs.map((c,i)=>idx.includes(i)?cell(i,i===S.sel?'sel':''):'<span class="qc gone"></span>').join('')+'</div><div class="qbar"><button id="back">Retour</button><button id="conf" class="primary" '+(S.sel<0?'disabled':'')+'>C\'est lui !</button></div></div>';
 document.querySelectorAll('button.qc').forEach(b=>b.onclick=()=>{S.sel=+b.dataset.i;save();draw()});
 $('#back').onclick=()=>go('play');
 $('#conf').onclick=()=>{if(S.sel<0)return;const w=Q.judge(S.champs,S.secret,p,S.sel);S.w[w]++;go('end',{winner:w,p})}}
function endv(){const p=S.p,w=S.winner;const tile=i=>'<div class="qc big">'+img(i)+'<span>'+esc(Q.name(S.champs[i]))+'</span></div>';
 v.innerHTML='<div class="qe end"><h2>'+(w===p?'Bien deviné !':'Raté !')+'</h2><p>'+esc(nm(w))+' gagne la manche.</p><div class="reveal"><div><small>'+esc(nm(0))+'</small>'+tile(S.secret[0])+'</div><div><small>'+esc(nm(1))+'</small>'+tile(S.secret[1])+'</div></div><p class="hint">'+esc(S.n1)+' '+S.w[0]+' - '+S.w[1]+' '+esc(S.n2)+'</p><button id="again" class="primary big">Nouvelle partie</button></div>';
 $('#again').onclick=()=>{S.phase='setup';save();draw()}}
function draw(){({setup,cover:coverv,pick:pickv,play:playv,guess:guessv,end:endv})[S.phase]();}
function hideSecret(){if(['pick','play','guess'].includes(S.phase)){cover(S.p,S.phase==='pick'?'pick':'play')}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)hideSecret()});addEventListener('pagehide',hideSecret);addEventListener('blur',hideSecret);
if(!['setup','cover','pick','play','guess','end'].includes(S.phase)||(S.phase!=='setup'&&S.champs.length!==Q.N))S.phase='setup';
if(['pick','play','guess'].includes(S.phase)){S.next=S.phase==='pick'?'pick':'play';S.phase='cover'}
draw();
})();
