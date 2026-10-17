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
})();