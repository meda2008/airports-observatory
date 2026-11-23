'use strict';
// DOM ordinal is not the offset of a filtered JSON link array.
function resolveNativeLink(links,{url,label}={}){
 if(!Array.isArray(links)||typeof url!=='string'||typeof label!=='string'||!label.trim())throw Error('Exact expected native URL and visible label required');
 const matches=links.flatMap((link,arrayIndex)=>(link?.url||link?.href)===url&&(link.label??link.text)===label?[{arrayIndex,nativeIndex:Number.isInteger(link.index)?link.index:null,link}]:[]);
 if(matches.length!==1)throw Error('Expected native href and label must select exactly one link');
 return matches[0];
}
module.exports={resolveNativeLink};
