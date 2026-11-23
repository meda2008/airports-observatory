'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),collector=require('../collection/url-collectors/bianjiecloud.cjs');
test('no-free-trial is explicit, dated and retains old paid-experience evidence',()=>{
 const s={url:collector.origin+'/help/line-coverage',capturedAt:'2026-11-03T00:00:00Z',text:'更新于 2026-10-16\n边界云线路怎么样：线路覆盖、连接方式与服务承诺\n边界云有免费试用吗？ 目前没有免费试用。第一次使用可以先买周期短的套餐或按量流量包体验。',evidenceId:'new'};
 const p=collector.extract(s,{prior:{trial:{summary:'paid experience',sourceIds:['old']}}}).trial;
 assert.equal(p.status,'operator_no_free_trial_stated');assert.deepEqual(p.sourceIds,['old','new']);assert.equal(p.pageUpdatedAt,'2026-10-16');assert.equal(p.executionVerified,false);assert.equal(p.historicalStatement.summary,'paid experience');
 assert.equal(collector.extract({...s,text:s.text.replace('没有免费试用','提供免费试用')}),null);
});
test('same origin and exact document clauses required',()=>{
 assert.throws(()=>collector.extract({url:'https://other.invalid/help/line-coverage'}),/origin_mismatch/);
 assert.equal(collector.extract({url:collector.origin+'/help/getting-started',text:'设备不限'}),null);
});
