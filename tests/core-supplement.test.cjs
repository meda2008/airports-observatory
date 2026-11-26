'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {buildCoreSupplement}=require('../scripts/build-core-supplement.cjs');
const GENERATED='2026-10-28T00:00:00.000Z';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};

// Helper-generated bodies/records are SYNTHETIC; the explicitly named real
// regression below separately copies retained evidence into its temporary tree.
// The imported builder never writes a catalog artifact.
function fixture(t){
 const prefix=path.join(os.tmpdir(),'airports-core-supplement-test-');
 const root=fs.mkdtempSync(prefix);
 t.after(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(prefix)));fs.rmSync(root,{recursive:true,force:true});});
 write(path.join(root,'catalog/catalog.v1.json'),{catalog:[{id:'A001'},{id:'A002'}]});
 const directory=name=>path.join(root,'catalog/refresh/2026-10-26',name);
 function history(name,{id='H001',at='2026-10-01T00:00:00Z',recordIds=['A001'],extra={},sourceExtra={}}={}){
  const dir=directory(name),bodyPath='raw/'+id+'.txt',body=Buffer.from('SYNTHETIC history '+id);
  fs.mkdirSync(path.join(dir,'raw'),{recursive:true});fs.writeFileSync(path.join(dir,bodyPath),body);
  const source={sourceId:id,recordIds,url:'https://synthetic.test/history/'+id,httpStatus:200,capturedAtUtc:at,bodyPath,sha256:sha(body),...sourceExtra};
  const claim={recordIds,sourceIds:[id],basis:'SYNTHETIC retained historical document',earliestRetainedOperationalEvidenceAt:'2020-01-01',continuousOperationVerified:false,...extra};
  write(path.join(dir,'sources.json'),{sources:[source]});write(path.join(dir,'claims.json'),{schemaVersion:'airports-core-operating-history-claims.v1',claims:[claim]});
  return{dir,source,claim,bodyFile:path.join(dir,bodyPath)};
 }
 function auth(name,{id='CORE-AUTH-SYNTHETIC',at='2026-10-20T00:00:00Z',checkedAt=at,recordId='A001',groups={},sourceExtra={}}={}){
  const dir=directory(name),entry='raw/'+id+'.txt',body=Buffer.from('SYNTHETIC rendered observation '+id);
  fs.mkdirSync(path.join(dir,'raw'),{recursive:true});fs.writeFileSync(path.join(dir,entry),body);
  const source={source_id:id,source_type:'authenticated_rendered_dom',url:'https://synthetic.test/shop',last_capture_at:at,
   transactionVerified:false,capture_status:null,responseStatusObserved:false,sha256:sha(body),archiveRef:name+'-2026-10-26',originalContainers:[{archiveEntry:entry}],...sourceExtra};
  const record={recordId,checkedAt,sourceIds:[id],...groups};
  write(path.join(dir,'sources.json'),{sources:[source]});write(path.join(dir,'claims.json'),{schemaVersion:'airports-authenticated-business-observations.v1',records:[record]});
  return{dir,source,record,bodyFile:path.join(dir,entry)};
 }
 return{root,directory,history,auth,build:()=>buildCoreSupplement({baseDir:root,generatedAt:GENERATED})};
}

test('synthetic: same observed HTTPS site remains one dependency group across separately owned records without duplicating bodies',t=>{
 const f=fixture(t),group='same_observed_site:synthetic.test';f.history('core-history');
 for(const [batch,id,recordId] of [['core-auth-batch2','SITE-A','A001'],['core-auth-batch3','SITE-B','A002']]){
  const item=f.auth(batch,{id,recordId,sourceExtra:{dependency_group:group,independence_score:'I0'}});
  const body=Buffer.from(JSON.stringify({url:item.source.url,text:'SYNTHETIC scoped business DOM'}));
  fs.writeFileSync(item.bodyFile,body);item.source.sha256=sha(body);write(path.join(item.dir,'sources.json'),{sources:[item.source]});
 }
 const d=f.build(),shared=d.sources.filter(s=>s.source_id.startsWith('SITE-'));assert.equal(shared.length,2);assert.equal(new Set(shared.map(s=>s.dependency_group)).size,1);
 assert(shared.every(s=>s.dependency_group===group&&s.independence_score==='I0'&&s.independence_verified===false&&s.operatorIdentityVerified===false));
 assert.equal(shared[0].last_capture_at,'2026-10-20T00:00:00Z');assert.deepEqual(shared.map(s=>s.recordIds),[undefined,undefined]);
});

test('synthetic: identical retained paragraphs preserve a dependent group across different sites without merging record ownership',t=>{
 const f=fixture(t),excerpt='SYNTHETIC duplicated refund terms, retained for dependency verification only. '.repeat(2).trim(),group='same_retained_excerpt:'+sha(Buffer.from(excerpt));f.history('core-history');
 for(const [batch,id,recordId,url]of [['core-auth-batch2','EXCERPT-A','A001','https://first.test/faq'],['core-auth-batch3','EXCERPT-B','A002','https://second.test/faq']]){
  const item=f.auth(batch,{id,recordId,sourceExtra:{url,recordIds:[recordId],dependency_group:group,dependency_excerpt:excerpt,independence_score:'I0'}});
  const body=Buffer.from(JSON.stringify({url,text:excerpt}));fs.writeFileSync(item.bodyFile,body);item.source.sha256=sha(body);write(path.join(item.dir,'sources.json'),{sources:[item.source]});
 }
 const shared=f.build().sources.filter(s=>s.source_id.startsWith('EXCERPT-'));assert.equal(shared.length,2);assert(shared.every(s=>s.dependency_group===group&&s.independence_score==='I0'&&s.operatorIdentityVerified===false&&s.independence_verified===false));assert.deepEqual(shared.map(s=>s.recordIds),[['A001'],['A002']]);
});

test('synthetic: content dependency rejects absent excerpts, incorrect hashes, wrong raw origin and independence upgrades',t=>{
 const excerpt='SYNTHETIC substantial duplicated policy paragraph for this negative test only. '.repeat(2).trim();
 for(const options of [{missing:true,error:/absent from retained/},{hash:'0'.repeat(64),error:/hash mismatch/},{rawUrl:'https://other.test/faq',error:/raw origin mismatch/},{score:'I1',error:/cannot upgrade independence/},{verified:true,error:/cannot verify independence/},{operator:true,error:/cannot verify operator identity/},{excerpt:'too short',error:/Substantial exact/}]){
  const f=fixture(t);f.history('core-history');const text=options.excerpt||excerpt,item=f.auth('core-auth-batch2',{sourceExtra:{dependency_group:'same_retained_excerpt:'+(options.hash||sha(Buffer.from(text))),dependency_excerpt:text,independence_score:options.score||'I0',independence_verified:options.verified||false,operatorIdentityVerified:options.operator||false}});
  const body=Buffer.from(JSON.stringify({url:options.rawUrl||item.source.url,text:options.missing?'SYNTHETIC unrelated observation':text}));fs.writeFileSync(item.bodyFile,body);item.source.sha256=sha(body);write(path.join(item.dir,'sources.json'),{sources:[item.source]});assert.throws(f.build,options.error);
 }
});

test('synthetic: observed-site grouping rejects mismatched hosts, ports, raw origins and independence upgrades',t=>{
 for(const options of [
  {group:'same_observed_site:other.test',error:/match capture host and port/},
  {url:'https://synthetic.test:8443/shop',group:'same_observed_site:synthetic.test',error:/match capture host and port/},
  {rawUrl:'https://other.test/shop',error:/raw origin mismatch/},
  {score:'I1',error:/cannot upgrade independence/},
  {verified:true,error:/cannot verify independence/},
  {operator:true,error:/cannot verify operator identity/}
 ]){
  const f=fixture(t);f.history('core-history');const item=f.auth('core-auth-batch2',{sourceExtra:{url:options.url||'https://synthetic.test/shop',dependency_group:options.group||'same_observed_site:synthetic.test',independence_score:options.score||'I0',independence_verified:options.verified||false,operatorIdentityVerified:options.operator||false}});
  const body=Buffer.from(JSON.stringify({url:options.rawUrl||item.source.url,text:'SYNTHETIC scoped business DOM'}));fs.writeFileSync(item.bodyFile,body);item.source.sha256=sha(body);write(path.join(item.dir,'sources.json'),{sources:[item.source]});assert.throws(f.build,options.error);
 }
});

test('synthetic: four explicit batches merge each business group by observation/capture time and preserve omitted groups and source unions',t=>{
 const f=fixture(t);
 f.history('core-history');
 f.history('core-history-next',{id:'HN001',at:'2026-10-24T00:00:00Z',extra:{basis:'SYNTHETIC later historical evidence'}});
 f.auth('core-auth',{id:'CORE-AUTH-NEWER',at:'2026-10-26T00:00:00Z',groups:{
  pricing:{observedAt:'2026-10-26T00:00:00Z',plans:[{name:'SYNTHETIC plan',amount:20,billingPeriod:'month',sourceIds:['CORE-AUTH-NEWER']}]},
  refund:{summary:'SYNTHETIC retained refund conditions',sourceIds:['CORE-AUTH-NEWER']},
  privacy:{summary:'SYNTHETIC publisher access-metadata policy',loggedData:['SYNTHETIC source IP'],retentionPeriod:null,independentlyAudited:false,observedAt:'2026-10-26T00:00:00Z',sourceIds:['CORE-AUTH-NEWER']},
  compatibility:{summary:'SYNTHETIC publisher client requirements',requirements:['SYNTHETIC DNS configuration'],observedAt:'2026-10-26T00:00:00Z',sourceIds:['CORE-AUTH-NEWER'],independentlyTested:false},
  speed:{advertised:[{summary:'SYNTHETIC publisher statement',sourceIds:['CORE-AUTH-NEWER']}]}
 }});
 f.auth('core-auth-batch2',{id:'CORE-AUTH-OLDER',at:'2026-10-20T00:00:00Z',checkedAt:'2026-10-27T00:00:00Z',groups:{
  pricing:{plans:[{name:'SYNTHETIC old plan',amount:10,billingPeriod:'month',sourceIds:['CORE-AUTH-OLDER']}]},
  payment:{methods:['SYNTHETIC-PAY'],transactionVerified:false,sourceIds:['CORE-AUTH-OLDER']},operatingHistory:null,privacy:null,compatibility:null
 }});
 const result=f.build(),record=result.records[0];
 assert.equal(result.records.length,1);assert.equal(result.sources.length,4);assert.equal(result.generatedAt,GENERATED);
 assert.equal(record.pricing.plans[0].amount,20);assert.equal(record.payment.methods[0],'SYNTHETIC-PAY');
 assert.equal(record.refund.summary,'SYNTHETIC retained refund conditions');
 assert.equal(record.privacy.summary,'SYNTHETIC publisher access-metadata policy');
 assert.deepEqual(record.privacy.sourceIds,['CORE-AUTH-NEWER']);assert.equal(record.privacy.independentlyAudited,false);
 assert.deepEqual(record.compatibility.requirements,['SYNTHETIC DNS configuration']);assert.equal(record.compatibility.independentlyTested,false);
 assert.equal(record.operatingHistory.basis,'SYNTHETIC later historical evidence');
 assert.equal(record.operatingHistory.sourceIds[0],'CORE-HN001');
 assert.equal(record.checkedAt,'2026-10-27T00:00:00Z');
 assert.deepEqual(new Set(record.sourceIds),new Set(['CORE-H001','CORE-HN001','CORE-AUTH-NEWER','CORE-AUTH-OLDER']));
 assert.equal(record.operatingHistory.claimedFoundedAt,undefined);assert.equal(record.speed.measurements,undefined);assert.equal(record.stability,undefined);
 assert.equal(fs.existsSync(path.join(f.root,'catalog/core-supplement.v1.json')),false);
});

test('synthetic: checkedAt orders explicitly supplied groups without their own capture references and ignores unlisted batch names',t=>{
 const f=fixture(t);f.history('core-history');
 f.auth('core-auth',{id:'CORE-AUTH-LATE',checkedAt:'2026-10-27T00:00:00Z',groups:{trial:{summary:'SYNTHETIC newer trial notice'}}});
 f.auth('core-auth-batch2',{id:'CORE-AUTH-EARLY',checkedAt:'2026-10-22T00:00:00Z',groups:{trial:{summary:'SYNTHETIC older trial notice'}}});
 fs.mkdirSync(f.directory('core-auth-unlisted'),{recursive:true});
 assert.equal(f.build().records[0].trial.summary,'SYNTHETIC newer trial notice');
});

test('synthetic: normalized source IDs must remain unique across independent batches',t=>{
 const f=fixture(t);f.history('core-history');f.auth('core-auth',{id:'CORE-H001'});
 assert.throws(f.build,/Repeated core source CORE-H001/);
});

test('synthetic: each history and DOM body must stay inside its own batch and match retained SHA256',t=>{
 for(const kind of ['history','auth']){
  const f=fixture(t),original=f.history('core-history');
  const entry=kind==='history'?original:f.auth('core-auth');
  if(kind==='history')entry.source.bodyPath='../outside.txt';else entry.source.originalContainers[0].archiveEntry='../outside.txt';
  write(path.join(entry.dir,'sources.json'),{sources:[entry.source]});
  assert.throws(f.build,/Capture path escaped/);
 }
 for(const kind of ['history','auth']){
  const f=fixture(t),original=f.history('core-history');
  const entry=kind==='history'?original:f.auth('core-auth');
  fs.appendFileSync(entry.bodyFile,'SYNTHETIC tamper');
  assert.throws(f.build,/Retained body changed/);
 }
});

test('synthetic: a junction to another directory cannot bypass the retained-body batch boundary',t=>{
 const f=fixture(t),entry=f.history('core-history');
 const outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'body.txt'),'SYNTHETIC outside body');
 fs.symlinkSync(outside,path.join(entry.dir,'raw/escape'),'junction');
 entry.source.bodyPath='raw/escape/body.txt';entry.source.sha256=sha(Buffer.from('SYNTHETIC outside body'));
 write(path.join(entry.dir,'sources.json'),{sources:[entry.source]});
 assert.throws(f.build,/Capture real path escaped/);
});

test('synthetic: rendered DOM cannot assert an HTTP status, response observation or completed payment',t=>{
 for(const extra of [{capture_status:200},{httpStatus:200},{responseStatusObserved:true},{transactionVerified:true}]){
  const f=fixture(t);f.history('core-history');f.auth('core-auth',{sourceExtra:extra});
  assert.throws(f.build,/DOM capture does not establish HTTP status|cannot verify a payment/);
 }
 const f=fixture(t),entry=f.history('core-history');entry.source.sourceKind='SYNTHETIC rendered_dom';
 write(path.join(entry.dir,'sources.json'),{sources:[entry.source]});
 assert.throws(f.build,/DOM capture does not establish HTTP status/);
 entry.source.httpStatus=null;write(path.join(entry.dir,'sources.json'),{sources:[entry.source]});
 assert.equal(f.build().sources[0].capture_status,null);
});

test('synthetic: nested unknown references and sources bound to another catalog record fail closed',t=>{
 const missing=fixture(t);missing.history('core-history');
 missing.auth('core-auth',{groups:{payment:{observations:[{sourceIds:['SYNTHETIC-MISSING']}]}}});
 assert.throws(missing.build,/Unresolved core source SYNTHETIC-MISSING/);
 const cross=fixture(t);cross.history('core-history');
 cross.auth('core-auth',{sourceExtra:{recordIds:['A002']},groups:{payment:{sourceIds:['CORE-AUTH-SYNTHETIC']}}});
 assert.throws(cross.build,/Cross-record source binding/);
});

test('synthetic: recursive history source references normalize and explicit record bindings are preserved without name inference',t=>{
 const f=fixture(t);
 f.history('core-history',{recordIds:['A001','A002'],extra:{continuitySourceIds:['H001'],establishedAssessment:{sourceIds:['H001']}}});
 const result=f.build();assert.equal(result.records.length,2);
 for(const record of result.records){
  assert.deepEqual(record.operatingHistory.continuitySourceIds,['CORE-H001']);
  assert.deepEqual(record.operatingHistory.establishedAssessment.sourceIds,['CORE-H001']);
  assert.deepEqual(record.sourceIds,['CORE-H001']);
 }
});

function reuseFixture(t){
 const f=fixture(t);f.history('core-history');
 write(path.join(f.root,'catalog/catalog.v1.json'),{catalog:[{id:'A001',name:'Legacy label',officialUrl:'https://synthetic.test/'},{id:'A002',name:'Canonical label',officialUrl:'https://synthetic.test/'}]});
 const a=f.auth('core-auth',{id:'CORE-REUSED',sourceExtra:{recordIds:['A001'],dependency_group:'operator:synthetic.test'},groups:{pricing:{plans:[{name:'SYNTHETIC plan',amount:20,billingPeriod:'month',sourceIds:['CORE-REUSED']}]}}});
 const bytes=Buffer.from(JSON.stringify({url:'https://synthetic.test/shop',text:'SYNTHETIC Canonical label plan page'}));fs.writeFileSync(a.bodyFile,bytes);a.source.sha256=sha(bytes);write(path.join(a.dir,'sources.json'),{sources:[a.source]});
 const alias={recordId:'A002',checkedAt:a.source.last_capture_at,sourceReuse:{fromRecordId:'A001',candidateSiteUrl:'https://synthetic.test/',brandText:'Canonical label',brandSourceIds:['CORE-REUSED']},website:{url:'https://synthetic.test/',operatorIdentityVerified:false,sourceIds:['CORE-REUSED']},pricing:a.record.pricing};
 const dir=f.directory('core-auth-batch2');write(path.join(dir,'sources.json'),{sources:[]});
 const save=()=>write(path.join(dir,'claims.json'),{schemaVersion:'airports-authenticated-business-observations.v1',records:[alias]});save();
 return{...f,a,alias,save};
}

test('synthetic: explicit same-brand same-origin reuse preserves one snapshot, its hash, time and source group',t=>{
 const f=reuseFixture(t),result=f.build(),a=result.records.find(r=>r.recordId==='A001'),b=result.records.find(r=>r.recordId==='A002'),source=result.sources.find(s=>s.source_id==='CORE-REUSED');
 assert.deepEqual(a.pricing,b.pricing);assert.equal(b.checkedAt,f.a.source.last_capture_at);
 assert.equal(result.sources.filter(s=>s.source_id==='CORE-REUSED').length,1);assert.equal(source.sha256,f.a.source.sha256);assert.equal(source.last_capture_at,f.a.source.last_capture_at);
 assert.equal(source.dependency_group,'operator:synthetic.test');assert.equal(source.independence_score,'I0');assert.equal(source.independence_verified,false);assert.deepEqual(source.recordIds,['A001','A002']);
 assert.equal(b.sourceReuse.fromRecordId,'A001');assert.equal(b.operatingHistory,undefined);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.a.dir,'sources.json'),'utf8')).sources[0].recordIds,['A001']);
});

test('synthetic: reuse cannot bind another origin, a different brand or a nonmatching original body',t=>{
 for(const mode of ['catalog-origin','website-origin','source-origin','brand-name','raw-brand','raw-origin','owner']){
  const f=reuseFixture(t);
  if(mode==='catalog-origin')write(path.join(f.root,'catalog/catalog.v1.json'),{catalog:[{id:'A001',name:'Legacy label'},{id:'A002',name:'Canonical label',officialUrl:'https://other.test/'}]});
  if(mode==='website-origin')f.alias.website.url='https://other.test/';
  if(mode==='source-origin'){f.a.source.url='https://other.test/shop';write(path.join(f.a.dir,'sources.json'),{sources:[f.a.source]});}
  if(mode==='brand-name')f.alias.sourceReuse.brandText='Other brand';
  if(mode==='owner')f.alias.sourceReuse.fromRecordId='A002';
  if(mode.startsWith('raw-')){const bytes=Buffer.from(JSON.stringify({url:mode==='raw-origin'?'https://other.test/shop':'https://synthetic.test/shop',text:mode==='raw-brand'?'SYNTHETIC another brand':'SYNTHETIC Canonical label'}));fs.writeFileSync(f.a.bodyFile,bytes);f.a.source.sha256=sha(bytes);write(path.join(f.a.dir,'sources.json'),{sources:[f.a.source]});}
  f.save();assert.throws(f.build,/Source reuse/);
 }
});

test('synthetic: reuse cannot refresh dates, verify identity, transfer history or duplicate measurements',t=>{
 for(const mode of ['record-time','group-time','identity','history','outcome','measurement']){
  const f=reuseFixture(t);
  if(mode==='record-time')f.alias.checkedAt='2026-10-27T00:00:00Z';
  if(mode==='group-time')f.alias.pricing.observedAt='2026-10-27T00:00:00Z';
  if(mode==='identity')f.alias.website.operatorIdentityVerified=true;
  if(mode==='history')f.alias.operatingHistory={startYear:2020};
  if(mode==='outcome')f.alias.stability={recentIssues:[]};
  if(mode==='measurement')f.alias.speed={measurements:[{sampleCount:1}]};
  f.save();assert.throws(f.build,/Source reuse/);
 }
});

test('synthetic: ordinary cross-record claims remain rejected without explicit reuse admission',t=>{
 const f=reuseFixture(t);delete f.alias.sourceReuse;f.save();assert.throws(f.build,/Cross-record source binding/);
});

test('synthetic: a later borrowed-record claim cannot launder inherited ownership into a fresh observation',t=>{
 const f=reuseFixture(t),dir=f.directory('core-auth-batch3'),later=structuredClone(f.alias);delete later.sourceReuse;later.checkedAt='2026-10-27T00:00:00Z';
 write(path.join(dir,'sources.json'),{sources:[]});write(path.join(dir,'claims.json'),{schemaVersion:'airports-authenticated-business-observations.v1',records:[later]});
 assert.throws(f.build,/Source reuse declaration required/);
});

test('synthetic: an older structured DOM capture may establish its explicit visibleBrand without a text field',t=>{
 const f=reuseFixture(t),bytes=Buffer.from(JSON.stringify({url:'https://synthetic.test/shop',visibleBrand:'Canonical label',cards:[{name:'SYNTHETIC plan'}]}));
 fs.writeFileSync(f.a.bodyFile,bytes);f.a.source.sha256=sha(bytes);write(path.join(f.a.dir,'sources.json'),{sources:[f.a.source]});
 assert.equal(f.build().records.find(r=>r.recordId==='A002').pricing.plans[0].amount,20);
});

test('synthetic: incomplete newly-created batches fail explicitly and never write an output',t=>{
 const f=fixture(t);f.history('core-history');fs.mkdirSync(path.join(f.directory('core-history-next'),'raw'),{recursive:true});
 assert.throws(f.build,/Incomplete evidence batch core-history-next/);
 assert.equal(fs.existsSync(path.join(f.root,'catalog/core-supplement.v1.json')),false);
});

test('synthetic: explicitly typed retained search logs keep null URLs and remain E0/I0 process evidence',t=>{
 const f=fixture(t);
 f.history('core-history',{extra:{earliestRetainedOperationalEvidenceAt:null},sourceExtra:{sourceKind:'web_search_discovery_not_primary_evidence',url:null,httpStatus:null}});
 const result=f.build(),source=result.sources[0];
 assert.equal(source.source_type,'search_log');assert.equal(source.grade,'E0');assert.equal(source.independence_score,'I0');
 assert.equal(source.publicReplayStatus,'search_log_only_no_original_url');assert.equal(source.capture_status,null);
 for(const key of ['url','navigationUrl','originalRequestUrl','publicReplayUrl'])assert.equal(source[key],null);
 assert.equal(result.records[0].operatingHistory.earliestRetainedOperationalEvidenceAt,null);
 assert.deepEqual(result.records[0].sourceIds,['CORE-H001']);
});

test('synthetic: ordinary primary history sources cannot borrow the search-log exception for missing URLs',t=>{
 const f=fixture(t);f.history('core-history',{sourceExtra:{url:null,httpStatus:null}});
 assert.throws(f.build,/Primary history source URL required/);
});

test('synthetic: search logs alone cannot establish founding/history dates, continuous operation or other business facts',t=>{
 for(const fact of [{claimedFoundedAt:'2020-01-01'},{earliestRetainedOperationalEvidenceAt:'2020-01-01'},{startedAt:'2020-01-01'},{startYear:2020},{continuousOperationVerified:true}]){
  const f=fixture(t);
  f.history('core-history',{extra:{earliestRetainedOperationalEvidenceAt:null,...fact},sourceExtra:{sourceKind:'web_search_discovery_not_primary_evidence',url:null,httpStatus:null}});
  assert.throws(f.build,/Search logs cannot establish business facts/);
 }
 for(const group of ['privacy','compatibility']){
  const f=fixture(t);
  f.history('core-history',{extra:{earliestRetainedOperationalEvidenceAt:null},sourceExtra:{sourceKind:'web_search_discovery_not_primary_evidence',url:null,httpStatus:null}});
  f.auth('core-auth',{groups:{[group]:{summary:'SYNTHETIC unsupported publisher claim',observedAt:'2026-10-20T00:00:00Z',sourceIds:['CORE-H001']}}});
  assert.throws(f.build,/Search logs cannot establish business facts/);
 }
});

test('real: this-round EdNovas and Mesl bound primary/help/channel/DOM captures share one unaudited claimed-service group', historicalCaptureOptions('catalog/refresh/2026-10-26/core-history-next/sources.json', 'catalog/refresh/2026-10-26/core-history-next/claims.json', 'catalog/refresh/2026-10-26/core-auth-batch2/sources.json', 'catalog/refresh/2026-10-26/core-auth-batch2/claims.json'),t=>{
 const f=fixture(t),repository=path.resolve(__dirname,'..');f.history('core-history');
 const originalCatalog=JSON.parse(fs.readFileSync(path.join(repository,'catalog/catalog.v1.json'),'utf8'));
 write(path.join(f.root,'catalog/catalog.v1.json'),originalCatalog);
 const declared=[];
 for(const name of ['core-history-next','core-auth-batch2']){
  const from=path.join(repository,'catalog/refresh/2026-10-26',name),to=f.directory(name);
  const sources=JSON.parse(fs.readFileSync(path.join(from,'sources.json'),'utf8')).sources;
  for(const file of ['claims.json','sources.json']){fs.mkdirSync(to,{recursive:true});fs.copyFileSync(path.join(from,file),path.join(to,file));}
  for(const source of sources){
   const entry=source.bodyPath||source.originalContainers[0].archiveEntry;
   const original=path.resolve(from,entry),copy=path.resolve(to,entry);
   assert.ok(original.startsWith(from+path.sep)&&copy.startsWith(to+path.sep),'Real fixture body escaped its batch');
   fs.mkdirSync(path.dirname(copy),{recursive:true});fs.copyFileSync(original,copy);
   declared.push({id:source.source_id||'CORE-'+source.sourceId,recordIds:source.recordIds,searchLog:source.sourceKind==='web_search_discovery_not_primary_evidence'});
  }
 }
 const data=f.build(),sources=new Map(data.sources.map(source=>[source.source_id,source]));
 for(const [recordId,count] of [['A020',6],['A017',7]]){
  const bound=declared.filter(source=>!source.searchLog&&source.recordIds.includes(recordId));
  assert.equal(bound.length,count);
  for(const item of bound){
   const source=sources.get(item.id);
   assert.equal(source.dependency_group,'same_claimed_service:'+recordId);
   assert.equal(source.independence_verified,false);assert.equal(source.operatorIdentityVerified,false);
  }
 }
 for(const item of declared.filter(source=>source.searchLog)){
  const source=sources.get(item.id);assert.equal(source.independence_score,'I0');assert.equal(source.source_type,'search_log');
 }
 assert.equal(sources.get('CORE-H001').dependency_group,'operator-history:synthetic.test');
 assert.equal(sources.get('CORE-HN007').source_type,'operator_help');
 assert.equal(data.records.find(record=>record.recordId==='A017').privacy.sourceIds[0],'CORE-AUTH-MESL-B2-TERMS');
 assert.equal(fs.existsSync(path.join(f.root,'catalog/core-supplement.v1.json')),false);
});

test('synthetic: strict history/auth batch numbers sort numerically with all history first and latest group capture still wins',t=>{
 const f=fixture(t);
 f.history('core-history');f.history('core-history-next',{id:'HN001',at:'2026-10-02T00:00:00Z'});
 for(const[number,day]of[[10,23],[3,25],[2,24]])f.history('core-history-batch'+number,{id:'H'+number+'001',at:'2026-10-'+day+'T00:00:00Z',extra:{basis:'SYNTHETIC history batch '+number}});
 f.auth('core-auth',{id:'CORE-AUTH-BASE'});
 for(const[number,day]of[[10,23],[3,26],[2,24]])f.auth('core-auth-batch'+number,{id:'CORE-AUTH-B'+number,at:'2026-10-'+day+'T00:00:00Z',groups:{pricing:{plans:[{name:'SYNTHETIC plan '+number,amount:number,billingPeriod:'month',sourceIds:['CORE-AUTH-B'+number]}]}}});
 for(const name of ['core-auth-batch0','core-auth-batch1','core-auth-batch03','core-auth-batch3-extra','core-history-batch01','core-history-batch-3'])fs.mkdirSync(f.directory(name),{recursive:true});
 const data=f.build(),record=data.records[0];
 assert.deepEqual(data.sources.map(source=>source.source_id),['CORE-H001','CORE-HN001','CORE-H2001','CORE-H3001','CORE-H10001','CORE-AUTH-BASE','CORE-AUTH-B2','CORE-AUTH-B3','CORE-AUTH-B10']);
 assert.equal(record.pricing.plans[0].amount,3);assert.equal(record.operatingHistory.basis,'SYNTHETIC history batch 3');
 for(const id of ['CORE-H2001','CORE-H3001','CORE-H10001','CORE-AUTH-B2','CORE-AUTH-B3','CORE-AUTH-B10']){
  const source=data.sources.find(source=>source.source_id===id);
  assert.equal(source.dependency_group,'same_claimed_service:A001');assert.equal(source.independence_verified,false);
 }
 assert.equal(data.sources[0].dependency_group,'operator-history:synthetic.test');
 assert.equal(fs.existsSync(path.join(f.root,'catalog/core-supplement.v1.json')),false);
});

test('synthetic: newly discovered incomplete history/auth batches fail closed',t=>{
 for(const name of ['core-auth-batch3','core-history-batch3']){
  const f=fixture(t);f.history('core-history');fs.mkdirSync(path.join(f.directory(name),'raw'),{recursive:true});
  assert.throws(f.build,new RegExp('Incomplete evidence batch '+name));
 }
});

test('synthetic: a batch-directory junction cannot escape the named refresh root',t=>{
 for(const kind of ['auth','history']){
  const f=fixture(t);f.history('core-history');const name='core-'+kind+'-batch3';
  const entry=kind==='auth'?f.auth(name):f.history(name,{id:'H3001'});
  const outside=path.join(f.root,'outside-'+kind);
  assert.ok(entry.dir.startsWith(f.root+path.sep)&&outside.startsWith(f.root+path.sep));
  fs.renameSync(entry.dir,outside);fs.symlinkSync(outside,entry.dir,'junction');
  assert.throws(f.build,/Batch real path escaped refresh directory/);
  const moved=outside+'-moved';assert.ok(moved.startsWith(f.root+path.sep));fs.renameSync(outside,moved);
  assert.throws(f.build,/ENOENT/,'A dangling batch junction must fail rather than disappear from discovery');
 }
});

test('synthetic: third-party review sources keep publisher/network dependency groups and never become same-service primary evidence',t=>{
 const f=fixture(t);f.history('core-history');
 f.history('core-history-batch3',{id:'R3001',extra:{earliestRetainedOperationalEvidenceAt:null},sourceExtra:{sourceKind:'third_party_measurement_report',publisherDependencyGroup:'review-network:SYNTHETIC-publisher'}});
 f.auth('core-auth-batch3',{groups:{speed:{externalReports:[{publisher:'SYNTHETIC reviewer',summary:'SYNTHETIC report',observedAt:'2026-10-20T00:00:00Z',sourceIds:['CORE-R3001'],nodeCount:55}]}}});
 const data=f.build(),source=data.sources.find(source=>source.source_id==='CORE-R3001');
 assert.equal(source.source_type,'third_party_review');assert.equal(source.independence_score,'I0');assert.equal(source.independence_verified,false);
 assert.equal(source.dependency_group,'review-network:SYNTHETIC-publisher');
 assert.equal(data.records[0].speed.externalReports[0].nodeCount,55);
 assert.ok(data.records[0].sourceIds.includes('CORE-R3001'));
});

test('synthetic: search logs cannot support an external report even when a speed advertisement has primary support',t=>{
 const f=fixture(t);
 f.history('core-history',{extra:{earliestRetainedOperationalEvidenceAt:null},sourceExtra:{sourceKind:'web_search_discovery_not_primary_evidence',url:null,httpStatus:null}});
 f.auth('core-auth-batch3',{groups:{speed:{advertised:[{summary:'SYNTHETIC primary publisher advertisement',sourceIds:['CORE-AUTH-SYNTHETIC']}],
  externalReports:[{publisher:'SYNTHETIC reviewer',summary:'SYNTHETIC unsupported report',observedAt:'2026-10-20T00:00:00Z',sourceIds:['CORE-H001']}]}}});
 assert.throws(f.build,/Search logs cannot support external speed reports/);
});

test('synthetic: linked official terms retain observed HTTP evidence and claimed-service grouping without becoming operating-history material',t=>{
 const f=fixture(t);f.history('core-history');
 const entry=f.history('core-history-batch4',{id:'H4013',extra:{earliestRetainedOperationalEvidenceAt:null},sourceExtra:{sourceKind:'primary_site_linked_terms',url:'https://synthetic.test/terms'}});
 const data=f.build(),source=data.sources.find(source=>source.source_id==='CORE-H4013');
 assert.equal(source.source_type,'operator_terms_http_response');assert.equal(source.capture_status,200);
 assert.equal(source.grade,'E1');assert.equal(source.sha256,entry.source.sha256);assert.equal(source.url,entry.source.url);
 assert.equal(source.last_capture_at,entry.source.capturedAtUtc);assert.equal(source.publicReplayStatus,'response_observed');
 assert.equal(source.dependency_group,'same_claimed_service:A001');assert.equal(source.independence_verified,false);
 assert.equal(data.records[0].operatingHistory.earliestRetainedOperationalEvidenceAt,null);
});
