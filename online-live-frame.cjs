// Test-only decoder for official Realtime v2 text and user-broadcast frames.
module.exports=function decode(payload){
 if(typeof payload==='string'){const raw=JSON.parse(payload);return Array.isArray(raw)?{topic:raw[2],event:raw[3],payload:raw[4]}:raw;}
 const b=Buffer.from(payload);if(b[0]!==4)return null;
 const topicLen=b[1],eventLen=b[2],metaLen=b[3],encoding=b[4];
 if(b.length<5+topicLen+eventLen+metaLen)throw Error('truncated broadcast');
 if(encoding!==1)throw Error('expected JSON broadcast');
 return {topic:b.subarray(5,5+topicLen).toString(),event:'broadcast',payload:{
 event:b.subarray(5+topicLen,5+topicLen+eventLen).toString(),
 payload:JSON.parse(b.subarray(5+topicLen+eventLen+metaLen).toString())}};
};
