'use strict';
(function(root){
const T={
general:{n:'Général',c:['Tour Eiffel','Pizza','Licorne','Vampire','Père Noël','Chewing-gum','Parapluie','Montgolfière','Pirate','Astronaute','Crêpe','Bouée','Sirène','Dentiste','Aspirateur','Karaoké','Mariage','Cirque','Trampoline','Selfie','Valise','Barbe à papa','Escargot','Bibliothèque','Feu d\'artifice','Fantôme','Pyjama','Sushi','Marmotte','Grève']},
lol:{n:'League of Legends',c:['Ahri','Jinx','Yasuo','Lux','Teemo','Thresh','Baron Nashor','Faker','Nexus','Arcane','Lee Sin','Blitzcrank','Zed','Garen','Poro','Flash','Mid lane','Jungle','Pentakill','Tour','Rift','Vayne','Katarina','Draven','Sona','Ekko','Vi','Miss Fortune','Heimerdinger','Soraka']},
jv:{n:'Jeux vidéo',c:['Mario','Zelda','Pikachu','Minecraft','Les Sims','Tetris','Pac-Man','Sonic','Fortnite','Animal Crossing','Among Us','Kirby','Lara Croft','Donkey Kong','Stardew Valley','Mario Kart','Just Dance','Creeper','Pokéball','Manette','Game Over','Boss final','Speedrun','Kratos','Link','Bowser','Tamagotchi','Switch','Candy Crush','Overcooked']},
anime:{n:'Animés',c:['Naruto','Sailor Moon','Pikachu','Totoro','Luffy','Goku','Sasuke','Chihiro','Tanjiro','Nezuko','Pokémon','Death Note','Attack on Titan','One Piece','Dragon Ball','Hello Kitty','Doraemon','Mon voisin Totoro','Ghibli','Cosplay','Kawaii','Sensei','Ramen','Shonen','Mangaka','Evangelion','Fullmetal Alchemist','Jujutsu Kaisen','Demon Slayer','Yu-Gi-Oh!']},
pop:{n:'Pop et icônes queer',c:['Britney Spears','Christina Aguilera','Lady Gaga','RuPaul','Beyoncé','Madonna','Cher','Kylie Minogue','Dua Lipa','Sabrina Carpenter','Charli XCX','Chappell Roan','Troye Sivan','Sasha Velour','Trixie Mattel','Katya','Bianca Del Rio','Alyssa Edwards','Violet Chachki','Drag Race','Paillettes','Pride','Arc-en-ciel','Talons hauts','Perruque','Lip sync','Diva','Karaoké','Boule à facettes','Concert']},
girly:{n:'Girly',c:['Barbie','Hello Kitty','Vernis à ongles','Gloss','Licorne','Paillettes','Légalement blonde','Bubble tea','Peluche','Bracelet','Rose bonbon','Pyjama party','Maquillage','Mini sac','Nœud rose','Coeur','Papillon','Strass','Selfie','Journal intime','Bain moussant','Macaron','Cupcake','Boucles d\'oreilles','Brillant à lèvres','Kawaii','Pastel','Tote bag','Couronne','Fée']}
};
function rnd(n,r){return Math.floor((r||Math.random)()*n)}
function shuffle(a,r){a=a.slice();for(let i=a.length-1;i>0;i--){const j=rnd(i+1,r);[a[i],a[j]]=[a[j],a[i]]}return a}
function cards(themes,count,r){const s=new Set();(themes&&themes.length?themes:['general']).forEach(t=>T[t]&&T[t].c.forEach(c=>s.add(c)));return shuffle([...s],r).slice(0,count)}
function teams(n,r){const o=shuffle(Array.from({length:n},(_,i)=>i),r);return [o.filter((_,i)=>i%2===0),o.filter((_,i)=>i%2===1)]}
function make(n,themes,count,r){if(!Number.isInteger(n)||n<4||n>12)throw new RangeError('4 à 12 joueurs');const cs=cards(themes,count,r);if(cs.length<10)throw new RangeError('pas assez de cartes');
 return {n,cards:cs,teams:teams(n,r),pile:shuffle(cs.map((_,i)=>i),r),round:0,team:0,pos:[0,0],scores:[[0,0,0],[0,0,0]],found:[]}}
function describer(G){const t=G.teams[G.team];return t[G.pos[G.team]%t.length]}
function top(G){return G.pile.length?G.pile[0]:-1}
function found(G){if(!G.pile.length)return false;const c=G.pile.shift();G.found.push(c);G.scores[G.team][G.round]++;return true}
function pass(G){if(G.pile.length>1)G.pile.push(G.pile.shift());return G.pile.length>0}
function endTurn(G){G.pos[G.team]++;G.team=1-G.team}
function roundDone(G){return G.pile.length===0}
function nextRound(G,r){G.round++;G.pile=shuffle(G.cards.map((_,i)=>i),r);G.found=[];return G.round<3}
function total(G,t){return G.scores[t].reduce((a,b)=>a+b,0)}
function winner(G){const a=total(G,0),b=total(G,1);return a>b?0:b>a?1:-1}
root.TimesUp={THEMES:T,make,describer,top,found,pass,endTurn,roundDone,nextRound,total,winner,shuffle,cards};
if(typeof module!=='undefined')module.exports=root.TimesUp})(typeof window!=='undefined'?window:globalThis);
