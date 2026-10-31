import { browserDataDocuments } from './browser-data.mjs?v=adf34e10ceee76b3f9de0d8fc7c7d60b391ef7e7a468186f8001e3f5e1d7ac2d';

/**
 * Shared browser / Node 22 verification of a downloaded public publication.
 * No network, filesystem or private catalog access occurs in this module.
 */
export const integrityLimits = Object.freeze([
  '只验证随包文件与清单的一致性、记录引用和公开投影结构；不证明来源陈述真实或服务可用。',
  '随包哈希不是数字签名或可信时间戳。未使用另行保存的清单哈希时，不能识别文件与清单同时被改写。',
  '原始条目哈希仅保留供与留存原件核对；公开投影不能独立重算原始预测哈希链。',
  '不读取原始完整档案，不验证生存概率、测速结果、经营主体或独立裁决。'
]);

const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_DATA = ['public-catalog.json', 'public-sources.json', 'public-ledger.json'];
const REPOSITORY_METADATA = new Set(['README.md', '.gitattributes', '.github/ISSUE_TEMPLATE/evidence-correction.yml']);

export function isSafeRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') &&
    !/[\u0000-\u001f\u007f:?#%]/.test(value) && !value.startsWith('/') &&
    value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}

class InvalidPublication extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function requireValue(condition, code, message) {
  if (!condition) throw new InvalidPublication(code, message);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function same(left, right) { return canonical(left) === canonical(right); }
function validTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
async function digest(bytes) {
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseJson(files, name) {
  requireValue(Object.hasOwn(files, name), 'MISSING_FILE', '缺少文件：' + name);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files[name]));
  } catch {
    throw new InvalidPublication('INVALID_JSON', '文件不是有效UTF-8 JSON：' + name);
  }
}

function uniqueRows(rows, field, label) {
  requireValue(Array.isArray(rows), 'INVALID_ROWS', label + '必须是数组。');
  const found = new Map();
  for (const row of rows) {
    requireValue(row && typeof row === 'object' && typeof row[field] === 'string' && row[field].length > 0,
      'MISSING_ID', label + '缺少有效' + field + '。');
    requireValue(!found.has(row[field]), 'DUPLICATE_ID', label + '存在重复编号：' + row[field]);
    found.set(row[field], row);
  }
  return found;
}

function checkReferences(value, sourceIds) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const row of value) checkReferences(row, sourceIds); return; }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'sourceIds') {
      requireValue(Array.isArray(child), 'INVALID_REFERENCE', 'sourceIds必须是数组。');
      for (const id of child) requireValue(sourceIds.has(id), 'UNRESOLVED_SOURCE', '未解析的来源引用：' + id);
    } else if (key === 'sourceId') {
      requireValue(sourceIds.has(child), 'UNRESOLVED_SOURCE', '未解析的来源引用：' + child);
    } else checkReferences(child, sourceIds);
  }
}

/**
 * @param {Record<string, Uint8Array>} files Public relative paths -> exact bytes.
 * @param {{expectedManifestSha256?: string, allowRepositoryMetadata?: boolean}} options Optional separately saved pin.
 * @returns {Promise<object>} A consistency report, never a factual certification.
 */
export async function verifyFiles(files, { expectedManifestSha256, allowRepositoryMetadata = false } = {}) {
  const report = {
    status: 'FAIL', errors: [], counts: null, buildManifestSha256: null,
    referenceProvided: expectedManifestSha256 !== undefined,
    referenceMatched: false, originalLedgerRecomputed: false,
    factualClaimsVerified: false, trustedTimestampVerified: false, ignoredRepositoryMetadata: [], browserDataReproduced: false,
    limits: [...integrityLimits]
  };
  try {
    requireValue(globalThis.crypto?.subtle, 'CRYPTO_UNAVAILABLE', '当前环境不支持SHA-256 WebCrypto。');
    requireValue(files && typeof files === 'object' && !Array.isArray(files), 'INVALID_INPUT', '必须提供文件字节映射。');
    for (const [name, bytes] of Object.entries(files)) {
      requireValue(isSafeRelativePath(name), 'UNSAFE_PATH', '文件路径不是安全相对路径。');
      requireValue(bytes instanceof Uint8Array, 'INVALID_BYTES', '文件必须保留原始字节：' + name);
    }
    requireValue(Object.hasOwn(files, 'build-manifest.json'), 'MISSING_FILE', '缺少文件：build-manifest.json');
    report.buildManifestSha256 = await digest(files['build-manifest.json']);
    if (expectedManifestSha256 !== undefined) {
      requireValue(typeof expectedManifestSha256 === 'string' && SHA256.test(expectedManifestSha256),
        'INVALID_REFERENCE_HASH', '外部清单哈希必须是64位小写SHA-256。');
      requireValue(report.buildManifestSha256 === expectedManifestSha256, 'MANIFEST_PIN_MISMATCH', '清单与另行提供的哈希不一致。');
      report.referenceMatched = true;
    }
    const build = parseJson(files, 'build-manifest.json');
    requireValue(build?.schemaVersion === 'airports-public-build.v1' && validTime(build.builtAt),
      'BUILD_SCHEMA', '构建清单版本或构建时间无效。');
    requireValue(Array.isArray(build.files) && build.files.length > 0, 'BUILD_FILES', '构建清单缺少文件列表。');
    const declarations = new Map();
    for (const entry of build.files) {
      requireValue(entry && isSafeRelativePath(entry.path) && entry.path !== 'build-manifest.json',
        'UNSAFE_PATH', '清单含不安全路径或自身引用。');
      requireValue(!declarations.has(entry.path), 'DUPLICATE_PATH', '构建清单存在重复路径：' + entry.path);
      requireValue(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && SHA256.test(entry.sha256),
        'INVALID_FILE_DECLARATION', '文件字节数或SHA-256无效：' + entry.path);
      declarations.set(entry.path, entry);
    }
    const supplied = Object.keys(files).filter(name => {
      if (allowRepositoryMetadata === true && REPOSITORY_METADATA.has(name) && !declarations.has(name)) {
        report.ignoredRepositoryMetadata.push(name);
        return false;
      }
      return true;
    });
    requireValue(supplied.length === declarations.size + 1 && supplied.every(name => name === 'build-manifest.json' || declarations.has(name)),
      'FILE_SET_MISMATCH', '实际文件集合与清单不一致（缺少或多出文件）。');
    for (const [name, entry] of declarations) {
      requireValue(Object.hasOwn(files, name), 'MISSING_FILE', '缺少文件：' + name);
      requireValue(files[name].byteLength === entry.bytes, 'BYTE_LENGTH_MISMATCH', '文件长度不符：' + name);
      requireValue(await digest(files[name]) === entry.sha256, 'HASH_MISMATCH', '文件哈希不符：' + name);
    }
    const publication = parseJson(files, 'data/publication-manifest.json');
    requireValue(publication?.schemaVersion === 'airports-publication-manifest.v1', 'PUBLICATION_SCHEMA', '公开投影清单版本不符。');
    requireValue(same(build.sourcePublication, publication), 'PUBLICATION_COPY_MISMATCH', '构建清单中的投影清单副本与实际文件不一致。');
    requireValue(publication.originalLedgerReproducibleFromProjection === false && publication.rawArchivesPublished === false,
      'PROJECTION_BOUNDARY', '公开投影必须显式保留原链与原始档案的边界。');
    requireValue(Array.isArray(publication.outputs) && publication.outputs.length === REQUIRED_DATA.length,
      'PUBLICATION_OUTPUTS', '投影清单必须列出三个公开数据文件。');
    const outputNames = new Set();
    for (const output of publication.outputs) {
      requireValue(output && REQUIRED_DATA.includes(output.file) && !outputNames.has(output.file),
        'PUBLICATION_OUTPUTS', '投影输出缺失、重复或不属于公开数据契约。');
      const declaration = declarations.get('data/' + output.file);
      requireValue(declaration && declaration.sha256 === output.sha256 && declaration.bytes === output.bytes,
        'PUBLICATION_HASH_MISMATCH', '两份清单的投影哈希或长度不一致：' + output.file);
      outputNames.add(output.file);
    }
    const catalog = parseJson(files, 'data/public-catalog.json');
    const sources = parseJson(files, 'data/public-sources.json');
    const ledger = parseJson(files, 'data/public-ledger.json');
    requireValue(catalog?.schemaVersion === 'airports-public-catalog.v1' && sources?.schemaVersion === 'airports-public-sources.v1' &&
      ledger?.schemaVersion === 'airports-public-ledger.v1', 'DATA_SCHEMA', '公开数据版本不符。');
    for (const document of [catalog, sources, ledger]) {
      requireValue(document.projectionVersion === publication.projectionVersion && document.publishedAt === publication.publishedAt &&
        document.evidenceAsOf === publication.evidenceAsOf && validTime(document.publishedAt) && validTime(document.evidenceAsOf),
        'DATA_VERSION_MISMATCH', '投影数据的版本或材料时间不一致。');
    }
    const records = uniqueRows(catalog.items, 'id', '名录');
    const discovery = uniqueRows(catalog.discoveryCandidates, 'id', '发现候选');
    const sourceRows = uniqueRows(sources.items, 'id', '来源');
    const ledgerRows = uniqueRows(ledger.items, 'forecastId', '台账');
    const allRecords = new Map(records);
    for (const [id, item] of discovery) {
      requireValue(!allRecords.has(id), 'DUPLICATE_ID', '候选与名录重复编号：' + id);
      allRecords.set(id, item);
    }
    requireValue(catalog.summary?.totalCatalog === records.size && catalog.summary?.discoveryCount === discovery.size &&
      catalog.summary?.sourceCount === sourceRows.size && catalog.summary?.ledgerEntries === ledgerRows.size &&
      sources.sourceCount === sourceRows.size && ledger.summary?.entries === ledgerRows.size,
      'SUMMARY_COUNT_MISMATCH', '公开统计与实际条目数量不符。');
    checkReferences(catalog, sourceRows);
    checkReferences(ledger, sourceRows);
    if(catalog.currentResearch){
      requireValue(catalog.currentResearch.summary?.recordsAttempted===records.size,'REFRESH_COVERAGE','本轮采集覆盖与名录不符。');
      let withPlans=0;
      for(const record of records.values()){
        const current=record.currentEvidence;
        requireValue(current?.recordId===record.id&&validTime(current.checkedAt),'REFRESH_COVERAGE','本轮检查时间或记录编号缺失。');
        requireValue(current.offers?.checkoutVerified===false&&current.payment?.transactionVerified===false,'UNSUPPORTED_CHECKOUT_VERIFICATION','没有实际结算或交易验证，不得标为已验证。');
        requireValue(Array.isArray(current.offers.plans),'REFRESH_PLANS','套餐或明确空数组必须保留。');
        if(current.offers.plans.length)withPlans++;
        for(const plan of current.offers.plans)requireValue(typeof plan.amount==='number'&&Number.isFinite(plan.amount)&&plan.amount>=0&&
          typeof plan.billingPeriod==='string'&&plan.billingPeriod&&plan.sourceIds?.length&&plan.priceStatus==='advertised_not_checkout_verified'&&plan.checkoutVerified===false&&
          (plan.currency||(plan.currency===null&&plan.currencySymbol&&plan.currencyStatus==='not_confirmed')),
          'UNSUPPORTED_CURRENT_PRICE','标价缺少周期、币种证据或来源，或冒充已验证结算价。');
        const discussion=current.community;
        requireValue(discussion?.claimsIndependentlyVerified===false&&discussion.zeroMatchesMeansZeroComplaints===false&&discussion.complaintRate===null&&
          validTime(discussion.windowStart)&&validTime(discussion.windowEnd),'UNSUPPORTED_COMPLAINT_CERTAINTY','有限扫描或未核实留言不能升级为已确认投诉率。');
        for(const event of discussion.events||[])requireValue(validTime(event.createdAt)&&Date.parse(event.createdAt)>=Date.parse(discussion.windowStart)&&Date.parse(event.createdAt)<=Date.parse(discussion.windowEnd),
          'COMMUNITY_WINDOW','近期活动必须使用窗口内原始发表时间。');
      }
      requireValue(withPlans===catalog.currentResearch.summary.recordsWithPublicPlans,'REFRESH_SUMMARY','当前套餐覆盖统计与实际记录不符。');
    }
    requireValue(ledgerRows.size === allRecords.size, 'LEDGER_COVERAGE', '当前v1投影须为每个名录或候选保留一条台账。');
    const mappedRecords = new Set();
    for (const entry of ledgerRows.values()) {
      requireValue(SHA256.test(entry.originalEntrySha256), 'ORIGINAL_HASH_MISSING', '台账未保留有效原始条目哈希：' + entry.forecastId);
      const record = allRecords.get(entry.recordId);
      requireValue(record && !mappedRecords.has(entry.recordId), 'LEDGER_RECORD_MISMATCH', '台账引用未知或重复的记录：' + entry.recordId);
      mappedRecords.add(entry.recordId);
      requireValue(record.forecast && record.forecast.id === entry.forecastId, 'FORECAST_LINK_MISMATCH', '预测编号与名录不一致：' + entry.recordId);
      for (const field of ['issuedAt', 'horizonEnd', 'adjudicationNotBefore', 'status', 'pointProbability', 'probabilityInterval', 'scorable']) {
        requireValue(same(record.forecast[field], entry[field]), 'FORECAST_FIELD_MISMATCH', '台账与名录的预测字段不符：' + entry.forecastId + ' / ' + field);
      }
      requireValue(validTime(entry.issuedAt) && validTime(entry.horizonEnd) && validTime(entry.adjudicationNotBefore) &&
        Date.parse(entry.issuedAt) < Date.parse(entry.horizonEnd) && Date.parse(entry.horizonEnd) <= Date.parse(entry.adjudicationNotBefore),
        'FORECAST_TIME_INVALID', '预测时间顺序无效：' + entry.forecastId);
      requireValue(entry.status === 'abstain' && entry.pointProbability === null && entry.probabilityInterval === null &&
        entry.scorable === false && entry.outcome === null, 'CURRENT_V1_FORECAST_BOUNDARY', '当前公开v1契约仅含未结算弃判，不能擅自加入数值概率或结果。');
    }
    requireValue(catalog.summary.numericPredictions === 0 && ledger.summary.numericPredictions === 0 &&
      ledger.summary.scorablePredictions === 0 && ledger.summary.brier === null && ledger.summary.calibrationCurve === null,
      'UNSUPPORTED_SCORE', '弃判版本不能宣称已计算预测准确性。');
    requireValue(typeof ledger.projectionNotice === 'string' && ledger.projectionNotice.length > 0,
      'PROJECTION_NOTICE_MISSING', '台账缺少公开投影限制说明。');
    // Older downloaded publications remain verifiable. A publication declaring
    // browser read models must reproduce every one from its complete inputs.
    if (declarations.has('data/browser-index.json')) {
      const derived = browserDataDocuments(catalog, sources, {
        catalogSha256: await digest(files['data/public-catalog.json']),
        sourcesSha256: await digest(files['data/public-sources.json'])
      });
      const declared = [...declarations.keys()].filter(name => name === 'data/browser-index.json' || name.startsWith('data/details/'));
      requireValue(declared.length === derived.size, 'BROWSER_DATA_SET', '逐条详情文件集合与完整名录不一致。');
      for (const [name, expected] of derived) {
        requireValue(declarations.has(name) && same(parseJson(files, name), JSON.parse(JSON.stringify(expected))),
          'BROWSER_DATA_MISMATCH', '浏览器资料与完整公开投影不一致：' + name);
      }
      report.browserDataReproduced = true;
    }
    report.counts = { files: supplied.length, catalog: records.size, discovery: discovery.size, sources: sourceRows.size,
      ledger: ledgerRows.size, scorablePredictions: 0 };
    report.status = 'PASS';
  } catch (error) {
    report.errors.push({ code: error.code || 'INVALID_INPUT', message: error.message || '公开产物无法验证。' });
  }
  return report;
}
