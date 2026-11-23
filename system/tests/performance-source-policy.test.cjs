'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {canonicalReference,registeredReference,publicReferenceCapture}=require('../lib/performance-source-policy.cjs');
const {createParser}=require('../collection/url-collectors/telegram-history-parsers.cjs');
const telegramParser=createParser([{recordId:'A907',channel:'explicit_cloud',aliases:['ExampleCloud'],officialOrigins:['https://official.example']}]),options={telegramParser};
test('configured Telegram early history and latest observation are record-bound public references',()=>{
  for(const url of ['https://t.me/s/explicit_cloud','https://t.me/s/explicit_cloud?before=20']){assert.equal(canonicalReference(url,'A907',options),url);assert.equal(registeredReference(url,'A907',options),true);assert.equal(publicReferenceCapture({url,kind:'public_performance_reference',metadata:{authenticationObserved:false}},'A907',options),true);assert.equal(registeredReference(url,'A908',options),false);}
});
test('only exact before=20 query on configured t.me record/channel is canonicalized',()=>{
  const rejects=['https://t.me/s/other_cloud?before=20','https://t.me.evil.example/s/explicit_cloud?before=20','https://t.me/s/explicit_cloud?before=200','https://t.me/s/explicit_cloud?before=1','https://t.me/s/explicit_cloud?before=%32%30','https://t.me/s/explicit_cloud?before=20&before=20','https://t.me/s/explicit_cloud?before=20&token=secret','https://t.me/s/explicit_cloud?before=20#post','https://t.me/explicit_cloud/15?before=20','http://t.me/s/explicit_cloud?before=20','https://u:p@t.me/s/explicit_cloud?before=20','https://jcnotes.com/airports/cyber/?before=20'];
  for(const url of rejects){assert.equal(canonicalReference(url,'A907',options),null,url);assert.equal(registeredReference(url,'A907',options),false,url);}
  assert.equal(canonicalReference('https://t.me/s/explicit_cloud?before=20','A907',{telegramParser:createParser([])}),null);
});
test('no-profile legacy source behavior stays compatible and arbitrary Telegram routes remain unregistered',()=>{
  const empty={telegramParser:createParser([])};assert.equal(registeredReference('https://jcnotes.com/airports/cyber/','A047',empty),true);assert.equal(registeredReference('https://jcnotes.com/airports/cyber/20260830_224707/','A047',empty),true);assert.equal(registeredReference('https://jichangnote.com/reviews/erwan-cloud/','A028',empty),true);assert.equal(registeredReference('https://t.me/s/kuromis_xiaoxi?before=20','A022',empty),true);assert.equal(registeredReference('https://t.me/s/unconfigured_cloud','A907',empty),false);assert.equal(registeredReference('https://t.me/explicit_cloud/15','A907',options),false);assert.equal(registeredReference('https://unknown.example/','A907',empty),false);
});
test('a public reference marker never admits an authenticated capture',()=>{
  const url='https://t.me/s/explicit_cloud?before=20';assert.equal(publicReferenceCapture({url,kind:'public_performance_reference',metadata:{authenticationObserved:true}},'A907',options),false);assert.equal(publicReferenceCapture({url,kind:'public_performance_reference',authenticationObserved:true},'A907',options),false);assert.equal(publicReferenceCapture({url,kind:'operator_visible_page',metadata:{performanceReference:true,authenticationObserved:false}},'A907',options),true);assert(!publicReferenceCapture({url,kind:'operator_visible_page'},'A907',options));
});
test('historical HTTPS latency source is public only for its two explicit records and exact canonical URL',()=>{
  const url='https://echoccc.online/posts/airport-review/';for(const id of ['A016','A182']){assert.equal(registeredReference(url,id),true);assert.equal(publicReferenceCapture({url,kind:'public_performance_reference',metadata:{authenticationObserved:false}},id),true);}
  for(const [value,id] of [[url,'A017'],[url+'?before=20','A016'],[url+'#detail','A016'],['https://echoccc.online.evil.example/posts/airport-review/','A016'],['http://echoccc.online/posts/airport-review/','A016'],['https://echoccc.online/posts/other/','A182']])assert.equal(registeredReference(value,id),false);
});
test('reviewed operator WHMCS announcement query is exact, record-bound and does not authorize arbitrary rp/actions',()=>{
 const Module=require('node:module'),original=Module._load,url='https://justmysocks.net/members/index.php?rp=/announcements/20/IPLC-service-experienced-an-outage-RECOVERED.html';
 Module._load=function(request,...args){if(request==='../collection/url-collectors/official-performance-parsers.cjs')return{sourceTargets:id=>id==='A909'?[{url,sourceType:'operator_statement'},{url:'https://justmysocks.net/members/index.php?rp=/login',sourceType:'operator_statement'},{url:'https://justmysocks.net/members/cart.php?a=checkout',sourceType:'operator_statement'}]:[]};return original.call(this,request,...args);};
 try{assert.equal(canonicalReference(url,'A909'),url);assert.equal(registeredReference(url,'A909'),true);assert.equal(publicReferenceCapture({url,kind:'public_performance_reference',metadata:{authenticationObserved:false}},'A909'),true);
  for(const [u,id] of [[url,'A908'],[url+'&foo=bar','A909'],[url+'&rp=/announcements/21/Other.html','A909'],[url+'#x','A909'],[url.replace('justmysocks.net','justmysocks.net.evil.example'),'A909'],[url.replace('https:','http:'),'A909'],[url.replace('https://','https://u:p@'),'A909'],[url.replace('justmysocks.net/','justmysocks.net:443/'),'A909'],[url.replace('/20/','/99/'),'A909'],['https://justmysocks.net/members/index.php?rp=/login','A909'],['https://justmysocks.net/members/cart.php?a=checkout','A909']]){assert.equal(canonicalReference(u,id),null,u);assert.equal(registeredReference(u,id),false,u);}
 }finally{Module._load=original;}
});
