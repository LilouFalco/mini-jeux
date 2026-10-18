'use strict';
(() => {
 const $ = s => document.querySelector(s);
 const root = $('#online-root'), toggle = $('#online-toggle');
 let active = false, api, snapshot, channel, channelTopic, timer, busy = false, pending = null;
 let directoryOffset = 0;
 let loading, syncPromise, queuedSync = false, generation = 0, connected = navigator.onLine, requestGeneration = 0;
 const symbols = {1: '♥', 2: '✦'};
 const el = (tag, text, cls) => {
  const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e;
 };
 function button(text, fn, cls) { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
 function message(text) { $('#online-status').textContent = text; }
 async function load() {
  if (!loading) loading = (async () => {
   for (const src of ['online-config.js', 'vendor/supabase-2.118.0.js', 'online-client.js']) {
    if (src === 'online-client.js' && window.MiniOnline) continue;
    await new Promise((resolve, reject) => {
     const s = document.createElement('script'); s.src = src; s.onload = resolve;
     s.onerror = () => { s.remove(); reject(new Error('SDK_LOAD')); }; document.head.appendChild(s);
    });
   }
   api = window.MiniOnline; await api.client();
  })().catch(e => { loading = null; throw e; });
  return loading;
 }
 function setBusy(v) {
  busy = v;
  root.querySelectorAll('button').forEach(b => b.disabled = (v && b.dataset.always !== 'true') || b.dataset.locked === 'true');
 }
 async function task(fn) {
  if (busy) return;
  setBusy(true); const g = generation;
  try { await fn(); }
  catch (error) {
   if (active && g === generation) {
    message(api ? api.friendly(error) : 'Connexion indisponible. Réessaie ou joue hors ligne.');
    if (snapshot && /STALE_VERSION|NOT_YOUR_TURN|CELL_OCCUPIED/.test(error.message || '')) {
     pending = null; await sync().catch(() => {});
    }
   }
  } finally { if (g === generation) { setBusy(false); if (snapshot) renderRoom(); } }
 }
 function input(label, id, value, max) {
  const wrap = el('label', label); const i = el('input'); i.id = id; i.value = value; i.maxLength = max;
  i.autocomplete = 'off'; i.spellcheck = false; wrap.append(i); return wrap;
 }
 function randomName() {
  const a = ['Chat', 'Panda', 'Loutre', 'Renard'], b = ['Rose', 'Étoilé', 'Malin', 'Pastel'];
  const n = new Uint32Array(2); crypto.getRandomValues(n); return a[n[0] % a.length] + ' ' + b[n[1] % b.length];
 }
 function pseudo() { try { return localStorage.getItem('mini-online-pseudo') || randomName(); } catch { return randomName(); } }
 function savePseudo(v) { try { localStorage.setItem('mini-online-pseudo', v); } catch {} }
 function setup() {
  root.replaceChildren();
  const top = el('div', null, 'online-heading');
  const exit = button('Hors ligne', close); exit.dataset.always = 'true';
  top.append(el('strong', '✦ Le petit salon'), exit); root.append(top);
  const content = el('div', null, 'online-content'); content.id = 'online-content'; root.append(content);
  const status = el('p', '', 'online-status'); status.id = 'online-status'; status.role = 'status';
  status.setAttribute('aria-live', 'polite'); root.append(status);
 }
 async function lobby() {
  await stopChannel(); clearInterval(timer); timer = null; snapshot = null; pending = null; directoryOffset = 0;
  const box = $('#online-content'); box.replaceChildren();
  const form = el('form', null, 'online-form');
  form.append(input('Ton pseudo', 'online-pseudo', pseudo(), 24), input('Nom du salon public', 'online-room-name', '', 40));
  const row = el('div', null, 'online-actions');
  let createKey = null, createName = null;
  const enter = create => task(async () => {
   const p = $('#online-pseudo').value.trim() || randomName(), name = $('#online-room-name').value.trim();
   savePseudo(p);
   let room;
   if (create) {
    if (createName !== name) { createName = name; createKey = crypto.randomUUID(); }
    room = await api.rpc('online_create_room', {p_name: name, p_pseudo: p, p_action: createKey});
   } else room = await api.rpc('online_join_room', {p_name: name, p_pseudo: p});
   if (!active) return; await enterRoom(room);
  });
  row.append(button('Créer', () => enter(true), 'primary'), button('Rejoindre', () => enter(false)));
  form.onsubmit = e => { e.preventDefault(); enter(false); };
  form.append(row); box.append(form);
  box.append(el('p', 'Salons publics. Le pseudo n’est pas un compte. Garde ce navigateur pour retrouver ta place.', 'online-note'));
  const head = el('div', null, 'online-heading');
  head.append(el('strong', 'Salons de morpion'), button('Actualiser', () => task(refreshDirectory)));
  box.append(head, el('div', null, 'online-directory')); await refreshDirectory();
 }
 async function refreshDirectory() {
  const g = generation;
  const [rooms, mine] = await Promise.all([api.rpc('online_list_rooms', {p_offset: directoryOffset}), api.rpc('online_my_rooms')]);
  if (!active || g !== generation || snapshot) return;
  const list = root.querySelector('.online-directory'); if (!list) return; list.replaceChildren();
  for (const room of mine) {
   const b = button('Reprendre · ' + room.name, () => task(async () => enterRoom(await api.rpc('online_get_room', {p_room: room.id}))));
   b.className = 'online-resume'; list.append(b);
  }
  if (!rooms.length) list.append(el('p', 'Le premier salon pourrait être le tien ♡', 'online-note'));
  const statuses = {waiting: 'En attente', playing: 'En cours', finished: 'Terminée'};
  for (const room of rooms.filter(r => r.game === 'morpion')) {
   const item = button('', () => { $('#online-room-name').value = room.name; $('#online-room-name').focus(); });
   item.className = 'online-room';
   item.append(el('strong', room.name), el('small', room.host + ' · ' + room.count + '/' + room.capacity + ' · ' + statuses[room.status]));
   list.append(item);
  }
  const pagination = el('div', null, 'online-actions');
  if (directoryOffset > 0) pagination.append(button('Précédents', () => task(async () => { directoryOffset = Math.max(0, directoryOffset - 30); await refreshDirectory(); })));
  if (rooms.length === 30 && directoryOffset < 990) pagination.append(button('Suivants', () => task(async () => { directoryOffset += 30; await refreshDirectory(); })));
  if (pagination.children.length) list.append(pagination);
  message('Choisis un nom pour créer ou rejoindre un salon.');
 }
 async function stopChannel() {
  const old = channel; channel = null; channelTopic = null;
  if (old && api) { const c = await api.client(); await c.removeChannel(old); }
 }
 async function subscribe() {
  if (!snapshot || !active || channelTopic === snapshot.topic) return;
  await stopChannel(); if (!snapshot || !active) return;
  const c = await api.client(), topic = snapshot.topic, g = generation;
  await c.realtime.setAuth();
  channelTopic = topic;
  channel = c.channel(topic, {config: {private: true}})
   .on('broadcast', {event: 'changed'}, () => {
    // Broadcast is only an invalidation hint, including if a malicious sender lies.
    if (active && g === generation) sync().catch(() => { connected = false; renderRoom(); });
   })
   .subscribe(status => {
    if (!active || g !== generation || channelTopic !== topic) return;
    if (status === 'SUBSCRIBED') sync().catch(() => {});
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
     message('Temps réel indisponible. Actualisation automatique toutes les 20 secondes.');
    }
   });
 }
 async function enterRoom(room) {
  snapshot = room; connected = navigator.onLine; pending = null; renderRoom(); await subscribe(); await sync();
  clearInterval(timer);
  timer = setInterval(() => {
   if (active && snapshot && document.visibilityState === 'visible' && navigator.onLine) sync(true).catch(() => { connected = false; renderRoom(); });
  }, 20000);
 }
 async function sync(heartbeat = false) {
  if (!active || !snapshot || !api) return;
  if (syncPromise) { queuedSync = true; return syncPromise; }
  const id = snapshot.id, g = generation, seq = ++requestGeneration;
  syncPromise = (async () => {
   const fresh = await api.rpc(heartbeat ? 'online_heartbeat' : 'online_get_room', {p_room: id});
   if (active && g === generation && snapshot?.id === id && seq === requestGeneration) {
    if (fresh.version >= snapshot.version) snapshot = fresh;
    connected = navigator.onLine; renderRoom(); await subscribe();
   }
  })();
  try { await syncPromise; }
  finally {
   syncPromise = null;
   if (queuedSync && active && snapshot?.id === id) { queuedSync = false; queueMicrotask(() => sync().catch(() => {})); }
  }
 }
 async function action(kind, cell = null) {
  await task(async () => {
   if (!snapshot) return;
   if (!pending) pending = {p_room: snapshot.id, p_instance: snapshot.instance, p_version: snapshot.version,
    p_action: crypto.randomUUID(), p_kind: kind, p_cell: cell};
   const args = pending;
   try {
    await api.rpc('online_action', args);
    pending = null;
    if (args.p_kind === 'leave') { await lobby(); return; }
    await sync(); message('');
   } catch (error) {
    // Keep an identical request only on an unknown transport outcome, never rebase it.
    if (error?.code && !/^08|^5/.test(error.code)) pending = null;
    throw error;
   }
  });
 }
 function renderRoom() {
  if (!snapshot || !active) return;
  const s = snapshot, box = $('#online-content'); box.replaceChildren();
  const head = el('div', null, 'online-heading'); head.append(el('strong', s.name), button('Actualiser', () => task(() => sync())));
  box.append(head);
  const people = el('div', null, 'online-members');
  for (const m of s.members) people.append(el('span', symbols[m.seat] + ' ' + m.name + ' · place ' + m.seat + (m.host ? ' ♛' : '') + (m.ready ? ' ✓' : '')));
  box.append(people);
  const mine = s.members.find(m => m.seat === s.seat), turn = s.members.find(m => m.seat === s.turn);
  if (s.status === 'waiting') {
   box.append(el('p', 'Les deux personnes se préparent, puis l’hôte lance la partie.', 'online-note'));
   const row = el('div', null, 'online-actions');
   row.append(button(mine?.ready ? 'Pas encore prête' : 'Prête !', () => action(mine?.ready ? 'unready' : 'ready'), 'primary'));
   if (s.host) {
    const start = button('Démarrer', () => action('start')); start.dataset.locked = String(s.members.length !== 2 || !s.members.every(m => m.ready)); row.append(start);
   }
   box.append(row);
  } else {
   const board = el('div', null, 'online-board'); board.role = 'grid'; board.setAttribute('aria-label', 'Morpion en ligne');
   s.board.forEach((v, i) => {
    const b = button(v ? symbols[v] : '', () => action('place', i));
    b.className = 'mcell' + (v ? ' p' + v : '') + (s.line.includes(i) ? ' win' : '');
    b.role = 'gridcell'; b.setAttribute('aria-label', 'Case ' + (i + 1) + (v ? ' ' + symbols[v] : ' vide'));
    b.dataset.locked = String(!!v || s.status !== 'playing' || s.turn !== s.seat || !connected || !!pending); board.append(b);
   });
   box.append(board);
   if (s.status === 'finished' && s.members.length === 2) box.append(button('Proposer une revanche', () => action('rematch')));
  }
  if (pending) box.append(button('Vérifier / réessayer la demande', () => action(pending.p_kind, pending.p_cell)));
  const leave = button('Quitter le salon', () => {
   if (confirm(s.status === 'playing' ? 'Quitter abandonne cette manche. Continuer ?' : 'Quitter ce salon ?')) action('leave');
  });
  box.append(leave);
  const info = !connected ? 'Reconnexion… Aucun coup envoyé hors connexion.' :
   s.status === 'waiting' ? 'Tu joues ' + symbols[s.seat] + '. En attente des deux personnes.' :
   s.status === 'finished' ? (s.winner ? (s.members.find(m => m.seat === s.winner)?.name || 'L’autre personne') + ' a gagné ! ✦' : 'Match nul, bien joué !') :
   s.turn === s.seat ? 'À toi de jouer ' + symbols[s.seat] : 'Au tour de ' + turn?.name + ' ' + symbols[s.turn];
  if (!pending) message(info);
  setBusy(busy);
 }
 async function open() {
  if (active) return; active = true; generation++; root.hidden = false; document.body.classList.add('online-active');
  toggle.setAttribute('aria-pressed', 'true'); setup(); message('Connexion au petit salon…');
  await task(async () => { await load(); if (active) await lobby(); });
  if (!snapshot && active && !root.querySelector('.online-form')) {
   $('#online-content').append(button('Réessayer', () => task(async () => { await load(); await lobby(); })));
  }
 }
 function close() {
  // Returning to local games reserves the guest seat; only Quitter abandons it.
  active = false; generation++; busy = false; root.hidden = true;
  document.body.classList.remove('online-active'); toggle.setAttribute('aria-pressed', 'false');
  clearInterval(timer); timer = null; snapshot = null; pending = null;
  stopChannel().catch(() => {}); toggle.focus();
 }
 toggle.onclick = open;
 document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { if (active) close(); }, {capture: true}));
 window.addEventListener('offline', () => { connected = false; if (active && snapshot) renderRoom(); });
 window.addEventListener('online', () => { if (active && snapshot) sync().catch(() => {}); });
 document.addEventListener('visibilitychange', () => { if (active && snapshot && document.visibilityState === 'visible') sync(true).catch(() => { connected = false; renderRoom(); }); });
})();
