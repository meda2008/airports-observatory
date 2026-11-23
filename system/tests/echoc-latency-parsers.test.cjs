'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const parser=require('../collection/url-collectors/echoc-latency-parsers.cjs'),fixture=require('./fixtures/performance-echoc-latency.json');
const hash=s=>createHash('sha256').update(s).digest('hex');
const capture=()=>({...structuredClone(fixture),evidenceId:'TEST-CURRENT-ECHOC-CAPTURE'});
function changed(fn){const o=capture();fn(o);o.sha256=hash(o.body);return o;}
function verify(o,r){assert.equal(r.bodySha256,hash(o.body));for(const [quote,l] of [[r.quote,r.sourceLocator],[r.publicationQuote,r.publicationSourceLocator],[r.methodology,r.methodologySourceLocator],...r.rows.map(row=>[row.quote,row.sourceLocator])]){assert.equal(o.body.slice(l.start,l.end),quote);assert.equal(hash(quote),l.quoteSha256);}}
test('two explicit identities share exact canonical publisher path and no other route',()=>{
  assert.deepEqual(parser.profiles.map(p=>p.recordId),['A016','A182']);for(const id of ['A016','A182']){assert.deepEqual(parser.forOrigin(fixture.url,{recordId:id}).recordIds,[id]);assert.equal(parser.sourceTargets(id)[0].url,fixture.url);}
  for(const [url,id] of [[fixture.url,'A017'],[fixture.url+'?foo=bar','A016'],[fixture.url+'#details','A016'],['https://echoccc.online.evil.example/posts/airport-review/','A016'],['http://echoccc.online/posts/airport-review/','A016'],['https://u:p@echoccc.online/posts/airport-review/','A016']])assert.equal(parser.forOrigin(url,{recordId:id}),null);assert.deepEqual(parser.sourceTargets('A017'),[]);
});
test('actual retained body yields Amy 10 rows and Gatern 18 with exact brand-local raw locators',()=>{
  const o=capture();for(const [id,count] of [['A016',10],['A182',18]]){const d=parser.diagnose(o,{recordId:id});assert.equal(d.accepted,true,d.reasons.join(','));assert.equal(d.report.rows.length,count);verify(o,d.report);assert(d.report.rows.every(r=>r.sourceLocator.start>d.report.sourceLocator.start&&r.sourceLocator.end<=d.report.sourceLocator.end));assert.equal(d.report.rows.filter(r=>r.network==='中国联通').length,count/2);assert.equal(d.report.rows.filter(r=>r.network==='中国移动').length,count/2);}
  const amy=parser.extract(o,{recordId:'A016'}).speed.latencyReports[0],gatern=parser.extract(o,{recordId:'A182'}).speed.latencyReports[0];assert.equal(amy.canonicalSourceGroup,gatern.canonicalSourceGroup);assert.equal(amy.rows[0].cloudflare.weightedMs,190.73);assert.equal(gatern.rows[0].cloudflare.weightedMs,365.13);assert.equal(amy.rows.at(-1).sampleSuccessPct.cloudflare,82.1);assert.equal(amy.rows.at(-1).sampleSuccessPct.google,84.6);
});
test('publication date is not test date; weighted latency, planned rounds and sample success never become bandwidth or uptime',()=>{
  const r=parser.extract(capture(),{recordId:'A016'}).speed.latencyReports[0];assert.equal(r.publishedAt,'2026-10-15');assert.equal(r.testedAt,null);assert.equal(r.metric,'https_elapsed_ms');assert.equal(r.kind,'historical_third_party_latency_report');assert.equal(r.measurementVerified,false);assert.equal(r.independentMeasurement,false);assert.equal(r.sampleCount,null);assert.equal(r.roundsPerTarget,3);assert.equal(r.timeoutMs,5000);assert.equal(r.concurrency,4);assert(r.networkContexts.every(n=>n.location===null&&n.testWindow===null));assert.equal(r.valueMbps,undefined);assert.equal(r.rank,undefined);assert.equal(r.p50,undefined);assert.equal(r.rows[0].cloudflare.fastestMs,183.79);assert.equal(r.rows[0].cloudflare.typicalMs,218.48);assert(r.limitations.some(s=>s.includes('不是P50')));
});
test('method, publication metadata, region membership/count, units and native identity fail closed',()=>{
  const cases=[
    [o=>{o.body=o.body.replace('各 3 轮，超时 5 秒，并发 4','各 5 轮，超时 5 秒，并发 4');},'explicit_https_latency_method_missing_or_changed'],
    [o=>{o.body=o.body.replace('完整 HTTPS 请求耗时（elapsed_ms）','ICMP Ping');},'explicit_https_latency_method_missing_or_changed'],
    [o=>{o.body=o.body.replace('80% × F + 20% × M','P50');},'explicit_https_latency_method_missing_or_changed'],
    [o=>{o.body=o.body.replace('2026年10月15日','2026年2月30日');},'explicit_unique_publication_date_required'],
    [o=>{o.body=o.body.replace('2026年10月15日 凌晨','2026年10月15日 凌晨\n2026年10月16日 早晨');},'explicit_unique_publication_date_required'],
    [o=>{o.publishedAt='2026-10-16';},'publication_date_metadata_conflict'],
    [o=>{o.body=o.body.replace('AmyTelecom 分地区测试明细','Gatern 分地区测试明细');},'unique_record_detail_section_required'],
    [o=>{o.links=o.links.filter(l=>!l.url.includes('amytele'));},'same_named_native_official_links_required'],
    [o=>{o.body=o.body.replace('官网：https://www.amytele.co/','官网：https://www.amytele.co.evil.example/');},'same_named_native_official_links_required'],
    [o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('190.73 ms (183.79 / 218.48)','190.73 Mbps (183.79 / 218.48)');},'unexpected_detail_row_or_unit'],
    [o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('香港\t21/21','法国\t21/21');},'unexpected_or_duplicate_region'],
    [o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('台湾\t10/10','香港\t10/10');},'unexpected_or_duplicate_region'],
    [o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');const before=o.body.slice(0,s),after=o.body.slice(s).split('\n');after.splice(after.findIndex(l=>l.startsWith('香港\t')),1);o.body=before+after.join('\n');},'network_region_count_mismatch'],
    [o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('香港\t21/21','香港\t22/21');},'invalid_node_count_or_sample_success_percentage'],
    [o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('100.0% / 100.0%','101.0% / 100.0%');},'invalid_node_count_or_sample_success_percentage'],
    [o=>{o.metadata={verificationWidgetObserved:true};},'authentication_or_verification_checkpoint'],
  ];for(const [mutate,reason] of cases){const o=changed(mutate),d=parser.diagnose(o,{recordId:'A016'});assert.equal(d.accepted,false,reason);assert(d.reasons.includes(reason),reason+': '+d.reasons);assert.equal(parser.extract(o,{recordId:'A016'}),null);}
});
test('source and original capture clock/hash remain mandatory',()=>{
  for(const mutate of [o=>{delete o.evidenceId;},o=>{delete o.observedAt;},o=>{o.sha256='0'.repeat(64);}]){const o=capture();mutate(o);assert.equal(parser.extract(o,{recordId:'A016'}),null);}
});
test('comparison table and other brand changes do not enter this brand report or refresh its clock',()=>{
  const o=capture(),prior=parser.extract(o,{recordId:'A016'}),before=JSON.stringify(prior);
  const other=changed(o=>{o.body=o.body.replace('190.73 / 194.60 ms','999.00 / 999.00 ms');const s=o.body.indexOf('Gatern 多节点地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('365.13 ms (348.38 / 432.13)','999.00 ms (348.38 / 432.13)');});other.evidenceId='LATER';other.observedAt='2026-11-12T00:00:00Z';assert.equal(parser.extract(other,{recordId:'A016',prior}),null);assert.equal(JSON.stringify(prior),before);
});
test('weighted published values remain literal and corrections append pending history with existing speed intact',()=>{
  const o=capture(),prior=parser.extract(o,{recordId:'A016'});prior.speed.measured={status:'unknown'};prior.speed.verifiedReports=[{id:'UNCHANGED'}];const before=JSON.stringify(prior);
  const revised=changed(o=>{const s=o.body.indexOf('AmyTelecom 分地区测试明细');o.body=o.body.slice(0,s)+o.body.slice(s).replace('190.73 ms (183.79 / 218.48)','191.99 ms (183.79 / 218.48)');});revised.evidenceId='CORRECTION-CAPTURE';const patch=parser.extract(revised,{recordId:'A016',prior}),r=patch.speed.latencyReports[1];assert.equal(JSON.stringify(prior),before);assert.equal(r.rows[0].cloudflare.weightedMs,191.99);assert.equal(r.rows[0].cloudflare.fastestMs,183.79);assert.equal(r.supersedes,prior.speed.latencyReports[0].id);assert.equal(r.correctionPendingReview,true);assert.deepEqual(patch.speed.latencyReports[0],prior.speed.latencyReports[0]);assert.deepEqual(patch.speed.measured,{status:'unknown'});assert.deepEqual(patch.speed.verifiedReports,[{id:'UNCHANGED'}]);assert.deepEqual(r.sourceIds,['CORRECTION-CAPTURE']);assert.equal(parser.extract(revised,{recordId:'A016',prior:patch}),null);
});
test('identical rows in both network tables retain their own subsection locations',()=>{
  const o=capture(),r=parser.extract(o,{recordId:'A016'}).speed.latencyReports[0],first=r.rows[0].quote,second=r.rows[5].quote;const modified=changed(o=>{o.body=o.body.replace(second,first);});const rows=parser.extract(modified,{recordId:'A016'}).speed.latencyReports[0].rows;assert.equal(rows[0].quote,rows[5].quote);assert(rows[5].sourceLocator.start>rows[0].sourceLocator.end);assert.equal(modified.body.slice(rows[5].sourceLocator.start,rows[5].sourceLocator.end),first);
});
