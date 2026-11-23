const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('runtime bridge consumes release and admission job receipts without approving empty reviews',async()=>{
 const {runtimeHandlers}=await import('../collection/runtime-handlers.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airport-runtime-'));fs.mkdirSync(path.join(dir,'backend-jobs'));
 const h=runtimeHandlers({runDirectory:()=>dir}),run={runId:'pilot'};
 assert.deepEqual(await h.awaiting_semantic_review({run}),{waiting:true});assert(fs.existsSync(path.join(dir,'review-request.json')));
 fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify({runId:'pilot',reviewer:'reviewer',reviewedAt:new Date().toISOString(),decisions:[{field:'payment'}]}));assert.deepEqual(await h.awaiting_semantic_review({run}),{resolved:true});
 fs.writeFileSync(path.join(dir,'backend-jobs/job.json'),JSON.stringify({status:'queued'}));assert.deepEqual(await h.backend_pending({run,result:{release:{jobId:'job'}}}),{waiting:true});
 fs.writeFileSync(path.join(dir,'backend-jobs/job.json'),JSON.stringify({status:'done'}));assert.deepEqual(await h.backend_pending({run,result:{job:{jobId:'job'}}}),{resolved:true});
});
test('waiting dependencies resume at next tick without repeating finished runs',async()=>{
 const {runContinuous}=await import('../collection/continuous-workflow.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airport-resume-'));let ready=false,calls=0;
 const opts={journalFile:path.join(dir,'state.json'),runs:[{runId:'pilot'}],step:async()=>({status:++calls===1?'backend_pending':'published_online_verified'}),handlers:{backend_pending:async()=>({waiting:!ready,resolved:ready})},maxSteps:1};
 assert.equal((await runContinuous(opts)).status,'waiting_for_dependencies');ready=true;const result=await runContinuous(opts);assert.equal(result.items.pilot.terminal,true);assert.equal(calls,2);
});
