'use strict';
(function(root){
const THEMES={
general:{n:'Général',p:[['Café','Thé'],['Plage','Piscine'],['Pizza','Tarte'],['Vélo','Trottinette'],['Stylo','Crayon'],['Cinéma','Théâtre'],['Savon','Shampoing'],['Train','Tramway'],['Pull','Gilet'],['Montagne','Colline'],['Lait','Crème'],['Chocolat','Caramel']]},
lol:{n:'League of Legends',p:[['Ahri','Evelynn'],['Jinx','Vi'],['Yasuo','Yone'],['Lux','Syndra'],['Zed','Talon'],['Thresh','Blitzcrank'],['Garen','Darius'],['Ashe','Caitlyn'],['Baron Nashor','Dragon'],['Lee Sin','Jarvan IV'],['Tour','Inhibiteur'],['Ranked','Normal']]},
jv:{n:'Jeux vidéo',p:[['Mario','Sonic'],['Minecraft','Terraria'],['Pokémon','Digimon'],['Fortnite','Apex Legends'],['Les Sims','Animal Crossing'],['Switch','PlayStation'],['Zelda','Final Fantasy'],['Pac-Man','Tetris'],['Overwatch','Valorant'],['Stardew Valley','Animal Crossing'],['Mario Kart','Crash Team Racing'],['Manette','Clavier']]},
anime:{n:'Animés',p:[['Naruto','Sasuke'],['Luffy','Zoro'],['Goku','Vegeta'],['Tanjiro','Zenitsu'],['Eren','Levi'],['Totoro','Ponyo'],['Sailor Moon','Card Captor Sakura'],['One Piece','Naruto'],['Demon Slayer','Jujutsu Kaisen'],['Attack on Titan','Fullmetal Alchemist'],['Studio Ghibli','Pixar'],['Death Note','Code Geass']]},
pop:{n:'Pop et icônes queer',p:[['Britney Spears','Christina Aguilera'],['Lady Gaga','Katy Perry'],['Beyoncé','Rihanna'],['Madonna','Cher'],['Dua Lipa','Ariana Grande'],['Taylor Swift','Olivia Rodrigo'],['Sabrina Carpenter','Chappell Roan'],['Shakira','Jennifer Lopez'],['RuPaul','Tyra Banks'],['Drag Race','Project Runway'],['Kylie Minogue','Dua Lipa'],['Paillettes','Strass']]},
girly:{n:'Girly',p:[['Gloss','Rouge à lèvres'],['Vernis','Faux ongles'],['Licorne','Papillon'],['Bubble tea','Milkshake'],['Barbie','Hello Kitty'],['Skincare','Maquillage'],['Sac à main','Pochette'],['Talons','Ballerines'],['Journal intime','Bullet journal'],['Peluche','Poupée'],['Brunch','Goûter'],['Rose','Fuchsia']]}
};
const rnd=(n,r)=>Math.floor((r||Math.random)()*n);
function roleCounts(n,mw){const u=n>=9?2:1,w=mw&&n>=5?1:0;return{u,w,c:n-u-w}}
function shuffle(a,r){a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1,r);[a[i],a[j]]=[a[j],a[i]]}return a}
function pickPair(themes,r){const all=[];themes.forEach(t=>THEMES[t]&&THEMES[t].p.forEach(p=>all.push(p)));if(!all.length)THEMES.general.p.forEach(p=>all.push(p));const p=all[rnd(all.length,r)];return rnd(2,r)?[p[1],p[0]]:p}
function deal(n,opts,r){const rc=roleCounts(n,opts.mw),pair=pickPair(opts.themes||['general'],r);const roles=shuffle([].concat(Array(rc.c).fill('civil'),Array(rc.u).fill('undercover'),Array(rc.w).fill('white')),r);
 const words=roles.map(x=>x==='civil'?pair[0]:x==='undercover'?pair[1]:null);const alive=roles.map(()=>true);
 const cand=roles.map((x,i)=>x==='white'?-1:i).filter(i=>i>=0);return{roles,words,pair,alive,first:cand[rnd(cand.length,r)]}}
function status(g){const a=g.roles.filter((x,i)=>g.alive[i]);const bad=a.filter(x=>x!=='civil').length,civ=a.filter(x=>x==='civil').length;
 if(!g.roles.some((x,i)=>g.alive[i]&&x!=='civil'))return'civils';if(bad>=civ)return'impostors';return null}
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const guessOk=(g,s)=>norm(s)!==''&&norm(s)===norm(g.pair[0]);
const PTS={civil:2,undercover:10,white:6};
root.Undercover={THEMES,roleCounts,deal,status,guessOk,norm,PTS,pickPair};
if(typeof module!=='undefined')module.exports=root.Undercover;
})(typeof window!=='undefined'?window:globalThis);
