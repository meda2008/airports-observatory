'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const BATCHES=[
 {name:'core-history',kind:'history',required:true},
 {name:'core-history-next',kind:'history'},
 {name:'core-auth',kind:'auth'}
];
const GROUPS=['website','pricing','pricingReports','payment','speed','stability','operatingHistory','refund','trial','privacy','compatibility','promotions'];
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const latest=values=>values.filter(validTime).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)||null;
const sourceArrayKey=key=>key==='sourceIds'||key.endsWith('SourceIds');
const within=(base,file)=>{const rel=path.relative(base,file);return rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
const FACT_FIELDS={
 operatingHistory:['claimedFoundedAt','earliestRetainedOperationalEvidenceAt','earliestEvidenceAt','startedAt','startDate','startYear','claimText','selfReportedDuration','continuousOperationVerified','independentHistoricalArchiveVerified','establishedAssessment'],
 pricingReports:['reports'],website:['url','operatorIdentityVerified'],pricing:['plans','promotions'],payment:['methods','processorClaim','quote','transactionVerified'],
 speed:['measurements','advertised','historicalClaims','externalReports','reports'],stability:['measurements','recentIssues','recoveryClues','operatorReports','identityReviews'],
 refund:['summary','conditions'],trial:['summary','conditions'],privacy:['summary','loggedData','retentionPeriod','independentlyAudited'],
 compatibility:['summary','requirements','independentlyTested']
};
const hasFact=(group,value)=>group==='promotions'?value.length>0:(FACT_FIELDS[group]||[]).some(key=>{
 const field=value[key];return field!==null&&field!==undefined&&field!==false&&field!==''&&(!Array.isArray(field)||field.length>0);
});

function mapReferences(value,mapper){
 if(Array.isArray(value))return value.map(child=>mapReferences(child,mapper));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,child])=>{
  if(sourceArrayKey(key)){assert.ok(Array.isArray(child),'Source reference list required');return[key,child.map(id=>mapper(id))];}
  if(key==='sourceId'&&child!=null)return[key,mapper(child)];
  return[key,mapReferences(child,mapper)];
 }));
}
function references(value){const ids=new Set();mapReferences(value,id=>{assert.ok(typeof id==='string'&&id,'Source ID required');ids.add(id);return id;});return[...ids];}
function discoverBatches(directory){
 const extra=fs.readdirSync(directory).flatMap(name=>{
  const match=/^core-(history|auth)-batch([1-9]\d*)$/.exec(name);
  return match&&BigInt(match[2])>=2n?[{name,kind:match[1],order:BigInt(match[2])}]:[];
 }).sort((a,b)=>a.order<b.order?-1:a.order>b.order?1:0);
 return[...BATCHES.filter(batch=>batch.kind==='history'),...extra.filter(batch=>batch.kind==='history'),
  ...BATCHES.filter(batch=>batch.kind==='auth'),...extra.filter(batch=>batch.kind==='auth')];
}
function validateLinkedPolicyArchive(directory,entries,primary){
 if(entries.length===1)return;
 assert(entries.length>1,'One primary DOM capture required');const body=JSON.parse(primary.toString('utf8'));
 assert.equal(body.representation,'derived_redacted_visible_DOM_with_retained_original');assert(body.bindingChain?.length,'Native policy binding chain required');
 const expected=[body.originalSha256,...body.bindingChain.map(p=>p.sha256)];assert(expected.every(h=>/^[a-f0-9]{64}$/.test(h)),'Policy proof digest missing');
 const unique=[...new Set(expected)];assert.equal(entries.length,unique.length+1,'Only declared original and binding proofs may accompany primary DOM');
 const files=new Map();for(const entry of entries.slice(1)){const match=/^raw\/([a-f0-9]{64})\.json$/.exec(entry.archiveEntry);assert(match&&unique.includes(match[1]),'Undeclared policy archive part');assert(!files.has(match[1]),'Duplicate policy archive part');files.set(match[1],JSON.parse(retainedBody(directory,entry.archiveEntry,match[1]).toString('utf8')));}
 const original=files.get(body.originalSha256);assert.equal(original.url,body.url);assert.equal(original.capturedAt,body.capturedAt);assert.equal(original.document.text,body.text,'Derived policy text changed');assert.equal(original.document.inputValuesRead,false);
 const chain=body.bindingChain.map(p=>files.get(p.sha256));for(let i=0;i<chain.length;i++){const parent=chain[i],next=chain[i+1]||original;assert.equal(parent.document.inputValuesRead,false);assert(parent.document.links.some(l=>new URL(l.url).href===new URL(next.requestedUrl||next.url).href),'Native policy link missing');assert.equal(new URL(next.url).origin,new URL(next.requestedUrl||next.url).origin,'Unobserved cross-origin redirect');}
}
function retainedBody(directory,relative,expectedHash){
 assert.ok(typeof relative==='string'&&relative&&!path.isAbsolute(relative),'Relative retained body path required');
 const file=path.resolve(directory,relative);
 assert.ok(within(directory,file),'Capture path escaped evidence directory');
 assert.ok(within(fs.realpathSync(directory),fs.realpathSync(file)),'Capture real path escaped evidence directory');
 assert.match(expectedHash||'',/^[a-f0-9]{64}$/,'Retained body SHA256 required');
 const bytes=fs.readFileSync(file);
 assert.equal(sha(bytes),expectedHash,'Retained body changed '+relative);
 return bytes;
}

// Reads retained batches and returns a document; only the CLI below writes it.
function buildCoreSupplement({baseDir=path.resolve(__dirname,'..'),generatedAt=new Date().toISOString()}={}){
 assert.ok(validTime(generatedAt),'Generation time missing');
 const catalogRecords=new Map(read(path.join(baseDir,'catalog/catalog.v1.json')).catalog.map(record=>[record.id,record]));
 const catalogIds=new Set(catalogRecords.keys());
 const refreshDirectory=path.resolve(baseDir,'catalog/refresh/2026-10-26');
 assert.ok(fs.existsSync(refreshDirectory),'Required evidence refresh directory missing');
 const realRefresh=fs.realpathSync(refreshDirectory);
 assert.ok(within(fs.realpathSync(baseDir),realRefresh),'Refresh real path escaped project directory');
 const sources=[],byId=new Map(),sourceBatch=new Map(),owners=new Map(),originalOwners=new Map(),domBodies=new Map(),reuseGroups=new Map(),observedSiteGroups=new Map(),excerptGroups=new Map(),snapshots=[];
 for(const batch of discoverBatches(refreshDirectory)){
  const directory=path.join(refreshDirectory,batch.name);
  if(!fs.lstatSync(directory,{throwIfNoEntry:false})){assert.ok(!batch.required,'Required evidence batch missing '+batch.name);continue;}
  assert.ok(fs.statSync(directory).isDirectory(),'Evidence batch directory required '+batch.name);
  assert.ok(within(realRefresh,fs.realpathSync(directory)),'Batch real path escaped refresh directory '+batch.name);
  assert.ok(fs.existsSync(path.join(directory,'claims.json'))&&fs.existsSync(path.join(directory,'sources.json')),'Incomplete evidence batch '+batch.name);
  const claims=read(path.join(directory,'claims.json')),rawSources=read(path.join(directory,'sources.json')).sources;
  assert.ok(Array.isArray(rawSources),'Batch source list required');
  const historyId=id=>{assert.ok(typeof id==='string'&&id,'History source ID required');return id.startsWith('CORE-')?id:'CORE-'+id;};
  for(const item of rawSources){
   let source;
   if(batch.kind==='history'){
    const id=historyId(item.sourceId);retainedBody(directory,item.bodyPath,item.sha256);
    assert.ok(validTime(item.capturedAtUtc),'Capture time missing '+id);
    if(/dom|rendered/i.test([item.sourceKind,item.source_type,item.sourceType].filter(Boolean).join(' '))||item.responseStatusObserved===false)
     assert.equal(item.httpStatus,null,'DOM capture does not establish HTTP status');
    assert.ok(item.httpStatus===null||Number.isInteger(item.httpStatus)&&item.httpStatus>=100&&item.httpStatus<=599,'Invalid observed HTTP status');
    const searchLog=item.sourceKind==='web_search_discovery_not_primary_evidence';
    const thirdPartyReport=item.sourceKind==='third_party_measurement_report';
    if(searchLog){assert.equal(item.url,null,'Search log has no original URL');assert.equal(item.httpStatus,null,'Search log does not establish HTTP status');}
    else assert.ok(typeof item.url==='string'&&item.url,'Primary history source URL required');
    const hostname=searchLog?null:new URL(item.url).hostname;
    const publisherGroup=thirdPartyReport?(typeof item.publisherDependencyGroup==='string'&&item.publisherDependencyGroup.trim()?item.publisherDependencyGroup.trim():'third-party-review:'+hostname):null;
    assert.ok(!publisherGroup?.startsWith('same_claimed_service:'),'Third-party report cannot use a first-party dependency group');
    source={source_id:id,source_type:searchLog?'search_log':thirdPartyReport?'third_party_review':item.sourceKind==='primary_site_linked_terms'?'operator_terms_http_response':item.sourceKind==='primary_site_linked_help'?'operator_help':'operating_history',url:item.url,navigationUrl:searchLog?null:item.finalUrl||item.url,
     originalRequestUrl:item.url,publicReplayUrl:item.url,publicReplayStatus:searchLog?'search_log_only_no_original_url':item.httpStatus===null?'response_status_not_observed':'response_observed',last_capture_at:item.capturedAtUtc,
     capture_status:item.httpStatus,sha256:item.sha256,container_sha256:null,grade:!searchLog&&item.httpStatus===200?'E1':'E0',
     independence_score:searchLog||thirdPartyReport?'I0':'I1',...(thirdPartyReport?{independence_verified:false}:{}),dependency_group:searchLog?'discovery-search-log:'+batch.name:publisherGroup||'operator-history:'+hostname,
     archiveRef:batch.name+'-2026-10-26',originalContainers:[{archiveEntry:item.bodyPath}]};
   }else{
    assert.ok(item.source_id,'Authenticated source ID required');assert.ok(validTime(item.last_capture_at),'Capture time missing');
    assert.equal(item.transactionVerified,false,'Reading a page cannot verify a payment');
    assert.equal(item.capture_status,null,'DOM capture does not establish HTTP status');
    assert.ok(item.httpStatus===undefined||item.httpStatus===null,'DOM capture does not establish HTTP status');
    assert.equal(item.responseStatusObserved,false,'DOM capture does not establish HTTP status');
    const entries=item.originalContainers||[];assert(entries.length,'One exact primary DOM capture required');
    const body=retainedBody(directory,entries[0].archiveEntry,item.sha256);validateLinkedPolicyArchive(directory,entries,body);source={...item};
    domBodies.set(source.source_id,body);
   }
   if(source.dependency_group?.startsWith('same_observed_site:')){
    assert.ok(['authenticated_rendered_dom','public_rendered_dom'].includes(source.source_type),'Observed site grouping requires retained rendered DOM');
    const site=new URL(source.url);
    assert.equal(site.protocol,'https:','Observed site grouping requires HTTPS');
    assert.equal(source.dependency_group,'same_observed_site:'+site.host,'Observed site group must match capture host and port');
    assert.equal(source.independence_score,'I0','Observed site grouping cannot upgrade independence');
    assert.notEqual(source.independence_verified,true,'Observed site grouping cannot verify independence');
    assert.notEqual(source.operatorIdentityVerified,true,'Observed site grouping cannot verify operator identity');
    let body;try{body=JSON.parse(domBodies.get(source.source_id).toString('utf8'));}catch{assert.fail('Observed site grouping requires a structured retained DOM');}
    assert.equal(new URL(body.url).origin,site.origin,'Observed site grouping raw origin mismatch');
    observedSiteGroups.set(source.source_id,source.dependency_group);
   }
   if(source.dependency_group?.startsWith('same_retained_excerpt:')){
    assert.ok(['authenticated_rendered_dom','public_rendered_dom'].includes(source.source_type),'Excerpt grouping requires retained rendered DOM');
    const excerpt=source.dependency_excerpt,site=new URL(source.url);
    assert.equal(site.protocol,'https:','Excerpt grouping requires HTTPS');
    assert.ok(typeof excerpt==='string'&&excerpt.length>=80&&excerpt.length<=2000&&excerpt===excerpt.trim()&&!/[\r\n]/.test(excerpt),'Substantial exact single-paragraph excerpt required');
    assert.equal(source.dependency_group,'same_retained_excerpt:'+sha(Buffer.from(excerpt)),'Excerpt dependency hash mismatch');
    assert.equal(source.independence_score,'I0','Excerpt grouping cannot upgrade independence');
    assert.notEqual(source.independence_verified,true,'Excerpt grouping cannot verify independence');
    assert.notEqual(source.operatorIdentityVerified,true,'Excerpt grouping cannot verify operator identity');
    let body;try{body=JSON.parse(domBodies.get(source.source_id).toString('utf8'));}catch{assert.fail('Excerpt grouping requires structured retained DOM');}
    assert.equal(new URL(body.url).origin,site.origin,'Excerpt grouping raw origin mismatch');
    // The group is evidence of duplicated content, not shared ownership. Each
    // member must contain the exact paragraph in its already retained body.
    assert.ok(typeof body.text==='string'&&body.text.includes(excerpt),'Dependency excerpt absent from retained DOM');
    excerptGroups.set(source.source_id,source.dependency_group);
   }
   assert.ok(!byId.has(source.source_id),'Repeated core source '+source.source_id);
   const boundIds=item.recordIds||[];assert.ok(Array.isArray(boundIds)&&boundIds.every(id=>catalogIds.has(id)),'Unknown source record binding');
   sources.push(source);byId.set(source.source_id,source);sourceBatch.set(source.source_id,batch.name);owners.set(source.source_id,new Set(boundIds));originalOwners.set(source.source_id,new Set(boundIds));
  }
  if(batch.kind==='history'){
   assert.equal(claims.schemaVersion,'airports-core-operating-history-claims.v1');assert.ok(Array.isArray(claims.claims));
   for(const claim of claims.claims){
    assert.ok(Array.isArray(claim.recordIds)&&claim.recordIds.length,'History record bindings required');
    const projected=mapReferences(claim,historyId),ids=references(projected);
    assert.ok(ids.length&&ids.every(id=>byId.has(id)),'Unresolved history source');
    const observedAt=latest(ids.map(id=>byId.get(id).last_capture_at));
    for(const recordId of claim.recordIds)snapshots.push({batch:batch.name,bindingIds:claim.recordIds,record:{recordId,checkedAt:observedAt,operatingHistory:{...projected,observedAt},sourceIds:ids}});
   }
  }else{
   assert.equal(claims.schemaVersion,'airports-authenticated-business-observations.v1');assert.ok(Array.isArray(claims.records));
   for(const record of claims.records)snapshots.push({batch:batch.name,bindingIds:[record.recordId],record:mapReferences(record,id=>id)});
  }
 }
 const recordMap=new Map(),groupTimes=new Map();
 // Explicit reuse binds a same-name, same-origin candidate to existing captures.
 // It does not merge the old brand or create a fresh/independent observation.
 const validateReuse=(item,ids)=>{
  const reuse=item.sourceReuse;
  if(reuse===undefined)return null;
  assert.ok(reuse&&typeof reuse==='object'&&!Array.isArray(reuse),'Structured source reuse required');
  assert.ok(catalogIds.has(reuse.fromRecordId)&&reuse.fromRecordId!==item.recordId,'Source reuse owner required');
  const candidate=new URL(reuse.candidateSiteUrl),target=catalogRecords.get(item.recordId);
  assert.ok(candidate.protocol==='https:'&&candidate.href===candidate.origin+'/','Source reuse requires an HTTPS origin');
  assert.equal(target.name,reuse.brandText,'Source reuse canonical brand mismatch');
  assert.equal(new URL(target.officialUrl).origin,candidate.origin,'Source reuse catalog origin mismatch');
  assert.equal(new URL(item.website?.url).origin,candidate.origin,'Source reuse website origin mismatch');
  assert.equal(item.website?.operatorIdentityVerified,false,'Source reuse cannot verify the operator');
  assert.ok(!Object.hasOwn(item,'operatingHistory')&&!Object.hasOwn(item,'stability'),'Source reuse cannot establish history or outcomes');
  assert.ok(!item.speed?.measurements?.length,'Source reuse cannot duplicate measurements');
  assert.ok(ids.length&&Array.isArray(reuse.brandSourceIds)&&reuse.brandSourceIds.length,'Source reuse brand evidence required');
  for(const id of ids){
   const source=byId.get(id);
   assert.ok(source&&originalOwners.get(id)?.has(reuse.fromRecordId),'Source reuse must retain its original owner');
   assert.equal(new URL(source.url).origin,candidate.origin,'Source reuse evidence origin mismatch');
   assert.ok(typeof source.dependency_group==='string'&&source.dependency_group,'Source reuse dependency group required');
  }
  const captureAt=latest(ids.map(id=>byId.get(id).last_capture_at));
  assert.equal(item.checkedAt,captureAt,'Source reuse cannot refresh observation time');
  const checkTimes=value=>{if(!value||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){if(['observedAt','checkedAt','testedAt','windowEnd'].includes(key)&&validTime(child))assert.ok(Date.parse(child)<=Date.parse(captureAt),'Source reuse cannot refresh observation time');else checkTimes(child);}};
  for(const group of GROUPS)checkTimes(item[group]);
  for(const id of reuse.brandSourceIds){
   assert.ok(ids.includes(id)&&domBodies.has(id),'Source reuse needs a retained DOM brand capture');
   let body;try{body=JSON.parse(domBodies.get(id).toString('utf8'));}catch{assert.fail('Source reuse brand capture must retain structured DOM text');}
   assert.equal(new URL(body.url).origin,candidate.origin,'Source reuse raw origin mismatch');
   assert.ok((typeof body.text==='string'&&body.text.includes(reuse.brandText))||body.visibleBrand===reuse.brandText,'Source reuse retained brand mismatch');
  }
  return reuse;
 };
 const groupTime=(value,fallback)=>{
  const times=[];
  const walk=child=>{if(!child||typeof child!=='object')return;if(Array.isArray(child)){child.forEach(walk);return;}for(const[key,nested]of Object.entries(child)){if(['observedAt','checkedAt','testedAt','windowEnd'].includes(key))times.push(nested);else walk(nested);}};
  walk(value);times.push(...references(value).map(id=>byId.get(id).last_capture_at));return latest(times)||fallback;
 };
 for(const snapshot of snapshots){
  const item=snapshot.record;assert.ok(catalogIds.has(item.recordId),'Unknown core record '+item.recordId);assert.ok(validTime(item.checkedAt),'Record check time missing');
  const ids=references(item);
  for(const id of ids)assert.ok(byId.has(id),'Unresolved core source '+id);
  const reuse=validateReuse(item,ids);
  for(const id of ids){
   const bound=owners.get(id);
   assert.ok(!reuseGroups.has(id)||originalOwners.get(id).has(item.recordId)||reuse,'Source reuse declaration required for inherited ownership');
   assert.ok((bound.size?snapshot.bindingIds.some(recordId=>bound.has(recordId)):sourceBatch.get(id)===snapshot.batch)||Boolean(reuse&&originalOwners.get(id).has(reuse.fromRecordId)),'Cross-record source binding '+id);
   if(reuse)reuseGroups.set(id,byId.get(id).dependency_group);
   snapshot.bindingIds.forEach(recordId=>bound.add(recordId));
  }
  const previous=recordMap.get(item.recordId)||{recordId:item.recordId,sourceIds:[]};
  previous.checkedAt=latest([previous.checkedAt,item.checkedAt,...ids.map(id=>byId.get(id).last_capture_at)]);
  previous.sourceIds=[...new Set([...previous.sourceIds,...ids])];
  if(reuse)previous.sourceReuse={...reuse};
  const times=groupTimes.get(item.recordId)||new Map();
  for(const group of GROUPS){
   if(!Object.hasOwn(item,group)||item[group]==null)continue;
   assert.ok(typeof item[group]==='object','Business group must be structured '+group);
   const groupIds=references(item[group]),support=groupIds.length?groupIds:ids;
   assert.ok(!support.length||!support.every(id=>byId.get(id).source_type==='search_log')||!hasFact(group,item[group]),'Search logs cannot establish business facts '+group);
   if(group==='speed')for(const report of [...(Array.isArray(item[group].externalReports)?item[group].externalReports:[]),...(Array.isArray(item[group].reports)?item[group].reports:[])]){
    const reportIds=references(report);
    assert.ok(reportIds.length&&reportIds.some(id=>byId.get(id).source_type!=='search_log'),'Search logs cannot support external speed reports');
   }
   const at=groupTime(item[group],item.checkedAt);
   if(!times.has(group)||Date.parse(at)>=Date.parse(times.get(group))){previous[group]=item[group];times.set(group,at);}
  }
  groupTimes.set(item.recordId,times);recordMap.set(item.recordId,previous);
 }
 for(const source of sources){
  if(reuseGroups.has(source.source_id)){
   source.recordIds=[...owners.get(source.source_id)].sort();
   source.dependency_group=reuseGroups.get(source.source_id);
   source.independence_score='I0';source.independence_verified=false;source.operatorIdentityVerified=false;
   continue;
  }
  if(observedSiteGroups.has(source.source_id)||excerptGroups.has(source.source_id)){
   source.dependency_group=excerptGroups.get(source.source_id)||observedSiteGroups.get(source.source_id);
   source.independence_score='I0';source.independence_verified=false;source.operatorIdentityVerified=false;
   continue;
  }
  if(['core-history','core-auth'].includes(sourceBatch.get(source.source_id)))continue;
  source.independence_verified=false;
  if(source.source_type==='search_log'||source.source_type==='third_party_review')continue;
  const boundIds=[...owners.get(source.source_id)].sort();
  if(!boundIds.length)continue;
  source.dependency_group='same_claimed_service:'+boundIds.join(',');
  source.operatorIdentityVerified=false;
  if(boundIds.length>1)source.independence_score='I0';
 }
 return{schemaVersion:'airports-core-supplement.v1',generatedAt,sources,records:[...recordMap.values()],
  limitations:['运营起点、最早留存资料和连续经营分别记录，不以域龄替代。','登录后资料仅证明当时页面显示，不证明可收款、到账或服务可用。','没有探针数据时不填实际速度和稳定性。']};
}

if(require.main===module){
 const data=buildCoreSupplement();
 fs.writeFileSync(path.join(__dirname,'../catalog/core-supplement.v1.json'),JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify({status:'PASS_RETAINED_CORE_OBSERVATIONS',records:data.records.length,sources:data.sources.length,authenticatedPriceRecords:data.records.filter(r=>r.pricing?.plans?.length).length,qualifiedFoundedDates:data.records.filter(r=>r.operatingHistory?.claimedFoundedAt).length}));
}
module.exports={buildCoreSupplement,validateLinkedPolicyArchive};

