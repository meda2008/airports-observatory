'use strict';
const origin='https://t.me',channel='eggtartcloud';
function extract(s){const u=new URL(s.url);if(u.origin!==origin||u.pathname!=='/s/'+channel)return null;const text=s.text||'',quote='小本生意 尽力而为 服务不满可以工单交流我们尽力帮你解决 实在不满也可以走支付原路退款',caseQuote='已为今早在群组内公开侮辱机场的两位用户全额退款并提交spam给nmbot团队进行处理。';
 if(!text.includes(quote)||!text.includes(caseQuote))return null;
 const times=s.timeMetadata||[],a=times.find(t=>t.permalink==='https://t.me/eggtartcloud/244'),b=times.find(t=>t.permalink==='https://t.me/eggtartcloud/326');if(a?.dateTime!=='2024-01-29T10:58:43+00:00'||b?.dateTime!=='2024-04-25T05:33:02+00:00')return null;
 const ids=[s.evidenceId].filter(Boolean),observedAt=s.capturedAt||s.observedAt;
 return{refund:{status:'not_confirmed',summary:'已取得蛋挞官方频道两段历史退款原文：2024-01-29帖提到不满可工单交流、走支付原路退款；2024-04-25帖声称为两名特定用户全额退款。当前统一退款资格、时限和执行仍未确认，不能作为今天购买后的退款保证。',quote,sourceUrl:s.url,observedAt,sourceIds:ids,executionVerified:false,currentPolicyConfirmed:false,policyStatements:[{quote,publishedAt:a.dateTime,sourceUrl:a.permalink,observedAt,sourceIds:ids,scope:'历史一般表述，当前适用性未核'},{quote:caseQuote,publishedAt:b.dateTime,sourceUrl:b.permalink,observedAt,sourceIds:ids,scope:'个别退款案例的站方自述，不是普遍退款条款'}],conditions:['两帖发布时间均在2024年；采集时间另列，不把旧帖改成当前政策。','只证明本次公开频道仍展示这些文字；未取得发布当时的快照，不能排除后续编辑。','个别用户退款与封禁的站方声明未经独立核验；不推断其他用户均可退款。','官网原生公告指向这个通知频道；同一经营方信号，不是两个独立来源。','此项保持not_confirmed，不减少当前退款条件缺项数。']}};
}
module.exports={origin,recordIds:['A077'],fields:['refund'],extract};
