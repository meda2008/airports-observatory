'use strict';
const origin='https://jichangliebiao.com',recordId='A190';
// An external historical report. Never register this parser as an official-site collector.
function extract(snapshot){
 const u=new URL(snapshot.url),text=snapshot.text||'';
 if(u.origin!==origin||u.pathname!=='/jichang/anyland'||!text.startsWith('Anyland官网地址'))return null;
 const rows=['月付\t￥20\t￥38\t￥58\t￥90\t-','季付\t￥60\t￥114\t￥174\t￥270\t-','半年付\t￥120\t￥228\t￥348\t￥540\t-','年付\t￥240\t￥456\t￥696\t￥1080\t￥158','两年付\t￥480\t￥912\t￥1392\t￥2160\t￥316','三年付\t￥720\t￥1368\t￥2088\t￥3240\t￥474'];
 const summary='月付￥11.8，体验套餐每用户只能购买一个月';
 const packs='150G流量包（不限时）￥68 380G流量包（不限时）￥158 980G流量包（不限时）￥388 3300G流量包（限时一年）￥518';
 const start=text.indexOf('特色\n');
 if(start<0||!rows.every(r=>text.includes(r))||!text.includes(packs)||!text.includes(summary)||!text.includes('2025-02-25'))return null;
 const update=(snapshot.timeMetadata||[]).find(t=>t.dateTime==='2026-10-05T03:03:46.000Z'&&t.label==='2026/10/5 11:03');
 if(!update||!snapshot.links?.some(l=>l.label==='any62.cc'&&l.url==='https://c.jichangs.com/node1'))return null;
 return{status:'unverified_third_party_price',publisher:'机场推荐｜机场列表',summary,quote:text.slice(start).trim(),publishedAt:'2025-02-25',publisherDateQuote:'2025-02-25',updatedAt:'2026-10-05',publisherUpdateQuote:update.label,priceQuoteCount:32,sourceUrl:snapshot.url,observedAt:snapshot.capturedAt,officialCurrentPriceVerified:false,
 identityLimitation:'第三方文章标称Anyland；正文写any62.cc，但原生链接实际指向c.jichangs.com/node1，不能据此证明旧anyland.club、安妮office或现经营者的归属与连续性；推广目标的实际品牌须单独留存并复核，不能按显示文字认定。 USDT-TRC20也仅为该文章说法，未写入已核实支付方式。',
 freshnessLimitation:'发布标记2025-02-25，页脚更新标记2026/10/5 11:03；两者都不代表每项报价在该日重新核验。与已存2023年火箭旺报告的重叠金额相同，可能转述同一旧表，不能视为独立交叉核验。保留27组周期价、4组流量包及1组体验价；¥符号的ISO币种、当前在售、流量月额度、优惠有效期及结算总额均未官网核实。',affiliateDisclosure:'not_disclosed'};
}
module.exports={origin,recordId,extract};
