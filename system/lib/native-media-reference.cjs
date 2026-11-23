'use strict';
const {isDeepStrictEqual}=require('node:util');
// A failed download helper may have navigated to an image document. Bind the
// observed document and its actual img src, never reconstruct a CDN address.
function resolveNativeMedia({article,document,originalDocument,nativeHref,mediaUrl}={}){
 if(!article||!document||!originalDocument||document.originalCaptureClock!==originalDocument.capturedAt||document.observedAt!==originalDocument.capturedAt||document.url!==originalDocument.url||!isDeepStrictEqual(document.images,originalDocument.images))return null;
 const links=article.links||[],index=links.findIndex(l=>(l.href||l.url)===nativeHref);if(index<0||document.url!==nativeHref||originalDocument.articleNativeHref!==nativeHref||originalDocument.sourceUrl!==article.url)return null;
 const images=document.images.filter(i=>i.src===mediaUrl);if(images.length!==1||!/^https:\/\//.test(mediaUrl))return null;
 return{kind:'native_image_page_observed_document_img_src',articleLinkIndex:index,documentUrl:document.url,mediaUrl,width:images[0].width??null,height:images[0].height??null,sourceClock:originalDocument.capturedAt,documentNavigationObserved:originalDocument.downloadHelperHadNavigatedRatherThanReturnedFile===true};
}
function nextMediaAction({snapshot,articleUrl,nativeHref}={}){
 if(!snapshot||typeof snapshot.url!=='string')return{kind:'checkpoint',reason:'fresh_document_state_required'};
 if(snapshot.url===nativeHref){const images=(snapshot.images||[]).filter(i=>typeof i.src==='string'&&i.src.startsWith('https://'));return images.length===1?{kind:'download_current_document_image',src:images[0].src}:{kind:'checkpoint',reason:'unambiguous_current_document_img_required'};}
 if(snapshot.url===articleUrl&&(snapshot.links||[]).some(l=>(l.href||l.url)===nativeHref))return{kind:'open_native_article_link',href:nativeHref};
 return{kind:'checkpoint',reason:'document_changed_do_not_reuse_article_locator'};
}
module.exports={resolveNativeMedia,nextMediaAction};
