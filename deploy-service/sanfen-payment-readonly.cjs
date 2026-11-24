'use strict';
// Exact same-origin read of an existing service-owned session. Never signs in,
// creates an order, or guesses a different API prefix after a rejection.
const fs=require('node:fs');
const origin='https://sanfen.gonghailin.xin',url=origin+'/api/user/order/getPaymentMethod';
function configured(c){return c?.recordId==='A068'&&c.entryUrl===origin+'/plan'&&c.publicOnly===false&&c.accountReadOnly===true&&c.auth?.mode==='login'&&c.fields?.includes('payment')&&c.allowedHosts?.includes('sanfen.gonghailin.xin');}
async function collect({config,credential,stateFile,beforePage=async()=>{},clock=Date.now,requestFactory}){
 const result={captures:[],browser:'service_native_api',capabilities:{login:{status:'not_verified'}},ordersCreated:0,paymentExecuted:false};
 const block=type=>({...result,checkpoint:{type,url:config.entryUrl,stage:'cached_payment_read',reason:'三分专站只读会话验证未通过；保留旧数据，不重试密码、不切换接口、不建单。'}});
 if(!configured(config)||!credential)return block('sanfen_matching_account_required');
 let state,token;try{state=JSON.parse(fs.readFileSync(stateFile,'utf8'));token=state.origins?.find(x=>x.origin===origin)?.localStorage?.find(x=>x.name==='authToken')?.value;try{const v=JSON.parse(token);if(typeof v==='string')token=v;}catch{}}catch{return block('sanfen_saved_access_required');}
 if(typeof token!=='string'||!token||token.length>10000)return block('sanfen_saved_access_required');
 let request;try{
  request=await(requestFactory||require('playwright').request.newContext.bind(require('playwright').request))({ignoreHTTPSErrors:false,storageState:state});
  const read=async u=>{await beforePage();await require('./collector.cjs').assertPublicUrl(u);const r=await request.get(u,{headers:{Authorization:token},timeout:12000,maxRedirects:0});return{status:r.status(),body:await r.text(),observedAt:new Date(clock()).toISOString()};};
  const account=await read(origin+'/api/user/info');let av;try{av=JSON.parse(account.body);}catch{}
  if(account.status!==200||typeof av?.data?.email!=='string'||av.data.email.toLowerCase()!==credential.email.toLowerCase())return block('sanfen_saved_access_not_verified');
  const r=await read(url);let v;try{v=JSON.parse(r.body);}catch{}
  if(r.status!==200||v?.success!==true||!Array.isArray(v.data)||!v.data.length||v.data.length>30||[token,credential.email,credential.password].some(x=>x&&r.body.includes(x))||v.data.some(x=>!x||typeof x.name!=='string'||typeof x.payment!=='string'||Object.keys(x).some(k=>/secret|token|password|key/i.test(k))))return block('sanfen_payment_channels_not_verified');
  result.captures.push({url,body:r.body,observedAt:r.observedAt,kind:'authorized_account_page',metadata:{representation:'original_cached_payment_methods_json',authenticationObserved:true}});
  result.capabilities={login:{status:'session_observed'},sanfenPayment:{status:'verified',accountIdentityVerified:true,apiPrefix:'/api',signinRequests:0,paymentRequests:1}};return result;
 }catch{return block('sanfen_payment_read_failed');}finally{await request?.dispose?.();}
}
function runtimeProof(siteId,config,caps){const p=caps?.sanfenPayment;return siteId==='A068'&&configured(config)&&caps.login?.status==='session_observed'&&p?.status==='verified'&&p.accountIdentityVerified===true&&p.apiPrefix==='/api'&&p.signinRequests===0&&p.paymentRequests===1?{status:'verified',authenticatedCheck:'user_info',accountIdentityVerified:true,sessionMode:'cached_session',signinRequests:0,accessRequests:1,priceRequests:0,paymentRequests:1}:null;}
module.exports={origin,url,configured,collect,runtimeProof};
