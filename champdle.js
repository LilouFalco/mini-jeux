'use strict';
(function(){const C=window.Champdle,$=s=>document.querySelector(s),v=$('#v'),KEY='lilou-champdle-v1';
const esc=t=>String(t).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const FR={Female:'Femme',Male:'Homme',Other:'Autre',Melee:'Mêlée',Ranged:'Distance',Top:'Top',Jungle:'Jungle',Middle:'Mid',Bottom:'Bot',Support:'Supp'};
const t=x=>(Array.isArray(x)?x:[x]).map(a=>FR[a]||a).join(', ');
let S={mode:'daily',daily:{},free:{target:null,guesses:[],done:false},stats:{played:0,won:0,streak:0,last:''}};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.daily)S={...S,...s}}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const dk=()=>C.dayKey();
function game(){if(S.mode==='daily'){const k=dk();if(!S.daily[k])S.daily={[k]:{guesses:[],done:false,won:false}};return S.daily[k]}
 if(!S.free.target){S.free={target:C.random().id,guesses:[],done:false,won:false};save()}return S.free}
const target=()=>S.mode==='daily'?C.daily(dk()):C.byId(S.free.target);
function finish(g,won){g.done=true;g.won=won;if(S.mode==='daily'){S.stats.played++;if(won){S.stats.won++;S.stats.streak=(S.stats.last===prevDay()?S.stats.streak:0)+1}else S.stats.streak=0;S.stats.last=dk()}save()}
function prevDay(){const d=new Date();d.setDate(d.getDate()-1);return C.dayKey(d)}
const HEAD=['Champion','Genre','Rôle','Espèce','Ressource','Portée','Région','Année'];
function row(id){const g=C.byId(id),r=C.cmp(g,target());const cell=(a,txt)=>'<div class="cd c-'+r[a]+'" data-a="'+a+'"><span>'+esc(txt)+'</span></div>';
 const yr=g.year+(r.year==='up'?' ▲':r.year==='down'?' ▼':'');
 return '<div class="cr"><div class="cd cp"><img src="lol/'+g.id+'.webp" alt="" width="96" height="96" draggable="false"><span>'+esc(g.name)+'</span></div>'+cell('gender',t(g.gender))+cell('positions',t(g.positions))+cell('species',t(g.species))+cell('resource',t(g.resource))+cell('range',t(g.range))+cell('regions',t(g.regions))+cell('year',yr)+'</div>'}
function draw(){const g=game(),tg=target();const done=g.done;
 v.innerHTML='<div class="cdl"><div class="levels" role="group" aria-label="Mode"><button data-m="daily" aria-pressed="'+(S.mode==='daily')+'">Du jour</button><button data-m="free" aria-pressed="'+(S.mode==='free')+'">Illimité</button></div>'
 +(done?'<div class="cdone" role="status"><b>'+(g.won?'Trouvé en '+g.guesses.length+' !':'C\'était '+esc(tg.name))+'</b><button id="next" class="primary">'+(S.mode==='daily'?'Revenir demain':'Nouvelle partie')+'</button></div>'
 :'<div class="cin"><input id="q" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nom du champion…" aria-label="Nom du champion" enterkeyhint="go"><button id="go" class="primary">OK</button><div id="sg" class="sg" role="listbox" hidden></div></div>')
 +'<div class="ct"><div class="ch">'+HEAD.map(h=>'<span>'+h+'</span>').join('')+'</div><div class="cl" id="cl">'+(g.guesses.length?g.guesses.slice().reverse().map(row).join(''):'<p class="hint">'+(S.mode==='daily'?'Champion du '+dk()+' : à toi de jouer.':'Un champion est tiré au hasard.')+'</p>')+'</div></div>'
 +'<p class="hint cstat">'+(S.mode==='daily'?'Série '+S.stats.streak+' · '+S.stats.won+'/'+S.stats.played+' gagnées · ':'')+g.guesses.length+' essai'+(g.guesses.length>1?'s':'')+(done||g.guesses.length<1?'':' · <button id="giveup" class="link">Abandonner</button>')+'</p></div>';
 document.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{S.mode=b.dataset.m;save();draw()});
 if(done){$('#next').onclick=()=>{if(S.mode==='free'){S.free={target:null,guesses:[],done:false};save();draw()}else $('#next').blur()};if(S.mode==='daily')$('#next').disabled=true;}
 else{const q=$('#q'),sg=$('#sg');let list=[],hi=0;
  const show=()=>{list=C.search(q.value,g.guesses).slice(0,6);hi=0;sg.hidden=!list.length;sg.innerHTML=list.map((c,i)=>'<button type="button" role="option" class="so" data-id="'+c.id+'" aria-selected="'+(i===0)+'"><img src="lol/'+c.id+'.webp" alt="" width="28" height="28">'+esc(c.name)+'</button>').join('');sg.querySelectorAll('.so').forEach(b=>b.onpointerdown=e=>{e.preventDefault();submit(b.dataset.id)})};
  const submit=id=>{id=id||(list[hi]&&list[hi].id);if(!id||g.guesses.includes(id))return;g.guesses.push(id);const win=id===tg.id;if(win)finish(g,true);else save();draw();if(!win){const n=$('#q');n&&n.focus({preventScroll:true})}};
  q.oninput=show;q.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit()}else if(e.key==='ArrowDown'&&list.length){hi=(hi+1)%list.length;sg.querySelectorAll('.so').forEach((b,i)=>b.setAttribute('aria-selected',i===hi))}else if(e.key==='ArrowUp'&&list.length){hi=(hi+list.length-1)%list.length;sg.querySelectorAll('.so').forEach((b,i)=>b.setAttribute('aria-selected',i===hi))}else if(e.key==='Escape')sg.hidden=true};
  $('#go').onclick=()=>submit();const gu=$('#giveup');if(gu)gu.onclick=()=>finish(g,false)||draw();}}
draw();
})();
