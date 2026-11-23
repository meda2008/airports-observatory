'use strict';
const form=document.querySelector('#search'),statusNode=document.querySelector('#status'),results=document.querySelector('#results'),limits=document.querySelector('#limitations');
let pending;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function money(n){return new Intl.NumberFormat('zh-CN',{maximumFractionDigits:4}).format(n);}
async function search(event){
 event?.preventDefault();pending?.abort();const controller=new AbortController();pending=controller;
 results.replaceChildren();limits.replaceChildren();statusNode.textContent='正在读取已有证据…';
 const params=new URLSearchParams();for(const[k,v]of new FormData(form))if(v)params.set(k,v);
 try{const response=await fetch('/api/needs-search?'+params,{signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'搜索失败');
  statusNode.textContent=data.reason||`找到 ${data.items.length} 个有可比套餐的服务；${data.excludedCount} 个未满足证据或筛选条件。`;
  limits.replaceChildren(...data.limitations.map(t=>node('li',t)));
  for(const item of data.items){const card=node('article','');card.append(node('h2',item.name),node('p',`${item.plan.name} · ${item.plan.amount} ${data.currency} / ${item.plan.billingPeriod}`),node('p',`月均标价 ${money(item.comparison.monthlyAmount)} ${data.currency}（${item.comparison.formula}）`));
   if(item.comparison.costPerGB!==null)card.append(node('p',`每月 ${item.comparison.monthlyQuotaGB} GB · ${money(item.comparison.costPerGB)} ${data.currency}/GB`));
   card.append(node('p',`采集：${item.plan.observedAt} · 来源：${item.plan.sourceIds.join('、')}`));
   if(item.plan.restrictions?.length)card.append(node('p','限制：'+item.plan.restrictions.join('；')));
   card.append(node('p',item.link.disclosure));
   if(item.link.url){const link=node('a',item.link.label);link.href=item.link.url;link.target='_blank';link.rel='noopener noreferrer sponsored';card.append(link);}results.append(card);
  }
 }catch(error){if(error.name!=='AbortError')statusNode.textContent='无法完成搜索：'+error.message;}
}
form.addEventListener('submit',search);search();
