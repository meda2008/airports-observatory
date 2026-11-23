import {readRenderedDocument} from '../visible-document.mjs';

export function inspectRankingCards(){
 const visible=e=>!!e.getClientRects().length;
 const main=[...document.querySelectorAll('main')].find(visible);
 if(!main)return{records:[],renderStatus:'visible_main_missing'};
 return{renderStatus:'visible_main_observed',records:[...main.querySelectorAll('article')].filter(visible).filter(e=>/^#\d+/.test(e.querySelector('h3')?.innerText||'')).map(e=>({heading:e.querySelector('h3').innerText,text:e.innerText,links:[...e.querySelectorAll('a[href]')].filter(visible).map(a=>({label:a.innerText,url:a.href}))}))};
}

// This directory supplies discovery leads only. Its prices, scores and reviews
// never become operator facts, including when its link is labelled “官网”.
export async function searchJichangbangEntry({tab,recordId,query,onCheckpoint=()=>{},readDocument=readRenderedDocument}){
 const before=new URL(await tab.url());
 if(before.origin!=='https://www.jichangbang.cc'||before.pathname!=='/ranking')throw Error('ranking_search_scope_mismatch');
 if(!/^A\d{3}$/.test(recordId)||typeof query!=='string'||!query.trim()||query.length>80)throw Error('ranking_search_invalid_scope');
 await onCheckpoint({recordId,query,status:'directory_search_pending',sourceUrl:before.href,at:new Date().toISOString()});
 if(before.searchParams.get('q')!==query){
  const search=tab.playwright.getByRole('searchbox',{name:'搜索',exact:true});
  await search.fill(query);await search.press('Enter');
  const committed=new URL('/ranking',before.origin);committed.searchParams.set('q',query);
  await tab.playwright.waitForURL(committed.href,{timeoutMs:10000});
 }
 const current=new URL(await tab.url());if(current.origin!==before.origin||current.pathname!=='/ranking'||current.searchParams.get('q')!==query)throw Error('ranking_search_route_not_committed');
 const document=await readDocument(tab),cards=await tab.playwright.evaluate(inspectRankingCards);
 const receipt={recordId,query,url:document.url,capturedAt:document.capturedAt,document,...cards,grade:'E0',officialQuotesAdmitted:0,identityConfirmed:false,credentialsSubmitted:false,newOrdersCreated:0,paymentExecuted:false};
 await onCheckpoint({...receipt,status:'directory_search_captured'});return receipt;
}
