import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://www.x-air.org';
function isPaymentUrl(value){const u=new URL(value);return u.origin===origin&&/^\/payment\/(?:[^/?#]+)?\/?$/.test(u.pathname);}
export function inspectXAirPaymentImages(){
 const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();if(!e.getClientRects().length||r.width<=0||r.height<=0)return false;for(let p=e;p;p=p.parentElement){const style=getComputedStyle(p);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;}return true;};
 // X-Air wraps block-level LI items in zero-area inline anchors. The visible image
 // and ancestor styles establish visibility; anchor geometry must not hide the image.
 return[...document.querySelectorAll('a[href="#pay"] img')].map(img=>{const a=img.closest('a[href]');let srcPath=null;try{const u=new URL(img.currentSrc||img.getAttribute('src'),location.href);if(u.origin===location.origin&&!u.search&&!u.hash)srcPath=u.pathname;}catch{}return{href:a?.getAttribute('href')||'',srcPath,alt:img.getAttribute('alt')||'',visible:visible(img)&&!!a,loaded:img.complete===true&&img.naturalWidth>0&&img.naturalHeight>0};});
}
export async function collectXAirPaymentImages(tab){
 const beforeUrl=await tab.url();if(!isPaymentUrl(beforeUrl))return null;
 const source=await readRenderedDocument(tab);if(!isPaymentUrl(source.url)||source.url!==beforeUrl||!source.text.includes('X-Air Digital Airport')||!/订单状态:\s*待支付/.test(source.text)||!source.text.includes('请选择您的支付方式')||source.passwordForm||source.verificationWidgetObserved)throw Error('xair_cashier_context_required');
 const paymentImageControls=await tab.playwright.evaluate(inspectXAirPaymentImages);if(await tab.url()!==beforeUrl)throw Error('xair_cashier_route_changed_during_image_observation');
 const capture={...source,url:origin+'/payment/',text:source.text.replace(/订单编号[:：]\s*[^\r\n]+/g,'订单编号: [order identifier redacted]'),links:[],capturedAt:new Date().toISOString(),actualOrderUrlWithheld:true,paymentImageControls,observedCaptureKind:'xair_visible_cashier_image_controls_v1',transactionVerified:false};
 return{origin,captures:[capture],configurationOnly:true,newOrdersCreated:0,paymentExecuted:false,cancellationExecuted:false,cleanupStatus:'pending',duplicateOrderBlocked:true};
}
export async function collectXAirReadOnly(tab){
 const u=new URL(await tab.url());if(u.origin!==origin)return null;
 if(u.pathname==='/user/goodsList'){const source=await readRenderedDocument(tab);if(new URL(source.url).origin!==origin||new URL(source.url).pathname!=='/user/goodsList')throw Error('xair_goods_route_changed');return{origin,captures:[source],configurationOnly:true,newOrdersCreated:0,paymentExecuted:false,cancellationExecuted:false};}
 return collectXAirPaymentImages(tab);
}
