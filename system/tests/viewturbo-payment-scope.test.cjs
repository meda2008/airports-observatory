'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
test('actual retained ViewTurbo payment buttons apply only to one-day Private Email and preserve historical USDT observation',()=>{
 const s=require(path.resolve(__dirname,'../work/collection-runs/unread-official-financial-20261104-v7/viewturbo_private_email_payment_options.json')),p=require('../collection/url-collectors/viewturbo-web.cjs'),old={methods:['USDT'],observations:[{methods:['USDT'],statementType:'old_public_statement'}]},r=p.extract({...s,evidenceId:'RETAINED_TEST_SOURCE'},{prior:{payment:old}}).payment;
 assert(r.scope.includes('Private Email'));assert.equal(r.transactionVerified,false);assert.equal(r.checkoutObserved,false);assert.equal(r.observedAt,s.capturedAt);assert.equal(r.observations[0].methods[0],'USDT');assert(!r.methods.includes('USDT'));assert(r.methods.some(m=>m.includes('Apple Pay')));assert.equal(p.extract({...s,text:s.text.replaceAll('USD 1.00','USD ?')}),null);assert.equal(p.extract({...s,url:p.origin+'/privacy-policy'}),null);
 assert.equal(p.extract({...s,text:s.text.replaceAll('USDT','')}),null);assert.equal(p.extract(s,{prior:{payment:r}}).payment.observations.length,2);
});
