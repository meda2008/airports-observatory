'use strict';
function context(core={},now=Date.now()){
 const rows=(core.stability?.reviewedIssueSignals||[]).filter(r=>r.sourceIds?.length&&r.sourceWasRecaptured===false&&r.measurementVerified===false&&Number.isFinite(Date.parse(r.observedAt))&&Date.parse(r.observedAt)<=now);
 const node=rows.find(r=>r.id==='round40-retained-A001-node-connectivity'&&r.kind==='historical_node_connectivity_snapshot'&&r.reportedNodeCount===29&&r.reportedAvailableNodeCount===29&&r.reportedFailedNodeCount===0);
 const candidate=rows.filter(r=>r.currentCandidateOnly===true&&r.id?.startsWith('round40-retained-A042-'));
 return{node:node?{kind:node.kind,reportedNodeCount:29,reportedAvailableNodeCount:29,reportedFailedNodeCount:0,sampleCount:null,availabilityPct:null,measurementVerified:false,sourceUrl:node.sourceUrl,observedAt:node.observedAt,description:'第三方历史单次节点连通快照：29个节点可连通、0个失败。分母是节点数，不是连续时间；不代表长期稳定率、当前状态或机场整体SLA。主要地区15/15与全部29/29不混用。'}:null,candidate:candidate.length?{kind:'candidate_operator_dns_connection_statements',currentCandidateOnly:true,legacyRecordIdentityVerified:false,measurementVerified:false,description:'登记的同域SNTP候选站有DNS连接问题与DoH配置说明；年份未完整披露，后续说明覆盖早期客户端范围。与旧守候品牌关系及实际恢复未核验，不算旧服务稳定性已补齐。'}:null};
}
module.exports={context};
