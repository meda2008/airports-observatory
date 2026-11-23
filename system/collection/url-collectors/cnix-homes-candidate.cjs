'use strict';
// This is a candidate assessor, not an operator-price or performance parser.
const origin='https://cnix.homes';
function assessCandidate({url,scriptUrl,scriptBody}){
 if(url!==origin+'/'||scriptUrl!==origin+'/assets/js/main.js'||typeof scriptBody!=='string')return null;
 const generatedCounters=/Math\.random\(\)/.test(scriptBody)&&/baseUsers|server-load/.test(scriptBody);
 return{recordId:'A032',origin,identityVerified:false,officialPricingAdmission:false,livePerformanceAdmission:false,signals:generatedCounters?['client_generated_display_counters']:[],reason:generatedCounters?'公开脚本使用随机数更新显示计数；不作为实时监控或独立测速证据，且未取得原CNIX商户绑定。':'缺少原商户归属证据；不因同名或自称官网升级。'};
}
module.exports={origin,assessCandidate};
