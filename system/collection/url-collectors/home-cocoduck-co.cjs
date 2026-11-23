'use strict';
const crypto=require('node:crypto'),origin='https://home.cocoduck.co';
const knownTemporaryOrderSha256='7349198e6fe5f78128d8cb014899a289a265859a28db9252b993fd3b8eefdfdf';
function extract(s,{prior={}}={}){
 const u=new URL(s.url),core=prior.coreInfo||prior;
 if(u.origin!==origin||u.pathname!=='/user/order'||!core.payment?.methods?.length||!core.payment.orderCleanup)return null;
 const rows=(s.text||'').split('\n').map(line=>line.split('\t')).filter(c=>c.length===8&&/^O\d{14}[a-f0-9]+$/.test(c[1]||''));
 const row=rows.find(c=>crypto.createHash('sha256').update(c[1]).digest('hex')===knownTemporaryOrderSha256);
 if(!row||row[2]!=='个人套餐-月付'||row[4]!=='17'||row[5]!=='已取消'||row[6]!=='2026-11-02 00:30:25')return null;
 return{payment:{...core.payment,reason:'保留此前未支付账单列出的支付宝与微信；实际收款与到账未验证。本轮已在订单列表确认已知临时订单显示“已取消”，取消执行者未观察。渠道采集时间不变。',orderCleanup:{status:'cancelled_observed',cancellationVerified:true,newOrderBlocked:false,reason:'当前订单列表中的已知临时订单明确显示“已取消”；本轮只读核对，没有创建订单、发起取消或付款。已有支付方式证据保留。',quote:'已取消',checkedAt:s.capturedAt,operatorUpdatedLabel:row[7],cancellationActor:'not_observed',sourceUrl:s.url,sourceIds:[s.evidenceId].filter(Boolean)}}};
}
module.exports={origin,recordIds:['A083'],fields:['payment'],extract};
