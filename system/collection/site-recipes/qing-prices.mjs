import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://a32.qytaff03.cc';
export async function collectQingPrices(tab){
 const before=await readRenderedDocument(tab);if(new URL(before.url).origin!==origin)throw Error('qing_price_origin_changed');if(before.passwordForm||/访问验证|正在进行安全验证/.test(before.text))return{status:'authentication_or_entry_checkpoint',captures:[before],newOrdersCreated:0,paymentExecuted:false};
 if(new URL(before.url).pathname!=='/shop'){const native=before.links.find(l=>new URL(l.url).origin===origin&&new URL(l.url).pathname==='/shop');if(!native)throw Error('qing_native_shop_link_missing');await tab.goto(native.url);}
 await tab.playwright.getByRole('heading',{name:'青云·VIP1',exact:true}).waitFor({state:'visible',timeoutMs:12000});const shop=await readRenderedDocument(tab),links=shop.links.filter(l=>new URL(l.url).origin===origin&&new URL(l.url).pathname==='/checkout');
 if(links.length!==6||!['25','15','18','21','27','28'].every(id=>links.some(l=>new URL(l.url).searchParams.get('id')===id)))throw Error('qing_catalog_changed');const captures=[shop];
 for(const l of links){if(new URL(l.url).searchParams.get('id')==='28')continue;await tab.goto(l.url);await tab.playwright.getByRole('heading',{name:'订阅方式',exact:true}).waitFor({state:'visible',timeoutMs:12000});const s=await readRenderedDocument(tab);if(/订单编号|支付状态.*待支付/.test(s.text))throw Error('qing_unexpected_order_state');const periodOptions=await tab.playwright.getByRole('radio').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({label:e.labels?[...e.labels].map(x=>x.innerText).join(' '):e.getAttribute('aria-label')||'',checked:e.checked})));captures.push({...s,periodOptions,orderSubmitted:false,paymentExecuted:false});}
 return{status:'read_only_configuration_prices_captured',captures,newOrdersCreated:0,paymentExecuted:false};
}
