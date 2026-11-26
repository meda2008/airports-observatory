'use strict';
const net = require('node:net');
const dns = require('node:dns').promises;

function publicIP(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return a > 0 && a < 224 && a !== 10 && a !== 127 &&
    !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 0 || b === 168 || b === 88 && c === 99)) &&
    !(a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) &&
    !(a === 203 && b === 0 && c === 113);
}

function parsePublicUrl(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.port && !['80', '443'].includes(url.port)) throw Error('unsafe_url');
  return url;
}

async function publicAddresses(host, lookup = dns.lookup) {
  const rows = net.isIPv4(host) ? [{ address: host }] : await lookup(host, { all: true, family: 4 });
  if (!rows.length || rows.some(row => !publicIP(row.address))) throw Error('nonpublic_destination');
  return [...new Set(rows.map(row => row.address))];
}

async function assertPublicUrl(raw, lookup) {
  const url = parsePublicUrl(raw);
  await publicAddresses(url.hostname, lookup);
  return url;
}

module.exports = { publicIP, parsePublicUrl, publicAddresses, assertPublicUrl };
