'use strict';
// Shared online room lifecycle helpers. The server is authoritative; events and presence are hints only.
window.MiniLifecycle = (() => {
 const REASONS = ['host_left', 'player_left', 'host_timeout', 'player_timeout', 'expired'];
 const HEARTBEAT_MS = 10000; // server lease is 45s; never paused while hidden
 const isTerminated = x => !!x && x.terminated === true;
 function clean(x) {
  // Keep only sanitized fields, never game state from a payload.
  const name = typeof x?.name === 'string' ? x.name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, '').slice(0, 24) : '';
  return {terminated: true, name, reason: REASONS.includes(x?.reason) ? x.reason : 'expired', id: typeof x?.id === 'string' ? x.id : null};
 }
 function message(t) {
  const n = t.name || 'L’autre personne';
  if (t.reason === 'expired') return 'Ce salon a expiré.';
  return n + ' a quitté le salon.';
 }
 const status = (api, room) => api.rpc('online_room_status', {p_room: room});
 const depart = (api, room) => api.rpc('online_depart_room', {p_room: room});
 const heartbeat = (api, room) => api.rpc('online_heartbeat', {p_room: room});
 // Interval that ignores page visibility: background suspension counts as disconnect server side.
 function startHeartbeat(fn) { const t = setInterval(fn, HEARTBEAT_MS); return () => clearInterval(t); }
 return {isTerminated, clean, message, status, depart, heartbeat, startHeartbeat, HEARTBEAT_MS};
})();
