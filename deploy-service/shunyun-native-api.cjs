'use strict';
// Exact operator-declared backend. Only normal login, account status and plan reads.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PORTAL='https://syjccloud.com',BASE='https://apiapi.syjccloud.com/api/v1',RECIPE='shunyun_native_api_readonly';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function configured(config){try{return config.recordId==='A146'&&config.readOnlyRecipe===RECIPE&&new URL(config.entryUrl).origin===PORTAL&&config.allowedHosts.includes('apiapi.syjccloud.com');}catch{return false;}}
async function collectNative({config,credential,sessionDir,beforePage=async()=>{},clock=Date.now,jobBudgetMs=45000,transportFactory}={}){
 if(!configured(config)||credential?.origin!==PORTAL)return{captures:[],checkpoint:{type:'native_api_scope_or_credential_missing',url:PORTAL,stage:'auth'},ordersCreated:0,paymentExecuted:false};
 const root=path.join(sessionDir,'shunyun-native-api'),file=path.join(root,'A146.json'),started=clock(),binding=hash(PORTAL+'|'+BASE+'|'+credential.email+'|'+credential.password);
 fs.mkdirSync(root,{recursive:true,mode:0o700});const journal=path.join(root,'receipts',crypto.randomUUID());fs.mkdirSync(journal,{recursive:true,mode:0o700});
 let state,request,signinRequests=0,accessRequests=0,priceRequests=0,readTransportRetries=0,recovered=false;
 try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}if(state?.binding!==binding||typeof state?.auth!=='string'||!state.auth)state=null;
 const sessionMode=state?'cached_session':'cold_login';
 try{
  request=transportFactory?await transportFactory():await require('playwright').request.newContext({...require('./web-context-egress.cjs').webContextEgress(config),ignoreHTTPSErrors:false});
  async function call(operation){
   if(!['login','account','plans','paymentMethods'].includes(operation))throw Error('native_api_operation_rejected');
   await beforePage();const remaining=jobBudgetMs-(clock()-started);if(remaining<1000)throw Error('native_api_budget_exhausted');
   const suffix={login:'/passport/auth/login',account:'/user/info',plans:'/user/plan/fetch',paymentMethods:'/user/order/getPaymentMethod'}[operation],url=BASE+suffix,options={timeout:Math.min(14000,remaining),maxRedirects:0};
   let r;if(operation==='login')r=await request.post(url,{...options,form:{email:credential.email,password:credential.password}});else for(;;){try{r=await request.get(url,{...options,timeout:Math.min(14000,jobBudgetMs-(clock()-started)),headers:{Authorization:state.auth}});break;}catch(error){if(readTransportRetries||!['ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(error.code)||jobBudgetMs-(clock()-started)<1500)throw error;readTransportRetries++;fs.writeFileSync(path.join(journal,'read-transport-retry.json'),JSON.stringify({operation,code:error.code,at:new Date(clock()).toISOString()}),{mode:0o600});await beforePage();}}
   const body=await r.text(),observedAt=new Date(clock()).toISOString();fs.writeFileSync(path.join(journal,operation+'-'+crypto.randomUUID()+'.json'),JSON.stringify({url,status:r.status(),body,observedAt}),{mode:0o600});
   let value;try{value=JSON.parse(body);}catch{throw Error(/cloudflare|captcha|challenge/i.test(body)?'native_api_interactive_verification':'native_api_non_json_response');}return{body,value,status:r.status(),observedAt,url};
  }
  async function signin(){if(signinRequests++)throw Error('native_api_login_retry_limit');const r=await call('login');if(r.status!==200||typeof r.value.data?.auth_data!=='string'||!r.value.data.auth_data)throw Error('native_api_authentication_rejected');state={binding,auth:r.value.data.auth_data};}
  if(!state)await signin();let a=await call('account');accessRequests++;
  if([401,403].includes(a.status)&&signinRequests===0){await signin();recovered=true;a=await call('account');accessRequests++;}
  if(a.status!==200||typeof a.value.data?.email!=='string'||a.value.data.email.toLowerCase()!==credential.email.toLowerCase())throw Error('native_api_session_not_verified');
  const p=await call('plans');priceRequests++;if(p.status!==200||!Array.isArray(p.value.data)||!p.value.data.length||p.value.data.length>100||Object.keys(p.value).some(k=>k!=='data'))throw Error('native_api_price_schema_changed');
  if([credential.email,credential.password,state.auth].some(s=>s&&p.body.includes(s)))throw Error('native_api_private_payload_not_publishable');
  const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify({...state,lastVerifiedAt:p.observedAt}),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);
  const captures=[{url:p.url,body:p.body,kind:'authorized_account_page',observedAt:p.observedAt,metadata:{representation:'original_native_plan_http_json',portalOrigin:PORTAL,operation:'read_quote_only',checkoutVerified:false}}];let paymentDiscovery='not_verified';try{const m=await call('paymentMethods');if(m.status===200&&Array.isArray(m.value.data)&&m.value.data.length>0&&m.value.data.length<=30&&m.value.data.every(row=>row&&typeof row.name==='string'&&row.name.trim()&&typeof row.payment==='string'&&!Object.keys(row).some(k=>/secret|token|password|key/i.test(k)))&&m.body.length<30000&&![credential.email,credential.password,state.auth].some(secret=>secret&&m.body.includes(secret))){captures.push({url:m.url,body:m.body,observedAt:m.observedAt,kind:'authorized_account_page',metadata:{representation:'original_native_payment_methods_json',operation:'read_payment_methods_without_order',authenticationObserved:true}});paymentDiscovery='methods_observed';}}catch{paymentDiscovery='read_failed_existing_prices_preserved';}
  return{captures,checkpoint:null,capabilities:{login:{status:'session_observed'},nativeApi:{status:'verified',authenticatedCheck:'user_info',sessionMode,recovered,signinRequests,accessRequests,priceRequests,readTransportRetries,paymentDiscovery}},ordersCreated:0,paymentExecuted:false,browser:'service_native_api'};
 }catch(e){try{fs.writeFileSync(path.join(journal,'failure-safe.json'),JSON.stringify({privateMessage:String(e.message).slice(0,6000),errorName:/^[A-Za-z]+$/.test(e.name||'')?e.name:'Error',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:null,causeCode:/^[A-Z0-9_]+$/.test(e.cause?.code||'')?e.cause.code:null,reason:/^native_api_[a-z_]+$/.test(e.message)?e.message:/timeout/i.test(e.message)?'request_timeout':/lease|paused|config/i.test(e.message)?'control_or_lease_rejected':'transport_or_storage_failure'}),{mode:0o600});}catch{}return{captures:[],checkpoint:{type:/^native_api_[a-z_]+$/.test(e.message)?e.message:'native_api_transport_failed',url:PORTAL,stage:'native_api',reason:'正常接口采集未完成；私有响应保存在后台，未公开凭据。'},capabilities:{login:{status:'not_verified'},nativeApi:{sessionMode,recovered,signinRequests,accessRequests,priceRequests}},ordersCreated:0,paymentExecuted:false,browser:'service_native_api'};}
 finally{await request?.dispose?.();}
}
module.exports={PORTAL,BASE,RECIPE,configured,collectNative};
