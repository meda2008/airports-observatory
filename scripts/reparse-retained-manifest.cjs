'use strict';
// Reuse frozen original source bytes through the same leased admission path.
// Never fetches a page, refreshes its observation time, or approves its own output.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeRetainedDocument}=require('../lib/retained-document.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function loadFrozenObservation(root,item){
 const file=path.resolve(root,item.file);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Source outside project');
 const bytes=fs.readFileSync(file);if(sha(bytes)!==item.fileSha256)throw Error('Retained original file hash mismatch');
 let source;
 if(item.representation==='normalizeRetainedDocument_original_bytes')source=normalizeRetainedDocument(bytes,{sha256:item.fileSha256,url:item.url,last_capture_at:item.observedAt,source_id:item.sourceId});
 else{const raw=JSON.parse(bytes);source={...raw,...raw.metadata,text:raw.body||raw.text,capturedAt:raw.observedAt||raw.capturedAt};}
 if(source.url!==item.url||Date.parse(source.capturedAt)!==Date.parse(item.observedAt)||typeof source.text!=='string'||sha(source.text)!==item.bodySha256)throw Error('Original URL, body or observation time mismatch');
 return{url:source.url,body:source.text,observedAt:item.observedAt,kind:'operator_visible_page',metadata:{representation:source.representation||'retained_visible_DOM_text',authenticationObserved:source.authenticationObserved===true,links:source.links||[]}};
}
function reparseManifest({root,maintenance,manifestFile,actor,siteIds}){
 if(!actor||maintenance.control.getControl().executionMode!=='iab_bridge')throw Error('Explicit actor and maintenance mode required');
 const bytes=fs.readFileSync(manifestFile),manifest=JSON.parse(bytes),groups=new Map(),results=[];
 for(const item of manifest.observations||[]){if(siteIds&&!siteIds.includes(item.siteId))continue;if(!groups.has(item.siteId))groups.set(item.siteId,[]);groups.get(item.siteId).push(item);}
 for(const[siteId,items]of groups){let job;try{
  if(items.length>8)throw Error('Retained page budget exceeded');
  const captures=items.map(item=>loadFrozenObservation(root,item));
  const profile=maintenance.control.getProfile(siteId);if(!profile?.enabled)throw Error('Disabled or unknown site');
  if(captures.some(c=>!profile.config.allowedHosts.includes(new URL(c.url).hostname)))throw Error('Source hostname not yet approved in site profile');
  const queued=maintenance.control.enqueue({siteId,purpose:'validation',actor});if(queued.existing)throw Error('Site has pending or active work');
  job=maintenance.control.claimBridge({siteId,worker:actor,executionMode:'iab_bridge',leaseMs:180000});if(job?.jobId!==queued.jobId)throw Error('Retained lease not acquired');
  const result=maintenance.plane.receive({jobId:job.jobId,token:job.token,captures,observationBasis:'retained_reparse'});
  results.push({siteId,runId:job.runId,jobId:job.jobId,...result,originalSources:items,websiteVisited:false});
 }catch(e){if(job)try{maintenance.control.completeBridge(job.jobId,job.token,{status:'blocked',checkpoint:{type:'retained_reparse_failed',url:maintenance.control.getProfile(siteId).config.entryUrl,stage:'extract',reason:e.message}});}catch{}results.push({siteId,status:'not_reparsed',reason:e.message});}}
 return{at:new Date().toISOString(),actor,manifestSha256:sha(bytes),results,paymentExecuted:false,networkAccessed:false};
}
if(require.main===module){const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.includes('=')).map(x=>x.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));if(!args.actor||!args.output||!args.manifest)throw Error('Explicit --actor, --manifest, --output required');const root=path.resolve(__dirname,'..'),m=require('./standalone-maintenance.cjs').createMaintenance({root,actor:args.actor});try{const result=reparseManifest({root,maintenance:m,manifestFile:args.manifest,actor:args.actor,siteIds:args.sites?.split(',')});fs.writeFileSync(args.output,JSON.stringify(result,null,2));console.log(JSON.stringify({receipt:args.output,results:result.results.map(r=>({siteId:r.siteId,status:r.status,proposalId:r.proposalId,reason:r.reason}))},null,2));}finally{m.close();}}
module.exports={loadFrozenObservation,reparseManifest};
