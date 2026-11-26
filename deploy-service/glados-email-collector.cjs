'use strict';
// A separate, bounded email-login context. No registration, order or payment requests.
const fs=require('node:fs');
const origins={A009:'https://glados.rocks',A181:'https://glados.space'};
function authRequest(req,{origin,recipient,code,phase}){try{if(req.method()!=='POST')return false;const u=new URL(req.url());if(u.origin!==origin||u.search||u.hash)return false;const d=JSON.parse(req.postData());if(phase==='request')return u.pathname==='/api/authorization'&&Object.keys(d).sort().join(',')==='address,site'&&d.address===recipient&&d.site==='glados.network';return phase==='login'&&u.pathname==='/api/login'&&Object.keys(d).sort().join(',')==='email,mailcode,method,site'&&d.email===recipient&&d.mailcode===code&&/^\d{4,8}$/.test(code)&&d.method==='email'&&d.site==='glados.network';}catch{return false;}}
async function collect(args){const {site,browser,sessionDir,beforePage=async()=>{},clock=Date.now,jobBudgetMs=90000,collectPage,lookup}=args,config=site.config||site,id=config.recordId,origin=origins[id],started=clock(),deadline=started+jobBudgetMs;
 const tools=require('./standalone-collector.cjs');const egress=require('./browser-egress.cjs').createBrowserEgress({config,lookup:tools.boundedLookup(lookup)});let context,phase=null,code=null,recipient='collector@example.invalid',checks=[],captures=[],requestedAt;
 const stop=async(type,reason)=>{if(context){try{const page=context.pages()[0];if(page){const text=await page.locator('body').innerText();captures.push(tools.toCapture({url:page.url(),text:text.split(recipient).join('[email]').split(code||'__no_code__').join('[code]'),capturedAt:new Date(clock()).toISOString()},'auth_checkpoint'));}}catch{}await context.close();context=null;}return{captures,checkpoint:{type,url:origin+'/login',reason,stage:'email_login'},capabilities:{login:{status:'login_required'}},emailLoginChecks:checks,ordersCreated:0,paymentExecuted:false,startedAt:new Date(started).toISOString(),finishedAt:new Date(clock()).toISOString(),browser:'service_headless'};};
 if(!origin||config.entryUrl!==origin+'/console/shop')return stop('email_login_configuration_invalid','GLaDOS邮箱登录配置不匹配，未请求验证码。');
 const provider=require('./gmail-readonly-code.cjs').createProvider(),binding={siteId:id,origin,recipient};
 const file=tools.sessionPath(id,origin,sessionDir);let state;try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 try{context=await egress.open(browser,{acceptDownloads:false,...(state?{storageState:state}:{})});
 await context.routeWebSocket?.('**/*',route=>route.close());
 await context.route('**/*',async route=>{const r=route.request();try{const u=new URL(r.url());if(u.origin!==origin||!tools.safeReadUrl(u.href,[new URL(origin).hostname]))return route.abort();if(!['GET','HEAD','OPTIONS'].includes(r.method())&&!authRequest(r,{origin,recipient,code,phase}))return route.abort();await egress.admit(u.href);return route.continue();}catch{return route.abort();}});
 const page=await context.newPage();await beforePage();await page.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:15000});
 const waitUntil=Math.min(deadline-5000,clock()+18000);while(clock()<waitUntil){if(new URL(page.url()).pathname==='/console'||await page.locator('#email').isVisible().catch(()=>false))break;await page.waitForTimeout(300);}
 await egress.admit(origin+'/api/user/session');let session=await page.request.get(origin+'/api/user/session',{maxRedirects:0});let value=await session.json().catch(()=>null); // Native public client uses precisely this read-only endpoint.
 if(!session.ok()||value?.code!==0){
  if(!await page.locator('#email').isVisible())return stop('email_login_form_unavailable','邮箱登录表单未就绪，未请求验证码。');
  await provider.prepare(binding);
  if(await page.locator('#email').count()!==1||await page.locator('#mailcode').count()!==1||await page.getByRole('button',{name:'Get Code',exact:true}).count()!==1)return stop('email_login_form_changed','表单控件不唯一，未请求验证码。');
  await page.locator('#email').fill(recipient);requestedAt=new Date(clock()).toISOString();phase='request';
  const pending=page.waitForResponse(r=>r.url()===origin+'/api/authorization'&&r.request().method()==='POST',{timeout:12000});await page.getByRole('button',{name:'Get Code',exact:true}).click();const response=await pending;phase=null;const sent=await response.json().catch(()=>null);checks.push({status:'code_request_response',httpStatus:response.status(),nativeCode:sent?.code??null,captchaRequired:sent?.captcha_required===true,requestedAt});
  if(sent?.captcha_required)return stop('interactive_captcha','站方要求交互验证；未重发或绕过，保留本次验证码断点。');
  if(!response.ok()||sent?.code!==0)return stop('email_code_send_not_accepted','站方未确认验证码发送；未重发或注册。');
  let found;for(let n=0;n<12&&clock()<deadline-16000;n++){await beforePage();found=await provider.findCode({...binding,requestedAt});if(found)break;await page.waitForTimeout(2000);}
  if(!found)return stop('email_code_not_found_in_normal_or_spam','已查收件箱及垃圾邮件，未找到唯一匹配本次请求的验证码。');
  code=require('./auth.cjs').validateEmailCode(found,{origin,recipient,requestedAt,now:clock(),maxClockSkewMs:5000});checks.push({status:'code_found',folder:found.folder,requestedAt,codeExported:false});
  await page.locator('#mailcode').fill(code);phase='login';const loginResponse=page.waitForResponse(r=>r.url()===origin+'/api/login'&&r.request().method()==='POST',{timeout:12000});await page.getByRole('button',{name:'Login',exact:true}).click();const lr=await loginResponse;phase=null;const result=await lr.json().catch(()=>null);checks.push({status:'login_response',httpStatus:lr.status(),nativeCode:result?.code??null,responseFormat:/json/i.test(lr.headers()['content-type']||'')?'json':/html/i.test(lr.headers()['content-type']||'')?'html':'other',schemaKeys:result&&typeof result==='object'?Object.keys(result).filter(k=>/^[a-zA-Z_]{1,32}$/.test(k)).slice(0,12):[],responseBodyExported:false});
  if(!lr.ok()||result&&result.code!==undefined&&result.code!==0)return stop('email_authentication_not_completed','站方未确认邮箱登录成功；未重试验证码或注册。');
  await page.waitForURL(u=>u.origin===origin&&u.pathname==='/console',{timeout:10000}).catch(()=>{});session=await page.request.get(origin+'/api/user/session',{maxRedirects:0});value=await session.json().catch(()=>null);
 }
 if(!session.ok()||value?.code!==0)return stop('authentication_success_unverified','登录后原生会话接口未确认成功，未启用定时任务。');
 fs.mkdirSync(sessionDir,{recursive:true,mode:0o700});await context.storageState({path:file});await egress.close();await context.close();context=null;
 checks.push({status:'native_session_observed',path:'/api/user/session',nativeCode:0,bodyExported:false});
 const next={...site,config:{...config,readOnlyRecipe:'glados_authenticated_shop'}};const result=await collectPage(next,{...args,jobBudgetMs:Math.max(1000,deadline-clock())});return{...result,emailLoginChecks:[...checks,...(result.emailLoginChecks||[])],capabilities:{...result.capabilities,login:result.checkpoint?result.capabilities?.login:{status:'session_observed'}}};
 }catch(e){return stop(/^mailbox_[a-z0-9_]+$/.test(e.message)?e.message:'email_login_runtime_error','GLaDOS邮箱登录未完成；未记录邮件正文、验证码或凭据，保留断点。');}finally{await egress.close();if(context)await context.close();}
}
module.exports={authRequest,collect};
