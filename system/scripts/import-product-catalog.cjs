'use strict';
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {createStore}=require('../deploy-service/store.cjs'),{openCatalogDb}=require('../deploy-service/catalog-db.cjs');
function main(){const root=path.resolve(__dirname,'..'),filename=process.env.STORE_FILE||path.join(root,'deploy-service/data/collector.sqlite'),dir=path.join(root,'work/product-system-20261110');fs.mkdirSync(dir,{recursive:true});
 const backup=path.join(dir,'collector-before-relational-'+Date.now()+'.sqlite');if(fs.existsSync(filename)){const db=new DatabaseSync(filename);try{db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");}finally{db.close();}}
 const store=createStore({filename}),catalog=openCatalogDb({filename,store});try{const receipt={backup:fs.existsSync(backup)?backup:null,publication:catalog.sync(),stats:catalog.stats(),tables:catalog.tables()};fs.writeFileSync(path.join(dir,'database-import-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({...receipt,tables:receipt.tables.map(t=>({name:t.name,count:t.count}))},null,2));}finally{catalog.close();store.close();}}
if(require.main===module)main();
