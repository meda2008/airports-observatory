// Only recognized exact-origin free-account flows. No terms acceptance,
// CAPTCHA solving, password resets, payment or cross-domain credential fallback.
export async function sendRegistrationEmailCode({tab,send,inspect,confirmation=null,responseObserver=null}){
 const emailVerificationRequestedAt=new Date().toISOString(),button=tab.playwright.getByRole('button',{name:send,exact:true});
 let responseObservation=null;
 if(responseObserver==='boslife')responseObservation=await(await import('./site-recipes/boslife.mjs')).observeBoslifeAction({tab,operation:'email',action:()=>button.click()});
 else await button.click();
 let confirmationTimedOut=false;
 if(confirmation==='button_countdown'){
  try{await button.waitFor({state:'hidden',timeoutMs:12000});}catch(error){if(!/timeout|timed\s*out|deadline/i.test(String(error.message)))throw error;confirmationTimedOut=true;}
 }else try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){if(!/timeout|timed\s*out/i.test(String(error.message)))throw error;}
 const snapshot=await inspect(tab),emailSendCountdownObserved=confirmation==='button_countdown'&&!confirmationTimedOut&&snapshot.buttons.some(label=>/^\d{1,2}$/.test(label.trim()));
 return{snapshot,emailVerificationRequestedAt,...(confirmation?{emailSendCountdownObserved,emailRequestAccepted:null,emailDeliveryVerified:false}:{}),...(responseObservation?{responseObservation,emailRequestAccepted:responseObservation.emailRequestAccepted??null}:{}),status:responseObservation&&responseObservation.status!=='registration_response_requires_ui_confirmation'?responseObservation.status:confirmation?'email_verification_request_unconfirmed':'registration_requires_email_verification'};
}
export async function registerFree({tab,snapshot,credentialsForRegistration,inspect,profile={}}){
 if(!credentialsForRegistration)return {snapshot,status:'registration_credentials_unavailable'};
 // Some themes first render a provisional form, then replace it with the
 // configured email-code/domain/terms form. Wait for the site's observed marker
 // before selecting fields or transmitting credentials.
 if(profile.readyPlaceholder){
  try{await tab.playwright.getByPlaceholder(profile.readyPlaceholder,{exact:true}).waitFor({state:'visible',timeoutMs:12000});}
  catch(error){if(!/timeout|timed\s*out|deadline/i.test(String(error.message)))throw error;return{snapshot:await inspect(tab),status:'registration_form_not_ready'};}
  snapshot=await inspect(tab);
 }
 const origin=new URL(snapshot.url).origin,c=await credentialsForRegistration(origin);
 if(!c||c.origin!==origin||!c.email||!c.password)return {snapshot,status:'registration_credentials_unavailable'};
 if(/付费注册|购买后.*注册|购买.*才能注册|邀请码必填|邀请制|pay to register/i.test(snapshot.text))return {snapshot,status:'registration_not_free_or_invite_required'};
 const fields=snapshot.formFields||[];
 const emailFields=fields.filter(f=>f.type==='text'&&/邮箱|email/i.test(f.name+' '+f.placeholder)&&!/验证码|code|确认|confirm/i.test(f.name+' '+f.placeholder));
 const emailInput=snapshot.emailInputCount===1?tab.playwright.locator('input[type="email"]'):emailFields.length===1&&emailFields[0].placeholder?tab.playwright.getByPlaceholder(emailFields[0].placeholder,{exact:true}):null;
 if(!emailInput||![1,2].includes(snapshot.passwordInputCount)||fields.some(f=>/payment|card|银行卡|信用卡/i.test(f.name+' '+f.placeholder)))return {snapshot,status:'registration_form_requires_adapter'};
 const button=snapshot.buttons.find(x=>/^(注册|立即注册|提交注册|创建账户|创建账号|Sign up|Register|Create account)$/i.test(x.replace(/[\uE000-\uF8FF]/g,'').trim()));
 if(!button)return {snapshot,status:'registration_form_requires_adapter'};
 const suffix=snapshot.text.split('\n').map(x=>x.trim()).find(x=>/^@[a-z0-9.-]+\.[a-z]+$/i.test(x));
 if(suffix&&!c.email.toLowerCase().endsWith(suffix.toLowerCase()))return{snapshot,status:'registration_email_suffix_requires_adapter'};
 if(profile.emailMode==='fixed_visible_domain'){
  // CyberGuard renders '@' and the fixed Gmail domain as separate visible lines.
  // Never put the full email in its local-part input or infer a hidden suffix.
  const domain=String(profile.emailFixedDomain||'').toLowerCase(),lines=snapshot.text.split('\n').map(x=>x.trim()),observed=lines.filter((line,i)=>line==='@'&&lines[i+1]?.toLowerCase()===domain);
  if(!domain||observed.length!==1)return{snapshot,status:'registration_email_domain_not_observed'};
  const split=c.email.lastIndexOf('@');if(split<1||c.email.slice(split+1).toLowerCase()!==domain)return{snapshot,status:'registration_email_suffix_requires_adapter'};
  await emailInput.fill(c.email.slice(0,split));
 }else if(profile.emailMode==='split_local_and_domain'){
  const combos=await tab.playwright.getByRole('combobox').all(),visible=[];for(const combo of combos)if(await combo.isVisible())visible.push(combo);if(visible.length!==1)return{snapshot,status:'registration_email_domain_select_ambiguous'};
  const domain=c.email.split('@').at(-1).toLowerCase(),prefix=profile.emailDomainLabelPrefix||'',options=await visible[0].evaluate(e=>e.tagName==='SELECT'?[...e.options].map(o=>({label:o.label,value:o.value})):[]),matches=options.filter(o=>o.label.toLowerCase()===prefix+domain);if(matches.length!==1)return{snapshot,status:'registration_email_domain_not_observed'};await visible[0].selectOption(matches[0].value);await emailInput.fill(c.email.slice(0,-domain.length-1));
 }else await emailInput.fill(suffix?c.email.slice(0,-suffix.length):c.email);
 const passwords=await tab.playwright.locator('input[type="password"]').all();for(const p of passwords)await p.fill(c.password);
 await tab.getAXState?.({emit:false});
 const next=await inspect(tab);
 if(next.agreementCheckbox||/同意.*(?:条款|协议)|注册即.*同意|注册.*表示.*同意|agree.*terms|accept.*terms/i.test(next.text))return {snapshot:next,status:'registration_requires_terms_confirmation'};
 if(next.verificationWidgetObserved||/验证您|人机|captcha|turnstile|hcaptcha|我不是恶意刷站/i.test(next.text))return {snapshot:next,status:'registration_requires_verification'};
 if(/邮箱验证码|email verification code/i.test(next.text)||(next.formFields||[]).some(f=>/邮箱验证码|email.*(?:verification|code)/i.test(f.placeholder||''))){
  const send=next.buttons.find(x=>/^(发送|发送验证码|Send code)$/i.test(x.trim()));
  if(send)return sendRegistrationEmailCode({tab,send,inspect,confirmation:profile.emailSendConfirmation||null,responseObserver:profile.responseObserver||null});
  return{snapshot:next,status:'registration_requires_email_verification'};
 }
 if(/验证码/i.test(next.text))return {snapshot:next,status:'registration_requires_verification'};
 if(fields.some(f=>/code|验证码/i.test(f.name+' '+f.placeholder)))return {snapshot:next,status:'registration_requires_email_or_access_code'};
 const label=button.replace(/[\uE000-\uF8FF]/g,'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const submit=tab.playwright.getByRole('button',{name:new RegExp(label+'$','i')});
 if(profile.responseObserver==='boslife'){
  const responseObservation=await(await import('./site-recipes/boslife.mjs')).observeBoslifeAction({tab,operation:'register',action:()=>submit.click()});
  if(responseObservation.status!=='registration_response_requires_ui_confirmation')return{snapshot:await inspect(tab),status:responseObservation.status,responseObservation};
 }else await submit.click();
 try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){
  if(/dialog.*active|alert.*active/i.test(String(error.message))){const dialog=await tab.getJsDialog();if(dialog?.type!=='alert')return{snapshot:next,status:'registration_requires_dialog_confirmation'};const ax=await tab.getAXState({emit:false});const existing=/邮箱.*(?:存在|注册)|账号.*存在|already.*(?:exist|registered)/i.test(ax),created=/注册成功|account.*created|registration.*success/i.test(ax);await dialog.dismiss();return{snapshot:await inspect(tab),status:existing?'registration_account_exists_needs_login':created?'registration_created_needs_login':'registration_rejected_with_alert'};}
  if(!/timeout|timed\s*out/i.test(String(error.message)))throw error;
 }
 const after=await inspect(tab);
 return {snapshot:after,status:/验证码|邮件|邮箱.*验证|captcha|verify/i.test(after.text)?'registration_requires_verification':'registration_submitted_requires_state_check'};
}
