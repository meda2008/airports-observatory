'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { prepareLinuxRuntime } = require('../deploy-service/measurement-sidecar/prepare-linux-runtime.cjs');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function setup(t, machine = 62) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measurement-linux-'));
  t.after(() => {
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert(path.basename(resolved).startsWith('measurement-linux-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const elf = Buffer.alloc(64); Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(elf); elf.writeUInt16LE(2, 16); elf.writeUInt16LE(machine, 18);
  const compressed = zlib.gzipSync(elf), archivePath = path.join(dir, 'synthetic.gz'); fs.writeFileSync(archivePath, compressed);
  return { archivePath, expectedSha256: hash(compressed), runtimeDirectory: path.join(dir, 'runtime') };
}
test('hash mismatch stops before extraction and does not create a runtime executable', t => {
  const input = setup(t); input.expectedSha256 = '0'.repeat(64);
  assert.throws(() => prepareLinuxRuntime(input), /archive_sha256_mismatch/);
  assert(!fs.existsSync(input.runtimeDirectory));
});
test('verified gzip still must contain Linux amd64 ELF and never executes', t => {
  const input = setup(t, 183);
  assert.throws(() => prepareLinuxRuntime(input), /linux_amd64_elf_required/);
  assert(!fs.existsSync(input.runtimeDirectory));
});
test('valid local synthetic ELF is byte-verified and conflicting existing binary cannot be overwritten', t => {
  const input = setup(t), r = prepareLinuxRuntime(input);
  assert.equal(r.executed, false); assert.equal(r.archiveVerified, true);
  assert.equal(hash(fs.readFileSync(r.binaryPath)), r.binarySha256);
  assert.equal(prepareLinuxRuntime(input).binarySha256, r.binarySha256);
  fs.writeFileSync(r.binaryPath, 'different');
  assert.throws(() => prepareLinuxRuntime(input), /existing_runtime_binary_differs/);
  assert.equal(fs.readFileSync(r.binaryPath, 'utf8'), 'different');
});
test('binary overlay preserves namespace sharing and external read-only mounts without a port or registry pull', () => {
  const text = fs.readFileSync(path.join(__dirname, '../deploy-service/measurement-sidecar/compose.native-binary.yaml'), 'utf8');
  assert.match(text, /entrypoint: \[\/run\/measurement-bin\/mihomo\]/);
  assert.match(text, /network_mode: service:measurement-proxy/);
  assert.match(text, /pull_policy: never/);
  assert.match(text, /read_only: true/);
  assert.match(text, /create_host_path: false/);
  assert.doesNotMatch(text, /\n    ports:|network_mode: host|\.env|https?:\/\//);
});
