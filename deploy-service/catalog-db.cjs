'use strict';
// A transactional relational publication of retained, reviewed material.
// Collection state remains in store.cjs; no browser or network is used here.
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs');
const {safeUrl,QueryError}=require('../lib/catalog-service.cjs');
const {outbound}=require('../lib/needs-search.cjs');
const {displayNameFor,presentationFor,preferredRows}=require('../lib/catalog-presentation.cjs');
const {customerSummary,representativePlan}=require('../lib/customer-summary.cjs');
const {publicUrl}=require('./public-url.cjs');
const {allSourceIds}=require('../scripts/export-current-inventory.cjs');
const json=JSON.stringify,parse=JSON.parse,hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const RETAINED_INPUTS=['catalog/catalog.v1.json','catalog/source-provenance.json','catalog/core-supplement.v1.json','catalog/current-evidence.v1.json','catalog/forecast-ledger.v1.ndjson','collection/catalog-curation.json','public-site/data/public-catalog.json'];
const FIELDS=['pricing','payment','refund','privacy','compatibility','trial','promotions','speed','stability','operatingHistory','referral'];
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
// Rendering clocks and rolling window boundaries are not new observations.
// Keep their original documents, but do not publish revisions on wall-clock drift.
function contentIdentity(v,parent=''){if(Array.isArray(v))return v.map(x=>contentIdentity(x,parent));if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.entries(v).filter(([k])=>!['asOf','ageHours','ageDays','elapsedSinceEarliestEvidence','generatedAt','servedAt'].includes(k)&&!(parent==='recentWindow'&&['start','end'].includes(k))).map(([k,c])=>[k,contentIdentity(c,k)]));}
function latest(value){const times=[];function walk(v){if(!v||typeof v!=='object')return;for(const[k,c]of Object.entries(v)){if(['observedAt','capturedAt','observed_at'].includes(k)&&typeof c==='string'&&Number.isFinite(Date.parse(c)))times.push(c);else if(c&&typeof c==='object')walk(c);}}walk(value);return times.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;}
function sourceMeta(s){return{id:s.source_id||s.id,url:s.url||s.source_url||s.sourceUrl||null,title:s.title||s.source_name||null,observedAt:s.last_capture_at||s.captured_at||s.capturedAt||s.observedAt||s.observed_at||latest(s.observations)||null,publishedAt:s.published_at||s.publishedAt||s.pageUpdatedAt||null,kind:s.source_type||s.kind||null,sha256:s.sha256||s.retainedBodySha256||null,resolved:!s.unresolved};}
function referencedSourceIds(record){
 return new Set([...(record.sourceIds||[]),...allSourceIds(record.coreInfo),...Object.values(record.fields||{}).flatMap(f=>f.sourceIds||[])]);
}
function referencedStoreEvidence(record){
 const ids=referencedSourceIds(record),dates=new Set(),approvedJobs=new Map();
 function times(v){if(!v||typeof v!=='object')return;for(const[k,c]of Object.entries(v)){if(['observedAt','capturedAt','observed_at','captured_at'].includes(k)&&typeof c==='string'&&Number.isFinite(Date.parse(c)))dates.add(c);else if(c&&typeof c==='object')times(c);}}times(record.coreInfo);times(record.fields);
 for(const p of record.storeSnapshot?.proposals||[]){if(p.status!=='approved')continue;let evidenceIds=p.evidenceIds||p.evidence_ids||[];if(typeof evidenceIds==='string')try{evidenceIds=parse(evidenceIds);}catch{evidenceIds=[];}const job=p.jobId||p.job_id;if(job)for(const id of evidenceIds){if(!approvedJobs.has(id))approvedJobs.set(id,new Set());approvedJobs.get(id).add(job);}}
 return(record.storeSnapshot?.evidence||[]).filter(s=>ids.has(s.id)).map(s=>{const observations=[...new Set((s.observations||[]).filter(o=>dates.has(o.observedAt||o.observed_at)||approvedJobs.get(s.id)?.has(o.jobId||o.job_id)).map(o=>o.observedAt||o.observed_at))].sort().map(observedAt=>({observedAt}));const value={id:s.id,site_id:s.site_id||s.siteId||record.id,url:s.url,sha256:s.sha256,kind:s.kind,observations};for(const key of ['observedAt','observed_at','capturedAt','captured_at','last_capture_at'])if(dates.has(s[key]))value[key]=s[key];return value;});
}
function openCatalogDb({filename,store,root=path.resolve(__dirname,'..'),clock=()=>Date.now()}={}){
 const db=new DatabaseSync(filename);try{db.exec('PRAGMA busy_timeout=30000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL');
 db.exec(`CREATE TABLE IF NOT EXISTS catalog_imports(id TEXT PRIMARY KEY,content_sha256 TEXT NOT NULL UNIQUE,imported_at TEXT NOT NULL,source_as_of TEXT,manifest_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalog_records(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,is_primary INTEGER NOT NULL,website_url TEXT,snapshot_id TEXT NOT NULL REFERENCES catalog_imports(id),core_json TEXT NOT NULL,metadata_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalog_record_versions(snapshot_id TEXT NOT NULL REFERENCES catalog_imports(id),record_id TEXT NOT NULL,document_json TEXT NOT NULL,PRIMARY KEY(snapshot_id,record_id));
 CREATE TABLE IF NOT EXISTS catalog_sources(id TEXT PRIMARY KEY,url TEXT,title TEXT,observed_at TEXT,published_at TEXT,kind TEXT,sha256 TEXT,resolved INTEGER NOT NULL,metadata_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalog_record_sources(record_id TEXT NOT NULL REFERENCES catalog_records(id) ON DELETE CASCADE,source_id TEXT NOT NULL REFERENCES catalog_sources(id),PRIMARY KEY(record_id,source_id));
 CREATE TABLE IF NOT EXISTS catalog_field_states(record_id TEXT NOT NULL REFERENCES catalog_records(id) ON DELETE CASCADE,field TEXT NOT NULL,status TEXT NOT NULL,material_available INTEGER NOT NULL,observed_at TEXT,state_json TEXT NOT NULL,data_json TEXT,PRIMARY KEY(record_id,field));
 CREATE TABLE IF NOT EXISTS catalog_field_sources(record_id TEXT NOT NULL,field TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES catalog_sources(id),PRIMARY KEY(record_id,field,source_id),FOREIGN KEY(record_id,field) REFERENCES catalog_field_states(record_id,field) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS catalog_plans(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES catalog_records(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,name TEXT,amount REAL,currency TEXT,currency_symbol TEXT,billing_period TEXT,quota TEXT,observed_at TEXT,raw_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalog_payment_methods(record_id TEXT NOT NULL REFERENCES catalog_records(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,method TEXT NOT NULL,status TEXT NOT NULL,observed_at TEXT,PRIMARY KEY(record_id,ordinal));
 CREATE TABLE IF NOT EXISTS catalog_policies(record_id TEXT NOT NULL REFERENCES catalog_records(id) ON DELETE CASCADE,field TEXT NOT NULL,status TEXT NOT NULL,summary TEXT,observed_at TEXT,raw_json TEXT NOT NULL,PRIMARY KEY(record_id,field));
 CREATE TABLE IF NOT EXISTS catalog_order_cleanup(record_id TEXT PRIMARY KEY REFERENCES catalog_records(id) ON DELETE CASCADE,status TEXT,cancellation_verified INTEGER,checked_at TEXT,raw_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalog_referral_links(record_id TEXT PRIMARY KEY REFERENCES catalog_records(id) ON DELETE CASCADE,link_json TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS catalog_publication(singleton INTEGER PRIMARY KEY CHECK(singleton=1),snapshot_id TEXT NOT NULL REFERENCES catalog_imports(id));
 CREATE TABLE IF NOT EXISTS catalog_sync_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),snapshot_id TEXT NOT NULL,source_hash TEXT,state_key TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS catalog_scope ON catalog_records(is_primary,name);
 CREATE INDEX IF NOT EXISTS catalog_plan_currency ON catalog_plans(currency,amount);
 CREATE INDEX IF NOT EXISTS catalog_method ON catalog_payment_methods(method);
 CREATE INDEX IF NOT EXISTS catalog_missing ON catalog_field_states(field,material_available);`);
 }catch(error){try{db.close();}catch{}throw error;}
 function meta(){return db.prepare('SELECT i.*,s.snapshot_id AS applied_snapshot_id,s.source_hash,s.state_key FROM catalog_publication p JOIN catalog_imports i ON i.id=p.snapshot_id LEFT JOIN catalog_sync_state s ON s.singleton=p.singleton WHERE p.singleton=1').get();}
 function importRecords({records,summary={},syncState}){
  const existing=syncState?syncState.prior:meta();
  if(Array.isArray(records))records=require('./catalog-curation.cjs').activeRecords(records,root,syncState?.curation);
  if(!Array.isArray(records)||!records.length||new Set(records.map(r=>r.id)).size!==records.length)throw Error('Nonempty unique catalog required');
  for(const r of records)if(!r.id||!r.name||!r.coreInfo||typeof r.primary!=='boolean'||!r.fields)throw Error('Invalid reviewed record');
  const docs=records.map(r=>({id:r.id,name:r.name,category:r.category,primary:r.primary,listing:r.listing||{},coreInfo:r.coreInfo,fields:r.fields,catalogRecord:r.catalogRecord||{},sourceIds:r.sourceIds||[],unresolvedSourceIds:r.unresolvedSourceIds||[],sourceEvidence:r.sourceEvidence||[],reviewedOverlay:r.reviewedOverlay||{},importedReferral:r.importedReferral||null}));
  const admittedEvidence=new Map(records.map(r=>[r.id,referencedStoreEvidence(r)])),storeEvidence=[...admittedEvidence.values()].flat();
  const digest=hash(json(canonical(contentIdentity({projectionVersion:4,docs,storeEvidence})))),id='catalog-'+digest.slice(0,24);
  if(!syncState&&existing?.content_sha256===digest)return{status:'unchanged',...publicationFrom(existing)};
  const importedAt=new Date(clock()).toISOString(),sourceAsOf=latest(records.map(r=>r.coreInfo));
  // JSON, source traversal and SQL preparation happen before the writer lock.
  const writes=[],statements=new Map(),insert=(sql,...values)=>writes.push([sql,values]);
   insert('INSERT OR IGNORE INTO catalog_imports VALUES(?,?,?,?,?)',id,digest,importedAt,sourceAsOf,json({schema:'relational-catalog.v1',records:records.length,primary:records.filter(r=>r.primary).length,definitions:summary.definitions||{},input:summary.input||{},note:'Material retained does not establish service quality, current availability or an executed payment.'}));
   const sources=new Map();for(const r of records){for(const s of r.sourceEvidence||[])if(s.source_id||s.id)sources.set(s.source_id||s.id,s);for(const s of admittedEvidence.get(r.id))sources.set(s.id,s);}
   for(const r of records)for(const sid of [...(r.sourceIds||[]),...allSourceIds(r.coreInfo),...Object.values(r.fields).flatMap(f=>f.sourceIds||[])])if(!sources.has(sid))sources.set(sid,{id:sid,unresolved:true});
   for(const[sid,s]of sources){const m=sourceMeta(s),{body,...metadata}=s;insert('INSERT INTO catalog_sources VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,observed_at=excluded.observed_at,published_at=excluded.published_at,kind=excluded.kind,sha256=excluded.sha256,resolved=excluded.resolved,metadata_json=excluded.metadata_json',sid,m.url,m.title,m.observedAt,m.publishedAt,m.kind,m.sha256,m.resolved?1:0,json(metadata));}
   // Entire publication changes atomically. Raw evidence, revisions and jobs are untouched.
   insert('DELETE FROM catalog_records');
   for(let n=0;n<records.length;n++){
    const r=records[n],core=r.coreInfo;
    insert('INSERT INTO catalog_records VALUES(?,?,?,?,?,?,?,?)',r.id,r.name,r.category||'airport',r.primary?1:0,safeUrl(core.website?.url)||null,id,json(core),json({listing:r.listing||{},catalogRecord:r.catalogRecord||{},reviewedOverlay:r.reviewedOverlay||{},unresolvedSourceIds:r.unresolvedSourceIds||[]}));
    insert('INSERT OR IGNORE INTO catalog_record_versions VALUES(?,?,?)',id,r.id,json(docs[n]));
    const ids=new Set([...(r.sourceIds||[]),...allSourceIds(core)]);for(const sid of ids)if(sources.has(sid))insert('INSERT OR IGNORE INTO catalog_record_sources VALUES(?,?)',r.id,sid);
    for(const[field,state]of Object.entries(r.fields)){
     const {data,...withoutData}=state;insert('INSERT INTO catalog_field_states VALUES(?,?,?,?,?,?,?)',r.id,field,state.status||'not_confirmed',state.materialAvailable?1:0,latest(core[field]),json(withoutData),data===undefined?null:json(data));
     for(const sid of new Set(state.sourceIds||[]))if(sources.has(sid))insert('INSERT INTO catalog_field_sources VALUES(?,?,?)',r.id,field,sid);
    }
    for(const[index,p]of (core.pricing?.plans||[]).entries())insert('INSERT INTO catalog_plans VALUES(?,?,?,?,?,?,?,?,?,?,?)',r.id+'-plan-'+index,r.id,index,p.name||null,Number.isFinite(p.amount)?p.amount:null,p.currency||null,p.currencySymbol||null,p.billingPeriod||null,p.quota||null,p.observedAt||core.pricing?.observedAt||null,json(p));
    for(const[index,method]of (core.payment?.methods||[]).entries())insert('INSERT INTO catalog_payment_methods VALUES(?,?,?,?,?)',r.id,index,typeof method==='string'?method:json(method),core.payment.status||'not_confirmed',core.payment.observedAt||null);
    for(const field of ['refund','privacy','compatibility','trial'])if(core[field])insert('INSERT INTO catalog_policies VALUES(?,?,?,?,?,?)',r.id,field,core[field].status||'not_confirmed',core[field].summary||null,core[field].observedAt||null,json(core[field]));
    const c=core.payment?.orderCleanup;if(c)insert('INSERT INTO catalog_order_cleanup VALUES(?,?,?,?,?)',r.id,c.status||null,c.cancellationVerified===undefined?null:c.cancellationVerified?1:0,c.checkedAt||null,json(c));
    const ref=r.importedReferral;if(ref&&ref.recordId===r.id&&ref.status==='verified_user_referral'&&ref.owner==='user'&&ref.evidenceId&&ref.disclosure)insert('INSERT INTO catalog_referral_links VALUES(?,?)',r.id,json(ref));
   }
   insert('INSERT INTO catalog_publication VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id',id);
  for(const[sql]of writes)if(!statements.has(sql))statements.set(sql,db.prepare(sql));
  db.exec('BEGIN IMMEDIATE');
  try{
   const current=meta();
   if(current?.content_sha256===digest&&!syncState){db.exec('COMMIT');return{status:'unchanged',...publicationFrom(current)};}
   const appliedChanged=syncState&&['applied_snapshot_id','source_hash','state_key'].some(field=>current?.[field]!==existing?.[field]);
   if(current?.id!==existing?.id||appliedChanged)throw Error('Catalog publication changed during preparation; retry');
   if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sites'").get()){const revisions=new Map(db.prepare('SELECT id,revision FROM sites').all().map(s=>[s.id,s.revision]));for(const r of records)if(r.storeSnapshot?.site&&revisions.has(r.id)&&revisions.get(r.id)!==r.storeSnapshot.site.revision)throw Error('Catalog reviewed input revision changed; retry');}
   if(syncState&&syncState.validate()!==syncState.key)throw Error('Catalog sync inputs changed during preparation; retry');
   if(current?.content_sha256!==digest)for(const[sql,values]of writes)statements.get(sql).run(...values);
   if(syncState)db.prepare('INSERT INTO catalog_sync_state VALUES(1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id,source_hash=excluded.source_hash,state_key=excluded.state_key').run(id,syncState.sourceHash,syncState.key);
   const published=publication();
   db.exec('COMMIT');return{status:current?.content_sha256===digest?'unchanged':'published',...published};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function publicationFrom(m){return m?{snapshotId:m.id,importedAt:m.imported_at,sourceAsOf:m.source_as_of,contentSha256:m.content_sha256}:null;}
 function publication(){return publicationFrom(meta());}
 const fileHashes=new Map();
 function retainedInputs(capture=false){
  const bytes=new Map();
  const inputs=RETAINED_INPUTS.map(file=>{
   const filename=path.join(root,file);
   try{
    if(capture){const body=fs.readFileSync(filename);bytes.set(file,body);return [file,hash(body)];}
    const stat=fs.statSync(filename,{bigint:true});
    const identity=[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
    let cached=fileHashes.get(file);
    if(cached?.identity!==identity){cached={identity,digest:hash(fs.readFileSync(filename))};fileHashes.set(file,cached);}
    return [file,cached.digest];
   }catch(error){if(error.code!=='ENOENT')throw error;fileHashes.delete(file);return null;}
  });
  return {digest:hash(json(inputs)),hasBase:!!inputs[0],bytes};
 }
 function sync(){
  const prior=meta(),current=publicationFrom(prior),initial=retainedInputs();
  const inventory=require('../scripts/export-current-inventory.cjs');
  const reviewedState=()=>store?.publicationWatermark?.()||null;
  const keyFor=(base,review)=>hash(json({base,review,day:new Date(clock()).toISOString().slice(0,10)}));
  const key=keyFor(initial.digest,reviewedState());
  if(prior?.id===prior?.applied_snapshot_id&&prior?.state_key===key)return{status:'unchanged',...current};
  const captured=retainedInputs(true);
  if(captured.digest!==initial.digest)throw Error('Catalog sync inputs changed during preparation; retry');
  function readInput(file,optional=false){
   const bytes=captured.bytes.get(file);
   if(!bytes&&!optional)throw Error('Missing retained catalog input: '+file);
   return bytes||null;
  }
  const useFiles=captured.hasBase&&(!current||prior.source_hash!==captured.digest);
  const bundle=useFiles?inventory.exportInventory({root,storeFile:filename,clock,writeFiles:false,publicationOnly:true,verifyEvidenceBodies:false,readInput})
   :current?exportBundle({versionedSources:true}):parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'seed/catalog-bundle.json.gz'))));
  if(!useFiles){
   const changes=(store?.listChanges?.()||[]).map(c=>({...c,site_id:c.siteId,proposal_id:c.proposalId}));
   const proposals=(store?.listProposals?.()||[]).filter(p=>p.status==='approved').map(p=>({...p,site_id:p.siteId,expected_revision:p.expectedRevision,reviewed_at:p.reviewedAt}));
   const sites=new Map((store?.listSites?.()||[]).map(s=>[s.id,s]));
   const changesBySite=Map.groupBy(changes,c=>c.site_id),proposalsBySite=Map.groupBy(proposals,p=>p.site_id);
   for(const r of bundle.records){
    const site=sites.get(r.id),siteProposals=proposalsBySite.get(r.id)||[];
    if(site?.revision){const applied=inventory.overlay(r,site,{changes:changesBySite.get(r.id)||[],proposals:siteProposals});r.coreInfo=applied.coreInfo;delete applied.coreInfo;r.reviewedOverlay=applied;const referralState=r.fields.referral;r.fields=inventory.assess(r.coreInfo,null,r.catalogRecord||{});r.fields.referral=referralState;}
    r.storeSnapshot={site,proposals:siteProposals};
   }
  }
  const ids=[...new Set(bundle.records.flatMap(r=>[...referencedSourceIds(r)].filter(id=>id.startsWith('ev-'))))];
  const metadata=store?.listEvidenceMetadata?.({ids})??store?.listEvidence?.({ids,includeBody:false})??[];
  const evidenceBySite=Map.groupBy(metadata,e=>e.siteId||e.site_id);
  for(const r of bundle.records){
   const evidence=evidenceBySite.get(r.id)||[];
   r.storeSnapshot={...r.storeSnapshot,evidence};
   const resolved=new Set(evidence.map(e=>e.id));
   r.unresolvedSourceIds=(r.unresolvedSourceIds||[]).filter(id=>!resolved.has(id));
  }
  return importRecords({...bundle,syncState:{prior,curation:readInput('collection/catalog-curation.json',true),sourceHash:captured.digest,key,validate:()=>keyFor(retainedInputs().digest,reviewedState())}});
 }
 const recordRow=r=>r&&({id:r.id,name:r.name,category:r.category,primary:!!r.is_primary,coreInfo:parse(r.core_json)});
 const readRecord=db.prepare('SELECT id,name,category,is_primary,core_json FROM catalog_records WHERE id=?');
 const relationIds=['A082','A070'];
 const placeholders=ids=>ids.map(()=>'?').join(',');
 function selectRecords(ids){return ids.length?db.prepare(`SELECT id,name,category,is_primary,core_json FROM catalog_records WHERE id IN (${placeholders(ids)})`).all(...ids).map(recordRow):[];}
 function readSnapshot(read){
  db.exec('BEGIN');
  try{const value=read();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }
 let filterSnapshot,filterRecords;
 function filters(snapshotId){
  if(filterRecords&&filterSnapshot===snapshotId)return filterRecords;
  filterRecords=db.prepare(`SELECT id,is_primary,name,json_extract(core_json,'$.website.url') AS website,
   json_extract(core_json,'$.payment.methods') AS methods FROM catalog_records ORDER BY id`).all().map(r=>({id:r.id,primary:!!r.is_primary,
    search:[r.id,r.name,r.website].join(' ').normalize('NFKC').toLowerCase(),methods:r.methods===null?[]:parse(r.methods)}));
  filterSnapshot=snapshotId;
  return filterRecords;
 }
 function refs(){const current=store?.listReferrals?.()||[],imported=db.prepare('SELECT link_json FROM catalog_referral_links').all().map(r=>parse(r.link_json));return[...current,...imported.filter(r=>!current.some(c=>c.recordId===r.recordId))];}
 function presentRows(rows,{facts=x=>x,card=false,related=[],detail=false}={}){
  if(!rows.length)return [];
  const ids=rows.map(r=>r.id),referrals=refs(),fields=new Map(),counts=new Map();
  if(!card){
   for(const r of db.prepare(`SELECT record_id,field,state_json,observed_at FROM catalog_field_states WHERE record_id IN (${placeholders(ids)})`).all(...ids)){
    if(!fields.has(r.record_id))fields.set(r.record_id,{});
    fields.get(r.record_id)[r.field]={...parse(r.state_json),observedAt:r.observed_at};
   }
   for(const r of db.prepare(`SELECT record_id,count(*) n FROM catalog_record_sources WHERE record_id IN (${placeholders(ids)}) GROUP BY record_id`).all(...ids))counts.set(r.record_id,Number(r.n));
  }
  return rows.map(row=>{
   const link=outbound({id:row.id,coreInfo:row.coreInfo},referrals);
   const identity={id:row.id,name:displayNameFor(row),category:row.category,primary:row.primary,link};
   const presentation=row.id==='A082'?presentationFor(row,related):null;
   if(presentation)identity.presentation=presentation;
   if(card){
    const {pricing,payment,refund,speed,stability,operatingHistory}=row.coreInfo;
    const plan=representativePlan(pricing?.plans||[]);
    const core={pricing:{plans:plan?[plan]:[]},payment,refund,speed,stability,operatingHistory};
    const {price,paymentMethods,refund:refundText,speed:rate,stability:reliability,operatingAge,operatingAgeLabel,speedContext}=customerSummary(core,facts(core));
    return {...identity,summary:{price,paymentMethods,refund:refundText,speed:rate,stability:reliability,operatingAge,operatingAgeLabel,...(speedContext?{speedContext:{dateLabel:speedContext.dateLabel,testedAt:speedContext.testedAt,network:speedContext.network}}:{})}};
   }
   const f=facts(row.coreInfo),result={...f,...identity,summary:customerSummary(row.coreInfo,f),fields:fields.get(row.id)||{},sourceCount:counts.get(row.id)||0};
   if(detail)result.sources=db.prepare('SELECT s.id,s.url,s.title,s.observed_at,s.published_at,s.kind,s.sha256,s.resolved FROM catalog_record_sources r JOIN catalog_sources s ON s.id=r.source_id WHERE r.record_id=? ORDER BY s.observed_at DESC,s.id').all(row.id).map(s=>({id:s.id,url:publicUrl(s.url),title:s.title,observedAt:s.observed_at,publishedAt:s.published_at,kind:s.kind,sha256:s.sha256,status:s.resolved?'retained_source_metadata':'unresolved_reference'}));
   return result;
  });
 }
 function list(query={},options={}){
  const allowed=['scope','q','payment','refund','price','page','limit','view'];for(const[k,v]of Object.entries(query))if(!allowed.includes(k)||typeof v!=='string')throw new QueryError('无效目录参数');
  if(query.view!==undefined&&query.view!=='card')throw new QueryError('无效目录展示类型');
  const scope=query.scope||'primary';if(!['all','primary','other'].includes(scope))throw new QueryError('无效目录范围');
  for(const k of ['price','refund'])if(query[k]&&!['available','missing'].includes(query[k]))throw new QueryError('无效缺项筛选');
  const q=(query.q||'').normalize('NFKC').trim().toLowerCase(),method=query.payment||'';if(q.length>200||method.length>100)throw new QueryError('筛选文本过长');
  const int=(x,def,max)=>{if(x===undefined)return def;if(!/^\d+$/.test(x)||Number(x)<1||Number(x)>max)throw new QueryError('分页参数无效');return Number(x);};const page=int(query.page,1,100000),limit=int(query.limit,12,100);
  const snapshot=publication();let rows=filters(snapshot?.snapshotId).filter(r=>(scope==='all'||(scope==='primary'&&r.primary)||(scope==='other'&&!r.primary))&&(!q||r.search.includes(q))&&(!method||r.methods.some(m=>String(m).includes(method))));
  for(const[field,param]of [['pricing','price'],['refund','refund']])if(query[param]){const known=new Set(db.prepare('SELECT record_id FROM catalog_field_states WHERE field=? AND material_available=?').all(field,query[param]==='available'?1:0).map(r=>r.record_id));rows=rows.filter(r=>known.has(r.id));}
  const totalRecords=rows.length,related=rows.some(r=>r.id==='A082')?selectRecords(relationIds):[];
  const legacy=related.find(r=>r.id==='A082'),preferred=preferredRows(rows.map(r=>r.id==='A082'&&legacy||r),related);
  rows=preferred.rows;
  const ids=rows.slice((page-1)*limit,page*limit).map(r=>r.id),pageRows=new Map(selectRecords(ids).map(r=>[r.id,r]));
  return{...snapshot,items:presentRows(ids.map(id=>pageRows.get(id)),{...options,card:options.card||query.view==='card',related}),total:rows.length,filteredCount:rows.length,totalRecords,hiddenRelatedRecords:preferred.hiddenRelatedRecords,page,limit,pages:Math.ceil(rows.length/limit)};
 }
 function detail(id,options={}){const record=readRecord.get(id);if(!record)return null;const row=recordRow(record);return{item:presentRows([row],{...options,detail:true,related:id==='A082'?selectRecords(['A070']):[]})[0],...publication()};}
 function stats(){const counts={all:Number(db.prepare('SELECT count(*) n FROM catalog_records').get().n),primary:Number(db.prepare('SELECT count(*) n FROM catalog_records WHERE is_primary=1').get().n),plans:Number(db.prepare('SELECT count(*) n FROM catalog_plans').get().n),sources:Number(db.prepare('SELECT count(DISTINCT source_id) n FROM catalog_record_sources').get().n),ownedReferrals:refs().filter(r=>r.status==='verified_user_referral'&&r.owner==='user').length};const coverage=Object.fromEntries(FIELDS.map(field=>{const row=db.prepare('SELECT count(*) n,coalesce(sum(material_available),0) n_available FROM catalog_field_states f JOIN catalog_records r ON r.id=f.record_id WHERE r.is_primary=1 AND field=?').get(field);return[field,{materialAvailable:row.n_available,missing:row.n-row.n_available}];}));return{...publication(),counts,coverage,scope:'primary',limitations:['有材料不等于独立核实、交易成功或服务可用保证。','来源原始采集时间与数据库整理时间分别显示；整理不会刷新证据日期。','第三方报价不计官网报价覆盖；未知币种不自动换算。']};}
 function tables(){const names=['catalog_records','catalog_plans','catalog_payment_methods','catalog_policies','catalog_field_states','catalog_sources','catalog_record_sources','catalog_field_sources','catalog_order_cleanup','catalog_referral_links','catalog_imports','catalog_record_versions','catalog_publication','sites','evidence','observations','proposals','changes','referrals','jobs','service_heartbeats','collector_profiles','collector_control','collector_runs','collector_checkpoints','collector_events','collector_capture_metadata','collector_cancellation_acks'];return names.filter(name=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)).map(name=>({name,count:db.prepare('SELECT count(*) n FROM '+name).get().n,columns:db.prepare('PRAGMA table_info('+name+')').all().map(c=>({name:c.name,type:c.type,required:!!c.notnull,primaryKey:!!c.pk}))}));}
 function exportBundle({versionedSources=false}={}){return readSnapshot(()=>{
  const published=meta();
  const docs=db.prepare('SELECT document_json FROM catalog_record_versions WHERE snapshot_id=? ORDER BY record_id').all(published.id).map(r=>parse(r.document_json));
  const referrals=Map.groupBy(refs().filter(r=>r.status==='verified_user_referral'),r=>r.recordId);
  const sources=versionedSources?null:Map.groupBy(db.prepare('SELECT rs.record_id,s.metadata_json FROM catalog_record_sources s JOIN catalog_record_sources rs ON s.id=rs.source_id ORDER BY rs.record_id,rs.source_id').all(),s=>s.record_id);
  for(const r of docs){
   if(sources)r.sourceEvidence=(sources.get(r.id)||[]).map(s=>parse(s.metadata_json));
   r.importedReferral=referrals.get(r.id)?.[0]||null;
  }
  return{records:docs,summary:{definitions:parse(published.manifest_json).definitions},originalPublication:publicationFrom(published)};
 });}
 function rawExport(){return readSnapshot(()=>({catalog:db.prepare('SELECT id,name,core_json FROM catalog_records WHERE is_primary=1 ORDER BY id').all().map(r=>{const coreInfo=parse(r.core_json);return{id:r.id,name:r.name,coreInfo,officialUrl:coreInfo.website?.url};}),evidenceAsOf:publication()?.sourceAsOf}));}
 return{importRecords,sync,publication,list:(query,options)=>readSnapshot(()=>list(query,options)),detail:(id,options)=>readSnapshot(()=>detail(id,options)),stats:()=>readSnapshot(stats),tables,exportBundle,rawExport,coreInfo:id=>{const row=readRecord.get(id);return row?parse(row.core_json):undefined;},rawRecord:id=>{const r=readRecord.get(id);return r?.is_primary?parse(r.core_json):null;},close:()=>db.close()};
}
module.exports={openCatalogDb,sourceMeta,latest,RETAINED_INPUTS};
