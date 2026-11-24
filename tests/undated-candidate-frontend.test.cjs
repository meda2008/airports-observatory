'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = require('./fixtures/sntp-undated-public-summary-20261120.json');

const INDEX_JS_PATH = path.join(__dirname, '../deploy-service/public/index.js');

test('deploy-service/public/index.js renders actual undated SNTP summary without inventing date or hiding prices', () => {
  const source = fs.readFileSync(INDEX_JS_PATH, 'utf8');
  const start = source.indexOf('function performanceNotes(');
  assert(start >= 0, 'performanceNotes function must exist');
  const rest = source.slice(start);
  const end = rest.indexOf('\nfunction catalogCard(');
  assert(end > 0, 'performanceNotes end boundary must exist');
  const fnCode = rest.slice(0, end);

  function el(tag, text) {
    return {
      tag,
      text,
      children: [],
      append(...items) {
        this.children.push(...items);
      }
    };
  }
  const shortDate = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : '');
  const networkText = (v) => String(v || '');
  const render = (d) =>
    vm.runInNewContext(`(${fnCode})(data)`, {
      el,
      data: d,
      list: (v) => (Array.isArray(v) ? v : []),
      shortDate,
      networkText
    });

  const actual = render(data);
  const text = JSON.stringify(actual);
  assert.match(text, /日期未注明/);
  assert(!text.includes('undefined'));
  assert(text.includes(data.candidateIssueContext.description));

  const known = structuredClone(data);
  known.candidateIssueContext.createdAt = '2026-10-17T01:00:00Z';
  known.candidateIssueContext.candidateServiceName = 'SNTP';
  const k = JSON.stringify(render(known));
  assert.match(k, /2026-10-17/);
  assert.match(k, /SNTP/);

  const invalid = structuredClone(data);
  invalid.candidateIssueContext.createdAt = 12;
  assert.doesNotThrow(() => render(invalid));
});
