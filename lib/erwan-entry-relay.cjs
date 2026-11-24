'use strict';
const origin='https://erwancdec.cc',relayOrigin='https://ewfdl.net';
function configured(c){try{return ['A028','A199'].includes(c.recordId)&&new URL(c.entryUrl).origin===origin&&c.allowedHosts.includes('ewfdl.net');}catch{return false;}}
function relayUrl(value,c){try{const u=new URL(value);return configured(c)&&u.origin===relayOrigin&&!u.username&&!u.password&&!u.search&&!u.hash&&['/__r__/erwancdec.cc/','/__r__/erwancdec.cc/user/shop'].includes(u.pathname);}catch{return false;}}
function declaredRelay(value,snapshot,c){return relayUrl(value,c)&&new URL(snapshot.url).origin===origin&&snapshot.links?.some(x=>x.url===value&&x.label==='点击访问网站');}
function allowedRequest(req,c){return relayUrl(req.url(),c)&&req.method()==='GET'&&req.isNavigationRequest();}
module.exports={origin,relayOrigin,configured,relayUrl,declaredRelay,allowedRequest};
