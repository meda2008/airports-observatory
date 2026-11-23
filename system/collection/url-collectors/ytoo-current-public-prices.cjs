'use strict';
const origin='https://www.stentvessel.shop',sha=s=>require('crypto').createHash('sha256').update(s).digest('hex');
function parse(s){
 const u=new URL(s.url),body=s.body||s.text||'',m=s.metadata||s,at=s.observedAt||s.capturedAt,b=m.selectedBilling;
 if(u.origin!==origin||!s.evidenceId||!Number.isFinite(Date.parse(at))||!String(m.title||'').includes('YToo')||m.passwordForm||m.verificationWidgetObserved||b?.checked!==true)return null;
 const group=u.pathname.replace(/\/$/,'').split('/')[2];if(!['individual','team'].includes(group)||b.group!==group)return null;
 const annual=b.label==='年付';if(group==='individual'&&!['月付','年付'].includes(b.label)||group==='team'&&b.label!=='当前目录')return null;
 const names=group==='team'?['Global Accelerate - Team 3T','Global Accelerate - Team 5T']:['AIR','BASIC','PLUS','PRO'],pids=group==='team'?['14','22']:['15','18','19','20'];
 const links=(m.links||[]).filter(l=>{try{const v=new URL(l.url);return v.origin==='https://y-too.net'&&v.pathname==='/cart.php'&&v.searchParams.get('a')==='add';}catch{return false;}});
 if(links.length!==names.length||links.some((l,i)=>{const v=new URL(l.url);return v.searchParams.get('pid')!==pids[i]||(annual?v.searchParams.get('billingcycle')!=='annually':v.searchParams.has('billingcycle'));}))return null;
 const end=body.indexOf(group==='team'?'仍有疑问？':'简单，值得信赖');if(end<0)return null;
 const plans=[];for(let i=0;i<names.length;i++){
  const name=names[i],start=body.indexOf('\n'+name+'\n')+1,stop=i+1<names.length?body.indexOf('\n'+names[i+1]+'\n'):end;if(start<=0||stop<=start)return null;
  const quote=body.slice(start,stop).trimEnd(),price=quote.match(/\n¥(\d+(?:\.\d+)?)\n(CNY)?\/(年|月)\n/),q=quote.match(/(?:^|\n)(\d+) GB 月流量/);if(!price||!q||price[3]!== (annual?'年':'月'))return null;
  // AIR remains explicitly annual-only on the monthly display. Do not promote amortization.
  if(group==='individual'&&!annual&&name==='AIR'){if(!quote.includes('年付套餐'))return null;continue;}
  plans.push({name,productName:name,group:group==='team'?'团队版':'个人版',amount:Number(price[1]),billingPeriod:annual?'年付':'月付',amountBasis:'original_billing_period_total',quota:q[1]+'GB/月',currency:price[2]||null,currencySymbol:'¥',currencyStatus:price[2]?'explicit_ISO':'symbol_only_not_ISO_confirmed',observedAt:at,sourceIds:[s.evidenceId],sourceUrl:s.url,quote,sourceBodySha256:sha(body),sourceLocator:{kind:'body_utf16_range',start,end:start+quote.length,quoteSha256:sha(quote)},checkoutVerified:false});
 }
 return{key:group+'|'+b.label,plans,sourceId:s.evidenceId,at};
}
function extract(s,{prior={},observations=[s]}={}){
 if(new URL(s.url).origin!==origin)return null;
 const all=observations.map(parse).filter(Boolean),keys=['individual|年付','individual|月付','team|当前目录'];if(keys.some(k=>all.filter(x=>x.key===k).length!==1))return null;
 const chosen=keys.map(k=>all.find(x=>x.key===k)),plans=chosen.flatMap(x=>x.plans);if(plans.length!==9)return null;
 return{pricing:require('../../lib/current-public-price-catalog.cjs').currentPublicCatalog((prior.coreInfo||prior).pricing||{},{status:'advertised_not_checkout_verified',plans,observedAt:chosen.map(x=>x.at).sort().at(-1),sourceIds:[...new Set(chosen.map(x=>x.sourceId))],checkoutVerified:false,limitation:'个人4档年付、3档月付及团队2档月付；AIR月视图8.17为年付折算不作月付报价。原生购买链接回到y-too.net，未验证结账。'},'ytoo_native_public_full_visible_catalog')};
}
async function collectMany(tab,options={}){const u=require('url').pathToFileURL(require.resolve('../site-recipes/ytoo.mjs'));u.searchParams.set('revision',require('fs').statSync(u).mtimeMs);return(await import(u.href)).collectYtoo(tab,options);}
module.exports={origin,recordIds:['A021'],fields:['pricing'],readOnlyRecipe:'ytoo_native_public_catalog',collectMany,extract,parse};
