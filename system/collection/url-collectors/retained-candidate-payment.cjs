'use strict';
// Reuse literal checkout material for the current saved origin, without asserting
// the old directory name is the operator behind the currently displayed brand.
const scopes={
 'https://efbng.guangzssytt.buzz':{brand:'光速云',old:'Boost Net',title:'光速云'},
 'https://dv2dsdgf.quanqiugttt1.club':{brand:'全球云',old:'寰宇云',title:'全球云'}
};
function extract(snapshot,{prior={}}={}){
 const u=new URL(snapshot.url),scope=scopes[u.origin];if(!scope)return null;
 if(snapshot.kind!=='unpaid_order_payment_methods'||snapshot.collectionContext!=='user_authorized_temporary_unpaid_order'||snapshot.authenticationObserved!==true||snapshot.passwordForm||snapshot.title!==scope.title||u.hash!=='#/order/pay')return null;
 const core=prior.coreInfo||prior;
 if(core.website?.url&&new URL(core.website.url).origin!==u.origin)return null;
 const at=snapshot.capturedAt||snapshot.observedAt;if(!Number.isFinite(Date.parse(at)))return null;
 const text=snapshot.text||snapshot.body||'',match=text.match(/(?:^|\n)支付方式\n(支付宝\n支付宝4)\n订单总额(?:\n|$)/);
 if(!match)return null;
 return{payment:{status:'observed_not_transaction_verified',methods:['支付宝'],methodOptions:['支付宝','支付宝4'],quote:match[0].trim(),summary:`保存入口当前${scope.brand}候选的已留存未支付订单页显示“支付宝”和“支付宝4”；仅确认渠道标签，不将4当费率或独立支付网络。`,sourceUrl:snapshot.url,observedAt:at,sourceIds:[snapshot.evidenceId].filter(Boolean),checkoutObserved:true,transactionVerified:false,identityScope:'current_saved_origin_candidate_only',conditions:[`只适用于当前${scope.brand}候选页面；与旧目录${scope.old}的经营主体、名称沿革和连续性未确认。`,'复用原始采集时间和原件，不代表本次重新登录、建单或验证当前通道仍可用。','实际支付、到账、手续费和退款执行未验证；订单清理状态独立记录，不据清理结果改变渠道原文。']}};
}
module.exports={extract};
