'use strict';
const origin='https://eggtart.pro';
async function collectMany(tab){return(await import('../site-recipes/eggtart.mjs')).collectEggtartNativeRefundEntry(tab);}
module.exports={origin,recordIds:['A077'],fields:['refund'],extract:()=>null,collectMany,readOnlyRecipe:'eggtart_native_notification_channel',acceptance:'channel_discovery_is_not_current_refund_confirmation'};
