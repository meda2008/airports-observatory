'use strict';
const publisher='https://1flyun.cc';
// A publisher route is a transport identity witness, not proof of legal
// ownership, uninterrupted operation, or authorization to transmit credentials.
function verify({config,portal,guest}){
 try{const u=new URL(portal);return u.origin===portal&&u.protocol==='https:'&&!u.port&&
  /^(?:[a-z0-9]+\.)+(?:fjumpy|fanruny)\.mom$/.test(u.hostname)&&
  config?.title==='一翻云 线路检测'&&Array.isArray(config.urls)&&
  config.urls.some(value=>new URL(value).origin===portal)&&guest?.app_url===publisher;
 }catch{return false;}
}
module.exports={publisher,verify};
