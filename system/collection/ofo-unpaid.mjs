import fs from 'node:fs';
import path from 'node:path';
import {inspectDocument} from './browser-driver.mjs';
import {retain,actionButton,paymentNames} from './unpaid-orders.mjs';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,x)=>{fs.writeFileSync(f+'.tmp',JSON.stringify(x,null,2));fs.renameSync(f+'.tmp',f);};
const observe=async tab=>({...await tab.playwright.evaluate(inspectDocument),url:await tab.url()});
const owned=url=>{if(new URL(url).origin!=='https://ofosg.com')throw Error('Unconfirmed ofo origin');};
export function prepareOfoOrderPlan(o){
 if(o.scope.length!==1||o.scope[0]!=='A040'||!o.createUnpaidAllowed||o.paymentAllowed)throw Error('Explicit A040 unpaid authority required');
 const runId=o.runId+'-orders',dir=path.join(root,'work/collection-runs',runId);fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(path.join(dir,'plan.json'))){
  write(path.join(dir,'plan.json'),{runId,records:[{recordId:'A040'}],tasks:[{taskId:'ofo-native-checkout',recordIds:['A040'],entryUrl:'https://ofosg.com/shop',allowedHosts:['ofosg.com'],theme:'ofo_native_checkout'}],unpaidOrderAuthorization:{createUnpaidAllowed:true,paymentAllowed:false}});
  write(path.join(dir,'state.json'),{runId,results:{},discovery:{}});
 }
 return runId;
}
async function cancelOfo(tab,dir,task,result,journal){
 await tab.goto('https://ofosg.com/my_order');
 await tab.playwright.getByRole('heading',{name:'我的订单',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const recordedId=new URL(journal.orderUrl||journal.baselineUrl).searchParams.get('order');
 if(recordedId){const closed=tab.playwright.getByRole('row').filter({hasText:/已取消|已关闭/}).filter({hasText:recordedId});if(await closed.count()===1){result.cancellationSource=retain(dir,task,await observe(tab),'cancelled_order_terminal_state');result.cancelledVerified=true;result.paymentExecuted=false;result.status='payment_observed_order_cancelled';journal.cleanupRequired=false;journal.phase='cancelled_verified';journal.at=result.cancellationSource.capturedAt;return;}}
 let rows=tab.playwright.getByRole('row').filter({hasText:/未支付|待支付/});if(recordedId)rows=rows.filter({hasText:recordedId});
 try{await rows.first().waitFor({state:'visible',timeoutMs:12000});}catch{}
 if(await rows.count()!==1)throw Error('Exactly one new unpaid row required');
 const row=rows.first();let close=await actionButton(row,['取消','取消订单','关闭订单']);
 if(!close){
  const links=await row.locator('a[href]').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({url:e.href,label:e.innerText.trim()})));
  const detail=links.filter(l=>new URL(l.url).origin==='https://ofosg.com'&&/查看|详情|支付|继续/.test(l.label)&&!l.url.includes('javascript:'));
  if(detail.length!==1)throw Error('Unique native order detail link required');
  journal.orderUrl=detail[0].url;write(path.join(dir,'unpaid-lifecycle-private.json'),{[task.taskId]:journal});
  await tab.goto(detail[0].url);owned(await tab.url());
  const ready=tab.playwright.getByText(/取消订单|关闭订单/);try{await ready.first().waitFor({state:'visible',timeoutMs:10000});}catch{}
  close=await actionButton(tab,['取消','取消订单','关闭订单']);
  if(!close){const native=tab.playwright.getByText('关闭订单',{exact:true});if(await native.count()===1&&await native.evaluate(e=>e.tagName==='A'&&e.classList.contains('btn')&&!e.hasAttribute('href'))&&await tab.playwright.getByRole('heading',{name:'未支付',exact:true}).count()===1)close=native;}
 }
 if(!close)throw Error('Cancellation control unavailable');
 await close.click();await tab.getAXState({emit:false});
 const dialog=await tab.getJsDialog();if(dialog?.type==='confirm')await dialog.accept();
 let modal=tab.playwright.getByRole('dialog');if(await modal.count()===0)modal=tab.playwright.getByRole('alertdialog');
 if(await modal.count()===1){const confirm=await actionButton(modal,['确定','确认','确认取消','取消订单','是的，取消']);if(!confirm)throw Error('Unique cancellation confirmation required');await confirm.click();}
 await tab.goto('https://ofosg.com/my_order');
 await tab.playwright.getByRole('heading',{name:'我的订单',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const finalId=new URL(journal.orderUrl).searchParams.get('order');let cancelled=tab.playwright.getByRole('row').filter({hasText:/已取消|已关闭/});if(finalId)cancelled=cancelled.filter({hasText:finalId});await cancelled.first().waitFor({state:'visible',timeoutMs:12000});
 let pending=tab.playwright.getByRole('row').filter({hasText:/未支付|待支付/});if(finalId)pending=pending.filter({hasText:finalId});if(await pending.count())throw Error('Unpaid row remains');
 const snapshot=await observe(tab);result.cancellationSource=retain(dir,task,snapshot,'cancelled_order_terminal_state');
 result.cancelledVerified=true;result.paymentExecuted=false;result.status='payment_observed_order_cancelled';
 journal.cleanupRequired=false;journal.phase='cancelled_verified';journal.at=result.cancellationSource.capturedAt;
}
export async function runOfoUnpaidChunk({browser,runId,taskId}){
 const dir=path.join(root,'work/collection-runs',runId),plan=read(path.join(dir,'plan.json')),state=read(path.join(dir,'state.json')),task=plan.tasks.find(t=>taskId?t.taskId===taskId:t.theme==='ofo_native_checkout');if(!task||task.recordIds?.length!==1||task.recordIds[0]!=='A040'||task.theme!=='ofo_native_checkout')throw Error('Native ofo task missing or out of scope');if(plan.unpaidOrderAuthorization?.createUnpaidAllowed!==true||plan.unpaidOrderAuthorization?.paymentAllowed!==false)throw Error('Explicit unpaid-only authority required');
 if(state.results[task.taskId]?.cancelledVerified)return{processed:0,remaining:0,cleanupRequired:false};
 const jf=path.join(dir,'unpaid-lifecycle-private.json');let journal=fs.existsSync(jf)?read(jf)[task.taskId]:null;
 let tab;const result=state.results[task.taskId]||{taskId:task.taskId,recordIds:task.recordIds,sources:[],errors:[],startedAt:new Date().toISOString()};
 try{
  if(!journal?.cleanupRequired){
   const catalog=read(path.join(root,'public-site/data/public-catalog.json'));if(catalog.items.find(r=>r.id==='A040').coreInfo.payment.methods.length)throw Error('Payment already filled; no duplicate order');
   tab=await browser.tabs.new();await tab.goto('https://ofosg.com/dashboard');
   await tab.playwright.getByRole('heading',{name:'钱包余额',exact:true}).waitFor({state:'visible',timeoutMs:12000});
   const balance=await tab.playwright.getByRole('heading',{name:'钱包余额',exact:true}).evaluate(e=>e.parentElement.innerText);
   if(!/^钱包余额\s*0(?:\.0+)?\s*CNY/.test(balance.trim()))throw Error('Explicit zero wallet required');result.zeroWalletObserved=true;
   await tab.goto('https://ofosg.com/my_order');await tab.playwright.getByRole('heading',{name:'我的订单',exact:true}).waitFor({state:'visible',timeoutMs:12000});
   if(await tab.playwright.getByRole('row').filter({hasText:/未支付|待支付/}).count())throw Error('Preexisting unpaid order; no creation');
   journal={baselineUrl:await tab.url(),baselineAt:new Date().toISOString(),cleanupRequired:false};
   await tab.goto(task.entryUrl);await tab.playwright.getByRole('heading',{name:'商店',exact:true}).waitFor({state:'visible',timeoutMs:12000});
   result.sources.push(retain(dir,task,await observe(tab),'authenticated_shop_terms'));
   const link=tab.playwright.getByRole('link',{name:/立即购买/}).first(),href=await link.getAttribute('href');const target=new URL(href,await tab.url());owned(target.href);if(target.pathname!=='/checkout')throw Error('Checkout configuration URL required');
   await tab.goto(target.href);await tab.playwright.getByRole('heading',{name:'结账',exact:true}).waitFor({state:'visible',timeoutMs:12000});
   const snapshot=await observe(tab);if(snapshot.agreementCheckbox||snapshot.verificationWidgetObserved||snapshot.passwordForm||/免密|自动扣款|已绑定|余额支付|card number/i.test(snapshot.text))throw Error('Unsafe checkout configuration');
   if(!await tab.playwright.getByRole('radio',{name:'微信',exact:true}).evaluate(e=>e.checked))throw Error('Expected external WeChat method not selected');
   if(!/合计:\s*¥\s*[1-9]\d*(?:\.\d+)?\s*CNY/.test(snapshot.text))throw Error('Positive configuration total required');
   result.sources.push(retain(dir,task,snapshot,'unpaid_order_configuration'));result.methods=paymentNames(snapshot.text);
   if(!result.methods.length)throw Error('Explicit method labels required');
   const create=await actionButton(tab,['结账']);if(!create)throw Error('Unique checkout action required');
   journal.cleanupRequired=true;journal.phase='create_dispatched_cleanup_required';journal.orderUrl='https://ofosg.com/my_order';write(jf,{[task.taskId]:journal});write(path.join(dir,'state.json'),{...state,results:{...state.results,[task.taskId]:result}});
   await create.click();await tab.getAXState({emit:false});
  }else tab=await browser.tabs.new();
  await cancelOfo(tab,dir,task,result,journal);
 }catch(error){result.status=journal?.cleanupRequired?'cleanup_required':'preflight_blocked';result.errors.push(String(error.message).slice(0,400));}
 finally{
  result.finishedAt=new Date().toISOString();state.results[task.taskId]=result;write(path.join(dir,'state.json'),state);if(journal)write(jf,{[task.taskId]:journal});
  if(tab){if(journal?.cleanupRequired){result.handoffTabId=tab.id;write(path.join(dir,'state.json'),state);await tab.markHandoff();}else await tab.close();}
 }
 return{processed:1,remaining:0,cleanupRequired:journal?.cleanupRequired===true};
}
export async function resumeOfoCleanup(args){const dir=path.join(root,'work/collection-runs',args.runId),jf=path.join(dir,'unpaid-lifecycle-private.json'),task=read(path.join(dir,'plan.json')).tasks.find(t=>args.taskId?t.taskId===args.taskId:t.theme==='ofo_native_checkout');if(!task||!fs.existsSync(jf)||!read(jf)[task.taskId]?.cleanupRequired)return{cleanupRequired:false};const result=await runOfoUnpaidChunk(args);return{...result,recovered:result.cleanupRequired?0:1};}
