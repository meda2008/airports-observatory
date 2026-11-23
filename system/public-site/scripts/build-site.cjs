'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const candidateBuild=require('./build-independent-candidates.cjs').buildCandidate();
fs.writeFileSync(path.join(root,'src/candidates.html'),candidateBuild.html);
const assets=['candidates.html','candidates.css','index.html','app.js','styles.css','favicon.svg','integrity.mjs','verification-page.mjs','current-evidence-view.mjs','current-evidence.css','core-view.mjs','core-view.css','browser-data.mjs'];
const data=['public-catalog.json','public-sources.json','public-ledger.json','publication-manifest.json'];
const tools=['verify-publication.cjs','settle-ledger.cjs','settlement.README.md'];
const derivedData=['public-settlement.json','adjudications.empty.json'];
const allowed=new Set([...assets,...tools,...data.map(f=>'data/'+f),...derivedData.map(f=>'data/'+f),'404.html','robots.txt','_headers','sitemap.xml','build-manifest.json','.nojekyll']);
allowed.add('data/browser-index.json');
for(const record of JSON.parse(fs.readFileSync(path.join(root,'data/public-catalog.json'),'utf8')).items){
 if(!/^A\d{3}$/.test(record.id))throw new Error('Invalid record output path');
 allowed.add('data/details/'+record.id+'.json');
}
fs.mkdirSync(dist,{recursive:true});
// Remove only obsolete regular files inside this exact generated directory.
function clean(directory){
 const absolute=fs.realpathSync(directory);
 if(absolute!==dist&&!absolute.startsWith(dist+path.sep))throw new Error('Output directory escaped project');
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Symlink in generated output');
  if(entry.isDirectory())clean(file);
  else if(entry.isFile()&&!allowed.has(path.relative(dist,file).split(path.sep).join('/')))fs.unlinkSync(file);
 }
}
clean(dist);fs.mkdirSync(path.join(dist,'data'),{recursive:true});
const dataRevision=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'data/public-catalog.json'))).digest('hex');
const assetContents=new Map(assets.map(file=>{
 let content=fs.readFileSync(path.join(root,'src',file),'utf8').replace(/\r\n/g,'\n');
 if(file==='app.js')content=content.replace('__PUBLIC_DATA_REVISION__',dataRevision);
 return[file,content];
}));
// Version the complete module/style graph, not just the entry script. A data
// or view change must not combine a new snapshot with cached older UI modules.
const assetRevision=crypto.createHash('sha256').update(JSON.stringify([...assetContents])).digest('hex');
const assetReference=new RegExp('([\\\'"])(\\./(?:'+assets.map(file=>file.replace(/\./g,'\\.')).join('|')+'))\\1','g');
for(const[file,content]of assetContents){
 fs.writeFileSync(path.join(dist,file),content.replace(assetReference,(_,quote,ref)=>quote+ref+'?v='+assetRevision+quote));
}
for(const file of data)fs.copyFileSync(path.join(root,'data',file),path.join(dist,'data',file));
require('node:child_process').execFileSync(process.execPath,[path.join(root,'scripts/build-browser-data.mjs')],{stdio:'pipe',windowsHide:true});
for(const file of ['verify-publication.cjs','settle-ledger.cjs'])fs.writeFileSync(path.join(dist,file),fs.readFileSync(path.join(root,'scripts',file),'utf8').replace(/\r\n/g,'\n'));
const outcomeBytes=fs.readFileSync(path.join(root,'examples/empty-adjudications.json'));
const ledgerBytes=fs.readFileSync(path.join(dist,'data/public-ledger.json'));
const settlement=JSON.parse(fs.readFileSync(path.join(root,'examples/current-settlement.json'),'utf8'));
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(settlement.inputFiles?.ledgerSha256!==sha256(ledgerBytes)||settlement.inputFiles?.adjudicationsSha256!==sha256(outcomeBytes))throw new Error('Settlement inputs changed; recompute a new frozen report before building');
const {settleLedger}=require('./settle-ledger.cjs');
const recomputed=settleLedger(JSON.parse(ledgerBytes),JSON.parse(outcomeBytes),{asOf:settlement.asOf,binCount:settlement.policy.binCount,minCalibrationBinSize:settlement.policy.minCalibrationBinSize});
if(JSON.stringify({...recomputed,inputFiles:settlement.inputFiles})!==JSON.stringify(settlement))throw new Error('Settlement report does not reproduce from its public inputs');
fs.writeFileSync(path.join(dist,'data/public-settlement.json'),JSON.stringify(settlement,null,2)+'\n');
fs.writeFileSync(path.join(dist,'data/adjudications.empty.json'),outcomeBytes);
const settlementReadme=fs.readFileSync(path.join(root,'examples/settlement.README.md'),'utf8').replace(/\r\n/g,'\n').replaceAll('scripts/settle-ledger.cjs','settle-ledger.cjs').replaceAll('examples/empty-adjudications.json','data/adjudications.empty.json').replace('node --test tests/settlement.test.cjs\n','').replaceAll('examples/settlement.README.md','settlement.README.md');
fs.writeFileSync(path.join(dist,'settlement.README.md'),settlementReadme);
fs.copyFileSync(path.join(dist,'index.html'),path.join(dist,'404.html'));
const hostingPath=path.join(root,'.openai','hosting.json');
const expectedPath=path.join(root,'.openai','site-origin.json');
const config=fs.existsSync(expectedPath)?JSON.parse(fs.readFileSync(expectedPath,'utf8')):{};
let origin=config.origin||null;
if(origin){const parsed=new URL(origin);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('Invalid configured public base URL');origin=parsed.href.replace(/\/$/,'');}
let index=fs.readFileSync(path.join(dist,'index.html'),'utf8');
index=index.replace('</head>','  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'; img-src \'self\' data:; object-src \'none\'; base-uri \'self\'; form-action \'none\'">\n</head>');
if(config.correctionsUrl){const u=new URL(config.correctionsUrl);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password)throw new Error('Invalid correction destination');index=index.replace('data-corrections-url=""','data-corrections-url="'+config.correctionsUrl.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"');}
if(origin)index=index.replace('</head>','  <link rel="canonical" href="'+origin+'/">\n  <meta property="og:url" content="'+origin+'/">\n</head>');
fs.writeFileSync(path.join(dist,'index.html'),index);fs.writeFileSync(path.join(dist,'404.html'),index);
fs.writeFileSync(path.join(dist,'.nojekyll'),'');
fs.writeFileSync(path.join(dist,'robots.txt'),'User-agent: *\nAllow: /\n'+(origin?'Sitemap: '+origin+'/sitemap.xml\n':''));
if(origin)fs.writeFileSync(path.join(dist,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+origin+'/</loc></url></urlset>');
fs.writeFileSync(path.join(dist,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\'; connect-src \'self\'; img-src \'self\' data:; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'; form-action \'none\'\n  X-Frame-Options: DENY\n/data/*\n  Cache-Control: public, max-age=300, must-revalidate\n');
const fileList=[];function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())scan(f);else if(e.isFile()){const relative=path.relative(dist,f).split(path.sep).join('/');if(relative!=='build-manifest.json'){const bytes=fs.readFileSync(f);fileList.push({path:relative,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}}
scan(dist);
const manifest={schemaVersion:'airports-public-build.v1',builtAt:new Date().toISOString(),assetRevision,origin,hostingConfigured:fs.existsSync(hostingPath),files:fileList,sourcePublication:JSON.parse(fs.readFileSync(path.join(root,'data','publication-manifest.json'),'utf8'))};
fs.writeFileSync(path.join(dist,'build-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({status:'built',directory:dist,files:fileList.length+1,bytes:fileList.reduce((n,f)=>n+f.bytes,0),origin}));
