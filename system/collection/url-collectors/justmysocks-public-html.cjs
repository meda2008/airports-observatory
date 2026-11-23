'use strict';
const crypto=require('node:crypto'),{currentPublicCatalog}=require('../../lib/current-public-price-catalog.cjs');
const url='https://justmysocks.net/members/cart.php',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const text=s=>s.replace(/<[^>]+>/g,' ').replace(/&(?:amp|nbsp|infin);|&#8734;/g,m=>({'&amp;':'&','&nbsp;':' ','&infin;':'∞','&#8734;':'∞'}[m])).replace(/\s+/g,' ').trim();
function extract(s,{recordId,prior={}}={}){
 if(recordId!=='A023'||s.url!==url||!s.evidenceId||!Number.isFinite(Date.parse(s.observedAt))||s.metadata?.representation!=='original_jms_public_catalog_html'||/checkpoint/.test(s.kind||''))return null;
 const body=s.body;if(typeof body!=='string'||!/<\/html>\s*$/i.test(body)||!/<title>Shopping Cart - Just My Socks<\/title>/.test(body)||!body.includes('id="products"'))return null;
 const cards=[...body.matchAll(/<li\s+id=["']product(\d+)["']\s*>/g)];if(!cards.length||cards.length>100)return null;const plans=[];
 for(let i=0;i<cards.length;i++){
  const id=cards[i][1],start=cards[i].index,chunk=body.slice(start,cards[i+1]?.index||body.length);
  const name=new RegExp('<h4\\s+id=["\']product'+id+'-name["\'][^>]*>([\\s\\S]*?)<\\/h4>').exec(chunk),price=new RegExp('<div\\s+class=["\']price["\']\\s+id=["\']product'+id+'-price["\'][^>]*>\\s*<span>\\$([0-9,]+\\.[0-9]{2})<\\/span>\\s*\\/mo').exec(chunk),description=new RegExp('<li\\s+id=["\']product'+id+'-description["\'][^>]*>([\\s\\S]*?)<\\/li>').exec(chunk);
  if(!name||!price||!description)return null;const label=text(name[1]),desc=text(description[1]),parts=/^(?:CT\+CU\+CM 3-carriers )?(\d+(?:\.\d+)?)(GB|TB)\/mo (?:on|at) ([\d.]+) (Gbps|Mbps) \| (\d+|∞) devices(?: (Hong Kong CMI IP transit \(NO CT\/CU\)))?$/.exec(desc),amount=Number(price[1].replace(/,/g,''));
  if(!/^Just My Socks .+/.test(label)||!parts||!Number.isFinite(amount)||amount<=0)return null;
  const end=start+description.index+description[0].length,quote=body.slice(start,end);
  plans.push({name:label,productName:label,amount,amountBasis:'original_billing_period_total',billingPeriod:'月付',currency:null,currencySymbol:'$',currencyStatus:'symbol_only_not_ISO_confirmed',currencyReason:'本次卡片仅显示$，未外推ISO币种，不参与跨币种价格排名。',quota:parts[1]+parts[2]+'/月',deviceLimit:parts[5]==='∞'?'站方称不限设备，未验证执行':parts[5]+'设备（站方声明）',maxDevices:parts[5]==='∞'?null:Number(parts[5]),advertisedBandwidth:parts[3]+' '+parts[4],routingStatement:parts[6]||null,priceStatus:'advertised_not_checkout_verified',checkoutVerified:false,sourceIds:[s.evidenceId],sourceUrl:s.url,observedAt:s.observedAt,sourceBodySha256:sha(body),quote,sourceLocator:{kind:'body_utf16_range',start,end,bodySha256:sha(body),quoteSha256:sha(quote)},restrictions:['仅本次官网公开卡片月价；未点击Order Now、建单、付款或核实库存。','流量、设备、带宽及地区路由为站方声明，不能当作实测速度或稳定性。']});
 }
 if(new Set(plans.map(p=>p.name)).size!==plans.length)return null;
 const old=(prior.coreInfo||prior).pricing||{};return{pricing:currentPublicCatalog(old,{status:'advertised_not_checkout_verified',plans,sourceIds:[s.evidenceId],sourceBodySha256:sha(body),observedAt:s.observedAt,checkoutVerified:false,operatorIdentityVerified:false,mergeScope:'current_monthly_cards_only_unobserved_cycles_in_history',limitation:'只展示本次实际读取的公开月付目录；未观察到的旧周期单列历史资料，不据此认定停售。$符号不确认ISO币种，未验证结账或交付。'},'current_public_html_product_cards')};
}
module.exports={url,extract};
