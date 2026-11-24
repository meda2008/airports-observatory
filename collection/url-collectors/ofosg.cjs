'use strict';
const origin='https://ofosg.com',cycle={month_price:'月付',quarter_price:'季付',year_price:'年付'};
function extract(snapshot,{prior={}}={}){
 if(new URL(snapshot.url).origin!==origin)throw Error('collector_origin_mismatch');
 const core=prior.coreInfo||prior,old=core.pricing||{},body=snapshot.body||snapshot.text||'',observedAt=snapshot.observedAt||snapshot.capturedAt,sourceIds=[snapshot.evidenceId].filter(Boolean);
 const banner='所有套餐无到期时间，仅以流量为唯一计费值。套餐流量会自动叠加到总流量！';
 if(new URL(snapshot.url).pathname==='/shop'&&body.includes(banner)&&body.includes('月付 · 季付 · 年付')&&body.includes('按月重置流量'))return{pricing:{...old,scopeConflicts:[{quote:banner,conflictsWith:'同页套餐卡列月付/季付/年付和按月重置；配置页也有三个计费周期。实际期限与重置执行待核，不能由顶部泛化文案推定不限时。',observedAt,sourceIds}]}};
 if(body.includes('套餐调整通知')&&body.includes('初级会员：150GB / 200Mbps')&&body.includes('中级会员：300GB / 300Mbps')&&body.includes('高级会员：600GB / 500Mbps')&&body.includes('※ 已购套餐在当前周期内不受影响，续费后按新标准执行。')){
  const start=body.indexOf('为保障晚高峰线路质量'),end=body.indexOf('※ 已购套餐在当前周期内不受影响，续费后按新标准执行。');if(start<0)return null;
  const quote=body.slice(start,end+'※ 已购套餐在当前周期内不受影响，续费后按新标准执行。'.length);
  const notice={quote,observedAt,sourceIds,effectiveScope:'站方称已购套餐当前周期不受影响，续费后执行新标准；公告未给绝对生效日期。',performanceMeasured:false};
  const patch={pricing:{...old,changeNotices:[...(old.changeNotices||[]).filter(n=>n.quote!==quote),notice]}};
  if(body.includes('充值赠送活动已结束。'))patch.promotions=[...(core.promotions||[]).filter(p=>p.summary!=='站方公告称充值赠送活动已结束。'),{status:'operator_announced_ended',code:null,summary:'站方公告称充值赠送活动已结束。',quote:'充值赠送活动已结束。',conditions:['仅描述该充值赠送活动，不代表所有优惠结束。'],active:false,expiresAt:null,observedAt,sourceIds,sourceUrl:snapshot.url,affiliateBinding:null,expiryVerified:false,checkoutVerified:false}];
  return patch;
 }
 if(new URL(snapshot.url).pathname!=='/checkout'||!snapshot.selectedBilling)return null;
 const period=cycle[snapshot.selectedBilling.id],label=snapshot.selectedBilling.label||'',amount=label.match(/^¥([\d.]+)\s*-\s*(月付|季付|年付)(?:\s|$)/),product=body.match(/^订阅:\s*(.+)$/m),quota=body.match(/^流量:\s*(\d+)\s*GB$/m),total=body.match(/合计:\s*¥\s*([\d.]+)\s*CNY/),fee=body.match(/手续费:\s*¥\s*([\d.]+)\s*CNY/),discount=body.match(/折扣:\s*¥\s*([\d.]+)\s*CNY/);
 if(!period||!amount||amount[2]!==period||!product||!quota||!total||!fee||!discount||Number(fee[1])!==0||Number(discount[1])!==0||Number(total[1])!==Number(amount[1]))return null;
 if(!body.includes('每月流量：'+quota[1]+'GB')||!body.includes('按月重置流量')||!body.includes('仅限本人使用，禁止共享 · 开通后不支持退款'))return null;
 const name=product[1].trim()+' · '+period,index=(old.plans||[]).findIndex(p=>p.name===name);if(index<0)return null;
 const previous=old.plans[index],plan={...previous,name,amount:Number(total[1]),amountBasis:'original_billing_period_total',currency:'CNY',currencyStatus:'explicitly_stated',currencyReason:'当前所选周期配置页合计明确显示CNY；未提交订单。',billingPeriod:period,quota:'每月'+quota[1]+'GB',observedAt,sourceIds,checkoutVerified:false,configurationTotalObserved:true,displayBasis:'当前计费周期选中状态及已刷新合计；未点击结账按钮、未建单或付款。'};
 const plans=old.plans.map((p,i)=>i===index?plan:p),changed=previous.quota!==plan.quota||previous.amount!==plan.amount;
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans,observedAt,checkoutVerified:false,...(changed&&!old.historicalPlans?{historicalPlans:old.plans}:{}),limitation:'当前报价来自未提交订单的配置预览；保留旧报价历史。速率为站方套餐规格，不是速度实测。'}};
}
async function collectMany(tab,{runtime='iab'}={}){if(new URL(await tab.url()).origin!==origin||new URL(await tab.url()).pathname!=='/shop')return null;const {readRenderedDocument}=await import('../visible-document.mjs'),{collectOfoOffers}=await import('../site-recipes/ofosg.mjs');const shopSnapshot=await readRenderedDocument(tab);if(runtime==='server')return{origin,captures:[shopSnapshot],captureScope:'visible_shop_only_no_checkout_navigation',newOrdersCreated:0,paymentExecuted:false};return collectOfoOffers(tab,{shopSnapshot,runtime});}
module.exports={origin,recordIds:['A040'],fields:['pricing','promotions'],readOnlyRecipe:'ofo_configuration_cycles',collectMany,extract};
