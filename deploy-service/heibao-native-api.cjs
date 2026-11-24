'use strict';
// The portal's native protocol; only signin, authenticated access and price.
// No browser cookies, registration, payment, order or account mutation methods.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PORTAL='https://user.heibaojiasu.com',GATEWAY='https://h.ahahub.net',ROUTE='/light/dispatch/v2',APP='cham';
const md5=s=>crypto.createHash('md5').update(s).digest('hex'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const invalidReasons=new Set(['invalid token','token record not found','expired token']);
function signedParams(command,{name,password,token,now=Date.now()}={}){
 if(!['signin','access','price'].includes(command))throw Error('native_api_operation_rejected');
 const p=command==='signin'?{name,password,cmd:'signin'}:command==='access'?{token,name,cmd:'access',devices:true}:{token,name,method:'buy',cmd:'price'};
 if(typeof name!=='string'||!name||command==='signin'&&(!password||typeof password!=='string')||command!=='signin'&&(!token||typeof token!=='string'))throw Error('native_api_auth_input_required');
 Object.assign(p,{app:APP,lang:'zh_hans',device:md5(name),platform:'web',version:'2.4.0'});
 const enc=s=>encodeURIComponent(s).replaceAll('%3A',':').replaceAll('%24','$').replaceAll("'",'%27').replaceAll('%5B','[').replaceAll('%5D',']').replaceAll('%2C',',').replaceAll('%20','+');
 let text=ROUTE+'?';for(const[k,v]of Object.entries(p))text+=k+'='+enc(v)+'&';text+='timestamp='+now;
 text=text.replaceAll('&','-');for(const[k,v]of Object.entries({'0':'~','1':'!','2':'&','3':'^','4':'$','5':'#','6':'%','7':'@','8':'*','9':'='}))text=text.replaceAll(k,v);
 return{...p,sign:md5(text),timestamp:now};
}
async function collectNative({config,credential,sessionDir,beforePage=async()=>{},jobBudgetMs=35000,clock=Date.now,transportFactory}={}){
 const PORTAL=config?.recordId==='A031'?'https://user.dowancheng.com':module.exports.PORTAL;
 if(!['A217','A031'].includes(config?.recordId)||new URL(config.entryUrl).origin!==PORTAL||!config.allowedHosts?.includes(new URL(GATEWAY).hostname)||!credential||credential.origin!==PORTAL)return{captures:[],checkpoint:{type:'native_api_scope_or_credential_missing',url:PORTAL,stage:'auth'},capabilities:{login:{status:'not_verified'}},ordersCreated:0,paymentExecuted:false};
 const started=clock(),deadline=started+jobBudgetMs,name=credential.email.trim().toLowerCase(),binding=sha(PORTAL+'|'+GATEWAY+'|'+APP+'|'+name+'|'+credential.password);
 const folder=path.join(sessionDir,'heibao-native-api');fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const stateFile=path.join(folder,config.recordId+'-'+sha(PORTAL).slice(0,16)+'.json'),journal=path.join(folder,'receipts',crypto.randomUUID());fs.mkdirSync(journal,{recursive:true,mode:0o700});
 let state;try{state=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{}
 if(state?.binding!==binding||state?.portal!==PORTAL||state?.gateway!==GATEWAY||state?.app!==APP||typeof state?.token!=='string')state=null;
 const sessionMode=state?'cached_session':'cold_login';let signins=0,priceRequests=0,accessRequests=0,readTransportRetries=0,recovered=false,request;
 const saveState=()=>{const temp=stateFile+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600,flag:'wx'});fs.renameSync(temp,stateFile);};
 try{
  request=transportFactory?await transportFactory():await require('playwright').request.newContext({...require('./web-context-egress.cjs').webContextEgress(config),ignoreHTTPSErrors:false});
  const call=async(command,token)=>{
   await beforePage();const remaining=deadline-clock();if(remaining<1000)throw Error('native_api_budget_exhausted');
   const params=signedParams(command,{name,password:credential.password,token,now:clock()});
   // Fixed URL, no redirects, no parameter logging (the native GET carries credentials).
   let r;for(;;){try{r=await request.get(GATEWAY+ROUTE,{params,timeout:Math.min(12000,deadline-clock()),maxRedirects:0});break;}catch(error){if(command==='signin'||readTransportRetries||!['ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(error.code)||deadline-clock()<1500)throw error;readTransportRetries++;fs.writeFileSync(path.join(journal,'read-transport-retry.json'),JSON.stringify({operation:command,code:error.code,at:new Date(clock()).toISOString()}),{mode:0o600});await beforePage();}}
   const body=await r.text(),at=new Date(clock()).toISOString();
   fs.writeFileSync(path.join(journal,command+'-'+crypto.randomUUID()+'.json'),JSON.stringify({url:GATEWAY+ROUTE,command,status:r.status(),observedAt:at,body}),{mode:0o600});
   let value;try{value=JSON.parse(body);}catch{throw Error('native_api_non_json_response');}
   if(r.status()!==200&&!invalidReasons.has(value.reason))throw Error('native_api_http_rejected');return{body,value,observedAt:at};
  };
  const signin=async()=>{if(signins++)throw Error('native_api_login_retry_limit');const r=await call('signin');if(r.value.reason||typeof r.value.token?.token!=='string'||!r.value.token.token)throw Error('native_api_authentication_rejected');state={portal:PORTAL,gateway:GATEWAY,app:APP,binding,token:r.value.token.token,createdAt:r.observedAt};};
  if(!state)await signin();let account=await call('access',state.token);accessRequests++;
  if(invalidReasons.has(account.value.reason)&&signins===0){await signin();recovered=true;account=await call('access',state.token);accessRequests++;}
  if(account.value.reason||!account.value.user||typeof account.value.user!=='object'||typeof account.value.user.email==='string'&&account.value.user.email.toLowerCase()!==name)throw Error('native_api_session_not_verified');
  let result=await call('price',state.token);priceRequests++;
   if(result.value.reason||!Array.isArray(result.value.prices)||!result.value.prices.length||result.value.prices.length>64)throw Error('native_api_price_schema_changed');
  if(Object.keys(result.value).some(k=>!['status','reason','prices'].includes(k))||result.body.includes(credential.email)||result.body.includes(credential.password)||result.body.includes(state.token))throw Error('native_api_private_payload_not_publishable');
  state.lastVerifiedAt=result.observedAt;saveState();
  return{captures:[{url:GATEWAY+ROUTE,body:result.body,observedAt:result.observedAt,kind:'authorized_account_page',metadata:{representation:'original_native_price_http_json',portalOrigin:PORTAL,app:APP,command:'price',operation:'read_quote_only',checkoutVerified:false}}],checkpoint:null,capabilities:{login:{status:'session_observed'},nativeApi:{status:'verified',sessionMode,recovered,signinRequests:signins,accessRequests,authenticatedCheck:'access',priceRequests,readTransportRetries}},ordersCreated:0,paymentExecuted:false,browser:'service_native_api',startedAt:new Date(started).toISOString(),finishedAt:new Date(clock()).toISOString()};
 }catch(e){try{fs.writeFileSync(path.join(journal,'failure-safe.json'),JSON.stringify({privateMessage:String(e.message).slice(0,6000),errorName:/^[A-Za-z]+$/.test(e.name||'')?e.name:'Error',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:null,causeCode:/^[A-Z0-9_]+$/.test(e.cause?.code||'')?e.cause.code:null,reason:/^native_api_[a-z_]+$/.test(e.message)?e.message:/timeout/i.test(e.message)?'request_timeout':/lease|paused|config/i.test(e.message)?'control_or_lease_rejected':'transport_or_storage_failure'}),{mode:0o600});}catch{}return{captures:[],checkpoint:{type:/^native_api_[a-z_]+$/.test(e.message)?e.message:'native_api_transport_failed',url:PORTAL,stage:'native_api',reason:'独立接口采集未通过；具体响应仅保存在私有receipt，未输出账号、密码或令牌。'},capabilities:{login:{status:'not_verified'},nativeApi:{sessionMode,recovered,signinRequests:signins,accessRequests,priceRequests}},ordersCreated:0,paymentExecuted:false,browser:'service_native_api'};}
 finally{await request?.dispose?.();}
}
module.exports={collectNative,signedParams,PORTAL,GATEWAY,ROUTE,APP};
