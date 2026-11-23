'use strict';
const origin='https://downloadshare.breezenetttt.sbs';
function extract(snapshot,{prior={}}={}){
 if(new URL(snapshot.url).origin!==origin)throw Error('collector_origin_mismatch');
 const body=snapshot.body||snapshot.text||'';
 const quote='Android\n2\nAndroid 5.0+\niOS\n1\niOS 12.0+\nmacOS\n1\nmacOS 10.15+\nWindows\n1\nWindows 10+';
 if(!body.includes('客户端下载')||!body.includes(quote))return null;
 const old=(prior.coreInfo||prior).compatibility||{},conditions=['官网下载中心列出的客户端系统要求：Android 5.0+、iOS 12.0+、macOS 10.15+、Windows 10+。'];
 const observedAt=snapshot.observedAt||snapshot.capturedAt,sourceIds=[snapshot.evidenceId].filter(Boolean),observations=(old.conditionObservations||[]).filter(o=>o.quote!==quote);
 observations.push({scope:'operator_client_download_UI_not_all_third_party_clients',quote,conditions,observedAt,sourceIds});
 return{compatibility:{...old,status:'operator_requirements_observed',summary:old.summary||'官网下载中心列出四个平台客户端的系统版本要求；未进行安装或线路实测。',requirements:[...new Set([...(old.requirements||[]),...conditions])],sourceIds:[...new Set([...(old.sourceIds||[]),...sourceIds])],observedAt:old.observedAt||observedAt,conditionObservations:observations,independentlyTested:false}};
}
module.exports={origin,recordIds:['A155'],fields:['compatibility'],extract};
