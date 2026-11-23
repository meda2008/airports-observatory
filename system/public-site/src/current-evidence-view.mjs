const pending = name => '【待补：' + name + '】';
const has = value => value !== null && value !== undefined && value !== '';
const periodLabels = { month: '月', monthly: '月付', year: '年', yearly: '年付', quarter: '季度', once: '一次性' };
const basisLabels = { retained_public_page: '公开页面标价', server_html_period_option: '公开页面的周期选项', visible_html: '公开页面可见文字', code_config_not_checkout: '公开落地页配置，非商店结算', public_page: '公开页面', public_advertised_price_observed: '公开页面标价' };
const collectionLabels = {
  public_response_needs_content_review: '取得公开响应；内容按下列证据逐项呈现',
  http_error: '公开请求受限或返回错误',
  request_failed_not_service_status: '本次批量请求失败；补采材料另列',
  javascript_shell_not_rendered: '只取得脚本外壳或路由页',
  challenge_or_access_control: '公开页要求访问验证，本次未绕过',
  login_or_limited_public_content: '只取得登录页或有限公开内容',
  missing_candidate_url: '缺少可核对的候选网址',
  login_required: '公开页面要求登录',
  not_attempted: '尚未采集'
};
const paymentTypes = {
  public_page_logos_only: '仅见支付标识图片',
  public_help_reference_not_checkout_verified: '仅见帮助页中的充值说明',
  public_statement_not_transaction_verified: '站方公开支付声明，交易未验证'
};
const termLabels = { deviceLimit: '设备限制', resetRule: '配额重置', refundPolicy: '退款条款', promotion: '优惠说明', advertisedSpeedMbps: '页面宣传带宽（Mbps，未实测）', maxDevices: '页面设备限制', total: '页面金额', dependency: '依赖条件', requires: '前置条件', label: '说明', expiresAt: '结束时间', affiliateBinding: '返佣关联', status: '说明', listPrice: '页面原价', perGiB: '每GiB附加费', requiredBalance: '页面所需余额', currencySymbol: '页面币种符号' };

function readable(value) {
  if (!has(value)) return null;
  if (typeof value === 'string' || typeof value === 'number') return value === 'displayed_term_discount_not_checkout_verified' ? '页面显示的周期折扣，结算未验证' : String(value);
  if (typeof value === 'boolean') return value ? '页面标示为是' : '页面标示为否';
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join('；') || null;
  if (typeof value === 'object') return Object.entries(value).filter(([key, item]) => !['speedStatus', 'sourceIds'].includes(key) && has(item)).map(([key, item]) => (termLabels[key] || key) + '：' + readable(item)).filter(text => !text.endsWith('：null')).join('；') || null;
  return null;
}

function utc(value, dayOnly = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return pending('原帖创建时间');
  return new Date(value).toISOString().slice(0, dayOnly ? 10 : 19).replace('T', ' ') + (dayOnly ? '' : ' UTC');
}

export function createCurrentEvidenceSections(record, ui) {
  const { el, paragraph, section, link, date } = ui;
  const root = el('div', 'current-evidence');
  const data = record.currentEvidence;
  if (!data) { root.append(section('本轮套餐、支付与社区核对', pending('这条记录的本轮原始材料与整理结果'))); return root; }

  function refs(ids, label = '原始依据') {
    const row = el('div', 'current-source-links');
    const unique = [...new Set(Array.isArray(ids) ? ids : [])];
    row.append(el('span', '', label + '：'));
    if (!unique.length) { row.append(el('span', 'current-pending', pending('可追溯来源'))); return row; }
    for (const id of unique) {
      const a = link('#source-' + encodeURIComponent(id), id);
      a.addEventListener('click', event => {
        const target = document.getElementById('source-' + id);
        if (target) { event.preventDefault(); target.scrollIntoView({ block: 'start', behavior: 'auto' }); }
      });
      row.append(a);
    }
    return row;
  }
  const time = value => has(value) ? date(value, true) : pending('采集时刻');
  const overview = el('div');
  overview.append(paragraph('页面请求完成时点：' + time(data.collection?.checkedAt) + '；本条整理时点：' + time(data.checkedAt) + '。'), paragraph('采集状态：' + (collectionLabels[data.collection?.status] || '以本节保留的公开响应和缺口为准') + '。'));
  overview.append(paragraph('本节时间除另注UTC外均为北京时间。整理不刷新原始材料的采集时间；一次请求失败或登录门槛不表示停服。', 'quiet-note'));
  const identity = data.identityBinding || {};
  const conflict = /conflict/.test(identity.status || '');
  const identityBox = el('div', conflict ? 'current-identity current-important' : 'current-identity');
  identityBox.append(el('h3', '', conflict ? '候选网址与品牌关系存在待核冲突' : '候选网址与经营主体关系'), paragraph(identity.basis || pending('官网与经营主体的原始归属证据')), refs(identity.sourceIds));
  identityBox.append(paragraph('页面自称、域名跳转和同品牌文字均不等于独立确认经营主体。', 'current-small'));
  overview.append(identityBox);
  if (Array.isArray(data.missing) && data.missing.length) {
    const gaps = el('ul', 'current-gap-list');
    for (const gap of data.missing) gaps.append(el('li', '', /^【待补：/.test(gap) ? gap : pending(gap)));
    overview.append(gaps);
  }
  root.append(section('本轮公开材料核对', overview, 'current-refresh-overview'));

  const offers = data.offers || {}, plans = Array.isArray(offers.plans) ? offers.plans : [];
  const pricing = el('div');
  pricing.append(paragraph('套餐材料采集：' + time(offers.observedAt) + '。金额和周期按原文保留，不换算月均，不合并币种。以下为公开标价，未验证当前可下单、库存、税费或最终应付总额。', 'quiet-note'));
  if (!plans.length) pricing.append(paragraph(pending('可绑定该服务的当前公开套餐、币种、计费周期和最终账单')), paragraph(offers.limitation || '未取得可核验套餐，不等于该服务没有套餐。'));
  else {
    const wrap = el('div', 'table-wrap current-price-table'); const table = el('table'); const thead = el('thead'); const tr = el('tr');
    for (const name of ['套餐与公开金额', '原计费周期 / 配额', '条件与限制', '材料与出处']) tr.append(el('th', '', name));
    thead.append(tr); const tbody = el('tbody');
    for (const plan of plans) {
      const row = el('tr');
      const price = el('td'); price.append(el('strong', '', plan.name || pending('套餐名称')));
      const amount = typeof plan.amount === 'number' && Number.isFinite(plan.amount) ? String(plan.amount) : pending('原始金额');
      price.append(paragraph((plan.currency || plan.currencySymbol || '') + (plan.currency || plan.currencySymbol ? ' ' : '') + amount, 'current-price'));
      if (!plan.currency || plan.currencyStatus === 'not_confirmed') price.append(paragraph(pending('ISO币种；页面仅见' + (plan.currencySymbol || '金额符号') + '，不能自动按人民币结算'), 'current-pending'));
      if (plan.currencyReason) price.append(paragraph(plan.currencyReason, 'current-small'));
      price.append(paragraph('公开标价 · 结算未验证', 'current-small'));
      const period = el('td'); period.append(el('strong', '', periodLabels[plan.billingPeriod] || plan.billingPeriod || pending('付款周期')), paragraph(readable(plan.quota) || pending('配额及覆盖周期')));
      period.append(paragraph('重置规则：' + (readable(plan.quotaReset) || pending('配额重置规则')), 'current-small'));
      const terms = el('td');
      const restriction = readable(plan.restrictions);
      if (restriction) terms.append(paragraph(restriction, 'current-important'));
      if (has(plan.addon)) terms.append(paragraph(plan.addon === true ? '页面标为附加服务；前置依赖见本行限制。' : '附加服务 / 前置依赖：' + readable(plan.addon), 'current-important'));
      if (has(plan.maxDevices)) terms.append(paragraph('页面设备数：' + readable(plan.maxDevices), 'current-small'));
      const originalTerms = readable(plan.terms);
      if (originalTerms) terms.append(paragraph(originalTerms));
      if (!restriction && !originalTerms && !has(plan.addon)) terms.append(paragraph(pending('完整限制、自动续费和退款条件'), 'current-pending'));
      if (has(plan.discount)) terms.append(paragraph('折扣材料：' + readable(plan.discount), 'current-small'), paragraph('折扣到期：' + (plan.discount.expiresAt ? time(plan.discount.expiresAt) : pending('折扣到期日')) + '；返佣绑定：' + (readable(plan.discount.affiliateBinding) || pending('是否绑定返佣')), 'current-small'));
      if (has(plan.additionalCharges)) terms.append(paragraph('附加费用：' + readable(plan.additionalCharges), 'current-important'), refs(plan.additionalCharges.sourceIds, '费用依据'));
      const provenance = el('td'); provenance.append(paragraph(basisLabels[plan.displayBasis] || plan.displayBasis || basisLabels[plan.materialType] || '公开材料标价'), paragraph('采集：' + time(plan.observedAt), 'current-small'));
      if (plan.quote) provenance.append(el('code', 'current-quote', plan.quote));
      if (plan.locator) provenance.append(paragraph('页内定位：' + plan.locator, 'current-small'));
      provenance.append(refs(plan.sourceIds));
      row.append(price, period, terms, provenance); tbody.append(row);
    }
    table.append(thead, tbody); wrap.append(table); pricing.append(wrap);
    pricing.append(paragraph('带宽、解锁、设备数和可用性文案均为站方声明，不能作为测速、稳定性或适用于你所在网络的实测结果。', 'quiet-note'));
  }
  for (const observation of offers.observations || []) { const box = el('div', 'current-observation'); box.append(paragraph(observation.fact || pending('观察内容')), refs(observation.sourceIds)); pricing.append(box); }
  for (const promotion of offers.promotions || []) { const box = el('div', 'current-observation'); box.append(el('h3', '', '优惠与邀请奖励材料'), paragraph(readable(promotion.terms) || pending('优惠原始条款')), paragraph('结束时间：' + (promotion.expiresAt ? time(promotion.expiresAt) : pending('优惠到期日'))), paragraph('返佣或邀请绑定：' + (promotion.affiliateBinding === 'referral_program_observed' ? '观察到邀请奖励说明，不当作买方折扣' : readable(promotion.affiliateBinding) || pending('是否绑定返佣'))), refs(promotion.sourceIds)); pricing.append(box); }
  root.append(section('当前公开套餐与价格', pricing));

  const payment = data.payment || {}, paymentBody = el('div');
  const type = payment.statementType || 'not_confirmed';
  paymentBody.append(el('h3', '', paymentTypes[type] || '支付渠道尚未确认'));
  if (type === 'public_page_logos_only') paymentBody.append(paragraph('这些名称来自图标或图片标题，证据强度止于“页面展示了标识”；不表示当前可收款。', 'current-important'));
  if (type === 'public_help_reference_not_checkout_verified') paymentBody.append(paragraph('这些名称或网络来自帮助材料中的充值处理说明，尚未取得收银台。不能把提及某网络解释成该网络当前支持。', 'current-important'));
  if (type === 'public_statement_not_transaction_verified') paymentBody.append(paragraph('以下仅为站方公开文字说明，未验证交易、到账或退款。', 'quiet-note'));
  paymentBody.append(paragraph('页面标识或说明中提及：' + ((payment.methods || []).length ? payment.methods.join('、') : pending('当前可用支付渠道'))));
  if (payment.processorClaim) paymentBody.append(paragraph('页面提及的处理方：' + payment.processorClaim + '（站方声明）'));
  paymentBody.append(paragraph(payment.reason || pending('支付材料的具体范围')), paragraph('材料采集：' + time(payment.observedAt), 'current-small'));
  if (payment.quote) paymentBody.append(el('code', 'current-quote', payment.quote));
  paymentBody.append(refs(payment.sourceIds), paragraph('没有创建订单、付款或验证退款；支付说明不能替代真实收银台与实际交易。', 'quiet-note'));
  if (data.refund) { const refund = data.refund; paymentBody.append(el('h3', '', '公开退款条款'), paragraph(refund.summary || pending('退款条件原文')), paragraph('条款采集：' + time(refund.observedAt), 'current-small'), refs(refund.sourceIds), paragraph('仅观察到条款，不证明退款可以执行。', 'current-small')); }
  root.append(section('当前支付说明与退款边界', paymentBody));

  const community = data.community || {}, coverage = community.coverage || {}, communityBody = el('div');
  communityBody.append(paragraph('最近30天采集窗口：' + utc(community.windowStart) + ' 至 ' + utc(community.windowEnd) + '。'), paragraph('匹配整理完成：' + time(community.checkedAt) + '（北京时间）；这不是原帖的发布时间。', 'current-small'));
  const counts = el('dl', 'current-counts');
  for (const [name, value] of [['未核实问题线索主题组', community.unverifiedComplaintClueGroups], ['恢复或部分可用线索主题组', community.recoveryOrPartialUseClueGroups], ['已匹配陈述', community.matchedStatementCount]]) { const item = el('div'); item.append(el('dt', '', name), el('dd', '', has(value) ? value : pending(name))); counts.append(item); }
  communityBody.append(counts, paragraph('同一主题中的多条留言不等于多个独立投诉者。名称相似、域名相等或同一主题上下文，都不自动确认同一经营主体；用户陈述未获独立真实性裁决。', 'quiet-note'));
  communityBody.append(paragraph('覆盖：一个公开GitHub仓库与已留存的有限V2EX页面；并未覆盖全网。' + (coverage.githubPaginationComplete === true ? '该GitHub采集分页完成。' : 'GitHub分页完整性尚待核查。') + (coverage.v2exPaginationComplete === true ? '该批V2EX采集分页完成。' : 'V2EX覆盖不完整。') + (coverage.v2exRepeatedNodePageDetected === true ? '已发现重复返回的V2EX节点页，不能按翻页次数扩大覆盖。' : ''), 'current-important'));
  const events = Array.isArray(community.events) ? community.events : [];
  if (!events.length) communityBody.append(paragraph('本次已采集范围未匹配到这条记录的陈述。不能据此写成“最近一个月零投诉”。', 'current-pending'));
  else {
    const kinds = { complaint_claim: '问题线索 · 尚未核实', recovery_claim: '恢复或部分可用线索 · 尚未核实', discussion: '其他讨论陈述' };
    const matchTypes = { domain_exact: '文本中精确匹配域名', name_only: '仅名称匹配', name_or_domain: '名称或域名线索', context_only: '仅主题上下文关联' };
    const eventNode = event => {
      const box = el('article', 'current-event');
      box.append(el('h3', '', kinds[event.kind] || '待核陈述'), paragraph(event.summary || '存在需要回到原帖核对的公开陈述。'), paragraph('创建：' + utc(event.createdAt) + (event.editedAt ? '；编辑：' + utc(event.editedAt) : ''), 'current-small'));
      box.append(paragraph(event.relation === 'same_thread_context_only' ? '仅按同主题上下文关联：该条没有直接匹配名称或域名。' : (matchTypes[event.matchType] || '匹配类型待核') + '；仍不证明经营主体相同。', event.relation === 'same_thread_context_only' ? 'current-important' : 'current-small'));
      box.append(paragraph('引用主题组：' + (event.sourceGroup || pending('原帖引用关系')), 'current-small'));
      if (event.url) box.append(link(event.url, '查看原始讨论 ↗', 'text-link'));
      box.append(refs(event.sourceId ? [event.sourceId] : [])); return box;
    };
    for (const event of events.slice(0, 20)) communityBody.append(eventNode(event));
    if (events.length > 20) { const more = el('details', 'disclosure'); more.append(el('summary', '', '展开其余 ' + (events.length - 20) + ' 条已采集陈述')); for (const event of events.slice(20)) more.append(eventNode(event)); communityBody.append(more); }
  }
  const activity = community.activityCreatedDistribution || {}, complaints = community.complaintClueCreatedDistribution || {}, recovery = community.recoveryClueCreatedDistribution || {};
  const days = [...new Set([...Object.keys(activity), ...Object.keys(complaints), ...Object.keys(recovery)])].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  if (days.length) {
    communityBody.append(el('h3', '', '已匹配陈述的创建日期分布（UTC）'));
    const wrap = el('div', 'table-wrap'); const table = el('table'); const thead = el('thead'), tr = el('tr');
    for (const heading of ['UTC日期', '匹配陈述', '问题线索陈述', '恢复线索陈述']) tr.append(el('th', '', heading)); thead.append(tr); const tbody = el('tbody');
    for (const day of days) { const row = el('tr'); row.append(el('td', '', day)); for (const distribution of [activity, complaints, recovery]) row.append(el('td', '', typeof distribution[day] === 'number' ? distribution[day] : 0)); tbody.append(row); }
    table.append(thead, tbody); wrap.append(table); communityBody.append(wrap, paragraph('表内条数只描述本批已匹配原帖和评论，未去作独立投诉人数或投诉率；未显示日期不表示全网没有投诉。', 'current-small'));
  } else communityBody.append(paragraph(pending('本次采集范围内可匹配陈述的创建日期分布'), 'current-small'));
  communityBody.append(paragraph(community.limitation || '覆盖与身份关联尚有限，不能用没有匹配到资料证明服务安全。', 'quiet-note'), refs(community.sourceIds, '采集范围与分页依据'));
  root.append(section('最近30天投诉线索与恢复陈述', communityBody));
  return root;
}
