'use strict';
const crypto=require('node:crypto'),origin='https://hutaoindex.com',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function configured(c){return c?.recordId==='A011'&&c.entryUrl===origin+'/'&&c.publicOnly===true&&c.publicPublisherDiscovery===true;}
function anchors(html){
 if(typeof html!=='string'||!html.includes('<title>Hutao Cloud</title>')||!html.includes('自动检测可用域名')||!html.includes('<strong>永久域名</strong>'))throw Error('hutao_publisher_identity_changed');
 const hosts=['hutaohome.com','northernbridgeplatform.com','hutao.cloud'];
 for(const h of hosts)if(!new RegExp('<a\\b[^>]*href=["\']https://'+h.replaceAll('.','\\.')+'/["\']').test(html))throw Error('hutao_publisher_entry_changed');
 return hosts.map(host=>({url:'https://'+host+'/',label:'胡桃发布页原生列出；仅当前入口关系，非连续经营或法律主体证明',basis:'native_hutao_publisher_visible_anchor'}));
}
function links(e){try{if(e.url!==origin+'/')return[];const b=JSON.parse(e.body);if(b.representation!=='published_entry_original_bundle'||b.originals?.length!==1)return[];const p=b.originals[0];if(p.url!==origin+'/'||p.status!==200||sha(p.body)!==p.sha256)return[];return anchors(p.body);}catch{return[];}}
module.exports={origin,configured,anchors,links};
