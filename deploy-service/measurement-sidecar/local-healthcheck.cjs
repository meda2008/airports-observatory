'use strict';
const net = require('node:net');
function probe(port = Number(process.env.MEASUREMENT_PROXY_PORT || 7890), timeout = 2000) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = ok => { if (done) return; done = true; socket.destroy(); resolve(ok); };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}
function workerReady(filename, now = Date.now()) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const row = db.prepare('SELECT body, observed_at FROM measurement_worker_status WHERE id=1').get();
    return !!row && ['running', 'paused'].includes(JSON.parse(row.body).status) &&
      now - Date.parse(row.observed_at) >= 0 && now - Date.parse(row.observed_at) < 120000;
  } finally { db.close(); }
}
if (require.main === module) {
  if (process.argv.includes('--worker')) {
    try { process.exitCode = workerReady(process.env.MEASUREMENT_STORE_FILE) ? 0 : 1; }
    catch { process.exitCode = 1; }
  } else probe().then(ok => { process.exitCode = ok ? 0 : 1; });
}
module.exports = { probe, workerReady };
