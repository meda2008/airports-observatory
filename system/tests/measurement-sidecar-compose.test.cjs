'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const compose = read('deploy-service/compose.yaml');
function service(name) {
  const start = compose.search(new RegExp(`^  ${name}:\\n`, 'm'));
  assert(start >= 0, name);
  return compose.slice(start).split(/\n(?=  [a-z][\w-]*:\n|volumes:\n|networks:\n)/)[0];
}
test('measurement worker shares only the explicit sidecar namespace and private read-only auth', () => {
  const worker = service('measurements'), proxy = service('measurement-proxy');
  assert.match(worker, /network_mode: service:measurement-proxy/);
  for (const body of [worker, proxy]) {
    assert.match(body, /profiles: \[measurement-route\]/);
    assert.doesNotMatch(body, /\n    ports:|network_mode: host|host\.docker\.internal|env_file:/);
    assert.match(body, /read_only: true/);
    assert.match(body, /create_host_path: false/);
  }
  assert.match(worker, /MEASUREMENT_SECRET_DIR: \/run\/secrets\/measurement-auth/);
  assert.doesNotMatch(worker, /observatory-data|STORE_FILE: \/data\/collector/);
  assert.match(proxy, /pull_policy: never/);
  assert.match(proxy, /networks: \[measurement-egress\]/);
});
test('measurement DB is separate while existing collector volume and disabled default stay intact', () => {
  for (const name of ['web', 'measurements']) {
    assert.match(service(name), /MEASUREMENT_STORE_FILE: \/measurement-data\/measurements\.sqlite/);
    assert.match(service(name), /measurement-data:\/measurement-data/);
  }
  assert.match(service('web'), /STORE_FILE: \/data\/collector.sqlite/);
  assert.match(service('worker'), /COLLECTION_ENABLED: \$\{COLLECTION_ENABLED:-false\}/);
  assert.match(service('web'), /127\.0\.0\.1:8080:8080/);
  const production = read('deploy-service/compose.production.yaml');
  assert.doesNotMatch(production.split('  proxy:')[0], /ports:/);
});
test('image copies runtime allowlist rather than the private deployment directory', () => {
  const docker = read('deploy-service/Dockerfile');
  assert.doesNotMatch(docker, /^COPY deploy-service \/app\/deploy-service/m);
  assert.match(docker, /^COPY deploy-service\/\*\.cjs \/app\/deploy-service\//m);
  const allowedHealthcheck = 'COPY deploy-service/measurement-sidecar/local-healthcheck.cjs /app/deploy-service/measurement-sidecar/local-healthcheck.cjs';
  const privateCopies = text => text.split(/\r?\n/).filter(line => /^COPY\s/i.test(line) && /measurement-sidecar|measurement-secrets|\.env|credentials|measurement-auth/i.test(line) && line !== allowedHealthcheck);
  assert.deepEqual(privateCopies(docker), []);
  assert(docker.split(/\r?\n/).includes(allowedHealthcheck));
  for (const unsafe of ['COPY deploy-service/measurement-sidecar /app/sidecar', 'COPY deploy-service/measurement-sidecar/* /app/sidecar/', 'COPY deploy-service/measurement-sidecar/config.yaml /app/config.yaml', 'COPY deploy-service/.env /app/.env', 'COPY deploy-service/data/measurement-auth /app/auth', allowedHealthcheck + ' extra']) assert.equal(privateCopies(unsafe).length, 1, unsafe);
  const ignore = read('deploy-service/Dockerfile.dockerignore');
  assert.match(ignore, /^!deploy-service\/measurement-sidecar\/local-healthcheck\.cjs$/m);
  assert.doesNotMatch(ignore, /^!deploy-service\/measurement-sidecar\/(?:\*|\*\*|config.*|.*\.env|.*auth.*)$/m);
  const config = read('deploy-service/measurement-sidecar/config.example.yaml');
  assert.match(config, /bind-address: 127\.0\.0\.1/);
  assert.match(config, /allow-lan: false/);
  assert.match(config, /proxies: \[\]/);
  assert.match(config, /proxies: \[REJECT\]/);
  assert.doesNotMatch(config, /DIRECT|proxy-providers:|https?:\/\//);
});
test('fixture remains isolated and synthetic without host ports or persistence', () => {
  const fixture = read('deploy-service/measurement-sidecar/compose.fixture.yaml');
  assert.match(fixture, /network_mode: none/);
  assert.match(fixture, /network_mode: service:fixture-sidecar/);
  assert.doesNotMatch(fixture, /\n    ports:|collector\.sqlite|measurements\.sqlite|\.env/);
  assert.equal((fixture.match(/pull_policy: never/g) || []).length, 2);
});
test('production-image readiness uses only its own empty volume and an inert network namespace', () => {
  const readiness = read('deploy-service/measurement-sidecar/compose.readiness.yaml');
  assert.match(readiness, /network_mode: none/);
  assert.equal((readiness.match(/network_mode: service:namespace-holder/g) || []).length, 2);
  assert.match(readiness, /isolated-measurement-data:\/measurement-data:ro/);
  assert.doesNotMatch(readiness, /env_file:|\n    ports:|observatory-data|collector\.sqlite/);
  const ignore = read('deploy-service/Dockerfile.dockerignore');
  assert.match(ignore, /^\*\*$/m);
  assert.doesNotMatch(ignore, /^!deploy-service\/\*\*$/m);
  assert.match(ignore, /^!deploy-service\/\*\.cjs$/m);
});
test('slim image bootstraps only public Node roots and keeps official HTTPS verification', () => {
  const docker = read('deploy-service/Dockerfile');
  assert.match(docker, /require\('tls'\)\.rootCertificates/);
  assert.match(docker, /https:\/\/deb\.debian\.org/);
  assert.match(docker, /Acquire::Retries "3"/);
  assert.doesNotMatch(docker, /NODE_TLS_REJECT_UNAUTHORIZED|Verify-Peer.*false|trusted=yes|strict-ssl.*false|--insecure/);
});
test('optional Docker CLI validates resolved Compose contracts without reading service env files', { skip: process.env.RUN_MEASUREMENT_COMPOSE_VALIDATION !== '1' }, () => {
  const r = spawnSync('docker', ['compose', '--env-file', 'deploy-service/measurement-sidecar/compose.example.env', '-f', 'deploy-service/compose.yaml', '-f', 'deploy-service/compose.production.yaml', '--profile', 'measurement-route', 'config', '--no-env-resolution', '--format', 'json'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  const config = JSON.parse(r.stdout);
  assert.equal(config.services.measurements.network_mode, 'service:measurement-proxy');
  assert.equal(config.services['measurement-proxy'].ports, undefined);
  assert.equal(config.services.measurements.ports, undefined);
  assert.equal(config.services['measurement-proxy'].pull_policy, 'never');
  for (const name of ['measurements', 'measurement-proxy']) assert(config.services[name].volumes.filter(v => v.type === 'bind').every(v => v.read_only && v.bind.create_host_path === false));
});
