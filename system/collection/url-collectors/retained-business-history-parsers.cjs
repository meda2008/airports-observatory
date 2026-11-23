'use strict';
// Reuse hash-verified originals without refreshing their capture clocks. A
// current candidate's own channel record never becomes legacy-brand history.
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const {loadOriginal,literalLocator,sha}=require('../../lib/performance-evidence.cjs');
const root=path.resolve(__dirname,'../..');
const profiles=JSON.parse(fs.readFileSync(path.join(__dirname,'retained-business-history-profiles.json'),'utf8')).profiles;
const proof=ref=>{const p=structuredClone(ref);p.originalSourceId=p.sourceId;delete p.sourceId;return p;};
function refsFor(p){return [p.ref,...(p.validationProfile?[p.validationProfile.ref,p.validationProfile.identityRef,p.validationProfile.rootBindingRef,p.validationProfile.channelBindingRef]:[p.identityRef]),p.websiteScopeRef].filter(Boolean).filter((r,i,a)=>a.findIndex(x=>x.file===r.file)===i);}
function pinned(ref){const original=loadOriginal(root,ref),raw=JSON.parse(fs.readFileSync(path.join(root,ref.file)));return {original,raw};}
function observationFor(p,evidenceId=p.ref.sourceId){const {original,raw}=pinned(p.ref);return {...original,evidenceId,originalFileSha256:p.ref.fileSha256,representation:p.ref.representation,metadata:raw};}
function match(url,recordId){const rows=profiles.filter(p=>p.ref.url===url&&p.recordId===recordId);return rows.length===1?rows[0]:null;}
function forOrigin(url,{recordId}={}){return match(url,recordId)?{origin:new URL(url).origin,recordIds:[recordId],fields:['operatingHistory'],parserKind:'pinned_retained_business_history_v1',extract}:null;}
function sourceTargets(recordId){return profiles.filter(p=>p.recordId===recordId).map(p=>({url:p.ref.url,fields:['operatingHistory'],sourceType:'operator_statement',purpose:'retained_dated_business_message_not_founding_or_continuity'}));}
function diagnose(o,{recordId}={}){
 const p=match(o?.url,recordId),reject=reason=>({accepted:false,reasons:[reason],facts:[]});
 if(!p)return reject('exact_record_and_reviewed_source_required');
 const metadata=o._verifiedMetadata||o.metadata;
 let original,raw,identityFact=null,proofs;
 try{
  ({original,raw}=pinned(p.ref));proofs=refsFor(p).map(ref=>{pinned(ref);return proof(ref);});
  if(!o.evidenceId||typeof o.evidenceId!=='string'||(o.body||o.text)!==original.body||o.observedAt!==p.ref.observedAt||o.originalFileSha256!==p.ref.fileSha256||o.representation!==p.ref.representation||!isDeepStrictEqual(metadata,raw))return reject('exact_original_body_metadata_file_and_capture_clock_required');
  if(o.passwordForm||o.verificationWidgetObserved||o.authenticationObserved||metadata?.verificationWidgetObserved)return reject('new_authentication_or_verification_checkpoint');
  if(p.validationModule){
   const validator=require('./'+p.validationModule),base=validator.profiles.find(x=>x.recordId===recordId);
   if(!isDeepStrictEqual(base,p.validationProfile))return reject('pinned_reviewed_identity_contract_changed');
   const v=pinned(base.ref),d=validator.diagnose({...v.original,evidenceId:o.evidenceId,originalFileSha256:base.ref.fileSha256,representation:base.ref.representation,metadata:v.raw},{recordId});
   if(!d.accepted)return reject('reviewed_native_identity_and_time_validation_failed');
   identityFact=d.facts[0].fact;
   const s=p.selected,natives=raw.timeMetadata?.filter(m=>m.permalink===s.postUrl)||[],native=natives[0];
   if(natives.length!==1||raw.timeMetadata[s.timeMetadataIndex]!==native||native.dateTime!==s.date||native.text!==s.quote||!original.body.includes(s.quote))return reject('unique_selected_same_post_literal_and_native_datetime_required');
   const reviewed=[...base.events,...base.events.flatMap(e=>e.relatedStatements),...(base.officialDeclaration?[base.officialDeclaration]:[])];
   if(!reviewed.some(e=>e.permalink===s.postUrl&&e.dateTime===s.date&&e.quote===s.quote))return reject('selected_message_not_in_reviewed_business_contract');
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(s.date)||Date.parse(s.date)>Date.parse(original.observedAt))return reject('full_native_publication_datetime_required');
   if(p.kind==='current_candidate_service_message_date'){
    const scope=pinned(p.websiteScopeRef),host=new URL(base.currentOfficialUrlAtReview).hostname;
    if(recordId==='A184'&&!(scope.original.url==='https://docs.dler.io/account/plans.html'&&scope.original.bodySha256==='c5f1d25c386aedb39f531df100b11d22eda45e7df254d69f82bc72d6579c83f8'&&scope.raw.links.some(l=>l.url==='https://oixcloud.com/user/shop'&&l.label==='套餐商店')&&scope.original.body.includes('套餐商店')))return reject('approved_current_oix_candidate_native_scope_required');
    if(recordId==='A196'&&!(new URL(scope.original.url).hostname===host&&scope.original.body.includes('Quarter Biu 30G')&&scope.original.body.includes('30 GB 流量')))return reject('approved_current_biubiu_candidate_business_scope_required');
   }
  }else{
   const identity=pinned(p.identityRef),s=p.selected;
   if(new URL(original.url).origin!==new URL(p.currentOfficialUrlAtReview).origin||new URL(identity.original.url).origin!==new URL(p.currentOfficialUrlAtReview).origin||!identity.original.body.includes('速界机场'))return reject('exact_current_origin_branded_identity_required');
   if(!original.body.startsWith('老顾客继费优惠\n')||!original.body.includes(s.quote)||!original.body.includes('因最近一段时间管控太严，线路频繁被拔线')||s.date!=='2026-10-19'||s.dateQuote!=='2026年10月19日'||original.body.split(s.dateQuote).length!==2||Date.parse(s.date)>Date.parse(original.observedAt))return reject('single_explicit_same_notice_business_date_required');
  }
 }catch{return reject('hash_verified_originals_and_identity_proofs_required');}
 const s=p.selected,base=p.validationProfile,candidate=p.kind==='current_candidate_service_message_date',currentOfficialUrlAtReview=base?.currentOfficialUrlAtReview||p.currentOfficialUrlAtReview;
 const fact={id:'retained-business-history-'+recordId+'-'+(s.postUrl?.split('/').at(-1)||s.date),kind:p.kind,date:s.date,datePrecision:s.datePrecision,quote:s.quote,publisher:p.name+'（站方）',sourceUrl:original.url,observedAt:original.observedAt,sourceOriginalObservedAt:original.observedAt,bodySha256:original.bodySha256,sourceIds:[o.evidenceId],sourceLocator:literalLocator(original.body,s.quote),literalChecked:true,
  ...(s.postUrl?{postUrl:s.postUrl,dateEvidence:{kind:'captured_telegram_time_attribute',value:s.date,postUrl:s.postUrl,sourceLocator:{kind:'capture_metadata',path:'timeMetadata',index:s.timeMetadataIndex,attribute:'dateTime',fileSha256:p.ref.fileSha256}}}:{dateEvidence:{kind:'operator_publication_date_label',value:s.date,quote:s.dateQuote,sourceLocator:literalLocator(original.body,s.dateQuote)}}),
  identityQualification:identityFact?.identityQualification||'registered_current_origin_branded_login_and_explicit_dashboard_notice_no_legal_identity',currentOfficialUrlAtReview,currentOfficialHostname:new URL(currentOfficialUrlAtReview).hostname,identityProofs:proofs,
  ...(candidate?{candidateServiceName:p.name,candidateServiceHostname:new URL(currentOfficialUrlAtReview).hostname,currentCandidateOnly:true,currentOperatingServiceIdentityVerified:false,websiteScopeOriginalSourceId:p.websiteScopeRef.sourceId,websiteScopeProof:proof(p.websiteScopeRef),legacyRecordIdentityVerified:false}:{}),
  canonicalSourceGroup:base?'telegram:'+base.channel:'operator_notice:'+new URL(currentOfficialUrlAtReview).hostname,dependencyGroup:base?'operator_channel:'+base.channel:'operator:'+new URL(currentOfficialUrlAtReview).hostname,
  operatorIdentityVerified:false,legacyContinuityVerified:false,legalEntityContinuityVerified:false,continuousOperationVerified:false,independentHistoricalArchiveVerified:false,independentMeasurement:false,measurementVerified:false,
  limitations:[s.postUrl?'现存频道业务文字及同帖原生发布时间；Telegram帖子可编辑，未核实当年原文或最后编辑时刻。':'现存站方业务公告自标日期，仅保留日精度；可编辑公告不是对应日期的独立历史快照。','仅说明该日期存在业务陈述，不是成立日、最早业务日或连续经营证明；不倒算运营年数。',...(candidate?['只属于当前候选'+p.name+'（'+new URL(currentOfficialUrlAtReview).hostname+'）的频道记录；不证明目录旧名称的历史、恢复、法律主体延续或旧权益继承。']:[]),...(base?.additionalLimitations||[])]};
 return {accepted:true,reasons:[],facts:[{field:'operatingHistory',collection:'historyStatements',fact}],fact};
}
function extract(o,{recordId,prior={}}={}){const d=diagnose(o,{recordId});if(!d.accepted)return null;const old=(prior.coreInfo||prior).operatingHistory||{},rows=old.historyStatements||[];if(rows.some(f=>f.id===d.fact.id))return null;return {operatingHistory:{...old,historyStatements:[...rows,d.fact],sourceIds:[...new Set([...(old.sourceIds||[]),...d.fact.sourceIds])]}};}
module.exports={profiles,forOrigin,sourceTargets,diagnose,extract,observationFor,retainedSourceRefs:()=>profiles.flatMap(p=>refsFor(p).map(ref=>({recordId:p.recordId,ref:structuredClone(ref)})))};
