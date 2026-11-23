'use strict';
const origin='https://a32.qytaff03.cc';
async function collectMany(tab){const priceRoute=['/shop','/checkout'].includes(new URL(await tab.url()).pathname);if(priceRoute)return(await import('../site-recipes/qing-prices.mjs')).collectQingPrices(tab);return(await import('../site-recipes/qingyunti.mjs')).collectQingRefundCoverage(tab);}
module.exports={origin,recordIds:['A141'],fields:['refund','pricing'],extract:require('./qing-prices.cjs').extract,collectMany,readOnlyRecipe:'qing_native_refund_coverage',acceptance:'document_coverage_checkpoint_not_refund_confirmation'};
