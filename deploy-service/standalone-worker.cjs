'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {collectStandalone,redact,pageBlockType}=require('./standalone-collector.cjs');
async function collectWithReferences(site,options){options={...options,jobBudgetMs:require('./wget-shape-challenge.cjs').jobBudget(site.config||site,options.jobBudgetMs||35000)};options.jobBudgetMs=require('../lib/ninecloud-native-policy.cjs').jobBudget(site.config||site,options.jobBudgetMs);options.jobBudgetMs=require('./biubiu-verification.cjs').jobBudget(site.config||site,options.jobBudgetMs);if(require('../lib/forest-session-proof.cjs').configured(site.config||site))options.jobBudgetMs=Math.max(options.jobBudgetMs,90000);if(require('./prpr-public-capabilities.cjs').configured(site.config||site)&&(site.config||site).webEgress==='authenticated_local_proxy')options.jobBudgetMs=Math.max(options.jobBudgetMs,90000);options.jobBudgetMs=require('./public-browser-environment.cjs').jobBudget(site.config||site,options.jobBudgetMs);if(require('./registered-field-sources.cjs').specFor(site.config||site))options.jobBudgetMs=Math.max(options.jobBudgetMs,90000);const collect=options.collect||collectStandalone,publicScope=site.publicReferencesOnly===true;if(publicScope&&(site.id==='A159'||site.config?.publicReferenceEnabled!==true||!site.config?.publicReferenceFields?.length))throw Error('Public reference scope not enabled');const primary=publicScope?{captures:[],checkpoint:null,capabilities:{publicReferenceOnly:{status:'explicit_scoped_read_only'}},ordersCreated:0,paymentExecuted:false}:await require('./registered-field-sources.cjs').collect({site,options,collect});if(!publicScope&&site.config?.collectPerformanceReferences!==true)return primary;const refs=await require('./performance-reference-runner.cjs').collectPerformanceReferences({site,prior:options.prior,browser:options.browser,collect,beforePage:options.beforePage,jobBudgetMs:Math.min(options.jobBudgetMs||35000,35000),requestedFields:publicScope?site.config.publicReferenceFields:site.config.performanceReferenceFields}),policy=require('../lib/performance-source-policy.cjs'),referenceCaptures=(refs.captures||[]).filter(c=>policy.registeredReference(c.url,site.id||site.config.recordId)).map(c=>({...c,kind:['verification_checkpoint','auth_checkpoint'].includes(c.kind)?c.kind:'public_performance_reference',metadata:{...c.metadata,authenticationObserved:false,performanceReference:true}}));return{...primary,checkpoint:primary.checkpoint||(publicScope?refs.checkpoints.find(c=>c.type!=='performance_reference_no_new_snapshot'):null)||null,captures:[...(primary.captures||[]),...referenceCaptures].slice(0,8),performanceReferences:refs,capabilities:{...primary.capabilities,...refs.capabilities,referenceCollection:{status:refs.checkpoints.some(c=>c.type!=='performance_reference_no_new_snapshot')?'partial_blocked':'observed',checkpointTypes:refs.checkpoints.map(c=>c.type)}},ordersCreated:primary.ordersCreated||0,paymentExecuted:primary.paymentExecuted===true};}
function partialReparseEligibility(material,accepted){if(accepted?.status!=='blocked'||material?.retainedSubmissionGuard)return null;const bodies=(material?.captures||[]).filter(c=>['operator_visible_page','authorized_account_page','rendered_public_or_authorized_page','public_performance_reference'].includes(c.kind));if(!bodies.length||bodies.some(c=>pageBlockType({body:c.body,...c.metadata})))return null;const readable=bodies.filter(c=>typeof c.body==='string'&&c.body.trim());return readable.length?readable:null;}
function partialChildGuard(output,job,control){try{const marker=JSON.parse(fs.readFileSync(path.join(output,'partial-reparse-child-'+job.jobId+'.json'),'utf8'));if(marker.childJobId===job.jobId&&marker.siteId===job.siteId&&marker.actor==='standalone_partial_source_reparse')return marker;}catch{}const event=control.listEvents?.({limit:1000}).find(e=>e.type==='job_enqueued'&&e.jobId===job.jobId&&e.siteId===job.siteId&&e.actor==='standalone_partial_source_reparse');return event?{siteId:job.siteId,childJobId:job.jobId,actor:event.actor}:null;}
function batchNeedsBackoff(results){return !Array.isArray(results)||!results.some(result=>result?.jobId);}
function isBusyError(error){return /SQLITE_BUSY|SQLITE_LOCKED|database (?:table )?is locked|database is busy/i.test(String(error?.message||error));}
async function retryDatabase(action,{attempts=4,maxElapsedMs=30000,delayMs=200,sleep=ms=>new Promise(r=>setTimeout(r,ms)),clock=Date.now}={}){
 const started=clock();for(let n=0;;n++){try{return await action();}catch(error){if(!isBusyError(error)||n>=attempts-1||clock()-started>=maxElapsedMs)throw error;await sleep(Math.min(1000,delayMs*2**n));}}
}
function runDirectory(output,job){for(const value of [job.siteId,job.jobId,job.runId])if(typeof value!=='string'||!/^[a-zA-Z0-9_-]+$/.test(value))throw Error('unsafe_run_identity');return path.join(output,[job.siteId,job.jobId,job.runId].join('-'));}
function verifiedRetainedMaterial(dir,job){try{const receipt=JSON.parse(fs.readFileSync(path.join(dir,'receipt.json'),'utf8'));if(receipt.siteId!==job.siteId||receipt.jobId!==job.jobId||!Array.isArray(receipt.captures)||receipt.captures.length===0)return false;return receipt.captures.every(item=>{if(typeof item.file!=='string'||!/^capture-\d+\.json$/.test(item.file))return false;const capture=JSON.parse(fs.readFileSync(path.join(dir,item.file),'utf8'));return typeof capture.body==='string'&&capture.body.trim().length>0&&typeof capture.sha256==='string'&&/^[a-f0-9]{64}$/.test(capture.sha256)&&crypto.createHash('sha256').update(capture.body).digest('hex')===capture.sha256;});}catch{return false;}}
function earlierPending(output,job,currentDir){
 if(!fs.existsSync(output))return null;const prefix=job.siteId+'-'+job.jobId;
 for(const item of fs.readdirSync(output,{withFileTypes:true})){if(!item.isDirectory()||item.name!==prefix&&!item.name.startsWith(prefix+'-'))continue;const dir=path.join(output,item.name);if(dir===currentDir||fs.existsSync(path.join(dir,'accepted.json')))continue;let pending=['pending-submission.json','review-required-submission.json'].some(file=>fs.existsSync(path.join(dir,file)));try{pending||=isBusyError(JSON.parse(fs.readFileSync(path.join(dir,'runtime-error.json'),'utf8')).reason);}catch{}if(pending&&verifiedRetainedMaterial(dir,job))return dir;}return null;
}
function createStandaloneWorker({store,control,plane,browserFactory,collect=collectStandalone,root=path.resolve(__dirname,'..'),workerName='standalone-service',output=path.join(root,'work/standalone-collection-20261110'),jobBudgetMs=35000,credentialsFile,sessionDir,heartbeatWrite,retryOptions={},log=value=>console.log(JSON.stringify(value))}={}){
 let browser=null,browserPromise=null,stopping=false,active=0,lastHeartbeatFailure=0;const outcomes=[];
 const safeLog=value=>{try{log(value);}catch{}};
 const beat=(status,reason)=>{try{const value={status,details:{runnerName:workerName,executionMode:'standalone',paymentAllowed:false,browser:'service_headless',active,reason:reason||null}};if(heartbeatWrite)heartbeatWrite('standalone_collector',value);else store.setServiceHeartbeat('standalone_collector',value);return true;}catch(error){if(Date.now()-lastHeartbeatFailure>10000){lastHeartbeatFailure=Date.now();safeLog({service:'standalone_collector',status:'heartbeat_deferred',reason:isBusyError(error)?'sqlite_busy':'heartbeat_write_failed'});}return false;}};
 const retry=(action,extra={})=>retryDatabase(action,{...retryOptions,...extra});
 async function ensureBrowser(){if(browser?.isConnected?.()===false)browser=null;if(browser)return browser;if(!browserPromise)browserPromise=Promise.resolve().then(browserFactory).then(b=>(browser=b)).finally(()=>{browserPromise=null;});return browserPromise;}
 async function runOne({siteId}={}){
  let job;
  try{const settings=await retry(()=>control.getControl());if(stopping||!settings.engineEnabled||settings.executionMode!=='standalone'){beat('paused','execution_disabled_or_other_mode');return{status:'paused'};}
   try{await ensureBrowser();}catch{beat('error','service_browser_startup_failed');safeLog({service:'standalone_collector',status:'error',reason:'service_browser_startup_failed'});return{status:'error',reason:'service_browser_startup_failed'};}
   job=await retry(()=>control.claimBridge({worker:workerName,executionMode:'standalone',siteId,leaseMs:180000}));if(!job){beat('connected');return{status:'idle'};}
  }catch(error){beat('error',isBusyError(error)?'sqlite_busy':'claim_failed');safeLog({service:'standalone_collector',status:'claim_deferred',reason:isBusyError(error)?'sqlite_busy':'claim_failed'});return{status:'error',reason:isBusyError(error)?'sqlite_busy':'claim_failed'};}
  active++;beat('connected');let renewalError=null,renewalPromise=null;
  const renew=()=>retry(()=>control.renewBridge(job.jobId,job.token,{leaseMs:180000}),{maxElapsedMs:12000,attempts:2});
  const heartbeat=setInterval(()=>{if(renewalPromise)return;renewalPromise=renew().then(()=>{beat('connected');}).catch(error=>{if(!isBusyError(error))renewalError=error;else safeLog({service:'standalone_collector',siteId:job.siteId,status:'renewal_deferred',reason:'sqlite_busy'});}).finally(()=>{renewalPromise=null;});},20000);
  const beforePage=async()=>{if(stopping)throw Error('standalone_execution_paused');if(renewalPromise)await renewalPromise;if(renewalError)throw renewalError;const c=await retry(()=>control.getControl(),{maxElapsedMs:12000,attempts:2});if(c.executionMode!=='standalone'||!c.engineEnabled)throw Error('standalone_execution_paused');await renew();};
  const dir=runDirectory(output,job);fs.mkdirSync(dir,{recursive:true});let result;
  const pendingFile=path.join(dir,'pending-submission.json'),removePending=()=>{try{fs.unlinkSync(pendingFile);}catch{}};
  const summarize=(accepted,material,extra={})=>({siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:accepted.status,proposalId:accepted.proposalId||null,pages:(material?.captures||[]).filter(c=>!c.kind.endsWith('checkpoint')).length,checkpoint:material?.checkpoint?.type||null,...extra});
  async function recoverAcceptedPartial(accepted,material){
   const sources=partialReparseEligibility(material,accepted);if(!sources||typeof plane.reparseRetained!=='function')return null;
   const attemptFile=path.join(dir,'partial-reparse-attempt.json'),receiptFile=path.join(dir,'partial-reparse.json');
   if(fs.existsSync(attemptFile)||fs.existsSync(receiptFile))return{status:'prior_attempt_preserved',receipt:'partial-reparse.json'};
   const receipt={siteId:job.siteId,originalJobId:job.jobId,originalRunId:job.runId,actor:'standalone_partial_source_reparse',observationBasis:'retained_reparse',networkAccessed:false,originalRunModified:false,automaticallyApproved:false,sources:sources.map(c=>({url:c.url,observedAt:c.observedAt,bodySha256:crypto.createHash('sha256').update(c.body).digest('hex')}))};
   let priorRunIds=null;
   try{
    const settings=control.getControl(),original=control.getRun(job.runId),profile=control.getProfile(job.siteId),site=store.getSite(job.siteId);
    if(stopping||!settings.engineEnabled||settings.executionMode!=='standalone')throw Error('partial_reparse_execution_paused');
    if(!original||original.status!=='blocked'||original.jobId!==job.jobId||original.siteId!==job.siteId||original.capabilities?.dataBasis?.status!=='standalone_browser'||!original.evidenceIds?.length||!accepted.evidenceIds?.length||accepted.evidenceIds.some(id=>!original.evidenceIds.includes(id)))throw Error('partial_reparse_current_accepted_source_binding_required');
    if(original.profileRevision!==job.profileRevision||profile?.revision!==job.profileRevision||original.siteRevision!==job.siteRevision||site?.revision!==job.siteRevision)throw Error('partial_reparse_source_version_changed');
    // This operation enqueues and claims its own child synchronously. Never retry it:
    // an exception can occur after enqueue, and another attempt could duplicate work.
    fs.writeFileSync(attemptFile,JSON.stringify({...receipt,status:'attempt_started',createdAt:new Date().toISOString()},null,2),{flag:'wx'});
    priorRunIds=new Set(control.listRuns({siteId:job.siteId,limit:1000}).map(r=>r.runId));
    const child=await plane.reparseRetained(job.siteId,job.runId,{reviewer:receipt.actor});
    const run=child.run||{},status=child.status==='awaiting_semantic_review'?'proposal_pending':child.status==='completed'?'completed': 'recovery_required';
    Object.assign(receipt,{status,childRunId:run.runId||run.id||null,childJobId:child.jobId||run.jobId||null,childStatus:child.status,proposalId:child.proposalId||null,capabilities:run.capabilities||null,outcome:run.outcome||null});
    if(status==='recovery_required')receipt.checkpoint={type:'retained_partial_reparse_requires_recovery',reason:'原文重解析子任务未正常完成，保留其自身断点；不得重新采集冒充新观察'};
   }catch(error){Object.assign(receipt,{status:'recovery_required',checkpoint:{type:'retained_partial_reparse_requires_recovery',reason:redact(error.message).slice(0,400),requestedAction:'复核本次已接收原文与子任务/版本/队列状态，显式恢复原文重解析；不自动重新采集'}});}
   if(priorRunIds)try{const owned=new Set(control.listEvents({limit:1000}).filter(e=>e.type==='job_enqueued'&&e.siteId===job.siteId&&e.actor===receipt.actor).map(e=>e.jobId));receipt.ownedChildJobs=control.listRuns({siteId:job.siteId,limit:1000}).filter(r=>!priorRunIds.has(r.runId)&&owned.has(r.jobId)).map(r=>({childJobId:r.jobId,childRunId:r.runId,status:r.status}));for(const child of receipt.ownedChildJobs){const marker=path.join(output,'partial-reparse-child-'+child.childJobId+'.json');if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({siteId:job.siteId,originalRunId:job.runId,actor:receipt.actor,...child},null,2),{flag:'wx'});}}catch(error){receipt.childGuardReceiptError=redact(error.message).slice(0,200);}
   receipt.finishedAt=new Date().toISOString();try{fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2),{flag:'wx'});}catch(error){safeLog({service:'standalone_partial_reparse',siteId:job.siteId,originalRunId:job.runId,status:'receipt_write_failed',reason:redact(error.message).slice(0,200)});}
   safeLog({service:'standalone_partial_reparse',...receipt});return{status:receipt.status,childRunId:receipt.childRunId||null,proposalId:receipt.proposalId||null,receipt:'partial-reparse.json'};
  }
  let material;
  try{
   const prior=earlierPending(output,job,dir),partialChild=partialChildGuard(output,job,control);
   material=partialChild?{captures:[],checkpoint:{type:'retained_partial_reparse_requires_recovery',url:job.site.config.entryUrl,stage:'retained_reparse_recovery',reason:'原文重解析子任务遗留待恢复；禁止将其转为普通网络采集',requestedAction:'按partial-reparse.json复核原文与子任务后显式恢复；不重复采集'},capabilities:{},retainedSubmissionGuard:true,partialChildGuard:partialChild,ordersCreated:0,paymentExecuted:false}:prior?{captures:[],checkpoint:{type:'retained_submission_requires_recovery',url:job.site.config.entryUrl,stage:'storage_recovery',reason:'前一租约已有采集原文待提交；保留旧run目录，未重复浏览或自动跨版本采纳',requestedAction:'复核原run的receipt与capture后显式恢复原文；不得重新采集冒充新观察'},capabilities:{},retainedSubmissionGuard:true,priorRunDirectory:path.basename(prior),ordersCreated:0,paymentExecuted:false}:await collectWithReferences(job.site,{browser,credentialsFile,sessionDir,jobBudgetMs,beforePage,collect,prior:store.getSite?.(job.siteId)?.document||{}});
   const captures=material.captures||[];
   for(const [i,c]of captures.entries())fs.writeFileSync(path.join(dir,'capture-'+i+'.json'),JSON.stringify({...c,sha256:crypto.createHash('sha256').update(c.body).digest('hex')},null,2),{flag:'wx'});
   fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({siteId:job.siteId,jobId:job.jobId,runId:job.runId,profileRevision:job.profileRevision,siteRevision:job.siteRevision,executionMode:'standalone',...material,captures:captures.map((c,i)=>({url:c.url,observedAt:c.observedAt,kind:c.kind,file:'capture-'+i+'.json'}))},null,2),{flag:'wx'});
   fs.writeFileSync(pendingFile,JSON.stringify({siteId:job.siteId,jobId:job.jobId,runId:job.runId,profileRevision:job.profileRevision,siteRevision:job.siteRevision,createdAt:new Date().toISOString(),receipt:'receipt.json',state:'pending_database_submission'},null,2),{flag:'wx'});
   await retry(()=>control.renewBridge(job.jobId,job.token,{leaseMs:180000}),{maxElapsedMs:12000,attempts:2});
   const packet={jobId:job.jobId,token:job.token,captures,checkpoint:material.checkpoint,capabilities:material.capabilities,observationBasis:material.retainedSubmissionGuard?'retained_reparse':material.browser==='service_native_api'?'standalone_native_api':'standalone_browser',worker:workerName};
   const accepted=await retry(()=>plane.receive(packet),{maxElapsedMs:45000,attempts:4});result=summarize(accepted,material);removePending();
   fs.writeFileSync(path.join(dir,'accepted.json'),JSON.stringify(result,null,2),{flag:'wx'});
   clearInterval(heartbeat);const partial=await recoverAcceptedPartial(accepted,material);if(partial)result.partialReparse=partial;
  }catch(error){
   if(isBusyError(error)){result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:'submission_deferred',reason:'sqlite_busy_original_material_retained',receiptDirectory:path.basename(dir)};}
   else if(error.message==='Job cancellation requested'){
    try{const ack=await retry(()=>control.acknowledgeCancellation(job.jobId,job.token,{actor:workerName}),{maxElapsedMs:12000,attempts:2});result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:ack.status,reason:'operator_cancelled'};removePending();}
    catch(ackError){result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:isBusyError(ackError)?'submission_deferred':'result_rejected',reason:isBusyError(ackError)?'sqlite_busy_cancellation_ack_pending':redact(ackError.message).slice(0,300)};}
   }else{
    result={siteId:job.siteId,jobId:job.jobId,runId:job.runId,status:'result_rejected',reason:redact(error.message).slice(0,300)};
    let terminal;try{terminal=control.getRun?.(job.runId);}catch{}
    if(terminal&&terminal.jobId===job.jobId&&terminal.siteId===job.siteId&&['completed','blocked','awaiting_semantic_review','review_approved','review_rejected','cancelled'].includes(terminal.status)){result=summarize(terminal,material,{acceptanceRecoveredFromDatabase:true});removePending();}
    else try{await retry(()=>control.completeBridge(job.jobId,job.token,{status:'blocked',blocker:'standalone_execution_error',checkpoint:{type:'standalone_execution_error',url:job.site.config.entryUrl,stage:'runtime',reason:result.reason,requestedAction:'修复本站执行错误后恢复，其他站点继续'},actor:workerName}),{maxElapsedMs:12000,attempts:2});result.status='blocked';removePending();}catch{}
   }
   try{fs.writeFileSync(path.join(dir,'runtime-error.json'),JSON.stringify(result,null,2),{flag:'wx'});}catch{}
  }finally{
   clearInterval(heartbeat);active--;beat(stopping?'paused':'connected');
   if(result){outcomes.push(result);safeLog({service:'standalone_collector',...result});}
   try{fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({updatedAt:new Date().toISOString(),active,results:outcomes},null,2));}catch{safeLog({service:'standalone_collector',status:'progress_write_failed'});}
  }
  return result;
 }
 async function tick({limit=2,concurrency=2,siteId}={}){const out=[];for(let i=0;i<limit;i+=concurrency){const batch=await Promise.all(Array.from({length:Math.min(concurrency,limit-i)},()=>runOne({siteId})));out.push(...batch);if(batch.every(r=>['paused','idle','error'].includes(r.status)))break;}return out;}
 async function stop(){stopping=true;if(browserPromise)await browserPromise.catch(()=>{});if(browser)await browser.close().catch(()=>{});browser=null;beat('paused','service_stopped');}
 return{runOne,tick,stop,noteError:reason=>beat('error',reason),status:()=>({active,stopping,processed:outcomes.length})};
}
async function main(){
 const root=path.resolve(__dirname,'..');if(fs.existsSync(path.join(__dirname,'.env')))process.loadEnvFile(path.join(__dirname,'.env'));
 const {createStore}=require('./store.cjs'),{initializeControl}=require('./control-daemon.cjs'),{openCatalogDb}=require('./catalog-db.cjs'),{createControlPlane}=require('./control-plane.cjs'),{DatabaseSync}=require('node:sqlite');
 let store,control,catalogDb,heartbeatDb,runner,inFlight=null,closing=false;
 const close=async()=>{if(closing)return;closing=true;try{await runner?.stop();}catch{}if(inFlight)await inFlight.catch(()=>{});try{heartbeatDb?.close();}catch{}try{catalogDb?.close();}catch{}try{control?.close();}catch{}try{store?.close();}catch{}};
 try{
  store=await retryDatabase(()=>createStore({filename:process.env.STORE_FILE||path.join(__dirname,'data/collector.sqlite')}),{attempts:3,maxElapsedMs:45000});
  const initialized=await retryDatabase(()=>initializeControl({store,root}),{attempts:3,maxElapsedMs:45000});control=initialized.control;
  catalogDb=await retryDatabase(()=>openCatalogDb({filename:store.filename,store}),{attempts:3,maxElapsedMs:45000});const plane=createControlPlane({store,control,catalogDb,profiles:initialized.profiles});
  heartbeatDb=new DatabaseSync(store.filename);heartbeatDb.exec('PRAGMA busy_timeout=100;');
  const writeHeartbeat=heartbeatDb.prepare('INSERT INTO service_heartbeats(name,status,details_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET status=excluded.status,details_json=excluded.details_json,updated_at=excluded.updated_at');
  const heartbeatWrite=(name,value)=>writeHeartbeat.run(name,value.status,JSON.stringify(value.details),new Date().toISOString());
  const browserFactory=async()=>{const {chromium}=require('playwright');return chromium.launch({headless:true,timeout:20000,downloadsPath:path.join(__dirname,'data/standalone-downloads-disabled')});};
  const jobBudgetMs=Number(process.env.STANDALONE_JOB_BUDGET_MS||35000);if(!Number.isInteger(jobBudgetMs)||jobBudgetMs<1000||jobBudgetMs>180000)throw Error('invalid_standalone_job_budget');
  runner=createStandaloneWorker({store,control,plane,browserFactory,root,heartbeatWrite,credentialsFile:process.env.CREDENTIALS_FILE,sessionDir:process.env.STANDALONE_SESSION_DIR,jobBudgetMs});
  process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
  const rawLimit=process.argv.find(x=>x.startsWith('--limit=')),limitIndex=process.argv.indexOf('--limit'),limit=rawLimit?Number(rawLimit.split('=')[1]):limitIndex>=0?Number(process.argv[limitIndex+1]):Number(process.env.STANDALONE_BATCH_LIMIT||2),concurrency=Number(process.env.STANDALONE_CONCURRENCY||2);
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw Error('invalid_standalone_concurrency');if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('invalid_standalone_batch_limit');
  if(process.argv.includes('--once')){inFlight=runner.tick({limit,concurrency,siteId:process.env.SITE_ID});await inFlight;inFlight=null;return;}
  const pollMs=Number(process.env.STANDALONE_POLL_MS||15000);if(!Number.isInteger(pollMs)||pollMs<1000||pollMs>3600000)throw Error('invalid_standalone_poll_interval');
  while(!closing){inFlight=runner.tick({limit,concurrency,siteId:process.env.SITE_ID});const results=await inFlight.catch(()=>{runner.noteError('tick_failed');console.error(JSON.stringify({service:'standalone_collector',status:'error',reason:'tick_failed'}));return null;});inFlight=null;if(!closing&&batchNeedsBackoff(results))await new Promise(r=>setTimeout(r,pollMs));}
 }finally{await close();}
}
if(require.main===module)main().catch(error=>{const detail=redact(String(error?.message||error)).replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g,'$1[query_removed]').slice(0,200);console.error(JSON.stringify({service:'standalone_collector',status:'error',reason:'service_startup_failed',detail}));process.exitCode=1;});
module.exports={collectWithReferences,createStandaloneWorker,batchNeedsBackoff,isBusyError,retryDatabase,runDirectory,earlierPending,partialReparseEligibility};
