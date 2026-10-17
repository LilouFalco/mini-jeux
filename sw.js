'use strict';
const CACHE='lilou-yakazu-v8';
const FILES=['./','index.html','sudoku.html','mots-fleches.html','binairo.html','style.css','games.css','fonts.css','app.js','engine.js','worker.js','sudoku.js','sudoku-engine.js','sudoku-worker.js','mf.js','mf-engine.js','mf-words.js','mf-worker.js','binairo.js','binairo-engine.js','binairo-worker.js','demineur.html','demineur.js','demineur-engine.js','mobile.css','mobile.js','morpion.html','morpion.js','morpion-engine.js','puissance4.html','puissance4.js','puissance4-engine.js','icon.svg','symbols.woff2','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png',...Array.from({length:6},(_,i)=>'fonts/font-'+i+'.ttf')];
const ROOT=new URL('./',self.location).href;
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(path=>new Request(new URL(path,ROOT).href,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lilou-yakazu-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!event.request.url.startsWith(ROOT))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(event.request);
  if(cached)return cached;
  try{return await fetch(event.request)}
  catch(error){if(event.request.mode==='navigate')return cache.match(new URL('index.html',ROOT).href);throw error}
 }));
});
