'use strict';
// Exact, reviewed historical publisher statements. No probing, current-state
// inference, outage duration, whole-network failure claim or availability rate.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const sha=v=>createHash('sha256').update(v).digest('hex'),configFile=path.join(__dirname,'vpsknow-additional-status-profiles.json');
const CONTRACTS=Object.freeze({
  "A189": {
    "recordId": "A189",
    "url": "https://vpsknow.com/reviews/airports/bitz-net-airport-review/",
    "heading": "Bitz Net 机场测评",
    "nativeOfficialLink": "https://go.uukk.de/Bitz",
    "officialLabels": [
      "查看机场官网",
      "查看 Bitz Net 官网\n→"
    ],
    "events": [
      {
        "kind": "partial_timeout_with_other_responses",
        "date": "2026-11-02",
        "dateQuote": "证据口径：2026-11-02 约22:47–23:32 截图；公开副本已遮挡完整出口地址，原始证据保留本地；单晚结果不代表长期稳定性",
        "quote": "Clash Verge 订阅可见 Trojan 为主、个别 VLESS 节点，多数命名含广东专线 BGP；本轮台湾约 106ms、美国广东专线样本约 160ms，马来西亚、澳大利亚等亦有延迟返回，俄罗斯样本 Timeout。页面 IEPL / 专线 / 沪日穗港表述按“页面口径”记录，单次延迟不能证明全程专线或长期稳定。购买页写明核心访问与试用订阅同款；本轮另在后台确认新用户注册可领 1 天 5GB「核心访问-试用」（见下方截图），下单前仍应在官网确认试用是否仍开放及最新流量/时长。",
        "scope": "发布者2026-11-02约22:47–23:32会话中Clash Verge俄罗斯样本Timeout，同时台湾/美国/马来西亚/澳大利亚有延迟返回；非全订阅、全网故障或长期稳定结论。",
        "reportedTime": null,
        "reportedTimeWindow": "22:47–23:32",
        "reportedApproximateTime": true,
        "publisherClaimedManualConfirmation": false
      }
    ]
  },
  "A017": {
    "recordId": "A017",
    "url": "https://vpsknow.com/reviews/airports/mesl-airport-review/",
    "heading": "MESL 机场测评",
    "nativeOfficialLink": "https://go.uukk.de/mesl",
    "officialLabels": [
      "查看机场官网",
      "查看 MESL 官网\n→"
    ],
    "events": [
      {
        "kind": "conditional_access_change",
        "date": "2026-09-23",
        "dateQuote": "MESL 团队 2026-09-23 用户升级通知",
        "quote": "2026-09-23 的用户通知写明：9 月 24–25 日节点升级后，只有官方客户端，或内置专用 DNS 的最新订阅，才能正常连接；旧订阅可能失败。Windows、macOS、Android 与 OpenWrt 已提供官方客户端，iOS 仍在审核。继续用 Clash、Shadowrocket、Surge 等第三方客户端时，需要先更新订阅，并关闭 DNS 覆写。2026-06 的实测仍来自 Clash Verge 通用订阅。",
        "scope": "发布者转述2026-09-23用户升级通知：9月24–25日升级后的官方客户端/最新专用DNS订阅/关闭DNS覆写等接入条件；是条件性兼容变化，不是已发生全站停服、实际故障或9月25日恢复记录。",
        "reportedTime": null,
        "reportedApproximateTime": false,
        "publisherClaimedManualConfirmation": false
      }
    ]
  }
});
function exactUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.href===value?u:null;}catch{return null;}}
function fullClock(value){const m=/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value||'');if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCDate()===+m[3]&&Number.isFinite(Date.parse(value));}
function proofUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.href===value&&!/[?&#](?:token|password|secret|session|auth_key|access_token)=/i.test(value);}catch{return false;}}
function proof(r){return r&&typeof r.file==='string'&&r.file.length>0&&r.file.length<=512&&!path.isAbsolute(r.file)&&!r.file.split(/[\\/]/).includes('..')&&/^[a-f0-9]{64}$/.test(r.fileSha256||'')&&/^[a-f0-9]{64}$/.test(r.bodySha256||'')&&proofUrl(r.url)&&fullClock(r.observedAt);}
function reviewedRepresentations(p){if(!Array.isArray(p?.reviewedCaptureRepresentations)||!p.reviewedCaptureRepresentations.length||p.reviewedCaptureRepresentations.length>4)return null;const seen=new Set();for(const row of p.reviewedCaptureRepresentations){const r=row?.ref,key=row?.representation+':'+row?.bodySha256;if(!['builtin_browser_visible_DOM_text','redacted_visible_DOM_text_not_original_HTML','explicit_retained_rendered_main_text'].includes(row?.representation)||!/^[a-f0-9]{64}$/.test(row?.bodySha256||'')||!proof(r)||r.url!==p.url||r.bodySha256!==row.bodySha256||r.representation!==(row.representation==='explicit_retained_rendered_main_text'?'retained_document':row.representation)||seen.has(key)||row.representation==='builtin_browser_visible_DOM_text'&&r.bodyDerivation!==undefined||row.representation==='explicit_retained_rendered_main_text'&&r.bodyDerivation!=='JSON.parse(normalizedText).renderedMainText'||row.representation==='redacted_visible_DOM_text_not_original_HTML'&&r.bodyDerivation!=='standalone.toCapture(shared_reader_snapshot).body')return null;seen.add(key);}return structuredClone(p.reviewedCaptureRepresentations);}
function normalizeProfiles(value){const rows=Array.isArray(value)?value:value?.profiles,valid=[];for(const p of Array.isArray(rows)?rows:[]){const c=CONTRACTS[p?.recordId],representations=reviewedRepresentations(p);if(!c||p.url!==c.url||!exactUrl(p.url)||!/^[a-f0-9]{64}$/.test(p.reviewedBodySha256||'')||!representations||!representations.some(r=>r.bodySha256===p.reviewedBodySha256)||!Array.isArray(p.identityProofs)||p.identityProofs.length>4)continue;const origins=p.reviewedOfficialOrigins;const identityQualified=p.identityQualified===true&&Array.isArray(origins)&&origins.length>0&&origins.length<=4&&new Set(origins).size===origins.length&&origins.every(v=>{try{return new URL(v).origin===v&&new URL(v).protocol==='https:';}catch{return false;}})&&p.identityProofs.some(r=>proof(r)&&origins.includes(new URL(r.url).origin))&&p.identityProofs.every(r=>proof(r)&&(origins.includes(new URL(r.url).origin)||r.proofRole==='native_review_official_link'&&r.url===c.url&&r.representation==='builtin_browser_metadata_json'));valid.push({recordId:p.recordId,url:p.url,reviewedBodySha256:p.reviewedBodySha256,reviewedCaptureRepresentations:representations,identityQualified,nativeLinkProof:identityQualified?p.identityProofs.find(r=>r.proofRole==='native_review_official_link')||null:null,reviewedOfficialOrigins:identityQualified?[...origins]:[],identityProofs:identityQualified?structuredClone(p.identityProofs):[]});}return valid.filter(p=>valid.filter(r=>r.recordId===p.recordId).length===1);}
function loadProfiles(){try{return normalizeProfiles(JSON.parse(fs.readFileSync(configFile,'utf8')));}catch{return[];}}
function locator(body,quote){const start=body.indexOf(quote);return{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:sha(quote),bodySha256:sha(body)};}
function capture(o){return{...o,body:typeof o?.body==='string'?o.body:typeof o?.text==='string'?o.text:'',observedAt:o?.observedAt||o?.capturedAt};}
function createParser(config){const profiles=normalizeProfiles(config),match=(url,id)=>profiles.find(p=>p.recordId===id&&p.url===url);
 function forOrigin(url,{recordId}={}){const p=match(url,recordId);return p?.identityQualified?{origin:'https://vpsknow.com',recordIds:[recordId],fields:['stability'],parserKind:'explicit_historical_publisher_service_status_claim',extract}:null;}
 function sourceTargets(recordId){return profiles.filter(p=>p.recordId===recordId&&p.identityQualified).map(p=>({url:p.url,fields:['stability'],sourceType:'third_party_service_status_report'}));}
 function diagnose(input,{recordId}={}){const o=capture(input),p=match(o?.url,recordId),c=CONTRACTS[recordId],reject=reason=>({accepted:false,reasons:[reason],fact:null});
  if(!p||!c)return reject('exact_record_and_publisher_article_required');if(!p.identityQualified)return reject('reviewed_current_service_identity_proofs_required');
  if(!o.evidenceId||typeof o.evidenceId!=='string'||!o.evidenceId.trim()||!fullClock(o.observedAt)||!o.body||o.body.length>200000||o.authenticationObserved||o.metadata?.authenticationObserved||o.passwordForm||o.metadata?.passwordForm||o.verificationWidgetObserved||o.metadata?.verificationWidgetObserved||/checkpoint|authorized_account/.test(o.kind||'')||o.sha256&&o.sha256!==sha(o.body)||o.bodySha256&&o.bodySha256!==sha(o.body))return reject('valid_public_source_bound_capture_required');
  const body=o.body;if(body.split(/\r?\n/).filter(line=>line.trim()===c.heading).length!==1)return reject('exact_brand_heading_required');
  let identitySourceLocator;
  if(o.representation==='explicit_retained_rendered_main_text'){
   const pinned=p.reviewedCaptureRepresentations.find(r=>r.representation===o.representation&&r.bodySha256===sha(body)),raw=o._verifiedMetadata;
   if(!pinned||!p.nativeLinkProof||o.originalFileSha256!==pinned.ref.fileSha256||!raw||raw.url!==c.url||raw.capturedAt!==pinned.ref.observedAt||o.observedAt!==raw.capturedAt||typeof raw.text!=='string')return reject('verified_retained_wrapper_clock_hash_and_native_link_proof_required');
   let nested;try{nested=JSON.parse(require('../../lib/collection-engine.cjs').redact(raw.text));}catch{return reject('verified_retained_wrapper_required');}
   if(nested.renderedMainText!==body)return reject('retained_body_must_match_verified_original_wrapper');
   identitySourceLocator={kind:'reviewed_native_link_proof_metadata',ref:structuredClone(p.nativeLinkProof),path:'links',href:c.nativeOfficialLink};
  }else{
   const links=o.metadata?.links??o.links,path=o.metadata?.links?'metadata.links':'links';if(!Array.isArray(links)||links.length>500)return reject('bounded_native_official_link_metadata_required');
   const linkIndex=links.findIndex(l=>(l?.url||l?.href)===c.nativeOfficialLink&&c.officialLabels.includes(l.label||l.text)&&body.includes(l.label||l.text));if(linkIndex<0)return reject('exact_reviewed_native_official_link_required');
   identitySourceLocator={kind:'capture_metadata_link',path,index:linkIndex,attribute:links[linkIndex].url!==undefined?'url':'href',href:c.nativeOfficialLink};
  }
  const representation=o.representation??o.metadata?.representation;if(typeof representation!=='string'||o.representation&&o.metadata?.representation&&o.representation!==o.metadata.representation)return reject('explicit_consistent_capture_representation_required');
  if(!p.reviewedCaptureRepresentations.some(r=>r.bodySha256===sha(body)&&r.representation===representation))return{...reject('publisher_source_body_changed_requires_review'),requiresSourceReview:true,observation:o,profile:p};
  for(const e of c.events){const dateMatches=[...e.dateQuote.matchAll(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)];if(dateMatches.length!==1||dateMatches[0][0]!==e.date||!body.includes(e.dateQuote)||!body.includes(e.quote)||Date.parse(e.date)>Date.parse(o.observedAt))return reject('exact_event_date_and_literal_contract_required');}
  const events=c.events.map(e=>({...structuredClone(e),date:e.dateQuote.match(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/)[0],current:false,independentMeasurement:false,datePrecision:'day',reportedTimePrecision:e.reportedTime?'minute':null,timezone:null,occurredAt:null,durationMinutes:null,sampleCount:null,attribution:'publisher_statement_not_independently_verified',sourceLocator:locator(body,e.quote),dateEvidence:{kind:'publisher_calendar_label',quote:e.dateQuote,value:e.date,sourceLocator:locator(body,e.dateQuote)}}));
  const contentSignature=sha(JSON.stringify({recordId,url:p.url,events:c.events})),quote=c.heading,fact={id:'vpsknow-additional-service-status-'+recordId+'-'+contentSignature.slice(0,20),kind:'historical_third_party_service_status_claim',publisher:'VPSKnow（vpsknow.com，第三方推广评测）',status:'reviewed_literal_publisher_claim_not_independent_measurement',current:false,sampleCount:null,independentMeasurement:false,measurementVerified:false,publisherIndependenceVerified:false,rawMeasurementLogsVerified:false,imageAuthenticityVerified:false,literalChecked:true,sourceUrl:p.url,observedAt:o.observedAt,bodySha256:sha(body),sourceIds:[o.evidenceId],quote,sourceLocator:locator(body,quote),identityQualification:'reviewed_native_recommendation_link_bridge_not_legal_operator_identity',identityProofs:structuredClone(p.identityProofs),identitySourceLocator,canonicalSourceGroup:'vpsknow:service-status:'+recordId.toLowerCase(),contentSignature,events,limitations:['只保留发布者历史事件描述与反证，不是我们实测、独立复核或当前服务状态，不参与当前质量排名。','Timeout及恢复仅限原文所述客户端/截图节点和当次时段，不能外推全网、全部订阅、永久停服、跑路或长期稳定。','作者声称人工确认仅属作者声明；未独立核验原图真实性、原始探测日志、样本次数及故障持续时间，均不推算可用率。','事件日期和约略分钟来自原文，未披露时区或精确epoch；不从相邻事件相减计算停服时长。','当前官网短链归属由显式reviewed proof限定，不能证明历史法律主体或持续运营；同发布者材料不当独立信源。']};
  return{accepted:true,reasons:[],fact,report:fact,facts:[fact]};
 }
 function extract(input,{recordId,prior={}}={}){const d=diagnose(input,{recordId}),old=(prior.coreInfo||prior).stability||{};
  if(!d.accepted){if(!d.requiresSourceReview)return null;const o=d.observation,p=d.profile,id='vpsknow-additional-status-revision-'+recordId+'-'+sha(o.body).slice(0,20),items=Array.isArray(old.referenceCandidates)?old.referenceCandidates:[];if(items.some(r=>r.id===id))return null;const quote=CONTRACTS[recordId].heading,candidate={id,kind:'third_party_service_status_revision_candidate',status:'requires_source_review',reason:d.reasons[0],current:false,sourceUrl:o.url,observedAt:o.observedAt,sourceIds:[o.evidenceId],previousBodySha256:p.reviewedBodySha256,bodySha256:sha(o.body),quote,sourceLocator:locator(o.body,quote),noNewOutageOrRecoveryInferred:true};return{stability:{...old,referenceCandidates:[...items,candidate]}};}
  const reports=Array.isArray(old.thirdPartyStatusReports)?old.thirdPartyStatusReports:[];if(reports.some(r=>r.id===d.fact.id||r.sourceUrl===d.fact.sourceUrl&&r.contentSignature===d.fact.contentSignature))return null;return{stability:{...old,sourceIds:[...new Set([...(old.sourceIds||[]),...d.fact.sourceIds])],thirdPartyStatusReports:[...reports,d.fact]}};
 }
 return{profiles,forOrigin,sourceTargets,diagnose,extract};
}
module.exports={CONTRACTS,retainedSourceRefs:()=>loadProfiles().flatMap(p=>p.reviewedCaptureRepresentations.filter(r=>r.representation==='explicit_retained_rendered_main_text').map(r=>({recordId:p.recordId,ref:structuredClone(r.ref)}))),createParser,loadProfiles,get profiles(){return loadProfiles();},forOrigin:(...args)=>createParser(loadProfiles()).forOrigin(...args),sourceTargets:(...args)=>createParser(loadProfiles()).sourceTargets(...args),diagnose:(...args)=>createParser(loadProfiles()).diagnose(...args),extract:(...args)=>createParser(loadProfiles()).extract(...args)};
