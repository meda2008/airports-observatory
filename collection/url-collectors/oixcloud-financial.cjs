'use strict';
const origin='https://oixcloud.com',methods=['支付宝','微信','USDT (TRC20)','USDT (Polygon)','USDT (BSC)'];
const sourceIds=s=>[s.evidenceId].filter(Boolean),stamp=s=>s.capturedAt||s.observedAt;
const scope='仅当前oixCloud关联服务；与A015/A184同源，不证明旧Dler经营主体连续或旧账户权益继承。';
function paragraph(text,lead){return text.split(/\n+/).map(v=>v.trim()).find(v=>v.startsWith(lead))||null;}
function history(old,quote){return old?.quote&&old.quote!==quote?[...(old.previousObservations||[]),{...old,previousObservations:undefined}]:old?.previousObservations||[];}
function extract(s,{prior={}}={}){
 const u=new URL(s.url),text=s.text||s.body||'',core=prior.coreInfo||prior,observedAt=stamp(s),ids=sourceIds(s);
 if(u.origin!==origin||(s.recordId&&!['A015','A184'].includes(s.recordId))||!Number.isFinite(Date.parse(observedAt))||s.passwordForm||s.verificationWidgetObserved||/加载支付方式中|正在加载可用支付方式/.test(text))return null;
 if(u.pathname==='/user/v2/counter'){
  const buttons=(s.buttons||[]).map(v=>v.trim()),selected=s.selectedMethod;
  if(s.captureKind!=='oix_counter_methods_and_selected_fee_v1'||!buttons.includes('登出')||!methods.every(m=>buttons.includes(m))||!methods.includes(selected)||!text.includes('实际以人民币充值，美元金额仅供参考'))return null;
  const hint=selected==='支付宝'?'支付宝充值提示':selected==='微信'?'微信充值提示':'仅支持 '+selected+'，付款有效期 60 分钟';
  if(!text.includes(hint))return null;
  const fee=text.match(/当前支付方式手续费为\s*(\d+(?:\.\d+)?)%/),noFee=text.includes('当前支付方式无平台手续费');if(!fee&&!noFee)return null;
  const rawFeeQuote=fee?fee[0]:'当前支付方式无平台手续费',quote=methods.join(' / '),old=core.payment||{};
  const feeStatements=new Map((old.feeStatements||[]).map(v=>[v.method,v]));feeStatements.set(selected,{method:selected,ratePercent:fee?Number(fee[1]):0,quote:rawFeeQuote,scope:'当前账号充值页面选中此渠道时的站方显示；未核实际扣款',observedAt,sourceUrl:s.url,sourceIds:ids,...(noFee?{externalFeeQuote:paragraph(text,'交易所提现手续费另计')}:{})});
  return{payment:{...old,status:'operator_wallet_channels_observed_not_transaction_verified',evidenceLevel:'authenticated_checkout',statementType:'authenticated_topup_method_selector_no_order',label:'已登录充值收银台选项',methods,summary:'当前收银台列支付宝、微信与USDT的TRC20/Polygon/BSC网络；仅观察渠道及所选渠道的费用说明。',quote,conditions:['渠道按钮可见不等于支付一定可成功；未输入金额、点击支付、创建订单或验证到账。','仅USDT当前选中网络显示付款有效期60分钟、无平台手续费，交易所提现手续费另计。',scope],observedAt,sourceUrl:s.url,sourceIds:[...new Set([...ids,...Object.values(old.feeStatements||[]).flatMap(v=>v.sourceIds||[])])],feeStatements:[...feeStatements.values()],checkoutObserved:true,transactionVerified:false,previousObservations:history(old,quote),sourceGroupId:'oixcloud_current_authenticated_store',legacyContinuityVerified:false,operatorIdentityVerified:false}};
 }
 if(u.pathname==='/tos'){
  const date=text.match(/最后修订日期：\s*(\d{4})年(\d{1,2})月(\d{1,2})日/),quote=paragraph(text,'价格、币种、周期、税费和可用支付方式'),balance=paragraph(text,'套餐管理中明确提供的未使用套餐退至余额功能');
  if(!date||!quote?.includes('付款、充值和账户余额不可退款')||!quote.includes('适用法律强制要求')||!balance?.includes('不构成原路退款或余额提现'))return null;
  const pageUpdatedAt=[date[1],date[2].padStart(2,'0'),date[3].padStart(2,'0')].join('-'),old=core.refund||{},usage=paragraph(text,'转借、共享、合租、转售账户');
  const refund={...old,status:'stated_terms_not_execution_verified',summary:'当前oixCloud条款称付款、充值和余额通常不退款、不提现，适用法律强制权利除外；套餐管理明确提供的合资格未使用套餐仅可退至账户余额。',quote:quote+'\n'+balance,conditions:['服务中断、性能波动或终止不产生退款、抵扣、延期或赔偿；支付记录异常可工单核查，但不承诺退款。','购买时明确列示的特定条件和条款共同适用；页面修订日期是站方声明，不证明实际发布历史。',scope],pageUpdatedAt,observedAt,sourceUrl:s.url,sourceIds:ids,executionVerified:false,previousObservations:history(old,quote+'\n'+balance),sourceGroupId:'oixcloud_current_authenticated_store',legacyContinuityVerified:false};
  if(!usage?.includes('除非产品明确允许'))return{refund};
  const oldC=core.compatibility||{};return{refund,compatibility:{...oldC,status:'operator_requirements_observed',summary:oldC.summary||'当前条款禁止未经产品明确允许的账户、订阅链接或服务共享、合租和转售；此项仅补使用条件，不提供设备数或客户端实测结论。',requirements:[...new Set([...(oldC.requirements||[]),usage,scope])],quote:usage,sourceIds:[...new Set([...(oldC.sourceIds||[]),...ids])],sourceUrl:s.url,observedAt,independentlyTested:false}};
 }
 if(u.pathname==='/privacy_policy'){
  const date=text.match(/生效日期：\s*(\d{4})\/(\d{2})\/(\d{2})/),login=paragraph(text,'登录安全与客户端信息：'),billing=paragraph(text,'支付与账单记录：'),third=paragraph(text,'服务运行可能使用第三方网络');
  if(!date||!login?.includes('90 天未出现即删除')||!login.includes('活动历史保留 30 天')||!billing||!third?.includes('AI 服务商处理'))return null;
  const quote=billing+'\n'+login+'\n'+third,old=core.privacy||{};
  return{privacy:{...old,status:'operator_policy_observed',summary:'站方政策声明保存账户、连接会话、用量、账单及登录安全信息；安装标识仅保存哈希及出现时间，90天未出现删除；设备API活动历史保留30天。启用AI辅助功能时，相关服务单及上下文可能发送AI服务商。',quote,conditions:['30天/90天仅针对上述特定数据，不是所有数据的统一删除承诺。','该设备活动采样不保存来源IP、不记录浏览内容，不等于所有登录或服务日志均不记录IP。','独享IP分配记录随账户删除；其他数据保留范围及实际执行没有独立审计。',scope],pageUpdatedAt:date.slice(1).join('-'),observedAt,sourceUrl:s.url,sourceIds:ids,independentlyAudited:false,previousObservations:history(old,quote),sourceGroupId:'oixcloud_current_authenticated_store',legacyContinuityVerified:false}};
 }
 return null;
}
module.exports={origin,methods,extract};
