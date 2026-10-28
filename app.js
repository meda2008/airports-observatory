import { createCoreCard, createCoreDetail } from './core-view.mjs?v=44d6861deb0cdf21e262a05b2e62bc041b719d551c935d7d933b33a681d97c65';
import { createVerificationPage } from './verification-page.mjs?v=44d6861deb0cdf21e262a05b2e62bc041b719d551c935d7d933b33a681d97c65';
import { createCurrentEvidenceSections } from './current-evidence-view.mjs?v=44d6861deb0cdf21e262a05b2e62bc041b719d551c935d7d933b33a681d97c65';

const $ = (id) => document.getElementById(id);
const labels = { airport: '机场', niche: '小众机场', vpn: 'VPN', proxy: '商业代理', vps: 'VPS', tool: '工具', unknown: '待分类' };
const statusLabels = { parsed: '已取得登记事件', parsed_crtsh: '取得部分CT返回', parsed_certspotter_partial_page: '取得CT第一页', not_collected_rate_limited: '限流未采集', planned_not_collected: '当时未采集', unavailable: '未取得有效材料', unobserved: '尚无观察' };
const state = { catalog: null, sources: null, ledger: null, sourcePromise: null, ledgerPromise: null, routeToken: 0, pageSize: 24 };
const app = $('app');
function el(tag, className, value) { const n = document.createElement(tag); if (className) n.className = className; if (value !== undefined && value !== null) n.textContent = String(value); return n; }
function link(href, label, className = '') { const n = el('a', className, label); if (href.startsWith('#') || href.startsWith('/')) n.href = href; else { try { const u = new URL(href); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) { n.href = u.href; n.target = '_blank'; n.rel = 'noopener noreferrer nofollow'; } } catch {} } return n; }
function button(label, className, action) { const n = el('button', className, label); n.type = 'button'; n.addEventListener('click', action); return n; }
function paragraph(value, className = '') { return el('p', className, value); }
function list(values) { const n = el('ul'); for (const value of Array.isArray(values) ? values : values ? [values] : []) n.append(el('li', '', value)); return n; }
function date(value, full = false) { if (!value || !Number.isFinite(Date.parse(value))) return '尚无可验证时间'; return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', ...(full ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)); }
function shortDate(value) { return value && Number.isFinite(Date.parse(value)) ? date(value) : '未取得材料'; }
function toast(message) { const n = $('toast'); n.textContent = message; n.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { n.hidden = true; }, 3600); }
function download(name, payload, type = 'application/json;charset=utf-8') { const blob = new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)], { type }); const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function copyLink(recordId) { const href = new URL(location.href); href.hash = '/airport/' + recordId; try { await navigator.clipboard.writeText(href.href); toast('记录链接已复制，可分享这条判断。'); } catch { toast('未能复制，请从地址栏复制这条记录的链接。'); } }
const DATA_REVISION = '7c2a6ddc075227a5f18e27fb2d6149c27151ba1f3060437ffaa7364eb6e07faa';
async function getJson(path) {
  const url = new URL(path, document.baseURI);
  url.searchParams.set('snapshot', DATA_REVISION);
  try {
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('资料文件暂不可读取（HTTP ' + response.status + '）');
    return await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('资料请求超过20秒，请重新读取；尚未加载不代表该机场没有资料。');
    throw error;
  }
}
function correctionChannel() { try { const url = new URL(document.body.dataset.correctionsUrl || ''); if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.pathname !== '/meda2008/airports-observatory/issues/new' || url.searchParams.get('template') !== 'evidence-correction.yml' || [...url.searchParams.keys()].some(k => k !== 'template')) return null; return { newIssueUrl: url.href, listUrl: 'https://github.com/meda2008/airports-observatory/issues' }; } catch { return null; } }
function correctionGuidance() { return correctionChannel() ? '可以在下方公开讨论中手动提出更正；需要GitHub登录，提交后公开。不要附订阅链接、账号或付款资料。' : '此站当前尚无在线收件渠道。'; }
async function loadSources() { if (state.sources) return state.sources; if (!state.sourcePromise) state.sourcePromise = getJson('./data/public-sources.json').then(data => { state.sources = new Map((data.items || []).map(s => [s.id, s])); return state.sources; }).catch(error => { state.sourcePromise = null; throw error; }); return state.sourcePromise; }
async function loadLedger() { if (state.ledger) return state.ledger; if (!state.ledgerPromise) state.ledgerPromise = getJson('./data/public-ledger.json').then(data => { state.ledger = data; return data; }).catch(error => { state.ledgerPromise = null; throw error; }); return state.ledgerPromise; }
function eyebrow(text) { return paragraph(text, 'eyebrow'); }
function section(title, contents, className = '', number) { const n = el('section', 'detail-section ' + className); const h = el('h2'); if (number) h.append(el('span', 'section-number', number)); h.append(document.createTextNode(title)); n.append(h); if (Array.isArray(contents)) n.append(list(contents)); else if (contents instanceof Node) n.append(contents); else if (contents) n.append(paragraph(contents)); return n; }
function pageHeading(kicker, title, copy) { const n = el('div', 'page-heading'); n.append(eyebrow(kicker), el('h1', '', title)); if (copy) n.append(paragraph(copy)); return n; }
function bread(label) { const n = el('div', 'breadcrumb'); n.append(link('#/explore', '探索名录'), el('span', '', '/'), el('span', '', label)); return n; }
function fact(name, value, note) { const n = el('div', 'fact'); n.append(el('dt', '', name), el('dd', '', value)); if (note) n.append(el('small', '', note)); return n; }
function fieldLabel(value) { if (value.startsWith('domain:')) return '域名登记 · ' + value.slice(7); if (value.startsWith('certificate:')) return '证书索引 · ' + value.slice(12); return { publicPage: '公开页面', publicOffer: '公开套餐', publicPaymentStatement: '公开支付说明', communitySnapshot: '社区快照' }[value] || '已保留材料'; }
function formatStatus(value) { return statusLabels[value] || '状态尚待核实'; }
function sourceGrade(value) { if (value?.startsWith('E1')) return 'E1 · 单项原始观察'; return value === 'E2' ? 'E2 · 独立来源复核' : value === 'E3' ? 'E3 · 重复测量与复算' : 'E0 · 材料不足'; }
function sourceIndependence(value) { return { I0: '依赖同一上游', I1: '独立性待核', I2: '已核实独立' }[value] || '独立性未核实'; }
function currentRoute() { const [path, query = ''] = (location.hash.slice(1) || '/explore').split('?'); return { path, query: new URLSearchParams(query) }; }
function exploreHash(params) { const q = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value && !(key === 'page' && Number(value) === 1)) q.set(key, value); return '#/explore' + (q.size ? '?' + q.toString() : ''); }
function setActive(name) { for (const a of document.querySelectorAll('[data-nav]')) { const active = a.dataset.nav === name; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); } $('primary-nav').classList.remove('open'); $('menu-toggle').setAttribute('aria-expanded', 'false'); }
function focusContent() { $('main-content').focus({ preventScroll: true }); }
function setPageTitle(title) { document.title = title ? title + ' · 机场观察' : '机场观察 · 付费之前，先看证据'; }
function createHero() {
  const shell=el('section','hero');const copy=el('div');copy.append(eyebrow('机场观察 / 付费前核对'));
  const h=el('h1');h.append(document.createTextNode('价格、体验，'),el('br'),el('em','','先弄清再付费。'));
  copy.append(h,paragraph('查询套餐总价、速度与稳定性、支付方式、运营历史、退款限制和日志政策。已知与未知分别写清，重要条款保留出处。','hero-copy'));
  const links=el('div','hero-links');links.append(link('#/explore?focus=catalog','查询机场 ↓','primary-button'),link('#/method','数据怎么核对 ↗'));copy.append(links);
  const card=el('aside','observation-card');card.append(el('h2','','付费前，先看核心信息。'));
  const primary=state.catalog.items.filter(r=>r.listing?.primary??['airport','niche'].includes(r.category));
  const entries=[['机场与小众机场',primary.length+' 条名称候选'],['有套餐材料',primary.filter(r=>r.coreInfo?.pricing?.plans?.length).length+' 条'],['有实际速度测量',primary.filter(r=>r.coreInfo?.speed?.measured?.status==='scoped_measurements_available'&&r.coreInfo.speed.measured.observations?.length).length+' 条']];
  for(const [name,value]of entries){const row=el('div','receipt-row');row.append(el('span','',name),el('b','',value));card.append(row);}card.append(paragraph('公开标价和商家说明不等于实际体验。缺少依据时明确保留未知。'));shell.append(copy,card);return shell;
}
function createSnapshotStrip(){const n=el('div','snapshot-strip');n.append(el('span','','数据版本生成于 '+date(state.catalog.publishedAt,true)+' · 北京时间'),el('span','','逐项保留采集时间 / 体验以具体网络与测量条件为准'));return n;}
function selectField(label, id, options, selected) { const wrap = el('div', 'field'); const l = el('label', '', label); l.htmlFor = id; const n = el('select'); n.id = id; for (const [value, name] of options) { const o = el('option', '', name); o.value = value; o.selected = value === selected; n.append(o); } wrap.append(l, n); return { wrap, input: n }; }
function createCard(item){return createCoreCard(item,{el,link,paragraph,button,date,section});}
function createExplore(query){
 const shell=el('div','shell');shell.append(createHero(),createSnapshotStrip());
 const top=el('div','section-top');top.id='catalog';const heading=el('div');heading.append(eyebrow('查询核心信息'));const title=el('h2','','机场名录'),count=el('small');title.append(count);heading.append(title);top.append(heading,paragraph('价格、速度、稳定性、支付与运营历史，一页核对。'));shell.append(top);
 const form=el('form','filter-panel core-filter');form.setAttribute('role','search');const wrap=el('div','field');const label=el('label','','名称或域名');label.htmlFor='catalog-search';const input=el('input');input.id='catalog-search';input.type='search';input.placeholder='例如 奶昔、SpeedCat、SS-ID';input.value=query.get('q')||'';wrap.append(label,input);
 const isPrimary=r=>r.listing?.primary??['airport','niche'].includes(r.category);const primary=state.catalog.items.filter(isPrimary);const selected=query.get('category')||'primary';const category=selectField('范围','catalog-category',[['primary','机场与小众机场 · '+primary.length],['airport','机场'],['niche','小众机场'],['other','仅保留资料 · '+(state.catalog.items.length-primary.length)],['all','全部保留资料 · '+state.catalog.items.length],...state.catalog.categories.filter(c=>!['airport','niche'].includes(c.id)).map(c=>[c.id,c.label])],selected);
 const submit=el('button','primary-button','查询');submit.type='submit';form.append(wrap,category.wrap,submit);shell.append(form);const apply=()=>{location.hash=exploreHash({q:input.value.trim(),category:category.input.value==='primary'?'':category.input.value});};form.addEventListener('submit',e=>{e.preventDefault();apply();});category.input.addEventListener('change',apply);
 let rows=state.catalog.items.filter(r=>selected==='primary'?isPrimary(r):selected==='other'?!isPrimary(r):selected==='all'||r.category===selected);const term=(query.get('q')||'').normalize('NFKC').toLocaleLowerCase();if(term)rows=rows.filter(r=>[r.name,r.id,r.officialUrl,r.coreInfo?.website?.url,...(r.domainObservations||[]).map(d=>d.domain)].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase().includes(term));rows.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id));count.textContent=rows.length+' 条';
 const pages=Math.max(1,Math.ceil(rows.length/state.pageSize)),page=Math.min(pages,Math.max(1,Math.floor(Number(query.get('page'))||1)));const toolbar=el('div','list-toolbar');toolbar.append(paragraph(rows.length?'显示 '+((page-1)*state.pageSize+1)+'–'+Math.min(page*state.pageSize,rows.length)+' 条':'没有匹配记录'),button('清空筛选','text-button',()=>{location.hash='/explore';}));shell.append(toolbar);
 if(rows.length){const grid=el('div','resource-grid');for(const item of rows.slice((page-1)*state.pageSize,page*state.pageSize))grid.append(createCard(item));shell.append(grid);}else{const empty=el('div','empty-panel');empty.append(el('h2','','没有匹配到记录'),paragraph('试试更短的名称或域名，也可以选择全部保留资料。'));shell.append(empty);}
 const nav=el('div','pagination');const change=p=>{location.hash=exploreHash({q:query.get('q'),category:selected==='primary'?'':selected,page:p});};const prev=button('← 上一页','',()=>change(page-1)),next=button('下一页 →','',()=>change(page+1));prev.disabled=page<=1;next.disabled=page>=pages;nav.append(prev,el('span','',page+' / '+pages),next);shell.append(nav);return shell;
}
function domainSection(record) { const content = el('div'); if (!record.domainObservations?.length) content.append(paragraph('尚无可用的域名与证书原始观察。')); for (const d of record.domainObservations || []) { const box = el('div', 'source-item'); box.append(el('h3', '', d.domain)); const grid = el('dl', 'fact-grid'); grid.append(fact('登记创建', shortDate(d.registeredAt), '不是开始营业日期'), fact('登记到期', shortDate(d.expiresAt), '不是经营资金或服务有效期限'), fact('登记材料', formatStatus(d.registrationStatus)), fact('证书索引', formatStatus(d.certificateStatus)), fact('证书页内最近颁发', shortDate(d.latestCertificateNotBefore)), fact('观察时刻', date(d.lastObservedAt, true))); box.append(grid); content.append(box); } content.append(paragraph('登记与证书记录仅回答技术事件。自动续期、CDN换证和域名迁移都可能发生；不得直接换算成存活概率。', 'quiet-note')); return section('域名与证书观察', content, '', '04'); }
function communitySection(record) { const c = record.community || {}; const content = el('div'); content.append(paragraph('已抓窗口内相关新议题 ' + (c.originalPostCount ?? '未知') + ' 条、新评论 ' + (c.commentCount ?? '未知') + ' 条。留言活动不是独立投诉数，也不是投诉率。'), paragraph('观察窗口：' + date(c.windowStart) + ' 至 ' + date(c.windowEnd), 'muted')); for (const source of c.originalPosts || []) { const p = paragraph(''); p.append(link(source.url, source.label || '原始议题 ↗', 'text-link')); if (source.createdAt) p.append(document.createTextNode(' · 创建于 ' + date(source.createdAt))); content.append(p); } if (!c.originalPosts?.length) content.append(paragraph('本快照未匹配到可绑定该名称的原帖；这不表示全网没有相关反馈。')); if (c.recoverySignals?.length) { content.append(el('h3', '', '恢复或仍可部分使用的相反线索')); for (const r of c.recoverySignals) { const p = paragraph(r.label || '存在需要一并阅读的恢复或部分可用陈述。'); if (r.url) p.append(document.createTextNode(' '), link(r.url, '查看原始记录 ↗', 'text-link')); content.append(p); } } content.append(paragraph(c.limitation || '同名、相似域名或端点相等，不足以确认经营主体与反馈真实性。', 'quiet-note')); return section(record.currentEvidence ? '首日冻结的社区线索（历史快照）' : '社区线索与相反陈述', content, '', '05'); }
function sourcesSection(record, sources, error) {
  const n = section('原始来源与可追溯材料', null, '', '06');
  if (error) { n.append(paragraph('来源文件暂未读取成功：' + error), button('重新加载来源', 'secondary-button', () => route())); return n; }
  const ids = new Set(record.sourceIds || []);
  const collect = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.sourceIds)) for (const id of value.sourceIds) if (typeof id === 'string' && id) ids.add(id);
    for (const child of Object.values(value)) if (child && typeof child === 'object') collect(child);
  };
  collect(record.coreInfo);
  n.append(paragraph('来源条目数不代表独立信源数。相同上游的重复抓取和转述不会增加独立性。', 'quiet-note'));
  for (const id of ids) {
    const s = sources.get(id), box = el('div', 'source-item'); box.id = 'source-' + id;
    if (!s) { box.append(el('h3', '', '来源目录中暂缺此条'), paragraph(id, 'record-id'), paragraph('字段引用保留此编号，但本次来源目录未提供可展示的材料；请核对版本或提交更正。')); n.append(box); continue; }
    box.append(el('h3', '', s.label || s.id), paragraph(s.id, 'record-id'));
    const url = s.publicReplayUrl || s.url; if (url) box.append(link(url, url));
    if (s.collectionStatus === 'planned_not_collected') box.append(paragraph('当时未采集；此链接仅为重放入口，不是已取得的证据。', 'source-status'));
    box.append(paragraph(sourceGrade(s.evidenceGrade) + ' · ' + sourceIndependence(s.independenceScore)), paragraph('原始观察：' + (s.collectionStatus === 'planned_not_collected' ? '无（当时未采集）' : date(s.observedAt, true))));
    if (s.originalCreatedAt) box.append(paragraph('原帖创建：' + date(s.originalCreatedAt, true)));
    if (s.sha256 || s.containerSha256) box.append(el('code', 'hash', (s.sha256 ? 'SHA256 ' + s.sha256 : '容器 SHA256 ' + s.containerSha256))); else box.append(paragraph('未取得响应字节哈希，不冒充已保留正文。'));
    if (s.snapshotLocator) box.append(paragraph('留存定位：' + s.snapshotLocator));
    if (s.snapshotAccess) box.append(paragraph('原始材料留存用于复核，未在本站重新分发正文。'));
    n.append(box);
  }
  return n;
}
async function createDetail(id){
 const record=state.catalog.items.find(r=>r.id===id);if(!record)return notFound('未找到这条记录','请核对名称或记录编号。');
 const shell=el('div','shell subpage');shell.append(bread(record.name),pageHeading(labels[record.category]||'资料',record.name,'价格和条款按来源记录，速度与稳定性以实际测量为准。'));
 if(record.listing?.reason) shell.append(paragraph('仅保留资料：'+record.listing.reason+' 这不是停服裁决。重新进入默认候选需要：'+record.listing.reinstatementEvidence,'quiet-note'));
 shell.append(createCoreDetail(record,{el,paragraph,section,link,date,button}));
 const actions=el('div','core-actions');actions.append(button('复制这条记录链接','secondary-button',()=>copyLink(id)),link('#/corrections?record='+id,'补充或更正信息','secondary-button'),button('下载记录','secondary-button',()=>download('airports-'+id+'.json',record)));shell.append(actions);
 const drawer=el('details','evidence-drawer');drawer.append(el('summary','','展开套餐条款、来源与留存依据'));
 const earlier=el('details','disclosure');earlier.append(el('summary','','较早的匿名公开采集（保留原时点）'));
 if(record.coreInfo?.website?.relationship==='saved_account_login_succeeded_brand_displayed')earlier.append(paragraph('上方核心信息已合并较新的登录后或条款材料。这里保留匿名请求当时的结果，旧缺失状态不覆盖后来的观察。','quiet-note'));
 earlier.append(createCurrentEvidenceSections(record,{el,paragraph,section,link,date}));drawer.append(earlier);
 const result=await loadSources().then(value=>({value}),error=>({error}));drawer.append(sourcesSection(record,result.value||new Map(),result.error?.message));
 const technical=el('details','disclosure');technical.append(el('summary','','域名技术记录与首日材料'));technical.append(domainSection(record),communitySection(record));drawer.append(technical);shell.append(drawer);setPageTitle(record.name);return shell;
}
function methodPage() {
  const shell = el('div', 'shell subpage');
  shell.append(bread('数据说明'), pageHeading('DATA / 数据说明', '这些信息，能帮你确认什么。', '名录先回答付费前常见的九个问题。每项保留来源与时间，资料不够时写明未知，方便你继续核对。'));
  const measuredCount = state.catalog.items.filter(record => ['speed', 'stability'].some(key => record.coreInfo?.[key]?.measured?.status === 'scoped_measurements_available' && record.coreInfo[key].measured.observations?.length)).length;
  const grid = el('div', 'method-grid');
  const topics = [
    ['01', '标价、起价与实际结算', '周期总额、起价和待询价分别记录，不把半年、年付或整期配额直接改写成月付。币种、附加费、售罄和依赖套餐分别标注；没有下单验证，就不能当作最终扣款金额。'],
    ['02', '宣传带宽与实际测量', measuredCount === 0 ? '当前快照没有合格的实际速度或稳定性测量。站方宣传带宽、官网能打开、评论中的体验都不替代实测，因此相关体验保留未知。' : '当前快照有 ' + measuredCount + ' 条记录包含限定条件的测量。测量只适用于所列时间、地区、网络、套餐、方法和样本，不代表其他用户的体验。'],
    ['03', '成立时间与历史材料', '最早留存页面、站方自述、域名注册和成立时间是不同信息。带日期的当前副本仍需核对编辑和历史归档，不能直接证明当时正文相同；没有连续经营材料，不能据此称作一直营业或老牌。'],
    ['04', '近月问题与投诉来源', '问题和恢复线索一起展示，并保留发生或发表时间。检索覆盖有限，同一陈述可能被转述；线索数不等于独立投诉人数或投诉率，没有匹配到也不等于零投诉。'],
    ['05', '优惠、支付与退款', '支付图标、帮助页提及、公开文字及登录后支付选项分别标注。优惠需核对适用套餐、条件、到期与邀请关联，不能自动从标价中扣减；退款和试用条款也不证明实际可以执行。'],
    ['06', '核对时间与当前状态', '每条资料显示最近核对时间，各来源另有采集时间。网站版本生成时间只代表整理发布；历史材料、近月窗口与今天的状态不能混用，时间未知时明确标出。'],
    ['07', '隐私政策与实际日志', '记录站方说明会收集哪些连接或访问元数据、保留多久，以及是否有独立审计依据。站方声称无日志也不能当作审计结论；没有说明的项目保持未知。']
  ];
  for (const [number, title, copy] of topics) { const box = el('div', 'method-box'); box.append(el('b', '', number), el('h3', '', title), paragraph(copy)); grid.append(box); }
  shell.append(grid);
  const prose = el('div', 'prose');
  prose.append(el('h2', '', '如何使用这份名录'), paragraph('先按名称或域名找到记录，再核对价格、速度、稳定性、支付方式、运营年限、退款与试用、适用网络与设备、近一个月的问题、隐私与日志。每项的“查看依据”可以展开来源；详细套餐、采集时间与留存材料也可以继续展开。'), paragraph('默认展示机场与小众机场，其他类型资料保留在范围筛选中，也可直接访问记录链接。名称相似、候选网址或旧名录收录，不等于已核实同一经营主体。'), el('h2', '', '发现资料有误时'), paragraph('更正材料请注明记录编号、具体字段、原始 URL、材料时间和变化事实。区分亲历、原文陈述和推断；不要提供账号、订阅链接或付款资料。下载模板只在本地生成文件，不会自动发送。' + correctionGuidance()), link('#/corrections', '准备更正材料 ↗', 'text-link'));
  shell.append(prose);
  const appendix = el('details', 'evidence-drawer method-appendix');
  appendix.append(el('summary', '', '附录：证据规则、版本与历史台账'), paragraph('原始来源区保留 URL、观察时间与可用的留存定位。单项原始观察、独立复核和重复测量是不同证据；多次抓取或转述同一材料，不会增加信源独立性。'), paragraph('域名与证书技术记录保留在详情的折叠区。它们只描述技术事件，不能用来推算营业年限、付费线路质量或未来可用概率。'), paragraph('历史预测台账和结算检查继续公开可达；当前资料没有可评分的数值预测，也没有用未知结果冒充准确率。'), link('#/ledger', '查看历史预测与结算台账 ↗', 'text-link'), document.createTextNode(' '), link('#/verify', '核对资料版本 ↗', 'text-link'));
  shell.append(appendix);
  return shell;
}
async function ledgerPage(query) { const data = await loadLedger(); const shell = el('div', 'shell subpage'); shell.append(bread('公开台账')); const intro = el('div', 'ledger-intro'); intro.append(pageHeading('LEDGER / 可追责的判断', '判断留下日期，也留下结果。', '做出判断时记录依据和期限；到期后按原先规则结算。不能用后来的信息改写过去，也不能只挑说对的记录。')); const note = el('div', 'ledger-note'); note.append(el('span', '', '本次公开快照'), el('b', '', '全部为弃判'), paragraph('没有可评分的数值概率。Brier未计算，不能用0分冒充预测准确。')); intro.append(note); shell.append(intro); const metrics = el('div', 'ledger-metrics'); for (const [n, label] of [[data.items.length, '公开台账条目'], [state.catalog.summary.numericPredictions, '可评分数值预测'], ['待开展', '独立结果裁决']]) { const m = el('div'); m.append(el('b', '', n), el('span', '', label)); metrics.append(m); } const settlement = await getJson('./data/public-settlement.json').catch(() => null); if (settlement) { const result = el('section', 'detail-section'); result.append(el('h2', '', '可复算的结算检查'), paragraph('复算时点：' + date(settlement.asOf, true) + ' · 北京时间；弃判 ' + settlement.summary.counts.ABSTAIN + ' 条，可评分 ' + settlement.summary.count + ' 条，Brier ' + (settlement.summary.brier === null ? '未计算' : settlement.summary.brier) + '。'), paragraph('本次只用空裁决输入检查现有台账，没有新增结果，也没有完成独立人工复算。弃判单列，不计入成功、失败或未到期的数值预测。', 'quiet-note')); shell.append(result); } else shell.append(paragraph('结算检查文件暂未读取；未完成不记为通过。', 'quiet-note')); shell.append(metrics, paragraph(data.projectionNotice || '公开投影保留原始条目哈希供与留存材料核对。投影不是完整原始链，不能独立重算原链。', 'quiet-note'));
  shell.append(link('#/verify', '核对版本、下载独立复算工具 ↗', 'text-link')); const tools = el('div', 'list-toolbar'); tools.append(el('span', '', '按做出时的条目保留，尚未到结算期。'), button('下载公开台账 JSON ↓', 'text-button', () => download('airports-public-ledger.json', data))); shell.append(tools); const perPage = 25, pageCount = Math.max(1, Math.ceil(data.items.length / perPage)), page = Math.min(pageCount, Math.max(1, Number(query.get('page')) || 1)); const tableWrap = el('div', 'table-wrap'); const table = el('table'); const head = el('thead'); const tr = el('tr'); for (const t of ['记录', '做出日期', '预测到期', '当前状态', '概率 / 结果']) tr.append(el('th', '', t)); head.append(tr); const body = el('tbody'); for (const entry of data.items.slice((page - 1) * perPage, page * perPage)) { const row = el('tr'); const record = state.catalog.items.find(i => i.id === entry.recordId); const name = record?.name || state.catalog.discoveryCandidates?.find(i => i.id === entry.recordId)?.name || entry.recordId; const td = el('td'); if (record) td.append(link('#/airport/' + record.id, name)); else td.append(el('strong', '', name)); td.append(paragraph(entry.recordId, 'record-id')); row.append(td, el('td', '', date(entry.issuedAt)), el('td', '', date(entry.horizonEnd)), el('td', '', '弃判 · 不可评分'), el('td', '', '未知 / 未结算')); body.append(row); } table.append(head, body); tableWrap.append(table); shell.append(tableWrap); const nav = el('div', 'pagination'); const prev = button('← 上一页', '', () => { location.hash = '/ledger?page=' + (page - 1); }); prev.disabled = page === 1; const next = button('下一页 →', '', () => { location.hash = '/ledger?page=' + (page + 1); }); next.disabled = page === pageCount; nav.append(prev, el('span', '', page + ' / ' + pageCount), next); shell.append(nav); const prose = el('div', 'prose'); prose.append(el('h2', '', '到期后如何结算'), paragraph('可评分预测需要事前冻结的点概率、明确结局和未参与建模的裁决者。Brier是点概率与实际结果之间的平方误差；未知结果、弃判和失访单列，不填成成功，也不记0分。可靠性曲线还需要足够样本，不能用几个案例证明“70%已经校准”。'), paragraph('目前台账只能证明有记录，不能证明模型有效。后续修订应追加版本，不覆盖今天的条目。原始完整材料保留用于独立核对，公开投影已去除不适合直接传播的原始文字与内部信息。')); shell.append(prose); return shell; }
function correctionsPage(query) { const recordId = query.get('record') || ''; const record = state.catalog.items.find(r => r.id === recordId); const shell = el('div', 'shell subpage'); shell.append(bread('更正记录'), pageHeading('CORRECTIONS / 让依据可以被追问', '新证据，应当有一个位置。', '发现名称错配、材料过期或相反证据时，先整理出能复核的事实。更正不应擦掉旧判断，也不该把一条未核实陈述直接升级为结论。')); const grid = el('div', 'correction-grid'); const form = el('form', 'correction-form'); const fields = []; const makeField = (title, id, value, placeholder, area = false) => { const wrap = el('div', 'field'); const l = el('label', '', title); l.htmlFor = id; const input = el(area ? 'textarea' : 'input'); input.id = id; input.value = value || ''; input.placeholder = placeholder; if (!area) input.type = 'text'; wrap.append(l, input); fields.push(input); form.append(wrap); return input; }; const id = makeField('记录编号或名称', 'correction-record', record ? record.id + ' · ' + record.name : recordId, '例如 A001 · WgetCloud'); const field = makeField('需要核查的字段', 'correction-field', '', '例如：经营主体、域名归属、套餐条款、恢复状态'); const url = makeField('原始材料 URL', 'correction-url', '', 'https://…'); const when = makeField('材料发布时间 / 观察时刻', 'correction-date', '', '请注明日期、时间与时区；不确定时写未知'); const facts = makeField('观察到了什么变化', 'correction-facts', '', '具体描述变化，区分亲历、原文陈述和你的推断。不要填写账号、密码、完整订单号等个人资料。', true); const submit = el('button', 'primary-button', '生成并下载更正模板 ↓'); submit.type = 'submit'; form.append(submit, paragraph('只在你的设备生成文本文件，不会自动发送，也不会创建“已提交”记录。' + correctionGuidance(), 'form-note')); form.addEventListener('submit', event => { event.preventDefault(); const content = ['机场观察 · 待核查更正材料', '', '记录：' + id.value.trim(), '字段：' + field.value.trim(), '原始URL：' + url.value.trim(), '材料时间：' + when.value.trim(), '', '变化事实：', facts.value.trim(), '', '核查提示：请区分原始事实、他人陈述和推断，留存原始材料；不要附账号、密码、完整订单号。', '状态：仅生成本地模板，尚未发送或核验。'].join('\n'); download('airports-correction-' + (record?.id || 'draft') + '.txt', content, 'text/plain;charset=utf-8'); toast('更正模板已生成；尚未发送或提交。'); }); const status = el('aside', 'correction-status'); status.append(el('h2', '', '公开更正状态'), paragraph('本版本尚未发布经独立核验的更正条目。没有把生成模板、来源留言或未完成的核查当作已确认更正。')); const channel = correctionChannel(); if (channel) { status.append(link(channel.newIssueUrl, '在公开讨论中提出更正 ↗', 'secondary-button'), paragraph('需要GitHub登录，提交后公开；不要附订阅链接、账号或付款资料。'), link(channel.listUrl, '查看公开更正讨论 ↗', 'text-link')); } const steps = el('ol', 'steps'); for (const [n, text] of [['01', '确定是哪条记录、哪个字段。'], ['02', '保留原始URL、时间与快照。'], ['03', '描述相反证据和影响范围。'], ['04', '经过复核后追加版本，保留旧记录。']]) { const li = el('li'); li.append(el('span', '', n), document.createTextNode(text)); steps.append(li); } status.append(steps, paragraph('更正对象是可复核的命题，不是对动机的猜测。暂时无法判断，也是一种允许保留的结果。')); grid.append(form, status); shell.append(grid); return shell; }
function notFound(title = '这个页面暂不存在', copy = '请返回名录搜索具体名称，或核对链接中的记录编号。') { const n = el('div', 'shell subpage'); const panel = el('div', 'empty-panel'); panel.append(el('h2', '', title), paragraph(copy), link('#/explore', '返回探索名录 →', 'secondary-button')); n.append(panel); return n; }
function renderError(error) { const box = el('div', 'error-panel'); box.append(el('h1', '', '公开资料暂未载入'), paragraph(error.message || '请稍后再试；没有加载成功不代表没有相关资料。'), button('重新读取资料', 'secondary-button', () => start())); app.replaceChildren(box); }
async function route() { if (!state.catalog) return; const token = ++state.routeToken; app.setAttribute('aria-busy', 'true'); const { path, query } = currentRoute(); const nav = path.startsWith('/airport/') ? 'explore' : path.slice(1) || 'explore'; setActive(nav); let content; try { if (path === '/explore' || path === '/') { content = createExplore(query); setPageTitle(''); } else if (/^\/airport\/A\d{3}$/.test(path)) content = await createDetail(path.split('/')[2]); else if (path === '/method') { content = methodPage(); setPageTitle('数据说明'); } else if (path === '/ledger') { content = await ledgerPage(query); setPageTitle('公开台账'); } else if (path === '/verify') { content = createVerificationPage({ el, paragraph, button, link, bread, pageHeading, date, download }); setPageTitle('版本核对'); } else if (path === '/corrections') { content = correctionsPage(query); setPageTitle('更正记录'); } else content = notFound(); if (token !== state.routeToken) return; app.replaceChildren(content); app.setAttribute('aria-busy', 'false'); focusContent(); if (path === '/explore' && (query.has('page') || query.get('focus') === 'catalog')) document.getElementById('catalog')?.scrollIntoView({ block: 'start' }); else window.scrollTo({ top: 0, behavior: 'auto' }); } catch (error) { if (token === state.routeToken) { app.setAttribute('aria-busy', 'false'); renderError(error); } } }
async function start() { try { state.catalog = await getJson('./data/public-catalog.json'); if (!Array.isArray(state.catalog.items) || !state.catalog.summary || !Array.isArray(state.catalog.categories)) throw new Error('公开资料格式不完整。'); $('footer-asof').textContent = '数据版本生成于 ' + date(state.catalog.publishedAt,true) + ' · 北京时间'; await route(); } catch (error) { renderError(error); } }
$('menu-toggle').addEventListener('click', () => { const open = $('primary-nav').classList.toggle('open'); $('menu-toggle').setAttribute('aria-expanded', String(open)); });
document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); focusContent(); $('main-content').scrollIntoView({ block: 'start' }); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('primary-nav').classList.remove('open'); $('menu-toggle').setAttribute('aria-expanded', 'false'); } });
window.addEventListener('hashchange', () => route());
start();
