'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {matchingLines}=require('../scripts/find-retained-financial-literals.cjs');
test('retained financial reconciliation preserves exact conditions and does not invent channels',()=>{
 const text='条款\n付款后不支持任何退款\n仅限本人使用';
 assert.deepEqual(matchingLines(text,'refund'),[text]);assert.deepEqual(matchingLines(text,'payment'),[]);
 const marketing='支付方式\n支持';assert.deepEqual(matchingLines(marketing,'payment'),[marketing]);
 // A keyword hit remains a candidate: it contains no channel and cannot be admitted.
 assert(!/支付宝|微信|PayPal|USDT/.test(matchingLines(marketing,'payment')[0]));
});
test('client tutorials do not become refund or payment evidence',()=>{
 assert.deepEqual(matchingLines('使用文档\n使用教程\n返回主站','refund'),[]);
 assert.deepEqual(matchingLines('使用文档\n使用教程\n返回主站','payment'),[]);
});
