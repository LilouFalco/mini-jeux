'use strict';
// Online Qui est-ce LoL. The server stores each secret champion index and only returns your own choice,
// the turn and the last guess. The 24 champions are derived from the room id so both clients show the same board.
(() => {
 const $ = s => document.querySelector(s);
 const root = $('#online-root'), toggle = $('#online-toggle');
 const Q = window.QE, N = Q.N;
 const G = {game: 'quiestce', title: 'Salons Qui est-ce LoL', label: 'Qui est-ce LoL en ligne'};
 let active = false, api, snapshot, channel, channelTopic, timer, busy = false, pending = null;
 let retry = false, errorText = '', notice = '', leaving = false, loading, syncPromise, queuedSync = false, generation = 0, connected = navigator.onLine, seq = 0;
 let draft = {instance: null, sel: -1, editing: false, guessing: false, gsel: -1, elim: []}, outcomeKey = null, directoryOffset = 0;
 const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
 function button(text, fn, cls) { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
 function message(text) { const s = $('#online-status'); if (s && s.textContent !== text) s.textContent = text; }
 const rpcCall = (kind, args = {}) => api.rpc({create: 'online_create_room_game', join: 'online_join_room_game', list: 'online_list_rooms_game', mine: 'online_my_rooms_game'}[kind], {p_game: G.game, ...args});
 async function load() {
  if (!loading) loading = (async () => {
   for (const src of ['online-config.js', 'vendor/supabase-2.118.0.js', 'online-client.js', 'online-lifecycle.js']) {
    if (src === 'online-client.js' && window.MiniOnline) continue;
    if (src === 'online-lifecycle.js' && window.MiniLifecycle) continue;
    await new Promise((resolve, reject) => {
     const s = document.createElement('script'); s.src = src; s.onload = resolve;
     s.onerror = () => { s.remove(); reject(new Error('SDK_LOAD')); }; document.head.appendChild(s);
    });
   }
   api = window.MiniOnline; await api.client();
  })().catch(e => { loading = null; throw e; });
  return loading;
 }
 function setBusy(v) { busy = v; root.querySelectorAll('button').forEach(b => b.disabled = (v && b.dataset.always !== 'true') || b.dataset.locked === 'true'); }
 async function task(fn) {
  if (busy) return;
  setBusy(true); const g = generation; errorText = '';
  try { await fn(); }
  catch (error) {
   if (active && g === generation) {
    errorText = api ? api.friendly(error) : '';
    message(api ? api.friendly(error) : 'Connexion indisponible. Réessaie ou joue hors ligne.');
    if (snapshot && /STALE_VERSION|NOT_YOUR_TURN|WRONG_PHASE/.test(error.message || '')) { pending = null; await sync().catch(() => {}); }
   }
  } finally { if (g === generation) { setBusy(false); if (snapshot) renderRoom(); } }
 }
 function input(label, id, value, max) {
  const wrap = el('label', label); const i = el('input'); i.id = id; i.value = value; i.maxLength = max; i.autocomplete = 'off'; i.spellcheck = false; wrap.append(i); return wrap;
 }
 function randomName() { const a = ['Chat', 'Panda', 'Loutre', 'Renard'], b = ['Rose', 'Étoilé', 'Malin', 'Pastel']; const n = new Uint32Array(2); crypto.getRandomValues(n); return a[n[0] % 4] + ' ' + b[n[1] % 4]; }
 function pseudo() { try { return localStorage.getItem('mini-online-pseudo') || randomName(); } catch { return randomName(); } }
 function savePseudo(v) { try { if (window.RoukyProfile && RoukyProfile.save({pseudo: v})) return; localStorage.setItem('mini-online-pseudo', v); } catch {} }
 function setup() {
  root.replaceChildren();
  const top = el('div', null, 'online-heading'); const exit = button('Hors ligne', leaveOnline); exit.dataset.always = 'true';
  top.append(el('strong', '✦ Le petit salon'), exit); root.append(top);
  const content = el('div', null, 'online-content'); content.id = 'online-content'; root.append(content);
  const status = el('p', '', 'online-status'); status.id = 'online-status'; status.role = 'status'; status.setAttribute('aria-live', 'polite'); root.append(status);
 }
 async function lobby() {
  await stopChannel(); clearInterval(timer); timer = null; snapshot = null; pending = null; directoryOffset = 0; syncPromise = null; queuedSync = false;
  const box = $('#online-content'); box.replaceChildren();
  const form = el('form', null, 'online-form');
  form.append(input('Ton pseudo', 'online-pseudo', pseudo(), 24), input('Nom du salon public', 'online-room-name', '', 40));
  const row = el('div', null, 'online-actions'); let createKey = null, createName = null;
  const enter = create => task(async () => {
   const p = $('#online-pseudo').value.trim() || randomName(), name = $('#online-room-name').value.trim(); savePseudo(p);
   let room;
   if (create) { if (createName !== name) { createName = name; createKey = crypto.randomUUID(); } room = await rpcCall('create', {p_name: name, p_pseudo: p, p_action: createKey}); }
   else room = await rpcCall('join', {p_name: name, p_pseudo: p});
   if (active) await enterRoom(room);
  });
  row.append(button('Créer', () => enter(true), 'primary'), button('Rejoindre', () => enter(false)));
  form.onsubmit = e => { e.preventDefault(); enter(false); };
  form.append(row); box.append(form);
  box.append(el('p', 'Salons publics. Le pseudo n’est pas un compte. Garde ce navigateur pour retrouver ta place.', 'online-note'));
  const head = el('div', null, 'online-heading'); head.append(el('strong', G.title), button('Actualiser', () => task(refreshDirectory)));
  box.append(head, el('div', null, 'online-directory')); setBusy(busy); await refreshDirectory();
 }
 async function refreshDirectory() {
  const g = generation;
  const [rooms, mine] = await Promise.all([rpcCall('list', {p_offset: directoryOffset}), rpcCall('mine')]);
  if (!active || g !== generation || snapshot) return;
  const list = root.querySelector('.online-directory'); if (!list) return; list.replaceChildren();
  for (const room of mine.filter(r => !r.game || r.game === G.game)) {
   const b = button('Reprendre · ' + room.name, () => task(async () => { const r = await api.rpc('online_room_status', {p_room: room.id}); if (window.MiniLifecycle.isTerminated(r)) await terminated(r); else await enterRoom(r); }));
   b.className = 'online-resume'; list.append(b);
  }
  if (!rooms.length) list.append(el('p', 'Le premier salon pourrait être le tien ♡', 'online-note'));
  const statuses = {waiting: 'En attente', playing: 'En cours', finished: 'Terminée'};
  for (const room of rooms.filter(r => r.game === G.game)) {
   const item = button('', () => { $('#online-room-name').value = room.name; $('#online-room-name').focus(); }); item.className = 'online-room';
   item.append(el('strong', room.name), el('small', room.host + ' · ' + room.count + '/' + room.capacity + ' · ' + statuses[room.status])); list.append(item);
  }
  const pagination = el('div', null, 'online-actions');
  if (directoryOffset > 0) pagination.append(button('Précédents', () => task(async () => { directoryOffset = Math.max(0, directoryOffset - 30); await refreshDirectory(); })));
  if (rooms.length === 30 && directoryOffset < 990) pagination.append(button('Suivants', () => task(async () => { directoryOffset += 30; await refreshDirectory(); })));
  if (pagination.children.length) list.append(pagination);
  message(notice || 'Choisis un nom pour créer ou rejoindre un salon.');
 }
 async function stopChannel() { const old = channel; channel = null; channelTopic = null; if (old && api) { const c = await api.client(); await c.removeChannel(old); } }
 async function subscribe() {
  if (!snapshot || !active || channelTopic === snapshot.topic) return;
  await stopChannel(); if (!snapshot || !active) return;
  const c = await api.client(), topic = snapshot.topic, g = generation;
  await c.realtime.setAuth(); channelTopic = topic;
  const hint = () => { if (active && g === generation) sync().catch(() => { connected = false; renderRoom(); }); };
  channel = c.channel(topic, {config: {private: true, presence: {key: 'seat' + snapshot.seat}}})
   .on('broadcast', {event: 'changed'}, hint).on('broadcast', {event: 'terminated'}, hint)
   .on('presence', {event: 'leave'}, ({key}) => { if (!active || g !== generation || key === 'seat' + snapshot?.seat) return; connected = false; renderRoom(); sync(true).catch(() => {}); })
   .subscribe(status => {
    if (!active || g !== generation || channelTopic !== topic) return;
    if (status === 'SUBSCRIBED') { channel?.track({seat: snapshot?.seat, room: snapshot?.instance}).catch(() => {}); sync().catch(() => {}); }
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') message('Temps réel indisponible. Actualisation automatique toutes les 10 secondes.');
   });
 }
 async function enterRoom(room) {
  notice = ''; snapshot = room; connected = navigator.onLine; pending = null; renderRoom(); await subscribe(); await sync();
  clearInterval(timer);
  timer = setInterval(() => { if (active && snapshot && navigator.onLine) sync(true).catch(() => { connected = false; renderRoom(); }); }, window.MiniLifecycle.HEARTBEAT_MS);
 }
 async function sync(heartbeat = false) {
  if (!active || !snapshot || !api) return;
  if (syncPromise) { queuedSync = true; return syncPromise; }
  const id = snapshot.id, g = generation, n = ++seq;
  syncPromise = (async () => {
   const fresh = await api.rpc(heartbeat ? 'online_heartbeat' : 'online_room_status', {p_room: id});
   if (active && g === generation && snapshot?.id === id && n === seq) {
    if (window.MiniLifecycle.isTerminated(fresh)) { await terminated(fresh); return; }
    if (fresh.version >= snapshot.version) snapshot = fresh;
    connected = navigator.onLine; renderRoom(); await subscribe();
   }
  })();
  try { await syncPromise; } finally { syncPromise = null; if (queuedSync && active && snapshot?.id === id) { queuedSync = false; queueMicrotask(() => sync().catch(() => {})); } }
 }
 async function terminated(raw) {
  const t = window.MiniLifecycle.clean(raw); if (leaving) return;
  notice = window.MiniLifecycle.message(t); snapshot = null; pending = null; clearInterval(timer); timer = null; queuedSync = false; await lobby(); message(notice);
 }
 async function depart() {
  const id = snapshot.id; leaving = true;
  try { await window.MiniLifecycle.depart(api, id); } finally { leaving = false; }
  notice = ''; await lobby();
 }
 // One request at a time. An identical request is kept only after an unknown transport outcome.
 async function action(kind, data = {}, retried = false) {
  await task(async () => {
   if (!snapshot) return;
   if (!pending) pending = {p_room: snapshot.id, p_instance: snapshot.instance, p_version: snapshot.version, p_action: crypto.randomUUID(), p_kind: kind, p_data: data};
   const args = pending;
   try {
    const res = await api.rpc('online_hidden_action', args); pending = null;
    if (window.MiniLifecycle.isTerminated(res)) { await terminated(res); return; }
    await sync(); message('');
   } catch (error) {
    if (error?.code && !/^08|^5/.test(error.code)) pending = null;
    // Idempotent setup actions are re-based once on a fresh snapshot. Guesses never are: the player re-confirms.
    if (/STALE_VERSION/.test(error.message || '') && !retried && kind !== 'guess') {
     pending = null; const id = snapshot.id; const fresh = await api.rpc('online_room_status', {p_room: id});
     if (window.MiniLifecycle.isTerminated(fresh)) { await terminated(fresh); return; }
     if (snapshot?.id === id && fresh.version >= snapshot.version) snapshot = fresh;
     retry = true; return;
    }
    throw error;
   }
  });
  if (retry) { retry = false; await action(kind, data, true); }
 }
 function seeded(id) { let h = 1779033703; for (const ch of String(id)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
 let champs = [], champsFor = null;
 function board() { if (champsFor !== snapshot.id) { champs = Q.pick(N, seeded('rouky-qe|' + snapshot.id)); champsFor = snapshot.id; } return champs; }
 const own = () => snapshot?.hidden?.own || {};
 const elimKey = () => 'rouky-qe-online-' + snapshot.id + '-' + snapshot.instance;
 function loadElim() { try { const a = JSON.parse(localStorage.getItem(elimKey())); if (Array.isArray(a) && a.length === N) return a.map(Boolean); } catch {} return Array(N).fill(false); }
 function saveElim() { try { localStorage.setItem(elimKey(), JSON.stringify(draft.elim)); } catch {} }
 function tile(i, cls, onclick, extra) {
  const id = board()[i], b = el('button', null, 'qc ' + (cls || '')); b.type = 'button'; b.dataset.i = String(i); b.dataset.champ = id;
  b.setAttribute('aria-label', Q.name(id) + (extra || ''));
  const img = el('img'); img.src = 'lol/' + id + '.webp'; img.alt = ''; img.width = 96; img.height = 96; img.draggable = false;
  b.append(img, el('span', Q.name(id))); if (onclick) b.onclick = onclick; else b.dataset.locked = 'true'; return b;
 }
 function renderPick(box, mine) {
  const configured = Number.isInteger(own().choice) && !draft.editing;
  if (configured) {
   box.append(el('p', 'Ton champion secret est choisi ✦ L’autre ne peut pas le voir.', 'online-note'));
   const g = el('div', null, 'qg'); g.id = 'on-secret'; g.append(tile(own().choice, 'sel', null, ' (ton secret)')); box.append(g);
   const edit = button('Changer de champion', async () => { if (mine?.ready) await action('unready'); if (snapshot && !snapshot.members.find(m => m.seat === snapshot.seat)?.ready) { draft.editing = true; draft.sel = -1; renderRoom(); } }); edit.id = 'on-edit'; box.append(edit);
  } else {
   box.append(el('p', 'Touche ton champion secret, puis valide.', 'online-note'));
   const g = el('div', null, 'qg'); g.id = 'on-pick';
   for (let i = 0; i < N; i++) g.append(tile(i, i === draft.sel ? 'sel' : '', () => { draft.sel = i; renderRoom(); }));
   box.append(g);
   const ok = button('Ce sera lui · valider', async () => { await action('configure', {choice: draft.sel}); if (!pending && !errorText) { draft.editing = false; renderRoom(); } }, 'primary'); ok.id = 'on-validate';
   ok.dataset.locked = String(draft.sel < 0 || !!mine?.ready); box.append(el('div', null, 'online-actions')); box.lastChild.append(ok);
  }
  const row = el('div', null, 'online-actions');
  const ready = button(mine?.ready ? 'Pas encore prête' : 'Prête !', () => action(mine?.ready ? 'unready' : 'ready'), 'primary'); ready.id = 'on-ready';
  ready.dataset.locked = String(!configured && !mine?.ready || draft.editing); row.append(ready);
  if (snapshot.host) { const start = button('Démarrer', () => action('start')); start.id = 'on-start'; start.dataset.locked = String(snapshot.members.length !== 2 || !snapshot.members.every(m => m.ready)); row.append(start); }
  box.append(row);
 }
 // Normal rules (end-of-turn action, wrong guess loses) need SQL 004. Without it: simplified variant.
 const NORMAL = window.QE_NORMAL_RULES === true;
 function lastGuessText() {
  const lg = snapshot.hidden?.lastGuess; if (!lg) return '';
  const who = snapshot.members.find(m => m.seat === lg.seat)?.name || 'L’autre personne', nm = Q.name(board()[lg.choice]);
  return who + ' a deviné ' + nm + (lg.correct ? ' : bien vu !' : NORMAL ? ' : raté, c’est perdu.' : ' : raté, le tour passe.');
 }
 function renderPlay(box) {
  const s = snapshot, myTurn = s.status === 'playing' && s.turn === s.seat && connected && !pending, over = s.status === 'finished';
  const left = draft.elim.filter(x => !x).length;
  box.append(el('p', 'Il te reste ' + left + ' champions. ' + (NORMAL ? 'Règle classique : à ton tour, pose tes questions oui/non à voix haute ou par message (ce salon n’a pas de chat), puis touche « Fin du tour ». Si tu devines mal, tu perds. ' : 'Version simplifiée : le tour ne change que sur une mauvaise devinette (une erreur ne fait PAS perdre), donc devine seulement si tu es sûre. Les questions se posent à voix haute ou par message (pas de chat). ') + 'Barrer un champion reste sur ton écran uniquement.', 'online-note'));
  const sec = el('div', null, 'qe-me'); sec.id = 'on-me'; sec.append(el('small', 'Ton secret'));
  if (Number.isInteger(own().choice)) sec.append(tile(own().choice, 'sel', null, ' (ton secret)')); box.append(sec);
  if (draft.guessing && myTurn && !over) {
   box.append(el('p', 'C’est lequel ?', 'stage-title'));
   if (NORMAL) box.append(el('p', 'Attention : une mauvaise réponse fait perdre la partie.', 'online-note'));
   const g = el('div', null, 'qg'); g.id = 'on-guess-grid';
   for (let i = 0; i < N; i++) if (!draft.elim[i]) g.append(tile(i, i === draft.gsel ? 'sel' : '', () => { draft.gsel = i; renderRoom(); }));
   box.append(g);
   const row = el('div', null, 'online-actions');
   const back = button('Retour', () => { draft.guessing = false; draft.gsel = -1; renderRoom(); }); back.id = 'on-guess-back';
   const ok = button('C’est lui !', async () => { const c = draft.gsel; await action('guess', {choice: c}); if (!pending) { draft.guessing = false; draft.gsel = -1; renderRoom(); } }, 'primary'); ok.id = 'on-guess-confirm'; ok.dataset.locked = String(draft.gsel < 0);
   row.append(back, ok); box.append(row); return;
  }
  const g = el('div', null, 'qg'); g.id = 'on-board';
  for (let i = 0; i < N; i++) g.append(tile(i, draft.elim[i] ? 'x' : '', over ? null : () => { draft.elim[i] = !draft.elim[i]; saveElim(); renderRoom(); }, draft.elim[i] ? ' (barré)' : ''));
  box.append(g);
  if (!over) { const row = el('div', null, 'online-actions'); const guess = button('Je devine', () => { draft.guessing = true; draft.gsel = -1; renderRoom(); }); guess.id = 'on-guess'; guess.dataset.locked = String(!myTurn); row.append(guess);
   if (NORMAL) { const et = button('Fin du tour', () => action('endturn', {})); et.id = 'on-endturn'; et.dataset.locked = String(!myTurn); row.append(et); } box.append(row); }
 }
 function renderRoom() {
  if (!snapshot || !active) return;
  const s = snapshot, box = $('#online-content');
  if (draft.instance !== s.instance) draft = {instance: s.instance, sel: -1, editing: false, guessing: false, gsel: -1, elim: loadElim()};
  box.replaceChildren();
  const head = el('div', null, 'online-heading'); head.append(el('strong', s.name), button('Actualiser', () => task(() => sync()))); box.append(head);
  const people = el('div', null, 'online-members');
  for (const m of s.members) people.append(el('span', '✦ ' + m.name + ' · place ' + m.seat + (m.host ? ' ♛' : '') + (m.ready ? ' ✓' : ''))); box.append(people);
  const mine = s.members.find(m => m.seat === s.seat), turn = s.members.find(m => m.seat === s.turn);
  if (s.status === 'waiting') renderPick(box, mine); else renderPlay(box);
  if (pending) box.append(button('Vérifier / réessayer la demande', () => action(pending.p_kind, pending.p_data)));
  const leave = button('Quitter le salon', () => { if (confirm(s.status === 'playing' ? 'Quitter abandonne cette manche. Continuer ?' : 'Quitter ce salon ?')) task(depart); });
  box.append(leave);
  const lg = lastGuessText();
  const info = !connected ? 'Reconnexion… Aucune réponse envoyée hors connexion.' :
   s.status === 'waiting' ? (s.members.length < 2 ? 'En attente d’une deuxième personne.' : 'Choisis ton secret, puis sois prête. L’hôte lance la partie.') :
   s.status === 'finished' ? ((s.members.find(m => m.seat === s.winner)?.name || 'L’autre personne') + ' a gagné ! ' + lg + ' ✦ Pour rejouer, quitte le salon et crée-en un nouveau.') :
   (lg ? lg + ' ' : '') + (s.turn === s.seat ? (NORMAL ? 'À toi : pose tes questions à voix haute, puis « Fin du tour » ou devine (une erreur fait perdre).' : 'À toi : pose tes questions, ou devine (une erreur passe le tour).') : 'Au tour de ' + (turn?.name || 'l’autre personne') + (NORMAL ? '…' : ' de jouer…'));
  if (!pending) message(errorText || info);
  if (s.status === 'finished' && s.members.length === 2 && s.seat) {
   const key = s.instance + '|' + s.version;
   if (key !== outcomeKey) { outcomeKey = key; window.RoukyMascot?.outcome?.(s.winner === s.seat ? 'win' : 'loss', 'player', $('#online-status')); }
  } else if (s.status !== 'finished') outcomeKey = null;
  setBusy(busy);
 }
 async function open() {
  if (active) return; active = true; generation++; root.hidden = false; document.body.classList.add('online-active');
  toggle.setAttribute('aria-pressed', 'true'); setup(); message('Connexion au petit salon…');
  await task(async () => { await load(); if (active) await lobby(); });
  if (!snapshot && active && !root.querySelector('.online-form')) $('#online-content').append(button('Réessayer', () => task(async () => { await load(); await lobby(); })));
 }
 async function leaveOnline() {
  if (busy) return;
  if (!snapshot) { close(); return; }
  await task(async () => {
   leaving = true;
   try { await window.MiniLifecycle.depart(api, snapshot.id); } finally { leaving = false; }
   close();
  });
 }
 function close() {
  active = false; generation++; busy = false; root.hidden = true; document.body.classList.remove('online-active'); toggle.setAttribute('aria-pressed', 'false');
  clearInterval(timer); timer = null; snapshot = null; pending = null; stopChannel().catch(() => {}); toggle.focus();
 }
 document.addEventListener('click', async e => {
  const a = e.target.closest?.('[data-home-link], a[href]'); const dest = a && (a.href || a.dataset.homeLink || './');
  if (!a || !active || !snapshot || e.defaultPrevented || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const u = new URL(dest, location.href); if (u.origin === location.origin && u.pathname === location.pathname) return;
  e.preventDefault(); if (!confirm('Quitter ce salon avant de continuer ?')) return;
  try { await window.MiniLifecycle.depart(api, snapshot.id); location.href = u.href; } catch (error) { message(api.friendly(error) + ' Réessaie de quitter le salon.'); }
 }, true);
 toggle.onclick = open;
 if (new URLSearchParams(location.search).get('mode') === 'online') open();
  window.addEventListener('offline', () => { connected = false; if (active && snapshot) renderRoom(); });
 window.addEventListener('online', () => { if (active && snapshot) sync().catch(() => {}); });
 document.addEventListener('visibilitychange', () => { if (active && snapshot && document.visibilityState === 'visible') sync(true).catch(() => { connected = false; renderRoom(); }); });
 window.RoukyQuiestceOnline = {version: 1};
})();
