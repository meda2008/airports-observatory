'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions('work/collection-runs/financial-20261110-v20/A041-current-plans.json');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const c=require('../collection/url-collectors/retained-ftzcc02-fliggycloud-pro.cjs');
const s=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync('work/collection-runs/financial-20261110-v20/A041-current-plans.json'));
test('five live cards preserve literal prices and historical observations without currency inference', historicalCapture,()=>{const prior={pricing:{observedAt:'old',plans:[{name:'old'}]}};const p=c.extract(s,{prior});assert.deepEqual(p.pricing.plans.map(x=>x.amount),[84,20,40,70,120]);assert.equal(p.pricing.plans[0].billingPeriod,'年付');assert.equal(p.pricing.plans[0].quota,'50G/月');assert(p.pricing.plans.every(x=>x.currency===null&&!x.checkoutVerified));assert.equal(p.pricing.previousObservations[0].observedAt,'old');assert.equal(p.refund,undefined);});
test('partial, challenged and invalid-date pages cannot produce live prices', historicalCapture,()=>{for(const changed of [{text:s.text.replace('Fliggy-VIP4','Other')},{verificationWidgetObserved:true},{capturedAt:'invalid'}]){const p=c.extract({...s,...changed});assert(!p?.pricing);}});

test('foreign origin is rejected by retained collector contract', historicalCapture,()=>assert.throws(()=>c.extract({...s,url:'https://example.org/#/plan'}),/collector_origin_mismatch/));
