'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStore}=require('../deploy-service/store.cjs'),{openCatalogDb}=require('../deploy-service/catalog-db.cjs'),{createServer,publicFacts}=require('../deploy-service/server.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airport-product-')),filename=path.join(dir,'test.sqlite'),store=createStore({filename}),catalog=openCatalogDb({filename,store,root:dir,clock:()=>1794303000000});t.after(()=>{catalog.close();store.close();const resolved=fs.realpathSync(dir);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));assert(path.basename(resolved).startsWith('airport-product-'));fs.rmSync(resolved,{recursive:true,force:true});});return{filename,store,catalog};}
function record(id='A001',primary=true){const coreInfo={website:{url:'https://example.com/#/register?code=OTHERS'},pricing:{status:'advertised',plans:[{name:'Synthetic annual',amount:120,currency:null,currencySymbol:'¥',billingPeriod:'年付',sourceIds:['S1'],observedAt:'2026-10-01T00:00:00Z',privateOrderId:'DO_NOT_PUBLISH'}],externalReports:[{status:'unverified_third_party_price',officialCurrentPriceVerified:false,summary:'historical third party',sourceIds:['S2']}]},payment:{status:'observed',methods:['支付宝'],sourceIds:['S1']},refund:{status:'not_confirmed',summary:'Unknown refund',sourceIds:['S2']}};const {assess}=require('../scripts/export-current-inventory.cjs');return{id,name:'Synthetic '+id,category:'airport',primary,coreInfo,fields:assess(coreInfo,null,{}),sourceIds:['S1','S2'],sourceEvidence:[{source_id:'S1',url:'https://example.com/plans',last_capture_at:'2026-10-01T00:00:00Z',source_type:'official',sha256:'abc'}]};}

test('initialized database sync overlays reviewed changes without seed or public files and remains unchanged on repeat',t=>{
 const{catalog,store,filename}=fixture(t),root=path.join(path.dirname(filename),'empty-runtime'),runtime=openCatalogDb({filename,store,root});
 const a=record(),b=record('A002');a.listing={primary:true,custom:'retained listing'};a.catalogRecord={id:a.id,custom:'retained metadata'};a.importedReferral={recordId:a.id,status:'verified_user_referral',owner:'user',evidenceId:'S1',url:'https://example.com/invite?code=own',disclosure:'retained disclosure'};
 catalog.importRecords({records:[a,b],summary:{definitions:{boundary:'retained definition'}}});const original=runtime.exportBundle({versionedSources:true}),db=new(require('node:sqlite').DatabaseSync)(filename),sourcesBefore=db.prepare('SELECT * FROM catalog_sources ORDER BY id').all();
 try{
  store.seedSites([{recordId:a.id,entryUrl:'https://example.com/',initialDocument:a.coreInfo}]);const ev=store.saveEvidence({siteId:a.id,url:'https://example.com/plans',body:'Reviewed price 135',observedAt:'2026-11-14T00:00:00Z'}),proposal=store.createProposal({siteId:a.id,patch:{pricing:{status:'advertised',plans:[{name:'Reviewed annual',amount:135,currency:'CNY',billingPeriod:'年付',sourceIds:[ev.id],observedAt:'2026-11-14T00:00:00Z'}]}},evidenceIds:[ev.id],expectedRevision:0});store.reviewProposal(proposal.id,{approved:true,reviewer:'synthetic-reviewer',expectedRevision:0});
  store.createProposal({siteId:a.id,patch:{refund:{status:'observed',summary:'Unreviewed must not publish',sourceIds:[ev.id]}},evidenceIds:[ev.id],expectedRevision:1});
  assert.equal(fs.existsSync(root),false);const read=fs.readFileSync;fs.readFileSync=function(file,...args){if(String(file).endsWith('catalog-bundle.json.gz'))throw Error('seed must not be read after initialization');return read.call(this,file,...args);};let first,second;try{first=runtime.sync();second=runtime.sync();}finally{fs.readFileSync=read;}
  assert.equal(first.status,'published');assert.equal(second.status,'unchanged');assert.equal(second.snapshotId,first.snapshotId);assert.equal(runtime.detail(a.id).item.pricing.plans[0].amount,135);assert.equal(store.getSite(a.id).revision,1);const after=runtime.exportBundle({versionedSources:true}),changed=after.records.find(r=>r.id===a.id);assert.deepEqual(after.records.find(r=>r.id===b.id),original.records.find(r=>r.id===b.id));assert.deepEqual(changed.listing,a.listing);assert.deepEqual(changed.catalogRecord,a.catalogRecord);assert.deepEqual(changed.importedReferral,a.importedReferral);assert.deepEqual(changed.fields.referral,a.fields.referral);assert.equal(changed.coreInfo.refund.summary,'Unknown refund');assert.equal(changed.reviewedOverlay.applied[0].revision,1);assert.deepEqual(after.summary.definitions,original.summary.definitions);assert.deepEqual(db.prepare("SELECT * FROM catalog_sources WHERE id IN ('S1','S2') ORDER BY id").all(),sourcesBefore);assert.ok(db.prepare('SELECT id FROM catalog_sources WHERE id=?').get(ev.id));
 }finally{db.close();runtime.close();}
});
test('curation is reconciled from retained inputs even without a base file',t=>{
 const {catalog,filename}=fixture(t);
 catalog.importRecords({records:[record(),record('A002')]});
 catalog.sync();
 const curation=path.join(path.dirname(filename),'collection','catalog-curation.json');
 fs.mkdirSync(path.dirname(curation));
 fs.writeFileSync(curation,JSON.stringify({schemaVersion:'airports-catalog-curation.v1',archived:[{id:'A002',name:'Synthetic archive',reason:'Fixture',archivedAt:'2026-11-24T00:00:00Z'}]}));
 assert.equal(catalog.sync().status,'published');
 assert.deepEqual(catalog.list({scope:'all'}).items.map(item=>item.id),['A001']);
 assert.equal(catalog.sync().status,'unchanged');
});

test('catalog and detail share the same concise summary without changing retained records',t=>{const{catalog}=fixture(t),r=record();r.coreInfo.pricing.plans[0].amountBasis='original_billing_period_total';r.coreInfo.operatingHistory={yearsSinceStart:6,continuousOperationVerified:false};catalog.importRecords({records:[r]});const before=catalog.publication().snapshotId,a=catalog.list({}, {facts:publicFacts}).items[0],b=catalog.detail('A001',{facts:publicFacts}).item;assert.deepEqual(a.summary,b.summary);assert.equal(a.summary.price.amount,120);assert.equal(a.summary.price.billingPeriod,'年付');assert.equal(a.summary.price.currency,null);assert.deepEqual(a.summary.paymentMethods,['支付宝']);assert.equal(a.summary.operatingAge,'暂无数据');assert.equal(a.summary.refund,null);assert(!JSON.stringify(a.summary).includes('DO_NOT_PUBLISH'));assert.equal(b.sources[0].observedAt,'2026-10-01T00:00:00Z');assert.equal(catalog.publication().snapshotId,before);});
test('card view preserves filtering, identity and summary while omitting retained detail',t=>{
 const {catalog}=fixture(t),r=record();r.name='Ｆixture';catalog.importRecords({records:[r,record('A002',false)]});
 const query={scope:'all',q:'fixture',payment:'支付宝',limit:'1'};
 const full=catalog.list(query,{facts:publicFacts}),card=catalog.list({...query,view:'card'},{facts:publicFacts});
 assert.equal(full.items[0].id,'A001');
 const {items,...page}=full;assert.deepEqual({...card,items:[]},{...page,items:[]});
 const [item]=items,[compact]=card.items;
 assert.deepEqual({...compact,summary:null},Object.fromEntries(['id','name','category','primary','summary','link'].map(key=>[key,key==='summary'?null:item[key]])));
 for(const key of ['price','paymentMethods','refund','speed','stability','operatingAge','operatingAgeLabel'])assert.deepEqual(compact.summary[key],item.summary[key]);
 assert.equal(compact.summary.latencyContext,undefined);
 r.name='Renamed';catalog.importRecords({records:[r]});
 assert.deepEqual(catalog.list({...query,view:'card'}).items,[]);
});
test('relational import is idempotent, preserves unknown currency and source date, filters scopes and gaps',t=>{const{catalog,filename}=fixture(t);const input={records:[record(),record('A002',false)]};const a=catalog.importRecords(input),b=catalog.importRecords(input);assert.equal(b.status,'unchanged');assert.equal(a.snapshotId,b.snapshotId);assert.equal(catalog.stats().counts.all,2);assert.equal(catalog.stats().coverage.refund.missing,1);assert.equal(catalog.list().total,1);assert.equal(catalog.list({scope:'all'}).total,2);assert.equal(catalog.list({price:'missing'}).total,0);assert.equal(catalog.list({refund:'missing',payment:'支付宝'}).total,1);const detail=catalog.detail('A001',{facts:publicFacts}).item;assert.equal(detail.pricing.plans[0].currency,null);assert.equal(detail.sources[0].observedAt,'2026-10-01T00:00:00Z');assert.equal(detail.sources.find(s=>s.id==='S2').status,'unresolved_reference');assert(!detail.link.url.includes('OTHERS'));assert(!JSON.stringify(detail).includes('DO_NOT_PUBLISH'));const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(filename);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('SELECT count(*) n FROM catalog_plans').get().n,2);db.close();});
test('failed import rolls back all normalized tables and publication',t=>{const{catalog}=fixture(t);catalog.importRecords({records:[record()]});const before=catalog.publication();const invalid=record('A003');invalid.coreInfo.payment.methods=[undefined];assert.throws(()=>catalog.importRecords({records:[invalid]}));assert.equal(catalog.publication().snapshotId,before.snapshotId);assert.equal(catalog.list().items[0].id,'A001');assert.throws(()=>catalog.list({limit:'0'}));});
test('database-backed HTTP uses one publication, keeps unknowns, requires admin and refuses speed ranking',async t=>{const{store,catalog}=fixture(t);catalog.importRecords({records:[record()]});store.setServiceHeartbeat('collector',{status:'paused',details:{collectionEnabled:false}});const server=createServer({store,catalogDb:catalog,adminToken:'synthetic-secret'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port,get=async p=>(await fetch(base+p)).json();const stats=await get('/api/stats'),list=await get('/api/catalog');assert.equal(stats.snapshotId,list.snapshotId);assert.equal(stats.updateService.collectionEnabled,false);assert.equal(stats.updateService.status,'paused');assert.equal((await get('/api/search?criterion=speed')).status,'abstain');assert.equal((await get('/api/search')).items.length,0);assert.equal((await fetch(base+'/api/admin/status')).status,401);const admin=await(await fetch(base+'/api/admin/status',{headers:{Authorization:'Bearer synthetic-secret'}})).json();assert(admin.database.tables.some(t=>t.name==='catalog_plans'));const text=await(await fetch(base+'/api/airports/A001')).text();assert(!text.includes('DO_NOT_PUBLISH'));assert(!text.includes('synthetic-secret'));assert.equal((await fetch(base+'/api/catalog?page=0')).status,400);assert.equal((await fetch(base+'/data/collector.sqlite')).status,404);});
test('publisher reconciles once per fingerprint and records failure without promoting data',t=>{const{store}=fixture(t);let calls=0;const catalog={sync(){calls++;return{status:'unchanged'};},publication(){return{snapshotId:'synthetic'};}};const p=require('../deploy-service/publisher.cjs').createPublisher({store,catalog,root:'missing-synthetic-root',clock:()=>0});p.tick();p.tick();assert.equal(calls,1);assert.equal(store.getServiceHeartbeats()[0].status,'running');const broken=require('../deploy-service/publisher.cjs').createPublisher({store,catalog:{sync(){throw Error('private-secret');}},root:'missing-synthetic-root'});assert.equal(broken.tick().status,'failed');assert(!JSON.stringify(store.getServiceHeartbeats()).includes('private-secret'));});
test('search derives evidence time from the snapshot used for results',async t=>{
 const server=createServer({catalogDb:{publication(){throw Error('search should not read publication separately');},rawExport(){return{catalog:[],evidenceAsOf:'2026-11-25T00:00:00Z'};}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/search`);
 assert.equal(response.status,200);
 assert.equal((await response.json()).evidenceAsOf,'2026-11-25T00:00:00Z');
});

test('public URLs remove private checkout paths and tokens',()=>{const{publicUrl}=require('../deploy-service/public-url.cjs');assert.equal(publicUrl('https://example.com/order/private?token=secret'),'https://example.com/');assert.equal(publicUrl('https://example.com/help?token=secret&id=2'),'https://example.com/help?id=2');assert.equal(publicUrl('javascript:alert(1)'),null);});
test('presentation clock drift does not create a publication revision, but a price change does',t=>{const{catalog}=fixture(t),r=record();r.coreInfo.asOf='2026-11-10T01:00:00Z';r.coreInfo.stability={recentWindow:{start:'2026-10-11',end:'2026-11-10'},status:'not_measured'};r.catalogRecord={freshness:{ageHours:2}};catalog.importRecords({records:[r]});r.coreInfo.asOf='2026-11-10T02:00:00Z';r.coreInfo.stability.recentWindow.end='2026-11-10T02:00:00Z';r.catalogRecord.freshness.ageHours=3;assert.equal(catalog.importRecords({records:[r]}).status,'unchanged');r.coreInfo.pricing.plans[0].amount=121;assert.equal(catalog.importRecords({records:[r]}).status,'published');});

test('unreviewed evidence and later observations of an admitted body do not create public snapshots',t=>{const{catalog,filename,store}=fixture(t),r=record();store.seedSites([{recordId:r.id,entryUrl:'https://example.com/',enabled:true}]);const admitted=store.saveEvidence({siteId:r.id,url:'https://example.com/plans',body:'SYNTHETIC retained price 120',observedAt:'2026-10-01T00:00:00Z'});r.coreInfo.pricing.plans[0].sourceIds=[admitted.id];r.sourceIds.push(admitted.id);r.storeSnapshot={evidence:store.listEvidence()};const first=catalog.importRecords({records:[r]});const unreviewed=store.saveEvidence({siteId:r.id,url:'https://example.com/plans',body:'SYNTHETIC UNREVIEWED price 999',observedAt:'2026-11-10T00:00:00Z'});store.saveEvidence({siteId:r.id,url:'https://example.com/plans',body:'SYNTHETIC retained price 120',observedAt:'2026-11-10T00:01:00Z'});r.storeSnapshot.evidence=store.listEvidence();assert.equal(catalog.importRecords({records:[r]}).status,'unchanged');assert.equal(catalog.publication().snapshotId,first.snapshotId);const{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(filename,{readOnly:true});assert.equal(db.prepare('SELECT count(*) n FROM evidence').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM observations').get().n,3);assert.equal(db.prepare('SELECT id FROM catalog_sources WHERE id=?').get(unreviewed.id),undefined);assert.equal(db.prepare('SELECT observed_at FROM catalog_sources WHERE id=?').get(admitted.id).observed_at,'2026-10-01T00:00:00Z');db.close();r.coreInfo.pricing.plans[0].amount=999;r.coreInfo.pricing.plans[0].sourceIds=[unreviewed.id];r.coreInfo.pricing.plans[0].observedAt='2026-11-10T00:00:00Z';r.sourceIds.push(unreviewed.id);const next=catalog.importRecords({records:[r]});assert.equal(next.status,'published');assert.notEqual(next.snapshotId,first.snapshotId);assert.equal(catalog.detail(r.id).item.pricing.plans[0].amount,999);});

test('preparation runs without a writer lock and stale site revisions fail atomically',t=>{const{catalog,store,filename}=fixture(t),r=record(),{DatabaseSync}=require('node:sqlite'),other=new DatabaseSync(filename);try{store.seedSites([{recordId:r.id,entryUrl:'https://example.com/',enabled:true}]);r.storeSnapshot={site:{revision:0},evidence:[]};let serialized=false;r.coreInfo.pricing.toJSON=function(){other.exec('BEGIN IMMEDIATE');other.exec('ROLLBACK');serialized=true;return{status:'advertised',plans:this.plans};};assert.equal(catalog.importRecords({records:[r]}).status,'published');assert.equal(serialized,true);const prior=catalog.publication().snapshotId;other.prepare('UPDATE sites SET revision=1 WHERE id=?').run(r.id);r.coreInfo.pricing.plans[0].amount=122;assert.throws(()=>catalog.importRecords({records:[r]}),/input revision changed/);assert.equal(catalog.publication().snapshotId,prior);assert.equal(catalog.detail(r.id).item.pricing.plans[0].amount,120);}finally{other.close();}});

test('heartbeat write failures including the error heartbeat retain receipts and recover on the next tick',()=>{let broken=true,calls=0,beats=0;const receipts=[],store={listChanges:()=>[],listReferrals:()=>[],setServiceHeartbeat(){beats++;if(broken)throw Object.assign(Error('database is locked PRIVATE_DO_NOT_LOG'),{errcode:5});}},catalog={sync(){calls++;return{status:'published'};},publication(){return{snapshotId:'synthetic'};}};const p=require('../deploy-service/publisher.cjs').createPublisher({store,catalog,root:'missing-synthetic-root',clock:()=>0,onReceipt:r=>receipts.push(r)});const failed=p.tick();assert.equal(failed.status,'failed');assert.equal(failed.stage,'heartbeat');assert.equal(failed.syncResult,'published');assert.equal(failed.retryable,true);assert.equal(receipts.length,2);assert.equal(beats,2);assert(!JSON.stringify(receipts).includes('PRIVATE_DO_NOT_LOG'));broken=false;assert.equal(p.tick().status,'unchanged');assert.equal(calls,1);assert.equal(beats,3);});

test('failed sync remains retryable even when its failure heartbeat also cannot be written',()=>{let broken=true,calls=0;const receipts=[],store={listChanges:()=>[],listReferrals:()=>[],setServiceHeartbeat(){if(broken)throw Error('database is locked');}},catalog={sync(){calls++;if(broken)throw Error('database is locked');return{status:'published'};},publication(){return{snapshotId:'synthetic'};}};const p=require('../deploy-service/publisher.cjs').createPublisher({store,catalog,root:'missing-synthetic-root',clock:()=>0,onReceipt:r=>receipts.push(r)});assert.equal(p.tick().status,'failed');broken=false;assert.equal(p.tick().status,'published');assert.equal(calls,2);assert.equal(receipts.length,2);});

test('another publisher completing the identical candidate during preparation is a no-op under the final writer lock',t=>{const{catalog,filename,store}=fixture(t),other=openCatalogDb({filename,store}),r=record(),plain=JSON.parse(JSON.stringify(r)),summary={};let otherResult;try{Object.defineProperty(summary,'definitions',{get(){otherResult=other.importRecords({records:[plain]});return{};}});const result=catalog.importRecords({records:[r],summary});assert.equal(otherResult.status,'published');assert.equal(result.status,'unchanged');assert.equal(result.snapshotId,otherResult.snapshotId);const{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(filename,{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM catalog_imports').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM catalog_record_versions').get().n,1);}finally{db.close();}}finally{other.close();}});

test('store startup waits for an existing writer before switching journal mode instead of failing immediately',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airport-store-lock-')),filename=path.join(dir,'locked.sqlite'),{spawn}=require('node:child_process');let child;try{child=spawn(process.execPath,['-e',"const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA journal_mode=WAL;CREATE TABLE writer_fixture(x);BEGIN IMMEDIATE;INSERT INTO writer_fixture VALUES(1)');process.stdout.write('LOCKED\\n');setTimeout(()=>{db.exec('COMMIT');db.close();},5700);",filename],{windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('fixture writer failed '+errors));});});const started=Date.now(),store=createStore({filename});try{assert(Date.now()-started>=5000);store.setServiceHeartbeat('fixture',{status:'running'});assert.equal(store.getServiceHeartbeats()[0].status,'running');}finally{store.close();}await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));}finally{if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:50});}});

test('priced Galaxy is preferred before pagination while both record details and raw coverage remain separate',t=>{const{catalog}=fixture(t),priced=record('A070'),legacy=record('A082');priced.name='Galaxy';legacy.name='Galaxy';legacy.coreInfo.pricing.plans=[];legacy.coreInfo.pricing.relatedCandidates=[{recordId:'A070',identityVerified:false,officialCurrentPriceVerified:false}];legacy.fields=require('../scripts/export-current-inventory.cjs').assess(legacy.coreInfo,null,{});catalog.importRecords({records:[priced,legacy]});const before=catalog.publication().snapshotId,list=catalog.list({q:'Galaxy',limit:'1'});assert.equal(list.items[0].id,'A070');assert.equal(list.total,1);assert.equal(list.totalRecords,2);assert.equal(list.hiddenRelatedRecords,1);const old=catalog.detail('A082').item;assert.equal(old.summary.price,null);assert.equal(old.pricing.plans.length,0);assert.equal(old.presentation.preferredRecordId,'A070');assert.equal(catalog.list({q:'A082'}).items[0].id,'A082');assert.equal(catalog.rawExport().catalog.length,2);assert.equal(catalog.publication().snapshotId,before);});

test('publisher applies a new retained base to an initialized database and preserves reviewed fields',async t=>{
 const {filename,store}=fixture(t),root=path.join(path.dirname(filename),'catalog-input');
 const repository=path.resolve(__dirname,'..');
 for(const file of require('../deploy-service/catalog-db.cjs').RETAINED_INPUTS){
  if(!fs.existsSync(path.join(repository,file)))continue;
  const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repository,file),target);
 }
 const catalog=openCatalogDb({filename,store,root});
 try{
 const prior=catalog.sync();
 const input=path.join(root,'catalog/catalog.v1.json');
 const retained=JSON.parse(fs.readFileSync(input,'utf8'));
 retained.catalog.find(record=>record.id==='A042').name='Refreshed retained record';
 const updated=JSON.stringify(retained);
 fs.writeFileSync(input,updated);
 const transient=Buffer.from(updated.replace('Refreshed retained record','Transient retained record'));
 const readFile=fs.readFileSync;
 let inputReads=0;
 fs.readFileSync=function(file,...args){
  if(file===input&&++inputReads===2)return transient;
  return readFile.call(this,file,...args);
 };
 try{assert.throws(()=>catalog.sync(),/inputs changed during preparation/);}finally{fs.readFileSync=readFile;}
 assert.equal(catalog.publication().snapshotId,prior.snapshotId);
 const other=openCatalogDb({filename,store,root});
 const originalList=store.listEvidence;
 let newer;
 store.listEvidence=(...args)=>{
  store.listEvidence=originalList;
  newer=other.importRecords({records:[record('A001')]}).snapshotId;
  return originalList(...args);
 };
 try{assert.throws(()=>catalog.sync(),/publication changed during preparation/);}finally{store.listEvidence=originalList;other.close();}
 assert.equal(catalog.publication().snapshotId,newer);
 const siteId='A042',refund={status:'observed',summary:'Reviewed policy',sourceIds:[]};
 store.seedSites([{recordId:siteId,entryUrl:'https://example.com/'}]);
 const evidence=store.saveEvidence({siteId,url:'https://example.com/policy',body:'reviewed fixture policy',observedAt:'2026-11-24T00:00:00Z'});
 refund.sourceIds=[evidence.id];refund.observedAt=evidence.observedAt;
 const proposal=store.createProposal({siteId,patch:{refund},evidenceIds:[evidence.id],expectedRevision:0});
 store.reviewProposal(proposal.id,{approved:true,reviewer:'test',expectedRevision:0});
 const publisher=require('../deploy-service/publication-worker.cjs').openPublicationWorker({filename,root});
 const control=new(require('node:sqlite').DatabaseSync)(filename);
 try{
 control.exec("CREATE TRIGGER reject_heartbeat BEFORE INSERT ON service_heartbeats WHEN NEW.name='publisher' BEGIN SELECT RAISE(ABORT,'fixture heartbeat failure'); END");
 const publication=await publisher.sync();
 control.exec('DROP TRIGGER reject_heartbeat');
 assert.equal(publication.status,'published');
 assert.notEqual(publication.snapshotId,prior.snapshotId);
 const detail=catalog.detail(siteId).item;
 assert.equal(detail.name,'Refreshed retained record');
 assert.equal(detail.refund.summary,'Reviewed policy');
 assert.ok(detail.sources.some(source=>source.id===evidence.id&&source.observedAt===evidence.observedAt));
 assert.equal(catalog.sync().status,'unchanged');
 fs.writeFileSync(input,'{');
 await assert.rejects(publisher.sync(),/publication_sync_failed/);
 assert.equal(catalog.publication().snapshotId,publication.snapshotId);
 fs.writeFileSync(input,JSON.stringify(retained));
 assert.equal((await publisher.sync()).status,'unchanged');
 }finally{control.close();await publisher.close();}
 }finally{catalog.close();}
});

test('card response omits detail fields and admin evidence detail reads only the requested body',async t=>{
 const {catalog,store}=fixture(t);
 catalog.importRecords({records:[record()]});
 store.seedSites([{recordId:'A001',entryUrl:'https://example.com/'}]);
 const selected=store.saveEvidence({siteId:'A001',url:'https://example.com/a',body:'fixture one',observedAt:'2026-11-24T00:00:00Z'});
 store.saveEvidence({siteId:'A001',url:'https://example.com/b',body:'fixture two',observedAt:'2026-11-25T00:00:00Z'});
 store.listEvidence=()=>{throw Error('full evidence list should not run');};
 const server=createServer({store,catalogDb:catalog,adminToken:'fixture-admin'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const head=await fetch(base+'/api/catalog',{method:'HEAD'});
 assert.equal(head.status,200);
 assert.equal(await head.text(),'');
 const full=await (await fetch(base+'/api/catalog')).json();
 assert.equal(full.items[0].pricing.plans.length,1);
 assert.ok(full.items[0].fields);
 assert.equal((await fetch(base+'/api/catalog?view=unknown')).status,400);
 const page=await (await fetch(base+'/api/catalog?view=card')).json();
 assert.equal(page.items[0].name,'Synthetic A001');
 assert.equal(page.items[0].pricing,undefined);
 assert.equal(page.items[0].fields,undefined);
 assert.equal(page.items[0].sourceCount,undefined);
 const result=await (await fetch(base+'/api/admin/evidence?id='+selected.id,{headers:{Authorization:'Bearer fixture-admin'}})).json();
 assert.equal(result.item.body,'fixture one');
 assert.equal(result.item.observations.length,1);
});
