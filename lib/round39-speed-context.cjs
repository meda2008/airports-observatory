'use strict';
function context(core={},now=Date.now()){
 const r=(core.speed?.operatorMeasuredClaims||[]).find(r=>r.id==='round39-operator-measured-claim-A015-197'&&r.kind==='operator_measured_throughput_self_report'&&r.literalChecked===true&&r.sourceIds?.length&&r.quotedReportedValueMbps===550&&r.valueMbps===null&&r.testedAt===null&&r.measurementVerified===false&&r.independentMeasurement===false&&r.currentSpeedVerified===false&&r.current===false&&Date.parse(r.observedAt)<=now);
 return r?{kind:r.kind,publisher:r.publisher,publishedAt:r.publishedAt,dateLabel:'发布时间2026-11-10（测试时间未披露）',testedAt:null,valueMbps:null,quotedReportedValueMbps:550,valueText:'550Mbps',sampleCount:null,eligibleForSpeedRanking:false,description:'站方2026-11-10发帖称，联通访问其额外独享IP节点“实测速度可达550Mbps”。这是官方测量自述，发布时间不是测试时间；测试环境、样本、方法、窗口、测速原图和日志缺失，不代表当前速度，不作为独立实测或排名依据。仅关联当前oixCloud，不继承旧Dler历史。'}:null;
}
module.exports={context};
