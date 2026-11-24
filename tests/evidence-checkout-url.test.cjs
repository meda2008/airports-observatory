const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../lib/collection-engine.cjs');
test('retained checkout evidence is separate from safe automatic navigation',()=>{
 const marker={kind:'unpaid_order_configuration',collectionContext:'user_authorized_temporary_unpaid_order',actualOrderUrlWithheld:true};
 assert.equal(E.safeUrl('https://example.com/checkout'),null);
 assert.equal(E.safeEvidenceUrl('https://example.com/checkout',marker),'https://example.com/checkout');
 assert.equal(E.safeEvidenceUrl('https://example.com/checkout',{}),null);
 for(const url of ['https://example.com/checkout?token=secret','https://example.com/checkout#private','https://127.0.0.1/checkout','http://example.com/checkout'])assert.equal(E.safeEvidenceUrl(url,marker),null);
 assert.equal(E.safeReadLink({url:'https://example.com/checkout',label:'结账'},'https://example.com'),false);
});

test('authorized existing public-IP order evidence does not enable navigation',()=>{
 const marker={kind:'unpaid_order_payment_methods',collectionContext:'user_authorized_retained_ip_business_evidence',authenticationObserved:true,actualOrderUrlWithheld:true},context={authorizedCapturedOrigin:'https://191.101.132.80'};
 assert.equal(E.safeEvidenceUrl('https://191.101.132.80/',marker,context),'https://191.101.132.80/');
 assert.equal(E.safeEvidenceUrl('https://191.101.132.80/',marker),null);
 assert.equal(E.safeUrl('https://191.101.132.80/'),null);
 assert.equal(E.safeReadLink({url:'https://191.101.132.80/',label:'帮助'},'https://191.101.132.80'),false);
 for(const u of ['https://191.101.132.80/?token=secret','https://191.101.132.80/#/order/private','https://191.101.132.81/','http://191.101.132.80/'])assert.equal(E.safeEvidenceUrl(u,marker,context),null);
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.1.1','169.254.1.1','100.64.0.1','224.0.0.1'])assert.equal(E.safeEvidenceUrl('https://'+ip+'/',marker,{authorizedCapturedOrigin:'https://'+ip}),null);
 for(const change of [{authenticationObserved:false},{actualOrderUrlWithheld:false},{kind:'arbitrary_navigation'}])assert.equal(E.safeEvidenceUrl('https://191.101.132.80/',{...marker,...change},context),null);
});
