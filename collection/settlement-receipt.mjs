// Applied credit on an invoice is distinct from the account's total wallet balance.
export function settlementReceipt(text=''){
 const amounts=pattern=>[...text.matchAll(pattern)].map(m=>Number(m[1]));
 const applied=amounts(/(?:余额支付|使用余额)\s*[:：]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)/g);
 const due=amounts(/(?:合计待支付|订单待支付金额)\s*[:：]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)/g);
 const paid=/订单已支付|支付成功|扣款成功/.test(text),pending=!paid&&(/(?:^|\n)待支付(?:\n|$)/.test(text)||due.some(n=>n>0));
 return {walletBalance:null,walletBalanceConfirmed:false,appliedAmounts:[...new Set(applied)],remainingAmounts:[...new Set(due)],zeroAppliedConfirmed:applied.length>0&&applied.every(n=>n===0),pendingObserved:pending,paidObserved:paid};
}
export function deferredCashierDecision(snapshot,policy={}){
 const r=settlementReceipt(snapshot.text);
 if(policy.allowDeferredSettlement!==true||!r.pendingObserved||!r.zeroAppliedConfirmed||r.remainingAmounts.length!==1||r.remainingAmounts[0]<=0)return{allowed:false,reason:'explicit_pending_zero_applied_receipt_required',receipt:r};
 if(snapshot.passwordForm||snapshot.agreementCheckbox||snapshot.verificationWidgetObserved||/已绑定|自动扣款|免密|saved card|autopay/i.test(snapshot.text))return{allowed:false,reason:'cashier_auth_or_automatic_charge_not_allowed',receipt:r};
 return{allowed:true,reason:'confirmed_order_has_zero_applied_credit_and_separate_external_settlement',receipt:r};
}
