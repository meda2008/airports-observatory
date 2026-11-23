'use strict';
const fs=require('node:fs'),path=require('node:path');
function mountCollectorRoutes(app,{baseDir}){
 const read=(p,fallback)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;
 const dir=path.join(baseDir,'work/site-collector-service');
 app.get('/api/collector/status',(req,res)=>{const s=require('./site-collector-registry.cjs').createService({root:baseDir});res.json(s.status());});
 app.get('/api/collector/changes',(req,res)=>{const p=path.join(baseDir,'work/observatory-service/changes.ndjson');const items=fs.existsSync(p)?fs.readFileSync(p,'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-100).map(JSON.parse):[];res.json({items,scope:'reviewed_database_changes_not_raw_website_alerts'});});
 app.get('/api/needs-search',(req,res)=>{const service=require('./catalog-service.cjs').makeCatalogService({baseDir});const refs=read(path.join(baseDir,'catalog/verified-referrals.json'),{links:[]});res.json(require('./needs-search.cjs').makeNeedsSearch(service,{verifiedReferralLinks:refs.links}).search(req.query));});
 for(const name of ['needs-search.html','needs-search.js','needs-search.css','collector-status.html','collector-status.js'])app.get('/'+name,(req,res)=>res.sendFile(path.join(baseDir,'web',name)));
}
module.exports={mountCollectorRoutes};
