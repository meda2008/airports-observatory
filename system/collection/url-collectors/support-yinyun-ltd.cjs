'use strict';
const origin='https://support.yinyun.ltd',route='/hc/help/articles/1768189353-';
function extract(s,{prior={}}={}){
 const u=new URL(s.url),text=s.text||'';if(u.origin!==origin||u.pathname!==route||!/^快速入门指南$/m.test(text)||!text.includes('免费时长：3 × 24小时（从注册账号开始）')||!text.includes('模式：通用订阅模式 / 客户端模式')||!text.includes('节点：全部可用')||!text.includes('最近更新时间为 Feb 05, 2026'))return null;
 const core=prior.coreInfo||prior,patch={};
 if(core.trial?.observedAt!==s.capturedAt||core.trial?.status!=='operator_trial_stated')patch.trial={status:'operator_trial_stated',summary:'当前获准只读采集的隐云面板原生帮助站声明：新注册账号起3×24小时免费试用，通用订阅/专属客户端两种模式、全部可用节点。未实际试用。',quote:'免费时长：3 × 24小时（从注册账号开始）\n模式：通用订阅模式 / 客户端模式\n节点：全部可用',conditions:['以原文“从注册账号开始”为起点；不据此保证现有账号、重新注册或所有用户都能获得试用。','仅绑定当前隐云候选面板原生链接的帮助资料；与旧IP入口的法律主体及连续经营未独立核实。','本轮未创建新账号、没有领取或测试试用，不推断试用实际有效。'],identityScope:'current_user_authorized_yinyun_named_panel_help_only',observedAt:s.capturedAt,pageUpdatedAt:'2026-02-05',sourceUrl:s.url,sourceIds:[s.evidenceId].filter(Boolean),executionVerified:false};
 const p=core.payment,quote='隐云支持支付宝、微信、USDT(TRC20)支付';
 if(text.includes(quote)&&p?.methods?.includes('PayPal')&&p.checkoutObserved!==true&&p.transactionVerified!==true&&!p.statementObservations?.some(o=>o.quote===quote&&o.observedAt===s.capturedAt)){
  const old=p.observations?.length?p.observations:[{...p}],current={methods:['支付宝','微信支付','USDT (TRC20)'],quote,sourceUrl:s.url,observedAt:s.capturedAt,pageUpdatedAt:'2026-02-05',sourceIds:[s.evidenceId].filter(Boolean),evidenceLevel:'operator_help_statement',checkoutObserved:false};
  patch.payment={...p,status:'operator_statements_differ_checkout_not_verified',evidenceLevel:'operator_help_statement',label:'站方多份资料声明，渠道口径存在差异',statementType:'merged_scoped_operator_statements',methods:[...new Set([...p.methods,...current.methods])],observedAt:s.capturedAt,sourceIds:[...new Set([...(p.sourceIds||[]),...current.sourceIds])],quote,summary:'旧商店FAQ列支付宝、微信、PayPal；当前读取的原生帮助指南列支付宝、微信、USDT(TRC20)。列表为两份声明的并集，不证明四种渠道当前同时可用。',reason:'新指南没有提PayPal，不据此认定PayPal下线；页面更新日2026-02-05与采集日期分列，也不能推断它比无更新日的旧FAQ更新。仅当前获准读取的隐云候选面板帮助声明，未进入收银台或付款，旧IP主体连续性未核。',statementObservations:[...old.map(o=>({methods:o.methods,quote:o.quote,observedAt:o.observedAt,sourceIds:o.sourceIds,evidenceLevel:o.evidenceLevel,sourceUrl:o.sourceUrl||null,checkoutObserved:false})),current],observations:[...old,current],checkoutObserved:false,transactionVerified:false};
 }
 return Object.keys(patch).length?patch:null;
}
module.exports={origin,recordIds:['A180'],fields:['trial','payment'],extract};
