'use strict';
// A guide is an operator statement, never proof of app availability or a VPN test.
function fromGuide(snapshot,{origin,code,brand},{prior={}}={}){
 if(new URL(snapshot.url).origin!==origin)throw Error('collector_origin_mismatch');
 const body=snapshot.body||snapshot.text||'';
 const quote='1、 因为该应用不支持国区下载，所以需要登录外区账号下载，可以向客服获取免费外区账号。软件名称：【Nextin】';
 if(!body.includes(quote)||!body.includes('专属码【'+code+'】'))return null;
 const old=(prior.coreInfo||prior).compatibility||{},sourceIds=[snapshot.evidenceId].filter(Boolean),observedAt=snapshot.observedAt||snapshot.capturedAt;
 const condition=brand+'站内iOS教程称使用Nextin、识别码'+code+'，并称不支持国区下载；仅为站方说明，未核验App归属、商店可下载性或实际兼容。';
 const conditions=[condition,'未领取共享Apple账号、联系支持、安装客户端、授权VPN或测试线路。'];
 if(brand==='光速云'){const conflict='2、下载客户端在 App Store 搜索【光速云】下载并安装安装完成点击【打开】';if(!body.includes(conflict))return null;conditions.push('同篇另称在App Store搜索“光速云”，与Nextin名称表述不一致；暂不据此确认正确App。');}
 const observations=(old.conditionObservations||[]).filter(o=>o.scope!=='operator_ios_guide_not_independent_app_verification');
 observations.push({scope:'operator_ios_guide_not_independent_app_verification',quote,conditions,observedAt,sourceIds});
 return{compatibility:{...old,status:'operator_requirements_observed',summary:old.summary||condition,requirements:[...new Set([...(old.requirements||[]),...conditions])],sourceIds:[...new Set([...(old.sourceIds||[]),...sourceIds])],observedAt:old.observedAt||observedAt,conditionObservations:observations,independentlyTested:false}};
}
module.exports={fromGuide};
