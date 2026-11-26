'use strict';
const crypto = require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function workerSchema(db){db.exec('CREATE TABLE IF NOT EXISTS measurement_worker_claims(run_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS measurement_late_submissions(run_id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL,received_at TEXT NOT NULL); CREATE TRIGGER IF NOT EXISTS measurement_late_no_update BEFORE UPDATE ON measurement_late_submissions BEGIN SELECT RAISE(ABORT,"append_only_late_submissions"); END; CREATE TRIGGER IF NOT EXISTS measurement_late_no_delete BEFORE DELETE ON measurement_late_submissions BEGIN SELECT RAISE(ABORT,"append_only_late_submissions"); END;');}
function finishAuthoritatively(store,claimed,body){
 const db=store.db;workerSchema(db);
 db.exec('CREATE TABLE IF NOT EXISTS measurement_worker_finish_receipts(run_id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,body TEXT NOT NULL,observation_id TEXT)');
 const run=db.prepare('SELECT * FROM measurement_runs WHERE id=?').get(claimed.runId);
 const revision=run&&db.prepare('SELECT config FROM measurement_profile_revisions WHERE profile_id=? AND revision=?').get(run.profile_id,run.profile_revision);
 if(!run||!revision||claimed.profileRevision!==run.profile_revision||canonical(claimed.profile)!==canonical(JSON.parse(revision.config)))throw Error('measurement_claim_mismatch');
 const profile=JSON.parse(revision.config);
 const normalized={...body,synthetic:profile.synthetic,profileRevision:run.profile_revision,network:profile.network||null,region:profile.region||null,routeId:profile.routeId||null,measurementVerified:profile.synthetic?false:body.measurementVerified===true,methodology:profile.synthetic?'synthetic_loopback_http_fixture':'explicit_http_proxy_https_tunnel_egress_verified_http_transfer',packetLossPct:null};
 const encoded=canonical(body),tokenHash=digest(claimed.token);
 let receipt=db.prepare('SELECT * FROM measurement_worker_finish_receipts WHERE run_id=?').get(run.id);
 if(receipt&&(receipt.token_hash!==tokenHash||receipt.body!==encoded))throw Error('measurement_finish_conflict');
 if(!receipt){
  const current=db.prepare('SELECT * FROM measurement_profiles WHERE id=?').get(run.profile_id);
  const issued=db.prepare('SELECT token_hash FROM measurement_worker_claims WHERE run_id=?').get(run.id);
  if(issued?issued.token_hash!==tokenHash:(!current||current.lease_token!==claimed.token||current.revision!==run.profile_revision||run.status!=='running'))throw Error('measurement_lease_lost');
  db.prepare('INSERT INTO measurement_worker_finish_receipts VALUES(?,?,?,NULL)').run(run.id,tokenHash,encoded);
 }
 let existing=db.prepare('SELECT * FROM measurement_observations WHERE run_id=?').get(run.id);
 if(!existing||JSON.parse(existing.body).reason==='worker_lease_expired'){
  db.exec('BEGIN IMMEDIATE');try{
   existing||=store.settleLateRun(run,profile,claimed.token);
   if(existing){
    db.prepare('INSERT OR IGNORE INTO measurement_late_submissions VALUES(?,?,?,?)').run(run.id,encoded,digest(encoded),new Date().toISOString());
    db.prepare('UPDATE measurement_worker_finish_receipts SET observation_id=? WHERE run_id=?').run(existing.id,run.id);
    db.exec('COMMIT');return{id:existing.id,checkpoint:true,status:'missing',reason:'worker_lease_expired'};
   }
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 if(existing){if(canonical(JSON.parse(existing.body))!==canonical(normalized))throw Error('measurement_finish_conflict');db.prepare('UPDATE measurement_worker_finish_receipts SET observation_id=? WHERE run_id=?').run(existing.id,run.id);return{id:existing.id,sha256:existing.sha256,...JSON.parse(existing.body)};}
 const result=store.finish({...claimed,profile},normalized);
 db.prepare('UPDATE measurement_worker_finish_receipts SET observation_id=? WHERE run_id=?').run(result.id,run.id);return result;
}
const METHODS = new Map([['claim',1],['finish',2],['observations',1],['trafficUsed',1],['enabled',0],['canExecute',0],['profiles',0],['heartbeat',1]]);
function dispatchMeasurementWorker(store, request) {
  if (!request || !METHODS.has(request.method) || !Array.isArray(request.args) || request.args.length !== METHODS.get(request.method)) throw Error('measurement_worker_request_rejected');
  if (request.method === 'claim' && (!request.args[0] || typeof request.args[0] !== 'object' || Array.isArray(request.args[0]))) throw Error('measurement_worker_request_rejected');
  if (request.method === 'finish' && (!request.args[0]?.token || !request.args[0]?.runId || !request.args[1] || typeof request.args[1] !== 'object')) throw Error('measurement_worker_request_rejected');
  if (request.method === 'observations' && request.args[0] != null && typeof request.args[0] !== 'string') throw Error('measurement_worker_request_rejected');
  if (request.method === 'trafficUsed' && (typeof request.args[0] !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(request.args[0]))) throw Error('measurement_worker_request_rejected');
  if (request.method === 'heartbeat' && (!request.args[0] || typeof request.args[0] !== 'object' || Array.isArray(request.args[0]))) throw Error('measurement_worker_request_rejected');
  if(request.method==='finish'&&store.db)return finishAuthoritatively(store,...request.args);
  if(request.method==='claim'&&store.db){workerSchema(store.db);const claim=store.claim(...request.args);if(claim)store.db.prepare('INSERT OR IGNORE INTO measurement_worker_claims VALUES(?,?)').run(claim.runId,digest(claim.token));return claim;}
  return store[request.method](...request.args);
}
function authorizedMeasurementWorker(header, token) {
  if (typeof token !== 'string' || token.length < 32 || typeof header !== 'string') return false;
  const received = Buffer.from(header), expected = Buffer.from('Bearer ' + token);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
function openHttpMeasurementStore({baseUrl,token,fetchImpl=fetch,timeoutMs=10000,outboxDirectory=process.env.COLLECTOR_OUTBOX_DIR?path.join(process.env.COLLECTOR_OUTBOX_DIR,'measurement'):null}={}) {
  const url = new URL('/internal/measurement-worker',baseUrl);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || typeof token !== 'string' || token.length<32) throw Error('invalid_measurement_worker_transport');
  const call=async(method,args)=>{
    let response;try{response=await fetchImpl(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({method,args}),signal:AbortSignal.timeout(timeoutMs)});}catch(error){throw require('../lib/service-api-recovery.cjs').wrap(error);}
    if (!response.ok){const error=Error('measurement_worker_api_unavailable');error.status=response.status;throw error;}
    const result=await response.json();
    if (result?.ok!==true) throw Error('measurement_worker_api_rejected');
    return result.value;
  };
  if(outboxDirectory)fs.mkdirSync(outboxDirectory,{recursive:true,mode:0o700});
  const hold=filename=>{
    const target=filename.replace(/\.json$/,'.review-required.json');
    fs.renameSync(filename,fs.existsSync(target)?filename.replace(/\.json$/,'.review-required-'+crypto.randomUUID()+'.json'):target);
  };
  async function deliver(filename,args){
    try{const result=await call('finish',args);fs.unlinkSync(filename);return result;}
    catch(error){
      if(![400,409,413,422].includes(error.status))throw error;
      hold(filename);
      return {status:'submission_review_required'};
    }
  }
  let flushing=null;
  const flush=()=>flushing??=(async()=>{if(!outboxDirectory)return;for(const filename of fs.readdirSync(outboxDirectory).filter(x=>/^[a-f0-9]{64}\.json$/.test(x)).sort()){
    const full=path.join(outboxDirectory,filename);
    let request;
    try{request=JSON.parse(fs.readFileSync(full,'utf8'));}
    catch(error){if(error.code==='ENOENT')continue;if(!(error instanceof SyntaxError))throw error;hold(full);continue;}
    if(request?.method!=='finish'||!Array.isArray(request.args)||request.args.length!==2){hold(full);continue;}
    await deliver(full,request.args);
  }})().finally(()=>{flushing=null;});
  const store={close(){},flush};
  for (const [method] of METHODS) store[method]=async(...args)=>{
    if(method==='claim')await flush();
    if(method!=='finish'||!outboxDirectory)return call(method,args);
    const filename=path.join(outboxDirectory,digest(args[0].runId)+'.json'),encoded=JSON.stringify({method,args});
    if(fs.existsSync(filename)){if(fs.readFileSync(filename,'utf8')!==encoded)throw Error('measurement_outbox_conflict');}
    else{const temp=filename+'.tmp-'+crypto.randomUUID(),fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,encoded);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,filename);}
    return deliver(filename,args);
  };
  return store;
}
module.exports={dispatchMeasurementWorker,authorizedMeasurementWorker,openHttpMeasurementStore};
