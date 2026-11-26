const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../work/collection-runs/financial-20261109-v17'),read=n=>JSON.parse(fs.readFileSync(path.join(dir,n))),parser=require('../collection/url-collectors/index.cjs');
test('live oix cashier labels and fees stay scoped to the selected channel with no transaction claim', historicalCaptureOptions('work/collection-runs/financial-20261109-v17/oix-counter-alipay.json'),()=>{
 const files=['alipay','wechat','trc20','polygon','bsc'].map(n=>({...read('oix-counter-'+n+'.json'),evidenceId:n}));
 const p=parser.extractKnown(files).patch.payment;assert.deepEqual(p.methods,['支付宝','微信','USDT (TRC20)','USDT (Polygon)','USDT (BSC)']);
 assert.deepEqual(p.feeStatements.map(s=>[s.method,s.ratePercent]),[['支付宝',4],['微信',4],['USDT (TRC20)',0],['USDT (Polygon)',0],['USDT (BSC)',0]]);assert.equal(p.transactionVerified,false);assert.equal(p.legacyContinuityVerified,false);assert.equal(p.sourceGroupId,'oixcloud_current_authenticated_store');assert.equal(p.feeStatements.find(s=>s.method==='USDT (BSC)').externalFeeQuote,'交易所提现手续费另计，实际到账金额需符合订单要求');
 const invalid=[{selectedMethod:'微信'},{url:'https://other.example/user/v2/counter'},{passwordForm:true},{text:files[0].text+'\n加载支付方式中...'},{buttons:files[0].buttons.filter(b=>b.trim()!=='登出')}];for(const changed of invalid)assert.equal(parser.extractKnown([{...files[0],...changed}]),null);
});
test('new oix ToS keeps legal exception and balance-only return separate from cash refund and preserves prior material', historicalCaptureOptions('work/collection-runs/financial-20261109-v17/oix-tos.json'),()=>{
 const s={...read('oix-tos.json'),evidenceId:'tos'},old={refund:{quote:'prior recorded clause',sourceIds:['old']},compatibility:{summary:'原设备要求',requirements:['原有要求'],sourceIds:['old-device']}};
 const p=parser.extractKnown([s],{prior:old}).patch;assert.equal(p.refund.pageUpdatedAt,'2026-11-06');assert.match(p.refund.quote,/适用法律强制要求/);assert.match(p.refund.quote,/不构成原路退款或余额提现/);assert.equal(p.refund.executionVerified,false);assert.equal(p.refund.previousObservations[0].quote,'prior recorded clause');assert.equal(p.compatibility.summary,'原设备要求');assert(p.compatibility.requirements.includes('原有要求'));assert.deepEqual(p.compatibility.sourceIds,['old-device','tos']);
 assert.equal(parser.extractKnown([{...s,text:s.text.replace('不构成原路退款或余额提现','退款规则待定')}]),null);
});
test('oix privacy scopes retention to the named data and never advertises zero logs', historicalCaptureOptions('work/collection-runs/financial-20261109-v17/oix-privacy.json'),()=>{
 const s={...read('oix-privacy.json'),evidenceId:'privacy'},p=parser.extractKnown([s]).patch.privacy;assert.equal(p.pageUpdatedAt,'2026-11-03');assert.match(p.summary,/90天/);assert.match(p.summary,/30天/);assert.match(p.conditions.join(' '),/不等于所有登录或服务日志均不记录IP/);assert.equal(p.independentlyAudited,false);assert.equal(parser.extractKnown([{...s,text:s.text.replace('活动历史保留 30 天','保留期限未知')}]),null);
});
test('new loading wording waits before retaining payment document',async()=>{
 const {readRenderedDocument}=await import('../collection/visible-document.mjs');let waited=false,calls=0;
 const tab={url:async()=> 'https://oixcloud.com/user/v2/counter',playwright:{evaluate:async()=>++calls===1?{text:'加载支付方式中...'}:{text:'支付宝 微信'},getByText:matcher=>({waitFor:async o=>{assert(matcher.test('加载支付方式中...'));assert.equal(o.state,'hidden');waited=true;}})}};
 const doc=await readRenderedDocument(tab);assert(waited);assert.equal(doc.text,'支付宝 微信');assert(Number.isFinite(Date.parse(doc.capturedAt)));
});
test('oix read-only recipe stops before channel interaction when order action is enabled',async()=>{
 const {collectOixReadOnly}=await import('../collection/site-recipes/oixcloud-shop.mjs');let calls=0;
 const tab={url:async()=> 'https://oixcloud.com/user/v2/counter',playwright:{evaluate:async()=>++calls===1?{text:'收银台'}:{selectedMethod:'支付宝',orderActionDisabled:false},getByRole:()=>{throw Error('channel must not be clicked');}}};
 await assert.rejects(collectOixReadOnly(tab),/requires_disabled_order_action/);
});
