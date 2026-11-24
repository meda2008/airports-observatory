'use strict';
const origin='https://forest-01.com';
const identity='仅描述现登记候选域名的Forest页面；与旧目录Nutbit/坚果的名称沿革、法律主体和历史连续经营未核实。';
function extract(s,{prior={}}={}){
 const u=new URL(s.url);if(u.origin!==origin)throw Error('forest_origin_mismatch');
 const text=s.text||s.body||'',at=s.capturedAt||s.observedAt,ids=[s.evidenceId].filter(Boolean),core=prior.coreInfo||prior;
 if(u.pathname==='/profile'&&s.walletPreview===true&&s.authenticationObserved&&!s.passwordForm&&s.amountEntered===false&&s.paymentActionClicked===false){
  const options=s.paymentOptions?.map(o=>o.label);if(!options||JSON.stringify(options)!==JSON.stringify(['支付宝','微信','支付宝-微信 2','支付宝-微信','USDT-Trc20']))return null;
  return{payment:{status:'operator_wallet_channels_observed_not_transaction_verified',methods:['支付宝','微信','USDT-Trc20'],summary:'当前Forest账户余额充值配置列支付宝、微信、USDT-Trc20，另列“支付宝-微信 2”和“支付宝-微信”复合渠道标签；未输入金额、前往支付或建单。',quote:s.dialogText||text.slice(text.lastIndexOf('余额充值')),sourceUrl:s.url,observedAt:at,sourceIds:ids,checkoutObserved:false,transactionVerified:false,conditions:[identity,'数字2只是原始渠道标签的一部分，不能解释为手续费、金额或另一个独立支付网络。','只证明本次充值配置显示这些选项，手续费、门槛、实际可付款和到账未验证。','没有创建订单；配置关闭状态的操作收据独立保留，不作为支付方式成立的前提。'],methodOptions:options}};
 }
 if(u.pathname==='/plan'&&s.forestSelection&&s.panelCount===1&&Array.isArray(s.planCards)){
  const v=s.forestSelection,monthly=s.selectedTab==='按周期购买',card=s.planCards.find(c=>c.name===v.productName),allowed=monthly?['轻量','高级','旗舰']:s.selectedTab==='按流量购买'?['不限时200G']:[];
  if(!allowed.includes(v.productName)||v.period!==(monthly?'月付':'一次性')||v.periodLabel!==v.period||v.purchaseClicked!==false||v.selectedProductCount!==1||v.selectedPeriodCount!==1||!card||card.text!==v.productLabel||!text.includes(card.text)||!text.includes(v.priceText))return null;
  const price=/^¥(\d+(?:\.\d{1,2})?) 立即购买$/.exec(v.priceText),quota=/包含流量\s*([\d,]+) GB/.exec(card.text),device=/限制(\d+)台设备使用/.exec(card.text);if(!price||!quota||!device)return null;
  const locator={kind:'body_utf16_range',start:0,end:text.length,quoteSha256:require('node:crypto').createHash('sha256').update(text).digest('hex')};
  const p={name:'Forest · '+v.productName,productName:'Forest · '+v.productName,amount:Number(price[1]),amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',billingPeriod:v.period,quota:monthly?'每月'+quota[1].replaceAll(',','')+'GB':quota[1].replaceAll(',','')+'GB总量',quotaReset:monthly?'仅本次月付选择；页面称每月流量，实际重置未实测。':'站方称不限时，不推断每月重置。',deviceLimit:device[1]+'台（站方声明，非实测）',quote:text,sourceLocator:locator,semanticSelection:{productName:v.productName,period:v.period,priceText:v.priceText},sourceIds:ids,sourceUrl:s.url,observedAt:at,checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:[identity,'仅已选套餐及已选周期的显示价；没有点击立即购买、输入优惠码、建单或付款。']};
  const plans=[...(core.pricing?.plans||[]).filter(x=>!(x.name===p.name&&x.billingPeriod===p.billingPeriod)),p];return{pricing:{...(core.pricing||{}),status:'advertised_not_checkout_verified',plans,observedAt:at,sourceIds:ids,identityScope:'current_Forest_candidate_only_not_Nutbit_identity_confirmation',checkoutVerified:false,limitation:identity+' 逐一选择套餐与月付/一次性选项后读取按钮显示价，¥不推定ISO币种。'}};
 }
 if(u.pathname==='/plan'&&s.selectedTab&&s.panelCount===1&&Array.isArray(s.planCards)){
  const monthly=s.selectedTab==='按周期购买';if(!monthly&&s.selectedTab!=='按流量购买')return null;
  const names=monthly?['轻量','高级','旗舰']:['不限时200G'];if(s.planCards.length!==names.length||s.planCards.some((c,i)=>c.name!==names[i]||c.headingCount!==1))return null;
  const plans=s.planCards.map(c=>{
   const price=c.text.match(/¥(\d+(?:\.\d+)?)\s*\n\s*(\/ 月|一次性)/),quota=c.text.match(/包含流量\s*([\d,]+) GB/),devices=c.text.match(/限制(\d+)台设备使用/);
   if(!price||!quota||!devices||(monthly?price[2]!=='/ 月':price[2]!=='一次性'))return null;
   return{name:'Forest · '+c.name,amount:Number(price[1]),amountBasis:'original_billing_period_total',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',currencyReason:'页面仅显示¥，未核ISO币种；不进行跨币种比较。',billingPeriod:monthly?'月付':'一次性',quota:monthly?'每月'+quota[1].replaceAll(',','')+'GB':quota[1].replaceAll(',','')+'GB总量',quotaReset:monthly?'页面列每月额度；实际重置时刻未验证。':'站方写不限时；总量不是每月额度，也不是永久经营保证。',maxDevices:Number(devices[1]),deviceLimit:devices[1]+'台',observedAt:at,sourceIds:ids,checkoutVerified:false,restrictions:[identity,'公开目录可读，但购买要求登录；未登录、创建订单、验证结算价或测试线路。']};
  });if(plans.some(p=>!p))return null;
  const current=(core.pricing?.plans||[]).filter(p=>!/^Forest · /.test(p.name||'')||!plans.some(n=>n.name===p.name));
  return{website:{...(core.website||{}),url:origin+'/',status:'current_candidate_brand_conflict',relationship:'current_Forest_page_not_historically_bound_to_Nutbit',operatorIdentityVerified:false,basis:identity,observedAt:at,sourceIds:ids},pricing:{...(core.pricing||{}),status:'advertised_not_checkout_verified',plans:[...current,...plans],observedAt:at,checkoutVerified:false,identityScope:'current_Forest_candidate_only_not_Nutbit_identity_confirmation',limitation:identity+' 三档月付和一档不限时总量标价，不推算其他周期。¥未明示ISO币种。'},compatibility:{status:'operator_requirements_observed',summary:'当前Forest轻量月付限制2台设备，其余已读三档限制3台；仅站方套餐卡声明，未实测。',requirements:[identity,'不将支持流媒体/线路营销文案当成实测速度或解锁保证。'],conditionObservations:[...(core.compatibility?.conditionObservations||[]).filter(o=>!plans.some(p=>p.name===o.scope)),...plans.map(p=>({scope:p.name,quote:s.planCards.find(c=>'Forest · '+c.name===p.name).text,conditions:[p.deviceLimit],sourceIds:ids,sourceUrl:s.url,observedAt:at}))],observedAt:at,sourceIds:[...new Set([...(core.compatibility?.sourceIds||[]),...ids])],independentlyTested:false}};
 }
 if(u.pathname==='/help/renewal-rules'&&text.includes('续费、升级或更换套餐会怎样计算？')&&text.includes('套餐流量仍在每月 1 日统一重置。')&&core.pricing?.plans?.some(p=>p.name.startsWith('Forest · ')&&p.billingPeriod==='月付')){
  const quote='续费只增加套餐有效时长，不会提前刷新已使用流量；套餐流量仍在每月 1 日统一重置。如需在 1 日前恢复流量，请购买流量重置包。';if(!text.includes(quote))return null;
  const notice={quote,effectiveScope:'仅更新当前Forest三档月付；不把不限时总量包推断为每月补充流量。',observedAt:at,sourceIds:ids,performanceMeasured:false};
  return{pricing:{...core.pricing,plans:core.pricing.plans.map(p=>p.name.startsWith('Forest · ')&&p.billingPeriod==='月付'?{...p,quotaReset:'站方帮助称每月1日统一重置；同套餐续费只增加时长，不提前重置。实际执行未验证。',sourceIds:[...new Set([...(p.sourceIds||[]),...ids])]}:p),changeNotices:[...(core.pricing.changeNotices||[]).filter(n=>n.effectiveScope!==notice.effectiveScope),notice]}};
 }
 if(u.pathname==='/policy'&&text.includes('ForestNetwork 服务条款')&&text.includes('协议修订时间：2018.2.13')){
  const begin=text.indexOf('3. 协议和取消政策'),end=text.indexOf('4. 账户设置');if(begin<0||end<=begin||!text.includes('除根据第 3.2 条规定终止无故原因外'))return null;
  const patch={refund:{status:'stated_terms_not_execution_verified',summary:'当前Forest取消政策3.3称按条款取消时通常不退已付/预付费，先排除3.2无故终止，又称Forest终止时所有预付费不退，适用范围存在内在冲突。普通用户主动退款的期限、金额和流程未说明。',quote:text.slice(begin,end).trim(),pageUpdatedAt:'2018-02-13',sourceUrl:s.url,observedAt:at,sourceIds:ids,executionVerified:false,conditions:[identity,'仅取得服务取消/终止相关费用条款，不写成所有购买一律不可退款。','页面自称修订日期不是历史快照采集日期，实际退款执行未知。'],scopeConflicts:['3.3前句排除3.2无故终止，后句又概称Forest终止时全部预付费不退；具体适用优先级未明确。']}};
  const a=text.indexOf('4. 账户设置'),b=text.indexOf('5. 知识产权');
  if(a>=0&&b>a&&text.includes('使用包括浏览器指纹追踪等技术以防止账户滥用'))patch.privacy={status:'operator_policy_fragment_observed',summary:'当前Forest服务条款涉及账户/邮箱资料，并称可用浏览器指纹追踪等技术防账户滥用；仅政策片段，没有独立审计或明确保留时长。',quote:text.slice(a,b).trim(),sourceUrl:s.url,pageUpdatedAt:'2018-02-13',observedAt:at,sourceIds:ids,retentionPeriod:null,independentlyAudited:false,conditions:[identity,'不是完整隐私政策核验，不推断零日志、日志保存范围或删除机制。']};
  return patch;
 }
 return null;
}
async function collectMany(tab){const file=require.resolve('../site-recipes/forest.mjs'),url=require('node:url').pathToFileURL(file);url.searchParams.set('revision',require('node:fs').statSync(file).mtimeMs);return(await import(url.href)).collectForestReadOnly(tab);}
module.exports={origin,recordIds:['A063'],fields:['website','pricing','compatibility','refund','privacy','payment'],readOnlyRecipe:'forest_public_tabs_and_policy',expectedHeading:url=>({'/plan':'获得更快的互联网服务','/policy':'感谢您选择Forest','/help/payment-troubleshooting':'购买按钮、支付弹窗或第二步无法操作怎么办？','/help/purchase-not-arrived':'支付成功后套餐没有到账怎么办？','/help/quick-start':'第一次使用 Forest 应该怎么操作？','/help/renewal-rules':'续费、升级或更换套餐会怎样计算？'})[new URL(url).pathname]||null,extract,collectMany};
