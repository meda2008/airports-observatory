'use strict';
// Public backend bootstrap exactly as declared by the operator's EZ theme.
// No account identifier, password, CAPTCHA token, registration or payment operation.
const PORTAL='https://www.cyberguard.best',URL='https://api-web.cyberguard.cfd/api/v1/guest/comm/config',RECIPE='cyberguard_native_config_readonly';
const HEADERS=Object.freeze({Baggage:'8a57ac9dbe76'});
function configured(c){try{return c.recordId==='A047'&&c.readOnlyRecipe===RECIPE&&new globalThis.URL(c.entryUrl).origin===PORTAL&&c.allowedHosts.includes('api-web.cyberguard.cfd');}catch{return false;}}
async function collectNative({config,beforePage=async()=>{},clock=Date.now,jobBudgetMs=30000,transportFactory}={}){
 const captures=[],base={ordersCreated:0,paymentExecuted:false,browser:'service_native_api',capabilities:{login:{status:'not_attempted'},nativeContract:{status:'not_verified'}}};
 const checkpoint=(type,reason)=>({...base,captures,checkpoint:{type,url:PORTAL,stage:'native_public_config',reason,requestedAction:'有效账号与认证流程通过后再启用每周套餐采集；不重试已被拒绝的旧密码。'}});
 if(!configured(config))return checkpoint('native_api_scope_rejected','配置没有绑定到当前官网及其声明的后台。');
 let request;const started=clock();let retryCount=0;
 try{
  request=transportFactory?await transportFactory():await require('playwright').request.newContext({...require('./web-context-egress.cjs').webContextEgress(config),ignoreHTTPSErrors:false});
  let response;for(;;){await beforePage();const remaining=jobBudgetMs-(clock()-started);if(remaining<1000)return checkpoint('native_api_budget_exhausted','公开配置读取超过本次时限。');try{response=await request.get(URL,{headers:HEADERS,timeout:Math.min(12000,remaining),maxRedirects:0});break;}catch(e){if(retryCount||!['ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(e.code))throw e;retryCount++;}}
  const body=await response.text(),observedAt=new Date(clock()).toISOString();if(body.length>200000)return checkpoint('native_api_schema_changed','响应超过已验证范围。');
  captures.push({url:URL,body,observedAt,kind:'operator_visible_page',metadata:{representation:'original_native_public_config_http_response',authenticationObserved:false,requestProfile:'operator_declared_Baggage_header',readTransportRetries:retryCount}});
  let value;try{value=JSON.parse(body);}catch{return checkpoint('native_api_interactive_verification_or_non_json','正常客户端请求未取得配置JSON，未尝试验证或绕过。');}
  if(response.status()!==200||!value.data||typeof value.data!=='object')return checkpoint('native_api_http_or_schema_rejected','接口未返回已验证的公开配置。');
  base.capabilities.nativeContract={status:'public_backend_readable',authenticationSupplied:false,captchaDeclared:value.data.is_recaptcha===1,readTransportRetries:retryCount};
  return checkpoint('native_api_valid_account_required','官网公开配置接口已可读；原生套餐接口返回未登录。仍需有效账号及正常认证，不等于登录、报价或每周采集已通过。');
 }catch(e){return checkpoint('native_api_transport_failed','公开配置请求失败；未提交账号或密码。');}
 finally{await request?.dispose?.();}
}
module.exports={PORTAL,URL,RECIPE,HEADERS,configured,collectNative};
