import fs from 'node:fs';
import path from 'node:path';
// No process spawning in the browser runtime. A terminal worker consumes the
// existing durable backend jobs; review decisions remain exact-source records.
export function runtimeHandlers({runDirectory}){
 const review=async({run})=>{
  const dir=runDirectory(run.runId),file=path.join(dir,'review.json');
  const value=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
  if(value?.runId===run.runId&&value.reviewer&&Number.isFinite(Date.parse(value.reviewedAt))&&(value.decisions?.length||value.rejected?.length))return{resolved:true};
  fs.writeFileSync(path.join(dir,'review-request.json'),JSON.stringify({runId:run.runId,status:'needs_evidence_review',requestedAt:new Date().toISOString(),sourceState:'state.json',reviewFile:'review.json',automaticApproval:false},null,2));
  return{waiting:true};
 };
 return{awaiting_semantic_review:review,backend_pending:async({run,result})=>{
  const pending=result.job||result.release;
  if(!pending?.jobId)throw Error('Backend pending result has no durable job receipt');
  const dir=runDirectory(run.runId),file=path.join(dir,'backend-jobs',pending.jobId+'.json');
  if(!fs.existsSync(file))return{waiting:true};const job=JSON.parse(fs.readFileSync(file,'utf8'));
  if(job.status==='failed')throw Error('Backend failed: '+job.error);
  return job.status==='done'?{resolved:true}:{waiting:true};
 }};
}
