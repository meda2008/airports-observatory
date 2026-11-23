'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {profiles,forOrigin,extract,diagnose}=require('../collection/url-collectors/regional-performance-parsers.cjs');
const hash=s=>createHash('sha256').update(s).digest('hex');
function document(p=profiles[0],value='506.06'){
  return{title:p.aliases[0]+'机场怎么样？套餐价格、节点速度与解锁实测｜机场笔记',url:p.origin+`/reviews/${p.slug}/`,affiliate:true,sections:{
    's7-environment':'ENVIRONMENT\n7.\n测试环境与方法\n测试所在地\t广西（截图状态栏标示）\n宽带运营商\t广西移动（截图状态栏标示）\n家宽带宽\t2Gbps（截图状态栏标示）\n测试周期\t2025-10-04 单次测速\n主要测试时段\t12:53:18 CST\n测试客户端\tMiaoKo 自定义测试\n状态栏逐项照录：线程=6、排序=订阅原序。',
    's8-speed':'SPEED & LATENCY\n8.\n速度与延迟\n本表为本站实测记录。 测试时间：2025-10-04 单次测速。\n地区\t测试节点数\t有效节点数\t延迟类型\t平均延迟\t平均下载速度\t原始平均速度\t速度范围\t测试工具\n新加坡\t24\t24 / 24\tTLS RTT\t66.3 ms\t'+value+' Mbps\t63.26 MB/s\t42.01 MB/s ~ 71.51 MB/s\tMiaoKo 自定义测试\n香港\t18\t0 / 18\t未测试\t未测试\t0 Mbps\t0.00 MB/s\t0 MB/s ~ 0 MB/s\tMiaoKo 自定义测试\n\n单次任务成功率不等于稳定性。',
  }};
}
function capture(p=profiles[0],value){return{url:p.origin+`/reviews/${p.slug}/`,body:JSON.stringify(document(p,value)),evidenceId:'CURRENT-CAPTURE',observedAt:'2026-11-11T04:00:00Z'};}
function change(o,fn){const d=JSON.parse(o.body);fn(d);o.body=JSON.stringify(d);return o;}
function resolveField(body,l){let d=JSON.parse(body);for(const step of l.derivationChain.slice(1)){assert.equal(step,'JSON.parse(previous.text)');d=JSON.parse(d.text);}return l.selectedField==='text'?d.text:l.selectedField==='title'?d.title:d.sections[l.selectedField.match(/^sections\["(.+)"\]$/)[1]];}
function verifyLocators(o,report){assert.equal(report.bodySha256,hash(o.body));for(const l of report.sourceLocator.fields){const field=l.kind==='body_utf16_range'?o.body:resolveField(o.body,l);if(l.derivedBodySha256)assert.equal(hash(field),l.derivedBodySha256);assert.equal(field.slice(l.start,l.end),l.quote);assert.equal(hash(l.quote),l.quoteSha256);}}
test('13 explicit record profiles, with duplicate Erwan source group and no implicit identity fallback',()=>{
  assert.equal(profiles.length,13);assert.equal(new Set(profiles.map(p=>p.recordId)).size,13);
  for(const p of profiles){const o=capture(p),parser=forOrigin(o.url,{recordId:p.recordId});assert.deepEqual(parser.recordIds,[p.recordId]);assert.equal(parser.extract(o,{recordId:p.recordId}).speed.regionalReports[0].regions.length,2);}
  const a=extract(capture(profiles[0]),{recordId:'A028'}).speed.regionalReports[0],b=extract(capture(profiles.at(-1)),{recordId:'A199'}).speed.regionalReports[0];assert.equal(a.canonicalSourceGroup,b.canonicalSourceGroup);assert.deepEqual(a.duplicateCatalogRecordIds,['A028','A199']);assert.equal(a.independentMeasurement,false);
  for(const [url,id] of [[capture().url,'A084'],['https://jichangnote.com.evil.com/reviews/erwan-cloud/','A028'],['http://jichangnote.com/reviews/erwan-cloud/','A028'],['https://a:b@jichangnote.com/reviews/erwan-cloud/','A028'],[capture().url+'?token=secret','A028']])assert.equal(forOrigin(url,{recordId:id}),null);assert.equal(forOrigin(capture().url),null);
});
test('structured JSON keeps raw body hash and explicit derived title/environment/row locators',()=>{
  const o=capture(),r=extract(o,{recordId:'A028'}).speed.regionalReports[0];verifyLocators(o,r);assert.equal(r.sourceLocator.kind,'structured_capture_field_ranges');assert(r.sourceLocator.fields.some(l=>l.selectedField==='title'));assert(r.sourceLocator.fields.some(l=>l.selectedField==='sections["s7-environment"]'));assert.deepEqual(r.sourceIds,[o.evidenceId]);assert.equal(r.testedAt,'2025-10-04');assert.equal(r.observedAt,o.observedAt);assert.equal(r.threadCount,6);assert.equal(r.regions[0].valueMbps,506.06);assert.equal(r.regions[0].originalValueMBps,63.26);assert.equal(r.regions[1].valueMbps,0);assert.equal(r.sampleCount,null);assert.equal(r.metric,'regional_download_mean');assert.equal(r.statistic,'publisher_reported_regional_mean');assert.equal(r.independentMeasurement,false);assert.equal(r.literalChecked,true);assert.equal(r.valueMbps,undefined);assert.equal(r.measured,undefined);assert.equal(r.rank,undefined);
});
test('nested retained wrappers preserve derivation chain rather than relabeling JSON as DOM',()=>{
  const o=capture();o.body=JSON.stringify({capturedAt:o.observedAt,text:JSON.stringify({text:o.body})});const r=extract(o,{recordId:'A028'}).speed.regionalReports[0];verifyLocators(o,r);assert.deepEqual(r.regions[0].sourceLocator.derivationChain,['JSON.parse(body)','JSON.parse(previous.text)','JSON.parse(previous.text)']);assert.equal(r.sourceLocator.kind,'structured_capture_field_ranges');
});
test('explicit captured text representation resolves through text field and section offsets',()=>{
  const p=profiles.find(p=>p.recordId==='A151'),o=capture(p),d=JSON.parse(o.body);o.body=JSON.stringify({text:'原页标题：'+d.title+'\n'+d.sections['s7-environment']+'\n'+d.sections['s8-speed']+'\nEVIDENCE\n9.\n证据图片'});const r=extract(o,{recordId:'A151'}).speed.regionalReports[0];verifyLocators(o,r);assert.equal(r.regions[0].sourceLocator.selectedField,'text');
});
test('real DOM-shaped text uses raw body ranges, with same scoped values as sections',()=>{
  const o=capture(),d=JSON.parse(o.body),expected=extract(o,{recordId:'A028'}).speed.regionalReports[0];o.body='机场笔记\n尔湾云机场测评\n'+d.sections['s7-environment']+'\n'+d.sections['s8-speed']+'\nEVIDENCE\n9.\n证据图片';const r=extract(o,{recordId:'A028'}).speed.regionalReports[0];verifyLocators(o,r);assert.equal(r.sourceLocator.kind,'dom_capture_field_ranges');assert.equal(r.contentSignature,expected.contentSignature);assert.equal(r.regions[0].valueMbps,506.06);
});
test('Yangfan explicit DOM profile preserves the real historical context and eight regional means',()=>{
  const fixture=require('./fixtures/performance-yangfan-dom.json'),o={...fixture,evidenceId:'YANGFAN-FIXTURE'},d=diagnose(o,{recordId:'A049'});
  assert.equal(d.accepted,true,JSON.stringify(d.reasons));const r=d.report;verifyLocators(o,r);
  assert.equal(forOrigin(o.url,{recordId:'A049'}).slug,'yangfan-cloud');assert.equal(forOrigin(o.url,{recordId:'A084'}),null);
  assert.equal(r.testedAt,'2026-01-13');assert.equal(r.testTime,'16:35:28 CST');assert.equal(r.observedAt,'2026-11-11T08:45:21.698Z');assert.equal(r.threadCount,1);
  assert.equal(r.network,'截图无法可靠辨认；大亨电信（截图状态栏标示）；1Gbps（截图状态栏标示）（第三方自述）');
  assert.equal(r.regions.length,8);assert.deepEqual(r.regions.map(v=>v.name),['香港','台湾','日本','新加坡','韩国','马来西亚','美国','法国']);
  assert.deepEqual(r.regions.map(v=>v.valueMbps),[166.09,229.29,206.82,199.1,57.88,87.06,84.58,211.1]);
  assert.equal(r.regions.reduce((n,v)=>n+Number(v.quote.split('\t')[1]),0),52);assert(o.body.includes('52 个实际节点'));assert(o.body.includes('概要=56/56'));
  assert.equal(r.sampleCount,null);assert.equal(r.independentMeasurement,false);assert.equal(r.statistic,'publisher_reported_regional_mean');assert.equal(r.valueMbps,undefined);assert.equal(r.measured,undefined);
  assert(r.sourceLocator.fields.some(l=>l.quote==='测试所在地\t截图无法可靠辨认'));assert(r.sourceLocator.fields.some(l=>l.quote==='线程=1'));
  const prior={speed:{status:'not_measured',measured:{observations:[]},verifiedReports:[]}},patch=extract(o,{recordId:'A049',prior});
  assert.deepEqual(patch.speed.measured,prior.speed.measured);assert.deepEqual(patch.speed.verifiedReports,[]);
  const blocked={...o,body:o.body.replace('宽带运营商\t大亨电信（截图状态栏标示）','宽带运营商\t未知')};delete blocked.sha256;
  assert(diagnose(blocked,{recordId:'A049'}).reasons.includes('explicit_network_or_bandwidth_required'));
});
test('source identity, raw hash, date, network, thread and original mean units fail closed',()=>{
  const mutations=[
    [o=>{delete o.evidenceId;},'current_capture_evidence_id_required'],[o=>{delete o.observedAt;},'original_observed_at_required'],
    [o=>{o.sha256='0'.repeat(64);},'original_capture_body_hash_mismatch'],[o=>{o.passwordForm=true;},'authentication_or_verification_checkpoint'],
    [o=>change(o,d=>{d.title='九云机场怎么样？';}),'publisher_heading_brand_mismatch'],
    [o=>change(o,d=>{d.url='https://jichangnote.com/reviews/firefly/';}),'embedded_publisher_url_conflict'],
    [o=>change(o,d=>{d.sections['s7-environment']=d.sections['s7-environment'].replace('2025-10-04','2025-02-30');}),'explicit_valid_test_date_required'],
    [o=>change(o,d=>{d.sections['s8-speed']=d.sections['s8-speed'].replace('2025-10-04','2026-10-04');}),'environment_and_speed_test_date_conflict'],
    [o=>change(o,d=>{d.sections['s7-environment']=d.sections['s7-environment'].replace('家宽带宽\t2Gbps（截图状态栏标示）','家宽带宽\t未知');}),'explicit_network_or_bandwidth_required'],
    [o=>change(o,d=>{d.sections['s7-environment']=d.sections['s7-environment'].replace('线程=6','线程未知');}),'explicit_unambiguous_thread_count_required'],
    [o=>change(o,d=>{d.sections['s7-environment']+='\n32 线程';}),'explicit_unambiguous_thread_count_required'],
    [o=>change(o,d=>{d.sections['s8-speed']=d.sections['s8-speed'].replace('平均下载速度','最高下载速度');}),'explicit_regional_mean_table_header_required'],
    [o=>change(o,d=>{d.sections['s8-speed']=d.sections['s8-speed'].replace('506.06 Mbps','506.06 MB/s');}),'malformed_or_wrong_unit_regional_mean_row'],
    [o=>change(o,d=>{d.sections['s8-speed']=d.sections['s8-speed'].replace('63.26 MB/s','63.26 Mbps');}),'malformed_or_wrong_unit_regional_mean_row'],
    [o=>change(o,d=>{d.sections['s8-speed']=d.sections['s8-speed'].replace('新加坡\t24','香港\t24');}),'duplicate_regional_mean_row'],
  ];for(const [mutate,reason] of mutations){const o=capture();mutate(o);const d=diagnose(o,{recordId:'A028'});assert.equal(d.accepted,false,reason);assert(d.reasons.includes(reason),reason+': '+d.reasons);assert.equal(extract(o,{recordId:'A028'}),null);}
});
test('no mean reconstruction from MB/s, video or arbitrary prose; rounding stays original',()=>{
  const o=capture();change(o,d=>{d.sections['s8-speed']=d.sections['s8-speed'].replace('506.06 Mbps','999.12 Mbps');});const r=extract(o,{recordId:'A028'}).speed.regionalReports[0];assert.equal(r.regions[0].valueMbps,999.12);assert.equal(r.regions[0].originalValueMBps,63.26);assert.notEqual(r.regions[0].valueMbps,r.regions[0].originalValueMBps*8);
  assert.equal(extract({...o,body:'尔湾云机场测评\n视频连接速度506060 Kbps\n平均63.26 MB/s'},{recordId:'A028'}),null);
});
test('recapture preserves original report time/source; semantic correction appends pending history',()=>{
  const o=capture(),prior=extract(o,{recordId:'A028'}),before=JSON.stringify(prior),again={...o,observedAt:'2026-11-20T00:00:00Z',evidenceId:'NEW-CAPTURE'};change(again,d=>{d.unrelated='new footer';});assert.equal(extract(again,{recordId:'A028',prior}),null);assert.equal(JSON.stringify(prior),before);
  const changed=capture(profiles[0],'500.01');changed.evidenceId='CORRECTION';const patch=extract(changed,{recordId:'A028',prior}),r=patch.speed.regionalReports[1];assert.equal(patch.speed.regionalReports.length,2);assert.deepEqual(patch.speed.regionalReports[0],prior.speed.regionalReports[0]);assert.equal(r.supersedes,prior.speed.regionalReports[0].id);assert.equal(r.correctionPendingReview,true);assert.deepEqual(r.sourceIds,['CORRECTION']);assert.equal(extract(changed,{recordId:'A028',prior:patch}),null);
});
test('existing current measurement/status/details remain unchanged; private input is not copied',()=>{
  const prior={coreInfo:{speed:{status:'not_measured',measured:{status:'unknown'},verifiedReports:[{id:'EXISTING'}],custom:{keep:true},sourceIds:['OLD']}}},before=JSON.stringify(prior),o={...capture(),privateToken:'SECRET'};change(o,d=>{d.password='SECRET';});const patch=extract(o,{recordId:'A028',prior});assert.equal(JSON.stringify(prior),before);assert.deepEqual(patch.speed.measured,prior.coreInfo.speed.measured);assert.deepEqual(patch.speed.verifiedReports,prior.coreInfo.speed.verifiedReports);assert.equal(patch.speed.status,'not_measured');assert.deepEqual(patch.speed.custom,{keep:true});assert(!JSON.stringify(patch).includes('SECRET'));assert.deepEqual(Object.keys(patch),['speed']);
});
