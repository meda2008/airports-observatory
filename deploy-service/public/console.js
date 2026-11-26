'use strict';
const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const list = v => Array.isArray(v) ? v : [];
const show = v => v == null || v === '' ? '未知' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const copy = v => JSON.parse(JSON.stringify(v));
let adminToken = '', session = 0, loading = false, collectors = [], selectedId = '', draft = null, dirty = false, editorBusy = false;
const endpointErrors = new Map(), proposalDetails = new Map(), renderSignatures = new Map();
function renderWhenChanged(key, value, render) {
  const signature = JSON.stringify(value);
  if (renderSignatures.has(key) && renderSignatures.get(key) === signature) return;
  render(value);
  renderSignatures.set(key, signature);
}
function record(message, failed = false) { const li = el('li', `${new Date().toLocaleString('zh-CN')} · ${message}`, failed ? 'failed' : ''); $('#events').prepend(li); }
function fail(message) { $('#admin-status').textContent = message; record(message, true); }
function displayErrors() {
  renderWhenChanged('errors', [...endpointErrors], entries => {
    const box = $('#request-errors'); box.hidden = entries.length === 0;
    box.replaceChildren(...entries.map(([path, error]) => el('p', `${path}：${error}`)));
  });
}
async function parseJsonResponse(response) {
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`服务未返回有效 JSON（HTTP ${response.status}）`);
    }
  }
  if (typeof response.json === 'function') {
    try {
      return await response.json();
    } catch {
      throw new Error(`服务未返回有效 JSON（HTTP ${response.status}）`);
    }
  }
  throw new Error(`服务未返回有效 JSON（HTTP ${response.status}）`);
}
async function api(url, body, options = {}) {
  if (!adminToken) throw new Error('请先连接控制台');
  const epoch = session, token = adminToken, headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { cache: 'no-store', method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), ...options });
  if (epoch !== session || token !== adminToken) throw new Error('会话已变更，请重新操作');
  const d = await parseJsonResponse(response);
  if (epoch !== session || token !== adminToken) throw new Error('会话已变更，请重新操作');
  if (!response.ok) {
    const rawError = typeof d?.error === 'string' ? d.error : '';
    if (response.status === 401 || response.status === 403) {
      throw new Error(`需要有效管理员令牌或权限不足（HTTP ${response.status}${rawError ? ' · ' + rawError : ''}）`);
    }
    throw new Error(rawError || `请求失败（${response.status}）`);
  }
  return d;
}
function raw(value, label = '完整记录') { const d = el('details'); d.append(el('summary', label), el('pre', JSON.stringify(value, null, 2))); return d; }
function facts(data, labels) { const dl = el('dl'); for (const [key, label] of labels) dl.append(el('dt', label), el('dd', show(data?.[key]))); return dl; }
function safeLink(value, label) { try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('unsupported'); const a = el('a', label || url.href, 'text-link'); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch { return el('span', show(value), 'subtle'); } }
function basisLabel(value) {
  const status = typeof value === 'object' && value ? value.status : value;
  return status === 'standalone_browser' ? '独立后台实站观察（standalone_browser）' : status === 'live_browser' ? '实站观察（live_browser）' : status === 'retained_reparse' ? '保留原文重解析（retained_reparse，不代表新访问）' : status ? show(status) : '资料依据未标明';
}
function outcomeLabel(value) {
  const labels = { validation_material_observed: '已取得验证材料', no_fact_change: '资料事实无变更', queued: '已排队，等待执行端', disabled_not_run: '站点已停用，本次未执行', already_validated_recently: '近期已有验证，本次跳过', pending_review: '等待资料复核', completed: '已完成', paused: '采集执行已暂停', retained_reparse: '保留原文重解析', live_browser: '实站观察' };
  if (value == null || value === '') return '未知';
  if (typeof value !== 'object') return labels[value] || show(value);
  const parts = [labels[value.status] || show(value.status)];
  if (value.detail) parts.push(typeof value.detail === 'object' ? outcomeLabel(value.detail) : show(value.detail));
  if (value.basis) parts.push(basisLabel(value.basis));
  return parts.join(' · ');
}
function dataBasis(record) { return record?.capabilities?.dataBasis || record?.outcome?.detail?.basis || record?.outcome?.basis; }
function renderBatchResults(data) {
  const box = $('#batch-results'), items = list(data.items); box.hidden = false;
  box.replaceChildren(el('h3', '批量验证请求结果'), el('p', '以下是本次请求的逐站结果。已排队任务仍需在线执行端领取；本次请求没有采用未保存的配置草稿。', 'subtle'));
  if (!items.length) box.append(el('p', '服务未返回逐站结果，请查看任务记录。', 'pending-note'));
  for (const i of items) {
    const row = el('article', null, 'batch-result-row');
    row.append(el('strong', `${show(i.name || i.siteId)} · ${outcomeLabel(i.status)}`));
    row.append(el('p', `任务 ${show(i.jobId)}${i.reason ? ' · ' + show(i.reason) : ''}`, 'subtle'));
    row.append(raw(i, '逐站完整结果')); box.append(row);
  }
  if (data.control || data.runtime) box.append(facts({ executionMode: data.control?.executionMode, connected: data.runtime?.connected }, [['executionMode', '请求时执行模式'], ['connected', '请求时执行端在线']]));
}
async function reparseRun(run) {
  const runId = run.runId || run.id;
  const d = await mutate('/api/admin/collectors/' + encodeURIComponent(run.siteId) + '/reparse', { runId }, '已提交保留原文重解析请求；未重新访问网站。');
  if (!d) return;
  const box = $('#reparse-results'); box.hidden = false;
  box.replaceChildren(el('h3', '保留原文重解析结果'), el('p', `${show(run.siteId)} · 原运行 ${show(runId)} · ${outcomeLabel(d.status)}`), el('p', '仅复用已保留的有效正文，未重新访问网站，也不刷新原采集时间。此结果不能作为一次新的实站观察。原访问断点状态独立保留，重解析不表示 CF / 验证码已经解决。', 'subtle'), facts({ evidenceIds: d.evidenceIds, proposalId: d.proposalId, basis: basisLabel(dataBasis(d.run) || 'retained_reparse') }, [['basis', '资料依据'], ['evidenceIds', '复用证据'], ['proposalId', '提案']]), raw(d, '重解析完整回执'));
}
function actor() { const value = $('#reviewer').value.trim(); if (!value) { $('#reviewer').focus(); throw new Error('请填写操作人 / 复核人'); } return value; }
function action(label, handler, secondary = true) { const b = el('button', label, secondary ? 'button-secondary' : ''); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; const epoch = session; try { await handler(); } catch (e) { if (epoch === session) fail(`${label}失败：${e.message}`); } finally { if (epoch === session && b.isConnected) b.disabled = false; } }); return b; }
async function mutate(url, body, message) { const epoch = session, d = await api(url, { ...body, actor: actor() }); if (epoch !== session) return; record(message); $('#admin-status').textContent = message; await load(false); return d; }
function renderService(d) { const u = d || {}; $('#update-service').replaceChildren(facts(u, [['collectionEnabled', '允许采集'], ['status', '服务状态'], ['queued', '已排队'], ['pendingReview', '待复核'], ['blocked', '受阻'], ['lastHeartbeat', '采集服务心跳']]), el('h3', '资料发布进程'), facts(u.publisher, [['status', '进程状态'], ['lastHeartbeat', '最近心跳']])); }
function renderDatabase(db) { const box = $('#database'); box.replaceChildren(facts(db, [['snapshotId', '当前快照'], ['importedAt', '导入时间']])); if (!list(db?.tables).length) { box.append(el('p', '没有返回数据表统计。', 'subtle')); return; } const table = el('table', null, 'data-table'), head = el('thead'), row = el('tr'), body = el('tbody'); row.append(el('th', '数据表'), el('th', '记录数')); head.append(row); for (const t of db.tables) { const tr = el('tr'); tr.append(el('td', show(t.name)), el('td', show(t.count))); body.append(tr); } table.append(head, body); box.append(table); }
function renderControl(control, runtime) {
  const box = $('#collection-summary'); box.replaceChildren();
  for (const [key, label, description] of [['engineEnabled', '采集总开关', '允许执行端领取已排队任务'], ['weeklyEnabled', '每周更新', '按站点配置安排到期更新']]) { const c = el('article', null, 'control-card'); c.append(el('span', label, 'subtle'), el('strong', control?.[key] === true ? '已开启' : control?.[key] === false ? '已关闭' : '未知'), el('p', description, 'subtle')); const b = action(control?.[key] === true ? '关闭' + label : '开启' + label, () => mutate('/api/admin/collection/control', { [key]: !control[key] }, label + '已保存')); b.disabled = typeof control?.[key] !== 'boolean'; c.append(b); box.append(c); }
  const r = el('article', null, 'control-card runtime-card'); r.append(el('span', control?.executionMode==='standalone'?'独立后台采集服务':'内置浏览器执行端', 'subtle'), el('strong', runtime?.connected === true ? '已连接' : runtime?.connected === false ? '未连接' : '未知'), facts({ ...runtime, executionMode: control?.executionMode }, [['executionMode', '执行模式'], ['runnerName', '执行端'], ['lastHeartbeat', '最近心跳']]), el('p', runtime?.connected === true ? '连接状态以心跳为准；具体进度请查看任务记录。' : '没有已确认在线的执行端；排队任务不会自行完成浏览器访问。', 'subtle')); r.append(action(control?.executionMode==='standalone'?'切换为内置浏览器执行':'切换为独立后台采集',()=>mutate('/api/admin/collection/control',{executionMode:control?.executionMode==='standalone'?'iab_bridge':'standalone'},'执行模式已保存')));box.append(r);
}
function renderCollectorList() { const box = $('#collector-list'); box.replaceChildren(); $('#collector-count').textContent = `${collectors.length} 个站点`; if (!collectors.length) box.append(el('p', '没有匹配的站点。', 'subtle')); for (const c of collectors) { const b = action('', () => { if (editorBusy) return; if (dirty) { fail('当前配置有未保存草稿，请先保存或还原，再切换站点。'); return; } selectCollector(c); }); b.className = 'collector-item' + (c.siteId === selectedId ? ' selected' : ''); b.setAttribute('aria-pressed', String(c.siteId === selectedId)); b.append(el('strong', c.name || c.siteId), el('span', `${c.siteId} · v${show(c.revision)} · ${(c.enabled ?? c.config?.enabled) === true ? '启用' : (c.enabled ?? c.config?.enabled) === false ? '停用' : '状态未知'}`), el('small', '下次调度：' + show(c.nextRunAt))); box.append(b); } }
function setDirty(value) { dirty = value; $('#draft-status').textContent = value ? '有未保存草稿' : '已载入版本'; $('#draft-status').className = 'status-chip' + (value ? ' pending' : ''); }
function selectCollector(c) {
  selectedId = c.siteId; draft = copy(c); setDirty(false); $('#collector-empty').hidden = true; $('#collector-detail').hidden = false; $('#collector-name').textContent = c.name || c.siteId;
  const config = c.config || {}, advanced = copy(config); for (const key of ['entryUrl', 'maxPages', 'refreshIntervalMs', 'fields']) delete advanced[key];
  $('#config-entry').value = config.entryUrl || ''; $('#config-pages').value = config.maxPages ?? ''; $('#config-interval').value = config.refreshIntervalMs != null ? config.refreshIntervalMs / 86400000 : ''; $('#config-fields').value = list(config.fields).join(', '); $('#config-advanced').value = JSON.stringify(advanced, null, 2); renderSelectedStatus(c); renderCollectorList();
}
const capabilityLabels = [['页面可读', ['pageReadable', 'readable', 'pageRead']], ['登录', ['login', 'authentication']], ['套餐提取', ['plans', 'planExtraction', 'pricing']], ['支付信息', ['payment', 'payments']], ['退款条款', ['refund', 'refunds']], ['CF / 验证码断点', ['challenge', 'captcha', 'cloudflare']]];
function capabilityValue(capabilities, aliases) { if (Array.isArray(capabilities)) return capabilities.find(v => typeof v === 'object' && aliases.includes(v.name || v.key || v.capability)) || null; for (const key of aliases) if (capabilities && Object.hasOwn(capabilities, key)) return capabilities[key]; return null; }
function renderSelectedStatus(c) {
  if (!draft) return;
  $('#collector-meta').textContent = `${c.siteId} · 编辑版本 v${show(draft.revision)} · 当前服务端 v${show(c.revision)} · 下次调度 ${show(c.nextRunAt)}`;
  const warning = $('#revision-warning'); warning.hidden = c.revision === draft.revision;
  warning.textContent = '服务端配置已有新版本，当前草稿仍保留。保存可能发生版本冲突；请复制需要的修改，再还原到最新配置核对。';
  $('#toggle-site').textContent = (draft.enabled ?? draft.config?.enabled) === true ? '停用此站点' : '启用此站点';
  const v = c.lastRun || c.lastValidation;
  const sameRevision = v?.profileRevision != null && c.revision != null && String(v.profileRevision) === String(c.revision);
  const versionNote = !v ? '' : sameRevision ? '当前配置的验证记录' : v.profileRevision == null ? '配置版本未绑定，不代表当前配置已验证' : '旧配置结果，不代表当前配置已验证';
  $('#validation-meta').textContent = v ? `${versionNote} · 状态 ${show(v.status)} · 结果 ${outcomeLabel(v.outcome)} · 结束 ${show(v.finishedAt)} · 结果配置 v${show(v.profileRevision)} / 当前 v${show(c.revision)}` : '没有返回实际验证记录。';
  $('#validation-meta').className = 'subtle' + (v && !sameRevision ? ' stale-validation' : '');
  $('#validation-basis').textContent = v ? '资料依据：' + basisLabel(dataBasis(v)) : '资料依据：尚无验证记录';
  const box = $('#validation-matrix'); box.replaceChildren();
  for (const [label, aliases] of capabilityLabels) {
    const value = capabilityValue(v?.capabilities, aliases), status = value == null ? '未验证' : typeof value === 'object' ? show(value.status ?? value.outcome ?? value.result) : value === true ? '已验证' : value === false ? '未通过' : String(value), item = el('article', null, 'capability');
    item.append(el('span', label), el('strong', status));
    if (v && !sameRevision) item.append(el('small', '旧配置 / 未绑定当前版本'));
    if (value && typeof value === 'object' && (value.reason || value.note)) item.append(el('small', value.reason || value.note));
    box.append(item);
  }
}
function editorConfig() { const advanced = JSON.parse($('#config-advanced').value); if (!advanced || Array.isArray(advanced) || typeof advanced !== 'object') throw new Error('高级配置必须是 JSON 对象'); const maxPages = Number($('#config-pages').value), interval = Number($('#config-interval').value) * 86400000; if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000 || !Number.isFinite(interval) || interval <= 0) throw new Error('请检查页数和更新间隔'); const url = new URL($('#config-entry').value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('入口须为不含账号密码的 HTTP(S) URL'); return { ...advanced, entryUrl: url.href, maxPages, refreshIntervalMs: Math.round(interval), fields: $('#config-fields').value.split(/[,，]/).map(v => v.trim()).filter(Boolean) }; }
async function saveConfig(config, message) { if (!draft || editorBusy) return; editorBusy = true; const epoch = session, siteId = selectedId; setEditorBusy(true); try { const d = await api('/api/admin/collectors/' + encodeURIComponent(siteId) + '/config', { config, expectedRevision: draft.revision, actor: actor() }); if (epoch !== session) return; record(message); setDirty(false); const updated = d.item || d.collector || d.profile || d; if (updated.config && updated.revision != null) { updated.siteId = updated.siteId || siteId; selectCollector(updated); } await load(false); if (!updated.config) { const latest = collectors.find(c => c.siteId === siteId); if (latest && latest.revision !== draft.revision) selectCollector(latest); } $('#admin-status').textContent = message; } catch (e) { if (epoch === session) fail('配置未保存：' + e.message); } finally { if (epoch === session) { editorBusy = false; setEditorBusy(false); } } }
function setEditorBusy(busy) { for (const n of $('#collector-config').querySelectorAll('input,textarea,button')) n.disabled = busy; }
function jobCard(i) {
  const row = el('article', null, 'job-card'), id = i.jobId || i.id, status = String(i.status || '').toLowerCase();
  row.append(el('strong', `${show(i.siteId)} · ${show(i.runId || id)}`), el('p', `状态 ${show(i.status)} · 结果 ${outcomeLabel(i.outcome)} · ${show(i.purpose)}`, 'subtle'), facts({ ...i, enqueuedAt: i.enqueuedAt ?? i.createdAt ?? '未提供排队时间', dueAt: i.dueAt ?? '未提供到期时间' }, [['enqueuedAt', '创建 / 排队'], ['dueAt', '计划 / 到期'], ['startedAt', '开始时间'], ['finishedAt', '结束时间'], ['profileRevision', '配置版本']]));
  if (dataBasis(i)) row.append(el('p', '资料依据：' + basisLabel(dataBasis(i)), 'basis-note'));
  if (i.blocker || i.error) row.append(el('p', show(i.blocker || i.error), 'pending-note'));
  const buttons = el('div', null, 'row-actions');
  if (id && ['queued', 'leased'].includes(status)) buttons.append(action('停止任务', () => mutate('/api/admin/collection/jobs/' + encodeURIComponent(id) + '/cancel', {}, '已提交停止任务请求 ' + id)));
  if (id && ['blocked', 'failed', 'cancelled'].includes(status)) buttons.append(action('重试入队', () => mutate('/api/admin/collection/jobs/' + encodeURIComponent(id) + '/retry', {}, '已提交重试请求 ' + id)));
  const observedBody = i.capabilities?.pageReadable?.status === 'observed';
  const legacyCompleted = status === 'completed' && (!i.capabilities || Object.keys(i.capabilities).length === 0);
  if (['completed', 'blocked', 'review_approved', 'review_rejected'].includes(status) && i.siteId && (i.runId || i.id) && list(i.evidenceIds).length && (observedBody || legacyCompleted)) {
    const control = load.collection?.control || load.control;
    const b = action('复用原文重解析', () => reparseRun(i)); b.disabled = control?.engineEnabled !== true; buttons.append(b);
    row.append(el('p', control?.engineEnabled === true ? '重解析仅使用此运行保留的原文，不刷新采集时间。' : '原文重解析需先开启采集总开关；仍只复用保留原文，不访问网站。', 'subtle'));
    row.append(el('p', '只复用已授权、可见的有效正文；原访问断点状态独立保留，重解析不表示 CF / 验证码已经解决。', 'subtle'));
  }
  row.append(buttons, raw(i)); return row;
}
function renderJobs(runs, jobs) { const items = [...list(runs)], seen = new Set(items.map(v => v.jobId || v.id)); for (const j of list(jobs?.items || jobs)) if (!seen.has(j.jobId || j.id)) items.push(j); const box = $('#jobs'); box.replaceChildren(...(items.length ? items.map(jobCard) : [el('p', '暂无任务记录。', 'subtle')])); }
function renderCheckpoints(data) { const box = $('#checkpoints'), items = list(data?.items || data); box.replaceChildren(); if (!items.length) box.append(el('p', '暂无访问断点。', 'subtle')); for (const i of items) { const row = el('article', null, 'job-card'), id = i.id || i.checkpointId; row.append(el('strong', `${show(i.siteId)} · ${show(i.type)}`), facts({ ...i, recordedAt: i.createdAt ?? i.observedAt }, [['status', '断点状态'], ['stage', '保留阶段'], ['reason', '受阻原因'], ['recordedAt', '记录时间'], ['requestedAction', '所需操作']]), safeLink(i.url, '打开已记录页面 ↗')); if (id && !['resolved', 'cancelled', 'canceled', 'closed', 'completed', 'resumed'].includes(String(i.status).toLowerCase())) row.append(action('从断点重新入队', () => mutate('/api/admin/collection/checkpoints/' + encodeURIComponent(id) + '/resume', {}, '已提交断点恢复请求；等待执行端验证 ' + id))); row.append(raw(i)); box.append(row); } }
function renderCollectionEvents(items) { const box = $('#collection-events'); box.replaceChildren(); if (!list(items).length) box.append(el('p', '暂无服务端事件。', 'subtle')); else for (const i of items) box.append(raw(i, `${show(i.createdAt || i.observedAt || i.timestamp)} · ${show(i.type || i.event || i.status)}`)); }
function diffTable(d) { const container = el('div', null, 'proposal-diff'); container.append(el('p', `提案版本 ${show(d.expectedRevision)} · 当前资料版本 ${show(d.currentRevision)}`, 'subtle')); const before = d.before || {}, after = d.after || d.patch || {}, keys = [...new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(d.patch || {})])]; if (!keys.length) container.append(el('p', '没有返回可比较的字段，请核对完整提案和证据。', 'pending-note')); else { const table = el('table', null, 'data-table diff-table'), header = el('tr'), body = el('tbody'); header.append(el('th', '字段'), el('th', '原值'), el('th', '拟更新值')); const head = el('thead'); head.append(header); for (const key of keys) { const r = el('tr'); r.append(el('th', key), el('td', show(before[key])), el('td', show(Object.hasOwn(after, key) ? after[key] : before[key]))); body.append(r); } table.append(head, body); const scroll = el('div', null, 'table-scroll'); scroll.append(table); container.append(scroll); } container.append(raw(d, '完整提案与安全事实')); return container; }
function evidenceControls(ids) {
  const controls = el('div', null, 'evidence-actions');
  for (const id of new Set(list(ids))) {
    if (typeof id !== 'string' || !id.trim()) continue;
    const box = el('div', null, 'evidence-box'); box.hidden = true;
    controls.append(action('读取证据 ' + id, async () => {
      const d = await api('/api/admin/evidence?id=' + encodeURIComponent(id));
      if (!box.isConnected) return;
      box.replaceChildren(el('h4', '证据 ' + id), raw(d.item ?? d, '展开完整证据'));
      box.hidden = false;
      record('读取证据 ' + id);
    }), box);
  }
  return controls;
}
function proposalCard(p) {
  const card = el('article', null, 'proposal-card'), id = p.id || p.proposalId;
  card.append(el('h3', `${show(p.siteId)} · ${show(id)}`), el('p', `状态 ${show(p.status)} · 预期版本 ${show(p.expectedRevision)} · 创建 ${show(p.createdAt)}`, 'subtle'));
  if (p.reason || p.summary) card.append(el('p', p.reason || p.summary));
  if (typeof id !== 'string' || !id.trim()) {
    card.append(el('p', '提案缺少编号，无法读取或复核。', 'pending-note'));
    return card;
  }
  const detailBox = el('div'), evidence = el('div'), actions = el('div', null, 'review-actions');
  let detail = proposalDetails.get(id);
  if (detail && detail.expectedRevision !== p.expectedRevision) { proposalDetails.delete(id); detail = null; }
  const detailsButton = action('查看旧值与新值', async () => {
    const d = await api('/api/admin/proposals/' + encodeURIComponent(id));
    if (!card.isConnected) return;
    detail = d.item || d;
    proposalDetails.set(id, detail);
    detailBox.replaceChildren(diffTable(detail));
    evidence.replaceChildren(evidenceControls(detail.evidenceIds || p.evidenceIds));
    for (const b of actions.querySelectorAll('button')) b.disabled = false;
    record('读取提案差异 ' + id);
  });
  card.append(detailsButton, detailBox, evidence);
  if (detail) detailBox.append(diffTable(detail));
  evidence.append(evidenceControls(detail?.evidenceIds || p.evidenceIds));
  if (p.status === 'pending') {
    for (const approved of [true, false]) {
      const b = action(approved ? '批准资料更新' : '拒绝提案', async () => {
        if (!detail) throw new Error('请先读取旧值与新值');
        const reviewer = actor(), epoch = session;
        for (const c of actions.querySelectorAll('button')) c.disabled = true;
        try {
          const result = await api('/api/admin/review', { id, approved, expectedRevision: detail.expectedRevision ?? p.expectedRevision, reviewer });
          proposalDetails.delete(id);
          const publication = result.publication?.status;
          const message = !approved ? '已拒绝提案 ' + id : publication === 'sync_failed' ? '复核已保存但未发布：请在“资料与发布”重试同步。' : publication === 'published' ? '复核已保存，资料已发布。' : publication === 'unchanged' ? '复核已保存，展示投影无需变更。' : '复核已保存；发布状态未确认，请核对发布服务。';
          record(message, publication === 'sync_failed');
          await load(false);
          if (epoch !== session) return;
          if (publication === 'sync_failed') { endpointErrors.set('提案发布 ' + id, message); displayErrors(); }
          $('#admin-status').textContent = message;
        } finally { for (const c of actions.querySelectorAll('button')) c.disabled = false; }
      }, !approved);
      b.disabled = !detail;
      if (!approved) b.classList.add('reject');
      actions.append(b);
    }
    card.append(actions, el('p', '先读取差异。提交携带预期版本；版本变化需重新读取提案并核对证据。', 'review-note'));
  }
  return card;
}
async function load(announce = true, full = true) {
  if (!adminToken) return;
  if (loading) { if (full) load.pending = true; return; }
  loading = true;
  const epoch = session;
  if (announce) $('#admin-status').textContent = '正在读取采集、任务与资料状态…';
  function renderCollection() {
    const control = load.collection?.control || load.control, runtime = load.collection?.runtime || load.runtime;
    renderWhenChanged('control', [control, runtime], () => renderControl(control, runtime));
    renderWhenChanged('jobs', [load.collection?.runs, load.jobs, control?.engineEnabled], () => renderJobs(load.collection?.runs, load.jobs));
    renderWhenChanged('checkpoints', load.collection?.checkpoints, renderCheckpoints);
    renderWhenChanged('events', load.collection?.events, renderCollectionEvents);
  }
  const requests = [['/api/admin/status?view=' + (full ? 'summary' : 'runtime'), d => {
    renderWhenChanged('service', d.updateService, renderService);
    if (full) renderWhenChanged('database', d.database, renderDatabase);
    const status = d.updateService;
    if (status?.collectionControl) renderWhenChanged('control', [status.collectionControl, status.runtime], () => renderControl(status.collectionControl, status.runtime));
  }]];
  if (full) {
    const query = $('#site-search').value.trim();
    requests.push(
      ['/api/admin/jobs', d => { load.jobs = d; renderCollection(); }],
      ['/api/admin/proposals', d => renderWhenChanged('proposals', list(d.items || d), items => {
        const activeIds = new Set(items.map(p => p.id || p.proposalId));
        for (const id of proposalDetails.keys()) if (!activeIds.has(id)) proposalDetails.delete(id);
        $('#proposals').replaceChildren(...(items.length ? items.map(proposalCard) : [el('p', '暂无提案。', 'subtle')]));
        $('#proposal-count').textContent = items.length + ' 条记录';
      })],
      ['/api/admin/collectors?q=' + encodeURIComponent(query), d => {
        collectors = list(d.items);
        renderWhenChanged('collectors', collectors.map(c => [c.siteId, c.name, c.revision, c.enabled ?? c.config?.enabled, c.nextRunAt]), renderCollectorList);
        if (!selectedId && collectors.length) selectCollector(collectors[0]);
        const selected = collectors.find(c => c.siteId === selectedId);
        if (selected) renderWhenChanged('selected', [selected, draft?.revision], () => renderSelectedStatus(selected));
        load.control = d.control;
        load.runtime = d.runtime;
        if (!load.collection) renderCollection();
      }],
      ['/api/admin/collection/status', d => { load.collection = d; renderCollection(); }]
    );
  }
  try {
    await Promise.all(requests.map(async ([path, render]) => {
      const key = path.split('?')[0];
      try {
        const options = {signal: globalThis.AbortSignal?.timeout?.(10000), ...(announce ? {} : {priority: 'low'})};
        const value = await api(path, undefined, options);
        if (epoch !== session || !adminToken) return;
        render(value);
        endpointErrors.delete(key);
        $('#workspace').hidden = false;
      } catch (error) {
        if (epoch !== session || !adminToken) return;
        const message = error.name === 'TimeoutError' ? '请求超时，稍后可刷新' : error.message;
        if (endpointErrors.get(key) !== message) record(key + '：' + message, true);
        endpointErrors.set(key, message);
      }
      displayErrors();
    }));
    if (epoch === session && announce) $('#admin-status').textContent = endpointErrors.size ? '部分请求失败。已保留可读取资料和错误详情，请核对下方会话记录。' : '状态已更新。配置草稿保留；任务进度以实际运行记录为准。';
  } finally {
    if (epoch === session) {
      loading = false;
      if (load.pending) { load.pending = false; await load(false); }
    }
  }
}
$('#auth-form').addEventListener('submit', async e => { e.preventDefault(); const token = $('#token').value; if (adminToken) disconnect(false); session++; adminToken = token; $('#token').value = ''; $('#disconnect').disabled = false; await load(); });
function disconnect(log = true) { adminToken = ''; session++; loading = false; collectors = []; selectedId = ''; draft = null; dirty = false; editorBusy = false; endpointErrors.clear(); proposalDetails.clear(); renderSignatures.clear(); delete load.collection; delete load.control; delete load.runtime; delete load.jobs; delete load.pending; $('#token').value = ''; $('#disconnect').disabled = true; $('#sync').disabled = false; $('#validate-all').disabled = false; $('#batch-results').hidden = true; $('#reparse-results').hidden = true; const referralButton = $('#referral').querySelector('button'); if (referralButton) referralButton.disabled = false; $('#workspace').hidden = true; $('#collector-detail').hidden = true; $('#collector-empty').hidden = false; $('#collector-config').reset(); for (const id of ['config-entry', 'config-pages', 'config-interval', 'config-fields', 'config-advanced']) $('#' + id).value = ''; for (const id of ['collector-name', 'collector-meta', 'validation-meta', 'validation-basis', 'revision-warning', 'draft-status']) $('#' + id).textContent = ''; setEditorBusy(false); for (const id of ['update-service', 'database', 'jobs', 'checkpoints', 'proposals', 'referral-results', 'collector-list', 'collection-summary', 'collection-events', 'validation-matrix', 'batch-results', 'reparse-results']) $('#' + id).replaceChildren(); displayErrors(); $('#admin-status').textContent = '已断开，令牌和管理资料已从页面清除。'; if (log) record('断开控制台并清除令牌'); }
$('#disconnect').addEventListener('click', () => disconnect());
$('#refresh').addEventListener('click', () => load());
$('#validate-all').addEventListener('click', async () => {
  const b = $('#validate-all'), epoch = session; b.disabled = true;
  try { const d = await mutate('/api/admin/collectors/validate-all', {}, '批量验证请求已提交；排队不等于运行。'); if (epoch === session && d) renderBatchResults(d); }
  catch (e) { if (epoch === session) fail('批量验证请求失败：' + e.message); }
  finally { if (epoch === session) b.disabled = false; }
});
$('#collector-search').addEventListener('submit', e => { e.preventDefault(); load(); });
$('#collector-config').addEventListener('input', () => setDirty(true));
$('#collector-config').addEventListener('submit', e => { e.preventDefault(); try { saveConfig(editorConfig(), '采集器配置版本已保存。'); } catch (error) { fail('配置未保存：' + error.message); } });
$('#reset-config').addEventListener('click', () => { const latest = collectors.find(c => c.siteId === selectedId); if (latest) selectCollector(latest); else fail('当前列表没有此站点，请清空搜索并刷新后还原。'); });
$('#toggle-site').addEventListener('click', () => { if (dirty) { fail('请先保存或还原当前配置草稿，再切换站点启停。'); return; } if (draft) saveConfig({ ...draft.config, enabled: !(draft.enabled ?? draft.config?.enabled) }, '站点启停配置已保存。'); });
$('#validate-site').addEventListener('click', async () => { if (dirty) { fail('请先保存或还原草稿；验证使用已保存的配置版本。'); return; } if (!draft || editorBusy) return; editorBusy = true; setEditorBusy(true); const epoch = session; try { const d = await mutate('/api/admin/collectors/' + encodeURIComponent(selectedId) + '/validate', {}, '单站验证请求已提交，等待执行端领取。'); if (epoch === session && d) $('#admin-status').textContent = `${d.existing ? '已有验证任务' : '验证任务已排队'}：${show(d.jobId)} · ${show(d.status)}`; } catch (e) { if (epoch === session) fail('验证未排队：' + e.message); } finally { if (epoch === session) { editorBusy = false; setEditorBusy(false); } } });
$('#sync').addEventListener('click', async () => { const b = $('#sync'), epoch = session; b.disabled = true; try { const d = await api('/api/admin/sync', {}); record('同步现存资料成功' + (d.result?.snapshotId ? ' · ' + d.result.snapshotId : '')); for (const key of endpointErrors.keys()) if (key.startsWith('提案发布 ')) endpointErrors.delete(key); await load(false); $('#admin-status').textContent = '现存资料同步已完成。'; } catch (e) { if (epoch === session) fail('同步失败：' + e.message); } finally { if (epoch === session) b.disabled = false; } });
async function referrals() { const epoch = session; try { const d = await api('/api/admin/referrals'); $('#referral-results').replaceChildren(raw(d.items ?? d, '已核验推荐链接完整记录')); record('读取已核验推荐链接'); } catch (e) { if (epoch === session) fail('读取推荐链接失败：' + e.message); } }
$('#referral-list').addEventListener('click', referrals);
$('#referral').addEventListener('submit', async e => { e.preventDefault(); const b = e.target.querySelector('button'), epoch = session; b.disabled = true; try { await api('/api/admin/referrals', Object.fromEntries(new FormData(e.target))); record('推荐链接已通过服务端核验并保存'); $('#admin-status').textContent = '推荐链接已保存。'; await referrals(); } catch (error) { if (epoch === session) fail('推荐链接未保存：' + error.message); } finally { if (epoch === session) b.disabled = false; } });
let pollCount = 0;
setInterval(() => {
  if (adminToken && !document.hidden && !loading) return load(false, ++pollCount % 4 === 0);
}, 15000);
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
