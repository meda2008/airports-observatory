import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runWorkflow} from './workflow.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
// The host injects the existing Codex browser. No standalone browser, cookies or HTTP scraping.
export async function runDueCollectors({browser,limit=5,recordIds=null,credentialsForOrigin=null,credentialsForRegistration=null,emailCodeProvider=null,verificationOptions={},onProgress=()=>{}}={}){
 if(!browser?.tabs)throw Error('A connected Codex built-in browser is required');
 const service=require('../lib/site-collector-registry.cjs').createService({root});service.init();
 const plan=service.plan({}),selected=plan.jobs.filter(j=>!recordIds||recordIds.includes(j.recordId)).slice(0,limit),receipts=[];
 for(const job of selected){let lease;const runId='weekly-'+job.recordId+'-'+job.jobId;
 try{lease=service.claim(job.jobId,{owner:'codex-browser-worker',leaseMs:30*60*1000});if(!lease)continue;
 const pipeline=require('../scripts/collection-pipeline.cjs');const runDir=path.join(root,'work/collection-runs',runId);if(!fs.existsSync(path.join(runDir,'plan.json'))){pipeline.init(runId,[job.recordId]);const pf=path.join(runDir,'plan.json'),p=JSON.parse(fs.readFileSync(pf,'utf8'));for(const task of p.tasks){task.entryUrl=job.config.entryUrl;task.allowedHosts=job.config.allowedHosts;task.adapter=job.config.adapter;task.maxPages=job.config.maxPages;task.knowledgeAdapter=job.config.knowledgeAdapter===true;task.includeClientGuides=job.config.includeClientGuides===true;task.readOnlyRecipe=job.config.readOnlyRecipe;if(job.config.auth)task.auth=job.config.auth;task.allowRegistration=!!credentialsForRegistration;}fs.writeFileSync(pf,JSON.stringify(p,null,2));}
 let result;for(let step=0;step<20;step++){result=await runWorkflow({browser,runId,recordIds:[job.recordId],limit:2,credentialsForOrigin,credentialsForRegistration,emailCodeProvider,verificationOptions});if(result.status!=='collecting')break;}
 const state=JSON.parse(fs.readFileSync(path.join(root,'work/collection-runs',runId,'state.json'),'utf8'));
 const values=Object.values(state.results||{});const hasEvidence=values.some(x=>['content_observed','observed_needs_review'].includes(x.status)&&(x.sources||[]).length);const blocker=values.find(x=>/verification|protection|login_required|security|identity|confirmation|registration/.test(x.status));
 const outcome=hasEvidence?'awaiting_semantic_review':'blocked';
 const receipt=service.finish(job.jobId,{token:lease.lease.token,outcome,runId,blocker:blocker?.status||(!hasEvidence?'no_readable_evidence':undefined),checkpoint:{runId,status:result.status,reviewFile:'work/collection-runs/'+runId+'/review.json'}});
 receipts.push({recordId:job.recordId,runId,outcome,result:result.status,receipt});await onProgress(receipts.at(-1));
 }catch(error){if(lease)service.finish(job.jobId,{token:lease.lease.token,outcome:'failed',runId,blocker:String(error.message),checkpoint:{runId}});receipts.push({recordId:job.recordId,runId,outcome:'failed',error:String(error.message)});await onProgress(receipts.at(-1));}
 }
 return{processed:receipts.length,receipts,paymentExecuted:false,publication:'requires_source_bound_semantic_review'};
}
