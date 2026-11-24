'use strict';
const fs=require('node:fs'),path=require('node:path'),origin='https://speedcat.xyz',url=origin+'/tos';
function configured(c){return c?.recordId==='A006'&&c.entryUrl===url&&c.readOnlyRecipe==='speedcat_native_public_terms'&&c.publicOnly===true&&!c.auth&&c.fields?.length===1&&c.fields[0]==='refund'&&c.allowedHosts?.length===1&&c.allowedHosts[0]==='speedcat.xyz';}
async function collect({config,sessionDir,beforePage=async()=>{},clock=Date.now}){
 const out={captures:[],browser:'service_chromium',capabilities:{login:{status:'not_attempted'}},ordersCreated:0,paymentExecuted:false};let owned,armed=false;const checks=[];
 const block=type=>({...out,checkpoint:{type,url,stage:'public_terms',reason:'闪电猫公开条款读取或原生入口表单未通过；不登录、不接受协议、不建单或付款。'},capabilities:{...out.capabilities,publicTerms:{status:'not_verified',checks}}});
 if(!configured(config))return block('speedcat_public_terms_scope_invalid');
 try{owned=await require('./headed-service-browser.cjs').open({profile:path.join(sessionDir,'speedcat-public-terms','profile')});const {page,context}=owned,gate=require('./native-access-gate.cjs');
  await context.route('**/*',async route=>{const r=route.request();try{const u=await require('./collector.cjs').assertPublicUrl(r.url());if(u.origin!==origin||!['GET','HEAD','OPTIONS'].includes(r.method())&&!(armed&&gate.requestAllowed(r,config)))return route.abort();if(/\/(?:auth|user|register|cart|order|payment|logout)(?:\/|$)/.test(u.pathname))return route.abort();return route.continue();}catch{return route.abort();}});
  await beforePage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:18000});if(page.url()===origin+'/verify?next=%2Ftos'){const b=page.getByRole('button',{name:/我不是恶意刷站/});if(await b.count()!==1)return block('speedcat_public_terms_control_changed');await gate.submit(page,b,config,{withVerificationWrite:async fn=>{armed=true;try{await fn();}finally{armed=false;}},deadline:clock()+12000,clock});checks.push({normalVisibleControl:true,target:'/tos',credentialsSubmitted:false});await page.waitForURL(url,{timeout:12000});}
  if(page.url()!==url)return block('speedcat_public_terms_destination_changed');await page.waitForTimeout(600);const body=await page.locator('body').innerText();if(!body.trim()||/访问验证|请验证您是真人|Just a moment/.test(body))return block('speedcat_public_terms_not_readable');
  out.captures.push({url,body:require('./standalone-collector.cjs').redact(body),kind:'operator_visible_page',observedAt:new Date(clock()).toISOString(),metadata:{representation:'original_speedcat_public_terms_text',authenticationObserved:false}});return{...out,capabilities:{...out.capabilities,publicTerms:{status:'observed',checks,accountCredentialsUsed:false}}};
 }catch{return block('speedcat_public_terms_read_failed');}finally{await owned?.close();}
}
module.exports={configured,collect,origin,url};
