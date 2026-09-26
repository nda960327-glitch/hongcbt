// ── 대시보드 — 오늘 봐야 할 것을 한 화면에 ──────────────────────────────
LOADERS.dash = () => hget('dashboard').then(d => (d && d.ok) ? (DATA.dash = d) : null);
LOADERS.patients = () => hget('patients').then(d => (d && Array.isArray(d.items)) ? (DATA.patients = d.items) : null);
LOADERS.notes = () => hget('notes?limit=300').then(d => (d && d.ok) ? (DATA.notes = d.items) : null);
LOADERS.info = () => hget('info').then(d => (d && d.ok) ? (DATA.info = d.info) : null);

const tile = (lb, v, u, sb, cls, tab) => `<div class="stat ${cls || ''} ${tab ? 'link' : ''}" ${tab ? `data-act="goto" data-tab="${tab}" role="button" tabindex="0"` : ''}><div class="lb">${lb}</div><b>${v}${u ? `<span class="u">${u}</span>` : ''}</b>${sb ? `<div class="sb">${sb}</div>` : ''}</div>`;

// 상담소 코드 카드 — 내담자에게 알려주는 코드. 비상 로그인에도 쓰이니 밖으로 새지 않게.
function codeCardHtml() {
  const info = DATA.info;
  const code = (info && info.code) || (HC || '');
  return `
    <div class="card">
      <div class="row wrap" style="gap:0.6rem;">
        <div class="grow" style="min-width:200px;">
          <b style="font-size:0.9rem;">상담소 코드</b>
          <p class="muted" style="margin-top:0.15rem;">내담자가 앱 → 마이 → <b>담당 상담소 연결하기</b>에 이 코드와 이름을 넣으면 여기 내담자 목록에 나타나요. 소장 앱 비상 로그인에도 쓰이니 공개 게시물에는 올리지 마세요. 재발급은 운영팀에 요청하세요.</p>
        </div>
        ${code ? `<div class="row" style="gap:0.4rem;"><span class="mono" style="font-size:1.05rem; letter-spacing:0.08em; padding:0.4rem 0.7rem; background:var(--bg); border:1px solid var(--line); border-radius:10px;">${esc(code)}</span><button class="btn soft sm" data-act="copy" data-v="${esc(code)}">복사</button></div>`
          : info ? '<span class="muted">코드 없음 — 운영팀에 문의</span>' : '<span class="muted">불러오는 중…</span>'}
      </div>
    </div>`;
}

VIEWS.dash = {
  title: '대시보드', keys: ['dash', 'patients', 'notes', 'info'],
  sub: () => { const h = DATA.hospital || {}; return [h.name, new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })].filter(Boolean).join(' · '); },
  html() {
    const g = gate(['dash'], 'dash'); if (g) return g;
    const d = DATA.dash, ps = DATA.patients, notes = DATA.notes;
    const cs = d.counselors || {};
    const urgent = (ps || []).filter(p => p.lastRisk === 'urgent');
    const watch = (ps || []).filter(p => p.lastRisk === 'watch');
    const alerts = [];
    if (d.bankSet === false) alerts.push(`<div class="card warnbox"><div class="row wrap"><div class="grow"><b class="danger-t">정산 계좌가 없어요</b><p class="muted">앱이 상담소 몫(90%)을 보낼 계좌예요. 없으면 상담료가 상담소로 입금되지 못합니다.</p></div><button class="btn sm" data-act="goto" data-tab="settings">계좌 등록</button></div></div>`);
    if (!d.hasEmail) alerts.push(`<div class="card warnbox"><div class="row wrap"><div class="grow"><b class="danger-t">소장 이메일이 등록돼 있지 않아요</b><p class="muted">상담사가 '긴급'을 표시해도 메일이 가지 않습니다. 운영팀(help@neurumind.com)에 이메일 등록을 요청하세요.</p></div></div></div>`);
    if (d.appsPending) alerts.push(`<div class="card goldbox"><div class="row wrap"><div class="grow"><b class="gold-t">입점 승인 대기 ${d.appsPending}건</b><p class="muted">우리 상담소 소속으로 상담사 등록을 신청한 분이 있어요. 승인하면 로그인 코드가 그분 이메일로 갑니다.</p></div><button class="btn sm" data-act="goto" data-tab="counselors">심사하기</button></div></div>`);
    if (cs.pending) alerts.push(`<div class="card goldbox"><div class="row wrap"><div class="grow"><b class="gold-t">소속 승인 대기 상담사 ${cs.pending}명</b><p class="muted">상담사 앱에서 우리 상담소를 소속으로 골랐어요. 승인해야 그분의 상담료가 상담소로 정산됩니다. 승인 전에는 앱이 상담사에게 직접 지급해요.</p></div><button class="btn sm" data-act="goto" data-tab="counselors">확인하기</button></div></div>`);
    if (d.urgentUnacked) alerts.push(`<div class="card warnbox"><div class="row wrap"><div class="grow"><b class="danger-t">아직 확인하지 않은 긴급 표시 ${d.urgentUnacked}건</b><p class="muted">상담사가 회기 기록에 '긴급'을 표시했어요. 기록을 읽고 '확인'을 눌러 남겨주세요.</p></div><button class="btn danger sm" data-act="goto" data-tab="urgent">긴급 알림 보기</button></div></div>`);
    return `
      <div class="stats">
        ${tile('연결 내담자', d.patients, '명', ps ? `긴급 ${urgent.length} · 주의 ${watch.length}` : '', urgent.length ? 'bad' : '', 'patients')}
        ${tile('이번 주 긴급 표시', d.urgentWeek, '명', d.urgentUnacked ? `미확인 ${d.urgentUnacked}건` : '모두 확인함', d.urgentWeek ? 'bad' : '', 'urgent')}
        ${tile('소속 상담사', cs.ok || 0, '명', cs.pending ? `승인 대기 ${cs.pending}명` : (d.appsPending ? `입점 신청 ${d.appsPending}건` : '대기 없음'), (cs.pending || d.appsPending) ? 'gold' : '', 'counselors')}
        ${tile('이번 달 완료 상담', (d.month || {}).done || 0, '건', '상담소 채널 · 예약+통화', 'hi', 'settle')}
        ${tile('이번 달 상담료', won((d.month || {}).gross), '원', `상담소 몫 ${won((d.month || {}).hospital)}원`, 'hi', 'settle')}
        ${tile('앱에서 받은 정산', won(d.received), '원', `상담사 지급 기록 ${won(d.paidOut)}원`, '', 'settle')}
        ${tile('최근 7일 회기 기록', d.notes7d, '건', '상담사가 공유한 기록', '', 'notes')}
        ${tile('새 댓글 (7일)', d.newComments, '개', '내 글에 달린 이용자 댓글', d.newComments ? 'gold' : '', 'community')}
      </div>
      ${alerts.join('')}
      <div class="grid2">
        <div>
          <div class="sec-title">긴급 표시 내담자 <span class="right">${urgent.length}명</span></div>
          <div class="card ${urgent.length ? 'warnbox' : ''}">
            ${ps == null ? loadingHtml() : urgent.length ? urgent.map(p => `
              <div class="listrow clickable" data-act="open-patient" data-id="${esc(p.clientId)}">
                ${avatar(p.name)}
                <div class="grow"><b>${esc(p.name)}</b> <span class="muted">${esc(p.birth || '')}</span>
                  <div class="muted">최근 기록 ${fmtDT(p.lastNote)} · 상담 기록 ${p.notes}건${p.week && p.week.moodAvg != null ? ` · 이번 주 기분 ${p.week.moodAvg.toFixed(1)}` : ''}</div></div>
                <span class="chip bad">긴급</span>
              </div>`).join('') : '<p class="muted">지금 긴급 표시된 내담자가 없어요.</p>'}
          </div>
          <div class="sec-title">빠른 이동</div>
          <div class="row wrap" style="gap:0.4rem;">
            <button class="btn ghost sm" data-act="goto" data-tab="patients">내담자 목록</button>
            <button class="btn ghost sm" data-act="goto" data-tab="calendar">이번 주 예약</button>
            <button class="btn ghost sm" data-act="goto" data-tab="settle">정산 확인</button>
            <button class="btn ghost sm" data-act="post-new">새 글 쓰기</button>
            <button class="btn ghost sm" data-act="goto" data-tab="page">상담소 페이지 고치기</button>
          </div>
        </div>
        <div>
          <div class="sec-title">최근 회기 기록 <span class="right"><button class="btn xs ghost" data-act="goto" data-tab="notes">전체 보기</button></span></div>
          <div class="card">
            ${notes == null ? (ST.notes === 'err' ? '<p class="muted">불러오지 못했어요.</p>' : loadingHtml()) : notes.length ? notes.slice(0, 5).map(n => `
              <div class="listrow clickable" data-act="open-patient" data-id="${esc(n.clientId)}">
                <div class="grow">
                  <div class="row wrap" style="gap:0.35rem;"><b>${esc(n.clientName || '내담자')}</b><span class="chip ok">${KIND_LABEL[n.kind] || '상담'}</span>${n.risk !== 'none' ? RISK_CHIP[n.risk] : ''}<span class="muted right">${fmtAgo(n.ts)}</span></div>
                  <div class="muted ell">${esc(n.counselor || '상담사')} · ${esc(n.summary)}</div>
                </div>
              </div>`).join('') : '<p class="muted">아직 공유된 회기 기록이 없어요. 상담사가 상담을 마치고 기록을 남기면 여기에 쌓입니다.</p>'}
          </div>
        </div>
      </div>
      ${codeCardHtml()}
      <p class="muted" style="margin-top:0.3rem;">앱 안의 대화 내용은 상담소에 오지 않습니다. 이 콘솔에 보이는 건 상담사가 남긴 요약·숙제, 내담자가 동의한 주간 숫자, 소장님의 피드백, 그리고 정산 숫자뿐이에요.</p>`;
  }
};
