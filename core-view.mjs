const periods = { month: '月', monthly: '月付', year: '年', yearly: '年付', quarter: '季度', quarterly: '季付', once: '一次性' };
const categories = { airport: '机场', niche: '小众机场', vpn: 'VPN', proxy: '商业代理', vps: 'VPS', tool: '工具', unknown: '其他资料' };
const paymentLevels = { unknown: '支付方式未知', image_only: '仅见支付图标', help_reference: '帮助页提及', public_text: '公开支付说明', authenticated_checkout: '已取得收银台说明' };
const known = value => value !== null && value !== undefined && value !== '';
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).replace(/^【待补：/, '').replace(/】$/, '') : '';
const values = value => Array.isArray(value) ? value : [];
const firstText = (...items) => items.map(text).find(Boolean) || '';
const clean = value => firstText(value?.summary, value?.label, value?.value, value?.reason, value?.basis, value);
const unique = items => [...new Set(values(items).filter(item => typeof item === 'string' && item))];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : '';
const sourceIdsFrom = value => Array.isArray(value) ? value.flatMap(sourceIdsFrom) : value && typeof value === 'object' ? [...values(value.sourceIds), ...Object.entries(value).filter(([key]) => key !== 'sourceIds').flatMap(([, child]) => sourceIdsFrom(child))] : [];

function formatPlan(plan = {}) {
  const amount = finite(plan.amount) ? String(plan.amount) : '';
  const currency = firstText(plan.currency, plan.currencySymbol);
  const period = periods[plan.billingPeriod] || text(plan.billingPeriod);
  const price = amount ? (currency ? currency + ' ' : '') + amount + (period ? ' / ' + period : '') + (!plan.currency ? '（币种未知）' : '') : '金额未知';
  return { name: text(plan.name), price, unknownCurrency: Boolean(amount && !plan.currency), soldOut: plan.soldOut === true, addon: plan.addon === true || (plan.addon && typeof plan.addon === 'object') };
}

function priceSummary(core) {
  const plans = values(core.pricing?.plans);
  const limitation = text(core.pricing?.limitation);
  if (!plans.length) return { value: '当前价格未知', note: limitation || '未取得可绑定该服务的当前套餐材料。', plans };
  const first = formatPlan(plans[0]);
  return { value: first.price, note: (limitation ? limitation + ' ' : '') + (first.name ? first.name + '；' : '') + (first.soldOut ? '页面标为售罄。' : '') + (first.addon ? '附加服务，需核对前置条件。' : '') + (plans.length > 1 ? '另有 ' + (plans.length - 1) + ' 项页面套餐或附加项。' : '页面标价。') + (plans[0].amountBasis==='advertised_starting_price_not_period_total'?'页面起价不代表月付总额，实际周期总价未验证。':'按原计费周期展示，实际结算总额未验证。'), plans };
}

const measuredSamples = data => data?.measured?.status === 'scoped_measurements_available' ? values(data.measured.observations) : [];
const advertisedSpeedText = claim => firstText(claim?.summary, finite(claim?.advertisedSpeedMbps) ? '标称带宽 ' + claim.advertisedSpeedMbps + ' Mbps' : '');
const reportedMetrics = report => values(report?.metrics).map(metric => [text(metric?.label), text(metric?.valueText)].filter(Boolean).join(' ')).filter(Boolean);

function speedMaterialsSummary(data) {
  const advertised = values(data.advertised).map(advertisedSpeedText).filter(Boolean);
  const reports = values(data.externalReports).map(report => [(text(report.publisher) || '发布者未说明') + '（测试日期：' + (day(report.testedAt) || '未知') + (day(report.publishedAt) ? '；发布日期：' + day(report.publishedAt) : '') + '）', ...reportedMetrics(report)].filter(Boolean).join('；')).filter(Boolean);
  return (advertised.length ? '站方宣传（非本站实测）：' + advertised.join('；') + '。' : '') + (reports.length ? '原始评测报告（未经本站独立复核）：' + reports.join('；') + '。报告反映其自身日期和条件，不保证当前速度。' : '');
}

function measurementMetrics(sample, kind) {
  const metrics = [];
  if (kind === 'speed') {
    if (finite(sample.downloadMbpsQuantiles?.p50)) metrics.push('下载中位数 ' + sample.downloadMbpsQuantiles.p50 + ' Mbps');
    else if (finite(sample.downloadMbps)) metrics.push('下载 ' + sample.downloadMbps + ' Mbps');
    else for (const key of ['p10', 'p90', 'p95']) if (finite(sample.downloadMbpsQuantiles?.[key])) metrics.push('下载 ' + key.toUpperCase() + ' ' + sample.downloadMbpsQuantiles[key] + ' Mbps');
    if (finite(sample.uploadMbps)) metrics.push('上传 ' + sample.uploadMbps + ' Mbps');
    if (finite(sample.latencyMs)) metrics.push('延迟 ' + sample.latencyMs + ' ms');
    if (finite(sample.packetLossPct)) metrics.push('丢包 ' + sample.packetLossPct + '%');
  } else {
    if (finite(sample.availabilityPct)) metrics.push('可用率 ' + sample.availabilityPct + '%');
    if (finite(sample.packetLossPct)) metrics.push('丢包 ' + sample.packetLossPct + '%');
  }
  return metrics;
}

function performanceSummary(core, kind) {
  const data = core[kind] || {};
  const observations = measuredSamples(data);
  if (observations.length) {
    const sample = observations[0], metrics = measurementMetrics(sample, kind);
    if (metrics.length) {
      const scope = [sample.region, sample.network, sample.plan].map(text).filter(Boolean).join(' / ');
      const time = kind === 'speed' ? day(sample.testedAt) : [day(sample.windowStart), day(sample.windowEnd)].filter(Boolean).join(' 至 ');
      const count = Number.isSafeInteger(sample.sampleCount) ? sample.sampleCount + ' 个样本' : '样本范围见依据';
      return { value: metrics.join('；'), note: [scope, time, count, text(sample.methodology), text(sample.peakHours)].filter(Boolean).join('；') + '。' + (observations.length > 1 ? '这里只列首组，另有 ' + (observations.length - 1) + ' 组测量。' : '') + '仅适用于上述测量条件。' };
    }
  }
  if (kind === 'speed') {
    return { value: '实际速度未知', note: speedMaterialsSummary(data) + '尚无可比较的本站独立实测，实际用户速度未知。' };
  }
  return { value: '稳定性未实测', note: '近月问题线索另列；公开页面在线不能代表线路稳定。' };
}

function paymentSummary(core) {
  const data = core.payment || {};
  const methods = values(data.methods).map(clean).filter(Boolean);
  const value = methods.length ? methods.join('、') : '支付方式未知';
  const qualifier = { image_only: '仅图标', help_reference: '帮助页提及', public_text: '站方说明', authenticated_checkout: '收银台说明' }[data.evidenceLevel];
  const sourcedReason = unique(data.sourceIds).length ? text(data.reason) : '';
  return { value, cardValue: value + (methods.length && qualifier ? '（' + qualifier + '）' : ''), note: (paymentLevels[data.evidenceLevel] || paymentLevels.unknown) + (methods.length ? '；当前收款、到账未验证。' : '。') + sourcedReason };
}

function historySummary(core) {
  const data = core.operatingHistory || {};
  let value = firstText(data.label, data.summary) || '运营年限未知';
  if (finite(data.yearsSinceStart)) value = '距有来源的运营起点 ' + data.yearsSinceStart + ' 个完整年';
  else if (Array.isArray(data.yearRange) && data.yearRange.length === 2 && data.yearRange.every(finite)) value = '距有来源的运营年份约 ' + data.yearRange.join('–') + ' 年';
  const history = data.earliestEvidenceAt ? '最早留存材料日期 ' + day(data.earliestEvidenceAt) + '；该日期不是已确认的成立日期，也不证明一直营业。' : '';
  const claim = text(data.claimText) ? '站方自述：' + text(data.claimText) + '。' : '';
  const assessment = (finite(data.yearsSinceStart) || data.yearRange) && data.label ? text(data.label) + '。' : '';
  return { value, note: history + claim + assessment + (!history && !claim && !assessment ? '未取得可核验的营业起点，暂无法判断是否老牌。' : ''), detailsLabel: '历史材料说明', detailText: firstText(data.basis, data.evidenceDateBasis) };
}

function policySummary(core) {
  const refund = core.refund || {}, trial = core.trial || {};
  const refundText = firstText(refund.summary, refund.label, typeof core.refund === 'string' ? core.refund : '');
  const trialText = firstText(trial.summary, trial.label, typeof core.trial === 'string' ? core.trial : '');
  return { value: refundText || '退款规则未知', note: (trialText ? '试用：' + trialText + '。' : '试用规则未知。') + '退款与试用的实际执行未验证。' };
}

function deviceSummary(core) {
  const compatibility = core.compatibility || core.networkAndDevices || {};
  const summary = firstText(compatibility.summary, compatibility.label);
  const requirements = values(compatibility.requirements).map(clean).filter(Boolean);
  const deviceLimits = unique(values(core.pricing?.plans).flatMap(plan => [known(plan.maxDevices) ? '设备数 ' + text(plan.maxDevices) : '', text(plan.deviceLimit)]).filter(Boolean));
  const observations = [...measuredSamples(core.speed), ...measuredSamples(core.stability)];
  const measuredNetworks = unique(observations.map(sample => [sample.region, sample.network].map(text).filter(Boolean).join(' / ')));
  const networkNote = measuredNetworks.length ? '有实测的网络条件：' + measuredNetworks.join('；') + '，不外推至其他网络。' : '你所在网络的可用性未知。';
  return { value: summary || (deviceLimits.length ? '设备限制以套餐为准' : '设备支持范围未知'), note: (deviceLimits.length ? '套餐设备限制：' + deviceLimits.join(' / ') + '。' : '') + (requirements.length ? '使用条件：' + requirements.join('；') + '。' : '') + (text(compatibility.limitation) ? text(compatibility.limitation) + '。' : '') + (summary || requirements.length ? '站方兼容性说明尚未独立实测。' : '') + networkNote };
}

function issueSummary(core) {
  const data = core.stability || {}, events = values(data.recentIssues), recoveries = values(data.recoveryClues);
  const window = [day(data.recentWindow?.start), day(data.recentWindow?.end)].filter(Boolean).join(' 至 ');
  const coverage = (window ? '窗口 ' + window + '。' : '') + (data.searchComplete === true ? '仅覆盖已声明的检索来源。' : '来源覆盖不完整。');
  const recoveryNote = recoveries.length ? '另有 ' + recoveries.length + ' 条恢复或部分可用线索。' : '';
  if (events.length) {
    const first = events[0], summary = text(first.summary);
    const material = summary ? '首条材料（材料日期：' + (day(first.createdAt) || '未知') + '）：' + summary + '。' : '';
    return { value: '近月有 ' + events.length + ' 条问题线索', note: material + coverage + recoveryNote + (events.some(event => event.independentlyVerified !== true) ? '部分或全部陈述尚未独立核实。' : '') + '线索数不等于独立投诉人数或投诉率。' };
  }
  return { value: '近月问题情况未知', note: coverage + recoveryNote + '本批未匹配到问题陈述，不能解释为零投诉。' };
}

function privacySummary(core) {
  const data = core.privacy || {}, summary = firstText(data.summary, data.label);
  const logged = values(data.loggedData).map(clean).filter(Boolean);
  const value = summary || (logged.length ? '站方声明记录使用信息' : '隐私与日志未确认');
  const details = logged.length ? '声明记录：' + logged.join('、') + '。' : '';
  const retention = '保存期限：' + (text(data.retentionPeriod) || '未确认') + '。';
  const observed = day(data.observedAt) ? '说明采集于 ' + day(data.observedAt) + '。' : '';
  return { value, note: details + retention + observed + '独立审计未确认，站方声明不构成无日志保证。' + (!summary && !logged.length ? '未取得可绑定该服务的说明，未知不等于无日志。' : '') };
}

function fieldDefinitions(core) {
  const speed = performanceSummary(core, 'speed'), stability = performanceSummary(core, 'stability');
  return [
    { key: 'price', title: '价格', ...priceSummary(core), sourceIds: [...sourceIdsFrom(core.pricing), ...sourceIdsFrom(core.promotions)] },
    { key: 'speed', title: '速度', ...speed, sourceIds: [...sourceIdsFrom(core.speed?.measured), ...sourceIdsFrom(core.speed?.advertised), ...sourceIdsFrom(core.speed?.externalReports)] },
    { key: 'stability', title: '稳定性', ...stability, sourceIds: values(core.stability?.measured?.observations).flatMap(sample => values(sample.sourceIds)) },
    { key: 'payment', title: '支付方式', ...paymentSummary(core), sourceIds: core.payment?.sourceIds },
    { key: 'history', title: '运营年限 · 是否老牌', ...historySummary(core), sourceIds: core.operatingHistory?.sourceIds },
    { key: 'policy', title: '退款与试用', ...policySummary(core), sourceIds: [...values(core.refund?.sourceIds), ...values(core.trial?.sourceIds)] },
    { key: 'devices', title: '适用网络与设备', ...deviceSummary(core), sourceIds: [...sourceIdsFrom(core.compatibility || core.networkAndDevices), ...values(core.pricing?.plans).flatMap(plan => values(plan.sourceIds)), ...values(core.speed?.measured?.observations).flatMap(sample => values(sample.sourceIds)), ...values(core.stability?.measured?.observations).flatMap(sample => values(sample.sourceIds))] },
    { key: 'issues', title: '近一个月的问题', ...issueSummary(core), sourceIds: [...values(core.stability?.recentIssues), ...values(core.stability?.recoveryClues)].flatMap(event => values(event.sourceIds)) },
    { key: 'privacy', title: '隐私与日志', ...privacySummary(core), sourceIds: sourceIdsFrom(core.privacy) }
  ];
}

function sourceLinks(ids, ui) {
  const references = unique(ids);
  if (!references.length) return null;
  const details = ui.el('details', 'core-sources');
  details.append(ui.el('summary', '', '查看依据 · ' + references.length));
  for (const [index, id] of references.entries()) {
    const a = ui.link('#source-' + encodeURIComponent(id), '来源 ' + (index + 1), 'core-source-link');
    a.addEventListener('click', event => {
      event.preventDefault();
      const target = document.getElementById('source-' + id);
      if (!target) {
        if (!details.querySelector('.core-source-status')) details.append(ui.paragraph('来源暂未载入，请展开下方来源区重新加载。', 'core-source-status'));
        return;
      }
      for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    details.append(a);
  }
  return details;
}

const detailLabels = { summary: '说明', name: '名称', requiredPlan: '需配套餐', amount: '金额', billingPeriod: '计费周期', currency: '币种', currencySymbol: '页面币种符号', perGiB: '每 GiB 附加费', requiredBalance: '所需余额', conditions: '条件', deviceLimit: '设备限制', resetRule: '重置规则', refundPolicy: '退款条件', advertisedSpeedMbps: '宣传带宽（Mbps，未实测）' };
function detailText(value) {
  if (Array.isArray(value)) return value.map(detailText).filter(Boolean).join('；');
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => detailLabels[key]).map(([key, item]) => detailLabels[key] + '：' + detailText(item)).filter(item => !item.endsWith('：')).join('；');
  return text(value);
}

function pricingDetails(core, ui) {
  const plans = values(core.pricing?.plans), promotions = values(core.promotions);
  if (!plans.length && !promotions.length) return null;
  const details = ui.el('details', 'core-item-details core-plan-details');
  details.append(ui.el('summary', '', '全部套餐与优惠条件'));
  if(core.pricing?.limitation) details.append(ui.paragraph(core.pricing.limitation));
  for (const plan of plans) {
    const formatted = formatPlan(plan), box = ui.el('div', 'core-term');
    box.append(ui.el('h4', '', formatted.name || '未命名套餐'), ui.paragraph(formatted.price));
    const notes = ['原计费周期：' + (text(plan.billingPeriod) || '未知'), '配额：' + (text(plan.quota) || '未知'), '重置规则：' + (text(plan.quotaReset) || '未知')];
    if (formatted.unknownCurrency && plan.currencyReason) notes.push('币种说明：' + text(plan.currencyReason));
    if (formatted.soldOut) notes.push('页面标为售罄，不能当作当前可购买');
    if (formatted.addon) notes.push('附加项：' + (detailText(plan.addon) || '需核对基础套餐和前置条件'));
    if (known(plan.maxDevices)) notes.push('页面设备数：' + text(plan.maxDevices));
    if (plan.deviceLimit) notes.push('设备限制：' + text(plan.deviceLimit));
    notes.push(...values(plan.restrictions).map(text));
    if (detailText(plan.additionalCharges)) notes.push('附加费用：' + detailText(plan.additionalCharges));
    if (detailText(plan.terms)) notes.push('其他条款：' + detailText(plan.terms));
    if(plan.displayBasis) notes.push('页面口径：' + text(plan.displayBasis));
    notes.push('页面标价；实际下单总额、扣款与到账未验证。');
    for (const note of notes) box.append(ui.paragraph(note));
    details.append(box);
  }
  for (const promotion of promotions) {
    const box = ui.el('div', 'core-term core-promotion');
    box.append(ui.el('h4', '', '优惠材料：' + (text(promotion.label) || text(promotion.code) || '公开优惠说明')));
    if (promotion.code) box.append(ui.paragraph('页面优惠码：' + text(promotion.code)));
    box.append(ui.paragraph('适用套餐：' + (text(promotion.applicablePlan) || '未确认')), ui.paragraph('使用条件：' + (values(promotion.conditions).map(text).filter(Boolean).join('；') || '未确认')),
      ui.paragraph('结束时间：' + (day(promotion.expiresAt) || '未确认') + (promotion.status === 'expired_stated_offer' ? '（按资料时点已过期）' : '')),
      ui.paragraph('返佣或邀请关联：' + (promotion.affiliateBinding === true || promotion.affiliateBinding === 'referral_program_observed' ? '存在关联；邀请奖励不等于买方折扣' : promotion.affiliateBinding === false ? '材料注明无关联' : '未确认')),
      ui.paragraph('是否当前可用、最终折扣与结算总额均未验证，不直接从标价中扣减。'));
    details.append(box);
  }
  return details;
}

function policyDetails(core, ui) {
  const policies = [['退款', core.refund], ['试用', core.trial]].filter(([, policy]) => values(policy?.conditions).length);
  if (!policies.length) return null;
  const details = ui.el('details', 'core-item-details'); details.append(ui.el('summary', '', '查看退款与试用条件'));
  for (const [label, policy] of policies) for (const condition of policy.conditions) details.append(ui.paragraph(label + '：' + text(condition)));
  return details;
}

function measurementDetails(core, kind, ui) {
  const observations = measuredSamples(core[kind]);
  if (!observations.length) return null;
  const details = ui.el('details', 'core-item-details'); details.append(ui.el('summary', '', '测量条件与全部样本组'));
  const time = value => value && ui.date ? ui.date(value, true) : day(value) || '未知';
  for (const [index, sample] of observations.entries()) {
    const box = ui.el('div', 'core-term');
    box.append(ui.el('h4', '', '第 ' + (index + 1) + ' 组：' + measurementMetrics(sample, kind).join('；')),
      ui.paragraph('地区：' + (text(sample.region) || '未知') + '；网络：' + (text(sample.network) || '未知') + '；套餐：' + (text(sample.plan) || '未知')),
      ui.paragraph('时间：' + (kind === 'speed' ? time(sample.testedAt) : [time(sample.windowStart), time(sample.windowEnd)].join(' 至 '))),
      ui.paragraph('样本数：' + (Number.isSafeInteger(sample.sampleCount) ? sample.sampleCount : '未知') + '；方法：' + (text(sample.methodology) || '未知')));
    const quantiles = ['p10', 'p50', 'p90', 'p95'].filter(key => finite(sample.downloadMbpsQuantiles?.[key])).map(key => key.toUpperCase() + ' ' + sample.downloadMbpsQuantiles[key] + ' Mbps');
    if (quantiles.length) box.append(ui.paragraph('下载分位数：' + quantiles.join('；')));
    if (sample.provider) box.append(ui.paragraph('测量提供方：' + text(sample.provider)));
    if (sample.peakHours) box.append(ui.paragraph('时段条件：' + text(sample.peakHours)));
    details.append(box);
  }
  return details;
}

function speedMaterialDetails(core, ui) {
  const data = core.speed || {}, advertised = values(data.advertised), reports = values(data.externalReports);
  if (!advertised.length && !reports.length) return null;
  const details = ui.el('details', 'core-item-details'); details.append(ui.el('summary', '', '官网宣传与原始评测条件'));
  const time = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : value && ui.date ? ui.date(value, true) : day(value) || '未说明';
  for (const claim of advertised) {
    const summary = advertisedSpeedText(claim); if (!summary) continue;
    const box = ui.el('div', 'core-term');
    box.append(ui.el('h4', '', '站方宣传 · 非本站实测'), ui.paragraph(summary));
    if (claim.plan) box.append(ui.paragraph('涉及套餐：' + text(claim.plan)));
    box.append(ui.paragraph('宣传采集时间：' + time(claim.observedAt)), ui.paragraph('站方宣传不作为实际吞吐、稳定性或适用于你所在网络的保证。'));
    details.append(box);
  }
  for (const report of reports) {
    const box = ui.el('div', 'core-term core-external-report');
    box.append(ui.el('h4', '', '原始评测：' + (text(report.publisher) || '发布者未说明')));
    if (report.summary) box.append(ui.paragraph(text(report.summary)));
    const metrics = reportedMetrics(report); for (const metric of metrics) box.append(ui.paragraph(metric));
    if (!metrics.length) box.append(ui.paragraph('报告中未提取到可展示的具体数值。'));
    box.append(ui.paragraph('报告测试时间：' + time(report.testedAt)), ui.paragraph('报告发布时间：' + time(report.publishedAt)), ui.paragraph('本站采集时间：' + time(report.observedAt)),
      ui.paragraph('地区：' + (text(report.region) || '未说明') + '；网络：' + (text(report.network) || '未说明')),
      ui.paragraph('测量时段：' + (text(report.timeWindow) || '未说明')),
      ui.paragraph('报告节点数：' + (Number.isSafeInteger(report.nodeCount) ? report.nodeCount : '未说明') + '；节点数不等于测量样本数。'),
      ui.paragraph('测量样本数：' + (Number.isSafeInteger(report.sampleCount) ? report.sampleCount : '未说明')),
      ui.paragraph('报告方法：' + (text(report.methodology) || '未说明')),
      ui.paragraph('商业关系：' + (report.affiliateBinding === true ? '报告存在返佣或推广关联' : report.affiliateBinding === false ? '报告声明无关联，尚未独立核实' : text(report.affiliateBinding) || '未确认')));
    for (const limitation of values(report.limitations).map(text).filter(Boolean)) box.append(ui.paragraph('报告限制：' + limitation));
    box.append(ui.paragraph('这是第三方报告，未经本站独立复核。报告反映其自身日期和条件，不保证当前或其他用户的实际速度。'));
    details.append(box);
  }
  return details;
}

function identityWarning(record) {
  const website = record.coreInfo?.website || {};
  if (!record.identityConflict && !/conflict/.test(website.status || '')) return '';
  return '品牌名与归属待核。' + (website.status === 'brand_name_conflict' ? text(website.basis) : '') + '价格仅为候选入口的页面观察。' + (website.status === 'brand_name_conflict' ? '名称关系未确认，不能据此认定更名。' : '');
}

export function createCoreCard(record, ui) {
  const { el, link, paragraph } = ui;
  const core = record.coreInfo || {}, price = priceSummary(core), payment = paymentSummary(core), history = historySummary(core), issues = issueSummary(core), speed = performanceSummary(core, 'speed'), stability = performanceSummary(core, 'stability');
  const card = el('article', 'resource-card core-card');
  const top = el('div', 'resource-top'); const name = el('div'); const h = el('h3');
  h.append(link('#/airport/' + record.id, record.name)); name.append(h); top.append(name, el('span', 'category-tag', categories[record.category] || '其他资料'));
  card.append(top);
  const identity = identityWarning(record); if (identity) card.append(paragraph(identity, 'core-card-identity'));
  const priceRow = el('div', 'core-card-price'); priceRow.append(el('strong', '', price.value), paragraph(price.note)); card.append(priceRow);
  const facts = el('dl', 'core-card-facts');
  for (const [label, value] of [['速度', speed.value], ['稳定性', stability.value], ['支付', payment.cardValue], ['运营年限', history.value]]) { const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); facts.append(row); }
  card.append(facts, paragraph(issues.value, 'core-card-issues'));
  const footer = el('div', 'card-footer'); footer.append(el('span', '', '资料有边界，付费前核对'), link('#/airport/' + record.id, '查看核心信息 ↗')); card.append(footer);
  return card;
}

export function createCoreDetail(record, ui) {
  const { el, paragraph } = ui;
  const core = record.coreInfo || {};
  const section = el('section', 'core-detail'); section.setAttribute('aria-label', '付费前核心信息');
  const heading = el('div', 'core-detail-heading'); heading.append(el('h2', '', '付费前，先核对这九项'));
  const asOf = firstText(core.asOf, core.lastChecked);
  heading.append(paragraph(asOf && ui.date ? '资料整理于 ' + ui.date(asOf) : '材料中的已知与未知')); section.append(heading);
  section.append(paragraph('本条资料最近核对：' + (core.lastChecked && ui.date ? ui.date(core.lastChecked, true) : '时间未知') + '。各项采集时间见来源；资料时点不等于今天再次验证。', 'core-detail-note'));
  const identity = identityWarning(record); if (identity) section.append(paragraph(identity, 'core-identity-note'));
  const grid = el('div', 'core-facts');
  for (const field of fieldDefinitions(core)) {
    const item = el('article', 'core-fact core-fact-' + field.key); item.dataset.coreField = field.key;
    item.append(el('h3', '', field.title), el('p', 'core-value', field.value), paragraph(field.note, 'core-note'));
    const terms = field.key === 'price' ? pricingDetails(core, ui) : field.key === 'policy' ? policyDetails(core, ui) : ['speed', 'stability'].includes(field.key) ? measurementDetails(core, field.key, ui) : null;
    if (terms) item.append(terms);
    const speedMaterials = field.key === 'speed' ? speedMaterialDetails(core, ui) : null; if (speedMaterials) item.append(speedMaterials);
    if (field.detailText) { const details = el('details', 'core-item-details'); details.append(el('summary', '', field.detailsLabel || '查看说明'), paragraph(field.detailText)); item.append(details); }
    const ref = sourceLinks(field.sourceIds, ui); if (ref) item.append(ref);
    grid.append(item);
  }
  section.append(grid, paragraph('公开标价、支付说明和商家宣传均有各自边界。下面可展开条款、出处和历史材料。', 'core-detail-note'));
  return section;
}
