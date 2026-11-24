'use strict';
const origin='https://www.bianjiecloud.com';
const scopes={
 '/help/getting-started':{title:'边界云新手指南：从注册到第一次连接',clauses:['一个账号能在几台设备上用？ 不限设备数量，电脑、手机、平板可以同时登录，所有设备共用套餐流量。','iPhone 有官方 App 吗？ 暂时没有。iPhone、iPad 可以用 Shadowrocket 导入订阅，步骤见 iPhone 使用教程。']},
 '/help/client-compare':{title:'官方客户端和 Clash Verge Rev、Shadowrocket 怎么选：边界云客户端对比',clauses:['官方客户端和第三方客户端能同时用吗？ 同一台设备上不要同时开启，两个客户端会抢占网络设置，导致连不上。','路由器能用吗？ 支持 Clash 的路由器固件可以导入 clash_meta 订阅链接，具体设置请参考固件自己的说明。']}
};
function extract(snapshot,{prior={}}={}){
 const u=new URL(snapshot.url);if(u.origin!==origin)throw Error('collector_origin_mismatch');
 const core=prior.coreInfo||prior,body=snapshot.body||snapshot.text||'',observedAt=snapshot.observedAt||snapshot.capturedAt,sourceIds=[snapshot.evidenceId].filter(Boolean),pageUpdatedAt=body.match(/更新于 (\d{4}-\d{2}-\d{2})/)?.[1]||null;
 if(u.pathname==='/help/line-coverage'&&body.includes('边界云线路怎么样：线路覆盖、连接方式与服务承诺')&&body.includes('边界云有免费试用吗？ 目前没有免费试用。第一次使用可以先买周期短的套餐或按量流量包体验。'))return{trial:{...core.trial,status:'operator_no_free_trial_stated',summary:'官网帮助明确表示目前没有免费试用；短周期套餐或按量包体验均需付费。',quote:'边界云有免费试用吗？ 目前没有免费试用。第一次使用可以先买周期短的套餐或按量流量包体验。',conditions:['站方声明，不等于已实际验证所有账号或未来活动。'],observedAt,pageUpdatedAt,sourceUrl:snapshot.url,sourceIds:[...new Set([...(core.trial?.sourceIds||[]),...sourceIds])],executionVerified:false,historicalStatement:core.trial?.historicalStatement||core.trial||null}};
 const rule=scopes[u.pathname];if(!rule||!body.includes(rule.title)||!rule.clauses.every(c=>body.includes(c)))return null;
 const old=core.compatibility||{},statement={scope:u.pathname,quote:rule.clauses.join('\n'),conditions:rule.clauses,observedAt,pageUpdatedAt,sourceUrl:snapshot.url,sourceIds};
 return{compatibility:{...old,status:'operator_requirements_observed',conditionObservations:[...(old.conditionObservations||[]).filter(s=>s.scope!==u.pathname),statement],sourceIds:[...new Set([...(old.sourceIds||[]),...sourceIds])],independentlyTested:false}};
}
module.exports={origin,recordIds:['A170'],fields:['trial','compatibility'],extract};
