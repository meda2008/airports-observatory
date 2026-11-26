'use strict';
const {createHash}=require('node:crypto');
const {readJsonObject,MAX_JSON_BYTES}=require('./read-utf8-json.cjs');

const MAX_CAPTURES=8;
const TOO_LARGE='internal_payload_too_large';
const INVALID='internal_payload_invalid';
function digest(lines){
 const hash=createHash('sha256');
 for(const line of lines)hash.update(line).update('\n');
 return hash.digest('hex');
}

// The first line describes the lease and complete capture set. Each following line
// is one complete capture, so original text and observation timestamps stay intact.
function submissionPlan(packet){
 const bytes=Buffer.byteLength(JSON.stringify(packet));
 if(bytes<=MAX_JSON_BYTES)return{bytes,op:'receive'};
 const {captures,...envelope}=packet;
 if(!Array.isArray(captures)||captures.length>MAX_CAPTURES)return{bytes};
 const frames=captures.map(c=>JSON.stringify(c));
 const head=JSON.stringify({envelope,captureCount:frames.length,sha256:digest(frames)});
 if([head,...frames].some(line=>Buffer.byteLength(line)>MAX_JSON_BYTES))return{bytes};
 return{bytes,op:'receivebatches',body:[head,...frames].join('\n')+'\n'};
}

async function readSubmissionBatches(stream){
 const lines=[];
 let chunks=[],lineBytes=0;
 function append(part){
  lineBytes+=part.length;
  if(lineBytes>MAX_JSON_BYTES)throw Error(TOO_LARGE);
  if(part.length)chunks.push(part);
 }
 for await(const part of stream){
  const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);
  let offset=0;
  for(let newline;(newline=chunk.indexOf(10,offset))!==-1;offset=newline+1){
   append(chunk.subarray(offset,newline));
   if(!lineBytes||lines.length>=MAX_CAPTURES+1)throw Error(INVALID);
   lines.push(Buffer.concat(chunks,lineBytes));
   chunks=[];lineBytes=0;
  }
  append(chunk.subarray(offset));
 }
 if(lineBytes||lines.length<2)throw Error(INVALID);
 const read=line=>readJsonObject([line],{invalid:INVALID,tooLarge:TOO_LARGE});
 const [head,...frames]=lines,header=await read(head);
 if(!header.envelope||typeof header.envelope!=='object'||Array.isArray(header.envelope)||Object.hasOwn(header.envelope,'captures')||header.captureCount!==frames.length||header.sha256!==digest(frames))throw Error(INVALID);
 return{...header.envelope,captures:await Promise.all(frames.map(read))};
}

module.exports={submissionPlan,readSubmissionBatches};
