const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('native ofo adapter requires exact unpaid scope and never repeats a verified cancelled order',async()=>{
 const {prepareOfoOrderPlan,runOfoUnpaidChunk}=await import('../collection/ofo-unpaid.mjs');
 assert.throws(()=>prepareOfoOrderPlan({scope:['A058'],createUnpaidAllowed:true,paymentAllowed:false}),/A040/);
 assert.throws(()=>prepareOfoOrderPlan({scope:['A040'],createUnpaidAllowed:true,paymentAllowed:true}),/A040/);
 const base=path.resolve(__dirname,'../work/collection-runs'),dir=fs.mkdtempSync(path.join(base,'SYNTHETIC-OFO-')),task={taskId:'fixture',recordIds:['A040'],theme:'ofo_native_checkout'};
 try{
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify({tasks:[task],unpaidOrderAuthorization:{createUnpaidAllowed:true,paymentAllowed:false}}));
  fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({results:{fixture:{cancelledVerified:true}}}));
  let opened=0;const browser={tabs:{new:async()=>{opened++;throw Error('No duplicate order');}}};
  assert.deepEqual(await runOfoUnpaidChunk({browser,runId:path.basename(dir)}),{processed:0,remaining:0,cleanupRequired:false});assert.equal(opened,0);
 }finally{assert.equal(path.dirname(dir),base);fs.rmSync(dir,{recursive:true});}
});
