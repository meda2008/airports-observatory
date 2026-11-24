// Codes exist only in memory. Receipts deliberately exclude code, code hashes,
// message bodies and Gmail message URLs. A mailbox adapter is injected by the
// authorized browser/connector session; this module never signs into email.
export function validateCodeEnvelope(request,envelope,now=Date.now()){
 if(!envelope||envelope.registrationOrigin!==request.registrationOrigin)throw Error('email_code_origin_mismatch');
 if(envelope.recipient?.toLowerCase()!==request.registrationEmail.toLowerCase()||envelope.mailboxVerified!==true)throw Error('email_code_recipient_or_mailbox_mismatch');
 if(!/^\d{4,8}$/.test(envelope.code||''))throw Error('email_code_format_unconfirmed');
 const received=Date.parse(envelope.receivedAt),requested=Date.parse(request.requestedAt),expires=Date.parse(envelope.expiresAt);
 if(!Number.isFinite(received)||!Number.isFinite(requested)||!Number.isFinite(expires)||received<requested-60000||received>now+60000||expires<=now+15000)throw Error('email_code_stale_or_expired');
 if(expires-received>15*60000)throw Error('email_code_expiry_requires_review');
 return {status:'code_validated',mailboxVerified:true,recipientMatched:true,receivedAt:envelope.receivedAt,expiresAt:envelope.expiresAt,source:envelope.source||'authorized_mailbox_adapter',codePersisted:false};
}
export async function completeEmailVerification({tab,request,codeProvider,inspect}){
 if(new URL(await tab.url()).origin!==request.registrationOrigin)throw Error('registration_page_origin_changed');
 let snapshot=await inspect(tab);
 if(snapshot.agreementCheckbox||/同意.*(?:条款|协议)|注册即.*同意|agree.*terms|accept.*terms/i.test(snapshot.text))return{snapshot,status:'registration_requires_terms_confirmation'};
 if(snapshot.verificationWidgetObserved||/验证您|人机|captcha|turnstile|hcaptcha/i.test(snapshot.text))return{snapshot,status:'registration_requires_verification'};
 let envelope=await codeProvider({...request,includeSpam:true});const receipt=validateCodeEnvelope(request,envelope);
 if(new URL(await tab.url()).origin!==request.registrationOrigin)throw Error('registration_page_origin_changed');
 snapshot=await inspect(tab);
 if(snapshot.agreementCheckbox||/同意.*(?:条款|协议)|注册即.*同意|agree.*terms|accept.*terms/i.test(snapshot.text))return{snapshot,status:'registration_requires_terms_confirmation'};
 if(snapshot.verificationWidgetObserved||/验证您|人机|captcha|turnstile|hcaptcha/i.test(snapshot.text))return{snapshot,status:'registration_requires_verification'};
 const field=snapshot.formFields.find(f=>/邮箱验证码|email.*(?:verification|code)/i.test(f.placeholder||''));if(!field)throw Error('email_code_field_requires_adapter');
 const button=snapshot.buttons.find(b=>/^(注册|立即注册|提交注册|Create account|Register|Sign up)$/i.test(b.replace(/[\uE000-\uF8FF]/g,'').trim()));if(!button)throw Error('email_registration_button_requires_adapter');
 await tab.playwright.getByPlaceholder(field.placeholder,{exact:true}).fill(envelope.code);
 // Clear our reference immediately after transmission; never serialize it.
 envelope=null;
 await tab.getAXState?.({emit:false});
 if(new URL(await tab.url()).origin!==request.registrationOrigin)throw Error('registration_page_origin_changed');
 await tab.playwright.getByRole('button',{name:new RegExp(button.replace(/[\uE000-\uF8FF]/g,'').trim()+'$','i')}).click();
 try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){if(!/timeout|timed\s*out/i.test(String(error.message)))throw Error('registration_response_requires_inspection');}
 snapshot=await inspect(tab);
 return{snapshot,status:snapshot.authenticationObserved&&!snapshot.passwordForm?'registration_email_verified_authenticated_ui':'email_code_submitted_state_unconfirmed',receipt:{...receipt,status:'code_submitted_account_not_yet_asserted'}};
}
