'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{loadCredential}=require('../deploy-service/standalone-collector.cjs');
test('different accounts on one origin require an explicit record binding; no guessing or historical account fallback',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'airport-binding-')),file=path.join(dir,'vault.json'),origin='https://merchant.example',config={recordId:'A150',entryUrl:origin+'/#/plans'};
 const value={accounts:[{name:'Current',url:origin,email:'current@example.com',password:'fixture-current'},{name:'Historical',url:origin,email:'historical@example.com',password:'fixture-old',pw_status:'saved changed password'}]};
 const write=x=>fs.writeFileSync(file,JSON.stringify(x));try{
  write(value);assert.equal(loadCredential(config,{credentialsFile:file}),null);
  const bound={...value,collectorBindings:[{recordId:'A150',origin,accountName:'Current'}]};write(bound);assert.equal(loadCredential(config,{credentialsFile:file}).email,'current@example.com');
  assert.equal(loadCredential({...config,recordId:'A152'},{credentialsFile:file}),null);
  write({...bound,collectorBindings:[...bound.collectorBindings,...bound.collectorBindings]});assert.equal(loadCredential(config,{credentialsFile:file}),null);
  write({...bound,collectorBindings:[{recordId:'A150',origin,accountName:'Missing'}]});assert.equal(loadCredential(config,{credentialsFile:file}),null);
  write({...bound,accounts:bound.accounts.map(a=>a.name==='Current'?{...a,pw_status:'server_rejected_credentials'}:a)});assert.equal(loadCredential(config,{credentialsFile:file}),null);
 }finally{assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('airport-binding-'));fs.rmSync(dir,{recursive:true,force:true});}
});

test('current brand native client mismatch stops before any credential submission',async()=>{const n=require('../deploy-service/two-site-native-login.cjs'),s=n.specs.find(s=>s.recordId==='A149'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'airport-binding-'));let writes=0;try{assert.equal(n.configured({recordId:'A043',entryUrl:s.portal+'/',allowedHosts:[new URL(s.portal).hostname],readOnlyRecipe:s.recipe}),false);const r=await n.collectNative({config:{recordId:s.recordId,entryUrl:s.portal+'/',allowedHosts:[new URL(s.portal).hostname],readOnlyRecipe:s.recipe,fields:['pricing']},credential:{origin:s.portal,email:'current@example.com',password:'fixture'},sessionDir:dir,transportFactory:async()=>({get:async()=>({status:()=>200,text:async()=> 'unexpected changed public client'}),post:async()=>{writes++;throw Error('must not authenticate');},dispose:async()=>{}})});assert.equal(r.checkpoint.type,'native_login_price_client_changed');assert.equal(writes,0);assert.equal(r.ordersCreated,0);assert.equal(r.paymentExecuted,false);}finally{assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('airport-binding-'));fs.rmSync(dir,{recursive:true,force:true});}});
