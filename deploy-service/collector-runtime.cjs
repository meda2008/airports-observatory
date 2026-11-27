'use strict';
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {createMeasurementWorker}=require('./measurement-worker.cjs');
const {openHttpMeasurementStore}=require('./measurement-worker-http.cjs');
const {probe}=require('./measurement-sidecar/local-healthcheck.cjs');
function measurementPollDelay(profiles,now=Date.now(),{idleStreak=0,maxIdleMs=10000}={}) {
  const baseWait=idleStreak>0?Math.min(maxIdleMs,1000*(2**Math.min(idleStreak,4))):1000;
  let wait=baseWait;
  for (const {profile,nextDueAt} of profiles) {
    if (!profile?.enabled || typeof nextDueAt!=='string') continue;
    const dueAt=Date.parse(nextDueAt);
    if (Number.isFinite(dueAt)) wait=Math.min(wait,dueAt-now);
  }
  return Math.max(250,wait);
}
async function runMeasurementLoop({store,secretDirectory,signal,batchLimit=2,worker=createMeasurementWorker({store,secretDirectory}),retryWait=require('../lib/service-api-recovery.cjs').wait}) {
  const stop=()=>worker.stop(); signal.addEventListener('abort',stop,{once:true});
  try {
    let retryAttempt=0,idleStreak=0;
    while(!signal.aborted) {
     try{await store.flush?.();
      await worker.tick({limit:batchLimit});
      const profiles=await store.canExecute()?await store.profiles():[];
      const now=Date.now();
      const soonDue=profiles.some(({profile,nextDueAt})=>profile?.enabled&&typeof nextDueAt==='string'&&Number.isFinite(Date.parse(nextDueAt))&&Date.parse(nextDueAt)-now<=1000);
      idleStreak=soonDue?0:Math.min(idleStreak+1,4);
      const wait=measurementPollDelay(profiles,now,{idleStreak});
      if(retryAttempt)require('../lib/service-api-recovery.cjs').report('collector_measurement','api_recovered',retryAttempt);retryAttempt=0;try{await delay(wait,undefined,{signal});}catch(e){if(!signal.aborted)throw e;}
     }catch(error){if(signal.aborted)break;if(!require('../lib/service-api-recovery.cjs').transient(error))throw error;retryAttempt++;if(retryAttempt===1||retryAttempt%10===0)require('../lib/service-api-recovery.cjs').report('collector_measurement','api_retry_wait',retryAttempt);await retryWait(retryAttempt,signal);}
    }
  } finally {signal.removeEventListener('abort',stop);worker.stop();try{await store.heartbeat({status:'stopped',automaticApproval:false});}catch{}store.close();}
}
async function runMeasurementProxy({
  binary=process.env.MIHOMO_BINARY||process.env.MEASUREMENT_PROXY_BINARY||'/opt/mihomo/mihomo',
  config=process.env.MIHOMO_CONFIG||process.env.MEASUREMENT_PROXY_CONFIG||'/run/secrets/measurement-proxy/config.yaml',
  baseUrl=process.env.INTERNAL_API_URL||process.env.COLLECTOR_API_URL||'http://api:8080', token=process.env.COLLECTOR_INTERNAL_TOKEN||require('node:fs').readFileSync(process.env.INTERNAL_TOKEN_FILE||process.env.COLLECTOR_INTERNAL_TOKEN_FILE||'/run/secrets/internal-token','utf8').trim(),
  secretDirectory=process.env.MEASUREMENT_SECRET_DIR||'/run/secrets/measurement-auth',
  batchLimit=Number(process.env.MEASUREMENT_BATCH_LIMIT||2),
  signal,spawnImpl=spawn,probeImpl=probe,
  measurementLoop=runMeasurementLoop,
  storeFactory=openHttpMeasurementStore,
  readinessTimeoutMs=30000,killTimeoutMs=10000,healthIntervalMs=2000,healthFailureMs=10000,
}={}) {
  if(signal?.aborted)return;
  const controller=new AbortController(); const stop=()=>controller.abort();
  const stopped=new Promise(resolve=>controller.signal.addEventListener('abort',resolve,{once:true}));
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  let store,child,childEnd,exited=false,childFailure,loops=[];
  try {
    store=storeFactory({baseUrl,token,outboxDirectory:require('node:path').join(process.env.COLLECTOR_OUTBOX_DIR||'/collector-state/outbox','measurement')});
    // Mihomo logs can contain private subscription/endpoint details: do not forward them.
    child=spawnImpl(binary,['-d','/tmp/collector-proxy','-f',config],{stdio:['ignore','ignore','ignore'],env:process.env,windowsHide:true});
    childEnd=new Promise((resolve,reject)=>{child.once('error',()=>{exited=true;childFailure=Error('collector_proxy_failed');reject(childFailure);});child.once('exit',()=>{exited=true;if(controller.signal.aborted)resolve();else{childFailure=Error('collector_proxy_exited');reject(childFailure);}});});
    childEnd.catch(()=>stop());
    const readiness=new AbortController();
    const waitForReady=async()=>{
      while(!readiness.signal.aborted && !await probeImpl()){
        await delay(250,undefined,{signal:readiness.signal});
      }
    };
    const readinessTimeout=delay(readinessTimeoutMs,undefined,{signal:readiness.signal}).then(()=>{throw Error('collector_proxy_readiness_timeout');});
    try{await Promise.race([stopped,childEnd,readinessTimeout,waitForReady()]);}
    finally{readiness.abort();}
    if(childFailure)throw childFailure;
    if(controller.signal.aborted)return;
    const healthLoop=async()=>{let failedAt=null;while(!controller.signal.aborted){try{await delay(healthIntervalMs,undefined,{signal:controller.signal});}catch(e){if(controller.signal.aborted)return;throw e;}if(controller.signal.aborted)return;const healthy=await probeImpl();if(healthy)failedAt=null;else{failedAt??=Date.now();if(Date.now()-failedAt>=healthFailureMs)throw Error('collector_proxy_unhealthy');}}};
    loops=[Promise.resolve().then(()=>measurementLoop({store,secretDirectory,signal:controller.signal,batchLimit})),healthLoop()];
    await Promise.race([childEnd,stopped,...loops.map(p=>p.then(()=>{if(!controller.signal.aborted)throw Error('collector_loop_exited');}))]);
    if(childFailure)throw childFailure;
  } finally {
    stop();signal?.removeEventListener('abort',stop);
    if(childEnd&&!exited){
      child.kill('SIGTERM');
      let timer;await Promise.race([childEnd.catch(()=>{}),new Promise(resolve=>{timer=setTimeout(()=>{if(!exited)child.kill('SIGKILL');resolve();},killTimeoutMs);})]);clearTimeout(timer);
    }
    await Promise.allSettled(loops);store?.close();
  }
}
async function runCollectorRuntime({
 signal,baseUrl=process.env.INTERNAL_API_URL||process.env.COLLECTOR_API_URL||'http://api:8080',
 token=process.env.COLLECTOR_INTERNAL_TOKEN||require('node:fs').readFileSync(process.env.INTERNAL_TOKEN_FILE||process.env.COLLECTOR_INTERNAL_TOKEN_FILE||'/run/secrets/internal-token','utf8').trim(),
 webLoop=require('./collector-web-runtime.cjs').runCollectorLoop,
 log=value=>console.error(JSON.stringify(value)),proxyRetryMs=5000,...measurementOptions
}={}){
 const controller=new AbortController(),stop=()=>controller.abort();
 signal?.addEventListener('abort',stop,{once:true});
 if(signal?.aborted)stop();
 const web=Promise.resolve().then(async()=>{
  if(controller.signal.aborted)return;
  await webLoop({signal:controller.signal,baseUrl,token});
  if(!controller.signal.aborted)throw Error('collector_web_loop_exited');
 });
 const measurement=(async()=>{
  while(!controller.signal.aborted){
   try{await runMeasurementProxy({...measurementOptions,signal:controller.signal,baseUrl,token});}
   catch{
    if(controller.signal.aborted)break;
    try{log({service:'collector_measurement',status:'degraded',reason:'measurement_runtime_retry_wait'});}catch{}
    try{await delay(proxyRetryMs,undefined,{signal:controller.signal});}catch(error){if(!controller.signal.aborted)throw error;}
   }
  }
 })();
 try{await Promise.race([web,measurement]);}
 finally{stop();signal?.removeEventListener('abort',stop);await Promise.allSettled([web,measurement]);}
}
if(require.main===module){const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());runCollectorRuntime({signal:controller.signal}).catch(()=>{console.error(JSON.stringify({service:'collector',status:'failed',reason:'collector_runtime_failed_no_secret_details'}));process.exitCode=1;});}
module.exports={runCollectorRuntime,runMeasurementProxy,runMeasurementLoop,measurementPollDelay};
