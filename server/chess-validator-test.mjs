import assert from 'node:assert/strict';
import {validateChessAction as play} from './chess-validator.mjs';
let r={moves:[]};
assert.throws(()=>play(r,2,{kind:'move',from:'e7',to:'e5'}),/NOT_YOUR_TURN/);
assert.throws(()=>play(r,1,{kind:'move',from:'e2',to:'e5'}));
assert.throws(()=>play(r,1,{kind:'claim'}),/DRAW_NOT_CLAIMABLE/);
assert.throws(()=>play(r,1,{kind:'move',from:'e2',to:'e4',fen:'forged'}),/INVALID_ACTION/);
for(const [seat,from,to] of [[1,'e2','e4'],[2,'a7','a6'],[1,'e4','e5'],[2,'d7','d5'],[1,'e5','d6']]) r=play(r,seat,{kind:'move',from,to});
assert.equal(r.moves.at(-1),'exd6'); // en passant
r={moves:['e4','e5','Nf3','Nc6','Bc4','Nf6']};
r=play(r,1,{kind:'move',from:'e1',to:'g1'});assert.equal(r.moves.at(-1),'O-O');
r={moves:['f3','e5','g4']};r=play(r,2,{kind:'move',from:'d8',to:'h4'});
assert.equal(r.result.kind,'mate');assert.throws(()=>play(r,1,{kind:'move',from:'a2',to:'a3'}),/GAME_FINISHED/);
r={moves:['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8']};
r=play(r,1,{kind:'claim'});assert.equal(r.result.kind,'claim');
console.log('PASS server chess building block: stored-history replay, turn, illegal move, extra state rejection, en passant, castling, mate, draw claim');
