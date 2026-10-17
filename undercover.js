'use strict';
(function(){
const U=window.Undercover,KEY='lilou-undercover-v1',$=s=>document.querySelector(s),v=$('#v');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S={n:4,names:['Lilou','Lulu','','','','','','','',''],themes:['general'],mw:false,scores:{}};
try{Object.assign(S,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){}
const q=new URLSearchParams(location.search).get('players');if(q&&+q>=3&&+q<=10)S.n=+q;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const nm=i=>(S.names[i]||'').trim()||'Joueur '+(i+1);
let G=null,ph='setup',idx=0,shown=false,sel=-1,res=null;
function setup(){const tk=Object.keys(U.THEMES);
 v.innerHTML='<div class="uc"><h2>Joueurs</h2><div class="row stepper"><button id="m" aria-label="Moins">−</button><b id="cnt">'+S.n+'</b><button id="p" aria-label="Plus">+</button><span>joueurs</span></div><div class="names">'+Array.from({length:S.n},(_,i)=>'<input aria-label="Prénom '+(i+1)+'" data-i="'+i+'" maxlength="12" placeholder="Joueur '+(i+1)+'" value="'+esc(S.names[i]||'')+'">').join('')+'</div><h2>Thèmes</h2><div class="themes">'+tk.map(k=>'<button data-t="'+k+'" aria-pressed="'+S.themes.includes(k)+'">'+U.THEMES[k].n+'</button>').join('')+'</div><div class="row"><button id="mw" aria-pressed="'+S.mw+'"'+(S.n<5?' disabled':'')+'>Mister White</button><span style="font-size:12px">'+(S.n<5?'dès 5 joueurs':'un joueur sans mot')+'</span></div><button id="go" class="primary big">Distribuer les mots</button><button id="rs">Remettre les scores à zéro</button></div>';
 $('#m').onclick=()=>{S.n=Math.max(3,S.n-1);save();setup()};$('#p').onclick=()=>{S.n=Math.min(10,S.n+1);save();setup()};
 v.querySelectorAll('input').forEach(i=>i.oninput=()=>{S.names[+i.dataset.i]=i.value;save()});
 v.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{const t=b.dataset.t,a=S.themes;if(a.includes(t)){if(a.length>1)S.themes=a.filter(x=>x!==t)}else a.push(t);save();setup()});
 $('#mw').onclick=()=>{S.mw=!S.mw;save();setup()};$('#rs').onclick=()=>{S.scores={};save();setup()};
 $('#go').onclick=()=>{G=U.deal(S.n,{mw:S.mw&&S.n>=5,themes:S.themes});idx=0;shown=false;ph='reveal';draw()}}
function reveal(){const w=G.words[idx];
 if(!shown)v.innerHTML='<div class="uc"><div class="card"><p>Passe le téléphone à</p><div class="word">'+esc(nm(idx))+'</div><p>Les autres ne regardent pas !</p></div><button id="see" class="primary big">Voir mon mot</button></div>';
 else v.innerHTML='<div class="uc"><div class="card"><p>'+esc(nm(idx))+', ton mot est</p><div class="word">'+(w?esc(w):'Aucun mot')+'</div><p>'+(w?'Retiens-le, puis cache l\'écran.':'Tu es Mister White. Écoute les autres et bluffe.')+'</p></div><button id="hide" class="primary big">'+(idx<S.n-1?'J\'ai vu, suivant':'J\'ai vu, on commence')+'</button></div>';
 if(!shown)$('#see').onclick=()=>{shown=true;draw()};else $('#hide').onclick=()=>{shown=false;idx++;if(idx>=S.n){ph='talk'}draw()}}
function talk(){const rc=U.roleCounts(S.n,S.mw&&S.n>=5);
 v.innerHTML='<div class="uc"><div class="card"><p>Tout le monde a son mot.</p><p>Il y a '+rc.u+' undercover'+(rc.w?' et 1 Mister White':'')+' parmi '+S.n+' joueurs.</p><p>Commence : <b>'+esc(nm(G.first))+'</b></p></div><p>Chacun décrit son mot en un mot ou une phrase, dans le sens des aiguilles d\'une montre.</p><button id="vote" class="primary big">Passer au vote</button></div>';
 $('#vote').onclick=()=>{ph='vote';sel=-1;draw()}}
function vote(){
 v.innerHTML='<div class="uc"><h2>Qui est éliminé ?</h2><div class="plist">'+G.roles.map((r,i)=>'<button data-i="'+i+'" '+(G.alive[i]?'':'disabled class="dead" ')+'aria-pressed="'+(sel===i)+'">'+esc(nm(i))+'</button>').join('')+'</div><button id="ok" class="primary big"'+(sel<0?' disabled':'')+'>Éliminer</button></div>';
 v.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{sel=+b.dataset.i;vote()});
 $('#ok').onclick=()=>{G.alive[sel]=false;if(G.roles[sel]==='white'){ph='guess'}else{ph='out'}draw()}}
function lab(r){return r==='civil'?'civil':r==='undercover'?'undercover':'Mister White'}
function out(){const r=G.roles[sel],st=U.status(G);
 v.innerHTML='<div class="uc"><div class="card"><p>'+esc(nm(sel))+' était</p><div class="word">'+lab(r)+'</div><p>'+(G.words[sel]?'Son mot : '+esc(G.words[sel]):'')+'</p></div><button id="nx" class="primary big">'+(st?'Voir le résultat':'Tour suivant')+'</button></div>';
 $('#nx').onclick=()=>{if(st)end(st);else{ph='talk2'; ph='talk';G.first=nextFirst();draw()}}}
function nextFirst(){const c=G.roles.map((r,i)=>G.alive[i]&&r!=='white'?i:-1).filter(i=>i>=0);return c.length?c[Math.floor(Math.random()*c.length)]:G.alive.indexOf(true)}
function guess(){
 v.innerHTML='<div class="uc"><div class="card"><p>'+esc(nm(sel))+' est Mister White !</p><p>Un dernier essai : quel est le mot des civils ?</p></div><input id="gs" aria-label="Mot des civils" maxlength="30" autocomplete="off"><button id="gok" class="primary big">Valider</button></div>';
 $('#gok').onclick=()=>{const ok=U.guessOk(G,$('#gs').value);end(ok?'white':U.status(G)||'continue',ok,$('#gs').value)}}
function end(st,wg,txt){if(st==='continue'){ph='talk';G.first=nextFirst();draw();return}
 const win=r=>st==='civils'?r==='civil':st==='impostors'?r!=='civil':r==='white';
 G.roles.forEach((r,i)=>{if(win(r)){const k=nm(i);S.scores[k]=(S.scores[k]||0)+U.PTS[r]}});save();res={st,wg,txt};ph='end';draw()}
function endv(){const t=res.st==='civils'?'Les civils gagnent !':res.st==='impostors'?'Les intrus gagnent !':'Mister White a deviné le mot !';
 const sc=Object.entries(S.scores).sort((a,b)=>b[1]-a[1]);
 v.innerHTML='<div class="uc"><div class="card"><h2>'+t+'</h2><p>Mot des civils : <b>'+esc(G.pair[0])+'</b><br>Mot de l\'undercover : <b>'+esc(G.pair[1])+'</b></p><p>'+G.roles.map((r,i)=>esc(nm(i))+' ('+lab(r)+')').join(', ')+'</p></div><div class="card"><h2>Scores</h2><p>'+(sc.map(x=>esc(x[0])+' '+x[1]).join(' · ')||'—')+'</p></div><button id="again" class="primary big">Nouvelle partie</button><button id="menu">Changer les réglages</button></div>';
 $('#again').onclick=()=>{G=U.deal(S.n,{mw:S.mw&&S.n>=5,themes:S.themes});idx=0;shown=false;ph='reveal';draw()};$('#menu').onclick=()=>{ph='setup';draw()}}
function draw(){({setup,reveal,talk,vote,out,guess,end:endv})[ph]();}
draw();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
