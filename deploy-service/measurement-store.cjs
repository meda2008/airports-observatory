'use strict';
// Separate append-only observations. This database cannot publish catalog facts.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>JSON.parse(v),iso=n=>new Date(n).toISOString();
function cleanProfile(input){
 const keys=['id','siteId','kind','enabled','synthetic','endpoint','proxyUrl','targetUrl','egressUrl','expectedEgressIp','allowedTargetOrigins','routeId','secretRef','identityVerified','network','region','intervalMs','timeoutMs','maxBytes','dailyBudgetBytes'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw Error('unsupported_measurement_profile');
 const p=JSON.parse(JSON.stringify(input));
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(p.id||'')||!/^[A-Za-z0-9_-]{1,80}$/.test(p.siteId||'')||p.siteId==='A159')throw Error('invalid_measurement_identity');
 if(!['bandwidth','stability'].includes(p.kind))throw Error('invalid_measurement_kind');
 p.synthetic=p.synthetic===true;p.enabled=p.enabled===true;p.identityVerified=p.identityVerified===true;
 p.intervalMs??=p.kind==='stability'?60000:86400000;p.timeoutMs??=5000;p.maxBytes??=p.kind==='stability'?1024:1048576;
 if(!Number.isInteger(p.intervalMs)||p.intervalMs<1000||p.intervalMs>30*86400000||!Number.isInteger(p.timeoutMs)||p.timeoutMs<50||p.timeoutMs>30000||!Number.isInteger(p.maxBytes)||p.maxBytes<1||p.maxBytes>(p.kind==='stability'?16384:16*1048576))throw Error('invalid_measurement_budget');
 p.dailyBudgetBytes??=p.kind==='stability'?8*1048576:64*1048576;if(!Number.isInteger(p.dailyBudgetBytes)||p.dailyBudgetBytes<p.maxBytes+1024||p.dailyBudgetBytes>1024*1048576||!p.synthetic&&p.intervalMs<(p.kind==='stability'?10000:3600000))throw Error('invalid_daily_measurement_budget');
 if(p.secretRef!==undefined&&!/^[a-zA-Z0-9_-]{1,80}$/.test(p.secretRef))throw Error('secret_reference_must_be_opaque');
 if(p.network!==undefined&&p.network!==null&&(typeof p.network!=='string'||p.network.length>200)||p.region!==undefined&&p.region!==null&&(typeof p.region!=='string'||p.region.length>100))throw Error('invalid_measurement_context');
 const local=value=>{const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw Error('explicit_loopback_endpoint_required');return u.href;};
 if(p.synthetic){if(p.endpoint)p.endpoint=local(p.endpoint);if(p.proxyUrl)p.proxyUrl=local(p.proxyUrl);}
 else {if(p.endpoint)throw Error('direct_service_measurement_forbidden');if(p.proxyUrl)p.proxyUrl=local(p.proxyUrl);}
 for(const key of ['targetUrl','egressUrl'])if(p[key]){const u=new URL(p[key]);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||[...u.searchParams].some(([k,v])=>!(k==='bytes'&&/^[1-9]\d*$/.test(v)&&Number(v)<=16*1048576||k==='format'&&v==='json')))throw Error('unsafe_measurement_target');if(!p.synthetic&&u.protocol!=='https:')throw Error('production_target_requires_https');p[key]=u.href;}
 if(p.allowedTargetOrigins){if(!Array.isArray(p.allowedTargetOrigins)||p.allowedTargetOrigins.length>8)throw Error('invalid_target_origins');p.allowedTargetOrigins=p.allowedTargetOrigins.map(x=>{const u=new URL(x);if(u.origin+'/'!==u.href||u.username||u.password)throw Error('exact_target_origin_required');return u.origin;});}
 if(p.expectedEgressIp&&!require('node:net').isIP(p.expectedEgressIp))throw Error('invalid_expected_egress_ip');
 if(p.routeId!==undefined&&!/^[A-Za-z0-9_-]{1,80}$/.test(p.routeId))throw Error('invalid_route_id');
 return p;
}
function openMeasurementStore({filename,now=Date.now,executorId='legacy'}={}){
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(executorId))throw Error('invalid_measurement_executor');
 if(!filename)throw Error('measurement_filename_required');if(filename!==':memory:')fs.mkdirSync(path.dirname(path.resolve(filename)),{recursive:true});
 // A date prefix keeps SQLite's relative time keywords out of the expression index.
 const lateTimestampFilter="json_extract(body,'$.observedAt') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'";
 const db=new DatabaseSync(filename);db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS measurement_control(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0);INSERT OR IGNORE INTO measurement_control(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS measurement_executor_control(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,enabled INTEGER NOT NULL);INSERT OR IGNORE INTO measurement_executor_control VALUES(1,'legacy',1);
 CREATE TABLE IF NOT EXISTS measurement_profiles(id TEXT PRIMARY KEY,config TEXT NOT NULL,revision INTEGER NOT NULL,due_at INTEGER NOT NULL,lease_token TEXT,lease_until INTEGER);
 CREATE TABLE IF NOT EXISTS measurement_profile_revisions(profile_id TEXT NOT NULL,revision INTEGER NOT NULL,config TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(profile_id,revision));
 CREATE TABLE IF NOT EXISTS measurement_runs(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,profile_revision INTEGER NOT NULL,scheduled_at INTEGER NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER,status TEXT NOT NULL,synthetic INTEGER NOT NULL,UNIQUE(profile_id,scheduled_at));
 CREATE TABLE IF NOT EXISTS measurement_observations(id TEXT PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,profile_id TEXT NOT NULL,site_id TEXT NOT NULL,kind TEXT NOT NULL,observed_at TEXT NOT NULL,body TEXT NOT NULL,sha256 TEXT NOT NULL,synthetic INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS measurement_budget_window ON measurement_observations(profile_id,julianday(observed_at));
 CREATE TABLE IF NOT EXISTS measurement_late_submissions(run_id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL,received_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS measurement_late_budget_window
  ON measurement_late_submissions(julianday(json_extract(body,'$.observedAt')))
  WHERE ${lateTimestampFilter};
 CREATE TRIGGER IF NOT EXISTS measurement_late_no_update BEFORE UPDATE ON measurement_late_submissions BEGIN SELECT RAISE(ABORT,'append_only_late_submissions'); END;
 CREATE TRIGGER IF NOT EXISTS measurement_late_no_delete BEFORE DELETE ON measurement_late_submissions BEGIN SELECT RAISE(ABORT,'append_only_late_submissions'); END;
 CREATE TABLE IF NOT EXISTS measurement_proposal_links(id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,observation_ids TEXT NOT NULL,proposal_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(profile_id,observation_ids));
 CREATE TABLE IF NOT EXISTS measurement_worker_status(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL,observed_at TEXT NOT NULL);`);
 db.exec("CREATE TRIGGER IF NOT EXISTS measurement_raw_no_update BEFORE UPDATE ON measurement_observations BEGIN SELECT RAISE(ABORT,'append_only_observations'); END; CREATE TRIGGER IF NOT EXISTS measurement_raw_no_delete BEFORE DELETE ON measurement_observations BEGIN SELECT RAISE(ABORT,'append_only_observations'); END;");
 const profiles=()=>db.prepare('SELECT * FROM measurement_profiles ORDER BY id').all().map(r=>({profile:parse(r.config),revision:r.revision,nextDueAt:iso(r.due_at),leaseExpiresAt:r.lease_until?iso(r.lease_until):null}));
 const enabled=()=>!!db.prepare('SELECT enabled FROM measurement_control WHERE id=1').get().enabled;
 const executionStatus=()=>{const row=db.prepare('SELECT owner,enabled FROM measurement_executor_control WHERE id=1').get();return{owner:row.owner,enabled:!!row.enabled,executorId,canExecute:enabled()&&!!row.enabled&&row.owner===executorId};};
 const canExecute=()=>executionStatus().canExecute;
 function setExecutor({owner,enabled:allowed}={}){if(!/^[A-Za-z0-9_-]{1,80}$/.test(owner||'')||typeof allowed!=='boolean')throw Error('invalid_measurement_executor_control');db.prepare('UPDATE measurement_executor_control SET owner=?,enabled=? WHERE id=1').run(owner,allowed?1:0);return executionStatus();}
 function configure(input){const p=cleanProfile(input),at=now();db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('SELECT * FROM measurement_profiles WHERE id=?').get(p.id);if(row?.lease_until>at)throw Error('measurement_profile_has_active_lease');if(row?.lease_token)settleExpiredLease(row,at);const revision=(row?.revision||0)+1;db.prepare('INSERT INTO measurement_profiles(id,config,revision,due_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,revision=excluded.revision,due_at=excluded.due_at,lease_token=NULL,lease_until=NULL').run(p.id,JSON.stringify(p),revision,at);db.prepare('INSERT INTO measurement_profile_revisions VALUES(?,?,?,?)').run(p.id,revision,JSON.stringify(p),iso(at));db.exec('COMMIT');return{profile:p,revision};}catch(e){db.exec('ROLLBACK');throw e;}}
 function settleMissingRun(run,profile,at){
  const body={status:'missing',reason:'worker_lease_expired',observedAt:iso(at),bytesRead:null,elapsedMs:null,latencyMs:null,synthetic:profile.synthetic,measurementVerified:false,profileRevision:run.profile_revision};
  const observation=saveObservation(run.id,profile,body);
  db.prepare("UPDATE measurement_runs SET status='lease_expired_missing',finished_at=? WHERE id=? AND status='running'").run(at,run.id);
  return observation;
 }
 function settleExpiredLease(row,at){
  if(!row.lease_token||row.lease_until>at)return;
  const run=db.prepare("SELECT * FROM measurement_runs WHERE profile_id=? AND scheduled_at=? AND status='running'").get(row.id,row.due_at);
  const profile=parse(row.config);
  if(run)settleMissingRun(run,profile,at);
  db.prepare('UPDATE measurement_profiles SET due_at=?,lease_token=NULL,lease_until=NULL WHERE id=?').run(at+profile.intervalMs,row.id);
 }
 function settleLateRun(run,profile,token){
  const at=now(),row=db.prepare('SELECT * FROM measurement_profiles WHERE id=?').get(run.profile_id);
  if(run.status!=='running'||(row?.lease_token===token&&row.lease_until>at))return null;
  if(row?.lease_token===token&&row.revision===run.profile_revision&&row.due_at===run.scheduled_at){
   settleExpiredLease(row,at);
   return db.prepare('SELECT id FROM measurement_observations WHERE run_id=?').get(run.id);
  }
  return settleMissingRun(run,profile,at);
 }
 function claim({id,worker='measurement-worker'}={}){const at=now();db.exec('BEGIN IMMEDIATE');try{if(!canExecute()){db.exec('COMMIT');return null;}const r=db.prepare('SELECT * FROM measurement_profiles WHERE due_at<=? AND (lease_until IS NULL OR lease_until<=?) AND (? IS NULL OR id=?) ORDER BY due_at,id').all(at,at,id||null,id||null).find(x=>parse(x.config).enabled);if(!r){db.exec('COMMIT');return null;}const p=parse(r.config),token=crypto.randomUUID(),runId=crypto.randomUUID();if(r.lease_token){settleExpiredLease(r,at);db.exec('COMMIT');return null;}
 const scheduledAt=r.due_at+Math.floor((at-r.due_at)/p.intervalMs)*p.intervalMs;if(db.prepare('SELECT 1 FROM measurement_runs WHERE profile_id=? AND scheduled_at=?').get(r.id,scheduledAt)){db.prepare('UPDATE measurement_profiles SET due_at=? WHERE id=?').run(at+1,r.id);db.exec('COMMIT');return null;}const leaseUntil=at+Math.max(60000,p.timeoutMs*4+10000);db.prepare('UPDATE measurement_profiles SET lease_token=?,lease_until=?,due_at=? WHERE id=?').run(token,leaseUntil,scheduledAt,r.id);db.prepare('INSERT INTO measurement_runs VALUES(?,?,?,?,?,?,?,?)').run(runId,p.id,r.revision,scheduledAt,at,null,'running',p.synthetic?1:0);db.exec('COMMIT');return{runId,profile:p,profileRevision:r.revision,token,worker,leaseUntil};}catch(e){db.exec('ROLLBACK');throw e;}}
 function saveObservation(runId,p,body){const sha256=hash(body),id='measurement-'+hash([runId,sha256]);db.prepare('INSERT OR IGNORE INTO measurement_observations VALUES(?,?,?,?,?,?,?,?,?)').run(id,runId,p.id,p.siteId,p.kind,body.observedAt,JSON.stringify(body),sha256,p.synthetic?1:0);return{id,sha256,...body};}
 function finish(claimed,body){db.exec('BEGIN IMMEDIATE');try{const r=db.prepare('SELECT * FROM measurement_profiles WHERE id=?').get(claimed.profile.id);if(!r||r.lease_token!==claimed.token||r.lease_until<=now()||r.revision!==claimed.profileRevision)throw Error('measurement_lease_lost');const o=saveObservation(claimed.runId,claimed.profile,{...body,synthetic:claimed.profile.synthetic,profileRevision:claimed.profileRevision});db.prepare('UPDATE measurement_runs SET status=?,finished_at=? WHERE id=?').run(body.status,now(),claimed.runId);db.prepare('UPDATE measurement_profiles SET due_at=?,lease_token=NULL,lease_until=NULL WHERE id=?').run(r.due_at+claimed.profile.intervalMs,r.id);db.exec('COMMIT');return o;}catch(e){db.exec('ROLLBACK');throw e;}}
 // Start with the indexed late window, then look up each run's authoritative profile.
 const trafficBudget=db.prepare(`
  SELECT (
   SELECT coalesce(sum(coalesce(json_extract(body,'$.trafficBudgetBytes'),json_extract(body,'$.bytesRead'),0)),0)
   FROM measurement_observations WHERE profile_id=:profileId AND julianday(observed_at)>julianday(:cutoff)
  ) + (
   SELECT total(bytes) FROM (
    SELECT coalesce(json_extract(late.body,'$.trafficBudgetBytes'),json_extract(late.body,'$.bytesRead')) AS bytes
    FROM measurement_late_submissions AS late
    CROSS JOIN measurement_runs AS run ON run.id=late.run_id
    WHERE ${lateTimestampFilter}
     AND julianday(json_extract(late.body,'$.observedAt'))>julianday(:cutoff)
     AND julianday(json_extract(late.body,'$.observedAt'))<=julianday(:through)
     AND run.profile_id=:profileId AND run.status='lease_expired_missing'
     AND coalesce(nullif(json_type(late.body,'$.trafficBudgetBytes'),'null'),json_type(late.body,'$.bytesRead'))='integer'
   ) WHERE bytes BETWEEN 0 AND 9007199254740991
  ) AS bytes`);
 function trafficUsed(profileId){
  const at=now();
  return trafficBudget.get({profileId,cutoff:iso(at-86400000),through:iso(at)}).bytes;
 }
 function requestRun(id){
  const at=now();db.exec('BEGIN IMMEDIATE');
  try{const row=db.prepare('SELECT * FROM measurement_profiles WHERE id=?').get(id);if(!row)throw Error('measurement_profile_missing');if(row.lease_until>at)throw Error('measurement_profile_has_active_lease');if(row.lease_token)settleExpiredLease(row,at);db.prepare('UPDATE measurement_profiles SET due_at=? WHERE id=?').run(at,id);db.exec('COMMIT');return{id,status:'due_not_yet_executed'};}catch(error){db.exec('ROLLBACK');throw error;}
 }
 const observations=id=>db.prepare('SELECT * FROM measurement_observations WHERE (? IS NULL OR profile_id=?) ORDER BY observed_at,id').all(id||null,id||null).map(r=>({id:r.id,runId:r.run_id,profileId:r.profile_id,siteId:r.site_id,kind:r.kind,sha256:r.sha256,...parse(r.body)}));
 const heartbeat=body=>db.prepare('INSERT INTO measurement_worker_status VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,observed_at=excluded.observed_at').run(JSON.stringify(body),iso(now()));
 function status(){const ps=profiles(),h=db.prepare('SELECT * FROM measurement_worker_status WHERE id=1').get(),real=ps.filter(x=>!x.profile.synthetic),ready=real.filter(x=>x.profile.enabled&&x.profile.proxyUrl&&x.profile.targetUrl&&x.profile.egressUrl&&x.profile.expectedEgressIp&&x.profile.routeId&&x.profile.allowedTargetOrigins?.length);return{enabled:enabled(),execution:executionStatus(),configuredProfiles:ps.length,realConfiguredProfiles:real.length,realRouteReadyProfiles:ready.length,realMeasurementStatus:!real.length?'NOT_CONFIGURED':ready.length?'configured_not_automatically_verified':'ROUTE_CONFIGURATION_INCOMPLETE',profiles:ps.map(x=>({id:x.profile.id,siteId:x.profile.siteId,kind:x.profile.kind,enabled:x.profile.enabled,synthetic:x.profile.synthetic,revision:x.revision,nextDueAt:x.nextDueAt,leaseExpiresAt:x.leaseExpiresAt})),rawObservationCount:db.prepare('SELECT COUNT(*) n FROM measurement_observations').get().n,pendingConclusionReviewRequired:true,automaticApproval:false,lastWorker:h?{...parse(h.body),observedAt:h.observed_at}:null};}
 return{filename,db,configure,profiles,enabled,executionStatus,canExecute,setExecutor,setEnabled:value=>{if(typeof value!=='boolean')throw Error('boolean_enabled_required');db.prepare('UPDATE measurement_control SET enabled=? WHERE id=1').run(value?1:0);return status();},requestRun,settleLateRun,trafficUsed,claim,finish,observations,status,heartbeat,linkProposal(profileId,ids,proposalId){const sorted=[...ids].sort();db.prepare('INSERT INTO measurement_proposal_links VALUES(?,?,?,?,?)').run(crypto.randomUUID(),profileId,JSON.stringify(sorted),proposalId,iso(now()));},findProposal:(profileId,ids)=>db.prepare('SELECT proposal_id FROM measurement_proposal_links WHERE profile_id=? AND observation_ids=?').get(profileId,JSON.stringify([...ids].sort()))?.proposal_id||null,close:()=>db.close()};
}
module.exports={openMeasurementStore,cleanProfile};
