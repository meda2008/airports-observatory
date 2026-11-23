'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{advance}=require('../deploy-service/jisu-public-entry.cjs');
const config={recordId:'A159',entryUrl:'https://191.101.132.80/',publicOnly:true,readOnlyRecipe:'jisu_login_landing_readonly'},source={url:config.entryUrl,text:'极速Cloud\nWelcome to\n您的安全可靠服务网关\n登录账号\n注册账号'};
test('only the observed unique non-form login navigation is clicked; no credentials or registration',async()=>{
 let clicks=0;const control={filter:()=>control,count:async()=>1,evaluate:async()=>({tag:'BUTTON',form:false}),click:async()=>{clicks++;}},page={getByRole:(role,o)=>{assert.equal(role,'button');assert.equal(o.name,'登录账号');return control;},url:()=>config.entryUrl,waitForTimeout:async()=>{}};
 const r=await advance(page,source,{config,observe:async()=>({url:'https://191.101.132.80/login',passwordForm:true})});assert.equal(clicks,1);assert.equal(r.status,'native_login_navigation_observed');assert.equal(r.credentialsSubmitted,false);
 for(const change of [{agreementCheckbox:true},{type:'image_captcha'},{verificationWidgetObserved:true}]){await advance(page,{...source,...change},{config});assert.equal(clicks,1);}
});
