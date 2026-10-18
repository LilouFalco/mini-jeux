'use strict';
(function(w){
const P='M';
const G=[
 {id:'yakazu',n:'Yakazu',i:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',m:{solo:'yakazu.html'}},
 {id:'sudoku',n:'Sudoku',i:'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',m:{solo:'sudoku.html'}},
 {id:'binairo',n:'Takuzu',i:'M4 4h6v6H4zM14 14h6v6h-6zM14 4h6M4 14v6',m:{solo:'binairo.html'}},
 {id:'demineur',n:'Démineur',i:'M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2',m:{solo:'demineur.html'}},
 {id:'champdle',n:'Champdle',i:'M12 3l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V7z',m:{solo:'champdle.html'}},
 {id:'chess',n:'Échecs',i:'M5 20h14M7 16h10l-2-7H9zM12 3v6M9 5h6',m:{solo:'chess.html?mode=solo',duo:'chess.html?mode=duo'}},
 {id:'morpion',n:'Morpion',i:'M9 3v18M15 3v18M3 9h18M3 15h18',m:{solo:'morpion.html?mode=solo',duo:'morpion.html?mode=duo'}},
 {id:'puissance4',n:'Puissance 4',i:'M3 5h18v14H3zM8 10a1.5 1.5 0 100 .1M12 14a1.5 1.5 0 100 .1M16 10a1.5 1.5 0 100 .1',m:{solo:'puissance4.html?mode=solo',duo:'puissance4.html?mode=duo'}},
 {id:'naval',n:'Bataille navale',i:'M3 15h18l-3 5H6zM12 4v11M12 5l6 7h-6',m:{solo:'naval.html?mode=solo',duo:'naval.html?mode=duo'}},
 {id:'quiestce',n:'Qui est-ce LoL',i:'M12 4a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0',m:{duo:'quiestce.html'}},
 {id:'petitbac',n:'Petit bac',i:'M5 4h14v16H5zM8 9h8M8 13h8M8 17h4',m:{multi:'petitbac.html'},min:2,max:10},
 {id:'undercover',n:'Undercover',i:'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',m:{multi:'undercover.html'},min:3,max:10},
 {id:'timesup',n:"Time's Up",i:'M12 5a8 8 0 100 16 8 8 0 000-16zM12 9v4l3 2M9 2h6',m:{multi:'timesup.html'},min:4,max:12}
];
const MODES=[{k:'solo',n:'Solo',t:'Un jeu, une pause, rien que pour toi',i:'M12 4a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0'},{k:'duo',n:'Duo',t:'À deux sur le même téléphone',i:'M4 8.5a3 3 0 106 0 3 3 0 10-6 0M3 21v-1a6 6 0 0112 0v1M15.5 5.6a3 3 0 010 5.8M18 14.6a6 6 0 013 5.4v1'},{k:'multi',n:'Multi',t:'Entre amis, 3 joueurs et plus',i:'M9 7.5a3 3 0 106 0 3 3 0 10-6 0M7 21v-1a5 5 0 0110 0v1M3 9.5a2 2 0 104 0 2 2 0 10-4 0M3 20v-.5a3.5 3.5 0 013.5-3.5M17 9.5a2 2 0 104 0 2 2 0 10-4 0M21 20v-.5a3.5 3.5 0 00-3.5-3.5'}];
MODES.push({k:'online',n:'En ligne',t:'Un salon, chacun sur son écran',i:'M3 8a14 14 0 0118 0M6 12a9 9 0 0112 0M9 16a4 4 0 016 0M12 20h.01'});
G.find(g=>g.id==='morpion').m.online='morpion.html?mode=online';
G.find(g=>g.id==='puissance4').m.online='puissance4.html?mode=online';
G.find(g=>g.id==='chess').m.online='chess.html?mode=online';
G.find(g=>g.id==='naval').m.online='naval.html?mode=online';
G.find(g=>g.id==='quiestce').m.online='quiestce.html?mode=online';
G.find(g=>g.id==='timesup').m.online='timesup.html?mode=online';
const KEY='lilou-yakazu-mode';
const getMode=()=>{try{const m=localStorage.getItem(KEY);return MODES.some(x=>x.k===m)?m:null}catch{return null}};
const setMode=m=>{try{localStorage.setItem(KEY,m)}catch{}};
const forMode=(k,players)=>G.filter(g=>k in g.m).map(g=>({...g,href:g.m[k],ok:!!g.m[k]&&(k!=='multi'||players==null||(players>=g.min&&players<=g.max)),range:g.min?g.min+'–'+g.max+' joueurs':null})).sort((a,b)=>(b.ok?1:0)-(a.ok?1:0));
const svg=(d,cls)=>'<svg class="'+(cls||'mi')+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="'+d+'"/></svg>';
w.YakazuGames={G,MODES,getMode,setMode,forMode,svg};
const q=new URLSearchParams(location.search).get('mode');
if(q==='solo'||q==='duo'||q==='multi'||q==='online')setMode(q==='duo'?'duo':q);
})(window);