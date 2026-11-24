import {readRenderedDocument} from '../visible-document.mjs';
const origins=new Set(['https://33333.ifnf.xyz','https://cjmy.xyz','https://ifnf.net','https://www.fnf.xyz']);
// Entry recovery only: a publisher title never authorizes credentials or financial admission.
export function assessFnfEntry(document,{credentialsSubmitted=false}={}){
 if(!origins.has(new URL(document.url).origin))throw Error('fnf_candidate_scope_mismatch');
 const text=String(document.text||'').trim();
 const nativeLogin=(document.links||[]).find(l=>{try{const u=new URL(l.url);return origins.has(u.origin)&&u.pathname==='/seni/yes/auth/login'&&!u.search;}catch{return false;}});
 const common={identityConfirmed:false,financialFieldsConfirmed:[],credentialsSubmitted,newOrdersCreated:0,paymentExecuted:false,...(nativeLogin?{nativeLoginUrl:nativeLogin.url}:{})};
 if(document.buttons?.includes('OK')&&text.includes('仅限邀请注册，请填写邀请码'))return{...common,status:'invitation_required_before_email_send',emailCodeSent:false,registrationCreated:false,resumeWhen:'user_supplied_invitation_then_current_terms_confirmation',automaticRetryAllowed:false};
 if(document.passwordForm&&text.includes('邮箱或者密码错误')&&credentialsSubmitted)return{...common,status:'login_rejected',accountPasswordInvalid:null,credentialValidity:'submitted_pair_rejected_not_proof_account_absent',resumeWhen:'valid_invitation_for_free_registration_or_user_restored_session',automaticRetryAllowed:false};
 if(!text&&!document.passwordForm)return{...common,status:'empty_publisher_body',resumeWhen:'publisher_body_or_native_entry_link_changes'};
 // A body-scoped observation already contains this modal; the shared reader's
 // visibleDialogCount counts only additional dialogs outside its text region.
 if(document.passwordForm&&document.buttons?.includes('OK')&&text.includes('登录请求失败，请稍后重试。'))return{...common,status:credentialsSubmitted?'login_request_failed':'entry_request_error_without_credential_submission',accountPasswordInvalid:null,credentialValidity:credentialsSubmitted?'not_established':'not_tested',resumeWhen:'changed_working_entry_or_explicit_new_attempt_authorization',automaticRetryAllowed:false};
 if(/invalid_credentials/.test(text))return{...common,status:credentialsSubmitted?'login_rejected':'entry_response_error_without_credential_submission',accountPasswordInvalid:null,credentialValidity:credentialsSubmitted?'not_established':'not_tested',resumeWhen:'working_visible_login_form_or_new_official_entry'};
 if(document.verificationWidgetObserved||/Cloudflare|captcha|人机验证|访问验证/i.test(text))return{...common,status:'verification_checkpoint',resumeWhen:'action_time_verification_confirmation'};
 if(document.agreementCheckbox||/同意.*(?:条款|隐私)/.test(text))return{...common,status:'agreement_checkpoint',resumeWhen:'action_time_agreement_confirmation'};
 if(document.title==='Foo&Friends'&&text.includes('请点击继续访问。')&&text.includes('Please click continue to proceed.')&&document.buttons?.includes('继续 / Continue')&&!document.passwordForm)return{...common,status:'ordinary_continue_available'};
 return{...common,status:document.passwordForm?'visible_login_requires_identity_review':'new_entry_content_requires_review'};
}
export async function collectFnfEntry(tab,options={}){
 const before=await readRenderedDocument(tab),assessment=assessFnfEntry(before,options),captures=[before];
 if(assessment.status!=='ordinary_continue_available')return{...assessment,captures};
 // This exact non-binding Continue is not a CAPTCHA or a terms acceptance.
 await tab.playwright.getByRole('button',{name:'继续 / Continue',exact:true}).click();
 const after=await readRenderedDocument(tab);captures.push(after);
 return{...assessFnfEntry(after,options),captures,ordinaryContinueClicked:true};
}
