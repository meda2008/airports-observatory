'use strict';
// Only reached by the trusted host via Docker exec; not an HTTP/TCP server.
const allowed=new Set(['status','profiles','enabled','configure','setEnabled','requestRun','observations','linkProposal','findProposal','executionStatus','scheduledRuns']);
function dispatch(store,request){
 if(!request||!allowed.has(request.method)||!Array.isArray(request.args)||request.args.length>3)throw Error('rpc_request_rejected');
 if(request.method==='scheduledRuns')return store.db.prepare('SELECT id,scheduled_at,started_at FROM measurement_runs WHERE profile_id=? AND profile_revision=? ORDER BY scheduled_at').all(...request.args);
 return store[request.method](...request.args);
}
async function main(){let body='';for await(const part of process.stdin){body+=part;if(Buffer.byteLength(body)>65536)throw Error('rpc_limit');}
 const store=require('./measurement-store.cjs').openMeasurementStore({filename:process.env.MEASUREMENT_STORE_FILE,executorId:process.env.MEASUREMENT_EXECUTOR_ID||'docker-local'});
 try{const value=dispatch(store,JSON.parse(body));process.stdout.write(JSON.stringify({ok:true,value:value===undefined?null:value}));}finally{store.close();}
}
if(require.main===module)main().catch(()=>{process.stdout.write(JSON.stringify({ok:false,error:'measurement_rpc_rejected'}));process.exitCode=1;});
module.exports={dispatch};
