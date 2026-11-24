'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const coupon='五、优惠码和价格\n\n· 优惠码 kuajie：打 8 折，不限新老用户，月付到三年付各周期和流量重置都能用，同一个码可以反复使用。\n· 以下两档不参加优惠码：\n跨界年付版（¥96 / 60GB）\n跨界·不限时包（¥200 / 300GB，一次性）\n最终价格以结算页为准\n六、忘记密码';
test('gap planning follows inventory material rules, not the mere presence of a summary or method',()=>{
 const {gaps}=require('../scripts/plan-collection-gaps.cjs');const r={coreInfo:{refund:{status:'not_confirmed',summary:'未取得完整退款条款',sourceIds:['old']},payment:{status:'not_confirmed',methods:['未确认'],sourceIds:['old']},pricing:{plans:[{amount:10}]}}};
 assert(gaps(r).includes('refund'));assert(gaps(r).includes('payment'));assert(gaps(r).includes('pricing'));
 r.coreInfo.refund={status:'operator_terms_observed',summary:'不提供退款',sourceIds:['bound']};assert(!gaps(r).includes('refund'));
});
test('coupon parser requires complete exact exclusions and never asserts validity, amount or referral binding',()=>{
 const parser=require('../collection/url-collectors/fdsh-kuajiecloudtttt.cjs');const s={url:parser.origin+'/#/knowledge',body:coupon,observedAt:'2026-11-03T00:00:00Z',evidenceId:'ev'};
 const value=parser.extract(s).promotions[0];assert.equal(value.code,'kuajie');assert.equal(value.expiresAt,null);assert.equal(value.affiliateBinding,null);assert.equal(value.amount,null);assert.equal(value.checkoutVerified,false);assert(coupon.includes(value.quote));
 assert.equal(parser.extract({...s,body:coupon.replace('打 8 折','打 9 折')}),null);assert.equal(parser.extract({...s,body:coupon.replace('跨界年付版（¥96 / 60GB）','')}),null);assert.throws(()=>parser.extract({...s,url:'https://other.example/'}),/origin/);
});
test('client version delta retains original terms and their date, scopes new requirements to operator UI',()=>{
 const parser=require('../collection/url-collectors/downloadshare-breezenetttt.cjs');const old={summary:'旧设备规则',requirements:['旧要求'],sourceIds:['old-source'],observedAt:'2026-10-28T00:00:00Z'};
 const body='客户端下载\nAndroid\n2\nAndroid 5.0+\niOS\n1\niOS 12.0+\nmacOS\n1\nmacOS 10.15+\nWindows\n1\nWindows 10+';
 const result=parser.extract({url:parser.origin+'/#/dashboard',body,evidenceId:'new',observedAt:'2026-11-03T00:00:00Z'},{prior:{compatibility:old}}).compatibility;
 assert.equal(result.summary,old.summary);assert.equal(result.observedAt,old.observedAt);assert(result.requirements.includes('旧要求'));assert.deepEqual(result.sourceIds,['old-source','new']);assert.equal(result.independentlyTested,false);assert.equal(result.conditionObservations[0].observedAt,'2026-11-03T00:00:00Z');assert(body.includes(result.conditionObservations[0].quote));
});
test('owned referral accepts observed root-code format but never cross-origin, credentials or checkout URLs',async()=>{
 const {validOwnedReferral:valid}=await import('../collection/owned-referral.mjs'),origin='https://example.org';
 assert(valid(origin+'/#/?code=SYNTHETIC',origin));assert(valid(origin+'/#/register?code=SYNTHETIC',origin));
 for(const u of ['https://other.example/#/?code=SYNTHETIC',origin+'/checkout?code=SYNTHETIC',origin+'/#/?code=SYNTHETIC&token=secret','http://example.org/#/?code=SYNTHETIC'])assert.equal(valid(u,origin),false);
});
test('clipboard copy focuses the exact tab and restores visibility even when copying fails',async()=>{
 const {copyReferralWithVisibility}=await import('../collection/owned-referral.mjs');const calls=[];
 const tab={capabilities:{get:async id=>{assert.equal(id,'cdp');return{send:async method=>calls.push(method)};}},getAXState:async()=>calls.push('observe'),clipboard:{readText:async()=>{calls.push('clipboard');return 'synthetic';}}};
 const visibility={get:async()=>false,set:async value=>calls.push('visible:'+value)};
 assert.equal(await copyReferralWithVisibility({tab,visibility,control:{click:async()=>calls.push('copy')}}),'synthetic');
 assert.deepEqual(calls,['visible:true','Page.bringToFront','observe','copy','observe','clipboard','visible:false']);
 calls.length=0;await assert.rejects(copyReferralWithVisibility({tab,visibility,control:{click:async()=>{throw Error('copy_failed');}}}),/copy_failed/);assert.equal(calls.at(-1),'visible:false');
});
test('referral collection rejects prior-site clipboard without publishing its URL',async()=>{
 const {collectOwnedReferral}=await import('../collection/owned-referral.mjs');const visible={count:async()=>1,isVisible:async()=>true,waitFor:async()=>{}};
 const tab={url:async()=> 'https://owned.example/#/invites',playwright:{locator:()=>({innerText:async()=> 'synthetic-owner@example.org'}),getByRole:()=>visible}};
 const result=await collectOwnedReferral(tab,{expectedEmail:'synthetic-owner@example.org',copyReader:async()=> 'https://previous.example/#/?code=TESTCODE'});
 assert.equal(result.status,'referral_clipboard_origin_mismatch');assert.equal(result.generated,false);assert.equal(result.source,undefined);assert.equal(result.url,undefined);
});
test('worker known parser saves source then proposes coupon; explicit review makes only reviewed fields public',async t=>{
 const store=require('../deploy-service/store.cjs').createStore({filename:':memory:'});t.after(()=>store.close());
 const origin='https://fdsh.kuajiecloudtttt.xyz';store.seedSites([{id:'A162',entryUrl:origin,initialDocument:{}}]);store.enqueueDue();const job=store.claim('synthetic');let gotOptions;
 const verificationOptions={confirmationProvider:async()=>null};
 const worker=require('../deploy-service/worker.cjs').createCollector({store,verificationOptions,collect:async(_,o)=>{gotOptions=o;return{observations:[{url:origin+'/#/knowledge',body:coupon,observedAt:'2026-11-03T00:00:00Z'}],discovery:[],checkpoints:[]};},extract:async()=>{throw Error('Paid/generic model must not run for known literal parser');}});
 assert.equal((await worker(job)).status,'awaiting_semantic_review');assert.equal(gotOptions.verificationOptions.confirmationProvider,verificationOptions.confirmationProvider);assert.equal(typeof gotOptions.verificationOptions.ocr,'function');assert.equal(store.listChanges().length,0);
 const proposal=store.listProposals()[0];store.reviewProposal(proposal.id,{approved:true,expectedRevision:0,reviewer:'synthetic literal review'});
 const server=require('../deploy-service/server.cjs').createServer({store});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const result=await(await fetch('http://127.0.0.1:'+server.address().port+'/api/changes')).json();const published=result.items[0].after.promotions[0];assert.equal(published.code,'kuajie');assert.equal(published.expiryVerified,false);assert.equal(published.checkoutVerified,false);assert.equal(published.sourceIds.length,1);assert.equal(result.items[0].after.payment,undefined);
});
