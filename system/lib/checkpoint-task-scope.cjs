'use strict';
// A failed optional public reference is retained, not resolved by a price run.
// Only an explicitly pricing-only task which does not collect references is independent.
function blocksOfficialPricing(config,checkpoint){let m=checkpoint?.material;if(!m&&typeof checkpoint?.material_json==='string'){try{m=JSON.parse(checkpoint.material_json);}catch{return true;}}const pricingOnly=config?.fields?.length===1&&config.fields[0]==='pricing'&&config.collectPerformanceReferences===false;if(pricingOnly&&m?.stage==='public_performance_reference')return false;
 // Historical root failures are preserved. They do not block an explicitly
 // different, public pricing-only source. Current-source failures still block;
 // this grants no authentication, verification, or other-field acceptance.
 if(pricingOnly&&config.publicOnly===true&&!config.auth){
  const scopes={A024:{entry:'https://app5.ninjiacloud.online/',recipe:'ninja_public_catalog_readonly',old:['https://app5.ninjiacloud.online']},A014:{entry:'https://huacloud.dev/pricing.html',recipe:'flower_public_pricing_readonly',old:['https://api-flowercloud.com']},A011:{entry:'https://hutao.cloud/',recipe:'hutao_public_catalog_readonly',old:['https://hutaohome.com']},A038:{entry:'https://711-cloud.net/',recipe:'linkcube_public_marketing_readonly',old:['https://linkcube.org','https://www.linkcube.org']}};
  const s=scopes[config.recordId];
  if(s&&config.entryUrl===s.entry&&config.readOnlyRecipe===s.recipe&&m){try{const u=new URL(m.url);if(s.old.includes(u.origin)&&u.pathname==='/'&&!u.search&&!u.hash&&((m.type==='cloudflare'&&['entry','verification'].includes(m.stage))||(config.recordId==='A038'&&m.type==='navigation_timeout'&&m.stage==='entry')))return false;}catch{}}
 }
 if(pricingOnly&&require('../deploy-service/tag-public-catalog.cjs').configured(config)&&m?.url==='https://tagss.pro/'&&((m.type==='native_login_interactive_verification_required'&&m.stage==='normal_login_only')||(m.type==='content_loading_or_layout_changed'&&m.stage==='content_readiness')))return false;
 if(pricingOnly){const nativePublic=require('../deploy-service/held-auth-public-catalog.cjs').specFor(config);if(nativePublic?.independentHistoricalCheckpoints.some(x=>m&&x.type===m.type&&x.url===m.url&&x.stage===m.stage))return false;}
 if(pricingOnly&&require('../deploy-service/ninecloud-public-catalog.cjs').configured(config)){if(m?.type==='navigation_timeout'&&m.stage==='entry'&&['https://shop.starpro.one/','https://starpro.one/'].includes(m.url))return false;if(m?.type==='authentication_not_completed'&&m.stage==='auth'&&m.url==='https://shop.starpro.one/#/login')return false;}
 if(pricingOnly&&require('./cylink-native-session.cjs').obsoletePriceCheckpoint(config,m))return false;
 // The separately validated wallet source is on the same new CYLINK origin as
 // its accepted catalog. Neither source navigates to retired 2cy.now. Preserve
 // that historical challenge; never exempt a current-origin or extra-field job.
 if(config?.fields?.length===2&&config.fields.includes('pricing')&&config.fields.includes('payment')&&config.collectPerformanceReferences===false&&require('../deploy-service/cylink-wallet-channels.cjs').configured(config)&&m?.type==='cloudflare'&&m.stage==='verification'){try{const u=new URL(m.url);if(u.origin==='https://2cy.now'&&!u.search&&!u.hash&&['/','/user/shop'].includes(u.pathname))return false;}catch{}}
 if(pricingOnly&&config.recordId==='A162'&&config.readOnlyRecipe==='kuajie_native_api_readonly'&&config.entryUrl==='https://xdxx.kuajiexx.cfd/'&&m?.type==='public_policy_transport_or_schema_failed'&&m.stage==='public_client_policy'){try{if(new URL(m.url).origin==='https://fdsh.kuajiecloudtttt.xyz')return false;}catch{}}
 if(pricingOnly&&config.recordId==='A172'&&config.readOnlyRecipe==='yuntu_native_api_readonly'&&config.entryUrl==='https://apiapi.ytjcok.com/api/v1/user/plan/fetch'&&config.auth?.mode==='login'&&config.accountReadOnly===true){try{const u=new URL(m?.url);if(u.pathname==='/'&&!u.search&&['','#/'].includes(u.hash)&&((m.type==='entry_origin_changed'&&m.stage==='entry'&&u.origin==='https://ez-theme-for-yt-sub-rjki3.vercel.app')||(m.type==='content_loading_or_layout_changed'&&m.stage==='content_readiness'&&u.origin==='https://vip.ytjcok.org')))return false;}catch{}}
 if(pricingOnly&&config.recordId==='A007'&&config.readOnlyRecipe==='xair_public_pricing'&&config.entryUrl==='https://www.x-air.org/'&&config.publicOnly===true&&config.auth?.mode!=='login'&&m?.type==='login_required'&&m.stage==='auth'&&m.url==='https://www.x-air.org/'&&m.reason==='会话未登录；需要本站显式登录选择器和已有同域凭据')return false;
 // The Renzhe recipe now obeys requested fields. Optional-page CF remains open.
 if(config?.recordId==='A197'&&config.entryUrl==='https://renzhe.cloud/user/shop'&&config.readOnlyRecipe==='renzhe_shop_wallet_and_policies'&&config.auth?.mode==='login'&&config.publicOnly!==true&&config.collectPerformanceReferences===false&&config.fields?.includes('pricing')&&config.fields.every(f=>['pricing','website'].includes(f))&&m?.type==='cloudflare'&&m.stage==='final_capture'){try{const u=new URL(m.url);if(u.origin==='https://renzhe.cloud'&&!u.search&&!u.hash&&['/user/code','/tos','/privacy'].includes(u.pathname))return false;}catch{}}
 if(pricingOnly&&config.recordId==='A021'&&config.entryUrl==='https://www.stentvessel.shop/'&&config.readOnlyRecipe==='ytoo_native_public_catalog'&&config.publicOnly===true&&!config.auth){if(m?.url==='https://y-too.net/cart.php'&&((m.type==='cloudflare'&&m.stage==='entry')||(m.type==='source_unavailable'&&m.stage==='source_availability')))return false;if(m?.type==='entry_origin_changed'&&m.stage==='entry'&&m.url===config.entryUrl)return false;}
 // A080's accepted native-app task never uses the retired origins or old
 // dashboard menu click. Keep those records open; current recipe failures have
 // distinct night_* checkpoint types and must still prevent weekly collection.
 if(config?.fields?.length===3&&['pricing','website','payment'].every(f=>config.fields.includes(f))&&config.collectPerformanceReferences===false&&require('../deploy-service/night-native-app.cjs').configured(config)&&m){
  if(m.type==='cloudflare'&&m.stage==='verification'&&['https://www.night-furyx.com/index.php','https://ac.goyesha.com/'].includes(m.url))return false;
  if(m.type==='login_required'&&m.stage==='auth'&&m.url==='https://mm.goyesha.com/index.php#/login'&&m.reason==='会话未登录；需要本站显式登录选择器和已有同域凭据')return false;
  if(m.type==='native_waf_entry_not_cleared'&&m.stage==='entry_continue'&&m.url==='https://mm.goyesha.com/'&&m.reason==='本站正常可见入口验证未清除；不提交账号或交易请求')return false;
  if(m.type==='content_readiness_timeout'&&m.stage==='entry'&&m.url==='https://mm.goyesha.com/index.php#/dashboard'&&m.reason?.startsWith('locator.click: Timeout 3000ms exceeded.')&&m.reason.includes('Purchase Subscription')&&m.reason.includes('n-modal-mask'))return false;
 }
 return true;}
module.exports={blocksOfficialPricing};
