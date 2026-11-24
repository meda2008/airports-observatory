'use strict';
// Display retained source material without converting image labels into rates.
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const bound=r=>r?.literalChecked===true&&Array.isArray(r.sourceIds)&&r.sourceIds.length>0&&r.independentMeasurement===false&&r.measurementVerified===false&&r.currentSpeedVerified===false&&r.sampleCount===null&&r.nodeCount===null&&r.rateUnit===null&&r.valueMbps===null&&r.unit===null&&r.eligibleForSpeedRanking===false;
function contexts(speed={},now=Date.now()){
 const profiles=require('../collection/url-collectors/fresh-gap-speed-parsers.cjs').profiles;
 const known=(r,id)=>profiles.some(p=>p.recordId===id&&p.url===r.sourceUrl)&&r.id?.includes(id)&&Number.isFinite(Date.parse(r.observedAt))&&Date.parse(r.observedAt)<=now;
 const u=(speed.undatedImageReports||[]).filter(r=>bound(r)&&known(r,'A146')&&r.kind==='third_party_undated_image_table'&&r.testedAt===null&&r.date===null&&r.columnHeaders===null&&r.columnMeanings===null&&r.displayedRows===54&&r.numericDisplayRows===52&&r.missingDisplayRows===2&&r.imageArtifacts?.length===2).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
 const d=(speed.imageReports||[]).filter(r=>bound(r)&&known(r,'A067')&&r.kind==='third_party_historical_image_table'&&day(r.testedAt)&&r.testedAtPrecision==='day'&&r.testedAt==='2024-04-01'&&Date.parse(r.testedAt)<=now&&r.reportedTimeZone==='CST'&&r.timeZoneOffset===null&&r.exactTestInstant===null&&r.displayedRows===76&&r.threadCount===6).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
 return{undated:u?{kind:u.kind,testedAt:null,dateLabel:'测试日期未注明',publisher:u.publisher,imageCount:2,displayedRows:54,numericDisplayRows:52,missingDisplayRows:2,rateUnit:null,valueMbps:null,eligibleForSpeedRanking:false,description:'第三方两张测速表，共54个显示行，其中52行有数字、2行缺值。测试日期与列标题未披露，MB未注明每秒，不能据此给出可靠速率、稳定率或排名。'}:null,
 dated:d?{kind:d.kind,testedAt:d.testedAt,reportedLocalTime:d.reportedLocalTime,reportedTimeZone:d.reportedTimeZone,timeZoneOffset:null,exactTestInstant:null,publisher:d.publisher,network:d.network,displayedRows:76,sampleCount:null,rateUnit:null,valueMbps:null,eligibleForSpeedRanking:false,description:'第三方历史单次测速图，保留76个显示行；单元格只标MB、KB、B，未换算Mbps。原图标注MiaoKo，正文称Speedtest，两者分别保留。缺少独立样本与原始日志，不代表当前速度；CST时区偏移未验证。'}:null};
}
module.exports={contexts};
