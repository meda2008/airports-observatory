'use strict';
// Only the observed A035 visible no-href document control. Never invent an app route.
async function followVisibleDocumentControl(page,{siteId,currentUrl}){
 if(siteId!=='A035'||new URL(currentUrl).hostname!=='33.33laomao.com'||page.url()!==currentUrl)return null;
 const rows=await page.evaluate(()=>[...document.querySelectorAll('a.nav-main-link')].filter(e=>e.getClientRects().length>0&&e.innerText.trim()==='使用文档').map(e=>({tag:e.tagName,href:e.getAttribute('href'),text:e.innerText.trim()})));
 if(rows.length!==1||rows[0].tag!=='A'||rows[0].href!==null||rows[0].text!=='使用文档'||page.url()!==currentUrl)return null;
 const target=page.getByText('使用文档',{exact:true});if(await target.count()!==1||!await target.isVisible())return null;
 await target.click({timeout:3000});const after=page.url();if(after===currentUrl)return null;if(new URL(after).origin!==new URL(currentUrl).origin)throw Error('visible_document_control_origin_changed');return{url:after,label:'使用文档',basis:'fresh_visible_unique_exact_text_no_href_control',parentUrl:currentUrl};
}
module.exports={followVisibleDocumentControl};
