'use strict';
function context(core={},now=Date.now()){
 const r=(core.speed?.imageReports||[]).find(r=>r.id==='round34-image-A077-2024-03-10'&&r.literalChecked===true&&r.sourceIds?.length&&r.current===false&&r.independentMeasurement===false&&r.measurementVerified===false&&r.valueMbps===null&&Date.parse(r.observedAt)<=now);
 if(!r)return null;
 return {kind:r.kind,testedAt:r.testedAt,publisher:r.publisher,displayedRows:r.displayedRows,threadCount:r.threadCount,reportedLocalTime:r.reportedLocalTime,reportedTimeZone:r.reportedTimeZone,valueMbps:null,rateUnit:null,sampleCount:null,timeZoneOffset:null,description:'2024-03-10 第三方历史测速图，中山电信1Gbps、6线程、34显示行，选核3例。MB/KB/B未注明每秒，不换算Mbps；保留KB及0.00B结果，34/34不作可用率。关联官方频道曾公布旧域；正文称2024年8月换老板，旧图不代表新团队、当前速度或连续经营。'};
}
module.exports={context};
