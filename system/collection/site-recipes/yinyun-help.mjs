import {readRenderedDocument} from '../visible-document.mjs';
import {followNativeReadLink} from '../native-read-link.mjs';
const origin='https://support.yinyun.ltd',route='/hc/help/articles/1768189353-',title='快速入门指南';
export async function collectYinyunHelp(tab,{previousArticles=[]}={}){
 if(new URL(await tab.url()).origin!==origin)throw Error('yinyun_help_origin_required');
 if(previousArticles.includes(title))return{status:'retained_article_reused_no_navigation',captures:[],actions:[],articleTitles:previousArticles};
 const actions=[];if(new URL(await tab.url()).pathname!==route)actions.push(await followNativeReadLink({tab,label:/^快速入门指南/,articleTitle:title}));
 await tab.playwright.locator('h1').filter({hasText:title}).waitFor({state:'visible',timeoutMs:12000});
 await tab.playwright.locator('article p').first().waitFor({state:'visible',timeoutMs:12000});
 const snapshot=await readRenderedDocument(tab);if(!snapshot.text.includes('免费时长：3 × 24小时（从注册账号开始）'))throw Error('yinyun_quick_start_body_not_ready');
 return{status:'article_bodies_observed',captures:[{...snapshot,semanticLocation:{stage:'article',title},kind:'operator_knowledge_article'}],actions,articleTitles:[...previousArticles,title]};
}
