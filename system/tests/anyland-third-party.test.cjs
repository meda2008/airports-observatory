'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const parser=require('../collection/third-party-collectors/jichangliebiao-anyland.cjs');
const raw=require('../work/collection-runs/financial-20261103-v6/originals/A190-thirdparty-publisher-price-table-d1a7bbdadb55.json');
const {validatePriceReports}=require('../lib/reviewed-price-reports.cjs');
test('retained Anyland table remains an explicitly unverified report with distinct dates',()=>{
 const r=parser.extract(raw);assert(r);validatePriceReports({reports:[r]},raw);
 assert.equal(r.publishedAt,'2025-02-25');assert.equal(r.updatedAt,'2026-10-05');assert.equal(r.observedAt,raw.capturedAt);
 assert.equal(r.priceQuoteCount,32);assert.equal((r.quote.match(/￥\d+(?:\.\d+)?/g)||[]).length,32);
 assert.equal(r.officialCurrentPriceVerified,false);assert.equal(r.payment,undefined);assert.equal(r.plans,undefined);
 assert.match(r.identityLimitation,/node1/);assert.match(r.freshnessLimitation,/流量月额度/);
});
test('rejects changed rows, another service or a search snippet; does not guess missing update date',()=>{
 assert.equal(parser.extract({...raw,text:raw.text.replace('￥240','￥241')}),null);
 assert.equal(parser.extract({...raw,url:'https://jichangliebiao.com/jichang/other'}),null);
 assert.equal(parser.extract({...raw,url:'https://www.google.com/search?q=Anyland'}),null);
 assert.equal(parser.extract({...raw,timeMetadata:[]}),null);
 const registry=require('../collection/third-party-collectors/index.cjs');
 assert.equal(registry.forReport('A027',raw.url),null);assert.equal(registry.forReport('A190',raw.url),parser);
 const report=parser.extract(raw);assert.throws(()=>validatePriceReports({reports:[{...report,updatedAt:'2026-11-03'}]},raw));
});
