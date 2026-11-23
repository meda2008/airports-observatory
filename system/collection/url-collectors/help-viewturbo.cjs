'use strict';
const origin='https://help.viewturbo.com',quote='ViewTurbo supports up to 10 devices: 2 each for Linux, Windows, iOS/Apple, macOS, and Android.';
function extract(snapshot,{prior={}}={}){
 const u=new URL(snapshot.url);if(u.origin!==origin)throw Error('collector_origin_mismatch');
 if(u.pathname!=='/'||!(snapshot.body||snapshot.text||'').includes(quote))return null;
 const core=prior.coreInfo||prior,old=core.compatibility||{},sourceIds=[snapshot.evidenceId].filter(Boolean);
 const o={scope:'官方帮助首页设备配额FAQ',quote,conditions:['合计最多10台，Linux、Windows、iOS/Apple、macOS、Android各2台；不能解释为任意系统可占10台。','站方没有说明同时在线、注册设备或替换设备的具体执行口径，未实测。'],observedAt:snapshot.observedAt||snapshot.capturedAt,pageUpdatedAt:null,sourceUrl:snapshot.url,sourceIds};
 return{compatibility:{...old,conditionObservations:[...(old.conditionObservations||[]).filter(c=>c.scope!==o.scope),o],sourceIds:[...new Set([...(old.sourceIds||[]),...sourceIds])],independentlyTested:false}};
}
module.exports={origin,recordIds:['A057'],fields:['compatibility'],extract};
