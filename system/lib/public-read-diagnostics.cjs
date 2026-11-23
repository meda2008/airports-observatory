'use strict';
// Transport metadata only: never read bodies, queries, headers or account values.
function create(siteId){const enabled=['A009','A181','A069'].includes(siteId),checks=[];
 function shape(req){try{if(!enabled||!['GET','HEAD'].includes(req.method())||!['xhr','fetch'].includes(req.resourceType()))return null;const u=new URL(req.url());if(u.protocol!=='https:'||u.username||u.password)return null;return{origin:u.origin,path:u.pathname.split('/').map(s=>s.length>24||/^[0-9]{4,}$/.test(s)?'[identifier]':s).join('/'),method:req.method()};}catch{return null;}}
 function add(item){if(item&&checks.length<12&&!checks.some(x=>JSON.stringify(x)===JSON.stringify(item)))checks.push(item);}
 return{enabled,response(r){try{const s=shape(r.request());if(s)add({...s,httpStatus:r.status()});}catch{}},failed(req){try{const s=shape(req),code=/ERR_[A-Z_]+/.exec(req.failure?.()?.errorText||'')?.[0]||'request_failed';if(s)add({...s,status:'failed',code});}catch{}},snapshot(){return checks.map(x=>({...x}));}};
}
module.exports={create};
