'use strict';
const { spawn } = require('node:child_process');
const { probe } = require('./local-healthcheck.cjs');
function supervise({ child, check = probe, intervalMs = 2000, failureMs = 10000,
  killMs = 10000, now = Date.now, exit = code => { process.exitCode = code; } } = {}) {
  let firstFailure = null, checking = false, stopping = false, requestedCode = null, killTimer;
  const cleanup = () => { clearInterval(timer); clearTimeout(killTimer); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onTerm); };
  const stop = code => {
    if (stopping) return;
    stopping = true; requestedCode = code; clearInterval(timer);
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), killMs);
  };
  const onTerm = () => stop(0);
  const tick = async () => {
    if (checking || stopping) return;
    checking = true;
    try {
      const healthy = await check();
      if (stopping) return;
      if (healthy) firstFailure = null;
      else { firstFailure ??= now(); if (now() - firstFailure >= failureMs) stop(75); }
    } catch {
      firstFailure ??= now(); if (!stopping && now() - firstFailure >= failureMs) stop(75);
    } finally { checking = false; }
  };
  const timer = setInterval(tick, intervalMs);
  process.on('SIGTERM', onTerm); process.on('SIGINT', onTerm);
  child.once('error', () => { cleanup(); exit(requestedCode ?? 1); });
  child.once('exit', (code, signal) => { cleanup(); exit(requestedCode ?? code ?? (signal ? 1 : 0)); });
  return { tick, stop, cleanup };
}
if (require.main === module) {
  const child = spawn(process.execPath, ['/app/deploy-service/measurement-worker.cjs'], { stdio: 'inherit', env: process.env });
  supervise({ child });
}
module.exports = { supervise };
