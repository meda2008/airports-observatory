'use strict';
// Native client index-F-CYBvZO.js: credential-free initialization and own-session
// read are POST data:{}; these operations never change an account or order.
function readRequest(req,{siteId,origin}={}){try{if(siteId!=='A061'||origin!=='https://a01.xxfaffa01.cc'||req.method()!=='POST')return false;const u=new URL(req.url());if(u.origin!==origin||u.search||u.hash||!['/v1/sys/init','/v1/User/UserInfo','/v1/product/list'].includes(u.pathname))return false;const body=req.postData();return body===null||body===''||body.trim()==='{}';}catch{return false;}}
function contextOptions(config){try{return config.recordId==='A061'&&new URL(config.entryUrl).origin==='https://a01.xxfaffa01.cc'?{locale:'zh-CN'}:{};}catch{return {};}}
module.exports={readRequest,contextOptions};
