'use strict';
const crypto=require('node:crypto');
const ADMIN_FLAGS=new Set(['enabled','validateWhileDisabled','reconcileVerifiedCheckpoints']);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function executionConfig(config){if(!config||Array.isArray(config)||!/^A\d{3}$/.test(config.recordId||''))return null;return canonical(Object.fromEntries(Object.entries(config).filter(([k])=>!ADMIN_FLAGS.has(k))));}
function administrativeRevisionCompatible(previous,current){const a=executionConfig(previous),b=executionConfig(current);return !!a&&!!b&&JSON.stringify(a)===JSON.stringify(b);}
function executionConfigHash(config){const value=executionConfig(config);return value?crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'):null;}
function nativeReplacementProof(config,run,documents){
 if(!['A049','A162'].includes(config.recordId)||run.capabilities?.login?.status!=='session_observed'||run.capabilities?.nativeApi?.status!=='verified'||run.capabilities.nativeApi.authenticatedCheck!=='user_info'||run.capabilities.nativeApi.accountIdentityVerified!==true||!require('../deploy-service/two-site-native-login.cjs').configured(config))return null;
 try{
  const contract=require(config.recordId==='A049'?'../collection/url-collectors/yangfan-native-plans.cjs':'../collection/url-collectors/kuajie-native-plans.cjs');
  const plan=documents.find(d=>d.evidenceId&&d.url===contract.url&&d.metadata?.authenticationObserved===true&&d.metadata.representation==='original_native_plan_http_json');if(!plan)return null;
  let unit,publisher;
  if(config.recordId==='A049')unit=documents.find(d=>d.evidenceId&&d.url===contract.clientUrl&&contract.reviewedClient(d.body));
  else{unit=documents.find(d=>contract.unitEvidence(d));const p=require('../collection/inline-domain-publisher.cjs');publisher=documents.find(d=>d.evidenceId&&d.url===p.origin+'/'&&d.metadata?.representation==='original_inline_publisher_html'&&p.anchors(d.body).some(a=>new URL(a.url).origin===contract.origin));if(!publisher)return null;}
  if(!unit)return null;
  return{kind:'authenticated_native_catalog_entry_replacement',origin:contract.origin,siteId:config.recordId,evidenceIds:[plan.evidenceId,unit.evidenceId,...(publisher?[publisher.evidenceId]:[])],oldEntryOrigins:config.recordId==='A049'?['https://yangfanyun.net']:['https://fdsh.kuajiecloudtttt.xyz'],originalEntryRetested:false};
 }catch{return null;}
}
function replacementEligibility(checkpoint,proof){const p=proof.nativeCatalogReplacement,c=checkpoint.material||{},old=checkpoint.originalConfig||{};if(!p||!proof.loginVerified||old.recordId!==proof.siteId)return null;
 try{const u=new URL(c.url);if(!p.oldEntryOrigins.includes(u.origin)||new URL(old.entryUrl).origin!==u.origin)return null;
 if(!['entry','auth','verification','final_capture','content_readiness'].includes(c.stage))return null;
 const types=proof.siteId==='A049'?['content_loading','content_loading_or_layout_changed','auth_adapter_changed','login_required']:['content_loading','navigation_timeout','access_gate'];
 if(!types.includes(c.type))return null;
 return{ok:true,nativeCatalogEntryReplaced:true,previousOrigin:u.origin,currentOrigin:p.origin,originalEntryRetested:false};
 }catch{return null;}}
function ownedNinebarLoginPage(checkpoint,proof){const m=checkpoint.material||{},origin=require('./ninebar-visible-session.cjs').origins[proof.siteId];if(!origin||!proof.loginVerified||!proof.ninebarOwnedCatalog||!['image_captcha','captcha_input'].includes(m.type)||!['entry','verification','auth'].includes(m.stage)||checkpoint.originalConfig?.recordId!==proof.siteId)return false;try{const u=new URL(m.url);return u.origin===origin&&u.pathname==='/login'&&!u.search&&!u.hash&&new URL(checkpoint.originalConfig.entryUrl).origin===u.origin;}catch{return false;}}
function ninebarOwnedCatalog(config,documents){if(!require('./ninebar-visible-session.cjs').configured(config))return false;const origin=require('./ninebar-visible-session.cjs').origins[config.recordId];return documents.some(d=>d.url===origin+'/purchase'&&d.metadata?.authenticationObserved===true);}
module.exports={administrativeRevisionCompatible,executionConfigHash,nativeReplacementProof,replacementEligibility,ownedNinebarLoginPage,ninebarOwnedCatalog};
