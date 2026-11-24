'use strict';
// Observe only the native, already requested status endpoint. No extra request,
// code mail, login attempt, cookie/header export or positive identity inference.
function create({siteId,origin}){const enabled=['A009','A181'].includes(siteId)&&['https://glados.rocks','https://glados.space'].includes(origin);let result=null,resolve;const signal=new Promise(r=>{resolve=r;});
 return{enabled,async observe(response){try{if(!enabled||result)return;const request=response.request(),u=new URL(response.url());if(request.method()!=='GET'||u.origin!==origin||u.pathname!=='/api/user/status'||u.search||u.hash||response.status()!==200)return;const bytes=await response.body();if(bytes.length>4096)return;const value=JSON.parse(Buffer.from(bytes).toString('utf8'));if(Object.keys(value).sort().join(',')!=='code,message'||value.code!==-2||value.message!=='没有权限')return;result={status:'authentication_required',origin,path:'/api/user/status',nativeCode:-2,bodyExported:false};resolve(result);}catch{}},wait(){return signal;},snapshot(){return result?{...result}:null;}};
}
module.exports={create};
