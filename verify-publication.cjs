#!/usr/bin/env node
'use strict';

// Node 22 only; no dependencies, network requests or private parent-catalog reads.
// Usage: node verify-publication.cjs --directory ./unpacked-site
// Optional: --expected-manifest-sha256 <hash-saved-separately-before-verification>
// Keep integrity.mjs, browser-data.mjs and core-view.mjs beside a downloaded
// verifier; source checkout uses ../src/. The complete publication ZIP has all.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function sharedModule() {
  const adjacent = path.join(__dirname, 'integrity.mjs');
  const implementation = fs.existsSync(adjacent) ? adjacent : path.resolve(__dirname, '../src/integrity.mjs');
  return import(pathToFileURL(implementation).href);
}

function loadDirectory(directory) {
  const root = path.resolve(directory);
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('验证目标必须是普通目录。');
  const files = Object.create(null);
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('验证目录含符号链接，已拒绝读取。');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files[path.relative(root, absolute).split(path.sep).join('/')] = fs.readFileSync(absolute);
      else throw new Error('验证目录含非普通文件，已拒绝读取。');
    }
  }
  visit(root);
  return files;
}

async function verifyPublication(files, options) {
  const { verifyFiles } = await sharedModule();
  return verifyFiles(files, options);
}

async function main(argv) {
  let directory = process.cwd(), expectedManifestSha256, allowRepositoryMetadata = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--directory' && argv[index + 1]) directory = argv[++index];
    else if (arg === '--expected-manifest-sha256' && argv[index + 1]) expectedManifestSha256 = argv[++index];
    else if (arg === '--allow-repository-metadata') allowRepositoryMetadata = true;
    else if (arg === '--help') {
      console.log('node verify-publication.cjs --directory ./unpacked-site [--expected-manifest-sha256 <64-lowercase-hex>] [--allow-repository-metadata]\n只验证公开文件一致性；不验证事实、可信时间或原始台账链。\nGitHub Download ZIP须指向解压后的仓库根目录；附加选项只忽略固定的README.md、.gitattributes、.github/ISSUE_TEMPLATE/evidence-correction.yml，并在报告中列明。');
      return 0;
    } else throw new Error('未知参数或缺少参数值：' + arg);
  }
  const report = await verifyPublication(loadDirectory(directory), { expectedManifestSha256, allowRepositoryMetadata });
  console.log(JSON.stringify({ ...report, checkedAt: new Date().toISOString() }, null, 2));
  return report.status === 'PASS' ? 0 : 1;
}

module.exports = { verifyPublication, loadDirectory, main };
if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
  console.log(JSON.stringify({ status: 'FAIL', errors: [{ code: 'CLI_INPUT_ERROR', message: error.message }],
    factualClaimsVerified: false, originalLedgerRecomputed: false }, null, 2));
  process.exitCode = 2;
});
