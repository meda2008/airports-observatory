'use strict';
const $ = id => document.getElementById(id);
let state = null, busy = false, lastAck = null, renderedFrame = null, refreshId = 0, refreshing = false;

async function request(body) {
  const r = await fetch('/api/admin/assistance/A016', {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: body ? { 'content-type': 'application/json', 'x-airports-assist': '1' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw Error(r.status === 401 ? '请先使用后台管理员权限登录。' : '操作未被接受，请刷新当前服务状态。');
  return r.json();
}
function render(s) {
  state = s;
  $('status').textContent = s ? `状态：${s.status}；命令 ${s.ack}/${s.seq}；到期 ${new Date(s.expiresAt).toLocaleString()}` : '尚未创建服务会话。';
  const screen = $('screen'), view = s?.view;
  if (view?.image) {
    const frame = view.frameSha256 || view.image;
    if (renderedFrame !== frame) screen.src = 'data:image/jpeg;base64,' + view.image;
    renderedFrame = frame;
    screen.hidden = false;
    $('description').textContent = (view.text || 'Oracle当前画面') + (view.gate && !view.interactive ? '（站方未提供可操作验证控件，无需在空白处点击。）' : '');
  } else {
    screen.hidden = true;
    if (renderedFrame !== null) screen.removeAttribute('src');
    renderedFrame = null;
    $('description').textContent = '';
  }
  $('details').textContent = JSON.stringify(s ? { id: s.id, status: s.status, profileRevision: s.profileRevision, sameServiceContext: s.sameServiceContext, sessionSaved: s.sessionSaved, collectionJobId: s.collectionJobId, collectionRunId: s.collectionRunId, error: s.error } : null, null, 2);
  for (const id of ['snapshot', 'resume', 'cancel']) $(id).disabled = busy || !s || s.seq !== s.ack || ['expired', 'cancelled'].includes(s.status);
  $('click').disabled = busy || !view?.gate || !view?.interactive || s.seq !== s.ack;
  $('start').disabled = busy;
}
async function refresh(force = false) {
  if (busy || (refreshing && !force)) return;
  const id = ++refreshId;
  refreshing = true;
  try {
    const s = await request();
    if (id !== refreshId || busy) return;
    render(s);
    if (s?.error && s.ack !== lastAck) $('error').textContent = s.error;
    lastAck = s?.ack;
  } catch (e) {
    if (id === refreshId && !busy) $('error').textContent = e.message;
  } finally {
    if (id === refreshId) refreshing = false;
  }
}
async function act(op, extra = {}) {
  if (busy) return;
  busy = true;
  refreshId++;
  $('error').textContent = '';
  render(state);
  try { await request({ op, ...(op === 'start' ? {} : { id: state?.id }), ...extra }); }
  catch (e) { $('error').textContent = e.message; }
  finally { busy = false; render(state); await refresh(true); }
}
for (const op of ['start', 'snapshot', 'resume', 'cancel']) $(op).addEventListener('click', () => act(op));
$('screen').addEventListener('click', e => {
  if (!state?.view?.gate || !state?.view?.interactive || state.seq !== state.ack || busy) return;
  const b = $('screen').getBoundingClientRect(), x = Math.floor((e.clientX - b.left) * 1280 / b.width), y = Math.floor((e.clientY - b.top) * 900 / b.height);
  $('x').value = x;
  $('y').value = y;
  act('click', { x, y, frameSha256: state.view.frameSha256 });
});
$('coordinates').addEventListener('submit', e => {
  e.preventDefault();
  if (!state?.view?.gate || !state?.view?.interactive || state.seq !== state.ack) return;
  act('click', { x: Number($('x').value), y: Number($('y').value), frameSha256: state.view.frameSha256 });
});
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 3000);
