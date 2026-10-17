'use strict';
(function(w){
const P='M';
const G=[
 {id:'yakazu',n:'Yakazu',i:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',m:{solo:'yakazu.html'}},
 {id:'sudoku',n:'Sudoku',i:'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',m:{solo:'sudoku.html'}},
 {id:'binairo',n:'Takuzu',i:'M4 4h6v6H4zM14 14h6v6h-6zM14 4h6M4 14v6',m:{solo:'binairo.html'}},
 {id:'mots-fleches',n:'Mots fléchés',i:'M3 3h18v18H3zM3 12h18M12 3v18M6 7.5h3M15 16.5h3',m:{solo:'mots-fleches.html'}},
 {id:'demineur',n:'Démineur',i:'M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2',m:{solo:'demineur.html'}},
 {id:'champdle',n:'Champdle',i:'M12 3l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V7z',m:{solo:null}},
 {id:'morpion',n:'Morpion',i:'M9 3v18M15 3v18M3 9h18M3 15h18',m:{solo:'morpion.html?mode=solo',duo:'morpion.html?mode=duo'}},
 {id:'puissance4',n:'Puissance 4',i:'M3 5h18v14H3zM8 10a1.5 1.5 0 100 .1M12 14a1.5 1.5 0 100 .1M16 10a1.5 1.5 0 100 .1',m:{solo:'puissance4.html?mode=solo',duo:'puissance4.html?mode=duo'}},
 {id:'naval',n:'Bataille navale',i:'M3 15h18l-3 5H6zM12 4v11M12 5l6 7h-6',m:{solo:'naval.html?mode=solo',duo:'naval.html?mode=duo'}},
 {id:'quiestce',n:'Qui est-ce LoL',i:'M12 4a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0',m:{duo:null}},
 {id:'petitbac',n:'Petit bac',i:'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4',m:{duo:null,multi:null},min:3,max:10},
 {id:'undercover',n:'Undercover',i:'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',m:{multi:'undercover.html'},min:3,max:10},
 {id:'timesup',n:"Time's Up",i:'M12 5a8 8 0 100 16 8 8 0 000-16zM12 9v4l3 2M9 2h6',m:{multi:null},min:4,max:12}
];
const MODES=[{k:'solo',n:'Solo',t:'Un jeu, une pause, rien que pour toi',i:'M12 4a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0'},{k:'duo',n:'Duo',t:'À deux sur le même téléphone',i:'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 11a2.5 2.5 0 100-5M17 14a5 5 0 014 6'},{k:'multi',n:'Multi',t:'Entre amis, 3 joueurs et plus',i:'M12 10a3 3 0 100-6 3 3 0 000 6zM6 12a2.5 2.5 0 100-5M18 12a2.5 2.5 0 100-5M7 20a5 5 0 0110 0M2 19a4 4 0 014-4M22 19a4 4 0 00-4-4'}];
const KEY='lilou-yakazu-mode';
const getMode=()=>{try{const m=localStorage.getItem(KEY);return MODES.some(x=>x.k===m)?m:null}catch{return null}};
const setMode=m=>{try{localStorage.setItem(KEY,m)}catch{}};
const forMode=(k,players)=>G.filter(g=>k in g.m).map(g=>({...g,href:g.m[k],ok:!!g.m[k]&&(k!=='multi'||players==null||(players>=g.min&&players<=g.max)),range:g.min?g.min+'–'+g.max+' joueurs':null})).sort((a,b)=>(b.ok?1:0)-(a.ok?1:0));
const svg=(d,cls)=>'<svg class="'+(cls||'mi')+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="'+d+'"/></svg>';
w.YakazuGames={G,MODES,getMode,setMode,forMode,svg};
const q=new URLSearchParams(location.search).get('mode');
if(q==='solo'||q==='duo'||q==='multi')setMode(q==='duo'?'duo':q);
})(window);