'use strict';
function contexts(core={},now=Date.now()){
 const out={},bound=r=>r?.literalChecked===true&&r.sourceIds?.length&&r.independentMeasurement===false&&r.measurementVerified===false&&Date.parse(r.observedAt)<=now;
 const image=(core.speed?.imageReports||[]).find(r=>r.id?.startsWith('round23-image-')&&bound(r)&&r.currentSpeedVerified===false&&r.rateUnit===null&&r.valueMbps===null&&r.sampleCount===null);if(image)out.image={kind:image.kind,testedAt:image.testedAt,publisher:image.publisher,displayedRows:image.displayedRows,reportedLocalTime:image.reportedLocalTime,reportedTimeZone:'CST',timeZoneOffset:null,exactTestInstant:null,sampleCount:null,rateUnit:null,valueMbps:null,description:'第三方历史测速图，'+image.displayedRows+'显示行，选核3例。MB/KB未明确每秒，不换算Mbps或总体统计；CST偏移未知，不代表当前速度。'+(image.id.includes('A040')?'前2行为订阅信息，不是75个节点；Hy2横杠是缺值，不补零。同页用户对客服、速度与断连体验评价不同，均未核实，不增独立事故。':'直连/中转/专线及倍率混合，缺失延迟可与非零吞吐同现；协议变更陈述保留，服务器展示不等于稳定率。')+'当前入口关联不证明历史主体或当前业务。'};
 const history=(core.operatingHistory?.historyStatements||[]).find(r=>r.id?.startsWith('round23-history-')&&bound(r)&&r.dateEvidence?.kind==='retained_report_test_date_literal');if(history)out.history={id:history.id,description:history.date+' 第三方历史测试记录。复用已审报告明确测试日，不是新测试、成立或连续经营；保留旧测速方法与当前入口关联的限制，历史法律主体未核实。'};
 return out;
}
module.exports={contexts};
