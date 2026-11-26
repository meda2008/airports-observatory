const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const codec = require('../collection/lumo-wire-codec.cjs');
const { historicalCaptureOptions } = require('./helpers/historical-capture.cjs');

const clientCapture = 'work/payment-pricing-next-20261116/A220-readable-contract.json';
const bootstrapCapture = 'work/payment-pricing-next-20261116/A220-public-bootstrap.bin';

test('decodes actual retained Lumo binary bootstrap, not only synthetic roundtrip', historicalCaptureOptions(clientCapture, bootstrapCapture), () => {
  const { crypto } = codec.parametersFromClient(require(`../${clientCapture}`).body);
  const bytes = fs.readFileSync(bootstrapCapture);
  const value = JSON.parse(codec.decode(bytes, crypto));
  assert.equal(value.boardType, 'Xboard');
  assert.equal(value.env.NEXT_PUBLIC_BRAND_NAME, 'Lumo');
});

test('wire encoding preserves exact UTF8 and multiple blocks', () => {
  const crypto = { seed: 42, rounds: 5, blockSize: 64 };
  for (const text of ['', '中文字段', 'x'.repeat(255), 'x'.repeat(2048)]) {
    assert.equal(codec.decode(codec.encode(text, crypto), crypto).toString('utf8'), text);
  }
  assert.throws(() => codec.decode(Buffer.from([1]), crypto));
  assert.throws(() => codec.encode('x', { seed: 1, rounds: 0, blockSize: 256 }));
});
