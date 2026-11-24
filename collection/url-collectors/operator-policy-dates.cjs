'use strict';
// Literal calendar labels only. This module does not qualify source identity,
// establish an opening date, fetch pages, or infer continuous operation.
const MONTHS=Object.freeze({January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12});
const monthNames=Object.keys(MONTHS).join('|'),monthNumber=name=>Object.entries(MONTHS).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1];
function parsePolicyDate(quote){
 if(typeof quote!=='string'||quote.length>4000||/(?:copyright|all rights reserved|©|版权所有|https?:\/\/)/i.test(quote))return null;
 const values=[];
 for(const m of quote.matchAll(/(?<!\d)(\d{4})\s*(年|\/|-)\s*(\d{1,2})\s*(月|\/|-)\s*(\d{1,2})\s*日?(?!\d)/g)){if(m[2]==='年'?m[4]!=='月':m[2]!==m[4])return null;values.push([+m[1],+m[3],+m[5]]);}
 const forward=new RegExp('\\b('+monthNames+')\\s+([0-9]{1,2}),?\\s+([0-9]{4})(?![0-9])','gi');
 for(const m of quote.matchAll(forward))values.push([+m[3],monthNumber(m[1]),+m[2]]);
 const reverse=new RegExp('(?<![0-9])([0-9]{1,2})\\s+('+monthNames+')\\s+([0-9]{4})(?![0-9])','gi');
 for(const m of quote.matchAll(reverse))values.push([+m[3],monthNumber(m[2]),+m[1]]);
 if(values.length!==1)return null;
 const [year,month,day]=values[0];if(year<1900||year>2099||month<1||month>12||day<1||day>31)return null;
 const iso=[String(year),String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-'),date=new Date(iso+'T00:00:00Z');
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===iso?iso:null;
}
function isPolicyContext(text){return typeof text==='string'&&text.length<=12000&&!/(?:copyright|©|版权所有)/i.test(text)&&/(?:协议|協議|条款|條款|政策|Terms\s+of\s+Service|Terms\s+of\s+Use|User\s+Agreement|Acceptable\s+Use\s+Policy|\bTOS\b|\bAUP\b)/i.test(text);}
module.exports={parsePolicyDate,isPolicyContext};
