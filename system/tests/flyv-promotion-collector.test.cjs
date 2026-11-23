'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),collector=require('../collection/url-collectors/retained-ehju-flyvastt-lol.cjs');
const source={url:'https://ehju.flyvastt.lol/#/dashboard',capturedAt:'2026-11-03T00:00:00Z',text:['🚀 FlyV 官方公告｜全新升级 · 新用户专属福利','🔥 新用户首单享 8 折优惠！','🎟️ 优惠码：fly20','💰 优惠力度： 立减 20% / 8折','📦 适用套餐： 入门、进阶、高端及商业方案','每位用户每月限使用 1 次，具体优惠以结算页面为准。'].join('\n')};
test('FlyV coupon preserves first-order/monthly conflict and unverified expiry/checkout',()=>{
 const p=collector.extract({...source,evidenceId:'source-test'},{prior:{promotions:[{code:'old'}]}}).promotions;
 assert.equal(p.length,2);assert.equal(p[1].code,'fly20');assert.equal(p[1].active,null);assert.equal(p[1].checkoutVerified,false);assert.equal(p[1].expiresAt,null);assert.match(p[1].conditions.join(' '),/每月重复/);assert.deepEqual(p[1].sourceIds,['source-test']);
});
test('FlyV rejects altered coupon terms and unrelated routes/origins',()=>{
 assert.equal(collector.extract({...source,text:source.text.replace('fly20','fake')}),null);
 assert.equal(collector.extract({...source,url:'https://ehju.flyvastt.lol/#/plans'}),null);
 assert.throws(()=>collector.extract({...source,url:'https://other.invalid/#/dashboard'}),/origin_mismatch/);
});
