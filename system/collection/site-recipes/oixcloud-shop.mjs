import {readRenderedDocument} from '../visible-document.mjs';
export function inspectOixCounterSelection(){
 const visible=e=>!!e.getClientRects().length,names=['支付宝','微信','USDT (TRC20)','USDT (Polygon)','USDT (BSC)'];
 const buttons=[...document.querySelectorAll('button')].filter(visible),selected=buttons.filter(e=>names.includes(e.innerText.trim())&&e.getAttribute('aria-pressed')==='true'),actions=buttons.filter(e=>/^(支付|创建订单)$/.test(e.innerText.trim()));
 return{selectedMethod:selected.length===1?selected[0].innerText.trim():null,orderActionDisabled:actions.length===1&&actions[0].disabled===true};
}
export async function collectOixReadOnly(tab){
 const u=new URL(await tab.url());if(u.origin!=='https://oixcloud.com')return null;
 if(u.pathname==='/user/shop')return collectOixVisibleShop(tab);
 if(['/tos','/privacy_policy'].includes(u.pathname))return{captures:[await readRenderedDocument(tab)],newOrdersCreated:0,paymentExecuted:false};
 if(u.pathname!=='/user/v2/counter')return null;
 const captures=[];for(const name of ['支付宝','微信','USDT (TRC20)','USDT (Polygon)','USDT (BSC)']){
  let doc=await readRenderedDocument(tab),selection=await tab.playwright.evaluate(inspectOixCounterSelection);
  if(!selection.orderActionDisabled)throw Error('oix_counter_requires_disabled_order_action');
  if(selection.selectedMethod!==name){await tab.playwright.getByRole('button',{name,exact:true}).click();doc=await readRenderedDocument(tab);selection=await tab.playwright.evaluate(inspectOixCounterSelection);}
  if(selection.selectedMethod!==name||!selection.orderActionDisabled)throw Error('oix_counter_selection_not_ready');
  captures.push({...doc,...selection,captureKind:'oix_counter_methods_and_selected_fee_v1'});
 }
 return{captures,newOrdersCreated:0,paymentExecuted:false};
}
export async function collectOixVisibleShop(tab){
 const url=await tab.url(),u=new URL(url);if(u.origin!=='https://oixcloud.com'||u.pathname!=='/user/shop')return null;
 const cny=tab.playwright.getByRole('button',{name:'CNY',exact:true}).filter({visible:true});
 if(await cny.count()===1&&await cny.getAttribute('aria-pressed')==='false')await cny.click();
 const billingSelection=await tab.playwright.evaluate(()=>{const visible=e=>!!e.getClientRects().length,cs=[...document.querySelectorAll('button[data-currency][aria-pressed="true"]')].filter(visible),ps=[...document.querySelectorAll('button[data-period][aria-pressed="true"]')].filter(visible),periods={monthly:'月付',quarterly:'季付',semiannually:'半年付',yearly:'年付'};if(cs.length!==1||cs[0].dataset.currency!=='CNY'||ps.length!==1||!periods[ps[0].dataset.period])return null;return{scope:'visible_global_aria_pressed',label:ps[0].innerText.trim(),period:periods[ps[0].dataset.period],currency:'CNY'};});
 const panels=tab.playwright.getByRole('tabpanel').filter({visible:true});if(await panels.count()!==1)throw Error('oix_visible_panel_not_unique');
 let cards=await panels.getByRole('article').evaluateAll(es=>es.map(e=>({name:e.querySelector('h2')?.innerText,text:e.innerText,selectedPeriod:[...e.querySelectorAll('button[aria-pressed="true"]')].map(b=>b.innerText)})));
 if(billingSelection)cards=cards.map(c=>({...c,selectedPeriod:c.selectedPeriod.length?c.selectedPeriod:[billingSelection.period]}));
 const doc=await readRenderedDocument(tab);if(doc.url!==url)throw Error('oix_shop_route_changed');
 return{origin:u.origin,captures:[{...doc,captureKind:'oix_visible_selected_period_cards_v1',cards,billingSelection}],newOrdersCreated:0,paymentExecuted:false};
}
