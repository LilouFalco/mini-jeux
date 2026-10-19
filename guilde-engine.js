'use strict';
(function(root,f){const E=f();if(typeof module==='object'&&module.exports)module.exports=E;else root.GuildeEngine=E})(typeof self!=='undefined'?self:this,function(){
const V=1,MIN_P=2,MAX_P=4,MIN_MATCH=3,MIN_TRAITS=3,MIN_CHARS=3;
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fnv=str=>{let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16)};
const uniq=(a,what)=>{const s=new Set();for(const x of a){if(!x||typeof x.id!=='string'||!x.id)throw new Error(what+' sans id');if(s.has(x.id))throw new Error('id dupliqué '+x.id);s.add(x.id)}return s};
function check(data,strict){if(!data||!Array.isArray(data.themes)||!Array.isArray(data.traits)||!Array.isArray(data.characters))throw new Error('dataset invalide');
 const TH=uniq(data.themes,'thème'),T=uniq(data.traits,'trait'),C=uniq(data.characters,'personnage');
 for(const t of data.themes)if(typeof t.label!=='string'||!t.label)throw new Error('thème sans label '+t.id);
 for(const t of data.traits)if(typeof t.label!=='string'||!t.label||typeof t.definition!=='string'||!t.definition)throw new Error('trait sans label/définition '+t.id);
 for(const c of data.characters){if(typeof c.name!=='string'||!c.name)throw new Error('personnage sans nom '+c.id);if(!TH.has(c.theme))throw new Error('thème inconnu chez '+c.id);
  if(!Array.isArray(c.traits))throw new Error('traits manquants chez '+c.id);if(new Set(c.traits).size!==c.traits.length)throw new Error('trait en double chez '+c.id);
  for(const t of c.traits)if(!T.has(t))throw new Error('trait inconnu '+t+' chez '+c.id);
  if(c.aliases!=null&&!(Array.isArray(c.aliases)&&c.aliases.every(a=>typeof a==='string')))throw new Error('alias invalides chez '+c.id);
  if(c.traitValues!=null){if(typeof c.traitValues!=='object'||Array.isArray(c.traitValues))throw new Error('traitValues invalide chez '+c.id);for(const t of data.traits)if(typeof c.traitValues[t.id]!=='boolean')throw new Error('classification incomplète '+t.id+' chez '+c.id);for(const k in c.traitValues){if(!T.has(k))throw new Error('traitValues inconnu '+k+' chez '+c.id);if(c.traitValues[k]!==null&&typeof c.traitValues[k]!=='boolean')throw new Error('traitValues non booléen '+k+' chez '+c.id);if(c.traitValues[k]===true&&!c.traits.includes(k)||c.traitValues[k]===false&&c.traits.includes(k))throw new Error('traits et traitValues incohérents '+k+' chez '+c.id)}for(const k of c.traits)if(c.traitValues[k]!==true)throw new Error('trait sans valeur vraie '+k+' chez '+c.id)}
  if(strict){if(!(Array.isArray(c.sources)&&c.sources.length))throw new Error('sources manquantes chez '+c.id);for(const t of data.traits)if(!c.traitValues||typeof c.traitValues[t.id]!=='boolean')throw new Error('classification incomplète '+t.id+' chez '+c.id)}}
 return true}
function revision(d){const body=fnv(JSON.stringify([d.themes.map(t=>[t.id,t.label,t.enabled!==false]),d.traits.map(t=>[t.id,t.label,t.definition]),d.characters.map(c=>[c.id,c.name,c.aliases||[],c.theme,c.scope||'',c.traits.slice().sort(),c.traitValues?d.traits.map(t=>c.traitValues[t.id]):null])]));return (d.revision?String(d.revision)+':':'')+body}
const val=(c,t)=>c.traitValues?c.traitValues[t]:c.traits.includes(t);
const has=(c,t)=>val(c,t)===true;
const known=(c,t)=>typeof val(c,t)==='boolean';
const pool=(d,th)=>{const s=new Set(th);return d.characters.filter(c=>s.has(c.theme))};
const themeOk=(d,id)=>{const t=d.themes.find(x=>x.id===id);return !!t&&t.enabled!==false&&d.characters.filter(c=>c.theme===id).length>=MIN_CHARS};
function eligibility(d,th){th=(th||[]).filter((x,i,a)=>a.indexOf(x)===i&&themeOk(d,x));
 if(!th.length)return{ok:false,traits:[],pool:[],reason:'Choisis au moins un thème.'};
 const P=pool(d,th);if(P.length<MIN_CHARS)return{ok:false,traits:[],pool:P,reason:'Pas assez de personnages dans ces thèmes (il en faut '+MIN_CHARS+').'};
 const traits=d.traits.filter(t=>{if(P.some(c=>!known(c,t.id)))return false;const m=P.filter(c=>has(c,t.id));if(P.length-m.length<MIN_CHARS)return false;
  return th.every(x=>P.filter(c=>c.theme===x&&has(c,t.id)).length>=MIN_MATCH)});
 if(traits.length<MIN_TRAITS)return{ok:false,traits,pool:P,reason:'Pas assez de traits communs à tous ces thèmes ('+traits.length+'/'+MIN_TRAITS+'). Retire un thème ou ajoute-en un autre.'};
 return{ok:true,traits,pool:P,reason:''}}
function search(d,th,q,exclude,limit){const n=norm(q);if(!n)return[];const ex=new Set(exclude||[]);const r=[];
 for(const c of pool(d,th)){if(ex.has(c.id))continue;let best=9;for(const nm of [c.name].concat(c.aliases||[])){const x=norm(nm);let s=9;if(x===n)s=0;else if(x.startsWith(n))s=1;else if(x.split(' ').some(w=>w.startsWith(n)))s=2;else if(x.includes(n))s=3;if(s<best)best=s}
  if(best<9)r.push([best,c])}
 r.sort((a,b)=>a[0]-b[0]||a[1].name.localeCompare(b[1].name,'fr'));return r.slice(0,limit||8).map(x=>x[1])}
function cleanNames(names){return names.map((n,i)=>String(n||'').replace(/\s+/g,' ').trim().slice(0,16)||'Joueur '+(i+1))}
function dupNames(names){const seen=new Set();for(const n of names){const k=norm(n);if(seen.has(k))return n;seen.add(k)}return null}
function create(d,o){check(d);const names=cleanNames(o.names||[]);if(names.length<MIN_P||names.length>MAX_P)throw new Error('2 à 4 joueurs');const dn=dupNames(names);if(dn)throw new Error('Deux joueurs ont le même nom (« '+dn+' »). Choisis des noms différents.');
 const el=eligibility(d,o.themes);if(!el.ok)throw new Error(el.reason);const rng=o.rng||Math.random;
 const secrets=names.map(()=>el.traits[Math.floor(rng()*el.traits.length)].id);
 const queries={};names.forEach((_,i)=>queries[i]=[]);
 const themes=[...new Set(o.themes)].filter(x=>d.themes.some(t=>t.id===x));const st={v:V,rev:revision(d),names,themes,secrets,turn:0,round:1,stage:'play',queries,guesses:[],winner:null,last:null};st.seal=seal(st);return st}
const seal=s=>fnv(JSON.stringify([s.rev,s.names,s.themes,s.secrets]));
const find=(d,id)=>d.characters.find(c=>c.id===id);
function ask(d,s,target,charId){if(s.stage!=='play')throw new Error('partie terminée');if(!Number.isInteger(target)||target===s.turn||target<0||target>=s.names.length)throw new Error('adversaire invalide');
 const c=find(d,charId);if(!c||!s.themes.includes(c.theme))throw new Error('personnage invalide');
 if(!known(c,s.secrets[target]))throw new Error('classification inconnue : réponse impossible');const answer=has(c,s.secrets[target]);const q={actor:s.turn,charId,charName:c.name,answer};s.queries[target].push(q);
 s.last={type:'query',actor:s.turn,target,charId,charName:c.name,answer};advance(s);return s.last}
function guess(d,s,target,traitId){if(s.stage!=='play')throw new Error('partie terminée');if(!Number.isInteger(target)||target===s.turn||target<0||target>=s.names.length)throw new Error('adversaire invalide');
 const el=eligibility(d,s.themes);const t=el.traits.find(x=>x.id===traitId);if(!t)throw new Error('trait invalide');
 const ok=s.secrets[target]===traitId;const g={actor:s.turn,target,traitId,traitLabel:t.label,ok};s.guesses.push(g);
 s.last={type:'guess',actor:s.turn,target,traitId,traitLabel:t.label,ok};
 if(ok){s.stage='won';s.winner=s.turn}else advance(s);return s.last}
function advance(s){const n=s.turn+1;if(n>=s.names.length){s.turn=0;s.round++}else s.turn=n}
function validate(d,s){try{if(!s||s.v!==V||!Array.isArray(s.names)||s.names.length<MIN_P||s.names.length>MAX_P||s.names.some(x=>typeof x!=='string'||!x.trim()||x.length>16))return false;
 const n=s.names.length;if(new Set(s.names.map(norm)).size!==n)return false;
 if(s.rev!==revision(d)||s.seal!==seal(s))return false;
 if(!Array.isArray(s.themes)||!s.themes.length||new Set(s.themes).size!==s.themes.length||!s.themes.every(x=>d.themes.some(t=>t.id===x)))return false;
 const el=eligibility(d,s.themes);if(!el.ok)return false;const ok=new Set(el.traits.map(t=>t.id)),lab=Object.fromEntries(el.traits.map(t=>[t.id,t.label]));
 if(!Array.isArray(s.secrets)||s.secrets.length!==n||!s.secrets.every(x=>ok.has(x)))return false;
 if(!Number.isInteger(s.turn)||s.turn<0||s.turn>=n||!Number.isInteger(s.round)||s.round<1)return false;
 if(s.stage!=='play'&&s.stage!=='won')return false;
 if(!s.queries||typeof s.queries!=='object'||Object.keys(s.queries).length!==n)return false;
 const by=new Array(n).fill(0);let qt=0;const th=new Set(s.themes);
 for(let i=0;i<n;i++){const q=s.queries[i];if(!Array.isArray(q))return false;for(const x of q){if(!x||!Number.isInteger(x.actor)||x.actor<0||x.actor>=n||x.actor===i)return false;
  const c=find(d,x.charId);if(!c||!th.has(c.theme)||x.charName!==c.name||!known(c,s.secrets[i])||x.answer!==has(c,s.secrets[i]))return false;by[x.actor]++;qt++}}
 if(!Array.isArray(s.guesses))return false;let wins=0,wg=null;
 for(const g of s.guesses){if(!g||!Number.isInteger(g.actor)||!Number.isInteger(g.target)||g.actor<0||g.target<0||g.actor>=n||g.target>=n||g.actor===g.target)return false;
  if(!ok.has(g.traitId)||g.traitLabel!==lab[g.traitId]||g.ok!==(s.secrets[g.target]===g.traitId))return false;by[g.actor]++;if(g.ok){wins++;wg=g}}
 const T=qt+s.guesses.length;
 if(s.stage==='won'){if(wins!==1||s.guesses[s.guesses.length-1]!==wg||s.winner!==wg.actor)return false;if(s.turn!==wg.actor)return false;const adv=T-1;if(adv%n!==s.turn||s.round!==1+Math.floor(adv/n))return false;
  const exp=new Array(n).fill(0);for(let k=0;k<adv;k++)exp[k%n]++;exp[wg.actor]++;if(exp.some((e,i)=>e!==by[i]))return false}
 else{if(wins!==0||s.winner!==null||T%n!==s.turn||s.round!==1+Math.floor(T/n))return false;const exp=new Array(n).fill(0);for(let k=0;k<T;k++)exp[k%n]++;if(exp.some((e,i)=>e!==by[i]))return false}
 const l=s.last;if(T===0){if(l!==null)return false}else{if(!l||typeof l!=='object'||!Number.isInteger(l.actor)||!Number.isInteger(l.target)||l.actor<0||l.target<0||l.actor>=n||l.target>=n||l.actor===l.target)return false;
  if(l.type==='query'){if(s.stage==='won'||typeof l.charName!=='string'||typeof l.answer!=='boolean'||typeof l.charId!=='string')return false;const c=find(d,l.charId);if(!c||c.name!==l.charName||!known(c,s.secrets[l.target])||l.answer!==has(c,s.secrets[l.target]))return false}
  else if(l.type==='guess'){if(typeof l.ok!=='boolean'||l.traitLabel!==lab[l.traitId]||l.ok!==(s.secrets[l.target]===l.traitId))return false;if(s.stage==='won'&&!(l.ok&&l.actor===s.winner))return false}else return false;if(l.actor!==(s.stage==='won'?s.winner:(s.turn+n-1)%n))return false}
 return true}catch(e){return false}}
function publicView(s){return{names:s.names.slice(),turn:s.turn,round:s.round,stage:s.stage,winner:s.winner,queries:JSON.parse(JSON.stringify(s.queries)),guesses:s.guesses.map(g=>({actor:g.actor,target:g.target,traitLabel:g.traitLabel,ok:g.ok}))}}
return{themeOk,has,known,dupNames,revision,seal,V,MIN_P,MAX_P,norm,check,eligibility,search,create,ask,guess,validate,publicView,cleanNames}});
