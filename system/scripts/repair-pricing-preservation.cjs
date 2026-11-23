'use strict';
// Explicit, source-bound repair of lost historical contract fields. No browsing,
// price calculation, automatic approval or refreshed observation timestamps.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function planRepair({maintenance,root,auditFile}){
 const bytes=fs.readFileSync(auditFile),audit=JSON.parse(bytes),rows=[];
 for(const siteId of [...new Set(audit.findings.map(f=>f.siteId))]){
  const findings=audit.findings.filter(f=>f.siteId===siteId),site=maintenance.store.getSite(siteId),pricing=structuredClone(site.document.pricing),before=structuredClone(pricing),allRefs=[];
  for(const f of findings){
   const input=JSON.parse(fs.readFileSync(path.join(root,f.inputFile))),frozen=input.proposals.find(p=>p.proposalId===f.proposalId);assert(frozen,'Frozen approved proposal missing');
   const old=frozen.before.pricing.plans.find(p=>p.name===f.originalName&&p.billingPeriod===f.originalBillingPeriod);assert(old,'Frozen original product/period missing');
   const index=pricing.plans.findIndex(p=>p.name===f.currentName&&p.billingPeriod===f.currentBillingPeriod);assert(index>=0,'Current product/period missing');
   const current=pricing.plans[index];assert.equal(current.amount,f.currentAmount);assert.equal(current.observedAt,f.currentObservedAt);
   const sourceRefs=f.losses.flatMap(l=>l.originalSourceRefs||[]);allRefs.push(...sourceRefs);
   for(const loss of f.losses){if(loss.field==='restrictions')for(const value of loss.beforeValue)assert(old.restrictions.includes(value),'Frozen original restriction mismatch');else assert.deepEqual(old[loss.field],loss.beforeValue,'Frozen original field mismatch');}
   const repaired=require('../collection/url-collectors/retained-plan-conditions.cjs').preservePlanConditions(old,current,{sourceRefs});
   for(const k of ['amount','currency','billingPeriod','observedAt','quote','sourceLocator','sourceBodySha256'])assert.deepEqual(repaired[k],current[k],'Repair must preserve current price/capture '+k);
   pricing.plans[index]=repaired;
  }
  pricing.sourceIds=[...new Set([...(pricing.sourceIds||[]),...pricing.plans.flatMap(p=>p.sourceIds||[]),...allRefs.map(r=>r.sourceId)])];
  const evidence=maintenance.store.listEvidence().filter(e=>e.siteId===siteId&&before.sourceIds.includes(e.id));assert(evidence.length>0&&evidence.length<=8,'Current bound evidence budget');
  const captures=evidence.map(e=>{const o=e.observations.find(o=>Date.parse(o.observedAt)===Date.parse(before.observedAt))||e.observations[0];assert(o,'Original observation missing');return{evidenceId:e.id,url:e.url,body:e.body,sha256:e.sha256,observedAt:o.observedAt,kind:e.kind};});
  rows.push({siteId,expectedRevision:site.revision,beforePricingSha256:sha(JSON.stringify(before)),proposedPricingSha256:sha(JSON.stringify(pricing)),currentPricing:before,proposedPricing:pricing,captures,sourceRefs:allRefs,affectedPeriods:findings.length});
 }
 return{at:new Date().toISOString(),auditFile,auditSha256:sha(bytes),purpose:'restore_historical_contract_conditions_without_repricing',websiteVisited:false,paymentExecuted:false,rows};
}
function stageRepair({maintenance,reportFile,actor}){
 if(!actor||maintenance.control.getControl().executionMode!=='iab_bridge')throw Error('Explicit actor and maintenance mode required');
 const bytes=fs.readFileSync(reportFile),report=JSON.parse(bytes);assert.equal(sha(fs.readFileSync(report.auditFile)),report.auditSha256);const results=[];
 for(const row of report.rows){const site=maintenance.store.getSite(row.siteId);assert.equal(site.revision,row.expectedRevision);assert.equal(sha(JSON.stringify(site.document.pricing)),row.beforePricingSha256);assert.equal(sha(JSON.stringify(row.proposedPricing)),row.proposedPricingSha256);
  for(const c of row.captures){const e=maintenance.store.listEvidence().find(e=>e.id===c.evidenceId);assert.equal(e.siteId,row.siteId);assert.equal(e.url,c.url);assert.equal(e.body,c.body);assert.equal(sha(c.body),c.sha256);assert(e.observations.some(o=>o.observedAt===c.observedAt));}
  const queued=maintenance.control.enqueue({siteId:row.siteId,purpose:'validation',actor});assert.equal(queued.existing,false);const job=maintenance.control.claimBridge({siteId:row.siteId,worker:actor,executionMode:'iab_bridge'});assert.equal(job.jobId,queued.jobId);
  const result=maintenance.control.acceptBridgeResult(job.jobId,job.token,{captures:row.captures.map(({evidenceId,sha256,...c})=>c),patch:{pricing:row.proposedPricing},capabilities:{pageReadable:{status:'observed'},plans:{status:'extracted_change'},dataBasis:{status:'retained_reparse'},challenge:{status:'not_retested'}},outcome:{status:'historical_condition_preservation_pending_review',basis:'retained_reparse'},actor});results.push({siteId:row.siteId,proposalId:result.proposalId,jobId:job.jobId,status:result.status,expectedRevision:row.expectedRevision});
 }
 return{at:new Date().toISOString(),reportSha256:sha(bytes),results,networkAccessed:false,paymentExecuted:false,automaticApproval:false};
}
if(require.main===module){const a=Object.fromEntries(process.argv.slice(3).filter(x=>x.includes('=')).map(x=>x.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));if(!a.actor||!a.output)throw Error('Explicit actor and output required');const root=path.resolve(__dirname,'..'),m=require('./standalone-maintenance.cjs').createMaintenance({root,actor:a.actor});try{const result=process.argv[2]==='plan'?planRepair({maintenance:m,root,auditFile:a.audit}):process.argv[2]==='stage'?stageRepair({maintenance:m,reportFile:a.report,actor:a.actor}):null;assert(result,'Use plan or stage');fs.writeFileSync(a.output,JSON.stringify(result,null,2));console.log(JSON.stringify({output:a.output,count:result.rows?.length||result.results?.length,results:result.results},null,2));}finally{m.close();}}
module.exports={planRepair,stageRepair};
