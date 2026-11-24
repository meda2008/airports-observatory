const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('continuous campaign drains chunks, services review, skips blocked runs and resumes without repeating them',async()=>{
 const {runContinuous}=await import('../collection/continuous-workflow.mjs');let dir=fs.mkdtempSync(path.join(os.tmpdir(),'airports-continuous-')),file=path.join(dir,'journal.json'),calls=[],n=0;
 const runs=[{runId:'a'},{runId:'b'},{runId:'c'}];const options={journalFile:file,runs,step:async o=>{calls.push(o.runId);assert.equal(o.paymentAllowed,false);assert.equal(o.limit,1);return{status:o.runId==='a'?['collecting','awaiting_semantic_review','completed_with_blockers_no_new_facts'][n++]:o.runId==='b'?'needs_human_verification':'verified_local_not_published'};},handlers:{awaiting_semantic_review:async()=>({resolved:true})}};
 let s=await runContinuous(options);assert.deepEqual(calls,['a','a','a','b','c']);assert.equal(s.status,'runnable_queue_exhausted_with_gaps');await runContinuous(options);assert.equal(calls.length,5);
});
test('cleanup failure stops all further order work and authority cannot change',async()=>{
 const {runContinuous}=await import('../collection/continuous-workflow.mjs');let file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'airports-cleanup-')),'journal.json'),calls=[];
 let opts={journalFile:file,runs:[{runId:'a'},{runId:'b'}],step:async o=>(calls.push(o.runId),{status:'cleanup_required_stop_batch'})};let s=await runContinuous(opts);assert.equal(s.status,'cleanup_required_stop_campaign');assert.deepEqual(calls,['a']);await assert.rejects(runContinuous({...opts,runs:[{runId:'a',createUnpaidAllowed:true}]}),/authority changed/);
});
