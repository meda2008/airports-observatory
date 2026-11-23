'use strict';
// Linked-channel historical claims remain below verified operator/service identity.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {normalizeRetainedDocument}=require('../../lib/retained-document.cjs');
const {redact}=require('../../lib/collection-engine.cjs');
const root=path.resolve(__dirname,'../..'),profiles=JSON.parse(fs.readFileSync(path.join(__dirname,'continuation-status-profiles.json'))).profiles;
const sha=x=>createHash('sha256').update(x).digest('hex');
const fullTime=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const match=(url,id)=>profiles.find(p=>p.url===url&&p.recordId===id);
const proof=ref=>{const c=structuredClone(ref);c.originalSourceId=c.sourceId;delete c.sourceId;return c;};
function documentFor(ref){const b=fs.readFileSync(path.join(root,ref.file));if(sha(b)!==ref.fileSha256)throw Error('pinned file changed');const doc=normalizeRetainedDocument(b,{sha256:ref.fileSha256,url:ref.url,last_capture_at:ref.observedAt});if(doc.url!==ref.url||doc.capturedAt!==ref.observedAt||sha(doc.text)!==ref.bodySha256||doc.representation!==ref.representation||!fullTime(ref.observedAt))throw Error('pinned wrapper changed');return{doc,raw:JSON.parse(b)};}
function locator(body,q){const start=body.indexOf(q);return{kind:'body_utf16_range',start,end:start+q.length,quoteSha256:sha(q),bodySha256:sha(body)};}
function nativeLink(raw,link){const l=raw.links?.[link.index];return!!l&&l.url===link.url&&l.label===link.label;}
function diagnose(o,{recordId}={}){
 const p=match(o?.url,recordId),reject=reason=>({accepted:false,reasons:[reason],facts:[]});if(!p)return reject('exact_record_and_linked_channel_required');
 const body=o.body||o.text,at=o.observedAt||o.capturedAt,m=o._verifiedMetadata||o.metadata;
 if(typeof body!=='string'||sha(body)!==p.ref.bodySha256)return reject('exact_reviewed_body_required');
 if(!o.evidenceId||o.originalFileSha256!==p.ref.fileSha256||at!==p.ref.observedAt||o.representation!==p.ref.representation||!fullTime(at))return reject('pinned_original_file_clock_representation_and_source_required');
 let source,identity,group;try{source=documentFor(p.ref);identity=documentFor(p.identityRef);group=documentFor(p.groupRef);}catch{return reject('hash_verified_chain_originals_required');}
 if(!m||m.url!==p.url||m.capturedAt!==at||sha(redact(m.text||''))!==p.ref.bodySha256||JSON.stringify(m)!==JSON.stringify(source.raw))return reject('exact_verified_original_metadata_required');
 if(identity.doc.url!==p.currentOfficialUrlAtReview||!nativeLink(identity.raw,p.rootNativeLink)||p.rootNativeLink.url!==group.doc.url)return reject('current_official_native_group_link_required');
 if(p.groupDeclaration.kind!=='public_group_landing_description'||group.doc.url!=='https://t.me/nexitallyusers'||!group.doc.text.includes(p.groupDeclaration.quote)||!nativeLink(group.raw,p.groupDeclaration.nativeLink)||p.groupDeclaration.nativeLink.url!=='https://t.me/'+p.channel)return reject('native_public_group_description_channel_declaration_required');
 if(!nativeLink(source.raw,p.channelOfficialLink)||p.channelOfficialLink.url!=='http://nexitally.com/'||!body.includes(p.channelOfficialLink.label))return reject('old_domain_counterevidence_required');
 const seen=new Set();for(const e of p.events){const a=m.timeMetadata?.filter(t=>t.permalink===e.permalink)||[],t=a[0];if(a.length!==1||m.timeMetadata[e.timeMetadataIndex]!==t||t.dateTime!==e.dateTime||!fullTime(t.dateTime)||Date.parse(t.dateTime)>Date.parse(at)||t.text!==e.quote||!body.includes(e.quote)||seen.has(t.dateTime))return reject('unique_same_post_native_full_time_and_body_required');seen.add(t.dateTime);}
 const facts=p.events.map(e=>({field:'stability',collection:'linkedChannelReports',fact:{
  id:'continuation-linked-status-'+recordId+'-'+p.channel+'-'+e.post,kind:'linked_official_channel_issue_claim',issueType:e.issueType,relation:'direct_text_match',createdAt:e.dateTime,current:false,url:e.permalink,postUrl:e.permalink,sourceUrl:p.url,publisher:p.name+'（当前官网所引频道，历史归属未核）',summary:e.summary,scope:'当前官网所引频道自述；旧回链与当前域关系未独立核实。'+e.scope,quote:e.quote,sourceIds:[o.evidenceId],observedAt:at,bodySha256:sha(body),sourceLocator:locator(body,e.quote),literalChecked:true,
  dateEvidence:{kind:'captured_telegram_time_attribute',value:e.dateTime,postUrl:e.permalink,sourceLocator:{kind:'capture_metadata',path:'timeMetadata',index:e.timeMetadataIndex,attribute:'dateTime',fileSha256:p.ref.fileSha256}},
  identityQualification:'current_official_root_to_public_group_description_to_channel_native_chain_only',identityBinding:{kind:'native_official_root_public_group_channel_chain',currentOfficialUrl:p.currentOfficialUrlAtReview,rootLink:{...structuredClone(p.rootNativeLink),sourceLocator:{kind:'capture_metadata_link',path:'links',index:p.rootNativeLink.index,fileSha256:p.identityRef.fileSha256}},groupDeclaration:{quote:p.groupDeclaration.quote,kind:p.groupDeclaration.kind,sourceLocator:locator(group.doc.text,p.groupDeclaration.quote),nativeLink:structuredClone(p.groupDeclaration.nativeLink)}},
  nativeOfficialBacklink:{url:p.channelOfficialLink.url,label:p.channelOfficialLink.label,sourceLocator:{kind:'capture_metadata_link',path:'links',index:p.channelOfficialLink.index,fileSha256:p.ref.fileSha256}},identityProofs:[p.ref,p.identityRef,p.groupRef].map(proof),currentOfficialUrlAtReview:p.currentOfficialUrlAtReview,
  counterevidence:{oldOfficialBacklink:p.channelOfficialLink.url,currentOfficialHost:new URL(p.currentOfficialUrlAtReview).hostname,aliasRelationVerified:false,httpRedirectVerified:false,backlinkCurrentHostMatches:false},
  identityVerified:false,operatorIdentityVerified:false,currentHistoricalIdentityVerified:false,countsAsVerifiedStability:false,independentMeasurement:false,measurementVerified:false,rawMeasurementLogsVerified:false,continuousOperationVerified:false,durationMinutes:null,sampleCount:null,measurementWindow:null,relatedStatements:[],
  canonicalSourceGroup:'telegram:'+p.channel,dependencyGroup:'operator_channel:'+p.channel,independentSourceCount:1,
  limitations:['当前官网的原生群链接和公开群简介指向该频道；只证明当前引用关系，未独立核实频道历史事件属于当前域服务。','频道旧官网回链为http://nexitally.com/，与当前nxonearth.com的别名或迁移关系未闭合；不得隐去此反证。','站方频道历史自述，帖子可编辑；原生发布时间不是恢复时刻或最后编辑时刻。','同帖已修复文字原样保留；预计2小时不是实际时长；软件bug中的500M不是独立测速。','不计入稳定性已核实记录、当前故障数或命中率，不计算持续运行、可用率或稳定率。']
 }}));return{accepted:true,reasons:[],facts};
}
function extract(o,{recordId,prior={}}={}){const d=diagnose(o,{recordId});if(!d.accepted)return null;const old=(prior.coreInfo||prior).stability||{},p={...old,linkedChannelReports:[...(old.linkedChannelReports||[])]};let added=false;for(const{fact}of d.facts){if(p.linkedChannelReports.some(x=>x.id===fact.id||x.postUrl===fact.postUrl&&x.quote===fact.quote))continue;p.linkedChannelReports.push(fact);p.sourceIds=[...new Set([...(p.sourceIds||[]),...fact.sourceIds])];added=true;}return added?{stability:p}:null;}
const forOrigin=(url,{recordId}={})=>match(url,recordId)?{origin:new URL(url).origin,recordIds:[recordId],fields:['stability'],parserKind:'continuation_linked_channel_history_unverified_identity_v1',extract}:null;
const sourceTargets=recordId=>profiles.filter(p=>p.recordId===recordId).map(p=>({url:p.url,fields:['stability'],sourceType:'operator_statement',purpose:'linked_channel_historical_claim_unverified_identity'}));
module.exports={profiles,forOrigin,sourceTargets,diagnose,extract,retainedSourceRefs:()=>profiles.flatMap(p=>[p.ref,p.identityRef,p.groupRef].map(ref=>({recordId:p.recordId,ref:structuredClone(ref)})))};
