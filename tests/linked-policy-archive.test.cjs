const {test}=require('node:test'),assert=require('node:assert/strict'),{sourceArchiveParts}=require('../scripts/collection-pipeline.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{validateLinkedPolicyArchive}=require('../scripts/build-core-supplement.cjs');
test('policy archive retains original and native-link proof hashes without unscoped paths',()=>{
 const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
 const source={file:'evidence/'+a+'.json',sha256:a,originalFile:'original-evidence/'+b+'.json',originalSha256:b,bindingChain:[{originalFile:'original-evidence/'+c+'.json',sha256:c},{originalFile:'original-evidence/'+c+'.json',sha256:c}]};
 assert.deepEqual(sourceArchiveParts(source).map(p=>p.sha256),[a,b,c]);
 assert.throws(()=>sourceArchiveParts({...source,bindingChain:[{originalFile:'../private.json',sha256:c}]}),/scoped/);
});
test('linked policy archive validates native links and exact original text',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'linked-policy-proof-'));fs.mkdirSync(path.join(dir,'raw'));
 const save=value=>{const bytes=Buffer.from(JSON.stringify(value)),hash=crypto.createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(dir,'raw',hash+'.json'),bytes);return{hash,entry:{archiveEntry:'raw/'+hash+'.json'}};};
 const make=broken=>{const parent=save({url:'https://service.example/#/register',document:{inputValuesRead:false,links:[{url:broken?'https://unrelated.example/':'https://policy.example/'}]}}),original=save({url:'https://policy.example/terms',requestedUrl:'https://policy.example/',capturedAt:'2026-11-01T00:00:00Z',document:{text:'Fixture policy excerpt',inputValuesRead:false}}),body=Buffer.from(JSON.stringify({representation:'derived_redacted_visible_DOM_with_retained_original',url:'https://policy.example/terms',capturedAt:'2026-11-01T00:00:00Z',text:'Fixture policy excerpt',originalSha256:original.hash,bindingChain:[{sha256:parent.hash}]}));return{body,entries:[{archiveEntry:'raw/'+crypto.createHash('sha256').update(body).digest('hex')+'.json'},original.entry,parent.entry]};};
 try{let good=make(false);assert.doesNotThrow(()=>validateLinkedPolicyArchive(dir,good.entries,good.body));let bad=make(true);assert.throws(()=>validateLinkedPolicyArchive(dir,bad.entries,bad.body),/Native policy link missing/);}finally{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('linked-policy-proof-'));fs.rmSync(dir,{recursive:true});}
});
