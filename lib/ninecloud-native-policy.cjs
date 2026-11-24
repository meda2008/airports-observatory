'use strict';
// Retained umi SHA69ff1e68dd44b84f803e631367b6fc9dfd52e79d049067fa52cfa859031f20dc:
// Axios timeout=12000ms; all GETs add one numeric t. A 10s form wait closed
// observation before the site's normal request timeout. No extra auth attempts.
function configured(c){return c?.recordId==='A176'&&c.entryUrl==='https://shop.starpro.one/#/plan'&&c.readOnlyRecipe==='ninecloud_native_catalog_readonly'&&c.publicOnly!==true&&c.auth?.mode==='login';}
function jobBudget(c,base){return configured(c)?Math.max(base,60000):base;}
function formWait(c,remaining){return Math.max(1,Math.min(configured(c)?16000:10000,remaining-1500));}
module.exports={configured,jobBudget,formWait};
