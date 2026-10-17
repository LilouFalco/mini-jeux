'use strict';
(function(){
const Y=window.YakazuGames,$=s=>document.querySelector(s);let mode=Y.getMode(),players=4;
const cards=$('#modes'),list=$('#glist'),step=$('#players');
Y.MODES.forEach(m=>{const b=document.createElement('button');b.type='button';b.className='mode';b.dataset.k=m.k;b.innerHTML='<span class="mico">'+Y.svg(m.i,'mi huge')+'</span><b>'+m.n+'</b><small>'+m.t+'</small>';b.onclick=()=>{mode=m.k;Y.setMode(m.k);draw();if(matchMedia('(max-width:700px)').matches&&window.MiniSheet){window.MiniSheet.open(m.k);return}list.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'nearest'})};cards.appendChild(b)});
function draw(){
 cards.querySelectorAll('.mode').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===mode)));
 list.hidden=!mode;if(!mode)return;
 const m=Y.MODES.find(x=>x.k===mode);$('#gtitle').textContent=m.n+' · '+m.t;
 step.hidden=mode!=='multi';$('#pn').textContent=players;
 list.querySelector('.gl-items').innerHTML='';
 Y.forMode(mode,mode==='multi'?players:null).forEach(g=>{const a=document.createElement(g.ok?'a':'span');a.className='gtile'+(g.ok?'':' soon');if(g.ok){a.href=g.href+(mode==='multi'?(g.href.includes('?')?'&':'?')+'mode=multi&players='+players:'')}else a.setAttribute('aria-disabled','true');
  a.innerHTML='<span class="mico">'+Y.svg(g.i,'mi big')+'</span><b>'+g.n+'</b>'+(g.href?'':'<em>bientôt</em>')+(g.range?'<small>'+g.range+'</small>':'');list.querySelector('.gl-items').appendChild(a)});
}
$('#pm').onclick=()=>{players=Math.max(3,players-1);draw()};$('#pp').onclick=()=>{players=Math.min(12,players+1);draw()};
draw();
// Service worker: register from the home page itself, announce only once active (precache finished)
(function(){if(!('serviceWorker' in navigator))return;
 const ready=()=>{let n=document.getElementById('offline-ready');if(!n){const f=document.querySelector('footer');if(!f)return;n=document.createElement('p');n.id='offline-ready';n.setAttribute('role','status');n.style.cssText='margin:6px 0 0;font-size:12px;opacity:.8';f.appendChild(n)}n.textContent='♡ Prêt hors connexion.'};
 const go=()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(reg=>{const w=reg.installing||reg.waiting;const done=()=>navigator.serviceWorker.ready.then(r=>{if(r.active&&r.active.state==='activated')ready();else if(r.active)r.active.addEventListener('statechange',e=>{if(e.target.state==='activated')ready()})});if(w&&w.state!=='activated')w.addEventListener('statechange',()=>{if(w.state==='activated')done()});done()}).catch(()=>{});
 if(document.readyState==='complete')go();else addEventListener('load',go,{once:true});
})();
})();
