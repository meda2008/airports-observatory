// Invoked inside Codex cua_repl with the selected in-app browser handle.
// No Chromium launch, CDP, browser profile/cookie access, CAPTCHA bypass or payments.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {inspectVisibleChallenge,classifyVisibleChallenge,observeVerification} from './challenge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const redact=text=>String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/((?:password|token|session|secret|密码)\s*[=:：]\s*)[^\s<>"']+/gi,'$1[hidden]').split('\n').filter(l=>!/(?:vmess|vless|trojan|ss):\/\//i.test(l)).join('\n');
export async function loginStoredOrigin(tab,{origin,emailSelector,passwordSelector,submitSelector,credentialsFile=process.env.CREDENTIALS_FILE||'/run/secrets/website-credentials.json'}={}){
 const approved=new URL(origin).origin;
 const check=async()=>{if(new URL(await tab.url()).origin!==approved)throw Error('credential_destination_changed');};await check();
 const gate=await inspectVisibleChallenge(tab);if(classifyVisibleChallenge(gate))return{status:'verification_checkpoint_no_login_attempt'};
 if(/登录即(?:表示)?同意|登录并同意|继续即表示同意/.test(gate.text))return{status:'terms_confirmation_required'};
 let vault;try{vault=JSON.parse(fs.readFileSync(credentialsFile,'utf8'));}catch{return{status:'credential_provider_not_configured'};}const matches=(Array.isArray(vault)?vault:vault.accounts||[]).filter(a=>{try{return new URL(a.url||a.origin).origin===approved&&typeof a.email==='string'&&typeof a.password==='string';}catch{return false;}});
 if(matches.length!==1)return{status:matches.length?'credential_binding_ambiguous':'credential_not_configured'};
 for(const selector of [emailSelector,passwordSelector,submitSelector])if(typeof selector!=='string'||await tab.playwright.locator(selector).filter({visible:true}).count()!==1)return{status:'auth_selector_missing_or_ambiguous'};
 const account=matches[0];await check();await tab.playwright.locator(emailSelector).fill(account.email);await check();await tab.playwright.locator(passwordSelector).fill(account.password);await check();await tab.playwright.locator(submitSelector).click();
 try{await tab.playwright.locator(passwordSelector).waitFor({state:'hidden',timeoutMs:8000});}catch{}
 const after=await inspectVisibleChallenge(tab),challenge=classifyVisibleChallenge(after);
 if(challenge)return{status:'verification_checkpoint_after_login',type:challenge};
 if(/邮箱或密码错误|密码错误|密码不正确|invalid credentials|incorrect password/i.test(after.text))return{status:'stored_credentials_rejected'};
 return{status:!after.passwordForm&&/退出登录|退出账号|欢迎回来|我的订阅|账户余额/i.test(after.text)?'authenticated':'login_not_confirmed',credentialsLogged:false,rememberPasswordSelected:false};
}
export function createLocalControlClient({base='http://127.0.0.1:8081',token,projectRoot=root}={}){
 const u=new URL(base);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/')throw Error('control_client_requires_local_loopback');
 if(!token){const envFile=path.join(projectRoot,'deploy-service/.env');if(fs.existsSync(envFile)){const match=fs.readFileSync(envFile,'utf8').match(/^ADMIN_TOKEN\s*=\s*(.+)$/m);token=match?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2');}if(!token)token=fs.readFileSync(path.join(projectRoot,'deploy-service/data/local-runtime/admin-token'),'utf8').trim();}
 async function request(route,input){if(!route.startsWith('/api/admin/'))throw Error('admin_control_route_required');const response=await fetch(u.origin+route,{method:input===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});const data=await response.json();if(!response.ok){const e=Error(String(data.error||'control_request_failed').slice(0,200));e.status=response.status;throw e;}return data;}
 async function connectConsole(tab,reviewer){const destination=new URL(await tab.url());if(destination.origin!==u.origin||!['/console.html','/console'].includes(destination.pathname))throw Error('local_console_destination_required');await tab.playwright.getByLabel('管理员令牌',{exact:true}).fill(token);await tab.playwright.locator('#reviewer').fill(reviewer);await tab.playwright.getByRole('button',{name:'连接控制台',exact:true}).click();}
 return{request,connectConsole};
}
function deadline(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]).finally(()=>clearTimeout(timer));}
export function safeReadLink(url,allowed){try{const u=new URL(url),route=u.pathname+u.search+u.hash;return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&allowed.includes(u.hostname)&&!/(?:checkout|logout|cancel|delete|reset|order|register|subscribe|invoice|(?:[?&](?:a|action)=)(?:buy|add|pay))/i.test(route)&&!/(?:^|\/|#\/)(?:buy|pay|payment|payments|cart)(?:\/|[?#]|$)/i.test(route);}catch{return false;}}
export function navigationKey(url){const u=new URL(url);if(!u.hash.startsWith('#/'))u.hash='';u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href;}
export function createIabConsoleRunner({browser,client=createLocalControlClient(),output=path.join(root,'work/collector-control-20261110'),worker='codex-iab',jobBudgetMs=24000}={}){
 if(!browser?.tabs?.new)throw Error('selected_builtin_browser_required');
 let stopped=false,active=0;const results=[],attachedTabs=new Map();
 fs.mkdirSync(output,{recursive:true});
 async function runOne({siteId}={}){if(stopped)return{status:'stopped'};const claimed=await client.request('/api/admin/collection/runner/claim',{worker,siteId}),job=claimed.job;if(!job)return{status:claimed.control.engineEnabled?'idle':'paused'};
  active++;let tab=null;const captures=[],profile=job.site.config,started=Date.now(),end=started+jobBudgetMs,seen=new Set(),queue=[job.resume?.url&&safeReadLink(job.resume.url,job.site.config.allowedHosts)?job.resume.url:profile.entryUrl];let checkpoint=null,login='not_verified',loginAttempted=false;
  const dir=path.join(output,job.siteId+'-'+job.jobId);fs.mkdirSync(dir,{recursive:true});
  const heartbeat=setInterval(()=>client.request('/api/admin/collection/runner/renew',{jobId:job.jobId,token:job.token}).catch(()=>{}),30000);
  const setCheckpoint=(type,url,reason,stage='entry')=>({type,url,stage,reason,requestedAction:/captcha|cloudflare|access_gate/.test(type)?'在内置浏览器中完成本次验证后，从控制台恢复；不将排队恢复算验证成功':type==='login_required'?'在已批准入口完成登录，再从控制台恢复；不重复密码尝试':type==='terms_confirmation_required'?'由用户确认本次实际条款后恢复':'修复该站配置或找到有归属依据的入口，再恢复此断点'});
  try{
   const handedOff=attachedTabs.get(job.siteId);tab=handedOff||await browser.tabs.new();attachedTabs.delete(job.siteId);if(handedOff)queue[0]=await tab.url();
   while(queue.length&&captures.length<Math.min(profile.maxPages||4,8)&&Date.now()<end-1500){
    await client.request('/api/admin/collection/runner/renew',{jobId:job.jobId,token:job.token});
    const url=queue.shift(),key=navigationKey(url);if(seen.has(key))continue;seen.add(key);
    if(!safeReadLink(url,profile.allowedHosts)){checkpoint=setCheckpoint('unsafe_action_route',url,'目标为账户操作、订单或付款路由，当前只读执行器不进入');break;}
    const currentUrl=await tab.url();if(!currentUrl||navigationKey(currentUrl)!==navigationKey(url))await deadline(tab.goto(url),Math.max(1500,Math.min(16000,end-Date.now())),'navigation_timeout');
    let snapshot=await deadline(inspectVisibleChallenge(tab),Math.max(1500,Math.min(6000,end-Date.now())),'observation_timeout');
    if(!profile.allowedHosts.includes(new URL(snapshot.url).hostname)){checkpoint=setCheckpoint('entry_origin_changed',snapshot.url,'实际导航到未批准域名；保留候选，不向其提交凭据');break;}
    let challenge=classifyVisibleChallenge(snapshot);
    if(challenge==='cloudflare'&&Date.now()<end-4000){const settled=await observeVerification(tab,{timeoutMs:1500});snapshot=settled.snapshot;challenge=settled.type;}
    let terms=/继续即表示同意|继续即默认同意|进入前确认|点击继续.*同意服务条款/.test(snapshot.text);
    if(!challenge&&!terms&&snapshot.passwordForm&&profile.auth?.mode==='login'&&!profile.publicOnly&&!loginAttempted){loginAttempted=true;const auth=await loginStoredOrigin(tab,{origin:new URL(snapshot.url).origin,...profile.auth});snapshot=await inspectVisibleChallenge(tab);challenge=classifyVisibleChallenge(snapshot);terms=/继续即表示同意|继续即默认同意|进入前确认|点击继续.*同意服务条款/.test(snapshot.text);if(auth.status==='authenticated')login='session_observed';else if(!challenge&&!terms){if(snapshot.text)captures.push({url:snapshot.url,body:redact(snapshot.text).slice(0,180000),observedAt:new Date().toISOString(),kind:'auth_checkpoint'});checkpoint=setCheckpoint(auth.status,snapshot.url,'同域凭据/选择器登录未确认，仅尝试本次，不重试密码','auth');break;}}
    if(challenge||terms||snapshot.passwordForm){const type=challenge|| (terms?'terms_confirmation_required':'login_required');if(snapshot.passwordForm)login='login_required';const body=redact(snapshot.text).slice(0,180000);if(body)captures.push({url:snapshot.url,body,observedAt:new Date().toISOString(),kind:snapshot.passwordForm&&!challenge?'auth_checkpoint':'verification_checkpoint'});checkpoint=setCheckpoint(type,snapshot.url,type==='login_required'?'可见密码表单，当前会话未进入业务页':terms?'入口要求接受本次协议，未自动勾选':`可见 ${type} 验证，未绕过或自动提交`);break;}
    const planRoute=/(?:\/|#\/)(?:plans?|shop|purchase)(?:[/?#]|$)/i.test(new URL(snapshot.url).pathname+new URL(snapshot.url).hash),priceMarker=/(?:\d+(?:\.\d+)?\s*(?:GB|TB)|每月\s*\d|月付|年付|\/month)/i;
    if(profile.readiness||planRoute&&!priceMarker.test(snapshot.text)){
     const ready=profile.readiness?.selector?tab.playwright.locator(profile.readiness.selector):profile.readiness?.text?tab.playwright.getByText(profile.readiness.text,{exact:true}):tab.playwright.getByText(priceMarker);
     try{await ready.filter({visible:true}).first().waitFor({state:'visible',timeoutMs:Math.max(1000,Math.min(profile.readiness?.timeoutMs||6000,end-Date.now()-1000))});snapshot=await inspectVisibleChallenge(tab);}catch{const waiting=await inspectVisibleChallenge(tab);const type=classifyVisibleChallenge(waiting)||'content_loading_or_layout_changed';if(waiting.text)captures.push({url:waiting.url,body:redact(waiting.text).slice(0,180000),observedAt:new Date().toISOString(),kind:'verification_checkpoint'});checkpoint=setCheckpoint(type,waiting.url,'已等待本站内容条件，仍未出现实际套餐/正文；不把应用菜单壳视为采集成功','content_readiness');break;}
    }
    // This reviewed recipe only changes display filters, never subscribes or orders.
    if(job.siteId==='A036'&&new URL(snapshot.url).origin==='https://mkrused.v2saat.club'&&new URL(snapshot.url).hash==='#/plans'){
     const recipe=await import(new URL('./site-recipes/rabbit-prices.mjs?controlRevision=3',import.meta.url).href);await deadline(recipe.collectRabbitPrices(tab,{onCapture:c=>{captures.push({url:c.url,body:redact(c.text).slice(0,180000),observedAt:c.capturedAt,kind:'authorized_account_page',metadata:{planCards:c.planCards,selectedFilter:c.selectedFilter,orderSubmitted:false,paymentExecuted:false}});}}),Math.max(1500,end-Date.now()),'site_recipe_timeout');
     break;
    }
    const text=snapshot.text.trim();if(text.length<60||/^(?:Loading|加载中|正在加载)[.。…\s]*$/i.test(text)){checkpoint=setCheckpoint('content_loading',snapshot.url,'未取得足够正文；不把加载页视为采集完成');break;}
    const session=/退出登录|退出账号|登出|Log out|Sign out/i.test(text);if(session)login='session_observed';
    captures.push({url:snapshot.url,body:redact(text).slice(0,180000),observedAt:new Date().toISOString(),kind:session?'authorized_account_page':'operator_visible_page'});
    const links=await tab.playwright.locator('a[href]').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).map(e=>({url:e.href,label:(e.innerText||'').trim()})));
    const wanted=links.filter(l=>(/套餐|定价|价格|退款|隐私|条款|帮助|知识库|公告|购买服务|购买订阅|商店|pricing|plans|terms|privacy|refund|help|support|docs|shop/i.test(l.label)||(profile.readOnlyRecipe==='viewturbo_public_policy_pair'&&l.label==='Charge'))&&safeReadLink(l.url,profile.allowedHosts));
    captures[captures.length-1].readLinks=wanted.map(l=>({url:l.url,label:l.label}));
    for(const link of wanted.slice(0,8))if(!seen.has(navigationKey(link.url))&&!queue.some(url=>navigationKey(url)===navigationKey(link.url)))queue.push(link.url);
   }
   if(!captures.length&&!checkpoint)checkpoint=setCheckpoint('no_readable_material',profile.entryUrl,'任务窗口内未取得正文');
  }catch(error){checkpoint=setCheckpoint(/timeout|deadline/i.test(error.message)?'navigation_timeout':'browser_access_failed',profile.entryUrl,redact(error.message).slice(0,300));}
  finally{clearInterval(heartbeat);if(tab)try{await deadline(tab.close(),3000,'tab_close_timeout');}catch{}}
  const material={siteId:job.siteId,jobId:job.jobId,profileRevision:job.profileRevision,siteRevision:job.siteRevision,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),captures,checkpoint,capabilities:{login:{status:login}},paymentAllowed:false,browser:'codex_builtin'};
  for(const[index,c]of captures.entries())fs.writeFileSync(path.join(dir,'capture-'+index+'.json'),JSON.stringify({...c,sha256:crypto.createHash('sha256').update(c.body).digest('hex')},null,2));
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({...material,captures:captures.map((c,i)=>({url:c.url,observedAt:c.observedAt,kind:c.kind,file:'capture-'+i+'.json'}))},null,2));
  try{const result=await client.request('/api/admin/collection/runner/result',{worker,jobId:job.jobId,token:job.token,captures,checkpoint,capabilities:material.capabilities});const summary={siteId:job.siteId,status:result.status,pages:captures.filter(c=>!c.kind.endsWith('checkpoint')).length,checkpoint:checkpoint?.type||null,proposalId:result.proposalId,runId:job.runId};results.push(summary);fs.writeFileSync(path.join(dir,'accepted.json'),JSON.stringify(result,null,2));return summary;}
  catch(error){if(error.message==='Job cancellation requested'){const stoppedResult=await client.request('/api/admin/collection/runner/cancelled',{jobId:job.jobId,token:job.token});const summary={siteId:job.siteId,status:stoppedResult.status,reason:'operator_cancelled_no_fact_submission',runId:job.runId};results.push(summary);fs.writeFileSync(path.join(dir,'cancelled.json'),JSON.stringify(summary,null,2));return summary;}const summary={siteId:job.siteId,status:'result_rejected',reason:error.message,runId:job.runId};results.push(summary);fs.writeFileSync(path.join(dir,'rejected.json'),JSON.stringify(summary,null,2));return summary;}
  finally{active--;fs.writeFileSync(path.join(output,'runner-progress.json'),JSON.stringify({updatedAt:new Date().toISOString(),worker,active,results},null,2));}
 }
 async function runBatch({limit=4,concurrency=2}={}){const out=[];for(let n=0;n<limit;n+=concurrency){const batch=await Promise.all(Array.from({length:Math.min(concurrency,limit-n)},()=>runOne()));out.push(...batch);if(batch.every(r=>['idle','paused','stopped'].includes(r.status)))break;}return out;}
 async function stop(){stopped=true;await client.request('/api/admin/collection/runner/heartbeat',{worker,status:'disconnected'});return{status:'stopped',active,processed:results.length};}
 async function attachSiteTab(siteId,tab){const p=(await client.request('/api/admin/collectors?siteId='+encodeURIComponent(siteId))).items[0];if(!p||!p.config.allowedHosts.includes(new URL(await tab.url()).hostname))throw Error('handoff_tab_origin_mismatch');attachedTabs.set(siteId,tab);return{siteId,tabId:tab.id,status:'bound_for_single_resume'};}
 return{runOne,runBatch,stop,attachSiteTab,status:()=>({active,processed:results.length,last:results.slice(-5)})};
}
