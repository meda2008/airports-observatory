'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createEntryDiscovery}=require('../deploy-service/entry-discovery.cjs');
test('explicit public seed can preserve HEAD redirect without authorizing its destination',()=>{
 const db=new DatabaseSync(':memory:'),q=createEntryDiscovery({db,seeds:[],store:{saveEvidence:()=>({id:'unused'}),getSite:id=>id==='A027'?{id}:null}});
 try{
  const input={id:'fnf-header-only',recordId:'A027',url:'https://cjmy.xyz/',retainPublicRedirect:true};
  assert.equal(q.registerSeed(input).identityVerified,false);
  assert.equal(q.registerSeed(input).existing,true);
  q.enqueue({seedId:input.id});const job=q.claim();
  assert.equal(job.site.config.retainPublicRedirect,true);
  assert.equal(job.site.config.publicOnly,true);
  assert.deepEqual(job.site.config.allowedHosts,['cjmy.xyz']);
  assert.equal(job.site.config.auth,undefined);
  assert.throws(()=>q.registerSeed({...input,id:'invalid-string',retainPublicRedirect:'true'}),/invalid_public/);
  assert.throws(()=>q.registerSeed({...input,id:'private-entry',url:'https://127.0.0.1/'}),/public_readonly/);
  assert.throws(()=>q.registerSeed({...input,retainPublicRedirect:false}),/immutable/);
 }finally{db.close();}
});
test('normal registered seed retains existing shape and does not add a HEAD request',()=>{
 const db=new DatabaseSync(':memory:'),q=createEntryDiscovery({db,seeds:[],store:{saveEvidence:()=>({id:'unused'}),getSite:()=>({})}});
 try{q.registerSeed({id:'ordinary-source',recordId:'A027',url:'https://ifnf.net/'});q.enqueue({seedId:'ordinary-source'});assert.equal(q.claim().site.config.retainPublicRedirect,undefined);}finally{db.close();}
});
