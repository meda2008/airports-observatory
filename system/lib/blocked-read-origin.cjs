"use strict";
// Diagnostic only: never grants a request, credential destination, or business identity.
function describe(req,entryOrigin){try{const u=new URL(req.url()),kind=req.resourceType(),method=req.method();if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.origin===entryOrigin||!['fetch','xhr'].includes(kind)||!['GET','HEAD','OPTIONS'].includes(method)||req.isNavigationRequest())return null;return{origin:u.origin,resourceType:kind,method,blocked:true,reason:'origin_not_approved',readOnlyQualification:'not_established'};}catch{return null;}}
module.exports={describe};
