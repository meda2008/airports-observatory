'use strict';
const crypto=require('node:crypto'),origin='https://a02.yfy02.com',url=origin+'/api/v1/user/plan/fetch';
const clientUrl=origin+'/js/F3jSHawt-1763765398047-c20260430.js',clientSha='6f81d6a90d77c10f5ac248773d01c8ead1538321c387919b41ece2416dd471c4';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const periods={month_price:'月付',quarter_price:'季付',half_year_price:'半年付',year_price:'年付',two_year_price:'两年付',three_year_price:'三年付',onetime_price:'一次性'};
function reviewedClient(body){
 if(sha(body)!==clientSha)return false;
 let text=body;for(let i=0;i<8;i++)text=text.replace(/'([^'\\]*)'\s*\+\s*'([^'\\]*)'/g,(_,a,b)=>"'"+a+b+"'");
 return text.includes("'price':_0x13dff[_0x20947a]")&&text.includes("(_0xbec94f['price']/0x64)['toFixed'](0x2)")&&text.includes("'month_price'")&&text.includes("'onetime_price'");
}
function extract(s,{recordId,prior={},observations=[]}={}){
 if(recordId!=='A049'||s.url!==url||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.representation!=='original_native_plan_http_json'||s.metadata?.authenticationObserved!==true)return null;
 const unit=observations.find(x=>x.url===clientUrl&&x.evidenceId&&x.metadata?.representation==='original_declared_client_module'&&reviewedClient(x.body));if(!unit)return null;
 let v,rows;try{v=JSON.parse(s.body);if(v.status!=='success'||v.error!==null||!Array.isArray(v.data)||!v.data.length||v.data.length>100)return null;rows=require('./feihou-native-payment.cjs').rows(s.body);}catch{return null;}if(!rows)return null;
 const plans=[];for(const r of rows){const x=r.value;if(x.show!==true||x.sell!==true)continue;
  if(!Number.isSafeInteger(x.id)||typeof x.name!=='string'||!x.name.trim()||typeof x.content!=='string'||!Number.isSafeInteger(x.transfer_enable)||x.transfer_enable<0||Object.keys(x).some(k=>/secret|token|password|authorization/i.test(k)))return null;
  const plain=x.content.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' '),quota=/流量[：:]\s*(\d+)\s*GB\s*\/\s*周期/.exec(plain),devices=/设备[：:]\s*(\d+)\s*台同时在线/.exec(plain),custom=/私人定制|联系客服/.test(x.name);
  if(quota&&Number(quota[1])!==x.transfer_enable)return null;
  for(const[field,period]of Object.entries(periods)){const value=x[field];if(value===null||value===undefined||value===0)continue;if(!Number.isSafeInteger(value)||value<0||value>1e10)return null;
   plans.push({name:x.name+' · '+period,productName:x.name,amount:Number((value/100).toFixed(2)),amountBasis:custom?'advertised_custom_minimum_not_final_total':'original_billing_period_total',billingPeriod:period,currency:null,currencySymbol:'￥',currencyStatus:'symbol_only_not_ISO_confirmed',quota:quota?quota[1]+' GB/周期（站方声明；重置口径未核实）':null,quotaStatus:quota?'operator_cycle_reset_not_verified':'not_confirmed',maxDevices:devices?Number(devices[1]):null,deviceLimit:devices?'同时在线'+devices[1]+'台（站方声明）':null,priceStatus:'advertised_not_checkout_verified',purchaseAvailable:custom?false:true,customQuote:custom,checkoutVerified:false,quote:r.quote,sourceIds:[s.evidenceId,unit.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(s.body),sourceLocator:{kind:'body_utf16_range',start:r.start,end:r.end,quoteSha256:sha(r.quote)},apiUnits:{priceField:field,rawValue:value,priceScale:100,clientArtifactSha256:clientSha,sourceIds:[unit.evidenceId]},restrictions:['当前账户可售API目录，原周期金额按已核对客户端除以100显示；未结账或付款。','不套用优惠码、赠送月数、折扣或流量重置包价格。','限速、IEPL、稳定性及解锁均为站方声明，不构成线路实测。',...(custom?['私人定制需联系客服；接口金额只是起订报价，不代表可直接购买。']:[])]});
  }
 }
 if(!plans.length||new Set(plans.map(p=>p.productName+'|'+p.billingPeriod)).size!==plans.length)return null;
 const old=(prior.coreInfo||prior).pricing||{},key=p=>(p.productName||p.name)+'|'+p.billingPeriod,keys=new Set(plans.map(key)),history=[...(old.priorPlansNotRevalidated||[]),...(old.plans||[]).filter(p=>!keys.has(key(p)))];
 return{pricing:{...old,status:'advertised_not_checkout_verified',scope:'authenticated_current_sellable_api_catalog',plans,summaryPlanIndex:0,sourceIds:[s.evidenceId,unit.evidenceId],observedAt:s.observedAt,checkoutVerified:false,observedPeriodPriceCount:plans.length,priorPlansNotRevalidated:[...new Map(history.map(p=>[JSON.stringify([p.name,p.billingPeriod,p.amount,p.sourceIds]),p])).values()],clientUnitBinding:{sha256:clientSha,sourceIds:[unit.evidenceId],priceScale:100},limitation:'登录账号当前可售接口目录；流量重置口径、优惠资格、实际结账及定制交付未核实，旧目录未匹配项保留为历史。'}};
}
module.exports={origin,url,clientUrl,clientSha,reviewedClient,recordIds:['A049'],fields:['pricing'],extract};
