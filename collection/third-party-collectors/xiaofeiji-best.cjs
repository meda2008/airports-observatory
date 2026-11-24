'use strict';
const origin='https://xiaofeiji.best',recordId='A027';
function extract(snapshot){
 const u=new URL(snapshot.url),text=snapshot.text||'';
 if(u.origin!==origin||u.pathname!=='/airports/foo-friends/'||!text.includes('Foo&Friends'))return null;
 const summary='月付记录\n¥8.8 / 月\n\nLV2自行车 月付，60 GB / 月；用于比较当前月付门槛。';
 const begin=text.indexOf('主要套餐计划'),end=text.indexOf('三网节点实测',begin);
 if(!text.includes(summary)||begin<0||end<=begin||!text.slice(begin,end).includes('LV3全解锁'))return null;
 return{status:'unverified_third_party_price',publisher:'小飞机',summary,quote:text.slice(begin,end).trim(),publishedAt:null,publisherDateQuote:null,sourceUrl:snapshot.url,observedAt:snapshot.capturedAt,officialCurrentPriceVerified:false,identityLimitation:'仅第三方页面将该表标为Foo&Friends；其官网跳转到www.fnf.xyz，本次未取得官网报价，不确认经营主体、入口当前可用性或历史连续性。',freshnessLimitation:'页面未显示报价核验或发布日期，记未知；采集时间不替代页面日期。旧报告称8.8/月108GB，本页称8.8/月60GB，配额冲突未解决。未核实当前价格、ISO币种、在售、优惠或结算。',affiliateDisclosure:'unknown'};
}
module.exports={origin,recordId,extract};
