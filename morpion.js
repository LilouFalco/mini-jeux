'use strict';
const $=s=>document.querySelector(s),M=Morpion,KEY='lilou-morpion-v1',SY={1:'♥',2:'✦'};
let st={mode:'easy',b:Array(9).fill(0),turn:1,first:1,over:false,line:null,scores:{easy:[0,0,0],hard:[0,0,0],two:[0,0,0]},n1:'Lilou',n2:'Lulu'};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&Array.isArray(s.b)&&s.b.length===9&&s.scores)st={...st,...s}}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch{}};
const name=p=>st.mode==='two'?(p===1?st.n1:st.n2):(p===1?st.n1:'Ordi');
function render(){
 const b=$('#board');b.innerHTML='';
 st.b.forEach((v,i)=>{const c=document.createElement('button');c.className='mcell'+(v?' p'+v:'')+(st.line?.includes(i)?' win':'');c.textContent=v?SY[v]:'';c.setAttribute('role','gridcell');c.setAttribute('aria-label','Case '+(i+1)+(v?' '+SY[v]:' vide'));c.disabled=!!v||st.over;c.onclick=()=>play(i);b.appendChild(c)});
 document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mode===st.mode)));
 const s=st.scores[st.mode];$('#score').textContent=name(1)+' '+s[0]+' · nuls '+s[2]+' · '+name(2)+' '+s[1];
 $('#n2').disabled=st.mode!=='two';
 $('#status').textContent=st.over?(st.line?name(st.b[st.line[0]])+' a gagné ! ✦':'Match nul, bien joué toutes les deux.'):'À '+name(st.turn)+' de jouer '+SY[st.turn];
}
function play(i){
 if(st.over||st.b[i])return;
 st.b[i]=st.turn;end();
 if(!st.over){st.turn=st.turn===1?2:1;render();save();if(st.mode!=='two'&&st.turn===2){document.querySelectorAll('.mcell').forEach(c=>c.disabled=true);setTimeout(()=>{if(!st.over&&st.turn===2){const m=M.aiMove(st.b,2,st.mode);if(m>=0){st.b[m]=2;end();if(!st.over)st.turn=1;render();save()}}},350)}}
}
function end(){const w=M.winner(st.b);if(w){st.over=true;st.line=w.line;st.scores[st.mode][w.p-1]++}else if(M.full(st.b)){st.over=true;st.scores[st.mode][2]++}render();save()}
function fresh(){st.first=st.first===1?2:1;st.b=Array(9).fill(0);st.turn=st.first;st.over=false;st.line=null;render();save();if(st.mode!=='two'&&st.turn===2){const m=M.aiMove(st.b,2,st.mode);st.b[m]=2;st.turn=1;render();save()}}
document.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{st.mode=x.dataset.mode;st.first=2;fresh()});
$('#new').onclick=fresh;
$('#n1').value=st.n1;$('#n2').value=st.n2;
$('#n1').oninput=e=>{st.n1=e.target.value||'Lilou';render();save()};$('#n2').oninput=e=>{st.n2=e.target.value||'Lulu';render();save()};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
render();
