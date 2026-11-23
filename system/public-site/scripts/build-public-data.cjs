'use strict';

// Publication is an explicit projection of the evidence snapshot. Never copy the
// runtime catalog or its retained raw archive into publicly served assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { freshness } = require('../../lib/catalog-service.cjs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, '../data');
const MANIFEST = path.join(OUT, 'publication-manifest.json');
const PROJECTION_VERSION = '1.5.22';
const {makeCoreInfo}=require('../../lib/core-info.cjs');
const IDENTITY_PAGE_CLUES = new Set(['A012', 'A190', 'A192', 'A195', 'A202', 'A072']);
const INPUTS = {
  catalog: path.join(ROOT, 'catalog/catalog.v1.json'),
  sources: path.join(ROOT, 'catalog/source-provenance.json'),
  ledger: path.join(ROOT, 'catalog/forecast-ledger.v1.ndjson')
};
const REFRESH_FILE=path.join(ROOT,'catalog/current-evidence.v1.json');
if(fs.existsSync(REFRESH_FILE))INPUTS.currentEvidence=REFRESH_FILE;
const CORE_FILE=path.join(ROOT,'catalog/core-supplement.v1.json');if(fs.existsSync(CORE_FILE))INPUTS.coreSupplement=CORE_FILE;
const NON_PRODUCT_ENTRY_STATUSES = new Map([
  ['product_category_conflict', '保存入口当前介绍其他类型的产品或服务，尚未取得可绑定原机场的经营入口。'],
  ['saved_entry_cloud_phone_observed', '保存入口当前介绍云手机产品，尚未取得可绑定原机场的经营入口。'],
  ['demonstration_site_not_verified_official_service', '保存入口明确自称演示站点，尚未确认真实机场经营入口。'],
  ['saved_domain_for_sale_observed', '保存入口显示域名待售，尚未确认该服务的现行经营入口。'],
  ['saved_entry_personal_blog_observed', '保存入口显示个人博客，尚未取得可绑定该机场的业务入口。']
]);
function listingScope(record, coreInfo) {
  const airport = ['airport', 'niche'].includes(record.category);
  const reason = NON_PRODUCT_ENTRY_STATUSES.get(coreInfo.website?.status);
  return { primary: airport && !reason, ...(airport && reason ? { reason, observedAt: coreInfo.website.observedAt, sourceIds: coreInfo.website.sourceIds, reinstatementEvidence: '可核验的当前官方经营入口及其与原记录的归属关系。' } : {}) };
}
const CATEGORY_LABELS = {
  airport: '机场', niche: '小众机场', vpn: 'VPN', proxy: '商业代理',
  vps: 'VPS', tool: '工具', unknown: '待分类'
};
const QUERY_ALLOWLIST = {
  'crt.sh': new Set(['q', 'output']),
  'api.certspotter.com': new Set(['domain', 'include_subdomains', 'expand']),
  'api.github.com': new Set(['since', 'state', 'sort', 'direction', 'per_page', 'page'])
};
const FRAGMENT_ALLOWLIST={
  'sygzfd.kexintztz2.xyz':new Set(['#/plans','#/knowledge','#/order/5?period=year_price','#/order/7?period=month_price','#/order/1?period=month_price','#/order/2?period=month_price','#/order/3?period=month_price','#/order/4?period=month_price','#/order/6?period=onetime_price']),
  'rtbinm.ztfxkl.xyz':new Set(['#/plans','#/knowledge','#/order/7?period=year_price','#/order/9?period=month_price','#/order/3?period=month_price','#/order/4?period=month_price','#/order/5?period=month_price','#/order/6?period=month_price']),
  'shanhai.cfd':new Set(['#/plan','#/plan/1']),
  'nvbnb.lonka.click':new Set(["#/knowledge","#/order/10?period=onetime_price","#/order/1?period=month_price","#/order/2?period=month_price","#/order/3?period=month_price","#/order/4?period=month_price","#/order/5?period=year_price","#/order/6?period=month_price","#/order/8?period=onetime_price","#/order/9?period=month_price","#/plans"]),
  'tagss.pro':new Set(['#/shop']),
  'efbng.guangzssytt.buzz':new Set(['#/plans','#/order/5?period=onetime_price','#/order/7?period=year_price','#/order/1?period=month_price','#/order/2?period=month_price','#/order/3?period=month_price','#/order/4?period=month_price','#/order/6?period=month_price']),
  'ednovas.org':new Set(['#/stage/buysubs']),
  'board.cloudnier.com':new Set(['#/stage/dashboard','#/stage/buysubs']),
  'in.mesl.cloud':new Set(['#/shop','#/wallet/deposit','#/docs']),
  'shop.starpro.one':new Set(['#/plan','#/knowledge']),
  'www.xiaoliyu.me':new Set(['#/plan','#/knowledge','#/dashboard']),
  'dv2dsdgf.quanqiugttt1.club':new Set(['#/plans']),
  'tntvipaffb01.cc':new Set(['#/plan','#/dashboard','#/knowledge']),
  'shadow-airport.top':new Set(['#/plan']),
  'access.naiunet.com':new Set(['#/plan','#/dashboard','#/knowledge']),
  'home.99ba2026.best':new Set(['#/plan']),
  'access.shandiancn.com':new Set(['#/plan','#/plan/3','#/plan/6','#/plan/20','#/dashboard','#/knowledge']),
  '33.33laomao.com':new Set(['#/login','#/plan','#/plan/5','#/plan/6','#/plan/1','#/plan/2','#/plan/3','#/knowledge']),
  'cloud.e-ix.com':new Set(['#/','#/shop','#/docs','#/order-confirm?id=14&period=year_price']),
  'ofosg.com':new Set(['#/plan','#/plan/37','#/plan/38','#/plan/39','#/knowledge']),
  'www.paopao.dog':new Set(['#/dashboard','#/plan','#/plan/31','#/plan/32','#/plan/33','#/plan/34','#/knowledge']),
  'eggtartcloud.dev':new Set(['#/plan','#/plan/16','#/plan/17','#/plan/18','#/plan/19','#/plan/20','#/plan/21','#/plan/22','#/knowledge']),
  'oknbg.fjumpy.mom':new Set(['#/login','#/dashboard','#/plans','#/order/5?period=year_price','#/order/1?period=month_price','#/order/2?period=month_price','#/order/3?period=month_price','#/order/4?period=month_price','#/order/8?period=onetime_price','#/order/9?period=onetime_price','#/order/10?period=onetime_price']),
  'binfk.szjtfp.xyz':new Set(['#/login','#/dashboard','#/plans','#/order/6?period=month_price','#/order/5?period=year_price','#/order/1?period=month_price','#/order/2?period=month_price','#/order/3?period=month_price','#/order/4?period=month_price']),
  'mkrused.v2saat.club':new Set(['#/plans','#/knowledge','#/order/14?period=year_price','#/order/1?period=year_price','#/order/15?period=month_price','#/order/3?period=month_price','#/order/4?period=month_price','#/order/5?period=month_price','#/order/13?period=onetime_price','#/order/12?period=onetime_price','#/order/6?period=onetime_price']),
  'help.ednovas.me':new Set(['#tui-kuan-shuo-ming','#bei-l','#ding-zhi'])
};
// Exact business-page fragments observed in retained captures. No wildcard routes,
// account/order identifiers, encoded paths or fragment query parameters are admitted.
const ADDITIONAL_REPLAY_FRAGMENTS = {
  "npqikg.wavenetttt.sbs": [
    "#/plans",
    "#/knowledge",
    "#/order/5?period=year_price"
  ],
  "a01.xxfaffa01.cc": ["#/store", "#/help"],
  "aff01.zygbx.com": ["#/plan", "#/knowledge"],
  "191.101.132.80": [
    "#/dashboard",
    "#/plan"
  ],
  "33.33laomao.com": [
    "#/dashboard"
  ],
  "99vpn.bar": [
    "#/plan"
  ],
  "aicoffee.app": [
    "#/knowledge",
    "#/plan"
  ],
  "asdfb4.xingdaotatt.homes": [
    "#/plans"
  ],
  "asfawsf.twilightttt.sbs": [
    "#/plans"
  ],
  "cloud.e-ix.com": [
    "#/dashboard",
    "#/docs/20",
    "#/docs/32",
    "#/docs/54",
    "#/wallet/deposit"
  ],
  "dhues.jilianat.homes": [
    "#/knowledge",
    "#/plans"
  ],
  "downloadshare.breezenetttt.sbs": [
    "#/plans"
  ],
  "dv2dsdgf.quanqiugttt1.club": [
    "#/knowledge"
  ],
  "fdsh.kuajiecloudtttt.xyz": [
    "#/plans"
  ],
  "fly.fireflyxx.cfd": [
    "#/plans"
  ],
  "guolicheng.cc": [
    "#/knowledge",
    "#/plan"
  ],
  "hjusdr.u1sat.my": [
    "#/knowledge",
    "#/plans"
  ],
  "in.mesl.cloud": [
    "#/dashboard",
    "#/docs/61",
    "#/docs/68"
  ],
  "kkj.flashleaptt.xyz": [
    "#/plans"
  ],
  "lingmao.civetxx.cfd": [
    "#/plans"
  ],
  "mkrused.v2saat.club": [
    "#/dashboard"
  ],
  "nicecloud.co": [
    "#/docs",
    "#/plans"
  ],
  "nvbnb.lonka.click": [
    "#/dashboard"
  ],
  "nyxen.org": [
    "#/knowledge",
    "#/plan"
  ],
  "ofosg.com": [
    "#/dashboard"
  ],
  "oknbg.fjumpy.mom": [
    "#/knowledge"
  ],
  "pigfnv.civetnetfttt1.xyz": [
    "#/plans"
  ],
  "portal.skylinx.org": [
    "#/dashboard",
    "#/knowledge",
    "#/plan"
  ],
  "shanhai.cfd": [
    "#/knowledge"
  ],
  "shop.starpro.one": [
    "#/dashboard"
  ],
  "ss-id.com": [
    "#/dashboard",
    "#/docs/45",
    "#/shop",
    "#/wallet/deposit"
  ],
  "user.665353.xyz": [
    "#/plan"
  ],
  "vip.ytjcok.org": [
    "#/shop"
  ],
  "vv3dbvb.guangnianertt1.homes": [
    "#/knowledge",
    "#/plans"
  ],
  "www.nicecc.cc": [
    "#/docs/3",
    "#/shop"
  ],
  "www.night-furyx.com": [
    "#/knowledge",
    "#/plan"
  ],
  "wy5y.worryfreexx.cfd": [
    "#/plans"
  ]
};
for (const [host, fragments] of Object.entries(ADDITIONAL_REPLAY_FRAGMENTS)) {
  const allowed = FRAGMENT_ALLOWLIST[host] ||= new Set();
  for (const fragment of fragments) allowed.add(fragment);
}
QUERY_ALLOWLIST['justmysocks.net']=new Set(['action','id','gid','language']);
QUERY_ALLOWLIST['www.justmysocks.net']=QUERY_ALLOWLIST['justmysocks.net'];
QUERY_ALLOWLIST['mojie.app']=new Set(['id']);
QUERY_ALLOWLIST['a04.xiaomiaffa01.cc']=new Set(['id']);
QUERY_ALLOWLIST['w01.fcwebb05.cc']=new Set(['id']);
QUERY_ALLOWLIST['inv06.lmaff01.cc']=new Set(['id']);
QUERY_ALLOWLIST['www.v2ex.com']=new Set(['id','topic_id','node_name','page']);
QUERY_ALLOWLIST['v2ex.com']=QUERY_ALLOWLIST['www.v2ex.com'];
QUERY_ALLOWLIST['t.me']=new Set(['before','after']);

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function iso(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRetainedPublicAnnouncement(url) {
  return url.origin === 'https://nexuscloud.ch' && url.pathname === '/index.php' &&
    url.searchParams.size === 1 &&
    new Set(['/announcements/2/SSR.html', '/announcements/1/XIANYUCLOUD-IS-BEST.html']).has(url.searchParams.get('rp'));
}

function isRetainedPublicProductConfiguration(url) {
  return url.origin === 'https://galaxycloud.cc' && url.pathname === '/checkout' &&
    new Set(['?id=2', '?id=3', '?id=4', '?id=5', '?id=6', '?id=7']).has(url.search);
}

function isRetainedPublicPaymentSelector(url) {
  return url.origin === 'https://api-flowercloud.com' && url.pathname === '/cart.php' && url.search === '?a=checkout';
}

function isRetainedPublicProductCatalog(url) {
  return url.origin === 'https://y-too.net' && url.pathname === '/cart.php' && url.search === '?gid=4';
}

function safeUrl(value, allowPublicQuery = false) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (/^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname) || url.hostname === '[::1]') return null;
    if (/\/(?:auth|login|register|invite|ref|r|f)(?:\/|$)/i.test(url.pathname)) url.pathname = '/';
    // Retain only observed public announcement or product routes, never account IDs.
    // Extra, duplicate and encoded parameters do not match these exact routes.
    const retainedBusinessRoute = isRetainedPublicAnnouncement(url) || isRetainedPublicProductConfiguration(url) || isRetainedPublicPaymentSelector(url) || isRetainedPublicProductCatalog(url);
    if (retainedBusinessRoute) {
      // Keep the single public route parameter in both navigation and replay URLs.
    } else if (allowPublicQuery && QUERY_ALLOWLIST[url.hostname]) {
      for (const key of [...url.searchParams.keys()]) {
        if (!QUERY_ALLOWLIST[url.hostname].has(key)) url.searchParams.delete(key);
      }
    } else {
      url.search = '';
    }
    const fragmentOriginAllowed = url.hostname !== 'npqikg.wavenetttt.sbs' || (url.protocol === 'https:' && !url.port && url.pathname === '/');
    if (!fragmentOriginAllowed || (!(url.hostname === 'github.com' && /^#issuecomment-\d+$/.test(url.hash)) && !FRAGMENT_ALLOWLIST[url.hostname]?.has(url.hash))) url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function forecast(record) {
  assert.equal(record.forecast.status.toLowerCase(), 'abstain');
  assert.equal(record.forecast.probabilityInterval, null);
  assert.equal(record.forecast.pointProbability, null);
  return {
    id: record.forecast.id,
    status: 'abstain',
    horizonDays: record.forecast.horizonDays,
    issuedAt: iso(record.forecast.issuedAt),
    horizonEnd: iso(record.forecast.horizonEnd),
    adjudicationNotBefore: iso(record.forecast.adjudicationNotBefore),
    probabilityInterval: null,
    pointProbability: null,
    baselineStatus: 'unidentified',
    scorable: false
  };
}

function sourceLabel(source) {
  if(source.source_type==='operator_terms_http_response')return '站方服务条款原始响应；只证明当时的政策声明，执行情况与经营主体未独立核验';
  if(source.source_type==='third_party_review')return '第三方评测及关联核对材料；测试条件、时间与商业关系单列，未经本站独立复测';
  if(source.source_type==='search_log')return '检索过程留存记录；没有可引用的原始页面，不作为机场事实证据';
  if(source.source_type==='operator_help')return '站方帮助文档原始响应；支付和退款说明不等于交易验证';
  if(source.source_type==='public_rendered_dom')return '公开页面渲染后的业务区域原文；宣传和实测分别核对';
  if(source.source_type==='authenticated_rendered_dom')return '登录后页面的业务区域原文；需登录复核，未执行支付或服务测试';
  if(source.source_type==='operator_terms_rendered_dom')return '浏览器留存的站方条款原文；条款适用性和执行情况未独立验证';
  if(source.source_id.startsWith('CORE-AUTH-'))return '登录后页面的业务区域原文；需登录复核，未执行支付或服务测试';
  if(source.source_id.startsWith('CORE-'))return '运营历史原始材料；成立、历史资料与连续经营分别核对';
  if(source.source_id.startsWith('COMM-'))return '本轮公开讨论原始响应；用户陈述未独立核实';
  if (source.publicReplayStatus === 'planned_not_collected') return '预留的公开查询入口；当时未采集';
  if (typeof source.capture_status === 'number' && source.capture_status >= 400) {
    return '公开查询得到HTTP ' + source.capture_status + '受限或错误响应，未取得该项有效材料。';
  }
  if (source.source_type === 'rdap') return '注册局登记事件的公开响应';
  if (['crtsh', 'certspotter'].includes(source.source_type)) return '证书透明度索引的返回或采集记录';
  if (source.source_id.startsWith('GH-')) return '公开讨论记录；用户陈述与主体关联未独立核实';
  return '公开网页采集记录；不代表付费业务已验证';
}

function snapshotLocator(source) {
  const entries = (source.originalContainers || []).map(item => item.archiveEntry)
    .filter(value => typeof value === 'string' && value && !path.isAbsolute(value) && !/^[a-z]:/i.test(value));
  if (!entries.length) return null;
  return String(source.archiveRef || 'retained-public-evidence') + ' / ' + entries.join(' ; ');
}

function build() {
  const inputBytes = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, fs.readFileSync(file)]));
  const inputHashes = Object.fromEntries(Object.entries(inputBytes).map(([key, bytes]) => [key, hash(bytes)]));
  const inputFingerprint = hash(JSON.stringify(inputHashes));
  const oldManifest = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : null;
  const publishedAt = oldManifest?.inputFingerprint === inputFingerprint
    ? oldManifest.publishedAt : new Date().toISOString();
  const now = Date.parse(publishedAt);
  const catalog = JSON.parse(inputBytes.catalog.toString('utf8'));
  const sourceInput = JSON.parse(inputBytes.sources.toString('utf8'));
  const refresh=inputBytes.currentEvidence?JSON.parse(inputBytes.currentEvidence.toString('utf8')):null;
  if(refresh){const{validateCurrentEvidence}=require('../../lib/current-evidence.cjs');validateCurrentEvidence(refresh,new Set(catalog.catalog.map(r=>r.id)));sourceInput.sources.push(...refresh.sources);}
  const refreshRecords=new Map((refresh?.items||[]).map(item=>[item.recordId,item]));
  const coreSupplement=inputBytes.coreSupplement?JSON.parse(inputBytes.coreSupplement.toString('utf8')):{records:[],sources:[]};sourceInput.sources.push(...coreSupplement.sources);const coreRecords=new Map(coreSupplement.records.map(r=>[r.recordId,r]));
  const ledgerInput = inputBytes.ledger.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const evidenceAsOf = iso(catalog.evidenceFrozenAt);
  const sourceMap = new Map(sourceInput.sources.map(source => [source.source_id, source]));

  const publicSources = sourceInput.sources.map(source => ({
    id: source.source_id,
    sourceType: source.source_type,
    label: sourceLabel(source),
    url: safeUrl(source.navigationUrl || source.url),
    originalRequestUrl: safeUrl(source.originalRequestUrl, true),
    publicReplayUrl: safeUrl(source.publicReplayUrl, true),
    collectionStatus: source.publicReplayStatus === 'planned_not_collected'
      ? 'planned_not_collected'
      : source.sha256 || source.container_sha256 ? 'response_observed' : 'not_observed',
    httpStatus: numberOrNull(source.capture_status),
    observedAt: source.publicReplayStatus === 'planned_not_collected' || (!source.sha256&&!source.container_sha256) ? null : iso(source.last_capture_at),
    lastAttemptAt: source.publicReplayStatus === 'planned_not_collected' ? null : iso(source.last_capture_at),
    originalCreatedAt: iso(source.original_created_at),
    editedAt: iso(source.edited_at),
    sha256: source.sha256 || null,
    containerSha256: source.container_sha256 || null,
    independenceScore: source.independence_score === 'I0' ? 'I0' : 'I1',
    independenceVerified: false,
    dependencyGroup: 'group-' + hash(String(source.dependency_group || source.source_id)).slice(0, 16),
    evidenceGrade: source.grade || 'E0',
    snapshotLocator: snapshotLocator(source),
    snapshotAccess: 'retained_for_audit_not_publicly_served'
  }));
  const publicSourceMap = new Map(publicSources.map(source => [source.id, source]));

  const items = catalog.catalog.map(record => {
    assert.equal(record.decisionStatus, 'insufficient_evidence');
    assert.equal(record.futureUsabilityGrade, 'E0');
    const current=refreshRecords.get(record.id)||null;
    const sourceIds = [...new Set([...(record.provenanceIds || []),...(current?.sourceIds||[]),...(coreRecords.get(record.id)?.sourceIds||[])])];
    assert.ok(sourceIds.every(id => sourceMap.has(id)), 'record source missing: ' + record.id);
    const materialValidityFields = freshness(record, now).fields.map(field => ({
      field: field.field,
      observedAt: iso(field.capturedAt),
      ttlHours: field.ttlHours,
      expiresAt: iso(field.capturedAt)
        ? new Date(Date.parse(field.capturedAt) + field.ttlHours * 3600000).toISOString() : null
    }));
    const observedExpiries = materialValidityFields.map(field => field.expiresAt).filter(Boolean).sort();
    const domains = (record.domainObservations || []).map(domain => ({
      domain: domain.domain,
      identityVerified: false,
      registrationStatus: domain.registrationStatus,
      registeredAt: iso(domain.registeredAt),
      expiresAt: iso(domain.expiresAt),
      certificateStatus: domain.certificateStatus,
      latestCertificateNotBefore: iso(domain.latestCertificateNotBefore),
      latestCertificateNotAfter: iso(domain.latestCertificateNotAfter),
      certificateRowsReturned: numberOrNull(domain.certificateRowsReturned),
      certificateHistoryComplete: false,
      lastObservedAt: iso(domain.lastSuccessfulCaptureAt),
      sourceIds: [...new Set((domain.observations || []).map(item => item.provenanceId))].filter(id => publicSourceMap.has(id)),
      limitation: '登记创建与到期、证书记录均不证明运营年限或付费线路可用。'
    }));
    const pages = (record.pageObservations || []).map(page => ({
      sourceId: page.provenanceId,
      url: safeUrl(page.url),
      observedAt: iso(page.capturedAt),
      httpStatus: numberOrNull(page.httpStatus),
      observationLabel: page.httpStatus === 200
        ? '取得公开页面响应；内容、身份和付费业务仍需分别核验。'
        : page.httpStatus ? '本次公开页面采集未取得200响应；不能据此推断服务状态。'
          : '本次未取得有效公开页面响应；服务状态未知。'
    }));
    const community = record.community || {};
    const originalPosts = (community.originalPosts || []).map(post => ({
      sourceId: post.provenanceId,
      url: safeUrl(publicSourceMap.get(post.provenanceId)?.publicReplayUrl || post.url, true),
      createdAt: iso(post.createdAt),
      label: '公开讨论 #' + post.issueNumber + '；身份关联和陈述待核',
      endpointMatchOnly: post.endpointMatch === true,
      operatorIdentityVerified: false
    }));
    const recoverySignals = (community.recoverySignals || []).map(signal => ({
      sourceId: signal.provenanceId,
      url: safeUrl(publicSourceMap.get(signal.provenanceId)?.publicReplayUrl || signal.url, true),
      createdAt: iso(signal.createdAt),
      label: '存在恢复或部分可用的用户陈述线索；尚未独立复核。'
    }));
    const supportSignals = [];
    for (const domain of domains) {
      if (domain.registrationStatus === 'parsed') {
        supportSignals.push(domain.domain + '：登记创建 ' + (domain.registeredAt || '未取得')
          + '，登记到期 ' + (domain.expiresAt || '未取得') + '。这只是登记事件。');
      }
      if (domain.certificateRowsReturned !== null) {
        supportSignals.push(domain.domain + '：取得 ' + domain.certificateRowsReturned
          + ' 项证书索引返回，返回范围不代表完整历史或营业状态。');
      }
    }
    if (record.publicOffer?.snapshotFound) supportSignals.push('留存了公开套餐页面文本；没有据此确认当前可下单。');
    if (record.publicPayment?.statementSnapshotFound) supportSignals.push('留存了公开支付说明；没有验证实际交易或退款。');
    if (recoverySignals.length) supportSignals.push('公开讨论中也保留恢复或部分可用的相反线索，不能只选取负面陈述。');
    if (!supportSignals.length) supportSignals.push('当前公开材料尚不足以形成可用性结论。');
    const counterSignals = ['经营主体与名录网址的关系尚未独立核实。'];
    const identityClue = IDENTITY_PAGE_CLUES.has(record.id) ? {
      status: 'page_relation_unverified',
      label: '该名录网址的页面内容与名称或服务类型关系待核，应先确认官方归属。',
      observedAt: pages.map(page => page.observedAt).filter(Boolean).sort().at(-1) || null,
      sourceIds: pages.map(page => page.sourceId).filter(id => publicSourceMap.has(id)),
      basis: 'frozen_public_page_observation_not_legacy_status_labels'
    } : null;
    if (identityClue) counterSignals.unshift(identityClue.label);
    if (domains.some(domain => domain.registrationStatus !== 'parsed')) counterSignals.push('部分域名登记材料缺失；不能把未取得材料解释成没有登记。');
    if (domains.some(domain => domain.certificateRowsReturned === null)) counterSignals.push('证书索引覆盖有缺失或限流；不能把未取得材料解释成没有证书。');
    if (pages.some(page => page.httpStatus !== 200)) counterSignals.push('存在公开页面采集未取得有效响应的情况；一次采集结果不等于付费业务状态。');
    if (originalPosts.length) counterSignals.push('有可定位的社区讨论线索，但名称或端点关联不等于同一经营主体，留言数量也不是投诉率。');
    counterSignals.push('缺少有代表性的历史生存样本与该用户线路测量，不能从技术材料推出未来可用概率。');
    const coreInfo=makeCoreInfo({...record,currentEvidence:current,coreSupplement:coreRecords.get(record.id)||null},{asOf:publishedAt});
    return {
      id: record.id,
      name: record.name,
      category: record.category,
      officialUrl: coreInfo.website.status === 'rejected_search_page' ? null : safeUrl(record.officialUrl),
      officialUrlStatus: coreInfo.website.status === 'rejected_search_page' ? 'not_confirmed' : 'candidate_unverified',
      identityStatus: 'unverified_operator',
      identityClueStatus: identityClue ? 'page_relation_unverified' : 'operator_unverified',
      identityConflict: identityClue !== null,
      identityClue,
      observedAt: iso(record.observedAt),
      publishedAt,
      materialExpiresAt: observedExpiries[0] || null,
      materialExpiryLabel: '已观测材料中最早的时效截止；不表示业务有效期。',
      materialValidityFields,
      decisionStatus: 'insufficient_evidence',
      decisionLabel: '证据不足，不宜仅据本页付费',
      currentUsability: '目前无法判断',
      evidenceGrade: record.evidenceGrade,
      futureUsabilityGrade: 'E0',
      forecast: forecast(record),
      supportSignals,
      counterSignals,
      missingEvidence: record.missingEvidence,
      flipConditions: '取得该项缺失证据并完成独立复核后，追加修订；数值预测还需历史样本、时间验证与校准。',
      dataGaps: [...(record.dataGaps || [])],
      domainObservations: domains,
      pageObservations: pages,
      community: {
        windowStart: iso(community.windowStart),
        windowEnd: iso(community.windowEnd),
        originalPostCount: community.originalPostCount || 0,
        commentCount: community.commentCount || 0,
        originalPosts,
        recoverySignals,
        originalPostCreatedDistribution: community.originalPostCreatedDistribution || {},
        commentCreatedDistribution: community.commentCreatedDistribution || {},
        limitation: '仅为已抓取仓库的讨论活动；未匹配不表示零投诉，用户陈述未获独立真实性裁决。'
      },
      publicOffer: {
        snapshotFound: record.publicOffer?.snapshotFound === true,
        observedAt: iso(record.publicOffer?.observedAt),
        validationLabel: '机器筛选的公开套餐文本，不是结算或付费功能验证。'
      },
      publicPayment: {
        statementSnapshotFound: record.publicPayment?.statementSnapshotFound === true,
        observedAt: iso(record.publicPayment?.observedAt),
        validationLabel: '公开支付说明，不是交易或退款验证。'
      },
      sourceIds,
      currentEvidence:current,
      coreInfo,
      listing:listingScope(record,coreInfo)
    };
  });

  const discoveryCandidates = catalog.discoveryCandidates.map(record => ({
    id: record.id,
    name: record.name,
    category: record.category,
    decisionStatus: 'not_admitted',
    decisionLabel: '未入库候选；身份与证据待核',
    missingEvidence: '【待补：官方域名与经营主体的原始归属证据】',
    forecast: forecast(record)
  }));
  const summary = {
    totalCatalog: items.length,
    discoveryCount: discoveryCandidates.length,
    recordsWithDomainEvents: items.filter(item => item.domainObservations.some(domain => domain.registrationStatus === 'parsed')).length,
    recordsWithCT: items.filter(item => item.domainObservations.some(domain => domain.certificateRowsReturned !== null)).length,
    numericPredictions: 0,
    sourceCount: publicSources.length,
    ledgerEntries: ledgerInput.length,
    independentOperatorCount: null
  };
  const categories = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id, label, count: items.filter(item => item.category === id).length
  }));
  const publicCatalog = {
    schemaVersion: 'airports-public-catalog.v1', projectionVersion: PROJECTION_VERSION, publishedAt, evidenceAsOf,
    snapshotType: 'frozen_public_observations_not_live_monitoring',
    observationWindow: {
      startedAt: iso(catalog.sourceObservationWindow?.startedAt),
      frozenAt: evidenceAsOf
    },
    summary, categories, items, discoveryCandidates,
    currentResearch:refresh?{researchAsOf:refresh.researchAsOf,summary:refresh.summary,windowStart:refresh.windowStart,windowEnd:refresh.windowEnd,
      coverage:refresh.coverage,limitations:refresh.limitations}:null,
    limitations: [
      '名称候选数不等于独立经营主体数。',
      '公开网页、登记和证书事件不证明付费线路可用。',
      '全部数值预测弃判；未知不表示安全，也不记作零风险。',
      '数据是明确时点的材料快照，不是持续实时监测。',
      '原始响应留存供复算；本公开版本只提供限定摘要、来源链接和完整性标识。'
    ]
  };
  const publicLedger = {
    schemaVersion: 'airports-public-ledger.v1', projectionVersion: PROJECTION_VERSION, publishedAt, evidenceAsOf,
    projectionNotice: '这是原始台账的白名单公开投影，已省略原始全文等字段，不能用该投影独立重算原哈希链。原始条目哈希用于与留存原件核对，不是公开版本防篡改公证。',
    summary: {entries: ledgerInput.length, numericPredictions: 0, scorablePredictions: 0, brier: null, calibrationCurve: null},
    items: ledgerInput.map(entry => {
      assert.equal(entry.status.toLowerCase(), 'abstain');
      assert.equal(entry.point_probability, null);
      assert.equal(entry.probability_interval, null);
      assert.equal(entry.scorable, false);
      return ({
      forecastId: entry.forecast_id,
      recordId: entry.record_id,
      version: entry.version,
      issuedAt: iso(entry.issued_at),
      horizonEnd: iso(entry.horizon_end),
      adjudicationNotBefore: iso(entry.outcome_adjudication_not_before),
      status: 'abstain',
      probabilityInterval: null,
      pointProbability: null,
      outcome: null,
      scorable: false,
      sourceIds: [...(entry.evidence_refs || [])],
      originalEntrySha256: entry.entry_sha256
    });})
  };
  const publicSourceDocument = {
    schemaVersion: 'airports-public-sources.v1', projectionVersion: PROJECTION_VERSION, publishedAt, evidenceAsOf,
    sourceCount: publicSources.length,
    independenceNotice: 'I0为依赖同一上游或索引通道；I1为独立性待核。没有因网址数量而升级为两个独立信源。',
    archiveNotice: '这里只发布元数据、来源链接与留存档案定位。完整网页和原始档案不作为公开下载内容。',
    urlPolicyNotice: '公开链接保留必要的安全查询与定位，完整原始请求以留存材料为准。',
    integrityNotice: '哈希用于核对留存字节，不证明历史公开时点，也不构成独立真实性裁决。',
    items: publicSources
  };

  const validation = validate(publicCatalog, publicSourceDocument, publicLedger);
  fs.mkdirSync(OUT, {recursive: true});
  const documents = {
    'public-catalog.json': publicCatalog,
    'public-sources.json': publicSourceDocument,
    'public-ledger.json': publicLedger
  };
  const outputFiles = [];
  for (const [name, content] of Object.entries(documents)) {
    // Large browser inputs stay complete while avoiding formatting-only bytes.
    // Keep ledger serialization unchanged for the frozen settlement input hash.
    const compact = name === 'public-catalog.json' || name === 'public-sources.json';
    const bytes = Buffer.from(JSON.stringify(content, null, compact ? 0 : 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(OUT, name), bytes);
    outputFiles.push({file: name, sha256: hash(bytes), bytes: bytes.length});
  }
  const manifest = {
    schemaVersion: 'airports-publication-manifest.v1', projectionVersion: PROJECTION_VERSION, publishedAt, evidenceAsOf,
    inputFingerprint,
    inputs: Object.entries(inputHashes).map(([artifact, sha256]) => ({artifact, sha256})),
    outputs: outputFiles,
    publicationScope: 'whitelisted_neutral_metadata_only',
    rawArchivesPublished: false,
    originalLedgerReproducibleFromProjection: false,
    validation
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  // Source packaging may execute with public-site as cwd. Keep timestamped
  // validation receipts out of that checkout unless an external target is given.
  const siteRoot = path.resolve(__dirname, '..');
  const relativeCwd = path.relative(siteRoot, process.cwd());
  const externalCwd = relativeCwd.startsWith('..') || path.isAbsolute(relativeCwd);
  const validationFile = process.env.AIRPORTS_PUBLIC_VALIDATION_OUTPUT
    || (externalCwd ? path.resolve(process.cwd(), 'work/public_projection_validation.json') : null);
  if (validationFile) {
    fs.mkdirSync(path.dirname(validationFile), {recursive: true});
    fs.writeFileSync(validationFile, JSON.stringify({
    checkedAt: new Date().toISOString(), ...validation, publishedAt, evidenceAsOf,
    inputHashes, outputs: outputFiles, publicDirectory: 'public-site/data'
    }, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify({status: 'PASS', publishedAt, summary, files: outputFiles}));
}

function validate(catalog, sourceDocument, ledger) {
  assert.equal(catalog.items.length, 215);
  assert.equal(catalog.discoveryCandidates.length, 30);
  assert.equal(ledger.items.length, 245);
  const ids = [...catalog.items, ...catalog.discoveryCandidates].map(item => item.id);
  assert.equal(new Set(ids).size, 245);
  const sourceIds = new Set(sourceDocument.items.map(item => item.id));
  assert.equal(sourceIds.size, sourceDocument.items.length);
  for (const item of catalog.items) assert.ok(item.sourceIds.every(id => sourceIds.has(id)), 'Unresolved record source: ' + item.id);
  for (const item of ledger.items) {
    assert.ok(ids.includes(item.recordId));
    assert.ok(item.sourceIds.every(id => sourceIds.has(id)), 'Unresolved ledger source: ' + item.forecastId);
    assert.equal(item.probabilityInterval, null);
    assert.equal(item.pointProbability, null);
    assert.equal(item.status, 'abstain');
    assert.match(item.originalEntrySha256, /^[a-f0-9]{64}$/);
  }
  let urlCount = 0;
  const forbiddenKey = /^(?:password|token|cookie|cookies|credential|credentials|secret|email|legacyClaims|note|notes|ref|referral.*)$/i;
  const forbiddenText = /(?:(?:^|[\s"'(])[a-z]:[\\/]|\\\\[^\\\s]+\\|file:\/\/|本地工作台|本机API|本机 API|诈骗|执法|跑路)/i;
  const walk = (value, pointer = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, pointer + '/' + index));
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        assert.ok(!forbiddenKey.test(key), 'Disallowed public key at ' + pointer + '/' + key);
        walk(item, pointer + '/' + key);
      }
    } else if (typeof value === 'string') {
      assert.ok(!forbiddenText.test(value), 'Disallowed public text at ' + pointer);
      if (/^https?:\/\//.test(value)) {
        urlCount++;
        const parsed = new URL(value);
        assert.ok(!parsed.username && !parsed.password);
        if (!isRetainedPublicAnnouncement(parsed) && !isRetainedPublicProductConfiguration(parsed) && !isRetainedPublicPaymentSelector(parsed) && !isRetainedPublicProductCatalog(parsed)) {
          for (const key of parsed.searchParams.keys()) assert.ok(QUERY_ALLOWLIST[parsed.hostname]?.has(key), 'Unsafe query key at ' + pointer);
        }
        assert.ok(!/\/(?:auth|login|register|invite|ref|r|f)(?:\/|$)/i.test(parsed.pathname));
      }
    }
  };
  walk(catalog); walk(sourceDocument); walk(ledger);
  assert.equal(catalog.summary.recordsWithDomainEvents, 189);
  assert.equal(catalog.summary.recordsWithCT, 14);
  assert.equal(catalog.categories.reduce((total, category) => total + category.count, 0), 215);
  assert.deepEqual(catalog.items.filter(item => item.identityConflict).map(item => item.id).sort(), [...IDENTITY_PAGE_CLUES].sort());
  assert.ok(catalog.items.filter(item => item.identityConflict).every(item => item.identityClue.sourceIds.length && item.identityClue.observedAt));
  assert.ok(!/"state"\s*:\s*"fresh"/.test(JSON.stringify(catalog)));
  assert.ok(sourceDocument.items.filter(item => item.collectionStatus === 'planned_not_collected').every(item => item.originalRequestUrl === null && item.observedAt === null));
  return {
    status: 'PASS', catalogRecords: 215, discoveryRecords: 30, ledgerEntries: 245,
    uniqueSources: sourceIds.size, urlsChecked: urlCount, unresolvedReferences: 0,
    numericalPredictions: 0, rawArchivesPublished: false,
    credentialKeysFound: 0, absoluteLocalPathsFound: 0, unadjudicatedAccusationsPublished: 0,
    timelessFreshStatesPublished: 0, ttlDerivation: 'root_catalog_service_freshness_fields',
    neutralIdentityPageClues: 6,
    originalLedgerProjectionNoticePresent: true
  };
}

if (require.main === module) build();
module.exports = {build, validate, safeUrl};
