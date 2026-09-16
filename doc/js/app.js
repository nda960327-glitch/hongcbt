// ============================================================================
//  마인드 인사이드 닥터 — 담당의 전용 앱 (doc.neurumind.com)
//
//  정신과에서 앱을 권한 환자가 병원 코드로 연결되면, 담당의는 여기서
//   · 연결된 환자 목록 (긴급 표시 먼저)
//   · 환자별 타임라인: 상담사 회기 기록 · 낸 숙제 · 내 피드백 · 예약
//   · 주간 상태 요약 (환자가 동의한 숫자만: 기분 평균·체크인·미션·밤 일기·기록·연속일)
//   · 상담사·환자에게 피드백 보내기
//  를 본다.
//
//  로그인: 이메일 매직링크(상담사와 같은 방식) 또는 병원 코드(H-XXXX-XXXX).
//  서버는 상담사 앱과 같은 Worker 를 쓴다 (/api/hospital/…). 원본 대화는 절대 오지 않는다.
// ============================================================================
const API_BASE = 'https://cbt-proxy.hongcbt.workers.dev';
const PRO_URL = 'https://pro.neurumind.com';

let sameOrigin;
async function api(path, opts) {
  if (sameOrigin !== false) {
    try {
      const r = await fetch(path, opts);
      const ct = r.headers.get('content-type') || '';
      if (r.status !== 404 && !ct.includes('text/html')) { sameOrigin = true; return r; }
      sameOrigin = false;
    } catch (e) { sameOrigin = false; }
  }
  return fetch(API_BASE + path, opts);
}
const getJson = (p) => api(p).then(r => r.ok ? r.json() : null).catch(() => null);
const postJson = (p, d) => api(p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d || {})
}).then(r => r.json().catch(() => ({}))).catch(() => null);

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDay = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
const fmtDT = ts => new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const avColor = name => String(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const avatar = (name, cls) => `<div class="pav c${avColor(name)}${cls ? ' ' + cls : ''}">${esc(String(name || '환').slice(0, 1))}</div>`;
const won = n => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');
const empty = (title, body) => `<div class="empty"><b>${title}</b>${body || ''}</div>`;
const busy = el => !!(el && document.activeElement && el.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName));

const RISK_LABEL = { none: '특이사항 없음', watch: '주의 관찰', urgent: '긴급 — 의사 확인 필요' };
const RISK_CHIP = { none: '', watch: '<span class="chip gold">주의</span>', urgent: '<span class="chip bad">긴급</span>' };
const KIND_LABEL = { booking: '예약 상담', call: '전화 상담', chat: '채팅 상담' };

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2200);
}
function sheet(html) {
  $('sheet-body').innerHTML = '<div class="grab"></div>' + html;
  $('sheet').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('sheet').hidden = true; document.body.style.overflow = ''; }

// ── 인증 ─────────────────────────────────────────────────────────────
//  세션(이메일 링크)이 우선, 코드는 보조. 둘 다 이 기기의 localStorage 에만 있다.
let HS = localStorage.getItem('doc_session') || '';
let HC = localStorage.getItem('doc_code') || '';
const authQS = () => HS ? 'hsession=' + encodeURIComponent(HS) : 'hcode=' + encodeURIComponent(HC);
const authBody = (o) => Object.assign(HS ? { hsession: HS } : { hcode: HC }, o || {});

const HOSP = { hospital: null, patients: [], patient: null, detail: null, q: '' };

function showErr(id, msg) { const e = $(id); if (!e) return; e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }

async function requestLink() {
  const email = ($('email').value || '').trim();
  showErr('err', ''); $('sent').style.display = 'none';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showErr('err', '이메일 형식을 확인해주세요.'); return; }
  const btn = $('email-btn');
  btn.disabled = true; btn.textContent = '보내는 중…';
  const r = await postJson('/api/hospital/auth/request', { email });
  btn.disabled = false; btn.textContent = '로그인 링크 받기';
  if (!r || !r.ok) { showErr('err', '지금은 보내지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
  $('sent').textContent = r.message || '메일함을 확인해주세요.';
  $('sent').style.display = 'block';
}

async function verifyLink(t) {
  const r = await postJson('/api/hospital/auth/verify', { t });
  history.replaceState(null, '', location.pathname);   // 주소창의 토큰을 지운다
  if (!r || !r.ok) {
    const why = r && r.error;
    showErr('err', why === 'expired' ? '링크가 만료됐어요 (15분). 다시 받아주세요.'
      : why === 'used' ? '이미 사용한 링크예요. 다시 받아주세요.' : '링크가 올바르지 않아요. 다시 받아주세요.');
    return false;
  }
  HS = r.hsession; HC = '';
  localStorage.setItem('doc_session', HS); localStorage.removeItem('doc_code');
  enter(r.hospital);
  return true;
}

async function loginWithCode(v) {
  v = (v || ($('code').value || '')).trim().toUpperCase();
  showErr('err2', '');
  if (!/^H-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(v)) { showErr('err2', 'H-XXXX-XXXX 형식의 병원 코드를 넣어주세요.'); return; }
  if (!v.includes('-')) v = 'H-' + v.slice(1, 5) + '-' + v.slice(5);
  const btn = $('code-btn');
  btn.disabled = true; btn.textContent = '확인 중…';
  const hd = await getJson('/api/hospital/me?hcode=' + encodeURIComponent(v));
  btn.disabled = false; btn.textContent = '시작하기';
  if (!hd || !hd.ok) { showErr('err2', '코드가 올바르지 않거나 정지된 병원이에요.'); return; }
  HC = v; HS = '';
  localStorage.setItem('doc_code', HC); localStorage.removeItem('doc_session');
  enter(hd.hospital);
}

function enter(h) {
  HOSP.hospital = h;
  $('screen-login').hidden = true;
  $('app').hidden = false;
  $('me-name').textContent = h.name;
  $('me-sub').textContent = [h.dept, h.doctor ? h.doctor + ' 선생님' : ''].filter(Boolean).join(' · ') || '담당의 화면';
  $('me-av').textContent = (h.name || '병').slice(0, 1);
  renderHosp();
  loadHospital();
}

async function logout() {
  if (!confirm('이 기기에서 로그아웃할까요?')) return;
  if (HS) await postJson('/api/hospital/auth/logout', { hsession: HS });
  HS = ''; HC = '';
  localStorage.removeItem('doc_session'); localStorage.removeItem('doc_code');
  HOSP.hospital = null; HOSP.patients = []; HOSP.patient = null; HOSP.detail = null;
  closeSheet();
  $('app').hidden = true; $('screen-login').hidden = false;
}

// ── 데이터 ───────────────────────────────────────────────────────────
async function loadHospital() {
  const d = await getJson('/api/hospital/patients?' + authQS());
  if (d && d.error === 'bad-code') { toast('로그인이 풀렸어요. 다시 들어와주세요.'); HS = ''; HC = ''; localStorage.removeItem('doc_session'); localStorage.removeItem('doc_code'); $('app').hidden = true; $('screen-login').hidden = false; return; }
  if (d && Array.isArray(d.items)) HOSP.patients = d.items;
  if (HOSP.patient) await loadPatient(); else renderHosp();
}

async function loadPatient() {
  if (!HOSP.patient) return;
  const d = await getJson('/api/hospital/patient?' + authQS() + '&clientId=' + encodeURIComponent(HOSP.patient));
  if (d && d.patient) HOSP.detail = d;
  renderHosp();
}

// ── 화면 ─────────────────────────────────────────────────────────────
function renderHosp() {
  const el = $('view-hosp');
  if (!el || !HOSP.hospital) return;
  if (busy(el)) return;
  if (HOSP.patient) { el.innerHTML = patientHtml(); return; }
  const q = HOSP.q.trim();
  const list = HOSP.patients
    .filter(p => !q || (p.name || '').includes(q) || (p.birth || '').includes(q))
    .sort((a, b) => (b.lastRisk === 'urgent') - (a.lastRisk === 'urgent'));
  const urgent = HOSP.patients.filter(p => p.lastRisk === 'urgent');
  const moodTxt = w => w && w.moodAvg != null ? `기분 ${w.moodAvg.toFixed(1)}/5` : '';
  el.innerHTML = `
    ${urgent.length ? `<div class="urgentbar"><b>긴급 표시 ${urgent.length}명</b> — ${esc(urgent.map(p => p.name).join(', '))}<div class="muted" style="margin-top:0.2rem;">상담사가 최근 회기에서 '긴급'을 표시했어요. 눌러서 기록을 확인해주세요.</div></div>` : ''}
    <div class="card" style="margin-bottom:0.7rem;">
      <div class="row" style="gap:0.6rem;">
        <div class="grow">
          <strong style="font-size:0.98rem;">연결된 환자 ${HOSP.patients.length}명</strong>
          <p class="muted" style="margin-top:0.2rem;">환자가 앱 → 마이 → 담당 병원 연결하기에 병원 코드를 넣으면 여기에 나타납니다.</p>
        </div>
      </div>
      <input id="hosp-q" type="search" placeholder="이름·생년으로 찾기" value="${esc(HOSP.q)}" style="margin-top:0.6rem;">
    </div>
    ${list.length ? list.map(p => `
      <button class="card" style="width:100%; text-align:left; display:block; margin-bottom:0.5rem; cursor:pointer; ${p.lastRisk === 'urgent' ? 'border-color: var(--danger);' : p.lastRisk === 'watch' ? 'border-color: var(--gold);' : ''}" data-act="open" data-id="${esc(p.clientId)}">
        <div class="row" style="gap:0.6rem;">
          ${avatar(p.name)}
          <div class="grow" style="min-width:0;">
            <div class="row" style="gap:0.4rem;"><strong style="font-size:0.92rem;">${esc(p.name)}</strong>${p.birth ? `<span class="muted">${esc(p.birth)}</span>` : ''}${RISK_CHIP[p.lastRisk] || ''}</div>
            <div class="muted">${p.notes ? `상담 기록 ${p.notes}건 · 최근 ${fmtDay(p.lastNote)}` : '아직 상담 기록 없음'}${p.hwOpen ? ` · 진행 중 숙제 ${p.hwOpen}` : ''}</div>
            <div class="muted">${p.week ? `이번 주 ${moodTxt(p.week)}${p.week.checkins ? ` · 체크인 ${p.week.checkins}회` : ''}` : (p.shareWeekly ? '주간 상태 아직 없음' : '주간 상태 공유 안 함')} · ${fmtDay(p.linkedAt)} 연결</div>
          </div>
          <span class="muted">›</span>
        </div>
      </button>`).join('')
      : empty(HOSP.patients.length ? '검색 결과가 없어요' : '아직 연결된 환자가 없어요', HOSP.patients.length ? '' : '진료실에서 환자에게 병원 코드를 알려주세요.<br>환자 앱 → 마이 → 담당 병원 연결하기')}`;
}

// 주간 상태 막대 — 기분 평균(1~5). 숫자 몇 개로 '이번 주가 지난주보다 나은가'가 보이면 된다.
function weeklyHtml(weeks, share) {
  if (!share) return `<div class="card" style="margin-bottom:0.7rem;"><strong style="font-size:0.9rem;">주간 상태</strong><p class="muted" style="margin-top:0.3rem;">환자가 주간 상태 공유를 꺼 두었어요. 앱 → 마이 → 담당 병원에서 켤 수 있습니다.</p></div>`;
  if (!weeks || !weeks.length) return `<div class="card" style="margin-bottom:0.7rem;"><strong style="font-size:0.9rem;">주간 상태</strong><p class="muted" style="margin-top:0.3rem;">아직 올라온 주간 요약이 없어요. 환자가 앱을 쓰면 주마다 자동으로 올라옵니다 (기분 체크인 평균·횟수 같은 숫자만).</p></div>`;
  const last = weeks[weeks.length - 1];
  const prev = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const diff = last.moodAvg != null && prev && prev.moodAvg != null ? last.moodAvg - prev.moodAvg : null;
  const bars = weeks.slice(-8).map(w => {
    const v = w.moodAvg;
    const h = v == null ? 0 : Math.max(8, Math.round(((v - 1) / 4) * 56) + 8);
    const cls = v == null ? 'none' : v < 2.5 ? 'lo' : v < 3.5 ? 'mid' : '';
    const d = new Date(w.weekKey + 'T00:00:00');
    return `<div class="b"><em>${v == null ? '–' : v.toFixed(1)}</em><i class="${cls}" style="height:${h}px;"></i><span>${d.getMonth() + 1}/${d.getDate()}~</span></div>`;
  }).join('');
  return `
    <div class="card" style="margin-bottom:0.7rem;">
      <div class="row" style="gap:0.5rem;"><strong class="grow" style="font-size:0.9rem;">주간 상태 <span class="pill">환자 동의</span></strong>
        <span class="muted">${diff == null ? '' : diff > 0.2 ? `<b style="color:var(--accent);">지난주보다 +${diff.toFixed(1)}</b>` : diff < -0.2 ? `<b style="color:var(--danger);">지난주보다 ${diff.toFixed(1)}</b>` : '지난주와 비슷'}</span></div>
      <div class="wk">${bars}</div>
      <div class="stat" style="margin-top:0.6rem;">
        <div><span class="muted">기분 평균</span><strong>${last.moodAvg == null ? '–' : last.moodAvg.toFixed(1) + '/5'}</strong></div>
        <div><span class="muted">체크인</span><strong>${last.checkins}회</strong></div>
        <div><span class="muted">미션·밤일기</span><strong>${last.missions}·${last.nights}</strong></div>
        <div><span class="muted">연속 사용</span><strong>${last.streak}일</strong></div>
      </div>
      <p class="muted" style="margin-top:0.5rem;">막대는 주별 기분 체크인 평균(1 매우 나쁨 ~ 5 매우 좋음). 3.5 미만은 노랑, 2.5 미만은 빨강. 환자가 앱에서 고른 값이라 참고용입니다.</p>
    </div>`;
}

function patientHtml() {
  const d = HOSP.detail;
  const p = HOSP.patients.find(x => x.clientId === HOSP.patient) || {};
  const head = `
    <div class="row" style="gap:0.5rem; margin-bottom:0.7rem;">
      <button class="iconbtn" data-act="back" aria-label="목록으로"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      ${avatar(p.name)}
      <div class="grow" style="min-width:0;">
        <strong style="font-size:1rem;">${esc(p.name || '환자')}</strong>
        <div class="muted">${[p.birth, `${fmtDay(p.linkedAt || Date.now())} 연결`].filter(Boolean).join(' · ')}</div>
      </div>
      <button class="btn sm" style="width:auto; margin:0;" data-act="fb">피드백 쓰기</button>
    </div>`;
  if (!d) return head + '<div class="empty">불러오는 중…</div>';
  const hwDone = d.homework.filter(h => h.doneAt).length;
  const lastRisk = d.notes.length ? d.notes[0].risk : 'none';
  const stats = `
    ${lastRisk === 'urgent' ? `<div class="urgentbar"><b>긴급 — 의사 확인 필요</b><div class="muted" style="margin-top:0.2rem;">${esc(d.notes[0].counselor || '상담사')} · ${fmtDT(d.notes[0].ts)} 회기 기록에 표시됨. 담당의 이메일로도 알림이 갔습니다.</div></div>` : ''}
    <div class="card" style="margin-bottom:0.7rem;">
      <div class="stat">
        <div><span class="muted">상담 기록</span><strong>${d.notes.length}건</strong></div>
        <div><span class="muted">숙제</span><strong>${hwDone}/${d.homework.length}</strong></div>
        <div><span class="muted">최근 위험도</span><strong style="${lastRisk === 'urgent' ? 'color:var(--danger);' : lastRisk === 'watch' ? 'color:var(--gold);' : ''}">${lastRisk === 'none' ? '없음' : lastRisk === 'watch' ? '주의' : '긴급'}</strong></div>
        <div><span class="muted">상담사</span><strong style="font-size:0.82rem;">${esc([...new Set(d.notes.map(n => n.counselor).filter(Boolean))].join(', ') || '—')}</strong></div>
      </div>
      <p class="muted" style="margin-top:0.5rem;">앱 안의 대화 내용은 병원에 오지 않습니다. 여기 보이는 건 상담사가 남긴 요약·숙제, 환자가 동의한 주간 숫자, 그리고 선생님의 피드백뿐이에요.</p>
    </div>
    ${weeklyHtml(d.weekly, d.patient.shareWeekly)}`;
  const items = [];
  d.notes.forEach(n => items.push({ ts: n.ts, html: `
    <div class="card" style="margin-bottom:0.5rem; ${n.risk === 'urgent' ? 'border-color: var(--danger);' : n.risk === 'watch' ? 'border-color: var(--gold);' : ''}">
      <div class="row" style="gap:0.4rem;"><span class="chip ok">${KIND_LABEL[n.kind] || '상담'}</span><strong style="font-size:0.88rem;">${esc(n.counselor || '상담사')}</strong>${RISK_CHIP[n.risk] || ''}<span class="muted grow" style="text-align:right;">${fmtDT(n.ts)}</span></div>
      <p style="margin-top:0.4rem; font-size:0.88rem; white-space:pre-wrap;">${esc(n.summary)}</p>
      ${n.plan ? `<p class="muted" style="margin-top:0.35rem;"><b>다음 계획</b> ${esc(n.plan)}</p>` : ''}
      ${n.homework ? `<p class="muted"><b>낸 숙제</b> ${esc(n.homework)}</p>` : ''}
      <button class="btn ghost sm" style="margin-top:0.5rem; width:auto;" data-act="fb" data-note="${esc(n.id)}">이 기록에 피드백</button>
    </div>` }));
  d.homework.forEach(h => items.push({ ts: h.assignedAt, html: `
    <div class="card" style="margin-bottom:0.5rem;">
      <div class="row" style="gap:0.4rem;"><span class="chip ${h.doneAt ? 'ok' : 'gold'}">숙제${h.doneAt ? ' 완료' : ' 진행 중'}</span><strong style="font-size:0.88rem;">${esc(h.counselor || '상담사')}</strong><span class="muted grow" style="text-align:right;">${fmtDT(h.assignedAt)}</span></div>
      <p style="margin-top:0.4rem; font-size:0.88rem;">${esc(h.text)}</p>
      ${h.doneAt ? `<p class="muted" style="margin-top:0.3rem;">${fmtDT(h.doneAt)} 완료${h.note ? ` · 환자 메모: ${esc(h.note)}` : ''}</p>` : ''}
    </div>` }));
  d.feedback.forEach(f => items.push({ ts: f.ts, html: `
    <div class="card" style="margin-bottom:0.5rem; background: var(--accent-soft);">
      <div class="row" style="gap:0.4rem;"><span class="chip new">내 피드백</span><span class="muted">${f.to === 'counselor' ? '상담사에게' : f.to === 'patient' ? '환자에게' : '상담사·환자에게'}${f.readC || f.readP ? ' · 읽음' : ''}</span><span class="muted grow" style="text-align:right;">${fmtDT(f.ts)}</span></div>
      <p style="margin-top:0.4rem; font-size:0.88rem; white-space:pre-wrap;">${esc(f.text)}</p>
    </div>` }));
  d.bookings.forEach(b => items.push({ ts: b.whenTs, html: `
    <div class="listrow"><div class="grow"><div class="muted">${fmtDT(b.whenTs)} · ${esc(b.counselor || '상담사')} 예약 상담 · ${esc(b.status)}</div></div></div>` }));
  items.sort((a, b) => b.ts - a.ts);
  return head + stats + `<div class="sec-title">타임라인</div>` + (items.length ? items.map(i => i.html).join('') : '<p class="muted">아직 기록이 없어요.</p>');
}

function openFeedbackSheet(noteId) {
  const p = HOSP.patients.find(x => x.clientId === HOSP.patient) || {};
  const n = noteId && HOSP.detail ? HOSP.detail.notes.find(x => x.id === noteId) : null;
  sheet(`
    <h3 class="serif">${esc(p.name || '환자')} 님에게 피드백</h3>
    ${n ? `<p class="muted" style="margin-bottom:0.6rem; padding:0.5rem 0.7rem; background:var(--bg); border-radius:10px;">${fmtDT(n.ts)} ${esc(n.counselor)} 기록에 대한 피드백<br>"${esc(String(n.summary).slice(0, 80))}${n.summary.length > 80 ? '…' : ''}"</p>` : ''}
    <label><span>받는 사람</span>
      <select id="fb-to">
        <option value="both">상담사와 환자 모두</option>
        <option value="counselor">상담사에게만</option>
        <option value="patient">환자에게만</option>
      </select></label>
    <label><span>내용</span>
      <textarea id="fb-text" rows="6" maxlength="2000" placeholder="예: 수면 문제가 계속되면 다음 진료 때 약 조정을 검토하겠습니다. 상담에서는 취침 시간 고정을 우선 다뤄주세요."></textarea></label>
    <p class="muted" style="margin-bottom:0.8rem;">환자에게 보내는 내용은 환자 앱의 알림함과 '병원과 나누는 기록'에 그대로 뜹니다. 상담사에게는 상담사 앱 홈에 뜹니다.</p>
    <button class="btn" data-act="fb-send" data-note="${esc(noteId || '')}">보내기</button>`);
  setTimeout(() => { const t = $('fb-text'); if (t) t.focus(); }, 60);
}

async function sendFeedback(btn) {
  const text = (($('fb-text') || {}).value || '').trim();
  if (!text) { toast('내용을 적어주세요.'); return; }
  btn.disabled = true;
  const res = await postJson('/api/hospital/feedback', authBody({ clientId: HOSP.patient, noteId: btn.dataset.note || '', to: ($('fb-to') || {}).value || 'both', text }));
  btn.disabled = false;
  if (!res || !res.ok) { toast('보내지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
  closeSheet();
  toast('피드백을 보냈어요');
  loadPatient();
}

// ── 정산 ────────────────────────────────────────────────────────────
//  병원을 통해 등록한 내담자의 상담은 병원이 90 을 받고, 상담사에게는 병원이 직접 지급한다.
//  앱이 상담사에게 직접 보내면 병원 쪽에서 환자 유인 소지가 생긴다(의료법 제27조).
//  그래서 이 화면은 '앱에서 병원으로 들어온 돈'과 '병원이 상담사에게 보낸 돈'을 나란히 둔다.
let SETTLE = null;

async function openSettle() {
  sheet('<h3 class="serif">정산</h3><p class="muted">불러오는 중…</p>');
  const d = await getJson('/api/hospital/settle?' + authQS());
  if (!d || !d.items) { sheet('<h3 class="serif">정산</h3><p class="muted">불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>'); return; }
  SETTLE = d;
  renderSettle();
}

function renderSettle() {
  const d = SETTLE;
  if (!d) return;
  const t = d.totals || {};
  const by = {};
  d.items.forEach(x => { (by[x.counselorId] = by[x.counselorId] || []).push(x); });
  const rows = Object.entries(by).map(([cid, list]) => {
    const due = list.reduce((a, x) => a + x.hospital, 0);
    const paid = list.reduce((a, x) => a + x.paidToCounselor, 0);
    return `
      <div class="card" style="margin-bottom:0.5rem;">
        <div class="row" style="gap:0.5rem;">
          ${avatar(list[0].counselor)}
          <div class="grow" style="min-width:0;">
            <strong style="font-size:0.92rem;">${esc(list[0].counselor)} 선생님</strong>
            <div class="muted">상담 ${list.length}건 · 병원 몫 ${won(due)}원 · 지급함 ${won(paid)}원</div>
          </div>
          ${paid >= due ? '<span class="chip ok">정산 완료</span>' : `<span class="chip gold">미지급 ${won(due - paid)}원</span>`}
        </div>
        ${list.map(x => `
          <div class="listrow">
            <div class="grow">
              <div class="muted">${fmtDT(x.at)} · ${esc(x.clientName || '내담자')} · ${esc(x.label)}</div>
              <div class="muted">상담료 ${won(x.gross)}원 → 병원 ${won(x.hospital)}원${x.appPaidAt ? ' · 앱에서 입금됨' : ' · 앱 입금 대기'}</div>
            </div>
            ${x.paidToCounselor ? `<span class="chip ok">${won(x.paidToCounselor)}원 지급</span>`
              : `<button class="btn sm" style="width:auto; margin:0;" data-act="pay" data-id="${esc(x.id)}" data-kind="${esc(x.kind)}" data-cid="${esc(x.counselorId)}" data-amt="${x.hospital}" data-nm="${esc(x.counselor)}">지급 기록</button>`}
          </div>`).join('')}
      </div>`;
  }).join('');
  sheet(`
    <h3 class="serif">정산</h3>
    <div class="card" style="margin-bottom:0.6rem;">
      <div class="stat">
        <div><span class="muted">상담료 합계</span><strong>${won(t.gross || 0)}원</strong></div>
        <div><span class="muted">병원 몫(90%)</span><strong>${won(t.hospital || 0)}원</strong></div>
        <div><span class="muted">앱에서 입금됨</span><strong>${won(t.received || 0)}원</strong></div>
        <div><span class="muted">상담사에게 지급</span><strong>${won(t.paidOut || 0)}원</strong></div>
      </div>
      <p class="muted" style="margin-top:0.5rem;">
        병원을 통해 등록한 내담자의 상담은 <b>병원 90% · 앱 7% · 결제 수수료 3%</b>로 나뉩니다.
        앱은 병원에만 입금하고, <b>상담사에게는 병원이 직접 지급</b>합니다. 지급하신 뒤 '지급 기록'을 눌러 남겨주세요.</p>
    </div>
    ${rows || '<div class="empty"><b>아직 정산할 상담이 없어요</b>병원 코드로 연결된 내담자가 상담을 받으면 여기에 쌓입니다.</div>'}`);
}

async function recordPayout(el) {
  const amt = prompt(`${el.dataset.nm} 선생님께 보낸 금액을 적어주세요 (원)`, el.dataset.amt);
  if (amt === null) return;
  const n = Math.max(0, Math.round(Number(String(amt).replace(/[^\d]/g, '')) || 0));
  if (!n) { toast('금액을 확인해주세요'); return; }
  const memo = prompt('메모 (선택) — 예: 9월분 계좌이체', '') || '';
  const r = await postJson('/api/hospital/payout', authBody({ refId: el.dataset.id, kind: el.dataset.kind, counselorId: el.dataset.cid, amount: n, memo }));
  if (!r || !r.ok) { toast('기록하지 못했어요'); return; }
  toast('지급 기록을 남겼어요');
  openSettle();
}

function openSettings() {
  const h = HOSP.hospital || {};
  sheet(`
    <h3 class="serif">${esc(h.name || '병원')}</h3>
    <p class="muted" style="margin-bottom:0.8rem;">${esc([h.dept, h.doctor ? h.doctor + ' 선생님' : ''].filter(Boolean).join(' · '))}<br>
      로그인 방식: <b>${HS ? '이메일 링크 (이 기기 30일)' : '병원 코드'}</b></p>
    <div class="card" style="margin-bottom:0.6rem;">
      <b style="font-size:0.88rem;">환자를 연결하려면</b>
      <p class="muted" style="margin-top:0.2rem;">진료실에서 환자에게 병원 코드를 알려주세요. 환자는 앱 → 마이 → <b>담당 병원 연결하기</b>에 코드와 이름을 넣습니다. 코드는 운영팀 콘솔에서 확인·재발급합니다.</p>
    </div>
    <div class="card" style="margin-bottom:0.6rem;">
      <b style="font-size:0.88rem;">정산</b>
      <p class="muted" style="margin-top:0.2rem;">병원을 통해 등록한 내담자의 상담은 병원 90% · 앱 7% · 결제 수수료 3%로 나뉩니다. 앱은 병원에 입금하고, 상담사에게는 병원이 직접 지급합니다. 위쪽 지폐 아이콘에서 확인하세요.</p>
    </div>
    <div class="card" style="margin-bottom:0.6rem;">
      <b style="font-size:0.88rem;">긴급 알림</b>
      <p class="muted" style="margin-top:0.2rem;">상담사가 회기 기록에 '긴급'을 표시하면 ${h.hasEmail ? '등록된 담당의 이메일로 즉시 메일이 갑니다.' : '<span style="color:var(--danger);">이메일이 등록돼 있지 않아 메일이 가지 않습니다.</span> 운영팀에 이메일 등록을 요청하세요.'}</p>
    </div>
    ${HS ? '<button class="btn ghost" data-act="logout-others" style="margin-bottom:0.5rem;">다른 기기 모두 로그아웃</button>' : ''}
    <button class="btn" data-act="logout">이 기기에서 로그아웃</button>`);
}

// ── 이벤트 ───────────────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'open') { HOSP.patient = el.dataset.id; HOSP.detail = null; history.pushState({ p: HOSP.patient }, ''); renderHosp(); loadPatient(); }
  else if (act === 'back') { if (history.state && history.state.p) history.back(); else { HOSP.patient = null; HOSP.detail = null; renderHosp(); } }
  else if (act === 'fb') openFeedbackSheet(el.dataset.note || '');
  else if (act === 'fb-send') sendFeedback(el);
  else if (act === 'refresh') { await loadHospital(); toast('새로고침했어요'); }
  else if (act === 'settings') openSettings();
  else if (act === 'settle') openSettle();
  else if (act === 'pay') recordPayout(el);
  else if (act === 'sheet-close') closeSheet();
  else if (act === 'logout') logout();
  else if (act === 'logout-others') { const r = await postJson('/api/hospital/auth/logout-others', { hsession: HS }); toast(r && r.ok ? '다른 기기를 모두 로그아웃했어요' : '처리하지 못했어요'); }
});
window.addEventListener('popstate', () => {
  if (HOSP.patient) { HOSP.patient = null; HOSP.detail = null; renderHosp(); }
});
document.addEventListener('input', e => {
  if (!e.target || e.target.id !== 'hosp-q') return;
  HOSP.q = e.target.value || '';
  const input = e.target;
  renderHosp();
  const again = $('hosp-q');
  if (again && again !== input) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
});
$('email-btn').addEventListener('click', requestLink);
$('email').addEventListener('keydown', e => { if (e.key === 'Enter') requestLink(); });
$('code-btn').addEventListener('click', () => loginWithCode());
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithCode(); });
$('to-code').addEventListener('click', () => { $('login-email').hidden = true; $('login-code').hidden = false; $('code').focus(); });
$('to-email').addEventListener('click', () => { $('login-code').hidden = true; $('login-email').hidden = false; $('email').focus(); });

// ── 시작 ─────────────────────────────────────────────────────────────
(async () => {
  const qs = new URLSearchParams(location.search);
  const t = qs.get('t');
  const c = qs.get('code');
  if (t) { if (await verifyLink(t)) return; }
  if (c) { history.replaceState(null, '', location.pathname); $('login-email').hidden = true; $('login-code').hidden = false; $('code').value = c; await loginWithCode(c); if (HOSP.hospital) return; }
  if (HS || HC) {
    const hd = await getJson('/api/hospital/me?' + authQS());
    if (hd && hd.ok) enter(hd.hospital);
    else { HS = ''; HC = ''; localStorage.removeItem('doc_session'); localStorage.removeItem('doc_code'); }
  }
})();

// 화면이 켜져 있으면 3분마다 조용히 새로고침 — 긴급 표시가 늦게 보이면 안 된다
setInterval(() => { if (HOSP.hospital && !document.hidden && !HOSP.patient) loadHospital(); }, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && HOSP.hospital) loadHospital(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
