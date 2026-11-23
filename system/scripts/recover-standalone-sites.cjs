'use strict';
// Explicit local recovery operations. Does not browse, review facts or approve proposals.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createMaintenance}=require('./standalone-maintenance.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function applyFrozenRecovery({root,control,reportFile,actor}){
 const bytes=fs.readFileSync(reportFile),report=JSON.parse(bytes),results=[];
 if(!actor||!Array.isArray(report.rows))throw Error('Explicit actor and frozen rows required');
 if(control.getControl().executionMode!=='iab_bridge')throw Error('Apply in an idle maintenance mode');
 for(const row of report.rows.filter(r=>r.safeToApply)){
  try{
   const p=control.getProfile(row.siteId);if(!p||p.revision!==row.profileRevision)throw Error('Profile revision conflict');
   if(!row.evidenceRefs?.length)throw Error('Retained evidence required');
   for(const ref of row.evidenceRefs){const file=path.resolve(root,ref.file);if(!file.startsWith(path.resolve(root)+path.sep)||sha(fs.readFileSync(file))!==ref.sha256)throw Error('Retained file hash mismatch');if(!Number.isFinite(Date.parse(ref.observedAt)))throw Error('Original observation time required');}
   if(row.configPatch.entryUrl&&new URL(row.configPatch.entryUrl).origin!==new URL(p.config.entryUrl).origin)throw Error('Cross-origin entry needs a separate reviewed decision');
   const after=control.updateProfile(row.siteId,{config:row.configPatch,expectedRevision:p.revision,actor});results.push({siteId:row.siteId,status:'configuration_updated',revision:after.revision,changedKeys:Object.keys(row.configPatch),evidenceRefs:row.evidenceRefs});
  }catch(e){results.push({siteId:row.siteId,status:'not_applied',reason:e.message});}
 }
 return{at:new Date().toISOString(),reportSha256:sha(bytes),actor,results,websiteVisited:false,paymentExecuted:false};
}
function queueRecovered({control,siteIds,actor}){
 if(!actor||!siteIds?.length)throw Error('Explicit actor and sites required');
 if(control.getControl().executionMode!=='iab_bridge')throw Error('Queue while standalone claims are fenced by maintenance mode');
 const checkpoints=control.listCheckpoints(),results=[],origins=new Map();
 for(const siteId of [...new Set(siteIds)]){try{const p=control.getProfile(siteId);if(!p?.enabled)throw Error('Site not enabled');const key=p.config.entryUrl;if(origins.has(key)){results.push({siteId,status:'same_entry_deferred',sameEntrySiteId:origins.get(key),reason:'Collect once before deciding source reuse for alias records'});continue;}origins.set(key,siteId);const cp=checkpoints.find(c=>c.siteId===siteId&&c.status==='open');const result=cp?control.resumeCheckpoint(cp.id,{actor}):control.enqueue({siteId,purpose:'collection',actor});results.push({siteId,checkpointId:cp?.id||null,...result});}catch(e){results.push({siteId,status:'not_queued',reason:e.message});}}
 return{at:new Date().toISOString(),actor,results,paymentExecuted:false};
}
function reportRecovery({control,queueFile}){const queue=JSON.parse(fs.readFileSync(queueFile)),runs=control.listRuns({limit:1000});return{at:new Date().toISOString(),control:control.getControl(),results:queue.results.map(q=>{const r=runs.find(r=>r.jobId===q.jobId);return r?{siteId:q.siteId,jobId:r.jobId,runId:r.runId,status:r.status,startedAt:r.startedAt,finishedAt:r.finishedAt,proposalId:r.proposalId,capabilities:r.capabilities,blocker:r.blocker,evidenceIds:r.evidenceIds}:q;})};}
if(require.main===module){const args=Object.fromEntries(process.argv.slice(3).filter(x=>x.includes('=')).map(x=>x.replace(/^--/,'').split(/=(.*)/s).slice(0,2))),command=process.argv[2],root=path.resolve(__dirname,'..');if(!args.actor&&command!=='report')throw Error('Explicit --actor required');if(!args.output)throw Error('Explicit --output receipt required');const m=createMaintenance({root,actor:args.actor||'local_recovery_report'});try{let result;if(command==='apply')result=applyFrozenRecovery({root,control:m.control,reportFile:args.report,actor:args.actor});else if(command==='queue')result=queueRecovered({control:m.control,siteIds:args.sites?.split(','),actor:args.actor});else if(command==='report')result=reportRecovery({control:m.control,queueFile:args.queue});else throw Error('Usage: recover-standalone-sites.cjs apply|queue|report --report=... --sites=... --queue=... --actor=... --output=...');if(!args.output)throw Error('Explicit --output receipt required');fs.mkdirSync(path.dirname(path.resolve(args.output)),{recursive:true});fs.writeFileSync(args.output,JSON.stringify(result,null,2));console.log(JSON.stringify({receipt:args.output,results:result.results.map(r=>({siteId:r.siteId,status:r.status,proposalId:r.proposalId,blocker:r.blocker?.type}))},null,2));}finally{m.close();}}
module.exports={applyFrozenRecovery,queueRecovered,reportRecovery};
