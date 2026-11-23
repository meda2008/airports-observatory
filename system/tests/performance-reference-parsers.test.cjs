'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {profiles,forOrigin,extract,diagnose}=require('../collection/url-collectors/performance-reference-parsers.cjs');
const hash=s=>createHash('sha256').update(s).digest('hex');
function capture(profile=profiles[0],value=222){
  return{url:`https://jcnotes.com/airports/${profile.slug}/20260830_224707/`,evidenceId:'CAPTURE-CURRENT-ONE',observedAt:'2026-11-11T02:00:00Z',body:`← 返回 ${profile.aliases[0]} 长期观察\n\n历史快照\n这是一次历史记录，不代表当前状态。\n${profile.aliases[0]}\n\n测速快照 · 🌙 晚高峰 · 2026-08-30 22:47 · 湖南联通 1000M 家用宽带\n\n下载口径 · Cloudflare Anycast 三样本单连接 v4\n本机经被测节点对 Cloudflare Anycast 运行 3 次独立单连接下载；每次最多 99 MB、最长 15 秒，最终取成功样本平均速度的中位数。\n查看方法说明\n本次快照样本\n主要地区可用节点\n14 / 15\n93% · 香港 / 台湾 / 新加坡 / 日本 / 美国\n中位下载\n${value} Mbps\n66–316 Mbps，主要地区\n抖动\n457 ms\n峰值 1893 ms，主要地区\n\n完整节点表\n下载速度\n999 Mbps`};
}
test('17 explicit record + slug profiles route separately; conflicting brands are excluded',()=>{
  assert.equal(profiles.length,17);assert.equal(new Set(profiles.map(p=>p.recordId)).size,17);
  for(const p of profiles){const o=capture(p),parser=forOrigin(o.url,{recordId:p.recordId});assert.deepEqual(parser.recordIds,[p.recordId]);assert.equal(parser.slug,p.slug);assert.equal(parser.extract(o,{recordId:p.recordId}).speed.verifiedReports[0].valueMbps,222);}
  for(const [url,id] of [['https://jcnotes.com/airports/nice/20260830_224707/','A047'],['https://jcnotes.com/airports/jiuyun/20260830_224707/','A047'],[capture().url,'A066'],['https://jcnotes.com/airports/cyber/','A047'],['http://jcnotes.com/airports/cyber/20260830_224707/','A047'],['https://jcnotes.com.evil.org/airports/cyber/20260830_224707/','A047'],['https://u:p@jcnotes.com/airports/cyber/20260830_224707/','A047'],[capture().url+'?token=x','A047']])assert.equal(forOrigin(url,{recordId:id}),null);
  assert.equal(forOrigin(capture().url),null);
});
test('literal, date, network and range bind to exact body and current capture, not capture date',()=>{
  const o=capture(),r=extract(o,{recordId:'A047'}).speed.verifiedReports[0];
  assert.equal(r.testedAt,'2026-08-30');assert.equal(r.observedAt,o.observedAt);assert.equal(r.valueMbps,222);assert.equal(r.metric,'download_median');assert.equal(r.scope,'主要地区');assert.equal(r.independentMeasurement,false);assert.equal(r.sampleCount,null);assert.equal(r.status,'retained_third_party_metric_checked');assert.equal(r.bodySha256,hash(o.body));assert.deepEqual(r.sourceIds,[o.evidenceId]);assert.equal(o.body.slice(r.sourceLocator.start,r.sourceLocator.end),r.quote);assert.equal(r.sourceLocator.quoteSha256,hash(r.quote));assert(r.quote.includes('湖南联通 1000M'));assert(r.quote.includes('2026-08-30 22:47'));assert.equal(r.measured,undefined);assert.equal(r.rank,undefined);
});
test('missing or conflicting source literals reject with diagnostics instead of guessing',()=>{
  const cases=[
    [o=>{delete o.evidenceId;},'current_capture_evidence_id_required'],
    [o=>{delete o.observedAt;},'original_observed_at_required'],
    [o=>{o.body=o.body.replace('2026-08-30 22:47','2026-08-31 22:47');},'test_date_time_conflicts_with_snapshot_url'],
    [o=>{o.body=o.body.replace('2026-08-30 22:47','2026-02-30 22:47');},'explicit_test_date_time_missing_or_ambiguous'],
    [o=>{o.body=o.body.replace('2026-08-30 22:47','');},'explicit_test_date_time_missing_or_ambiguous'],
    [o=>{o.body=o.body.replace('湖南联通 1000M 家用宽带','');},'explicit_supported_test_network_missing'],
    [o=>{o.body=o.body.replace('湖南联通 1000M 家用宽带','广东电信 1000M 家用宽带');},'explicit_supported_test_network_missing'],
    [o=>{o.body=o.body.replaceAll('CyberGuard','NiceCloud');},'snapshot_heading_brand_mismatch'],
    [o=>{o.body=o.body.replaceAll('主要地区','完整节点');},'explicit_primary_region_download_median_mbps_missing_or_ambiguous'],
    [o=>{o.body=o.body.replace('222 Mbps','222 MB/s');},'explicit_primary_region_download_median_mbps_missing_or_ambiguous'],
    [o=>{o.body=o.body.replace('中位下载','平均下载');},'explicit_primary_region_download_median_mbps_missing_or_ambiguous'],
    [o=>{o.body=o.body.replace('222 Mbps','0 Mbps');},'explicit_primary_region_download_median_mbps_missing_or_ambiguous'],
    [o=>{o.body=o.body.replace('下载口径 · Cloudflare','下载方法 · Cloudflare');},'explicit_supported_method_missing_or_ambiguous'],
    [o=>{o.bodySha256='0'.repeat(64);},'body_hash_mismatch'],
    [o=>{o.kind='auth_checkpoint';},'authentication_or_verification_checkpoint'],
    [o=>{o.passwordForm=true;},'authentication_or_verification_checkpoint'],
  ];
  for(const [mutate,reason] of cases){const o=capture();mutate(o);assert.equal(extract(o,{recordId:'A047'}),null,reason);assert(diagnose(o,{recordId:'A047'}).reasons.includes(reason),reason);}
});
test('duplicate primary blocks and date headings are ambiguous; footer brand alone is insufficient',()=>{
  let o=capture();o.body+='\n'+o.body.slice(o.body.indexOf('本次快照样本'),o.body.indexOf('\n抖动'));assert.equal(extract(o,{recordId:'A047'}),null);
  o=capture();o.body+='\n测速快照 · 晚高峰 · 2026-08-30 22:47 · 湖南联通 1000M 家用宽带';assert.equal(extract(o,{recordId:'A047'}),null);
  o=capture();o.body=o.body.replace('← 返回 CyberGuard 长期观察','← 返回 NiceCloud 长期观察');assert.equal(extract(o,{recordId:'A047'}),null);
});
test('method revisions stay distinct; scheduled sample count is never asserted as observed',()=>{
  const o=capture();o.body=o.body.replace('下载口径 · Cloudflare Anycast 三样本单连接 v4\n本机经被测节点对 Cloudflare Anycast 运行 3 次独立单连接下载；每次最多 99 MB、最长 15 秒，最终取成功样本平均速度的中位数。','下载口径 · 旧版专用测速端点\n该速度来自旧版首个成功的专用测速端点，只代表当时到该目标的单连接速度，不能与大文件 v3 直接比较。');
  const r=extract(o,{recordId:'A047'}).speed.verifiedReports[0];assert(r.methodology.includes('旧版专用测速端点'));assert(!r.methodology.includes('运行 3 次'));assert.equal(r.sampleCount,null);
});
test('CRLF visible bodies remain exactly source-locatable',()=>{
  const o=capture();o.body=o.body.replaceAll('\n','\r\n');const r=extract(o,{recordId:'A047'}).speed.verifiedReports[0];assert.equal(r.quote,o.body.slice(r.sourceLocator.start,r.sourceLocator.end));assert.equal(r.bodySha256,hash(o.body));
});
test('prior measured, statements and existing fields survive, with no mutation or private object spill into a report',()=>{
  const prior={coreInfo:{speed:{status:'not_measured',measured:{status:'unknown'},claims:[{quote:'unverified operator claim'}],custom:{keep:true},sourceIds:['OLD']}}},before=JSON.stringify(prior),o={...capture(),privateToken:'SECRET'};
  const patch=extract(o,{recordId:'A047',prior});assert.equal(JSON.stringify(prior),before);assert.deepEqual(patch.speed.custom,{keep:true});assert.deepEqual(patch.speed.measured,prior.coreInfo.speed.measured);assert.deepEqual(patch.speed.claims,prior.coreInfo.speed.claims);assert.equal(patch.speed.status,'not_measured');assert.deepEqual(patch.speed.sourceIds,['OLD',o.evidenceId]);assert(!JSON.stringify(patch).includes('SECRET'));assert.deepEqual(Object.keys(patch),['speed']);
});
test('unchanged semantic report is idempotent and does not relabel old capture time or source',()=>{
  const first=capture(),prior=extract(first,{recordId:'A047'}),old=JSON.stringify(prior);
  const again={...first,evidenceId:'CAPTURE-LATER',observedAt:'2026-11-20T02:00:00Z',body:first.body+'\nfooter changed'};
  assert.equal(extract(again,{recordId:'A047',prior}),null);assert.equal(JSON.stringify(prior),old);assert.equal(prior.speed.verifiedReports[0].observedAt,first.observedAt);
});
test('changed value appends review correction and retains original report; reversion is another review revision',()=>{
  const o=capture(),prior=extract(o,{recordId:'A047'}),before=JSON.stringify(prior),changed={...capture(profiles[0],223),evidenceId:'CAPTURE-CORRECTION'};
  const patch=extract(changed,{recordId:'A047',prior});assert.equal(JSON.stringify(prior),before);assert.equal(patch.speed.verifiedReports.length,2);assert.deepEqual(patch.speed.verifiedReports[0],prior.speed.verifiedReports[0]);const r=patch.speed.verifiedReports[1];assert.equal(r.valueMbps,223);assert.equal(r.supersedes,prior.speed.verifiedReports[0].id);assert.equal(r.correctionPendingReview,true);assert.deepEqual(r.sourceIds,['CAPTURE-CORRECTION']);assert.equal(extract(changed,{recordId:'A047',prior:patch}),null);
  const revert=extract({...o,evidenceId:'CAPTURE-REVERT'},{recordId:'A047',prior:patch});assert.equal(revert.speed.verifiedReports.length,3);assert.equal(revert.speed.verifiedReports[2].supersedes,r.id);assert.notEqual(revert.speed.verifiedReports[2].id,prior.speed.verifiedReports[0].id);
});
test('JSON transport wrappers are not visible text and must not be guessed through',()=>{
  const o=capture();o.body=JSON.stringify({summary:o.body});assert.equal(extract(o,{recordId:'A047'}),null);
});
test('retained sixth-round SDM and YinYun snapshots preserve primary-region medians and distinct methods',t=>{
  const fs=require('node:fs'),path=require('node:path'),cases=[{id:'A006',slug:'sdm',value:186,date:'2026-08-28',nodes:'60 / 60',method:'Cloudflare Anycast 三样本单连接 v4'},{id:'A180',slug:'yy',value:13,date:'2026-08-26',nodes:'47 / 76',method:'旧版专用测速端点'}];
  for(const c of cases){const file=path.resolve(__dirname,'../work/performance-20261111-sixth/live/jcnotes-'+c.slug+'-snapshot.json');if(!fs.existsSync(file)){t.skip('Sixth-round retained actual DOM snapshots are unavailable');return;}const raw=JSON.parse(fs.readFileSync(file)),o={...raw,evidenceId:'ACTUAL-SNAPSHOT-REGRESSION-'+c.id},r=extract(o,{recordId:c.id}).speed.verifiedReports[0];assert.equal(r.valueMbps,c.value);assert.equal(r.testedAt,c.date);assert.equal(r.scope,'主要地区');assert(r.quote.includes(c.nodes));assert(r.methodology.includes(c.method));assert.equal(r.sampleCount,null);assert.equal(r.independentMeasurement,false);assert.equal(r.bodySha256,hash(raw.body));assert.equal(raw.body.slice(r.sourceLocator.start,r.sourceLocator.end),r.quote);assert.deepEqual(r.sourceIds,[o.evidenceId]);assert.equal(extract(o,{recordId:c.id,prior:{speed:{verifiedReports:[r]}}}),null);
    const wrongScope={...o,body:raw.body.replace('本次快照样本\n主要地区可用节点','本次快照样本\n全地区可用节点')};delete wrongScope.sha256;assert.equal(extract(wrongScope,{recordId:c.id}),null);assert.equal(forOrigin(raw.url,{recordId:c.id==='A006'?'A180':'A006'}),null);
    const overview=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../work/performance-20261111-sixth/live/jcnotes-'+c.slug+'.json')));assert.equal(extract({...overview,evidenceId:'OVERVIEW-NOT-SNAPSHOT'},{recordId:c.id}),null);
  }
});
test('Renzhe 305 Mbps remains a candidate without a verified current-service binding',t=>{
  const fs=require('node:fs'),path=require('node:path'),file=path.resolve(__dirname,'../work/performance-20261111-seventh/live/jcnotes-renzhe-snapshot.json');if(!fs.existsSync(file)){t.skip('Actual seventh-round Renzhe snapshot is unavailable');return;}
  const raw=JSON.parse(fs.readFileSync(file)),o={...raw,evidenceId:'ACTUAL-RENZHE-CANDIDATE'};assert(raw.body.includes('305 Mbps'));assert(raw.body.includes('2026-09-01 19:50'));assert.equal(profiles.some(p=>p.slug==='renzhe'),false);
  for(const recordId of ['A197','A024']){assert.equal(forOrigin(raw.url,{recordId}),null);assert.equal(extract(o,{recordId}),null);assert(diagnose(o,{recordId}).reasons.includes('publisher_route_or_record_identity_not_allowlisted'));}
});

test('SS-ID alias A200 can replay the exact frozen summary after explicit unwrapping while wrappers stay rejected',t=>{
  const fs=require('node:fs'),path=require('node:path'),file=path.resolve(__dirname,'../work/performance-20261111-seventh/ssid-reuse-candidate.json');if(!fs.existsSync(file)){t.skip('Frozen seventh-round SS-ID candidate is unavailable');return;}
  const candidate=JSON.parse(fs.readFileSync(file)),ref=candidate.materials.find(m=>m.key===candidate.primaryKey).ref,{loadOriginal}=require('../lib/performance-evidence.cjs'),root=path.resolve(__dirname,'..'),original=loadOriginal(root,ref),o={...original,evidenceId:'FROZEN-SSID-REPLAY-A200'},r=extract(o,{recordId:'A200'}).speed.verifiedReports[0];assert.equal(r.valueMbps,449);assert.equal(r.testedAt,'2026-08-31');assert.equal(r.observedAt,'2026-10-27T14:39:15.219Z');assert.equal(r.scope,'主要地区');assert(r.quote.includes('15 / 15'));assert(r.methodology.includes('方法声明不一致'));assert.equal(r.sampleCount,null);assert.equal(r.independentMeasurement,false);assert.equal(r.bodySha256,ref.bodySha256);assert.equal(original.representation,'explicit_retained_summary_field');assert.equal(original.body.slice(r.sourceLocator.start,r.sourceLocator.end),r.quote);assert(forOrigin(original.url,{recordId:'A059'}));assert.equal(forOrigin(original.url,{recordId:'A024'}),null);
  const wrapper=JSON.parse(fs.readFileSync(path.resolve(root,ref.file)));assert.equal(extract({...o,body:wrapper.text},{recordId:'A200'}),null);assert.equal(extract(o,{recordId:'A200',prior:{speed:{verifiedReports:[r]}}}),null);
});
