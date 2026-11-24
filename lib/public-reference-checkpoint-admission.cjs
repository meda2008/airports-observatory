'use strict';
// A registered public review can be blocked. Retaining that negative observation
// must not turn it into a readable review, authentication or business evidence.
function negativeReference(c,{siteId,checkpoint,patch={}}={}){return !!checkpoint&&checkpoint.stage==='public_performance_reference'&&Object.keys(patch).length===0&&['verification_checkpoint','auth_checkpoint'].includes(c?.kind)&&c.metadata?.performanceReference===true&&c.metadata.authenticationObserved!==true&&require('./performance-source-policy.cjs').publicReferenceCapture(c,siteId);}
module.exports={negativeReference};
