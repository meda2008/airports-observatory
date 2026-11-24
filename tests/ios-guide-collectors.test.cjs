'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const quote='1、 因为该应用不支持国区下载，所以需要登录外区账号下载，可以向客服获取免费外区账号。软件名称：【Nextin】';
for(const [file,code,conflict]of [['efbng-guangzssytt','gsy','2、下载客户端在 App Store 搜索【光速云】下载并安装安装完成点击【打开】'],['asdfb4-xingdaotatt','Xdm','']]){
 test(file+' bounds iOS statements to exact source, preserving earlier dates and requirements',()=>{
  const parser=require('../collection/url-collectors/'+file+'.cjs'),prior={compatibility:{summary:'旧说明',requirements:['旧条件'],observedAt:'2026-10-25T00:00:00Z',sourceIds:['old']}};
  const source={url:parser.origin+'/#/knowledge',text:quote+'\n输入专属码【'+code+'】\n'+conflict,capturedAt:'2026-11-03T00:00:00Z',evidenceId:'synthetic-source'};
  const result=parser.extract(source,{prior}).compatibility;assert.equal(result.summary,'旧说明');assert.equal(result.observedAt,prior.compatibility.observedAt);assert(result.requirements.includes('旧条件'));assert.deepEqual(result.sourceIds,['old','synthetic-source']);assert.equal(result.independentlyTested,false);assert(source.text.includes(result.conditionObservations[0].quote));
  assert.equal(parser.extract({...source,text:source.text.replace('专属码','其他字段')},{prior}),null);
  assert.throws(()=>parser.extract({...source,url:'https://wrong.example/'}),/origin/);
  if(conflict){assert(result.requirements.some(s=>s.includes('不一致')));assert.equal(parser.extract({...source,text:source.text.replace(conflict,'')},{prior}),null);}
 });
}
