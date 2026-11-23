'use strict';
// Retained/public reference admission only. Never manufactures measurements or approves changes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {loadOriginal,literalLocator,sha}=require('./performance-evidence.cjs');
const COLLECTIONS={operatorMeasuredClaims:'speed',linkedChannelReports:'stability',undatedImageReports:'speed',publisherPerformanceSnapshots:'speed',reportedNodeRanges:'speed',speedTestReports:'speed',thirdPartyStatusReports:'stability',videoReports:'speed',thirdPartyMonitorReports:'stability',verifiedReports:'speed',imageReports:'speed',regionalReports:'speed',latencyReports:'speed',operatorTestReports:'speed',reviewedIssueSignals:'stability',operatorStatusReports:'stability',operatorSlaClaims:'stability',historyStatements:'operatingHistory',historicalClaims:'operatingHistory'};
function validateOperatorTestReference({entry,primary,fact}){
 const original=primary.original,expected=require('../collection/url-collectors/official-performance-parsers.cjs').operatorTestReportFromBody({url:original.url,body:original.body,observedAt:original.observedAt},{recordId:entry.siteId});
 assert(expected,'Explicit same-brand operator supplement contract required');
 const allowed=new Set([...Object.keys(expected),'sourceUrl','observedAt','bodySha256','sourceLocator']);
 assert(Object.keys(fact).every(k=>allowed.has(k)),'Unexpected operator test field');
 // Recompute from the hash-verified source, including each row's scope, unit,
 // concurrency and exact range; a literal number elsewhere is not sufficient.
 for(const [key,value]of Object.entries(expected))assert.deepEqual(fact[key],value,'Operator supplement '+key+' differs from original');
 for(const [key,value]of Object.entries({sourceUrl:original.url,observedAt:original.observedAt,bodySha256:original.bodySha256,sourceLocator:literalLocator(original.body,expected.quote)}))if(fact[key]!==undefined)assert.deepEqual(fact[key],value,'Operator supplement '+key+' contradicts retained source');
 assert(Date.parse(expected.windowEnd)<=Date.parse(original.observedAt),'Operator supplement window follows capture');
}
function validateOperatorPolicyDate({primary,fact}){
 assert.equal(fact.continuousOperationVerified,false,'Policy date is not continuous operation');
 assert.equal(fact.independentHistoricalArchiveVerified,false,'Policy self-date is not an independently verified historical archive');
 assert(['foundedAt','establishedAt','yearsSinceStart','operatingYears','yearsActive','claimedFoundedAt','startYear'].every(k=>fact[k]===undefined),'No founding or operating age fields from a policy date');
 assert(['revision','effective','document'].includes(fact.policyDateType),'Explicit policy date type required');
 assert(fact.datePrecision==='day'&&/^\d{4}-\d{2}-\d{2}$/.test(fact.date),'Policy date must keep day precision');
 const d=fact.dateEvidence;assert(d?.kind==='operator_policy_date_label'&&d.value===fact.date,'Policy date evidence value must equal the fact date');
 assert(typeof d.quote==='string'&&!/(?:copyright|all rights reserved|©|版权所有|https?:\/\/)/i.test(d.quote),'Copyright or a URL is not a policy date label');
 const policyDates=require('../collection/url-collectors/operator-policy-dates.cjs'),iso=policyDates.parsePolicyDate(d.quote);
 assert(iso&&iso===fact.date,'Policy calendar date differs from literal');
 assert(!/(?:copyright|©|版权所有)/i.test(d.policyContextQuote),'Copyright context cannot qualify a policy date');
 assert(policyDates.isPolicyContext(d.policyContextQuote),'Explicit same-source policy context required');
 if(fact.policyDateType==='revision')assert(/修订|更新|修改|revis|updat/i.test(d.quote),'Revision label required');
 if(fact.policyDateType==='effective')assert(/适用|適用|生效|effective/i.test(d.quote),'Effective date label required');
 const labelLocator=literalLocator(primary.original.body,d.quote),dateStart=labelLocator.start,body=primary.original.body,lineStart=body.lastIndexOf('\n',dateStart)+1,nextLine=body.indexOf('\n',dateStart),dateLine=body.slice(lineStart,nextLine<0?body.length:nextLine);
 assert(!/(?:copyright|all rights reserved|©|版权所有)/i.test(dateLine),'Date belongs to a copyright line, not a policy label');
 literalLocator(primary.original.body,d.policyContextQuote);
 assert(Date.parse(fact.date)<=Date.parse(primary.original.observedAt),'Policy date cannot follow retained capture');
}
function validateOperatorOperatingSince({primary,fact}){
 assert(fact.continuousOperationVerified===false&&fact.independentHistoricalArchiveVerified===false,'Operator service-since claim is not independently verified continuous operation');
 assert(['foundedAt','establishedAt','yearsSinceStart','operatingYears','yearsActive','claimedFoundedAt','startYear'].every(k=>fact[k]===undefined),'No founding or operating age fields from a service-since claim');
 assert(fact.datePrecision==='year'&&/^\d{4}$/.test(fact.date),'Operator service-since claim must retain year precision');
 const d=fact.dateEvidence;assert(d?.kind==='operator_operating_since_label'&&d.value===fact.date&&typeof d.quote==='string','Explicit operator service-since source sentence required');
 const years=[...d.quote.matchAll(/(?<!\d)(\d{4})(?!\d)/g)],claim=d.quote.match(/(?:自|从)\s*(\d{4})\s*年(?:起|开始)[^。！？\n]{0,180}(?:服务|运营)/);
 assert(years.length===1&&years[0][1]===fact.date&&claim?.[1]===fact.date&&!/(?:copyright|©|版权所有)/i.test(d.quote),'Service-since year differs from explicit operating-service sentence');
 literalLocator(primary.original.body,d.quote);assert(Number(fact.date)<=new Date(primary.original.observedAt).getUTCFullYear(),'Service-since year follows capture');
}
function validateLatencyReference({root,entry,primary,fact}){
 const parser=require('../collection/url-collectors/echoc-latency-parsers.cjs');
 const original=primary.original;
 assert(parser.forOrigin(original.url,{recordId:entry.siteId}),'Latency publisher and site identity required');
 assert(fact.kind==='historical_third_party_latency_report'&&fact.metric==='https_elapsed_ms'&&fact.statistic==='publisher_reported_weighted_and_typical_latency','HTTPS latency qualification required');
 assert(fact.testedAt===null&&fact.independentMeasurement===false&&fact.measurementVerified===false&&fact.sampleCount===null,'Unknown test date and unverified historical qualifications required');
 assert.equal(primary.ref.representation,'builtin_browser_visible_DOM_text','Latency validation requires the actual captured DOM representation');
 // Read only metadata actually retained with the hash-verified original. Never
 // turn configured origins into invented native links or historical identity.
 const bytes=fs.readFileSync(path.resolve(root,primary.ref.file));
 assert.equal(sha(bytes),original.fileSha256,'Latency original changed after verification');
 const raw=JSON.parse(bytes),nativeLinks=raw.metadata?.links??raw.links;
 assert(Array.isArray(nativeLinks),'Retained original native links required');
 const parsed=parser.diagnose({url:original.url,body:original.body,observedAt:original.observedAt,evidenceId:'MANIFEST-VALIDATION',links:nativeLinks},{recordId:entry.siteId});
 assert(parsed.accepted,'Original latency parser contract failed: '+parsed.reasons.join(','));
 const expected=parsed.report;
 const allowedKeys=new Set([...Object.keys(expected),'supersedes','correctionPendingReview']);
 assert(Object.keys(fact).every(key=>allowedKeys.has(key)),'Unexpected field in historical latency reference');
 if(fact.supersedes!==undefined)assert(typeof fact.supersedes==='string'&&fact.supersedes.length&&fact.correctionPendingReview===true,'Latency correction requires explicit review qualification');
 if(fact.correctionPendingReview!==undefined)assert.equal(fact.correctionPendingReview,true,'Latency correction cannot bypass review');
 for(const key of ['kind','metric','statistic','publishedAt','testedAt','networkContexts','testPlatform','testClient','probeTargets','roundsPerTarget','timeoutMs','concurrency','publisher','canonicalSourceGroup','identityQualification','literalChecked','sampleCount','independentMeasurement','measurementVerified','contentSignature','quote','publicationQuote','methodology']){
  assert.deepEqual(fact[key],expected[key],'Latency '+key+' differs from original');
 }
 assert(expected.limitations.every(text=>Array.isArray(fact.limitations)&&fact.limitations.includes(text)),'Historical latency limitations must be retained');
 for(const[key,value]of Object.entries({sourceUrl:original.url,observedAt:original.observedAt,bodySha256:original.bodySha256}))if(fact[key]!==undefined)assert.equal(fact[key],value,'Latency '+key+' contradicts retained source');
 const withoutLocator=rows=>rows.map(({sourceLocator,...row})=>row);
 assert(Array.isArray(fact.rows),'Latency rows required');
 assert.deepEqual(withoutLocator(fact.rows),withoutLocator(expected.rows),'Latency numeric rows differ from original');
 const bindRange=(quote,range)=>{
  assert.equal(original.body.slice(range.start,range.end),quote,'Latency quote range differs from original');
  return{...range,bodySha256:original.bodySha256};
 };
 // Keep offsets from the actual brand/network subsection, including when an
 // identical published row appears elsewhere in the comparison or other table.
 fact.rows=fact.rows.map((row,i)=>({...row,sourceLocator:bindRange(row.quote,expected.rows[i].sourceLocator)}));
 fact.publicationSourceLocator=bindRange(fact.publicationQuote,expected.publicationSourceLocator);
 fact.methodologySourceLocator=bindRange(fact.methodology,expected.methodologySourceLocator);
}
function sameReference(a,b,collection){return a.id===b.id||collection==='latencyReports'&&a.metric==='https_elapsed_ms'&&a.sourceUrl===b.sourceUrl&&a.contentSignature===b.contentSignature;}
function validateImageTestRecordDate({root,primary,fact}){
 assert.equal(primary.ref.representation,'builtin_browser_metadata_json','Historical image date requires captured image metadata');
 assert(Array.isArray(primary.attachments)&&primary.attachments.length>0,'Historical image original attachment required');
 assert(fact.continuousOperationVerified===false&&fact.independentHistoricalArchiveVerified===false,'Image test date is not continuous operation or independently verified archive');
 assert(['foundedAt','establishedAt','yearsSinceStart','operatingYears','yearsActive'].every(k=>fact[k]===undefined),'No founding date or operating years from image test date');
 assert.equal(fact.dateEvidence?.kind,'manual_image_footer_date','Manual image footer date evidence required');
 assert.equal(fact.dateEvidence.value,fact.date,'Image date evidence and fact date must agree verbatim');
 assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(fact.date),'Complete CST image timestamp with explicit offset required');
 const bytes=fs.readFileSync(path.resolve(root,primary.ref.file));assert.equal(sha(bytes),primary.original.fileSha256,'Image metadata changed after original verification');
 const raw=JSON.parse(bytes),transcription=raw.visualTranscription;
 assert(transcription&&typeof transcription.testedAt==='string','Full manual image footer transcription required');
 let localISO,isoValue;
 const fullLocal=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
 if(fullLocal.test(transcription.testedAt)){
  assert.equal(transcription.timezoneLabel,'CST','Image footer timezone must be explicitly CST');
  if(transcription.timezone!==undefined)assert.equal(transcription.timezone,'CST_UTC_plus_08','Conflicting image footer timezone');
  localISO=transcription.testedAt.replace(' ','T');isoValue=localISO+'+08:00';
 }else{
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(transcription.testedAt),'Full manual image footer transcription required');
  assert.equal(transcription.timezone,'CST_UTC_plus_08','ISO image footer timezone must be explicitly CST UTC+08');
  if(transcription.timezoneLabel!==undefined)assert.equal(transcription.timezoneLabel,'CST','Conflicting image footer timezone');
  localISO=transcription.testedAt.slice(0,19);isoValue=transcription.testedAt;
 }
 const localSpace=localISO.replace('T',' '),calendar=new Date(localISO+'Z');
 assert(Number.isFinite(calendar.valueOf())&&calendar.toISOString().slice(0,19)===localISO,'Invalid image footer calendar timestamp');
 assert.equal(isoValue,fact.dateEvidence.value,'Image footer value must match transcription verbatim');
 if(!fullLocal.test(transcription.testedAt)||transcription.footerTimeQuote!==undefined){
  const footer=transcription.footerTimeQuote,stamps=typeof footer==='string'?[...footer.matchAll(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g)]:[];
  assert(typeof footer==='string'&&stamps.length===1&&stamps[0][0]===localSpace&&footer.includes(localSpace+' (CST)'),'Complete same-second CST footerTimeQuote required');
  literalLocator(primary.original.body,footer);
 }
 if(transcription.testedAtISO!==undefined)assert.equal(transcription.testedAtISO,fact.dateEvidence.value,'Conflicting image timestamp transcription');
 assert(Date.parse(fact.date)<=Date.parse(primary.original.observedAt),'Image test date cannot follow retained capture');
 const includesFullTimestamp=quote=>typeof quote==='string'&&(quote.includes(transcription.testedAt)||quote.includes(localSpace));
 assert(includesFullTimestamp(fact.quote),'History quote must include the manually transcribed full footer timestamp');
 if(fact.dateEvidence.quote!==undefined){assert(includesFullTimestamp(fact.dateEvidence.quote),'Image date quote must contain full footer timestamp');literalLocator(primary.original.body,fact.dateEvidence.quote);}
 if(raw.imageSha256!==undefined)assert(primary.attachments.some(a=>a.sha256===raw.imageSha256),'Image hash must bind the original attachment');
 if(fact.dateEvidence.imageUrl!==undefined)assert.equal(fact.dateEvidence.imageUrl,raw.imageUrl,'Image date evidence URL differs from captured metadata');
}
function prepareReferences({root,manifest}){
 assert(Array.isArray(manifest.entries)&&manifest.entries.length,'Reference entries required');
 return manifest.entries.map(e=>{assert(COLLECTIONS[e.collection],'Unsupported reference collection');assert(/^A\d{3}$/.test(e.siteId),'Site ID required');assert(e.fact?.id&&e.materials?.length,'Stable fact ID and materials required');
 const materials=e.materials.map(m=>{assert(m.key&&m.quotes?.length,'Source key and literal checks required');if(m.rebindSourceId)assert.equal(m.rebindSourceId,m.ref.sourceId,'Rebinding must name the verified original source');const original=loadOriginal(root,m.ref);for(const q of m.quotes)literalLocator(original.body,q);for(const a of m.attachments||[]){const file=fs.realpathSync(path.resolve(root,a.file)),base=fs.realpathSync(root)+path.sep;assert(file.toLowerCase().startsWith(base.toLowerCase()),'Attachment outside project');assert.equal(sha(fs.readFileSync(file)),a.sha256,'Attachment hash differs');}return{...m,original};});
 const primary=materials.find(m=>m.key===e.primaryKey);assert(primary,'Primary material missing');const fact=structuredClone(e.fact);assert(fact.literalChecked===true,'Literal checked qualification required');assert(fact.sourceIds===undefined,'Bind evidence during staging');let locator=literalLocator(primary.original.body,fact.quote);if(['undatedImageReports','publisherPerformanceSnapshots','reportedNodeRanges','videoReports','thirdPartyMonitorReports','speedTestReports','thirdPartyStatusReports'].includes(e.collection)&&fact.sourceLocator?.kind==='body_utf16_range'){require('./performance-evidence.cjs').verifyQuote(primary.original.body,fact);locator=structuredClone(fact.sourceLocator);}assert(e.sourceKeys?.length&&e.sourceKeys.every(k=>materials.some(m=>m.key===k)),'Unbound material key');
 const additionalValidated=require('./additional-performance-admission.cjs').validate({root,entry:{...e,materials},primary,fact});
 if(fact.dateEvidence?.kind==='manual_image_footer_date')assert(e.collection==='historyStatements'&&fact.kind==='third_party_test_record_date','Image footer test date cannot become a founding or other history claim');
 if(fact.dateEvidence?.kind==='operator_policy_date_label')assert(e.collection==='historyStatements'&&fact.kind==='operator_policy_date','Policy date evidence cannot become a founding or other history claim');
 if(fact.dateEvidence?.kind==='operator_operating_since_label')assert(e.collection==='historyStatements'&&fact.kind==='operator_operating_since_claim','Operating-since evidence cannot become a founding or other history claim');
 if(e.collection==='verifiedReports'){assert(fact.metric==='download_median'&&fact.statistic==='median'&&fact.valueMbps>0,'Only explicitly reported median accepted');assert(fact.independentMeasurement===false&&fact.sampleCount===null&&fact.identityQualification==='same_named_no_known_conflict','Historical qualifications required');assert(/中位|median/i.test(fact.quote)&&fact.quote.includes(String(fact.valueMbps))&&/Mbps/.test(fact.quote),'Median unit/value absent from literal');}
 if(e.collection==='regionalReports'){assert(fact.metric==='regional_download_mean'&&fact.statistic==='publisher_reported_regional_mean'&&fact.independentMeasurement===false&&fact.sampleCount===null,'Historical region mean qualifications required');assert(fact.regions?.length&&fact.network,'Regions and test network required');for(const r of fact.regions){assert(typeof r.name==='string'&&Number.isFinite(r.valueMbps)&&r.valueMbps>=0,'Invalid region mean');assert(r.quote?.includes(r.name)&&new RegExp('(?:^|[^\\d.])'+String(r.valueMbps).replace('.','\\.')+'\\s*Mbps').test(r.quote),'Exact reported Mbps value required');r.sourceLocator=literalLocator(primary.original.body,r.quote);}assert(/平均下载速度/.test(primary.original.body),'Reported arithmetic mean header absent');}
 if(['videoReports','thirdPartyMonitorReports','speedTestReports','thirdPartyStatusReports'].includes(e.collection))require('./qualified-reference-types.cjs').validate({root,entry:{...e,materials},primary,fact});
 if(e.collection==='historyStatements'&&fact.kind==='third_party_opening_claim'&&require('../collection/url-collectors/third-party-opening-parsers.cjs').forOrigin(primary.original.url,{recordId:e.siteId}))require('./qualified-reference-types.cjs').validate({root,entry:{...e,materials},primary,fact});
 if(e.collection==='latencyReports')validateLatencyReference({root,entry:e,primary,fact});
 if(e.collection==='operatorTestReports')validateOperatorTestReference({entry:e,primary,fact});
 if(e.collection==='historicalClaims'){assert(fact.kind==='identity_unresolved_third_party_year_claim'&&fact.status==='identity_unresolved'&&fact.identityVerified===false&&fact.currentOperatingServiceIdentityVerified===false&&fact.continuousOperationVerified===false,'Unresolved historical claim qualification required');assert(fact.datePrecision==='year'&&/^\d{4}$/.test(fact.date)&&fact.claimSubject&&fact.limitations?.length,'Explicit old/candidate subject, year precision and limitations required');assert(new RegExp('(?<!\\d)'+fact.date+'(?!\\d)').test(fact.quote),'Claim year absent from literal');assert(fact.yearsSinceStart===undefined&&fact.establishedAt===undefined,'No operating years or founding date from unresolved claim');}
 if(e.collection==='historyStatements'){assert(['archived_service_page','operator_opening_claim','operator_operating_since_claim','platform_message_date','operator_announcement_date','operator_policy_date','current_candidate_service_message_date','third_party_opening_claim','third_party_operating_since_claim','third_party_test_record_date','third_party_review_publication_date','operator_historical_test_statement_date'].includes(fact.kind),'Unknown history qualification');if(fact.kind==='third_party_test_record_date'&&!(additionalValidated&&['retained-performance-history-parsers','round21-history-parsers','round22-history-parsers','round23-history-parsers','round24-history-parsers','round25-history-parsers','round26-history-parsers'].some(name=>require('../collection/url-collectors/'+name+'.cjs').forOrigin(primary.original.url,{recordId:e.siteId}))))validateImageTestRecordDate({root,primary,fact});if(fact.kind==='third_party_review_publication_date')assert(additionalValidated&&require('../collection/url-collectors/round26-history-parsers.cjs').profiles.some(p=>p.recordId===e.siteId&&p.url===primary.original.url&&p.mode==='review_publication'),'Exact reviewed native publication-date contract required');if(fact.kind==='operator_historical_test_statement_date')assert(additionalValidated&&require('../collection/url-collectors/retained-performance-history-parsers.cjs').forOrigin(primary.original.url,{recordId:e.siteId}),'Operator historical test date requires exact retained source contract');if(fact.kind==='operator_policy_date')validateOperatorPolicyDate({primary,fact});if(fact.kind==='operator_operating_since_claim')validateOperatorOperatingSince({primary,fact});if(fact.dateEvidence?.kind==='literal_page_label'){const q=fact.dateEvidence.quote;assert(typeof q==='string'&&q.replaceAll('/','-').includes(fact.date.slice(0,10)),'Date evidence must be a date label, not a nearby URL');literalLocator(primary.original.body,q);}if(fact.dateEvidence?.kind==='archive_url_timestamp'){assert.equal(fact.dateEvidence.url,primary.original.url);const m=primary.original.url.match(/\/web\/(\d{4})(\d{2})(\d{2})\d*\//);assert(m&&[m[1],m[2],m[3]].join('-')===fact.date,'Archive date differs');}}
 if(e.collection==='linkedChannelReports')assert(additionalValidated&&fact.kind==='linked_official_channel_issue_claim'&&fact.relation==='direct_text_match'&&fact.countsAsVerifiedStability===false&&fact.currentHistoricalIdentityVerified===false&&fact.operatorIdentityVerified===false&&fact.measurementVerified===false&&fact.current===false,'Linked channel history requires exact unverified source contract');
 if(e.collection==='reviewedIssueSignals')assert(['problem_feedback','operator_outage_statement','operator_recovery_statement','operator_degradation_statement'].includes(fact.kind)&&fact.relation==='direct_text_match','Direct related issue qualification required');
 if(e.collection==='operatorStatusReports'){assert(fact.independentMeasurement===false&&fact.measurementVerified===false,'Operator dashboard is not independent measurement');assert(typeof fact.summary==='string'&&fact.windowDays>0,'Dashboard window qualification required');if(fact.claimedAvailabilityPercent!=null)assert(Number.isFinite(fact.claimedAvailabilityPercent)&&fact.claimedAvailabilityPercent>=0&&fact.claimedAvailabilityPercent<=100,'Invalid claimed availability');}
 if(e.collection==='operatorSlaClaims')assert(['operator_sla_claim','operator_performance_scope_statement'].includes(fact.kind)&&fact.measurementVerified===false&&typeof fact.summary==='string','SLA is a target or scope statement, not measured availability');
 // An undated table is dated only as a captured reference; testedAt stays null.
 const date=(['operatorMeasuredClaims','undatedImageReports','publisherPerformanceSnapshots','reportedNodeRanges'].includes(e.collection)?primary.original.observedAt:null)||fact.testedAt||fact.createdAt||fact.date||(e.collection==='thirdPartyStatusReports'?fact.events?.map(e=>e.date).sort().at(-1):null)||(e.collection==='thirdPartyMonitorReports'?fact.dataDate:null)||(e.collection==='latencyReports'?fact.publishedAt:null)||(['operatorSlaClaims','operatorStatusReports'].includes(e.collection)?primary.original.observedAt:null);assert(typeof date==='string'&&Number.isFinite(Date.parse(date))&&Date.parse(date)<=Date.now(),'Valid historical date required');
 return{...e,field:COLLECTIONS[e.collection],materials,fact:{...fact,sourceLocator:locator,bodySha256:primary.original.bodySha256,sourceUrl:primary.original.url,observedAt:primary.original.observedAt}};
 });
}
function stageReferences({root,store,manifest}){const prepared=prepareReferences({root,manifest}),groups=new Map(),skipped=[],pending=store.listProposals().filter(p=>p.status==='pending');
 for(const e of prepared){const site=store.getSite(e.siteId);assert(site,'Unknown site');if((site.document[e.field]?.[e.collection]||[]).some(f=>sameReference(f,e.fact,e.collection))||pending.some(p=>p.siteId===e.siteId&&(p.patch[e.field]?.[e.collection]||[]).some(f=>sameReference(f,e.fact,e.collection)))){skipped.push({siteId:e.siteId,factId:e.fact.id,reason:'already_recorded_or_pending_reference'});continue;}if(pending.some(p=>p.siteId===e.siteId)){skipped.push({siteId:e.siteId,factId:e.fact.id,reason:'site_has_pending_review_resolve_before_new_revision'});continue;}if(!groups.has(e.siteId))groups.set(e.siteId,{site,entries:[]});groups.get(e.siteId).entries.push(e);}
 const staged=[],failures=[];for(const[siteId,{site,entries}]of groups){try{const patch={},evidenceIds=new Set(),sourceChecks=[],quoteChecks=[],originals=[];
  for(const e of entries){const bindings=new Map();for(const m of e.materials){const o=m.original,ev=store.saveEvidence({siteId,url:o.url,body:o.body,observedAt:o.observedAt,kind:o.representation||'retained_public_reference'});bindings.set(m.key,ev.id);evidenceIds.add(ev.id);sourceChecks.push({evidenceId:ev.id,sha256:o.bodySha256,observedAt:o.observedAt});for(const quote of m.quotes)quoteChecks.push({evidenceId:ev.id,quote});originals.push({key:m.key,evidenceId:ev.id,ref:m.ref,attachments:m.attachments||[],rebindSourceId:m.rebindSourceId||null});}
   let value=patch[e.field]||structuredClone(site.document[e.field]||{});for(const m of e.materials.filter(m=>m.rebindSourceId)){const all=require('../scripts/export-current-inventory.cjs').allSourceIds(value);assert(all.includes(m.rebindSourceId),'Legacy source must already be referenced in this site field');value=rebind(value,m.rebindSourceId,bindings.get(m.key));}const fact={...e.fact,sourceIds:e.sourceKeys.map(k=>bindings.get(k))};value[e.collection]=[...(value[e.collection]||[]),fact];value.sourceIds=[...new Set([...(value.sourceIds||[]),...fact.sourceIds])];patch[e.field]=value;
  }
  const p=store.createProposal({siteId,patch,evidenceIds:[...evidenceIds],expectedRevision:site.revision});staged.push({siteId,proposalId:p.id,expectedRevision:site.revision,patchSha256:sha(JSON.stringify(patch)),fields:Object.keys(patch),facts:entries.map(e=>({collection:e.collection,id:e.fact.id})),sourceChecks,quoteChecks,originals});}catch(error){failures.push({siteId,reason:error.message,publicationPerformed:false});}
 }
 const existingPending=pending.filter(p=>prepared.some(e=>e.siteId===p.siteId&&(p.patch[e.field]?.[e.collection]||[]).some(f=>sameReference(f,e.fact,e.collection)))).map(p=>recoverReviewInput({store,prepared,proposal:p}));
 return{recordedAt:new Date().toISOString(),type:'source_bound_performance_reference_staging',automaticApproval:false,staged,existingPending,skipped,failures};
}
function rebind(value,oldId,newId){if(Array.isArray(value))return value.map(v=>rebind(v,oldId,newId));if(!value||typeof value!=='object')return value;const out={};for(const[k,v]of Object.entries(value)){if(/^(sourceIds|provenanceIds|continuitySourceIds|establishedSourceIds|evidenceIds)$/.test(k)&&Array.isArray(v))out[k]=v.map(id=>id===oldId?newId:id);else if(/^(sourceId|source_id|provenanceId|evidenceId|evidence_id)$/.test(k))out[k]=v===oldId?newId:v;else out[k]=rebind(v,oldId,newId);}return out;}
function recoverReviewInput({store,prepared,proposal:p}){
 const entries=prepared.filter(e=>e.siteId===p.siteId&&(p.patch[e.field]?.[e.collection]||[]).some(f=>sameReference(f,e.fact,e.collection)));
 const evidence=store.listEvidence().filter(ev=>ev.siteId===p.siteId),sourceChecks=[],quoteChecks=[],originals=[];
 for(const e of entries)for(const m of e.materials){
  const o=m.original,ev=evidence.find(ev=>ev.url===o.url&&ev.sha256===o.bodySha256);
  assert(ev&&ev.observations.some(ob=>ob.jobId===p.jobId&&ob.observedAt===o.observedAt),'Pending review original differs');
  sourceChecks.push({evidenceId:ev.id,sha256:o.bodySha256,observedAt:o.observedAt});
  quoteChecks.push(...m.quotes.map(quote=>({evidenceId:ev.id,quote})));
  originals.push({key:m.key,evidenceId:ev.id,ref:m.ref,attachments:m.attachments||[],rebindSourceId:m.rebindSourceId||null});
 }
 const facts=entries.map(e=>({collection:e.collection,id:p.patch[e.field][e.collection].find(f=>sameReference(f,e.fact,e.collection)).id}));
 return{siteId:p.siteId,proposalId:p.id,expectedRevision:p.expectedRevision,patchSha256:sha(JSON.stringify(p.patch)),fields:Object.keys(p.patch),facts,sourceChecks,quoteChecks,originals,recoveredPending:true};
}
module.exports={prepareReferences,stageReferences,recoverReviewInput};
