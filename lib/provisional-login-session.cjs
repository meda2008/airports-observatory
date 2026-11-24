'use strict';
const fs=require('node:fs');const origins={A068:'https://sanfen.gonghailin.xin',A083:'https://home.cocoduck.co'};
function configured(c){try{return origins[c.recordId]===new URL(c.entryUrl).origin&&c.auth?.mode==='login'&&c.publicOnly!==true;}catch{return false;}}
function load(c,file){if(!configured(c)||fs.existsSync(file))return null;try{return JSON.parse(fs.readFileSync(file+'.unverified','utf8'));}catch{return null;}}
async function retain({config,context,file,snapshot,responses=[]}){if(!configured(config)||snapshot.passwordForm||snapshot.type||snapshot.verificationWidgetObserved||snapshot.agreementCheckbox||new URL(snapshot.url).origin!==origins[config.recordId]||!responses.some(r=>r.httpStatus===200&&!r.serverFailure))return false;const u=new URL(snapshot.url);if(!['/plan','/user/product','/user/shop','/dashboard'].includes(u.pathname))return false;await context.storageState({path:file+'.unverified'});fs.chmodSync(file+'.unverified',0o600);return true;}
module.exports={configured,load,retain};
