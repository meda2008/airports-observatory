'use strict';
// Observe only the service browser's normal, declared read. Never send another
// request, extract browser tokens, export account data, or infer a paid plan.
function createCoffeeNativeSessionProof(config,credential,{clock=Date.now}={}){
 const origin=require('../deploy-service/biubiu-verification.cjs').configured(config)?'https://ccount.biubiu.club':config?.recordId==='A148'&&config.readOnlyRecipe==='guangnian_authenticated_catalog_readonly'&&config.entryUrl==='https://vv3dbvb.guangnianertt1.homes/#/plans'?'https://vv3dbvb.guangnianertt1.homes':config?.recordId==='A156'&&config.readOnlyRecipe==='lingmao_authenticated_readonly'&&config.entryUrl==='https://lingmao.civetxx.cfd/#/plans'?'https://lingmao.civetxx.cfd':config?.recordId==='A177'&&config.readOnlyRecipe==='lingdong_authenticated_catalog_readonly'&&config.entryUrl==='https://nbqmhk.lingdongttt.sbs/#/plans'?'https://nbqmhk.lingdongttt.sbs':config?.recordId==='A161'&&config.readOnlyRecipe==='onefly_authenticated_catalog_readonly'&&config.entryUrl==='https://7i859w4w.fjumpy.mom/#/plans'?'https://7i859w4w.fjumpy.mom':config?.recordId==='A164'&&config.readOnlyRecipe==='invisible_authenticated_catalog_readonly'&&config.entryUrl==='https://rfadteb.invisibleattt.sbs/#/plans'?'https://rfadteb.invisibleattt.sbs':config?.recordId==='A176'&&config.readOnlyRecipe==='ninecloud_native_catalog_readonly'&&config.entryUrl==='https://shop.starpro.one/#/plan'?'https://shop.starpro.one':config?.recordId==='A154'&&config.readOnlyRecipe==='shanhai_authenticated_catalog_readonly'?'https://shanhai.cfd':config?.recordId==='A073'&&config.readOnlyRecipe==='dageyun_plain_image_login'?'https://aff01.zygbx.com':config?.recordId==='A071'?'https://board.cloudnier.com':config?.recordId==='A078'?'https://aicoffee.app':config?.recordId==='A060'&&config.readOnlyRecipe==='skylinx_native_catalog_readonly'?'https://user.skylinx.org.uk':null;
 if(!origin||config.auth?.mode!=='login'||config.publicOnly||credential?.origin!==origin||typeof credential.email!=='string'||!credential.email)return null;
 // NineCloud native umi client SHA69ff1e68dd44b84f803e631367b6fc9dfd52e79d049067fa52cfa859031f20dc declares /plan, same-origin api/v1 and GET /user/info.
 // SkyLinX native umi client SHA23b495a72aa9c55f71dbca0c049935805612de04486e725799dc55b72a6152a3 declares routerBase + api/v1 and GET /user/info.
 const accountPath=config.recordId==='A073'?'/v1/user/info':'/api/v1/user/info';
 const endpoint=origin+accountPath,pending=new Set();
 let state={observed:false,reason:'native_account_read_not_observed'},revision=0;
 async function inspect(response){try{
  const observedUrl=new URL(response.url());if(observedUrl.origin!==origin||observedUrl.pathname!==accountPath||observedUrl.hash||response.request().method()!=='GET')return;
  if(['A060','A176'].includes(config.recordId)){if([...observedUrl.searchParams].some(([k,v])=>k!=='t'||!/^\d{1,16}$/.test(v))||observedUrl.searchParams.getAll('t').length>1)return;}else if(observedUrl.search)return;
  const observedRevision=++revision;
  state={observed:false,reason:'native_account_response_not_qualified'};
  const status=response.status();
  if(status===401||status===403){state={observed:false,reason:'server_session_rejected'};return;}
  if(status!==200)return;
  const bytes=await response.body();if(bytes.length>262144)return;
  if(observedRevision!==revision)return;
  const value=JSON.parse(Buffer.from(bytes).toString('utf8'));
  const positiveStatus=['A060','A073'].includes(config.recordId)?[true,1,200,'success','ok']:['A196','A164','A177','A148','A156'].includes(config.recordId)?[true,1,'success']:[true,1];
  if(!value||typeof value!=='object'||value.error!==undefined&&value.error!==null&&value.error!==false||'status'in value&&!positiveStatus.includes(value.status)){state={observed:false,reason:'native_account_envelope_unqualified'};return;}
  if(!value.data||Array.isArray(value.data)||typeof value.data.email!=='string'){state={observed:false,reason:'native_account_identifier_missing'};return;}
  if(value.data.email.trim().toLowerCase()!==credential.email.trim().toLowerCase()){state={observed:false,reason:'account_identifier_mismatch'};return;}
  state={observed:true,basis:'same_origin_native_user_info_email_matched',endpoint,httpStatus:200,observedAt:new Date(clock()).toISOString(),accountDataExported:false};
 }catch{}}
 return{
  observe(response){const task=inspect(response);pending.add(task);void task.finally(()=>pending.delete(task));},
  async settle(){let timer;try{await Promise.race([Promise.allSettled([...pending]),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}finally{clearTimeout(timer);}},
  snapshot(){return{...state};}
 };
}
async function recoverCoffeeCachedSnapshot({source,proof,page,observe,beforePage,deadline,clock=Date.now,origin='https://aicoffee.app'}){
 if(!source.passwordForm||!proof)return source;
 const until=Math.min(deadline-1500,clock()+3000);
 do{
  await beforePage();await proof.settle();const fresh=await observe(page);
  if(/继续即表示同意|登录即(?:表示)?同意/.test(fresh.text||''))return {...fresh,type:'terms_confirmation_required'};
  if(new URL(fresh.url).origin!==origin||fresh.type||fresh.agreementCheckbox)return fresh;
  if(!fresh.passwordForm&&proof.snapshot().observed)return fresh;
  if(clock()>=until)break;
  await page.waitForTimeout(250);
 }while(clock()<until);
 return source;
}
module.exports={createCoffeeNativeSessionProof,recoverCoffeeCachedSnapshot};
