'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('unverified reports expose provenance and unknown publisher date without entering official plans',async t=>{
 const report={status:'unverified_third_party_price',officialCurrentPriceVerified:false,publisher:'Synthetic Publisher',summary:'8.8 / month, 60GB',quote:'Synthetic literal table',publishedAt:null,observedAt:'2026-11-03T00:00:00Z',sourceUrl:'https://publisher.example/quote',sourceIds:['retained'],identityLimitation:'Operator identity unconfirmed',freshnessLimitation:'Conflicting historical quota',affiliateDisclosure:'unknown',privateAccount:'DO_NOT_PUBLISH'};
 const server=require('../deploy-service/server.cjs').createServer({store:{listChanges:()=>[{siteId:'A027',after:{pricing:{status:'not_confirmed',plans:[],externalReports:[report]}}}]}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const result=await(await fetch('http://127.0.0.1:'+server.address().port+'/api/changes')).json(),p=result.items[0].after.pricing;
 assert.equal(p.status,'not_confirmed');assert.deepEqual(p.plans,[]);assert.equal(p.externalReports[0].publishedAt,null);assert.equal(p.externalReports[0].officialCurrentPriceVerified,false);assert.equal(p.externalReports[0].sourceUrl,report.sourceUrl);assert.ok(!JSON.stringify(result).includes('DO_NOT_PUBLISH'));
});

test('public report keeps publication, update and capture dates separate',async t=>{
 const raw=require('../work/collection-runs/financial-20261103-v6/originals/A190-thirdparty-publisher-price-table-d1a7bbdadb55.json');
 const report=require('../collection/third-party-collectors/jichangliebiao-anyland.cjs').extract(raw);
 const server=require('../deploy-service/server.cjs').createServer({store:{listChanges:()=>[{siteId:'A190',after:{pricing:{status:'not_confirmed',plans:[],externalReports:[report]}}}]}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const j=await(await fetch('http://127.0.0.1:'+server.address().port+'/api/changes')).json(),p=j.items[0].after.pricing;
 assert.equal(p.status,'not_confirmed');assert.deepEqual(p.plans,[]);const r=p.externalReports[0];
 assert.equal(r.publishedAt,'2025-02-25');assert.equal(r.updatedAt,'2026-10-05');assert.equal(r.priceQuoteCount,32);assert.equal(r.observedAt,raw.capturedAt);assert.equal(r.officialCurrentPriceVerified,false);
});
