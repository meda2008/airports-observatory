'use strict';
// One stale/unbound parser result must neither overwrite history nor discard
// independently source-bound fields in the same collection result.
function partitionCurrentCaptureFields(patch={},captures=[]){const current=new Set(captures.map(c=>c.evidenceId).filter(Boolean)),accepted={},refusedFields=[];for(const[field,value]of Object.entries(patch)){if(value&&Array.isArray(value.sourceIds)&&value.sourceIds.some(id=>current.has(id)))accepted[field]=value;else refusedFields.push(field);}return{accepted,refusedFields};}
module.exports={partitionCurrentCaptureFields};
