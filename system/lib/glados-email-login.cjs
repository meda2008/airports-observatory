'use strict';
// Public GLaDOS login client uses an email Access Code rather than a password.
// Recognition does not authorize sending mail or widening the mailbox provider.
function matches(s={}){try{const u=new URL(s.url),m=s.metadata||{},fields=s.formFields||m.formFields||[];return !s.agreementCheckbox&&!m.agreementCheckbox&&!s.verificationWidgetObserved&&!m.verificationWidgetObserved&&['https://glados.rocks','https://glados.space'].includes(u.origin)&&u.pathname==='/login'&&fields.some(f=>f.type==='email')&&fields.some(f=>f.type==='text'&&f.name==='mailcode')&&/Access Code/.test(s.text||s.body||'');}catch{return false;}}
module.exports={matches};
