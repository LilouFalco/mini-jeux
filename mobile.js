'use strict';
(function(){
const G=[
 {id:'yakazu',n:'Yakazu',h:'./',c:'logique',i:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'},
 {id:'sudoku',n:'Sudoku',h:'sudoku.html',c:'logique',i:'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18'},
 {id:'binairo',n:'Takuzu',h:'binairo.html',c:'logique',i:'M4 4h6v6H4zM14 14h6v6h-6zM14 4h6M4 14v6'},
 {id:'mots-fleches',n:'Mots fléchés',h:'mots-fleches.html',c:'logique',i:'M3 3h18v18H3zM3 12h18M12 3v18M6 7.5h3M15 16.5h3'},
 {id:'demineur',n:'Démineur',h:'demineur.html',c:'logique',i:'M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2'},
 {id:'morpion',n:'Morpion',h:'morpion.html',c:'deux',i:'M9 3v18M15 3v18M3 9h18M3 15h18'},
 {id:'puissance4',n:'Puissance 4',h:'puissance4.html',c:'deux',i:'M3 5h18v14H3zM8 10a1.5 1.5 0 100 .1M12 14a1.5 1.5 0 100 .1M16 10a1.5 1.5 0 100 .1'},
 {id:'naval',n:'Bataille navale',h:null,c:'deux',i:'M3 15h18l-3 5H6zM12 4v11M12 5l6 7h-6'},
 {id:'quiestce',n:'Qui est-ce',h:null,c:'deux',i:'M12 4a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0'},
 {id:'petitbac',n:'Petit bac',h:null,c:'deux',i:'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4'},
 {id:'champdle',n:'Champdle',h:null,c:'lol',i:'M12 3l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V7z'}
];
const T=[{k:'home',n:'Accueil',i:'M4 11l8-7 8 7v9h-5v-6H9v6H4z'},{k:'logique',n:'Logique',i:'M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z'},{k:'deux',n:'À deux',i:'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a2.5 2.5 0 100-5M17 14a5 5 0 014 6'},{k:'lol',n:'LoL',i:'M12 3l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V7z'}];
const file=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'');
const cur=G.find(g=>g.id===(file==='index'?'yakazu':file));
const svg=(d,cls)=>'<svg class="'+(cls||'mi')+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="'+d+'"/></svg>';
const E=document.createElement.bind(document);
const top=E('div');top.className='mtop';
top.innerHTML=(cur&&cur.id!=='yakazu'?'<a class="mback" href="./" aria-label="Retour à l\'accueil">'+svg('M15 5l-7 7 7 7')+'</a>':'<span class="mlogo" aria-hidden="true">✦</span>')+'<strong>'+(cur?cur.n:'Pause jeux')+'</strong><span class="mtag" aria-hidden="true">pause douce</span>';
const bar=E('nav');bar.className='mbar';bar.setAttribute('aria-label','Navigation principale');
const sheet=E('div');sheet.className='msheet';sheet.hidden=true;sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
sheet.innerHTML='<div class="mbackdrop"></div><div class="mpanel"><div class="mhead"><strong id="msh-t"></strong><button type="button" class="mclose" aria-label="Fermer">'+svg('M6 6l12 12M18 6L6 18')+'</button></div><div class="mtiles"></div></div>';
let openKey=null;
const curTab=cur?(cur.c==='logique'?'logique':cur.c):'home';
T.forEach(t=>{const b=E('button');b.type='button';b.dataset.k=t.k;b.innerHTML=svg(t.i)+'<span>'+t.n+'</span>';if(t.k===curTab)b.setAttribute('aria-current','page');b.onclick=()=>toggle(t.k);bar.appendChild(b)});
function tile(g){const x=E(g.h?'a':'span');x.className='mtile'+(g.h?'':' soon');if(g.h){x.href=g.h;if(cur&&cur.id===g.id)x.setAttribute('aria-current','page')}else x.setAttribute('aria-disabled','true');x.innerHTML='<span class="mico">'+svg(g.i,'mi big')+'</span><b>'+g.n+'</b>'+(g.h?'':'<em>bientôt</em>');return x}
function toggle(k){if(!sheet.hidden&&openKey===k)return close();
 // Logique/À deux/LoL pages: still tabs, open the category sheet
 openKey=k;const list=k==='home'?G:G.filter(g=>g.c===k);const t=T.find(t=>t.k===k);
 sheet.querySelector('#msh-t').textContent=k==='home'?'Tous les jeux':t.n;
 const tl=sheet.querySelector('.mtiles');tl.innerHTML='';tl.className='mtiles'+(k==='home'?' all':'');list.forEach(g=>tl.appendChild(tile(g)));
 sheet.hidden=false;document.documentElement.classList.add('msheet-open');
 bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.k===k)));
 const f=sheet.querySelector('.mtile[href],.mclose');(f||sheet.querySelector('.mclose')).focus({preventScroll:true})}
function close(){sheet.hidden=true;openKey=null;document.documentElement.classList.remove('msheet-open');bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-expanded','false'))}
sheet.querySelector('.mbackdrop').onclick=close;sheet.querySelector('.mclose').onclick=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sheet.hidden)close()});
function mount(){const b=document.body;b.classList.add('has-mnav');b.prepend(top);b.append(sheet,bar)}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();