'use strict';
const {assertPublicUrl,blockWebSockets,boundedLookup,collectorContextOptions,createPublicRoute,parsePublicUrl,publicIP}=require('./collector-public-egress.cjs');
const redact=s=>String(s).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').split('\n').filter(x=>!/(?:vmess|vless|trojan|ss):\/\/|[?&](token|password|access_token)=/i.test(x)).join('\n');
function requestAllowed(url,{allowed,isMainNavigation=false}={}){
 const u=new URL(url);
 return allowed.has(u.hostname)||(!isMainNavigation&&u.protocol==='https:'&&u.hostname==='challenges.cloudflare.com'&&(!u.port||u.port==='443'));
}
async function collectSite(site, options = {}) {
 const budget = options.jobBudgetMs ?? 90000;
 if (!Number.isInteger(budget) || budget < 1 || budget > 180000) throw Error('invalid_collection_job_budget');
 const controller = new AbortController();
 const result = { observations: [], discovery: [], checkpoints: [], blocker: null };
 let timer;
 const expired = new Promise(resolve => {
  timer = setTimeout(() => {
   resolve({ ...result, observations: [...result.observations], discovery: [...result.discovery],
     checkpoints: [...result.checkpoints], blocker: 'collection_job_deadline_exceeded' });
   controller.abort();
  }, budget);
 });
 try {
  return await Promise.race([collectSiteWithinBudget(site, options, controller.signal, result), expired]);
 } finally {
  clearTimeout(timer);
 }
}
async function collectSiteWithinBudget(site,{browser,credentials={},emailCodeProvider=null,verificationOptions={},maxPages=4,lookup,webTransport},signal,result){
 const config=site.config||site,entry=config.entryUrl||site.entryUrl;if(!entry)throw Error('entry_missing');const first=parsePublicUrl(entry),allowed=new Set(config.allowedHosts||[first.hostname]);if(!allowed.has(first.hostname))throw Error('entry_identity_unapproved');
 const resolve=boundedLookup(lookup);await assertPublicUrl(entry,resolve);
 signal.throwIfAborted();
 const context=await browser.newContext({acceptDownloads:false,...collectorContextOptions});const {observations,discovery,checkpoints}=result;let blocker=null,closing;
 const close=()=>closing??=Promise.resolve().then(()=>context.close()).catch(()=>{});
 signal.addEventListener('abort',close,{once:true});
 try{
 signal.throwIfAborted();
 const {attach,send}=createPublicRoute(context,{lookup:resolve,transport:webTransport,signal,
  authorizeRequest:(_request,main,url)=>requestAllowed(url.href,{allowed,isMainNavigation:main}),
  authorizeRedirect:url=>allowed.has(url.hostname)});
 await blockWebSockets(context);
 await context.route('**/*',async route=>{try{const request=route.request(),frame=request.isNavigationRequest()?request.frame():null;await send(route,frame&&!frame.parentFrame()?frame:null);}catch{return route.abort();}});
 signal.throwIfAborted();
 const page=await context.newPage(),queue=[entry],seen=new Set();await attach(page);while(queue.length&&observations.length<maxPages){signal.throwIfAborted();const url=queue.shift();if(seen.has(url))continue;seen.add(url);await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
 signal.throwIfAborted();
 const verification=require('./verification.cjs');
 let gate=await verification.observeVerification(page);const passive=await import('../collection/passive-access-wait.mjs');if(passive.passiveAccessWaitLabel(gate.snapshot)){const waited=await passive.waitForPassiveAccessPage({tab:{playwright:page},snapshot:gate.snapshot,inspect:async()=> (await verification.observeVerification(page)).snapshot,runtime:'server'});if(passive.passiveAccessWaitLabel(waited.snapshot)){blocker='passive_access_wait_incomplete';break;}gate=await verification.observeVerification(page);}let text=gate.snapshot.text;
 if(gate.type&&!(gate.type==='image_captcha'&&gate.snapshot.passwordForm)){
 const resolved=await verification.ensureVerification(page,{...verificationOptions,initial:gate});text=resolved.snapshot.text;
 if(resolved.type){checkpoints.push(verification.checkpointFor(resolved,{stage:'before_auth',redact}));blocker='challenge_requires_current_confirmation';break;}}
 if(/继续即表示同意|进入前确认/.test(text)){blocker='terms_confirmation_required';break;}

 if(await page.locator('input[type=password]').count()){
 if(config.publicOnly===true){blocker='public_only_login_checkpoint';break;}
 const origin=new URL(page.url()).origin,c=credentials[origin];
 const auth=config.auth||{mode:'login',emailSelector:'input[type=email]',passwordSelector:'input[type=password]',submitSelector:'button[type=submit]'};
 const result=await require('./auth.cjs').authenticate(page,{config:{...config,auth},credential:c&&{...c,origin},emailCodeProvider,verificationOptions});
 if(result.status!=='authenticated'){if(result.verification)checkpoints.push(verification.checkpointFor(result.verification,{stage:'after_auth',redact}));blocker=result.status;break;}text=await page.locator('body').innerText();
 }

 if(config.knowledgeAdapter===true&&/(?:#\/|\/)(?:knowledge|docs|help)(?:[/?#]|$)/i.test(page.url())){
  const recovered=await(await import('../collection/knowledge-browser.mjs')).collectKnowledge({url:async()=>page.url(),playwright:page},{runtime:'server',maxArticles:3,includeClientGuides:config.includeClientGuides===true});
  for(const c of recovered.captures)observations.push({url:c.url,body:redact(c.text),observedAt:c.capturedAt,kind:c.kind});
  if(recovered.status==='knowledge_loading_checkpoint')blocker='knowledge_loading_checkpoint';break;
 }
 const urlSpecific=require('../collection/url-collectors/index.cjs').forOrigin(page.url());
 const expectedHeading=urlSpecific?.expectedHeading?.(page.url());if(expectedHeading)await page.getByRole('heading',{name:expectedHeading,exact:true}).waitFor({state:'visible',timeout:12000});
 if(urlSpecific?.collectMany){const captured=await urlSpecific.collectMany({url:async()=>page.url(),goto:url=>page.goto(url),playwright:page},{runtime:'server'});if(captured){for(const c of captured.captures)observations.push({...c,url:c.url,body:redact(c.text+(c.selectedBilling?'\n当前可见选中周期：'+c.selectedBilling.label:'')),observedAt:c.capturedAt,kind:'rendered_public_or_authorized_page'});break;}}
 if(urlSpecific?.collect){const captured=await urlSpecific.collect({url:async()=>page.url(),playwright:page});observations.push({url:captured.url,body:redact(captured.text),observedAt:captured.capturedAt,kind:'operator_visible_page'});break;}
 if(config.urlCollector?.status==='live_verified_read_only'&&config.urlCollector.recipe){
 const recipes=require('../collection/url-collectors/verified-recipes.cjs');const allowedRecipes={captureNicePlans:recipes.captureNicePlans,captureTntAnnouncement:recipes.captureTntAnnouncement};
 const recipe=allowedRecipes[config.urlCollector.recipe];if(!recipe)throw Error('unknown_site_recipe');const captured=await recipe({url:async()=>page.url(),playwright:page});observations.push({url:captured.url,body:redact(captured.text||captured.plans.map(x=>x.quote).join('\n\n')),observedAt:captured.capturedAt,kind:'authorized_account_page'});break;
 }
 const links=await page.locator('a[href]').evaluateAll(es=>es.map(e=>({url:e.href,label:e.innerText})));observations.push({url:page.url(),body:redact(text),observedAt:new Date().toISOString(),kind:/退出登录|退出账号|Log out|Sign out/i.test(text)?'authorized_account_page':'rendered_public_or_authorized_page'});
 for(const l of links){let u;try{u=new URL(l.url);}catch{continue;}if(!/^https?:$/.test(u.protocol))continue;if(!allowed.has(u.hostname)){if(/官网|官方|发布|备用|official/i.test(l.label))discovery.push({url:l.url,quote:l.label,parentUrl:page.url(),identityStatus:'pending_review'});continue;}
 if(/套餐|定价|价格|退款|隐私|条款|帮助|知识库|文档|支持|公告|pricing|plans|terms|privacy|refund|knowledge|support|docs|help/i.test(l.label)&&!/(checkout|logout|cancel|delete|reset|order|payment|register|subscribe)/i.test(u.pathname+u.search+u.hash))queue.push(l.url);
 }
 }return{observations,discovery,checkpoints,blocker};}finally{signal.removeEventListener('abort',close);await close();}
}
module.exports={assertPublicUrl,publicIP,redact,collectSite,requestAllowed};
