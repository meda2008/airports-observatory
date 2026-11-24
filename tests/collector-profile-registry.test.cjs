'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadProfiles, summarizeProfiles} = require('../deploy-service/profile-registry.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-registry-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const dir of ['collection/site-collectors', 'collection/website-collectors', 'collection/url-collectors', 'lib']) fs.mkdirSync(path.join(root, dir), {recursive: true});
  fs.copyFileSync(path.resolve(__dirname, '../lib/website-collector-binding.cjs'), path.join(root, 'lib/website-collector-binding.cjs'));
  fs.writeFileSync(path.join(root, 'collection/url-collectors/index.cjs'), "module.exports={forOrigin:url=>new URL(url).origin==='https://example.org'?{extract(){}}:null};");
  const write = (id, value) => fs.writeFileSync(path.join(root, 'collection/site-collectors', id + '.json'), typeof value === 'string' ? value : JSON.stringify(value));
  const origin = 'https://example.org', collectorId = 'url-' + crypto.createHash('sha256').update(JSON.stringify(origin)).digest('hex').slice(0, 20);
  const definition = {collectorId, origin, recordIds: ['A001', 'A002'], acceptance: 'partial_not_complete', capabilities: {readOnlyRecipe: 'fixtureRecipe'}};
  fs.writeFileSync(path.join(root, 'collection/website-collectors', collectorId + '.json'), JSON.stringify(definition));
  const base = {recordId: 'A001', name: 'Fixture', entryUrl: origin + '/', allowedHosts: ['example.org'], adapter: 'v2board', enabled: true, maxPages: 3,
    refreshIntervalMs: 604800000, fields: ['pricing', 'payment', 'refund', 'privacy', 'compatibility', 'promotions', 'trial', 'website', 'operatingHistory', 'speed', 'stability']};
  return {root, write, base, collectorId};
}

test('imports every per-record config, filters credentials and keeps only supported proposal fields', t => {
  const f = fixture(t);
  f.write('A001', {...f.base, publicOnly: true, accountReadOnly: true, readOnlyRecipe: 'fixtureRecipe', password: 'SECRET1', registrationProfile: {email: 'SECRET2'}, currentConfirmation: {approved: true},
    auth: {mode: 'login', emailSelector: '#email', passwordSelector: '#password', submitSelector: 'button', email: 'SECRET2', password: 'SECRET1', token: 'SECRET3', termsAccepted: true,
      currentConfirmation: {approved: true}, captcha: {inputSelector: '#captcha', imageSelector: '#image', pattern: '^.{4}$', token: 'SECRET4', currentConfirmation: {approved: true}}},
    urlCollector: {collectorId: 'recipe-one', recipe: 'fixtureRecipe', status: 'retained_only', raw: 'SECRET5', paymentObserved: ['cash'], readiness: {createButton: 'buy'}}});
  const [profile] = loadProfiles(f);
  assert.equal(profile.config.enabled, true);
  assert.equal(profile.staticValidation.status, 'eligible_static_only');
  assert.equal(profile.staticValidation.parserAvailable, true);
  assert.equal(profile.staticValidation.liveVerified, false);
  assert.deepEqual(profile.staticValidation.deferredFields, []);
  assert.deepEqual(profile.config.fields, ['pricing', 'payment', 'refund', 'privacy', 'compatibility', 'promotions', 'trial', 'website', 'operatingHistory', 'speed', 'stability']);
  assert.deepEqual(profile.config.auth, {mode: 'login', emailSelector: '#email', passwordSelector: '#password', submitSelector: 'button', captcha: {inputSelector: '#captcha', imageSelector: '#image', pattern: '^.{4}$'}});
  assert.deepEqual(profile.config.urlCollector, {collectorId: 'recipe-one', recipe: 'fixtureRecipe', status: 'retained_only'});
  assert.equal(/SECRET|termsAccepted|currentConfirmation|registrationProfile|paymentObserved|createButton/.test(JSON.stringify(profile)), false);
  assert.equal(profile.config.refreshIntervalMs, 604800000);
  assert.equal(profile.config.publicOnly, true);
  assert.equal(profile.config.accountReadOnly, true);
  assert.equal(profile.config.readOnlyRecipe, 'fixtureRecipe');
  assert.equal(profile.config.challengePolicy, 'checkpoint');
  assert.equal(profile.staticValidation.challengeAdapters.cloudflare.automaticPass, false);
});

test('shared origins bind record membership while preserving separate URL, auth and metadata', t => {
  const f = fixture(t);
  f.write('A001', {...f.base, auth: {emailSelector: '#one'}, urlCollector: {recipe: 'one'}});
  f.write('A002', {...f.base, recordId: 'A002', name: 'Alias', entryUrl: 'https://example.org/#/docs', auth: {emailSelector: '#two'}, urlCollector: {recipe: 'two'}});
  const profiles = loadProfiles(f);
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].config.websiteCollectorId, f.collectorId);
  assert.equal(profiles[1].config.websiteCollectorId, f.collectorId);
  assert.equal(profiles[0].config.auth.emailSelector, '#one');
  assert.equal(profiles[1].config.auth.emailSelector, '#two');
  assert.equal(profiles[1].config.entryUrl, 'https://example.org/#/docs');
  assert.equal(profiles[1].config.urlCollector.recipe, 'two');
  const summary = summarizeProfiles(profiles);
  assert.equal(summary.total, 2);
  assert.equal(summary.uniqueOrigins, 1);
  assert.equal(summary.sharedOrigins, 1);
  assert.equal(summary.parserAvailable, 2);
  assert.equal(summary.uniqueParserOrigins, 1);
  assert.equal(summary.liveVerified, 0);
});

test('origin parser availability respects its record binding without disabling read-only collection', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'collection/url-collectors/index.cjs'), "module.exports={forOrigin:url=>new URL(url).origin==='https://example.org'?{recordIds:['A001'],extract(){}}:null};");
  f.write('A001', f.base);
  f.write('A002', {...f.base, recordId: 'A002', name: 'Same origin separate brand'});
  const profiles = loadProfiles(f);
  assert.equal(profiles[0].staticValidation.parserAvailable, true);
  assert.equal(profiles[1].staticValidation.parserAvailable, false);
  assert.ok(profiles[1].staticValidation.issues.includes('parser_record_binding_missing'));
  assert.equal(profiles[1].config.enabled, true);
  assert.equal(profiles[1].config.entryUrl, f.base.entryUrl);
  assert.equal(summarizeProfiles(profiles).parserAvailable, 1);
  assert.equal(summarizeProfiles(profiles).uniqueParserOrigins, 1);
});

test('malformed files, missing entries, disallowed hosts and search URLs disable only the affected configs; marketing is a caveat', t => {
  const f = fixture(t);
  f.write('A001', f.base);
  f.write('A002', '{bad');
  f.write('A003', {...f.base, recordId: 'A003', entryUrl: null});
  f.write('A004', {...f.base, recordId: 'A004', allowedHosts: ['other.example'], maxPages: 100});
  f.write('A005', {...f.base, recordId: 'A005', entryUrl: 'https://www.bing.com/search?q=fixture', allowedHosts: ['www.bing.com']});
  f.write('A006', {...f.base, recordId: 'A006', entryUrl: 'https://merchantaff.example/', allowedHosts: ['merchantaff.example']});
  f.write('A007', {...f.base, recordId: 'A007', entryUrl: 'https://example.org/?token=SECRET', maxPages: 0});
  const profiles = loadProfiles(f);
  assert.equal(profiles.length, 7);
  assert.equal(profiles[0].config.enabled, true);
  for (const index of [1, 2, 3, 4, 6]) assert.equal(profiles[index].config.enabled, false);
  assert.ok(profiles[1].staticValidation.issues.includes('invalid_config_json'));
  assert.ok(profiles[2].staticValidation.issues.includes('entry_missing'));
  assert.ok(profiles[3].staticValidation.issues.includes('entry_host_not_allowed'));
  assert.equal(profiles[3].config.maxPages, 8);
  assert.ok(profiles[4].staticValidation.issues.includes('search_page_not_official_entry'));
  assert.equal(profiles[5].config.entryUrl, 'https://merchantaff.example/');
  assert.equal(profiles[5].config.enabled, true);
  assert.ok(profiles[5].staticValidation.issues.includes('marketing_domain_identity_unconfirmed'));
  assert.equal(profiles[6].config.entryUrl, '');
  assert.equal(profiles[6].config.maxPages, 1);
  assert.equal(JSON.stringify(profiles).includes('SECRET'), false);
});

test('binding mismatch and missing dependencies preserve a generic config and local error', t => {
  const f = fixture(t);
  f.write('A009', {...f.base, recordId: 'A009', adapter: 'whmcs'});
  let profile = loadProfiles(f)[0];
  assert.equal(profile.config.adapter, 'generic');
  assert.equal(profile.config.enabled, true);
  assert.ok(profile.staticValidation.issues.includes('website_collector_binding_failed'));
  assert.equal(profile.staticValidation.websiteCollectorId, null);
  fs.renameSync(path.join(f.root, 'lib/website-collector-binding.cjs'), path.join(f.root, 'lib/binding-removed.cjs'));
  // A different root avoids CommonJS module caching from the prior load.
  const missing = fixture(t);
  fs.unlinkSync(path.join(missing.root, 'lib/website-collector-binding.cjs'));
  missing.write('A001', {...missing.base, adapter: 'unknown'});
  profile = loadProfiles(missing)[0];
  assert.equal(profile.config.adapter, 'generic');
  assert.equal(profile.config.enabled, true);
  assert.ok(profile.staticValidation.issues.includes('binding_dependency_unavailable'));
});
