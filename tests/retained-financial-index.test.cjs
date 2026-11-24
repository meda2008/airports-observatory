const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),work=path.join(root,'work'),{scanIndexed}=require('../scripts/find-retained-financial-literals.cjs');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(work,'SYNTHETIC-retained-index-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),work);fs.rmSync(dir,{recursive:true,force:true});});
 const file=path.join(dir,'retained.json'),inventoryFile=path.join(dir,'inventory.json'),doc={url:'https://primary.example/tos',capturedAt:'2026-11-01T00:00:00Z',text:'退款规则\n本站不提供退款。',inputValuesRead:false};fs.writeFileSync(file,JSON.stringify(doc));fs.writeFileSync(inventoryFile,JSON.stringify({records:[{id:'A070',name:'synthetic only',coreInfo:{website:{url:'https://primary.example/'}},missingFields:['refund']}]}));
 const page={sourceId:'SYNTHETIC',file:path.relative(root,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),url:doc.url,capturedAt:doc.capturedAt,recordIds:['A070'],grade:'E1'};return{dir,file,inventoryFile,page};
}
test('work E1 originals become hash-bound candidates without recapture or admission',t=>{
 const x=fixture(t),out=path.join(x.dir,'out'),r=scanIndexed(out,{inventoryFile:x.inventoryFile,sourceIndex:{pages:[x.page,x.page],errors:[]}}),saved=JSON.parse(fs.readFileSync(path.join(out,'indexed-financial-literals.json')));
 assert.equal(r.inspected,2);assert.equal(r.candidates,1);assert.equal(saved.candidates[0].originMatchesCurrentRecord,true);assert.equal(saved.candidates[0].capturedAt,'2026-11-01T00:00:00Z');assert.equal(saved.candidates[0].recaptured,false);assert.equal(saved.automaticAdmission,false);assert.equal(saved.newRequests,0);
});
test('changed hashes and lower-grade inputs cannot be promoted by the reuse scan',t=>{
 const x=fixture(t),r=scanIndexed(path.join(x.dir,'out'),{inventoryFile:x.inventoryFile,sourceIndex:{pages:[{...x.page,sha256:'0'.repeat(64)},{...x.page,grade:'E0'}],errors:[]}});assert.equal(r.inspected,0);assert.equal(r.candidates,0);assert.equal(r.errors,1);
});
test('cross-origin material remains unbound and an explicit scope excludes other records',t=>{
 const x=fixture(t);let inv=JSON.parse(fs.readFileSync(x.inventoryFile));inv.records[0].coreInfo.website.url='https://different.example/';fs.writeFileSync(x.inventoryFile,JSON.stringify(inv));const opts={inventoryFile:x.inventoryFile,sourceIndex:{pages:[x.page],errors:[]}};scanIndexed(path.join(x.dir,'out'),opts);const saved=JSON.parse(fs.readFileSync(path.join(x.dir,'out/indexed-financial-literals.json')));assert.equal(saved.candidates[0].originMatchesCurrentRecord,false);
 assert.equal(scanIndexed(path.join(x.dir,'out2'),{...opts,recordIds:['A163']}).candidates,0);
});
