import assert from 'node:assert/strict';
import {Chess,DEFAULT_POSITION,result,claimable,repetitions,restore,serialize,bestMove} from './chess-engine.mjs';
const g=new Chess();assert.equal(g.moves().length,20);assert.throws(()=>g.move({from:'e2',to:'e5'}));assert.equal(g.fen(),DEFAULT_POSITION);
let c=new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
assert(!c.moves({square:'e2'}).includes('Rd2'));assert(c.moves({square:'e2'}).includes('Rxe8+'));
c=new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
assert(c.moves().includes('O-O'));assert(c.moves().includes('O-O-O'));c.move('O-O');assert.equal(c.get('f1').type,'r');c.undo();assert.equal(c.get('h1').type,'r');
c=new Chess('r3kr1r/8/8/8/8/8/8/R3K2R w KQ - 0 1');assert(!c.moves().includes('O-O'),'no castle through check');assert(c.moves().includes('O-O-O'));
c=new Chess('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');assert(c.isCheck());assert(!c.moves().some(m=>m.startsWith('O-')));
c=new Chess('4k3/8/8/r4pPK/8/8/8/8 w - f6 0 1');assert(!c.moves({square:'g5'}).some(m=>m.startsWith('gxf6')),'en passant exposes check');
c=new Chess('4k3/8/8/5pP1/8/8/8/4K3 w - f6 0 1');c.move({from:'g5',to:'f6'});assert(!c.get('f5'));c.undo();assert(c.get('f5'));
for(const promotion of ['q','r','b','n']){c=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');assert.equal(c.moves({square:'a7',verbose:true}).length,4);c.move({from:'a7',to:'a8',promotion});assert.equal(c.get('a8').type,promotion)}
c=new Chess();for(const m of ['f3','e5','g4','Qh4#'])c.move(m);assert.equal(result(c).kind,'mate');assert.equal(result(c).winner,'b');
assert.equal(result(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).kind,'stalemate');
for(const fen of ['4k3/8/8/8/8/8/8/4K3 w - - 0 1','4k3/8/8/8/8/8/8/3BK3 w - - 0 1','4k3/8/8/8/8/8/8/3NK3 w - - 0 1'])assert.equal(result(new Chess(fen)).kind,'material');
assert(!result(new Chess('4k3/8/8/8/8/8/8/3RK3 w - - 0 1')).over);
c=new Chess();const cycle=['Nf3','Nf6','Ng1','Ng8'];for(let i=0;i<2;i++)cycle.forEach(m=>c.move(m));
assert(claimable(c));assert.equal(repetitions(c),3);assert(!result(c).over);assert.equal(result(c,true).kind,'claim');
const saved=serialize(c,{mode:'two'});c=restore(JSON.parse(JSON.stringify(saved)));assert.equal(repetitions(c),3);
for(let i=0;i<2;i++)cycle.forEach(m=>c.move(m));assert.equal(result(c).kind,'fivefold');c.undo();assert(!result(c).over);
for(const n of [99,100,149,150]){c=new Chess('4k2r/8/8/8/8/8/8/R3K3 w - - '+n+' 1');assert.equal(claimable(c),n>=100);assert.equal(result(c).over,n>=150)}
c=new Chess('4k2r/8/8/8/8/8/P7/R3K3 w - - 99 1');c.move('a3');assert(!claimable(c),'pawn resets 50 counter');
c=new Chess('4k2r/8/8/8/8/8/8/R3K3 w - - 99 1');c.move('Ra2');assert(claimable(c));c.undo();assert(!claimable(c),'intended move can establish claim without applying it');
c=new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 150 1');assert.equal(result(c).kind,'mate','mate overrides 75');
for(const s of [null,{}, {v:1,moves:['e9'],mode:'two'}, {v:1,moves:[],mode:'evil'}, {v:1,moves:[],mode:'two',start:'bad'}])assert.throws(()=>restore(s));
for(const level of ['easy','medium','hard']){
 c=new Chess();const fen=c.fen();const a=bestMove(c,level);assert(c.moves({verbose:true}).some(m=>m.from===a.move.from&&m.to===a.move.to));assert.equal(c.fen(),fen);console.log('AI',level,a.depth,a.nodes);
}
// Black has mate in one. Easy, deterministic first move, misses it.
const tactical='6k1/8/8/8/8/5q2/5pp1/7K b - - 0 1';
c=new Chess(tactical);const hard=bestMove(c,'hard',{budget:1800});c.move(hard.move);assert(c.isCheckmate(),'hard finds mate');
console.log('chess rules, history, draws, restore and AI pass');
