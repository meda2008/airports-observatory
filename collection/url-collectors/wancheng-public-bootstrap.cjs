'use strict';
const endpoints=new Set(['https://ipinfo.io/json','https://h.ahahub.net/light/link','https://h.ahapivot.com/light/link','https://ht.ahagame.top/light/link','https://ht.jsq888.com/light/link','https://ht.tizi8888.com/light/link']);
// Exact bindings only: A217's native GET dependencies were observed independently
// on 2026-11-15. This grants no cross-origin credential or write permission.
const bindings=new Map([['A031','https://user.dowancheng.com'],['A217','https://user.heibaojiasu.com']]);
function publicBootstrapRead(req,{siteId,origin}={}){if(bindings.get(siteId)!==origin||!['GET','HEAD'].includes(req.method())||!['xhr','fetch'].includes(req.resourceType()))return false;let u;try{u=new URL(req.url());}catch{return false;}if(u.search||u.hash||u.username||u.password||!endpoints.has(u.href))return false;const h=req.headers?.()||{};return !h.authorization&&!h.cookie;}
module.exports={publicBootstrapRead,endpoints};
