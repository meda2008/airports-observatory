import { coreCardProjection } from './core-view.mjs?v=7e84e159919ba916381314d9c4584f8fc9a81fab2cf12963a9ced999578c6a66';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^A\d{3}$/;

// A read model of the already-qualified public snapshot. No new business facts,
// source grading, or probability calculations belong in this projection.
export function browserDataDocuments(catalog, sources, hashes) {
  if (!HASH.test(hashes?.catalogSha256 || '') || !HASH.test(hashes?.sourcesSha256 || '')) throw new Error('Invalid browser snapshot binding');
  const sourceMap = new Map(sources.items.map(source => [source.id, source]));
  if (sourceMap.size !== sources.items.length) throw new Error('Duplicate public source');
  const documents = new Map();
  const { items, ...metadata } = catalog;
  const index = { ...metadata, schemaVersion: 'airports-browser-index.v1', ...hashes, items: [] };
  const seen = new Set();
  for (const record of items) {
    if (!ID.test(record.id) || seen.has(record.id)) throw new Error('Invalid or duplicate browser record');
    seen.add(record.id);
    const references = new Set();
    const collect = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value.sourceIds)) for (const id of value.sourceIds) {
        if (!sourceMap.has(id)) throw new Error('Unresolved public source ' + id);
        references.add(id);
      }
      for (const child of Object.values(value)) if (child && typeof child === 'object') collect(child);
    };
    collect(record);
    const bundle = { schemaVersion: 'airports-browser-detail.v1', ...hashes, record,
      sources: sources.items.filter(source => references.has(source.id)) };
    documents.set('data/details/' + record.id + '.json', bundle);
    index.items.push({ id: record.id, name: record.name, category: record.category,
      officialUrl: record.officialUrl, listing: record.listing,
      domainObservations: (record.domainObservations || []).map(entry => ({ domain: entry.domain })),
      coreInfo: { website: { url: record.coreInfo?.website?.url } },
      cardProjection: coreCardProjection(record) });
  }
  documents.set('data/browser-index.json', index);
  return documents;
}

export function validateBrowserIndex(data, revision) {
  if (data?.schemaVersion !== 'airports-browser-index.v1' || data.catalogSha256 !== revision ||
      !HASH.test(data.sourcesSha256 || '') || !Array.isArray(data.items) || !data.summary || !Array.isArray(data.categories)) {
    throw new Error('公开名录版本不一致或格式不完整，请重新读取。');
  }
  return data;
}

export function validateBrowserDetail(data, id, index) {
  if (!ID.test(id) || data?.schemaVersion !== 'airports-browser-detail.v1' || data.record?.id !== id ||
      data.catalogSha256 !== index.catalogSha256 || data.sourcesSha256 !== index.sourcesSha256 || !Array.isArray(data.sources)) {
    throw new Error('详情与名录版本不一致或格式不完整，请重新读取。');
  }
  const sourceMap = new Map(data.sources.map(source => [source.id, source]));
  if (sourceMap.size !== data.sources.length) throw new Error('详情来源重复，请重新读取。');
  const collect = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.sourceIds)) for (const sourceId of value.sourceIds) {
      if (!sourceMap.has(sourceId)) throw new Error('详情缺少引用来源，请重新读取。');
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') collect(child);
  };
  collect(data.record);
  return data;
}
