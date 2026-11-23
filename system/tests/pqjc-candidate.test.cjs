'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const collector=require('../collection/url-collectors/pqjc-candidate.cjs'),base=path.resolve(__dirname,'../work/collection-runs/payment-priority-20261104-v12-root'),payment=require(path.join(base,'pqjc-unpaid-recharge-payment.json')),cancelled=require(path.join(base,'pqjc-cancel-observation.json')),aliases=require(path.join(base,'pqjc-native-alias-announcement.json')),balance=require(path.join(base,'pqjc-scoped-zero-balance.json'));
test('actual candidate topup labels are E1 options with narrow scope, unknown ISO and pending independent cleanup',()=>{
 const original=structuredClone(payment),r=collector.extract({...payment,evidenceId:'PAY'}).payment;
 assert.deepEqual(r.methods,['微信','支付宝']);assert.deepEqual(r.optionLabels,collector.labels);assert.deepEqual(r.uninterpretedOptions,['赔钱2号支付-备用']);assert.equal(r.scope,collector.scope);assert.equal(r.topupAmount,1);assert.equal(r.currency,null);assert.equal(r.currencyISO,null);assert.equal(r.evidenceGrade,'E1');assert.equal(r.transactionVerified,false);assert.equal(r.operatorIdentityVerified,false);assert.equal(r.legacyContinuityVerified,false);assert.equal(r.orderCleanup.status,'pending');assert.equal(r.orderCleanup.newOrderBlocked,true);assert.equal(r.orderCorrelationSha256,payment.orderCorrelationSha256);assert(payment.text.includes(r.quote));assert.deepEqual(payment,original);assert.equal(collector.extract(balance),null);
});
test('new checkout facts supersede old missing-method text while original prior stays intact',()=>{
 const prior={payment:{methods:[],label:'未确认',reason:'没有实际支付渠道；未创建订单。'}};
 const original=structuredClone(prior),r=collector.extract(payment,{prior}).payment;
 assert.equal(r.label,'候选充值账单渠道已观察');assert(!r.reason.includes('未创建订单'));assert(r.reason.includes('未支付余额充值'));assert.deepEqual(prior,original);
});
test('candidate payment requires exact origin, scope, order amount, state and literal channel labels',()=>{
 assert.throws(()=>collector.extract({...payment,url:'https://pqjc.site/order'}),/origin_mismatch/);
 for(const patch of [{url:collector.origin+'/profile'},{recordId:'A040'},{scope:'all_products'},{amount:2},{currencyISO:'CNY'},{paymentExecuted:true},{legacyIdentityVerified:true},{orderCorrelationSha256:'invalid'},{capturedAt:'invalid'},{representation:'generic_page'},{text:payment.text.replaceAll('1.00','2.00')},{text:payment.text.replace('(待支付)','(已支付)')},{text:payment.text.replace('赔钱支付-微信&支付宝','微信 支付宝')},{text:payment.text.replace('赔钱2号支付-备用','备用')}])assert.equal(collector.extract({...payment,...patch}),null);
 assert.equal(collector.extract(payment,{expectedOrderCorrelationSha256:'0'.repeat(64)}),null);assert(collector.extract(payment,{expectedOrderCorrelationSha256:payment.orderCorrelationSha256}));
});
test('same-order cancellation updates cleanup only, never a different order or earlier observation',()=>{
 const prior=collector.extract({...payment,evidenceId:'PAY'}).payment,result=collector.extract({...cancelled,evidenceId:'CANCEL'},{prior:{payment:prior}}).payment;
 assert.equal(result.orderCleanup.status,'cancelled');assert.equal(result.orderCleanup.cancellationVerified,true);assert.equal(result.orderCleanup.newOrderBlocked,false);assert.equal(result.observedAt,prior.observedAt);assert.deepEqual(result.methods,prior.methods);assert.deepEqual(result.sourceIds,['PAY']);assert.deepEqual(result.orderCleanup.sourceIds,['CANCEL']);assert.equal(result.transactionVerified,false);assert.equal(prior.orderCleanup.status,'pending');assert.equal(collector.extract(cancelled),null);
 for(const patch of [{orderCorrelationSha256:'0'.repeat(64)},{capturedAt:'2026-11-04T14:00:00Z'},{text:cancelled.text.replaceAll('已取消','待支付')}])assert.equal(collector.extract({...cancelled,...patch},{prior:{payment:prior}}),null);
 const replay=collector.extract(payment,{prior:{payment:result}}).payment;assert.equal(replay.orderCleanup.status,'cancelled');
});
test('native aliases preserve legacy website history and never upgrade operator identity or continuity',()=>{
 const old={url:'https://pqjc.site/',operatorIdentityVerified:true,legacyContinuityVerified:true,sourceIds:['OLD']},r=collector.extract({...aliases,evidenceId:'ALIAS'},{prior:{website:old}}).website;
 assert.equal(r.url,collector.origin+'/');assert.equal(r.userRecognizedCandidate,true);assert.equal(r.operatorIdentityVerified,false);assert.equal(r.legacyIdentityVerified,false);assert.equal(r.legacyContinuityVerified,false);assert.deepEqual(r.historicalWebsites,[old]);assert(r.nativeAliasUrls.includes('https://dash.pqjc.site/'));assert.equal(r.observedAt,aliases.capturedAt);assert.equal(collector.extract({...aliases,links:[]}),null);assert.equal(collector.extract({...aliases,text:aliases.text.replaceAll('dash.pqjc.site','other.example')}),null);
});
function balanceContext({checked=false,text=balance.text,duplicate=false}={}){
 const input={checked,getClientRects:()=>[{}]},card={innerText:text,getClientRects:()=>[{}],querySelectorAll:selector=>{assert.equal(selector,'input[role="switch"]');return[input];}},label={tagName:'SPAN',innerText:'当前余额',parentElement:{parentElement:card},getClientRects:()=>[{}]};return{label,document:new Proxy({},{get(){throw Error('whole profile forbidden');}})};
}
test('balance inspection reads only the exact minimal card and native switch.checked boolean',async()=>{
 const {inspectPqjcBalanceCard}=await import('../collection/site-recipes/pqjc.mjs');
 const run=options=>vm.runInNewContext('('+inspectPqjcBalanceCard.toString()+')(label)',balanceContext(options)),safe=run();assert.equal(safe.text,balance.text);assert.equal(safe.autoRenewChecked,false);assert.equal(safe.privateSecurityValuesExcluded,true);assert.equal(safe.scope,'visible_balance_card_only');assert.equal(run({checked:true}).autoRenewChecked,true);
 for(const opts of [{checked:null},{checked:undefined},{text:balance.text+'x'.repeat(201)},{text:balance.text+'\nTOTP secret'}]){const context=balanceContext(opts);if(Object.hasOwn(opts,'checked')&&opts.checked===undefined){const card=context.label.parentElement.parentElement;delete card.querySelectorAll('input[role="switch"]')[0].checked;}assert.throws(()=>vm.runInNewContext('('+inspectPqjcBalanceCard.toString()+')(label)',context),/pqjc_balance_/);}
});
test('read-only recipe never traverses profile security or invokes navigation or financial actions',async()=>{
 const {collectPqjcCandidateReadOnly,inspectPqjcBalanceCard,inspectPqjcOrderSurface}=await import('../collection/site-recipes/pqjc.mjs');let calls=0;
 const label={waitFor:async()=>{},count:async()=>1,evaluate:async fn=>{calls++;assert.equal(fn,inspectPqjcBalanceCard);return{...balance};}},profile={url:async()=>collector.origin+'/profile',playwright:{getByText:(text,options)=>{if(text instanceof RegExp){assert(text.test('¥ 0.00'));const amount={waitFor:async()=>{},count:async()=>1};return{filter:()=>amount};}assert.equal(text,'当前余额');assert.deepEqual(options,{exact:true});return label;}}};const r=await collectPqjcCandidateReadOnly(profile);assert.equal(calls,1);assert.equal(r.newOrdersCreated,0);assert.equal(r.paymentExecuted,false);assert.equal(r.cancellationExecuted,false);assert.equal(r.captures[0].privateSecurityValuesExcluded,true);
 await assert.rejects(()=>collectPqjcCandidateReadOnly({...profile,playwright:{getByText:()=>({...label,count:async()=>2})}}),/label_not_unique/);
 assert.equal(await collectPqjcCandidateReadOnly({url:async()=>collector.origin+'/security'}),null);assert.equal(await collectPqjcCandidateReadOnly({url:async()=> 'https://pqjc.site/profile'}),null);
 const fakeId='12345678901234567890',tab={url:async()=>collector.origin+'/order',playwright:{evaluate:async fn=>{assert.equal(fn,inspectPqjcOrderSurface);return{text:payment.text,representation:payment.representation,orderCorrelationInput:fakeId,radioLabels:collector.labels};}}};const order=(await collectPqjcCandidateReadOnly(tab)).captures[0];assert.equal(order.orderCorrelationSha256,crypto.createHash('sha256').update(fakeId).digest('hex'));assert(!JSON.stringify(order).includes(fakeId));assert(!Object.hasOwn(order,'orderCorrelationInput'));assert(collector.extract(order));
});
function heroOrderContext({multipleCards=false,multipleIds=false,oversized=false}={}){
 // Synthetic DOM shape follows the observed HeroUI button -> actions DIV ->
 // 68-character order DIV; no table elements or document body are available.
 const id='12345678901234567890123',raw='余额充值\n充值\n¥ 1\n2026/11/04 23:41\n已取消\n'+id+'\n查看订单\n取消订单'+(multipleIds?'\n22345678901234567890123':'')+(oversized?'x'.repeat(2001):'');
 const boundary={tagName:'MAIN',get innerText(){throw Error('broad main read forbidden');},parentElement:null},card={tagName:'DIV',innerText:raw,parentElement:boundary,getClientRects:()=>[{}],querySelectorAll:()=>[]},actions={tagName:'DIV',innerText:'查看订单\n取消订单',parentElement:card,getClientRects:()=>[{}]},button={tagName:'BUTTON',innerText:'查看订单',parentElement:actions,getClientRects:()=>[{}]};
 const document={get body(){throw Error('body forbidden');},querySelectorAll:selector=>{if(selector==='[role="dialog"],dialog[open]'||selector==='tr,[role="row"],.ant-list-item')return[];if(selector==='button,[role="button"]')return multipleCards?[button,{...button}]:[button];throw Error('unexpected broad selector '+selector);}};return{document,id,raw};
}
test('cancelled HeroUI DIV order card is read from its action button without table or body access',async()=>{
 const {inspectPqjcOrderSurface,collectPqjcCandidateReadOnly}=await import('../collection/site-recipes/pqjc.mjs'),context=heroOrderContext(),surface=vm.runInNewContext('('+inspectPqjcOrderSurface.toString()+')()',context);
 assert.equal(surface.representation,'redacted_visible_order_list_text');assert.equal(surface.orderCancellationLabel,'已取消');assert.equal(surface.orderCorrelationInput,context.id);assert(!surface.text.includes(context.id));assert(surface.text.includes('[order identifier redacted]'));assert.equal(surface.text,context.raw.replace(context.id,'[order identifier redacted]'));assert(!surface.text.startsWith('订单已取消'));
 const tab={url:async()=>collector.origin+'/order',playwright:{evaluate:async()=>surface}},capture=(await collectPqjcCandidateReadOnly(tab)).captures[0],prior=collector.extract(payment).payment;prior.orderCorrelationSha256=capture.orderCorrelationSha256;const r=collector.extract(capture,{prior:{payment:prior}}).payment;assert.equal(r.orderCleanup.cancellationVerified,true);assert.equal(r.orderCleanup.quote,'已取消');assert.equal(r.transactionVerified,false);assert(!JSON.stringify(capture).includes(context.id));
 for(const options of [{multipleCards:true},{multipleIds:true},{oversized:true}])assert.throws(()=>vm.runInNewContext('('+inspectPqjcOrderSurface.toString()+')()',heroOrderContext(options)),/pqjc_(?:cancelled_order_card|order_identifier)/);
});
