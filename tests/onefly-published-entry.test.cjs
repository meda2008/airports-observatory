'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{verify}=require('../lib/onefly-published-entry.cjs');
test('publisher route plus backend backlink are both required; labels alone do not transfer identity',()=>{
 const portal='https://7i859w4w.fjumpy.mom',config={title:'一翻云 线路检测',urls:[portal]},guest={app_url:'https://1flyun.cc'};
 assert(verify({config,portal,guest}));
 for(const value of [{config:{...config,title:'其他'},portal,guest},{config:{...config,urls:[]},portal,guest},{config,portal,guest:{app_url:'https://wrong.invalid'}},{config:{...config,urls:['https://evil.invalid']},portal:'https://evil.invalid',guest}])assert.equal(verify(value),false);
});
