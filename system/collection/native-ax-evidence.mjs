// A diff or "no change" is useful interactively, but is not a frozen original.
export async function readFullNativeEvidence(tab,{url}={}){
 const text=await tab.getAXState({emit:false,disableDiffing:true});
 if(typeof text!=='string'||!text.includes('AXWebArea')||/There has been no change|The following is a diff/.test(text))throw Error('full_native_accessibility_original_required');
 const observed=text.match(/^Browser tab:.*?URL: "([^"]+)"/m)?.[1];
 if(!observed||observed!==url)throw Error('native_evidence_route_mismatch');
 return{url:observed,capturedAt:new Date().toISOString(),text:text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]'),representation:'redacted_native_accessibility_tree',passwordValuePersisted:false,emailRedactedInText:true};
}
