'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const read=f=>JSON.parse(fs.readFileSync(path.join(dist,f),'utf8'));
const catalog=read('data/public-catalog.json'),sources=read('data/public-sources.json'),ledger=read('data/public-ledger.json');
const items=catalog.items||catalog.records||[],sourceItems=sources.sources||sources.items||[],entries=ledger.entries||ledger.items||[];
assert.equal(items.length,215);assert.equal(new Set(items.map(r=>r.id)).size,215);assert.equal((catalog.discoveryCandidates||[]).length,30);
const sourceIds=new Set(sourceItems.map(s=>s.id||s.sourceId||s.source_id));assert.equal(sourceIds.size,sourceItems.length);
for(const r of items){assert.equal(r.forecast.pointProbability,null);assert.equal(r.forecast.probabilityInterval,null);assert.equal(r.forecast.status,'abstain');for(const id of r.sourceIds||[])assert.ok(sourceIds.has(id),'Unresolved source '+id);}
assert.equal(entries.length,245);
const forbiddenKeys=/^(?:password|passwd|token|secret|cookie|cookies|email|note|notes|legacyClaims|loginUrl|registerUrl|ref|referralCode)$/i;
let inspected=0;function inspect(value,key=''){
 if(forbiddenKeys.test(key))throw new Error('Forbidden public key '+key);
 if(typeof value==='string'){
  assert.ok(!/[A-Z]:[\\/](?:Users|AI_Projects|AINative)/i.test(value),'Local absolute path exposed');
  assert.ok(!/127\.0\.0\.1|localhost|file:\/\//i.test(value),'Local URL exposed');
  if(/^https?:\/\//.test(value)){const u=new URL(value);assert.ok(!u.username&&!u.password);for(const k of u.searchParams.keys())assert.ok(!/token|secret|password|auth|invite|ref|code|email|utm_/i.test(k),'Sensitive or promotional URL param');}
 }else if(Array.isArray(value)){for(const v of value)inspect(v,key);}else if(value&&typeof value==='object'){for(const[k,v]of Object.entries(value))inspect(v,k);}
 inspected++;
}
inspect(catalog);inspect(sources);inspect(ledger);
const settlement=read('data/public-settlement.json'),adjudications=read('data/adjudications.empty.json');
inspect(settlement);inspect(adjudications);
assert.equal(adjudications.synthetic,false);assert.deepEqual(adjudications.items,[]);
const {settleLedger}=require('./settle-ledger.cjs');
const recomputed=settleLedger(ledger,adjudications,{asOf:settlement.asOf,binCount:settlement.policy.binCount,minCalibrationBinSize:settlement.policy.minCalibrationBinSize});
assert.deepEqual({...recomputed,inputFiles:settlement.inputFiles},settlement,'Published settlement does not reproduce');
assert.equal(settlement.summary.counts.ABSTAIN,245);assert.equal(settlement.summary.count,0);assert.equal(settlement.summary.brier,null);
for(const [field,file]of [['ledgerSha256','data/public-ledger.json'],['adjudicationsSha256','data/adjudications.empty.json']])assert.equal(settlement.inputFiles[field],crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,file))).digest('hex'));
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8'),js=fs.readFileSync(path.join(dist,'app.js'),'utf8');
for(const file of ['index.html','app.js','styles.css','favicon.svg'])assert.ok(!fs.readFileSync(path.join(dist,file),'utf8').includes('\r\n'),'Noncanonical newlines in '+file);
assert.match(html,/name=["']viewport["']/);assert.ok(!/本地工作台|本机 API|权威推荐|实时测速/.test(html));assert.ok(!/innerHTML\s*=|eval\s*\(|new Function\s*\(/.test(js));
const css=fs.readFileSync(path.join(dist,'styles.css'),'utf8');
assert.ok(!/(?:^|[},])nav(?=[.{\s])/.test(css),'Header navigation styles must not reposition catalog pagination');
assert.ok(css.includes('#primary-nav{display:none;position:absolute;'),'Expected scoped mobile menu styling');
for(const module of ['integrity.mjs','verification-page.mjs'])assert.ok(fs.statSync(path.join(dist,module)).isFile());
assert.match(js,/createVerificationPage/);assert.match(html,/#\/verify/);
for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
 const ref=match[1];if(ref.startsWith('#')||ref.startsWith('data:')||ref.startsWith('https:'))continue;
 const parsed=new URL(ref,'https://static.invalid/');
 assert.equal(parsed.origin,'https://static.invalid','Unexpected asset origin');
 assert.equal(parsed.hash,'','Unexpected asset fragment');
 assert.ok([...parsed.searchParams.keys()].every(key=>key==='v'),'Unexpected asset query');
 if(parsed.search)assert.match(parsed.searchParams.get('v')||'',/^[a-f0-9]{64}$/,'Invalid asset revision');
 const target=path.join(dist,parsed.pathname.replace(/^\//,''));assert.ok(fs.existsSync(target),'Missing public asset '+ref);
}
const manifest=read('build-manifest.json');for(const f of manifest.files){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,f.path))).digest('hex'),f.sha256);if(f.path==='data/browser-index.json'||f.path.startsWith('data/details/'))inspect(read(f.path));}
console.log(JSON.stringify({status:'PASS',catalog:items.length,discovery:catalog.discoveryCandidates.length,sources:sourceItems.length,ledger:entries.length,inspectedValues:inspected,publicFiles:manifest.files.length+1,predictionQualityValidated:false}));
