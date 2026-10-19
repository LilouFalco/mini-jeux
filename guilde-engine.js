'use strict';
(function(root,f){const E=f();if(typeof module==='object'&&module.exports)module.exports=E;else root.GuildeEngine=E})(typeof self!=='undefined'?self:this,function(){
const V=2,MIN_P=2,MAX_P=4,MIN_MATCH=3,MIN_TRAITS=3,MIN_CHARS=3;
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fnv=str=>{let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16)};
const uniq=(a,what)=>{const s=new Set();for(const x of a){if(!x||typeof x.id!=='string'||!x.id)throw new Error(what+' sans id');if(s.has(x.id))throw new Error('id dupliqué '+x.id);s.add(x.id)}return s};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const canonical=o=>JSON.stringify(sortValue(o));
function sortValue(o){if(Array.isArray(o))return o.map(sortValue);if(plain(o))return Object.fromEntries(Object.keys(o).sort().map(k=>[k,sortValue(o[k])]));return o}
const keyOf=th=>[...new Set(th)].sort().join('+');
const identityKeys=['franchise','continuity','incarnation','referenceScope'];
function check(data,strict){
 if(!data||data.schemaVersion!==2||!Array.isArray(data.themes)||!Array.isArray(data.traits)||!Array.isArray(data.characters)||!Array.isArray(data.selectionProfiles)||typeof data.policyVersion!=='string'||!data.policyVersion||typeof data.dictionarySha256!=='string'||!/^[a-f0-9]{64}$/.test(data.dictionarySha256))throw new Error('dataset v2 invalide');
 const TH=uniq(data.themes,'thème'),T=uniq(data.traits,'trait');uniq(data.characters,'personnage');
 for(const t of data.themes)if(typeof t.label!=='string'||!t.label)throw new Error('thème sans label');
 for(const t of data.traits)if(typeof t.label!=='string'||!t.label||typeof t.definition!=='string'||!t.definition)throw new Error('trait sans définition');
 const identities=new Set();
 for(const c of data.characters){
  if(typeof c.name!=='string'||!c.name||!TH.has(c.theme))throw new Error('personnage invalide');
  if(!plain(c.identity)||identityKeys.some(k=>!own(c.identity,k)||typeof c.identity[k]!=='string'||!c.identity[k]))throw new Error('identité canonique manquante '+c.id);
  const identity=canonical(identityKeys.map(k=>c.identity[k]));if(identities.has(identity))throw new Error('identité canonique dupliquée');identities.add(identity);
  if(c.aliases!=null&&!(Array.isArray(c.aliases)&&c.aliases.every(a=>typeof a==='string')))throw new Error('alias invalides');
  if(!plain(c.traitValues)||Object.keys(c.traitValues).some(k=>!T.has(k)))throw new Error('traitValues invalide');
  for(const t of data.traits){
   if(!own(c.traitValues,t.id))throw new Error('cellule absente (normaliser en null) '+c.id);
   const v=c.traitValues[t.id];if(v!==null&&typeof v!=='boolean')throw new Error('cellule non booléenne');
   const facts=(c.sources||[]).filter(src=>src&&src.accepted===true&&plain(src.facts)&&own(src.facts,t.id));
   if(facts.some(src=>typeof src.facts[t.id]!=='boolean')||new Set(facts.map(src=>src.facts[t.id])).size>1)throw new Error('preuves contradictoires '+c.id+' '+t.id);
   // One consistent accepted fact may remain intentionally uncompiled on a null cell.
   if(v!==null&&(!facts.length||facts.some(src=>src.facts[t.id]!==v)))throw new Error('preuve absente ou contradictoire '+c.id+' '+t.id);
  }
  if(c.traits!==undefined&&(!Array.isArray(c.traits)||new Set(c.traits).size!==c.traits.length||c.traits.some(k=>!T.has(k)||c.traitValues[k]!==true)||data.traits.some(t=>c.traitValues[t.id]===true&&!c.traits.includes(t.id))))throw new Error('traits incohérents');
 }
 const keys=new Set();for(const p of data.selectionProfiles){
  if(!p||!Array.isArray(p.themes)||p.themes.length===0||new Set(p.themes).size!==p.themes.length||p.key!==keyOf(p.themes)||keys.has(p.key))throw new Error('profil invalide');keys.add(p.key);
  if(p.policyVersion!==data.policyVersion||p.dictionarySha256!==data.dictionarySha256)throw new Error('profil révision invalide');
  const el=resolve(data,p.themes);if(!el.ok)throw new Error(el.reason);
 }
 return true;
}
function revision(d){return (d.revision?String(d.revision)+':':'')+fnv(canonical(d))}
const val=(c,t)=>c&&plain(c.traitValues)&&own(c.traitValues,t)?c.traitValues[t]:null;
const has=(c,t)=>val(c,t)===true;
const known=(c,t)=>typeof val(c,t)==='boolean';
function resolve(d,th){
 const fail=reason=>({ok:false,traits:[],pool:[],profileKey:Array.isArray(th)?keyOf(th):'',counts:{},reason});
 if(!Array.isArray(th)||!th.length||th.some(x=>typeof x!=='string'||!d.themes.some(t=>t.id===x&&t.enabled!==false)))return fail('Sélection de thèmes invalide.');
 const key=keyOf(th),p=d.selectionProfiles.find(p=>p.key===key);if(!p)return fail('Configuration indisponible.');
 if(keyOf(p.themes)!==key||p.policyVersion!==d.policyVersion||p.dictionarySha256!==d.dictionarySha256||!Array.isArray(p.traitIds)||!Array.isArray(p.characterIds)||new Set(p.traitIds).size!==p.traitIds.length||new Set(p.characterIds).size!==p.characterIds.length)return fail('Profil invalide.');
 const traits=p.traitIds.map(id=>d.traits.find(t=>t.id===id)),P=p.characterIds.map(id=>d.characters.find(c=>c.id===id));
 if(traits.length<MIN_TRAITS||traits.some(t=>!t)||P.some(c=>!c||!th.includes(c.theme)))return fail('Profil incomplet.');
 const counts={};for(const theme of [...new Set(th)].sort())counts[theme]=P.filter(c=>c.theme===theme).length;
 const vectors=new Set();for(const t of traits){
  if(P.some(c=>!known(c,t.id)))return fail('Rectangle de réponses incomplet.');
  if(P.filter(c=>val(c,t.id)===true).length<MIN_MATCH||P.filter(c=>val(c,t.id)===false).length<MIN_CHARS)return fail('Équilibre global insuffisant.');
  const vector=P.map(c=>has(c,t.id)?'1':'0').join('');if(vectors.has(vector))return fail('Traits indiscernables.');vectors.add(vector);
 }
 return{ok:true,traits,pool:P,profileKey:key,counts,reason:''};
}
function eligibility(d,th){try{check(d);return resolve(d,th)}catch(e){return{ok:false,traits:[],pool:[],profileKey:Array.isArray(th)?keyOf(th):'',counts:{},reason:'Configuration invalide.'}}}
const themeOk=(d,id)=>eligibility(d,[id]).ok;
function search(d,th,q,exclude,limit){const n=norm(q);if(!n)return[];const ex=new Set(exclude||[]);const r=[];
 for(const c of eligibility(d,th).pool){if(ex.has(c.id))continue;let best=9;for(const nm of [c.name].concat(c.aliases||[])){const x=norm(nm);let s=9;if(x===n)s=0;else if(x.startsWith(n))s=1;else if(x.split(' ').some(w=>w.startsWith(n)))s=2;else if(x.includes(n))s=3;if(s<best)best=s}
  if(best<9)r.push([best,c])}
 r.sort((a,b)=>a[0]-b[0]||a[1].name.localeCompare(b[1].name,'fr'));return r.slice(0,limit||8).map(x=>x[1])}
function cleanNames(names){return names.map((n,i)=>String(n||'').replace(/\s+/g,' ').trim().slice(0,16)||'Joueur '+(i+1))}
function dupNames(names){const seen=new Set();for(const n of names){const k=norm(n);if(seen.has(k))return n;seen.add(k)}return null}
function create(d,o){check(d);const names=cleanNames(o.names||[]);if(names.length<MIN_P||names.length>MAX_P)throw new Error('2 à 4 joueurs');const dn=dupNames(names);if(dn)throw new Error('Deux joueurs ont le même nom (« '+dn+' »). Choisis des noms différents.');
 const el=eligibility(d,o.themes);if(!el.ok)throw new Error(el.reason);const rng=o.rng||Math.random;
 const secrets=names.map(()=>el.traits[Math.floor(rng()*el.traits.length)].id);
 const queries={};names.forEach((_,i)=>queries[i]=[]);
 const themes=[...new Set(o.themes)].sort();const st={v:V,profileKey:el.profileKey,rev:revision(d),names,themes,secrets,turn:0,round:1,stage:'play',queries,guesses:[],events:[],winner:null,last:null};st.seal=seal(st);return st}
const seal=s=>fnv(JSON.stringify([s.rev,s.profileKey,s.names,s.themes,s.secrets]));
const find=(d,id)=>d.characters.find(c=>c.id===id);
function ask(d,s,target,charId){ // public pool membership is checked BEFORE any secret is read
 if(!s||typeof s!=='object')throw new Error('partie invalide');{const pel=eligibility(d,s.themes);if(!pel.ok||!pel.pool.some(c=>c.id===charId))throw new Error('personnage invalide')}
 if(!validate(d,s))throw new Error('partie invalide');if(s.stage!=='play')throw new Error('partie terminée');if(!Number.isInteger(target)||target===s.turn||target<0||target>=s.names.length)throw new Error('adversaire invalide');
 const el=eligibility(d,s.themes);const c=el.pool.find(c=>c.id===charId);if(!c)throw new Error('personnage invalide');
 if(!known(c,s.secrets[target]))throw new Error('classification inconnue : réponse impossible');const answer=has(c,s.secrets[target]);const q={actor:s.turn,charId,charName:c.name,answer};s.queries[target].push(q);
 s.last={type:'query',actor:s.turn,target,charId,charName:c.name,answer};s.events.push({...s.last});advance(s);return s.last}
function guess(d,s,target,traitId){if(!validate(d,s))throw new Error('partie invalide');if(s.stage!=='play')throw new Error('partie terminée');if(!Number.isInteger(target)||target===s.turn||target<0||target>=s.names.length)throw new Error('adversaire invalide');
 const el=eligibility(d,s.themes);const t=el.traits.find(x=>x.id===traitId);if(!t)throw new Error('trait invalide');
 const ok=s.secrets[target]===traitId;const g={actor:s.turn,target,traitId,traitLabel:t.label,ok};s.guesses.push(g);
 s.last={type:'guess',actor:s.turn,target,traitId,traitLabel:t.label,ok};s.events.push({...s.last});
 if(ok){s.stage='won';s.winner=s.turn}else advance(s);return s.last}
function advance(s){const n=s.turn+1;if(n>=s.names.length){s.turn=0;s.round++}else s.turn=n}
// Supported state inputs are ordinary mutable JSON trees, never proxies.
// Inspect descriptors before reading properties or writing any part of a transition.
function mutableJSON(x,seen=new Set()){
 if(x===null||typeof x==='string'||typeof x==='boolean')return true;
 if(typeof x==='number')return Number.isFinite(x);
 if(typeof x!=='object'||(!plain(x)&&!(Array.isArray(x)&&Object.getPrototypeOf(x)===Array.prototype))||!Object.isExtensible(x)||seen.has(x))return false;
 seen.add(x);const desc=Object.getOwnPropertyDescriptors(x);
 for(const k of Reflect.ownKeys(desc)){
  const p=desc[k];if(typeof k!=='string'||!own(p,'value')||!p.writable||(!p.configurable&&!(Array.isArray(x)&&k==='length'))||(!p.enumerable&&!(Array.isArray(x)&&k==='length'))||!mutableJSON(p.value,seen)){return false}
 }
 if(Array.isArray(x)&&Object.keys(x).length!==x.length){return false}
 return true;
}
function validate(d,s){try{
 if(!mutableJSON(s)||!s||s.v!==V||!Array.isArray(s.names)||s.names.length<MIN_P||s.names.length>MAX_P||s.names.some(x=>typeof x!=='string'||!x.trim()||x.length>16))return false;
 const n=s.names.length;if(new Set(s.names.map(norm)).size!==n||s.rev!==revision(d)||s.seal!==seal(s))return false;
 if(!Array.isArray(s.themes)||canonical(s.themes)!==canonical([...new Set(s.themes)].sort()))return false;
 const el=eligibility(d,s.themes);if(!el.ok||s.profileKey!==el.profileKey)return false;
 const traits=new Map(el.traits.map(t=>[t.id,t])),chars=new Map(el.pool.map(c=>[c.id,c]));
 if(!Array.isArray(s.secrets)||s.secrets.length!==n||!s.secrets.every(x=>traits.has(x))||!Array.isArray(s.events))return false;
 const queries={};for(let i=0;i<n;i++)queries[i]=[];
 const guesses=[];let turn=0,round=1,stage='play',winner=null,last=null;
 for(const event of s.events){
  if(!plain(event)||stage!=='play'||event.actor!==turn||!Number.isInteger(event.target)||event.target<0||event.target>=n||event.target===turn)return false;
  const target=event.target;
  if(event.type==='query'){
   const c=chars.get(event.charId);if(!c||!known(c,s.secrets[target]))return false;
   const q={actor:turn,charId:c.id,charName:c.name,answer:has(c,s.secrets[target])};
   last={type:'query',actor:turn,target,charId:c.id,charName:c.name,answer:q.answer};queries[target].push(q);
  }else if(event.type==='guess'){
   const t=traits.get(event.traitId);if(!t)return false;
   const g={actor:turn,target,traitId:t.id,traitLabel:t.label,ok:s.secrets[target]===t.id};
   guesses.push(g);last={type:'guess',...g};
   if(g.ok){stage='won';winner=turn}
  }else return false;
  if(canonical(event)!==canonical(last))return false;
  if(stage==='play'){turn++;if(turn===n){turn=0;round++}}
 }
 return canonical(s.queries)===canonical(queries)&&canonical(s.guesses)===canonical(guesses)&&canonical(s.last)===canonical(last)&&s.turn===turn&&s.round===round&&s.stage===stage&&s.winner===winner;
 }catch(e){return false}}
function publicView(s){return{names:s.names.slice(),turn:s.turn,round:s.round,stage:s.stage,winner:s.winner,queries:JSON.parse(JSON.stringify(s.queries)),guesses:s.guesses.map(g=>({actor:g.actor,target:g.target,traitLabel:g.traitLabel,ok:g.ok}))}}
return{themeOk,has,known,dupNames,revision,seal,V,MIN_P,MAX_P,norm,check,eligibility,search,create,ask,guess,validate,publicView,cleanNames}});
