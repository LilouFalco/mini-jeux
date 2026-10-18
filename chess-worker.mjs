import {restore,bestMove,claimable,result} from './chess-engine.mjs';
self.onmessage=({data})=>{
 try{const g=restore(data.save);const r=result(g);
 if(r.over){postMessage({id:data.id,fen:g.fen(),move:null});return}
 if(claimable(g)){postMessage({id:data.id,fen:g.fen(),claim:true});return}
 const answer=bestMove(g,data.save.mode);
 postMessage({id:data.id,fen:g.fen(),...answer});
 }catch(e){postMessage({id:data.id,error:String(e)})}
};
