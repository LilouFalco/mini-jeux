'use strict';
// Loaded only after the player explicitly selects online.
window.MiniOnline = (() => {
 let instance;
 async function client() {
  if (!instance) {
   const config = window.MINI_ONLINE_CONFIG;
   if (!config?.url || !config?.key || !window.supabase) throw new Error('SETUP_REQUIRED');
   // Refuse misleading "persistent" guests when storage is unavailable.
   try { localStorage.setItem('mini-online-storage-check', '1'); localStorage.removeItem('mini-online-storage-check'); }
   catch { throw new Error('STORAGE_UNAVAILABLE'); }
   instance = window.supabase.createClient(config.url, config.key, {
    auth: { storageKey: 'mini-online-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) }
   });
  }
  const { data, error } = await instance.auth.getSession();
  if (error) throw error;
  if (!data.session) {
   const result = await instance.auth.signInAnonymously();
   if (result.error) throw result.error;
  }
  return instance;
 }
 async function rpc(name, args = {}) {
  const c = await client();
  const { data, error } = await c.rpc(name, args);
  if (error) throw error;
  return data;
 }
 function friendly(error) {
  const code = String(error?.message || '');
  const known = {
   AUTH_REQUIRED: 'Reconnecte-toi pour retrouver ton salon.',
   STORAGE_UNAVAILABLE: 'Le stockage du navigateur est bloqué. Les jeux hors ligne restent accessibles.',
   NAME_TAKEN: 'Ce nom de salon existe déjà. Choisis-en un autre.',
   INVALID_NAME: 'Pseudo de 1 à 24 caractères, salon de 3 à 40, sans caractères invisibles.',
   ROOM_NOT_FOUND: 'Salon introuvable ou expiré.',
   ROOM_EXPIRED: 'Ce salon a expiré. Retourne à la liste.',
   ROOM_FULL: 'Ce salon est complet.',
   ROOM_STARTED: 'Cette partie a déjà commencé.',
   ROOM_LIMIT: 'Tu as déjà plusieurs salons. Quitte-en un avant de continuer.',
   RATE_LIMIT: 'Petite pause, trop de demandes. Réessaie dans une minute.',
   NOT_MEMBER: 'Tu ne fais plus partie de ce salon.',
   STALE_VERSION: 'La partie a changé. Le plateau est actualisé, rejoue ton coup.',
   NOT_YOUR_TURN: "C'est au tour de l'autre personne.",
   CELL_OCCUPIED: 'Cette case est déjà prise.',
   COLUMN_FULL: 'Cette colonne est pleine.',
   NOT_READY: 'Les deux personnes doivent être prêtes.',
   HOST_ONLY: 'La personne qui organise peut démarrer.',
   WRONG_PHASE: 'La partie a changé. Vérifie le salon.',
   ACTION_REUSED: 'Cette demande ne peut pas être réutilisée.',
   INVALID_ACTION: 'Cette action est invalide.',
   GAME_UNAVAILABLE: "Ce jeu n'est pas encore disponible en ligne."
  };
  for (const [key, text] of Object.entries(known)) if (code.includes(key)) return text;
  if (/anonymous|disabled|PGRST202|function.*not.*found|SETUP_REQUIRED/i.test(code) || error?.code === 'PGRST202')
   return "Le mode en ligne attend son activation dans Supabase. Les jeux hors ligne fonctionnent toujours.";
  return navigator.onLine ? 'Connexion interrompue. Réessaie pour vérifier la partie.' : 'Tu es hors connexion. La partie attend ton retour.';
 }
 return { client, rpc, friendly };
})();
