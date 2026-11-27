'use strict';
// Reviewed original bytes enter the normal collector lease, never a direct fact patch.
const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function createRetainedInputs({store,control,catalogDb}={}){
 function enqueue({siteId,artifacts,actor}={}){
  if(!/^A\d{3}$/.test(siteId||'')||siteId==='A159'||typeof actor!=='string'||!actor.trim()||!Array.isArray(artifacts)||!artifacts.length||artifacts.length>8)throw Error('invalid_retained_scope');
  const {captures,...job}=control.enqueueRetainedInput({siteId,actor},()=>{
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
   return captures;
  });
  return{...job,siteId,retained:true,sources:captures.map(c=>({originalSourceId:c.metadata.originalSourceId,observedAt:c.observedAt,sha256:c.metadata.retainedArtifactSha256})),networkRequired:false};
 }
 return{enqueue,captures:control.retainedCaptures,recover:control.recoverRetainedInput};
}
module.exports={createRetainedInputs};
