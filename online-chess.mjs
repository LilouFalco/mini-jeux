// Online casual chess. Server stores UCI only; EVERY client re-validates the whole history with chess.js before showing or acknowledging it.
import {reconstructOnlineChess} from './chess-online-history.mjs';
import {result as engineResult} from './chess-engine.mjs';
const $=s=>document.querySelector(s);
const SYM={1:'♙',2:'♟'},COLOR={1:'w',2:'b'},RESULTS=['white','black','draw'];
const el=(t,text,cls)=>{const e=document.createElement(t);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e};
const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b};
const uuid=()=>crypto.randomUUID();
export function validateSnapshot(snap,prev){
 // Throws Error(code) when the room snapshot cannot be trusted. Never mutates anything.
 if(!snap||typeof snap!=='object'||typeof snap.id!=='string'||!Number.isInteger(snap.version)||!Array.isArray(snap.members))throw Error('INVALID_REMOTE_SNAPSHOT');
 if(snap.game&&snap.game!=='chess')throw Error('INVALID_REMOTE_SNAPSHOT');
 const raw=snap.chess?.moves??[];
 const game=reconstructOnlineChess(raw);
 const moves=[...raw];
 if(snap.status==='waiting'&&moves.length)throw Error('INVALID_REMOTE_HISTORY');
 if(snap.status==='playing'&&snap.turn!==(game.turn()==='w'?1:2))throw Error('INVALID_REMOTE_HISTORY');
 const reports=snap.chess?.reports??{};
 if(typeof reports!=='object'||Array.isArray(reports)||Object.entries(reports).some(([k,v])=>!['1','2'].includes(k)||!RESULTS.includes(v)))throw Error('INVALID_REMOTE_HISTORY');
 if(snap.status==='finished'){
  // a finished game must come from two matching reports that agree with the replayed position when it is decisive
  if(reports['1']!==reports['2']||!reports['1'])throw Error('INVALID_REMOTE_HISTORY');
 }
 if(prev&&prev.instance===snap.instance&&prev.id===snap.id){
  const old=prev.chess?.moves??[];
  if(moves.length<old.length||old.some((m,i)=>moves[i]!==m))throw Error('INCONSISTENT_REMOTE_HISTORY');
 }
 return {game,moves};
}
export function localResult(game){const r=engineResult(game,false);return r.over?(r.winner==='w'?'white':r.winner==='b'?'black':'draw'):null}
const BAD={INVALID_REMOTE_SNAPSHOT:'Réponse du salon invalide.',INVALID_REMOTE_HISTORY:'Historique reçu invalide.',ILLEGAL_REMOTE_MOVE:'Un coup reçu est illégal.',INCONSISTENT_REMOTE_HISTORY:'Historique reçu incohérent.'};
export function start(host){
 const root=$('#online-root'),toggle=$('#online-toggle');
 let active=false,api,snapshot=null,game=null,blocked=null,channel,channelTopic,timer,busy=false,pending=null,loading,syncPromise,queued=false,gen=0,seq=0,connected=navigator.onLine,selected=null,targets=[],flipped=null,directoryOffset=0,orient=1;
 const message=t=>{const s=$('#online-status');if(s)s.textContent=t};
 function setBusy(v){busy=v;root.querySelectorAll('button').forEach(b=>b.disabled=(v&&b.dataset.always!=='true')||b.dataset.locked==='true')}
 async function load(){
  if(!loading)loading=(async()=>{
   for(const src of ['online-config.js','vendor/supabase-2.118.0.js','online-client.js','online-lifecycle.js']){
    if(src==='online-client.js'&&window.MiniOnline)continue;
    if(src==='online-lifecycle.js'&&window.MiniLifecycle)continue;
    await new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>{s.remove();no(Error('SDK_LOAD'))};document.head.appendChild(s)});
   }
   api=window.MiniOnline;await api.client();
  })().catch(e=>{loading=null;throw e});
  return loading;
 }
 const rpcGame=(kind,args={})=>api.rpc({create:'online_create_room_game',join:'online_join_room_game',list:'online_list_rooms_game',mine:'online_my_rooms_game'}[kind],{p_game:'chess',...args});
 let staleNotice=false;
 async function task(fn){
  if(busy)return;setBusy(true);const g=gen;
  try{await fn()}
  catch(error){
   if(active&&g===gen){
    message(api?api.friendly(error):'Connexion indisponible. Réessaie ou joue hors ligne.');
    if(snapshot&&/STALE_VERSION|NOT_YOUR_TURN|WRONG_PHASE/.test(error.message||'')){pending=null;await sync().catch(()=>{});if(active&&g===gen&&/STALE_VERSION/.test(error.message||''))staleNotice=true}
   }
  }finally{if(g===gen){setBusy(false);if(snapshot)renderRoom();if(staleNotice){staleNotice=false;message('Le salon a été actualisé. Réessaie.')}}}
 }
 function input(label,id,value,max){const w=el('label',label),i=el('input');i.id=id;i.value=value;i.maxLength=max;i.autocomplete='off';i.spellcheck=false;w.append(i);return w}
 const rnd=()=>{const a=['Chat','Panda','Loutre','Renard'],b=['Rose','Étoilé','Malin','Pastel'],n=new Uint32Array(2);crypto.getRandomValues(n);return a[n[0]%4]+' '+b[n[1]%4]};
 const pseudo=()=>{try{return window.RoukyProfile?.get()?.pseudo||localStorage.getItem('mini-online-pseudo')||rnd()}catch{return rnd()}};
 function setup(){
  root.replaceChildren();
  const top=el('div',null,'online-heading'),exit=button('Hors ligne',close);exit.dataset.always='true';
  top.append(el('strong','✦ Le petit salon'),exit);root.append(top);
  const c=el('div',null,'online-content');c.id='online-content';root.append(c);
  const s=el('p','','online-status');s.id='online-status';s.setAttribute('role','status');s.setAttribute('aria-live','polite');root.append(s);
 }
 async function lobby(){
  await stopChannel();clearInterval(timer);timer=null;snapshot=null;game=null;blocked=null;pending=null;selected=null;targets=[];directoryOffset=0;
  const box=$('#online-content');box.replaceChildren();
  const form=el('form',null,'online-form');
  form.append(input('Ton pseudo','online-pseudo',pseudo(),24),input('Nom du salon public','online-room-name','',40));
  const row=el('div',null,'online-actions');let ck=null,cn=null;
  const enter=create=>task(async()=>{
   const p=$('#online-pseudo').value.trim()||rnd(),name=$('#online-room-name').value.trim();
   try{if(window.RoukyProfile)RoukyProfile.save({pseudo:p});else localStorage.setItem('mini-online-pseudo',p)}catch{}
   let room;
   if(create){if(cn!==name){cn=name;ck=uuid()}room=await rpcGame('create',{p_name:name,p_pseudo:p,p_action:ck})}
   else room=await rpcGame('join',{p_name:name,p_pseudo:p});
   if(active)await enterRoom(room);
  });
  row.append(button('Créer',()=>enter(true),'primary'),button('Rejoindre',()=>enter(false)));
  form.onsubmit=e=>{e.preventDefault();enter(false)};form.append(row);box.append(form);
  box.append(el('p','Salons publics. Le pseudo n’est pas un compte. Garde ce navigateur pour retrouver ta place.','online-note'));
  const head=el('div',null,'online-heading');head.append(el('strong','Salons d’échecs'),button('Actualiser',()=>task(refreshDirectory)));
  box.append(head,el('div',null,'online-directory'));setBusy(busy);await refreshDirectory();
 }
 async function refreshDirectory(){
  const g=gen,[rooms,mine]=await Promise.all([rpcGame('list',{p_offset:directoryOffset}),rpcGame('mine')]);
  if(!active||g!==gen||snapshot)return;
  const list=root.querySelector('.online-directory');if(!list)return;list.replaceChildren();
  for(const r of mine.filter(r=>!r.game||r.game==='chess')){const b=button('Reprendre · '+r.name,()=>task(async()=>{const x=await api.rpc('online_room_status',{p_room:r.id});if(window.MiniLifecycle.isTerminated(x))await terminated(x);else await enterRoom(x)}));b.className='online-resume';list.append(b)}
  if(!rooms.length)list.append(el('p','Le premier salon pourrait être le tien ♡','online-note'));
  const st={waiting:'En attente',playing:'En cours',finished:'Terminée'};
  for(const r of rooms.filter(r=>r.game==='chess')){const i=button('',()=>{$('#online-room-name').value=r.name;$('#online-room-name').focus()});i.className='online-room';i.append(el('strong',r.name),el('small',r.host+' · '+r.count+'/'+r.capacity+' · '+st[r.status]));list.append(i)}
  message('Choisis un nom pour créer ou rejoindre un salon.');
 }
 async function stopChannel(){const o=channel;channel=null;channelTopic=null;if(o&&api){const c=await api.client();await c.removeChannel(o)}}
 async function subscribe(){
  if(!snapshot||!active||channelTopic===snapshot.topic)return;
  await stopChannel();if(!snapshot||!active)return;
  const c=await api.client(),topic=snapshot.topic,g=gen;await c.realtime.setAuth();channelTopic=topic;
  channel=c.channel(topic,{config:{private:true}}).on('broadcast',{event:'changed'},()=>{if(active&&g===gen)sync().catch(()=>{connected=false;renderRoom()})})
   .on('broadcast',{event:'terminated'},()=>{if(active&&g===gen)sync().catch(()=>{connected=false;renderRoom()})})
   .subscribe(s=>{if(!active||g!==gen||channelTopic!==topic)return;if(s==='SUBSCRIBED')sync().catch(()=>{});else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT')message('Temps réel indisponible. Actualisation automatique toutes les 10 secondes.')});
 }
 // The ONLY place a remote snapshot is accepted. Returns true when accepted.
 function accept(fresh){
  if(snapshot&&fresh&&fresh.id===snapshot.id&&fresh.instance===snapshot.instance&&Number.isInteger(fresh.version)&&fresh.version<snapshot.version)return false;
  try{
   const v=validateSnapshot(fresh,snapshot);
   snapshot=fresh;game=v.game;blocked=null;
   if(selected&&!game.moves({square:selected}).length){selected=null;targets=[]}
   if(snapshot.status!=='playing'){selected=null;targets=[]}
   return true;
  }catch(e){
   blocked=BAD[e.message]||'Historique reçu invalide.';
   if(!snapshot){/* first ever snapshot is untrusted: nothing to show */game=null;snapshot=fresh&&fresh.id?{...fresh,chess:{moves:[],reports:{}},status:'blocked',members:Array.isArray(fresh.members)?fresh.members:[]}:null}
   selected=null;targets=[];return false;
  }
 }
 async function enterRoom(room){
  snapshot=null;game=null;blocked=null;connected=navigator.onLine;pending=null;accept(room);
  if(!snapshot)throw Error('INVALID_REMOTE_SNAPSHOT');
  orient=snapshot.seat===2?2:1;flipped=null;renderRoom();await subscribe();await sync();
  clearInterval(timer);timer=setInterval(()=>{if(active&&snapshot&&navigator.onLine)sync(true).catch(()=>{connected=false;renderRoom()})},window.MiniLifecycle.HEARTBEAT_MS);
 }
 async function sync(heartbeat=false){
  if(!active||!snapshot||!api)return;
  if(syncPromise){queued=true;return syncPromise}
  const id=snapshot.id,g=gen,n=++seq;
  syncPromise=(async()=>{
   const fresh=await api.rpc(heartbeat?'online_heartbeat':'online_room_status',{p_room:id});
   if(active&&g===gen&&snapshot?.id===id&&n===seq&&window.MiniLifecycle.isTerminated(fresh)){await terminated(fresh);return}
   if(active&&g===gen&&snapshot?.id===id&&n===seq){accept(fresh);connected=navigator.onLine;renderRoom();await subscribe();setTimeout(()=>maybeReport().catch(()=>{}),0)}
  })();
  try{await syncPromise}finally{syncPromise=null;if(queued&&active&&snapshot?.id===id){queued=false;queueMicrotask(()=>sync().catch(()=>{}))}}
 }
 const canAct=()=>snapshot&&game&&!blocked&&connected&&!pending&&snapshot.status==='playing'&&snapshot.turn===snapshot.seat&&COLOR[snapshot.seat]===game.turn();
 // Every outgoing RPC goes through here. data/kind are exact; pending is kept ONLY for an unknown transport outcome.
 async function send(kind,data){
  await task(async()=>{
   if(!snapshot||blocked)return;
   if(!pending){
    // re-validate what we are about to build on
    validateSnapshot(snapshot,null);
    pending={p_room:snapshot.id,p_instance:snapshot.instance,p_version:snapshot.version,p_action:uuid(),p_kind:kind,p_data:data};
   }
   const a=pending;
   try{
    const res=await api.rpc('online_chess_action',a);
    pending=null;
    if(window.MiniLifecycle.isTerminated(res)){await terminated(res);return}
    await sync();message('');
   }catch(error){
    if(error?.code&&!/^08|^5/.test(error.code))pending=null;
    throw error;
   }
  });
 }
 let notice='',leaving=false;
 async function terminated(raw){
  if(leaving)return;
  const t=window.MiniLifecycle.clean(raw);
  notice=window.MiniLifecycle.message(t);pending=null;await lobby();message(notice);
 }
 async function depart(){
  // The server derives the actor from auth; the client never names who leaves.
  if(!snapshot)return;
  const id=snapshot.id;leaving=true;
  try{await window.MiniLifecycle.depart(api,id)}finally{leaving=false}
  notice='';await lobby();
 }
 async function retryPending(){
  // A retry must first look at fresh state: if it moved on, the old receipt is stale and is dropped, never rebased.
  await task(async()=>{
   const p=pending;if(!p)return;
   const fresh=await api.rpc('online_room_status',{p_room:p.p_room});
   if(window.MiniLifecycle.isTerminated(fresh)){pending=null;await terminated(fresh);return}
   pending=null;
   if(!accept(fresh)){renderRoom();return}
   if(snapshot.instance!==p.p_instance||snapshot.version!==p.p_version){message('La partie a changé. Plateau actualisé, rejoue ton coup.');return}
   pending=p;
  });
  if(pending)await send(pending.p_kind,pending.p_data);
 }
 async function maybeReport(){
  if(!snapshot||!game||blocked||pending||busy||snapshot.status!=='playing')return;
  const r=localResult(game);if(!r)return;
  if((snapshot.chess?.reports??{})[String(snapshot.seat)]===r)return;
  await send('report',{result:r});
 }
 function promote(moves){
  return new Promise(ok=>{
   const d=el('dialog');d.setAttribute('aria-label','Promotion');d.append(el('h2','Ta promotion'));
   const row=el('div',null,'online-actions');
   for(const [t,l] of [['q','Dame'],['r','Tour'],['b','Fou'],['n','Cavalier']]){const b=button('',()=>{d.close();d.remove();ok(moves.find(m=>m.promotion===t))});b.dataset.promotion=t;b.innerHTML=host.pieceSVG({type:t,color:game.turn()})+'<span>'+l+'</span>';row.append(b)}
   d.append(row,button('Annuler',()=>{d.close();d.remove();ok(null)}));d.addEventListener('cancel',()=>{d.remove();ok(null)});
   document.body.append(d);d.showModal();
  });
 }
 async function tap(sq){
  if(busy||!canAct()){return}
  const ms=targets.filter(m=>m.to===sq);
  if(ms.length){
   let m=ms[0];if(ms.some(x=>x.promotion)){m=await promote(ms);if(!m){selected=null;targets=[];renderRoom();return}}
   // final guard: board still the validated one and still our turn
   if(!canAct()||m.before!==game.fen()){selected=null;targets=[];renderRoom();return}
   selected=null;targets=[];await send('move',{uci:m.from+m.to+(m.promotion||'')});return;
  }
  const p=game.get(sq);selected=p&&p.color===game.turn()&&p.color===COLOR[snapshot.seat]&&selected!==sq?sq:null;
  targets=selected?game.moves({square:selected,verbose:true}):[];renderRoom();
 }
 function board(){
  const b=el('div',null,'oc-board'),last=game.history({verbose:true}).at(-1),down=flipped??orient;
  b.id='oc-board';b.setAttribute('role','group');b.setAttribute('aria-label','Échiquier en ligne, '+(down===2?'noirs':'blancs')+' en bas');
  const N={p:'pion',n:'cavalier',b:'fou',r:'tour',q:'dame',k:'roi'};
  for(let i=0;i<64;i++){
   const row=Math.floor(i/8),col=i%8,rank=down===2?row+1:8-row,file=down===2?7-col:col,sq='abcdefgh'[file]+rank,p=game.get(sq),legal=targets.some(m=>m.to===sq),c=document.createElement('button');
   c.type='button';c.className='chess-cell'+((file+rank)%2===1?' dark':'')+(sq===selected?' selected':'')+(legal?' legal':'')+(legal&&p?' capture':'')+(last&&(last.from===sq||last.to===sq)?' last':'')+(p?.type==='k'&&p.color===game.turn()&&game.isCheck()?' check':'');
   c.dataset.square=sq;c.setAttribute('aria-label',sq+(p?' '+N[p.type]+' '+(p.color==='w'?'blanc':'noir'):' vide')+(legal?', coup possible':''));
   c.dataset.locked=String(!canAct());
   if(p)c.innerHTML=host.pieceSVG(p);
   if(col===0){const s=el('small',String(rank),'rank');c.append(s)}
   if(row===7){const s=el('small','abcdefgh'[file],'file');c.append(s)}
   c.onclick=()=>tap(sq);b.append(c);
  }
  return b;
 }
 function renderRoom(){
  if(!snapshot||!active)return;
  const s=snapshot,box=$('#online-content');box.replaceChildren();
  const head=el('div',null,'online-heading');head.append(el('strong',s.name),button('Actualiser',()=>task(()=>sync())));box.append(head);
  const people=el('div',null,'online-members');
  for(const m of s.members)people.append(el('span',(SYM[m.seat]||'')+' '+m.name+' · '+(m.seat===1?'blancs':'noirs')+(m.host?' ♛':'')+(m.ready?' ✓':'')));
  box.append(people);
  const mine=s.members.find(m=>m.seat===s.seat);
  if(blocked){
   const w=el('p','⚠ '+blocked+' Les coups sont bloqués. La dernière position vérifiée reste affichée.','online-note online-alert');w.setAttribute('role','alert');w.id='oc-blocked';box.append(w);
  }
  if(s.status==='waiting'){
   box.append(el('p','Les deux personnes se préparent, puis l’hôte lance la partie. L’hôte joue les blancs.','online-note'));
   const row=el('div',null,'online-actions');
   const rb=button(mine?.ready?'Pas encore prête':'Prête !',()=>send(mine?.ready?'unready':'ready',{}),'primary');rb.dataset.locked=String(!!blocked||!!pending);row.append(rb);
   if(s.host){const st=button('Démarrer',()=>send('start',{}));st.dataset.locked=String(!!blocked||!!pending||s.members.length!==2||!s.members.every(m=>m.ready));row.append(st)}
   box.append(row);
  }else if(game){
   const wrap=el('div',null,'oc-wrap');wrap.append(board());box.append(wrap);
   const hist=game.history({verbose:true}).at(-1);
   box.append(el('p',hist?'Dernier coup · '+hist.san+' ('+hist.from+'–'+hist.to+')':'Aucun coup pour l’instant.','online-note oc-last'));
   box.append(button('Retourner',()=>{flipped=(flipped??orient)===1?2:1;renderRoom()}));
  }
  if(pending)box.append(button('Vérifier / réessayer la demande',()=>retryPending()));
  const leave=button('Quitter le salon',()=>{if(confirm(s.status==='playing'?'Quitter abandonne cette partie. Continuer ?':'Quitter ce salon ?'))task(depart)});
  leave.dataset.locked=String(!!blocked&&false);box.append(leave);
  const reps=s.chess?.reports??{};
  const info=blocked?blocked:!connected?'Reconnexion… Aucun coup envoyé hors connexion.':
   s.status==='waiting'?'Tu joues les '+(s.seat===1?'blancs':'noirs')+'. En attente des deux personnes.':
   s.status==='finished'?(s.winner?(s.members.find(m=>m.seat===s.winner)?.name||'L’autre personne')+' a gagné ! ✦':'Match nul, bien joué !'):
   game&&localResult(game)?(reps['1']&&reps['2']&&reps['1']!==reps['2']?'Résultats différents signalés. La partie reste ouverte.':'Fin de partie, confirmation du résultat…'):
   s.turn===s.seat?(game.isCheck()?'Échec ! ':'')+'À toi de jouer':'Au tour de '+(s.members.find(m=>m.seat===s.turn)?.name||'l’autre personne');
  if(!pending||blocked)message(info);
  setBusy(busy);
 }
 async function open(){
  if(active)return;active=true;gen++;root.hidden=false;document.body.classList.add('online-active');toggle.setAttribute('aria-pressed','true');setup();message('Connexion au petit salon…');
  await task(async()=>{await load();if(active)await lobby()});
  if(!snapshot&&active&&!root.querySelector('.online-form'))$('#online-content').append(button('Réessayer',()=>task(async()=>{await load();await lobby()})));
 }
 function close(){
  active=false;gen++;busy=false;root.hidden=true;document.body.classList.remove('online-active');toggle.setAttribute('aria-pressed','false');
  clearInterval(timer);timer=null;snapshot=null;game=null;pending=null;blocked=null;stopChannel().catch(()=>{});toggle.focus();
 }
 document.addEventListener('click',async e=>{
  const a=e.target.closest?.('a[href],a[data-home-link]');
  if(!a||!active||!snapshot||e.defaultPrevented||a.target||e.metaKey||e.ctrlKey||e.shiftKey||e.button)return;
  const u=new URL(a.href||a.dataset.homeLink||'./',location.href);
  if(u.origin===location.origin&&u.pathname===location.pathname)return;
  e.preventDefault();
  if(!confirm('Quitter ce salon avant de continuer ?'))return;
  try{await window.MiniLifecycle.depart(api,snapshot.id);location.href=u.href}
  catch(error){message(api.friendly(error)+' Réessaie de quitter le salon.')}
 },true);
 toggle.onclick=open;
 if(new URL(location.href).searchParams.get('mode')==='online')open();
 addEventListener('offline',()=>{connected=false;if(active&&snapshot)renderRoom()});
 addEventListener('online',()=>{if(active&&snapshot)sync().catch(()=>{})});
 document.addEventListener('visibilitychange',()=>{if(active&&snapshot&&document.visibilityState==='visible')sync(true).catch(()=>{connected=false;renderRoom()})});
}
