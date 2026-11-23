'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createParser}=require('../collection/url-collectors/unresolved-history-parsers.cjs'),hash=s=>createHash('sha256').update(s).digest('hex');
const profiles=[{recordId:'A190',url:'https://shadowrocket.one/anyland-v2ray-relay/',quote:'Anyland 机场是一家成立于2021年的机场。',year:'2021',claimSubject:'Anyland',limitations:['当前入口安妮品牌与旧候选的归属关系未核实。']}],parser=createParser(profiles);
function capture(){return{url:profiles[0].url,body:'第三方评测标题\n'+profiles[0].quote+'\n当前页面其他内容',evidenceId:'CURRENT-PUBLIC-CAPTURE',observedAt:'2026-11-11T10:00:00Z'};}
test('exact HTTPS source and record require explicit configuration, with no fallback guesses',()=>{
 assert(parser.forOrigin(profiles[0].url,{recordId:'A190'}));assert.equal(parser.sourceTargets('A190')[0].sourceType,'identity_unresolved_third_party_history');assert.deepEqual(parser.sourceTargets('A191'),[]);assert.equal(createParser([]).extract(capture(),{recordId:'A190'}),null);
 for(const [url,id] of [[profiles[0].url,'A031'],[profiles[0].url+'?ref=affiliate','A190'],[profiles[0].url+'#section','A190'],['https://shadowrocket.one.evil.example/anyland-v2ray-relay/','A190'],['http://shadowrocket.one/anyland-v2ray-relay/','A190'],['https://u:p@shadowrocket.one/anyland-v2ray-relay/','A190']])assert.equal(parser.forOrigin(url,{recordId:id}),null);
});
test('only unresolved appendix claims are generated, with original source/clock/range and explicit limits',()=>{
 const o=capture(),patch=parser.extract(o,{recordId:'A190'}),history=patch.operatingHistory,f=history.historicalClaims[0];assert.equal(f.kind,'identity_unresolved_third_party_year_claim');assert.equal(f.status,'identity_unresolved');assert.equal(f.date,'2021');assert.equal(f.datePrecision,'year');assert.equal(f.claimSubject,'Anyland');assert.equal(f.identityVerified,false);assert.equal(f.currentOperatingServiceIdentityVerified,false);assert.equal(f.continuousOperationVerified,false);assert.equal(f.literalChecked,true);assert.deepEqual(f.sourceIds,[o.evidenceId]);assert.equal(f.observedAt,o.observedAt);assert.equal(f.bodySha256,hash(o.body));assert.equal(o.body.slice(f.sourceLocator.start,f.sourceLocator.end),f.quote);assert.equal(f.sourceLocator.quoteSha256,hash(f.quote));assert.equal(history.historyStatements,undefined);assert.equal(history.foundedAt,undefined);assert.equal(history.yearsSinceStart,undefined);assert(f.limitations.some(l=>l.includes('旧候选')));assert(f.limitations.some(l=>l.includes('当前经营主体')));assert.equal(f.sourceUrl,o.url);
});
test('changed literal is pending manual review, never replaced by another nearby year or current brand',()=>{
 const o=capture();o.body=o.body.replace('Anyland 机场是一家成立于2021年的机场。','安妮机场于2018年创立。 Anyland 机场2022年成立。');const d=parser.diagnose(o,{recordId:'A190'});assert.equal(d.accepted,false);assert.equal(d.status,'pending_manual_review');assert.equal(d.manualReviewRequired,true);assert(d.reasons.includes('configured_historical_literal_changed_requires_manual_review'));assert.deepEqual(d.facts,[]);assert.equal(parser.extract(o,{recordId:'A190'}),null);
});
test('invalid/future year, invalid capture date and missing source qualification fail closed',()=>{
 const future=createParser([{...profiles[0],quote:'Anyland 2030年成立。',year:'2030'}]),o={...capture(),body:'Anyland 2030年成立。'};assert.equal(future.extract(o,{recordId:'A190'}),null);assert.equal(future.diagnose(o,{recordId:'A190'}).manualReviewRequired,true);
 for(const change of [o=>{delete o.evidenceId;},o=>{delete o.observedAt;},o=>{o.observedAt='2026-02-30T10:00:00Z';},o=>{o.observedAt='invalid';},o=>{o.sha256='0'.repeat(64);},o=>{o.metadata={passwordForm:true};}]){const o=capture();change(o);assert.equal(parser.extract(o,{recordId:'A190'}),null);}
 for(const delta of [{year:'21'},{year:'20210'},{claimSubject:'安妮'},{quote:'Anyland 成立于20210年。'},{url:'https://shadowrocket.one/anyland-v2ray-relay/?token=secret'},{limitations:[]}])assert.equal(createParser([{...profiles[0],...delta}]).extract(capture(),{recordId:'A190'}),null);
});
test('idempotence uses stable URL/year/quote and preserves old clock when page/capture changes',()=>{
 const o=capture(),prior=parser.extract(o,{recordId:'A190'}),before=JSON.stringify(prior),newCapture={...o,body:o.body+'\nfooter更新',observedAt:'2026-11-12T10:00:00Z',evidenceId:'NEW-CAPTURE'};assert.equal(parser.extract(newCapture,{recordId:'A190',prior}),null);assert.equal(JSON.stringify(prior),before);assert.equal(parser.diagnose(newCapture,{recordId:'A190'}).facts[0].id,prior.operatingHistory.historicalClaims[0].id);
 const alias=structuredClone(prior);alias.operatingHistory.historicalClaims[0].id='LEGACY-ID';assert.equal(parser.extract(newCapture,{recordId:'A190',prior:alias}),null);
});
test('preserves prior operating/history fields without promoting the unresolved candidate',()=>{
 const prior={coreInfo:{operatingHistory:{status:'unknown',notes:['keep'],historyStatements:[{id:'CONFIRMED-OTHER-SOURCE',date:'2022-01-01'}],historicalClaims:[{id:'OLD',sourceIds:['OLD-SOURCE']}]}}},before=JSON.stringify(prior),patch=parser.extract(capture(),{recordId:'A190',prior});assert.equal(JSON.stringify(prior),before);assert.equal(patch.operatingHistory.status,'unknown');assert.deepEqual(patch.operatingHistory.notes,['keep']);assert.deepEqual(patch.operatingHistory.historyStatements,prior.coreInfo.operatingHistory.historyStatements);assert.equal(patch.operatingHistory.historicalClaims.length,2);assert.deepEqual(patch.operatingHistory.sourceIds,['OLD-SOURCE','CURRENT-PUBLIC-CAPTURE']);assert.deepEqual(Object.keys(patch),['operatingHistory']);assert.equal(patch.operatingHistory.foundedAt,undefined);assert.equal(patch.operatingHistory.yearsSinceStart,undefined);
});
test('multiple configured claims on a page cannot partially pass when one original literal changes',()=>{
 const p=createParser([profiles[0],{...profiles[0],quote:'Anyland 在2020年试运营。',year:'2020'}]),o=capture();const d=p.diagnose(o,{recordId:'A190'});assert.equal(d.accepted,false);assert.equal(d.status,'pending_manual_review');assert.deepEqual(d.facts,[]);
});
test('only literal configured claim subject is accepted, never metadata aliases or promoted identity',()=>{
 const o=capture();o.claimSubject='安妮';o.identityVerified=true;const f=parser.extract(o,{recordId:'A190'}).operatingHistory.historicalClaims[0];assert.equal(f.claimSubject,'Anyland');assert.equal(f.identityVerified,false);assert.equal(createParser({profiles}).extract(o,{recordId:'A190'}).operatingHistory.historicalClaims[0].id,f.id);
});
