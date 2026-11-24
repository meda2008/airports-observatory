'use strict';
// Reviewed original bytes enter the normal collector lease, never a direct fact patch.
const {DatabaseSync}=require('node:sqlite'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function createRetainedInputs({filename,store,control,catalogDb}={}){
 const db=new DatabaseSync(filename);db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS collector_retained_inputs(job_id TEXT PRIMARY KEY,site_id TEXT NOT NULL,captures_json TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS collector_retained_recoveries(job_id TEXT NOT NULL,old_token_sha256 TEXT NOT NULL,new_lease_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(job_id,old_token_sha256))');
 function enqueue({siteId,artifacts,actor}={}){
  if(!/^A\d{3}$/.test(siteId||'')||siteId==='A159'||typeof actor!=='string'||!actor.trim()||!Array.isArray(artifacts)||!artifacts.length||artifacts.length>8)throw Error('invalid_retained_scope');
  const profile=control.getProfile(siteId),detail=catalogDb.detail(siteId,{facts:()=>({})});if(!profile||!detail)throw Error('retained_site_missing');
  if(profile.config.publicReferenceEnabled!==true||!profile.config.publicReferenceFields?.length||profile.config.publicReferenceFields.some(f=>!['speed','stability'].includes(f)))throw Error('explicit_retained_performance_scope_required');
  const sources=new Map(detail.item.sources.map(s=>[s.id,s])),host=new URL(store.getSite(siteId)?.document?.website?.url||profile.config.entryUrl).hostname;
  const captures=artifacts.map(input=>{
   const ref=sources.get(input?.sourceId);if(!ref||!ref.sha256||!Number.isFinite(Date.parse(ref.observedAt))||typeof input.base64!=='string'||input.base64.length>600000)throw Error('retained_catalog_source_required');
   const bytes=Buffer.from(input.base64,'base64');if(bytes.toString('base64')!==input.base64||sha(bytes)!==ref.sha256)throw Error('retained_artifact_hash_mismatch');
   const raw=JSON.parse(bytes.toString('utf8')),doc=raw.document||raw,body=doc.text||doc.body;if(typeof body!=='string'||!body||body.length>200000)throw Error('retained_visible_text_required');
   const url=doc.url||raw.url||ref.url,u=new URL(url),old=new URL(ref.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hostname!==old.hostname)throw Error('retained_url_mismatch');
   const recorded=raw.observedAt||raw.capturedAt;if(recorded&&(!Number.isFinite(Date.parse(recorded))||Date.parse(recorded)!==Date.parse(ref.observedAt)))throw Error('retained_original_clock_mismatch');
   return{url:u.href,body,observedAt:ref.observedAt,kind:'retained_performance_reference',metadata:{title:doc.title,links:doc.links||raw.links||[],images:doc.images||raw.images||[],timeMetadata:doc.timeMetadata||[],performanceReference:true,representation:'retained_catalog_artifact_verified',originalSourceId:ref.id,retainedArtifactSha256:ref.sha256,retainedReplayVerified:true,currentCatalogHostname:host}};
  });
  if(new Set(artifacts.map(x=>x.sourceId)).size!==artifacts.length)throw Error('duplicate_retained_source');
  const job=control.enqueue({siteId,purpose:'validation',collectionScope:'public_references',actor});if(job.existing)throw Error('site_has_existing_job_review_or_resume_it');
  try{db.prepare('INSERT INTO collector_retained_inputs VALUES(?,?,?,?)').run(job.jobId,siteId,JSON.stringify(captures),new Date().toISOString());}catch(e){control.cancelJob(job.jobId,{actor:'retained_stage_failed'});throw e;}
  return{...job,siteId,retained:true,sources:captures.map(c=>({originalSourceId:c.metadata.originalSourceId,observedAt:c.observedAt,sha256:c.metadata.retainedArtifactSha256})),networkRequired:false};
 }
 function captures(jobId){const row=db.prepare('SELECT captures_json FROM collector_retained_inputs WHERE job_id=?').get(jobId);return row?JSON.parse(row.captures_json):null;}
 function recover({jobId,token,worker='retained-recovery'}={}){
  if(typeof token!=='string'||!token)throw Error('retained_original_lease_required');
  const existing=db.prepare('SELECT new_lease_json FROM collector_retained_recoveries WHERE job_id=? AND old_token_sha256=?').get(jobId,sha(token));if(existing)return{job:JSON.parse(existing.new_lease_json),recovered:true,replayed:true};
  const saved=captures(jobId),j=db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);if(!saved||!j||j.token!==token||j.status!=='leased'||j.lease_until>Date.now())throw Error('retained_expired_owned_lease_required');
  const profile=control.getProfile(j.site_id),site=store.getSite(j.site_id);if(profile.revision!==j.profile_revision||saved.some(c=>c.metadata.currentCatalogHostname!==new URL(site.document?.website?.url||profile.config.entryUrl).hostname))throw Error('retained_scope_changed_requires_review');
  const job=control.claimBridge({worker,siteId:j.site_id,executionMode:'standalone',leaseMs:180000});if(!job||job.jobId!==jobId)throw Error('retained_recovery_claim_conflict');
  job.retainedCaptures=saved;db.prepare('INSERT INTO collector_retained_recoveries VALUES(?,?,?,?)').run(jobId,sha(token),JSON.stringify(job),new Date().toISOString());return{job,recovered:true,replayed:false};
 }
 return{enqueue,captures,recover,close:()=>db.close()};
}
module.exports={createRetainedInputs};
