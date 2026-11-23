import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://renzhe.cloud';
export function inspectRenzheCards(){return[...document.querySelectorAll('.pricing-plan-card')].filter(e=>e.getClientRects().length).map(e=>({name:e.querySelector('.pricing-title')?.innerText||null,section:e.closest('.shop-plan-section')?.querySelector('h2')?.innerText||null,text:e.innerText,accessibilityNotes:[...e.querySelectorAll('[aria-label]')].filter(n=>n.getClientRects().length).map(n=>n.getAttribute('aria-label')),actions:[...e.querySelectorAll('a,button')].filter(n=>n.getClientRects().length).map(n=>({label:n.innerText,ariaDisabled:n.getAttribute('aria-disabled'),disabled:n.disabled===true}))}));}
export function includeAccessibleNotes(source){return{...source,text:source.text+'\n\n'+source.planCards.map(c=>'[套餐可访问性标签：'+c.name+']\n'+c.accessibilityNotes.join('\n')).join('\n\n'),representation:'visible_DOM_text_and_accessibility_labels_per_visible_plan_card'};}
export async function readRenzheShop(tab){
 const before=await tab.url();if(new URL(before).origin!==origin||new URL(before).pathname!=='/user/shop')throw Error('renzhe_shop_route_required');
 const source=await readRenderedDocument(tab);if(!source.authenticationObserved||source.passwordForm||source.verificationWidgetObserved)throw Error('renzhe_authenticated_read_checkpoint');
 source.planCards=await tab.playwright.evaluate(inspectRenzheCards);if(await tab.url()!==before)throw Error('renzhe_route_changed_during_card_capture');source.capturedAt=new Date().toISOString();return includeAccessibleNotes(source);
}
export async function collectRenzheReadOnly(tab,{fields}={}){
 if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/user/shop')return null;
 const shop=await readRenzheShop(tab),captures=[shop];
 // Canonical GET routes observed in this site's rendered navigation, no submit controls.
 const requested=Array.isArray(fields)?new Set(fields):new Set(['payment','refund','privacy']);
 const routes=[...(requested.has('payment')?[origin+'/user/code']:[]),...(requested.has('refund')?[origin+'/tos']:[]),...(requested.has('privacy')?[origin+'/privacy']:[])];
 if(requested.has('payment')&&!shop.links.some(l=>l.url===origin+'/user/code'))throw Error('renzhe_native_wallet_link_missing');
 for(const url of routes){await tab.goto(url);await tab.getAXState({emit:false});const source=await readRenderedDocument(tab);if(new URL(source.url).origin!==origin||source.passwordForm||source.verificationWidgetObserved)throw Error('renzhe_read_route_checkpoint_'+new URL(url).pathname.replaceAll('/','_'));captures.push(source);}
 return{origin,captures,configurationOnly:true,newOrdersCreated:0,paymentExecuted:false};
}
