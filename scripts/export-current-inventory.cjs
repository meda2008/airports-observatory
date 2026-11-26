'use strict';

// Local, read-only input snapshot. Only this script's output directory is written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { makeCatalogService } = require('../lib/catalog-service.cjs');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'outputs/database-inventory-current');
const LABELS = { pricing:'报价', payment:'支付', promotions:'优惠条款', refund:'退款', privacy:'隐私', compatibility:'设备与使用条件', trial:'试用', speed:'实测速度', stability:'实测稳定性', operatingHistory:'运营历史', referral:'推荐链接' };
const text = v => typeof v === 'string' && v.trim() ? v.trim() : null;
const array = v => Array.isArray(v) ? v : [];
const unique = v => [...new Set(v.filter(x => typeof x === 'string' && x))];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function allSourceIds(value, out = []) {
  if (!value || typeof value !== 'object') return unique(out);
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:sourceIds|provenanceIds|continuitySourceIds|establishedSourceIds|evidenceIds)$/.test(key)) out.push(...array(child));
    else if (/^(?:sourceId|source_id|provenanceId|evidenceId|evidence_id)$/.test(key) && typeof child === 'string') out.push(child);
    if (child && typeof child === 'object') allSourceIds(child, out);
  }
  return unique(out);
}
function csvCell(value) {
  let s = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Excel also recognises formulas after leading whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(s) || /^[\t\r\n]/u.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function csv(rows, columns) { return '\ufeff' + [columns.map(csvCell).join(','), ...rows.map(row => columns.map(k => csvCell(row[k])).join(','))].join('\r\n') + '\r\n'; }
const htmlEscape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function readStore(filename, {publicationOnly = false, verifyEvidenceBodies = !publicationOnly} = {}) {
  if (!filename || filename === ':memory:' || !fs.existsSync(filename)) return { available:false, reason:'SQLite 文件不存在', sites:[], changes:[], proposals:[], referrals:[], evidence:[], observations:[] };
  const db = new DatabaseSync(filename, {readOnly:true});
  try {
    // A newly started WAL writer may briefly hold a recovery/schema lock.
    // Bound the wait; never turn a locked snapshot into an empty inventory.
    db.exec('PRAGMA busy_timeout=5000');
    db.exec('BEGIN');
    const table = name => db.prepare('SELECT * FROM ' + name + ' ORDER BY rowid').all();
    const json = s => s === null ? null : JSON.parse(s);
    const evidenceFrom = publicationOnly
      ? 'FROM evidence e WHERE e.id IN (SELECT evidence_id FROM referrals) ORDER BY e.rowid'
      : 'FROM evidence e ORDER BY e.rowid';
    const value = {
      available:true, filename:path.relative(ROOT,filename).replaceAll('\\','/'),
      sites:table('sites').map(r => ({...r,config:json(r.config),document:json(r.document)})),
      changes:table('changes').map(r => ({...r,before:json(r.before_json),after:json(r.after_json),patch:json(r.patch),before_json:undefined,after_json:undefined})),
      proposals:table('proposals').map(r => ({...r,patch:json(r.patch),evidenceIds:json(r.evidence_ids),evidence_ids:undefined})),
      referrals:table('referrals'),
      evidence: verifyEvidenceBodies
        ? Array.from(db.prepare(`SELECT e.* ${evidenceFrom}`).iterate(), ({body,...r}) => ({...r,retainedBodyBytes:Buffer.byteLength(body),retainedBodySha256:sha(body)}))
        : db.prepare(`SELECT e.id,e.site_id,e.url,e.sha256,e.kind ${evidenceFrom}`).all(),
      observations:publicationOnly ? [] : table('observations')
    };
    db.exec('COMMIT');
    return value;
  } finally { db.close(); }
}

function overlay(record, site, store) {
  const result = {...record.coreInfo}, applied = [], issues = [];
  if (!site) return {coreInfo:result,applied,issues};
  const changes = store.changes.filter(c => c.site_id === site.id && c.revision <= site.revision).sort((a,b) => a.revision-b.revision);
  const lastField = new Map();
  for (const change of changes) {
    const proposal = store.proposals.find(p => p.id === change.proposal_id);
    if (!proposal || proposal.status !== 'approved' || !proposal.reviewer || proposal.site_id !== site.id || proposal.expected_revision !== change.revision-1) {
      issues.push('复核链不匹配，未叠加 change ' + change.id); continue;
    }
    for (const field of Object.keys(change.patch)) lastField.set(field, {change,proposal});
  }
  const document = site.document.coreInfo || site.document;
  for (const [field, {change,proposal}] of lastField) {
    const changed = change.after.coreInfo || change.after;
    if (JSON.stringify(document[field]) !== JSON.stringify(changed[field])) { issues.push('当前文档与最新复核字段不一致，未叠加 ' + field); continue; }
    result[field] = document[field];
    applied.push({field,revision:change.revision,changeId:change.id,proposalId:proposal.id,reviewer:proposal.reviewer,reviewedAt:proposal.reviewed_at,evidenceIds:proposal.evidenceIds});
  }
  if (site.revision && !changes.some(c => c.revision === site.revision)) issues.push('当前 revision 缺少 changes 记录');
  return {coreInfo:result,applied,issues};
}

function assess(core, referral, record) {
  const out = {};
  function put(field, value, available, reasons, verification, status = value?.status || 'not_confirmed') {
    out[field] = {label:LABELS[field],status,materialAvailable:!!available,missing:!available,missingReasons:available?[]:reasons,remainingVerification:verification,sourceIds:allSourceIds(value),data:value ?? null};
  }
  const p = core.pricing || {}, plans = array(p.plans);
  const numeric = plans.filter(p => Number.isFinite(p.amount) && p.amount >= 0 && text(p.billingPeriod) && array(p.sourceIds).length);
  const pricingKnown = p.status !== 'not_confirmed' && numeric.length > 0;
  put('pricing',p,pricingKnown,['缺少有来源及计费周期的数值报价，或报价状态未确认'],['实际结算总额未核实', ...(numeric.some(p=>!p.currency)?['部分数值报价的 ISO 币种未确认']:[]), ...(numeric.length && numeric.every(p=>p.soldOut===true)?['数值报价均标售罄，当前可购买性未确认']:[])]);
  const offers = array(core.promotions);
  const qualifiedOffers = offers.filter(o => allSourceIds(o).length && text(o.quote) && text(o.status));
  const promotionKnown = qualifiedOffers.length>0,promotionEnded=promotionKnown&&qualifiedOffers.every(o=>o.active===false||/ended|expired/.test(o.status));
  put('promotions',offers,promotionKnown,['缺少有来源及原文的具体优惠条款'],['优惠到期、适用性和实际结算未验证；返佣绑定未知'],promotionEnded?'operator_announced_ended':promotionKnown?'stated_offer_not_checkout_verified':'not_confirmed');
  const pay = core.payment || {};
  const payKnown = pay.status !== 'not_confirmed' && pay.evidenceLevel !== 'unknown' && array(pay.methods).length && allSourceIds(pay).length;
  put('payment',pay,payKnown,['缺少有来源的具名支付渠道，或支付状态未确认'], pay.transactionVerified === true ? [] : ['支付页面或说明不证明交易成功']);
  for (const field of ['refund','trial','privacy','compatibility']) {
    const value = core[field] || {};
    const known = value.status && value.status !== 'not_confirmed' && text(value.summary) && allSourceIds(value).length;
    put(field,value,known,[value.status === 'not_confirmed' ? '状态为 not_confirmed；即使保留说明摘要也不计为已取得完整条款' : '缺少有来源且状态已确认的具体说明'],[field==='privacy'?'隐私主张未独立审计':field==='compatibility'?'设备与客户端要求未独立实测':field==='refund'?'退款实际执行未验证':'试用实际开通与执行未验证']);
  }
  for (const field of ['speed','stability']) {
    const value = core[field] || {}, observations = array(value.measured?.observations);
    const qualified = observations.filter(o => allSourceIds(o).length && o.sampleCount > 0 && text(o.methodology) && (text(o.network)||text(o.region)));
    put(field,value,qualified.length>0,['缺少带方法、网络/地区、样本数和来源的合格实测；宣传、第三方转述和旧称谓不算'],qualified.length?['测量仅适用于所列样本、时间及网络，不能外推未来服务']:['需要授权网络环境下的独立实测'],qualified.length?'scoped_measurements_available':value.status||'not_measured');
  }
  const history = core.operatingHistory || {};
  const checkedStatements=array(history.historyStatements).some(s=>s.literalChecked===true&&allSourceIds(s).length&&['archived_service_page','operator_opening_claim','platform_message_date','operator_announcement_date','third_party_opening_claim','third_party_operating_since_claim'].includes(s.kind)&&text(s.date)&&Number.isFinite(Date.parse(s.date))&&Date.parse(s.date)<=Date.now());
  const historyAvailable = allSourceIds(history).length && (history.startDate || Number.isInteger(history.startYear) || history.earliestEvidenceAt || text(history.claimText) || history.claimedFoundedAt || checkedStatements);
  put('operatingHistory',history,historyAvailable,['缺少可绑定记录且有来源的运营历史材料；域名、证书日期不能当作运营起点'],[...(!history.startDate&&!Number.isInteger(history.startYear)?['成立及运营起点未确认']:[]),...(!history.continuousOperationVerified?['连续经营未核实，不能据此称老牌']:[]),...(!history.independentHistoricalArchiveVerified?['历史材料未获独立历史档案验证']:[])]);
  const referralKnown = referral && referral.bindingVerified === true && referral.evidence_id && referral.url && referral.disclosure;
  put('referral',referral ? {...referral,sourceIds:referral.evidence_id?[referral.evidence_id]:[]} : {legacyReferralFieldPresent:record.legacyClaims?.has_referral_field===true},referralKnown,['缺少用户本人账号、同源证据和利益披露绑定的推荐链接；旧 referral 字段存在不算验证'],[],referralKnown?'verified_user_referral':'not_confirmed');
  return out;
}

function summarize(records) {
  return {records:records.length,fields:Object.fromEntries(Object.keys(LABELS).map(field => [field,{
    label:LABELS[field],materialAvailable:records.filter(r=>r.fields[field].materialAvailable).length,missing:records.filter(r=>r.fields[field].missing).length,
    remainingVerification:records.filter(r=>r.fields[field].remainingVerification.length).length,
    statuses:records.reduce((a,r)=>{const s=r.fields[field].status; a[s]=(a[s]||0)+1;return a;},{})
  }])),operatingStartMissing:records.filter(r=>!r.coreInfo.operatingHistory?.startDate&&!Number.isInteger(r.coreInfo.operatingHistory?.startYear)).length,continuousOperationUnverified:records.filter(r=>!r.coreInfo.operatingHistory?.continuousOperationVerified).length,overlayRecords:records.filter(r=>r.reviewedOverlay.applied.length).length,overlayIssues:records.flatMap(r=>r.reviewedOverlay.issues.map(reason=>({id:r.id,reason})))};
}

function buildHtml(records, summary) {
  const e = htmlEscape;
  const rows = records.map(r => `<tr data-primary="${r.primary}" data-missing="${Object.keys(r.fields).filter(f=>r.fields[f].missing).join(' ')}"><td>${e(r.id)}<br>${e(r.name)}</td><td>${r.primary?'primary':'非主目录'}</td>${Object.keys(LABELS).map(f=>{const {data,...state}=r.fields[f];return `<td class="${state.missing?'missing':'material'}">${e(state.status)}<br>${state.missing?'缺材料':'有材料'}<details><summary>状态、缺项及来源</summary><pre>${e(JSON.stringify(state,null,2))}</pre></details></td>`;}).join('')}<td><details><summary>记录元数据</summary><pre>${e(JSON.stringify({id:r.id,listing:r.listing,sourceIds:r.sourceIds,unresolvedSourceIds:r.unresolvedSourceIds,reviewedOverlay:r.reviewedOverlay},null,2))}</pre><a href="records.json" download>下载完整 JSON，查找 ${e(r.id)}</a></details></td></tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>当前机场数据与缺项盘点</title><style>body{font:15px/1.55 system-ui;margin:24px;color:#172536}aside{background:#fff0c9;padding:14px;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:9px;border:1px solid #ced6df;vertical-align:top}th{background:#edf3f8;position:sticky;top:0}input,select{padding:10px;margin:12px 8px 12px 0}pre{white-space:pre-wrap;word-break:break-word;max-height:500px;overflow:auto;min-width:260px;max-width:700px}.missing{background:#fff0ed}.material{background:#f1f8f3}.scroll{overflow:auto}a{color:#1468a0}</style><h1>当前数据与缺项盘点</h1><p>导出 ${e(summary.generatedAt)} · 全部 ${summary.scopes.all.records} 条 · primary ${summary.scopes.primary.records} 条</p><aside>“有材料”仅表示满足该字段所列材料门槛，绝不等于事实独立核实、当前服务可用或购买推荐。退款/试用状态 not_confirmed 即使带摘要也按缺项。经营自述、历史片段、运营起点与连续经营分别记录。SQLite 只叠加有 approved proposal / changes 对应的字段。完整记录和来源均保留；页面离线可用，不发送网络请求。</aside><p><a href="records.csv" download>全部 CSV（Excel）</a> · <a href="records.json" download>全部 JSON</a> · <a href="missing.csv" download>缺项 CSV</a> · <a href="summary.json" download>统计与口径</a> · <a href="primary/records.csv" download>primary CSV</a> · <a href="primary/records.json" download>primary JSON</a></p><div><input id="query" aria-label="搜索" placeholder="名称、编号、状态、原因、来源"><select id="scope" aria-label="目录范围"><option value="all">全部记录</option><option value="primary">仅 primary</option><option value="other">仅非主目录</option></select><select id="field" aria-label="缺项字段"><option value="">所有字段状态</option>${Object.entries(LABELS).map(([f,l])=>`<option value="${f}">缺少：${e(l)}</option>`).join('')}</select><span id="count"></span></div><div class="scroll"><table><thead><tr><th>记录</th><th>范围</th>${Object.values(LABELS).map(l=>`<th>${e(l)}</th>`).join('')}<th>完整记录</th></tr></thead><tbody>${rows}</tbody></table></div><script>const rows=[...document.querySelectorAll('tbody tr')];function filter(){const q=document.getElementById('query').value.toLowerCase(),scope=document.getElementById('scope').value,field=document.getElementById('field').value;let n=0;for(const row of rows){row.hidden=!(scope==='all'||(scope==='primary')===(row.dataset.primary==='true'))||!!field&&!row.dataset.missing.split(' ').includes(field)||!row.textContent.toLowerCase().includes(q);if(!row.hidden)n++;}document.getElementById('count').textContent=n+' 条记录';}for(const id of ['query','scope','field'])document.getElementById(id).addEventListener('input',filter);filter();</script></html>`;
}

function exportInventory({root=ROOT,output=OUTPUT,storeFile=path.join(root,'deploy-service/data/collector.sqlite'),clock=()=>Date.now(),writeFiles=true,publicationOnly=false,verifyEvidenceBodies=!publicationOnly,readInput}={}) {
  if (writeFiles) assert.equal(path.resolve(root),ROOT,'This export is scoped to this repository');
  const generatedAt = new Date(clock()).toISOString();
  const service = makeCatalogService({baseDir:root,clock:()=>Date.parse(generatedAt),readInput}), raw = service.rawExport();
  const projection = require('../lib/catalog-listing.cjs').loadCatalogProjection(root, { snapshot: raw, readInput });
  const publicCatalog = projection.doc;
  const listings = new Map(publicCatalog.items.map(r=>[r.id,r.listing]));
  assert.equal(listings.size,raw.catalog.length,'Public listing coverage differs from raw catalog');
  const store=readStore(storeFile,{publicationOnly,verifyEvidenceBodies});
  const sites=Map.groupBy(store.sites,s=>s.config.catalogId||s.id);
  const changes=Map.groupBy(store.changes,c=>c.site_id);
  const proposals=Map.groupBy(store.proposals,p=>p.site_id);
  const referrals=Map.groupBy(store.referrals,r=>r.site_id);
  const evidenceBySite=Map.groupBy(store.evidence,e=>e.site_id);
  const observations=Map.groupBy(store.observations,o=>o.evidence_id);
  const records = raw.catalog.map(catalogRecord => {
    assert(listings.has(catalogRecord.id),'Missing listing: '+catalogRecord.id);
    const site=sites.get(catalogRecord.id)?.[0], siteChanges=changes.get(site?.id)||[], siteProposals=proposals.get(site?.id)||[];
    const reviewedOverlay=overlay(catalogRecord,site,{changes:siteChanges,proposals:siteProposals});
    const coreInfo=reviewedOverlay.coreInfo; delete reviewedOverlay.coreInfo;
    const savedReferral=referrals.get(site?.id)?.[0];
    const referral=savedReferral?{...savedReferral,bindingVerified:false}:null;
    const siteEvidence=evidenceBySite.get(site?.id)||[];
    if(referral) {
      const evidence=siteEvidence.find(e=>e.id===referral.evidence_id);
      try { referral.bindingVerified=!!(evidence&&evidence.kind==='authorized_account_page'&&new URL(evidence.url).origin===new URL(referral.url).origin&&new URL(site.config.entryUrl).origin===new URL(referral.url).origin&&new URL(referral.url).protocol==='https:'&&text(referral.disclosure)); } catch { referral.bindingVerified=false; }
    }
    const fields=assess(coreInfo,referral,catalogRecord);
    const sourceEvidence=[...service.evidence(catalogRecord.id).sources,...array(catalogRecord.sourceMembership).map(s=>({...s,source_type:'legacy_roster_membership_not_verified_evidence'}))];
    const relatedIds=unique([...allSourceIds(catalogRecord),...allSourceIds(coreInfo),...reviewedOverlay.applied.flatMap(v=>v.evidenceIds),...allSourceIds(referral)]);
    const storeEvidence=siteEvidence.map(e=>({...e,observations:observations.get(e.id)||[]}));
    const resolvedIds=new Set([...sourceEvidence.map(s=>s.source_id),...storeEvidence.map(s=>s.id)]);
    return {id:catalogRecord.id,name:catalogRecord.name,category:catalogRecord.category,primary:listings.get(catalogRecord.id)?.primary!==false,listing:listings.get(catalogRecord.id),coreInfo,fields,missingFields:Object.keys(fields).filter(f=>fields[f].missing),sourceIds:relatedIds,unresolvedSourceIds:relatedIds.filter(id=>!resolvedIds.has(id)),catalogRecord,sourceEvidence,reviewedOverlay,storeSnapshot:site?{site,changes:siteChanges,proposals:siteProposals,referral,evidence:storeEvidence}:null};
  });
  const primary=records.filter(r=>r.primary);
  const summary={schemaVersion:'airports-current-inventory.v1',generatedAt,input:{...service.stats(),publicListingSha256:projection.sha256,sqlite:{available:store.available,filename:store.filename||null,reason:store.reason||null,readOnly:true,sites:store.sites.length,changes:store.changes.length,approvedProposals:store.proposals.filter(p=>p.status==='approved').length,referrals:store.referrals.length,snapshotSha256:sha(JSON.stringify(store))}},scopes:{all:summarize(records),primary:summarize(primary)},unresolvedSourceReferences:records.filter(r=>r.unresolvedSourceIds.length).map(r=>({id:r.id,sourceIds:r.unresolvedSourceIds})),definitions:{missing:'该字段未取得可用材料或状态未确认；不是服务不存在/不支持的结论。',materialAvailable:'字段所列门槛下有保留材料，不等于独立验证或执行成功。',pricing:'至少一条有来源、有限非负数值金额和计费周期的报价；ISO币种/实际结算及售罄限制另列。',payment:'非未知状态、有来源的具名支付方式；不验证交易。',refund:'状态非 not_confirmed、有来源的具体退款摘要；状态未确认的摘要不计完整条款。',privacy:'状态非 not_confirmed、有来源的隐私摘要；独立审计另列。',compatibility:'状态非 not_confirmed、有来源的设备或使用条件摘要；不是客户端实测。',trial:'状态非 not_confirmed、有来源的具体试用摘要；不是已开通。',speedAndStability:'coreInfo 保留的、带来源/样本数/方法/网络或地区的实测；宣传、转述、历史称谓均不计。',operatingHistory:'有来源的历史材料（自述、历史片段或起点）；运营起点和连续经营的缺口另行统计。',referral:'SQLite 具 evidence_id 的本人账号推荐链接及利益披露；旧字段存在不算验证。',overlay:'仅已批准 proposal 与 changes 对应且当前 document 字段相符的复核字段叠加；revision=0 初始种子不覆盖最新 catalog。',csv:'UTF-8 BOM、CRLF、所有值双引号；公式危险前缀加单引号；大 JSON 按30000字符分列，可顺序拼接。'},limitations:raw.limitations};
  const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
  function writeScope(dir,subset) {
    fs.mkdirSync(dir,{recursive:true});
    writeJson(path.join(dir,'records.json'),{schemaVersion:summary.schemaVersion,generatedAt,scope:dir===output?'all':'primary',count:subset.length,records:subset,...(dir===output?{rawExportMetadata:{...raw,catalog:undefined}}:{})});
    const csvRows=subset.map(r=>({id:r.id,name:r.name,primary:r.primary,category:r.category,website:r.coreInfo.website?.url,missingFields:r.missingFields,...Object.fromEntries(Object.keys(LABELS).flatMap(f=>[[f+'_status',r.fields[f].status],[f+'_missing',r.fields[f].missing],[f+'_missingReasons',r.fields[f].missingReasons],[f+'_remainingVerification',r.fields[f].remainingVerification],[f+'_sourceIds',r.fields[f].sourceIds]])),sourceIds:r.sourceIds,unresolvedSourceIds:r.unresolvedSourceIds,reviewedOverlay:r.reviewedOverlay,record:r}));
    const chunkCount=Math.max(1,...csvRows.map(r=>Math.ceil(JSON.stringify(r.record).length/30000)));
    for(const r of csvRows){const str=JSON.stringify(r.record);delete r.record;for(let i=0;i<chunkCount;i++)r['full_record_json_part_'+(i+1)]=str.slice(i*30000,(i+1)*30000);}
    const columns=Object.keys(csvRows[0]||{id:null,name:null});
    fs.writeFileSync(path.join(dir,'records.csv'),csv(csvRows,columns));
    const missingRows=subset.flatMap(r=>Object.entries(r.fields).flatMap(([field,state])=>[
      ...(state.missing?[{id:r.id,name:r.name,primary:r.primary,field,label:state.label,gapType:'material_missing',status:state.status,reasons:state.missingReasons,sourceIds:state.sourceIds}]:[]),
      ...(state.remainingVerification.length?[{id:r.id,name:r.name,primary:r.primary,field,label:state.label,gapType:'verification_or_scope_gap',status:state.status,reasons:state.remainingVerification,sourceIds:state.sourceIds}]:[])
    ]));
    fs.writeFileSync(path.join(dir,'missing.csv'),csv(missingRows,['id','name','primary','field','label','gapType','status','reasons','sourceIds']));
    writeJson(path.join(dir,'summary.json'),dir===output?summary:{schemaVersion:summary.schemaVersion,generatedAt,scope:'primary',summary:summary.scopes.primary,definitions:summary.definitions});
  }
  if(writeFiles){writeScope(output,records);writeScope(path.join(output,'primary'),primary);
  fs.writeFileSync(path.join(output,'index.html'),buildHtml(records,summary));}
  assert.equal(records.length,raw.catalog.length);assert.equal(records.length,new Set(records.map(r=>r.id)).size);
  for(const r of records)for(const f of ['refund','trial'])if(r.coreInfo[f]?.status==='not_confirmed')assert(r.fields[f].missing,r.id+' '+f+' incorrectly complete');
  return writeFiles?summary:{summary,records};
}
if(require.main===module) { const s=exportInventory();console.log(JSON.stringify({output:OUTPUT,generatedAt:s.generatedAt,scopes:s.scopes,unresolvedSourceReferenceRecords:s.unresolvedSourceReferences.length},null,2)); }
module.exports={exportInventory,assess,overlay,csvCell,csv,allSourceIds};
