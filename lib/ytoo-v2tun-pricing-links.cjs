'use strict';
function pricingOnly(c){return ['A008','A021'].includes(c?.recordId)&&require('../deploy-service/yeshayun-visible-entry.cjs').configured(c)&&c.publicOnly===true&&c.fields?.includes('pricing')&&c.fields.every(f=>['pricing','website'].includes(f));}
function allowed(c,link){if(!pricingOnly(c))return true;return typeof link?.label==='string'&&/套餐|定价|价格|商店|购买订阅|购买服务|订购服务|所有产品|pricing|plans|packages|catalog|store|shop/i.test(link.label)&&!/退款|隐私|条款|帮助|知识库|文档|公告|terms|privacy|refund|knowledge|support|docs|help|status|monitor|speed|history/i.test(link.label);}
module.exports={pricingOnly,allowed};
