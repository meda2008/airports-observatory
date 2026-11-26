'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{conditionLines}=require('../deploy-service/public/plan-conditions.js');
test('historical reset charge uses its source date, never the current price date',()=>{const lines=conditionLines({observedAt:'2026-11-10T00:00:00Z',additionalCharges:{amount:12},retainedContractFields:{additionalCharges:{historical:true,sourceObservations:[{sourceId:'old-fee',observedAt:'2026-10-26T13:55:43.015Z'}]}}});assert(lines.some(s=>s.includes('2026-10-26T13:55:43.015Z')&&s.includes('本轮未重验')));assert(!lines.join().includes('2026-11-10'));});
test('missing fee date remains unknown and zero device limit is visible',()=>{const lines=conditionLines({maxDevices:0,additionalCharges:0,retainedContractFields:{additionalCharges:{historical:true,sourceObservations:[]}}});assert(lines.includes('同时使用设备上限：0'));assert(lines.includes('附加费用：0'));assert(lines.some(s=>s.includes('日期未知')));});
test('reset conflicts and prior conditions stay readable',()=>{const lines=conditionLines({quotaReset:'历史叠加与重置冲突，未确认',retainedConditionEvidence:[{observedAt:'2026-10-26'}]});assert(lines.some(s=>s.includes('冲突')));assert(lines.some(s=>s.includes('2026-10-26')&&s.includes('没有重新验证')));});
test('contract objects render their useful text without raw implementation metadata',()=>{const lines=conditionLines({additionalCharges:{summary:'每次重置12元',conditions:['未执行重置'],sourceIds:['OLD'],sourceObservations:[{sourceId:'OLD',observedAt:null}]}});assert(lines.includes('附加费用：每次重置12元；未执行重置'));assert(!lines.join().includes('sourceObservations'));});
test('customer page loads the conditions helper before the visitor script and omits general change history', () => {
  const html = fs.readFileSync(path.join(__dirname, '../deploy-service/public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../deploy-service/public/index.js'), 'utf8');
  assert.match(html, /<script defer src="\/plan-conditions\.js"><\/script>\s*<script defer src="\/index\.js"><\/script>/);
  assert.doesNotMatch(html, /来源与时效|留存指纹|id="changes"/);
  assert.ok(!js.includes('changes();'));
  assert.ok(html.includes('套餐价格'));
});
