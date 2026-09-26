// ── 회기 기록 타임라인 (연결 내담자 전체) · 긴급 알림 로그 ─────────────────
LOADERS.urgent = () => hget('urgent').then(d => (d && d.ok) ? (DATA.urgent = d.items, DATA.urgentMigrated = d.migrated !== false, d) : null);
const NT = { risk: '', counselor: '', q: '', kind: '' };
const UR = { onlyOpen: true };

function noteCardHtml(n, withClient) {
  return `
    <div class="ti ${n.risk === 'urgent' ? 'urgent' : n.risk === 'watch' ? 'watch' : ''}">
      <div class="card ${n.risk === 'urgent' ? 'urgent' : n.risk === 'watch' ? 'watch' : ''}">
        <div class="row wrap" style="gap:0.4rem;">
          ${withClient ? `<button class="btn ghost xs" data-act="open-patient" data-id="${esc(n.clientId)}"><b>${esc(n.clientName || '내담자')}</b> ›</button>` : ''}
          <span class="chip ok">${KIND_LABEL[n.kind] || '상담'}</span><span class="small">${esc(n.counselor || '상담사')}</span>${n.risk !== 'none' ? RISK_CHIP[n.risk] : ''}
          <span class="muted right" title="${esc(fmtDate(n.ts))}">${fmtDT(n.ts)}</span></div>
        <p class="pre small" style="margin-top:0.4rem;">${esc(n.summary)}</p>
        ${n.plan ? `<p class="muted" style="margin-top:0.3rem;"><b>다음 계획</b> ${esc(n.plan)}</p>` : ''}
        ${n.homework ? `<p class="muted"><b>낸 숙제</b> ${esc(n.homework)}</p>` : ''}
      </div>
    </div>`;
}

VIEWS.notes = {
  title: '회기 기록', keys: ['notes', 'patients'],
  sub: () => DATA.notes ? `상담사가 상담소와 공유한 최근 ${DATA.notes.length}건` : '',
  html() {
    const g = gate(['notes'], 'notes'); if (g) return g;
    const all = DATA.notes;
    const counselors = [...new Set(all.map(n => n.counselor).filter(Boolean))].sort();
    const q = NT.q.trim();
    const list = all.filter(n => (!NT.risk || n.risk === NT.risk) && (!NT.counselor || n.counselor === NT.counselor) && (!NT.kind || n.kind === NT.kind)
      && (!q || (n.summary || '').includes(q) || (n.clientName || '').includes(q) || (n.plan || '').includes(q)));
    // 날짜별로 묶는다 — 긴 목록을 훑을 때 '언제'가 먼저 보여야 한다
    const groups = [];
    list.forEach(n => { const k = fmtDate(n.ts); const g2 = groups[groups.length - 1]; if (g2 && g2.k === k) g2.items.push(n); else groups.push({ k, items: [n] }); });
    return `
      <div class="filters">
        <input id="nq" type="search" placeholder="내용·내담자 이름으로 찾기" value="${esc(NT.q)}" style="min-width:200px;">
        <select id="nrisk"><option value="">위험도 전체</option><option value="urgent" ${NT.risk === 'urgent' ? 'selected' : ''}>긴급만</option><option value="watch" ${NT.risk === 'watch' ? 'selected' : ''}>주의만</option><option value="none" ${NT.risk === 'none' ? 'selected' : ''}>특이사항 없음</option></select>
        <select id="ncounselor"><option value="">상담사 전체</option>${counselors.map(c => `<option value="${esc(c)}" ${NT.counselor === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select id="nkind"><option value="">종류 전체</option>${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${NT.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <span class="muted">${list.length}건</span>
      </div>
      ${all.length ? (list.length ? groups.map(g2 => `<div class="sec-title">${g2.k}<span class="right">${g2.items.length}건</span></div><div class="tl">${g2.items.map(n => noteCardHtml(n, true)).join('')}</div>`).join('')
        : empty('조건에 맞는 기록이 없어요'))
        : empty('아직 공유된 회기 기록이 없어요', '상담사가 상담을 마치고 기록을 남기면 (담당 상담소 공유를 켠 경우) 여기에 쌓여요.')}
      <p class="muted">상담사가 '담당 상담소 공유'를 끈 기록은 여기 보이지 않아요. 단 '긴급'은 공유 여부와 관계없이 사실(누가·언제)만 긴급 알림에 남습니다.</p>`;
  }
};

VIEWS.urgent = {
  title: '긴급 알림', keys: ['urgent', 'patients'],
  sub: () => DATA.urgent ? `최근 90일 · 미확인 ${DATA.urgent.filter(n => !n.ackedAt).length}건` : '',
  html() {
    const g = gate(['urgent'], 'urgent'); if (g) return g;
    const all = DATA.urgent;
    const list = UR.onlyOpen ? all.filter(n => !n.ackedAt) : all;
    return `
      <div class="card warnbox">
        <b class="danger-t">상담사가 회기 기록에 '긴급'을 표시한 내담자예요</b>
        <p class="muted" style="margin-top:0.2rem;">표시된 순간 소장 이메일로도 메일이 갔어요. 기록을 읽고 필요한 조치를 한 뒤 <b>확인</b>을 눌러 남겨주세요 — 누가 언제 확인했는지가 상담소 기록으로 남습니다.${DATA.urgentMigrated === false ? ' <span class="danger-t">확인 표시 기능은 운영팀 마이그레이션 뒤에 켜져요.</span>' : ''}</p>
      </div>
      <div class="filters">
        <div class="seg"><button class="${UR.onlyOpen ? 'on' : ''}" data-act="ur-filter" data-v="1">미확인만</button><button class="${!UR.onlyOpen ? 'on' : ''}" data-act="ur-filter" data-v="0">전체</button></div>
        <span class="muted">${list.length}건</span>
      </div>
      ${list.length ? `<div class="tl">${list.map(n => `
        <div class="ti urgent">
          <div class="card urgent">
            <div class="row wrap" style="gap:0.4rem;">
              <button class="btn ghost xs" data-act="open-patient" data-id="${esc(n.clientId)}"><b>${esc(n.clientName || '내담자')}</b> ›</button>
              <span class="chip ok">${KIND_LABEL[n.kind] || '상담'}</span><span class="small">${esc(n.counselor || '상담사')}</span><span class="chip bad">긴급</span>
              <span class="muted right">${fmtDT(n.ts)}</span></div>
            ${n.shared ? `<p class="pre small" style="margin-top:0.4rem;">${esc(n.summary)}</p>${n.plan ? `<p class="muted"><b>다음 계획</b> ${esc(n.plan)}</p>` : ''}` : '<p class="muted" style="margin-top:0.4rem;">상담사가 이 기록을 상담소와 공유하지 않았어요 — 긴급 표시 사실만 알립니다. 필요하면 상담사에게 피드백으로 물어보세요.</p>'}
            <div class="row" style="gap:0.4rem; margin-top:0.5rem; justify-content:flex-end;">
              ${n.ackedAt ? `<span class="muted">${fmtDT(n.ackedAt)} 확인함</span><button class="btn ghost xs" data-act="ur-ack" data-id="${esc(n.id)}" data-undo="1">확인 취소</button>`
                : `<button class="btn danger sm" data-act="ur-ack" data-id="${esc(n.id)}">확인했어요</button>`}
            </div>
          </div>
        </div>`).join('')}</div>`
        : empty(UR.onlyOpen ? '확인하지 않은 긴급 표시가 없어요' : '최근 90일 긴급 표시가 없어요')}`;
  }
};

async function ackUrgent(el) {
  const undo = el.dataset.undo === '1';
  el.disabled = true;
  const r = await hpost('urgent/ack', { noteId: el.dataset.id, undo });
  el.disabled = false;
  if (!r || !r.ok) { toast(r && r.error === 'migrate' ? '확인 표시 기능은 운영팀 마이그레이션 뒤에 켜져요' : '처리하지 못했어요'); return; }
  const n = (DATA.urgent || []).find(x => x.id === el.dataset.id); if (n) n.ackedAt = r.ackedAt || 0;
  render(true); loadKey('dash', true);
  toast(undo ? '확인을 취소했어요' : '확인으로 표시했어요');
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'ur-ack') ackUrgent(el);
  else if (el.dataset.act === 'ur-filter') { UR.onlyOpen = el.dataset.v === '1'; render(true); }
});
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'nq') { NT.q = e.target.value || ''; const pos = e.target.selectionStart; render(true); const a = $('nq'); if (a) { a.focus(); a.setSelectionRange(pos, pos); } }
});
document.addEventListener('change', e => {
  const id = e.target && e.target.id;
  if (id === 'nrisk') { NT.risk = e.target.value; render(true); }
  else if (id === 'ncounselor') { NT.counselor = e.target.value; render(true); }
  else if (id === 'nkind') { NT.kind = e.target.value; render(true); }
});
