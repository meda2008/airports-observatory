'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { collectSite } = require('../deploy-service/collector.cjs');

const site = { entryUrl: 'https://collector.example.invalid/' };
const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
const stalled = () => new Promise(() => {});

test('overall collection deadline cancels a stalled page and closes its context', async () => {
  let closes = 0, navigating = false;
  const context = {
    route: async () => {}, routeWebSocket: async () => {},
    close: async () => { closes++; },
    newPage: async () => ({ goto() { navigating = true; return stalled(); } })
  };
  const result = await collectSite(site, { lookup, browser: { newContext: async () => context }, jobBudgetMs: 25 });
  assert.equal(navigating, true);
  assert.equal(result.blocker, 'collection_job_deadline_exceeded');
  assert.deepEqual(result.observations, []);
  assert.equal(closes, 1);
});

test('a context allocated after the deadline is closed before it can open a page', async () => {
  let release, reportClosed;
  const closed = new Promise(resolve => { reportClosed = resolve; });
  const browser = { newContext: () => new Promise(resolve => { release = resolve; }) };
  const result = await collectSite(site, { lookup, browser, jobBudgetMs: 25 });
  assert.equal(result.blocker, 'collection_job_deadline_exceeded');
  let opened = false;
  release({ close: reportClosed, newPage() { opened = true; } });
  await closed;
  assert.equal(opened, false);
});
