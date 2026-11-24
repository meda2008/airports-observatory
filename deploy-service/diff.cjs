'use strict';
const OMIT=new Set(['observedAt','sourceIds','sourceUrl','captureBatchStartedAt','historicalPlans','collectionQuote','lastChecked','asOf']);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!OMIT.has(k)).map(k=>[k,canonical(value[k])]));if(typeof value==='string')return value.replace(/\[(?:email(?: redacted)?|邮箱已隐藏)\]/gi,'[email]');return value;}
function comparable(field,value){
 // This collector binds exact, unchanged card HTML. A changing footer nonce or
 // document offset is a new observation, not a different offer. Keep the card
 // quote and every business field in the comparison; retain all raw metadata.
 if(field==='pricing'&&value?.scope==='linkcube_public_html_catalog'&&value.sourceRepresentation==='public_HTTP_HTML_exact_card_ranges'&&Array.isArray(value.plans)&&value.plans.length&&value.plans.every(p=>typeof p.quote==='string'&&p.quote.startsWith('<div')&&p.sourceLocator?.kind==='body_utf16_range'))value={...value,plans:value.plans.map(({sourceBodySha256,sourceLocator,...p})=>p)};
 if(field==='pricing'&&value?.scope==='flower_public_marketing_native_portal_links'&&Array.isArray(value.plans)&&value.plans.length===6&&value.plans.every(p=>typeof p.quote==='string'&&p.quote.startsWith('<h4 class="title">')&&p.sourceUrl==='https://huacloud.dev/pricing.html'&&p.sourceLocator?.kind==='body_utf16_range'))value={...value,plans:value.plans.map(({sourceBodySha256,sourceLocator,...p})=>p)};
 if(field==='pricing'&&value?.scope==='biubiu_current_authenticated_visible_default_catalog'&&Array.isArray(value.plans)&&value.plans.length===14&&value.plans.every(p=>typeof p.quote==='string'&&p.quote.startsWith(p.productName+'\n')&&p.sourceUrl==='https://ccount.biubiu.club/#/plan'&&p.sourceLocator?.kind==='body_utf16_range'))value={...value,plans:value.plans.map(({sourceBodySha256,sourceLocator,...p})=>p)};
 return canonical(value);
}
function changesFor(current,patch){return Object.fromEntries(Object.entries(patch).filter(([field,value])=>JSON.stringify(comparable(field,current[field]))!==JSON.stringify(comparable(field,value))));}
module.exports={canonical,changesFor};
