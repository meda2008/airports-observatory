import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://ofosg.com';
// Only native GET configuration links and billing radios. Never checkout submit.
export async function collectOfoOffers(tab,{shopSnapshot,runtime='iab'}){
 if(new URL(shopSnapshot.url).origin!==origin||new URL(await tab.url()).origin!==origin)throw Error('ofo_origin_mismatch');
 const links=[...new Map(shopSnapshot.links.filter(l=>{try{const u=new URL(l.url);return u.origin===origin&&u.pathname==='/checkout'&&/^\d+$/.test(u.searchParams.get('id'))&&/立即购买/.test(l.label);}catch{return false;}}).map(l=>[l.url,l])).values()];
 if(links.length!==3)throw Error('ofo_three_native_product_links_required');
 const captures=[];
 for(const link of links){
  if(await tab.url()!==link.url)await tab.goto(link.url);
  await tab.playwright.getByRole('heading',{name:'结账',exact:true}).waitFor({state:'visible',...(runtime==='server'?{timeout:12000}:{timeoutMs:12000})});
  let choices=await tab.playwright.evaluate(()=>[...document.querySelectorAll('input[type=radio]')].filter(e=>e.getClientRects().length&&['month_price','quarter_price','year_price'].includes(e.id)).map(e=>({id:e.id,checked:e.checked,label:[...e.labels||[]].map(l=>l.innerText).join(' ')})));
  if(choices.length!==3)throw Error('ofo_billing_choices_not_ready');
  for(const choice of choices){
   const m=choice.label.match(/^¥([\d.]+)\s*-\s*(月付|季付|年付)(?:\s|$)/);if(!m)throw Error('ofo_visible_billing_label_unrecognized');
   await tab.playwright.locator('#'+choice.id).check();
   const expected=new RegExp('^¥\\s*'+m[1].replace('.','\\.')+'\\s*CNY$');
   // The subscription fee changes before the payable total in this theme.
   // Wait for the actual total h3, not any matching fee heading.
   await tab.playwright.locator('h3').filter({hasText:expected}).waitFor({state:'visible',...(runtime==='server'?{timeout:10000}:{timeoutMs:10000})});
   if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/checkout')throw Error('ofo_config_route_changed');
   const selected=await tab.playwright.evaluate(()=>[...document.querySelectorAll('input[type=radio]')].filter(e=>e.getClientRects().length&&e.checked&&['month_price','quarter_price','year_price'].includes(e.id)).map(e=>({id:e.id,label:[...e.labels||[]].map(l=>l.innerText).join(' ')})));
   if(selected.length!==1||selected[0].id!==choice.id)throw Error('ofo_selected_cycle_unconfirmed');
   const snapshot=await readRenderedDocument(tab);if(snapshot.passwordForm||snapshot.agreementCheckbox||snapshot.verificationWidgetObserved)throw Error('ofo_auth_terms_or_verification_checkpoint');
   captures.push({...snapshot,capturedAt:new Date().toISOString(),selectedBilling:selected[0],representation:'redacted_visible_DOM_and_visible_billing_selection',captureScope:'configuration_only_no_submit_no_order'});
  }
 }
 return{origin,captures,configurationOnly:true,newOrdersCreated:0,paymentExecuted:false};
}
