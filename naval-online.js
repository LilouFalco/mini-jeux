'use strict';
// Online Bataille navale. The server owns fleets and shots. The client only ever receives its own fleet,
// the shot map (seat -> cell -> hit boolean) and the phase, never the enemy fleet.
(() => {
 const $ = s => document.querySelector(s);
 const root = $('#online-root'), toggle = $('#online-toggle');
 const V = window.Naval, N = V.N, FLEET = V.FLEET;
 const G = {game: 'naval', title: 'Salons de bataille navale', label: 'Bataille navale en ligne'};
 let active = false, api, snapshot, channel, channelTopic, timer, busy = false, pending = null;
 let retry = false, errorText = '', notice = '', leaving = false, loading, syncPromise, queuedSync = false, generation = 0, connected = navigator.onLine, seq = 0;
 let draft = {instance: null, ships: [], h: true, hover: -1, editing: false}, outcomeKey = null, directoryOffset = 0;
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
    if (snapshot && /STALE_VERSION|NOT_YOUR_TURN|ALREADY_SHOT|WRONG_PHASE/.test(error.message || '')) { pending = null; await sync().catch(() => {}); }
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
    // Idempotent setup actions are re-based once on a fresh snapshot. Shots never are: the player re-confirms.
    if (/STALE_VERSION/.test(error.message || '') && !retried && kind !== 'shoot') {
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
 const own = () => snapshot?.hidden?.own || {};
 const shotsOf = seat => (snapshot?.hidden?.shots || {})[String(seat)] || {};
 function previewShip(i) {
  if (draft.ships.length >= FLEET.length) return null;
  const len = FLEET[draft.ships.length]; let r = Math.floor(i / N), c = i % N;
  if (draft.h) c = Math.min(c, N - len); else r = Math.min(r, N - len);
  const cells = V.cellsOf(r, c, len, draft.h);
  return {len, cells, ok: V.canPlace(draft.ships, r, c, len, draft.h)};
 }
 function grid(id, label, cellFn, clickFn) {
  const g = el('div', null, 'ngrid'); g.id = id; g.role = 'grid'; g.setAttribute('aria-label', label); g.style.setProperty('--n', N);
  for (let i = 0; i < N * N; i++) {
   const b = el('button', '', 'nc'); b.type = 'button'; b.role = 'gridcell'; b.dataset.cell = String(i);
   const state = cellFn(i, b); b.dataset.locked = String(!clickFn || !!state.locked);
   b.setAttribute('aria-label', 'Case ' + String.fromCharCode(65 + i % N) + (Math.floor(i / N) + 1) + (state.text || ''));
   if (state.cls) b.className += ' ' + state.cls; if (state.mark) b.textContent = state.mark;
   if (clickFn) b.onclick = () => clickFn(i);
   g.append(b);
  }
  return g;
 }
 function renderPlacement(box, mine) {
  const configured = Array.isArray(own().ships) && !draft.editing, hasFleet = Array.isArray(own().ships);
  if (!configured && draft.ships.length === 0 && false) return;
  if (configured) {
   void hasFleet;
   box.append(el('p', 'Ta flotte est en place ✦', 'online-note'));
   const cells = new Set(own().cells || []);
   box.append(grid('on-own', 'Ma flotte', i => ({cls: cells.has(i) ? 'ship' : '', text: cells.has(i) ? ' bateau' : ''}), null));
   const edit = button('Modifier ma flotte', async () => { if (mine?.ready) await action('unready'); if (snapshot && !snapshot.members.find(m => m.seat === snapshot.seat)?.ready) { draft.ships = []; draft.editing = true; renderRoom(); } }); edit.id = 'on-edit'; box.append(edit);
  } else {
   const n = draft.ships.length;
   box.append(el('p', n < FLEET.length ? 'Place ton bateau de ' + FLEET[n] + ' cases.' : 'Flotte prête, valide-la.', 'online-note'));
   const cells = new Set(draft.ships.flatMap(s => s.cells));
   const pv = draft.hover >= 0 ? previewShip(draft.hover) : null;
   const g = grid('on-place', 'Placer ma flotte', i => {
    const p = pv && pv.cells.includes(i);
    return {cls: cells.has(i) ? 'ship' : p ? (pv.ok ? 'prev' : 'bad') : '', text: cells.has(i) ? ' bateau' : '', locked: n >= FLEET.length};
   }, i => { const p = previewShip(i); if (!p || !p.ok) { message('Là, ça ne rentre pas.'); return; } draft.ships.push({len: p.len, cells: p.cells}); draft.hover = -1; renderRoom(); });
   box.append(g);
  }
  const tools = el('div', null, 'online-actions');
  if (!configured) {
   const rot = button('Tourner', () => { draft.h = !draft.h; renderRoom(); }); rot.id = 'on-rot';
   const undo = button('Annuler', () => { draft.ships.pop(); renderRoom(); }); undo.id = 'on-undo'; undo.dataset.locked = String(!draft.ships.length);
   const rnd = button('Au hasard', () => { draft.ships = V.randomFleet(); renderRoom(); }); rnd.id = 'on-rand';
   const ok = button('Valider la flotte', async () => { await action('configure', {ships: draft.ships.map(s => [...s.cells])}); if (!pending && !errorText) { draft.editing = false; renderRoom(); } }, 'primary'); ok.id = 'on-validate';
   ok.dataset.locked = String(draft.ships.length < FLEET.length || !!mine?.ready);
   tools.append(rot, undo, rnd, ok);
  }
  const row = el('div', null, 'online-actions');
  const ready = button(mine?.ready ? 'Pas encore prête' : 'Prête !', () => action(mine?.ready ? 'unready' : 'ready'), 'primary'); ready.id = 'on-ready';
  ready.dataset.locked = String(!configured && !mine?.ready || draft.editing);
  row.append(ready);
  if (snapshot.host) { const start = button('Démarrer', () => action('start')); start.id = 'on-start'; start.dataset.locked = String(snapshot.members.length !== 2 || !snapshot.members.every(m => m.ready)); row.append(start); }
  box.append(tools, row);
 }
 function renderBattle(box) {
  const s = snapshot, foe = 3 - s.seat, mine = shotsOf(s.seat), theirs = shotsOf(foe);
  const myTurn = s.status === 'playing' && s.turn === s.seat && connected && !pending;
  const fleet = new Set(own().cells || []);
  const wrap = el('div', null, 'on-grids');
  const a = el('div'); a.append(el('p', 'Tirs sur la flotte adverse', 'gl'));
  a.append(grid('on-target', 'Flotte adverse', i => {
   const k = String(i), seen = k in mine;
   return {cls: seen ? (mine[k] ? 'hit' : 'miss') : '', mark: seen ? (mine[k] ? '●' : '○') : '', text: seen ? (mine[k] ? ' touché' : " à l'eau") : '', locked: !myTurn || seen};
  }, i => action('shoot', {cell: i})));
  const b = el('div'); b.append(el('p', 'Ma flotte', 'gl'));
  b.append(grid('on-own', 'Ma flotte', i => {
   const k = String(i), seen = k in theirs, ship = fleet.has(i);
   return {cls: (ship ? 'ship ' : '') + (seen ? (theirs[k] ? 'hit' : 'miss') : ''), mark: seen ? (theirs[k] ? '●' : '○') : '', text: (ship ? ' bateau' : '') + (seen ? (theirs[k] ? ' touché' : " à l'eau") : '')};
  }, null)); b.querySelector('.ngrid').classList.add('small');
  wrap.append(a, b); box.append(wrap);
 }
 function renderRoom() {
  if (!snapshot || !active) return;
  const s = snapshot, box = $('#online-content');
  if (draft.instance !== s.instance) draft = {instance: s.instance, ships: [], h: true, hover: -1, editing: false};
  box.replaceChildren();
  const head = el('div', null, 'online-heading'); head.append(el('strong', s.name), button('Actualiser', () => task(() => sync()))); box.append(head);
  const people = el('div', null, 'online-members');
  for (const m of s.members) people.append(el('span', '⚓ ' + m.name + ' · place ' + m.seat + (m.host ? ' ♛' : '') + (m.ready ? ' ✓' : ''))); box.append(people);
  const mine = s.members.find(m => m.seat === s.seat), turn = s.members.find(m => m.seat === s.turn);
  if (s.status === 'waiting') renderPlacement(box, mine); else renderBattle(box);
  if (pending) box.append(button('Vérifier / réessayer la demande', () => action(pending.p_kind, pending.p_data)));
  const leave = button('Quitter le salon', () => { if (confirm(s.status === 'playing' ? 'Quitter abandonne cette manche. Continuer ?' : 'Quitter ce salon ?')) task(depart); });
  box.append(leave);
  const info = !connected ? 'Reconnexion… Aucun tir envoyé hors connexion.' :
   s.status === 'waiting' ? (s.members.length < 2 ? 'En attente d’une deuxième personne.' : 'Place ta flotte, puis sois prête. L’hôte lance la partie.') :
   s.status === 'finished' ? ((s.members.find(m => m.seat === s.winner)?.name || 'L’autre personne') + ' a gagné ! ✦ Pour rejouer, quitte le salon et crée-en un nouveau.') :
   s.turn === s.seat ? 'À toi de tirer ⚓' : 'Au tour de ' + (turn?.name || 'l’autre personne') + '…';
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
 document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', e => { if (active) { e.preventDefault(); e.stopImmediatePropagation(); leaveOnline(); } }, {capture: true}));
 window.addEventListener('offline', () => { connected = false; if (active && snapshot) renderRoom(); });
 window.addEventListener('online', () => { if (active && snapshot) sync().catch(() => {}); });
 document.addEventListener('visibilitychange', () => { if (active && snapshot && document.visibilityState === 'visible') sync(true).catch(() => { connected = false; renderRoom(); }); });
 window.RoukyNavalOnline = {version: 1};
})();
