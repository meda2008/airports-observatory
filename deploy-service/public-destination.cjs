'use strict';
const net = require('node:net');
const dns = require('node:dns').promises;

const specialIPv4 = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 16], ['192.31.196.0', 24],
  ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['192.175.48.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]
]) specialIPv4.addSubnet(address, prefix, 'ipv4');

function publicIP(ip) {
  return net.isIPv4(ip) && !specialIPv4.check(ip, 'ipv4');
}

function parsePublicUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.port && !['80', '443'].includes(url.port)) throw Error('unsafe_url');
  return url;
}

async function publicAddresses(host, lookup = dns.lookup) {
  let timer;
  try {
    const rows = net.isIPv4(host) ? [{ address: host }] : await Promise.race([
      lookup(host, { all: true, family: 4 }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('dns_lookup_timeout')), 5000); })
    ]);
    if (!Array.isArray(rows) || !rows.length || rows.some(row => !publicIP(row?.address) ||
        (row.family !== undefined && row.family !== 4))) throw Error('nonpublic_destination');
    return [...new Set(rows.map(row => row.address))];
  } finally {
    clearTimeout(timer);
  }
}

async function assertPublicUrl(raw, lookup) {
  const url = parsePublicUrl(raw);
  await publicAddresses(url.hostname, lookup);
  return url;
}

module.exports = { publicIP, parsePublicUrl, publicAddresses, assertPublicUrl };
