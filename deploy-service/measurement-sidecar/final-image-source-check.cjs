'use strict';
// Hash actual image files; no module execution, private data or network.
const fs = require('node:fs'), crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const frozen = JSON.parse(fs.readFileSync('/source-check/pins.json', 'utf8'));
const checks = frozen.sourcePins.map(pin => {
  if (!/^[a-zA-Z0-9_./-]+$/.test(pin.file) || pin.file.startsWith('/') || pin.file.split('/').includes('..')) throw Error('invalid_source_pin_path');
  const file = '/app/' + pin.file;
  const actualSha256 = fs.existsSync(file) ? hash(fs.readFileSync(file)) : null;
  return { file: pin.file, expectedSha256: pin.sha256, actualSha256, matches: actualSha256 === pin.sha256 };
});
const result = { observedAt: new Date().toISOString(), sourceInputSha256: frozen.sourceInputSha256, nodeVersion: process.version, checks, checked: checks.length, failed: checks.filter(x => !x.matches).length };
fs.writeFileSync('/source-check/result.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.failed ? 'image_frozen_source_pins_failed' : 'image_frozen_source_pins_passed', sha256: hash(JSON.stringify(result)) }));
if (result.failed) process.exitCode = 1;
