'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions('work/collection-runs/breakpoints-20261104-v1/followup-sources.json');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const dir='work/collection-runs/breakpoints-20261104-v1',source=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync(dir+'/followup-sources.json')).find(x=>x.label==='A083-known-order-cancelled'),raw=historicalCapture.skip ? undefined : JSON.parse(fs.readFileSync(dir+'/'+source.file));
const parser=require('../collection/url-collectors/home-cocoduck-co.cjs');
const prior={payment:{methods:['支付宝','微信'],observedAt:'2026-11-01T16:31:02.728Z',sourceIds:['old-cashier'],orderCleanup:{status:'pending',newOrderBlocked:true}}};
test('only the previously known order clears cleanup; payment evidence and capture time stay unchanged', historicalCapture,()=>{
 const out=parser.extract({...raw,evidenceId:'new-cleanup-source'},{prior});assert(out);assert.deepEqual(out.payment.methods,prior.payment.methods);assert.equal(out.payment.observedAt,prior.payment.observedAt);assert.deepEqual(out.payment.sourceIds,prior.payment.sourceIds);
 assert.equal(out.payment.orderCleanup.status,'cancelled_observed');assert.equal(out.payment.orderCleanup.newOrderBlocked,false);assert.equal(out.payment.orderCleanup.checkedAt,raw.capturedAt);assert.equal(out.payment.orderCleanup.cancellationActor,'not_observed');assert(!JSON.stringify(out).includes('O2026'));
});
test('another order, unpaid row or wrong host cannot clear a cleanup hold', historicalCapture,()=>{
 assert.equal(parser.extract({...raw,text:raw.text.replace('已取消','未支付')},{prior}),null);
 assert.equal(parser.extract({...raw,text:raw.text.replace(/O20261102003025a98e1e80/g,'O20261102003025bbbbbbbb')},{prior}),null);
 assert.equal(parser.extract({...raw,url:'https://other.example/user/order'},{prior}),null);
});
