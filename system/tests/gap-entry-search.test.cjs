const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('field-specific search retains discovery receipts, queues only unread bound-origin pages and refuses tampering',()=>{
 const S=require('../scripts/gap-entry-search.cjs'),P=require('../scripts/collection-pipeline.cjs'),{runDir}=require('../scripts/collection.cjs');
 const id='SYNTHETIC-field-search-'+process.pid,dir=runDir(id);
 try{P.init(id,['A006']);const p=S.build(id,['A006']);assert.match(p.tasks[0].query,/site:speedcat.xyz/);assert.match(p.tasks[0].query,/refund/);assert.equal(S.ingest(id).pending,1);
 const task=p.tasks[0].taskId,raw='Refund policy (https://speedcat.xyz/help/test-unread-refund-v26)\nSame name (https://unbound.example.org/refund)';
 assert.equal(S.retain(id,[task],raw).candidates,2);assert.throws(()=>S.retain(id,[task],raw),/overwrite/);const r=S.ingest(id);assert.equal(r.pending,0);assert.equal(r.added,1);const tasks=JSON.parse(fs.readFileSync(path.join(dir,'plan.json'))).tasks.filter(t=>t.execution==='targeted_official_origin_read');assert.equal(tasks.length,1);assert.equal(tasks[0].allowRegistration,false);assert.deepEqual(tasks[0].allowedHosts,['speedcat.xyz']);assert.equal(S.ingest(id).added,0);
 const state=JSON.parse(fs.readFileSync(path.join(dir,'targeted-search-state.json')));fs.appendFileSync(path.join(dir,state.results[task].file),' ');assert.throws(()=>S.ingest(id),/hash mismatch/);
 }finally{if(fs.existsSync(dir))fs.rmSync(dir,{recursive:true});}
});
