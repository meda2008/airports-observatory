'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const historicalCapture = historicalCaptureOptions(
  'work/collection-runs/confirmed-entries-20261104-v9/qing_native_docs.json',
  'work/collection-runs/confirmed-entries-20261104-v9/qing_help_domain_docs.json'
);

const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const dir='../work/collection-runs/confirmed-entries-20261104-v9/',a=historicalCapture.skip ? undefined : require(dir+'qing_native_docs.json'),b=historicalCapture.skip ? undefined : require(dir+'qing_help_domain_docs.json');
test('actual Qing alternate help domain repeats the same material, without becoming a refund rule or independent source', historicalCapture,async()=>{const {assessQingRefundCoverage:assess}=await import(pathToFileURL(path.resolve(__dirname,'../collection/site-recipes/qingyunti.mjs')));assert.equal(assess(a).status,'no_refund_rule_in_observed_doc_directory');const r=assess(b,a);assert.equal(r.sameMaterial,true);assert.equal(r.independentCorroboration,false);assert.equal(r.currentRefundPolicyConfirmed,false);assert.equal(r.bodySha256,assess(a).bodySha256);assert.throws(()=>assess({...a,url:'https://unrelated.invalid/docs'}),/scope_mismatch/);assert.throws(()=>assess({...a,text:'正在加载'}),/body_not_ready/);assert.equal(assess({...a,text:a.text+'\n退款条件发生变化'}).status,'new_financial_literal_requires_review');});
