// ── 예약 캘린더(주간) · 통계(6개월) · 설정 ─────────────────────────────────
const CAL = { week: 0, hourFrom: 8, hourTo: 22, rowH: 48 };
const startOfWeek = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.getTime(); };
CAL.week = startOfWeek(Date.now());
LOADERS.bookings = () => { const from = CAL.week, to = from + 7 * 86400000; return hget(`bookings?from=${from}&to=${to}`).then(d => (d && d.ok) ? (DATA.bookings = { from, to, items: d.items }) : null); };
LOADERS.stats = () => hget('stats').then(d => (d && d.ok) ? (DATA.stats = d.months) : null);

VIEWS.calendar = {
  title: '예약 캘린더', keys: ['bookings', 'patients'],
  sub: () => { const a = new Date(CAL.week), b = new Date(CAL.week + 6 * 86400000); return `${a.getMonth() + 1}/${a.getDate()} ~ ${b.getMonth() + 1}/${b.getDate()} · 소속 상담사의 예약 + 상담소 채널 예약`; },
  html() {
    const bk = DATA.bookings;
    const nav = `<div class="filters"><button class="btn ghost sm" data-act="cal-move" data-v="-1">‹ 지난주</button><button class="btn ghost sm" data-act="cal-move" data-v="0">이번 주</button><button class="btn ghost sm" data-act="cal-move" data-v="1">다음주 ›</button>
      <span class="muted">${bk && bk.from === CAL.week ? `예약 ${bk.items.length}건` : ''}</span><span class="muted right">실선 = 상담소 채널 · 점선 = 앱 채널(승인 전 상담사)</span></div>`;
    if (!bk || bk.from !== CAL.week) return nav + (ST.bookings === 'err' ? failedHtml('calendar') : loadingHtml());
    const days = [...Array(7)].map((_, i) => CAL.week + i * 86400000);
    const today = startOfWeek(Date.now()) === CAL.week ? new Date().getDay() : -1;
    const hours = []; for (let h = CAL.hourFrom; h <= CAL.hourTo; h++) hours.push(h);
    const gridH = (CAL.hourTo - CAL.hourFrom) * CAL.rowH;
    const byDay = days.map(d0 => bk.items.filter(b => b.whenTs >= d0 && b.whenTs < d0 + 86400000));
    const block = b => {
      const d = new Date(b.whenTs); const mins = (d.getHours() - CAL.hourFrom) * 60 + d.getMinutes();
      const top = Math.max(0, Math.min(gridH - 30, mins / 60 * CAL.rowH));
      return `<div class="bk ${b.status} ${b.channel === 'app' ? 'app' : ''}" style="top:${top}px; height:${CAL.rowH * 0.95}px;" data-act="cal-open" data-id="${esc(b.id)}" title="${esc(fmtTime(b.whenTs) + ' ' + b.clientName + ' · ' + b.counselor)}"><b>${fmtTime(b.whenTs)} ${esc(b.clientName || '내담자')}</b>${esc(b.counselor)}</div>`;
    };
    return nav + `
      <div class="calwrap"><div class="calgrid">
        <div class="dh"></div>${days.map((d0, i) => { const d = new Date(d0); return `<div class="dh ${i === 6 ? 'sun' : ''} ${d.getDay() === today ? 'today' : ''}">${['월', '화', '수', '목', '금', '토', '일'][i]}<b>${d.getDate()}</b></div>`; }).join('')}
        <div class="hcol" style="height:${gridH}px;">${hours.map(h => `<span style="top:${(h - CAL.hourFrom) * CAL.rowH}px;">${h}시</span>`).join('')}</div>
        ${days.map((d0, i) => `<div class="dcol ${new Date(d0).getDay() === today ? 'today' : ''}" style="height:${gridH}px;">${byDay[i].map(block).join('')}</div>`).join('')}
      </div></div>
      <div class="sec-title">목록 <span class="right">${bk.items.length}건</span></div>
      ${bk.items.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th class="t">일시</th><th>내담자</th><th>상담사</th><th>상태</th><th>채널</th><th class="r">상담료</th></tr></thead><tbody>
        ${bk.items.map(b => `<tr class="clickable" data-act="cal-open" data-id="${esc(b.id)}"><td class="t">${fmtDT(b.whenTs)}</td><td><b>${esc(b.clientName || '내담자')}</b>${b.linked ? ' <span class="chip ok">연결</span>' : ''}</td><td>${esc(b.counselor)}</td><td>${BK_STATUS[b.status] || esc(b.status)}</td><td class="sub">${b.channel === 'hospital' ? '상담소' : '앱'}</td><td class="r num">${won(b.price)}원</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="card flat"><p class="muted">이 주에는 예약이 없어요. 상담사 앱에서 잡힌 예약이 여기에 보여요 (오전 8시~밤 10시 범위 밖은 목록에만).</p></div>'}`;
  }
};
function openBooking(id) {
  const b = ((DATA.bookings || {}).items || []).find(x => x.id === id); if (!b) return;
  modal({ title: `${fmtDT(b.whenTs)} · ${b.clientName || '내담자'}`, cancel: false, okLabel: '닫기', html: `
    <div class="kv4" style="grid-template-columns:1fr 1fr; margin-top:0.5rem;">
      <div><span class="muted">상담사</span><strong>${esc(b.counselor)}</strong></div><div><span class="muted">상태</span><strong>${BK_STATUS[b.status] || esc(b.status)}</strong></div>
      <div><span class="muted">상담료</span><strong>${won(b.price)}원</strong></div><div><span class="muted">정산 채널</span><strong>${b.channel === 'hospital' ? '상담소 (90%)' : '앱 (상담사 직접)'}</strong></div>
    </div>
    ${b.doneAt ? `<p class="muted" style="margin-top:0.5rem;">${fmtDT(b.doneAt)} 완료 처리됨</p>` : ''}
    ${b.linked ? `<p style="margin-top:0.6rem;"><button class="btn soft sm" data-act="open-patient" data-id="${esc(b.clientId)}">내담자 열기 ›</button></p>` : '<p class="muted" style="margin-top:0.5rem;">상담소와 연결되지 않은 내담자예요 — 소속 상담사의 개인 예약입니다.</p>'}` });
}

// ── 통계: 인라인 SVG 막대 (라이브러리 없음) ──
function barChart(items, opt) {
  const o = opt || {}; const n = items.length || 1; const W = 60 * n + 10, H = 130, base = 96;
  const max = Math.max(1, ...items.map(i => i.value));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">
    <line x1="5" y1="${base}" x2="${W - 5}" y2="${base}" stroke="var(--line)" stroke-width="1"/>
    ${items.map((it, i) => { const h = Math.round(it.value / max * 70); const x = 10 + i * 60; return `
      <rect x="${x + 8}" y="${base - h}" width="34" height="${h}" rx="5" fill="${it.value ? (o.color || 'var(--accent)') : 'var(--line)'}" opacity="0.9"/>
      <text x="${x + 25}" y="${base - h - 5}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">${esc(o.fmt ? o.fmt(it.value) : it.value)}</text>
      <text x="${x + 25}" y="${base + 16}" text-anchor="middle" font-size="9.5" fill="var(--sub)">${esc(it.label)}</text>`; }).join('')}
  </svg>`;
}
VIEWS.stats = {
  title: '통계', keys: ['stats'], sub: '최근 6개월 · 소속 상담사의 상담 + 상담소 채널 상담',
  html() {
    const g = gate(['stats'], 'stats'); if (g) return g;
    const ms = DATA.stats; const lb = m => Number(m.key.slice(5)) + '월';
    const chart = (title, key, o) => `<div class="card chart"><div class="lbl">${title}</div>${barChart(ms.map(m => ({ label: lb(m), value: m[key] || 0 })), Object.assign({ title }, o))}</div>`;
    const cur = ms[ms.length - 1] || {}, prev = ms[ms.length - 2] || {};
    const delta = (a, b) => b ? ` <span class="muted">(지난달 ${b})</span>` : '';
    return `
      <div class="stats">
        <div class="stat hi"><div class="lb">이번 달 완료 상담</div><b>${cur.done || 0}<span class="u">건</span></b><div class="sb">지난달 ${prev.done || 0}건</div></div>
        <div class="stat hi"><div class="lb">이번 달 상담료</div><b>${won(cur.gross)}<span class="u">원</span></b><div class="sb">상담소 채널 ${won(cur.hospitalGross)}원</div></div>
        <div class="stat"><div class="lb">이번 달 신규 연결</div><b>${cur.newPatients || 0}<span class="u">명</span></b><div class="sb">지난달 ${prev.newPatients || 0}명</div></div>
        <div class="stat ${cur.urgent ? 'bad' : ''}"><div class="lb">이번 달 긴급 표시</div><b>${cur.urgent || 0}<span class="u">건</span></b><div class="sb">회기 기록 ${cur.notes || 0}건</div></div>
      </div>
      <div class="grid2">
        ${chart('월별 완료 상담 (건)', 'done', {})}
        ${chart('월별 상담료 (만원)', 'gross', { fmt: v => (v / 10000).toFixed(v >= 100000 ? 0 : 1), color: 'var(--gold)' })}
        ${chart('월별 신규 연결 내담자 (명)', 'newPatients', { color: '#6b8fbf' })}
        ${chart('월별 긴급 표시 (건)', 'urgent', { color: 'var(--danger)' })}
      </div>
      <p class="muted">완료 상담과 상담료는 소속 상담사의 예약·통화 전체(앱 채널 포함)를, 신규 연결과 긴급 표시는 상담소 코드로 연결된 내담자만 셉니다.${delta()}</p>`;
  }
};

// ── 설정 ──
VIEWS.settings = {
  title: '설정', keys: ['info'], sub: '상담소 정보 · 정산 계좌 · 화면 · 로그인',
  html() {
    const g = gate(['info'], 'settings'); if (g) return g;
    const i = DATA.info, th = document.documentElement.dataset.theme, fs = document.documentElement.dataset.font;
    return `
      <div class="grid2">
        <div>
          <div class="card">
            <b style="font-size:0.9rem;">상담소 정보</b>
            <p class="muted" style="margin:0.2rem 0 0.6rem;">이름·전문 분야·소장·이메일은 운영팀(help@neurumind.com)에 문의해 바꿔요.</p>
            <table class="tbl" style="font-size:0.84rem;"><tbody>
              <tr><td class="sub" style="width:120px;">상담소</td><td><b>${esc(i.name)}</b></td></tr>
              <tr><td class="sub">전문 분야</td><td>${esc(i.dept || '—')}</td></tr>
              <tr><td class="sub">소장</td><td>${esc(i.doctor || '—')}</td></tr>
              <tr><td class="sub">이메일</td><td>${i.email ? esc(i.email) : '<span class="danger-t">미등록 — 긴급 알림 메일이 가지 않아요</span>'}</td></tr>
              <tr><td class="sub">등록일</td><td>${fmtDate(i.created)}</td></tr>
            </tbody></table>
          </div>
          <div class="card">
            <b style="font-size:0.9rem;">사업자 정보 · 연락처</b>
            <p class="muted" style="margin:0.2rem 0 0.6rem;">사업자등록번호는 <b>한 번만</b> 적을 수 있어요 (정산 서류에 쓰입니다). 틀리게 적었다면 운영팀에 문의하세요. 전화·주소는 상담소 페이지에도 같이 보여요.</p>
            <label class="f"><span>사업자등록번호 (숫자 10자리)</span><input id="st-bizno" inputmode="numeric" maxlength="12" value="${esc(i.bizno || '')}" placeholder="000-00-00000" ${i.biznoLocked ? 'disabled' : ''}></label>
            <label class="f"><span>전화</span><input id="st-tel" inputmode="tel" maxlength="30" value="${esc(i.tel || '')}" placeholder="02-000-0000"></label>
            <label class="f"><span>주소</span><input id="st-addr" maxlength="120" value="${esc(i.addr || '')}" placeholder="서울시 ○○구 ○○로 00, 3층"></label>
            <div class="row" style="justify-content:flex-end;"><button class="btn sm" data-act="info-save">저장</button></div>
            ${i.migrated === false ? '<p class="muted danger-t" style="margin-top:0.4rem;">사업자등록번호 칸이 서버에 아직 준비되지 않았어요 (운영팀 마이그레이션 필요).</p>' : ''}
          </div>
          ${bankCardHtml()}
        </div>
        <div>
          <div class="card">
            <b style="font-size:0.9rem;">상담소 코드</b>
            <p class="muted" style="margin-top:0.2rem;">내담자 연결용 코드는 <b>대시보드</b> 아래에서 복사할 수 있어요. 코드가 새어 나갔다면 재발급을 운영팀에 요청하세요 — 재발급하면 옛 코드로는 더 이상 연결·로그인할 수 없어요.</p>
          </div>
          <div class="card">
            <b style="font-size:0.9rem;">긴급 알림</b>
            <p class="muted" style="margin-top:0.2rem;">상담사가 회기 기록에 '긴급'을 표시하면 ${i.hasEmail ? `<b>${esc(i.email)}</b>로 즉시 메일이 가고, 콘솔의 <b>긴급 알림</b> 메뉴에 남아요.` : '<span class="danger-t">이메일이 등록돼 있지 않아 메일이 가지 않습니다.</span> 운영팀에 이메일 등록을 요청하세요.'}</p>
          </div>
          <div class="card">
            <b style="font-size:0.9rem;">화면</b>
            <div class="row wrap" style="gap:0.5rem; margin-top:0.5rem;">
              <span class="muted" style="width:70px;">밝기</span>
              <div class="filters" style="margin:0;"><div class="seg"><button class="${th !== 'dark' ? 'on' : ''}" data-act="pref" data-k="doc_theme" data-v="light">밝게</button><button class="${th === 'dark' ? 'on' : ''}" data-act="pref" data-k="doc_theme" data-v="dark">어둡게</button></div></div>
            </div>
            <div class="row wrap" style="gap:0.5rem; margin-top:0.5rem;">
              <span class="muted" style="width:70px;">글자 크기</span>
              <div class="filters" style="margin:0;"><div class="seg"><button class="${fs !== 'big' ? 'on' : ''}" data-act="pref" data-k="doc_font" data-v="normal">보통</button><button class="${fs === 'big' ? 'on' : ''}" data-act="pref" data-k="doc_font" data-v="big">크게</button></div></div>
            </div>
            <p class="muted" style="margin-top:0.5rem;">이 기기에만 저장돼요.</p>
          </div>
          <div class="card">
            <b style="font-size:0.9rem;">로그인</b>
            <p class="muted" style="margin:0.2rem 0 0.6rem;">지금 방식: <b>${HS ? '이메일 링크 (이 기기 30일)' : '상담소 코드'}</b>. ${HS ? '다른 PC·폰에서도 링크로 들어왔다면 아래에서 한꺼번에 내보낼 수 있어요.' : '이메일이 등록돼 있다면 링크 로그인이 더 안전해요.'}</p>
            <div class="row wrap" style="gap:0.4rem;">${HS ? '<button class="btn ghost sm" data-act="logout-others">다른 기기 모두 로그아웃</button>' : ''}<button class="btn warnline sm" data-act="logout">이 기기에서 로그아웃</button></div>
          </div>
        </div>
      </div>`;
  }
};
async function saveInfo(btn) {
  const body = { tel: $('st-tel').value, addr: $('st-addr').value };
  const bz = $('st-bizno'); if (bz && !bz.disabled) body.bizno = bz.value;
  if (body.bizno && !/^\d{10}$/.test(body.bizno.replace(/[^0-9]/g, ''))) { toast('사업자등록번호는 숫자 10자리예요'); return; }
  if (body.bizno && !(await confirmBox({ title: '사업자등록번호를 저장할까요?', body: body.bizno + '\n한 번 저장하면 여기서 바꿀 수 없어요 (운영팀 문의).', okLabel: '저장' }))) return;
  btn.disabled = true;
  const r = await hpost('info', body);
  btn.disabled = false;
  if (!r || !r.ok) { toast(r && r.error === 'locked' ? '사업자등록번호는 이미 등록돼 있어요 — 운영팀에 문의' : r && r.error === 'bad-bizno' ? '사업자등록번호를 확인해주세요' : r && r.error === 'migrate' ? '서버 준비가 아직이에요 (운영팀 마이그레이션 필요)' : '저장하지 못했어요'); return; }
  DATA.info = r.info; if (DATA.profile) { DATA.profile.tel = r.info.tel; DATA.profile.addr = r.info.addr; }
  toast('저장했어요'); render(true);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'cal-move') { const v = +el.dataset.v; CAL.week = v === 0 ? startOfWeek(Date.now()) : CAL.week + v * 7 * 86400000; render(true); loadKey('bookings', true); }
  else if (act === 'cal-open') openBooking(el.dataset.id);
  else if (act === 'info-save') saveInfo(el);
  else if (act === 'pref') setPref(el.dataset.k, el.dataset.v);
});
