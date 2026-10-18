// Pure server-side validation building block. NOT an HTTP endpoint or deployed service.
// `record` MUST come from locked trusted storage; never pass a browser-provided position/history.
import {Chess, DEFAULT_POSITION, result, claimable} from '../chess-engine.mjs';
export function validateChessAction(record, seat, action) {
 if (!record || !Array.isArray(record.moves) || record.moves.length>2048 ||
     ![1,2].includes(seat) || !action || typeof action!=='object') throw Error('INVALID_ACTION');
 const game=new Chess(DEFAULT_POSITION);
 for (const move of record.moves) {
  if(typeof move!=='string' || move.length>16) throw Error('INVALID_STORED_HISTORY');
  game.move(move,{strict:true});
 }
 if(result(game).over || record.claimed===true) throw Error('GAME_FINISHED');
 if(game.turn()!==(seat===1?'w':'b')) throw Error('NOT_YOUR_TURN');
 if(action.kind==='claim') {
  if(Object.keys(action).length!==1 || !claimable(game)) throw Error('DRAW_NOT_CLAIMABLE');
  return {moves:record.moves.slice(),fen:game.fen(),claimed:true,result:result(game,true)};
 }
 if(action.kind!=='move' || Object.keys(action).some(k=>!['kind','from','to','promotion'].includes(k)) ||
    !/^[a-h][1-8]$/.test(action.from||'') || !/^[a-h][1-8]$/.test(action.to||'') ||
    (action.promotion!==undefined && !['q','r','b','n'].includes(action.promotion))) throw Error('INVALID_ACTION');
 if(record.moves.length>=2048) throw Error('HISTORY_LIMIT');
 // chess.js decides legal moves, king safety, castling, en passant and promotion.
 const move=game.move({from:action.from,to:action.to,...(action.promotion?{promotion:action.promotion}:{})});
 return {moves:[...record.moves,move.san],fen:game.fen(),claimed:false,result:result(game)};
}
