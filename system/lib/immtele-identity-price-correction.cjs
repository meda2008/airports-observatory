'use strict';
const crypto=require('node:crypto'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
// A scope correction, not a new offer observation or a claim that either
// service changed ownership. Existing quote objects and their clocks survive.
function build({recordId,prior,evidence}){
 const c=prior?.coreInfo||prior;if(recordId!=='A003'||c?.website?.status!=='brand_name_conflict'||c.website.url!=='https://www.bianjiecloud.com/'||!Array.isArray(c.pricing?.plans)||!c.pricing.plans.length)throw Error('record_identity_conflict_required');
 const e=evidence?.find(e=>e.url==='https://www.bianjiecloud.com/about'&&e.body?.includes('关于边界云加速')&&e.body.includes('官网是 www.bianjiecloud.com。'));if(!e||!e.id||!Number.isFinite(Date.parse(e.observedAt))||sha(e.body)!==e.sha256)throw Error('bound_original_brand_evidence_required');
 const pricing=structuredClone(c.pricing),archive=pricing.candidatePlansArchive||[];archive.push({candidateName:'边界云加速',candidateUrl:c.website.url,legacyRecordIdentityVerified:false,officialCurrentPriceVerified:false,originalPricing:structuredClone(c.pricing),classificationEvidenceIds:[e.id],reason:'原页面明确为边界云加速；没有证明它是旧记录ImmTelecom。原价、时间和来源完整留存，停止作为ImmTelecom可购报价展示。'});
 pricing.plans=[];pricing.summaryPlanIndex=null;pricing.summaryUnavailableReason='service_identity_conflict';pricing.summaryExcludedSoldOutCount=0;pricing.status='identity_unverified_candidate_prices_excluded';pricing.candidatePlansArchive=archive;pricing.checkoutVerified=false;pricing.limitation='ImmTelecom当前官网报价尚未核实。旧保存入口显示边界云，原候选报价保留，不能当作ImmTelecom价格。';
 pricing.externalReports=[...(pricing.externalReports||[]),{status:'unverified_candidate_price',publisher:'边界云加速（与ImmTelecom归属未核）',sourceUrl:e.url,summary:'已保留 '+c.pricing.plans.length+' 条边界云候选报价，不能作为ImmTelecom官网价格；边界云独立记录为A170。',quote:e.body.split('\n').find(line=>line.includes('官网是 www.bianjiecloud.com。')),publishedAt:null,observedAt:e.observedAt,sourceIds:[e.id],officialCurrentPriceVerified:false,identityLimitation:'不同品牌，无迁移、更名或连续经营证明。',freshnessLimitation:'候选报价保留各自原采集时间；本次只纠正归属，不刷新价格核验时间。'}];
 const channel=evidence.find(x=>x.url==='https://t.me/s/immtelecom'&&x.body?.includes('ImmTelecom\n@immtelecom')&&x.body.includes('https://immtele.com/cart.php?a=add&pid=14')&&sha(x.body)===x.sha256&&Number.isFinite(Date.parse(x.observedAt)));
 const denial=evidence.find(x=>x.url==='https://immtele.com/cart.php'&&require('./cloudflare-denial.cjs').matches(x)&&sha(x.body)===x.sha256&&Number.isFinite(Date.parse(x.observedAt)));
 if(!channel||!denial)throw Error('native_channel_and_actual_access_state_required');
 return{pricing,website:{url:'https://immtele.com/',status:'native_channel_listed_access_denied',relationship:'native_channel_entry_observed_not_legal_continuity_proof',operatorIdentityVerified:false,basis:'ImmTelecom频道原生列出的业务域名；本次正常公开购物车返回访问拒绝，未验证套餐或登录。原保存的边界云入口为不同品牌候选，不作为ImmTelecom访问按钮。',observedAt:denial.observedAt,sourceIds:[channel.id,denial.id],previousEntries:[...(c.website.previousEntries||[]),structuredClone(c.website)]}};
}
module.exports={build};
