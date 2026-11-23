'use strict';
function context(core={},now=Date.now()){
 const r=(core.speed?.undatedImageReports||[]).find(r=>r.id?.startsWith('round37-undated-image-A039-')&&r.literalChecked===true&&r.sourceIds?.length&&r.current===false&&r.independentMeasurement===false&&r.measurementVerified===false&&r.valueMbps===null&&r.testedAt===null&&Date.parse(r.observedAt)<=now);
 return r?{kind:r.kind,testedAt:null,dateLabel:'测试日期未注明',publisher:r.publisher,imageCount:3,displayedRows:r.displayedRows,originalValues:r.originalValues.map(({displayRow,publisherRowLabel,protocolAsPrinted,metrics,status})=>({displayRow,publisherRowLabel,protocolAsPrinted,metrics,status})),valueMbps:null,rateUnit:null,sampleCount:null,description:'第三方3张下载测速图，测试日期、网络环境与样本定义未注明。表内峰值/平均MB/s、流量MB和延迟ms仅保留原值，不换算Mbps或计算整体统计；失败/等待行及额度、有效期说明不当作独立节点或可用率。当前官网精确域名关联不证明历史经营主体；部分台湾线路避免晚高峰的提示保留，不代表当前速度。'}:null;
}
module.exports={context};
