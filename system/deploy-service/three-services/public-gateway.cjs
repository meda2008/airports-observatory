'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function createPublicGateway({apiHost,adminHost,frontendOrigin,adminToken,readFile=fs.readFileSync}={}){
 if(!apiHost&&!adminHost)return null;
 if(!apiHost||!adminHost||apiHost===adminHost||![apiHost,adminHost].every(h=>/^[a-z0-9.-]+$/.test(h)))throw Error('separate_gateway_hosts_required');
 const origin=new URL(frontendOrigin);if(origin.protocol!=='https:'||origin.origin!==frontendOrigin)throw Error('exact_https_frontend_origin_required');
 const secret=adminToken||readFile(process.env.ADMIN_TOKEN_FILE,'utf8').trim();if(secret.length<32)throw Error('private_admin_credential_required');
 const respond=(res,status,body,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(body));return{handled:true};};
 return(req,res,route)=>{
  const host=(req.headers.host||'').toLowerCase().replace(/:\d+$/,'');
  const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if(route==='/health'&&local&&!req.headers.origin)return null;
  if(host===apiHost){
   if(!['/health','/api/catalog','/api/stats','/api/search','/api/measurement-status','/api/changes','/api/mailbox-privacy'].includes(route)&&!/^\/api\/airports\/A\d{3}$/.test(route))return respond(res,404,{error:'not_found'});
   if(req.headers.origin&&req.headers.origin!==frontendOrigin)return respond(res,403,{error:'origin_not_allowed'});
   if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',frontendOrigin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){
    if(req.headers['access-control-request-method']&&!['GET','HEAD'].includes(req.headers['access-control-request-method']))return respond(res,405,{error:'read_only_api'});
    if(req.headers['access-control-request-headers']&&!/^accept$/i.test(req.headers['access-control-request-headers']))return respond(res,403,{error:'header_not_allowed'});
    res.writeHead(204,{'Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'Accept','Access-Control-Max-Age':'600'});res.end();return{handled:true};
   }
   if(!['GET','HEAD'].includes(req.method))return respond(res,405,{error:'read_only_api'});
   return{authorization:null};
  }
  if(host!==adminHost)return respond(res,404,{error:'unknown_host'});
  const supplied=req.headers.authorization||'';
  let valid=equal(supplied,'Bearer '+secret);
  if(supplied.startsWith('Basic ')){
   const decoded=Buffer.from(supplied.slice(6),'base64').toString('utf8');valid=equal(decoded,'admin:'+secret);
  }
  if(!valid)return respond(res,401,{error:'administrator_authentication_required'},{'WWW-Authenticate':'Basic realm="Airports administration", charset="UTF-8"'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.headers.origin&&req.headers.origin!=='https://'+adminHost||req.headers['sec-fetch-site']==='cross-site'))return respond(res,403,{error:'cross_site_write_rejected'});
  if(route.startsWith('/internal/'))return respond(res,404,{error:'not_found'});
  return{authorization:'Bearer '+secret,admin:true};
 };
}
module.exports={createPublicGateway};
