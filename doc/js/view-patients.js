// ── 내담자 — 목록(표) · 상세 패널(타임라인·주간 상태·메모·피드백) ─────────
const PT = { id: null, detail: null, memos: null, memoErr: false, q: '', sort: 'risk' };
const PATIENT_SORT = { risk: '위험도순', recent: '최근 기록순', name: '이름순', linked: '연결일순' };
const RISK_ORDER = { urgent: 0, watch: 1, none: 2 };

function patientRows() {
  const q = PT.q.trim();
  const list = (DATA.patients || []).filter(p => !q || (p.name || '').includes(q) || (p.birth || '').includes(q));
  const s = PT.sort;
  list.sort((a, b) => s === 'name' ? String(a.name).localeCompare(String(b.name), 'ko')
    : s === 'recent' ? (b.lastNote || 0) - (a.lastNote || 0)
    : s === 'linked' ? (b.linkedAt || 0) - (a.linkedAt || 0)
    : (RISK_ORDER[a.lastRisk] - RISK_ORDER[b.lastRisk]) || ((b.lastNote || 0) - (a.lastNote || 0)));
  return list;
}
function patientsCsv() {
  const rows = [['이름', '생년', '연결일', '최근 기록', '위험도', '상담 기록 수', '진행 중 숙제', '이번 주 기분', '주간 공유']];
  patientRows().forEach(p => rows.push([p.name, p.birth, fmtDate(p.linkedAt), p.lastNote ? fmtDate(p.lastNote) : '', RISK_LABEL[p.lastRisk] || '', p.notes, p.hwOpen, p.week && p.week.moodAvg != null ? p.week.moodAvg.toFixed(1) : '', p.shareWeekly ? '예' : '아니오']));
  downloadCsv('내담자_' + fmtDate(Date.now()) + '.csv', rows);
}

VIEWS.patients = {
  title: '내담자', keys: ['patients'],
  sub: () => DATA.patients ? `연결된 내담자 ${DATA.patients.length}명` : '',
  html() {
    const g = gate(['patients'], 'patients'); if (g) return g;
    const all = DATA.patients, list = patientRows();
    const moodTxt = w => w && w.moodAvg != null ? `<b class="${w.moodAvg < 2.5 ? 'danger-t' : w.moodAvg < 3.5 ? 'gold-t' : ''}">${w.moodAvg.toFixed(1)}</b><span class="muted">/5${w.checkins ? ` · ${w.checkins}회` : ''}</span>` : '<span class="muted">—</span>';
    return `
      <div class="filters">
        <input id="pq" type="search" placeholder="이름·생년으로 찾기" value="${esc(PT.q)}" style="min-width:200px;">
        <select id="psort">${Object.entries(PATIENT_SORT).map(([k, v]) => `<option value="${k}" ${PT.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <span class="muted">${list.length}명${PT.q ? ' 검색됨' : ''}</span>
        <button class="btn ghost sm right" data-act="patients-csv">CSV 내보내기</button>
      </div>
      ${all.length ? `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>이름</th><th>생년</th><th class="t">연결일</th><th class="t">최근 기록</th><th>위험도</th><th class="r">기록</th><th class="r">진행 숙제</th><th>이번 주 기분</th><th>주간 공유</th></tr></thead>
        <tbody>${list.map(p => `
          <tr class="clickable ${p.lastRisk === 'urgent' ? 'hot' : ''}" data-act="open-patient" data-id="${esc(p.clientId)}" tabindex="0">
            <td><div class="row">${avatar(p.name, 'sm')}<b>${esc(p.name)}</b></div></td>
            <td class="sub">${esc(p.birth || '—')}</td>
            <td class="t sub">${fmtDate(p.linkedAt)}</td>
            <td class="t">${p.lastNote ? fmtDT(p.lastNote) : '<span class="muted">아직 없음</span>'}</td>
            <td>${RISK_CHIP[p.lastRisk] || RISK_CHIP.none}</td>
            <td class="r num">${p.notes || 0}</td>
            <td class="r num">${p.hwOpen ? `<span class="chip gold">${p.hwOpen}</span>` : '<span class="muted">0</span>'}</td>
            <td>${moodTxt(p.week)}</td>
            <td>${p.shareWeekly ? '<span class="chip ok">공유</span>' : '<span class="chip off">안 함</span>'}</td>
          </tr>`).join('') || `<tr><td colspan="9"><div class="empty"><b>검색 결과가 없어요</b></div></td></tr>`}</tbody></table></div>`
        : empty('아직 연결된 내담자가 없어요', '내담자에게 상담소 코드를 알려주세요.<br>내담자 앱 → 마이 → 담당 상담소 연결하기 (대시보드에서 코드 복사)')}
      <p class="muted">위험도는 상담사가 가장 최근 회기 기록에 표시한 값이에요. 줄을 누르면 타임라인·주간 상태·메모·피드백이 열립니다.</p>`;
  }
};

// ── 상세 패널 ──
async function openPatient(id) {
  PT.id = id; PT.detail = null; PT.memos = null; PT.memoErr = false;
  closeModal(null);
  renderPatient();
  const [d, m] = await Promise.all([hget('patient?clientId=' + encodeURIComponent(id)), hget('memo?clientId=' + encodeURIComponent(id))]);
  if (PT.id !== id) return;
  if (d && d.patient) PT.detail = d; else PT.detail = { error: true };
  if (m && m.ok) PT.memos = m.items; else { PT.memos = []; PT.memoErr = true; }
  renderPatient();
}
function renderPatient() {
  const p = (DATA.patients || []).find(x => x.clientId === PT.id) || {};
  const acts = `<button class="btn sm" data-act="fb">피드백 쓰기</button>`;
  openPanel(p.name || '내담자', patientHtml(p), acts, 'patient');
}

// 주간 상태 막대 — 기분 평균(1~5). 숫자 몇 개로 '이번 주가 지난주보다 나은가'가 보이면 된다.
function weeklyHtml(weeks, share) {
  if (!share) return `<div class="card"><b style="font-size:0.9rem;">주간 상태</b><p class="muted" style="margin-top:0.3rem;">내담자가 주간 상태 공유를 꺼 두었어요. 앱 → 마이 → 담당 상담소에서 켤 수 있습니다.</p></div>`;
  if (!weeks || !weeks.length) return `<div class="card"><b style="font-size:0.9rem;">주간 상태</b><p class="muted" style="margin-top:0.3rem;">아직 올라온 주간 요약이 없어요. 내담자가 앱을 쓰면 주마다 자동으로 올라옵니다 (기분 체크인 평균·횟수 같은 숫자만).</p></div>`;
  const last = weeks[weeks.length - 1], prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const diff = last.moodAvg != null && prev && prev.moodAvg != null ? last.moodAvg - prev.moodAvg : null;
  const bars = weeks.slice(-8).map(w => {
    const v = w.moodAvg, h = v == null ? 0 : Math.max(8, Math.round(((v - 1) / 4) * 56) + 8);
    const cls = v == null ? 'none' : v < 2.5 ? 'lo' : v < 3.5 ? 'mid' : '';
    const d = new Date(w.weekKey + 'T00:00:00');
    return `<div class="b"><em>${v == null ? '–' : v.toFixed(1)}</em><i class="${cls}" style="height:${h}px;"></i><span>${d.getMonth() + 1}/${d.getDate()}~</span></div>`;
  }).join('');
  return `
    <div class="card">
      <div class="row"><b class="grow" style="font-size:0.9rem;">주간 상태 <span class="pill">내담자 동의</span></b>
        <span class="muted">${diff == null ? '' : diff > 0.2 ? `<b class="accent-t">지난주보다 +${diff.toFixed(1)}</b>` : diff < -0.2 ? `<b class="danger-t">지난주보다 ${diff.toFixed(1)}</b>` : '지난주와 비슷'}</span></div>
      <div class="wk">${bars}</div>
      <div class="kv4" style="margin-top:0.6rem;">
        <div><span class="muted">기분 평균</span><strong>${last.moodAvg == null ? '–' : last.moodAvg.toFixed(1) + '/5'}</strong></div>
        <div><span class="muted">체크인</span><strong>${last.checkins}회</strong></div>
        <div><span class="muted">미션·밤일기</span><strong>${last.missions}·${last.nights}</strong></div>
        <div><span class="muted">연속 사용</span><strong>${last.streak}일</strong></div>
      </div>
      <p class="muted" style="margin-top:0.5rem;">막대는 주별 기분 체크인 평균(1 매우 나쁨 ~ 5 매우 좋음). 3.5 미만은 노랑, 2.5 미만은 빨강. 내담자가 앱에서 고른 값이라 참고용입니다.</p>
    </div>`;
}

function patientHtml(p) {
  const d = PT.detail;
  const head = `
    <div class="row" style="gap:0.7rem; margin-bottom:0.8rem;">
      ${avatar(p.name, 'lg')}
      <div class="grow">
        <div class="row wrap" style="gap:0.4rem;"><b style="font-size:1.05rem;">${esc(p.name || '내담자')}</b>${p.lastRisk && p.lastRisk !== 'none' ? RISK_CHIP[p.lastRisk] : ''}</div>
        <div class="muted">${[p.birth, p.linkedAt ? fmtDate(p.linkedAt) + ' 연결' : '', p.shareWeekly ? '주간 공유' : '주간 공유 안 함'].filter(Boolean).join(' · ')}</div>
      </div>
      <button class="btn ghost xs" data-act="unlink-patient" data-id="${esc(p.clientId || PT.id)}" title="상담소와의 연결을 끊습니다">연결 해제</button>
    </div>`;
  if (!d) return head + loadingHtml();
  if (d.error) return head + `<div class="failed"><b>불러오지 못했어요</b><button class="btn ghost sm" data-act="open-patient" data-id="${esc(PT.id)}">다시 시도</button></div>`;
  const hwDone = d.homework.filter(h => h.doneAt).length;
  const lastRisk = d.notes.length ? d.notes[0].risk : 'none';
  const counselors = [...new Set(d.notes.map(n => n.counselor).filter(Boolean))];
  const memos = PT.memos || [];
  const stats = `
    ${lastRisk === 'urgent' ? `<div class="urgentbar"><b>긴급 — 소장 확인 필요</b><div class="muted" style="margin-top:0.2rem;">${esc(d.notes[0].counselor || '상담사')} · ${fmtDT(d.notes[0].ts)} 회기 기록에 표시됨. 소장 이메일로도 알림이 갔습니다. <button class="btn xs ghost" data-act="goto" data-tab="urgent">긴급 알림에서 확인 표시</button></div></div>` : ''}
    <div class="card">
      <div class="kv4">
        <div><span class="muted">상담 기록</span><strong>${d.notes.length}건</strong></div>
        <div><span class="muted">숙제</span><strong>${hwDone}/${d.homework.length}</strong></div>
        <div><span class="muted">최근 위험도</span><strong class="${lastRisk === 'urgent' ? 'danger-t' : lastRisk === 'watch' ? 'gold-t' : ''}">${lastRisk === 'none' ? '없음' : lastRisk === 'watch' ? '주의' : '긴급'}</strong></div>
        <div><span class="muted">상담사</span><strong style="font-size:0.82rem;">${esc(counselors.join(', ') || '—')}</strong></div>
      </div>
    </div>
    ${weeklyHtml(d.weekly, d.patient.shareWeekly)}
    <div class="card memo">
      <div class="row"><b class="grow" style="font-size:0.9rem;">상담소 메모 <span class="pill">우리만 봄</span></b><button class="btn soft xs" data-act="memo-new">메모 추가</button></div>
      <p class="muted" style="margin:0.2rem 0 0.4rem;">상담사·내담자에게 가지 않는 상담소 내부 메모예요.${PT.memoErr ? ' <span class="danger-t">메모 표가 아직 준비되지 않았어요 (운영팀 마이그레이션 필요).</span>' : ''}</p>
      ${memos.length ? memos.map(m => `
        <div class="listrow"><div class="grow"><p class="pre small">${esc(m.text)}</p><div class="muted">${fmtDT(m.ts)}${m.updated && m.updated !== m.ts ? ' · 수정 ' + fmtDT(m.updated) : ''}</div></div>
          <button class="btn ghost xs" data-act="memo-edit" data-id="${esc(m.id)}">고치기</button><button class="btn ghost xs danger-t" data-act="memo-del" data-id="${esc(m.id)}">지우기</button></div>`).join('') : '<p class="muted">아직 메모가 없어요.</p>'}
    </div>`;
  const items = [];
  d.notes.forEach(n => items.push({ ts: n.ts, cls: n.risk === 'urgent' ? 'urgent' : n.risk === 'watch' ? 'watch' : '', html: `
    <div class="card ${n.risk === 'urgent' ? 'urgent' : n.risk === 'watch' ? 'watch' : ''}">
      <div class="row wrap" style="gap:0.4rem;"><span class="chip ok">${KIND_LABEL[n.kind] || '상담'}</span><b class="small">${esc(n.counselor || '상담사')}</b>${n.risk !== 'none' ? RISK_CHIP[n.risk] : ''}<span class="muted right">${fmtDT(n.ts)}</span></div>
      <p class="pre small" style="margin-top:0.4rem;">${esc(n.summary)}</p>
      ${n.plan ? `<p class="muted" style="margin-top:0.35rem;"><b>다음 계획</b> ${esc(n.plan)}</p>` : ''}
      ${n.homework ? `<p class="muted"><b>낸 숙제</b> ${esc(n.homework)}</p>` : ''}
      <button class="btn ghost xs" style="margin-top:0.5rem;" data-act="fb" data-note="${esc(n.id)}">이 기록에 피드백</button>
    </div>` }));
  d.homework.forEach(h => items.push({ ts: h.assignedAt, cls: 'hw', html: `
    <div class="card"><div class="row wrap" style="gap:0.4rem;"><span class="chip ${h.doneAt ? 'ok' : 'gold'}">숙제${h.doneAt ? ' 완료' : ' 진행 중'}</span><b class="small">${esc(h.counselor || '상담사')}</b><span class="muted right">${fmtDT(h.assignedAt)}</span></div>
      <p class="small" style="margin-top:0.4rem;">${esc(h.text)}</p>${h.doneAt ? `<p class="muted" style="margin-top:0.3rem;">${fmtDT(h.doneAt)} 완료${h.note ? ` · 내담자 메모: ${esc(h.note)}` : ''}</p>` : ''}</div>` }));
  d.feedback.forEach(f => items.push({ ts: f.ts, cls: 'fb', html: `
    <div class="card fb"><div class="row wrap" style="gap:0.4rem;"><span class="chip new">내 피드백</span><span class="muted">${f.to === 'counselor' ? '상담사에게' : f.to === 'patient' ? '내담자에게' : '상담사·내담자에게'}${f.readC || f.readP ? ' · 읽음' : ''}</span><span class="muted right">${fmtDT(f.ts)}</span></div>
      <p class="pre small" style="margin-top:0.4rem;">${esc(f.text)}</p></div>` }));
  d.bookings.forEach(b => items.push({ ts: b.whenTs, cls: 'bk', html: `<div class="card flat" style="padding:0.55rem 0.9rem;"><span class="muted">${fmtDT(b.whenTs)} · ${esc(b.counselor || '상담사')} 예약 상담 · ${BK_STATUS[b.status] || esc(b.status)}</span></div>` }));
  items.sort((a, b) => b.ts - a.ts);
  return head + stats + `<div class="sec-title">타임라인 <span class="right">${items.length}건</span></div>`
    + (items.length ? `<div class="tl">${items.map(i => `<div class="ti ${i.cls}">${i.html}</div>`).join('')}</div>` : '<p class="muted">아직 기록이 없어요.</p>');
}

// ── 피드백 (상담사 / 내담자 / 둘 다) ──
function openFeedback(noteId) {
  const p = (DATA.patients || []).find(x => x.clientId === PT.id) || {};
  const n = noteId && PT.detail && PT.detail.notes ? PT.detail.notes.find(x => x.id === noteId) : null;
  modal({ title: `${p.name || '내담자'} 님에게 피드백`, acts: false, wide: true, html: `
    ${n ? `<p class="muted" style="margin:0.4rem 0 0.6rem; padding:0.5rem 0.7rem; background:var(--bg); border-radius:10px;">${fmtDT(n.ts)} ${esc(n.counselor)} 기록에 대한 피드백<br>"${esc(String(n.summary).slice(0, 80))}${n.summary.length > 80 ? '…' : ''}"</p>` : ''}
    <label class="f"><span>받는 사람</span><select id="fb-to"><option value="both">상담사와 내담자 모두</option><option value="counselor">상담사에게만</option><option value="patient">내담자에게만</option></select></label>
    <label class="f"><span>내용</span><textarea id="fb-text" rows="6" maxlength="2000" placeholder="예: 수면 문제가 계속되면 다음 상담 때 상황을 다시 살펴봐 주세요. 상담에서는 취침 시간 고정을 우선 다뤄주세요."></textarea></label>
    <p class="muted">내담자에게 보내는 내용은 내담자 앱의 알림함과 '상담소와 나누는 기록'에 그대로 뜹니다. 상담사에게는 상담사 앱 홈에 뜹니다.</p>
    <div class="acts"><button class="btn ghost" data-act="modal-cancel">취소</button><button class="btn" data-act="fb-send" data-note="${esc(noteId || '')}">보내기</button></div>` });
  setTimeout(() => { const t = $('fb-text'); if (t) t.focus(); }, 80);
}
async function sendFeedback(btn) {
  const text = (($('fb-text') || {}).value || '').trim();
  if (!text) { toast('내용을 적어주세요.'); return; }
  btn.disabled = true;
  const r = await hpost('feedback', { clientId: PT.id, noteId: btn.dataset.note || '', to: ($('fb-to') || {}).value || 'both', text });
  btn.disabled = false;
  if (!r || !r.ok) { toast('보내지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
  closeModal(null); toast('피드백을 보냈어요');
  openPatient(PT.id);
}
// ── 메모 ──
async function editMemo(id) {
  const cur = id ? (PT.memos || []).find(m => m.id === id) : null;
  const v = await modal({ title: cur ? '메모 고치기' : '메모 추가', acts: false, html: `
    <textarea id="memo-text" rows="5" maxlength="2000" style="margin-top:0.5rem;" placeholder="예: 10월부터 격주 상담으로 조정 · 보호자 연락처 확인함">${esc(cur ? cur.text : '')}</textarea>
    <div class="acts"><button class="btn ghost" data-act="modal-cancel">취소</button><button class="btn" data-act="memo-save" data-id="${esc(id || '')}">저장</button></div>` });
  return v;
}
async function saveMemo(btn) {
  const text = (($('memo-text') || {}).value || '').trim();
  if (!text) { toast('내용을 적어주세요'); return; }
  btn.disabled = true;
  const r = await hpost('memo/save', { id: btn.dataset.id || '', clientId: PT.id, text });
  btn.disabled = false;
  if (!r || !r.ok) { toast(r && r.error === 'migrate' ? '메모 표가 아직 준비되지 않았어요 (운영팀 마이그레이션 필요)' : '저장하지 못했어요'); return; }
  closeModal(null);
  const m = await hget('memo?clientId=' + encodeURIComponent(PT.id));
  PT.memos = m && m.ok ? m.items : PT.memos; renderPatient(); toast('메모를 저장했어요');
}
async function deleteMemo(id) {
  if (!(await confirmBox({ title: '이 메모를 지울까요?', okLabel: '지우기', danger: true }))) return;
  const r = await hpost('memo/delete', { id });
  if (!r || !r.ok) { toast('지우지 못했어요'); return; }
  PT.memos = (PT.memos || []).filter(m => m.id !== id); renderPatient();
}
async function unlinkPatient(id) {
  const p = (DATA.patients || []).find(x => x.clientId === id) || {};
  if (!(await confirmBox({ title: `${p.name || '내담자'} 님과의 연결을 끊을까요?`, body: '내담자 목록에서 사라지고, 올라와 있던 주간 상태 숫자는 지워져요. 회기 기록·피드백은 서버에 남지만 여기서는 보이지 않습니다. 내담자가 코드를 다시 넣으면 다시 연결됩니다.', okLabel: '연결 해제', danger: true }))) return;
  const r = await hpost('patient/unlink', { clientId: id });
  if (!r || !r.ok) { toast('처리하지 못했어요'); return; }
  closePanel(); toast('연결을 해제했어요');
  loadKey('patients', true); loadKey('dash', true);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'open-patient') { $('gsearch-res').hidden = true; openPatient(el.dataset.id); }
  else if (act === 'patients-csv') patientsCsv();
  else if (act === 'fb') openFeedback(el.dataset.note || '');
  else if (act === 'fb-send') sendFeedback(el);
  else if (act === 'memo-new') editMemo('');
  else if (act === 'memo-edit') editMemo(el.dataset.id);
  else if (act === 'memo-save') saveMemo(el);
  else if (act === 'memo-del') deleteMemo(el.dataset.id);
  else if (act === 'unlink-patient') unlinkPatient(el.dataset.id);
});
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'pq') { PT.q = e.target.value || ''; const pos = e.target.selectionStart; render(true); const a = $('pq'); if (a) { a.focus(); a.setSelectionRange(pos, pos); } }
});
document.addEventListener('change', e => { if (e.target && e.target.id === 'psort') { PT.sort = e.target.value; render(true); } });
