'use strict';
const origin='https://www.nicecc.cc';
async function collectMany(tab){return(await import('../site-recipes/nicecc.mjs')).collectNiceRefundCoverage(tab);}
module.exports={origin,recordIds:['A171'],fields:['refund'],extract:()=>null,collectMany,readOnlyRecipe:'nicecc_authenticated_refund_coverage',acceptance:'missing_policy_is_a_checkpoint_never_invent_no_refunds'};
