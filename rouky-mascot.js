/* Rouky's little wardrobe. Decorative, local, muted by default; no network or looping audio. */
(function (global) {
  'use strict';
  const script = document.currentScript;
  const base = new URL('.', script && script.src ? script.src : document.baseURI);
  const poses = Object.freeze(['wave', 'win', 'sleep', 'stretch', 'loss']);
  const aliases = Object.freeze({
    home: 'wave', sitting: 'wave', victory: 'win', 'belly-up': 'win',
    idle: 'sleep', sleeping: 'sleep', grumpy: 'loss', defeat: 'loss'
  });
  const mounted = new WeakMap();
  let outcomeImpl = null;
  const soundKey = 'rouky-sound';
  let sound = false;
  try { sound = global.localStorage.getItem(soundKey) === 'true'; } catch (_) {}
  let unlocked = false;
  let inGesture = false;
  const voices = new Set();
  function stopSounds() {
    voices.forEach(voice => voice.dispose());
  }
  function unlock(event) {
    if (!event.isTrusted || (event.type === 'keydown' && !['Enter', ' '].includes(event.key))) return;
    inGesture = true;
    queueMicrotask(() => { inGesture = false; });
    if (sound) unlockAudio();
  }
  function unlockAudio() {
    if (unlocked) return;
    const Audio = global.AudioContext || global.webkitAudioContext;
    if (!Audio) return;
    let context;
    try {
      context = new Audio();
      const resumed = context.resume();
      Promise.resolve(resumed).then(() => {
        if (context.state === 'running') unlocked = true;
      }).catch(() => {}).finally(() => { context.close().catch(() => {}); });
    } catch (_) {
      if (context) context.close().catch(() => {});
    }
  }
  document.addEventListener('click', unlock, true);
  document.addEventListener('change', unlock, true);
  document.addEventListener('keydown', unlock, true);
  function play(kind) {
    if (!sound || !unlocked || document.hidden || !['win', 'tap'].includes(kind) || voices.size) return false;
    const Audio = global.AudioContext || global.webkitAudioContext;
    if (!Audio) return false;
    let context;
    const nodes = [];
    let disposed = false;
    const voice = { dispose() {
      if (disposed) return;
      disposed = true;
      nodes.forEach(node => {
        if (typeof node.stop === 'function') { try { node.stop(); } catch (_) {} }
        try { node.disconnect(); } catch (_) {}
      });
      voices.delete(voice);
      if (context && context.state !== 'closed') context.close().catch(() => {});
    } };
    try {
      context = new Audio();
      voices.add(voice);
      const start = () => {
        if (disposed || !sound || document.hidden || context.state !== 'running') {
          voice.dispose();
          return;
        }
        const notes = kind === 'win' ? [523.25, 659.25, 783.99] : [440];
        const now = context.currentTime;
        notes.forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          nodes.push(oscillator, gain);
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          const at = now + index * 0.085;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.035, at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(at);
          oscillator.stop(at + 0.18);
          if (index === notes.length - 1) oscillator.onended = () => voice.dispose();
        });
      };
      if (context.state === 'running') start();
      else Promise.resolve(context.resume()).then(start).catch(() => voice.dispose());
      return true;
    } catch (_) {
      voice.dispose();
      return false;
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSounds(); });
  global.addEventListener('pagehide', stopSounds);
  function setSound(enabled) {
    sound = enabled === true;
    if (!sound) stopSounds();
    else if (inGesture) unlockAudio();
    try { global.localStorage.setItem(soundKey, String(sound)); } catch (_) {}
    return sound;
  }
  const reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
  function normalized(pose) {
    return poses.includes(pose) ? pose : aliases[pose] || 'wave';
  }
  function mount(element, pose) {
    if (!element || element.nodeType !== 1) throw new TypeError('Rouky needs an element.');
    const previous = mounted.get(element);
    if (previous) {
      previous.setPose(pose || 'wave');
      return previous;
    }
    const image = document.createElement('img');
    image.className = 'rouky-mascot';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.draggable = false;
    image.width = 128;
    image.height = 128;
    image.decoding = 'async';
    let current = '';
    let observer = null;
    let destroyed = false;
    // A single entrance when actually visible; never a looping animation.
    const enter = () => {
      if (!destroyed && !reduced.matches && !document.hidden) image.classList.add('rouky-mascot--hello');
    };
    const controller = Object.freeze({
      element: image,
      setPose(next) {
        if (destroyed) return controller;
        const value = normalized(next);
        if (current !== value) {
          current = value;
          image.dataset.pose = 'wave';
          image.dataset.outcome = value;
          image.src = new URL('rouky-wave-body.svg', base).href;
          image.classList.remove('rouky-mascot--hello');
        }
        return controller;
      },
      getPose() { return current; },
      destroy() {
        destroyed = true;
        if (observer) observer.disconnect();
        document.removeEventListener('visibilitychange', stop);
        reduced.removeEventListener('change', motion);
        image.remove();
        mounted.delete(element);
      }
    });
    const stop = () => {
      if (document.hidden) image.classList.remove('rouky-mascot--hello');
    };
    const motion = () => {
      if (reduced.matches) image.classList.remove('rouky-mascot--hello');
    };
    // Tail wag only runs while Rouky is on screen and the tab is visible.
    let onscreen = true;
    const wag = () => image.classList.toggle('rouky-wag', onscreen && !document.hidden && !reduced.matches);
    if ('IntersectionObserver' in global) {
      new IntersectionObserver(es => { onscreen = es[es.length - 1].isIntersecting; wag(); }).observe(image);
    }
    document.addEventListener('visibilitychange', wag);
    reduced.addEventListener('change', wag);
    wag();
    controller.setPose(pose || 'wave');
    element.appendChild(image);
    mounted.set(element, controller);
    image.addEventListener('animationend', () => {
      image.classList.remove('rouky-mascot--hello');
      if (observer) observer.disconnect();
    });
    document.addEventListener('visibilitychange', stop);
    reduced.addEventListener('change', motion);
    if ('IntersectionObserver' in global) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            enter();

          } else image.classList.remove('rouky-mascot--hello');
        }
      });
      observer.observe(image);
    }
    return controller;
  }
  global.RoukyMascot = Object.freeze({
    poses,
    mount,
    setSound,
    play,
    getSound() { return sound; },
    outcome(result, perspective, target) {
      if (target) { const inst = attachStatus(target, true); if (inst) inst.outcome(result, perspective); return; }
      if (outcomeImpl) outcomeImpl(result, perspective);
    },
    setPose(element, pose) {
      return mount(element, pose);
    },
    unmount(element) {
      const instance = mounted.get(element);
      if (instance) instance.destroy();
    }
  });
  function init() {
    document.querySelectorAll('[data-rouky-pose]').forEach(element => {
      mount(element, element.dataset.roukyPose);
    });
    attachStatus(document.querySelector('#status'), false);
  }
  function attachStatus(status, explicitOnly) {
    if (!status) return null;
    if (status._roukyStatus) return status._roukyStatus;
    let badge = null;
    let reaction = null;
    let last = '';
    let explicit = !!explicitOnly;
    let shownText = null;
    const hide = () => {
      if (badge) badge.hidden = true;
      delete status.dataset.roukyOutcome;
    };
    // Spare room beside the status text only; a centred line frees up half of the leftover width.
    const fits = () => {
      const box = status.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(status);
      const lines = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
      if (!box.width || !lines.length) return 0;
      const left = Math.min(...lines.map(rect => rect.left));
      const right = Math.max(...lines.map(rect => rect.right));
      const centred = getComputedStyle(status).textAlign === 'center';
      const room = centred ? Math.min(left - box.left, box.right - right) : box.right - right;
      const size = box.height >= 30 ? 32 : 26;
      return room >= size + 6 ? size : 0;
    };
    const show = kind => {
      if (badge && !badge.isConnected) {
        reaction.destroy();
        badge = null;
        reaction = null;
      }
      if (kind === 'draw') { if (badge) badge.hidden = true; return; }
      const size = fits();
      if (!size) { if (badge) badge.hidden = true; return; }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'rouky-status-reaction';
        badge.setAttribute('aria-hidden', 'true');
        status.classList.add('rouky-status-host');
        status.appendChild(badge);
        reaction = mount(badge, kind);
      }
      badge.style.setProperty('--rouky-size', size + 'px');
      badge.style.width = badge.style.height = size + 'px';
      badge.hidden = false;
      reaction.setPose(kind);
    };
    // Explicit hook: games report the real result from the player's point of view.
    // result is 'win', 'loss' or 'draw'; perspective 'neutral' means two people share the device.
    const outcomeHere = (result, perspective) => {
      if (!['win', 'loss', 'draw'].includes(result)) return;
      explicit = true;
      status.dataset.roukyOutcome = result;
      if (perspective) status.dataset.roukyPerspective = perspective;
      document.dispatchEvent(new CustomEvent('rouky:outcome', { detail: { outcome: result, perspective: perspective || 'player' } }));
      if (result === 'win') play('win');
      requestAnimationFrame(() => {
        shownText = status.textContent.trim().replace(/\s+/g, ' ');
        show(result);
      });
    };
    const update = () => {
      const text = status.textContent.trim().replace(/\s+/g, ' ');
      if (explicit) {
        if (shownText !== null && text !== shownText) { hide(); delete status.dataset.roukyPerspective; shownText = null; }
        return;
      }
      if (text === last) return;
      last = text;
      hide();
      const message = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const loss = /(perdu|perdue|defaite|perdez|dommage|lost|defeat)/.test(message);
      const win = !/(pas|aucun|sans)/.test(message) &&
        /(gagne|gagnee|gagnant|gagnante|victoire|bravo|felicitations|resolu|resolue|won|victory)/.test(message);
      if (!loss && !win) return;
      if (win && !loss) play('win');
      const outcome = loss ? 'loss' : 'win';
      status.dataset.roukyOutcome = outcome;
      document.dispatchEvent(new CustomEvent('rouky:outcome', { detail: { outcome } }));
      show(outcome);
    };
    new MutationObserver(update).observe(status, { childList: true, characterData: true, subtree: true });
    update();
    status._roukyStatus = { outcome: outcomeHere };
    if (!explicitOnly) outcomeImpl = outcomeHere;
    return status._roukyStatus;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
