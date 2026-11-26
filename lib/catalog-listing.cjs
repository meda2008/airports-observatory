'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeCatalogService } = require('./catalog-service.cjs');

const NON_PRODUCT_ENTRY_STATUSES = new Map([
  ['product_category_conflict', '保存入口当前介绍其他类型的产品或服务，尚未取得可绑定原机场的经营入口。'],
  ['saved_entry_cloud_phone_observed', '保存入口当前介绍云手机产品，尚未取得可绑定原机场的经营入口。'],
  ['demonstration_site_not_verified_official_service', '保存入口明确自称演示站点，尚未确认真实机场经营入口。'],
  ['saved_domain_for_sale_observed', '保存入口显示域名待售，尚未确认该服务的现行经营入口。'],
  ['saved_entry_personal_blog_observed', '保存入口显示个人博客，尚未取得可绑定该机场的业务入口。']
]);

function listingScope(record, coreInfo = record?.coreInfo || {}) {
  const airport = ['airport', 'niche'].includes(record?.category);
  const reason = NON_PRODUCT_ENTRY_STATUSES.get(coreInfo?.website?.status);
  return {
    primary: airport && !reason,
    ...(airport && reason
      ? {
          reason,
          observedAt: coreInfo.website.observedAt,
          sourceIds: coreInfo.website.sourceIds,
          reinstatementEvidence: '可核验的当前官方经营入口及其与原记录的归属关系。'
        }
      : {})
  };
}

function loadCatalogProjection(root = path.resolve(__dirname, '..'), { clock = () => Date.now(), service, snapshot } = {}) {
  const legacyPath = path.join(root, 'public-site/data/public-catalog.json');
  if (fs.existsSync(legacyPath)) {
    const bytes = fs.readFileSync(legacyPath);
    return {
      doc: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      source: 'legacy_public_catalog'
    };
  }
  const raw = snapshot || (service || makeCatalogService({ baseDir: root, clock })).rawExport();
  const items = raw.catalog.map((r) => ({
    ...r,
    listing: listingScope(r, r.coreInfo)
  }));
  const doc = {
    schemaVersion: 'airports-public-catalog.v1',
    evidenceAsOf: raw.evidenceAsOf,
    items,
    discoveryCandidates: raw.discoveryCandidates,
    limitations: raw.limitations
  };
  return {
    doc,
    sha256: crypto.createHash('sha256').update(JSON.stringify(items.map((i) => [i.id, i.listing]))).digest('hex'),
    source: 'catalog_v1'
  };
}

function loadCatalogSourceRows(root = path.resolve(__dirname, '..')) {
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^﻿/, ''));
  if (fs.existsSync(path.join(root, 'public-site/data/public-sources.json'))) return read('public-site/data/public-sources.json').items;
  return ['catalog/source-provenance.json', 'catalog/current-evidence.v1.json', 'catalog/core-supplement.v1.json']
    .flatMap(file => read(file).sources || []);
}

function retainedRefreshBatches(directory) {
  try {
    return fs.readdirSync(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

module.exports = { NON_PRODUCT_ENTRY_STATUSES, listingScope, loadCatalogProjection, loadCatalogSourceRows, retainedRefreshBatches };
