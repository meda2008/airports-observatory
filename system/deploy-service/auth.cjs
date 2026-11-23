'use strict';
function authenticationFailure(text){
 if(/^\s*Please complete (?:the )?(?:captcha |human )?verification first[.!]?\s*$/im.test(text))return'interactive_captcha';
 if(/^\s*(?:The\s+)?(?:email(?: address)?|username)\s+or\s+password\s+is\s+(?:incorrect|invalid)[.!]?\s*$/im.test(text))return'server_rejected_credentials';
 if(/该账户已被停止使用|账户已被停用|账号已被封禁|account (?:has been |is )?(?:disabled|suspended)/i.test(text))return'account_disabled_by_server';
 if(/验证码(?:错误|不正确|已失效|已过期)|(?:invalid|incorrect|expired)\s+(?:captcha|verification code)/i.test(text))return'server_rejected_captcha';
 if(/邮箱或(?:者)?密码错误|账号或(?:者)?密码错误|用户名或(?:者)?密码错误|密码不正确|(?:incorrect|invalid)\s+(?:email or password|username or password|credentials)/i.test(text))return'server_rejected_credentials';
 return null;
}
function validateEmailCode(result,{origin,recipient,requestedAt,now=Date.now(),maxClockSkewMs=0}){const received=Date.parse(result?.receivedAt),requested=Date.parse(requestedAt),expires=Date.parse(result?.expiresAt);if(!Number.isInteger(maxClockSkewMs)||maxClockSkewMs<0||maxClockSkewMs>5000||!result||result.origin!==origin||result.recipient!==recipient||![received,requested,expires,now].every(Number.isFinite)||received<requested-maxClockSkewMs||received>now+maxClockSkewMs||expires<=now||!/^\d{4,8}$/.test(result.code))throw Error('email_verification_binding_invalid');return result.code;}
async function authenticate(page,{config,credential,emailCodeProvider,verificationOptions={}}={}){
 const origin=new URL(page.url()).origin;if(!credential||credential.origin!==origin)return{status:'login_credentials_missing'};
 const a=config.auth||{};if(!a.emailSelector||!a.passwordSelector||!a.submitSelector)return{status:'auth_adapter_required'};
 const verification=await require('./verification.cjs').ensureVerification(page,{...verificationOptions,captcha:a.captcha});
 if(verification.type)return{status:'challenge_requires_current_confirmation',verification};
 // Selectors are administrator-reviewed per-site configuration, never model-generated actions.
 for(const selector of [a.emailSelector,a.passwordSelector,a.submitSelector])if(await page.locator(selector).count()!==1)return{status:'auth_adapter_ambiguous'};
 if(a.mode==='register'&&!a.registrationAuthorized)return{status:'registration_authorization_required'};
 if(a.termsSelector)return{status:'terms_confirmation_required'};
 await page.locator(a.emailSelector).fill(credential.email);await page.locator(a.passwordSelector).fill(credential.password);
 if(a.mode==='register'&&a.confirmPasswordSelector)await page.locator(a.confirmPasswordSelector).fill(credential.password);
 if(a.emailCodeSelector){if(!emailCodeProvider)return{status:'email_provider_missing'};const requestedAt=new Date().toISOString();if(a.sendCodeSelector)await page.locator(a.sendCodeSelector).click();const result=await emailCodeProvider({origin,recipient:credential.email,requestedAt});const code=validateEmailCode(result,{origin,recipient:credential.email,requestedAt});await page.locator(a.emailCodeSelector).fill(code);}
 if(a.mode!=='register')await require('../lib/remember-login.cjs').rememberLogin(page,a,{origin});
 await page.locator(a.submitSelector).click();await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
 // SPA submission can start after networkidle has already returned. Wait for
 // the submitted form to leave, instead of treating "logging in" as failure.
 if(typeof page.waitForAuthTransition==='function')await page.waitForAuthTransition(a.passwordSelector);
 else{const password=page.locator(a.passwordSelector);if(typeof password.waitFor==='function')try{await password.waitFor({state:'hidden',timeout:8000});}catch(error){if(!/timeout|timed\s*out|deadline/i.test(String(error.message)))throw error;}}
 const formVisible=await page.locator(a.passwordSelector).isVisible();
 // A filled OCR field is not a server acceptance. Preserve a specific,
 // terminal rejection without echoing form values or retrying credentials.
 if(formVisible){const failure=authenticationFailure(await page.locator('body').innerText());if(failure)return{status:failure,attempts:1,retryAutomatically:false};}
 const after=await require('./verification.cjs').observeVerification(page);
 if(after.type)return{status:'challenge_requires_current_confirmation',verification:after};
 if(await page.locator(a.passwordSelector).isVisible())return{status:'authentication_not_completed'};
 // Disappearing password fields alone can also mean an error/redirect page.
 if(a.successSelector){if(await page.locator(a.successSelector).count()===1&&await page.locator(a.successSelector).isVisible())return{status:'authenticated'};}
 else if(/退出登录|退出账号|Log out|Sign out|注销/i.test(await page.locator('body').innerText()))return{status:'authenticated'};
 return{status:'authentication_success_unverified'};
}
module.exports={authenticate,validateEmailCode,authenticationFailure};
