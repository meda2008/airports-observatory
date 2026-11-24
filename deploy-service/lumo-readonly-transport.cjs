'use strict';
const crypto=require('node:crypto'),codec=require('../collection/lumo-wire-codec.cjs');
const allowed=new Set(['/guest/comm/config','/passport/auth/login','/user/info','/user/plan/fetch','/user/order/getPaymentMethod','/user/notice/fetch']);
function requestSpec({route,routeMap,parameters,body,authorization,now=new Date().toISOString(),nonce=crypto.randomUUID()}){
 if(!allowed.has(route))throw Error('lumo_route_not_allowed');
 if(body&&route!=='/passport/auth/login')throw Error('lumo_write_not_allowed');
 if(route==='/passport/auth/login'&&(!body||typeof body.email!=='string'||typeof body.password!=='string'||Object.keys(body).some(k=>!['email','password'].includes(k))))throw Error('lumo_login_shape');
 const candidates=Object.entries(routeMap).filter(([,value])=>value===route);if(candidates.length!==1)throw Error('lumo_route_contract');const path=candidates[0][0];
 if(!/^\/[\w/-]+$/.test(path)||path.startsWith('//'))throw Error('lumo_route_destination');
 const plain=body?JSON.stringify(body):'',method=body?'POST':'GET',hash=crypto.createHash('sha256').update(plain).digest('hex'),headers={'X-Signature':crypto.createHmac('sha256',parameters.token).update(['v2',method,path,now,nonce,hash].join('\n')).digest('base64'),'X-Signature-Version':'2','X-Nonce':nonce,'X-Timestamp':now,'X-Body-Hash':hash,'X-Encrypted':'yes',Origin:'https://lumonet.net',Referer:'https://lumonet.net/'};
 if(authorization)headers.Authorization=authorization;if(body)headers['Content-Type']='application/json';
 return{url:'https://sec.lumoapi.net'+path,method,headers,...(body?{data:codec.encode(plain,parameters.crypto)}:{}),maxRedirects:0};
}
function decodeResponse({bytes,contentType,status,parameters}){const body=contentType?.includes('octet-stream')?codec.decode(bytes,parameters.crypto).toString('utf8'):Buffer.from(bytes).toString('utf8');let value;try{value=JSON.parse(body)}catch{throw Error('lumo_response_not_json')}
 if(value?.error==='NEED_CAPTCHA'||String(value?.message||'').startsWith('NEED_CAPTCHA'))return{body,value,status,checkpoint:'interactive_verification_required',stopFurtherRequests:true};
 return{body,value,status,checkpoint:status===200?null:'lumo_normal_request_rejected',stopFurtherRequests:status!==200};
}
module.exports={requestSpec,decodeResponse};
