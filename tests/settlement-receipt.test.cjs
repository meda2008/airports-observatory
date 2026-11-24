const test=require('node:test'),assert=require('node:assert/strict');
test('applied balance zero does not invent a zero account wallet',async()=>{
 const {settlementReceipt}=await import('../collection/settlement-receipt.mjs');
 const r=settlementReceipt('订单详情\n余额支付:0\n合计待支付:20');assert.equal(r.walletBalance,null);assert.equal(r.walletBalanceConfirmed,false);assert.equal(r.zeroAppliedConfirmed,true);assert.equal(r.pendingObserved,true);assert.deepEqual(r.remainingAmounts,[20]);
 assert.equal(settlementReceipt('充值金额0\n优惠金额0').zeroAppliedConfirmed,false);
 assert.equal(settlementReceipt('订单待支付金额:15\n订单已支付').pendingObserved,false);
});
test('separate external settlement requires explicit permission and a zero-applied pending invoice',async()=>{
 const {cashierPreviewDecision}=await import('../collection/unpaid-orders.mjs'),controls=[{tag:'BUTTON',label:'结算支付',disabled:false}],s={url:'https://merchant.test/order',text:'余额支付:0\n订单待支付金额:15'};
 assert.equal(cashierPreviewDecision(s,controls,{allowDeferredSettlement:true}).allowed,true);
 for(const text of ['余额支付:1\n订单待支付金额:14','订单待支付金额:15','余额支付:0\n订单待支付金额:15\n已绑定银行卡','余额支付:0\n订单待支付金额:15\n支付成功'])assert.equal(cashierPreviewDecision({...s,text},controls,{allowDeferredSettlement:true}).allowed,false);
 assert.equal(cashierPreviewDecision(s,controls,{}).allowed,false);
});
test('an unresolved invoice blocks duplicate creation across runs for that record only',async()=>{
 const {pendingCleanupHold}=await import('../collection/unpaid-orders.mjs'),holds={records:{A053:{cleanupRequired:true},A171:{cleanupRequired:false}}};
 assert.equal(pendingCleanupHold({recordIds:['A053']},holds),'A053');assert.equal(pendingCleanupHold({recordIds:['A171']},holds),null);assert.equal(pendingCleanupHold({recordIds:['A172']},holds),null);
});
