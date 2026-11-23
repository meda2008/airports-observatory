'use strict';
const origin='https://b8cfff2a4jquxdbmwbaj.wgetcloud.org';
function emailRequestAllowed(req,config,credential){try{if(config?.recordId!=='A001'||new URL(config.entryUrl).origin!==origin||credential?.origin!==origin||req.method()!=='POST'||req.url()!==origin+'/totp_email')return false;const body=req.postData();if(typeof body!=='string'||body.length>4096)return false;const data=new URLSearchParams(body);return [...data.keys()].length===2&&data.getAll('email').length===1&&data.getAll('passwd').length===1&&data.get('email')===credential.email&&data.get('passwd')===credential.password;}catch{return false;}}
async function completeEmailStep(page,{config,credential,snapshot={},provider,beforePage=async()=>{},withAuthWrite,rememberCode=()=>{},deadline=Date.now()+30000,clock=Date.now}={}){
 if(config?.recordId!=='A001'||credential?.origin!==origin||new URL(page.url()).origin!==origin||snapshot.type||snapshot.verificationWidgetObserved||snapshot.agreementCheckbox)return{status:'not_applicable'};
 const link=page.locator('#totp_email_link'),codeInput=page.locator('#totp_code');if(await link.count()!==1||!await link.isVisible()||!await codeInput.isVisible())return{status:'not_applicable'};
 if(await page.locator('#totp_setup_box').isVisible())return{status:'two_factor_enrollment_requires_user'};
 const binding={siteId:'A001',origin,recipient:credential.email};
 try{await provider.prepare(binding);}catch(e){return{status:/^mailbox_[a-z0-9_]+$/.test(e.message)?e.message:'mailbox_configuration_unavailable'};}
 await beforePage();if(new URL(page.url()).origin!==origin)return{status:'credential_destination_changed'};
 const requestedAt=new Date(clock()).toISOString();let sendResponse;
 try{await withAuthWrite(async()=>{
  const pending=page.waitForResponse(r=>r.url()===origin+'/totp_email'&&r.request().method()==='POST',{timeout:Math.min(10000,Math.max(1,deadline-clock()))});
  try{await link.click();sendResponse=await pending;}catch(e){await pending.catch(()=>{});throw e;}
 });}catch{return{status:'email_code_send_response_missing',requestedAt};}
 let sentResult;try{sentResult=await sendResponse.json();}catch{return{status:'email_code_send_response_invalid',requestedAt};}
 if(sendResponse.status()!==200||![true,1,'1'].includes(sentResult.ret))return{status:'email_code_send_not_accepted',requestedAt};
 // Inspect only the native flag set by the successful /totp_email response. Never set it ourselves.
 const flag=page.locator('#totp_email');let sent=false;for(let i=0;i<8&&clock()<deadline-3000;i++){sent=await flag.evaluate(e=>e.value==='1');if(sent)break;await page.waitForTimeout(250);}if(!sent)return{status:'email_code_request_not_confirmed'};
 const ok=page.locator('.swal2-confirm').filter({visible:true});if(await ok.count()===1&&await page.locator('.swal2-icon-success').isVisible())await ok.click();
 const pollingStarted=clock();let result,polls=0;for(let attempt=0;attempt<12&&clock()<deadline-5000;attempt++){polls++;await beforePage();try{result=await provider.findCode({...binding,requestedAt});}catch(e){return{status:/^mailbox_[a-z0-9_]+$/.test(e.message)?e.message:'mailbox_read_failed'};}if(result)break;await page.waitForTimeout(Math.min(2500,Math.max(0,deadline-clock()-5000)));}
 if(!result)return{status:'email_code_not_found_in_normal_or_spam',requestedAt,polls,pollingMs:clock()-pollingStarted};
 const code=require('./auth.cjs').validateEmailCode(result,{origin,recipient:credential.email,requestedAt,now:clock(),maxClockSkewMs:5000});rememberCode(code);
 if(new URL(page.url()).origin!==origin||!await codeInput.isVisible())return{status:'email_code_form_changed'};
 await codeInput.fill(code);const submit=page.getByRole('button',{name:'验证并登录',exact:true}).filter({visible:true});if(await submit.count()!==1)return{status:'email_code_submit_ambiguous'};
 await withAuthWrite(()=>submit.click());await page.waitForTimeout(800);
 const title=page.locator('.swal2-title');if(await title.count()===1&&await title.innerText()==='登录成功'){const confirm=page.locator('.swal2-confirm').filter({visible:true});if(await confirm.count()===1)await confirm.click();}
 // Native success reloads /user. Its account-settings drawers contain password
 // and email-code fields, so inspect the configured catalogue before applying
 // the generic login-form gate. This navigation cannot assert authentication:
 // the collector still requires the account witness on /user/shop.
 await page.waitForURL(url=>url.origin===origin&&url.pathname==='/user',{timeout:Math.min(5000,Math.max(1,deadline-clock()))}).catch(()=>{});
 if(new URL(page.url()).origin===origin&&new URL(page.url()).pathname==='/user'&&config.entryUrl===origin+'/user/shop'){
  await beforePage();await page.goto(config.entryUrl,{waitUntil:'domcontentloaded',timeout:Math.min(12000,Math.max(1,deadline-clock()))});
 }
 return{status:'email_code_submitted',folder:result.folder,polls,requestedAt,deliveryOffsetMs:Date.parse(result.receivedAt)-Date.parse(requestedAt),codeExported:false};
}
module.exports={completeEmailStep,emailRequestAllowed,origin};
