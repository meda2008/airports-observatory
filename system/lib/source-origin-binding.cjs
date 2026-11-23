'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {normalizeRetainedDocument}=require('./retained-document.cjs');
function assertSourceOrigin({root,entryUrl,sourceUrl,bindings=[],recordId}){
 const entry=new URL(entryUrl),source=new URL(sourceUrl);assert.equal(source.protocol,'https:');assert(!source.username&&!source.password);
 if(source.origin===entry.origin)return{basis:'same_origin'};
 const binding=bindings.find(b=>b.origin===source.origin);assert(binding,'Unbound source origin');
 const file=path.resolve(root,binding.file);assert(file.startsWith(path.resolve(root)+path.sep),'Proof outside workspace');
 if(binding.kind==='frozen_catalog_entry'){
  assert(recordId&&binding.recordId===recordId,'Catalog record binding mismatch');assert.equal(file,path.resolve(root,'catalog/catalog.v1.json'),'Only canonical frozen catalog allowed');
  const bytes=fs.readFileSync(file),crypto=require('node:crypto');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),binding.sha256,'Catalog hash mismatch');
  const record=JSON.parse(bytes).catalog.find(r=>r.id===recordId);assert(record&&new URL(record.officialUrl).origin===source.origin,'Original catalog origin mismatch');
  return{basis:'original_catalog_domain_reobserved_not_identity_continuity_verified',credentialPropagationAllowed:false};
 }
 const proof=normalizeRetainedDocument(fs.readFileSync(file),{sha256:binding.sha256});
 if(binding.kind==='user_recognized_fnf_shop'){
  assert.equal(recordId,'A027','FnF record scope mismatch');assert.equal(binding.recordId,recordId,'FnF record binding mismatch');
  assert.equal(entry.origin,'https://fnf.one','FnF registered entry mismatch');assert.equal(source.origin,'https://33333.ifnf.xyz','FnF current origin mismatch');
  assert.equal(new URL(proof.url).origin,source.origin,'FnF proof origin mismatch');assert.equal(new URL(proof.url).pathname,'/seni/yes/user/shop','FnF shop proof required');
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).title,'商店 — Foo&Friends.','FnF shop title mismatch');
  assert(proof.text.includes('套餐不支持叠加订购，下单时请手动选择时长。')&&proof.text.includes('LV1 BASIC')&&proof.text.includes('LV2 MAX'),'FnF named shop required');
  return{basis:'user_recognized_current_fnf_shop_not_legacy_operator_continuity_proof',proofFile:binding.file,proofCapturedAt:proof.capturedAt,operatorIdentityVerified:false,legacyContinuityVerified:false,credentialPropagationAllowed:false};
 }
 if(['dler_registered_zone_documentation_shop_link','dler_registered_documentation_subdomain'].includes(binding.kind)){
  assert.equal(recordId,'A184','Dler record scope mismatch');assert.equal(binding.recordId,recordId,'Dler binding mismatch');
  assert.equal(entry.origin,'https://dler.io','Dler registered entry mismatch');assert.equal(source.origin,binding.kind==='dler_registered_documentation_subdomain'?'https://docs.dler.io':'https://oixcloud.com','Dler linked shop mismatch');
  assert.equal(new URL(proof.url).origin,'https://docs.dler.io','Dler documentation zone mismatch');
  assert.equal(new URL(proof.url).pathname,'/account/plans.html','Dler plans document required');
  assert(proof.text.startsWith('购买、续费与切换')&&JSON.parse(fs.readFileSync(file,'utf8')).title==='购买、续费与切换 | oixCloud','Dler native document title required');
  assert(proof.links.some(l=>l.label==='套餐商店'&&l.url==='https://oixcloud.com/user/shop'),'Exact native shop link required');
  return{basis:'current_registered_zone_documentation_link_not_legacy_operator_or_continuity_proof',proofFile:binding.file,proofCapturedAt:proof.capturedAt,operatorIdentityVerified:false,legacyContinuityVerified:false,credentialPropagationAllowed:false};
 }
 if(binding.kind==='user_recognized_pqjc_candidate_alias_claim'){
  // Admission of facts about this explicitly recognized candidate is separate
  // from proving succession or common ownership of the old registered service.
  assert.equal(recordId,'A039','Candidate record scope mismatch');assert.equal(binding.recordId,recordId,'Candidate record binding mismatch');
  assert.equal(entry.origin,'https://pqjc.site','Candidate registered-entry mismatch');
  assert.equal(source.origin,'https://xn--mes358aby2apfg.com','Candidate origin scope mismatch');
  assert.equal(new URL(proof.url).origin,source.origin,'Candidate declaration origin mismatch');
  assert(proof.text.includes('官网&tg群')&&proof.text.includes('当前正在使用的官网域名：'),'Native candidate alias declaration required');
  const origins=new Set(proof.links.map(l=>{try{return new URL(l.url).origin;}catch{return null;}}));
  assert(origins.has('https://dash.pqjc.site')&&origins.has(source.origin),'Native registered-zone alias and candidate links required');
  assert(typeof binding.approvalFile==='string'&&/^[a-f0-9]{64}$/.test(binding.approvalSha256),'Specific candidate approval proof required');
  const approvalFile=path.resolve(root,binding.approvalFile);assert(approvalFile.startsWith(path.resolve(root)+path.sep),'Approval proof outside workspace');
  const approvalBytes=fs.readFileSync(approvalFile),crypto=require('node:crypto');assert.equal(crypto.createHash('sha256').update(approvalBytes).digest('hex'),binding.approvalSha256,'Candidate approval hash mismatch');
  const approval=JSON.parse(approvalBytes);assert.equal(new URL(approval.url).origin,source.origin,'Candidate approval destination mismatch');
  assert.equal(approval.action,'user_recognized_candidate_and_allowed_current_captcha_and_one_login','Specific user recognition required');
  assert(approval.paymentAllowed===false&&approval.registrationAllowed===false&&Number.isFinite(Date.parse(approval.confirmedAt))&&Date.parse(proof.capturedAt)>=Date.parse(approval.confirmedAt),'Candidate approval scope or chronology mismatch');
  return{basis:'user_recognized_candidate_with_native_alias_claim_not_legacy_identity_verification',proofFile:binding.file,proofCapturedAt:proof.capturedAt,operatorIdentityVerified:false,legacyContinuityVerified:false,credentialPropagationAllowed:false};
 }
 if(binding.kind==='retained_shared_entry_publisher'){
  assert(recordId&&binding.recordId===recordId,'Publisher record binding mismatch');
  assert.equal(new URL(proof.url).origin,binding.publisherOrigin,'Publisher origin mismatch');
  assert(proof.text.includes('线路检测页')&&proof.text.includes('将自动跳转可用域名'),'Explicit entry selector required');
  const origins=new Set(proof.links.map(l=>{try{const u=new URL(l.url);return u.protocol==='https:'&&!u.username&&!u.password?u.origin:null;}catch{return null;}}));
  assert(origins.has(entry.origin)&&origins.has(source.origin),'Publisher must natively list both current and alternate origins');
  return{basis:'retained_shared_entry_selector_not_independent_operator_identity',proofFile:binding.file,proofCapturedAt:proof.capturedAt,credentialPropagationAllowed:false};
 }
 assert.equal(new URL(proof.url).origin,entry.origin,'Proof parent origin mismatch');
 if(binding.kind==='retained_named_channel_announcement'){
  assert(binding.recordId===recordId&&recordId,'Channel record binding mismatch');
  assert(/^[a-z0-9_]{5,32}$/.test(binding.channel),'Invalid channel handle');
  assert.equal(source.origin,'https://t.me','Channel host mismatch');
  assert([`/s/${binding.channel}`,`/${binding.channel}`].includes(source.pathname.replace(/\/$/,'')),'Different channel path');
  assert(proof.text.split(/\r?\n/).some(line=>line.trim()===`通知： https://t.me/${binding.channel}`),'Explicit native notification-channel line required');
  return{basis:'native_named_notification_channel_not_independent_source',proofFile:binding.file,proofCapturedAt:proof.capturedAt,credentialPropagationAllowed:false};
 }
 if(binding.kind==='retained_explicit_entry_announcement'){
  assert(binding.recordId===recordId&&recordId,'Announcement record binding mismatch');
  assert(require('./explicit-entry-announcement.cjs').explicitEntryOrigins(proof.text).includes(source.origin),'Target absent from explicit entry announcement');
  return{basis:'retained_explicit_entry_announcement_not_independent_identity_verification',proofFile:binding.file,proofCapturedAt:proof.capturedAt,credentialPropagationAllowed:false};
 }
 assert(proof.links.some(l=>{try{const u=new URL(l.url);return u.protocol==='https:'&&!u.username&&!u.password&&u.origin===source.origin;}catch{return false;}}),'Target origin absent from retained native links');
 return{basis:'retained_same_operator_help_link_not_independent_identity_verification',proofFile:binding.file,proofCapturedAt:proof.capturedAt,credentialPropagationAllowed:false};
}
module.exports={assertSourceOrigin};
