'use strict';
// Observed SSPanel access forms: no account data, only the read-only shop target.
const origins={A041:'https://web01.fliggycloud.cc',A006:'https://speedcat.xyz',A186:'https://fastlink.ws',A141:'https://a32.qytaff03.cc',A144:'https://a30.xmfvipaffa01.cc'};
const targets={A041:'/',A006:'/user/shop',A186:'/user/shop',A141:'/shop',A144:'/shop'};
function targetFor(config){if(config?.recordId==='A006'&&config.entryUrl==='https://speedcat.xyz/tos'&&config.readOnlyRecipe==='speedcat_native_public_terms'&&config.publicOnly===true&&!config.auth&&config.fields?.length===1&&config.fields[0]==='refund')return '/tos';return !!origins[config?.recordId]&&config.entryUrl===origins[config.recordId]+targets[config.recordId]?targets[config.recordId]:null;}
function configured(config){return !!targetFor(config);}
function requestAllowed(req,config){try{
 if(!configured(config)||req.method()!=='POST'||req.url()!==origins[config.recordId]+'/verify'||new URL(req.frame().url()).origin!==origins[config.recordId])return false;
 const body=req.postData();if(typeof body!=='string'||body.length>256)return false;
 const data=new URLSearchParams(body);
 if(config.recordId==='A041')return [...data.keys()].length===2&&data.getAll('next').length===1&&data.get('next')==='/'&&data.getAll('_token').length===1&&data.get('_token')==='';
 return [...data.keys()].length===1&&data.getAll('next').length===1&&data.get('next')===targetFor(config);
 }catch{return false;}}
async function submit(page,control,config,{withVerificationWrite,deadline,clock}){
 if(!configured(config))return false;
 const form=await control.evaluate(e=>({action:e.form?.action,method:e.form?.method,fields:[...e.form?.querySelectorAll('input')||[]].map(x=>({name:x.name,type:x.type}))}));
 if(form.action!==origins[config.recordId]+'/verify'||form.method!=='post'||(config.recordId==='A041'?form.fields.length!==2||form.fields.some(f=>f.type!=='hidden')||form.fields.map(f=>f.name).sort().join(',')!=='_token,next':form.fields.length!==1||form.fields[0].name!=='next'||form.fields[0].type!=='hidden'))throw Error('access_form_contract_changed');
 await withVerificationWrite(async()=>{
  const response=page.waitForResponse(r=>r.url()===form.action&&r.request().method()==='POST',{timeout:Math.min(10000,Math.max(1,deadline-clock()))});
  try{await control.click();const observed=await response;if(observed.status()<200||observed.status()>=400)throw Error('access_form_rejected');}catch(e){await response.catch(()=>{});throw e;}
 });return true;
}
function runtimeProof(config,checks){if(!configured(config)||!checks?.some(c=>c.status==='verification_cleared'&&c.attempts===1&&c.passed===true&&c.nativeAccessForm===true))return null;return{status:'observed_cleared',origin:origins[config.recordId],target:targetFor(config),method:'POST',path:'/verify'};}
function validatedProof(proof,config){const expected=runtimeProof(config,[{status:'verification_cleared',attempts:1,passed:true,nativeAccessForm:true}]);return proof&&expected&&Object.keys(proof).sort().join(',')===Object.keys(expected).sort().join(',')&&Object.entries(expected).every(([k,v])=>proof[k]===v||k==='origin'&&proof[k]===v+'/')?expected:null;}
module.exports={configured,requestAllowed,submit,origins,runtimeProof,validatedProof,targetFor};
