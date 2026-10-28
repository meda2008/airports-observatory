import { verifyFiles, isSafeRelativePath } from './integrity.mjs?v=4c432f6dbc8b81371c909ec8a70df4d3ad25a70713b08507f0c89aa306f316d7';

const utf8 = new TextDecoder();
const MAX_FILES = 64;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

async function bytesAt(relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error('公开文件路径不合法，已停止读取。');
  const response = await fetch(new URL('./' + relativePath, document.baseURI), { credentials: 'omit', cache: 'no-cache' });
  if (!response.ok) throw new Error(relativePath + ' 读取失败（HTTP ' + response.status + '）。');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_TOTAL_BYTES) throw new Error('公开文件超出本页核对范围。');
  return bytes;
}

// Downloads stay on this site's public base. The shared verifier performs the
// actual manifest, byte-hash, projection and reference checks.
export async function fetchPublication() {
  const manifestBytes = await bytesAt('build-manifest.json');
  const manifest = JSON.parse(utf8.decode(manifestBytes));
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_FILES) throw new Error('发布清单不完整或超出本页核对范围。');
  const names = manifest.files.map(file => file.path);
  if (new Set(names).size !== names.length || names.some(name => !isSafeRelativePath(name) || name === 'build-manifest.json')) throw new Error('发布清单含重复或无效文件路径。');
  if (manifest.files.some(file => !Number.isSafeInteger(file.bytes) || file.bytes < 0) || manifest.files.reduce((sum, file) => sum + file.bytes, 0) > MAX_TOTAL_BYTES) throw new Error('发布清单字节声明超出本页核对范围。');
  const files = { 'build-manifest.json': manifestBytes };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
    while (next < names.length) {
      const name = names[next++];
      files[name] = await bytesAt(name);
    }
  }));
  if (Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) > MAX_TOTAL_BYTES) throw new Error('实际文件总量超出本页核对范围。');
  return files;
}

export function createVerificationPage(ui) {
  const { el, paragraph, button, bread, pageHeading } = ui;
  const shell = el('div', 'shell subpage');
  shell.append(bread('版本核对'), pageHeading('VERIFY / 可独立复算', '依据能下载，也应能核对。', '本页在你的浏览器内核对当前公开文件的字节与引用关系。核对成功只表示这批文件相互一致，不能证明商家可用、原文属实或历史时间经过公证。'));
  const panel = el('section', 'detail-section');
  panel.append(el('h2', '', '核对这个公开版本'), paragraph('点击后会读取本站公开清单及其文件，共数 MB；不读取你的订阅、账户、浏览历史或本地文件。'));
  const field = el('div', 'field');
  const label = el('label', '', '此前独立保存的清单 SHA256（可选）');
  label.htmlFor = 'expected-manifest-hash';
  const input = el('input');
  input.id = label.htmlFor; input.type = 'text'; input.maxLength = 64; input.autocomplete = 'off'; input.spellcheck = false;
  input.placeholder = '未提供时，只检查随站清单与文件的一致性';
  field.append(label, input); panel.append(field);
  const output = el('div', 'verification-output'); output.setAttribute('role', 'status');
  const run = button('核对当前版本', 'primary-button', async () => {
    const expected = input.value.trim().toLowerCase();
    if (expected && !/^[a-f0-9]{64}$/.test(expected)) { output.replaceChildren(paragraph('请输入完整的64位十六进制SHA256，或留空。')); return; }
    run.disabled = true; output.replaceChildren(paragraph('正在读取本站公开文件并计算SHA256…'));
    try {
      const files = await fetchPublication();
      const result = await verifyFiles(files, { expectedManifestSha256: expected || undefined });
      output.replaceChildren(el('h3', '', result.status === 'PASS' ? '文件与引用核对通过' : '核对未通过，请保留差异后再判断'));
      output.append(paragraph('本次核对时刻：' + ui.date(new Date().toISOString(), true) + ' · 北京时间；这不是商家业务验证时间。'));
      output.append(el('code', 'hash', '发布清单 SHA256 ' + (result.buildManifestSha256 || '未取得')));
      output.append(paragraph(expected ? '已对照你提供的清单哈希。哈希来源及其保存时间仍需自行确认。' : '未提供外部固定哈希；若清单与文件一起被替换，仅靠本站自检不能识别。'));
      for (const error of result.errors || []) output.append(paragraph(error.code + '：' + error.message, 'verification-error'));
      output.append(paragraph('不包含：原始完整台账链复算、第三方正文真实性、可信时间戳、经营主体确认、服务可用性或模型有效性验证。', 'quiet-note'));
      output.append(button('下载本次核对结果 JSON', 'secondary-button', () => ui.download('airports-verification.json', { checkedAt: new Date().toISOString(), ...result })));
    } catch (error) { output.replaceChildren(paragraph('核对未完成：' + error.message + ' 未完成不等于已经通过。', 'verification-error')); }
    finally { run.disabled = false; }
  });
  panel.append(run, output); shell.append(panel);
  const downloads = el('section', 'detail-section'); downloads.append(el('h2', '', '下载后离线复算'));
  const fileLink = (file, text) => { const a = el('a', 'text-link', text); a.href = new URL('./' + file, document.baseURI).href; a.download = file.split('/').pop(); return a; };
  const rows = [
    ['build-manifest.json', '发布文件清单与字节哈希'],
    ['data/publication-manifest.json', '数据投影来源及文件哈希'],
    ['data/public-ledger.json', '公开预测台账'],
    ['data/public-settlement.json', '本版本结算检查结果'],
    ['data/adjudications.empty.json', '空裁决输入（没有结果或裁决者）'],
    ['verify-publication.cjs', '离线完整性校验器'],
    ['integrity.mjs', '浏览器与离线共用校验模块'],
    ['settle-ledger.cjs', '离线预测结算工具'],
    ['settlement.README.md', '独立裁决与结算字段说明']
  ];
  const list = el('ul'); for (const [file, text] of rows) { const li = el('li'); li.append(fileLink(file, text)); list.append(li); } downloads.append(list);
  downloads.append(paragraph('完整公开文件可从公开仓库下载ZIP；使用Node.js 22或以上在解压目录运行。下面的完整性命令读取该目录，不访问本地私有catalog。'));
  const repo = el('a', 'text-link', '打开公开版本仓库 ↗'); repo.href = 'https://github.com/meda2008/airports-observatory'; repo.target = '_blank'; repo.rel = 'noopener noreferrer'; downloads.append(repo);
  downloads.append(el('code', 'hash', 'node verify-publication.cjs --directory . --allow-repository-metadata'));
  downloads.append(paragraph('把外部保存的哈希加为 --expected-manifest-sha256 参数，可进一步核对清单。GitHub归档含固定的README、更正模板和换行配置；工具仅允许这些明确的仓库元数据。'));
  shell.append(downloads);
  const scope = el('section', 'detail-section'); scope.append(el('h2', '', '先记账，再等可裁决的结果'), paragraph('当前245条均为弃判，没有点概率，Brier保持空值。结算工具会分开记录未到期、未知结局、失访、弃判与可评分结果，拒绝把概率区间中点当成事前预测。'), paragraph('未来的数值预测还必须附事前冻结凭据与建模者身份，结果须附独立裁决声明和原始证据。工具只能检查这些声明的结构和一致性，声明是否属实仍需没有参与建模的人核查。'));
  shell.append(scope); return shell;
}
