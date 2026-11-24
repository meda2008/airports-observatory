import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://mkrused.v2saat.club';
export async function captureRabbitPriceView(tab,selectedFilter){
 const s=await readRenderedDocument(tab);if(new URL(s.url).origin!==origin||new URL(s.url).hash!=='#/plans')throw Error('rabbit_price_route_changed');
 const planCards=await tab.playwright.getByRole('heading').filter({hasText:/^唯兔云 · /}).evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{let p=e.parentElement;while(p&&!(p.querySelectorAll('h3').length===1&&p.querySelectorAll('button').length===1))p=p.parentElement;if(!p)throw Error('rabbit_card_ambiguous');return{name:e.innerText,text:p.innerText,headingCount:p.querySelectorAll('h3').length,buttonLabel:p.querySelector('button').innerText};}));
 return{...s,selectedFilter,planCards,orderSubmitted:false,paymentExecuted:false};
}
export async function collectRabbitPrices(tab,{onCapture}={}){
 const before=await readRenderedDocument(tab);if(new URL(before.url).origin!==origin)throw Error('rabbit_origin_changed');if(before.passwordForm||/验证提醒|访问验证/.test(before.text))return{status:'authentication_or_entry_checkpoint',captures:[before],newOrdersCreated:0,paymentExecuted:false};
 if(new URL(before.url).hash!=='#/plans'){const l=before.links.find(l=>new URL(l.url).origin===origin&&new URL(l.url).hash==='#/plans');if(!l)throw Error('rabbit_native_plans_link_missing');await tab.goto(l.url);}
 await tab.playwright.getByRole('heading',{name:'选择您的订阅计划',exact:true}).waitFor({state:'visible',timeoutMs:12000});const captures=[];
 for(const [filter,marker]of [['全部',/^\/一次性$/],['按季',/^\/季$/],['按半年',/^\/半年$/],['按年',/^\/年$/]]){await tab.playwright.getByRole('button',{name:filter,exact:true}).click();await tab.playwright.getByText(marker).first().waitFor({state:'visible',timeoutMs:12000});const captured=await captureRabbitPriceView(tab,filter);captures.push(captured);if(onCapture)await onCapture(captured);}
 return{status:'read_only_current_card_prices_captured',captures,newOrdersCreated:0,paymentExecuted:false,longPeriodConfigurationOpened:false};
}
