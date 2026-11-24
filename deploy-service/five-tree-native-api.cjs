'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PORTAL='https://a04.xiaomiaffa01.cc',BASE='https://t01.xiaomicf.com/v1/',RECIPE='five_tree_native_readonly',CONFIRMATION='user_reply_call_09d049825cfc4c85bdbaedc7677da7be';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function configured(c){try{return c.recordId==='A053'&&c.readOnlyRecipe===RECIPE&&new URL(c.entryUrl).origin===PORTAL&&c.allowedHosts.includes('t01.xiaomicf.com')&&c.businessApiConsent?.contract===RECIPE&&c.businessApiConsent.confirmation===CONFIRMATION&&c.businessApiConsent.login===true&&c.businessApiConsent.readOnly===true&&Object.keys(c.businessApiConsent).sort().join(',')==='confirmation,contract,login,readOnly,recordedAt'&&Number.isFinite(Date.parse(c.businessApiConsent.recordedAt));}catch{return false;}}
function parse(body){if(typeof body!=='string'||body.length>250000)throw Error('five_tree_response_size');let v;try{v=JSON.parse(body);}catch{throw Error('five_tree_non_json_or_challenge');}if(!v||Array.isArray(v)||typeof v!=='object')throw Error('five_tree_invalid_envelope');return v;}
function accepted(v){return v?.code===100&&v.status===1;}
function denied(v){return v?.status===0&&v.code===486&&v.data===null;}
async function collectNative({config,credential,sessionDir,beforePage=async()=>{},clock=Date.now,jobBudgetMs=35000,transport=fetch}={}){
 const captures=[],started=clock();let signinRequests=0,priceRequests=0,recovered=false,sessionMode='cold_login';
 if(!configured(config)||credential?.origin!==PORTAL)return {captures,checkpoint:{type:'five_tree_consent_or_credential_missing',url:PORTAL,stage:'auth'},ordersCreated:0,paymentExecuted:false};
 const dir=path.join(sessionDir,'five-tree-native'),file=path.join(dir,'A053.json');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const journal=path.join(dir,'receipts',crypto.randomUUID());fs.mkdirSync(journal,{recursive:true,mode:0o700});const binding=hash(PORTAL+'|'+BASE+'|'+credential.email+'|'+credential.password);let state;
 try{state=JSON.parse(fs.readFileSync(file,'utf8'));if(state.binding!==binding||typeof state.auth!=='string'||!state.auth)state=null;}catch{}if(state)sessionMode='cached_session';
 async function call(operation){
  if(!['login','control','plans'].includes(operation))throw Error('five_tree_operation_rejected');await beforePage();const left=jobBudgetMs-(clock()-started);if(left<1000)throw Error('five_tree_budget_exhausted');
  const endpoint=BASE+(operation==='login'?'p_login':'p_getPlanList'),options={redirect:'error',signal:AbortSignal.timeout(Math.min(left,14000))};let url=endpoint;
  if(operation==='login'){options.method='POST';options.headers={'content-type':'application/x-www-form-urlencoded'};options.body=new URLSearchParams({email:credential.email,password:credential.password});}else url+='?authtoken='+encodeURIComponent(operation==='control'?'null':state.auth);
  const r=await transport(url,options),body=await r.text(),observedAt=new Date(clock()).toISOString();
  // Authentication response is private; URLs written to disk never contain bearer tokens.
  fs.writeFileSync(path.join(journal,operation+'-'+crypto.randomUUID()+'.json'),JSON.stringify({url:endpoint,status:r.status,body,observedAt}),{flag:'wx',mode:0o600});
  if(r.status!==200)throw Error('five_tree_http_failure');return {body,value:parse(body),observedAt,url:endpoint};
 }
 try{
  const control=await call('control');if(!denied(control.value))throw Error('five_tree_protected_read_not_verified');
  async function signin(){if(signinRequests++)throw Error('five_tree_login_retry_limit');const a=await call('login');if(!accepted(a.value)||typeof a.value.data?.auth_data!=='string'||!a.value.data.auth_data)throw Error('five_tree_authentication_rejected');state={binding,auth:a.value.data.auth_data};}
  if(!state)await signin();let p=await call('plans');priceRequests++;
  if(denied(p.value)&&signinRequests===0){await signin();recovered=true;p=await call('plans');priceRequests++;}
  if(!accepted(p.value)||!Array.isArray(p.value.data)||!p.value.data.length||p.value.data.length>30)throw Error('five_tree_plan_schema_changed');
  if([credential.email,credential.password,state.auth].some(x=>x&&p.body.includes(x)))throw Error('five_tree_private_quote_rejected');
  const tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,JSON.stringify({...state,lastVerifiedAt:p.observedAt}),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);
  captures.push({url:p.url,body:p.body,observedAt:p.observedAt,kind:'authorized_account_page',metadata:{representation:'original_native_plan_http_json',portalOrigin:PORTAL,operation:'read_quote_only',authenticationObserved:true}});
  return {captures,checkpoint:null,capabilities:{login:{status:'session_observed'},nativeApi:{status:'verified',authenticatedCheck:'protected_plan_with_unauthenticated_control',sessionMode,recovered,signinRequests,accessRequests:1,priceRequests,accountIdentityVerified:false}},ordersCreated:0,paymentExecuted:false,browser:'service_native_api'};
 }catch(e){return {captures:[],checkpoint:{type:/^five_tree_[a-z_]+$/.test(e.message)?e.message:'five_tree_transport_failed',url:PORTAL,stage:'native_api'},capabilities:{login:{status:'not_verified'},nativeApi:{sessionMode,signinRequests,priceRequests}},ordersCreated:0,paymentExecuted:false,browser:'service_native_api'};}
}
module.exports={PORTAL,BASE,RECIPE,CONFIRMATION,configured,parse,accepted,denied,collectNative};
