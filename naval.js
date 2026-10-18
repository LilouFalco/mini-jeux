'use strict';
const $=s=>document.querySelector(s),V=Naval,N=V.N,KEY='lilou-naval-v1';
const esc=t=>t.replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
let S={mode:'easy',n1:'Joueur 1',n2:'Joueur 2',phase:'setup',ships:[[],[]],shots:[Array(100).fill(0),Array(100).fill(0)],turn:0,placer:0,manual:false,msg:'',winner:-1,cover:null};
let ui={sel:0,h:true,hover:-1};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.ships&&s.shots&&s.phase)S={...S,...s}}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch{}};
const two=()=>S.mode==='two';
const nm=p=>p===0?S.n1:(two()?S.n2:'Ordi');
function newPlace(manual){S.ships=[[],[]];S.shots=[Array(100).fill(0),Array(100).fill(0)];S.turn=0;S.placer=0;S.winner=-1;S.manual=manual;S.phase='place';S.msg='';ui.sel=0;ui.h=true;
 if(!manual){S.ships[0]=V.randomFleet();} if(!two())S.ships[1]=V.randomFleet();
 if(two()&&!manual)S.ships[1]=V.randomFleet();
 S.cover=two()?{text:'Passe le téléphone à '+S.n1+' pour placer ses bateaux, puis touche « Prêt·e ».',next:'place'}:null;
 if(!two())S.cover=null;render();save()}
function gridHTML(el,ships,shots,show,clickable,preview){
 el.innerHTML='';el.style.setProperty('--n',N);
 for(let i=0;i<N*N;i++){const b=document.createElement('button');const ship=ships.some(s=>s.cells.includes(i));const sh=shots?shots[i]:0;
  let cls='nc';if(show&&ship)cls+=' ship';if(sh===1)cls+=' miss';if(sh===2)cls+=' hit';if(preview&&preview.cells.includes(i))cls+=preview.ok?' prev':' bad';
  b.className=cls;b.setAttribute('role','gridcell');b.setAttribute('aria-label','Case '+String.fromCharCode(65+i%N)+(Math.floor(i/N)+1)+(sh===2?' touché':sh===1?' à l\'eau':''));
  b.textContent=sh===2?'●':sh===1?'○':'';b.disabled=!clickable||(shots&&!!sh&&!preview);
  if(clickable){b.onclick=()=>clickable(i);b.onpointerenter=()=>{if(preview!==undefined){ui.hover=i;updatePreview()}}}
  el.appendChild(b)}}
function curShips(){return S.ships[S.placer]}
function previewFor(i){if(ui.sel>=V.FLEET.length||ui.sel>=0&&curShips().length>=V.FLEET.length)return null;const len=V.FLEET[curShips().length];const r=Math.floor(i/N),c=i%N;let h=ui.h;let rr=r,cc=c;if(h&&cc+len>N)cc=N-len;if(!h&&rr+len>N)rr=N-len;return{len,r:rr,c:cc,h,cells:V.cellsOf(rr,cc,len,h),ok:V.canPlace(curShips(),rr,cc,len,h)}}
function updatePreview(){if(S.phase!=='place'||!S.manual||S.cover||curShips().length>=V.FLEET.length)return;const p=ui.hover>=0?previewFor(ui.hover):null;document.querySelectorAll('#g-main .nc').forEach((b,i)=>{b.classList.remove('prev','bad');if(p&&p.cells.includes(i))b.classList.add(p.ok?'prev':'bad')})}
function drawPlace(p){gridHTML($('#g-main'),curShips(),null,true,i=>place(i),p||{cells:[],ok:true})}
function place(i){const p=previewFor(i);if(!p||!p.ok){S.msg='Là, ça ne rentre pas.';return render()}curShips().push({len:p.len,cells:p.cells});S.msg='';ui.hover=-1;render();save()}
function render(){
 $('#setup').hidden=S.phase!=='setup';$('#stage').hidden=S.phase==='setup'||!!S.cover;$('#cover').hidden=!S.cover;
 document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.mode===S.mode)));
 $('#n2').disabled=S.mode!=='two';
 if(S.cover){$('#cover-text').textContent=S.cover.text;return}
 if(S.phase==='setup')return;
 $('#again').hidden=S.phase!=='over';$('#status').textContent=S.msg;
 if(S.phase==='place'){
  $('#side').hidden=true;$('#place-tools').hidden=false;$('#gl-main').textContent='Flotte de '+nm(S.placer);
  const n=curShips().length;$('#title').textContent=S.manual?(n<5?nm(S.placer)+' place son bateau de '+V.FLEET[n]+' cases':'Flotte prête, valide quand tu es contente.'):nm(S.placer)+' : voici ta flotte.';
  $('#fleet').innerHTML=V.FLEET.map((l,k)=>'<span class="'+(k<n?'done':k===n?'cur':'')+'">'+'■'.repeat(l)+'</span>').join('');
  $('#rot').hidden=!S.manual;$('#undo').hidden=!S.manual;$('#undo').disabled=n===0;$('#ok').disabled=n<5;
  if(S.manual&&n<5)drawPlace(null);else gridHTML($('#g-main'),curShips(),null,true,null);
 }else{
  const me=S.turn,en=1-me;$('#place-tools').hidden=true;$('#side').hidden=false;
  const over=S.phase==='over';
  $('#title').textContent=over?nm(S.winner)+' a gagné ! ✦':nm(me)+' tire sur la flotte de '+nm(en);
  $('#gl-main').textContent='Flotte de '+nm(en);
  gridHTML($('#g-main'),S.ships[en],S.shots[me],over,over?null:i=>fire(i));
  gridHTML($('#g-own'),S.ships[me],S.shots[en],true,null);
  const left=S.ships[en].filter(s=>!s.cells.every(x=>S.shots[me][x]===2)).length;
  if(!over&&!S.msg)$('#status').textContent='Bateaux restants à l\'adversaire : '+left;
 }}
function fire(i){
 if(S.phase!=='play'||S.cover||(!two()&&S.turn===1))return;const me=S.turn,en=1-me;
 const r=V.shoot(S.ships[en],S.shots[me],i);if(!r)return;
 S.msg=r.sunk?'Coulé ! Un bateau de '+r.ship.len+' cases.':r.hit?'Touché !':'À l\'eau.';
 if(V.allSunk(S.ships[en],S.shots[me])){S.phase='over';S.winner=me;render();save();return}
 if(r.hit){S.msg+=' Rejoue.';render();save();return}
 if(two()){S.turn=en;S.cover={text:S.msg+' Passe le téléphone à '+nm(en)+', puis touche « Prêt·e ».',next:'play'};render();save()}
 else{S.turn=1;render();save();setTimeout(aiTurn,650)}}
function aiTurn(){if(S.phase!=='play'||S.turn!==1||two())return;const i=V.aiShot(S.shots[1],S.ships[0],S.mode);const r=V.shoot(S.ships[0],S.shots[1],i);
 S.msg='L\'ordi tire en '+String.fromCharCode(65+i%N)+(Math.floor(i/N)+1)+' : '+(r.sunk?'coulé ! (bateau de '+r.ship.len+')':r.hit?'touché.':'à l\'eau.');
 if(V.allSunk(S.ships[0],S.shots[1])){S.phase='over';S.winner=1;render();save();return}
 if(r.hit){render();save();setTimeout(aiTurn,650);return}
 S.turn=0;render();save()}
$('#cover-btn').onclick=()=>{const nx=S.cover.next;S.cover=null;if(nx==='place'&&S.placer===1&&S.phase==='place'){}render();save()};
$('#rot').onclick=()=>{ui.h=!ui.h;updatePreview();if(ui.hover<0)render()};
$('#undo').onclick=()=>{curShips().pop();S.msg='';render();save()};
$('#rand').onclick=()=>{S.ships[S.placer]=V.randomFleet();S.manual=true;render();save()};
$('#ok').onclick=()=>{if(two()&&S.placer===0){S.placer=1;ui.sel=0;S.msg='';S.cover={text:'Flotte validée. Passe le téléphone à '+S.n2+' pour placer ses bateaux, puis touche « Prêt·e ».',next:'place'};if(!S.manual)S.ships[1]=V.randomFleet();render();save();return}
 S.phase='play';S.turn=0;S.msg='';if(two()){S.cover={text:'Les deux flottes sont cachées. Passe le téléphone à '+S.n1+' pour commencer, puis touche « Prêt·e ».',next:'play'}}render();save()};
$('#again').onclick=()=>{S.phase='setup';S.cover=null;render();save()};
$('#start-auto').onclick=()=>{newPlace(false)};$('#start-manual').onclick=()=>{newPlace(true)};
document.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{S.mode=x.dataset.mode;render();save()});
$('#n1').value=S.n1;$('#n2').value=S.n2;
$('#n1').oninput=e=>{S.n1=e.target.value.trim()||'Joueur 1';save()};$('#n2').oninput=e=>{S.n2=e.target.value.trim()||'Joueur 2';save()};
document.addEventListener('keydown',e=>{if((e.key==='r'||e.key==='R')&&S.phase==='place'&&S.manual&&!/INPUT/.test(e.target.tagName))$('#rot').click()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
render();if(S.phase==='play'&&!two()&&S.turn===1)setTimeout(aiTurn,650);
;(function(){const q=new URLSearchParams(location.search).get('mode');if(q!=='solo'&&q!=='duo')return;const want=q==='duo'?'two':(S.mode==='two'?'easy':S.mode);if(S.mode!==want&&S.phase==='setup'){S.mode=want;render()}})();
