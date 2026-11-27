'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createStore}=require('./store.cjs'),{openCatalogDb}=require('./catalog-db.cjs'),{initializeControl}=require('./control-daemon.cjs'),{createControlPlane}=require('./control-plane.cjs');
const {openMeasurementStore}=require('./measurement-store.cjs'),{createServer,publicFacts}=require('./server.cjs');
const {authorizedMeasurementWorker,dispatchMeasurementWorker}=require('./measurement-worker-http.cjs');
const {validateAdminToken}=require('./token-validation.cjs');
const tokenFile=(name,fallback)=>validateAdminToken(fs.readFileSync(process.env[name]||fallback,'utf8'));
async function readJson(req){return require('../lib/read-utf8-json.cjs').readJsonObject(req,{tooLarge:'internal_payload_too_large',invalid:'internal_payload_invalid'});}
function createThreeServiceApi({filename,adminToken,internalToken,root=path.resolve(__dirname,'..')}={}){
 adminToken=validateAdminToken(adminToken);
 internalToken=validateAdminToken(internalToken);
 if(adminToken===internalToken)throw Error('distinct_service_credentials_required');
 const store=createStore({filename}),catalogDb=openCatalogDb({filename,store,root}),{control,profiles}=initializeControl({store,root}),measurements=openMeasurementStore({filename,executorId:'collector'});
 const plane=createControlPlane({store,control,catalogDb,profiles,facts:publicFacts});
 const {createPublisher}=require('./publisher.cjs');
 const bootstrap=createPublisher({store,catalog:catalogDb,root});
 const bootstrapResult=catalogDb.publication()?null:bootstrap.tick();
 let publicationReconciled=!!bootstrapResult&&(bootstrapResult.status!=='failed'||!!bootstrapResult.publicationResult);
 const publisher=filename===':memory:'?{tick:bootstrap.tick,close:async()=>{}}:require('./publication-worker.cjs').openPublicationWorker({filename,root});
 let publicationInFlight=false;
 async function reconcilePublication(){
  if(publicationInFlight)return;
  publicationInFlight=true;
  try{
   const result=await publisher.tick();
   if(result.status!=='failed'||result.publicationResult)publicationReconciled=true;
  }catch(error){
   const details={reason:'publication_worker_unavailable',networkAccess:false};
   if(typeof error?.workerCode==='string'&&error.workerCode)details.workerCode=error.workerCode.slice(0,64);
   else if(typeof error?.code==='string'&&error.code)details.workerCode=error.code.slice(0,64);
   if(typeof error?.workerName==='string'&&error.workerName)details.workerName=error.workerName.slice(0,64);
   try{store.setServiceHeartbeat('publisher',{status:'error',details});}catch{}
  }finally{publicationInFlight=false;}
 }
 const publicationTimer=setInterval(reconcilePublication,30000);publicationTimer.unref?.();
 let completenessDb=null,cachedSourceProfiles=null;
 function getCompletenessDb(){if(!completenessDb)completenessDb=new(require('node:sqlite').DatabaseSync)(filename,{readOnly:true});return completenessDb;}
 function resetCompletenessDb(){if(completenessDb){try{completenessDb.close();}catch{}completenessDb=null;}}
 function getSourceProfiles(){if(cachedSourceProfiles)return cachedSourceProfiles;try{cachedSourceProfiles=fs.readdirSync(path.join(root,'collection/site-collectors')).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(root,'collection/site-collectors',x),'utf8')));}catch{cachedSourceProfiles=[];}return cachedSourceProfiles;}
 const assistance=require('./browser-assistance-store.cjs').openAssistance({filename,control});
 const discovery=require('./entry-discovery.cjs').createEntryDiscovery({store,filename,catalogDb});
 const retained=require('./retained-performance-inputs.cjs').createRetainedInputs({store,control,catalogDb});
 async function syncPublication(){
  const result=publisher.sync?await publisher.sync():catalogDb.sync();
  publicationReconciled=true;
  return result;
 }
 const server=createServer({store,catalogDb,controlStore:control,measurementStore:measurements,registry:profiles,adminToken,syncPublication,publicationReady:()=>publicationReconciled}),base=server.listeners('request')[0];server.removeAllListeners('request');
 server.once('listening',()=>{if(!publicationReconciled)void reconcilePublication();});
 let lastSchedule=0;
 const webOps={
  assistpoll:()=>assistance.poll(),
  assistlost:x=>assistance.contextLost(x),
  assistcommit(x){let state=assistance.commit(x);if(state.status==='ready'&&state.sessionSaved&&!state.collectionJobId){const p=control.getProfile('A016');if(p.revision!==state.profileRevision||!require('./amy-service-session.cjs').configured(p.config))throw Error('assist_profile_changed');state=assistance.markCollection(state.id,control.enqueue({siteId:'A016',purpose:'validation',actor:'amy_same_service_resume_'+state.id}));}return state;},
  control(){if(Date.now()-lastSchedule>=30000){control.reconcileResolvedCheckpoints();control.reconcileVerifiedCheckpoints();control.tickWeekly();lastSchedule=Date.now();}return control.getControl();},
  claim(x){
   const settings=control.getControl();if(!settings.engineEnabled||settings.executionMode!=='standalone')return{job:null,prior:null};
   const ids=x.pendingJobIds??[];
   if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(id)))throw Object.assign(Error('invalid_pending_job_ids'),{status:400});
   const worker=String(x.worker||'collector-web').slice(0,100),excludedJobIds=new Set(ids);
   const options={worker,leaseMs:180000,siteId:x.siteId,excludedJobIds};
   const job=control.claimBridge({...options,executionMode:'standalone'})||discovery.claim(options);
   if(job&&!job.retainedCaptures){const egress=require('./prpr-web-egress.cjs').selectedProfile(job.site.config,measurements.profiles());if(egress)job.webEgressProfile=egress;}
   return {job,prior:job&&!job.discoveryOnly?store.getSite(job.siteId)?.document||{}:null};
  },
  renew:x=>discovery.isJob(x.jobId)?discovery.renew(x.jobId,x.token,{leaseMs:180000}):control.renewBridge(x.jobId,x.token,{leaseMs:180000}),
  recoverretained:x=>retained.recover(x),
  receive(x){if(discovery.isJob(x.jobId))return discovery.receive(x);const saved=retained.captures(x.jobId);return saved?plane.receive({...x,captures:saved,observationBasis:'retained_reparse'},{trustedRetained:true}):plane.receive(x);},
  heartbeat(x){store.setServiceHeartbeat('standalone_collector',{status:['connected','paused','error','disconnected'].includes(x.status)?x.status:'error',details:{runnerName:'collector-web',executionMode:'standalone',browser:'service_headless',active:Number(x.details?.active)||0,paymentAllowed:false}});return {accepted:true};},
  cancel:x=>discovery.isJob(x.jobId)?discovery.receive({...x,captures:[],checkpoint:{type:'cancelled_by_collector',reason:'Execution cancelled'}}):control.acknowledgeCancellation(x.jobId,x.token,{actor:'collector_web'}),
  complete:x=>discovery.isJob(x.jobId)?discovery.receive({...x,captures:[],checkpoint:x.checkpoint||x.blocker||{type:'entry_discovery_blocked'}}):control.completeBridge(x.jobId,x.token,{status:x.status,blocker:x.blocker,checkpoint:x.checkpoint,actor:'collector_web'}),
  run:x=>discovery.isJob(x.runId)?discovery.get(x.runId):control.getRun(x.runId)||null,
 };
 server.on('request',async(req,res)=>{
  const url=new URL(req.url,'http://api');
  if(url.pathname==='/api/admin/collectors/completeness'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401,{'Cache-Control':'no-store'});res.end('{}');return;}
   if(req.method!=='GET'){res.writeHead(405);res.end();return;}
   try{const db=getCompletenessDb();const sourceProfiles=getSourceProfiles();const report=require('../scripts/collector-completeness-audit.cjs').audit({records:db.prepare('SELECT id,name,is_primary FROM catalog_records').all(),states:db.prepare('SELECT record_id,field,status,material_available FROM catalog_field_states').all(),profiles:plane.list().items,sourceProfiles});report.sourceProfileCount=sourceProfiles.length;report.queues=db.prepare("SELECT purpose,status,count(*) count FROM jobs WHERE status IN ('queued','leased','awaiting_semantic_review') GROUP BY purpose,status").all();report.queueDefinitions={collection:'legacy_queue_not_consumed_by_standalone',validation:'current_validation_queue',managed_collection:'current_managed_queue'};res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(report));}catch{resetCompletenessDb();res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"completeness_audit_unavailable"}');}return;
  }
  if(['/api/admin/assistance-page','/api/admin/assistance-script','/api/admin/assistance/A016'].includes(url.pathname)){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401,{'Cache-Control':'no-store'});res.end('{}');return;}
   if(url.pathname!=='/api/admin/assistance/A016'){
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    const js=url.pathname.endsWith('-script');res.writeHead(200,{'Content-Type':js?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});res.end(fs.readFileSync(path.join(__dirname,'public',js?'assistance.js':'assistance.html')));return;
   }
   try{let result;if(req.method==='GET')result=assistance.current();else if(req.method==='POST'&&req.headers['x-airports-assist']==='1'&&req.headers['sec-fetch-site']!=='cross-site'){
    const input=await readJson(req);if(input.op==='collect'){const current=assistance.current();if(!current||input.id!==current.id||current.status!=='ready'||!current.sessionSaved)throw Error('verification_not_ready');const p=control.getProfile('A016');if(p.revision!==current.profileRevision||!require('./amy-service-session.cjs').configured(p.config))throw Error('profile_changed');result=control.enqueue({siteId:'A016',purpose:'validation',actor:'amy_same_service_verified_handoff'});}else result=assistance.enqueue(input);
   }else{res.writeHead(405);res.end();return;}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch{res.writeHead(409,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"assistance_request_rejected_refresh_current_session"}');}return;
  }
  if(url.pathname==='/api/admin/performance/retained'&&req.method==='POST'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   try{const result=retained.enqueue(await readJson(req));res.writeHead(202,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch{res.writeHead(409);res.end('{"error":"retained_source_request_rejected"}');}return;
  }
  if(url.pathname==='/api/admin/performance/snapshot'&&req.method==='GET'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   const raw=url.searchParams.get('sites'),ids=raw?.split(',');
   if([...url.searchParams.keys()].some(k=>k!=='sites')||url.searchParams.getAll('sites').length>1||ids&&(new Set(ids).size!==ids.length||ids.some(id=>!/^A\d{3}$/.test(id)))){res.writeHead(400);res.end('{"error":"invalid_site_scope"}');return;}
   const selected=new Set(ids||store.listSites().map(s=>s.id));
   const value={profiles:control.listProfiles().filter(p=>selected.has(p.siteId)).map(p=>({siteId:p.siteId,revision:p.revision,config:p.config})),sites:store.listSites().filter(s=>selected.has(s.id)).map(s=>({id:s.id,revision:s.revision,document:s.document}))};
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));return;
  }
  if(url.pathname==='/api/admin/discovery/seeds'&&['GET','POST'].includes(req.method)){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   try{const result=req.method==='GET'?{items:discovery.listSeeds()}:discovery.registerSeed(await readJson(req));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch{res.writeHead(409);res.end('{"error":"discovery_seed_rejected"}');}return;
  }
  if(url.pathname==='/api/admin/discovery/import-retained'&&req.method==='POST'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   try{const x=await readJson(req),result=discovery.importRetained({seedId:x.seedId,captures:x.captures,actor:x.actor});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch{res.writeHead(409);res.end('{"error":"retained_publisher_import_rejected"}');}return;
  }
  if(url.pathname==='/api/admin/discovery/reclassify-retained'&&req.method==='POST'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   try{const x=await readJson(req),result=discovery.reclassifyRetained({jobId:x.jobId,actor:x.actor});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}catch{res.writeHead(409);res.end('{"error":"retained_discovery_review_rejected"}');}return;
  }
  if(url.pathname==='/api/admin/discovery/follow'&&req.method==='POST'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   try{const x=await readJson(req),result=discovery.follow({parentJobId:x.parentJobId,evidenceId:x.evidenceId,url:x.url,repairBlockedNavigation:x.repairBlockedNavigation===true,actor:x.actor||'admin_publisher_evidence_follow'});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch{res.writeHead(409);res.end('{"error":"publisher_follow_rejected"}');}return;
  }
  if(url.pathname==='/api/admin/discovery'&&req.method==='POST'){
   if(!authorizedMeasurementWorker(req.headers.authorization,adminToken)){res.writeHead(401);res.end('{}');return;}
   try{const x=await readJson(req);const result=discovery.enqueue({seedId:x.seedId,actor:x.actor||'admin_entry_discovery'});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch{res.writeHead(409);res.end('{"error":"discovery_request_rejected"}');}return;
  }
  if(!url.pathname.startsWith('/internal/')){if(['/health','/ready'].includes(url.pathname)||url.pathname.startsWith('/api/'))return base(req,res);res.writeHead(404);res.end('Not found');return;}
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='POST'||!authorizedMeasurementWorker(req.headers.authorization,internalToken)){send(401,{error:'internal_auth_required'});return;}
  try{
   if(url.pathname==='/internal/web-collector/receivebatches'){
    if(req.headers['content-type']!=='application/x-ndjson')return send(415,{error:'internal_payload_invalid'});
    const packet=await require('../lib/collector-submission.cjs').readSubmissionBatches(req);
    return send(200,await webOps.receive(packet));
   }
   const input=await readJson(req);
   if(url.pathname==='/internal/measurement-worker'){const value=await dispatchMeasurementWorker(measurements,input);send(200,{ok:true,value:value===undefined?null:value});return;}
   const match=url.pathname.match(/^\/internal\/web-collector\/([a-z]+)$/);if(match&&Object.hasOwn(webOps,match[1])){send(200,await webOps[match[1]](input));return;}
   send(404,{error:'internal_operation_not_found'});
  }catch(error){
   const sqliteCode=Number.isInteger(error?.errcode)?error.errcode&0xff:null;
   if(sqliteCode===5||sqliteCode===6||['SQLITE_BUSY','SQLITE_LOCKED'].includes(error?.code))return send(503,{ok:false,error:'internal_storage_temporarily_unavailable'});
   if(url.pathname==='/internal/web-collector/renew'&&['Bridge lease lost','Entry discovery lease lost','Entry discovery lease expired'].includes(error?.message))return send(409,{ok:false,error:'collector_lease_unavailable'});
   if(error?.message==='internal_payload_too_large')return send(413,{ok:false,error:'internal_payload_too_large'});
   send([400,413].includes(error?.status)?error.status:409,{ok:false,error:'internal_request_rejected'});
  }
 });
 server.on('close',()=>{clearInterval(publicationTimer);resetCompletenessDb();void publisher.close();assistance.close();discovery.close();measurements.close();control.close();catalogDb.close();store.close();});
 // Match the existing close callback contract: callers may remove the SQLite
 // files as soon as it fires, including on Windows where open handles block removal.
 const closeServer=server.close.bind(server);
 server.close=function(callback){
  if(typeof callback!=='function')return closeServer(callback);
  return closeServer(error=>{
   if(error)return callback.call(server,error);
   publisher.close().then(()=>callback.call(server),failure=>callback.call(server,failure));
  });
 };
 return {server,store,control,measurements,catalogDb,publisher};
}
if(require.main===module){try{
 const filename=process.env.STORE_FILE||'/data/airports.sqlite';process.env.SINGLE_DATABASE='true';
 const app=createThreeServiceApi({filename,adminToken:tokenFile('ADMIN_TOKEN_FILE','/run/secrets/admin-token'),internalToken:tokenFile('INTERNAL_TOKEN_FILE','/run/secrets/internal-token')});
 app.server.listen(Number(process.env.PORT||8080),process.env.HOST||'0.0.0.0',()=>console.log(JSON.stringify({service:'api',status:'ready',singleDatabase:true})));
 const stop=()=>app.server.close(()=>process.exit(0));process.once('SIGTERM',stop);process.once('SIGINT',stop);
}catch{console.error('Three-service API startup failed; private details suppressed.');process.exitCode=1;}}
module.exports={createThreeServiceApi};
