'use strict';
// Server-owned Time’s Up. Only the active actor receives the current card.
(() => {
 const $ = s => document.querySelector(s);
 const root = $('#online-root'), toggle = $('#online-toggle');
 const G = {game: 'timesup', title: 'Salons de Time’s Up', label: 'Time’s Up en ligne'};
 let active = false, api, snapshot, channel, channelTopic, timer, busy = false, pending = null;
 let retry = false, errorText = '', notice = '', leaving = false, loading, syncPromise, queuedSync = false, generation = 0, connected = navigator.onLine, seq = 0;
 let directoryOffset = 0;
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
    if (snapshot && /STALE_VERSION|NOT_YOUR_TURN|TURN_EXPIRED|WRONG_PHASE/.test(error.message || '')) { pending = null; await sync().catch(() => {}); }
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
    if (/STALE_VERSION/.test(error.message || '') && !retried && ['ready', 'unready'].includes(kind)) {
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

 const team = seat => (seat - 1) % 2;
 const teams = ['Équipe rose', 'Équipe crème'];
 const rules = ['Décris avec des phrases, sans dire le mot.', 'Un seul mot par carte.', 'Mime uniquement, sans son.'];
 function control(box, id, text, kind, locked = false) {
  const b = button(text, () => action(kind), 'primary'); b.id = id;
  b.dataset.locked = String(locked || !connected || !!pending); box.append(b);
 }
 function renderRoom() {
  if (!snapshot || !active) return;
  const s = snapshot, h = s.hidden || {}, box = $('#online-content');
  box.replaceChildren();
  const head = el('div', null, 'online-heading');
  head.append(el('strong', s.name), button('Actualiser', () => task(() => sync()))); box.append(head);
  const people = el('div', null, 'online-members');
  for (const m of s.members) people.append(el('span', m.name + ' · ' + teams[team(m.seat)] + (m.host ? ' ♛' : '') + (m.ready ? ' ✓' : '')));
  box.append(people);
  const mine = s.members.find(m => m.seat === s.seat), actor = s.members.find(m => m.seat === s.turn);
  if (s.status === 'waiting') {
   box.append(el('p', '4 à 12 personnes, en nombre pair. Places impaires contre places paires, avec autant de joueurs de chaque côté. 16 cartes, 60 secondes, trois manches. Prévoyez un appel vocal ou jouez dans la même pièce.', 'online-note'));
   control(box, 'tu-ready', mine?.ready ? 'Pas encore prête' : 'Prête !', mine?.ready ? 'unready' : 'ready');
   if (s.host) control(box, 'tu-start', 'Démarrer', 'start', s.members.length < 4 || s.members.length % 2 !== 0 || s.members.filter(m => team(m.seat) === 0).length !== s.members.length / 2 || !s.members.every(m => m.ready));
  } else {
   const scores = h.scores || {};
   const score = el('p', teams[0] + ' ' + (scores['0'] || 0) + ' · ' + teams[1] + ' ' + (scores['1'] || 0)); score.id = 'tu-scores'; box.append(score);
   if (s.status === 'finished') {
    const a = scores['0'] || 0, b = scores['1'] || 0;
    const result = el('h2', a === b ? 'Égalité !' : teams[a > b ? 0 : 1] + ' gagne !'); result.id = 'tu-result'; box.append(result);
    box.append(el('p', 'Pour rejouer, quittez ce salon et créez-en un nouveau.', 'online-note'));
   } else {
    box.append(el('h2', 'Manche ' + (Number(h.round || 0) + 1) + ' sur 3'));
    box.append(el('p', rules[h.round || 0], 'online-note'));
    box.append(el('p', (actor?.name || 'Le joueur') + ' fait deviner à ' + teams[team(s.turn)] + '.'));
    box.append(el('p', (h.remaining ?? 16) + ' cartes restantes', 'online-note'));
    if (h.phase === 'ready') {
     if (s.turn === s.seat) control(box, 'tu-begin', 'Commencer mon tour', 'begin');
     else box.append(el('p', 'En attente du début du tour…', 'online-note'));
    } else if (h.phase === 'turn') {
     const time = el('p'); time.id = 'tu-clock'; box.append(time);
     const live = Date.parse(h.deadline) > Date.now();
     if (s.turn === s.seat && live && connected) {
      const card = el('h2', h.card || ''); card.id = 'tu-card'; box.append(card);
      control(box, 'tu-found', 'Trouvé !', 'found'); control(box, 'tu-pass', 'Passer', 'pass');
     } else box.append(el('p', 'Carte masquée. Seule la personne qui fait deviner peut la voir.', 'online-note'));
     if (s.turn === s.seat || !live) control(box, 'tu-end', live ? 'Terminer mon tour' : 'Passer au joueur suivant', 'end');
    }
   }
  }
  if (pending) box.append(button('Vérifier / réessayer la demande', () => action(pending.p_kind, pending.p_data)));
  box.append(button('Quitter le salon', () => { if (confirm('Quitter ce salon ?')) task(depart); }));
  message(errorText || (!connected ? 'Reconnexion… Aucune action envoyée hors connexion.' : ''));
  setBusy(busy); tick();
 }
 function tick() {
  if (!active || !snapshot || snapshot.status !== 'playing' || snapshot.hidden?.phase !== 'turn') return;
  const left = Math.max(0, Math.ceil((Date.parse(snapshot.hidden.deadline) - Date.now()) / 1000));
  const clock = $('#tu-clock'); if (clock) clock.textContent = left + ' s';
  if (!left) {
   $('#tu-card')?.remove();
   for (const id of ['tu-found', 'tu-pass']) { const b = $('#' + id); if (b) { b.disabled = true; b.dataset.locked = 'true'; } }
   if (!$('#tu-end')) control($('#online-content'), 'tu-end', 'Passer au joueur suivant', 'end');
   else $('#tu-end').textContent = 'Passer au joueur suivant';
  }
 }
 setInterval(tick, 250);
 async function open() {
  if (active) return; window.dispatchEvent(new Event('blur')); active = true; generation++; root.hidden = false; document.body.classList.add('online-active');
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
 window.RoukyTimesupOnline = {version: 1};
})();
