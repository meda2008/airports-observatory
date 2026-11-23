'use strict';
const origin='https://ncnwiki.com';
function extract(snapshot,{prior={}}={}){
 const u=new URL(snapshot.url);if(u.origin!==origin)throw Error('collector_origin_mismatch');const core=prior.coreInfo||prior,body=snapshot.body||snapshot.text||'',observedAt=snapshot.observedAt||snapshot.capturedAt,sourceIds=[snapshot.evidenceId].filter(Boolean);
 if(!/^\/faq-purchase\/?$/.test(u.pathname)||!body.includes('支付与套餐常见问题')||!body.includes('2026-07-10')||!body.includes('本站所有产品服务一经购买，均 不支持退款。'))return null;
 const old=core.refund||{},hasException=(old.quote||'').includes('可被复现'),quote='本站所有产品服务一经购买，均 不支持退款。',statement={quote,observedAt,pageUpdatedAt:'2026-07-10',sourceUrl:snapshot.url,sourceIds};
 const refund={...old,status:'stated_terms_not_execution_verified',summary:hasException?'当前帮助FAQ称一经购买均不退款；同次读取的ToS 8.4仍保留普遍且可复现质量问题的例外，页面适用优先级未明确。':'当前帮助FAQ称所有产品购买后不退款，个人原因、设备或网络环境、误买、不会使用等均不接受退款请求。',conditions:[...(old.conditions||[]),'帮助FAQ最后更新2026-07-10，当前读取时间另记；不把FAQ较新日期当作已废止旧ToS例外的证明。'],policyStatements:[...(old.policyStatements||[]).filter(s=>s.sourceUrl!==snapshot.url),...(hasException&&!old.policyStatements?.length?[{quote:old.quote,observedAt:old.observedAt,pageUpdatedAt:old.pageUpdatedAt,sourceUrl:old.sourceUrl,sourceIds:old.sourceIds}]:[]),statement],sourceIds:[...new Set([...(old.sourceIds||[]),...sourceIds])],observedAt,executionVerified:false,...(hasException?{scopeConflicts:['FAQ绝对不退款与当前ToS普遍且可复现质量问题例外并存，实际处理未知。']}: {})};
 const out={refund};
 if(body.includes('新用户首次购买普通套餐时，可以使用 95 折优惠码：')&&body.includes('\nninja\n')&&body.includes('迷你套餐、永久套餐和臻选套餐不支持使用优惠码。'))out.promotions=[...(core.promotions||[]).filter(p=>p.code!=='ninja'),{status:'stated_offer_not_checkout_verified',code:'ninja',summary:'帮助FAQ称新用户首购普通套餐可用ninja享95折；迷你、永久、臻选除外。',quote:body.slice(body.indexOf('新用户首次购买普通套餐时，可以使用 95 折优惠码：')).trim(),conditions:['仅符合条件的新用户首次购买普通套餐；迷你、永久、全部臻选档不适用。','未填写优惠码或核实结算生效，未给出明确到期日；返佣绑定未知。'],expiresAt:null,affiliateBinding:null,observedAt,pageUpdatedAt:'2026-07-10',sourceUrl:snapshot.url,sourceIds,checkoutVerified:false,expiryVerified:false}];
 return out;
}
module.exports={origin,recordIds:['A197'],fields:['refund','promotions'],extract};
