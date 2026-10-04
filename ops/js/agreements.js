// 운영자 콘솔 › 계약서 — 상담사 입점계약서·상담소 제휴계약서를 고치고 [게시]하고, 서명한 계약서를 모아 본다 (서버: agreements.js)
//  게시하는 순간부터 아직 서명 안 한 상담사·상담소에게 앱을 열 때 서명 창이 뜬다. 새 판을 게시하면 모두 다시 서명한다.
//  app.js 보다 먼저 읽힌다 — app.js 의 D·adminGet·adminPost·render·esc·toast 는 부를 때 찾는다.
window.AGR_UI = { kind: 'counselor', edit: {} };   // edit[kind] = 고치는 중인 글 — 화면이 다시 그려져도 잃지 않게
window.loadAgreements = async function () {
  D.agr = undefined; render();
  const r = await adminGet('/api/admin/agreements');
  D.agr = r || null;
  if (r) {
    for (const k of ['counselor', 'clinic']) {
      const latest = (r.versions || []).find(v => v.kind === k);
      if (latest) { const v = await adminGet(`/api/admin/agreements/version?kind=${k}&ver=${latest.ver}`); D['agrText_' + k] = v && v.item ? v.item : null; }
    }
  }
  render();
};
window.viewAgreements = function () {
  const d = D.agr;
  if (d === undefined) return '<div class="card"><p class="muted">불러오는 중…</p></div>';
  if (!d) return '<div class="card"><p class="muted">불러오지 못했어요. 새로고침해 주세요.</p></div>';
  const k = AGR_UI.kind, name = (d.kinds || {})[k] || '';
  const vs = (d.versions || []).filter(v => v.kind === k);
  const pubVer = (d.published || {})[k] || 0;
  const pub = vs.find(v => v.ver === pubVer);
  const draft = vs.find(v => v.status === 'draft');
  const parties = (d.parties || {})[k] || [];
  const done = parties.filter(p => p.current), todo = parties.filter(p => !p.current);
  const txt = D['agrText_' + k];
  const body = AGR_UI.edit[k] != null ? AGR_UI.edit[k].body : (txt ? txt.body : '');
  const title = AGR_UI.edit[k] != null ? AGR_UI.edit[k].title : (txt ? txt.title : name);
  const blanks = (body.match(/\[[^\]]{1,40}\]/g) || []).length;
  const memos = (body.match(/^검토 메모/gm) || []).length;
  const fmt = ms => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const signs = (d.signs || []).filter(g => g.kind === k);
  return `
    <div class="row wrap" style="gap:0.4rem; margin-bottom:0.8rem;">
      <button class="btn ${k === 'counselor' ? '' : 'ghost'}" data-agr="kind" data-k="counselor">상담사 입점계약서</button>
      <button class="btn ${k === 'clinic' ? '' : 'ghost'}" data-agr="kind" data-k="clinic">상담소 제휴계약서</button>
    </div>
    <div class="card">
      <div class="sec-title">${esc(name)} — 지금 상태</div>
      ${pub ? `<p style="margin:0.2rem 0;"><b>${pub.ver}판 게시 중</b> · ${fmt(pub.published_at)} 게시. 이 판에 서명하지 않은 ${k === 'counselor' ? '상담사' : '상담소'}에게 앱을 열 때마다 서명 창이 떠요.</p>`
             : `<p style="margin:0.2rem 0; color: var(--danger);"><b>아직 게시된 계약서가 없어요.</b> 게시하기 전에는 서명 창이 뜨지 않아요.</p>`}
      ${draft ? `<p class="muted" style="margin:0.2rem 0;">게시 전 초안 ${draft.ver}판 · ${fmt(draft.updated)} 고침</p>` : ''}
      <p style="margin:0.5rem 0 0; font-size:1.05rem;">서명 완료 <b>${done.length}</b> / 대상 <b>${parties.length}</b></p>
    </div>
    <div class="card">
      <div class="sec-title">아직 서명하지 않은 곳 <span class="right muted">${todo.length}곳</span></div>
      ${todo.length ? todo.map(p => `<div class="row" style="padding:0.35rem 0; border-bottom:1px solid var(--line);"><span class="grow"><b>${esc(p.name)}</b> <span class="muted">${esc(p.sub || '')}</span><br><span class="muted">${esc(p.email || '이메일 없음')}${p.signedVer ? ` · 예전 ${p.signedVer}판에 서명` : ''}</span></span></div>`).join('') : '<p class="muted">모두 서명했어요.</p>'}
    </div>
    <div class="card">
      <div class="sec-title">서명한 계약서 <span class="right muted">${signs.length}건</span></div>
      ${signs.length ? signs.map(g => `<div class="row" style="padding:0.35rem 0; border-bottom:1px solid var(--line);"><span class="grow"><b>${esc(g.party_name || '')}</b> · ${esc(g.signer_name)} <span class="chip">${g.ver}판</span><br><span class="muted">${fmt(g.signed_at)}</span></span><button class="btn ghost sm" data-agr="view" data-id="${esc(g.id)}">보기·인쇄</button></div>`).join('') : '<p class="muted">아직 없어요.</p>'}
    </div>
    <div class="card">
      <div class="sec-title">계약서 고치기 ${txt ? `<span class="right muted">${txt.ver}판 ${txt.status === 'published' ? '(게시됨 — 저장하면 새 초안이 돼요)' : '(게시 전 초안)'}</span>` : ''}</div>
      ${blanks || memos ? `<p style="margin:0.2rem 0 0.5rem; padding:0.5rem 0.7rem; border-radius:10px; background:rgba(226,160,60,0.15);">채울 <b>[빈칸] ${blanks}곳</b>${memos ? `, <b>검토 메모 ${memos}줄</b>` : ''}이 남아 있어요. 변호사·세무사 검토 뒤 채우고, 검토 메모 줄은 지운 다음 게시하세요.</p>` : ''}
      <p class="muted" style="margin:0 0 0.4rem;"><code>{{갑}}</code> <code>{{을}}</code> <code>{{을_이메일}}</code> <code>{{서명일}}</code> 은 서명할 때 회사·서명자 정보로 자동으로 채워져요.</p>
      <label class="muted">제목 <input id="agr-title" maxlength="80" value="${esc(title)}"></label>
      <textarea id="agr-text" rows="22" style="width:100%; margin-top:0.4rem; font-size:0.86rem; line-height:1.6;">${esc(body)}</textarea>
      <div class="row" style="margin-top:0.5rem; gap:0.4rem;"><span class="grow"></span>
        <button class="btn ghost" data-agr="save">초안 저장</button>
        <button class="btn" data-agr="publish" ${draft ? '' : 'disabled title="초안을 먼저 저장하세요"'}>${draft ? draft.ver + '판 게시' : '게시'}</button></div>
    </div>`;
};
async function agrSave() {
  const k = AGR_UI.kind;
  const r = await adminPost('/api/admin/agreements/save', { kind: k, title: (document.getElementById('agr-title') || {}).value || '', body: (document.getElementById('agr-text') || {}).value || '' });
  if (r && r.ok) { AGR_UI.edit[k] = null; toast(`${r.ver}판 초안을 저장했어요`); await loadAgreements(); return r.ver; }
  toast(r && r.error === 'body' ? '본문이 너무 짧아요' : '저장하지 못했어요');
  return 0;
}
async function agrPublish() {
  const k = AGR_UI.kind;
  const ver = await agrSave(); if (!ver) return;
  const txt = D['agrText_' + k] || {};
  const blanks = ((txt.body || '').match(/\[[^\]]{1,40}\]/g) || []).length;
  const who = k === 'counselor' ? '모든 상담사' : '모든 상담소';
  const msg = (blanks ? `아직 [빈칸]이 ${blanks}곳 남아 있어요.\n` : '') + `${ver}판을 게시하면 ${who}에게 다음 접속 때 서명 창이 떠요. 게시할까요?\n(되돌릴 수 없어요 — 고치려면 새 판을 게시해야 해요)`;
  if (!confirm(msg)) return;
  const r = await adminPost('/api/admin/agreements/publish', { kind: k, ver });
  if (r && r.ok) { toast(`${ver}판을 게시했어요`); loadAgreements(); } else toast('게시하지 못했어요');
}
async function agrView(id) {
  const w = window.open('', '_blank');
  if (!w) return toast('새 창이 막혀 있어요. 팝업을 허용해 주세요');
  w.document.write('<p style="font-family:sans-serif">불러오는 중…</p>');
  const r = await adminGet('/api/admin/agreements/sign?id=' + encodeURIComponent(id));
  const it = r && r.item;
  if (!it) { w.document.body.innerHTML = '<p>불러오지 못했어요.</p>'; return; }
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = String(it.body).split('\n').filter(l => l.trim()).map(l => /^제\s?\d+\s?조/.test(l) ? `<h3>${e(l)}</h3>` : `<p>${e(l)}</p>`).join('');
  w.document.open();
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${e(it.title)} — ${e(it.party_name || '')}</title>
<style>body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;max-width:760px;margin:2rem auto;padding:0 1.2rem;color:#222;line-height:1.75;font-size:14px}h1{font-size:1.5rem}h3{font-size:1rem;margin:1.2rem 0 .3rem}table{border-collapse:collapse;width:100%;font-size:13px}td{border:1px solid #ccc;padding:.4rem .6rem;vertical-align:top}td:first-child{width:130px;background:#f6f6f6}.sig{height:120px;border:1px solid #ccc;border-radius:8px;background:#fff}.bar{position:sticky;top:0;background:#fff;padding:.6rem 0;border-bottom:1px solid #eee}@media print{.bar{display:none}}</style></head><body>
<div class="bar"><button onclick="print()">인쇄 · PDF로 저장</button></div>
<h1>${e(it.title)}</h1><p>${it.ver}판 · 전자 서명본</p>${paras}
<h3>서명</h3><img class="sig" src="${it.signature}" alt="서명">
<h3>서명 증빙</h3><table>
<tr><td>당사자</td><td>${e(it.party_name)} (${e(it.kind === 'counselor' ? '상담사' : '상담소')} · ${e(it.party_id)})</td></tr>
<tr><td>서명자</td><td>${e(it.signer_name)}${it.signer_email ? ' · ' + e(it.signer_email) : ''}</td></tr>
<tr><td>서명 시각</td><td>${new Date(it.signed_at).toLocaleString('ko-KR')} (KST)</td></tr>
<tr><td>접속 정보</td><td>IP ${e(it.ip || '—')}<br>${e(it.ua || '')}</td></tr>
<tr><td>문서 지문</td><td style="word-break:break-all">SHA-256 ${e(it.body_hash)}<br><span style="color:#777">제목과 위 본문을 그대로 이어 붙인 글의 지문 — 본문이 한 글자라도 바뀌면 달라집니다</span></td></tr>
<tr><td>서명 번호</td><td>${e(it.id)}</td></tr></table></body></html>`);
  w.document.close();
}
document.addEventListener('input', e => {
  if (e.target.id !== 'agr-text' && e.target.id !== 'agr-title') return;
  AGR_UI.edit[AGR_UI.kind] = { title: (document.getElementById('agr-title') || {}).value || '', body: (document.getElementById('agr-text') || {}).value || '' };
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-agr]'); if (!el) return;
  const a = el.dataset.agr;
  if (a === 'kind') { AGR_UI.kind = el.dataset.k; render(); }
  else if (a === 'save') agrSave();
  else if (a === 'publish') agrPublish();
  else if (a === 'view') agrView(el.dataset.id);
});
