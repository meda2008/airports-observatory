'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),parser=require('../collection/url-collectors/justmysocks-public-html.cjs');
const raw=JSON.parse(fs.readFileSync(require('path').join(__dirname,'../work/A023-current-public-html-20261120.json'),'utf8').replace(/^\uFEFF/,'')),source={url:raw.url,body:raw.body,observedAt:raw.observedAt,evidenceId:'actual-public-html-fixture',metadata:{representation:'original_jms_public_catalog_html'}};
test('current real HTML extracts 17 monthly product cards with exact raw ranges and dollar-only currency',()=>{
 const p=parser.extract(source,{recordId:'A023',prior:{pricing:{plans:[{name:'Old yearly plan',amount:60,billingPeriod:'年付',sourceIds:['old']}]}}}).pricing;
 assert.equal(p.plans.length,17);assert.deepEqual(p.plans.slice(0,3).map(p=>p.amount),[5.88,9.88,48.99]);assert.equal(p.plans.find(p=>p.name==='Just My Socks Tokyo 5000').amount,1135);
 for(const plan of p.plans){assert.equal(source.body.slice(plan.sourceLocator.start,plan.sourceLocator.end),plan.quote);assert.equal(plan.observedAt,source.observedAt);assert.equal(plan.currency,null);assert.equal(plan.currencySymbol,'$');assert.equal(plan.checkoutVerified,false);}
 assert(p.plans.some(p=>p.routingStatement==='Hong Kong CMI IP transit (NO CT/CU)'));assert.equal(p.priorPlansNotRevalidated.length,1);
});
test('wrong origin, checkout URLs, altered billing periods and missing metadata are refused',()=>{
 for(const s of [{...source,url:source.url+'?a=add&pid=2'},{...source,url:source.url.replace('justmysocks.net','evil.invalid')},{...source,metadata:{}},{...source,body:source.body.replace('<span>$5.88</span>/mo','<span>$5.88</span>/yr')}])assert.equal(parser.extract(s,{recordId:'A023'}),null);
 assert.equal(parser.extract(source,{recordId:'A008'}),null);
});
test('existing site parser dispatches raw HTML while preserving other legacy fields',()=>{
 const r=require('../collection/url-collectors/justmysocks-net.cjs').extract(source,{recordId:'A023'});assert.equal(r.pricing.plans.length,17);
 const p=require('../collection/url-collectors/index.cjs').extractKnown([source],{recordId:'A023'});assert.deepEqual(Object.keys(p.patch),['pricing']);
});
test('new observation provenance does not create a fake price change; actual amount changes still require review',()=>{
 const original=parser.extract(source,{recordId:'A023'}),fresh=parser.extract({...source,evidenceId:'second-observation',observedAt:'2026-11-20T03:00:00Z',body:source.body.replace('</title>','</title>\n')},{recordId:'A023',prior:original});
 const diff=require('../lib/site-price-business-diff.cjs').changesForSite;assert.deepEqual(diff('A023',original,fresh),{});
 const changed=parser.extract({...source,body:source.body.replace('<span>$5.88</span>/mo','<span>$6.88</span>/mo')},{recordId:'A023',prior:original});assert.equal(diff('A023',original,changed).pricing.plans[0].amount,6.88);
});
