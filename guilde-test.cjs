'use strict';
const assert=require('assert'),http=require('http'),fs=require('fs'),path=require('path');
const E=require('./guilde-engine.js');
function fixture(){const themes=[{id:'anime',label:'Anime'},{id:'lol',label:'LoL'},{id:'disney',label:'Disney'}];
 const traits=['t0','t1','t2','t3','t4','t5'].map((id,i)=>({id,label:'Trait '+i,definition:'Définition '+i}));
 const characters=[];themes.forEach((th,ti)=>{for(let i=0;i<8;i++)characters.push({id:th.id+i,name:(i===0?'Éléonore ':'Héros ')+th.id+' '+i,aliases:i===1?['Zézette'+th.id]:[],theme:th.id,traits:traits.filter((t,k)=>(i+k+ti)%3===0||k===0&&i%2===0||k===1&&i%2===1&&i<6).map(t=>t.id)}) });
 return{themes,traits,characters}}
const D=fixture();
// engine
assert(E.check(D));assert.equal(E.norm('Éléonore!'),'eleonore');
const el=E.eligibility(D,['anime']);assert(el.ok,el.reason);
for(const t of el.traits){assert(D.characters.filter(c=>c.theme==='anime'&&c.traits.includes(t.id)).length>=3)}
assert(!E.eligibility(D,[]).ok);assert(!E.eligibility({themes:D.themes,traits:D.traits.slice(0,2),characters:D.characters},['anime']).ok);
assert.equal(E.search(D,['anime'],'eleo',[])[0].id,'anime0');assert.equal(E.search(D,['anime'],'zezette',[])[0].id,'anime1');assert.equal(E.search(D,['anime'],'zezetteLOL',[]).length,0);assert(E.search(D,['anime'],'heros',['anime2']).every(c=>c.id!=='anime2'));
assert.equal(E.search(D,['anime'],'lol',[]).length,0);
let n=0;const rng=()=>[0,0,.99,.5][n++%4];
const g=E.create(D,{names:['A','','C'],themes:['anime','lol'],rng});assert.equal(g.names[1],'Joueur 2');assert.equal(g.secrets.length,3);assert(E.validate(D,JSON.parse(JSON.stringify(g))));
assert.throws(()=>E.create(D,{names:['A'],themes:['anime']}));
const g2=E.create(D,{names:['A','B'],themes:['anime'],rng:()=>0});assert.equal(g2.secrets[0],g2.secrets[1]);
const tr=g2.secrets[1];const yes=D.characters.find(c=>c.theme==='anime'&&c.traits.includes(tr)),no=D.characters.find(c=>c.theme==='anime'&&!c.traits.includes(tr));
assert.throws(()=>E.ask(D,g2,0,yes.id));assert.throws(()=>E.ask(D,g2,1,'lol0'));
assert.equal(E.ask(D,g2,1,yes.id).answer,true);assert.equal(g2.turn,1);assert.equal(E.ask(D,g2,0,no.id).answer,tr&&no.traits.includes(g2.secrets[0]));assert.equal(g2.turn,0);assert.equal(g2.round,2);
const other=el.traits.find(t=>t.id!==tr);const r=E.guess(D,g2,1,other.id);assert(!r.ok);assert.equal(g2.turn,1);assert.equal(g2.stage,'play');
assert(!JSON.stringify(E.publicView(g2)).includes('secrets'));
const r2=E.guess(D,g2,0,g2.secrets[0]);assert(r2.ok);assert.equal(g2.stage,'won');assert.equal(g2.winner,1);assert.throws(()=>E.ask(D,g2,0,yes.id));
const bad=JSON.parse(JSON.stringify(g2));bad.secrets[0]='zz';assert(!E.validate(D,bad));assert(!E.validate(D,{v:1}));assert(!E.validate(D,null));
{const mk=()=>JSON.parse(JSON.stringify(g2));const bad=(f,m)=>{const x=mk();f(x);if(E.validate(D,x))throw new Error('should reject '+m)};
 assert(E.validate(D,mk()));const w=mk();
 bad(x=>{x.secrets[0]='t5'},'secret change (seal)');bad(x=>{x.rev='old'},'rev');bad(x=>{x.stage='play';x.winner=null},'won->play');bad(x=>{x.winner=0},'winner');
 bad(x=>{x.queries[1][0].answer=!x.queries[1][0].answer},'truth');bad(x=>{x.queries[1][0].charName='X'},'charName');bad(x=>{x.queries[1][0].actor=1},'self-query');bad(x=>{x.queries[1][0].actor=-1},'neg actor');
 bad(x=>{x.guesses[0].target=-1},'neg target');bad(x=>{x.guesses[0].ok=true},'guess ok');bad(x=>{x.turn=0},'turn');bad(x=>{x.round=9},'round');bad(x=>{x.names[1]=x.names[0]},'dup names');
 bad(x=>{x.last=null},'last');
 const D2=JSON.parse(JSON.stringify(D));D2.characters[0].traits=D2.characters[0].traits.filter(t=>t!=='t0');D2.characters[0].traits.push('t3');assert(!E.validate(D2,mk())||D2.characters[0].traits.length===0,'drift');
 // trait not eligible in selected themes
 const Dx=JSON.parse(JSON.stringify(D));Dx.traits.push({id:'tx',label:'Rare',definition:'rare'});Dx.characters[0].traits.push('tx');const s3=E.create(Dx,{names:['A','B'],themes:['anime'],rng:()=>0});s3.secrets[0]='tx';s3.seal=E.seal(s3);assert(!E.validate(Dx,s3),'non eligible secret');
 assert.throws(()=>E.check({themes:[{id:'a',label:'a'},{id:'a',label:'b'}],traits:[],characters:[]}));assert.throws(()=>E.check({themes:D.themes,traits:D.traits,characters:[Object.assign({},D.characters[0],{theme:'zzz'})]}));assert.throws(()=>E.check(D,true));
 assert.deepEqual(E.cleanNames(['Ana',' ','']),['Ana','Joueur 2','Joueur 3']);assert.throws(()=>E.create(D,{names:['Ana','ana'],themes:['anime']}),/même nom/);assert.throws(()=>E.create(D,{names:['Joueur 2',''],themes:['anime']}),/même nom/);
 const pv=E.publicView(g2);pv.queries[1].push(1);assert.equal(g2.queries[1].length,1);}
{const x=JSON.parse(JSON.stringify(g2));x.last.actor=(x.last.actor+1)%2;assert(!E.validate(D,x),'last actor');}
{const F=JSON.parse(JSON.stringify(D));F.characters.forEach(c=>{c.traitValues={};F.traits.forEach(t=>c.traitValues[t.id]=c.traits.includes(t.id))});assert(E.check(F));assert.throws(()=>E.check(F,true),/sources/);F.characters.forEach(c=>c.sources=[{url:'x'}]);assert(E.check(F,true));
 const N=JSON.parse(JSON.stringify(F));N.characters[0].traitValues.t0=null;assert.throws(()=>E.check(N,true),/incomplète|sans valeur/);assert(!E.eligibility(N,['anime']).traits.some(t=>t.id==='t0'),'unknown trait not eligible');
 const B=JSON.parse(JSON.stringify(F));B.characters[0].traitValues.t2='oui';assert.throws(()=>E.check(B),/incomplète|non booléen/);
 const I=JSON.parse(JSON.stringify(F));I.characters[0].traitValues.t1=!I.characters[0].traits.includes('t1');assert.throws(()=>E.check(I),/incohérents/);
 const U=JSON.parse(JSON.stringify(D));U.themes.push({id:'x',label:'X'});assert(!E.themeOk(U,'x'));assert(!E.eligibility(U,['x']).ok);assert(E.eligibility(U,['anime']).ok);
 const M=JSON.parse(JSON.stringify(F));const gm=E.create(M,{names:['A','B'],themes:['anime'],rng:()=>0});const tt=gm.secrets[1];const cc=M.characters.find(c=>c.theme==='anime');cc.traitValues[tt]=null;assert.throws(()=>E.ask(M,gm,1,cc.id),/inconnue/);}
{const fs=require('fs');for(const f of fs.readdirSync(__dirname).filter(f=>/^guilde/.test(f)))assert(!fs.readFileSync(path.join(__dirname,f),'utf8').includes('\ufffd'),'U+FFFD in '+f);
 const P=JSON.parse(JSON.stringify(D));P.characters.forEach(c=>{c.traitValues={};P.traits.forEach(t=>c.traitValues[t.id]=c.traits.includes(t.id))});
 const P2=JSON.parse(JSON.stringify(P));P2.characters[3].traitValues.t4=null;assert.throws(()=>E.check(P2),/incomplète/);
 const P3=JSON.parse(JSON.stringify(P));delete P3.characters[3].traitValues.t4;assert.throws(()=>E.check(P3),/incomplète/);
 const P4=JSON.parse(JSON.stringify(P));P4.characters[5].traitValues.t4=false;const was=P.characters[5].traitValues.t4;if(was)assert.throws(()=>E.check(P4),/incohérents/);
 // false is a real NO, distinct from null
 const gp=E.create(P,{names:['A','B'],themes:['anime'],rng:()=>0});const tt=gp.secrets[1];const neg=P.characters.find(c=>c.theme==='anime'&&c.traitValues[tt]===false);assert.equal(E.ask(P,gp,1,neg.id).answer,false);
 // revision binds content even with supplied revision
 const R1=JSON.parse(JSON.stringify(P));R1.revision='r1';const R2=JSON.parse(JSON.stringify(R1));R2.traits[0].definition='autre sens';assert.notEqual(E.revision(R1),E.revision(R2));
 const R3=JSON.parse(JSON.stringify(R1));R3.characters[0].name='Autre';assert.notEqual(E.revision(R1),E.revision(R3));
 const R4=JSON.parse(JSON.stringify(R1));R4.characters[0].traitValues.t1=!R4.characters[0].traitValues.t1;R4.characters[0].traits=P.traits.filter(t=>R4.characters[0].traitValues[t.id]).map(t=>t.id);assert.notEqual(E.revision(R1),E.revision(R4));
 const gr=E.create(R1,{names:['A','B'],themes:['anime'],rng:()=>0});assert(E.validate(R1,gr));assert(!E.validate(R2,gr),'definition drift');assert(!E.validate(R3,gr),'name drift');}
console.log('engine ok');
// ui
const root=__dirname,types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.woff2':'font/woff2','.png':'image/png'};
const srv=http.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u==='/')u='/guilde.html';
 if(u==='/guilde-data.js'){s.setHeader('content-type','text/javascript');return s.end('window.GuildeData='+JSON.stringify(D))}
 const f=path.join(root,u);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.statusCode=404;return s.end('')}
 s.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');s.end(fs.readFileSync(f))});
(async()=>{await new Promise(r=>srv.listen(0,r));const base='http://localhost:'+srv.address().port+'/';const pw=require('/tmp/qa/node_modules/playwright');
 for(const [name,type] of [['chromium',pw.chromium],['webkit',pw.webkit]])for(const [w,h] of [[360,640],[390,844]]){
  const br=await type.launch(name==='chromium'?{executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']}:{});
  const ctx=await br.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
  const $=id=>p.locator('[data-testid="'+id+'"]');const noOverflow=async()=>assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+name+w);
  await p.goto(base);await $('start').waitFor();assert(await $('start').isDisabled());assert(/thème/i.test(await $('blocked').innerText()));await noOverflow();
  await $('theme-anime').check();await $('theme-lol').check();assert(await $('start').isEnabled());
  await $('hardcore').check();for(const t of D.themes)assert(await $('theme-'+t.id).isChecked());await $('hardcore').uncheck();await $('theme-anime').check();await $('theme-lol').check();
  await $('count-3').click();await $('name-0').fill('<img src=x onerror=window.__x=1>');await $('name-1').fill('Bob');await $('name-2').fill('Cléo');
  assert.equal(await $('glossary').count(),1);await $('name-1').fill('<IMG src=x onerror=window.__x=1>');await $('start').click();assert(/même nom/.test(await p.locator('[role=alert]').innerText()));assert.equal(await $('start').count(),1);assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('role')),'alert','focus on error');assert.equal(await $('name-1').getAttribute('aria-invalid'),'true');assert(await $('glossary').evaluate(e=>e.open),'glossary open');await $('name-1').fill('Bob');await $('start').click();await $('pass-continue').waitFor();await p.evaluate(()=>{const r=JSON.parse(localStorage.getItem('rouky-guilde-v1'));r.ui.screen='result';localStorage.setItem('rouky-guilde-v1',JSON.stringify(r))});await p.reload();await $('pass-continue').waitFor();assert.equal(await p.locator('#app').getAttribute('data-screen'),'pass','result with null last must not crash');
  // secrets: not visible on pass screen
  let txt=await p.locator('#app').innerText();assert(!/Trait \d/.test(txt),'secret on pass');assert(!await p.evaluate(()=>window.__x));
  const st=()=>p.evaluate(()=>JSON.parse(JSON.stringify(window.GuildeUI.state())));
  for(let i=0;i<3;i++){await $('pass-continue').click();assert.equal(await p.locator('[data-qa-private-secret=secret][data-seat="'+i+'"]').count(),1);const t=await $('secret-trait').innerText();const sid=(await st()).G.secrets[i];assert.equal(t,D.traits.find(x=>x.id===sid).label);
   if(i===0){await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});assert.equal(await $('secret-trait').count(),0,'lock on hide');assert(!/Trait \d/.test(await p.locator('#app').innerText()));await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true})});await $('pass-continue').click();}
   await $('secret-ok').click();}
  // turn seat 0
  await $('pass-continue').click();await $('turn-seat').waitFor();assert.equal(await p.evaluate(()=>document.activeElement.tagName),'H2','focus moves to heading');await noOverflow();assert.equal(await p.locator('[data-qa-private-secret=turn][data-seat="0"]').count(),1);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await p.locator('[data-qa-private-secret]').count(),0,'blur lock');assert.equal(await $('turn-trait').count(),0);await $('pass-continue').click();
  // reload restores locked
  await p.reload();await $('pass-continue').waitFor();assert.equal(await $('turn-trait').count(),0);assert(!/Trait \d/.test(await p.locator('#app').innerText()));
  await $('pass-continue').click();
  // query by alias with accent folding + keyboard
  await $('query-input').fill('zezetteanime');assert.equal(await p.locator('[data-testid=query-option]').count(),1);await $('query-input').press('Enter');await $('query-submit').click();
  await $('result').waitFor();assert(/OUI|NON/.test(await $('result').innerText()));assert.equal(await p.locator('[data-qa-private-secret]').count(),0,'no private node on result');
  assert(!await $('turn-trait').count());
  let S=await st();assert.equal(S.G.turn,1);assert.equal(S.G.queries[1].length,1);
  await $('result-continue').click();await $('pass-continue').click();
  await $('query-input').fill('zezetteanime');assert.equal(await p.locator('[data-testid=query-option]').count(),1,'repeat allowed');await $('guess-open').click();assert.equal(await p.locator('[data-testid^=trait-def-]').count(),E.eligibility(D,['anime','lol']).traits.length);assert.equal(await p.locator('[data-testid^=gloss-def-]').count(),E.eligibility(D,['anime','lol']).traits.length);await $('mode-query').click();
  // wrong guess by seat1
  const wrong=D.traits.find(t=>t.id!==S.G.secrets[0]).id;await $('target-0').click();await $('guess-open').click();await $('guess-select').selectOption(wrong);await $('guess-submit').click();await $('result').waitFor();
  S=await st();assert.equal(S.G.stage,'play');assert.equal(S.G.turn,2);await $('result-continue').click();await $('pass-continue').click();
  const hist=await p.locator('[data-testid=guesses]').innerText();assert(/raté/.test(hist));
  // correct guess by seat2
  await $('target-1').click();await $('guess-open').click();await $('guess-select').selectOption(S.G.secrets[1]);await $('guess-submit').click();await $('winner').waitFor();assert(/Cléo/.test(await $('winner').innerText()));await noOverflow();
  assert.equal(await $('unranked').count(),1);assert.equal(await p.locator('ol,[data-rank]').count(),0);await $('replay').click();await $('start').waitFor();
  assert.deepEqual(errs,[],errs.join());await br.close();console.log(name,w,'ok')}
 srv.close()})().catch(e=>{console.error(e);process.exit(1)});
