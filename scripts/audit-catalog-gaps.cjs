'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {openCatalogDb} = require('../deploy-service/catalog-db.cjs');
const engine = require('../lib/collection-engine.cjs');

const ROOT = path.resolve(__dirname, '..');
const CONFLICT_RE = /conflict|rejected|for_sale|cloud_phone|personal_blog|demonstration/i;

function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|br|dd|dt)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 200) : '';
}

function auditDatabase({root = ROOT} = {}) {
  const db = openCatalogDb({filename: ':memory:', root});
  try {
    const sync = db.sync();
    const stats = db.stats();
    const records = db.searchExport().catalog || [];
    const gaps = [];
    let plansTotal = 0;
    let plansNoCurrency = 0;
    let plansNoQuota = 0;

    for (const r of records) {
      const c = r.coreInfo || {};
      const plans = c.pricing?.plans || [];
      plansTotal += plans.length;
      for (const p of plans) {
        if (!p.currency) plansNoCurrency++;
        if (!p.quota) plansNoQuota++;
      }
      const missing = [];
      if (!plans.length) missing.push('pricing');
      if (!(c.payment?.methods?.length)) missing.push('payment');
      if (!c.refund?.summary || /not_confirmed/.test(c.refund?.status || '')) missing.push('refund');
      if (!c.privacy?.summary || /not_confirmed/.test(c.privacy?.status || '')) missing.push('privacy');
      if (!c.compatibility?.summary || /not_confirmed/.test(c.compatibility?.status || '')) missing.push('compatibility');
      if (!missing.length) continue;

      const url = engine.safeUrl(c.website?.url);
      const websiteStatus = c.website?.status || 'unknown';
      const blockedByIdentity = CONFLICT_RE.test(websiteStatus);
      gaps.push({
        id: r.id,
        name: r.name,
        url,
        websiteStatus,
        missing,
        probeEligible: Boolean(url && !blockedByIdentity)
      });
    }

    return {
      snapshotId: sync.snapshotId,
      sourceAsOf: sync.sourceAsOf,
      counts: stats.counts,
      coverage: stats.coverage,
      planQuality: {plansTotal, plansNoCurrency, plansNoQuota},
      gapSummary: {
        recordsWithCoreGaps: gaps.length,
        probeEligibleCount: gaps.filter((g) => g.probeEligible).length,
        identityBlockedCount: gaps.filter((g) => !g.probeEligible).length
      },
      gaps
    };
  } finally {
    db.close();
  }
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < 120) {
    try {
      const resolved = new URL(m[1].trim(), baseUrl).href;
      out.push({url: resolved, label: stripHtml(m[2]).slice(0, 120)});
    } catch {}
  }
  return out;
}

async function fetchSnapshot(url, {timeoutMs = 10000, fetchImpl = globalThis.fetch} = {}) {
  const capturedAt = new Date().toISOString();
  const res = await fetchImpl(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {'User-Agent': 'AirportsObservatoryPublicAudit/1.0 (+read-only)', Accept: 'text/html,application/xhtml+xml'},
    signal: AbortSignal.timeout(timeoutMs)
  });
  const finalUrl = engine.safeUrl(res.url || url);
  if (!finalUrl) return {status: 'unsafe_redirect', httpStatus: res.status, capturedAt};
  const html = (await res.text()).slice(0, 300000);
  const title = extractTitle(html);
  const text = engine.redact(stripHtml(html));
  const snapshot = {
    url: finalUrl,
    title,
    text,
    capturedAt,
    passwordForm: /<input[^>]+type=["']?password/i.test(html),
    blocks: text.split(/\n{2,}/).filter(Boolean).slice(0, 80).map((t) => ({text: t}))
  };
  const rawClass = engine.classify(snapshot);
  const classification = res.status === 429
    ? 'rate_limited'
    : res.status >= 400
      ? (rawClass === 'needs_human_verification' ? rawClass : 'http_error')
      : rawClass;
  return {finalUrl, httpStatus: res.status, html, snapshot, classification, text, capturedAt};
}

async function probePublicSite(gap, {timeoutMs = 10000, maxSubpages = 2, fetchImpl = globalThis.fetch} = {}) {
  if (!gap.probeEligible || !gap.url) {
    return {id: gap.id, name: gap.name, url: gap.url, status: 'skipped_ineligible', missing: gap.missing, hints: []};
  }
  try {
    const first = await fetchSnapshot(gap.url, {timeoutMs, fetchImpl});
    if (first.status === 'unsafe_redirect') {
      return {id: gap.id, name: gap.name, url: gap.url, status: 'unsafe_redirect', httpStatus: first.httpStatus, missing: gap.missing, hints: []};
    }
    const pagesVisited = [{url: first.finalUrl, httpStatus: first.httpStatus, classification: first.classification, bodySha256: engine.sha(first.text)}];
    const allHints = [];
    if (first.classification === 'content_observed') {
      const sourceId = 'PUBLIC-PROBE-' + engine.sha(first.finalUrl + '|' + first.text).slice(0, 16);
      allHints.push(...engine.extract(first.snapshot, sourceId).filter((h) => gap.missing.includes(h.field)));
      const foundFields = new Set(allHints.map((h) => h.field));
      const remaining = gap.missing.filter((f) => !foundFields.has(f));
      if (remaining.length && maxSubpages > 0) {
        const origin = new URL(first.finalUrl).origin;
        const seenUrls = new Set([first.finalUrl]);
        const subLinks = extractLinks(first.html, first.finalUrl)
          .filter((l) => !seenUrls.has(l.url) && engine.safeReadLink(l, origin))
          .slice(0, maxSubpages);
        for (const sub of subLinks) {
          seenUrls.add(sub.url);
          try {
            const subRes = await fetchSnapshot(sub.url, {timeoutMs, fetchImpl});
            if (subRes.status === 'unsafe_redirect') continue;
            pagesVisited.push({url: subRes.finalUrl, httpStatus: subRes.httpStatus, classification: subRes.classification, bodySha256: engine.sha(subRes.text)});
            if (subRes.classification === 'content_observed') {
              const sid = 'PUBLIC-PROBE-' + engine.sha(subRes.finalUrl + '|' + subRes.text).slice(0, 16);
              allHints.push(...engine.extract(subRes.snapshot, sid).filter((h) => gap.missing.includes(h.field)));
            }
          } catch {}
        }
      }
    }
    return {
      id: gap.id,
      name: gap.name,
      url: gap.url,
      finalUrl: first.finalUrl,
      httpStatus: first.httpStatus,
      classification: first.classification,
      missing: gap.missing,
      matchedFields: [...new Set(allHints.map((h) => h.field))],
      hintCount: allHints.length,
      hints: allHints.slice(0, 15),
      pagesVisited,
      bodySha256: engine.sha(first.text),
      capturedAt: first.capturedAt
    };
  } catch (error) {
    return {
      id: gap.id,
      name: gap.name,
      url: gap.url,
      status: 'fetch_failed',
      error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error).slice(0, 160),
      missing: gap.missing,
      hints: []
    };
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, next));
  return results;
}

async function runCli(argv = process.argv.slice(2)) {
  const probe = argv.includes('--probe');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, Math.min(200, Number(limitArg.split('=')[1]) || 10)) : 10;
  const concurrencyArg = argv.find((a) => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg ? Math.max(1, Math.min(10, Number(concurrencyArg.split('=')[1]) || 5)) : 5;
  const fieldsArg = argv.find((a) => a.startsWith('--fields='));
  const targetFields = fieldsArg ? fieldsArg.split('=')[1].split(',').filter(Boolean) : null;
  const outArg = argv.find((a) => a.startsWith('--out='));

  const audit = auditDatabase();
  const output = {
    auditedAt: new Date().toISOString(),
    snapshotId: audit.snapshotId,
    sourceAsOf: audit.sourceAsOf,
    counts: audit.counts,
    planQuality: audit.planQuality,
    gapSummary: audit.gapSummary
  };

  if (probe) {
    const candidates = audit.gaps
      .filter((g) => g.probeEligible && (!targetFields || g.missing.some((f) => targetFields.includes(f))))
      .slice(0, limit);
    const probeResults = await runWithConcurrency(candidates, concurrency, (c) => probePublicSite(c));
    output.probeSummary = {
      attempted: probeResults.length,
      contentObserved: probeResults.filter((r) => r.classification === 'content_observed').length,
      matchedRecords: probeResults.filter((r) => (r.matchedFields || []).length > 0).length,
      totalHints: probeResults.reduce((acc, r) => acc + (r.hintCount || 0), 0),
      blockedOrFailed: probeResults.filter((r) => r.classification !== 'content_observed').length
    };
    output.probeResults = probeResults;
  } else {
    output.gaps = audit.gaps;
  }

  if (outArg) {
    const outPath = path.resolve(ROOT, outArg.split('=')[1]);
    fs.mkdirSync(path.dirname(outPath), {recursive: true});
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  }
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}

module.exports = {auditDatabase, probePublicSite, stripHtml, extractTitle};
