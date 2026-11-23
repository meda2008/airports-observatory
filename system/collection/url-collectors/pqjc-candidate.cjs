'use strict';
const origin='https://xn--mes358aby2apfg.com',scope='user_recognized_candidate_unpaid_balance_topup_only';
const labels=['赔钱支付-微信&支付宝','赔钱2号支付-备用'];
const fingerprint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function extract(s,{prior={},expectedOrderCorrelationSha256}={}){
 const u=new URL(s.url);if(u.origin!==origin||u.username||u.password)throw Error('pqjc_candidate_origin_mismatch');
 const text=s.text||s.body||'',observedAt=s.capturedAt||s.observedAt,core=prior.coreInfo||prior,sourceIds=[s.evidenceId].filter(Boolean);if(!Number.isFinite(Date.parse(observedAt)))return null;
 if(u.pathname==='/dashboard'&&text.includes('官网&tg群')&&text.includes('当前正在使用的官网域名：')&&text.includes('https://赔钱机场.com')&&text.includes('https://dash.pqjc.site')){
  const urls=(s.links||[]).map(l=>l.url);if(!urls.includes(origin+'/')||!urls.includes('https://dash.pqjc.site/'))return null;
  const old=core.website||{},a=text.indexOf('当前正在使用的官网域名：'),b=text.indexOf('官网频道群',a),quote=text.slice(a,b>a?b:text.length).trim(),historicalWebsites=[...(old.historicalWebsites||[])];
  if(old.url&&new URL(old.url).origin!==origin){const {historicalWebsites:unused,...historical}=old;if(!historicalWebsites.some(w=>w.url===historical.url))historicalWebsites.push(historical);}
  return{website:{...old,url:origin+'/',status:'user_recognized_candidate_native_alias_statement',relationship:'user_recognized_candidate_with_native_alias_self_statement_not_legacy_migration',userRecognizedCandidate:true,operatorIdentityVerified:false,legacyContinuityVerified:false,legacyIdentityVerified:false,basis:'用户认可并授权本次验证登录的新候选；候选站原生公告自述当前.com及dash.pqjc.site等别名。该自述不证明旧pqjc.site经营主体迁移、账号资产继承或连续经营。',quote,nativeAliasUrls:[origin+'/','https://dash.pqjc.site/'],historicalWebsites,observedAt,sourceIds}};
 }
 if(u.pathname!=='/order'||s.recordId!=='A039'||s.scope!==scope||s.legacyIdentityVerified!==false||s.paymentExecuted!==false||!fingerprint(s.orderCorrelationSha256))return null;
 if(expectedOrderCorrelationSha256!==undefined&&s.orderCorrelationSha256!==expectedOrderCorrelationSha256)return null;
 const old=core.payment||{};
 if(s.representation==='redacted_visible_order_list_text'&&(text.includes('订单已取消')||(s.orderCancellationLabel==='已取消'&&/^已取消\s*$/m.test(text)))&&text.includes('余额充值')){
  if(!old.methods?.length||old.scope!==scope||old.orderCorrelationSha256!==s.orderCorrelationSha256||!Number.isFinite(Date.parse(old.observedAt))||Date.parse(observedAt)<Date.parse(old.observedAt))return null;
  return{payment:{...old,orderCleanup:{...(old.orderCleanup||{}),status:'cancelled',cancellationVerified:true,newOrderBlocked:false,quote:text.includes('订单已取消')?'订单已取消':'已取消',checkedAt:observedAt,sourceUrl:origin+'/order',sourceIds,orderCorrelationSha256:s.orderCorrelationSha256,reason:'同一订单私有指纹与此前未支付充值观察完全一致，当前列表明确显示订单已取消；未付款；取消操作及时间另存本地台账，当前采集器只读取终态。'}}};
 }
 if(s.representation!=='redacted_visible_order_dialog_text'||s.amount!==1||s.currencyISO!==null||!text.includes('账单信息')||!text.includes('支付方式')||!labels.every(l=>text.split(/\r?\n/).includes(l))||!/^¥\s+1\.00\s+\(待支付\)\s*$/m.test(text)||!/^总计：¥1\.00\s*$/m.test(text)||/订单已取消|\(已支付\)|\(已完成\)/.test(text))return null;
 const quote='¥ 1.00 (待支付)\n支付方式\n'+labels.join('\n')+'\n总计：¥1.00';if(!text.includes(quote))return null;
 const observation={status:'checkout_methods_observed_not_transaction_verified',label:'候选充值账单渠道已观察',reason:'仅这笔用户认可候选的未支付余额充值显示渠道；未验证其他产品、旧站归属或实际付款成功。',statementType:'user_recognized_candidate_unpaid_balance_topup_payment',scope,methods:['微信','支付宝'],optionLabels:labels,uninterpretedOptions:['赔钱2号支付-备用'],evidenceLevel:'authenticated_checkout',evidenceGrade:'E1',quote,topupAmount:1,currency:null,currencyISO:null,currencySymbol:'¥',currencyStatus:'symbol_only_not_ISO_confirmed',observedAt,sourceUrl:origin+'/order',sourceIds,orderCorrelationSha256:s.orderCorrelationSha256,legacyIdentityVerified:false,legacyContinuityVerified:false,operatorIdentityVerified:false,checkoutObserved:true,transactionVerified:false};
 const pending={status:'pending',cancellationVerified:false,newOrderBlocked:true,checkedAt:observedAt,sourceUrl:origin+'/order',sourceIds,orderCorrelationSha256:s.orderCorrelationSha256,reason:'已观察本次唯一未支付充值账单的渠道；取消状态必须以同一指纹的独立终态原文确认。'};
 const sameCleanup=old.orderCorrelationSha256===s.orderCorrelationSha256&&old.orderCleanup?old.orderCleanup:pending;
 return{payment:{...old,...observation,summary:'仅当前用户认可赔钱候选的¥1未支付余额充值账单显示“赔钱支付-微信&支付宝”；备用标签未说明具体渠道。',observations:[...(old.observations||(old.methods?.length?[old]:[])).filter(o=>o.statementType!==observation.statementType),observation],statementObservations:[observation],orderCleanup:sameCleanup,conditions:['仅限当前用户认可的新候选及这笔¥1余额充值；不是套餐最低消费或其他产品支付验证。','¥符号不确认ISO币种，未点击结算，没有付款、到账或交易成功验证；备用渠道不猜测。','原生域名别名声明和用户认可不证明经营主体、旧pqjc.site迁移或历史连续经营。','私有订单指纹只用于同一订单取消关联，不公开原始订单ID。']}};
}
async function collectMany(tab){const file=require.resolve('../site-recipes/pqjc.mjs'),url=require('node:url').pathToFileURL(file);url.searchParams.set('revision',require('node:fs').statSync(file).mtimeMs);return(await import(url.href)).collectPqjcCandidateReadOnly(tab);}
module.exports={origin,recordIds:['A039'],fields:['website','payment'],scope,labels,extract,collectMany,readOnlyRecipe:'pqjc_candidate_current_balance_card_or_order_only'};
