'use strict';
const fs=require('node:fs'),path=require('node:path');
const {makeCatalogServiceProvider}=require('./catalog-service.cjs');
const {createFileSnapshotReader}=require('./file-snapshot.cjs');
const {makeNeedsSearch}=require('./needs-search.cjs');
function mountCollectorRoutes(app,{baseDir,getCatalogService=makeCatalogServiceProvider({baseDir})}){
 const referralFile=path.join(baseDir,'catalog/verified-referrals.json');
 const getReferrals=createFileSnapshotReader([referralFile],()=>fs.existsSync(referralFile)?JSON.parse(fs.readFileSync(referralFile,'utf8')):{links:[]});
 app.get('/api/collector/status',(req,res)=>{const s=require('./site-collector-registry.cjs').createService({root:baseDir});res.json(s.status());});
 app.get('/api/collector/changes',(req,res)=>{const p=path.join(baseDir,'work/observatory-service/changes.ndjson');const items=fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-100).map(JSON.parse):[];res.json({items,scope:'reviewed_database_changes_not_raw_website_alerts'});});
 app.get('/api/needs-search',(req,res)=>{
  const service=getCatalogService(),refs=getReferrals();
  res.json(makeNeedsSearch(service,{verifiedReferralLinks:refs.links}).search(req.query));
 });
 for(const name of ['needs-search.html','needs-search.js','needs-search.css','collector-status.html','collector-status.js'])app.get('/'+name,(req,res)=>res.sendFile(path.join(baseDir,'web',name)));
}
module.exports={mountCollectorRoutes};
