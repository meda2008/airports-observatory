'use strict';
const {changesFor}=require('../deploy-service/diff.cjs');
function business(value){if(Array.isArray(value))return value.map(business);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['observedAt','sourceIds','sourceBodySha256','sourceLocator','currentPriceSourceIds'].includes(k)).map(([k,v])=>[k,business(v)]));return value;}
// Call only AFTER partitionCurrentCaptureFields has admitted the current material.
// Keep fresh raw observations; leave old published provenance attached when unchanged.
function jmsBusiness(v){if(Array.isArray(v))return v.map(jmsBusiness);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['observedAt','sourceIds','sourceUrl','sourceBodySha256','sourceLocator','currentPriceSourceIds','quote'].includes(k)).map(([k,x])=>[k,jmsBusiness(x)]));return v;}
function changesForSite(siteId,current,admittedPatch){const out=changesFor(current,admittedPatch);if(siteId==='A023'&&admittedPatch.pricing?.scope==='current_public_html_product_cards'&&current.pricing?.scope==='current_public_html_product_cards'){if(JSON.stringify(jmsBusiness(current.pricing))===JSON.stringify(jmsBusiness(admittedPatch.pricing)))delete out.pricing;else out.pricing=admittedPatch.pricing;}if(['A061','A071','A048','A172','A007'].includes(siteId)&&admittedPatch.pricing&&current.pricing){if(JSON.stringify(business(current.pricing))===JSON.stringify(business(admittedPatch.pricing)))delete out.pricing;else out.pricing=admittedPatch.pricing;}return out;}
module.exports={changesForSite};
