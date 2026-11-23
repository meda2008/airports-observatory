'use strict';
// Runtime and source eligibility are different facts. A completed job is not
// business-field acceptance; archived identities must not be reactivated.
function inventory(profiles,definitions={}){
 const rows=profiles.map(p=>{
  const id=p.siteId,c=p.config||{},source=definitions[id]||{},r=p.lastOfficialRun||(p.lastRun?.collectionScope!=='public_references'?p.lastRun:null);
  const eligibility=source.eligibility||c.eligibility;
  let next;
  if(eligibility==='archived_user_request')next='archived_do_not_reactivate';
  else if(!c.entryUrl)next='discover_official_entry';
  else if(eligibility==='needs_identity_review')next='candidate_readonly_identity_review';
  else if(!r)next='first_readonly_validation';
  else if(['queued','leased','running','cancel_requested'].includes(r.status))next='observe_existing_job';
  else if(r.status==='blocked')next='repair_blocker_before_retry';
  else if(!/^extracted_(?:change|no_change)$/.test(r.capabilities?.plans?.status||''))next='repair_pricing_parser';
  else next='verify_scope_session_review_and_frontend';
  return{siteId:id,name:c.name,eligibility:eligibility||null,entryUrl:c.entryUrl||null,next,
   hasRun:!!r,runStatus:r?.status||null,runId:r?.id||null,blocker:r?.blocker||null,
   pricing:r?.capabilities?.plans?.status||'not_verified',
   publicReferenceRunStatus:p.lastPublicReferenceRun?.status||(p.lastRun?.collectionScope==='public_references'?p.lastRun.status:null),
   // Enabling configuration alone never proves a weekly acceptance.
   configuredEnabled:c.enabled===true,fullAcceptanceVerified:false};
 });
 const byNext={};for(const r of rows)byNext[r.next]=(byNext[r.next]||0)+1;
 return{total:rows.length,withoutRun:rows.filter(r=>!r.hasRun).length,
  blocked:rows.filter(r=>r.runStatus==='blocked').length,byNext,rows};
}
module.exports={inventory};
