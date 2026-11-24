import {readRenderedDocument} from '../visible-document.mjs';
const origin='https://shop.starpro.one',title='常见问题解答';
// Verified against the visible Ant Design menu, list and delayed dialog on 2026-11-03.
// It is acquisition only: the retained FAQ does not state a refund policy.
export async function collectJiuxiaoKnowledge(tab,{previousArticles=[]}={}){
 const expected=origin+'/#/knowledge',captures=[],actions=[];
 const check=async()=>{if(await tab.url()!==expected)throw Error('jiuxiao_knowledge_route_changed');};
 await check();
 await tab.playwright.getByRole('heading',{name:'新用户必看',exact:true}).first().waitFor({state:'visible',timeoutMs:12000});
 await check();const index=await readRenderedDocument(tab);
 captures.push({...index,semanticLocation:{stage:'index'},kind:'operator_knowledge_index'});
 if(previousArticles.includes(title))return{status:'no_unread_relevant_article_bodies',captures,actions,articleTitles:previousArticles};
 const card=tab.playwright.getByText(title,{exact:true});
 if(await card.count()!==1||!await card.isVisible())throw Error('jiuxiao_faq_card_missing_or_ambiguous');
 await card.click();await check();
 const dialog=tab.playwright.getByRole('dialog');
 // Waiting for navigation/networkidle alone returned the unchanged list in the live run.
 await dialog.getByRole('heading',{name:title,exact:true}).waitFor({state:'visible',timeoutMs:12000});
 await dialog.locator('p').first().waitFor({state:'visible',timeoutMs:12000});await check();
 if(await dialog.count()!==1)throw Error('jiuxiao_document_dialog_ambiguous');
 const snapshot=await readRenderedDocument(tab);await check();
 if(snapshot.visibleDialogCount!==1||!snapshot.text.includes('续费当前订阅只会增加时长'))throw Error('jiuxiao_article_body_not_ready');
 captures.push({...snapshot,semanticLocation:{stage:'article',category:'新用户必看',title},kind:'operator_knowledge_article'});
 actions.push({kind:'read_article',category:'新用户必看',title});
 const close=dialog.getByRole('button',{name:'close',exact:true});
 if(await close.count()!==1)throw Error('jiuxiao_document_close_ambiguous');
 await close.click();await dialog.waitFor({state:'hidden',timeoutMs:8000});await check();
 return{status:'article_bodies_observed',captures,actions,articleTitles:[...new Set([...previousArticles,title])],newOrdersCreated:0,paymentExecuted:false};
}
