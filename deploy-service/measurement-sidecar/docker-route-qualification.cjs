'use strict';
// Route qualification only: no catalog DB, publication or formal samples.
// Never log private configuration, response bodies, addresses or raw errors.
const fs = require('node:fs'), crypto = require('node:crypto'), net = require('node:net');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const files = {
  config: '/run/secrets/qualification/config.json',
  authorization: '/run/secrets/measurement-auth/A010-proxy.json',
  egress: '/run/secrets/qualification/verified-egress.json',
  binary: '/run/measurement-bin/mihomo'
};
const pins = () => JSON.parse(fs.readFileSync('/qualification/input-pins.json', 'utf8'));
const fileHashes = () => Object.fromEntries(Object.entries(files).map(([k, p]) => [k, hash(fs.readFileSync(p))]));
function same(a, b) { return Object.keys(a).every(k => a[k] === b[k]); }
function configPort() {
  const config = JSON.parse(fs.readFileSync(files.config, 'utf8'));
  const port = config['mixed-port'];
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('local_port_configuration_missing');
  return port;
}
if (process.argv[2] === 'health') {
  try {
    if (hash(fs.readFileSync(files.config)) !== pins().files.config.sha256) throw Error('configuration_pin_changed');
    const socket = net.connect({ host: '127.0.0.1', port: configPort() });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); process.exit(0); });
    socket.once('timeout', () => { socket.destroy(); process.exit(1); });
    socket.once('error', () => process.exit(1));
  } catch { process.exit(1); }
} else if (process.argv[2] === 'qualify') {
  (async () => {
    let stage = 'private_input_validation', store;
    const record = { observedAt: new Date().toISOString(), scope: 'isolated_stage_candidate_route_qualification_not_formal_samples', status: 'not_completed', egressMatch: false, realMeasurementFactCreated: false, valueMbps: null };
    try {
      const frozen = pins(), before = fileHashes();
      const expected = Object.fromEntries(Object.entries(frozen.files).map(([k, p]) => [k, p.sha256]));
      if (!same(before, expected)) throw Error('private_input_pin_mismatch');
      record.privateInputHashes = before;
      record.imageSourceHashes = {};
      for (const [file, expectedHash] of Object.entries(frozen.imageSources)) {
        const actual = hash(fs.readFileSync('/app/' + file));
        record.imageSourceHashes[file] = actual;
        if (actual !== expectedHash) throw Error('image_source_pin_mismatch');
      }
      const verified = JSON.parse(fs.readFileSync(files.egress, 'utf8'));
      if (!net.isIP(verified.ip) || hash(verified.routeId || '') !== frozen.frozenRouteHash || verified.egressUrl !== 'https://api.ipify.org/?format=json') throw Error('frozen_route_or_egress_input_mismatch');
      const proxyUrl = 'http://127.0.0.1:' + configPort();
      const { cleanProfile, openMeasurementStore } = require('/app/deploy-service/measurement-store.cjs');
      // Exercise the current production query allowlist, but do not configure,
      // enable or enqueue this profile in any measurement store.
      cleanProfile({ id: 'docker-qualification-A010', siteId: 'A010', kind: 'bandwidth', enabled: false, synthetic: false, proxyUrl, targetUrl: 'https://speed.cloudflare.com/__down?bytes=262144', egressUrl: verified.egressUrl, expectedEgressIp: verified.ip, routeId: verified.routeId, allowedTargetOrigins: ['https://api.ipify.org', 'https://speed.cloudflare.com'], timeoutMs: 15000, maxBytes: 1048576 });
      store = openMeasurementStore({ filename: '/qualification-data/measurements.sqlite' });
      const initial = store.status();
      if (initial.enabled || initial.configuredProfiles || initial.rawObservationCount) throw Error('qualification_store_not_empty');
      const { requestViaProxy, proxyAuthorization } = require('/app/lib/proxy-route-observer.cjs');
      const authorization = proxyAuthorization('A010-proxy', '/run/secrets/measurement-auth');
      stage = 'egress_request';
      const echo = await requestViaProxy(proxyUrl, verified.egressUrl, { timeoutMs: 15000, maxBytes: 1024, authorization, readBody: true });
      record.egress = { status: echo.status, statusCode: echo.statusCode ?? null, bodyComplete: echo.bodyComplete === true, tlsHandshakeVerified: echo.tlsHandshakeVerified === true, errorCode: typeof echo.errorCode === 'string' && /^[A-Z0-9_]+$/.test(echo.errorCode) ? echo.errorCode : null };
      let match = false;
      try { match = JSON.parse(echo.body).ip === verified.ip; } catch {}
      // The raw echo/IP never reaches a receipt, database or stdout.
      delete echo.body;
      record.egressMatch = match;
      if (echo.status !== 'ok' || !record.egress.bodyComplete || !record.egress.tlsHandshakeVerified || !match) throw Error('egress_qualification_failed');
      stage = 'bounded_download';
      const transfer = await requestViaProxy(proxyUrl, 'https://speed.cloudflare.com/__down?bytes=262144', { timeoutMs: 15000, maxBytes: 1048576, authorization });
      record.download = { status: transfer.status, statusCode: transfer.statusCode ?? null, bodyComplete: transfer.bodyComplete === true, bytesRead: transfer.bytesRead ?? null, tlsHandshakeVerified: transfer.tlsHandshakeVerified === true, errorCode: typeof transfer.errorCode === 'string' && /^[A-Z0-9_]+$/.test(transfer.errorCode) ? transfer.errorCode : null };
      if (transfer.status !== 'ok' || !record.download.bodyComplete || !record.download.tlsHandshakeVerified || transfer.bytesRead !== 262144) throw Error('bounded_download_qualification_failed');
      stage = 'post_request_integrity';
      if (!same(fileHashes(), before)) throw Error('private_inputs_changed_during_qualification');
      record.privateInputsUnchanged = true;
      record.status = 'qualified_not_formal_measurement';
    } catch (error) {
      record.status = 'qualification_failed';
      record.failureStage = stage;
      record.errorHash = hash(String(error.message || error));
    }
    if (store) {
      const status = store.status();
      record.formalProfileCount = status.configuredProfiles;
      record.formalObservationCount = status.rawObservationCount;
      record.measurementSwitchEnabled = status.enabled;
      store.db.exec('CREATE TABLE IF NOT EXISTS docker_route_qualifications(sha256 TEXT PRIMARY KEY, body TEXT NOT NULL)');
      const recordHash = hash(JSON.stringify(record));
      store.db.prepare('INSERT OR IGNORE INTO docker_route_qualifications VALUES(?,?)').run(recordHash, JSON.stringify(record));
      store.close();
      // This mounted volume is independent and contains no catalog facts.
      fs.writeFileSync('/qualification-data/qualification-result.json', JSON.stringify({ ...record, recordHash }, null, 2) + '\n');
      console.log(JSON.stringify({ status: record.status, egressMatch: record.egressMatch, recordHash }));
    } else {
      console.log(JSON.stringify({ status: record.status, egressMatch: false, errorHash: record.errorHash }));
    }
    if (record.status !== 'qualified_not_formal_measurement') process.exitCode = 1;
  })().catch(error => { console.error(JSON.stringify({ status: 'qualification_internal_failure', errorHash: hash(String(error.message || error)) })); process.exitCode = 1; });
} else {
  console.error(JSON.stringify({ status: 'explicit_qualification_mode_required' })); process.exitCode = 1;
}
