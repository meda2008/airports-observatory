import {readRenderedDocument} from '../visible-document.mjs';
// The route changes before the old dashboard is replaced. The document's
// own return control is the readiness marker; the animated LOADING text
// remains in this theme even after the article is ready.
export async function collectNierKnowledge(tab){
 const url=await tab.url(),u=new URL(url);
 if(u.origin!=='https://board.cloudnier.com'||u.hash!=='#/doc/knowledge')throw Error('nier_document_route_required');
 await tab.playwright.getByText('返回主站',{exact:true}).waitFor({state:'visible',timeoutMs:12000});
 if(await tab.url()!==url)throw Error('nier_document_route_changed');
 const snapshot=await readRenderedDocument(tab);
 if(!snapshot.text.includes('使用文档')||!snapshot.text.includes('使用教程'))throw Error('nier_document_body_not_ready');
 return{status:'knowledge_observed',captures:[{...snapshot,kind:'operator_knowledge_index',semanticLocation:{stage:'index'}}],actions:[{kind:'wait_for_document_marker',label:'返回主站'}]};
}
