'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{planNativePolicies}=require('../lib/native-policy-planner.cjs');
test('native cross-domain policies retain binding, deduplicate fragments, and exclude read or attempted pages',()=>{
 const record={id:'A1',name:'site',fields:['refund']};const page={recordIds:['A1'],grade:'E1',sourceId:'S1',url:'https://site.test/',sha256:'hash',file:'original.json',capturedAt:'2026-11-01T00:00:00Z',links:[{label:'服务条款',url:'https://policy.test/terms'},{label:'服务条款',url:'https://policy.test/terms#refund'},{label:'帮助',url:'https://site.test/help'},{label:'退款',url:'https://site.test/refund'}]};
 const candidates=planNativePolicies({records:[record],pages:[page,{url:'https://site.test/help/'}],attempts:[{recordId:'A1',url:'https://site.test/refund/',status:'verification_required'}]});assert.equal(candidates.length,1);assert.equal(candidates[0].parentSourceId,'S1');assert.equal(candidates[0].crossOrigin,true);assert.equal(candidates[0].automaticFactAdmission,false);
});
test('untrusted sources and action or secret-bearing URLs never enter policy discovery',()=>{
 const links=['https://site.test/checkout?terms=1','https://site.test/help?token=secret','https://user:secret@site.test/terms','https://site.test/refund/cancel','https://site.test/affiliate/terms'].map(url=>({url,label:'退款条款'}));const p={url:'https://site.test/',recordIds:['A1'],grade:'E1',links};assert.deepEqual(planNativePolicies({records:[{id:'A1',fields:['refund']}],pages:[p]}),[]);assert.deepEqual(planNativePolicies({records:[{id:'A1',fields:['refund']}],pages:[{...p,grade:'E0',links:[{label:'条款',url:'https://policy.test/terms'}]}]}),[]);
});
test('platform policies and already read translated documentation do not create new operator evidence',()=>{
 const page={url:'https://help.test/docs/start/iOS/faq/',recordIds:['A1'],grade:'E1',links:[{label:'FAQ',url:'https://help.test/es/docs/start/iOS/faq/'},{label:'About',url:'https://telegram.org/faq'}]};assert.deepEqual(planNativePolicies({records:[{id:'A1',fields:['refund']}],pages:[page]}),[]);
});
test('security-blocked help origins need newer successful primary evidence before retry',()=>{
 const record={id:'A1',fields:['refund']},p={url:'https://site.test/',grade:'E1',recordIds:['A1'],links:[{label:'条款',url:'https://help.test/terms'}]},attempt={recordId:'A1',url:'https://help.test/faq',status:'verification_required',finishedAt:'2026-11-01T00:00:00Z'};
 assert.equal(planNativePolicies({records:[record],pages:[p],attempts:[attempt,{url:'invalid',status:'verification_required'}]}).length,0);
 assert.equal(planNativePolicies({records:[record],pages:[p,{url:'https://help.test/home',grade:'E1',recordIds:['A1'],capturedAt:'2026-11-01T01:00:00Z'}],attempts:[attempt]}).length,1);
});
