'use strict';
// CYLINK native client auth.js SHA256 93b51b00ad95cf93f37817749e8abca25a040c0ee0cfd02b68aab54a0f6945ce:
// success callback reads ret === 1 then reloads; protected shop redirects fresh anonymous contexts to /auth/login.
const fs=require('node:fs'),crypto=require('node:crypto');
const origin='https://cylink.go443.pro',clientSha='93b51b00ad95cf93f37817749e8abca25a040c0ee0cfd02b68aab54a0f6945ce';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function configured(c){return c?.recordId==='A046'&&c.entryUrl===origin+'/user/shop'&&c.publicOnly===false&&c.accountReadOnly===true&&c.auth?.mode==='login'&&c.readOnlyRecipe==='cylink_authenticated_catalog_readonly';}
function shopVisible(s){return s?.url===origin+'/user/shop'&&!s.passwordForm&&!s.type&&!s.agreementCheckbox&&!s.verificationWidgetObserved&&s.title==='套餐商店 — CYLINK'&&['CYLINK\n用户中心\n我的钱包\n套餐商店\n节点列表\n邀请注册\n我的账号','套餐商店\n购买流量包','2020© CYLINK\nSSPANEL\nMetron'].every(x=>String(s.text||s.body||'').includes(x));}
function create(config,{credential,stateFile,clock=Date.now}={}){
 const enabled=configured(config)&&credential?.origin===origin&&typeof credential.email==='string'&&!!stateFile,account=enabled?hash(credential.email.trim().toLowerCase()):null,file=stateFile+'.cylink-proof';let pending=Promise.resolve(),successAt=null,rejected=false,restored=false;
 // Native cookie validity is rechecked by the live protected shop on every run; do not expire proof just before a weekly tick.
 if(enabled)try{const p=JSON.parse(fs.readFileSync(file,'utf8')),bytes=fs.readFileSync(stateFile);if(p.schema==='cylink-native-session.v1'&&p.origin===origin&&p.accountHash===account&&p.clientSha256===clientSha&&p.stateSha256===hash(bytes)&&Number.isFinite(Date.parse(p.authenticatedAt))&&Number.isFinite(Date.parse(p.shopObservedAt))&&Date.parse(p.authenticatedAt)<=Date.parse(p.shopObservedAt)&&Date.parse(p.shopObservedAt)<=clock()){successAt=p.authenticatedAt;restored=true;}}catch{}
 return {
 observe(response){if(!enabled)return;try{const req=response.request();if(req.method()!=='POST'||response.url()!==origin+'/auth/login'||response.status()!==200)return;pending=(async()=>{const b=await response.text();if(b.length>16000)return;let j;try{j=JSON.parse(b);}catch{return;}if(j.ret===1){successAt=new Date(clock()).toISOString();restored=false;}else if(j.ret===0||j.ret===2){rejected=true;successAt=null;}})().catch(()=>{});}catch{}},
 async accept(snapshot,context){await pending;if(!enabled||rejected||!successAt||!shopVisible(snapshot))return{observed:false,basis:'cylink_native_success_and_protected_shop_not_both_observed'};await context.storageState({path:stateFile});fs.chmodSync(stateFile,0o600);const p={schema:'cylink-native-session.v1',origin,accountHash:account,authenticatedAt:successAt,clientSha256:clientSha,stateSha256:hash(fs.readFileSync(stateFile)),shopObservedAt:new Date(clock()).toISOString()};fs.writeFileSync(file,JSON.stringify(p),{mode:0o600});return{observed:true,basis:restored?'saved_native_success_bound_session_and_protected_shop':'native_login_ret_1_and_protected_shop',credentialsExported:false};}
 };
}
module.exports={configured,shopVisible,create};

// Keep the old 2cy.now CF checkpoints open, but do not schedule that retired entry for the verified new pricing-only route.
function obsoletePriceCheckpoint(config,material){if(!configured(config)||config.reconcileVerifiedCheckpoints!==true||config.fields?.length!==1||config.fields[0]!=='pricing'||config.collectPerformanceReferences!==false||material?.type!=='cloudflare'||material.stage!=='verification')return false;try{const u=new URL(material.url);return u.origin==='https://2cy.now'&&!u.search&&!u.hash&&['/','/user/shop'].includes(u.pathname);}catch{return false;}}
module.exports.obsoletePriceCheckpoint=obsoletePriceCheckpoint;
