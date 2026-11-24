'use strict';
const origin='https://www.x-air.org';
const captureKind='xair_visible_cashier_image_controls_v1';
const imageMethods=Object.freeze({'/img/cashpay.jpg':'余额支付','/img/alipay.png':'支付宝','/img/wxpay.png':'微信支付'});
const goodsNames=['高级版年付套餐','高级版豪华套餐','进阶版单月套餐','进阶版半年套餐'];
function extractGoods(s,core){
 const text=s.text||s.body||'',u=new URL(s.url),observedAt=s.capturedAt||s.observedAt;
 if(u.pathname!=='/user/goodsList'||(u.searchParams.has('gtype')&&u.searchParams.get('gtype')!=='2')||!Number.isFinite(Date.parse(observedAt))||!text.includes('正在浏览 - 基础套餐')||!text.includes('X-Air Digital Airport')||s.passwordForm||s.verificationWidgetObserved)return null;
 const plans=[];for(let i=0;i<goodsNames.length;i++){
  const name=goodsNames[i],start=text.indexOf(name),end=i+1<goodsNames.length?text.indexOf(goodsNames[i+1]):text.length;if(start<0||end<=start||text.indexOf(name,start+name.length)!==-1)return null;
  const quote=text.slice(start,end).trim(),price=quote.match(/^¥\s+(\d+\.\d{2})\s*$/m),duration=quote.match(/^(\d+)天的加速账号使用时长\s*$/m),quota=quote.match(/^包含([\d.]+(?:TB|GB))的加速流量\s*$/m);if(!price||!duration||!quota||!quote.includes('立即订购'))return null;
  plans.push({name,amount:Number(price[1]),amountBasis:'original_billing_period_total',billingPeriod:duration[1]+'天',durationDays:Number(duration[1]),quota:quota[1]+'（套餐所含流量）',quotaReset:'未说明流量重置周期；不将30天时长或总量推断为每30天/月重置。',currency:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',currencyReason:'本产品公开卡片只显示¥；其他产品的CNY账单不跨产品确认币种。',quote,sourceUrl:s.url,sourceIds:[s.evidenceId].filter(Boolean),observedAt,checkoutVerified:false,priceStatus:'advertised_not_checkout_verified',restrictions:['仅为当前基础套餐目录原价及所含流量；未为此卡片创建订单或付款。']});
 }
 for(const p of plans){p.priceSourceIds=p.sourceIds;const previous=core.pricing?.plans?.find(o=>o.name===p.name&&o.amount===p.amount&&o.currencyStatus==='invoice_ISO_confirmed_for_this_product_only'&&o.currency==='CNY'&&o.currencySourceIds?.length);if(previous&&p.name==='进阶版单月套餐'){Object.assign(p,{currency:'CNY',currencyStatus:previous.currencyStatus,currencyReason:previous.currencyReason,currencyObservedAt:previous.currencyObservedAt,currencySourceIds:previous.currencySourceIds,sourceIds:[...new Set([...p.sourceIds,...previous.currencySourceIds])]});}}
 const planKey=p=>JSON.stringify([p.name,p.amount,p.billingPeriod]),currentKeys=new Set(plans.map(planKey));
 const old=core.pricing||{},historical=[...(old.historicalPlans||[]),...(old.plans||[]).filter(p=>!currentKeys.has(planKey(p)))],historyByPrice=new Map();
 for(const p of historical){const key=planKey(p),existing=historyByPrice.get(key);historyByPrice.set(key,existing?{...existing,sourceIds:[...new Set([...(existing.sourceIds||[]),...(p.sourceIds||[])])]}:p);}
 const historicalPlans=[...historyByPrice.values()];
 return{pricing:{...old,status:'advertised_not_checkout_verified',plans,historicalPlans,observedAt,checkoutVerified:false,limitation:'当前基础套餐目录四档原周期价格；旧宣传首页代表价归入历史，不与现价并列为当前可购报价。各档流量重置时间未说明；公开卡片仅显示¥，币种不能跨产品推断。'}};
}
function extract(s,{prior={},recordId}={}){
 const publicPricing=require('./xair-public-section.cjs').extract(s,{recordId,prior});if(publicPricing)return publicPricing;
 const u=new URL(s.url);if(u.origin!==origin||u.username||u.password)throw Error('xair_origin_mismatch');
 const text=s.text||s.body||'',observedAt=s.capturedAt||s.observedAt,core=prior.coreInfo||prior;
 if(u.pathname==='/user/goodsList')return extractGoods(s,core);
 if(!/^\/payment\/(?:[^/?#]+)?\/?$/.test(u.pathname)||s.observedCaptureKind!==captureKind||!Number.isFinite(Date.parse(observedAt))||s.transactionVerified!==false||s.passwordForm||s.verificationWidgetObserved)return null;
 if(!text.includes('X-Air Digital Airport')||!/订单状态:\s*待支付/.test(text)||!text.includes('请选择您的支付方式')||!text.includes('进阶版单月套餐 - 30天加速时长')||!/¥35\.02\s+CNY/.test(text)||!text.includes('150GB流量包')||!/共需支付:\s*￥35\.02\s+CNY/.test(text)||/订单状态:\s*(已支付|已取消|已完成)/.test(text))return null;
 const imageEvidence=(Array.isArray(s.paymentImageControls)?s.paymentImageControls:[]).filter(c=>c.visible===true&&c.loaded===true&&c.href==='#pay'&&Object.hasOwn(imageMethods,c.srcPath)).map(c=>({kind:'visible_loaded_cashier_image_control',method:imageMethods[c.srcPath],srcPath:c.srcPath,href:'#pay',visible:true,loaded:true,alt:typeof c.alt==='string'?c.alt:'',observedAt}));
 const methods=[...new Set(imageEvidence.map(e=>e.method))];if(!methods.length)return null;
 const screenshotTranscription=s.representation==='literal_transcription_of_retained_checkout_screenshot';
 if(screenshotTranscription){require('../../lib/retained-screenshot-evidence.cjs').assertRetainedScreenshot(require('node:path').resolve(__dirname,'../..'),s);if(!methods.every(m=>text.includes(m==='支付宝'?'支付宝 ALIPAY':m)))return null;}
 const old=core.payment||{},sourceIds=[s.evidenceId].filter(Boolean),sourceUrl=origin+'/';
 const observation={status:'checkout_methods_observed_not_transaction_verified',statementType:captureKind,methods,evidenceLevel:'authenticated_checkout',evidenceGrade:'E1',scope:'进阶版单月套餐 · 30天 · 150GB流量包 · 35.02 CNY',quote:screenshotTranscription?text:null,imageEvidence,representation:screenshotTranscription?s.representation:'visible_cashier_image_controls_not_text_quotes',...(screenshotTranscription?{originalImage:{...s.originalImage},transcriptionReview:s.transcriptionReview}:{}),observedAt,sourceUrl,sourceIds,checkoutObserved:true,transactionVerified:false,feeStatus:'unknown',otherProductsVerified:false,cleanupStatus:'pending',reason:screenshotTranscription?'引文是已保留且通过SHA校验的收银截图字面转录，不是DOM文字；未付款或确认取消。':'仅观察当前待支付订单的原生图片支付选项；无文字渠道引文，没有付款或确认取消。'};
 const pending={status:'pending',cancellationVerified:false,newOrderBlocked:true,reason:'当前留存收银台没有可见取消按钮；未确认订单取消，禁止重复建单。',checkedAt:observedAt,sourceUrl,sourceIds};
 const patch={payment:{...old,...observation,summary:'当前35.02 CNY进阶单月订单的收银台显示'+methods.join('、')+'图片选项；未点击图片或付款，未确认订单取消。',observations:[...(old.observations|| (old.methods?.length?[old]:[])).filter(o=>o.statementType!==captureKind),observation],statementObservations:[observation],orderCleanup:old.orderCleanup||pending,...(Object.hasOwn(old,'cleanupStatus')?{cleanupStatus:old.cleanupStatus}:{}),conditions:['渠道名称来自当前可见且已加载的原生图片路径映射，图片没有alt；不把图片名称伪造成页面文字引文。','仅覆盖进阶版单月30天、150GB流量包、总计35.02 CNY的本次未支付收银台；其他产品、手续费、渠道实际可付款及到账未知。','支付选项证据与订单清理状态独立；本采集器不登录、建单、支付或取消。原有订单清理记录原样保留。','公开来源链接仅为站点入口；/payment/只是脱敏后的上下文标记，实际私单URL留存本地journal，不公开订单ID。']}};
 if(core.pricing?.plans?.some(p=>p.name==='进阶版单月套餐'&&p.amount===35.02))patch.pricing={...core.pricing,plans:core.pricing.plans.map(p=>p.name==='进阶版单月套餐'&&p.amount===35.02?{...p,currency:'CNY',currencyStatus:'invoice_ISO_confirmed_for_this_product_only',currencyReason:'同名单月35.02账单明确标CNY；仅绑定此产品。',currencyObservedAt:observedAt,currencySourceIds:sourceIds,unpaidOrderTotalObserved:true,unpaidOrderTotalObservedAt:observedAt,unpaidOrderSourceIds:sourceIds,restrictions:['本产品已创建一次临时未支付订单核对35.02 CNY总额；没有付款，订单清理状态独立记录。'],sourceIds:[...new Set([...(p.sourceIds||[]),...sourceIds])]}:p)};
 return patch;
}
async function collectMany(tab){const file=require.resolve('../site-recipes/xair.mjs'),url=require('node:url').pathToFileURL(file);url.searchParams.set('revision',require('node:fs').statSync(file).mtimeMs);return(await import(url.href)).collectXAirReadOnly(tab);}
module.exports={origin,recordIds:['A007'],fields:['pricing','payment'],captureKind,imageMethods,extract,collectMany,readOnlyRecipe:'xair_current_cashier_visible_images_only'};
