'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const list = (v) => (Array.isArray(v) ? v : []);
const show = (v) => (v == null || v === '' ? '暂无数据' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function dateText(v) {
  return v ? String(v).replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '未知';
}

function shortDate(v) {
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : '';
}

async function api(url) {
  const r = await fetch(url, {cache: 'no-store', headers: {Accept: 'application/json'}});
  let d = null;
  if (typeof r.text === 'function') {
    const text = await r.text();
    if (text) {
      try {
        d = JSON.parse(text);
      } catch {
        if (r.status === 413) throw Error('请求内容过大，已被服务器拒绝（413）');
        if (r.status >= 500) throw Error(`服务暂时不可用（HTTP ${r.status}），请稍后重试`);
        throw Error(`服务器返回了非预期格式响应（HTTP ${r.status}）`);
      }
    }
  } else if (typeof r.json === 'function') {
    try {
      d = await r.json();
    } catch {
      throw Error(`服务器返回了非预期格式响应（HTTP ${r.status}）`);
    }
  }
  if (!r.ok) throw Error(d?.error || `加载失败（HTTP ${r.status}），请稍后重试`);
  if (!d || typeof d !== 'object') throw Error('服务器返回了空数据');
  return d;
}

function safeUrl(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function outLink(url, label, sponsored) {
  const a = el('a', label);
  const valid = safeUrl(url);
  if (!valid) return el('span', '暂无入口', 'muted button-disabled');
  a.href = valid;
  a.target = '_blank';
  a.rel = sponsored ? 'sponsored noopener noreferrer' : 'noopener noreferrer';
  return a;
}

function priceText(p) {
  if (!p || !Number.isFinite(p.amount)) return '暂无报价';
  const symbol = {CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', TWD: 'NT$'}[p.currency] || p.currencySymbol || '';
  return (
    symbol +
    String(p.amount) +
    (symbol ? '' : ' ' + (p.currency || '')) +
    (p.amountBasis === 'advertised_starting_price_not_period_total' ? ' 起' : '')
  );
}

function preferredPricing(item) {
  const p = item?.presentation;
  return p?.kind === 'priced_related_record_preferred' && /^A\d{3}$/.test(p.preferredRecordId) && p.relationshipVerified === false
    ? p
    : null;
}

function relatedPriceNotice(p) {
  const box = el('section', null, 'related-price-notice');
  box.append(el('h2', '同名新站已有套餐'), el('p', p.message || ''));
  const a = el('a', '查看 ' + p.preferredRecordId + ' 已有套餐 →', 'button');
  a.href = '#/airport/' + p.preferredRecordId;
  box.append(a);
  return box;
}

function currencyText(p) {
  return p?.currency
    ? {
        CNY: '人民币 CNY',
        USD: '美元 USD',
        EUR: '欧元 EUR',
        GBP: '英镑 GBP',
        JPY: '日元 JPY',
        HKD: '港币 HKD',
        TWD: '新台币 TWD'
      }[p.currency] || p.currency
    : '';
}

function planText(p) {
  return !p || !Number.isFinite(p.amount)
    ? '暂无报价'
    : priceText(p) + (currencyText(p) ? ' ' + currencyText(p) : '') + ' / ' + (p.billingPeriod || '周期待确认');
}

function appendLink(container, item) {
  const link = item?.link || {};
  const box = el('div', null, 'card-actions');
  const preferred = preferredPricing(item);
  const detail = el('a', preferred ? '查看 ' + preferred.preferredRecordId + ' 已有套餐' : '查看套餐', 'button button-secondary');
  detail.href = '#/airport/' + encodeURIComponent(preferred?.preferredRecordId || item?.id || '');
  box.append(detail);
  const entry = outLink(link.url, '访问网站', link.type === 'verified_user_referral');
  if (entry.tagName === 'A') entry.className = 'button';
  box.append(entry);
  container.append(box);
  if (link.type === 'verified_user_referral') {
    container.append(el('small', '推荐链接', 'affiliate-note'));
  }
}

function metric(label, value) {
  const n = el('div', null, 'metric');
  const isMuted = !value || /暂无/.test(value);
  n.append(el('span', label), el('strong', value || '暂无数据', isMuted ? 'muted' : ''));
  return n;
}

function networkText(value) {
  const parts = [
    ...new Set(
      String(value || '')
        .replace(/（(?:截图[^）]*|第三方自述|发布者自述|图注)）/g, '')
        .split(/[；;·]/)
        .map((v) => v.trim())
        .filter(Boolean)
    )
  ];
  return parts.filter((p) => !parts.some((q) => q !== p && p.length <= 4 && q.startsWith(p))).join(' · ');
}

function overview(item) {
  const s = item?.summary || {};
  const n = el('div', null, 'metrics');
  for (const [k, label] of [
    ['speed', '速度'],
    ['stability', '稳定性'],
    ['operatingAge', s.operatingAgeLabel || '运营年限']
  ]) {
    const m = metric(label, s[k]);
    if (k === 'speed' && s.speedContext) {
      const ctxText = [s.speedContext.dateLabel || shortDate(s.speedContext.testedAt), networkText(s.speedContext.network)]
        .filter(Boolean)
        .join(' · ');
      if (ctxText) m.append(el('small', ctxText, 'metric-context'));
    }
    n.append(m);
  }
  return n;
}

function performanceNotes(s = {}) {
  const n = el('div', null, 'performance-notes');
  const safeS = s && typeof s === 'object' ? s : {};
  if (safeS.speedContext) {
    const c = safeS.speedContext;
    const text = [c.dateLabel || shortDate(c.testedAt), networkText(c.network), c.description].filter(Boolean).join(' · ');
    if (text) n.append(el('p', text));
  }
  if (safeS.historicalSpeedContext?.description) {
    n.append(el('p', '此前第三方材料：' + safeS.historicalSpeedContext.description));
  }
  if (safeS.historicalStabilityContext?.description) {
    n.append(el('p', '此前服务资料：' + safeS.historicalStabilityContext.description));
  }
  if (
    safeS.historicalVideoContext &&
    !['historical_youtube_player_snapshot', 'historical_streaming_playback_snapshot'].includes(safeS.speedContext?.kind)
  ) {
    const c = safeS.historicalVideoContext;
    const text = [shortDate(c.testedAt), c.description].filter(Boolean).join(' · ');
    if (text) n.append(el('p', text));
  }
  for (const c of [safeS.publisherPerformanceContext, safeS.reportedNodeRangeContext].filter(Boolean)) {
    if (safeS.speedContext?.kind !== c.kind) {
      const text = [c.dateLabel, c.description].filter(Boolean).join(' · ');
      if (text) n.append(el('p', text));
    }
  }
  if (safeS.speedContext?.regionalValues?.length) {
    const detail = el('details', null, 'historical-speeds');
    detail.append(el('summary', '历史地区测速（发布者均值）'));
    const table = el('table', null, 'plan-table');
    const head = el('tr');
    head.append(el('th', '地区'), el('th', '历史平均下载'));
    table.append(head);
    for (const v of safeS.speedContext.regionalValues) {
      const row = el('tr');
      row.append(el('td', v?.name || '未知'), el('td', (v?.valueMbps ?? '—') + ' Mbps'));
      table.append(row);
    }
    detail.append(table);
    n.append(detail);
  }
  if (safeS.latencyContext?.rows?.length) {
    const c = safeS.latencyContext;
    if (safeS.speedContext?.kind !== 'latency_reference') {
      const text = [c.dateLabel, c.description].filter(Boolean).join(' · ');
      if (text) n.append(el('p', text));
    }
    const detail = el('details', null, 'historical-latency');
    detail.append(el('summary', '历史HTTPS延迟（地区典型p50）'));
    const table = el('table', null, 'plan-table');
    const head = el('tr');
    for (const label of ['网络', '地区', 'Cloudflare', 'Google', '合格/候选节点']) head.append(el('th', label));
    table.append(head);
    for (const v of c.rows) {
      const row = el('tr');
      for (const text of [
        v?.network || '—',
        v?.region || '—',
        (v?.cloudflareTypicalMs ?? '—') + ' ms',
        (v?.googleTypicalMs ?? '—') + ' ms',
        (v?.qualifiedNodes ?? '—') + '/' + (v?.candidateNodes ?? '—')
      ]) {
        row.append(el('td', text));
      }
      table.append(row);
    }
    detail.append(table);
    n.append(detail);
  }
  if (safeS.supplementaryImageContext) {
    const c = safeS.supplementaryImageContext;
    if (c.description) n.append(el('p', c.description));
    for (const r of list(c.reports)) {
      const text = [r?.testedAt, r?.reportedLocalTime, r?.publisherNetworkLabel].filter(Boolean).join(' · ');
      if (text) n.append(el('p', text));
    }
  }
  if (safeS.stabilityContext) {
    const c = safeS.stabilityContext;
    const prefix = shortDate(c.lastIssueAt) ? '历史事件时间 ' + shortDate(c.lastIssueAt) + ' · ' : '';
    if (prefix || c.description) n.append(el('p', prefix + (c.description || '')));
    for (const line of list(c.signalSummaries)) n.append(el('p', line));
  }
  if (safeS.historicalStatusContext?.round24ScopedStatus === true && safeS.stabilityContext?.kind !== safeS.historicalStatusContext.kind) {
    const c = safeS.historicalStatusContext;
    if (c.description) n.append(el('p', c.description));
    for (const line of list(c.signalSummaries)) n.append(el('p', line));
  }
  if (safeS.operatorHistoricalContext) {
    const c = safeS.operatorHistoricalContext;
    if (c.description) n.append(el('p', c.description));
    for (const line of list(c.signalSummaries)) n.append(el('p', line));
  }
  if (safeS.candidateIssueContext) {
    const c = safeS.candidateIssueContext;
    const dateLabel =
      typeof c.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(c.createdAt) ? c.createdAt.slice(0, 10) : '日期未注明';
    const metaParts = ['候选服务历史资料', c.candidateServiceName || null, '记录日期 ' + dateLabel].filter(Boolean);
    n.append(el('p', metaParts.join(' · ')));
    if (c.description) n.append(el('p', c.description));
    for (const line of list(c.signalSummaries)) n.append(el('p', line));
  }
  if (safeS.linkedChannelContext) {
    if (safeS.linkedChannelContext.description) n.append(el('p', safeS.linkedChannelContext.description));
    for (const line of list(safeS.linkedChannelContext.signalSummaries)) n.append(el('p', line));
  }
  if (safeS.operatingContext?.description) n.append(el('p', safeS.operatingContext.description));
  return n;
}

function catalogCard(item) {
  const s = item?.summary || {};
  const preferred = preferredPricing(item);
  const card = el('article', null, 'service-card');

  const topRow = el('div', null, 'card-header');
  const title = el('a', item?.name || '未命名机场', 'card-title');
  title.href = '#/airport/' + encodeURIComponent(item?.id || '');
  const badge = el('span', item?.id || '', 'record-badge');
  topRow.append(title, badge);
  card.append(topRow);

  const priceBlock = el('div', null, 'price-block');
  const price = el('p', null, 'price-preview');
  price.append(
    el('strong', preferred ? preferred.headline : priceText(s.price)),
    el('span', s.price && !preferred ? ' / ' + (s.price.billingPeriod || '周期待确认') : '')
  );
  priceBlock.append(price);
  if (s.price?.currency) {
    priceBlock.append(el('small', currencyText(s.price), 'currency-label'));
  }
  priceBlock.append(
    el('p', preferred ? '旧入口记录，归属待核；查看已收录的新站套餐。' : s.price?.quota || '流量暂无数据', 'quota')
  );
  card.append(priceBlock);

  card.append(overview(item));

  const payment = el('div', null, 'card-line');
  payment.append(el('span', '支付方式', 'line-label'), el('p', list(s.paymentMethods).join(' · ') || '暂无数据', 'payment-text'));
  card.append(payment);

  const refund = el('div', null, 'card-line');
  refund.append(el('span', '退款条件', 'line-label'), el('p', s.refund || '暂无数据', 'refund-text'));
  card.append(refund);

  appendLink(card, item);
  return card;
}

let catalogPage = 1;
let catalogPages = 1;
let catalogSequence = 0;
let searchSequence = 0;
let detailSequence = 0;
let observedSnapshot = null;

function updatePaymentChips() {
  const current = ($('#catalog-form [name="payment"]')?.value || '').trim();
  for (const chip of $$('[data-payment]')) {
    const chipVal = chip.getAttribute('data-payment') || '';
    const active = chipVal === current || (chipVal === '微信支付' && current === '微信');
    chip.classList.toggle('chip-active', active);
  }
}

function statsPrimaryTotal(s) {
  if (Number.isFinite(s?.coverage?.pricing?.total)) return s.coverage.pricing.total;
  if (Number.isFinite(s?.counts?.primary)) return s.counts.primary;
  if (Number.isFinite(s?.coverage?.pricing?.materialAvailable)) {
    return s.coverage.pricing.materialAvailable + (Number(s.coverage.pricing.missing) || 0);
  }
  return null;
}

function applySnapshotMeta(data) {
  if (data?.snapshotId && !observedSnapshot) {
    observedSnapshot = data.snapshotId;
  }
  const asOf = shortDate(data?.sourceAsOf);
  if (asOf && $('#snapshot-badge')) {
    $('#snapshot-badge').textContent = `快照 ${asOf}`;
    $('#snapshot-badge').hidden = false;
  }
}

async function loadStats() {
  try {
    const s = await api('/api/stats');
    const primaryTotal = statsPrimaryTotal(s);
    if (Number.isFinite(primaryTotal) && $('#stat-primary')) {
      $('#stat-primary').textContent = `${primaryTotal} 家`;
    }
    applySnapshotMeta(s);
    return s;
  } catch {
    return null;
  }
}

async function loadCatalog() {
  const seq = ++catalogSequence;
  const formData = new FormData($('#catalog-form'));
  const params = new URLSearchParams();
  for (const [k, v] of formData) {
    if (v) params.set(k, v);
  }
  params.set('page', catalogPage);
  params.set('limit', '12');
  updatePaymentChips();

  const isUnfilteredPrimary =
    (params.get('scope') || 'primary') === 'primary' &&
    !params.get('q') &&
    !params.get('payment') &&
    !params.get('price') &&
    !params.get('refund');

  $('#catalog-error').hidden = true;
  $('#catalog-meta').textContent = '正在加载…';
  try {
    const d = await api('/api/catalog?' + params);
    if (seq !== catalogSequence) return;
    catalogPages = Number(d.pages) || 1;
    catalogPage = Number(d.page) || 1;
    $('#catalog-results').replaceChildren(
      ...(list(d.items).length ? d.items.map(catalogCard) : [el('p', '没有找到匹配的机场，试试调整筛选条件。', 'empty-state')])
    );
    if (isUnfilteredPrimary && $('#stat-primary')) {
      const count = Number.isFinite(d.totalRecords) ? d.totalRecords : Number(d.total) || 0;
      $('#stat-primary').textContent = `${count} 家`;
    }
    const asOf = shortDate(d.sourceAsOf);
    $('#catalog-meta').textContent = `${d.total} 个机场` + (asOf ? ` · 数据基准 ${asOf}` : '');
    applySnapshotMeta(d);
    $('#page-label').textContent = `第 ${catalogPage} / ${catalogPages} 页`;
    $('#previous').disabled = catalogPage <= 1;
    $('#next').disabled = catalogPage >= catalogPages;
  } catch (e) {
    if (seq !== catalogSequence) return;
    $('#catalog-error').hidden = false;
    $('#catalog-error').textContent = e.message;
    $('#catalog-meta').textContent = '加载失败';
    $('#catalog-results').replaceChildren();
  }
}

async function search(e) {
  e?.preventDefault();
  const seq = ++searchSequence;
  const params = new URLSearchParams();
  for (const [k, v] of new FormData($('#search'))) {
    if (v) params.set(k, v);
  }
  $('#status').textContent = '正在查找…';
  $('#results').replaceChildren();
  try {
    const d = await api('/api/search?' + params);
    if (seq !== searchSequence) return;
    const label = {speed: '速度', stability: '稳定性'}[d.criterion];
    $('#status').textContent = label
      ? '暂无可比较的' + label + '实测数据（' + (d.reason || '不提供未经统一实测验证的排名') + '）'
      : list(d.items).length
        ? `找到 ${d.items.length} 个符合条件的机场代表套餐`
        : d.reason || '暂无符合条件的套餐。';
    for (const item of list(d.items)) {
      const n = el('article', null, 'service-card');
      const topRow = el('div', null, 'card-header');
      const a = el('a', item?.name || '未命名机场', 'card-title');
      a.href = '#/airport/' + encodeURIComponent(item?.id || '');
      topRow.append(a, el('span', item?.id || '', 'record-badge'));
      n.append(topRow);

      if (item?.plan?.name) {
        n.append(el('p', item.plan.name, 'plan-name-tag'));
      }
      n.append(el('p', planText(item?.plan), 'price-preview'), el('p', item?.plan?.quota || '流量暂无数据', 'quota'));

      const compareMeta = el('div', null, 'comparison-meta');
      if (item?.comparison?.monthlyAmount != null) {
        compareMeta.append(
          el('p', '折合每月 ' + Number(item.comparison.monthlyAmount.toFixed(2)) + ' ' + currencyText({currency: d.currency}), 'comparison-price')
        );
      }
      if (d.criterion === 'value' && item?.comparison?.costPerGB != null) {
        compareMeta.append(
          el('p', '每 GB ' + Number(item.comparison.costPerGB.toFixed(3)) + ' ' + currencyText({currency: d.currency}), 'comparison-price')
        );
      }
      if (item?.matchingPlanCount > 1) {
        compareMeta.append(el('small', `共 ${item.matchingPlanCount} 个套餐符合条件`, 'muted'));
      }
      n.append(compareMeta);

      appendLink(n, item);
      $('#results').append(n);
    }
  } catch (e) {
    if (seq === searchSequence) $('#status').textContent = e.message;
  }
}

function referencePrices(pricing) {
  const reports = list(pricing?.externalReports).filter(
    (r) => ['unverified_third_party_price', 'unverified_candidate_price'].includes(r?.status) && r?.officialCurrentPriceVerified === false
  );
  if (!reports.length) return null;
  const box = el('details', null, 'reference-prices');
  box.append(
    el(
      'summary',
      reports.some((r) => r.status === 'unverified_candidate_price')
        ? '候选站与第三方参考报价（归属未核，不代表当前官网价）'
        : '第三方参考报价（未核实，不代表当前官网价）'
    )
  );
  for (const r of [...reports].sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || '')))) {
    const n = el('section', null, 'reference-item');
    n.append(
      el('h3', (r.status === 'unverified_candidate_price' ? '候选站报价 · 归属未核 · ' : '') + (r.publisher || '未核实来源')),
      el('p', r.summary || ''),
      el('p', '页面日期：' + (r.publishedAt || '未注明') + ' · 采集时间：' + dateText(r.observedAt)),
      outLink(r.sourceUrl, '查看报价来源', false),
      el('p', r.identityLimitation || '服务归属未核实'),
      el('p', r.freshnessLimitation || '当前在售价格未核实')
    );
    const quote = el('details');
    quote.append(el('summary', '留存原文'), el('pre', r.quote || ''));
    n.append(quote);
    box.append(n);
  }
  return box;
}

function renderDetail(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const root = el('div');
  const top = el('section', null, 'detail-top');
  const s = safeItem.summary || {};
  const preferred = preferredPricing(safeItem);

  const headBar = el('div', null, 'detail-head-bar');
  const titleGroup = el('div', null, 'detail-title-group');
  const badgeRow = el('div', null, 'detail-badges');
  badgeRow.append(
    el('span', safeItem.id || '', 'record-badge'),
    el('span', safeItem.primary ? '主目录记录' : '补充记录', 'record-scope-tag')
  );
  titleGroup.append(badgeRow, el('h1', safeItem.name || '未命名机场'));

  const actionGroup = el('div', null, 'detail-action-group');
  const visit = outLink(safeItem.link?.url, '访问网站', safeItem.link?.type === 'verified_user_referral');
  if (visit.tagName === 'A') visit.className = 'button';
  actionGroup.append(visit);
  if (safeItem.link?.type === 'verified_user_referral') {
    actionGroup.append(el('small', '推荐链接', 'affiliate-note'));
  }
  headBar.append(titleGroup, actionGroup);

  top.append(
    headBar,
    el('p', s.price ? planText(s.price) : preferred ? preferred.headline : '暂无报价', 'detail-price'),
    overview(safeItem)
  );
  root.append(top);

  if (preferred) {
    top.append(el('small', preferred.legacyLabel || '', 'legacy-record-label'));
    root.append(relatedPriceNotice(preferred));
  }

  root.append(performanceNotes(s));

  const facts = el('section', null, 'key-facts');
  for (const [label, value] of [
    ['支付方式', list(s.paymentMethods).join(' · ') || '暂无数据'],
    ['退款条件', s.refund || '暂无数据']
  ]) {
    const box = el('div', null, 'key-fact');
    box.append(el('h2', label), el('p', value));
    facts.append(box);
  }
  root.append(facts);

  const section = el('section', null, 'plans-section');
  const bar = el('div', null, 'plans-heading');
  const plans = list(safeItem.pricing?.plans);
  bar.append(el('h2', `套餐价格（${plans.length} 组）`));

  const label = el('label', '计费周期 ');
  const select = el('select');
  select.setAttribute('aria-label', '计费周期');
  const periods = [...new Set(plans.map((p) => p?.billingPeriod).filter(Boolean))];
  for (const period of ['全部', ...periods]) {
    const o = el('option', period);
    o.value = period;
    select.append(o);
  }
  select.value = periods.includes(s.price?.billingPeriod) ? s.price.billingPeriod : '全部';
  label.append(select);
  bar.append(label);
  section.append(bar);

  const table = el('table', null, 'plan-table');
  const thead = el('thead');
  const tr = el('tr');
  for (const h of ['套餐', '价格', '流量', '设备']) tr.append(el('th', h));
  thead.append(tr);
  const tbody = el('tbody');
  table.append(thead, tbody);

  const draw = () => {
    const shown = plans.filter((p) => p && (select.value === '全部' || p.billingPeriod === select.value));
    tbody.replaceChildren();
    for (const p of shown) {
      const row = el('tr');
      const name = el('td', p.name || '套餐');
      if (p.soldOut === true) name.append(el('small', '售罄', 'sold-out'));
      const price = el('td', priceText(p), 'table-price');
      price.append(el('small', ' / ' + (p.billingPeriod || '周期待确认')));
      if (p.currency) price.append(el('small', currencyText(p), 'currency-label'));
      row.append(
        name,
        price,
        el('td', p.quota || '暂无数据'),
        el('td', Number.isFinite(p.maxDevices) && p.maxDevices > 0 ? p.maxDevices + '台' : p.deviceLimit || '暂无数据')
      );
      tbody.append(row);
    }
    if (!shown.length) {
      const empty = el('td', '暂无报价', 'empty-state');
      empty.colSpan = 4;
      const row = el('tr');
      row.append(empty);
      tbody.append(row);
    }
  };
  select.addEventListener('change', draw);
  draw();

  const wrap = el('div', null, 'table-wrap');
  wrap.append(table);
  section.append(wrap);
  if (!preferred || plans.length) root.append(section);

  const references = referencePrices(safeItem.pricing);
  if (references) root.append(references);

  for (const r of list(safeItem.pricing?.relatedCandidates).filter(
    (r) => !preferred && /^A\d{3}$/.test(r?.recordId) && r.identityVerified === false && r.officialCurrentPriceVerified === false
  )) {
    const related = el('section', null, 'related-candidate-section');
    related.append(el('h2', '已收录的同名服务（归属待核）'));
    const a = el('a', (r.recordName || r.recordId) + ' · 查看已有套餐', 'button button-secondary');
    a.href = '#/airport/' + r.recordId;
    related.append(el('p', r.limitation || ''), a);
    root.append(related);
  }
  return root;
}

async function route() {
  const match = location.hash.match(/^#\/airport\/([^/]+)$/);
  const seq = ++detailSequence;
  $('#home').hidden = !!match;
  $('#detail').hidden = !match;
  if (!match) {
    document.title = '航向 · 机场套餐目录与比价';
    if (location.hash) {
      try {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior: 'auto'});
      } catch {}
    }
    return;
  }
  $('#detail-content').replaceChildren(el('p', '正在加载…', 'empty-state'));
  window.scrollTo({top: 0, behavior: 'auto'});
  let decodedId;
  try {
    decodedId = decodeURIComponent(match[1]);
  } catch {
    if (seq === detailSequence) {
      $('#detail-content').replaceChildren(el('p', '链接包含无效的编码字符', 'error'));
    }
    return;
  }
  try {
    const d = await api('/api/airports/' + encodeURIComponent(decodedId));
    if (seq !== detailSequence) return;
    if (!d.item) throw Error('未找到这个机场');
    $('#detail-content').replaceChildren(renderDetail(d.item));
    document.title = (d.item.name || decodedId) + ' · 航向';
  } catch (e) {
    if (seq === detailSequence) {
      $('#detail-content').replaceChildren(el('p', e.message, 'error'));
    }
  }
}

async function pollSnapshotChange() {
  if (document.hidden) return;
  try {
    const next = await api('/api/stats');
    const changed = Boolean(observedSnapshot && next?.snapshotId && next.snapshotId !== observedSnapshot);
    if (next?.snapshotId) observedSnapshot = next.snapshotId;
    if (changed) {
      const primaryTotal = statsPrimaryTotal(next);
      if (Number.isFinite(primaryTotal) && $('#stat-primary')) {
        $('#stat-primary').textContent = `${primaryTotal} 家`;
      }
      applySnapshotMeta(next);
      await loadCatalog();
      if (/^#\/airport\//.test(location.hash)) await route();
    }
  } catch {
    const meta = $('#catalog-meta');
    if (meta && !meta.textContent.includes('自动更新暂不可用')) {
      meta.textContent += ' · 自动更新暂不可用';
    }
  }
}

$('#search').addEventListener('submit', search);
$('#search-reset')?.addEventListener('click', () => {
  $('#search').reset();
  $('#status').textContent = '设置预算或输入需求，比较合格套餐。';
  $('#results').replaceChildren();
});
$('#catalog-form').addEventListener('submit', (e) => {
  e.preventDefault();
  catalogPage = 1;
  loadCatalog();
});
$('#catalog-reset').addEventListener('click', () => {
  $('#catalog-form').reset();
  catalogPage = 1;
  loadCatalog();
});
$('#previous').addEventListener('click', () => {
  if (catalogPage > 1) {
    catalogPage--;
    loadCatalog();
  }
});
$('#next').addEventListener('click', () => {
  if (catalogPage < catalogPages) {
    catalogPage++;
    loadCatalog();
  }
});
for (const chip of $$('[data-payment]')) {
  chip.addEventListener('click', () => {
    const paymentInput = $('#catalog-form [name="payment"]');
    if (paymentInput) {
      paymentInput.value = chip.getAttribute('data-payment') || '';
      catalogPage = 1;
      loadCatalog();
    }
  });
}
for (const chip of $$('[data-preset-needs]')) {
  chip.addEventListener('click', () => {
    const needsInput = $('#search [name="needs"]');
    const currencySelect = $('#search [name="currency"]');
    const maxMonthlyInput = $('#search [name="maxMonthly"]');
    if (currencySelect) currencySelect.value = 'CNY';
    if (maxMonthlyInput) maxMonthlyInput.value = '';
    if (needsInput) {
      needsInput.value = chip.getAttribute('data-preset-needs') || '';
      search();
    }
  });
}
window.addEventListener('hashchange', route);
loadStats();
loadCatalog();
route();
if (typeof setInterval === 'function') {
  setInterval(pollSnapshotChange, 60000);
}
