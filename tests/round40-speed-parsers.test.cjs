'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const parser=require('../collection/url-collectors/round40-speed-parsers.cjs'),{sha,verifyQuote}=require('../lib/performance-evidence.cjs');
const research=require('../work/performance-docker-20261114/jms-review-research.json');
const base=structuredClone(parser.profiles[0]);
function qualified(){const p=structuredClone(base),at=new Date(Date.now()-1000).toISOString();p.identityQualified=true;p.initialSourceObservedAt=at;p.identityProofs=[{role:'publisher_tutorial',url:p.nativeTutorialUrl,observedAt:at,bodySha256:'a'.repeat(64),nativeOutboundUrl:'https://fixture.example/official-link'},{role:'native_destination',url:'https://fixture.example/official-link',observedAt:at,destinationUrl:'https://justmysocks.net/'},{role:'current_official',url:'https://justmysocks.net/',observedAt:at,bodySha256:'b'.repeat(64)}];return p;}
const active=()=>parser.createParser([qualified()]);
function observation(){return {url:base.url,body:research.text,kind:'public_performance_reference',evidenceId:'fixture-only-jms-original',observedAt:new Date().toISOString(),sha256:sha(research.text),metadata:{performanceReference:true,authenticationObserved:false,links:research.links,timeMetadata:research.times.map(t=>({dateTime:t.datetime,label:t.text}))}};}
test('new source is disabled until current official native chain is reviewed',()=>{
 const hold=parser.createParser([{...structuredClone(base),identityQualified:false,identityProofs:[]}]);assert.equal(hold.forOrigin(base.url,{recordId:'A023'}),null);assert.deepEqual(hold.sourceTargets('A023',{speed:{}}),[]);assert.equal(hold.diagnose(observation(),{recordId:'A023'}).accepted,false);
 for(const change of [p=>{p.currentOfficialOrigin='https://wrong.example';},p=>{p.identityProofs[1].destinationUrl='https://justmysocks.net.evil.example';},p=>{p.identityProofs[2].bodySha256='bad';},p=>{p.identityProofs[2].url='https://private:pass@justmysocks.net/';},p=>{p.identityProofs[0].nativeOutboundUrl='file:///private';p.identityProofs[1].url='file:///private';}]){const p=qualified();change(p);assert.equal(parser.createParser([p]).diagnose(observation(),{recordId:'A023'}).accepted,false);}
});
test('fresh public original preserves all five literal rows and publication-only clock',()=>{
 const p=active(),o=observation(),d=p.diagnose(o,{recordId:'A023'});assert.equal(d.accepted,true,d.reasons.join(','));const f=d.facts[0].fact;
 assert.deepEqual(f.rows.map(r=>[r.name,r.latencyMs,r.downloadMbps,r.uploadMbps]),[['第一组',229,204.2,8.38],['第二组',210,183.42,7.69],['第三组',209,265.08,3.09],['第四组',207,267.18,6.66],['第五组',220,205.92,7.46]]);
 verifyQuote(o.body,f);for(const counter of f.counterevidence)verifyQuote(o.body,counter);
 assert.equal(f.testedAt,null);assert.equal(f.date,null);assert.equal(f.publishedAt,null);assert.equal(f.publicationLocalTime,'2019-03-18 17:53');assert.equal(f.publicationTimeZone,null);assert.equal(f.sampleCount,null);assert.equal(f.independentSourceCount,1);assert.equal(f.current,false);assert.equal(f.valueMbps,null);assert.equal(f.aggregateValue,null);assert.equal(f.medianMbps,null);assert.equal(f.eligibleForSpeedRanking,false);assert.equal(f.accessBandwidth,null);assert.equal(f.independentMeasurement,false);assert.equal(f.measurementVerified,false);
 const contextual=p.context({speed:{speedTestReports:[f]}});assert.equal(contextual.label,'有第三方历史测速表（测试日期未明）');assert.equal(contextual.rows.length,5);assert.equal(contextual.testedAt,null);
 for(const bad of [{...f,valueMbps:1000},{...f,testedAt:'2019-03-18'},{...f,publicationTimeZone:'UTC'},{...f,contentSignature:'changed'}])assert.equal(p.context({speed:{speedTestReports:[bad]}}),null);
});
test('reviewed justmysocks5.net native destination remains distinct from canonical justmysocks.net',()=>{
 const p=qualified();p.reviewedOfficialOrigins=['https://justmysocks.net','https://justmysocks5.net'];p.identityProofs[0].nativeOutboundUrl='https://by.affpass.com/go/jms';p.identityProofs[1].url='https://by.affpass.com/go/jms';p.identityProofs[1].destinationUrl='https://justmysocks5.net/members/cart.php?gid=1';p.identityProofs[2].url=p.identityProofs[1].destinationUrl;
 const d=parser.createParser([p]).diagnose(observation(),{recordId:'A023'});assert.equal(d.accepted,true);assert.equal(d.facts[0].fact.currentOfficialOrigin,'https://justmysocks.net');assert.equal(d.facts[0].fact.nativeDestinationOrigin,'https://justmysocks5.net');
 p.reviewedOfficialOrigins.push('https://justmysocks6.net');assert.equal(parser.createParser([p]).diagnose(observation(),{recordId:'A023'}).accepted,false);
});
test('exact source and isolated metadata are required; no candidate, captcha or account capture admitted',()=>{
 const p=active();for(const mutate of [o=>{o.url+='?x=1';},o=>{o.kind='operator_visible_page';},o=>{o.metadata.authenticationObserved=true;},o=>{o.metadata.verificationWidgetObserved=true;},o=>{o.metadata.passwordForm=true;},o=>{o.metadata.agreementCheckbox=true;},o=>{delete o.evidenceId;},o=>{o.metadata.timeMetadata=[];},o=>{o.metadata.timeMetadata[0].dateTime='2019-03-18T17:53:00Z';},o=>{o.metadata.links=[];},o=>{o.sha256='0'.repeat(64);},o=>{o.observedAt='2018-01-01T00:00:00Z';}]){const o=observation();mutate(o);assert.equal(p.diagnose(o,{recordId:'A023'}).accepted,false);}
 assert.equal(p.diagnose(observation(),{recordId:'A024'}).accepted,false);
});
test('missing, contradictory and duplicate table rows are held instead of guessed',()=>{
 const p=active();for(const transform of [b=>b.replace('229ms','230ms'),b=>b.replace('第一组\t229ms','第一组\t229 Mbps'),b=>b.replace('上行带宽这么小因为本地限制','上行完全不受限制'),b=>b.replace('我们非 Just My Socks 官方','我们是官方'),b=>b.replace('下行：204.20 Mbps','下行：204.21 Mbps'),b=>b+'\n线路\tPING\t下行\t上行\n第一组\t229ms\t204.20 Mbps\t8.38 Mbps']){const o=observation();o.body=transform(o.body);o.sha256=sha(o.body);assert.equal(p.diagnose(o,{recordId:'A023'}).accepted,false);}
});
test('semantic duplicate remains unchanged across new capture times and unrelated navigation updates',()=>{
 const p=active(),o=observation(),prior={speed:{advertised:[],sourceIds:['older']},pricing:{status:'preserve'},refund:{summary:'preserve'}};
 const patch=p.extract(o,{recordId:'A023',prior});assert.deepEqual(Object.keys(patch),['speed']);assert.equal(patch.speed.speedTestReports.length,1);assert.deepEqual(patch.speed.sourceIds,['older',o.evidenceId]);
 const later=observation();later.body+='\n页面导航更新';later.sha256=sha(later.body);later.evidenceId='fixture-second-capture';assert.equal(p.extract(later,{recordId:'A023',prior:{...prior,speed:patch.speed}}),null);
 assert.deepEqual(prior.speed,{advertised:[],sourceIds:['older']});assert.equal(prior.pricing.status,'preserve');assert.deepEqual(p.sourceTargets('A023',prior).map(r=>r.url),[base.url]);assert.equal(p.sourceTargets('A024',prior).length,0);
});
