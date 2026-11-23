'use strict';
const assert=require('node:assert/strict');
function validateReviewedWebsite(d,raw,source){
 const origin=new URL(source.url).origin;
 assert.equal(new URL(d.value.url).origin,origin,'Website must be the observed source origin');
 assert.equal(d.value.operatorIdentityVerified,false,'Visible business UI does not establish legal identity');
 assert(d.value.basis&&d.value.observedBrand&&d.quote.includes(d.value.observedBrand),'Exact observed brand and bounded basis required');
 if(d.sourceAccess==='authenticated')assert.equal(d.value.relationship,'authenticated_named_service_ui_continuity_unverified');
 else{
  assert.equal(d.sourceAccess,'public');assert.equal(d.value.relationship,'public_native_business_ui_continuity_unverified');
  assert.equal(raw.kind,'public_native_business_home');assert.equal(source.bindingStatus,'native_home_and_account_routes_observed_continuity_unverified');
  assert(['login','register'].every(route=>raw.links?.some(l=>{try{const u=new URL(l.url);return u.origin===origin&&u.pathname==='/'+route;}catch{return false;}})),'Same-origin native login and registration routes required');
  const purchaseLinks=(raw.links||[]).filter(l=>/购买|订阅|注册后选择|选择套餐/.test(l.label));
  assert(purchaseLinks.length&&purchaseLinks.every(l=>new URL(l.url).origin===origin),'External promotional purchase destinations are not native business evidence');
 }
}
module.exports={validateReviewedWebsite};
