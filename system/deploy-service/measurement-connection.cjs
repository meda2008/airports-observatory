'use strict';
// Local administration talks to the sole Docker SQLite owner through exec stdin.
// No Docker socket or database is exposed to a browser, and no secret is in argv.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const defaultConfig=()=>path.join(__dirname,'data/local-runtime/measurement-backend.json');
function readBackend(filename=process.env.MEASUREMENT_BACKEND_CONFIG||defaultConfig()){
 if(!fs.existsSync(filename))return {mode:'local'};
 const c=JSON.parse(fs.readFileSync(filename,'utf8'));
 if(c.mode==='api'){
  if(typeof c.baseUrl!=='string'||!/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/.test(c.baseUrl))throw Error('invalid_measurement_backend_config');
  let u;try{u=new URL(c.baseUrl);}catch{throw Error('invalid_measurement_backend_config');}
  if(u.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash||typeof c.adminTokenFile!=='string'||!path.isAbsolute(c.adminTokenFile))throw Error('invalid_measurement_backend_config');
  return {...c,baseUrl:u.origin};
 }
 if(c.mode!=='docker'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(c.container||''))throw Error('invalid_measurement_backend_config');
 return c;
}
function openRemoteMeasurementStore({container,docker=process.env.MEASUREMENT_DOCKER_CLI||'docker',transport}={}){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container||''))throw Error('invalid_measurement_container');
 const call=(method,args=[])=>{
  let result;
  try{result=transport?transport({method,args}):JSON.parse(cp.execFileSync(docker,['exec','-i',container,'node','deploy-service/measurement-rpc.cjs'],{input:JSON.stringify({method,args}),encoding:'utf8',timeout:30000,maxBuffer:64*1024*1024,windowsHide:true,stdio:['pipe','pipe','pipe']}));}
  catch{throw Error('measurement_docker_backend_unavailable');}
  if(!result||result.ok!==true)throw Error('measurement_remote_request_rejected');return result.value;
 };
 const store={filename:'docker:'+container,backend:{mode:'docker',container},close(){}};
 for(const name of ['status','profiles','enabled','configure','setEnabled','requestRun','observations','linkProposal','findProposal','executionStatus'])store[name]=(...args)=>call(name,args);
 store.db={prepare(sql){if(sql!=='SELECT id,scheduled_at,started_at FROM measurement_runs WHERE profile_id=? AND profile_revision=? ORDER BY scheduled_at')throw Error('remote_measurement_query_not_allowed');return{all:(...args)=>call('scheduledRuns',args)};}};
 return store;
}
function openConfiguredMeasurementStore(options={}){
 const config=options.forceLocal?{mode:'local'}:readBackend(options.backendConfig);
 if(config.mode==='api')throw Error('measurement_api_backend_requires_async_cli');
 return config.mode==='docker'?openRemoteMeasurementStore(config):require('./measurement-store.cjs').openMeasurementStore(options);
}
module.exports={readBackend,openRemoteMeasurementStore,openConfiguredMeasurementStore};
