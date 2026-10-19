'use strict';
(function(){const E=window.GuildeEngine,D=window.GuildeData,KEY='rouky-guilde-v1',root=document.getElementById('app');
const h=(t,a,...k)=>{const e=document.createElement(t);for(const n in a||{}){const v=a[n];if(v==null||v===false)continue;if(n==='class')e.className=v;else if(n.startsWith('on'))e.addEventListener(n.slice(2),v);else if(n==='text')e.textContent=v;else e.setAttribute(n,v===true?'':v)}
 for(const c of k.flat())if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(c));return e};
const tid=(e,id)=>(e.setAttribute('data-testid',id),e);
if(!D||!Array.isArray(D.themes)){root.append(h('p',{class:'g-note',role:'alert'},'Les données de la Guilde ne sont pas chargées.'));return}
try{E.check(D,D.production===true)}catch(e){root.append(h('p',{class:'g-note',role:'alert','data-testid':'data-error'},'Données de la Guilde invalides : '+e.message));return}
const trait=id=>D.traits.find(t=>t.id===id)||{label:id,definition:''};
let setup={names:['','','',''],count:2,themes:[]},G=null,ui={screen:'setup',seat:0,next:'turn'},pick=null,msg='';
const lockedScreen=s=>s==='secret'||s==='turn'?'pass':s;
function save(){try{const u=Object.assign({},ui,{screen:lockedScreen(ui.screen)});if(ui.screen==='secret')u.next='secret';if(ui.screen==='turn')u.next='turn';localStorage.setItem(KEY,JSON.stringify({v:1,setup,game:G,ui:u}))}catch(e){}}
function load(){try{const r=JSON.parse(localStorage.getItem(KEY)||'null');if(!r||r.v!==1)return;
 const s=r.setup;if(s&&Array.isArray(s.names)&&s.names.length===4&&s.names.every(x=>typeof x==='string')&&[2,3,4].includes(s.count)&&Array.isArray(s.themes))setup={names:s.names.map(x=>x.slice(0,16)),count:s.count,themes:s.themes.filter(x=>E.themeOk(D,x))};
 if(r.game){if(!E.validate(D,r.game)){try{localStorage.removeItem(KEY)}catch(e){}return}G=r.game;const u=r.ui||{};const n=G.names.length;
  const seat=Number.isInteger(u.seat)&&u.seat>=0&&u.seat<n?u.seat:G.turn;
  if(G.stage==='won')ui={screen:'end',seat:0,next:'turn'};
  else if(u.screen==='result'&&G.last)ui={screen:'result',seat:0,next:'turn'};
  else ui={screen:'pass',seat:u.next==='secret'?seat:G.turn,next:u.next==='secret'?'secret':'turn'}}}catch(e){G=null}}
function lock(){if(ui.screen==='secret'||ui.screen==='turn'){ui.next=ui.screen;ui.screen='pass';pick=null;render()}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)lock()});window.addEventListener('blur',lock);window.addEventListener('pagehide',()=>{lock();save()});window.addEventListener('pageshow',e=>{if(e.persisted)lock()});document.addEventListener('freeze',lock);
const go=(s,o)=>{Object.assign(ui,{screen:s},o||{});pick=null;msg='';render()};
const card=(...k)=>h('section',{class:'g-card'},k);
const glossary=(list,open)=>tid(h('details',{class:'g-gloss',open:open||null},h('summary',null,'Glossaire des traits ('+list.length+')'),h('p',{class:'g-note'},'Chaque trait a un sens précis. Les personnages sont ceux de la base de la Guilde, dans les thèmes choisis, d\'après les sources de la base. Rien d\'autre n\'est accepté.'),h('dl',{class:'g-traits'},list.map(x=>h('div',{'data-testid':'gloss-def-'+x.id},h('dt',null,x.label),h('dd',null,x.definition))))),'glossary');

let ov=null;
function closeOv(){if(ov){ov.el.remove();window.removeEventListener('resize',ov.re);document.removeEventListener('keydown',ov.kd);ov=null}}
function openOv(kind,opener){closeOv();const bar=document.querySelector('.mbar'),top=document.querySelector('.mtop');
 const items=kind==='gloss'?(()=>{const el=G?E.eligibility(D,G.themes):E.eligibility(D,setup.themes);return (el.ok?el.traits:D.traits).map(x=>h('div',{class:'g-ov-it','data-testid':'ov-gloss-'+x.id},h('b',null,x.label),h('span',null,x.definition)))})()
  :(()=>{const o=[];G.names.forEach((n,i)=>{o.push(h('div',{class:'g-ov-it g-ov-h'},h('b',null,'Trait de '+n)));if(!G.queries[i].length)o.push(h('div',{class:'g-ov-it'},h('span',null,'Aucune question.')));G.queries[i].forEach(x=>o.push(h('div',{class:'g-ov-it g-ov-q '+(x.answer?'yes':'no')},h('span',null,seatName(x.actor)+' : '+x.charName),h('strong',null,x.answer?'OUI':'NON'))))});
   o.push(h('div',{class:'g-ov-it g-ov-h'},h('b',null,'Tentatives')));if(!G.guesses.length)o.push(h('div',{class:'g-ov-it'},h('span',null,'Aucune tentative.')));G.guesses.forEach(g=>o.push(h('div',{class:'g-ov-it g-ov-q '+(g.ok?'yes':'no')},h('span',null,seatName(g.actor)+' pense que '+seatName(g.target)+' est « '+g.traitLabel+' »'),h('strong',null,g.ok?'JUSTE':'raté'))));return o})();
 const title=kind==='gloss'?'Glossaire des traits':'Registre public';
 const body=h('div',{class:'g-ov-body'}),cnt=h('span',{class:'g-ov-cnt','aria-live':'polite'}),prev=tid(h('button',{type:'button',class:'g-btn g-ov-nav'},'‹ Préc.'),'ov-prev'),next=tid(h('button',{type:'button',class:'g-btn g-ov-nav'},'Suiv. ›'),'ov-next'),close=tid(h('button',{type:'button',class:'g-ov-x','aria-label':'Fermer'},'✕'),'ov-close');
 const el=tid(h('div',{class:'g-ov',role:'dialog','aria-modal':'true','aria-label':title},h('div',{class:'g-ov-bar'},h('b',null,title),cnt,close),body,h('div',{class:'g-ov-foot'},prev,next)),'overlay');
 let pages=[],pg=0;
 const layout=()=>{const t=top?top.getBoundingClientRect().bottom:0,b=bar?bar.getBoundingClientRect().top:innerHeight;Object.assign(el.style,{top:t+'px',bottom:(innerHeight-b)+'px'});
  const avail=body.clientHeight;pages=[];let cur=[];body.replaceChildren();
  for(const it of items){body.append(it);if(body.scrollHeight>avail+0.5&&cur.length){body.removeChild(it);pages.push(cur);cur=[it];body.replaceChildren(it)}else cur.push(it)}
  if(cur.length)pages.push(cur);pg=Math.min(pg,pages.length-1);show()};
 const show=()=>{body.replaceChildren(...pages[pg]);cnt.textContent=(pg+1)+' / '+pages.length;prev.disabled=pg===0;next.disabled=pg>=pages.length-1};
 prev.onclick=()=>{if(pg>0){pg--;show()}};next.onclick=()=>{if(pg<pages.length-1){pg++;show()}};
 close.onclick=()=>{closeOv();if(opener&&opener.isConnected)opener.focus()};
 const kd=e=>{if(e.key==='Escape')close.onclick()};document.addEventListener('keydown',kd);const re=()=>layout();window.addEventListener('resize',re);
 document.body.append(el);ov={el,re,kd};layout();close.focus()}
const mbtns=(...k)=>h('div',{class:'g-mbtns'},k);
const gBtn=()=>tid(h('button',{type:'button',class:'g-btn g-mini',onclick:e=>openOv('gloss',e.currentTarget)},'Glossaire'),'open-gloss');
const hBtn=()=>tid(h('button',{type:'button',class:'g-btn g-mini',onclick:e=>openOv('hist',e.currentTarget)},'Registre'),'open-hist');
const seatName=i=>G.names[i];
function setupView(){const el=E.eligibility(D,setup.themes);const av=D.themes.filter(t=>E.themeOk(D,t.id));const allOk=av.length>0;const all=allOk&&setup.themes.length===av.length;const nOf=id=>D.characters.filter(c=>c.theme===id).length;
 const names=h('div',{class:'g-names'});for(let i=0;i<setup.count;i++){const id='gn'+i;names.append(h('label',{for:id,class:'g-lab'},'Joueur '+(i+1),tid(h('input',{id,class:'g-in',maxlength:16,autocomplete:'off',value:setup.names[i],placeholder:'Joueur '+(i+1),onchange:e=>{setup.names[i]=e.target.value;save()},oninput:e=>{setup.names[i]=e.target.value}}),'name-'+i)))}
 const cnt=h('div',{class:'g-seg',role:'group','aria-label':'Nombre de joueurs'},[2,3,4].map(n=>tid(h('button',{type:'button','aria-pressed':String(setup.count===n),onclick:()=>{setup.count=n;save();render()}},n+' joueurs'),'count-'+n)));
 const th=h('fieldset',{class:'g-themes'},h('legend',null,'Thèmes de la Guilde'),D.themes.map(t=>h('label',{class:'g-chk'+(E.themeOk(D,t.id)?'':' off')},tid(h('input',{type:'checkbox',disabled:!E.themeOk(D,t.id),checked:setup.themes.includes(t.id),onchange:e=>{setup.themes=e.target.checked?[...setup.themes,t.id]:setup.themes.filter(x=>x!==t.id);save();render()}}),'theme-'+t.id),h('span',null,t.label+(E.themeOk(D,t.id)?'':' (bientôt)')))),
  h('label',{class:'g-chk g-hard'},tid(h('input',{type:'checkbox',disabled:!allOk,checked:all,onchange:e=>{setup.themes=e.target.checked?av.map(t=>t.id):[];save();render()}}),'hardcore'),h('span',null,'Hardcore : tous les thèmes disponibles'+(allOk?'':' (aucun thème disponible)'))));
 const blocked=!el.ok?tid(h('p',{class:'g-note',role:'status'},el.reason),'blocked'):h('p',{class:'g-note ok'},el.traits.length+' traits possibles, '+el.pool.length+' personnages.');
 return card(h('div',{class:'g-row'},h('h2',null,'Ouvrir la Guilde'),gBtn()),tid(h('button',{class:'g-btn',type:'button',disabled:!el.ok,onclick:start},'Commencer'),'start'),blocked,cnt,names,th,h('p',{class:'g-lead g-x'},'Chacun reçoit un trait secret. Interroge des personnages pour deviner celui des autres. Un seul téléphone, on se le passe.'),
  tid(h('p',{class:'g-note g-x'},'Base actuelle : '+av.reduce((n,t)=>n+nOf(t.id),0)+' personnages ('+av.map(t=>t.label+' '+nOf(t.id)).join(', ')+')'+(av.length<D.themes.length?'. Pas encore disponible : '+D.themes.filter(t=>!E.themeOk(D,t.id)).map(t=>t.label).join(', '):'')+'.'),'scope-notice'),h('p',{class:'g-note g-x'},'Seuls les personnages de la base de la Guilde, dans les thèmes choisis, peuvent être demandés. Pas de personnage libre.'),glossary(el.ok?el.traits:D.traits,true))}
function start(){const names=setup.names.slice(0,setup.count);try{G=E.create(D,{names,themes:setup.themes});}catch(e){msg=e.message;G=null;ui.screen='setup';render();if(E.dupNames&&/même nom/.test(msg))root.querySelectorAll('.g-names input').forEach(i=>i.setAttribute('aria-invalid','true'));return}
 G.names=G.names.map((n,i)=>n);go('pass',{seat:0,next:'secret'})}
function passView(){const n=seatName(ui.seat);const sec=ui.next==='secret';
 return card(h('div',{class:'g-lock','aria-hidden':'true'},'✦'),h('h2',null,'Passe le téléphone à '+n),tid(h('p',{class:'g-lead'},sec?'Personne d\'autre ne regarde ? '+n+' va découvrir son trait secret.':'C\'est le tour de '+n+'. Les autres ne regardent pas.'),'pass-text'),
  tid(h('button',{class:'g-btn',type:'button',onclick:()=>go(sec?'secret':'turn')},'C\'est moi, '+n),'pass-continue'),resetBtn())}
function secretView(){const t=trait(G.secrets[ui.seat]);const last=ui.seat===G.names.length-1;
 return card(h('p',{class:'g-eyebrow'},seatName(ui.seat)+', ton trait secret'),tid(h('h2',{class:'g-trait','data-qa-private-secret':'secret','data-seat':String(ui.seat)},t.label),'secret-trait'),h('p',{class:'g-lead g-x'},t.definition),h('p',{class:'g-note g-x'},'Retiens-le. Il ne s\'affichera plus pour les autres.'),
  tid(h('button',{class:'g-btn',type:'button',onclick:()=>last?go('pass',{seat:0,next:'turn'}):go('pass',{seat:ui.seat+1,next:'secret'})},'J\'ai mémorisé'),'secret-ok'))}
function histBlock(){const w=h('div',{class:'g-hist'},h('h3',null,'Registre public'));G.names.forEach((n,i)=>{const q=G.queries[i];w.append(tid(h('div',{class:'g-h-row'},h('b',null,'Trait de '+n),q.length?h('ul',null,q.map(x=>h('li',{class:x.answer?'yes':'no'},h('span',null,seatName(x.actor)+' : '+x.charName),h('strong',null,x.answer?'OUI':'NON')))):h('p',{class:'g-note'},'Aucune question.')),'history-'+i))});
 const gs=tid(h('div',{class:'g-h-row'},h('b',null,'Tentatives'),G.guesses.length?h('ul',null,G.guesses.map(g=>h('li',{class:g.ok?'yes':'no'},h('span',null,seatName(g.actor)+' pense que '+seatName(g.target)+' est « '+g.traitLabel+' »'),h('strong',null,g.ok?'JUSTE':'raté')))):h('p',{class:'g-note'},'Aucune tentative.')),'guesses');w.append(gs);return w}
function turnView(){const me=ui.seat,el=E.eligibility(D,G.themes);const others=G.names.map((n,i)=>i).filter(i=>i!==me);
 if(ui.target==null||!others.includes(ui.target))ui.target=others[0];
 const t=ui.target;const mode=ui.mode||'query';
 const tgt=h('div',{class:'g-seg',role:'group','aria-label':'Adversaire'},others.map(i=>tid(h('button',{type:'button','aria-pressed':String(t===i),onclick:()=>{ui.target=i;pick=null;render()}},seatName(i)),'target-'+i)));
 let body;
 if(mode==='query'){const inp=tid(h('input',{class:'g-in',id:'gq',role:'combobox','aria-expanded':'false','aria-controls':'gl','aria-autocomplete':'list',autocomplete:'off',autocapitalize:'off',spellcheck:'false',placeholder:'Un personnage…'}),'query-input');
  const list=tid(h('ul',{id:'gl',class:'g-list',role:'listbox','aria-label':'Personnages',hidden:true}),'query-list');let res=[],hi=0;
  const btn=tid(h('button',{class:'g-btn',type:'button',disabled:true,onclick:()=>submitQ()},'Poser la question'),'query-submit');
  let pgI=0;const mob=()=>document.body.classList.contains('has-mnav');
  const per=()=>{if(!mob())return res.length||1;const bar=document.querySelector('.mbar'),r=inp.getBoundingClientRect(),av=(bar?bar.getBoundingClientRect().top:innerHeight)-r.bottom-12;return Math.max(2,Math.min(res.length,Math.floor((av-52)/44)))};
  const paint=()=>{list.innerHTML='';const n=per(),pages=Math.max(1,Math.ceil(res.length/n));if(hi>=0&&res.length)pgI=Math.floor(hi/n);pgI=Math.min(pgI,pages-1);const lo=pgI*n;
   res.slice(lo,lo+n).forEach((c,j)=>{const i=lo+j;list.append(h('li',{id:'go'+i,role:'option','aria-selected':String(i===hi),'data-testid':'query-option',onpointerdown:e=>{e.preventDefault();choose(c)}},c.name+(c.aliases&&c.aliases.length&&E.norm(c.name).indexOf(E.norm(inp.value))<0?' ('+c.aliases.find(a=>E.norm(a).includes(E.norm(inp.value)))+')':''),h('small',null,D.themes.find(x=>x.id===c.theme).label)))});
   if(pages>1){const mv=d=>e=>{e.preventDefault();hi=Math.max(0,Math.min(res.length-1,(pgI+d)*n));paint()};list.append(h('li',{class:'g-pgnav',role:'presentation'},tid(h('button',{type:'button',tabindex:'-1','aria-label':'Résultats précédents',disabled:pgI===0,onpointerdown:mv(-1)},'‹'),'list-prev'),h('span',null,(pgI+1)+' / '+pages),tid(h('button',{type:'button',tabindex:'-1','aria-label':'Résultats suivants',disabled:pgI>=pages-1,onpointerdown:mv(1)},'›'),'list-next')))}
   list.hidden=!res.length;inp.setAttribute('aria-expanded',String(!!res.length));if(res.length)inp.setAttribute('aria-activedescendant','go'+hi);else inp.removeAttribute('aria-activedescendant')};
  const choose=c=>{pick=c;inp.value=c.name;res=[];paint();btn.disabled=false;btn.textContent='Demander pour '+c.name;};
  inp.addEventListener('input',()=>{pick=null;btn.disabled=true;btn.textContent='Poser la question';res=E.search(D,G.themes,inp.value,[],6);hi=0;pgI=0;paint()});
  inp.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&res.length){e.preventDefault();hi=(hi+1)%res.length;paint()}else if(e.key==='ArrowUp'&&res.length){e.preventDefault();hi=(hi+res.length-1)%res.length;paint()}else if(e.key==='Enter'){e.preventDefault();if(res.length)choose(res[hi]);else if(pick)submitQ()}else if(e.key==='Escape'){res=[];paint()}});
  const submitQ=()=>{if(!pick)return;E.ask(D,G,t,pick.id);save();go('result',{mode:'query'})};
  body=h('div',{class:'g-form'},h('label',{for:'gq',class:'g-lab'},'Ce personnage a-t-il le trait de '+seatName(t)+' ?'),h('div',{class:'g-combo'},inp,list),btn)}
 else{const sel=tid(h('select',{class:'g-in',id:'gt','aria-label':'Trait'},h('option',{value:''},'Choisir un trait…'),el.traits.map(x=>h('option',{value:x.id},x.label))),'guess-select');
  const b=tid(h('button',{class:'g-btn warn',type:'button',disabled:true,onclick:()=>{E.guess(D,G,t,sel.value);save();go(G.stage==='won'?'end':'result',{mode:'guess'})}},'Tenter ce trait'),'guess-submit');
  const dfn=h('p',{class:'g-note'},'');sel.addEventListener('change',()=>{b.disabled=!sel.value;dfn.textContent=sel.value?trait(sel.value).definition:''});
  const tl=tid(h('dl',{class:'g-traits'},el.traits.map(x=>h('div',{'data-testid':'trait-def-'+x.id},h('dt',null,x.label),h('dd',null,x.definition)))),'trait-list');body=h('div',{class:'g-form'},h('label',{for:'gt',class:'g-lab'},'Quel est le trait de '+seatName(t)+' ? Une erreur coûte ton tour.'),sel,dfn,b,h('h3',null,'Traits possibles ('+el.traits.length+')'),tl)}
 return card(h('p',{class:'g-eyebrow'},'Tour de '+seatName(me)),tid(h('div',{class:'g-mine'},h('span',null,'Ton trait'),h('b',{'data-qa-private-secret':'turn','data-seat':String(me)},trait(G.secrets[me]).label)),'turn-trait'),tid(h('h2',null,seatName(me)+', à toi'),'turn-seat'),
  h('p',{class:'g-lab'},'Interroger ou deviner qui ?'),tgt,
  h('div',{class:'g-seg',role:'group','aria-label':'Action'},tid(h('button',{type:'button','aria-pressed':String(mode==='query'),onclick:()=>{ui.mode='query';render()}},'Poser une question'),'mode-query'),tid(h('button',{type:'button','aria-pressed':String(mode==='guess'),onclick:()=>{ui.mode='guess';render()}},'Tenter un trait'),'guess-open')),body,glossary(el.traits),histBlock(),mbtns(gBtn(),hBtn()),resetBtn())}
function resultView(){const l=G.last;const nxt=G.turn;
 const main=l.type==='query'?h('div',{class:'g-res '+(l.answer?'yes':'no')},h('p',null,seatName(l.actor)+' interroge « '+l.charName+' » pour le trait de '+seatName(l.target)),h('strong',{class:'g-big'},l.answer?'OUI':'NON')):h('div',{class:'g-res no'},h('p',null,seatName(l.actor)+' tente « '+l.traitLabel+' » pour '+seatName(l.target)),h('strong',{class:'g-big'},'Raté'));
 return card(h('p',{class:'g-eyebrow'},'Résultat public'),tid(main,'result'),histBlock(),mbtns(gBtn(),hBtn()),tid(h('button',{class:'g-btn',type:'button',onclick:()=>go('pass',{seat:nxt,next:'turn',mode:'query',target:null})},'Passer le téléphone à '+seatName(nxt)),'result-continue'),resetBtn())}
function endView(){const w=G.winner;return card(h('p',{class:'g-eyebrow'},'La Guilde a parlé'),tid(h('h2',null,seatName(w)+' gagne !'),'winner'),h('p',{class:'g-lead'},seatName(w)+' a trouvé le trait de '+seatName(G.last.target)+' : '+G.last.traitLabel+'.'),
 h('ul',{class:'g-secrets'},G.names.map((n,i)=>h('li',null,h('b',null,n),' : '+trait(G.secrets[i]).label))),tid(h('p',{class:'g-note g-x'},'Les autres joueurs ne sont pas classés.'),'unranked'),histBlock(),mbtns(hBtn()),
 tid(h('button',{class:'g-btn',type:'button',onclick:()=>{G=null;go('setup')}},'Nouvelle partie'),'replay'))}
function resetBtn(){return tid(h('button',{class:'g-link',type:'button',onclick:()=>{if(confirm('Abandonner la partie en cours ?')){G=null;go('setup')}}},'Abandonner la partie'),'reset')}
function render(){if(ui.screen==='result'&&(!G||!G.last))ui={screen:G?'pass':'setup',seat:G?G.turn:0,next:'turn'};if((ui.screen==='secret'||ui.screen==='turn'||ui.screen==='pass'||ui.screen==='result'||ui.screen==='end')&&!G)ui={screen:'setup',seat:0,next:'turn'};closeOv();root.replaceChildren();const v={setup:setupView,pass:passView,secret:secretView,turn:turnView,result:resultView,end:endView}[ui.screen];root.append(v());if(msg)root.append(h('p',{class:'g-note',role:'alert'},msg));
 root.dataset.screen=ui.screen;save();const al=root.querySelector('[role=alert]');const fo=al||(ui.screen!==lastShown?root.querySelector('h2'):null);lastShown=ui.screen;if(fo){fo.setAttribute('tabindex','-1');fo.focus({preventScroll:false})}}
let lastShown=null;
load();render();
window.GuildeUI={state:()=>({G,ui,setup})};
})();
