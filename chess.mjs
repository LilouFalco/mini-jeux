import {Chess,serialize,restore,result,claimable} from './chess-engine.mjs';
const $=s=>document.querySelector(s),KEY='lilou-chess-v1';
const N={p:'pion',n:'cavalier',b:'fou',r:'tour',q:'dame',k:'roi'};
const PATHS={
 p:'M16 38h32v7H16zM20 34h24v4H20zM25 22h14l3 12H22zM32 7a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
 r:'M16 38h32v7H16zM20 34h24v4H20zM23 18h18v16H23zM18 7h7v6h4V7h6v6h4V7h7v13H18z',
 n:'M16 38h32v7H16zM21 34c0-8 2-13 10-17l-8 3-6-4L30 5l9 4c6 5 6 14 5 25zM30 7V2l7 6',
 b:'M16 38h32v7H16zM20 34h24v4H20zM24 29h16l3 5H21zM32 4c-3 5-12 12-10 18 1 5 19 5 20 0 2-6-7-13-10-18zM33 9l-6 10',
 q:'M16 38h32v7H16zM20 34h24v4H20zM21 15l5 7 6-13 6 13 5-7-3 19H24zM19 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM32 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM45 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
 k:'M16 38h32v7H16zM20 34h24v4H20zM24 28h16l3 6H21zM32 13c-10-8-20 5-9 14h18c11-9 1-22-9-14zM32 2v12M27 7h10'
};
function pieceSVG(p){return '<svg class="chess-piece" aria-hidden="true" viewBox="12 0 40 50"><path d="'+PATHS[p.type]+'" fill="'+(p.color==='w'?'#fffdf4':'#755064')+'" stroke="'+(p.color==='w'?'#80566a':'#402e3c')+'" stroke-width="2.1" stroke-linejoin="round"/>'+(p.type==='n'?'<circle cx="30" cy="12" r="1.5" fill="#402e3c"/>':'')+'</svg>'}
let game=new Chess(),st={mode:'easy',n1:'Joueur 1',n2:'Joueur 2',flipped:false,claimed:false};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s){game=restore(s);for(const k of ['n1','n2'])if(typeof s[k]==='string')st[k]=s[k].slice(0,20);st.mode=s.mode;st.flipped=s.flipped===true;st.claimed=s.claimed===true}}catch{}
const q=new URLSearchParams(location.search).get('mode');
if(q==='duo'&&st.mode!=='two'){game=new Chess();st.mode='two';st.claimed=false}
if(q==='solo'&&st.mode==='two'){game=new Chess();st.mode='easy';st.claimed=false}
let selected=null,targets=[],pending=null,busy=false,worker=null,timer=null,watchdog=null,version=0,claimIntent=false,notice='',nextMode=null;
const name=c=>c==='w'?st.n1:(st.mode==='two'?st.n2:'Ordi');
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(serialize(game,st)))}catch{}};
function cancelAI(){version++;worker?.terminate();worker=null;clearTimeout(timer);clearTimeout(watchdog);busy=false}
function clearSelection(){selected=null;targets=[];pending=null}
function render(){
 const r=result(game,st.claimed),history=game.history({verbose:true}),last=history.at(-1);
 $('#turn-label').textContent=(game.turn()==='w'?'Blancs · ':'Noirs · ')+name(game.turn());
 $('#status').textContent=notice||(r.over?(r.winner?name(r.winner)+' gagne · échec et mat !':r.text):claimIntent?'Annonce le coup qui permet la nulle.':busy?'L’ordi réfléchit…':(game.isCheck()?'Échec ! ':'')+'À '+name(game.turn())+' de jouer.');
 $('#last-move').textContent=last?'Dernier coup · '+last.san+' ('+last.from+'–'+last.to+')':'Touche une pièce pour voir ses coups.';
 $('#undo').disabled=!history.length;$('#flip').textContent=st.flipped?'Blancs en bas':'Retourner';
 $('#n2').disabled=st.mode!=='two';$('#mode').value=st.mode;
 $('#claim').disabled=r.over||busy||(st.mode!=='two'&&game.turn()==='b');
 const b=$('#chess-board');b.replaceChildren();b.setAttribute('aria-label','Échiquier, '+(st.flipped?'noirs':'blancs')+' en bas');b.setAttribute('aria-busy',String(busy));
 for(let i=0;i<64;i++){
  const row=Math.floor(i/8),col=i%8,rank=st.flipped?row+1:8-row,file=st.flipped?7-col:col,sq='abcdefgh'[file]+rank,p=game.get(sq),legal=targets.some(m=>m.to===sq),c=document.createElement('button');
  c.type='button';c.className='chess-cell'+((file+rank)%2===1?' dark':'')+(sq===selected?' selected':'')+(legal?' legal':'')+(legal&&p?' capture':'')+(last&&(last.from===sq||last.to===sq)?' last':'')+(p?.type==='k'&&p.color===game.turn()&&game.isCheck()?' check':'');
  c.dataset.square=sq;c.setAttribute('aria-label',sq+(p?' '+N[p.type]+' '+(p.color==='w'?'blanc':'noir'):' vide')+(legal?', coup possible':''));c.setAttribute('aria-pressed',String(selected===sq));
  if(p)c.innerHTML=pieceSVG(p);
  if(col===0){const small=document.createElement('small');small.className='rank';small.textContent=rank;c.appendChild(small)}
  if(row===7){const small=document.createElement('small');small.className='file';small.textContent='abcdefgh'[file];c.appendChild(small)}
  c.onclick=()=>tap(sq);b.appendChild(c);
 }
}
function after(){clearSelection();notice='';save();render();scheduleAI()}
function apply(m){try{game.move(m);claimIntent=false;after()}catch{notice='Ce coup n’est pas légal.';clearSelection();render()}}
function choose(m){
 if(claimIntent){
  game.move(m);const ok=claimable(game);game.undo();claimIntent=false;clearSelection();
  if(ok){st.claimed=true;notice='';save();render()}else{notice='Ce coup ne permet pas de réclamer la nulle.';render()}
  return;
 }
 apply(m);
}
function tap(sq){
 if(busy||result(game,st.claimed).over||pending||(st.mode!=='two'&&game.turn()==='b'))return;
 notice='';
 const ms=targets.filter(m=>m.to===sq);
 if(ms.length){
  if(ms.some(m=>m.promotion)){pending=ms;const box=$('#promotion-choices');box.replaceChildren();
   for(const type of ['q','r','b','n']){const b=document.createElement('button');b.dataset.promotion=type;b.innerHTML=pieceSVG({type,color:game.turn()})+'<span>'+N[type]+'</span>';b.onclick=()=>{const m=pending?.find(m=>m.promotion===type);pending=null;$('#promotion').close();if(m)choose(m)};box.appendChild(b)}
   $('#promotion').showModal();return;
  }choose(ms[0]);return;
 }
 const p=game.get(sq);selected=p?.color===game.turn()?(selected===sq?null:sq):null;
 targets=selected?game.moves({square:selected,verbose:true}):[];render();
 if(selected)$('#chess-board [data-square="'+selected+'"]').focus({preventScroll:true});
}
function scheduleAI(){
 if(st.mode==='two'||game.turn()!=='b'||result(game,st.claimed).over||busy)return;
 cancelAI();busy=true;render();const id=version,fen=game.fen(),snapshot=serialize(game,st);
 const valid=()=>id===version&&fen===game.fen()&&st.mode!=='two'&&game.turn()==='b'&&!result(game,st.claimed).over;
 const fallback=()=>{if(!valid())return;worker?.terminate();worker=null;clearTimeout(watchdog);busy=false;
  if(claimable(game)){st.claimed=true;after();return}
  const ms=game.moves({verbose:true});if(ms.length){game.move(ms[Math.floor(Math.random()*ms.length)]);after();notice='Moteur indisponible · coup de secours légal.';render()}};
 timer=setTimeout(()=>{if(!valid())return;
  try{worker=new Worker(new URL('./chess-worker.mjs',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(!valid()||data.id!==id||data.fen!==fen){if(data.error)fallback();return}
    worker?.terminate();worker=null;clearTimeout(watchdog);busy=false;
    if(data.claim&&claimable(game)){st.claimed=true;after();return}
    try{if(!data.move)throw Error('No move');game.move(data.move);after()}catch{fallback()}
   };worker.onerror=fallback;worker.postMessage({id,save:snapshot});watchdog=setTimeout(fallback,7000);
  }catch{fallback()}
 },180);
}
function fresh(mode=st.mode){cancelAI();game=new Chess();st.mode=mode;st.claimed=false;claimIntent=false;clearSelection();notice='';save();render();$('#n2').disabled=st.mode!=='two'}
$('#undo').onclick=()=>{cancelAI();st.claimed=false;claimIntent=false;clearSelection();notice='';if(game.history().length){game.undo();if(st.mode!=='two'&&game.turn()==='b'&&game.history().length)game.undo()}save();render();scheduleAI()};
$('#flip').onclick=()=>{st.flipped=!st.flipped;save();render()};
$('#settings').onclick=()=>{$('#options').showModal()};
$('#close-options').onclick=()=>$('#options').close();
function requestNew(mode){nextMode=mode;if(game.history().length&&!result(game,st.claimed).over)$('#confirm-new').showModal();else{fresh(mode);$('#options').close()}}
$('#new').onclick=()=>requestNew(st.mode);
$('#mode').onchange=e=>{const mode=e.target.value;e.target.value=st.mode;requestNew(mode)};
$('#cancel-new').onclick=()=>{$('#confirm-new').close();nextMode=null};
$('#accept-new').onclick=()=>{fresh(nextMode||st.mode);nextMode=null;$('#confirm-new').close();$('#options').close()};
for(const k of ['n1','n2']){$('#'+k).value=st[k];$('#'+k).oninput=e=>{st[k]=e.target.value.slice(0,20)||(k==='n1'?'Joueur 1':'Joueur 2');save();render()}}
$('#claim').onclick=()=>{
 $('#options').close();clearSelection();notice='';
 if(claimable(game)){cancelAI();st.claimed=true;save();render()}
 else{claimIntent=!claimIntent;render()}
};
$('#cancel-promotion').onclick=()=>{$('#promotion').close();pending=null;clearSelection();render()};
$('#promotion').addEventListener('cancel',()=>{pending=null;clearSelection();render()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){claimIntent=false;notice='';clearSelection();render()}});
addEventListener('pagehide',cancelAI);addEventListener('pageshow',()=>scheduleAI());
save();render();scheduleAI();

if (!$('#online-toggle')?.hidden) import('./online-chess.mjs').then(o=>o.start({pieceSVG})).catch(()=>{$('#online-toggle')?.setAttribute('hidden','')});
