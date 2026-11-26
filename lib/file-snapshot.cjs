'use strict';
const fs = require('node:fs');

function createFileSnapshotReader(files, load) {
  let loadedVersion, snapshot;
  return () => {
    // Sample before loading so changes during a read are checked again on the next request.
    const version = files.map(file => {
      const stat = fs.statSync(file, { bigint: true, throwIfNoEntry: false });
      return stat ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}` : 'missing';
    }).join('|');
    if (version !== loadedVersion) {
      snapshot = load();
      loadedVersion = version;
    }
    return snapshot;
  };
}

module.exports = { createFileSnapshotReader };
