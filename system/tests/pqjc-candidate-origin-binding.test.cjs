'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir='work/collection-runs/payment-priority-20261104-v12-root/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function binding(){return{kind:'user_recognized_pqjc_candidate_alias_claim',recordId:'A039',origin:'https://xn--mes358aby2apfg.com',file:dir+'pqjc-native-alias-announcement.json',sha256:sha(fs.readFileSync(path.join(root,dir+'pqjc-native-alias-announcement.json'))),approvalFile:dir+'pqjc-current-authorization.json',approvalSha256:sha(fs.readFileSync(path.join(root,dir+'pqjc-current-authorization.json')))}}
const call=(b,options={})=>require('../lib/source-origin-binding.cjs').assertSourceOrigin({root,entryUrl:'https://pqjc.site/',sourceUrl:b.origin+'/order',recordId:'A039',bindings:[b],...options});
test('actual user-recognized PQJC candidate and native alias list bind observation scope without proving old ownership',()=>{
 const result=call(binding());assert.equal(result.operatorIdentityVerified,false);assert.equal(result.legacyContinuityVerified,false);assert.equal(result.credentialPropagationAllowed,false);assert.match(result.basis,/not_legacy_identity_verification/);
 assert.throws(()=>call({...binding(),approvalSha256:'0'.repeat(64)}),/approval hash mismatch/);
 assert.throws(()=>call({...binding(),approvalFile:null}),/approval proof required/);
 assert.throws(()=>call(binding(),{recordId:'A008'}),/record scope mismatch/);
 assert.throws(()=>call(binding(),{entryUrl:'https://other.example/'}),/registered-entry mismatch/);
});
test('a lookalike link, missing native declaration or blanket consent cannot bind the candidate',()=>{
 const work=path.resolve(root,'work'),temp=fs.mkdtempSync(path.join(work,'pqjc-binding-test-'));
 try{
  const original=binding(),proof=JSON.parse(fs.readFileSync(path.join(root,original.file))),approval=JSON.parse(fs.readFileSync(path.join(root,original.approvalFile)));
  for(const change of [p=>{p.links=p.links.filter(l=>!l.url.includes('dash.pqjc.site'));},p=>{p.text=p.text.replaceAll('当前正在使用的官网域名：','推广站推荐');},p=>{p.links=p.links.map(l=>l.url.includes('dash.pqjc.site')?{...l,url:'https://dash.pqjc.site.attacker.example/'}:l);}]){
   const changed=structuredClone(proof);change(changed);const file=path.join(temp,'proof.json'),bytes=JSON.stringify(changed);fs.writeFileSync(file,bytes);assert.throws(()=>call({...original,file:path.relative(root,file),sha256:sha(bytes)}),/declaration required|links required/);
  }
  const file=path.join(temp,'approval.json'),bytes=JSON.stringify({...approval,action:'always_allow_any_site'});fs.writeFileSync(file,bytes);assert.throws(()=>call({...original,approvalFile:path.relative(root,file),approvalSha256:sha(bytes)}),/Specific user recognition required/);
 }finally{assert(path.resolve(temp).startsWith(work+path.sep));fs.rmSync(temp,{recursive:true});}
});
