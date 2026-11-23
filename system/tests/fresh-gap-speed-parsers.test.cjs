'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const mod=require('../collection/url-collectors/fresh-gap-speed-parsers.cjs'),{loadOriginal,verifyQuote}=require('../lib/performance-evidence.cjs');
const root=path.resolve(__dirname,'..'),sha=v=>createHash('sha256').update(v).digest('hex'),profile=mod.loadProfiles()[0];
const original=()=>({...JSON.parse(fs.readFileSync(path.resolve(root,profile.article.file),'utf8')),evidenceId:'FRESH-REPLAY-A146'});
test('A146 retained article, review and binary originals replay into an explicitly undated image reference',()=>{
 const o=original(),d=mod.diagnose(o,{recordId:'A146'});assert.equal(d.accepted,true,d.reasons.join(','));assert.equal(d.facts.length,1);const f=d.report;
 assert.equal(f.kind,'third_party_undated_image_table');assert.equal(f.displayedRows,54);assert.equal(f.numericDisplayRows,52);assert.equal(f.missingDisplayRows,2);assert.equal(f.displayRows.length,54);assert.deepEqual(f.displayRows[0].originalValues,['240ms','952ms','12.28MB','17.22MB']);assert.deepEqual(f.displayRows[0].unitsAsPrinted,['ms','ms','MB','MB']);assert.deepEqual(f.displayRows[48].originalValues,['-','-','-','-']);assert.deepEqual(f.displayRows[53].originalValues,['-','-','-','-']);
 assert.deepEqual(f.imageArtifacts.map(a=>[a.firstDisplayRow,a.lastDisplayRow]),[[1,29],[30,54]]);assert.equal(f.imageArtifacts[1].width,1024);assert.equal(f.nativeOfficialLink,'https://syjccloud.com/#/register?code=vBybQcyb');verifyQuote(o.body,f);
 for(const key of ['columnHeaders','columnMeanings','date','testedAt','testedAtPrecision','nodeCount','sampleCount','network','probeLocation','accessBandwidth','threadCount','rateUnit','valueMbps','downloadMbps','uploadMbps','latencyMs','statistic','aggregateValue','unit'])assert.equal(f[key],null,key);
 for(const key of ['independentMeasurement','measurementVerified','currentSpeedVerified','rawMeasurementLogsVerified','imageAuthenticityVerified','operatorIdentityVerified','historicalIdentityVerified','currentEntryContinuityVerified','eligibleForSpeedRanking'])assert.equal(f[key],false,key);
 assert(f.limitations.some(l=>l.includes('MB/s或Mbps')));assert.equal(f.identityProofs[0].sourceId,undefined);assert.equal(f.identityProofs[0].originalSourceId,profile.article.sourceId);assert.equal(f.reviewProof.sourceId,undefined);assert.equal(f.reviewProof.originalSourceId,profile.review.sourceId);
 assert.equal(loadOriginal(root,profile.article).body,o.body);assert(mod.checkedReview(profile));
});
test('exact record/profile/native host and public capture gates reject unrelated or altered sources',()=>{
 assert.equal(mod.forOrigin(profile.url,{recordId:'A146'}).fields[0],'speed');assert.equal(mod.sourceTargets('A146').length,1);
 for(const change of [p=>p.recordId='A054',p=>p.url+='?alternate=1',p=>p.nativeOfficialLink='https://ccc.jichang.best/',p=>p.currentOfficialHostname='other.example',p=>p.article.sourceId=p.review.sourceId,p=>p.review.file='../escape.json']){const p=structuredClone(profile);change(p);assert.equal(mod.createParser([p]).profiles.length,0);}
 for(const change of [o=>o.url+='?alternate=1',o=>o.evidenceId='',o=>o.observedAt='2026-02-30T00:00:00Z',o=>o.sha256='0'.repeat(64),o=>o.body=o.body.replaceAll('瞬云','其他机场'),o=>o.links=o.links.filter(l=>l.url!==profile.nativeOfficialLink),o=>o.images[3].url='https://other.example/image.png',o=>o.passwordForm=true,o=>o.metadata={verificationWidgetObserved:true},o=>o.authenticationObserved=true,o=>o.observedAt='2026-11-11T00:00:00Z']){const o=original();change(o);assert.equal(mod.diagnose(o,{recordId:'A146'}).accepted,false);}
 assert.equal(mod.extract(original(),{recordId:'A054'}),null);
});
test('retained bytes, metadata and path verification fail closed before extraction',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'fresh-speed-proof-'));
 try{const files=[profile.article.file,profile.review.file,...mod.checkedReview(profile).metadata.artifacts.map(a=>a.file)];for(const f of files){const dest=path.join(base,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
 assert(mod.createParser([profile],{artifactRoot:base}).diagnose(original(),{recordId:'A146'}).accepted);
 const image=path.join(base,files[2]),bytes=fs.readFileSync(image);fs.writeFileSync(image,Buffer.concat([bytes,Buffer.from('changed')]));assert.equal(mod.createParser([profile],{artifactRoot:base}).diagnose(original(),{recordId:'A146'}).accepted,false);fs.writeFileSync(image,bytes);
 const metaFile=path.join(base,profile.review.file),meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));meta.columnHeaders=['latency','http','download','max'];fs.writeFileSync(metaFile,JSON.stringify(meta));const changed=structuredClone(profile);changed.review.fileSha256=changed.review.bodySha256=sha(fs.readFileSync(metaFile));assert.equal(mod.createParser([changed],{artifactRoot:base}).diagnose(original(),{recordId:'A146'}).accepted,false);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('reference collection preserves measured data and deduplicates without promoting observed clock to test date',()=>{
 const o=original(),prior={speed:{status:'not_measured',measured:{observations:[]},imageReports:[{id:'legacy'}],sourceIds:['OLD'],custom:{keep:true}}},before=JSON.stringify(prior),patch=mod.extract(o,{recordId:'A146',prior});
 assert.equal(JSON.stringify(prior),before);assert.deepEqual(patch.speed.measured,prior.speed.measured);assert.deepEqual(patch.speed.imageReports,prior.speed.imageReports);assert.deepEqual(patch.speed.custom,prior.speed.custom);assert.equal(patch.speed.status,'not_measured');assert.equal(patch.speed.speedTestReports,undefined);assert.equal(patch.speed.undatedImageReports.length,1);assert.equal(mod.extract(o,{recordId:'A146',prior:patch}),null);
 const later={...o,observedAt:'2026-11-13T00:00:00Z'},f=mod.diagnose(later,{recordId:'A146'}).report;assert.equal(f.testedAt,null);assert.equal(f.date,null);assert.equal(f.originalImageObservedAt,profile.review.observedAt);assert.equal(f.contentSignature,patch.speed.undatedImageReports[0].contentSignature);
});
