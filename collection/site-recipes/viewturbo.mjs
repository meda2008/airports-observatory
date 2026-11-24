import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://web.vtpro.xyz';
export async function collectViewTurboPolicies(tab){
 if(new URL(await tab.url()).origin===origin&&/^\/charge\/?$/.test(new URL(await tab.url()).pathname)){
  await tab.playwright.getByRole('group',{name:'Choose a payment method',exact:true}).waitFor({state:'visible',timeoutMs:12000});
  await tab.playwright.getByRole('button',{name:'Stripe WeChatPay',exact:true}).waitFor({state:'visible',timeoutMs:12000});
  // The actual 2026-11-04 page adds USDT after the first options render.
  // A missing marker is a readiness checkpoint, never evidence of removal.
  await tab.playwright.getByRole('button',{name:'USDT',exact:true}).waitFor({state:'visible',timeoutMs:12000});
  const capture=await readRenderedDocument(tab);if(new URL(capture.url).origin!==origin||!/^\/charge\/?$/.test(new URL(capture.url).pathname)||!capture.text.includes('Private Email'))throw Error('viewturbo_charge_scope_changed');
  return{origin,captures:[capture],configurationOnly:true,newOrdersCreated:0,paymentExecuted:false};
 }
 if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/privacy-policy')return null;
 const captures=[];await tab.playwright.getByRole('heading',{name:'Privacy Policy',exact:true}).waitFor({state:'visible',timeoutMs:12000});captures.push(await readRenderedDocument(tab));
 const link=tab.playwright.getByRole('link',{name:'Terms of Use',exact:true});if(!captures[0].links.some(l=>l.url===origin+'/terms-of-use'))throw Error('viewturbo_native_terms_link_missing');await link.click();
 await tab.playwright.getByRole('heading',{name:'Terms of use',exact:true}).waitFor({state:'visible',timeoutMs:12000});const terms=await readRenderedDocument(tab);if(new URL(terms.url).origin!==origin||new URL(terms.url).pathname!=='/terms-of-use')throw Error('viewturbo_terms_route_changed');captures.push(terms);
 return{origin,captures,configurationOnly:true,newOrdersCreated:0,paymentExecuted:false};
}
