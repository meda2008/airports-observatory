const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const E=require('../lib/collection-engine.cjs'),{validateNamedUnpaidLifecycle}=require('../scripts/collection-pipeline.cjs');
test('a captured pending order is not falsely labelled zero wallet; cancellation remains mandatory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pending-admission-'));
 try{const bytes=JSON.stringify({kind:'cancelled_order_terminal_state',text:'订单已取消',capturedAt:'2026-11-01T05:26:00Z'});fs.writeFileSync(path.join(dir,'cancel.json'),bytes);
 const proof={sourceId:'C',file:'cancel.json',sha256:E.sha(bytes)},r={unpaidStateObserved:true,zeroWalletObserved:false,cancelledVerified:true,paymentExecuted:false,cancellationSource:proof},d={cancellationSourceId:'C'},raw={text:'待支付\n使用余额\n¥0.00\n支付方式\n支付宝',capturedAt:'2026-11-01T05:25:00Z'};
 assert.doesNotThrow(()=>validateNamedUnpaidLifecycle(d,raw,r,dir));
 for(const patch of [{cancelledVerified:false},{paymentExecuted:true},{unpaidStateObserved:false}])assert.throws(()=>validateNamedUnpaidLifecycle(d,raw,{...r,...patch},dir));
 assert.throws(()=>validateNamedUnpaidLifecycle(d,{...raw,text:'使用余额0，支付宝'},r,dir));
 assert.throws(()=>validateNamedUnpaidLifecycle(d,{...raw,text:raw.text+'\n订单已支付'},r,dir));
 }finally{const resolved=path.resolve(dir),temp=path.resolve(os.tmpdir())+path.sep;assert(resolved.startsWith(temp)&&path.basename(resolved).startsWith('pending-admission-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
