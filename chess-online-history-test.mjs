import assert from 'node:assert/strict';
import {reconstructOnlineChess as replay} from './chess-online-history.mjs';
assert.equal(replay(['e2e4','e7e5']).history().length,2);
assert.throws(()=>replay(['e2e5']),/ILLEGAL_REMOTE_MOVE/);
assert.throws(()=>replay(['e2e4','d2d4']),/ILLEGAL_REMOTE_MOVE/);
assert.throws(()=>replay(['bad']),/INVALID_REMOTE_HISTORY/);
assert.equal(replay(['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','e1g1']).history().at(-1),'O-O');
console.log('PASS client history replay legal moves, illegal remote move, wrong side, shape, castling');
