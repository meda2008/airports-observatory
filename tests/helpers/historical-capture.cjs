'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

const historicalDatabases = new Set([
  'deploy-service/data/collector.sqlite',
  'deploy-service/data/performance-discovery.sqlite',
]);

function isHistoricalCapture(file) {
  return typeof file === 'string' && !file.includes('\\') && path.posix.normalize(file) === file && (
    (file.startsWith('work/') && file !== 'work/') ||
    /^catalog\/refresh\/\d{4}-\d{2}-\d{2}\/.+\.[a-z0-9]+$/i.test(file) ||
    historicalDatabases.has(file)
  );
}

function historicalCaptureOptions(...files) {
  const missing = [...new Set(files)].filter(file => {
    // Tests supply exact archive files or paths from the specific archived manifest they replay.
    if (!isHistoricalCapture(file)) throw new Error(`Invalid historical capture path: ${file}`);
    try {
      fs.lstatSync(path.join(root, file));
      return false;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return true;
    }
  });
  return missing.length ? { skip: `Historical capture unavailable: ${missing.join(', ')}` } : {};
}

function historicalDiscoveryOptions(...recordIds) {
  const { seeds } = require('../../collection/performance-discovery-sources.json');
  const files = seeds.filter(seed => recordIds.includes(seed.recordId))
    .flatMap(seed => [seed.nativeDiscovery?.file, seed.visibleExpansion?.nativeObservation?.file])
    .filter(file => file?.startsWith('work/'));
  return historicalCaptureOptions(...new Set(files));
}

function skipMissingHistoricalCaptures(context, ...files) {
  const { skip } = historicalCaptureOptions(...files);
  if (!skip) return false;
  context.skip(skip);
  return true;
}

module.exports = {
  historicalCaptureOptions,
  historicalDiscoveryOptions,
  isHistoricalCapture,
  skipMissingHistoricalCaptures,
};
