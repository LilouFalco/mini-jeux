'use strict';
(function(root){
const CATS={prenom:'Prénom',animal:'Animal',pays:'Pays ou ville',fruit:'Fruit ou légume',metier:'Métier',objet:'Objet',jv:'Jeu vidéo',lol:'Champion LoL',anime:'Animé ou manga',chanteuse:'Chanteuse ou drag queen',nourriture:'Plat ou dessert',couleur:'Couleur'};
const DEFAULT=['prenom','animal','pays','fruit','metier','objet'];
const ALL='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');const RARE='KWXYZ';const LETTERS=ALL.filter(l=>!RARE.includes(l));function pool(ex){return ex===false?ALL:LETTERS}
function pickLetter(used,r,ex){const L=pool(ex);const a=L.filter(l=>!(used||[]).includes(l));const p=a.length?a:L;return p[Math.floor((r||Math.random)()*p.length)]}
const PTS=[0,5,10];
function nextPts(p){return PTS[(PTS.indexOf(p)+1)%PTS.length]}
function totals(n,marks){const t=Array(n).fill(0);Object.values(marks).forEach(row=>row.forEach((p,i)=>{t[i]+=p||0}));return t}
function leaders(t){const m=Math.max(...t);return t.map((x,i)=>x===m?i:-1).filter(i=>i>=0)}
function pickCats(n,r){const k=Object.keys(CATS),o=[];const a=k.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor((r||Math.random)()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,n)}
root.PetitBac={ALL,pool,pickCats,CATS,DEFAULT,LETTERS,pickLetter,nextPts,totals,leaders,PTS};
if(typeof module!=='undefined')module.exports=root.PetitBac})(typeof window!=='undefined'?window:globalThis);
