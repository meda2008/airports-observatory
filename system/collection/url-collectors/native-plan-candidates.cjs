'use strict';
const crypto=require('node:crypto'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const specs=[{origin:'https://103.118.42.128:11111',path:'/',hash:'#/plans',recordId:'A190',publisher:'旧 Anyland 入口原生链接的安妮office用户中心',kind:'anyland_native_candidate',limitation:'当前原生登录目的地可读，但安妮office与历史Anyland的经营连续仍未证实；月付和年付卡片明确为起步价，不能当已核实周期总价。'}, {origin:'https://w1.feihouyun.com',path:'/',hash:'#/plan',recordId:'A072',publisher:'飞猴云已登录商店（可莉云同名候选的注册跳转目标）',kind:'fly_candidate',limitation:'该页显示飞猴云，与可莉云是不同品牌；没有经营归属或迁移证明，不能作为A072的官网报价。'}];
function candidate(spec,s,{recordId,prior={}}={}){
 const u=new URL(s.url),body=s.body||s.text||'';if((recordId&&recordId!==spec.recordId)||u.origin!==spec.origin||u.pathname!==spec.path||u.hash!==spec.hash||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt)))return null;
 let summary,count;
 if(spec.kind==='anyland_native_candidate'){
  const header='显示的是起步价，下一步可选择购买周期并使用优惠码。',cards=body.split('\n\n');if(cards.shift()!==header||cards.length!==17)return null;
  const rows=cards.map(q=>/^([^\n]+)\n¥(\d+(?:\.\d{1,2})?)\n\/(月起|年起|一次性)\n流量：(\d+) GB\/(30天|用完为止)\n/.exec(q));if(rows.some(r=>!r)||!cards.every(q=>q.includes('支持【USDT-TRC20】支付')))return null;
  summary=rows.map(r=>r[1]+'：¥'+r[2]+'/'+r[3]+'，'+r[4]+'GB/'+r[5]).join('；');count=rows.length;
 }else{
  const starts=[...body.matchAll(/^(年付特惠|基础套餐|适合大多数人|高级套餐|不限时)\n支持\d+个终端\n([^\n]+)\n/gm)];if(starts.length!==8)return null;const rows=[];
  for(let i=0;i<starts.length;i++){const seg=body.slice(starts[i].index,starts[i+1]?.index??body.length),periods=new Map();if(!seg.includes('立即购买'))return null;for(const m of seg.matchAll(/^(月付|季付|半年付|年付|两年付|三年付|一次性)\n(\d+(?:\.\d{1,2})?)(?=\n|$)/gm)){if(periods.has(m[1])&&periods.get(m[1])!==m[2])return null;periods.set(m[1],m[2]);}if(!periods.size)return null;rows.push({name:starts[i][2],periods});}
  count=rows.reduce((n,r)=>n+r.periods.size,0);if(count!==23)return null;summary=rows.map(r=>r.name+'：'+[...r.periods].map(([period,price])=>period+' '+price).join('、')).join('；')+'。页面此处没有明确ISO币种，不推断币种。';
 }
 const sourceId=s.evidenceId,report={status:'unverified_candidate_price',publisher:spec.publisher,summary,quote:body,publishedAt:null,observedAt:s.observedAt,sourceUrl:s.url,sourceIds:[sourceId],officialCurrentPriceVerified:false,priceQuoteCount:count,identityLimitation:spec.limitation,freshnessLimitation:'仅本次已登录可见卡片；没有创建订单、验证最终结账价或付款。',affiliateDisclosure:'unknown',sourceBodySha256:sha(body),sourceLocator:{kind:'body_utf16_range',start:0,end:body.length,quoteSha256:sha(body),bodySha256:sha(body)}};
 const old=(prior.coreInfo||prior).pricing||{},reports=(old.externalReports||[]).filter(r=>!(r.status===report.status&&r.sourceUrl===s.url&&r.sourceBodySha256===report.sourceBodySha256));
 return{pricing:{...old,externalReports:[...reports,report]}};
}
const parsers=specs.map(spec=>({origin:spec.origin,recordIds:[spec.recordId],fields:['pricing'],readOnlyRecipe:spec.kind+'_visible_cards',extract:(s,c)=>candidate(spec,s,c),async collectMany(tab){const u=new URL(await tab.url());if(u.origin!==spec.origin||u.pathname!==spec.path||u.hash!==spec.hash)return{captures:[]};const body=await tab.playwright.evaluate(type=>{if(type==='fly_candidate')return document.querySelector('.card-grid')?.innerText||'';if(!document.getElementById('ucRoot')?.innerText.includes('显示的是起步价，下一步可选择购买周期并使用优惠码。'))return'';return'显示的是起步价，下一步可选择购买周期并使用优惠码。'+'\n\n'+[...document.querySelectorAll('h3')].map(h=>h.parentElement.parentElement.innerText).join('\n\n');},spec.kind);return{captures:[{url:u.href,body,observedAt:new Date().toISOString(),kind:'unverified_entry_candidate',metadata:{representation:'visible_DOM_plan_cards',orderSubmitted:false,paymentExecuted:false}}],orderSubmitted:false,paymentExecuted:false};}}));
module.exports={parsers};
