'use strict';
const origins={A023:'https://justmysocks.net',A034:'https://prpr.96110.cn.com'};
function proof(config,capabilities,documents){
 const origin=origins[config?.recordId];if(!origin||config.publicOnly!==true||config.auth?.mode==='login'||config.webEgress!=='authenticated_local_proxy')return null;
 if(config.readOnlyRecipe!==(config.recordId==='A023'?'jms_public_catalog_readonly':'prpr_public_capabilities'))return null;
 const egress=require('../deploy-service/verified-public-web-egress.cjs').runtimeProof(config,capabilities),native=capabilities?.nativeContract;
 if(!egress||native?.status!=='public_backend_readable'||native.authenticationSupplied!==false)return null;
 const expected=config.recordId==='A023'?origin+'/members/cart.php':origin+'/api/v1/shop/plan',kind=config.recordId==='A023'?'original_jms_public_catalog_html':'original_native_public_shop_plan_json';
 if(!documents.some(d=>d.url===expected&&d.metadata?.representation===kind))return null;
 return{origin,recordId:config.recordId,priceUrl:expected,webEgress:egress,authenticationSupplied:false};
}
function eligible(checkpoint,current){
 if(!current)return null;const c=checkpoint.material||{},old=checkpoint.originalConfig||{};
 const types=current.recordId==='A023'?['jms_catalog_transport_failed','web_egress_transport_failed','web_egress_source_transport_failed','web_egress_check_failed']:['prpr_public_capabilities_unavailable','public_source_access_denied','web_egress_transport_failed','web_egress_source_transport_failed','web_egress_check_failed'];
 if(!types.includes(c.type))return null;
 if(old.recordId!==current.recordId||old.publicOnly!==true||old.webEgress!=='authenticated_local_proxy'||old.readOnlyRecipe!==(current.recordId==='A023'?'jms_public_catalog_readonly':'prpr_public_capabilities'))return{ok:false,reason:'original_public_catalog_contract_not_matched'};
 let u;try{u=new URL(c.url)}catch{return{ok:false,reason:'original_public_catalog_origin_unverified'}};
 const paths=current.recordId==='A023'?['/members/cart.php']:['/','/api/v1/platform/capabilities','/api/v1/shop/plan'];
 if(u.origin!==current.origin||u.search||u.hash||!paths.includes(u.pathname)||c.stage!==(current.recordId==='A023'?'public_pricing':'public_payment_configuration'))return{ok:false,reason:'original_public_catalog_route_not_revalidated'};
 return{ok:true,publicCatalogPathRecovered:true};
}
module.exports={proof,eligible};
