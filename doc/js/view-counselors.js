// ── 소속 상담사 — 입점 승인 대기(신청서) → 소속 상담사 표 → 지난 신청 ─────────
//  두 가지 '승인'이 있다:
//   · 입점 신청 승인: 상담사 앱에서 우리 상담소 소속으로 새로 등록 신청한 사람. 승인하면 계정이 생기고 코드가 메일로 간다. 소속 승인도 함께 끝난다.
//   · 소속 승인: 이미 상담사인 사람이 앱에서 소속을 우리 상담소로 고른 경우(hospital_ok=0). 승인해야 상담료가 상담소 채널로 온다.
LOADERS.counselors = () => hget('counselors').then(d => (d && d.ok) ? (DATA.counselors = d.items) : null);
LOADERS.apps = () => hget('applications').then(d => (d && d.ok) ? (DATA.apps = d.items) : null);
const CS = { showPast: false, openLicense: '' };

function appCardHtml(a) {
  return `
    <div class="card" style="border-color: rgba(185,138,26,0.45);">
      <div class="row" style="gap:0.7rem; align-items:flex-start;">
        ${avatar(a.name, 'lg', a.photo)}
        <div class="grow">
          <div class="row wrap" style="gap:0.4rem;"><b style="font-size:0.98rem;">${esc(a.name)}</b><span class="chip gold">입점 승인 대기</span><span class="muted right">${fmtAgo(a.ts)} 신청</span></div>
          <div class="muted">${[a.license, a.career ? '경력 ' + a.career : '', a.price ? '예약 상담료 ' + won(a.price) + '원' : ''].filter(Boolean).map(esc).join(' · ')}</div>
          <div class="muted">${esc(a.email || '이메일 없음')}${a.tel ? ' · ' + esc(a.tel) : ''}</div>
          ${a.tags && a.tags.length ? `<div class="row wrap" style="gap:0.25rem; margin-top:0.3rem;">${a.tags.map(t => `<span class="chip off">${esc(t)}</span>`).join('')}</div>` : ''}
          ${a.intro ? `<p class="pre small" style="margin-top:0.45rem; padding:0.5rem 0.7rem; background:var(--bg); border-radius:10px;">${esc(a.intro)}</p>` : ''}
          ${a.licensePhoto
            ? `<div style="margin-top:0.45rem;"><button class="btn ghost xs" data-act="app-license" data-id="${esc(a.id)}">자격증 사진 ${CS.openLicense === a.id ? '접기' : '보기'}</button>
               ${CS.openLicense === a.id ? `<img src="${esc(a.licensePhoto)}" alt="자격증 사진" style="display:block; width:100%; max-width:520px; margin-top:0.45rem; border-radius:10px; border:1px solid var(--line); background:var(--bg);">` : ''}</div>`
            : '<p class="muted danger-t" style="margin-top:0.45rem;">자격증 사진 첨부 없음 — 승인 전에 자격을 따로 확인하세요.</p>'}
        </div>
      </div>
      <div class="row" style="gap:0.4rem; justify-content:flex-end; margin-top:0.6rem;">
        <button class="btn warnline sm" data-act="app-reject" data-id="${esc(a.id)}" data-nm="${esc(a.name)}">반려</button>
        <button class="btn sm" data-act="app-approve" data-id="${esc(a.id)}" data-nm="${esc(a.name)}">승인 — 코드 발급</button>
      </div>
    </div>`;
}
function counselorsCsv() {
  const rows = [['이름', '자격', '이메일', '전화', '상태', '이번 달 완료', '누적 완료', '진행 예약', '이번 달 상담료', '회기 기록 미작성', '등록일']];
  (DATA.counselors || []).forEach(c => rows.push([c.name, c.license, c.email, c.tel, !c.active ? '비활성' : c.hospitalOk ? '소속' : '승인 대기', c.stats.monthDone, c.stats.allDone, c.stats.upcoming, c.stats.monthGross, c.stats.noNote, fmtDate(c.created)]));
  downloadCsv('소속상담사_' + fmtDate(Date.now()) + '.csv', rows);
}

VIEWS.counselors = {
  title: '소속 상담사', keys: ['counselors', 'apps'],
  sub: () => DATA.counselors ? `소속 ${DATA.counselors.filter(c => c.hospitalOk && c.active).length}명 · 승인 대기 ${DATA.counselors.filter(c => !c.hospitalOk).length}명` : '',
  html() {
    const g = gate(['counselors'], 'counselors'); if (g) return g;
    const cs = DATA.counselors, apps = DATA.apps;
    const pending = (apps || []).filter(a => a.status === 'pending');
    const past = (apps || []).filter(a => a.status !== 'pending');
    const statusChip = c => !c.active ? '<span class="chip off">비활성</span>' : c.hospitalOk ? '<span class="chip ok">소속</span>' : '<span class="chip gold">승인 대기</span>';
    return `
      <div class="card notebox">
        <b style="font-size:0.9rem;">소속 상담사는 이렇게 연결돼요</b>
        <p class="muted" style="margin-top:0.2rem;">상담사는 <b>상담사 앱(마인드 인사이드 프로)</b>에서 등록을 신청하거나 내 정보에서 소속 상담소를 고릅니다. 여기서 <b>승인</b>해야 그 상담사의 상담료가 상담소로 정산됩니다(상담소 90% · 앱 7% · 결제 수수료 3%). 승인 전에는 앱이 상담사 계좌로 직접 지급해요. 소속을 해제하면 다시 개인 상담사가 됩니다.</p>
      </div>
      <div class="sec-title">입점 승인 대기 <span class="right">${apps == null ? '' : pending.length + '건'}</span></div>
      ${apps == null ? (ST.apps === 'err' ? '<p class="muted">신청서를 불러오지 못했어요.</p>' : loadingHtml()) : pending.length ? pending.map(appCardHtml).join('')
        : '<div class="card flat"><p class="muted">지금 심사할 입점 신청이 없어요. 상담사가 상담사 앱에서 우리 상담소 소속으로 신청하면 여기에 나타나요.</p></div>'}
      <div class="sec-title">소속 상담사 <span class="right"><button class="btn xs ghost" data-act="counselors-csv">CSV</button></span></div>
      ${cs.length ? `<div class="tblwrap"><table class="tbl">
        <thead><tr><th>상담사</th><th>자격</th><th>연락</th><th>상태</th><th class="r">이번 달 완료</th><th class="r">누적</th><th class="r">진행 예약</th><th class="r">이번 달 상담료</th><th class="r">기록 미작성</th><th class="t">마지막 상담</th><th class="acts"></th></tr></thead>
        <tbody>${cs.map(c => `
          <tr class="${!c.active ? 'dim' : ''}">
            <td><div class="row">${avatar(c.name, 'sm', c.photo)}<div><b>${esc(c.name)}</b><div class="muted">${c.available ? '바로상담 켬' : '바로상담 끔'} · ${fmtDate(c.created)} 등록</div></div></div></td>
            <td class="sub">${esc(c.license || '—')}</td>
            <td class="sub">${esc(c.email || '')}${c.tel ? '<br>' + esc(c.tel) : ''}</td>
            <td>${statusChip(c)}</td>
            <td class="r num">${c.stats.monthDone}</td>
            <td class="r num">${c.stats.allDone}</td>
            <td class="r num">${c.stats.upcoming ? `<span class="chip blue">${c.stats.upcoming}</span>` : '<span class="muted">0</span>'}</td>
            <td class="r num">${won(c.stats.monthGross)}원</td>
            <td class="r num">${c.stats.noNote ? `<span class="chip bad">${c.stats.noNote}</span>` : '<span class="muted">0</span>'}</td>
            <td class="t sub">${c.stats.lastDone ? fmtDate(c.stats.lastDone) : '—'}</td>
            <td class="acts">${!c.hospitalOk ? `<button class="btn sm" data-act="cs-approve" data-id="${esc(c.id)}" data-nm="${esc(c.name)}">소속 승인</button> ` : ''}<button class="btn ghost xs" data-act="cs-remove" data-id="${esc(c.id)}" data-nm="${esc(c.name)}">소속 해제</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : empty('아직 소속 상담사가 없어요', '상담사가 상담사 앱에서 우리 상담소를 소속으로 고르면 여기에 나타나요.')}
      <p class="muted">'기록 미작성'은 완료 처리된 예약 중 회기 기록이 없는 건이에요. 기록이 없는 상담은 정산에 올라가지 않으니 상담사에게 안내해주세요. 이메일은 일부만 보여요.</p>
      ${past.length ? `<div class="sec-title">지난 입점 신청 <span class="right"><button class="btn xs ghost" data-act="cs-past">${CS.showPast ? '접기' : past.length + '건 보기'}</button></span></div>
        ${CS.showPast ? `<div class="card pad0"><table class="tbl"><thead><tr><th>이름</th><th>자격</th><th>결과</th><th class="t">신청</th><th class="t">결정</th><th>사유</th></tr></thead><tbody>
          ${past.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="sub">${esc(a.license || '')}</td><td>${a.status === 'approved' ? '<span class="chip ok">승인</span>' : '<span class="chip bad">반려</span>'}</td><td class="t sub">${fmtDate(a.ts)}</td><td class="t sub">${fmtDate(a.decidedAt)}</td><td class="sub">${esc(a.rejectWhy || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}` : ''}`;
  }
};

async function approveApp(el) {
  if (!(await confirmBox({ title: `${el.dataset.nm} 님의 입점을 승인할까요?`, body: '상담사 계정이 만들어지고 로그인 코드가 그분 이메일로 갑니다. 이 상담사는 우리 상담소 소속으로 바로 승인되며, 상담료는 상담소로 정산됩니다.', okLabel: '승인' }))) return;
  el.disabled = true;
  const r = await hpost('applications/approve', { id: el.dataset.id });
  el.disabled = false;
  if (!r || !r.ok) { toast((r && r.error) || '승인하지 못했어요'); return; }
  await alertBox('승인했어요', `${r.name} 님의 로그인 코드: ${r.code}\n${r.mailed === false ? '메일을 보내지 못했어요 — 코드를 직접 전달해주세요.' : r.mailed ? '이메일로 코드를 보냈어요.' : '이메일이 없어 코드를 직접 전달해주세요.'}`);
  loadKey('apps', true); loadKey('counselors', true); loadKey('dash', true);
}
async function rejectApp(el) {
  const why = await promptBox({ title: `${el.dataset.nm} 님의 신청을 반려할까요?`, body: '사유는 상담사 앱의 신청 현황에 보여요.', placeholder: '예: 자격 증빙이 확인되지 않았어요', okLabel: '반려', danger: true });
  if (why === null) return;
  const r = await hpost('applications/reject', { id: el.dataset.id, reason: why });
  if (!r || !r.ok) { toast((r && r.error) || '처리하지 못했어요'); return; }
  toast('반려했어요'); loadKey('apps', true); loadKey('dash', true);
}
async function approveCounselor(el) {
  if (!(await confirmBox({ title: `${el.dataset.nm} 상담사를 소속으로 승인할까요?`, body: '이후 이 상담사의 모든 상담(예약·통화·채팅)은 상담소 채널로 정산돼요. 앱은 상담소 계좌로 90%를 보내고, 상담사에게는 상담소가 직접 지급합니다.', okLabel: '승인' }))) return;
  const r = await hpost('counselors/approve', { id: el.dataset.id });
  if (!r || !r.ok) { toast(r && r.error === 'migrate' ? '서버 준비가 아직이에요 (운영팀 마이그레이션 필요)' : '승인하지 못했어요'); return; }
  toast('소속으로 승인했어요'); loadKey('counselors', true); loadKey('dash', true);
}
async function removeCounselor(el) {
  if (!(await confirmBox({ title: `${el.dataset.nm} 상담사의 소속을 해제할까요?`, body: '이후 상담은 앱 채널(상담사 계좌로 직접 지급)로 바뀌고, 상담사는 앱에서 정산 계좌를 등록해야 해요. 이미 완료된 상담의 정산은 바뀌지 않습니다.', okLabel: '소속 해제', danger: true }))) return;
  const r = await hpost('counselors/remove', { id: el.dataset.id });
  if (!r || !r.ok) { toast('처리하지 못했어요'); return; }
  toast('소속을 해제했어요'); loadKey('counselors', true); loadKey('dash', true);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'app-approve') approveApp(el);
  else if (act === 'app-reject') rejectApp(el);
  else if (act === 'cs-approve') approveCounselor(el);
  else if (act === 'cs-remove') removeCounselor(el);
  else if (act === 'cs-past') { CS.showPast = !CS.showPast; render(true); }
  else if (act === 'app-license') { CS.openLicense = CS.openLicense === el.dataset.id ? '' : el.dataset.id; render(true); }
  else if (act === 'counselors-csv') counselorsCsv();
});
