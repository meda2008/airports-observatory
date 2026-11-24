const {test}=require('node:test'),assert=require('node:assert/strict'),{validateEmailCode}=require('../deploy-service/auth.cjs');
test('bounded explicit delivery clock skew preserves identity, expiry and time checks',()=>{
 const now=Date.parse('2026-11-18T07:00:05Z'),binding={origin:'https://example.com',recipient:'test@example.com',requestedAt:'2026-11-18T07:00:00.600Z',now};
 const mail={origin:binding.origin,recipient:binding.recipient,receivedAt:'2026-11-18T07:00:00Z',expiresAt:'2026-11-18T07:05:00Z',code:'123456'};
 assert.throws(()=>validateEmailCode(mail,binding),/binding_invalid/);
 assert.equal(validateEmailCode(mail,{...binding,maxClockSkewMs:5000}),'123456');
 for(const change of [{recipient:'other@example.com'},{receivedAt:'2026-11-18T06:59:50Z'},{receivedAt:'invalid'},{expiresAt:'invalid'},{expiresAt:'2026-11-18T07:00:01Z'},{receivedAt:'2026-11-18T07:00:30Z'}])assert.throws(()=>validateEmailCode({...mail,...change},{...binding,maxClockSkewMs:5000}),/binding_invalid/);
});
