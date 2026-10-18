'use strict';
// Online Undercover. Only the current player’s role/word are received. Vote targets stay server-side.
(() => {
 const $ = s => document.querySelector(s);
 const root = $('#online-root'), toggle = $('#online-toggle');
 const G = {game: 'undercover', title: 'Salons Undercover', label: 'Undercover en ligne'};
 let active = false, api, snapshot, channel, channelTopic, timer, busy = false, pending = null;
 let retry = false, errorText = '', notice = '', leaving = false, loading, syncPromise, queuedSync = false, generation = 0, connected = navigator.onLine, seq = 0;
 let reveal = false, revealKey = null, directoryOffset = 0;
 const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
 function button(text, fn, cls) { const b = el('button', text, cls); b.type = 'button'; b.onclick = fn; return b; }
 function message(text) { const s = $('#online-status'); if (s && s.textContent !== text) s.textContent = text; }
 const rpcCall = (kind, args = {}) => api.rpc({create: 'online_create_room_game', join: 'online_join_room_game', list: 'online_list_rooms_game', mine: 'online_my_rooms_game'}[kind], {p_game: G.game, ...args});
 async function load() {
  if (!loading) loading = (async () => {
   for (const src of ['online-config.js', 'vendor/supabase-2.118.0.js', 'online-client.js', 'online-lifecycle.js']) {
    if (window.MiniOnline && (src === 'online-config.js' || src.startsWith('vendor/'))) continue;
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
    if (snapshot && /STALE_VERSION|NOT_YOUR_TURN|ALREADY_VOTED|INVALID_VOTE|WRONG_PHASE/.test(error.message || '')) { pending = null; await sync().catch(() => {}); }
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
    if (/STALE_VERSION/.test(error.message || '') && !retried && kind !== 'vote') {
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
 function winner() {
  // The public room winner is a seat, not a team. Never guess from survivors.
  return snapshot?.status === 'finished' && ['civils', 'impostors'].includes(snapshot.hidden?.winner) ? snapshot.hidden.winner : null;
 }
 function renderRoom() {
  if (!snapshot || !active) return;
  const s = snapshot, box = $('#online-content'), h = s.hidden || {};
  if (revealKey !== s.instance) { revealKey = s.instance; reveal = false; }
  box.replaceChildren();
  const head = el('div', null, 'online-heading');
  head.append(el('strong', s.name), button('Actualiser', () => task(() => sync()))); box.append(head);
  const people = el('div', null, 'online-members');
  for (const m of s.members) people.append(el('span', m.name + (m.host ? ' ♛' : '') + (s.status === 'waiting' ? (m.ready ? ' ✓' : '') : (h.alive?.[m.seat] ? ' · en jeu' : ' · éliminé·e'))));
  box.append(people);
  box.append(el('p', 'En ligne · 3 à 12 personnes. Un undercover (deux dès 9). Tous les thèmes mélangés, sans Mister White ni points. Discutez à voix haute ou en appel. Les votes sont secrets, une égalité relance le vote sans élimination.', 'online-note'));
  const mine = s.members.find(m => m.seat === s.seat);
  if (s.status === 'waiting') {
   const row = el('div', null, 'online-actions');
   const ready = button(mine?.ready ? 'Pas encore prête' : 'Prête !', () => action(mine?.ready ? 'unready' : 'ready'), 'primary'); ready.id = 'uc-ready'; row.append(ready);
   if (s.host) { const start = button('Démarrer', () => action('start')); start.id = 'uc-start'; start.dataset.locked = String(s.members.length < 3 || !s.members.every(m => m.ready)); row.append(start); }
   box.append(row);
  } else {
   const secret = el('div', null, 'uc-secret'); secret.id = 'uc-secret';
   secret.append(el('p', reveal ? (own().role === 'civil' ? 'Civil' : 'Undercover') : 'Ton rôle et ton mot restent cachés.', 'online-note'));
   if (reveal) secret.append(el('strong', own().word || '', 'word'));
   const show = button(reveal ? 'Masquer mon secret' : 'Voir mon secret', () => { reveal = !reveal; renderRoom(); }); show.id = 'uc-reveal'; secret.append(show); box.append(secret);
   if (s.status === 'playing') {
    const alive = h.alive?.[s.seat] === true, cast = (h.votesCast || []).includes(String(s.seat));
    box.append(el('p', !alive ? 'Tu es éliminé·e. Tu peux suivre la partie, sans voter.' : cast ? 'Vote enregistré. Les autres choisissent encore.' : 'Décrivez vos mots à tour de rôle, puis choisissez qui éliminer. Ton vote est définitif pour ce tour.', 'online-note'));
    const votes = el('div', null, 'uc-votes'); votes.id = 'uc-votes';
    for (const m of s.members.filter(m => h.alive?.[m.seat] && m.seat !== s.seat)) {
     const vote = button('Voter contre ' + m.name, () => { if (confirm('Voter contre ' + m.name + ' ? Ce choix est définitif.')) { reveal = false; action('vote', {seat: m.seat}); } });
     vote.dataset.seat = m.seat; vote.dataset.locked = String(!alive || cast || !connected || !!pending); votes.append(vote);
    }
    box.append(votes, el('p', (h.votesCast || []).length + '/' + Object.values(h.alive || {}).filter(Boolean).length + ' votes reçus. Si personne n’est éliminé, recommencez une discussion puis votez.', 'online-note'));
   } else {
    const w = winner(), result = el('p', w === 'civils' ? 'Les civils ont gagné !' : w === 'impostors' ? 'Les undercovers ont gagné !' : 'Résultat indisponible', 'online-status'); result.id = 'uc-result'; box.append(result);
    box.append(el('p', 'Pour rejouer, quittez le salon et créez-en un nouveau.', 'online-note'));
   }
  }
  if (pending) box.append(button('Vérifier / réessayer la demande', () => action(pending.p_kind, pending.p_data)));
  box.append(button('Quitter le salon', () => { if (confirm('Quitter ce salon ? Cela termine la manche pour tout le monde.')) task(depart); }));
  message(errorText || (!connected ? 'Reconnexion… Aucun vote envoyé hors connexion.' : s.status === 'waiting' ? 'Chacun se prépare, puis l’hôte démarre (3 personnes minimum).' : 'Seuls ton rôle et ton mot sont accessibles sur cet appareil.'));
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
 document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') { reveal = false; if (active && snapshot) renderRoom(); } if (active && snapshot && document.visibilityState === 'visible') sync(true).catch(() => { connected = false; renderRoom(); }); });
 window.RoukyUndercoverOnline = {version: 1};
})();
