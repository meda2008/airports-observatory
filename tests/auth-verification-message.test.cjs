'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{authenticationFailure}=require('../deploy-service/auth.cjs');
test('explicit verification prerequisite is distinct from bad credentials and broad marketing text',()=>{
 assert.equal(authenticationFailure('Password\nPlease complete the verification first\nSign in'),'interactive_captcha');
 assert.equal(authenticationFailure('Please complete the captcha verification first.'),'interactive_captcha');
 assert.equal(authenticationFailure('The email or password is incorrect.'),'server_rejected_credentials');
 assert.equal(authenticationFailure('Help: Please complete the verification first when signing in'),null);
});
