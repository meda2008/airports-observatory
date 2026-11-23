'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {forOrigin,sourceTargets,extract}=require('../collection/url-collectors/third-party-history.cjs'),hash=s=>createHash('sha256').update(s).digest('hex');
function capture(){const body='DuyaoSS-机场测速和简介\n20.V2Tun（中转小机场）\n\n2024 年成立的一家机场。\n\n21.酷酷云KuKuYun（中转机场）\n\n2025 年成立的一家机场，Trojan协议与线路介绍。\n\n稳定性还不错。\n\n套餐情况：\n\nVIP1套餐：20元/月。\n\n22.Nerwo奶瓶（电信中转）\n\n2023 年成立的一家机场。\n\n21.酷酷云KuKuYun（中转机场）\n22.Nerwo奶瓶（电信中转）';return{url:'https://www.duyaoss.com/archives/3/',body,sha256:hash(body),observedAt:'2026-11-11T09:24:59.692Z',evidenceId:'CURRENT-ARTICLE'};}
function change(o,fn){o.body=fn(o.body);o.sha256=hash(o.body);return o;}
test('only exact record/publisher/route contracts and explicit history source targets',()=>{
 assert.deepEqual(sourceTargets('A052'),[{url:'https://www.duyaoss.com/archives/3/',fields:['operatingHistory'],sourceType:'third_party_history_statement'}]);assert.equal(sourceTargets('A155')[0].url,'https://jichangnote.com/reviews/weifeng-network/');assert.deepEqual(sourceTargets('A070'),[]);
 assert.deepEqual(forOrigin(capture().url,{recordId:'A052'}).recordIds,['A052']);
 for(const [url,id]of[[capture().url,'A070'],[capture().url,'A185'],['https://duyaoss.com/archives/3/','A052'],['https://www.duyaoss.com.evil.test/archives/3/','A052'],['http://www.duyaoss.com/archives/3/','A052'],['https://u:p@www.duyaoss.com/archives/3/','A052'],[capture().url+'?token=x','A052'],[capture().url+'#toc','A052'],['https://www.duyaoss.com/archives/7826/','A052']]){assert.equal(forOrigin(url,{recordId:id}),null);assert.equal(extract({...capture(),url},{recordId:id}),null);}
});
test('KUKU opening year is a minimal third-party claim with exact heading and section locators',()=>{
 const o=capture(),patch=extract(o,{recordId:'A052'}),f=patch.operatingHistory.historyStatements[0];assert.deepEqual(Object.keys(patch),['operatingHistory']);assert.equal(f.kind,'third_party_opening_claim');assert.equal(f.date,'2025');assert.equal(f.datePrecision,'year');assert.equal(f.quote,'2025 年成立的一家机场');assert.equal(f.observedAt,o.observedAt);assert.deepEqual(f.sourceIds,[o.evidenceId]);assert.equal(f.continuousOperationVerified,false);assert.equal(f.independentHistoricalArchiveVerified,false);assert.equal(f.bodySha256,hash(o.body));
 for(const l of[f.sourceLocator,f.sourceLocator.sectionHeading]){assert.equal(hash(o.body.slice(l.start,l.end)),l.quoteSha256);assert.equal(l.bodySha256,hash(o.body));}assert.equal(o.body.slice(f.sourceLocator.start,f.sourceLocator.end),f.quote);assert(o.body.slice(f.sourceLocator.sectionBounds.start,f.sourceLocator.sectionBounds.end).startsWith('21.酷酷云KuKuYun'));
 assert(!f.quote.includes('稳定性'));assert(!f.quote.includes('套餐'));assert.equal(patch.stability,undefined);assert.equal(patch.speed,undefined);for(const k of['startDate','startYear','yearsSinceStart','isEstablished','label'])assert.equal(patch.operatingHistory[k],undefined);
});
test('neighbour, wrong-brand, non-intro, relative and ambiguous statements cannot supply the year',()=>{
 const mutations=[b=>b.replaceAll('酷酷云KuKuYun','其他机场Other'),b=>b.replace('2025 年成立的一家机场，Trojan协议与线路介绍。','尚未提供成立年份。'),b=>b.replace('2025 年成立的一家机场，Trojan协议与线路介绍。','已经运营三年。'),b=>b.replace('2025 年成立的一家机场，Trojan协议与线路介绍。','稳定性还不错。\n\n2025 年成立的一家机场。'),b=>b.replace('2025 年成立的一家机场，Trojan协议与线路介绍。','2025 年成立的一家机场，2024年开业。'),b=>b+'\n\n23.酷酷云KuKuYun（中转机场）\n\n2024 年成立的一家机场。'];
 for(const mutate of mutations)assert.equal(extract(change(capture(),mutate),{recordId:'A052'}),null);
});
test('future years, raw hash mismatch, missing clock and checkpoints are rejected',()=>{
 for(const mutate of[o=>change(o,b=>b.replace('2025 年成立','2099 年成立')),o=>{o.observedAt='2024-11-11T00:00:00Z';},o=>{delete o.observedAt;},o=>{o.sha256='0'.repeat(64);},o=>{o.metadata={verificationWidgetObserved:true};},o=>{delete o.evidenceId;}]){let o=capture();mutate(o);assert.equal(extract(o,{recordId:'A052'}),null);}
});
test('idempotence and preservation of existing history fields do not turn a claim into an operating age',()=>{
 const o=capture(),prior={operatingHistory:{startDate:null,yearsSinceStart:null,continuousOperationVerified:false,custom:{keep:true},sourceIds:['OLD'],historyStatements:[{id:'EARLIER',date:'2020',sourceIds:['EARLIER-SOURCE']}]}};let before=JSON.stringify(prior),patch=extract(o,{recordId:'A052',prior});assert.equal(JSON.stringify(prior),before);assert.deepEqual(patch.operatingHistory.custom,{keep:true});assert.equal(patch.operatingHistory.startDate,null);assert.equal(patch.operatingHistory.yearsSinceStart,null);assert.equal(patch.operatingHistory.historyStatements.length,2);assert.deepEqual(patch.operatingHistory.sourceIds,['OLD','EARLIER-SOURCE',o.evidenceId]);assert.equal(extract(o,{recordId:'A052',prior:patch}),null);
 const fact={...patch.operatingHistory.historyStatements[1],id:'MANUALLY-STAGED-SAME-CLAIM'};assert.equal(extract(o,{recordId:'A052',prior:{operatingHistory:{historyStatements:[fact]}}}),null);
});
test('existing A155 contract keeps its original fact id and kind',()=>{
 const quote='由于微风网络已知运营时间始于 2025 年',body=JSON.stringify({sections:{'s14-risk':'经营说明。'+quote+'，仍需观察。'}}),o={url:'https://jichangnote.com/reviews/weifeng-network/',body,observedAt:'2026-11-11T00:00:00Z',evidenceId:'BREEZE'};const patch=extract(o,{recordId:'A155'}),f=patch.operatingHistory.historyStatements[0];assert.equal(f.id,'third-party-operating-since-A155-2025');assert.equal(f.kind,'third_party_operating_since_claim');assert.equal(f.quote,quote);assert.equal(extract(o,{recordId:'A155',prior:patch}),null);
});
