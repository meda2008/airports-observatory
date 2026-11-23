'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function bindWebsiteCollector(config,{directory=path.resolve(__dirname,'../collection/website-collectors')}={}){
 let origin;try{const u=new URL(config.entryUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error();origin=u.origin;}catch{return{...config,websiteCollectorId:null,websiteCollectorStatus:'official_origin_unresolved'};}
 const id='url-'+crypto.createHash('sha256').update(JSON.stringify(origin)).digest('hex').slice(0,20),file=path.join(directory,id+'.json');
 if(!fs.existsSync(file))return{...config,websiteCollectorId:id,websiteCollectorStatus:'definition_missing'};
 const bytes=fs.readFileSync(file),definition=JSON.parse(bytes);if(definition.origin!==origin||definition.collectorId!==id||!definition.recordIds.includes(config.recordId))throw Error('website_collector_binding_mismatch');
 const expected=definition.capabilities.readOnlyRecipe;if(config.readOnlyRecipe&&expected&&config.readOnlyRecipe!==expected)throw Error('website_collector_recipe_conflict');
 // Authentication remains record-scoped. Sharing an origin never copies credentials
 // or propagates business facts between potentially unrelated brand records.
 return{...config,websiteCollectorId:id,websiteCollectorStatus:definition.acceptance,websiteCollectorDefinitionSha256:crypto.createHash('sha256').update(bytes).digest('hex'),...(expected?{readOnlyRecipe:expected}:{})};
}
module.exports={bindWebsiteCollector};
