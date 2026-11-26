// Explicit user-authorized unpaid-order inspection. Never executes payment.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readRenderedDocument} from './browser-driver.mjs';
import {deferredCashierDecision} from './settlement-receipt.mjs';
import {followObservedMenu,sameBusinessRoute,requireCurrentRoute} from './route-readiness.mjs';
const require=createRequire(import.meta.url),E=require('../lib/collection-engine.cjs');
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function write(file,value){
 const temp=file+'.'+randomUUID()+'.tmp';
 try{
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp,file);
 }finally{fs.rmSync(temp,{force:true});}
}
export function zeroWallet(text){return /我的钱包(?:[（(]仅消费[）)])?\s*0(?:\.0+)?\s*(?:CNY|USD|¥|元)/i.test(text)||/账户余额\s*(?:充值\s*)?[¥￥]?\s*0(?:\.0+)?\s*(?:CNY|USD|元)?\s*(?:\n|$)/i.test(text)||/^余额\s*[:：]\s*[¥￥]\s*0(?:\.0+)?\s*$/m.test(text)||/^余额\s*\n\s*0(?:\.0+)?\s*\n\s*CNY\b/m.test(text);}
export function paymentNames(text){if(!/支付方式|付款方式|payment method|请使用(?:支付宝|微信).*扫|scan.*(?:Alipay|WeChat)/i.test(text))return[];return ['支付宝','微信','Alipay','WeChat Pay','PayPal','USDT','Visa','MasterCard','银联'].filter(x=>text.includes(x));}
// Only a rendered, same-origin navigation link can be followed automatically.
// A button caption alone cannot prove that it will not debit an account.
export function cashierPreviewDecision(snapshot,controls,policy={}){
 if(snapshot.passwordForm||snapshot.agreementCheckbox||snapshot.verificationWidgetObserved)return{allowed:false,reason:'cashier_auth_terms_or_verification_blocked'};
 const candidates=controls.filter(c=>!c.disabled&&/^(结账|结算支付|前往收银台|查看支付方式|Checkout|Open cashier)$/i.test(c.label));
 if(candidates.length!==1)return{allowed:false,reason:'cashier_navigation_not_unique_or_disabled'};
 const c=candidates[0];if(c.tag==='BUTTON'&&c.label==='结算支付'){const deferred=deferredCashierDecision(snapshot,policy);return deferred.allowed?{...deferred,label:c.label,role:'button'}:deferred;}
 if(c.tag==='BUTTON'&&c.label==='结账'&&policy.allowUnconfiguredCheckout===true&&policy.zeroWalletConfirmed===true&&!paymentNames(snapshot.text||'').length&&!/免密|自动扣款|已绑定|saved card|autopay|credit card|银行卡号|余额支付/i.test(snapshot.text||'')&&!(snapshot.formFields||[]).some(f=>/card|cc-|account|password/i.test((f.name||'')+' '+(f.type||''))))return{allowed:true,label:c.label,role:'button',reason:'explicit_theme_unconfigured_zero_wallet_checkout_preview_only'};
 let url;try{url=new URL(c.href);}catch{return{allowed:false,reason:'cashier_button_effect_unconfirmed'};}
 if(c.tag!=='A'||url.origin!==new URL(snapshot.url).origin||!/^https?:$/.test(url.protocol)||!/(?:checkout|cashier)(?:[/?#]|$)/i.test(url.pathname+url.hash)||/charge|deduct|autopay|balance|token=|password=/i.test(url.href)||c.target&&c.target!=='_self')return{allowed:false,reason:'cashier_link_effect_unconfirmed'};
 return{allowed:true,label:c.label,role:'link',url:url.href};
}
export function inspectPaymentControls(){return[...document.querySelectorAll('a,button,[role="button"]')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,label:(e.innerText||e.getAttribute('aria-label')||'').trim(),disabled:e.disabled===true||e.getAttribute('aria-disabled')==='true',href:e.tagName==='A'?e.href:null,target:e.getAttribute('target')})).filter(c=>/结账|支付|付款|收银|checkout|cashier/i.test(c.label));}
export async function navigateCashierPreview(tab,control){try{await tab.playwright.expectNavigation(()=>control.click(),{waitUntil:'domcontentloaded',timeoutMs:10000});}catch(error){if(!/timeout|timed.out|deadline/i.test(String(error.message)))throw error;}}
export function configurationCreateDecision(s,theme){
 if(theme!=='sanfen_config_then_order'||!s.radioGroupObserved||!s.text.includes('选择周期')||s.passwordForm||s.agreementCheckbox||s.verificationWidgetObserved||/支付方式|免密|自动扣款|已绑定|余额支付|card number/i.test(s.text))return null;
 const labels=(s.buttons||[]).filter(b=>/^[¥￥]\s*\d+(?:\.\d+)?\s*前去支付$/.test(b.trim()));if(labels.length!==1)return null;
 const amount=Number(labels[0].match(/[\d.]+/)[0]);return amount>0?{label:labels[0],amount,currency:null,basis:'displayed_symbol_only_configuration_next_step'}:null;
}
export function hasUnpaidOrder(text){
 const pending=/未支付|待支付|pending/i,listAt=text.indexOf('订单列表');
 if(listAt>=0){const rows=text.slice(listAt+'订单列表'.length);if(pending.test(rows))return true;const summary=text.slice(0,listAt).replace(/(?:未支付|待支付|pending)\s*[:：]?\s*0(?=\s|$)/gi,'');return pending.test(summary);}
 if(/暂无订单|暂无数据|还没有创建任何订单/.test(text))return false;return pending.test(text);
}
export function inspectOrderRows(){return[...document.querySelectorAll('table tr,[role="row"]')].filter(e=>e.getClientRects().length&&e.querySelector('td,[role="cell"]')).map(e=>e.innerText.trim());}
export function unpaidOrderListVerdict(snapshot){
 const rows=snapshot.orderRows||[],pending=/未支付|待支付|待付款|\bunpaid\b|\bpending\b/i;
 if(rows.some(r=>pending.test(r)))return{blocked:true,basis:'actual_pending_order_row'};
 const counts=[...(snapshot.text||'').matchAll(/(?:未支付|待支付|待付款)\s*[:：]?\s*(\d+)(?=\s|$)/g)].map(m=>Number(m[1]));
 if(counts.some(n=>n>0))return{blocked:true,basis:'nonzero_pending_summary'};
 if(rows.length&&counts.length&&counts.every(n=>n===0)&&rows.every(r=>/已取消|已关闭|已支付|已完成|cancelled|canceled|closed|paid|completed/i.test(r)))return{blocked:false,basis:'zero_pending_summary_and_terminal_order_rows'};
 return{blocked:hasUnpaidOrder(snapshot.text||''),basis:'conservative_visible_text_fallback'};
}
export function walletVerdict(texts){const amounts=[];for(const text of texts)for(const m of text.matchAll(/(?:^|\n)(?:当前余额|账户余额|我的钱包|余额(?!充值))\s*(?:[（(]仅消费[）)])?\s*[:：]?\s*(?:\n[ \t]*充值[ \t]*\n\s*)?[¥￥]?\s*(-?\d+(?:\.\d+)?)/g))amounts.push(Number(m[1]));return{zeroConfirmed:amounts.length>0&&amounts.every(n=>n===0),amounts:[...new Set(amounts)]};}
export function inspectWallet(){const visible=e=>!!e.getClientRects().length;const out=[];for(const e of [...document.querySelectorAll('p,span,div,section,article')].filter(visible)){const t=(e.innerText||'').trim();if(t.length>350)continue;for(const m of t.matchAll(/(?:^|\n)(?:当前余额|账户余额|我的钱包|余额(?!充值))\s*(?:[（(]仅消费[）)])?\s*[:：]?\s*(?:\n[ \t]*充值[ \t]*\n\s*)?[¥￥]?\s*-?\d+(?:\.\d+)?(?:\s*(?:CNY|USD|元))?/g))out.push(m[0].trim());}return[...new Set(out)].slice(0,20);}
function dirFor(id){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid run ID');return path.join(ROOT,'work/collection-runs',id);}
function ensureOwned(s,task){if(!E.safeUrl(s.url)||!task.allowedHosts.includes(new URL(s.url).hostname))throw Error('unconfirmed_navigation_host');}
function inspectOrderId(){
 const region=[...document.querySelectorAll('main,#main-content,.main-container')].find(e=>e.getClientRects().length)||document.body;
 const matches=[...(region?.innerText||'').matchAll(/^[ \t]*(?:订单号(?:码)?|订单编号|Order (?:ID|Number|No\.?))[ \t]*[:：]?[ \t]*(?:\r?\n[ \t]*)?#?([a-z0-9][a-z0-9_-]{0,99})[ \t]*$/gim)];
 const ids=[...new Set(matches.map(m=>m[1]))];
 return ids.length===1?ids[0]:null;
}
async function observe(tab){
 await tab.getAXState({emit:false});
 const s=await readRenderedDocument(tab);
 const walletSnippets=await tab.playwright.evaluate(inspectWallet),orderRows=await tab.playwright.evaluate(inspectOrderRows);
 const orderId=await tab.playwright.evaluate(inspectOrderId);
 if(await tab.url()!==s.url)throw Error('order_observation_route_changed');
 return{...s,walletSnippets,orderRows,orderId};
}
const cancelledStatus=/^(?:(?:订单状态|Order status)\s*[:：]?\s*)?(?:订单)?(?:已取消|已关闭|Cancelled|Canceled|Closed)$/i;
const pendingStatus=/^(?:(?:订单状态|Order status)\s*[:：]?\s*)?(?:未支付|待支付|待付款|Unpaid|Pending)$/i;
const orderIdPattern=/^[a-z0-9][a-z0-9_-]{0,99}$/i;
const rowHasOrderId=(row,id)=>row.trimStart().split(/[\t\n]/,1)[0].trim().replace(/^#/,'')===id;
function orderIdFromUrl(value){
 const url=new URL(value),spa=/^#\/(?!\/)/.test(url.hash)?new URL(url.hash.slice(1),url.origin):null;
 const ids=[...new Set([url,spa].filter(Boolean).flatMap(route=>[
  ...['trade_no','order','order_id','order_no','invoice_id'].flatMap(key=>route.searchParams.getAll(key)),
  /^\/(?:orders?|invoices?|payments?)(?:\/detail)?\/([a-z0-9_-]+)\/?$/i.exec(route.pathname)?.[1]
 ]).filter(id=>orderIdPattern.test(id||'')))];
 return ids.length===1?ids[0]:null;
}
function exactOrderDetail(s,entry){return sameBusinessRoute(s.url,entry.orderUrl)&&s.orderId===entry.orderId&&E.classify(s)==='content_observed';}
function exactOrderCancelled(s,entry){
 if(E.classify(s)!=='content_observed')return false;
 const statuses=text=>text.split(/[\t\n]+/).map(value=>value.trim());
 if(exactOrderDetail(s,entry)){const lines=statuses(s.text);return lines.some(line=>cancelledStatus.test(line))&&!lines.some(line=>pendingStatus.test(line));}
 if(!sameBusinessRoute(s.url,entry.baselineUrl))return false;
 const rows=s.orderRows.filter(row=>rowHasOrderId(row,entry.orderId));
 if(rows.length!==1)return false;
 const cells=statuses(rows[0]);
 return cells.some(cell=>cancelledStatus.test(cell))&&!cells.some(cell=>pendingStatus.test(cell));
}
async function cancelExactOrder(tab,s,entry,task){
 ensureOwned(s,task);
 if(!exactOrderDetail(s,entry))throw Error('cleanup_exact_order_detail_not_confirmed');
 const close=await actionButton(tab,['关闭订单','取消订单','closeorder']);
 if(!close)throw Error('cleanup_cancel_control_not_unique');
 await requireCurrentRoute(tab,s);
 if(await tab.playwright.evaluate(inspectOrderId)!==entry.orderId)throw Error('cleanup_exact_order_detail_not_confirmed');
 await requireCurrentRoute(tab,s);
 await close.click();
 const after=await observe(tab);
 let dialog=tab.playwright.getByRole('dialog');if(await dialog.count()===0)dialog=tab.playwright.getByRole('alertdialog');
 const dialogCount=await dialog.count();
 if(dialogCount>1)throw Error('cleanup_confirmation_not_unique');
 const inlineConfirm=dialogCount===0&&await tab.playwright.getByRole('heading',{name:'确认取消订单',exact:true}).count()===1;
 if(dialogCount===1||inlineConfirm){
  if(!exactOrderDetail(after,entry))throw Error('cleanup_exact_order_detail_not_confirmed');
  const confirm=await actionButton(inlineConfirm?tab:dialog,inlineConfirm?['确认']:['关闭订单','取消订单','确定','确认关闭','确认']);
  if(!confirm)throw Error('cleanup_confirmation_not_unique');
  await requireCurrentRoute(tab,after);
  if(await tab.playwright.evaluate(inspectOrderId)!==entry.orderId)throw Error('cleanup_exact_order_detail_not_confirmed');
  await requireCurrentRoute(tab,after);
  await confirm.click();
 }
}
async function verifyOrderCleanup(tab,entry,task){
 await tab.goto(entry.orderUrl);
 let s=await settle(tab);ensureOwned(s,task);
 if(!exactOrderCancelled(s,entry)){
  if(!exactOrderDetail(s,entry)&&!sameBusinessRoute(s.url,entry.baselineUrl))throw Error('cleanup_exact_order_route_not_confirmed');
  try{await tab.playwright.getByText(cancelledStatus).first().waitFor({state:'visible',timeoutMs:8000});}catch{}
  s=await observe(tab);ensureOwned(s,task);
 }
 if(!exactOrderCancelled(s,entry))throw Error('cleanup_exact_order_terminal_state_not_confirmed');
 return s;
}
async function settle(tab){const loadingStatus=tab.playwright.getByRole('status');if(await loadingStatus.count()===1&&/Loading\.\.\.|加载中/.test(await loadingStatus.innerText())){try{await loadingStatus.waitFor({state:'hidden',timeoutMs:10000});}catch{}}try{await tab.playwright.waitForLoadState({state:'networkidle',timeoutMs:4000});}catch{}let s=await observe(tab);if(!s.text.trim()){const progress=tab.playwright.getByRole('progressbar');if(await progress.count()===1&&await progress.isVisible()){try{await progress.waitFor({state:'hidden',timeoutMs:8000});}catch{}s=await observe(tab);}}if(/^温馨提示\s+为了您的安全和更好的体验，请点击继续\s+继续$/.test(s.text.trim())&&!s.verificationWidgetObserved){const next=tab.playwright.getByRole('button',{name:'继续',exact:true});if(await next.count()===1){await next.click();s=await observe(tab);}}for(const label of ['Loading...','加载中...','正在加载用户信息...','正在加载订单数据...','正在加载订单详情...'])if(s.text.includes(label)){const loader=tab.playwright.getByText(label,{exact:true});if(await loader.count()===1){try{await loader.waitFor({state:'hidden',timeoutMs:5000});}catch{}s=await observe(tab);}}return s;}
export async function menuControl(tab,label){const button=tab.playwright.getByRole('button',{name:label,exact:true});if(await button.count()===1&&await button.isVisible())return button;if(['用户中心','订单列表'].includes(label)){const card=tab.playwright.getByRole('button',{name:new RegExp('^'+label+'(?:\\s|$)')});if(await card.count()===1&&await card.isVisible())return card;const custom=tab.playwright.getByText(label,{exact:true});if(await custom.count()===1&&await custom.isVisible()&&await custom.evaluate(e=>!!e.closest('.stats-info')))return custom;}const link=tab.playwright.getByRole('link',{name:label,exact:true});if(await link.count()===1&&await link.isVisible())return link;const option=tab.playwright.getByRole('option',{name:label,exact:true});if(await option.count()===1&&await option.isVisible())return option;const item=tab.playwright.getByRole('menuitem',{name:label,exact:true});if(await item.count()===1&&await item.isVisible())return item;const nav=tab.playwright.getByRole('navigation');if(await nav.count()===1){const scoped=nav.getByText(label,{exact:true});if(await scoped.count()===1&&await scoped.isVisible())return scoped;}const visible=[];for(const l of await tab.playwright.getByText(label,{exact:true}).all())if(await l.isVisible()&&await l.evaluate(e=>!!e.closest('a,button,[role="menuitem"],nav,.sidebar,aside')))visible.push(l);if(visible.length===1)return visible[0];if(visible.length>1){const hrefs=await Promise.all(visible.map(l=>l.evaluate(e=>e.closest('a[href]')?.href||null)));if(hrefs.every(Boolean)&&new Set(hrefs).size===1)return visible[0];}return null;}
async function openNavigation(tab){const toggles=tab.playwright.locator('button').filter({has:tab.playwright.locator('svg.lucide-menu')});const visible=[];for(const l of await toggles.all())if(await l.isVisible())visible.push(l);if(visible.length!==1)return false;await visible[0].click();await observe(tab);return true;}
async function menu(tab,label,aliases=[]){let l=await menuControl(tab,label);for(const alias of aliases)if(!l)l=await menuControl(tab,alias);if(!l&&await openNavigation(tab)){l=await menuControl(tab,label);for(const alias of aliases)if(!l)l=await menuControl(tab,alias);}if(!l)throw Error('unsupported_menu:'+label);const href=await l.evaluate(e=>e.closest('a[href]')?.href||null);if(href&&E.safeUrl(href)&&new URL(href).origin===new URL(await tab.url()).origin)await followObservedMenu(tab,l,href);else{try{await tab.playwright.expectNavigation(()=>l.click(),{waitUntil:'domcontentloaded',timeoutMs:4000});}catch(error){if(!/timeout|timed.out/i.test(error.message))throw error;}}let settled=await settle(tab);if(href&&!sameBusinessRoute(settled.url,href))throw Error('observed_menu_route_reset');const childLabels=[label,...aliases].includes('账户')?['个人中心']:[label,...aliases].includes('财务')?['我的订单']:[label,...aliases].includes('订阅')?['购买订阅']:[];for(const child of childLabels){const link=tab.playwright.getByRole('link',{name:child,exact:true});if(await link.count()===1&&await link.isVisible()){await link.click();settled=await settle(tab);break;}}return settled;}
async function findMenu(tab,labels){for(const label of labels)if(await menuControl(tab,label))return label;return null;}
export async function actionButton(scope,labels){
 const api=scope.playwright||scope,found=[];
 for(const button of await api.getByRole('button').all())if(await button.isVisible()){
  const caption=(await button.innerText()).replace(/[\uE000-\uF8FF\s]/g,'');
  if(labels.some(label=>label.toLowerCase()===caption.toLowerCase()))found.push(caption);
 }
 if(found.length!==1)return null;
 const gap='[\\uE000-\\uF8FF\\s]*';
 const pattern=gap+[...found[0]].map(c=>'\\u{'+c.codePointAt(0).toString(16)+'}').join(gap)+gap;
 return api.getByRole('button').filter({hasText:new RegExp('^'+pattern+'$','u')});
}
export async function namedPlanSubscription(tab,{planHeading,planCardParentDepth=2}={}){
 if(typeof planHeading!=='string'||/补单|勿拍|勿买|测试专用|差价/.test(planHeading)||!Number.isInteger(planCardParentDepth)||planCardParentDepth<1||planCardParentDepth>4)return null;
 const heading=tab.playwright.getByRole('heading',{name:planHeading,exact:true});if(await heading.count()!==1||!await heading.isVisible())return null;
 let card=heading;for(let n=0;n<planCardParentDepth;n++)card=card.locator('..');
 if(await card.getByRole('heading').count()!==1||/补单专用|请勿拍|请勿购买/.test(await card.innerText()))return null;
 const control=card.getByRole('button',{name:/^(立即订阅|立即购买|查看并订阅|立即订阅此套餐)$/});return await control.count()===1&&await control.isVisible()?control:null;
}
async function login(tab,s,credentials){if(!s.passwordForm||s.passwordInputCount!==1||s.agreementCheckbox||!credentials)return s;const c=await credentials(new URL(s.url).origin);if(!c||c.origin!==new URL(s.url).origin)return s;const selector=s.emailInputCount===1?'input[type="email"]':s.textInputCount===1?'input[type="text"]':null;const btn=s.buttons.find(b=>/^(登录|登入|立即登录|Login|Sign in)$/i.test(b.trim()));if(!selector||!btn)return s;const control=tab.playwright.getByRole('button',{name:btn,exact:true});if(await control.count()!==1)return s;await tab.playwright.locator(selector).fill(c.email);await tab.playwright.locator('input[type="password"]').fill(c.password);await control.click();try{await tab.playwright.locator('input[type="password"]').waitFor({state:'hidden',timeoutMs:5000});}catch{}return settle(tab);}
async function recoverSignIn(tab,s,task){if(s.authenticationObserved||s.passwordForm||E.classify(s)!=='content_observed')return s;const urls=[...new Set((s.links||[]).filter(l=>/^(登录|登入|立即登录|用户中心|客户中心|控制台|Login|Sign in)$/i.test(l.label.trim())&&E.safeUrl(l.url)&&new URL(l.url).origin===new URL(s.url).origin).map(l=>l.url))];if(urls.length!==1)return s;await tab.goto(urls[0]);s=await settle(tab);ensureOwned(s,task);return s;}
export function publicOrderUrl(url,orderId){
 const u=new URL(url);
 const privateParts=orderId?[orderId.toLowerCase(),orderIdFromUrl(url)?.toLowerCase()]:[];
 const clean=p=>p.split('/').filter(part=>{
  let value=part;try{value=decodeURIComponent(part);}catch{}
  return !privateParts.includes(value.toLowerCase())&&!(/^[a-z0-9_-]{16,}$/i.test(value));
 }).join('/');
 u.pathname=clean(u.pathname);u.search='';u.hash=clean(u.hash.split('?')[0]);return u.href;
}
export function redactOrderText(text,orderId){
 const clean=orderIdPattern.test(orderId||'')?String(text||'').replace(new RegExp('(?<![a-z0-9_-])'+orderId+'(?![a-z0-9_-])','gi'),'[order identifier redacted]'):text;
 return E.redact(clean).replace(/\b[a-z0-9]{16,}\b/gi,'[order identifier redacted]');
}
export function retain(dir,task,s,kind,recordedId){
 const {orderId,orderRows,...snapshot}=s,id=recordedId||orderId;
 const raw={...snapshot,url:publicOrderUrl(s.url,id),actualOrderUrlWithheld:true,urlRedactionReason:'Private temporary order identifier is retained only in local lifecycle journal; public URL is context only',text:redactOrderText(s.text,id),links:[],blocks:[],capturedAt:new Date().toISOString(),authenticationObserved:true,collectionContext:'user_authorized_temporary_unpaid_order',kind,transactionVerified:false};
 const bytes=JSON.stringify(raw,null,2)+'\n',hash=E.sha(bytes),file='evidence/'+hash+'.json';fs.mkdirSync(path.join(dir,'evidence'),{recursive:true});fs.writeFileSync(path.join(dir,file),bytes);return{sourceId:'COLLECT-'+hash.slice(0,24),file,sha256:hash,url:raw.url,capturedAt:raw.capturedAt,recordIds:task.recordIds,grade:'E1',independenceScore:'I0',representation:raw.representation,hints:[]};
}
export function pendingCleanupHold(task,holds){return (task.recordIds||[]).find(id=>holds?.records?.[id]?.cleanupRequired===true)||null;}
export function accountRestrictionObserved(text=''){return /^(?:用户状态|账户状态|账号状态)\s*[:：]?\s*(?:封禁|已封禁|禁用|已禁用|受限)(?:\s|$)/m.test(text)||/^(?:账号|账户)(?:已被|已)?封禁[。!！]?\s*$/m.test(text);}
export function announcementDismissDecision({text='',buttonLabels=[],hasForm=false,agreementCheckbox=false,verificationWidgetObserved=false}){
 if(hasForm||agreementCheckbox||verificationWidgetObserved||/条款|隐私|同意|支付|付款|购买|验证码|验证|terms|privacy|payment|captcha/i.test(text))return null;
 if(!/公告|客户端.*(?:升级|更新)|(?:升级|更新).*客户端/.test(text))return null;
 const labels=buttonLabels.filter(x=>/^(关闭|close|×)$/i.test(x.trim()));return labels.length===1?labels[0]:null;
}
export async function dismissNonbindingAnnouncement(tab){
 const dialogs=tab.playwright.getByRole('dialog');if(await dialogs.count()!==1)return null;const dialog=dialogs,observation=await dialog.evaluate(e=>({text:e.innerText,hasForm:!!e.querySelector('input,textarea,select,form,iframe'),buttonLabels:[...e.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim())}));const label=announcementDismissDecision(observation);if(!label)return null;
 const close=dialog.getByRole('button',{name:label,exact:true});if(await close.count()!==1)return null;await close.click();await dialog.waitFor({state:'hidden',timeoutMs:5000});return{label,kind:'nonbinding_client_announcement',dismissedAt:new Date().toISOString()};
}
export async function runUnpaidChunk({browser,runId,limit=1,credentialsForOrigin=null,onProgress=()=>{}}){
 const dir=dirFor(runId),plan=read(path.join(dir,'plan.json')),state=read(path.join(dir,'state.json')),journalFile=path.join(dir,'unpaid-lifecycle-private.json'),journal=fs.existsSync(journalFile)?read(journalFile):{};
 if(Object.values(journal).some(x=>x.cleanupRequired))return{status:'cleanup_required_stop_batch',processed:0,remaining:plan.tasks.length-Object.keys(state.results).length,cleanupRequired:true};
 if(plan.unpaidOrderAuthorization?.paymentAllowed!==false||plan.unpaidOrderAuthorization?.createUnpaidAllowed!==true)throw Error('Explicit unpaid-only authorization required');
 let processed=0;
 for(const task of plan.tasks.filter(t=>!state.results[t.taskId]).slice(0,limit)){
  if((task.recordIds||[]).some(require('../lib/collection-user-skips.cjs').isUserSkipped)){state.results[task.taskId]={taskId:task.taskId,recordIds:task.recordIds,status:'standing_user_skip_no_order',sources:[],errors:[],finishedAt:new Date().toISOString()};write(path.join(dir,'state.json'),state);processed++;continue;}
  if(task.publicOnly===true||task.accountReadOnly===true||(task.recordIds||[]).some(id=>{if(!/^A\d{3}$/.test(id))return false;const file=path.join(ROOT,'collection/site-collectors',id+'.json');if(!fs.existsSync(file))return false;const c=read(file);return c.publicOnly===true||c.accountReadOnly===true;})){state.results[task.taskId]={taskId:task.taskId,recordIds:task.recordIds,status:'public_only_no_order_or_login',sources:[],errors:[],finishedAt:new Date().toISOString()};write(path.join(dir,'state.json'),state);processed++;continue;}
  if(task.theme==='ofo_native_checkout'){const result=await(await import('./ofo-unpaid.mjs')).runOfoUnpaidChunk({browser,runId,taskId:task.taskId});Object.assign(state,read(path.join(dir,'state.json')));if(fs.existsSync(journalFile)){Object.assign(journal,read(journalFile));write(journalFile,journal);}processed++;if(result.cleanupRequired)return{status:'cleanup_required_stop_batch',processed,remaining:plan.tasks.length-Object.keys(state.results).length,cleanupRequired:true};continue;}
  let tab,s,baselineRows,created=false;const r={taskId:task.taskId,recordIds:task.recordIds,startedAt:new Date().toISOString(),status:'running',sources:[],errors:[]};
  const save=(phase,{cleanupRequired=created,...details}={})=>{
   const latest=fs.existsSync(journalFile)?read(journalFile):{};
   if(!created&&Object.values(latest).some(entry=>entry.cleanupRequired)){
    Object.assign(journal,latest);throw Error('existing_unpaid_cleanup_required');
   }
   const entry={...latest[task.taskId],...details,phase,at:new Date().toISOString(),tabId:tab?.id,cleanupRequired};
   write(journalFile,{...latest,[task.taskId]:entry});
   Object.assign(journal,latest,{[task.taskId]:entry});
   created=cleanupRequired;
  };
  const rememberOrder=snapshot=>{
   ensureOwned(snapshot,task);
   const {baselineUrl}=journal[task.taskId];
   if(!snapshot.orderId||E.classify(snapshot)!=='content_observed'||sameBusinessRoute(snapshot.url,baselineUrl)||new URL(snapshot.url).origin!==new URL(baselineUrl).origin||baselineRows.some(row=>rowHasOrderId(row,snapshot.orderId)))throw Error('new_order_identity_not_confirmed');
   save('order_observed_cleanup_required',{orderUrl:snapshot.url,orderId:snapshot.orderId});
  };
  try{
   const holdFile=path.join(ROOT,'work/unpaid-order-holds.json');const held=pendingCleanupHold(task,fs.existsSync(holdFile)?read(holdFile):{});if(held){r.status='prior_unpaid_cleanup_pending_no_new_order';r.heldRecordId=held;continue;}if(task.skipReason){r.status=task.skipReason;continue;}
   if(!E.safeUrl(task.entryUrl)){r.status='unsupported_or_unsafe_public_entry';continue;}
   tab=task.reuseTabId?await browser.tabs.get(task.reuseTabId):await browser.tabs.new();if(!task.reuseTabId&&await tab.url()!==task.entryUrl)await tab.goto(task.entryUrl);if(task.theme==='sanfen_config_then_order'){try{await tab.playwright.getByRole('button',{name:'立即购买',exact:true}).first().waitFor({state:'visible',timeoutMs:10000});}catch{}}s=await settle(tab);if(E.classify(s)==='empty_or_loading'){try{await tab.playwright.getByRole('link').first().waitFor({state:'visible',timeoutMs:8000});}catch{}s=await settle(tab);}
   if(!task.allowedHosts.includes(new URL(s.url).hostname)){r.status='needs_identity_review';continue;}
   s=await recoverSignIn(tab,s,task);
   if(E.classify(s)==='login_required')s=await login(tab,s,credentialsForOrigin);ensureOwned(s,task);
   const gate=E.classify(s);if(gate!=='content_observed'){r.status=gate;const blocked=retain(dir,task,s,'unpaid_preflight_blocked');blocked.grade='E0';r.sources.push(blocked);continue;}
   if(accountRestrictionObserved(s.text)){r.status='account_restricted_no_order_created';const blocked=retain(dir,task,s,'account_status_restriction');blocked.grade='E0';r.sources.push(blocked);continue;}if(task.expectedBrand&&!((s.title||'')+' '+s.text).includes(task.expectedBrand)){r.status='current_brand_not_matched_no_order_created';continue;}const notice=await dismissNonbindingAnnouncement(tab);if(notice){r.noticeDismissal=notice;s=await settle(tab);}if(!await menuControl(tab,'个人中心')){await openNavigation(tab);try{await tab.playwright.getByText('个人中心',{exact:true}).first().waitFor({state:'visible',timeoutMs:5000});}catch{}s=await observe(tab);}
   if(task.theme==='more_cards'){const more=tab.playwright.getByRole('link',{name:'更多',exact:true});if(await more.count()===1&&await more.isVisible()){await more.click();s=await settle(tab);try{await tab.playwright.getByText('用户中心',{exact:true}).waitFor({state:'visible',timeoutMs:8000});}catch{}s=await observe(tab);}}const userMenu=tab.playwright.getByRole('button',{name:'用户菜单',exact:true});if(await userMenu.count()===1&&await userMenu.isVisible()&&await userMenu.getAttribute('aria-expanded')==='false'){await userMenu.click();s=await settle(tab);}const menus={orders:await findMenu(tab,['订单列表','账单记录','我的订单','订单记录','订单','财务']),wallet:await findMenu(tab,['用户中心','账户与充值','钱包管理','账户管理','我的钱包','钱包','个人中心','个人资料','个人信息','账号信息','账户']),plans:await findMenu(tab,['购买订阅','购买套餐','购买服务','商店','订阅'])};if(!menus.wallet&&task.walletEntryUrl&&E.safeUrl(task.walletEntryUrl)&&new URL(task.walletEntryUrl).origin===new URL(s.url).origin)menus.wallet='__observed_wallet_entry__';r.observedMenus=menus;
   if(Object.values(menus).some(x=>!x)){r.status='unsupported_order_adapter';r.navigationHints=await tab.playwright.evaluate(()=>[...document.querySelectorAll('nav,[role="navigation"],.sidebar')].map(e=>e.innerText).join('\n').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]').slice(0,6000));r.navigationControls=await tab.playwright.evaluate(()=>[...document.querySelectorAll('a,button,[role="menuitem"]')].filter(e=>e.getClientRects().length).map(e=>({label:(e.innerText||e.getAttribute('aria-label')||e.title||'').trim().replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]').slice(0,100),className:String(e.className||'').slice(0,200),svgClass:e.querySelector('svg')?.getAttribute('class')||null})).filter(e=>!e.label||/订单|钱包|个人|账户|订阅|购买|财务|菜单|menu|wallet|account|order|plan|shop|toggle|navigation/i.test(e.label)).slice(0,45));continue;}
   if(menus.wallet==='__observed_wallet_entry__'){await tab.goto(task.walletEntryUrl);s=await settle(tab);}else s=await menu(tab,menus.wallet,['用户中心','账户与充值','钱包管理','账户管理','我的钱包','钱包','个人中心','个人资料','个人信息','账号信息','账户']);ensureOwned(s,task);if(/Invalid Date|\bundefined\b/.test(s.text)){try{await tab.playwright.getByText(/^(您好，undefined|注册时间：Invalid Date)$/).first().waitFor({state:'hidden',timeoutMs:8000});}catch{}s=await settle(tab);ensureOwned(s,task);}if(!walletVerdict([s.text,...s.walletSnippets]).amounts.length){try{await tab.playwright.getByText(/^(我的钱包|账户余额|当前余额)$/).first().waitFor({state:'visible',timeoutMs:12000});await tab.playwright.getByText(/^[¥￥]\s*-?\d+(?:\.\d+)?$/).first().waitFor({state:'visible',timeoutMs:12000});}catch{}s=await observe(tab);ensureOwned(s,task);}let wallet=walletVerdict([s.text,...s.walletSnippets]);if(!wallet.amounts.length){try{await tab.playwright.getByText(/^(?:[¥￥]\s*)?-?\d+(?:\.\d+)?\s*(?:CNY|USD|元)?$/).first().waitFor({state:'visible',timeoutMs:8000});}catch{}s=await settle(tab);ensureOwned(s,task);wallet=walletVerdict([s.text,...s.walletSnippets]);}if(!wallet.zeroConfirmed||/Invalid Date|\bundefined\b|正在加载用户信息/.test(s.text)){r.status='zero_wallet_not_confirmed_no_order_created';r.walletObservation={snippets:s.walletSnippets,amounts:wallet.amounts,profileBodyOmitted:true};continue;}r.zeroWalletObserved=true;
   s=await menu(tab,menus.orders,['订单列表','账单记录','我的订单','订单记录','订单','财务']);ensureOwned(s,task);if(!/\/(orders?|invoice)(?:\b|\/)/i.test(new URL(s.url).pathname+new URL(s.url).hash)&&!(/订单号/.test(s.text)&&/订单状态/.test(s.text))&&!(task.theme==='bywave_wallet_bills'&&/账单记录/.test(s.text)&&/暂无账单/.test(s.text))){r.status='order_list_navigation_not_confirmed';continue;}r.orderListVerdict=unpaidOrderListVerdict(s);if(r.orderListVerdict.blocked){r.sources.push(retain(dir,task,s,'existing_order_list_checkpoint'));r.status='preexisting_unpaid_order_no_new_order';continue;}baselineRows=s.orderRows;save('baseline_recorded',{baselineUrl:s.url,baselineAt:new Date().toISOString(),orderUrl:null,orderId:null});
   s=await menu(tab,menus.plans,['购买订阅','购买套餐','购买服务','商店','订阅']);const inline=await actionButton(tab,['立即下单']);const inlineCreate=inline&&/点击下单后将创建订单/.test(s.text);let sub=tab.playwright.getByRole('button',{name:'立即订阅',exact:true});if(await sub.count()===0){try{await tab.playwright.getByText('立即订阅',{exact:true}).first().waitFor({state:'visible',timeoutMs:6000});}catch{}}if(await sub.count()===0)sub=tab.playwright.getByText('立即订阅',{exact:true});if(await sub.count()===0)sub=tab.playwright.getByRole('button',{name:'立即购买',exact:true});if(await sub.count()===0)sub=tab.playwright.getByRole('button',{name:'查看并订阅',exact:true});if(await sub.count()===0)sub=tab.playwright.getByRole('button',{name:'立即订阅此套餐',exact:true});if(await sub.count()===0&&task.theme==='bywave_wallet_bills')sub=tab.playwright.getByRole('button',{name:'购买',exact:true});if(!inlineCreate&&await sub.count()===0){r.status='unsupported_plan_selector';r.observedPlanButtons=s.buttons;continue;}
   ensureOwned(s,task);
   if(task.configurationOnly&&inlineCreate){r.status='direct_creation_not_allowed_in_configuration_only_mode';continue;}
   if(task.planHeading){const named=await namedPlanSubscription(tab,task);if(!named){r.status='named_plan_scope_not_confirmed';continue;}sub=named;}else if(/补单专用|请勿拍|请勿购买/.test(s.text)){r.status='reserved_product_present_requires_named_plan';continue;}
   // On this tested theme card action opens configuration; no payment control is ever clicked.
   let down=inlineCreate?inline:null;if(!inlineCreate){await requireCurrentRoute(tab,s);save('card_action_dispatched_possible_order',{cleanupRequired:true});await sub.first().click();s=await settle(tab);if(s.orderId){rememberOrder(s);throw Error('card_action_created_order_requires_cleanup');}down=await actionButton(tab,['下单','提交订单']);}if(!down){try{await tab.playwright.getByRole('button',{name:/下单$/}).first().waitFor({state:'visible',timeoutMs:8000});}catch{}down=await actionButton(tab,['下单','提交订单']);}if(!down&&task.theme==='sanfen_config_then_order'){s=await observe(tab);s.radioGroupObserved=await tab.playwright.getByRole('radiogroup').count()===1;const next=configurationCreateDecision(s,task.theme);if(next){down=await actionButton(tab,[next.label.replace(/\s/g,'')]);r.configurationNext=next;}}s=await observe(tab);ensureOwned(s,task);
   if(created&&s.orderId){rememberOrder(s);throw Error('card_action_created_order_requires_cleanup');}
   if(!down||await down.count()!==1||!await down.isVisible()||s.orderId||E.classify(s)!=='content_observed'||s.buttons.some(label=>/^(关闭订单|取消订单|close order)$/i.test(label.trim())))throw Error('card_action_state_requires_inspection');
   save('configuration_observed_no_order_yet',{cleanupRequired:false});
   if(task.configurationOnly){r.sources.push(retain(dir,task,s,'unpaid_order_configuration'));r.status='configuration_preview_observed_no_order_created';continue;}
   if(/我已阅读|同意.*条款|agree.*terms/i.test(s.text)||s.agreementCheckbox){r.sources.push(retain(dir,task,s,'unpaid_order_configuration'));r.status='requires_terms_confirmation';continue;}
   let amount=r.configurationNext?[r.configurationNext.label,String(r.configurationNext.amount)]:s.text.match(/总计\s*[¥￥]?\s*([\d.]+)\s*CNY/i)||s.text.match(/(?:应付金额|总计|基础金额)\s*[:：]?\s*[¥￥]\s*([\d.]+)/);if(!amount||!(Number(amount[1])>0)){try{await tab.playwright.getByRole('heading',{name:/^[¥￥]\s*(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)\s*CNY$/}).waitFor({state:'visible',timeoutMs:8000});}catch{}s=await settle(tab);ensureOwned(s,task);amount=s.text.match(/总计\s*[¥￥]?\s*([\d.]+)\s*CNY/i)||s.text.match(/(?:应付金额|总计|基础金额)\s*[:：]?\s*[¥￥]\s*([\d.]+)/);}if(!amount||!(Number(amount[1])>0)){r.sources.push(retain(dir,task,s,'configuration_total_unconfirmed'));r.status='positive_payable_total_not_confirmed';continue;}
   r.sources.push(retain(dir,task,s,'unpaid_order_configuration'));await requireCurrentRoute(tab,s);save('create_dispatched_cleanup_required',{cleanupRequired:true});await down.click();
   if(!await actionButton(tab,['关闭订单','取消订单','closeorder'])){try{await tab.playwright.getByRole('button',{name:/^(关闭订单|取消订单|close order)$/i}).first().waitFor({state:'visible',timeoutMs:15000});}catch{}}
   s=await settle(tab);rememberOrder(s);const entry=journal[task.taskId];
   // Follow only a visible same-origin cashier navigation link; never activate a payment button.
   const controls=await tab.playwright.evaluate(inspectPaymentControls);r.cashierPreview=cashierPreviewDecision(s,controls,{allowUnconfiguredCheckout:task.cashierPreviewMode==='unconfigured_zero_balance_checkout',zeroWalletConfirmed:r.zeroWalletObserved,allowDeferredSettlement:task.cashierPreviewMode==='explicit_deferred_settlement'});if(r.cashierPreview.url)r.cashierPreview.url=publicOrderUrl(r.cashierPreview.url,entry.orderId);s.paymentControls=controls.map(c=>({...c,href:c.href?publicOrderUrl(c.href,entry.orderId):null}));
   if(r.cashierPreview.allowed){r.sources.push(retain(dir,task,s,'unpaid_order_before_cashier_navigation'));const previewControl=r.cashierPreview.role==='button'?await actionButton(tab,[r.cashierPreview.label]):tab.playwright.getByRole('link',{name:r.cashierPreview.label,exact:true});if(!previewControl)throw Error('cashier_preview_control_not_unique');await navigateCashierPreview(tab,previewControl);try{s=await settle(tab);}catch(error){if(!/Runtime.evaluate|context.*destroyed|navigation/i.test(String(error.message)))throw error;try{await tab.playwright.waitForLoadState({state:'domcontentloaded',timeoutMs:8000});}catch{}s=await observe(tab);}if(!E.safeUrl(s.url))throw Error('unsafe_cashier_navigation');if(E.classify(s)!=='content_observed')r.cashierPreview.blockedAt=E.classify(s);}
   // Save payment evidence before cancellation; do not select or activate payment.
   s.visiblePaymentImages=await tab.playwright.evaluate(()=>[...document.querySelectorAll('img')].filter(e=>e.getClientRects().length).map(e=>({alt:e.alt,title:e.title,src:e.src.split('?')[0]})).filter(e=>/pay|alipay|wechat|支付宝|微信|usdt/i.test(e.alt+' '+e.title+' '+e.src)));
   const names=paymentNames(s.text);r.methods=names;r.sources.push(retain(dir,task,s,'unpaid_order_payment_methods',entry.orderId));
   const paymentClip=await tab.playwright.evaluate(()=>{const e=[...document.querySelectorAll('h1,h2,h3,h4,h5')].find(e=>/支付方式|付款方式/.test(e.innerText));if(!e)return null;const r=e.getBoundingClientRect();return{x:Math.max(0,r.x-8),y:Math.max(0,r.y-8),width:Math.max(1,Math.min(600,innerWidth-r.x-8)),height:Math.max(1,Math.min(270,innerHeight-r.y-8))};});
   if(paymentClip){const file='payment-'+task.taskId+'.png';fs.writeFileSync(path.join(dir,file),await tab.screenshot({clip:paymentClip}));r.paymentScreenshot=file;}
   if(r.cashierPreview.allowed){await tab.goto(entry.orderUrl);s=await settle(tab);}
   if(!exactOrderCancelled(s,entry))await cancelExactOrder(tab,s,entry,task);
   s=await verifyOrderCleanup(tab,entry,task);
   r.cancellationSource=retain(dir,task,s,'cancelled_order_terminal_state',entry.orderId);
   r.cancelledVerified=true;r.paymentExecuted=false;r.status=names.length?'payment_observed_order_cancelled':'order_cancelled_no_named_channels';
  }catch(error){r.status=created?'cleanup_required':'adapter_or_access_error';r.errors.push(redactOrderText(error.message,journal[task.taskId]?.orderId).slice(0,400));}
  finally{
   r.finishedAt=new Date().toISOString();if(created&&!r.cancelledVerified)r.handoffTabId=tab?.id;
   state.results[task.taskId]=r;
   try{
    write(path.join(dir,'state.json'),state);
    if(r.cancelledVerified)save('cancelled_verified',{cleanupRequired:false});
   }finally{if(tab)try{if(created)await tab.markHandoff();else await tab.close();}catch{}}
   onProgress({recordIds:r.recordIds,status:r.status,methods:r.methods||[],cancelled:r.cancelledVerified||false});processed++;
  }
  if(Object.values(journal).some(entry=>entry.cleanupRequired))break;
 }
 return{processed,remaining:plan.tasks.length-Object.keys(state.results).length,cleanupRequired:Object.values(journal).some(x=>x.cleanupRequired)};
}

// Recovery only touches orders recorded in this run's private lifecycle journal.
// It cannot create orders, select a payment method, or execute payment.
export async function resumeUnpaidCleanup({browser,runId}){
 const dir=dirFor(runId),jf=path.join(dir,'unpaid-lifecycle-private.json');if(!fs.existsSync(jf))return{cleanupRequired:false,recovered:0};
 const journal=read(jf),state=read(path.join(dir,'state.json')),plan=read(path.join(dir,'plan.json'));let recovered=0;
 for(const [taskId,j]of Object.entries(journal).filter(([,j])=>j.cleanupRequired)){
  if(plan.tasks.find(t=>t.taskId===taskId)?.theme==='ofo_native_checkout'){const result=await(await import('./ofo-unpaid.mjs')).resumeOfoCleanup({browser,runId,taskId});Object.assign(state,read(path.join(dir,'state.json')));Object.assign(journal,read(jf));write(jf,journal);recovered+=result.recovered||0;if(result.cleanupRequired)return{cleanupRequired:true,recovered};continue;}
  const task=plan.tasks.find(t=>t.taskId===taskId),r=state.results[taskId]||{taskId,recordIds:task?.recordIds,sources:[],errors:[]};
  let tab,entry,verified=false;
  try{
   if(!task||!j.orderUrl)throw Error('cleanup_recorded_order_url_required');
   ensureOwned({url:j.orderUrl},task);
   const orderId=j.orderId??orderIdFromUrl(j.orderUrl);
   if(typeof orderId!=='string'||!orderIdPattern.test(orderId)||sameBusinessRoute(j.orderUrl,j.baselineUrl))throw Error('cleanup_recorded_order_identity_required');
   const baselineUrl=sameBusinessRoute(j.baselineUrl,j.baselineUrl)&&new URL(j.baselineUrl).origin===new URL(j.orderUrl).origin?j.baselineUrl:null;
   entry={...j,baselineUrl,orderId};
   tab=await browser.tabs.new();await tab.goto(j.orderUrl);
   let s=await settle(tab);ensureOwned(s,task);
   if(!exactOrderCancelled(s,entry)){
    await cancelExactOrder(tab,s,entry,task);
    s=await verifyOrderCleanup(tab,entry,task);
   }
   r.cancellationSource=retain(dir,task,s,'cancelled_order_terminal_state',orderId);
   r.cancelledVerified=true;r.paymentExecuted=false;r.status=r.methods?.length?'payment_observed_order_cancelled':'cleanup_cancelled_verified';r.finishedAt=new Date().toISOString();delete r.handoffTabId;
   verified=true;
  }catch(error){r.status='cleanup_required';r.cancelledVerified=false;r.errors??=[];r.errors.push(redactOrderText(error.message,entry?.orderId||j.orderId).slice(0,300));}
  finally{
   if(tab)try{await tab.close();}catch{}
   state.results[taskId]=r;write(path.join(dir,'state.json'),state);
   if(verified){
    const closed={...j,orderId:entry.orderId,cleanupRequired:false,phase:'cancelled_verified',at:r.finishedAt};
    write(jf,{...read(jf),[taskId]:closed});journal[taskId]=closed;recovered++;
   }
  }
 }
 return{cleanupRequired:Object.values(journal).some(j=>j.cleanupRequired),recovered};
}
