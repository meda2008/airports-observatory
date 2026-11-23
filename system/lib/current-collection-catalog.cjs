'use strict';
const fs=require('node:fs'),path=require('node:path');
// The inventory owns proposal/change validation. Reuse its reviewed overlay rather
// than treating the frozen seed catalogue as current financial coverage.
function applyReviewedInventory(catalog,inventory){
 if(!Array.isArray(catalog.items)||!Array.isArray(inventory.records))throw Error('current_collection_inventory_required');
 const original=new Map(catalog.items.map(r=>[r.id,r]));
 const items=inventory.records.map(r=>{if(!original.has(r.id)||!r.coreInfo||typeof r.primary!=='boolean')throw Error('collection_inventory_record_mismatch');return{...original.get(r.id),name:r.name,coreInfo:r.coreInfo,listing:{...original.get(r.id).listing,...r.listing,primary:r.primary}};});
 if(new Set(items.map(r=>r.id)).size!==items.length)throw Error('duplicate_collection_inventory_record');
 if(items.length!==catalog.items.length)throw Error('incomplete_collection_inventory');
 return{...catalog,items,collectionInput:{kind:'reviewed_current_inventory',generatedAt:inventory.generatedAt,seedCatalogStillRetained:true}};
}
function loadCurrentCollectionCatalog({root=path.resolve(__dirname,'..')}={}){
 const output=path.join(root,'outputs/database-inventory-current');
 require('../scripts/export-current-inventory.cjs').exportInventory({root,output});
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
 return applyReviewedInventory(read(path.join(root,'public-site/data/public-catalog.json')),read(path.join(output,'records.json')));
}
module.exports={applyReviewedInventory,loadCurrentCollectionCatalog};
