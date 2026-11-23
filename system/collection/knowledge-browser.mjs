// Visible, read-only knowledge navigation. SPA URL equality is not completion.
const relevant=/公告|通知|常见|问题|条款|隐私|退款|支付|付款|套餐|购买|优惠|限制|服务协议|FAQ|terms|privacy|refund|payment/i;
const safeRelevant=label=>relevant.test(label)&&!/^(立即购买|确认付款|立即付款|立即支付|立即订阅|创建订单|提交订单|购买并支付|支付订单|充值|结账|checkout|pay now|buy now)/i.test(label.trim());
const redact=text=>String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]').split('\n').filter(line=>!/(?:vmess|vless|trojan|ss):\/\/|[?&](token|password|access_token)=/i.test(line)).join('\n');
export async function inspectKnowledge(tab){
 const state=await tab.playwright.evaluate(()=>{
  const visible=e=>!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const root=document.querySelector('main')||document.body;
  return {text:root.innerText||'',categories:[...root.querySelectorAll('nav button')].filter(visible).map(e=>e.innerText.replace(/\s+/g,'').trim()),
   headings:[...root.querySelectorAll('h3')].filter(visible).map(e=>e.innerText.trim()),
   articleButtons:[...root.querySelectorAll('button')].filter(e=>visible(e)&&/查看/.test(e.innerText)&&!/购买|支付|订阅/.test(e.innerText)).map(e=>e.innerText.trim()),
   paragraphCount:[...root.querySelectorAll('p')].filter(visible).length,
   authenticated:[...document.querySelectorAll('button,a')].filter(visible).some(e=>/^(退出登录|退出账号|Log out|Sign out)$/i.test(e.innerText.trim())),
   passwordForm:[...document.querySelectorAll('input[type=password]')].some(visible)};
 });return {...state,text:redact(state.text),url:await tab.url(),capturedAt:new Date().toISOString()};
}
export async function inspectKnowledgeArticle(tab,title){
 const article=await tab.playwright.evaluate(({articleTitle})=>{
  const visible=e=>!!e.getClientRects().length;
  const heading=[...document.querySelectorAll('h2')].find(e=>visible(e)&&e.innerText.trim()===articleTitle);
  const modal=heading?.closest('div.max-w-4xl');
  const body=modal&&[...modal.children].find(e=>e.classList.contains('overflow-y-auto')&&visible(e));
  if(!body)return null;
  return {text:body.innerText||'',paragraphCount:[...body.querySelectorAll('p')].filter(visible).length,headerText:heading.parentElement.innerText};
 },{articleTitle:title});
 return article&&{...article,text:redact(article.text),headerText:redact(article.headerText)};
}
export async function collectKnowledge(tab,{previousArticles=[],maxArticles=3,runtime='iab',includeClientGuides=false}={}){
 if(!Number.isInteger(maxArticles)||maxArticles<1||maxArticles>8)throw Error('knowledge_article_budget_invalid');
 if(new URL(await tab.url()).origin==='https://board.cloudnier.com'&&new URL(await tab.url()).hash==='#/doc/knowledge')return(await import('./site-recipes/niercloud.mjs')).collectNierKnowledge(tab);
 if(new URL(await tab.url()).origin==='https://support.yinyun.ltd')return(await import('./site-recipes/yinyun-help.mjs')).collectYinyunHelp(tab,{previousArticles});
 if(new URL(await tab.url()).origin==='https://shop.starpro.one')return(await import('./site-recipes/jiuxiao.mjs')).collectJiuxiaoKnowledge(tab,{previousArticles});
 const start=await tab.url(),origin=new URL(start).origin,captures=[],actions=[],known=new Set(previousArticles);
 const selected=label=>safeRelevant(label)||(includeClientGuides&&/^(?:windows|mac(?:os)?|ios|android|linux|软路由)(?:\(\d+\)|.*教程|.*客户端)/i.test(label.trim()));
 const waitOptions={state:'visible',...(runtime==='server'?{timeout:10000}:{timeoutMs:10000})};
 const check=async()=>{if(new URL(await tab.url()).origin!==origin)throw Error('knowledge_origin_changed');};
 let state=await inspectKnowledge(tab);
 if(state.passwordForm)return {status:'login_required',captures,actions};
 if(!state.categories.length&&!state.headings.length&&!state.articleButtons.length){
  // Wait for actual article cards, not just a heading or navigation shell.
  try{await tab.playwright.locator('h3').first().waitFor(waitOptions);}catch{}
  state=await inspectKnowledge(tab);
 }
 if(!state.categories.length&&!state.headings.length&&!state.articleButtons.length&&!/暂无文档|暂无文章|没有文章|No articles|No documents/i.test(state.text))return{status:'knowledge_loading_checkpoint',captures,actions};
 captures.push({...state,semanticLocation:{stage:'index'},kind:'operator_knowledge_index'});
 const categories=state.categories.filter(selected);
 for(const category of categories){
  const control=tab.playwright.getByRole('button',{name:category,exact:true});
  if(await control.count()!==1||!await control.isVisible())continue;
  await control.click();await check();
  const heading=category.replace(/\(\d+\)$/,'');
  await tab.playwright.getByRole('heading',{name:heading,exact:true}).waitFor(waitOptions);
  state=await inspectKnowledge(tab);actions.push({kind:'read_category',label:category});
  captures.push({...state,semanticLocation:{stage:'category',category},kind:'operator_knowledge_category'});
  for(const title of state.headings.filter(selected)){
   if(known.has(title)||actions.filter(a=>a.kind==='read_article').length>=maxArticles)continue;
   const card=tab.playwright.locator('h3').filter({hasText:new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
   if(await card.count()!==1||!await card.isVisible())continue;
   await card.click();await check();
   const articleHeading=tab.playwright.locator('h2').filter({hasText:new RegExp('^'+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')});
   try{await articleHeading.waitFor(waitOptions);}catch{actions.push({kind:'article_loading_checkpoint',title});break;}
   await check();const article=await inspectKnowledgeArticle(tab,title);await check();
   if(!article||article.text.trim().length<8||article.paragraphCount<1){actions.push({kind:'article_body_missing',title});break;}
   captures.push({...article,url:await tab.url(),capturedAt:new Date().toISOString(),semanticLocation:{stage:'article',category,title},kind:'operator_knowledge_article'});
   actions.push({kind:'read_article',category,title});known.add(title);
   const close=tab.playwright.getByRole('button',{name:'',exact:true});
   if(await close.count()!==1||!await close.isVisible()){actions.push({kind:'close_adapter_required',title});break;}
   await close.click();await articleHeading.waitFor({...waitOptions,state:'hidden'});
  }
 }
 return {status:actions.some(a=>a.kind==='read_article')?'article_bodies_observed':'no_relevant_article_bodies',captures,actions,articleTitles:[...known]};
}
