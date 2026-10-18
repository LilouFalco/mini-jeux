// Both online clients must call this before rendering/acknowledging remote history.
// Throws on invalid input/history; never mutate the currently displayed game on failure.
import {Chess,DEFAULT_POSITION} from './chess-engine.mjs';
export function reconstructOnlineChess(moves) {
 if(!Array.isArray(moves)||moves.length>2048) throw Error('INVALID_REMOTE_HISTORY');
 const game=new Chess(DEFAULT_POSITION);
 for(const uci of moves){
  if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw Error('INVALID_REMOTE_HISTORY');
  try{game.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci[4]?{promotion:uci[4]}:{})});}
  catch{throw Error('ILLEGAL_REMOTE_MOVE');}
 }
 return game;
}
