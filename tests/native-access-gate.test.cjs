const {test}=require('node:test'),assert=require('node:assert/strict'),m=require('../deploy-service/native-access-gate.cjs');
test('native access writes carry only one fixed read-only target for approved sites',()=>{
 const c={recordId:'A006',entryUrl:'https://speedcat.xyz/user/shop'},req=(body,url='https://speedcat.xyz/verify')=>({url:()=>url,method:()=> 'POST',frame:()=>({url:()=> 'https://speedcat.xyz/verify?next=%2Fuser%2Fshop'}),postData:()=>body});
 assert.equal(m.requestAllowed(req('next=%2Fuser%2Fshop'),c),true);
 for(const b of ['next=/checkout','next=https://evil.example','next=/user/shop&passwd=secret','next=/user/shop&next=/user/shop'])assert.equal(m.requestAllowed(req(b),c),false);
 assert.equal(m.requestAllowed(req('next=/user/shop','https://speedcat.xyz/payment'),c),false);
 assert.equal(m.requestAllowed(req('next=/user/shop'),{...c,recordId:'A007'}),false);
});
test('write scope lasts through actual native POST response rather than only click dispatch',async()=>{
 const config={recordId:'A186',entryUrl:'https://fastlink.ws/user/shop'};let active=false,clicked=false;
 const control={evaluate:async()=>({action:'https://fastlink.ws/verify',method:'post',fields:[{name:'next',type:'hidden'}]}),click:async()=>{assert.equal(active,true);clicked=true;}};
 const page={waitForResponse:()=>new Promise(resolve=>setTimeout(()=>{assert.equal(clicked,true);assert.equal(active,true);resolve({status:()=>302});},5))};
 assert.equal(await m.submit(page,control,config,{withVerificationWrite:async f=>{active=true;try{return await f();}finally{active=false;}},deadline:Date.now()+1000,clock:Date.now}),true);
 assert.equal(active,false);
});
test('new credential fields prevent submitting an otherwise matching access form',async()=>{
 const control={evaluate:async()=>({action:'https://fastlink.ws/verify',method:'post',fields:[{name:'next',type:'hidden'},{name:'password',type:'password'}]}),click:async()=>assert.fail('must not click')};
 await assert.rejects(()=>m.submit({},control,{recordId:'A186',entryUrl:'https://fastlink.ws/user/shop'},{deadline:Date.now()+1000,clock:Date.now}),/contract_changed/);
});
test('Qingyun and XMF gates admit only their observed same-origin shop target',()=>{for(const [recordId,origin]of [['A141','https://a32.qytaff03.cc'],['A144','https://a30.xmfvipaffa01.cc']]){const c={recordId,entryUrl:origin+'/shop'},request=body=>({method:()=> 'POST',url:()=>origin+'/verify',frame:()=>({url:()=>origin+'/verify?next=%2Fshop'}),postData:()=>body});assert.equal(m.configured(c),true);assert.equal(m.requestAllowed(request('next=%2Fshop'),c),true);for(const b of ['next=/user/shop','next=/checkout','next=/shop&password=private','next=/shop&next=/shop'])assert.equal(m.requestAllowed(request(b),c),false);assert.equal(m.configured({...c,entryUrl:origin+'/checkout'}),false);}});
test('typed access proof needs actual clearance and stays fixed to the configured native form',()=>{const c={recordId:'A141',entryUrl:'https://a32.qytaff03.cc/shop'},checks=[{status:'verification_cleared',attempts:1,passed:true,nativeAccessForm:true}],proof=m.runtimeProof(c,checks);assert.equal(m.validatedProof(proof,c).target,'/shop');for(const p of [{...proof,target:'/checkout'},{...proof,origin:'https://other.invalid'},{...proof,path:'/login'},{...proof,additional:true}])assert.equal(m.validatedProof(p,c),null);for(const r of [[],[{status:'verification_not_cleared',attempts:1,passed:false}]])assert.equal(m.runtimeProof(c,r),null);});
test('persisted public URL normalization of an exact root origin does not erase genuine access proof',()=>{const c={recordId:'A144',entryUrl:'https://a30.xmfvipaffa01.cc/shop'},proof=m.runtimeProof(c,[{status:'verification_cleared',attempts:1,passed:true,nativeAccessForm:true}]);assert.equal(m.validatedProof({...proof,origin:proof.origin+'/'},c).origin,proof.origin);for(const suffix of ['/login','/?next=/shop','//','/#other'])assert.equal(m.validatedProof({...proof,origin:proof.origin+suffix},c),null);});

test('Fliggy CSRF gate admits only observed hidden token and root read target',()=>{const c={recordId:'A041',entryUrl:'https://web01.fliggycloud.cc/'},req=body=>({method:()=> 'POST',url:()=> 'https://web01.fliggycloud.cc/verify',frame:()=>({url:()=> 'https://web01.fliggycloud.cc/verify?next=%2F'}),postData:()=>body}),token='';assert(m.requestAllowed(req('_token='+token+'&next=%2F'),c));for(const b of ['next=/','_token='+token+'&next=/checkout','_token='+token+'&next=/&password=bad','_token='+token+'&next=/&next=/','_token=x&next=/'])assert.equal(m.requestAllowed(req(b),c),false);assert.equal(m.configured({...c,entryUrl:'https://ftzcc02.fliggycloud.pro/'}),false);});
