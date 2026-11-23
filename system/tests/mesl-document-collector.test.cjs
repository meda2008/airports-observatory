'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),parser=require('../collection/url-collectors/in-mesl-cloud.cjs');
function snapshot(id,category){const [title,quotes]=parser.rules[id];return{url:parser.origin+'/#/docs/'+id,text:'返回文档\n\n'+category+'\n\n'+title+'\n\n更新于 2026-10-27\n\n'+quotes.join('\n'),capturedAt:'2026-11-03T00:00:00Z',evidenceId:'synthetic-'+id};}
test('official and third-party client OS requirements retain separate scopes and original dates',()=>{
 const prior={compatibility:{summary:'已有目录说明',requirements:['旧条件'],observedAt:'2026-10-28T00:00:00Z',sourceIds:['old']}};
 const result=require('../collection/url-collectors/index.cjs').extractKnown([snapshot(65,'Mac'),snapshot(34,'Mac'),snapshot(8,'Windows'),snapshot(80,'Android TV')],{prior}).patch.compatibility;
 assert.equal(result.summary,prior.compatibility.summary);assert.equal(result.observedAt,prior.compatibility.observedAt);assert(result.requirements.includes('旧条件'));assert(result.conditionObservations.some(o=>o.scope.startsWith('Mesl For Mac')&&o.quote==='macOS 14 及以上。'));assert(result.conditionObservations.some(o=>o.scope.startsWith('Clash Verge')&&o.quote==='适用于 macOS 10.15 及以上系统。'));assert(result.conditionObservations.some(o=>o.quote==='支持 64 位 Windows 10 及以上系统。'));assert(result.conditionObservations.some(o=>o.quote==='32 位和 64 位系统都能装，电视版安装包里都带了。'));assert(result.conditionObservations.every(o=>o.pageUpdatedAt==='2026-10-27'&&o.observedAt==='2026-11-03T00:00:00Z'));assert.equal(result.independentlyTested,false);
});
test('a stale SPA article, changed literal requirement or unknown document cannot be promoted',()=>{
 const source=snapshot(65,'Mac');assert.equal(parser.extract({...source,url:parser.origin+'/#/docs/34'}),null);assert.equal(parser.extract({...source,text:source.text.replace('macOS 14','macOS 15')}),null);assert.equal(parser.extract({...source,url:parser.origin+'/#/docs/999'}),null);assert.throws(()=>parser.extract({...source,url:'https://other.example/#/docs/65'}),/origin/);
});
