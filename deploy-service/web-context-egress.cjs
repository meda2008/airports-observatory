'use strict';
const fs=require('node:fs');
// Only the already mounted, loopback-only proxy is eligible. No URL or secret enters a profile.
function webContextEgress(config,{env=process.env,readFile=fs.readFileSync}={}){
 if(config.webEgress===undefined||config.webEgress==='direct')return{};
 if(config.webEgress!=='authenticated_local_proxy')throw Error('unsupported_web_egress');
 let c;try{c=JSON.parse(readFile(env.MIHOMO_CONFIG,'utf8'));}catch{throw Error('web_egress_private_config_unavailable');}
 const port=Number(env.MEASUREMENT_PROXY_PORT),auth=c.authentication;
 if(!Number.isInteger(port)||port<1024||port>65535||c['mixed-port']!==port||c['allow-lan']!==false||!Array.isArray(auth)||auth.length!==1||typeof auth[0]!=='string')throw Error('web_egress_config_binding_failed');
 const split=auth[0].indexOf(':');if(split<1||split===auth[0].length-1)throw Error('web_egress_unique_auth_required');
 return{proxy:{server:'http://127.0.0.1:'+port,username:auth[0].slice(0,split),password:auth[0].slice(split+1)}};
}
module.exports={webContextEgress};
