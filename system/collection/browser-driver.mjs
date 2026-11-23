import {inspectDocument,readRenderedDocument} from './visible-document.mjs';
export {inspectDocument,readRenderedDocument} from './visible-document.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {adapterFor} from './adapters.mjs';
import {expandObservedDocumentDetails} from './route-readiness.mjs';
import {registerFree} from './registration.mjs';
import {completeEmailVerification} from './email-verification.mjs';
import {clickConfirmedChallenge,settleManagedVerification,inspectVisibleChallenge,classifyVisibleChallenge} from './challenge.mjs';
import {performConfirmedVerification} from './verification-actions.mjs';
import {loginWithSiteAdapter} from './builtin-auth.mjs';
import {collectKnowledge} from './knowledge-browser.mjs';
import {collectOwnedReferral} from './owned-referral.mjs';
import {passiveAccessWaitLabel,waitForPassiveAccessPage} from './passive-access-wait.mjs';
const require=createRequire(import.meta.url),E=require('../lib/collection-engine.cjs');
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const write=(p,o)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(o,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
// DOM-only observation: no fetch, cookies, storage, hidden app state or input values.
export function isAccessBlockStatus(status){return ['needs_human_verification','security_warning','access_protection_wait'].includes(status);}
function folders(runId){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(runId))throw Error('Invalid run ID');const dir=path.join(ROOT,'work/collection-runs',runId);fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});return dir;}
function persist(dir,task,snapshot){
 snapshot={...snapshot,url:E.safeUrl(snapshot.url),text:E.redact(snapshot.text),blocks:(snapshot.blocks||[]).map(b=>({text:E.redact(b.text)})),capturedAt:snapshot.capturedAt||new Date().toISOString()};
 const raw=JSON.stringify(snapshot,null,2)+'\n',hash=E.sha(raw),sourceId='COLLECT-'+hash.slice(0,24),file='evidence/'+hash+'.json';if(!fs.existsSync(path.join(dir,file)))fs.writeFileSync(path.join(dir,file),raw);
 return {bindingStatus:task.bindingStatus,sourceId,file,sha256:hash,url:snapshot.url,capturedAt:snapshot.capturedAt,recordIds:task.recordIds,grade:'E1',independenceScore:'I0',representation:snapshot.representation,hints:E.extract(snapshot,sourceId),discovery:E.discover(snapshot,{knownUrls:read(path.join(ROOT,'public-site/data/public-catalog.json')).items.map(r=>r.coreInfo?.website?.url).filter(Boolean),sourceId})};
}

const inspect=readRenderedDocument;
export function navigationIssue(url,allowedHosts){const clean=E.safeUrl(url);if(!clean)return{status:'navigation_target_unconfirmed',reason:'No allowed public navigation URL observed; no redirect destination asserted'};if(!allowedHosts.includes(new URL(clean).hostname))return{status:'needs_identity_review',redirectUrl:clean};return null;}
export function readOnlyRouteHeading(value){try{const u=new URL(value),heading=require('./url-collectors/index.cjs').forOrigin(value)?.expectedHeading?.(value);if(heading)return new RegExp('^'+heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');if(['ss-id.com','cloud.e-ix.com','www.nicecc.cc','vip.ytjcok.org'].includes(u.hostname)&&u.hash==='#/docs')return /^(使用文档|文档中心)$/;return null;}catch{return null;}}
async function navigateReady(tab,url){await tab.playwright.expectNavigation(()=>tab.goto(url),{waitUntil:'domcontentloaded',timeoutMs:15000});await tab.playwright.waitForLoadState({state:'domcontentloaded',timeoutMs:15000});try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){if(!/timeout|timed\s*out/i.test(String(error.message)))throw error;}const beforeHeading=await inspect(tab);if(new URL(url).origin==='https://a01.xxfaffa01.cc'&&new URL(url).hash==='#/help'&&await tab.url()===url&&!beforeHeading.passwordForm)await(await import('./site-recipes/xxf.mjs')).waitForXxfKnowledge(tab);if(passiveAccessWaitLabel(beforeHeading)){const waited=await waitForPassiveAccessPage({tab,snapshot:beforeHeading,inspect});if(passiveAccessWaitLabel(waited.snapshot))return;}const expected=readOnlyRouteHeading(url);if(expected){let login=false;for(const field of await tab.playwright.locator('input[type=\"password\"]').all())if(await field.isVisible())login=true;if(!login){await tab.playwright.getByRole('heading',{name:expected}).first().waitFor({state:'visible',timeoutMs:12000});if(require('./url-collectors/index.cjs').forOrigin(url)?.requiresPageUpdatedAt){try{await tab.playwright.getByText(/更新于\s*20\d{2}/).first().waitFor({state:'visible',timeoutMs:5000});}catch{}}}}}
export function readRouteKey(value){try{const u=new URL(value);if(!/^https?:$/.test(u.protocol))return null;if(!u.hash.startsWith('#/'))u.hash='';if(u.pathname!=='/')u.pathname=u.pathname.replace(/\/+$/,'');return u.href;}catch{return null;}}
function chooseLinks(s,task,visited){const origin=new URL(s.url).origin,a=adapterFor(task.adapter==='auto'?E.family(s):task.adapter),skip=new Set((task.skipUrls||[]).map(readRouteKey).filter(Boolean));return s.links.filter(l=>(!task.unreadRouteAllowlist||task.unreadRouteAllowlist.some(u=>readRouteKey(u)===readRouteKey(l.url)))&&E.safeReadLink(l,origin)&&(!new URL(l.url).hash||new URL(l.url).hash.startsWith('#/'))&&!visited.has(readRouteKey(l.url))&&!skip.has(readRouteKey(l.url))).sort((x,y)=>a.rank(y)-a.rank(x)).slice(0,task.maxPages-visited.size);}
async function authorizedLogin(tab,s,credentialsForOrigin,{auth,verificationOptions={},emailCodeProvider}={}){
 if(!credentialsForOrigin||s.agreementCheckbox||s.passwordInputCount!==1)return s;
 const origin=new URL(s.url).origin,c=await credentialsForOrigin(origin);if(!c||c.origin!==origin||!c.email||!c.password)return s;
 if(auth){const outcome=await loginWithSiteAdapter({tab,config:{auth},credential:c,verificationOptions,emailCodeProvider});const after=await inspect(tab);after.loginAttemptStatus=outcome.status;return after;}
 const submit=s.buttons.find(x=>/^(登录|登陆|登入|登 入|登 录|安全登录|登录账户|登录账号|登陆账户|登陆账号|现在就登录|立即登录|提交登录|Log in|Login|Sign in)$/i.test(x.replace(/[\uE000-\uF8FF]/g,'').trim()));if(!submit)return s;
 const emailSelector=s.emailInputCount===1?'input[type="email"]':s.textInputCount===1?'input[type="text"]':null;if(!emailSelector)return s;
 await tab.playwright.locator(emailSelector).fill(c.email);
 await tab.playwright.locator('input[type="password"]').fill(c.password);
 await tab.getAXState({emit:false});
 const label=submit.replace(/[\uE000-\uF8FF]/g,'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const matcher=new RegExp(label+'$','i'),loginControl=tab.playwright.getByRole('button',{name:matcher});
 if(await loginControl.count()===1)await loginControl.click();
 else{
  const controls=await tab.playwright.locator('form').getByRole('button',{name:matcher}).all(),visible=[];
  for(const control of controls)if(await control.isVisible())visible.push(control);
  if(visible.length!==1)return s;
  await visible[0].click();
 }
 try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){if(!/timeout|timed\s*out/i.test(String(error.message)))throw error;}
 try{await tab.playwright.locator('input[type="password"]').waitFor({state:'hidden',timeoutMs:5000});}catch{}
 await tab.getAXState({emit:false});const after=await inspect(tab);after.loginAttempted=true;after.loginAttemptStatus=after.authenticationObserved?'authenticated':after.passwordForm?'authentication_not_completed':'authentication_success_unverified';return after;
}
export async function acquireCollectionTab(browser,task){
 if(!task.reuseTabId)return browser.tabs.new();
 const tab=await browser.tabs.get(task.reuseTabId),actual=new URL(await tab.url()),expected=new URL(task.entryUrl);
 if(actual.origin!==expected.origin||!task.allowedHosts.includes(actual.hostname))throw Error('reused_tab_origin_mismatch');
 return tab;
}
export async function runChunk({browser,runId,limit=3,recordIds=null,onProgress=()=>{},preserveChallenges=3,credentialsForOrigin=null,credentialsForRegistration=null,registrationHandler=registerFree,emailCodeProvider=null,verificationOptions={},knowledgeCollector=collectKnowledge,referralOptions={},referralCollector=collectOwnedReferral}){
 const dir=folders(runId),plan=read(path.join(dir,'plan.json')),state=read(path.join(dir,'state.json'));let count=0;
 for(const task of plan.tasks.filter(t=>!state.results[t.taskId]&&(!recordIds||t.recordIds.some(id=>recordIds.includes(id)))).slice(0,limit)){
  if((task.recordIds||[]).length&&(task.recordIds||[]).every(require('../lib/collection-user-skips.cjs').isUserSkipped)){state.results[task.taskId]={taskId:task.taskId,recordIds:task.recordIds,status:'standing_user_skip',sources:task.seedSources||[],errors:[],finishedAt:new Date().toISOString()};write(path.join(dir,'state.json'),state);count++;continue;}
  // Landing aliases redirect to the same already captured dashboard. Preserve
  // evidence timestamps rather than reloading '/' just because its hash differs.
  const landing=u=>{try{const x=new URL(u);if(['','#/','#/dashboard','#/home'].includes(x.hash))x.hash='';return x.href;}catch{return u;}};
  if(!task.resumeReadOnlyMenus&&task.seedSources?.some(s=>landing(s.url)===landing(task.entryUrl))){task.skipUrls=[...new Set([...(task.skipUrls||[]),task.entryUrl])];}
  if(!task.resumeReadOnlyMenus&&(task.skipUrls||[]).includes(task.entryUrl)&&task.seedSources?.length){
   const unwrap=require('../scripts/import-core-collection-evidence.cjs').unwrapVisibleDocument;
   const routes=task.seedSources.flatMap(source=>{try{const raw=read(path.join(dir,source.originalFile||source.file)),visible=unwrap(raw);return [...(raw.links||[]),...(visible.links||[])].map(l=>({url:new URL(l.url||l.href,source.url).href,label:l.label||l.text||''}));}catch{return[];}}).filter(l=>E.safeReadLink(l,new URL(task.entryUrl).origin)&&!task.skipUrls.includes(l.url)&&(!new URL(l.url).hash||new URL(l.url).hash.startsWith('#/')));
   if(routes.length)task.entryUrl=routes[0].url;
   else{state.results[task.taskId]={taskId:task.taskId,recordIds:task.recordIds,status:'retained_gap_no_new_route',sources:task.seedSources,errors:[],finishedAt:new Date().toISOString(),reason:'Existing evidence URL skipped; no unread same-origin route.'};write(path.join(dir,'state.json'),state);count++;continue;}
  }
  let tab,result={taskId:task.taskId,recordIds:task.recordIds,startedAt:new Date().toISOString(),status:'running',sources:[...(task.seedSources||[])],errors:[],adapter:task.adapter},keep=false;
  const visited=new Set();try{
   tab=await acquireCollectionTab(browser,task);if(await tab.url()!==task.entryUrl)await navigateReady(tab,task.entryUrl);let s=await inspect(tab);
   // One semantic re-observation after normal page load; no retry loop / CAPTCHA bypass.
   if(E.classify(s)==='empty_or_loading'||/loading|正在加载|正在初始化/i.test(s.title+' '+s.text)){await tab.getAXState({emit:false});s=await inspect(tab);}
   const initialNavigationIssue=navigationIssue(s.url,task.allowedHosts);
   if(initialNavigationIssue)Object.assign(result,initialNavigationIssue);
   else{
    result.adapter=task.adapter==='auto'?E.family(s):task.adapter;const queue=[{url:s.url,snapshot:s}];
    while(queue.length&&visited.size<task.maxPages){if(visited.size&&Date.now()-Date.parse(result.startedAt)>20000){result.unreadRoutes=queue.map(x=>x.menuLabel||x.url);result.budgetLimited=true;break;}const item=queue.shift();const key=item.menuLabel?'menu:'+item.menuLabel:readRouteKey(item.url);if(visited.has(key))continue;visited.add(key);if(item.menuLabel){const control=tab.playwright.getByText(item.menuLabel,{exact:true});if(await control.count()!==1||!await control.isVisible())continue;await control.click();try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:5000});}catch(error){if(!/timeout|timed\s*out/i.test(String(error.message)))throw error;}await tab.getAXState({emit:false});if(item.menuLabel==='购买订阅'){try{await tab.playwright.locator(':nth-match(button:has-text("立即订阅"), 1)').waitFor({state:'visible',timeoutMs:10000});}catch{result.menuReadiness??=[];result.menuReadiness.push({label:item.menuLabel,status:'plan_cards_not_observed_within_budget'});}}s=await inspect(tab);}else if(!item.snapshot){await navigateReady(tab,item.url);s=await inspect(tab);}else s=item.snapshot;
     const routeNavigationIssue=navigationIssue(s.url,task.allowedHosts);if(routeNavigationIssue){Object.assign(result,routeNavigationIssue);break;}
     let auth=task.auth;
     if(!auth)for(const id of task.recordIds||[]){if(!/^A\d{3}$/.test(id))continue;const file=path.join(ROOT,'collection/site-collectors',id+'.json');if(!fs.existsSync(file))continue;const config=read(file);if(config.auth&&new URL(config.entryUrl).origin===new URL(s.url).origin){auth=config.auth;break;}}
     if(!task.publicOnly&&(E.classify(s)==='login_required'||auth&&s.passwordForm&&E.classify(s)==='needs_human_verification')){s=await authorizedLogin(tab,s,credentialsForOrigin,{auth,verificationOptions,emailCodeProvider});if(s.loginAttemptStatus)result.loginAttemptStatus=s.loginAttemptStatus;if(E.classify(s)==='empty_or_loading')s=await inspect(tab);}
     const afterAuthIssue=navigationIssue(s.url,task.allowedHosts);if(afterAuthIssue){Object.assign(result,afterAuthIssue);break;}
     if(task.knowledgeAdapter&&s.loginAttemptStatus==='authenticated'&&readRouteKey(s.url)!==readRouteKey(task.entryUrl)){await navigateReady(tab,task.entryUrl);s=await inspect(tab);const returnIssue=navigationIssue(s.url,task.allowedHosts);if(returnIssue){Object.assign(result,returnIssue);break;}}
     let status=E.classify(s);
     if(status==='needs_human_verification'){
      const settled=await settleManagedVerification({tab,snapshot:s,inspect,classify:E.classify});s=settled.snapshot;result.verificationObservation=settled.observation;status=settled.observation.status;
      if(status==='needs_human_verification'&&!s.loginAttemptStatus&&verificationOptions.confirmationProvider){
       const challengeType=classifyVisibleChallenge(await inspectVisibleChallenge(tab));
       const confirmation=await verificationOptions.confirmationProvider({tabId:tab.id,url:s.url,type:challengeType});
       if(confirmation){result.verificationAction=await performConfirmedVerification({tab,confirmation,ocr:verificationOptions.ocr,captcha:auth?.captcha});s=await inspect(tab);status=E.classify(s);}
      }
      const afterWaitIssue=navigationIssue(s.url,task.allowedHosts);if(afterWaitIssue){Object.assign(result,afterWaitIssue);break;}
      // Automatic completion may reveal a login page. Continue through the normal
      // scoped credential path; the read-only wait never clicks or signs in.
      if(!isAccessBlockStatus(status)){queue.unshift({url:s.url,snapshot:s});visited.delete(key);continue;}
     }
     if(isAccessBlockStatus(status)){
      result.status=status;result.challengeUrl=E.safeUrl(s.url);
      if(status==='access_protection_wait'){const blocked=persist(dir,task,s);blocked.grade='E0';blocked.hints=[];blocked.discovery=[];result.sources.push(blocked);result.verificationEvidenceSourceId=blocked.sourceId;result.disposition='automatic_wait_incomplete_checkpoint_and_continue';}
      // A spinner with no observed control is not an actionable human handoff.
      if(status==='needs_human_verification'&&Object.values(state.results).filter(x=>x.handoffTabId).length<preserveChallenges){keep=true;result.handoffTabId=tab.id;await tab.markHandoff();}break;
     }
     if(status==='requires_terms_confirmation'){result.status=status;result.termsUrl=E.safeUrl(s.url);break;}
     if(status==='error_page_observed'){result.status=status;const errorSource=persist(dir,task,s);errorSource.grade='E0';errorSource.hints=[];result.sources.push(errorSource);result.errorPageObservation={url:E.safeUrl(s.url),title:E.redact(s.title),httpStatusObserved:false};break;}
     if(['login_required','registration_required'].includes(status)){
      result.status=status;result.loginUrl=E.safeUrl(s.url);
      const knownAccount=!task.publicOnly&&credentialsForOrigin?await credentialsForOrigin(new URL(s.url).origin):null;
      if(!task.publicOnly&&task.allowRegistration&&credentialsForRegistration&&(status==='registration_required'||!knownAccount||knownAccount.accountKnown===false)){
       const registration=status==='registration_required'?{url:s.url}:s.links.find(l=>/注册|sign up|register/i.test(l.label)&&E.safeUrl(l.url)&&new URL(l.url).origin===new URL(s.url).origin&&!/checkout|order|reset|invite|code=/i.test(l.url));
       if(registration){
        if(registration.url!==s.url)await navigateReady(tab,registration.url);const form=await inspect(tab);
        if(task.allowedHosts.includes(new URL(form.url).hostname)){
         const formStatus=E.classify(form);if(['needs_human_verification','security_warning'].includes(formStatus)){result.status=formStatus;result.registrationUrl=E.safeUrl(form.url);break;}
         let reg=await registrationHandler({tab,snapshot:form,credentialsForRegistration,inspect,profile:task.registrationProfile||{}});
         if(reg.status==='registration_requires_email_verification'&&emailCodeProvider){const identity=await credentialsForRegistration(new URL(form.url).origin);try{reg=await completeEmailVerification({tab,request:{registrationOrigin:new URL(form.url).origin,registrationEmail:identity.email,serviceName:task.registrationProfile?.mailServiceName||task.name.replace(/\s*[（(].*$/,'').trim(),senderDomains:task.registrationProfile?.senderDomains||[],requestedAt:reg.emailVerificationRequestedAt||new Date().toISOString()},codeProvider:emailCodeProvider,inspect});result.registrationEmailCheck=reg.receipt;}catch(error){result.registrationEmailCheck={status:/^[a-z_]{1,80}$/.test(String(error.message))?String(error.message):'email_verification_adapter_failed',codePersisted:false};}}
         if(['registration_submitted_requires_state_check','registration_email_verified_authenticated_ui'].includes(reg.status)&&reg.snapshot.authenticationObserved===true&&!reg.snapshot.passwordForm&&E.classify(reg.snapshot)==='content_observed'){result.registrationOutcome='registration_submission_followed_by_authenticated_ui';queue.unshift({url:reg.snapshot.url,snapshot:reg.snapshot});continue;}
         if(['registration_account_exists_needs_login','registration_created_needs_login','email_code_submitted_state_unconfirmed','registration_submitted_requires_state_check'].includes(reg.status)){
          const login=reg.snapshot.links.find(l=>/登录|登入|sign in|log in/i.test(l.label)&&E.safeUrl(l.url)&&new URL(l.url).origin===new URL(form.url).origin&&!/reset|forget|logout/i.test(l.url));
          if(login){await navigateReady(tab,login.url);const signed=await authorizedLogin(tab,await inspect(tab),credentialsForRegistration);if(E.classify(signed)==='content_observed'&&!signed.passwordForm){result.registrationOutcome=reg.status==='registration_account_exists_needs_login'?'existing_account_login_recovered':reg.status==='registration_created_needs_login'?'new_account_login_observed':'email_verification_submission_followed_by_login_observed';signed.authenticationObserved=true;queue.unshift({url:signed.url,snapshot:signed});continue;}}
         }
         result.status=reg.status;result.registrationUrl=E.safeUrl(reg.snapshot.url);
         if(/requires_/.test(reg.status)&&Object.values(state.results).filter(x=>x.handoffTabId).length<preserveChallenges){keep=true;result.handoffTabId=tab.id;await tab.markHandoff();}
         result.registrationObservation={title:E.redact(reg.snapshot.title),status:reg.status,formFields:reg.snapshot.formFields||[],at:new Date().toISOString()};
        }
       }
      }break;
     }
 if(task.referralOnly===true){
  const referral=await referralCollector(tab,{...referralOptions,allowGenerate:task.allowGenerateReferral===true});
  result.referralObservation={status:referral.status,generated:referral.generated,url:referral.url||null,copyControlCount:referral.copyControlCount,copiedOrigin:referral.copiedOrigin};
  if(referral.source){const source=persist(dir,task,{...referral.source,title:'本人账号推荐链接',blocks:[],links:[]});source.hints=[];source.kind='authorized_account_page';result.sources.push(source);}
  result.status=referral.source?'observed_needs_review':referral.status;break;
 }
 if(task.readOnlyRecipe){
  const recipe=require('./url-collectors/index.cjs').forOrigin(s.url);
  if(recipe?.readOnlyRecipe===task.readOnlyRecipe&&recipe.collectMany){const recovered=await recipe.collectMany(tab);if(recovered){for(const capture of recovered.captures)result.sources.push(persist(dir,task,capture));result.readOnlyRecipeObservation={recipe:task.readOnlyRecipe,captures:recovered.captures.length,newOrdersCreated:0,paymentExecuted:false};result.status='observed_needs_review';break;}}
 }
 if(task.knowledgeAdapter===true&&/(?:#\/|\/)(?:knowledge|docs|help)(?:[/?#]|$)/i.test(s.url)){
  const knowledge=await knowledgeCollector(tab,{previousArticles:task.previousArticleTitles||[],maxArticles:task.maxArticles||3,includeClientGuides:task.includeClientGuides===true});
  result.knowledgeObservation={status:knowledge.status,actions:knowledge.actions,articleTitles:knowledge.articleTitles||[]};
  for(const capture of knowledge.captures){const source=persist(dir,task,{...capture,title:capture.semanticLocation.title||s.title,blocks:[],links:[],representation:'redacted_visible_DOM_text_not_original_HTML'});source.semanticLocation=capture.semanticLocation;result.sources.push(source);}
  result.status=knowledge.status==='login_required'?'login_required':knowledge.status==='knowledge_loading_checkpoint'?'empty_or_loading':'observed_needs_review';break;
 }
     if(status==='empty_or_loading'){result.status='empty_or_loading';result.emptyObservation={title:E.redact(s.title),text:E.redact(s.text),url:E.safeUrl(s.url),textLength:s.text.length,links:s.links.length,at:new Date().toISOString()};break;}
 if(task.expandNativeDocumentDetails===true&&/(?:#\/|\/)(?:knowledge|docs|help)(?:[/?#]|$)/i.test(s.url)&&await tab.playwright.locator('.ant-drawer-open .ant-drawer-content').count()===1){result.documentDisclosure=await expandObservedDocumentDetails({tab,expectedUrl:s.url});s=await inspect(tab);}
 const alreadyRetained=result.sources.some(x=>readRouteKey(x.url)===readRouteKey(s.url));
 if(!alreadyRetained){const source=persist(dir,task,s);result.sources.push(source);for(const c of source.discovery){const existing=state.discovery[c.candidateId];if(existing){existing.sourceIds=[...new Set([...existing.sourceIds,...c.sourceIds])];}else state.discovery[c.candidateId]=c;}}
     for(const l of chooseLinks(s,task,visited))if(!queue.some(x=>x.url&&readRouteKey(x.url)===readRouteKey(l.url)))queue.push({url:l.url});
     // Some V2Board themes render read-only navigation as menu text, not anchors.
     // Exact observed labels only. No purchase-card, order, reset or save buttons.
     if(!queue.length){for(const label of ['购买订阅','使用文档']){if(visited.has('menu:'+label))continue;const control=tab.playwright.getByText(label,{exact:true});if(await control.count()===1&&await control.isVisible())queue.push({menuLabel:label});}}
     result.status='observed_needs_review';
    }
   }
  }catch(error){result.status=/browser\.user is unavailable|browser.*disconnected|CDP operation exceeded.*dispatch/i.test(String(error.message))?'browser_infrastructure_error':'access_error';result.errors.push(E.redact(String(error.message||error)).slice(0,500));
   if(tab&&/timeout|timed\s*out|deadline exceeded/i.test(String(error.message))&&!/security|policy|rejected|disconnected/i.test(String(error.message)))try{const diagnostic=await inspect(tab);if(!navigationIssue(diagnostic.url,task.allowedHosts)){const source=persist(dir,task,diagnostic);source.grade='E0';source.hints=[];source.discovery=[];source.kind='readiness_failure_diagnostic_not_business_facts';result.sources.push(source);}}catch{}
  }
  finally{if(tab&&!keep){try{await tab.close();}catch{result.cleanup='close_failed';}}result.finishedAt=new Date().toISOString();if(result.status==='browser_infrastructure_error'){state.runtimeEvents??=[];state.runtimeEvents.push({taskId:task.taskId,at:result.finishedAt,errors:result.errors,tabId:tab?.id});}else{state.results[task.taskId]=result;count++;}write(path.join(dir,'state.json'),state);write(path.join(dir,'discovery-candidates.json'),{items:Object.values(state.discovery),admission:'candidates_only_not_catalog_facts'});onProgress({taskId:task.taskId,recordIds:task.recordIds,status:result.status,pages:result.sources.length});}
  if(result.status==='browser_infrastructure_error')break;
 }
 return {processed:count,remaining:plan.tasks.length-Object.keys(state.results).length,statusCounts:Object.values(state.results).reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})};
}
export async function resumeTask({browser,runId,taskId}){
 const dir=folders(runId),state=read(path.join(dir,'state.json')),r=state.results[taskId];if(!r?.handoffTabId)throw Error('No live handoff for task');
 const task=read(path.join(dir,'plan.json')).tasks.find(t=>t.taskId===taskId);if(!task)throw Error('Handoff task outside plan');
 const tab=await browser.tabs.get(r.handoffTabId);let s=await inspect(tab),status=E.classify(s);
 const beforeIssue=navigationIssue(s.url,task.allowedHosts);if(beforeIssue){Object.assign(r,beforeIssue);write(path.join(dir,'state.json'),state);return{...beforeIssue,unchanged:true};}
 if(status==='needs_human_verification'){const settled=await settleManagedVerification({tab,snapshot:s,inspect,classify:E.classify});s=settled.snapshot;status=settled.observation.status;r.verificationObservation=settled.observation;}
 const afterIssue=navigationIssue(s.url,task.allowedHosts);if(afterIssue){Object.assign(r,afterIssue);write(path.join(dir,'state.json'),state);return{...afterIssue,unchanged:true};}
 if(status!=='content_observed'){
  if(!/^registration_/.test(r.status))r.status=status;
  if(status==='access_protection_wait'){const blocked=persist(dir,task,s);blocked.grade='E0';blocked.hints=[];blocked.discovery=[];r.sources.push(blocked);r.verificationEvidenceSourceId=blocked.sourceId;r.disposition='automatic_wait_incomplete_checkpoint_and_continue';delete r.handoffTabId;write(path.join(dir,'state.json'),state);await tab.close();return{status,unchanged:true,closedNonInteractiveGate:true};}
  write(path.join(dir,'state.json'),state);return{status,unchanged:true};
 }
 r.sources.push(persist(dir,{recordIds:r.recordIds},s));r.status='observed_needs_review';r.finishedAt=new Date().toISOString();delete r.handoffTabId;write(path.join(dir,'state.json'),state);await tab.close();return{status:r.status};
}
export async function captureDiscoveryPage({tab,runId}){const dir=folders(runId),state=read(path.join(dir,'state.json')),s=await inspect(tab);if(E.classify(s)!=='content_observed')return{status:E.classify(s),candidates:0};const source=persist(dir,{recordIds:[]},s);for(const c of source.discovery){const old=state.discovery[c.candidateId];if(old)old.sourceIds=[...new Set([...old.sourceIds,...c.sourceIds])];else state.discovery[c.candidateId]=c;}write(path.join(dir,'discovery-source-'+source.sourceId+'.json'),source);write(path.join(dir,'state.json'),state);write(path.join(dir,'discovery-candidates.json'),{items:Object.values(state.discovery),admission:'candidates_only_not_catalog_facts'});return{status:'discovery_candidates_recorded',candidates:source.discovery.length,sourceId:source.sourceId};}
export async function completeConfirmedAccessGate({tab,confirmation}){
 return clickConfirmedChallenge({tab,confirmation,inspect,classify:E.classify});
}
export async function settleCurrentAccessGate({tab,timeoutMs=12000}){
 return settleManagedVerification({tab,inspect,classify:E.classify,timeoutMs});
}

// Read-only recovery sweep: never clicks a challenge or re-submits credentials.
// Each result is persisted by resumeTask so a cleared gate resumes without a new batch.
export async function resumeClearedGates({browser,runId}){
 const state=read(path.join(folders(runId),'state.json')),results=[];
 for(const r of Object.values(state.results).filter(r=>r.handoffTabId)){
  try{results.push({taskId:r.taskId,...await resumeTask({browser,runId,taskId:r.taskId})});}
  catch(error){results.push({taskId:r.taskId,status:'handoff_unavailable',message:E.redact(String(error.message)).slice(0,200)});}
 }
 return results;
}

export async function captureCurrentTask({tab,runId,recordId,close=false,expandNativeDocumentDetails=false}){
 const dir=folders(runId),plan=read(path.join(dir,'plan.json')),task=plan.tasks.find(t=>t.recordIds.includes(recordId));if(!task)throw Error('Record outside run');
 await tab.playwright.waitForLoadState({state:'domcontentloaded',timeoutMs:15000});let snapshot=await inspect(tab);let documentDisclosure=null;if(expandNativeDocumentDetails||task.expandNativeDocumentDetails){documentDisclosure=await expandObservedDocumentDetails({tab,expectedUrl:snapshot.url});snapshot=await inspect(tab);}
 if(!E.safeUrl(snapshot.url)||!task.allowedHosts.includes(new URL(snapshot.url).hostname))throw Error('Unconfirmed capture host');
 const state=read(path.join(dir,'state.json')),old=state.results[task.taskId];if(E.classify(snapshot)!=='content_observed')return{status:E.classify(snapshot)};
 const source=persist(dir,task,snapshot);state.attemptHistory??={};if(old)(state.attemptHistory[task.taskId]??=[]).push(old);state.results[task.taskId]={...old,taskId:task.taskId,recordIds:task.recordIds,status:'observed_needs_review',documentDisclosure,sources:[...(old?.sources||task.seedSources||[]),source],errors:[],finishedAt:new Date().toISOString()};delete state.results[task.taskId].handoffTabId;write(path.join(dir,'state.json'),state);if(close)await tab.close();return{status:'captured',sourceId:source.sourceId,capturedAt:source.capturedAt};
}
