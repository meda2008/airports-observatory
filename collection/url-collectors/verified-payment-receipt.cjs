'use strict';
const assert=require('node:assert/strict');
function validatePaymentReceipt({wallet,config,payment,cancelled}){
 assert.equal(wallet.recordId,payment.recordId);assert.equal(config.recordId,payment.recordId);assert.equal(cancelled.recordId,payment.recordId);
 for(const p of [wallet,config,cancelled])assert.equal(new URL(p.url).origin,new URL(payment.url).origin,'Cross-origin lifecycle');
 const zero=/(?<![\d.])0\.00\s*CNY|余额:\s*¥0\.00/.test([wallet.text,wallet.walletObserved].filter(Boolean).join('\n'));assert(zero,'Zero balance proof required');
 assert(/(?<![\d.])20\.00\s*CNY/.test(config.text),'Observed selected total required');assert(/已取消/.test(cancelled.text));assert.equal(payment.paymentExecuted,false);assert(Date.parse(cancelled.capturedAt)>=Date.parse(payment.capturedAt));
 const lines=payment.text.split('\n').map(x=>x.trim()).filter(Boolean),at=lines.indexOf('支付方式');assert(at>=0);const labels=[];for(const line of lines.slice(at+1)){if(/订单总额|总计|结账/.test(line))break;if(/^(支付宝\d*|微信|USDT|PayPal|银联|Visa|MasterCard)$/.test(line))labels.push(line);}assert(labels.length,'No named channels');return{methods:[...new Set(labels.map(x=>/^支付宝/.test(x)?'支付宝':x))],rawMethodLabels:labels,transactionVerified:false,cancelledVerified:true};
}
module.exports={validatePaymentReceipt};
