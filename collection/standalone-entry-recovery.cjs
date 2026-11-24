'use strict';
// Offline plans only. This module never navigates, reads credentials, updates
// collector state, approves an identity, or resumes a checkpoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeRetainedDocument}=require('../lib/retained-document.cjs');
const {readOnlyBusinessUrl,readRecoveryInputs}=require('./standalone-recovery-profiles.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function origin(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
function key(raw){const u=new URL(raw);if(!u.hash.startsWith('#/'))u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}
function safeUrl(raw){try{const u=new URL(raw),sensitive=/token|password|secret|email|auth|session|invite|ref|code/i;return !!origin(raw)&&!/[\r\n]/.test(raw)&&![...u.searchParams.keys()].some(k=>sensitive.test(k))&&!/(?:[?#&])(?:[^=&#]*(?:token|password|secret|email|auth|session|invite|ref|code)[^=&#]*)=/i.test(decodeURIComponent(u.hash))&&!/(?:vmess|vless|trojan|ss):\/\//i.test(raw);}catch{return false;}}
function primaryEntryLabel(label){return /官网|最新地址|官方入口|用户中心|控制台|登录|购买订阅|购买套餐|套餐|定价|商店|official|login|sign in|dashboard|console|portal|pricing|plans|shop/i.test(label||'');}
function crossOriginEntryReason(link){
 if(/客户端|client|软件|手册|教程|guide|download|documentation/i.test(link.label||'')||/\/(?:knowledge|docs?|guides?|download)(?:[/?#]|$)/i.test(new URL(link.url).pathname+new URL(link.url).hash))return'native_link_is_client_or_knowledge_reference_not_entry';
 if(/^\s*official website\s*$/i.test(link.label||''))return'generic_official_website_label_does_not_establish_destination_identity';
 return null;
}
function evidenceRef(page,doc){return{file:page.file,sha256:page.sha256,sourceId:page.sourceId||null,url:doc.url,observedAt:doc.capturedAt,hashVerified:true,recaptured:false,representation:doc.representation};}
function loadVerifiedPages({root,pages=[]}={}){
 const documents=[],errors=[];
 for(const page of pages){try{
  if(page.grade!=='E1')throw Error('not_primary_E1_source');
  if(!/^[a-f0-9]{64}$/.test(page.sha256||''))throw Error('expected_original_hash_missing');
  const base=path.resolve(root),file=path.resolve(base,page.file||'');
  if(!file.startsWith(base+path.sep))throw Error('original_path_outside_project');
  const physicalBase=fs.realpathSync(base),physicalFile=fs.realpathSync(file);
  if(!physicalFile.startsWith(physicalBase+path.sep))throw Error('original_symlink_outside_project');
  const bytes=fs.readFileSync(file);if(hash(bytes)!==page.sha256)throw Error('original_hash_mismatch');
  const doc=normalizeRetainedDocument(bytes,{sha256:page.sha256,url:page.url,last_capture_at:page.capturedAt,source_id:page.sourceId});
  if(!safeUrl(doc.url)||!Number.isFinite(Date.parse(doc.capturedAt)))throw Error('unsafe_source_url_or_missing_original_time');
  if(origin(page.url)!==origin(doc.url))throw Error('source_metadata_origin_mismatch');
  documents.push({page,doc,reference:evidenceRef(page,doc)});
 }catch(error){errors.push({file:page.file||null,reason:error.message});}}
 return{documents,errors};
}
function buildEntryRecoveryPlan({root=path.resolve(__dirname,'..'),profiles=[],records=[],sourceIndex={pages:[],errors:[]}}={}){
 const verified=loadVerifiedPages({root,pages:sourceIndex.pages}),blocked=records.filter(r=>r.outcome==='blocked'),rows=[];
 for(const record of blocked){
  const profile=profiles.find(p=>(p.siteId||p.recordId||p.config?.recordId)===record.siteId),config=profile?.config||profile||{},oldURL=config.entryUrl,ownOrigin=origin(oldURL),allowed=config.allowedHosts||[],candidates=[],rejected=[],seen=new Set();
  const row={siteId:record.siteId,checkpointType:record.checkpointType,profileRevision:profile?.revision||null,oldURL:oldURL||null,newURL:null,safeToApply:false,configPatch:{},reason:'no_hash_verified_same_origin_native_entry_delta',evidenceRefs:[],candidates,rejected,identityLimitation:'Historical same-origin navigation only; current availability, operator identity and continuous operation are not established.',runtimeRevalidationRequired:true,credentialsTransferred:false,resumeAuthorized:false};
  if(!ownOrigin||!allowed.includes(new URL(ownOrigin).hostname)){row.reason='current_entry_identity_or_allowed_host_missing';rows.push(row);continue;}
  const docs=verified.documents.filter(d=>d.page.recordIds?.includes(record.siteId));
  for(const retained of docs){
   const {doc,reference}=retained;
   // A sourceId/brand association cannot establish a different domain's authority.
   if(origin(doc.url)!==ownOrigin){rejected.push({reason:'retained_source_origin_differs_from_current_entry',evidence:reference});continue;}
   for(const link of doc.links){
    if(!primaryEntryLabel(link.label))continue;
    if(!safeUrl(link.url)){rejected.push({reason:'unsafe_or_credential_bearing_native_link',evidence:reference});continue;}
    if(key(link.url)===key(oldURL))continue;
    const id=key(link.url)+'|'+reference.sha256;if(seen.has(id))continue;seen.add(id);
    const sameOrigin=origin(link.url)===ownOrigin;
    if(!sameOrigin){const rejection=crossOriginEntryReason(link);if(rejection){rejected.push({newURL:link.url,label:link.label,reason:rejection,evidence:reference});continue;}candidates.push({newURL:link.url,label:link.label,evidence:reference,kind:'cross_origin_native_link',safeToApply:false,reason:'primary_link_observed_but_destination_identity_and_credential_reception_not_approved',identityLimitation:'A retained native link proves only that the source linked this destination at the original time; it does not prove current ownership, legal operator identity or continuous operation.',credentialsTransferred:false});continue;}
    if(!readOnlyBusinessUrl(link.url,{origin:ownOrigin,allowedHosts:allowed})){rejected.push({newURL:link.url,label:link.label,reason:'native_link_is_not_an_allowlisted_read_only_business_route',evidence:reference});continue;}
    candidates.push({newURL:link.url,label:link.label,evidence:reference,kind:'same_origin_native_business_route',safeToApply:true,reason:'hash_verified_same_origin_native_read_only_link'});
   }
  }
  const grouped=new Map();for(const c of candidates.filter(c=>c.safeToApply)){const k=key(c.newURL);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(c);}
  // Never choose one product/category among conflicting native links by guesswork.
  if(grouped.size===1){const matches=[...grouped.values()][0].sort((a,b)=>Date.parse(b.evidence.observedAt)-Date.parse(a.evidence.observedAt)),target=matches[0];row.newURL=target.newURL;row.configPatch={entryUrl:target.newURL};row.evidenceRefs=matches.map(c=>c.evidence);row.safeToApply=true;row.reason='same_origin_native_entry_repair_ready_for_runtime_revalidation';}
  else if(grouped.size>1)row.reason='multiple_native_business_routes_require_target_selection';
  else if(candidates.length)row.reason='cross_origin_native_candidates_require_identity_review_no_credential_transfer';
  else if(!docs.length)row.reason='no_hash_verified_retained_primary_documents_for_site';
  rows.push(row);
 }
 const count=fn=>rows.reduce((acc,row)=>{const value=fn(row);acc[value]=(acc[value]||0)+1;return acc;},{});
 return{schemaVersion:'airports-standalone-entry-recovery.v1',generatedAt:new Date().toISOString(),networkAccessed:false,databaseModified:false,credentialsRead:false,credentialsTransferred:false,checkpointResumed:false,counts:{blockedSites:rows.length,verifiedDocuments:verified.documents.length,safeEntryRepairs:rows.filter(r=>r.safeToApply).length,crossOriginCandidateSites:rows.filter(r=>r.candidates.some(c=>c.kind==='cross_origin_native_link')).length},reasons:count(r=>r.reason),rows,errors:[...(sourceIndex.errors||[]),...verified.errors],inventoryLimitations:['Uses retained E1 archive/work/review index only; not a complete inventory of all historical files.','No new site requests; unchanged checkpoints are not rescanned.','Historical captures and configuration changes do not prove current availability or readable business content.','Cross-origin links never authorize credential transfer or prove legal operator continuity.','safeToApply authorizes an entryUrl-only configuration proposal; existing gates, TLS failures, rejected credentials and agreements remain unresolved.']};
}
function exportEntryRecoveryPlan({root=path.resolve(__dirname,'..'),output=path.join(root,'work/standalone-20261111/entry-recovery-plan.json'),sourceIndex}={}){
 const records=read(path.join(root,'outputs/standalone-recovery-current/records.json')).records,ids=new Set(records.filter(r=>r.outcome==='blocked').map(r=>r.siteId)),inventory=read(path.join(root,'outputs/database-inventory-current/primary/records.json')).records.filter(r=>ids.has(r.id));
 sourceIndex??=require('../scripts/build-website-collectors.cjs').retainedIndex(inventory);
 const report=buildEntryRecoveryPlan({root,profiles:readRecoveryInputs({root}).profiles,records,sourceIndex});fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){const report=exportEntryRecoveryPlan();console.log(JSON.stringify({counts:report.counts,reasons:report.reasons,errors:report.errors.length},null,2));}
module.exports={loadVerifiedPages,buildEntryRecoveryPlan,exportEntryRecoveryPlan};
