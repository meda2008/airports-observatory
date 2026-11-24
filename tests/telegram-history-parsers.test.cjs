'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const moduleParser=require('../collection/url-collectors/telegram-history-parsers.cjs');
const config=[{recordId:'A022',channel:'kuromis_xiaoxi',aliases:['Kuromis','库洛米'],officialOrigins:['https://www.kuromis.com'],binding:{status:'independently_reviewed_official_native_link'}},{recordId:'A191',channel:'kuromis_xiaoxi',aliases:['Kuromis'],officialOrigins:['https://www.kuromis.com']}];
const p=moduleParser.createParser(config),hash=s=>createHash('sha256').update(s).digest('hex');
function capture(text='Kuromis\n官网：https://www.kuromis.com/\n开业：套餐已开放订阅',dateTime='2022-06-26T10:20:47+00:00',number=15){return{url:'https://t.me/s/kuromis_xiaoxi?before=20',body:'频道说明与当前订阅人数\n'+text+'\nJune 26, 2022',observedAt:'2026-11-11T06:00:00Z',evidenceId:'CAPTURE-CURRENT',metadata:{timeMetadata:[{dateTime,permalink:'https://t.me/kuromis_xiaoxi/'+number,postText:text}]}};}
test('a pure notice-channel introduction is not business history; launch offers and payment terms are',()=>{
  assert.equal(p.extract(capture('Kuromis\n本频道是通知频道，服务更新会在本频道发布。'),{recordId:'A022'}),null);
  assert(p.extract(capture('Kuromis\n愚人节开张特价，全场11折'),{recordId:'A022'}));
  assert(p.extract(capture('Kuromis\n可钱包登录，usdt支付，最低仅17.9元/月。'),{recordId:'A022'}));
});

test('configured record/channel pairs only; public route and before bound are explicit',()=>{
  assert.deepEqual(p.forOrigin(capture().url,{recordId:'A022'}).recordIds,['A022']);assert(p.forOrigin(capture().url,{recordId:'A191'}));assert(p.forOrigin('https://t.me/s/kuromis_xiaoxi',{recordId:'A022'}));
  for(const [url,id] of [[capture().url,'A023'],['https://t.me/s/other_channel?before=20','A022'],['https://t.me/kuromis_xiaoxi/15','A022'],['https://t.me/s/kuromis_xiaoxi?before=200','A022'],['https://t.me/s/kuromis_xiaoxi?before=20&token=secret','A022'],['https://t.me.evil.example/s/kuromis_xiaoxi','A022'],['http://t.me/s/kuromis_xiaoxi','A022'],['https://u:p@t.me/s/kuromis_xiaoxi','A022']])assert.equal(p.forOrigin(url,{recordId:id}),null);
  assert.equal(p.forOrigin(capture().url),null);assert.equal(moduleParser.createParser([]).extract(capture(),{recordId:'A022'}),null);
});
test('source discovery uses early page when missing/explicitly seeking earlier; no guessed pagination',()=>{
  assert.equal(p.sourceTargets('A022')[0].url,capture().url);const prior={operatingHistory:{historyStatements:[{kind:'platform_message_date',date:'2022-06-26T10:20:47+00:00'}]}};
  assert.equal(p.sourceTargets('A022',prior)[0].url,'https://t.me/s/kuromis_xiaoxi');assert.equal(p.sourceTargets('A022',prior,{findEarlier:true})[0].url,capture().url);assert.deepEqual(p.sourceTargets('A999'),[]);assert.equal(p.sourceTargets('A022')[0].sourceType,'operator_statement');
});
test('full same-post metadata binds exact body, source and clock without inferring founding year',()=>{
  const o=capture(),f=p.extract(o,{recordId:'A022'}).operatingHistory.historyStatements[0];assert.equal(f.date,'2022-06-26T10:20:47+00:00');assert.equal(f.observedAt,o.observedAt);assert.deepEqual(f.sourceIds,[o.evidenceId]);assert.equal(f.kind,'platform_message_date');assert.equal(f.continuousOperationVerified,false);assert.equal(f.independentHistoricalArchiveVerified,false);assert.equal(f.literalChecked,true);assert.equal(f.bodySha256,hash(o.body));assert.equal(o.body.slice(f.sourceLocator.start,f.sourceLocator.end),f.quote);assert.equal(hash(f.quote),f.sourceLocator.quoteSha256);assert.equal(f.establishedAt,undefined);assert.equal(f.operatingYears,undefined);assert(f.limitations.some(s=>s.includes('编辑')));
});
test('service text and brand/original official origin must belong to the same metadata post',()=>{
  const urlOnly=capture('官网：https://www.kuromis.com/\n套餐已开放订阅');assert(p.extract(urlOnly,{recordId:'A022'}));
  for(const text of ['OtherBrand\n套餐已开放订阅','OtherBrand\n套餐已开放订阅\nhttps://www.kuromis.com.evil.example/','Kuromis\n今天阳光真好，大家晚安','Kuromis\nChannel created','Kuromis\n创建了此群聊，用于服务节点闲聊','Kuromis 版权所有 © 2020 服务条款']){const o=capture(text);assert.equal(p.extract(o,{recordId:'A022'}),null,text);}
  const o=capture('套餐已开放订阅');o.body='Kuromis\n'+o.body;assert.equal(p.extract(o,{recordId:'A022'}),null,'brand in page header does not bind anonymous post');
});
test('timestamps, permalink and body binding fail closed; root posts are not silently treated as timeMetadata',()=>{
  const cases=[
    o=>{delete o.metadata;},o=>{o.metadata.timeMetadata=[];},o=>{o.metadata.timeMetadata[0].dateTime='June 26';},o=>{o.metadata.timeMetadata[0].dateTime='2022-06-26';},o=>{o.metadata.timeMetadata[0].dateTime='2022-02-30T10:20:47Z';},o=>{o.metadata.timeMetadata[0].dateTime='2027-06-26T10:20:47Z';},o=>{o.metadata.timeMetadata[0].dateTime='2022-06-26T25:00:00Z';},o=>{o.metadata.timeMetadata[0].dateTime='2022-06-26T10:20:47+15:00';},o=>{o.metadata.timeMetadata[0].permalink='https://t.me/other_channel/15';},o=>{o.metadata.timeMetadata[0].permalink='https://t.me/kuromis_xiaoxi/20';},o=>{o.metadata.timeMetadata[0].postText+=' text not in capture';},o=>{delete o.evidenceId;},o=>{delete o.observedAt;},o=>{o.bodySha256='0'.repeat(64);},o=>{o.metadata.passwordForm=true;},o=>{o.posts=o.metadata.timeMetadata;delete o.metadata;},
  ];for(const mutate of cases){const o=capture();mutate(o);assert.equal(p.extract(o,{recordId:'A022'}),null);assert.equal(p.diagnose(o,{recordId:'A022'}).accepted,false);}
});
test('selects earliest qualifying post rather than Channel created or collection year',()=>{
  const o=capture(),second=capture('Kuromis\n新套餐开放购买','2023-07-15T02:00:00Z',18),creation='Channel created';o.body=creation+'\n'+o.body+'\n'+second.metadata.timeMetadata[0].postText;o.metadata.timeMetadata.unshift({dateTime:'2020-01-01T00:00:00Z',permalink:'https://t.me/kuromis_xiaoxi/1',postText:creation});o.metadata.timeMetadata.push(second.metadata.timeMetadata[0]);const d=p.diagnose(o,{recordId:'A022'});assert.equal(d.facts.length,1);assert.equal(d.facts[0].date,'2022-06-26T10:20:47+00:00');assert(d.rejected.some(r=>r.reason==='non_service_creation_copyright_or_chat_message'));
});
test('conflicting metadata timestamps cannot create an arbitrary historical claim',()=>{
  const o=capture();o.metadata.timeMetadata.push({...o.metadata.timeMetadata[0],dateTime:'2021-06-26T10:20:47Z'});const d=p.diagnose(o,{recordId:'A022'});assert.equal(d.accepted,false);assert(d.rejected.some(r=>r.reason==='same_post_metadata_conflict'));
});
test('existing earlier evidence blocks later rows; earlier new message preserves existing fields and old clock',()=>{
  const o=capture(),first=p.extract(o,{recordId:'A022'}),before=JSON.stringify(first);assert.equal(p.extract({...o,evidenceId:'RECAPTURE',observedAt:'2026-11-12T00:00:00Z'},{recordId:'A022',prior:first}),null);assert.equal(JSON.stringify(first),before);
  const later=capture('Kuromis\n新套餐开放购买','2023-07-15T02:00:00Z',18);assert.equal(p.extract(later,{recordId:'A022',prior:first}),null);
  const prior={operatingHistory:{status:'unconfirmed',notes:['keep'],establishedAt:null,historyStatements:[{kind:'platform_message_date',date:'2023-01-01T00:00:00Z',id:'OLD',sourceIds:['OLD-CAPTURE']}]}};const saved=JSON.stringify(prior),patch=p.extract(o,{recordId:'A022',prior});assert.equal(JSON.stringify(prior),saved);assert.equal(patch.operatingHistory.historyStatements.length,2);assert.equal(patch.operatingHistory.historyStatements[0].id,'OLD');assert.deepEqual(patch.operatingHistory.notes,['keep']);assert.equal(patch.operatingHistory.status,'unconfirmed');assert.equal(patch.operatingHistory.establishedAt,null);assert.deepEqual(patch.operatingHistory.sourceIds,['OLD-CAPTURE',o.evidenceId]);
});
test('metadata root form is accepted; invalid/ambiguous explicit profiles admit nothing',()=>{
  const o=capture();o.timeMetadata=o.metadata.timeMetadata;delete o.metadata;assert(p.extract(o,{recordId:'A022'}));assert.equal(moduleParser.createParser([config[0],config[0]]).extract(o,{recordId:'A022'}),null);assert.equal(moduleParser.createParser([{...config[0],officialOrigins:['https://evil.example/?token=x']}]).extract(o,{recordId:'A022'}),null);
});
test('retained Kuromis actual capture replays only through explicit posts-to-timeMetadata conversion',()=>{
  const file='work/performance-20261111-next/live/kuromis-early-service-post.json';if(!fs.existsSync(file))return;const raw=JSON.parse(fs.readFileSync(file)),o={...raw,evidenceId:'RETAINED-KUROMIS-EXPLICIT-METADATA-REPLAY',metadata:{timeMetadata:raw.posts.map(post=>({permalink:post.postUrl,dateTime:post.publishedAt,postText:post.text}))}};const f=p.extract(o,{recordId:'A022'}).operatingHistory.historyStatements[0];assert.equal(f.postUrl,'https://t.me/kuromis_xiaoxi/15');assert.equal(f.date,'2022-06-26T10:20:47+00:00');assert.equal(o.body.slice(f.sourceLocator.start,f.sourceLocator.end),f.quote);assert(f.quote.includes('开业大吉'));assert.equal(f.independentHistoricalArchiveVerified,false);
});
