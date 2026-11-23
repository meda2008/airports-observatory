'use strict';
function contexts(core={},now=Date.now()){
 const out={},bound=r=>r?.literalChecked===true&&r.sourceIds?.length&&r.independentMeasurement===false&&r.measurementVerified===false&&Date.parse(r.observedAt)<=now;
 const image=(core.speed?.imageReports||[]).find(r=>r.id==='round24-image-A188-2026-01-18'&&bound(r)&&r.currentSpeedVerified===false&&r.valueMbps===null&&r.rateUnit===null);
 if(image)out.image={kind:image.kind,testedAt:image.testedAt,publisher:image.publisher,displayedRows:image.displayedRows,reportedLocalTime:image.reportedLocalTime,reportedTimeZone:'CST',sampleCount:null,rateUnit:null,valueMbps:null,timeZoneOffset:null,description:'2026-01-18 第三方历史测速图，31显示行，选核3例；首行为订阅信息，并非31个节点。MB/KB未明确每秒，不换算Mbps；混合协议及零字节仅该轮结果，不推长期可用率。当前发布入口关联不证明历史主体，不代表当前速度。'};
 const history=(core.operatingHistory?.historyStatements||[]).find(r=>r.id?.startsWith('round24-history-')&&bound(r)&&r.dateEvidence?.kind==='retained_report_test_date_literal');
 if(history)out.history={id:history.id,description:history.date+' 第三方历史测试记录。复用已审报告明确测试日，不是新测试、成立或连续经营；保留原报告方法与当前候选身份限制。'};
 const status=(core.stability?.thirdPartyStatusReports||[]).find(r=>r.id==='round24-status-A188-2025-12'&&bound(r)&&r.current===false&&r.durationMinutes===null&&r.events?.length===3);
 if(status)out.status={round24ScopedStatus:true,kind:status.kind,publisher:status.publisher,signalSummaries:['2025-12-26：发布者称节点下线超时不可用。','2025-12-28、12-31：同一发布者称主节点基本修复、节点基本恢复。'],description:'第三方单页历史状态陈述，未独立核实；恢复措辞不是实际恢复时刻，持续时长和样本未知，不代表当前故障或长期稳定率。运营团队交接仅第三方转述或猜测；2026-01-18体验不佳陈述仍保留。'};
 return out;
}
module.exports={contexts};
