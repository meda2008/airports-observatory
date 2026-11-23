'use strict';
// Local verification/extraction only. The caller separately downloads the exact
// authorized official asset. Nothing here fetches, executes or reads secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function prepareLinuxRuntime({ archivePath, expectedSha256, runtimeDirectory } = {}) {
  if (typeof archivePath !== 'string' || typeof runtimeDirectory !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256 || '')) throw Error('explicit_paths_and_sha256_required');
  const archive = path.resolve(archivePath), directory = path.resolve(runtimeDirectory);
  if (!fs.lstatSync(archive).isFile() || fs.lstatSync(archive).isSymbolicLink()) throw Error('regular_archive_required');
  if (fs.statSync(archive).size > 64 * 1024 * 1024) throw Error('archive_size_limit');
  const compressed = fs.readFileSync(archive), actualSha256 = hash(compressed);
  if (actualSha256 !== expectedSha256) throw Error('archive_sha256_mismatch');
  const binary = zlib.gunzipSync(compressed, { maxOutputLength: 256 * 1024 * 1024 });
  if (binary.length < 64 || !binary.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || binary[4] !== 2 || binary[5] !== 1 || binary.readUInt16LE(18) !== 62 || ![2, 3].includes(binary.readUInt16LE(16))) throw Error('linux_amd64_elf_required');
  fs.mkdirSync(directory, { recursive: true });
  if (fs.lstatSync(directory).isSymbolicLink()) throw Error('regular_runtime_directory_required');
  const binaryPath = path.join(directory, 'mihomo'), binarySha256 = hash(binary);
  if (fs.existsSync(binaryPath)) {
    if (fs.lstatSync(binaryPath).isSymbolicLink() || !fs.lstatSync(binaryPath).isFile()) throw Error('regular_runtime_binary_required');
    if (hash(fs.readFileSync(binaryPath)) !== binarySha256) throw Error('existing_runtime_binary_differs');
  } else {
    fs.writeFileSync(binaryPath, binary, { flag: 'wx', mode: 0o755 });
  }
  fs.chmodSync(binaryPath, 0o755);
  if (hash(fs.readFileSync(binaryPath)) !== binarySha256) throw Error('written_runtime_binary_mismatch');
  return { archivePath: archive, archiveBytes: compressed.length, archiveSha256: actualSha256, expectedSha256, archiveVerified: true, binaryPath, binaryBytes: binary.length, binarySha256, elf: { format: 'ELF64', byteOrder: 'little', machine: 'x86_64' }, executed: false };
}

if (require.main === module) {
  let receiptPath;
  try {
    const flags = {};
    for (const arg of process.argv.slice(2)) {
      const match = /^--(archive|sha256|directory|receipt)=(.+)$/.exec(arg);
      if (!match || flags[match[1]]) throw Error('explicit_unique_cli_arguments_required');
      flags[match[1]] = match[2];
    }
    receiptPath = flags.receipt;
    if (!receiptPath) throw Error('receipt_path_required');
    const result = { observedAt: new Date().toISOString(), status: 'verified_extracted_not_executed', ...prepareLinuxRuntime({ archivePath: flags.archive, expectedSha256: flags.sha256, runtimeDirectory: flags.directory }) };
    fs.writeFileSync(receiptPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
  } catch (error) {
    const known = new Set(['explicit_paths_and_sha256_required', 'regular_archive_required', 'archive_size_limit', 'archive_sha256_mismatch', 'linux_amd64_elf_required', 'regular_runtime_directory_required', 'regular_runtime_binary_required', 'existing_runtime_binary_differs', 'written_runtime_binary_mismatch', 'explicit_unique_cli_arguments_required', 'receipt_path_required']);
    const result = { observedAt: new Date().toISOString(), status: 'failed_not_executed', reason: known.has(error.message) ? error.message : 'local_runtime_preparation_failed', executed: false };
    if (receiptPath && !fs.existsSync(receiptPath)) fs.writeFileSync(receiptPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.error(JSON.stringify(result)); process.exitCode = 1;
  }
}
module.exports = { prepareLinuxRuntime };
