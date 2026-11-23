'use strict';
const assert=require('node:assert/strict');
function validatePriceReports(value,raw){
 assert(value.reports?.length,'Third-party reports required');
 for(const r of value.reports){
  assert.equal(r.status,'unverified_third_party_price');
  assert.equal(r.officialCurrentPriceVerified,false);
  assert(r.publisher&&r.summary&&r.quote&&raw.text.includes(r.quote),'Exact retained third-party quote required');
  assert(raw.text.includes(r.summary),'Summary must be an exact retained excerpt');
  assert(r.publishedAt===null||/^\d{4}-\d{2}-\d{2}$/.test(r.publishedAt),'Publisher date must be explicit or unknown');
  assert(r.publishedAt===null||raw.text.includes(r.publisherDateQuote),'Publisher date quote required');
  if(r.updatedAt!==undefined){assert(/^\d{4}-\d{2}-\d{2}$/.test(r.updatedAt),'Update date format required');assert((raw.timeMetadata||[]).some(t=>t.label===r.publisherUpdateQuote&&t.dateTime?.slice(0,10)===r.updatedAt),'Explicit retained update metadata required');}
  assert(r.identityLimitation&&r.freshnessLimitation,'Identity and freshness limitations required');
  assert(['disclosed','not_disclosed','unknown'].includes(r.affiliateDisclosure),'Affiliate disclosure required');
 }
}
module.exports={validatePriceReports};
