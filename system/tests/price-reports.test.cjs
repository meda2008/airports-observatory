'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validatePriceReports}=require('../lib/reviewed-price-reports.cjs');
const {makeCoreInfo}=require('../lib/core-info.cjs');
const report={status:'unverified_third_party_price',officialCurrentPriceVerified:false,publisher:'SYNTHETIC reviewer',summary:'SYNTHETIC price ¥12/月',quote:'SYNTHETIC price ¥12/月',publishedAt:null,identityLimitation:'SYNTHETIC identity unknown',freshnessLimitation:'SYNTHETIC current price unknown',affiliateDisclosure:'unknown',observedAt:'2026-11-02T00:00:00.000Z',sourceIds:['SYNTHETIC-REF']};
test('third-party prices cannot fill the official price gap or summary',()=>{
 validatePriceReports({reports:[report]},{text:report.quote});
 const core=makeCoreInfo({id:'SYNTHETIC',name:'Synthetic',coreSupplement:{pricingReports:{reports:[report]}}});
 assert.equal(core.pricing.status,'not_confirmed');assert.equal(core.pricing.plans.length,0);
 assert.equal(core.pricing.externalReports[0].officialCurrentPriceVerified,false);
 assert(core.sourceIds.includes('SYNTHETIC-REF'));assert(core.gaps.some(g=>/价格|套餐/.test(g)));
});
test('reject invented excerpts and attempts to assert official verification',()=>{
 assert.throws(()=>validatePriceReports({reports:[{...report,summary:'invented'}]},{text:report.quote}));
 assert.throws(()=>validatePriceReports({reports:[{...report,officialCurrentPriceVerified:true}]},{text:report.quote}));
});
