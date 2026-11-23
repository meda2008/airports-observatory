'use strict';
// Isolated anonymous discovery only: website's ordinary browser-check transport.
// No clicks, answers, credentials, cookie injection or general write permission.
function eligible(config){return config?.publicOnly===true&&!config.auth&&config.entryDiscovery===true;}
function transport(req,config){if(!eligible(config))return false;try{const u=new URL(req.url()),entry=new URL(config.entryUrl),method=req.method();if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!['GET','POST'].includes(method))return false;const frame=req.frame(),fo=new URL(frame.url()).origin;if(u.origin===entry.origin&&/^\/cdn-cgi\/challenge-platform\//.test(u.pathname))return fo===entry.origin;if(u.hostname!=='challenges.cloudflare.com'||!/^\/(?:turnstile\/v0\/|cdn-cgi\/challenge-platform\/)/.test(u.pathname))return false;const parent=frame.parentFrame?.();const parentOwned=parent&&new URL(parent.url()).origin===entry.origin;return fo===entry.origin||fo===u.origin&&parentOwned||method==='GET'&&req.isNavigationRequest?.()===true&&frame.url()==='about:blank'&&parentOwned;}catch{return false;}}
function asset(req,config){return req.method()==='GET'&&transport(req,config);}
function write(req,config){return req.method()==='POST'&&transport(req,config);}
module.exports={eligible,asset,write,transport};
