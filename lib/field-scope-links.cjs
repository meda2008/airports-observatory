'use strict';
// An explicit refund-discovery run must not spend its page budget on already
// collected plan pages or promotional invitation navigation.
function allowed(config,link){if(config?.readOnlyRecipe!=='registered_refund_discovery_readonly'||config.fields?.length!==1||config.fields[0]!=='refund')return true;const text=String(link?.label||'')+' '+String(link?.url||'');return /退款|退费|条款|协议|帮助|文档|知识|公告|refund|terms|\btos\b|help|knowledge|docs|support|announcement/i.test(text)&&!/购买|套餐|订阅|邀请|plans|shop|invites/i.test(text);}
module.exports={allowed};
