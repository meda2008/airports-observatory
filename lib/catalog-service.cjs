'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadCurrentEvidence}=require('./current-evidence.cjs');
const {makeCoreInfo}=require('./core-info.cjs');
const {createFileSnapshotReader}=require('./file-snapshot.cjs');
const DEFAULT_BASE_DIR=path.resolve(__dirname,'..');
const CATALOG_FILES={
 records:'catalog/catalog.v1.json',
 provenance:'catalog/source-provenance.json',
 supplement:'catalog/core-supplement.v1.json',
 currentEvidence:'catalog/current-evidence.v1.json',
 ledger:'catalog/forecast-ledger.v1.ndjson',
};
const CATEGORY_LABELS={airport:'机场',niche:'小众机场',vpn:'VPN',proxy:'商业代理',vps:'VPS',tool:'工具',unknown:'待分类'};
const FIELDS=['id','name','category','legacyCategory','classificationBasis','scope','sourceMembership','officialUrl','officialUrlStatus','identityStatus','observedAt','lastAttemptAt','evidenceGrade','futureUsabilityGrade','decisionStatus','decisionLabel','currentUsability','forecast','supportSignals','counterSignals','missingEvidence','globalMissingEvidence','flipConditions','domainObservations','pageObservations','community','legacyClaims','publicOffer','publicPayment','speedQuantiles','availability','personalApplicability','humanTraceStatus','fieldVerification','dataGaps','provenanceIds','aliases'];
class QueryError extends Error{constructor(m){super(m);this.status=400;}}
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
function safeUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.search='';u.hash='';if(/\/(?:auth|login|register|invite|ref|r|f)(?:\/|$)/i.test(u.pathname))u.pathname='/';return u.href;}catch{return null;}}
function freshness(record,now){
 const fields=[];
 const add=(field,at,ttlHours)=>{const t=timestamp(at),ageHours=t===null?null:Math.round(Math.max(0,(now-t)/3600000)*100)/100;fields.push({field,capturedAt:t===null?null:at,ttlHours,ageHours,state:ageHours===null?'unobserved':ageHours>ttlHours?'stale':'fresh'});};
 for(const d of record.domainObservations||[]){const latest=k=>(d.observations||[]).filter(o=>k.includes(o.kind)&&o.httpStatus===200&&timestamp(o.receivedAt)!==null).map(o=>o.receivedAt).sort((a,b)=>timestamp(b)-timestamp(a))[0]||null;add('domain:'+d.domain,latest(['rdap']),24);add('certificate:'+d.domain,latest(['crtsh','certspotter']),6);}
 add('publicPage',(record.pageObservations||[]).filter(p=>p.httpStatus===200&&p.sha256).map(p=>p.capturedAt).filter(Boolean).sort((a,b)=>timestamp(b)-timestamp(a))[0]||null,6);
 add('publicOffer',record.publicOffer?.observedAt,12);add('publicPaymentStatement',record.publicPayment?.observedAt,12);add('communitySnapshot',record.fieldVerification?.communitySnapshotCapturedAt,6);
 const seen=fields.filter(f=>f.state!=='unobserved'),t=timestamp(record.observedAt);
 return{state:!seen.length?'unobserved':seen.some(f=>f.state==='stale')?'stale':'fresh',observedAt:record.observedAt||null,ageHours:t===null?null:Math.round(Math.max(0,(now-t)/3600000)*100)/100,fields,expiredFields:fields.filter(f=>f.state==='stale').map(f=>f.field),unverifiedFields:['operatorIdentity','paidService','speed','stability','futureUsability'],limitation:'仅为材料时效，不代表服务可用性已验证。'};
}
function integer(v,fallback,min,max,name){if(v===undefined)return fallback;if(typeof v!=='string'||!/^\d+$/.test(v))throw new QueryError(name+'必须为整数');const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new QueryError(name+'超出范围');return n;}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function makeCatalogServiceProvider({baseDir=DEFAULT_BASE_DIR,clock}={}){
 const files=Object.values(CATALOG_FILES).map(file=>path.join(baseDir,file));
 return createFileSnapshotReader(files,()=>makeCatalogService({baseDir,clock}));
}
function makeCatalogService({baseDir=DEFAULT_BASE_DIR,clock=()=>Date.now(),readInput=(file,optional=false)=>{
 try{return fs.readFileSync(path.join(baseDir,file));}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}}={}){
 const bytes=readInput(CATALOG_FILES.records),data=JSON.parse(bytes);
 const provenanceBytes=readInput(CATALOG_FILES.provenance),provenance=JSON.parse(provenanceBytes);
 if(data.schemaVersion!=='airports-catalog.v1'||!Array.isArray(data.catalog))throw new Error('Unsupported catalog schema');
 const sources=new Map(provenance.sources.map(s=>[s.source_id,s])),ids=new Set();
 const coreBytes=readInput(CATALOG_FILES.supplement,true);const coreData=coreBytes?JSON.parse(coreBytes):{records:[],sources:[]};if(coreBytes&&coreData.schemaVersion!=='airports-core-supplement.v1')throw new Error('Unsupported core supplement');const coreRecords=new Map(coreData.records.map(r=>[r.recordId,r]));for(const source of coreData.sources){if(sources.has(source.source_id))throw new Error('Duplicate core source');sources.set(source.source_id,source);}for(const r of coreRecords.values())if(!data.catalog.some(x=>x.id===r.recordId)||(r.sourceIds||[]).some(id=>!sources.has(id)))throw new Error('Invalid core source reference');
 const current=loadCurrentEvidence(baseDir,new Set(data.catalog.map(r=>r.id)),readInput);if(current)for(const[id,source]of current.sources){if(sources.has(id))throw new Error('Duplicate appended source');sources.set(id,source);}
 const catalog=data.catalog.map(r=>{if(!r.id||ids.has(r.id)||!r.name||!CATEGORY_LABELS[r.category])throw new Error('Invalid catalog record');ids.add(r.id);if(r.forecast?.status==='abstain'&&(r.forecast.pointProbability!==null||r.forecast.probabilityInterval!==null))throw new Error('Abstention contains a probability');if(!Array.isArray(r.provenanceIds)||r.provenanceIds.some(i=>!sources.has(i)))throw new Error('Unresolved evidence reference: '+r.id);const item=Object.fromEntries(FIELDS.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]));item.officialUrl=safeUrl(r.officialUrl);return item;});
 const byId=new Map(catalog.map(r=>[r.id,r]));
 const ledgerBytes=readInput(CATALOG_FILES.ledger),ledger=ledgerBytes.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 let chainHead=null;for(const e of ledger){const{entry_sha256:hash,...payload}=e;if(e.prev_entry_sha256!==chainHead||crypto.createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')!==hash)throw new Error('Forecast ledger hash chain is invalid');chainHead=hash;}
 function decorate(r,brief=false){const extra={coreInfo:makeCoreInfo({...r,currentEvidence:current?.records.get(r.id)||null,coreSupplement:coreRecords.get(r.id)||null},{asOf:new Date(clock()).toISOString()}),currentEvidence:current?.records.get(r.id)||null,freshness:freshness(r,clock()),hasCommunityReports:(r.community?.originalPosts?.length||0)>0,identityConflict:(r.counterSignals||[]).some(v=>/Bing搜索|安妮office|Consulting|另一部手机|个人博客|ETON品牌/.test(v))};return brief?{...Object.fromEntries(['id','name','category','officialUrl','identityStatus','decisionStatus','decisionLabel','forecast','observedAt','evidenceGrade','futureUsabilityGrade','legacyClaims','dataGaps','missingEvidence'].map(k=>[k,r[k]])),...extra}:{...r,...extra};}
 function list(q={}){
  const offset=integer(q.offset,0,0,100000,'offset'),limit=integer(q.limit,24,1,100,'limit');
  for(const k of ['q','category','evidenceGrade','sort'])if(q[k]!==undefined&&typeof q[k]!=='string')throw new QueryError(k+'必须为单个字符串');
  if(q.q?.length>200)throw new QueryError('搜索词最长200字');if(q.category&&q.category!=='all'&&!CATEGORY_LABELS[q.category])throw new QueryError('未知类别');if(q.evidenceGrade&&!['all','E0','E1','E2','E3'].includes(q.evidenceGrade))throw new QueryError('未知证据等级');const sort=q.sort||'name';if(!['name','observedAt'].includes(sort))throw new QueryError('未知排序字段');
  const term=(q.q||'').normalize('NFKC').trim().toLocaleLowerCase();
  let rows=catalog.filter(r=>(!q.category||q.category==='all'||r.category===q.category)&&(!q.evidenceGrade||q.evidenceGrade==='all'||r.evidenceGrade===q.evidenceGrade));
  if(term)rows=rows.filter(r=>[r.id,r.name,r.officialUrl,...(r.domainObservations||[]).map(d=>d.domain),...(r.aliases||[]).map(a=>typeof a==='string'?a:a.name||a.relatedName||'')].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase().includes(term));
  rows=rows.toSorted((a,b)=>sort==='observedAt'?((timestamp(b.observedAt)??-Infinity)-(timestamp(a.observedAt)??-Infinity)||a.id.localeCompare(b.id)):a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));
  return{items:rows.slice(offset,offset+limit).map(r=>decorate(r,true)),total:catalog.length,filteredCount:rows.length,offset,limit,hasMore:offset+limit<rows.length,dataVersion:data.schemaVersion,evidenceAsOf:data.evidenceFrozenAt,servedAt:new Date(clock()).toISOString()};
 }
 const stats=()=>({totalCatalog:catalog.length,totalAirports:catalog.length,discoveryCount:data.discoveryCandidates?.length||0,numericPredictions:catalog.filter(r=>r.forecast?.status!=='abstain'&&Number.isFinite(r.forecast?.pointProbability)).length,insufficientEvidence:catalog.filter(r=>r.decisionStatus==='insufficient_evidence').length,recordsWithDomainEvents:catalog.filter(r=>r.domainObservations?.some(d=>d.registrationStatus==='parsed')).length,recordsWithCT:catalog.filter(r=>r.domainObservations?.some(d=>d.certificateRowsReturned!==null)).length,publicOfferCaptures:catalog.filter(r=>r.publicOffer?.snapshotFound).length,publicPaymentStatements:catalog.filter(r=>r.publicPayment?.statementSnapshotFound).length,totalVerified:0,evidenceAsOf:data.evidenceFrozenAt,lastUpdated:data.evidenceFrozenAt,servedAt:new Date(clock()).toISOString(),dataVersion:data.schemaVersion,catalogSha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceCount:sources.size,researchAsOf:current?.document.researchAsOf||null,currentEvidenceSha256:current?.sha256||null,currentEvidenceSummary:current?.document.summary||null,coreSupplementSha256:coreBytes?crypto.createHash('sha256').update(coreBytes).digest('hex'):null,ledgerEntries:ledger.length,ledgerChainHead:chainHead,categories:Object.entries(CATEGORY_LABELS).map(([id,label])=>({id,label,count:catalog.filter(r=>r.category===id).length})),limitations:data.limitations});
 return{baseDir,dataVersion:data.schemaVersion,evidenceAsOf:data.evidenceFrozenAt,catalogSha256:crypto.createHash('sha256').update(bytes).digest('hex'),provenanceSha256:crypto.createHash('sha256').update(provenanceBytes).digest('hex'),ledgerSha256:crypto.createHash('sha256').update(ledgerBytes).digest('hex'),currentEvidenceSha256:current?.sha256||null,coreSupplementSha256:coreBytes?crypto.createHash('sha256').update(coreBytes).digest('hex'):null,list,stats,get:id=>byId.has(id)?decorate(byId.get(id)):null,evidence:id=>byId.has(id)?{recordId:id,sources:[...new Set([...byId.get(id).provenanceIds,...(current?.records.get(id)?.sourceIds||[]),...(coreRecords.get(id)?.sourceIds||[])])].map(k=>sources.get(k)),archiveDownloadUrl:'/api/evidence/archive',limitation:'原始请求和字节请在证据归档按容器路径及hash复算。'}:null,discovery:()=>({items:data.discoveryCandidates||[],total:data.discoveryCandidates?.length||0,scope:'discovery_only_not_admitted'}),ledger:recordId=>({items:ledger.filter(e=>!recordId||e.record_id===recordId),chainHead,chainVerified:true,scoringStatus:'no_scorable_numeric_predictions',brier:null}),rawExport:()=>({schemaVersion:data.schemaVersion,evidenceAsOf:data.evidenceFrozenAt,catalog:catalog.map(r=>decorate(r)),discoveryCandidates:data.discoveryCandidates||[],limitations:data.limitations})};
}
module.exports={makeCatalogService,makeCatalogServiceProvider,freshness,safeUrl,QueryError,CATEGORY_LABELS};
