const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),E=require('../lib/collection-engine.cjs'),{validateNamedUnpaidLifecycle}=require('../scripts/collection-pipeline.cjs');
test('confirmed payment evidence can publish with explicit separate cleanup status and duplicate-order block',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cleanup-decoupling-'));
 try{const bytes=JSON.stringify({text:'余额支付:0\n合计待支付:20',authenticationObserved:true,capturedAt:'2026-11-01T05:20:00Z'});fs.writeFileSync(path.join(dir,'invoice.json'),bytes);const proof={sourceId:'I',recordIds:['A053'],file:'invoice.json',sha256:E.sha(bytes)},r={paymentExecuted:false,cleanupRequired:true,cancelledVerified:false,duplicateOrderBlocked:true,settlementSource:proof},d={recordId:'A053',lifecyclePublicationPolicy:'payment_evidence_independent_of_order_cleanup',value:{transactionVerified:false,orderCleanup:{status:'pending',cancellationVerified:false,newOrderBlocked:true,reason:'取消未确认',checkedAt:'2026-11-01T05:25:00Z'}}},raw={text:'支付方式\n支付宝',capturedAt:'2026-11-01T05:21:00Z'};
 assert.equal(validateNamedUnpaidLifecycle(d,raw,r,dir),null);
 for(const patch of [{paymentExecuted:true},{duplicateOrderBlocked:false},{cleanupRequired:false},{settlementSource:null}])assert.throws(()=>validateNamedUnpaidLifecycle(d,raw,{...r,...patch},dir));
 assert.throws(()=>validateNamedUnpaidLifecycle({...d,lifecyclePublicationPolicy:null},raw,r,dir),/verified cancellation/);
 }finally{const p=path.resolve(dir);assert(p.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(p).startsWith('cleanup-decoupling-'));fs.rmSync(p,{recursive:true,force:true});}
});
test('unpaid invoice without applied-credit field requires retained zero-wallet and disabled-balance precreation proof',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cleanup-decoupling-'));
 try{
  const keep=(file,body)=>{const bytes=JSON.stringify(body);fs.writeFileSync(path.join(dir,file),bytes);return{recordIds:['A083'],file,sha256:E.sha(bytes)};};
  const config={kind:'unpaid_order_configuration',url:'https://example.com/user/order/create',text:'当前余额\n0.00 元',authenticationObserved:true,balancePaymentSelected:false,capturedAt:'2026-11-02T00:00:00Z'},invoice={url:'https://example.com/user/invoice',text:'订单状态\n未支付\n在线支付\n支付宝',authenticationObserved:true,capturedAt:'2026-11-02T00:01:00Z'};
  const r={paymentExecuted:false,cleanupRequired:true,cancelledVerified:false,duplicateOrderBlocked:true,zeroWalletObserved:true,settlementSource:keep('invoice.json',invoice),precreationSource:keep('pre.json',config)},d={recordId:'A083',lifecyclePublicationPolicy:'payment_evidence_independent_of_order_cleanup',value:{transactionVerified:false,orderCleanup:{status:'pending',cancellationVerified:false,newOrderBlocked:true,reason:'No cancel control',checkedAt:'2026-11-02T00:02:00Z'}}},raw={capturedAt:'2026-11-02T00:01:00Z'};
  assert.equal(validateNamedUnpaidLifecycle(d,raw,r,dir),null);
  for(const patch of [{precreationSource:null},{zeroWalletObserved:false}])assert.throws(()=>validateNamedUnpaidLifecycle(d,raw,{...r,...patch},dir));
  for(const patch of [{balancePaymentSelected:true},{text:'当前余额\n10 元'},{url:'https://other.example.com/create'},{capturedAt:'2026-11-02T00:02:00Z'}])assert.throws(()=>validateNamedUnpaidLifecycle(d,raw,{...r,precreationSource:keep('bad.json',{...config,...patch})},dir));
  assert.throws(()=>validateNamedUnpaidLifecycle(d,raw,{...r,settlementSource:keep('paid.json',{...invoice,text:'订单已支付'})},dir));
 }finally{const p=path.resolve(dir);assert(p.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(p).startsWith('cleanup-decoupling-'));fs.rmSync(p,{recursive:true,force:true});}
});
