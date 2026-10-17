'use strict';
(function(){
const Y=window.YakazuGames,E=document.createElement.bind(document),svg=Y.svg;
const file=(location.pathname.split('/').pop()||'index.html').replace(/\.html$/,'');
const cur=Y.G.find(g=>g.id===file);
const home=!cur;
let curMode=new URLSearchParams(location.search).get('mode');if(!['solo','duo','multi'].includes(curMode))curMode=null;
if(!curMode&&cur){const s=Y.getMode();curMode=s&&s in cur.m?s:Object.keys(cur.m)[0]}
if(!curMode&&home)curMode=Y.getMode();
const top=E('div');top.className='mtop';
top.innerHTML=(home?'<span class="mlogo" aria-hidden="true">✦</span>':'<a class="mback" href="./" aria-label="Retour à l\'accueil">'+svg('M15 5l-7 7 7 7')+'</a>')+'<strong>'+(cur?cur.n:'Mini-jeux')+'</strong><span class="mtag" aria-hidden="true">pause douce</span>';
const bar=E('nav');bar.className='mbar';bar.setAttribute('aria-label','Choisir un mode');
const sheet=E('div');sheet.className='msheet';sheet.hidden=true;sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
sheet.innerHTML='<div class="mbackdrop"></div><div class="mpanel"><div class="mhead"><strong id="msh-t"></strong><button type="button" class="mclose" aria-label="Fermer">'+svg('M6 6l12 12M18 6L6 18')+'</button></div><div class="mtiles"></div></div>';
let openKey=null;
Y.MODES.forEach(t=>{const b=E('button');b.type='button';b.dataset.k=t.k;b.innerHTML=svg(t.i)+'<span>'+t.n.toUpperCase()+'</span>';if(!home&&t.k===curMode)b.setAttribute('aria-current','page');b.onclick=()=>toggle(t.k);bar.appendChild(b)});
function tile(g){const x=E(g.ok?'a':'span');x.className='mtile'+(g.ok?'':' soon');if(g.ok){x.href=g.href;if(cur&&cur.id===g.id)x.setAttribute('aria-current','page')}else x.setAttribute('aria-disabled','true');x.innerHTML='<span class="mico">'+svg(g.i,'mi big')+'</span><b>'+g.n+'</b>'+(g.href?'':'<em>bientôt</em>')+(g.range?'<small>'+g.range+'</small>':'');return x}
function toggle(k){if(!sheet.hidden&&openKey===k)return close();
 openKey=k;const t=Y.MODES.find(t=>t.k===k);sheet.querySelector('#msh-t').textContent=t.n+' · '+t.t;
 const tl=sheet.querySelector('.mtiles');tl.innerHTML='';Y.forMode(k).forEach(g=>tl.appendChild(tile(g)));
 sheet.hidden=false;document.documentElement.classList.add('msheet-open');
 bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.k===k)));
 (sheet.querySelector('.mtile[href]')||sheet.querySelector('.mclose')).focus({preventScroll:true})}
function close(){sheet.hidden=true;openKey=null;document.documentElement.classList.remove('msheet-open');bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-expanded','false'))}
sheet.querySelector('.mbackdrop').onclick=close;sheet.querySelector('.mclose').onclick=close;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sheet.hidden)close()});
function mount(){const b=document.body;b.classList.add('has-mnav');b.prepend(top);b.append(sheet,bar)}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();