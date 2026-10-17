const U=require('./undercover-engine.js');const a=require('assert');
for(let n=3;n<=10;n++)for(const mw of[false,true]){const rc=U.roleCounts(n,mw);a.equal(rc.u+rc.w+rc.c,n);a(rc.c>rc.u+rc.w,n+' civils majority');for(let k=0;k<50;k++){const g=U.deal(n,{mw,themes:Object.keys(U.THEMES)});a.equal(g.roles.length,n);a.equal(g.roles.filter(x=>x==='white').length,rc.w);a(g.roles[g.first]!=='white');a.equal(U.status(g),null)}}
for(const[k,t]of Object.entries(U.THEMES))for(const[x,y]of t.p){a(x&&y&&U.norm(x)!==U.norm(y),k+x)}
const g=U.deal(5,{mw:false,themes:['lol']});const u=g.roles.indexOf('undercover');g.alive[u]=false;a.equal(U.status(g),'civils');
const h={roles:['civil','civil','undercover'],alive:[true,true,true]};h.alive[0]=false;a.equal(U.status(h),'impostors');
a(U.guessOk({pair:['Beyoncé','x']},'beyonce'));a(!U.guessOk({pair:['A','B']},''));
console.log('undercover engine ok')
