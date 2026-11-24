import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://forest-01.com';
export async function dismissForestNetworkNotice(tab){
 const dialog=tab.playwright.getByRole('dialog',{name:'网络波动公告',exact:true});if(await dialog.count()===0)return false;
 const text=await dialog.evaluate(e=>e.innerText);if(!text.includes('10月26日—29日')||/同意|接受|条款|退款|充值|支付/.test(text))throw Error('forest_notice_not_confirmed_nonbinding');
 const close=dialog.getByRole('button',{name:'Close',exact:true});if(await close.count()!==1)throw Error('forest_notice_close_not_unique');await close.click();await dialog.waitFor({state:'hidden',timeoutMs:10000});return true;
}
export function inspectForestPaymentOptions(es){return es.map(e=>({label:e.getAttribute('aria-label')||e.closest('label')?.innerText?.trim()||e.innerText.trim(),checked:e.getAttribute('aria-checked')==='true'||e.checked===true}));}
export async function collectForestWalletPreview(tab){
 if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/profile')throw Error('forest_profile_route_required');
 await dismissForestNetworkNotice(tab);const profile=await readRenderedDocument(tab);if(!profile.authenticationObserved||profile.passwordForm||!profile.text.includes('账户余额:'))throw Error('forest_authenticated_profile_required');
 const dialog=tab.playwright.getByRole('dialog',{name:'余额充值',exact:true});
 if(await dialog.count()===0){await tab.playwright.getByRole('button',{name:'余额充值',exact:true}).click();await tab.getAXState?.({emit:false});}
 let captured;try{await dialog.waitFor({state:'visible',timeoutMs:12000});await dialog.getByRole('radio').nth(4).waitFor({state:'visible',timeoutMs:12000});const source=await readRenderedDocument(tab),paymentOptions=await dialog.getByRole('radio').evaluateAll(inspectForestPaymentOptions);if(paymentOptions.length!==5)throw Error('forest_wallet_options_changed');captured={...source,walletPreview:true,paymentOptions,dialogText:await dialog.evaluate(e=>e.innerText),paymentActionClicked:false,amountEntered:false};}finally{if(await dialog.count()===1&&await dialog.isVisible()){const cancel=dialog.getByRole('button',{name:'取消',exact:true});await cancel.click();await dialog.waitFor({state:'hidden',timeoutMs:10000});}}
 return{origin,captures:[captured],configurationOnly:true,previewClosed:true,newOrdersCreated:0,paymentExecuted:false};
}
export function inspectForestPlans(){
 const visible=e=>!!e.getClientRects().length;
 const tabs=[...document.querySelectorAll('[role="tab"]')].filter(visible),selected=tabs.filter(t=>t.getAttribute('aria-selected')==='true');
 const panels=[...document.querySelectorAll('[role="tabpanel"]')].filter(visible);
 return{selectedTab:selected.length===1?selected[0].innerText.trim():null,panelCount:panels.length,planCards:panels.flatMap(p=>[...p.querySelectorAll('h2')].filter(visible).map(h=>({name:h.innerText.trim(),text:h.parentElement?.parentElement?.innerText||'',headingCount:h.parentElement?.parentElement?.querySelectorAll('h2').length}))),purchaseActionObserved:[...document.querySelectorAll('button')].filter(visible).some(b=>b.innerText.trim()==='登录后购买')};
}
export function inspectForestSelection(){
 const visible=e=>!!e.getClientRects().length,selected=[...document.querySelectorAll('input[type="radio"]')].filter(e=>visible(e)&&e.checked).map(e=>({value:e.value,label:[...(e.labels||[])].map(l=>l.innerText.trim()).join(' ')})),products=selected.filter(x=>/^\d+$/.test(x.value)),periods=selected.filter(x=>['month_price','onetime_price'].includes(x.value)),buy=[...document.querySelectorAll('button')].filter(e=>visible(e)&&/^¥\d+(?:\.\d{1,2})? 立即购买$/.test(e.innerText.trim()));
 if(products.length!==1||periods.length!==1||buy.length!==1)return null;
 return{productName:products[0].label.split('\n')[0],productLabel:products[0].label,period:periods[0].value==='month_price'?'月付':'一次性',periodLabel:periods[0].label,priceText:buy[0].innerText.trim(),selectedProductCount:1,selectedPeriodCount:1,purchaseClicked:false};
}
export async function readForestPlans(tab,label){
 if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/plan')throw Error('forest_plan_route_required');
 const pane=tab.playwright.getByRole('tabpanel',{name:label,exact:true});await pane.getByRole('heading',{name:label==='按周期购买'?'轻量':'不限时200G',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const s=await readRenderedDocument(tab),state=await tab.playwright.evaluate(inspectForestPlans),forestSelection=await tab.playwright.evaluate(inspectForestSelection);
 if(state.selectedTab!==label||state.panelCount!==1||state.planCards.length!==(label==='按周期购买'?3:1)||state.planCards.some(c=>c.headingCount!==1)||s.passwordForm||s.verificationWidgetObserved)throw Error('forest_plan_layout_or_selection_checkpoint');
 if(!forestSelection||!state.planCards.some(c=>c.name===forestSelection.productName))throw Error('forest_selected_price_not_bound');
 return{...s,...state,forestSelection,capturedAt:new Date().toISOString(),semanticLocation:{stage:'plan_tab',selectedTab:label},representation:'visible_plan_cards_and_selected_tab_not_hidden_application_state'};
}
export async function collectForestReadOnly(tab){
 let wallet=null;if(new URL(await tab.url()).origin===origin&&new URL(await tab.url()).pathname==='/profile'){wallet=await collectForestWalletPreview(tab);await tab.playwright.getByRole('link',{name:'充值',exact:true}).click();await tab.getAXState?.({emit:false});await tab.playwright.getByRole('tab',{name:'按周期购买',exact:true}).waitFor({state:'visible',timeoutMs:12000});}
 if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/plan')return null;
 const captures=[...(wallet?.captures||[])];
 for(const label of ['按周期购买','按流量购买']){
  const control=tab.playwright.getByRole('tab',{name:label,exact:true});await control.waitFor({state:'visible',timeoutMs:12000});
  if(await control.getAttribute('aria-selected')!=='true')await control.click();
  const names=label==='按周期购买'?['轻量','高级','旗舰']:['不限时200G'];for(const name of names){const radio=tab.playwright.getByRole('radio',{name:new RegExp('^'+name+'(?:\\s|$)')});if(await radio.count()!==1)throw Error('forest_product_radio_changed');await radio.check();if(label==='按周期购买'){const month=tab.playwright.getByRole('radio',{name:'月付',exact:true});if(await month.count()!==1)throw Error('forest_monthly_period_radio_changed');await month.check();}const source=await readForestPlans(tab,label);if(source.forestSelection.productName!==name||source.forestSelection.period!==(label==='按周期购买'?'月付':'一次性'))throw Error('forest_radio_selection_not_confirmed');captures.push(source);}
 }
 // The plan route omits the footer. Discover its policy link on the known
 // homepage rather than inventing a policy endpoint from a URL pattern.
 await tab.goto(origin+'/');const policyLink=tab.playwright.getByRole('link',{name:'网站政策',exact:true});await policyLink.waitFor({state:'visible',timeoutMs:12000});
 const home=await readRenderedDocument(tab);if(new URL(home.url).origin!==origin||!home.links.some(l=>l.url===origin+'/policy'))throw Error('forest_native_policy_link_missing');captures.push(home);
 await policyLink.click();await tab.playwright.getByRole('heading',{name:'ForestNetwork 服务条款',exact:true}).waitFor({state:'visible',timeoutMs:12000});
 const policy=await readRenderedDocument(tab);if(new URL(policy.url).origin!==origin||new URL(policy.url).pathname!=='/policy')throw Error('forest_policy_route_changed');captures.push(policy);
 if(wallet){await tab.goto(origin+'/help/renewal-rules');await tab.playwright.getByRole('heading',{name:'续费、升级或更换套餐会怎样计算？',exact:true}).waitFor({state:'visible',timeoutMs:12000});captures.push(await readRenderedDocument(tab));}
 return{origin,captures,configurationOnly:true,newOrdersCreated:0,paymentExecuted:false};
}
