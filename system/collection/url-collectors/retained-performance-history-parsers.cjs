'use strict';
// A date inside a retained test record is not a founding or continuity claim.
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const {loadOriginal,literalLocator,sha}=require('../../lib/performance-evidence.cjs');
const root=path.resolve(__dirname,'../..');
const PINNED={A037:'e1a2206b9ccbd249d4296b8fbf44a59fc755367fddf8797bfe45b0369233d8b6',A170:'bab27b8fa3271ad443cf6b5282bd67c7a9a307da142804147dccb46396f6912e',A044:'2fa38cbfdea2ae217211c2acb711898471bd6f4aae4888d76d1b2bc380115e67'};
function normalizeProfiles(c){const rows=Array.isArray(c)?c:c?.profiles;return(Array.isArray(rows)?rows:[]).filter(p=>p&&PINNED[p.recordId]&&sha(JSON.stringify(p))===PINNED[p.recordId]).filter((p,i,a)=>a.filter(q=>q.recordId===p.recordId).length===1).map(p=>structuredClone(p));}
const profiles=normalizeProfiles(JSON.parse(fs.readFileSync(path.join(__dirname,'retained-performance-history-profiles.json'),'utf8')));
const proof=r=>{const p=structuredClone(r);p.originalSourceId=p.sourceId;delete p.sourceId;return p;};
const refsFor=p=>p.validationProfile?[p.ref,p.validationProfile.identity,p.validationProfile.route,p.validationProfile.imageReview]:[p.ref];
function pinned(ref){return{original:loadOriginal(root,ref),raw:JSON.parse(fs.readFileSync(path.join(root,ref.file),'utf8'))};}
function observationFor(p,evidenceId=p.ref.sourceId){const {original,raw}=pinned(p.ref);return{...original,evidenceId,originalFileSha256:p.ref.fileSha256,representation:p.ref.representation,metadata:raw};}
function match(url,recordId){const rows=profiles.filter(p=>p.ref.url===url&&p.recordId===recordId);return rows.length===1?rows[0]:null;}
function diagnose(o,{recordId}={}){
 const p=match(o?.url,recordId),no=reason=>({accepted:false,reasons:[reason],facts:[]});if(!p)return no('exact_reviewed_record_and_profile_required');
 const metadata=o._verifiedMetadata||o.metadata;let original,raw,report,proofs,imageMetadata;
 try{
  ({original,raw}=pinned(p.ref));proofs=refsFor(p).map(r=>{pinned(r);return proof(r);});
  if(typeof o.evidenceId!=='string'||!o.evidenceId.trim()||(o.body||o.text)!==original.body||o.observedAt!==p.ref.observedAt||o.originalFileSha256!==p.ref.fileSha256||o.representation!==p.ref.representation||!isDeepStrictEqual(metadata,raw))return no('exact_original_body_metadata_file_and_capture_clock_required');
  if(o.passwordForm||o.verificationWidgetObserved||o.authenticationObserved||metadata?.authenticationObserved||metadata?.verificationWidgetObserved||metadata?.passwordForm)return no('new_authentication_or_verification_checkpoint');
  if(p.kind==='third_party_test_record_date'){
   const v=require(p.recordId==='A037'?'./next-gap-speed-parsers.cjs':'./continuation-speed-parsers.cjs'),base=v.profiles.find(x=>x.recordId===recordId);if(!isDeepStrictEqual(base,p.validationProfile))return no('reviewed_speed_identity_contract_changed');
   const checked=v.checkedMaterials(base);if(!checked)return no('reviewed_image_hash_route_and_identity_required');
   const d=v.diagnose({...raw,evidenceId:o.evidenceId},{recordId});if(!d.accepted)return no('reviewed_speed_record_validation_failed');report=d.report;imageMetadata=checked.metadata;
   if(report.testedAt!==p.selected.date||imageMetadata.imageTestDateLiteral!==p.selected.dateQuote||report.testedAtPrecision!=='day')return no('explicit_reviewed_image_test_date_required');
  }else{
   report=require('./official-performance-parsers.cjs').operatorTestReportFromBody(original,{recordId});
   if(!report||report.testedAt!==p.selected.date||report.testWindowQuote!==p.selected.dateQuote||report.scopeQuote!==p.selected.quote||new URL(original.url).origin!==new URL(p.currentOfficialUrlAtReview).origin)return no('same_operator_full_dated_test_supplement_required');
  }
 }catch{return no('hash_verified_originals_and_identity_proofs_required');}
 const image=p.kind==='third_party_test_record_date',s=p.selected,currentOfficialUrlAtReview=image?'https://'+p.validationProfile.currentCatalogHostname+'/':p.currentOfficialUrlAtReview,quote=image?s.quote:report.testWindowQuote;
 const fact={id:'retained-performance-history-'+recordId+'-'+s.date,kind:p.kind,date:s.date,datePrecision:s.datePrecision,quote,publisher:report.publisher,sourceUrl:original.url,observedAt:original.observedAt,sourceOriginalObservedAt:original.observedAt,bodySha256:original.bodySha256,sourceIds:[o.evidenceId],sourceLocator:literalLocator(original.body,quote),literalChecked:true,
  dateEvidence:image?{kind:'retained_image_footer_literal',value:s.date,quote:s.dateQuote,reportedLocalTime:imageMetadata.reportedLocalTime,reportedTimeZone:'CST',timeZoneOffset:null,exactTestInstant:null,sourceLocator:{kind:'retained_image_literal',imageFile:imageMetadata.imageFile,imageSha256:imageMetadata.imageSha256,review:proof(p.validationProfile.imageReview)}}:{kind:'operator_test_window_literal',value:s.date,quote:s.dateQuote,sourceLocator:literalLocator(original.body,s.dateQuote),windowStart:report.windowStart,windowEnd:report.windowEnd,windowPrecision:report.windowPrecision},
  identityQualification:report.identityQualification,currentOfficialUrlAtReview,currentOfficialHostname:new URL(currentOfficialUrlAtReview).hostname,identityProofs:proofs,
  relatedTestReportId:report.id,canonicalSourceGroup:image?report.canonicalSourceGroup:'operator_test:'+new URL(original.url).hostname+':'+s.date,dependencyGroup:image?'publisher:'+new URL(original.url).hostname:'operator:'+new URL(original.url).hostname,
  operatorIdentityVerified:false,historicalIdentityVerified:false,legacyRecordIdentityVerified:false,legacyContinuityVerified:false,legalEntityContinuityVerified:false,continuousOperationVerified:false,independentHistoricalArchiveVerified:false,independentMeasurement:false,measurementVerified:false,
  limitations:[image?'保留第三方测速图自标测试日期；未核实图像真实性、原始日志、当年网页或法律主体。':'现存站方页面对同一补测报告自标完整日期与窗口；未独立复测或取得当年独立历史快照。','仅说明该日期有测速记录或陈述，不是成立日、最早业务日或连续经营证明；不倒算运营年数。',p.recordId==='A037'?'当前官网关联仅由正文备用完整URL与另一文章同域原生链接核对；主入口现跳0113.sd04-bmbb7vmk.top并遇安全验证，别名关系未闭合，不证明2025年主体连续。':p.recordId==='A044'?'第三方原生入口经保留导航记录到当前登记cloud.e-ix.com并显示E-IX注册页；仅证明当前入口关联，不证明2025年法律主体或经营连续。':'仅限A170当前登记www.bianjiecloud.com的边界云站方测试；不归给A003 Imm旧主体或证明法律主体延续。',...(image?['日期来自图内页脚；CST缩写偏移未知，仅保留日精度，不用文章发表日或采集日代替测试日。']:[])]};
 return{accepted:true,reasons:[],facts:[{field:'operatingHistory',collection:'historyStatements',fact}],fact};
}
function extract(o,{recordId,prior={}}={}){const d=diagnose(o,{recordId});if(!d.accepted)return null;const old=(prior.coreInfo||prior).operatingHistory||{},rows=old.historyStatements||[];if(rows.some(f=>f.id===d.fact.id))return null;return{operatingHistory:{...old,historyStatements:[...rows,d.fact],sourceIds:[...new Set([...(old.sourceIds||[]),...d.fact.sourceIds])]}};}
function forOrigin(url,{recordId}={}){return match(url,recordId)?{origin:new URL(url).origin,recordIds:[recordId],fields:['operatingHistory'],parserKind:'pinned_retained_performance_history_v1',extract}:null;}
function sourceTargets(recordId){return profiles.filter(p=>p.recordId===recordId).map(p=>({url:p.ref.url,fields:['operatingHistory'],sourceType:p.kind==='third_party_test_record_date'?'third_party_test_record':'operator_statement',purpose:'retained_explicit_test_date_not_founding_or_continuity'}));}
module.exports={profiles,normalizeProfiles,diagnose,extract,forOrigin,sourceTargets,observationFor,retainedSourceRefs:()=>profiles.flatMap(p=>refsFor(p).map(ref=>({recordId:p.recordId,ref:structuredClone(ref)})))};
