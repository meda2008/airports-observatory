// Read an existing in-app page through its visible Windows accessibility tree
// when the tab-claim API is unavailable. Never persist the surrounding chat.
export function embeddedDocumentFromAX(ax,{origin,url}={}){
 if(typeof ax!=='string')throw Error('native_full_tree_required');
 const lines=ax.split('\n'),found=[];
 for(let i=0;i<lines.length;i++){const m=lines[i].match(/^(\s*)\d+ 文档 (.*?) Value: (https?:\/\/\S+) ID: RootWebArea\s*$/);if(!m)continue;const target=new URL(m[3]);if(target.origin===origin&&(!url||target.href===url))found.push({index:i,indent:m[1].length,title:m[2],url:target.href});}
 if(found.length!==1)throw Error('embedded_document_missing_or_ambiguous');
 const selected=found[0],body=[];
 for(let i=selected.index;i<lines.length;i++){if(i>selected.index&&lines[i].trim()&&lines[i].match(/^\s*/)[0].length<=selected.indent)break;body.push(lines[i]);}
 const clean=body.filter(l=>!/(?:vmess|vless|trojan|ss):\/\/|[?&](?:token|password|access_token|auth_key)=|\/client\/subscribe/i.test(l)).join('\n').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]');
 const links=clean.split('\n').flatMap(l=>{const m=l.match(/^\s*\d+ 链接 (.*?) Value: (https?:\/\/\S+)$/);return m?[{label:m[1],url:m[2]}]:[];});
 return{url:selected.url,title:selected.title,text:clean,links,representation:'redacted_embedded_document_accessibility_tree',surroundingChatExcluded:true};
}
export async function readEmbeddedDocument(app,options){const ax=await app.getAXState({emit:false,disableDiffing:true});return{...embeddedDocumentFromAX(ax,options),capturedAt:new Date().toISOString()};}
