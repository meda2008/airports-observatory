// Family adapters specialize parsing/navigation; none can submit orders or run page code.
export const adapters={
 generic:{version:1,description:'公开落地页、可见价格卡和政策链接',rank:l=>/pricing|套餐|价格/i.test(l.label+' '+l.url)?10:1},
 v2board:{version:1,description:'V2Board/XBoard及其主题；套餐、知识库、个人钱包只读',rank:l=>/plan|shop|购买订阅/i.test(l.url+' '+l.label)?12:/knowledge|文档/i.test(l.url+' '+l.label)?8:/profile|wallet/i.test(l.url)?5:1},
 whmcs:{version:1,description:'WHMCS目录/账期选择文字；不跟随结账、添加商品或订单路径',rank:l=>/store|cart\.php\?gid|套餐/i.test(l.url+' '+l.label)?12:/terms|privacy|knowledgebase/i.test(l.url)?8:1},
 document_site:{version:1,description:'官网政策及FAQ正文；变更日期不当成立日期',rank:l=>/privacy|refund|tos|terms|退款|隐私/i.test(l.url+' '+l.label)?12:2},
 flybit:{version:1,description:'FlyBit自定义阅读中心与钱包，只跟随已见的只读链接',rank:l=>/knowledge|help|wallet|知识|余额/i.test(l.url+' '+l.label)?12:2}
};
export function adapterFor(name){if(!adapters[name])throw Error('Unknown adapter: '+name);return adapters[name];}
