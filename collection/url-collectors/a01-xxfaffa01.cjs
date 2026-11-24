'use strict';
const origin='https://a01.xxfaffa01.cc',title='每个套餐的区别是什么？我该如何选择呢？';
const clauses=['【普通套餐】：每30天110G流量，最大代理速率为300Mbps，最大设备数为3个IP。','【高级套餐】：每30天220G流量，最大带宽速率为500Mbps，最大设备数为5个IP。','【专业套餐】：每30天440G流量，最大带宽速率为1000Mbps，最大设备数为10个IP。','【企业套餐】：每30天1000G流量，最大带宽速率为1000Mbps，不限制设备IP数量。'];
function extract(s,{prior={}}={}){
 const u=new URL(s.url),core=prior.coreInfo||prior,text=s.text||'';
 if(u.origin!==origin||u.hash!=='#/help'||!text.includes(title)||!clauses.every(q=>text.includes(q)))return null;
 const c=core.compatibility||{},sourceIds=[s.evidenceId].filter(Boolean),updated=/官方版本V7\.2\.5客户端上线,原来V3\.1\.8 即时失效/.test(text);
 return{compatibility:{...c,status:'operator_requirements_observed',summary:'小旋风当前帮助FAQ把普通/高级/专业套餐分别写为3/5/10个IP，企业套餐不限设备IP数量；与已存商店“不限制设备”说法存在范围冲突。'+(updated?'当前公告称官方客户端V7.2.5上线、原V3.1.8即时失效；适用系统范围未说明。':''),requirements:[...(c.requirements||[]).filter(q=>!updated||!/^Lite通知只明确/.test(q)),'FAQ用“设备数”和“IP”混写；公网IP数量不能等同终端设备数，不推定多个终端共用IP的授权。','该FAQ中的300/500/1000Mbps为站方标称上限，不是实测速度。',...(updated?['当前官方客户端版本公告取代旧3.1.8推荐，不扩大成所有第三方客户端或所有平台必须使用V7.2.5。']:[])],historicalRequirements:[...(c.historicalRequirements||[]),...(updated?(c.requirements||[]).filter(q=>/^Lite通知只明确/.test(q)).map(quote=>({quote,observedAt:c.observedAt,sourceIds:c.sourceIds,status:'superseded_by_current_official_client_notice'})):[])],conditionObservations:[...(c.conditionObservations||[]).filter(o=>o.scope!==title),{scope:title,quote:clauses.join('\n'),conditions:['套餐FAQ的IP数限制与商店泛称不限设备并存，须向站方核实具体执行。'],sourceIds,sourceUrl:s.url,observedAt:s.capturedAt}],sourceIds:[...new Set([...(c.sourceIds||[]),...sourceIds])],observedAt:s.capturedAt,independentlyTested:false}};
}
module.exports={origin,recordIds:['A061'],fields:['compatibility'],collectMany:require('./xxf-visible-store-tabs.cjs').collectMany,extract};
