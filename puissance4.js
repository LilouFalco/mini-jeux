'use strict';
const $=s=>document.querySelector(s),P=Puissance4,KEY='lilou-puissance4-v1',R=P.R,C=P.C;
let st={mode:'easy',b:P.empty(),turn:1,first:1,over:false,line:null,last:-1,sel:3,busy:false,scores:{easy:[0,0,0],hard:[0,0,0],two:[0,0,0]},n1:'Lilou',n2:'Lulu'};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&Array.isArray(s.b)&&s.b.length===R*C&&s.scores)st={...st,...s,busy:false}}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch{}};
const name=p=>st.mode==='two'?(p===1?st.n1:st.n2):(p===1?st.n1:'Ordi');
const SY={1:'♥',2:'✦'};
function render(){
 const cb=$('#colbtns');cb.innerHTML='';
 for(let c=0;c<C;c++){const x=document.createElement('button');x.textContent='▾';x.setAttribute('aria-label','Colonne '+(c+1));x.className=c===st.sel?'sel':'';x.disabled=st.over||st.busy||P.drop(st.b,c)<0;x.onclick=()=>{st.sel=c;play(c)};cb.appendChild(x)}
 const b=$('#board');b.innerHTML='';
 st.b.forEach((v,i)=>{const d=document.createElement('div');d.className='pcell'+(v?' p'+v:'')+(st.line?.includes(i)?' win':'')+(i===st.last?' last':'');d.setAttribute('role','gridcell');d.setAttribute('aria-label',v?SY[v]:'vide');d.textContent=v?SY[v]:'';b.appendChild(d)});
 document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mode===st.mode)));
 const s=st.scores[st.mode];$('#score').innerHTML='<span>'+esc(name(1))+' '+s[0]+'</span><span>'+esc(name(2))+' '+s[1]+'</span><span>nuls '+s[2]+'</span>';
 $('#n2').disabled=st.mode!=='two';
 $('#status').textContent=st.over?(st.line?name(st.b[st.line[0]])+' a gagné ! ✦':'Match nul !'):'À '+name(st.turn)+' de jouer '+SY[st.turn];
}
const esc=t=>t.replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
function put(c,p){const r=P.drop(st.b,c);if(r<0)return false;st.b[r*C+c]=p;st.last=r*C+c;const w=P.winner(st.b);if(w){st.over=true;st.line=w.line;st.scores[st.mode][p-1]++}else if(P.full(st.b)){st.over=true;st.scores[st.mode][2]++}else st.turn=p===1?2:1;return true}
function play(c){
 if(st.over||st.busy||(st.mode!=='two'&&st.turn===2))return;
 if(!put(c,st.turn))return;render();save();aiTurn();
}
function aiTurn(){if(st.mode==='two'||st.over||st.turn!==2)return;st.busy=true;render();setTimeout(()=>{const c=P.aiMove(st.b.slice(),2,st.mode);st.busy=false;if(c>=0&&!st.over)put(c,2);render();save()},st.mode==='hard'?250:400)}
function fresh(){st.first=st.first===1?2:1;st.b=P.empty();st.turn=st.first;st.over=false;st.line=null;st.last=-1;st.busy=false;render();save();aiTurn()}
document.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{st.mode=x.dataset.mode;st.first=2;fresh()});
$('#new').onclick=fresh;
$('#n1').value=st.n1;$('#n2').value=st.n2;
$('#n1').oninput=e=>{st.n1=e.target.value||'Lilou';render();save()};$('#n2').oninput=e=>{st.n2=e.target.value||'Lulu';render();save()};
document.addEventListener('keydown',e=>{if(/INPUT/.test(e.target.tagName))return;if(e.key==='ArrowLeft'){st.sel=(st.sel+C-1)%C;render()}else if(e.key==='ArrowRight'){st.sel=(st.sel+1)%C;render()}else if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){play(st.sel)}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
render();if(st.turn===2&&!st.over)aiTurn();
