'use strict';
// Append a separate present-day evidence layer; never rewrite original forecasts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {validateCurrentEvidence}=require('../lib/current-evidence.cjs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
function projectCommunityEvent(event){
 return {id:event.id,url:event.url,sourceId:event.sourceId,createdAt:iso(event.createdAt),editedAt:iso(event.editedAt),
   kind:event.kind,complaintClue:event.complaintClue===true,recoveryOrPartialUseClue:event.recoveryOrPartialUseClue===true,
   matchType:event.matchType,sourceGroup:event.sourceGroup,summary:event.summary,relation:event.relation,rawLocator:event.rawLocator};
}

// Importing the projection for tests must never rebuild the retained artifact.
if(require.main===module){
const batchId=process.argv[2]||process.env.EVIDENCE_BATCH_ID||'2026-10-26';
const root=path.resolve(__dirname,'..'),batch=path.join(root,'catalog/refresh',batchId);
const collection=read(path.join(batch,'batch-pages/collection.json'));
const community=read(path.join(batch,'community/community.json'));
const definitions=read(path.join(root,'catalog/catalog.v1.json')).catalog;
const sources=new Map(),sourcePaths=[];
function addSource(source,directory){
 const id=source.sourceId||source.id;
 assert.ok(id&&!sources.has(id),'Repeated source '+id);
 const sha=source.sha256||source.bodySha256||null;
 let relative=source.snapshotRelativePath||source.rawPath||source.bodyPath||source.snapshotPath||null;
 let file=null;
 if(relative){file=relative.startsWith('catalog/')?path.join(root,relative):path.join(directory,relative);assert.ok(fs.existsSync(file),'Missing retained source '+file);assert.equal(hash(fs.readFileSync(file)),sha,'Retained body hash changed '+id);}
 else assert.equal(sha,null,'Body hash without retained bytes '+id);
 const url=source.url||source.requestedUrl;
 const at=iso(source.capturedAt||source.receivedAt||source.completedAt);
 assert.ok(url&&at,'Source URL/time missing '+id);
 const entry=file?path.relative(batch,file).split(path.sep).join('/'):null;
 assert.ok(!entry||(!entry.startsWith('../')&&!path.isAbsolute(entry)),'Archive locator escaped batch');
 const status=source.status??source.httpStatus??null;
 const derived=url.startsWith('https://r.jina.ai/');
 const metadata={source_id:id,source_type:derived?'derived_reader':source.sourceType||'public_refresh_page',
   url,navigationUrl:url,originalRequestUrl:url,publicReplayUrl:url,publicReplayStatus:'response_observed',
   last_capture_at:at,requested_at:iso(source.requestedAt),capture_status:typeof status==='number'?status:null,
   sha256:sha,container_sha256:null,archiveRef:`public-refresh-${batchId}.zip`,
   originalContainers:entry?[{archiveEntry:entry}]:[],
   grade:status===200&&!derived&&source.contentStatus!=='challenge_or_access_control'?'E1':'E0',
   independence_score:derived||source.independenceScore==='I0'?'I0':'I1',
   dependency_group:source.dependencyGroup||(derived?'jina-derived':new URL(url).hostname),
   label:'本轮公开采集；内容与经营主体、支付执行须分别核验'};
 sources.set(id,metadata);if(file)sourcePaths.push(entry);
}
collection.sources.forEach(source=>addSource(source,root));
for(const folder of ['manual-offers','manual-secondary','community']){
 const doc=read(path.join(batch,folder,'sources.json'));
 for(const source of Array.isArray(doc)?doc:doc.sources||doc.items)addSource(source,path.join(batch,folder));
}
const reviewed=new Map();
for(const file of ['batch-reviewed-claims.json','manual-offers/claims.json','manual-secondary/claims.json']){
 const doc=read(path.join(batch,file));
 for(const claim of doc.items){for(const id of claim.recordIds){assert.ok(!reviewed.has(id),'Multiple current reviews for '+id);reviewed.set(id,claim);}}
}
const rawCommunity=new Map(community.items.map(item=>[item.recordId,item]));
const rawCollection=new Map(collection.items.map(item=>[item.recordId,item]));
function collectIds(value,set=new Set()){
 if(Array.isArray(value)){value.forEach(v=>collectIds(v,set));return set;}
 if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){if(k==='sourceIds'&&Array.isArray(v))v.forEach(id=>set.add(id));else if(k==='sourceId'&&v)set.add(v);else collectIds(v,set);}
 return set;
}
const items=definitions.map(record=>{
 const captured=rawCollection.get(record.id),claim=reviewed.get(record.id),discussion=rawCommunity.get(record.id);
 assert.ok(captured&&discussion,'Missing record coverage');
 const plans=(claim?.plans||[]).map(plan=>({
   name:plan.name,amount:plan.amount,currency:plan.currency&&!plan.currency.startsWith('未明示')?plan.currency:null,
   currencySymbol:plan.currencySymbol||plan.currency?.match(/[¥￥]/)?.[0]||null,
   currencyReason:plan.currencyReason||(!plan.currency||plan.currency.startsWith('未明示')?'只见金额符号，ISO币种未明确；未自行补成CNY。':null),
   currencyStatus:plan.currency&&!plan.currency.startsWith('未明示')?'as_stated':'not_confirmed',billingPeriod:plan.billingPeriod,
   quota:plan.quota||null,terms:plan.terms||null,sourceIds:plan.sourceIds,
   quote:plan.quote||null,locator:plan.locator||'套餐标题与相邻价格/配额文本',priceStatus:'advertised_not_checkout_verified',
   observedAt:iso(plan.observedAt||claim.observedAt)||plan.sourceIds.map(id=>sources.get(id).last_capture_at).sort().at(-1),
   materialType:plan.materialType||plan.sourceKind||claim.offerStatus||'public_page',
   displayBasis:plan.displayBasis||'retained_public_page',quotaReset:plan.quotaReset||null,
   restrictions:plan.restrictions||[],maxDevices:plan.maxDevices??null,addon:plan.addon??null,
   discount:plan.discount||null,additionalCharges:plan.additionalCharges||null,
   checkoutVerified:false
 }));
 const payment=claim?.payment||{};
 const methods=Array.isArray(payment.methods)?payment.methods:[];
 const current={recordId:record.id,batchId:`${batchId}-public-refresh`,checkedAt:iso(discussion.checkedAt),
   collection:{status:captured.collectionStatus,checkedAt:iso(captured.checkedAt),sourceIds:captured.sourceIds,scope:collection.scope},
   identityBinding:claim?.identityBinding||{status:'unverified_candidate_domain',basis:'本轮只访问名录候选网址，未确认经营主体。',sourceIds:captured.sourceIds},
   offers:{status:plans.length?'public_advertisement_observed':claim?.offerStatus||'not_confirmed',plans,
     observedAt:plans.map(p=>p.observedAt).filter(Boolean).sort().at(-1)||null,checkoutVerified:false,
     observations:claim?.observations||[],promotions:claim?.promotions||[],
     limitation:'公开标价或公开落地页配置不等于可下单价格；币种、周期和限制以逐项原文为限。'},
   payment:{status:methods.length?'public_statement_observed':'not_confirmed',statementType:payment.status||'not_confirmed',methods,sourceIds:payment.sourceIds||[],
     observedAt:iso(payment.observedAt||claim?.observedAt)||(payment.sourceIds||[]).map(id=>sources.get(id).last_capture_at).sort().at(-1)||null,quote:payment.quote||null,processorClaim:payment.processorClaim||null,
     reason:payment.reason||'本次未取得可绑定该经营主体的明确公开支付渠道说明。',transactionVerified:false},
   community:{windowStart:community.windowStart,windowEnd:community.windowEnd,checkedAt:iso(discussion.checkedAt),
     sourceIds:discussion.sourceIds,coverage:discussion.coverage,
     matchedStatementCount:discussion.matchedStatementCount,matchedThreadGroups:discussion.matchedThreadGroups,
     unverifiedComplaintClueGroups:discussion.unverifiedComplaintClueGroups,recoveryOrPartialUseClueGroups:discussion.recoveryOrPartialUseClueGroups,
     activityCreatedDistribution:discussion.activityCreatedDistribution,complaintClueCreatedDistribution:discussion.complaintClueCreatedDistribution,
     recoveryClueCreatedDistribution:discussion.recoveryClueCreatedDistribution,
     events:discussion.events.map(projectCommunityEvent),
     claimsIndependentlyVerified:false,zeroMatchesMeansZeroComplaints:false,complaintRate:null,
     limitation:'仅为已采集GitHub仓库与V2EX有限页面内的未核实陈述；上下文关联、转载和回复不当作独立投诉人数。'},
   missing:claim?.missing||['当前可绑定经营主体的完整套餐、币种与付款总额待补','明确支付说明及实际支付可用性待补'],
   refund:claim?.refund||null
 };
 current.sourceIds=[...collectIds(current)];
 current.checkedAt=[captured.checkedAt,discussion.checkedAt,claim?.observedAt,...current.sourceIds.map(id=>sources.get(id)?.last_capture_at)].map(iso).filter(Boolean).sort().at(-1);
 return current;
});
const document={schemaVersion:'airports-current-evidence.v1',batchId:`${batchId}-public-refresh`,
 researchAsOf:[...sources.values()].map(s=>s.last_capture_at).sort().at(-1),
 windowStart:community.windowStart,windowEnd:community.windowEnd,
 summary:{recordsAttempted:items.length,airportRecordsAttempted:definitions.filter(r=>['airport','niche'].includes(r.category)).length,
   retainedSources:sources.size,responseBodiesRetained:[...sources.values()].filter(s=>s.sha256).length,recordsWithPublicPlans:items.filter(i=>i.offers.plans.length).length,
   advertisedPlanRows:items.reduce((n,i)=>n+i.offers.plans.length,0),distinctPlanObservations:new Set(items.flatMap(i=>i.offers.plans.map(p=>JSON.stringify([p.name,p.amount,p.currency,p.billingPeriod,p.sourceIds])))).size,recordsWithPaymentStatements:items.filter(i=>i.payment.methods.length).length,
   recordsWithComplaintClues:items.filter(i=>i.community.unverifiedComplaintClueGroups>0).length,
   recordsWithAnyCommunityStatements:items.filter(i=>i.community.matchedStatementCount>0).length,
   checkoutVerified:0,paymentTransactionsVerified:0,independentlyAdjudicatedComplaints:0},
 coverage:community.coverage,communityCollectionSummary:community.summary,
 sources:[...sources.values()],items,
 limitations:['候选网址与公开品牌自称尚非独立经营主体确认。','公开标价和支付说明不等于当前可下单总额或实际收款。','原始公开响应本地留存；公开站只发布结构化事实、限定短摘与来源元数据。','没有新增数值概率或改写原245条预测。']};
validateCurrentEvidence(document,new Set(definitions.map(r=>r.id)));
const file=path.join(root,'catalog/current-evidence.v1.json');
const bytes=Buffer.from(JSON.stringify(document,null,2)+'\n');fs.writeFileSync(file,bytes);
console.log(JSON.stringify({status:'PASS_STRUCTURED_EVIDENCE_NOT_BUSINESS_VERIFIED',...document.summary,sha256:hash(bytes),researchAsOf:document.researchAsOf}));
}

module.exports={projectCommunityEvent};
