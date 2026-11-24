'use strict';
const readable=new Set(['operator_visible_page','authorized_account_page','rendered_public_or_authorized_page','public_performance_reference']);
function replayCaptureKind(e,run,o,metadata={}){
 if(!e||!run||!o||o.jobId!==run.jobId||!run.evidenceIds?.includes(e.id)||!Number.isFinite(Date.parse(o.observedAt)))return null;
 if(readable.has(e.kind))return e.kind;
 // Evidence is content-addressed: an older import kind may coexist with a fresh browser observation.
 // Admit only the exact current-job DOM witness; an old body or a retained replay alone is insufficient.
 if(!['retained_operator_visible_page','normalized_retained_visible_DOM_text'].includes(e.kind)||run.capabilities?.dataBasis?.status!=='standalone_browser'||metadata.representation!=='redacted_visible_DOM_text_not_original_HTML'||metadata.passwordForm!==false||metadata.verificationWidgetObserved!==false||metadata.agreementCheckbox===true)return null;
 return'rendered_public_or_authorized_page';
}
module.exports={replayCaptureKind};
