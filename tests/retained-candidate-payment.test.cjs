'use strict';
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {extractKnown}=require('../collection/url-collectors/index.cjs');
const sources=[['A043','efbng.guangzssytt.buzz','105fa775f2b1e40d9470d15e2eca8bf0c67cc57dcba1f26c8584b7afb16c42b4'],['A152','dv2dsdgf.quanqiugttt1.club','308fcda3367052b20886d5d95bf5d45d3585173a6faa87d7b60607092baccc03']];
for(const[id,host,hash]of sources){
 const file = `catalog/refresh/2026-10-26/core-auth-batch396/raw/${hash}.json`;
 const options = historicalCaptureOptions(file);
 const original = options.skip ? undefined : JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', file)));
 test(id+' reuses literal methods with original time and explicit candidate scope', options,()=>{const p=extractKnown([{...original,evidenceId:'retained-test'}],{prior:{website:{url:'https://'+host+'/'}}}).patch.payment;assert.deepEqual(p.methods,['支付宝']);assert.deepEqual(p.methodOptions,['支付宝','支付宝4']);assert.equal(p.observedAt,original.capturedAt);assert.equal(p.transactionVerified,false);assert.ok(p.conditions[0].includes('未确认'));});
 test(id+' rejects a label elsewhere, login screen, other prior origin and missing time', options,()=>{for(const delta of [{text:'帮助页介绍支付宝4'},{passwordForm:true},{capturedAt:null},{kind:'homepage'}])assert.equal(extractKnown([{...original,...delta}]),null);assert.equal(extractKnown([original],{prior:{website:{url:'https://unrelated.example/'}}}),null);});
}
