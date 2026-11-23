'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),parsers=require('../collection/third-party-collectors/pricing-gap-reports.cjs'),{validatePriceReports}=require('../lib/reviewed-price-reports.cjs');
const dir=path.resolve(__dirname,'../work/collection-runs/pricing-13-20261105-v13');
for(const parser of parsers)test(parser.recordId+' keeps real external quote, publisher date type and unresolved identity separate from official facts',()=>{
 const name=parser.recordId==='A082'?'A082-current-landing.json':parser.recordId+'-new-thirdparty.json',raw=JSON.parse(fs.readFileSync(path.join(dir,name))),r=parser.extract(raw);
 assert(r);validatePriceReports({reports:[r]},raw);assert.equal(r.officialCurrentPriceVerified,false);assert.equal(r.status,'unverified_third_party_price');assert.equal(r.methods,undefined);assert.equal(r.plans,undefined);assert(raw.text.includes(r.summary));assert.equal(r.observedAt,raw.capturedAt);assert.equal(parser.extract({...raw,url:'https://wrong.invalid/'}),null);assert.equal(parser.extract({...raw,text:raw.text.replace(r.summary,'removed')}),null);
 if(parser.recordId==='A146')assert.equal(r.publishedAt,null);if(parser.recordId==='A190')assert.equal(r.updatedAt,'2026-07-31');
});
