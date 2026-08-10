// ============================================================================
//  우렁의사 운영자 콘솔 (ops)
//
//  왜 별도 앱인가:
//   운영 기능이 소비자 앱(js/admin.js) 안에 숨어 있었다. 그래서
//    · 모든 이용자에게 운영 코드가 함께 배포되고
//    · 화면이 480px 폭에 갇혀 표를 그릴 수 없었으며
//    · 소비자 앱을 고칠 때마다 운영 화면이 함께 깨졌다.
//   운영자는 PC로 본다. 그래서 이 앱은 데스크톱 우선이고,
//   좁은 화면(<768px)에서만 하단 탭바로 바뀐다.
//
//  서버는 하나도 새로 만들지 않는다 — 기존 /api/* 운영 엔드포인트를 그대로 쓴다.
//  (유일한 예외: 진단 로그 열람용 GET /api/admin/diag)
// ============================================================================

// /api 를 어디로 보낼지 — 같은 출처에 없으면 Cloudflare Worker 로.
//  정적 호스팅(로컬 http-server 포함)에는 /api 가 없다. 상담사 앱과 같은 규칙.
const API_BASE = 'https://cbt-proxy.hongcbt.workers.dev';

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

// ── 인증 ─────────────────────────────────────────────────────────────
//  ADMIN_CODE 는 Worker 시크릿이다. 앱에 넣지 않는다 — 운영자가 직접 입력하고
//  이 브라우저에만 둔다. 진짜 검증은 언제나 서버가 한다(틀리면 403).
//  sessionStorage 가 아니라 localStorage 인 이유: 운영자는 하루에도 몇 번씩
//  탭을 닫는다. 매번 시크릿을 찾아오게 만들면 결국 메모장에 적어둔다.
const CODE_KEY = 'ops_admin_code';
let CODE = localStorage.getItem(CODE_KEY) || '';

// 403 이 오면 그 코드는 더 이상 쓸모가 없다. 조용히 빈 화면을 보여주는 대신
//  즉시 로그인으로 돌려보낸다 (코드가 교체됐을 때 실제로 일어난다).
function badCode(msg) {
  CODE = '';
  try { localStorage.removeItem(CODE_KEY); } catch (e) {}
  stopDiagTimer();
  $('shell').hidden = true;
  $('tabbar').hidden = true;
  $('screen-login').hidden = false;
  const err = $('adm-err');
  err.textContent = msg || '코드가 더 이상 유효하지 않습니다. 다시 입력해주세요.';
  err.style.display = 'block';
  const inp = $('adm-code');
  inp.value = '';
  setTimeout(() => inp.focus(), 100);
}

async function adminGet(p) {
  const url = p + (p.includes('?') ? '&' : '?') + 'code=' + encodeURIComponent(CODE);
  try {
    const r = await api(url);
    if (r.status === 403) { badCode(); return null; }
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function adminPost(p, d) {
  try {
    const r = await api(p, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ code: CODE }, d || {}))
    });
    if (r.status === 403) { badCode(); return null; }
    return await r.json().catch(() => ({}));
  } catch (e) { return null; }
}

// ── 상태 ─────────────────────────────────────────────────────────────
let TAB = 'dash';
const D = {
  stats: undefined,      // undefined = 아직 안 받음, null = 실패
  apps: undefined,
  cs: undefined,
  settle: undefined,
  bookings: undefined,
  diag: undefined,
  maillog: undefined
};
const SHOWCODE = {};     // 상담사 id → 코드 보이기
const PICK = {};         // 정산 항목 id → 선택됨
let CSQ = '';            // 상담사 검색어
let DIAGQ = { stage: '', q: '' };
let DIAGAUTO = true;

// ── 잔손 ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
// 서버에서 온 문자열은 전부 이걸 통과한다. 이름·병원·반려사유·진단 메시지 모두
//  사람이 입력한 값이라 그대로 innerHTML 에 넣으면 스크립트가 된다.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => (Math.round(n || 0)).toLocaleString('ko-KR');

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2400);
}

const pad2 = n => String(n).padStart(2, '0');
function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtDT(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
// '3분 전' — 진단 로그는 절대 시각보다 '방금인가'가 먼저 궁금하다
function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + '초 전';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  return Math.floor(s / 86400) + '일 전';
}
const avaColor = name => 'c' + (String(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 6);
const initial = name => esc(String(name || '?').trim().slice(0, 1) || '?');

// 상담사 앱 주소 — 승인 안내문에 넣는다. 규칙은 여기 한 곳에만 둔다.
function proAppUrl() {
  if (/neurumind\.com$/i.test(location.hostname)) return 'https://pro.neurumind.com';
  return location.origin + location.pathname.replace(/ops\/.*$/, '') + 'pro/index.html';
}

function copy(text, okMsg) {
  try {
    navigator.clipboard.writeText(text)
      .then(() => toast(okMsg || '복사했어요'))
      .catch(() => toast('복사하지 못했어요 — 직접 선택해 복사해주세요'));
  } catch (e) { toast('복사하지 못했어요'); }
}

// 눌린 순간을 보여준다. 아무 반응이 없으면 사람은 한 번 더 누른다(= 이중 처리).
async function busy(btn, label, fn) {
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try { return await fn(); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
}

// ── 확인·입력 창 ─────────────────────────────────────────────────────
//  소비자 앱의 window.UI 는 여기 없다. 되돌릴 수 없는 일(삭제·지급)이 많아서
//  브라우저 기본 confirm 대신 본문을 길게 보여줄 수 있는 창을 직접 만든다.
let modalResolve = null;
function closeModal(v) {
  const m = $('modal');
  if (m.hidden) return;
  m.hidden = true;
  $('modal-box').innerHTML = '';
  const r = modalResolve; modalResolve = null;
  if (r) r(v);
}

function modal(o) {
  closeModal(null);
  return new Promise(resolve => {
    modalResolve = resolve;
    const hasInput = !!o.input;
    const box = $('modal-box');
    box.innerHTML = `
      <h3>${esc(o.title || '')}</h3>
      ${o.body ? `<div class="body">${esc(o.body)}</div>` : ''}
      ${hasInput ? `<input id="modal-input" type="${esc(o.input.type || 'text')}"
           placeholder="${esc(o.input.placeholder || '')}" value="${esc(o.input.value || '')}"
           style="margin-top: 0.8rem;" autocomplete="off">` : ''}
      <div class="acts">
        ${o.cancel === false ? '' : `<button class="btn ghost" data-act="modal-cancel">${esc(o.cancelLabel || '취소')}</button>`}
        <button class="btn ${o.danger ? 'danger' : ''}" data-act="modal-ok">${esc(o.okLabel || '확인')}</button>
      </div>`;
    $('modal').hidden = false;
    const inp = $('modal-input');
    if (inp) {
      setTimeout(() => { inp.focus(); inp.select(); }, 60);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') closeModal(inp.value); });
    }
  });
}
const alertBox = (title, body) => modal({ title, body, cancel: false, okLabel: '닫기' });
// 입력칸이 없는 창은 확인 시 true, 취소 시 null 을 준다
const confirmBox = o => modal(o).then(v => v === true);
// 입력칸이 있는 창은 확인 시 입력값(빈 문자열 포함), 취소 시 null 을 준다
const promptBox = o => modal(Object.assign({}, o, {
  input: { value: o.value || '', placeholder: o.placeholder || '', type: o.type || 'text' }
}));

// ── 로그인 ───────────────────────────────────────────────────────────
async function tryLogin(v) {
  const err = $('adm-err');
  err.style.display = 'none';
  if (!v || v.length < 4) { err.textContent = '코드를 입력해주세요.'; err.style.display = 'block'; return; }
  const btn = $('adm-go');
  await busy(btn, '확인 중…', async () => {
    let r = null;
    try {
      const res = await api('/api/stats?code=' + encodeURIComponent(v));
      if (res.status === 403) {
        err.textContent = '코드가 올바르지 않습니다.'; err.style.display = 'block'; return;
      }
      if (!res.ok) {
        err.textContent = '서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'; err.style.display = 'block'; return;
      }
      r = await res.json();
    } catch (e) {
      err.textContent = '서버에 연결하지 못했어요.'; err.style.display = 'block'; return;
    }
    CODE = v;
    try { localStorage.setItem(CODE_KEY, v); } catch (e) {}
    D.stats = r;              // 방금 받은 걸 그대로 쓴다 — 또 부르면 그만큼 늦게 뜬다
    enterApp();
  });
}

function enterApp() {
  $('screen-login').hidden = true;
  $('shell').hidden = false;
  $('tabbar').hidden = false;   // 좁은 화면에서만 CSS 가 실제로 보여준다
  go(TAB || 'dash');
  loadAll();
}

// ── 내비게이션 ───────────────────────────────────────────────────────
const TITLES = {
  dash: ['대시보드', '서버 집계 · 실시간'],
  apply: ['입점 심사', '상담사 신청서 승인 · 반려'],
  counselors: ['상담사 관리', '코드 발급 · 정지 · 삭제'],
  settle: ['정산', '확인 완료된 상담의 지급 처리'],
  diag: ['진단 로그', '실기기 통화 단계 추적'],
  settings: ['설정', '접속 · 메일 · 기록 정리']
};

function go(tab) {
  TAB = tab;
  document.querySelectorAll('.navbtn, .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + tab));
  const t = TITLES[tab] || ['', ''];
  $('view-title').textContent = t[0];
  $('view-sub').textContent = t[1];
  window.scrollTo(0, 0);
  if (tab === 'diag') { if (D.diag === undefined) loadDiag(); startDiagTimer(); }
  else stopDiagTimer();
  if (tab === 'settings' && D.maillog === undefined) loadMaillog();
  render();
}

// ── 불러오기 ─────────────────────────────────────────────────────────
async function loadAll() {
  render();   // 먼저 뼈대를 그린다 — 빈 화면보다 '불러오는 중'이 낫다
  const [stats, apps, cs, settle, bookings] = await Promise.all([
    D.stats ? Promise.resolve(D.stats) : adminGet('/api/stats'),
    adminGet('/api/apply'),
    adminGet('/api/admin/counselors'),
    adminGet('/api/settle'),
    adminGet('/api/bookings')
  ]);
  D.stats = stats || null;
  D.apps = apps ? (apps.items || []) : null;
  D.cs = cs ? (cs.items || []) : null;
  D.settle = settle ? (settle.items || []) : null;
  D.bookings = bookings ? (bookings.items || []) : null;
  render();
  if (TAB === 'diag') loadDiag();
}

async function loadCounselors() {
  const [cs, apps] = await Promise.all([adminGet('/api/admin/counselors'), adminGet('/api/apply')]);
  D.cs = cs ? (cs.items || []) : null;
  D.apps = apps ? (apps.items || []) : null;
  render();
}

async function loadSettle() {
  const [settle, bookings] = await Promise.all([adminGet('/api/settle'), adminGet('/api/bookings')]);
  D.settle = settle ? (settle.items || []) : null;
  D.bookings = bookings ? (bookings.items || []) : null;
  render();
}

async function loadDiag() {
  const r = await adminGet('/api/admin/diag?limit=200');
  D.diag = r ? (r.items || []) : null;
  if (r && r.error) D.diagError = r.error;
  if (TAB === 'diag') render();
}

async function loadMaillog() {
  const r = await adminGet('/api/maillog');
  D.maillog = r ? (r.items || []) : null;
  if (TAB === 'settings') render();
}

// 진단 화면은 통화 사고를 '지금' 보는 화면이다. 눈을 떼도 갱신돼야 한다.
let diagTimer = null;
function startDiagTimer() {
  stopDiagTimer();
  diagTimer = setInterval(() => {
    if (DIAGAUTO && TAB === 'diag' && !document.hidden) loadDiag();
  }, 30000);
}
function stopDiagTimer() { if (diagTimer) { clearInterval(diagTimer); diagTimer = null; } }

// ── 그리기 ───────────────────────────────────────────────────────────
function render() {
  const pending = (D.apps || []).filter(a => a.status === 'pending').length;
  badge('n-apply', pending); badge('t-apply', pending);
  const st = (D.settle || []).length;
  badge('n-settle', st); badge('t-settle', st);

  if (TAB === 'dash') $('view-dash').innerHTML = viewDash();
  else if (TAB === 'apply') $('view-apply').innerHTML = viewApply();
  else if (TAB === 'counselors') $('view-counselors').innerHTML = viewCounselors();
  else if (TAB === 'settle') $('view-settle').innerHTML = viewSettle();
  else if (TAB === 'diag') $('view-diag').innerHTML = viewDiag();
  else if (TAB === 'settings') $('view-settings').innerHTML = viewSettings();

  // 검색·필터 칸은 다시 그리면 포커스를 잃는다 — 값만 되돌려 놓는다
  const q = $('cs-q'); if (q) { q.value = CSQ; }
  const dq = $('diag-q'); if (dq) { dq.value = DIAGQ.q; }
}
function badge(id, n) {
  const el = $(id); if (!el) return;
  el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n);
}

const loading = '<div class="empty">불러오는 중…</div>';
const failed = '<div class="empty"><b>서버에 연결하지 못했어요</b>새로고침을 눌러 다시 시도해주세요.</div>';

// ── ① 대시보드 ───────────────────────────────────────────────────────
function viewDash() {
  if (D.stats === undefined) return loading;
  if (!D.stats) return failed;
  const d = D.stats;
  const rev = d.revenue || { gross: 0, split: { counselor: 70, hospital: 10, pg: 3, platform: 17 } };
  const sp = rev.split || { counselor: 70, hospital: 10, pg: 3, platform: 17 };
  const pending = (D.apps || []).filter(a => a.status === 'pending').length;
  const settleN = (D.settle || []).length;
  const settleSum = (D.settle || []).reduce((a, x) => a + ((x.payout && x.payout.counselor) || 0), 0);

  const tile = (lb, v, sb, hi) => `
    <div class="stat${hi ? ' hi' : ''}">
      <div class="lb">${esc(lb)}</div>
      <b>${v}</b>
      ${sb ? `<div class="sb">${sb}</div>` : ''}
    </div>`;

  // 진단 요약 — 최근 24시간 실패. '통화가 지금 깨지고 있는가'가 대시보드의 첫 질문이다.
  const fails = (D.diag || []).filter(x => /fail/.test(x.stage || '') && Date.now() - x.ts < 86400000).length;

  return `
    ${d.mailReady === false ? `
    <div class="card" style="border-color: rgba(201,162,39,0.4); background: rgba(201,162,39,0.08);">
      <div class="row"><span class="chip gold">확인 필요</span>
        <b style="font-size: 0.88rem;">메일 발송이 설정되지 않았습니다</b></div>
      <p class="muted" style="margin-top: 0.35rem;">
        RESEND_API_KEY · MAIL_FROM 이 없어 승인 코드와 로그인 링크가 나가지 않습니다.
        ${d.counselorsWithoutEmail ? `이메일 미등록 상담사 <b>${d.counselorsWithoutEmail}명</b>.` : ''}
        그전까지는 [상담사 관리]의 안내문을 복사해 직접 전달하세요.</p>
    </div>` : ''}

    <div class="sec-title">전체 현황<span class="right muted">서버 집계</span></div>
    <div class="stats">
      ${tile('누적 이용자', won(d.uniqueClients), '서버에 기록을 남긴 기기 수')}
      ${tile('입점 상담사', won(d.counselors), d.counselorsWithoutEmail ? `이메일 미등록 ${d.counselorsWithoutEmail}` : '전원 이메일 등록됨')}
      ${tile('예약', won(d.bookings.total), `예정 ${won(d.bookings.upcoming)} · 완료 ${won(d.bookings.done)} · 취소 ${won(d.bookings.cancelled)}`)}
      ${tile('채팅 스레드', won(d.chat.threads), `답장 대기 ${won(d.chat.awaiting)}`)}
      ${tile('상담 자료', won(d.inbox.total), `안 읽음 ${won(d.inbox.unread)}`)}
      ${tile('후기', won(d.reviews ? d.reviews.count : 0), d.reviews ? `평균 ${d.reviews.avg}점` : '')}
      ${tile('심사 대기', won(pending), pending ? '눌러서 심사하기' : '대기 없음', pending > 0)}
      ${tile('지급 대기', won(settleN), settleN ? `상담사 몫 ${won(settleSum)}캐시` : '없음', settleN > 0)}
    </div>

    <div class="sec-title">수익 구조<span class="right muted">완료 상담 기준</span></div>
    <div class="card">
      <div class="row wrap">
        <div class="grow">
          <div class="muted">총 결제(완료 상담)</div>
          <b style="font-size: 1.5rem;">${won(rev.gross)}<span class="u" style="font-size:0.7rem;">캐시</span></b>
        </div>
        <div style="text-align: right;">
          <div class="muted">플랫폼 몫 ${sp.platform}%</div>
          <b style="font-size: 1.5rem; color: var(--accent);">${won(rev.platform)}</b>
        </div>
      </div>
      <div class="splitbar">
        <i style="width:${sp.counselor}%; background:#4f8a6b;"></i>
        <i style="width:${sp.hospital}%; background:#8fb8a0;"></i>
        <i style="width:${sp.pg}%; background:#d9cbb4;"></i>
        <i style="width:${sp.platform}%; background:#b98a1a;"></i>
      </div>
      <div class="splitlegend">
        <span><i style="background:#4f8a6b;"></i>상담사 ${sp.counselor}% · <b>${won(rev.counselor)}</b></span>
        <span><i style="background:#8fb8a0;"></i>기관 ${sp.hospital}% · <b>${won(rev.hospital)}</b></span>
        <span><i style="background:#d9cbb4;"></i>PG ${sp.pg}% · <b>${won(rev.pg)}</b></span>
        <span><i style="background:#b98a1a;"></i>플랫폼 ${sp.platform}% · <b>${won(rev.platform)}</b></span>
      </div>
      <p class="muted" style="margin-top: 0.7rem; border-top: 1px dashed var(--line); padding-top: 0.6rem;">
        <b>바로상담(캐시·30초당)</b> — 요금 = 예약 상담료 ÷60 × 1.25 (즉시성 프리미엄). 배분율은 예약 상담과 같습니다.<br>
        <b>AI 구독·캐시(인앱결제)</b> — 구글 수수료 15% 선차감 후 순액 기준. 구독 9,900원 → 순입금 8,415원(전액 플랫폼, API 원가 차감).</p>
    </div>

    <div class="sec-title">바로 할 일</div>
    <div class="card">
      <div class="listrow">
        <div class="grow"><b style="font-size:0.9rem;">입점 심사</b>
          <div class="muted">${pending ? `${pending}건이 기다리고 있어요` : '대기 중인 신청이 없습니다'}</div></div>
        <button class="btn ${pending ? '' : 'ghost'} sm" data-act="goto" data-tab="apply">심사하기</button>
      </div>
      <div class="listrow">
        <div class="grow"><b style="font-size:0.9rem;">정산 지급</b>
          <div class="muted">${settleN ? `${settleN}건 · 상담사 몫 ${won(settleSum)}캐시` : '지급할 건이 없습니다'}</div></div>
        <button class="btn ${settleN ? '' : 'ghost'} sm" data-act="goto" data-tab="settle">정산 열기</button>
      </div>
      <div class="listrow">
        <div class="grow"><b style="font-size:0.9rem;">통화 진단</b>
          <div class="muted">${D.diag === undefined ? '아직 불러오지 않음' : (fails ? `최근 24시간 실패 ${fails}건` : '최근 24시간 실패 없음')}</div></div>
        <button class="btn ${fails ? 'warnline' : 'ghost'} sm" data-act="goto" data-tab="diag">로그 보기</button>
      </div>
    </div>
    <p class="muted" style="margin-top: 0.6rem;">
      ※ 가입자·구독자 정확 집계는 회원 서버 구축 후 가능합니다 — 지금은 서버에 기록을 남긴 기기 수를 이용자 수로 셉니다.</p>`;
}

// ── ② 입점 심사 ──────────────────────────────────────────────────────
function viewApply() {
  if (D.apps === undefined) return loading;
  if (!D.apps) return failed;
  const pending = D.apps.filter(a => a.status === 'pending');
  const done = D.apps.filter(a => a.status !== 'pending');

  const card = a => `
    <div class="card" style="border-color: rgba(245,199,78,0.5);">
      <div class="row">
        <div class="pav ${avaColor(a.name)}">${a.photo ? `<img src="${esc(a.photo)}" alt="">` : initial(a.name)}</div>
        <div class="grow">
          <b style="font-size: 0.95rem;">${esc(a.name)}</b>
          <div class="muted">${esc(a.license || '자격 미기재')}${a.career ? ' · 경력 ' + esc(a.career) + '년' : ''}</div>
        </div>
        <span class="chip gold">심사 대기</span>
      </div>
      <dl class="kv">
        <dt>소속</dt><dd>${esc(a.hospital || '(미기재)')}</dd>
        <dt>주소</dt><dd>${esc(a.addr || '(미입력)')}</dd>
        <dt>연락처</dt><dd>${esc(a.tel || '(미입력)')}</dd>
        <dt>이메일</dt><dd>${a.email
          ? `<b style="color: var(--accent);">${esc(a.email)}</b>`
          : '<b style="color: var(--danger);">없음 — 승인해도 코드를 자동 발송할 수 없어요</b>'}</dd>
        <dt>상담료</dt><dd>30분 ${won(a.price)}원</dd>
        <dt>정산 계좌</dt><dd>${a.bank
          ? `${esc(a.bank.bank)} ${esc(a.bank.masked)} · 예금주 ${esc(a.bank.holder)}`
          : '<b style="color: var(--danger);">미등록</b>'}</dd>
        <dt>전문 분야</dt><dd>${(a.tags || []).length ? (a.tags || []).map(t => `<span class="chip off" style="margin-right:0.2rem;">${esc(t)}</span>`).join('') : '(없음)'}</dd>
        <dt>신청일</dt><dd>${fmtDT(a.ts)}</dd>
      </dl>
      ${a.intro ? `<p class="muted" style="margin-top: 0.6rem; border-top: 1px dashed var(--line); padding-top: 0.5rem; white-space: pre-wrap;">${esc(a.intro)}</p>` : ''}
      <div class="row" style="margin-top: 0.8rem; gap: 0.45rem;">
        <button class="btn" style="flex: 1;" data-act="approve" data-id="${esc(a.id)}">승인하고 코드 발급</button>
        <button class="btn warnline sm" data-act="reject" data-id="${esc(a.id)}">반려</button>
      </div>
    </div>`;

  const doneRow = a => `
    <div class="listrow">
      <div class="pav ${avaColor(a.name)}" style="width:32px;height:32px;font-size:0.8rem;">${initial(a.name)}</div>
      <div class="grow">
        <b style="font-size: 0.86rem;">${esc(a.name)}</b>
        <span class="muted"> · ${esc(a.hospital || '')}</span>
        ${a.rejectWhy ? `<div class="muted">사유: ${esc(a.rejectWhy)}</div>` : ''}
        <div class="muted">${fmtDT(a.decidedAt || a.ts)}${a.counselorId ? ' · ' + esc(a.counselorId) : ''}</div>
      </div>
      <span class="chip ${a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'bad' : 'off'}">
        ${a.status === 'approved' ? '승인됨' : a.status === 'rejected' ? '반려됨' : '노출 중단'}</span>
    </div>`;

  return `
    <div class="sec-title">심사 대기<span class="right muted">${pending.length}건</span></div>
    ${pending.length ? pending.map(card).join('')
      : '<div class="card"><div class="empty"><b>대기 중인 신청이 없어요</b>새 입점 신청이 들어오면 여기에 쌓입니다.</div></div>'}

    <div class="sec-title">처리된 신청<span class="right muted">${done.length}건</span></div>
    <div class="card">
      ${done.length ? done.slice(0, 50).map(doneRow).join('')
        : '<div class="empty">처리 기록이 없습니다.</div>'}
    </div>`;
}

// ── ③ 상담사 관리 ────────────────────────────────────────────────────
function viewCounselors() {
  if (D.cs === undefined) return loading;
  if (!D.cs) return failed;
  const q = CSQ.trim().toLowerCase();
  const list = q
    ? D.cs.filter(c => (c.name + ' ' + (c.hospital || '') + ' ' + (c.email || '') + ' ' + c.id).toLowerCase().includes(q))
    : D.cs;
  const now = Date.now();

  const row = c => {
    const on = !!c.active;
    const busyNow = (c.busy_until || 0) > now;
    const shown = !!SHOWCODE[c.id];
    return `
    <div class="card" ${on ? '' : 'style="opacity: 0.72; border-color: rgba(207,107,96,0.35);"'}>
      <div class="row wrap">
        <div class="pav ${avaColor(c.name)}">${initial(c.name)}</div>
        <div class="grow">
          <b style="font-size: 0.95rem;">${esc(c.name)}</b>
          <span class="muted"> ${esc(c.hospital || '')}</span>
          <div class="muted mono">${esc(c.id)} · 등록 ${fmtDate(c.created)}</div>
        </div>
        ${!on ? '<span class="chip bad">정지됨</span>'
          : busyNow ? '<span class="chip new">통화 중</span>'
          : c.available ? '<span class="chip ok">수신 중</span>' : '<span class="chip off">부재중</span>'}
      </div>

      <div class="row" style="margin-top: 0.6rem;">
        <span class="grow ell muted" style="${c.email ? '' : 'color: var(--gold);'}">
          ${c.email ? esc(c.email) : '이메일 미등록 — 코드로만 접속 가능'}</span>
        <button class="btn ghost sm" data-act="email" data-id="${esc(c.id)}">${c.email ? '이메일 변경' : '이메일 등록'}</button>
      </div>

      <div class="row" style="margin-top: 0.45rem;">
        <code class="codebox">${shown ? esc(c.code) : '•••••-•••••-•••••-•••••'}</code>
        <button class="btn ghost sm" data-act="peek" data-id="${esc(c.id)}">${shown ? '가리기' : '코드 보기'}</button>
        ${shown ? `<button class="btn soft sm" data-act="copycode" data-id="${esc(c.id)}">복사</button>` : ''}
      </div>

      <div class="row wrap" style="margin-top: 0.7rem; gap: 0.35rem;">
        <button class="btn soft sm" data-act="share" data-id="${esc(c.id)}">안내문</button>
        <button class="btn ghost sm" data-act="rotate" data-id="${esc(c.id)}">코드 재발급</button>
        <button class="btn ghost sm" data-act="toggle" data-id="${esc(c.id)}" data-on="${on ? '0' : '1'}"
          style="${on ? 'color: var(--danger);' : 'color: var(--accent);'}">${on ? '정지' : '정지 해제'}</button>
        <span class="grow"></span>
        <button class="btn warnline sm" data-act="del" data-id="${esc(c.id)}">삭제</button>
      </div>
    </div>`;
  };

  const off = D.cs.filter(c => !c.active).length;
  const noMail = D.cs.filter(c => !c.email).length;

  return `
    <div class="sec-title">등록된 상담사
      <span class="right muted">전체 ${D.cs.length}명 · 정지 ${off}명 · 이메일 미등록 ${noMail}명</span></div>
    <div class="row" style="margin-bottom: 0.7rem;">
      <input id="cs-q" type="text" placeholder="이름 · 병원 · 이메일 · ID 로 찾기" autocomplete="off">
    </div>
    ${list.length ? list.map(row).join('')
      : `<div class="card"><div class="empty"><b>${q ? '검색 결과가 없어요' : '등록된 상담사가 없어요'}</b>${q ? '다른 말로 찾아보세요.' : '입점 심사에서 승인하면 여기에 나타납니다.'}</div></div>`}

    <div class="sec-title">상담사 직접 등록</div>
    <div class="card">
      <p class="muted" style="margin-bottom: 0.7rem;">
        오프라인으로 모신 분처럼 앱에서 신청하지 않은 경우입니다. 심사 없이 바로 등록되고,
        이메일을 넣으면 코드가 그 주소로 발송됩니다. (상담료·소개글 등 나머지 정보는 상담사가 프로 앱에서 채웁니다.)</p>
      <div class="row wrap" style="gap: 0.5rem;">
        <input id="new-id" type="text" placeholder="ID (영문·숫자, 예: c250811)" style="flex: 1 1 180px; width: auto;" autocomplete="off">
        <input id="new-name" type="text" placeholder="이름" style="flex: 1 1 140px; width: auto;" autocomplete="off">
      </div>
      <div class="row wrap" style="gap: 0.5rem; margin-top: 0.5rem;">
        <input id="new-hospital" type="text" placeholder="소속 병원·기관" style="flex: 1 1 180px; width: auto;" autocomplete="off">
        <input id="new-email" type="email" placeholder="이메일 (선택)" style="flex: 1 1 180px; width: auto;" autocomplete="off">
      </div>
      <button class="btn" style="margin-top: 0.7rem;" data-act="add-cs">＋ 등록하고 코드 발급</button>
    </div>`;
}

// ── ④ 정산 ───────────────────────────────────────────────────────────
function viewSettle() {
  if (D.settle === undefined) return loading;
  if (!D.settle) return failed;

  const picked = D.settle.filter(x => PICK[x.id]);
  const pickSum = picked.reduce((a, x) => a + x.payout.counselor, 0);
  const total = D.settle.reduce((a, x) => a + x.payout.counselor, 0);

  // 이체는 사람 단위로 한다 — 그래서 상담사별로 묶는다
  const by = {};
  D.settle.forEach(x => { (by[x.counselorId] = by[x.counselorId] || []).push(x); });

  const group = ([cid, rows]) => {
    const c = rows[0];
    const sum = rows.reduce((a, x) => a + x.payout.counselor, 0);
    return `
    <div class="card">
      <div class="row wrap">
        <div class="pav ${avaColor(c.counselor)}">${initial(c.counselor)}</div>
        <div class="grow">
          <b style="font-size: 0.95rem;">${esc(c.counselor || '(이름 없음)')}</b>
          <div class="muted mono">${esc(cid)}</div>
        </div>
        <b style="color: var(--accent); font-size: 1rem;">${won(sum)}캐시</b>
      </div>
      <p class="muted" style="margin: 0.4rem 0 0.3rem; ${c.bank ? '' : 'color: var(--danger);'}">
        ${c.bank ? `${esc(c.bank.bank)} ${esc(c.bank.masked)} · 예금주 ${esc(c.bank.holder)}`
                 : '계좌 미등록 — 상담사에게 등록을 요청하세요'}</p>
      ${rows.map(x => `
        <label class="payrow">
          <input type="checkbox" data-act="pick" data-id="${esc(x.id)}" ${PICK[x.id] ? 'checked' : ''}>
          <span class="grow muted" style="color: var(--text);">
            ${esc(x.clientName || '내담자')} · ${esc(x.time || '')}
            ${x.auto ? '<span class="chip off" style="margin-left:0.3rem;">자동 확정</span>' : ''}
          </span>
          <span class="muted">결제 ${won(x.price)}</span>
          <b style="min-width: 74px; text-align: right;">${won(x.payout.counselor)}</b>
        </label>`).join('')}
      <div class="row" style="margin-top: 0.4rem;">
        <button class="btn ghost sm" data-act="pick-group" data-cid="${esc(cid)}">이 상담사 전체 선택</button>
      </div>
    </div>`;
  };

  // 지급 내역 — /settle 은 '미지급'만 준다. 이미 보낸 건은 예약 장부에서 본다.
  const paid = (D.bookings || []).filter(b => b.settledAt > 0)
    .sort((a, b) => b.settledAt - a.settledAt).slice(0, 40);

  return `
    <div class="sec-title">지급 대기
      <span class="right muted">${D.settle.length}건 · 상담사 몫 합계 ${won(total)}캐시</span></div>
    <p class="muted" style="margin-bottom: 0.7rem;">
      상담사가 완료 처리하고 내담자가 확인한(또는 3일이 지나 자동 확정된) 상담만 올라옵니다.</p>
    ${D.settle.length ? Object.entries(by).map(group).join('')
      : '<div class="card"><div class="empty"><b>지급할 건이 없어요</b>완료·확인된 상담이 생기면 여기에 쌓입니다.</div></div>'}

    ${D.settle.length ? `
    <div class="paybar">
      <button class="btn ghost sm" data-act="pick-all" data-on="1">전체 선택</button>
      <button class="btn ghost sm" data-act="pick-all" data-on="0">해제</button>
      <span class="grow"></span>
      <span class="muted">선택 ${picked.length}건 · <b style="color: var(--accent);">${won(pickSum)}캐시</b></span>
      <button class="btn sm" data-act="pay" ${picked.length ? '' : 'disabled'}>선택한 ${picked.length}건 지급 완료로 표시</button>
    </div>
    <p class="muted" style="margin-top: 0.5rem;">
      실제 이체는 은행에서 따로 하세요. 여기서는 '보냈다'는 기록만 남습니다. 되돌릴 수 없습니다.</p>` : ''}

    <div class="sec-title">지급 내역<span class="right muted">최근 ${paid.length}건</span></div>
    <div class="card pad0">
      ${paid.length ? `
      <div class="tblwrap" style="border: none; box-shadow: none;">
        <table class="tbl">
          <thead><tr><th>지급일</th><th>상담사</th><th>내담자</th><th>상담 시각</th><th style="text-align:right;">결제</th><th style="text-align:right;">상담사 몫</th></tr></thead>
          <tbody>
            ${paid.map(b => `<tr>
              <td class="t">${fmtDT(b.settledAt)}</td>
              <td>${esc(b.name || b.counselorId)}</td>
              <td>${esc(b.clientName || '')}</td>
              <td class="t">${esc(b.time || '')}</td>
              <td style="text-align:right;">${won(b.price)}</td>
              <td style="text-align:right;"><b>${won(b.payout ? b.payout.counselor : 0)}</b></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<div class="empty">아직 지급 처리한 내역이 없습니다.</div>'}
    </div>`;
}

// ── ⑤ 진단 로그 ──────────────────────────────────────────────────────
//  통화가 실기기에서 어느 단계에 죽는지 보는 화면. 표가 읽기 좋아야 한다.
function stageClass(st) {
  const s = String(st || '');
  if (/fail|error|deny|denied|timeout/.test(s)) return 'fail';
  if (/connected|ok$|-ok/.test(s)) return 'good';
  if (/unstable|restart|retry|disconnect/.test(s)) return 'warn';
  return '';
}

function viewDiag() {
  const head = () => {
    const stages = Array.from(new Set((D.diag || []).map(x => x.stage))).sort();
    return `
    <div class="filters">
      <select id="diag-stage" data-act="diag-stage">
        <option value="">모든 단계</option>
        <option value="__fail__"${DIAGQ.stage === '__fail__' ? ' selected' : ''}>실패한 단계만</option>
        ${stages.map(s => `<option value="${esc(s)}"${DIAGQ.stage === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
      <input id="diag-q" type="text" placeholder="who · build · 메시지 검색" autocomplete="off">
      <button class="btn ghost sm" data-act="diag-fails">실패만 보기</button>
      <button class="btn ghost sm" data-act="diag-clearf">필터 해제</button>
      <span class="grow"></span>
      <label class="muted" style="display:flex; align-items:center; gap:0.35rem; cursor:pointer;">
        <input type="checkbox" data-act="diag-auto" ${DIAGAUTO ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
        30초마다 자동 새로고침</label>
      <button class="btn soft sm" data-act="diag-now">지금 새로고침</button>
    </div>`;
  };

  if (D.diag === undefined) return head() + loading;
  if (!D.diag) return head() + `
    <div class="card"><div class="empty">
      <b>진단 로그를 불러오지 못했어요</b>
      워커에 <code>GET /api/admin/diag</code> 가 배포되어 있는지 확인해주세요.<br>
      (아직 배포 전이면 기록은 쌓이고 있으니 배포 후 바로 보입니다.)
    </div></div>`;

  const q = DIAGQ.q.trim().toLowerCase();
  let rows = D.diag;
  if (DIAGQ.stage === '__fail__') rows = rows.filter(x => stageClass(x.stage) === 'fail');
  else if (DIAGQ.stage) rows = rows.filter(x => x.stage === DIAGQ.stage);
  if (q) rows = rows.filter(x => ((x.who || '') + ' ' + (x.build || '') + ' ' + (x.msg || '') + ' ' + (x.app || '')).toLowerCase().includes(q));

  const fails = D.diag.filter(x => stageClass(x.stage) === 'fail').length;

  return head() + `
    <p class="muted" style="margin-bottom: 0.55rem;">
      최근 ${D.diag.length}건 중 ${rows.length}건 표시 · 실패 ${fails}건
      ${D.diag.length ? ` · 마지막 기록 ${ago(D.diag[0].ts)}` : ''}
      · 7일이 지난 기록은 서버가 지웁니다.</p>
    <div class="tblwrap">
      <table class="tbl">
        <thead><tr>
          <th style="width: 128px;">시각</th><th style="width: 62px;">앱</th>
          <th style="width: 108px;">누구</th><th style="width: 78px;">빌드</th>
          <th style="width: 150px;">단계</th><th>메시지</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map(x => `
            <tr>
              <td class="t" title="${esc(new Date(x.ts).toLocaleString('ko-KR'))}">${fmtDT(x.ts)}<div class="muted" style="font-size:0.66rem;">${ago(x.ts)}</div></td>
              <td class="muted">${esc(x.app || '')}</td>
              <td class="mono muted ell" style="max-width: 110px;">${esc(x.who || '')}</td>
              <td class="mono muted">${esc(x.build || '')}</td>
              <td><span class="stg ${stageClass(x.stage)}">${esc(x.stage || '')}</span></td>
              <td class="msg">${esc(x.msg || '')}</td>
            </tr>`).join('')
            : '<tr><td colspan="6"><div class="empty">조건에 맞는 기록이 없습니다.</div></td></tr>'}
        </tbody>
      </table>
    </div>`;
}

// ── ⑥ 설정 ───────────────────────────────────────────────────────────
function viewSettings() {
  const masked = CODE ? CODE.slice(0, 2) + '•'.repeat(Math.max(4, CODE.length - 4)) + CODE.slice(-2) : '';
  const ml = D.maillog;
  const fails = (ml || []).filter(x => !x.ok).length;

  return `
    <div class="sec-title">접속</div>
    <div class="card">
      <div class="row wrap">
        <div class="grow">
          <b style="font-size: 0.9rem;">운영자 코드</b>
          <div class="muted mono">${esc(masked)} · 이 브라우저에만 저장됨</div>
        </div>
        <button class="btn ghost sm" data-act="recode">코드 다시 입력</button>
        <button class="btn warnline sm" data-act="logout">잠그기(로그아웃)</button>
      </div>
      <p class="muted" style="margin-top: 0.6rem; border-top: 1px dashed var(--line); padding-top: 0.6rem;">
        API 서버: <code>${esc(sameOrigin ? location.origin + '/api' : API_BASE + '/api')}</code><br>
        코드가 샜다고 생각되면 Worker 시크릿 <code>ADMIN_CODE</code> 를 즉시 교체하세요. 교체하면 이 화면도 자동으로 잠깁니다.</p>
    </div>

    <div class="sec-title">메일 발송
      <span class="right muted">${D.stats ? (D.stats.mailReady === false ? '미설정' : '설정됨') : ''}</span></div>
    <div class="card">
      ${D.stats && D.stats.mailReady === false ? `
      <p class="muted" style="color: var(--gold);">RESEND_API_KEY · MAIL_FROM 이 없어 승인 코드·로그인 링크가 나가지 않습니다.</p>`
        : '<p class="muted">발송 키가 설정되어 있습니다. 아래는 최근 발송 기록입니다.</p>'}
      ${ml === undefined ? '<div class="empty">불러오는 중…</div>'
        : !ml ? '<div class="empty">메일 기록을 불러오지 못했어요.</div>'
        : ml.length ? `
        <div class="tblwrap" style="margin-top: 0.6rem;">
          <table class="tbl" style="min-width: 480px;">
            <thead><tr><th style="width:128px;">시각</th><th>받는 사람</th><th style="width:80px;">결과</th><th>사유</th></tr></thead>
            <tbody>${ml.map(x => `<tr>
              <td class="t">${fmtDT(x.ts)}</td>
              <td class="ell" style="max-width: 200px;">${esc(x.addr)}</td>
              <td>${x.ok ? '<span class="chip ok">성공</span>' : '<span class="chip bad">실패</span>'}</td>
              <td class="msg">${esc(x.reason || '')}${x.detail ? ' — ' + esc(x.detail) : ''}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        ${fails ? `<p class="muted" style="margin-top: 0.5rem; color: var(--danger);">실패 ${fails}건 — 대부분 도메인 미인증(403)이나 키 오류(401)입니다.</p>` : ''}`
        : '<div class="empty">발송 기록이 없습니다.</div>'}
    </div>

    <div class="sec-title">기록 정리</div>
    <div class="card">
      <p class="muted">180일이 지난 채팅·상담 자료와 1시간이 지난 통화 대기열을 지웁니다. 되돌릴 수 없습니다.</p>
      <button class="btn warnline sm" style="margin-top: 0.6rem;" data-act="purge">오래된 기록 정리</button>
    </div>

    <p class="muted" style="margin-top: 1rem;">
      우렁의사 운영자 콘솔 · 데스크톱 우선 · 다크 모드 없음<br>
      소비자 앱의 [운영자 콘솔]은 전환기 동안 함께 남아 있습니다.</p>`;
}

// ── 동작 ─────────────────────────────────────────────────────────────
const csOf = id => (D.cs || []).find(c => c.id === id);
const appOf = id => (D.apps || []).find(a => a.id === id);

// 승인 — 서버가 계정을 만들고 코드를 발급해 신청서의 메일로 보낸다
async function approve(id, btn) {
  const a = appOf(id); if (!a) return;
  const ok = await confirmBox({
    title: `${a.name} 선생님을 승인할까요?`,
    body: `${a.license || '자격 미기재'} · ${a.hospital || '소속 미기재'}\n\n`
      + (a.email ? `승인하면 ${a.email} 으로 로그인 코드가 발송됩니다.`
                 : '⚠ 이메일이 없어 코드를 자동 발송할 수 없어요. 발급된 코드를 직접 전달해야 합니다.'),
    okLabel: '승인'
  });
  if (!ok) return;
  const r = await busy(btn, '승인 중…', () => adminPost('/api/apply/approve', { id }));
  if (!r || !r.ok) { alertBox('승인하지 못했어요', (r && r.error) || '잠시 후 다시 시도해주세요.'); return; }
  await loadCounselors();
  if (r.mailed) toast(`${r.name} 선생님께 코드를 메일로 보냈어요`);
  else shareText(r.name, r.code);
}

async function reject(id, btn) {
  const a = appOf(id); if (!a) return;
  const why = await promptBox({
    title: `${a.name} 선생님 신청을 반려합니다`,
    body: '반려 사유는 신청자 화면에 그대로 보입니다.',
    value: '자격 서류 확인이 필요합니다', okLabel: '반려', danger: true
  });
  if (why === null) return;
  const r = await busy(btn, '처리 중…', () => adminPost('/api/apply/reject', { id, why: (why || '').trim() }));
  if (!r || !r.ok) { alertBox('반려하지 못했어요', '잠시 후 다시 시도해주세요.'); return; }
  toast('반려했어요');
  loadCounselors();
}

// 발급된 코드를 전달하기 좋은 형태로 한 번에 보여준다
async function shareText(name, code) {
  const link = proAppUrl();
  const msg = `[우렁의사] ${name} 선생님 상담사 페이지 안내\n\n`
    + `주소: ${link}\n열람 코드: ${code}\n\n`
    + `· 위 주소를 열고 코드를 붙여넣으면 로그인됩니다.\n`
    + `· 코드는 비밀번호와 같습니다. 단톡방에 올리지 마세요.\n`
    + `· 코드가 새면 즉시 알려주세요. 새로 발급해 드립니다.`;
  const ok = await confirmBox({
    title: '코드가 발급됐어요', body: msg,
    okLabel: '안내문 복사하기', cancelLabel: '닫기'
  });
  if (ok) copy(msg, '복사했어요. 상담사에게 붙여넣어 전달하세요');
}

async function rotate(id, btn) {
  const c = csOf(id); if (!c) return;
  const ok = await confirmBox({
    title: '코드를 새로 발급할까요?',
    body: `${c.name} 선생님의 지금 코드는 즉시 못 쓰게 됩니다.\n새 코드를 다시 전달해야 해요.`,
    okLabel: '새로 발급', danger: true
  });
  if (!ok) return;
  const r = await busy(btn, '발급 중…', () => adminPost('/api/admin/counselors/rotate', { id }));
  if (!r || !r.ok) { alertBox('발급하지 못했어요', '잠시 후 다시 시도해주세요.'); return; }
  SHOWCODE[id] = true;
  await loadCounselors();
  if (r.mailed) toast('새 코드를 메일로 보냈어요');
  shareText(c.name, r.code);
}

async function toggleActive(id, on, btn) {
  const c = csOf(id); if (!c) return;
  if (!on) {
    const ok = await confirmBox({
      title: `${c.name} 선생님을 정지할까요?`,
      body: '즉시 로그인이 막히고 매칭 목록에서도 빠집니다.\n기록은 지워지지 않아요.',
      okLabel: '정지', danger: true
    });
    if (!ok) return;
  }
  const r = await busy(btn, '처리 중…', () => adminPost('/api/admin/counselors/active', { id, active: on }));
  if (!r || !r.ok) { alertBox('처리하지 못했어요', '잠시 후 다시 시도해주세요.'); return; }
  toast(on ? '정지를 해제했어요' : '정지했어요');
  loadCounselors();
}

async function setEmail(id, btn) {
  const c = csOf(id); if (!c) return;
  const v = await promptBox({
    title: `${c.name} 선생님 이메일`,
    body: c.email ? '바꾸면 지금 로그인돼 있는 기기가 모두 로그아웃됩니다.'
                  : '등록하면 상담사가 이 주소로 로그인 링크를 받을 수 있어요.',
    value: c.email || '', placeholder: 'name@example.com', type: 'email', okLabel: '저장'
  });
  if (v === null) return;
  const r = await busy(btn, '저장 중…', () => adminPost('/api/admin/counselors/email', { id, email: (v || '').trim() }));
  if (!r || !r.ok) { alertBox('저장하지 못했어요', (r && r.error) || '형식을 확인해주세요.'); return; }
  toast('이메일을 저장했어요');
  loadCounselors();
}

// 삭제는 예약·수신함·채팅·후기까지 함께 지운다. 그래서 두 번 묻는다.
async function removeCs(id) {
  const c = csOf(id); if (!c) return;
  const ok = await confirmBox({
    title: `${c.name} 선생님을 완전히 삭제할까요?`,
    body: '예약·수신함·채팅·후기·로그인 세션이 전부 함께 지워집니다.\n되돌릴 수 없어요.',
    okLabel: '계속', danger: true
  });
  if (!ok) return;
  const typed = await promptBox({
    title: '한 번 더 확인합니다',
    body: `정말 지우려면 아래에 ID(${id})를 그대로 입력하세요.`,
    placeholder: id, okLabel: '삭제', danger: true
  });
  if (typed === null) return;
  if (typed !== id) { alertBox('취소했어요', 'ID 가 달라서 아무것도 지우지 않았습니다.'); return; }
  const r = await adminPost('/api/admin/counselors/delete', { id, confirm: id });
  if (!r || !r.ok) { alertBox('삭제하지 못했어요', (r && r.error) || '잠시 후 다시 시도해주세요.'); return; }
  toast(`${c.name} 선생님을 삭제했어요`);
  loadCounselors();
}

async function addCs(btn) {
  const id = ($('new-id').value || '').trim();
  const name = ($('new-name').value || '').trim();
  const hospital = ($('new-hospital').value || '').trim();
  const email = ($('new-email').value || '').trim();
  if (!id || !name) { alertBox('확인해주세요', 'ID 와 이름은 반드시 필요합니다.'); return; }
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) { alertBox('ID 형식', 'ID 는 영문·숫자·-·_ 만 쓸 수 있어요.'); return; }
  const r = await busy(btn, '등록 중…', () => adminPost('/api/admin/counselors', { id, name, hospital, email }));
  if (!r || !r.ok) { alertBox('등록하지 못했어요', (r && r.error) || '잠시 후 다시 시도해주세요.'); return; }
  ['new-id', 'new-name', 'new-hospital', 'new-email'].forEach(k => { const el = $(k); if (el) el.value = ''; });
  await loadCounselors();
  if (r.mailed) toast(`${name} 선생님께 코드를 메일로 보냈어요`);
  shareText(name, r.code);
}

// 지급은 되돌릴 수 없다 — 확인 창 + 문구 입력, 두 번 묻는다
async function paySelected(btn) {
  const ids = (D.settle || []).filter(x => PICK[x.id]).map(x => x.id);
  if (!ids.length) { alertBox('지급할 항목을 골라주세요'); return; }
  const rows = (D.settle || []).filter(x => PICK[x.id]);
  const sum = rows.reduce((a, x) => a + x.payout.counselor, 0);
  const names = Array.from(new Set(rows.map(x => x.counselor))).join(', ');
  const ok = await confirmBox({
    title: `${ids.length}건을 지급 처리할까요?`,
    body: `대상: ${names}\n상담사 몫 합계 ${won(sum)}캐시\n\n`
      + `실제 이체는 은행에서 따로 하시고, 여기서는 '보냈다'고 기록만 합니다.\n되돌릴 수 없어요.`,
    okLabel: '계속', danger: true
  });
  if (!ok) return;
  const typed = await promptBox({
    title: '한 번 더 확인합니다',
    body: `이체를 실제로 마쳤다면 아래에 "지급" 이라고 입력하세요.`,
    placeholder: '지급', okLabel: '지급 완료로 표시', danger: true
  });
  if (typed === null) return;
  if (typed.trim() !== '지급') { alertBox('취소했어요', '입력한 문구가 달라서 아무것도 처리하지 않았습니다.'); return; }
  const r = await busy(btn, '처리 중…', () => adminPost('/api/settle/pay', { ids }));
  if (!r || !r.ok) { alertBox('처리하지 못했어요', '잠시 후 다시 시도해주세요.'); return; }
  Object.keys(PICK).forEach(k => delete PICK[k]);
  toast(`${ids.length}건 지급 처리했어요`);
  loadSettle();
}

async function purge(btn) {
  const ok = await confirmBox({
    title: '오래된 기록을 정리할까요?',
    body: '180일이 지난 채팅·상담 자료와 1시간이 지난 통화 대기열을 지웁니다.\n되돌릴 수 없어요.',
    okLabel: '정리', danger: true
  });
  if (!ok) return;
  const r = await busy(btn, '정리 중…', () => adminPost('/api/purge', {}));
  if (!r || !r.ok) { alertBox('정리하지 못했어요', '잠시 후 다시 시도해주세요.'); return; }
  toast('오래된 기록을 정리했어요');
}

function logout(keepCode) {
  stopDiagTimer();
  if (!keepCode) { try { localStorage.removeItem(CODE_KEY); } catch (e) {} CODE = ''; }
  Object.keys(D).forEach(k => { D[k] = undefined; });
  $('shell').hidden = true;
  $('tabbar').hidden = true;
  $('screen-login').hidden = false;
  $('adm-err').style.display = 'none';
  $('adm-code').value = '';
  setTimeout(() => $('adm-code').focus(), 100);
}

// ── 이벤트 ───────────────────────────────────────────────────────────
//  onclick 을 HTML 문자열에 심지 않는다. 이름·병원 같은 서버 문자열이
//  그 안에 들어가면 따옴표 하나로 스크립트가 된다.
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-tab]');
  if (nav && !nav.dataset.act) { go(nav.dataset.tab); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id || '';

  if (act === 'goto') { go(el.dataset.tab); return; }
  if (act === 'refresh') {
    if (TAB === 'diag') loadDiag(); else loadAll();
    toast('새로고침했어요'); return;
  }
  if (act === 'logout') { logout(false); return; }
  if (act === 'recode') { logout(false); return; }

  if (act === 'modal-ok') {
    const inp = $('modal-input');
    closeModal(inp ? inp.value : true); return;
  }
  if (act === 'modal-cancel') { closeModal(null); return; }

  if (act === 'approve') { approve(id, el); return; }
  if (act === 'reject') { reject(id, el); return; }

  if (act === 'peek') { SHOWCODE[id] = !SHOWCODE[id]; render(); return; }
  if (act === 'copycode') { const c = csOf(id); if (c) copy(c.code, '코드를 복사했어요'); return; }
  if (act === 'share') { const c = csOf(id); if (c) shareText(c.name, c.code); return; }
  if (act === 'rotate') { rotate(id, el); return; }
  if (act === 'toggle') { toggleActive(id, el.dataset.on === '1', el); return; }
  if (act === 'email') { setEmail(id, el); return; }
  if (act === 'del') { removeCs(id); return; }
  if (act === 'add-cs') { addCs(el); return; }

  if (act === 'pick') { PICK[id] = el.checked; render(); return; }
  if (act === 'pick-group') {
    const cid = el.dataset.cid;
    (D.settle || []).filter(x => x.counselorId === cid).forEach(x => { PICK[x.id] = true; });
    render(); return;
  }
  if (act === 'pick-all') {
    const on = el.dataset.on === '1';
    (D.settle || []).forEach(x => { PICK[x.id] = on; });
    render(); return;
  }
  if (act === 'pay') { paySelected(el); return; }
  if (act === 'purge') { purge(el); return; }

  if (act === 'diag-now') { loadDiag(); toast('진단 로그를 새로 받았어요'); return; }
  if (act === 'diag-fails') { DIAGQ.stage = '__fail__'; render(); return; }
  if (act === 'diag-clearf') { DIAGQ = { stage: '', q: '' }; render(); return; }
  if (act === 'diag-auto') { DIAGAUTO = el.checked; toast(DIAGAUTO ? '30초마다 자동 새로고침합니다' : '자동 새로고침을 껐어요'); return; }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'diag-stage') { DIAGQ.stage = el.value; render(); }
});

// 검색은 입력할 때마다 그린다. 다시 그려도 포커스를 잃지 않도록 값만 되살린다.
document.addEventListener('input', e => {
  if (e.target.id === 'cs-q') {
    CSQ = e.target.value;
    const at = e.target.selectionStart;
    render();
    const el = $('cs-q'); if (el) { el.focus(); try { el.setSelectionRange(at, at); } catch (x) {} }
  }
  if (e.target.id === 'diag-q') {
    DIAGQ.q = e.target.value;
    const at = e.target.selectionStart;
    render();
    const el = $('diag-q'); if (el) { el.focus(); try { el.setSelectionRange(at, at); } catch (x) {} }
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal').hidden) closeModal(null);
});

$('adm-go').addEventListener('click', () => tryLogin(($('adm-code').value || '').trim()));
$('adm-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryLogin(($('adm-code').value || '').trim());
});

// ── 시작 ─────────────────────────────────────────────────────────────
if (CODE) enterApp();
else setTimeout(() => $('adm-code').focus(), 200);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
