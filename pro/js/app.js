// ============================================================================
//  우렁의사 프로 — 상담사 앱
//
//  화면은 넷뿐이다: 홈 · 채팅 · 예약 · 정산.
//   상담사는 진료 사이 3분에 이 앱을 연다. 스크롤로 찾게 만들면 안 본다.
//   그래서 세로로 늘어놓지 않고 탭으로 나눴다.
//
//  이 파일이 지켜야 할 두 가지:
//   1) 내담자가 보낸 메시지는 '반드시 눈에 띈다' — 뱃지 · 소리 · 미확인 표시
//   2) 전화는 '반드시 울린다' — 반복 벨 + 진동, 오디오는 첫 터치에 미리 깨워 둔다
// ============================================================================

// /api 를 어디로 보낼지 — 같은 출처에 없으면 Cloudflare Worker 로.
//  앱을 정적 호스팅에 올리면 이 페이지도 함께 올라가는데 거기엔 /api 가 없다.
const API_BASE = 'https://cbt-proxy.hongcbt.workers.dev';
window.RTC_API_BASE = API_BASE;   // rtccall.js 가 쓸 주소

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

// ── 인증 ─────────────────────────────────────────────────────────────
//  세션(이메일 로그인)이 우선, 코드는 보조 수단.
//  세션은 30일이라 localStorage 에 둔다 — 매번 메일함을 열게 하면 아무도 안 쓴다.
//  코드도 localStorage 로 옮겼다: sessionStorage 는 앱을 껐다 켜면 사라져서
//  상담사가 매번 코드를 다시 찾아야 했다(= 전화를 놓친다).
let SESSION = localStorage.getItem('counselor_session') || '';
let CODE = localStorage.getItem('inbox_code') || sessionStorage.getItem('inbox_code') || '';

const authQS = () => SESSION ? 'session=' + encodeURIComponent(SESSION) : 'code=' + encodeURIComponent(CODE);
const authBody = (extra) => Object.assign(SESSION ? { session: SESSION } : { code: CODE }, extra || {});

// ── 상태 ─────────────────────────────────────────────────────────────
let ME = null;                      // /api/me 프로필
let TAB = 'home';
let ROOM = null;                    // 열려 있는 대화방 key
const D = { inbox: [], bookings: [], chats: [], reviews: [], homework: [], presence: null, scope: '' };
const OPEN = {};                    // 접이식 섹션 열림 상태
let SEEN = {};                      // 스레드별 '여기까지 읽음' ts
try { SEEN = JSON.parse(localStorage.getItem('pro_seen') || '{}'); } catch (e) { SEEN = {}; }
const saveSeen = () => { try { localStorage.setItem('pro_seen', JSON.stringify(SEEN)); } catch (e) {} };

// ── 이 기기에만 남는 것들 ────────────────────────────────────────────
//  빠른 답장·내담자 메모·소리 설정은 전부 localStorage 다.
//  특히 메모는 서버로 절대 보내지 않는다 — 상담사의 사적인 기록이고,
//  서버에 올라가는 순간 '언젠가 누군가 볼 수 있는 것'이 되어 아무도 솔직하게 못 적는다.
const lsGet = (k, dflt) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? dflt : v; } catch (e) { return dflt; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const QR_DEFAULT = [
  '네, 확인했습니다. 곧 답드릴게요',
  '이번 주 예약 가능한 시간 보내드릴게요',
  '숙제 잘 보셨어요? 어려운 점 있었나요?'
];
let QR = lsGet('pro_quickreply', null);
if (!Array.isArray(QR) || !QR.length) { QR = QR_DEFAULT.slice(); lsSet('pro_quickreply', QR); }

let NOTES = lsGet('pro_notes', {}) || {};              // 내담자별 개인 메모
let SOUND = lsGet('pro_sound', true) !== false;        // 알림음 on/off

let CHATQ = '';                                        // 채팅 검색어
let BOOKVIEW = lsGet('pro_bookview', 'list');          // 예약 탭: list | cal
const CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: '' };

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => (Math.round(n || 0)).toLocaleString();
const DEAD = ['cancelled', 'declined', 'noshow', 'refunded'];
const isEarned = b => !DEAD.includes(b.status) && b.whenTs <= Date.now();

function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 2200);
}

// 입력 중인 칸 위에 덮어쓰지 않는다 — 30초 폴링이 답장을 지워버리면 아무도 안 쓴다
const busy = el => !!(el && document.activeElement && el.contains(document.activeElement) &&
  /INPUT|TEXTAREA/.test(document.activeElement.tagName));

// ── 소리 · 진동 ───────────────────────────────────────────────────────
//  모바일 브라우저의 AudioContext 는 사용자 제스처 없이는 suspended 다.
//  전화가 왔을 때 처음 만들면 '벨이 안 울리는' 일이 생긴다.
//  그래서 로그인·첫 터치에서 미리 만들어 두고 깨워 둔다.
let AC = null;
function unlockAudio() {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) unlockAudio(); });

function tone(seq, vol) {
  if (!AC) { unlockAudio(); if (!AC) return; }
  if (AC.state === 'suspended') AC.resume();
  const v = vol == null ? 0.13 : vol;
  seq.forEach(([f, t, len]) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g); g.connect(AC.destination);
    const at = AC.currentTime + t, d = len || 0.18;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.start(at); o.stop(at + d + 0.02);
  });
}
// 새 메시지 알림음만 끌 수 있다. 걸려오는 전화 벨은 설정과 무관하게 울린다 —
//  놓치면 되돌릴 수 없는 건 전화뿐이라, 그것까지 끄게 두면 안 된다.
const chime = () => { if (SOUND) tone([[659, 0], [988, 0.11], [1319, 0.22]], 0.12); };

// 벨 — 통화는 놓치면 끝이라 소리와 진동을 함께, 끊길 때까지 반복한다
const RING = { timer: null, on: false };
function ringStart() {
  if (RING.on) return;
  RING.on = true;
  const beep = () => {
    if (!RING.on) return;
    tone([[880, 0, 0.16], [1100, 0.18, 0.16]], 0.2);
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400]); } catch (e) {}
  };
  beep();
  RING.timer = setInterval(beep, 1800);
}
function ringStop() {
  RING.on = false;
  clearInterval(RING.timer);
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
}

// ── 시간 표기 ─────────────────────────────────────────────────────────
const DAYNM = ['일', '월', '화', '수', '목', '금', '토'];
function relTime(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}
const dayKey = ts => new Date(ts).toDateString();
const dayLabel = ts => {
  const d = new Date(ts);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + DAYNM[d.getDay()] + '요일';
};
const isToday = ts => new Date(ts).toDateString() === new Date().toDateString();
function weekStart() {   // 월요일 0시
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const ymd = ts => { const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const hhmm = ts => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const todayFull = () => {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYNM[d.getDay()]}요일`;
};

// ── 꾸미기 조각들 ─────────────────────────────────────────────────────
// 이름 → 파스텔 6색. 같은 사람은 늘 같은 색이어야 '색으로 기억'이 된다.
function avColor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}
const avatar = (name, cls) =>
  `<div class="pav c${avColor(name)}${cls ? ' ' + cls : ''}">${esc(String(name || '내').slice(0, 1))}</div>`;

// 시간대별 인사 — 새벽에 "좋은 아침"이라고 하면 앱이 나를 안 보고 있다는 뜻이다
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return { t: '늦은 밤까지 고생 많으세요', ic: '🌙' };
  if (h < 11) return { t: '좋은 아침이에요', ic: '☀' };
  if (h < 17) return { t: '좋은 오후예요', ic: '🌿' };
  if (h < 21) return { t: '좋은 저녁이에요', ic: '🌆' };
  return { t: '오늘도 수고하셨어요', ic: '🌙' };
}

// 빈 화면 일러스트 — 손그림 느낌의 선화. 글자만 있는 빈 화면은 '고장'으로 읽힌다.
const ART = {
  chat: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 22c0-5 4-9 9-9h48c5 0 9 4 9 9v25c0 5-4 9-9 9H40l-13 11 1-11h-5c-5 0-9-4-9-9z"/>
      <path d="M31 30h32M31 40h22"/>
      <path d="M77 44h22c4 0 7 3 7 7v16c0 4-3 7-7 7h-3l1 8-9-8H77c-4 0-7-3-7-7"/>
      <path d="M83 56h13" opacity="0.6"/></svg>`,
  cal: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <rect x="21" y="18" width="78" height="60" rx="8"/><path d="M21 34h78M40 12v12M80 12v12"/>
      <circle cx="43" cy="49" r="3.2"/><circle cx="60" cy="49" r="3.2" opacity="0.5"/><circle cx="77" cy="49" r="3.2" opacity="0.3"/>
      <path d="M38 64h24" opacity="0.5"/></svg>`,
  money: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <rect x="18" y="27" width="84" height="46" rx="9"/><path d="M18 41h84"/>
      <circle cx="34" cy="58" r="4"/><path d="M52 58h32" opacity="0.55"/>
      <path d="M32 27l22-14 20 14" opacity="0.7"/></svg>`,
  inbox: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 46l10-27h56l10 27v20c0 4-3 7-7 7H29c-4 0-7-3-7-7z"/>
      <path d="M22 46h20l4 9h28l4-9h20"/></svg>`,
  star: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M60 20l9.5 19.5 21.5 3-15.5 15 3.6 21.4L60 68.8 40.9 78.9 44.5 57.5 29 42.5l21.5-3z"/>
      <path d="M96 26l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" opacity="0.55"/></svg>`,
  hw: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <rect x="27" y="14" width="60" height="64" rx="8"/><path d="M40 32h34M40 45h34M40 58h20" opacity="0.6"/>
      <path d="M76 62l7 7 15-17" stroke-width="2.6"/></svg>`,
  search: `<svg viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="54" cy="40" r="21"/><path d="M69 55l17 17"/><path d="M45 40h18" opacity="0.5"/></svg>`
};
const empty = (kind, title, body) =>
  `<div class="empty">${ART[kind] || ''}<b>${title}</b>${body || ''}</div>`;

// 미니 라인 차트 — 라이브러리 없이 SVG 문자열로 그린다 (7점이면 이게 제일 가볍다)
function sparkline(vals) {
  const W = 280, H = 62, P = 6;
  const max = Math.max(1, ...vals);
  const step = (W - P * 2) / Math.max(1, vals.length - 1);
  const pt = i => [P + i * step, H - P - (vals[i] / max) * (H - P * 2)];
  const pts = vals.map((_, i) => pt(i));
  const line = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = `${P},${H - P} ${line} ${W - P},${H - P}`;
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="최근 7일 상담 건수">
      <defs><linearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4f8a6b" stop-opacity="0.26"/><stop offset="100%" stop-color="#4f8a6b" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="${area}" fill="url(#spk)"/>
      <polyline points="${line}" fill="none" stroke="#4f8a6b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.4}"
        fill="${i === pts.length - 1 ? '#4f8a6b' : '#ffffff'}" stroke="#4f8a6b" stroke-width="1.8"/>`).join('')}
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7.5" fill="#4f8a6b" opacity="0.16"/>
    </svg>`;
}

// 월별 막대 — 값 라벨을 막대 위에 얹는다. 축만 있는 차트는 읽는 데 시간이 더 걸린다.
function barchart(items) {
  const W = 300, H = 108, P = 10;
  const max = Math.max(1, ...items.map(x => x.v));
  const bw = (W - P * 2) / items.length;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 6개월 수입">
      ${items.map((x, i) => {
        const h = Math.max(2, (x.v / max) * (H - 34));
        const cx = P + bw * i + bw / 2;
        const cur = i === items.length - 1;
        return `<rect x="${(cx - bw * 0.29).toFixed(1)}" y="${(H - 16 - h).toFixed(1)}" width="${(bw * 0.58).toFixed(1)}" height="${h.toFixed(1)}"
            rx="5" fill="${cur ? '#4f8a6b' : 'rgba(79,138,107,0.28)'}"/>
          <text x="${cx.toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" text-anchor="middle" font-size="8.5"
            font-weight="700" fill="${cur ? '#4f8a6b' : '#7f7264'}">${x.v ? won(Math.round(x.v / 1000)) + 'k' : '·'}</text>
          <text x="${cx.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="${cur ? '#4f8a6b' : '#7f7264'}"
            font-weight="${cur ? 800 : 500}">${esc(x.label)}</text>`;
      }).join('')}
    </svg>`;
}

// ============================================================================
//  로그인
// ============================================================================
async function loginWithCode() {
  unlockAudio();
  const v = ($('code').value || '').trim();
  const errEl = $('err'), btn = $('code-btn');
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = '확인 중…';
  const r = await api('/api/inbox?code=' + encodeURIComponent(v)).catch(() => null);
  btn.disabled = false; btn.textContent = '시작하기';
  if (!r || !r.ok) {
    errEl.textContent = '코드가 올바르지 않습니다.';
    errEl.style.display = 'block';
    return;
  }
  CODE = v; SESSION = '';
  localStorage.setItem('inbox_code', v);
  enterApp();
  askNotify();
  loadAll().then(() => connectHub()); // 로그인 직후에도 실시간 소켓을 붙인다
}

// 메일의 링크로 들어온 경우: ?t=... 를 세션으로 바꾼다
async function verifyLink(t) {
  const d = await postJson('/api/auth/verify', { t });
  history.replaceState(null, '', location.pathname);   // 주소창에서 토큰 제거
  if (!d || !d.ok) {
    const why = d && d.error === 'expired' ? '링크가 만료됐어요 (15분).'
              : d && d.error === 'used' ? '이미 사용된 링크예요.' : '링크가 유효하지 않아요.';
    const errEl = $('err');
    errEl.textContent = why + ' 이메일로 다시 받아주세요.';
    errEl.style.display = 'block';
    return false;
  }
  SESSION = d.session;
  localStorage.setItem('counselor_session', SESSION);
  CODE = ''; localStorage.removeItem('inbox_code');
  return true;
}

async function logout() {
  if (!confirm('앱을 잠글까요? 다시 열려면 코드를 입력해야 합니다.')) return;
  if (SESSION) await postJson('/api/auth/logout', { session: SESSION });
  localStorage.removeItem('counselor_session');
  localStorage.removeItem('inbox_code');
  sessionStorage.removeItem('inbox_code');
  SESSION = ''; CODE = ''; ME = null;
  $('app').hidden = true;
  $('screen-login').hidden = false;
  $('code').value = '';
}

function enterApp() {
  $('screen-login').hidden = true;
  $('app').hidden = false;
}

async function askNotify() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
  enablePush();
  renderHome();
}

// ============================================================================
//  데이터 적재
// ============================================================================
let lastClientMsgs = null;   // 새 메시지 감지용

async function loadAll() {
  await Promise.all([loadMe(), loadInbox(), loadBookings(), loadChats(), loadPresence(), loadReviews(), loadHomework()]);
  renderAll();
}

async function loadMe() {
  const d = await getJson('/api/me?' + authQS());
  if (d && d.ok) {
    ME = d.me;
    $('me-name').textContent = ME.name || '상담사';
    $('me-sub').textContent = [ME.hospital || '소속 미입력', ME.license || ''].filter(Boolean).join(' · ');
    $('me-av').textContent = (ME.name || '우').slice(0, 1);
    tellSwWhoIAm(); enablePush();
  } else {
    // 운영자 마스터 코드는 /api/me 가 없다 — 그래도 앱은 돌아가야 한다
    $('me-name').textContent = D.scope === 'admin' ? '운영자' : '우렁의사 프로';
    $('me-sub').textContent = D.scope === 'admin' ? '전체 열람 모드' : '';
  }
}

async function loadInbox() {
  const r = await api('/api/inbox?' + authQS()).catch(() => null);
  // 코드가 정지·회수됐는데 화면만 열려 있으면, 아무것도 안 오는 앱을 붙들고
  //  '고장 났다'고 생각하게 된다. 인증이 끊긴 건 인증이 끊겼다고 말해야 한다.
  if (r && (r.status === 401 || r.status === 403)) { forceRelogin(); return; }
  if (!r || !r.ok) return;
  const d = await r.json().catch(() => null);
  if (!d) return;
  D.inbox = d.items || [];
  D.scope = d.scope || '';
}

function forceRelogin() {
  localStorage.removeItem('counselor_session');
  localStorage.removeItem('inbox_code');
  sessionStorage.removeItem('inbox_code');
  SESSION = ''; CODE = ''; ME = null;
  $('app').hidden = true;
  $('screen-login').hidden = false;
  const errEl = $('err');
  errEl.textContent = '로그인이 만료됐거나 코드가 변경됐어요. 코드를 다시 입력해주세요.';
  errEl.style.display = 'block';
}

async function loadBookings() {
  const d = await getJson('/api/bookings?' + authQS());
  if (d) D.bookings = (d.items || []).sort((a, b) => a.whenTs - b.whenTs);
}

async function loadChats() {
  const d = await getJson('/api/chat-msg?' + authQS());
  if (!d) return;
  D.chats = (d.items || []).sort((a, b) => a.ts - b.ts);
  // 내담자가 보낸 메시지가 늘었으면 소리로 알린다. 이게 '채팅이 안 온다'의 정체였다 —
  //  서버에는 와 있는데 화면이 조용해서 아무도 몰랐다.
  const n = D.chats.filter(m => m.from === 'client').length;
  if (lastClientMsgs !== null && n > lastClientMsgs) {
    chime();
    const last = [...D.chats].reverse().find(m => m.from === 'client');
    const who = last ? last.clientName : '내담자';
    if (!(ROOM && last && threadKey(last) === ROOM)) {
      toast(who + ' 님이 메시지를 보냈어요');
      try {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification('우렁의사 프로', { body: who + ' 님의 새 메시지', icon: './icon-192.png', tag: 'chat' });
        }
      } catch (e) {}
    }
  }
  lastClientMsgs = n;
}

async function loadPresence() {
  const d = await getJson('/api/presence?' + authQS());
  D.presence = d && d.id ? d : null;   // 운영자 코드 등은 토글 없음
}

async function loadReviews() {
  const d = await getJson('/api/reviews?' + authQS());
  if (d) D.reviews = d.items || [];
}

async function loadHomework() {
  const d = await getJson('/api/homework?' + authQS());
  if (d) D.homework = d.items || [];
}

// ============================================================================
//  탭
// ============================================================================
function setTab(name) {
  TAB = name;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  window.scrollTo(0, 0);
  renderAll();
}

function renderAll() {
  renderHome(); renderChatList(); renderBookings(); renderMoney(); renderDots();
  if (ROOM) renderRoom();
}

function renderDots() {
  const set = (id, n) => {
    const el = $(id);
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : n;
  };
  set('dot-chat', threads().reduce((s, t) => s + t.unread, 0));
  set('dot-home', D.inbox.filter(x => !x.read).length);
  // 완료 처리를 안 하면 정산이 시작되지 않는다 — 그게 밀려 있으면 숫자로 보여준다
  set('dot-book', D.bookings.filter(b => b.status === 'confirmed' && b.whenTs <= Date.now()).length);
  set('dot-money', 0);
}

// ============================================================================
//  ① 홈
// ============================================================================
function fold(key, title, summary, bodyHtml) {
  const open = !!OPEN[key];
  const caret = open
    ? '<svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 6.5 L5 3.5 L8 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `<div class="card pad0 fold">
      <button class="head" data-act="fold" data-key="${esc(key)}">
        <strong style="font-size:0.92rem;">${title}</strong>
        <span class="muted grow" style="text-align:right;">${summary}</span>
        <span style="color:var(--sub); line-height:0;">${caret}</span>
      </button>
      ${open ? `<div class="body">${bodyHtml}</div>` : ''}
    </div>`;
}

// 최근 7일 상담 건수 = 지나간 예약(취소·환불 제외) + 연결된 음성 상담 기록.
//  통화 기록은 내담자 앱이 채팅에 '📞 음성 상담 mm:ss' 로 남겨 둔다(js/calltalk.js).
function last7Days() {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    days.push({ d, n: 0 });
  }
  const slot = ts => {
    const d = new Date(ts); d.setHours(0, 0, 0, 0);
    return 6 + Math.round((d.getTime() - base.getTime()) / 86400000);
  };
  D.bookings.forEach(b => {
    if (DEAD.includes(b.status) || b.whenTs > Date.now()) return;
    const i = slot(b.whenTs); if (i >= 0 && i < 7) days[i].n++;
  });
  D.chats.forEach(m => {
    if (!/^📞 음성 상담/.test(m.text || '')) return;
    const i = slot(m.ts); if (i >= 0 && i < 7) days[i].n++;
  });
  return days;
}

function weekChartCard() {
  const days = last7Days();
  const total = days.reduce((s, x) => s + x.n, 0);
  return `<div class="card">
      <div class="row" style="margin-bottom:0.5rem;">
        <strong class="grow" style="font-size:0.9rem;">최근 7일 상담</strong>
        <span class="muted"><b style="color:var(--accent); font-size:0.95rem;">${total}</b>건</span>
      </div>
      <div class="chartwrap">${sparkline(days.map(x => x.n))}</div>
      <div class="chartlabels">
        ${days.map((x, i) => `<span class="${i === 6 ? 'on' : ''}">${DAYNM[x.d.getDay()]}</span>`).join('')}
      </div>
      ${total ? '' : '<p class="muted" style="margin-top:0.4rem;">이번 주는 아직 조용해요. 예약 가능 시간을 넓혀 보는 것도 방법이에요.</p>'}
    </div>`;
}

function renderHome() {
  const el = $('view-home');
  if (busy(el)) return;
  const now = Date.now();
  const unreadMsgs = threads().reduce((s, t) => s + t.unread, 0);
  const todays = D.bookings.filter(b => isToday(b.whenTs) && !DEAD.includes(b.status));
  const week = D.bookings.filter(b => isEarned(b) && b.whenTs >= weekStart());
  const weekSum = week.reduce((s, b) => s + (b.payout ? b.payout.counselor : 0), 0);
  const p = D.presence;

  const presenceCard = p ? `
    <div class="card switch-card ${p.available ? 'on' : ''}">
      <div class="row">
        <div class="grow">
          <div class="row" style="gap:0.4rem;">
            <strong style="font-size:0.98rem;">바로상담 받기</strong>
            ${p.busy ? '<span class="chip bad">통화 중</span>'
              : p.available ? '<span class="chip ok">수신 중</span>' : '<span class="chip off">부재중</span>'}
          </div>
          <p class="muted" style="margin-top:0.25rem;">${p.available
            ? '매칭 카드에 [바로상담] 버튼이 열려 있어요. 자리를 비울 땐 꼭 꺼주세요.'
            : '지금은 부재중이에요. 예약 상담은 꺼져 있어도 연결됩니다.'}</p>
        </div>
        <button class="sw ${p.available ? 'on' : ''}" data-act="presence" data-on="${p.available ? '0' : '1'}"
          aria-label="바로상담 수신 토글"><i></i></button>
      </div>
      ${p.busy ? `<button class="btn ghost sm" style="margin-top:0.7rem;" data-act="force-end" data-id="${esc(p.id)}">회선 수동 해제</button>` : ''}
    </div>` : '';

  const notiOk = ('Notification' in window) && Notification.permission === 'granted';
  const notiCard = notiOk ? '' : `
    <div class="card" style="border:1.5px solid var(--warn);">
      <div class="row"><strong class="grow" style="font-size:0.92rem;">알림이 꺼져 있어요</strong><span class="chip new">중요</span></div>
      <p class="muted" style="margin:0.3rem 0 0.6rem;">화면을 꺼두면 걸려오는 전화와 새 메시지를 놓칩니다. 알림을 켜주세요.</p>
      <button class="btn sm" data-act="ask-noti">알림 켜기</button>
    </div>`;

  const todayList = todays.length ? todays.map(b => {
    const soon = b.status === 'confirmed' && Math.abs(b.whenTs - now) < 3600000;
    const past = b.whenTs <= now;
    return `<div class="listrow">
        <div class="bktime ${soon ? 'hot' : ''}"><b>${hhmm(b.whenTs)}</b><span>30분</span></div>
        <div class="grow">
          <div class="row" style="gap:0.4rem;"><strong style="font-size:0.9rem;">${esc(b.clientName)} 님</strong>
            ${soon ? '<span class="chip new">곧 시작</span>'
              : b.status === 'done' ? '<span class="chip ok">완료</span>'
              : past ? '<span class="chip gold">완료 처리 필요</span>' : '<span class="chip ok">확정</span>'}</div>
          <div class="muted">${won(b.price)}캐시 · 내 몫 ${won(b.payout ? b.payout.counselor : 0)}캐시</div>
        </div>
      </div>`;
  }).join('') : empty('cal', '오늘 예약은 없어요', '편히 쉬셔도 됩니다.<br>비어 있는 하루도 상담사에게는 일입니다.');

  const hwDone = D.homework.filter(h => h.doneAt).length;
  const inboxUnread = D.inbox.filter(x => !x.read).length;
  const g = greeting();
  const myName = (ME && ME.name) ? ME.name + ' 선생님' : (D.scope === 'admin' ? '운영자님' : '선생님');
  const heroSub = todays.length
    ? `오늘 예약 <b>${todays.length}건</b>${unreadMsgs ? ` · 안 읽은 메시지 <b>${unreadMsgs}개</b>` : ''}`
    : (unreadMsgs ? `오늘 예약은 없고, 안 읽은 메시지가 <b>${unreadMsgs}개</b> 있어요` : '오늘 예약은 없어요. 잠깐 숨 돌리셔도 됩니다.');

  const ico = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.3-.6L3 21l1.8-4.6A8.3 8.3 0 0 1 3.6 11.5C3.6 6.9 7.6 3.5 12.3 3.5S21 6.9 21 11.5Z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    won: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l3.5 10L12 9l4.5 8L20 7"/><path d="M3 12h18"/></svg>'
  };

  el.innerHTML = `
    <div class="hero">
      <div class="date">${todayFull()}</div>
      <div class="hi">${g.t},<br>${esc(myName)} ${g.ic}</div>
      <div class="sub">${heroSub}</div>
    </div>
    ${notiCard}
    <div class="stats">
      <div class="stat c-warn" data-act="tab" data-tab="chat">
        <div class="ic">${ico.chat}</div>
        <b style="color:${unreadMsgs ? 'var(--warn)' : 'var(--text)'}">${unreadMsgs}</b><span>안 읽은 메시지</span>
      </div>
      <div class="stat c-blue" data-act="tab" data-tab="book">
        <div class="ic">${ico.cal}</div>
        <b>${todays.length}</b><span>오늘 예약</span>
      </div>
      <div class="stat c-green" data-act="tab" data-tab="money">
        <div class="ic">${ico.won}</div>
        <b style="color:var(--accent)">${won(weekSum)}<span class="u">캐시</span></b><span>이번 주 수입</span>
      </div>
    </div>
    ${presenceCard}
    <div class="sec-title">오늘 일정<span class="right muted">${todays.length ? todays.length + '건' : ''}</span></div>
    <div class="card">${todayList}</div>
    <div class="sec-title">한눈에 보기</div>
    ${weekChartCard()}
    <div class="sec-title">관리</div>
    ${foldProfile()}
    ${foldSlots()}
    ${foldPrefs()}
    ${fold('hw', '내가 낸 숙제', D.homework.length ? `${D.homework.length}개 · 완료 ${hwDone}` : '아직 없음', hwListHtml(D.homework, true))}
    ${fold('inbox', '받은 상담 자료', D.inbox.length ? `${D.inbox.length}건 · 안 읽음 ${inboxUnread}` : '아직 없음', inboxHtml())}
    ${fold('rv', '내 리뷰', D.reviews.length ? `${D.reviews.length}개` : '아직 없음', reviewsHtml())}
    ${isStandalone() ? '' : `
    <div class="card" style="display:flex; align-items:center; gap:0.7rem;">
      <span style="flex-shrink:0; width:38px; height:38px; border-radius:11px; background:rgba(79,138,107,0.13); display:inline-flex; align-items:center; justify-content:center;">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M6 10l6 6 6-6"/><path d="M4 21h16"/></svg></span>
      <div style="flex:1; min-width:0;">
        <b style="font-size:0.88rem;">앱으로 설치하기</b>
        <p class="muted" style="margin:0.1rem 0 0;">폰·PC 어디서든 홈 화면에서 바로 열려요. 전화도 놓치지 않아요.</p>
      </div>
      <button class="btn sm" style="width:auto; margin:0; flex-shrink:0;" data-act="install">설치</button>
    </div>`}
    <p class="muted" style="text-align:center; margin-top:1.2rem;">
      코드를 잃어버렸거나 코드가 샌 것 같으면 <b>nda960327@gmail.com</b> 으로 알려주세요.</p>`;
}

function inboxHtml() {
  if (!D.inbox.length) return empty('inbox', '아직 도착한 자료가 없어요',
    '내담자가 앱에서 [상담 자료 보내기]로<br>동의하고 보내면 여기에 쌓입니다.');
  return '<div style="margin-top:0.4rem;">' + D.inbox.map(it => `
      <div class="listrow" style="display:block;">
        <button class="head" data-act="inbox-open" data-id="${esc(it.id)}"
          style="all:unset; display:flex; align-items:center; gap:0.5rem; width:100%; cursor:pointer;">
          <strong class="grow" style="font-size:0.86rem;">${esc(it.clientName)} 님</strong>
          <span class="muted">${relTime(it.ts)}</span>
          ${it.read ? '<span class="chip off">읽음</span>' : '<span class="chip new">NEW</span>'}
        </button>
        ${OPEN['ib-' + it.id] ? `<p style="font-size:0.84rem; line-height:1.75; white-space:pre-line; margin-top:0.5rem; max-height:340px; overflow:auto;">${esc(it.text)}</p>` : ''}
      </div>`).join('') + '</div>';
}

function reviewsHtml() {
  if (!D.reviews.length) return empty('star', '아직 리뷰가 없어요',
    '상담을 마친 내담자가 별점을 남기면<br>여기에서 답글까지 달 수 있어요.');
  return '<div style="margin-top:0.4rem;">' + D.reviews.map(rv => `
      <div class="listrow" style="display:block;">
        <div class="row">
          <strong class="grow" style="font-size:0.86rem;">${'★'.repeat(rv.rating)}<span class="muted" style="font-weight:500;"> ${esc(rv.clientName)} 님</span></strong>
          <span class="muted">${new Date(rv.ts).toLocaleDateString('ko-KR')}</span>
        </div>
        ${rv.text ? `<p style="font-size:0.85rem; margin-top:0.3rem;">"${esc(rv.text)}"</p>` : ''}
        ${rv.reply
          ? `<p class="muted" style="margin-top:0.4rem;">↳ 내 답글: ${esc(rv.reply.text)}</p>`
          : `<div class="row" style="margin-top:0.5rem;">
              <input id="rvr-${esc(rv.id)}" class="grow" placeholder="감사 인사·답글 남기기">
              <button class="btn sm" data-act="rv-reply" data-id="${esc(rv.id)}">등록</button>
            </div>`}
      </div>`).join('') + '</div>';
}

// ============================================================================
//  ② 채팅
// ============================================================================
const threadKey = m => m.clientId || ('n:' + m.clientName);

function threads() {
  const map = new Map();
  D.chats.forEach(m => {
    const k = threadKey(m);
    if (!map.has(k)) map.set(k, { key: k, clientId: m.clientId || '', clientName: m.clientName, counselorId: m.counselorId, counselorName: m.counselorName, msgs: [] });
    const t = map.get(k);
    t.msgs.push(m);
    if (m.clientName) t.clientName = m.clientName;
  });
  const arr = [...map.values()];
  arr.forEach(t => {
    t.last = t.msgs[t.msgs.length - 1];
    t.unread = t.msgs.filter(m => m.from === 'client' && m.ts > (SEEN[t.key] || 0)).length;
  });
  arr.sort((a, b) => b.last.ts - a.last.ts);
  return arr;
}

// 검색어를 미리보기 안에서 <mark> 로 칠한다 — 어느 대화의 어디가 걸렸는지 보여야 검색이다
function hlight(text, q) {
  const s = String(text == null ? '' : text);
  if (!q) return esc(s);
  const i = s.toLowerCase().indexOf(q);
  if (i < 0) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}

function chatListHtml(list, q) {
  if (!list.length) {
    return q
      // 조사('와/과')는 검색어 끝소리에 따라 달라진다 — 검색어가 뭐가 될지 모르니 아예 쓰지 않는다
      ? `<div class="card">${empty('search', `'${esc(q)}' 검색 결과가 없어요`, '이름이나 대화 내용의 일부로 찾을 수 있어요.')}</div>`
      : `<div class="card">${empty('chat', '아직 대화가 없어요',
          '내담자가 앱에서 채팅을 보내면<br>여기에 바로 뜨고 소리로 알려드려요.')}</div>`;
  }
  return `<div class="card pad0">
      ${list.map(t => {
        // 검색 중이라면 마지막 메시지 대신 '검색어가 걸린 메시지'를 보여줘야 쓸모가 있다
        const hit = q ? [...t.msgs].reverse().find(m => (m.text || '').toLowerCase().includes(q)) : null;
        const show = hit || t.last;
        return `<div class="thread ${t.unread ? 'unread' : ''}" data-act="room-open" data-key="${esc(t.key)}">
          ${avatar(t.clientName)}
          <div class="grow">
            <div class="row"><span class="nm grow ell">${hlight(t.clientName, q)} 님</span></div>
            <div class="pv ell">${show.from === 'counselor' ? '<span style="color:var(--accent)">나: </span>' : ''}${hlight(show.text, q)}</div>
          </div>
          <div class="rt">${relTime(show.ts)}${t.unread ? `<div class="cnt">${t.unread}</div>` : ''}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderChatList() {
  const el = $('view-chat');
  const all = threads();
  const q = CHATQ.trim().toLowerCase();
  const list = q
    ? all.filter(t => (t.clientName || '').toLowerCase().includes(q) ||
        t.msgs.some(m => (m.text || '').toLowerCase().includes(q)))
    : all;
  const total = list.reduce((s, t) => s + t.unread, 0);

  // 30초 폴링이 검색어를 지우면 아무도 검색을 못 쓴다 — 입력 중이면 목록만 갈아 끼운다
  if ($('chat-list') && busy(el)) {
    $('chat-list').innerHTML = chatListHtml(list, q);
    if ($('chat-count')) $('chat-count').innerHTML = countLine(list.length, total, q, all.length);
    return;
  }

  el.innerHTML = `
    <div class="searchbar">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg>
      <input id="chat-search" class="grow" type="text" value="${esc(CHATQ)}" placeholder="이름·대화 내용 검색" autocomplete="off">
      <button class="x" id="chat-x" data-act="chat-clear" aria-label="검색어 지우기" ${CHATQ ? '' : 'hidden'}>×</button>
    </div>
    <div class="row" style="margin:0.1rem 0.2rem 0.6rem;">
      <span class="muted grow" id="chat-count">${countLine(list.length, total, q, all.length)}</span>
      <button class="btn ghost sm" data-act="refresh">새로고침</button>
    </div>
    <div id="chat-list">${chatListHtml(list, q)}</div>`;
}

const countLine = (n, unread, q, all) =>
  q ? `'${esc(q)}' 검색 결과 ${n}개 <span style="opacity:0.6">/ 전체 ${all}개</span>`
    : `대화 ${n}개${unread ? ` · <b style="color:var(--warn)">안 읽음 ${unread}</b>` : ''}`;

function openRoom(key) {
  ROOM = key;
  $('chatroom').hidden = false;
  document.body.style.overflow = 'hidden';
  renderQuickBar();
  renderRoom(true);
}
function closeRoom() {
  ROOM = null;
  $('chatroom').hidden = true;
  document.body.style.overflow = '';
  renderChatList(); renderDots();
}
function curThread() { return threads().find(t => t.key === ROOM); }

function renderRoom(scroll) {
  const t = curThread();
  if (!t) return;
  $('room-name').textContent = t.clientName + ' 님';
  const hw = D.homework.filter(h => h.clientId && h.clientId === t.clientId);
  const bits = [];
  if (hw.length) bits.push(`숙제 ${hw.length}개 · 완료 ${hw.filter(h => h.doneAt).length}`);
  if (noteOf(t)) bits.push('📝 메모 있음');
  $('room-sub').textContent = bits.length ? bits.join(' · ') : '상담 채팅';

  const box = $('room-msgs');
  const stick = scroll || (box.scrollHeight - box.scrollTop - box.clientHeight < 120);
  let last = '';
  box.innerHTML = t.msgs.map(m => {
    let sep = '';
    if (dayKey(m.ts) !== last) { last = dayKey(m.ts); sep = `<div class="daysep"><span>${dayLabel(m.ts)}</span></div>`; }
    const time = new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const me = m.from === 'counselor';
    // 통화·숙제는 말풍선이 아니라 전용 칩으로 — 대화 흐름 속에 기록처럼 남는다
    if (/^\[통화\]/.test(m.text || '')) {
      const missed = /부재중/.test(m.text);
      return sep + `<div style="align-self: center; display: inline-flex; align-items: center; gap: 0.35rem; margin: 0.2rem auto;
        padding: 0.35rem 0.9rem; border-radius: 999px; font-size: 0.76rem; font-weight: 700;
        background: ${missed ? 'rgba(217,83,79,0.09)' : 'var(--bg)'}; border: 1px solid ${missed ? 'rgba(217,83,79,0.35)' : 'var(--line)'};
        color: ${missed ? '#c0564f' : 'var(--sub)'};">📞 ${esc(m.text.replace(/^\[통화\]\s*/, ''))} <span style="font-weight:500; font-size:0.66rem;">${time}</span></div>`;
    }
    if (/^\[숙제:/.test(m.text || '')) {
      const hm = m.text.match(/^\[숙제:[^\]]*\]\s*([\s\S]*)$/) || [];
      return sep + `<div class="line me">
        <span class="ts">${time}</span>
        <div class="bub" style="background: var(--accent); border: none;">📝 숙제를 냈어요<br><b>${esc(hm[1] || '')}</b></div>
      </div>`;
    }
    return sep + `<div class="line ${me ? 'me' : 'you'}">
        ${me ? `<span class="ts">${time}</span>` : ''}
        <div class="bub">${esc(m.text)}</div>
        ${me ? '' : `<span class="ts">${time}</span>`}
      </div>`;
  }).join('');
  if (stick) box.scrollTop = box.scrollHeight;

  // 여기까지 읽었다 — 뱃지가 계속 남아 있으면 뱃지를 아무도 안 믿게 된다
  if (t.last) { SEEN[t.key] = t.last.ts; saveSeen(); }
}

async function sendReply() {
  const t = curThread();
  const inp = $('room-input');
  const text = (inp.value || '').trim();
  if (!t || !text) return;
  inp.value = ''; inp.style.height = 'auto';
  // 낙관적 표시 — 서버 왕복을 기다리는 1초 동안 화면이 죽은 것처럼 보이면 안 된다
  D.chats.push({ id: 'tmp' + Date.now(), counselorId: t.counselorId, counselorName: t.counselorName,
    clientId: t.clientId, clientName: t.clientName, from: 'counselor', text, ts: Date.now() });
  renderRoom(true);
  const r = await postJson('/api/chat-msg', authBody({
    counselorId: t.counselorId, counselorName: ME ? ME.name : t.counselorName,
    clientId: t.clientId, clientName: t.clientName, from: 'counselor', text
  }));
  if (!r || !r.ok) toast('보내지 못했어요. 잠시 후 다시 시도해주세요.');
  else if (r.masked) toast('연락처로 보이는 내용은 가려집니다');
  await loadChats();
  renderRoom(true); renderChatList(); renderDots();
}

// ── 빠른 답장 템플릿 ──────────────────────────────────────────────────
//  상담사는 진료 사이 3분에 답장한다. 그 3분 안에 문장을 새로 짓게 하면
//  '나중에 답해야지'가 되고, 나중은 오지 않는다. 칩 하나로 문장을 꺼내 쓴다.
function renderQuickBar() {
  const bar = $('qrbar');
  if (!bar) return;
  bar.innerHTML = QR.map((t, i) =>
      `<button data-act="qr-use" data-arg="${i}" title="길게 누르면 편집">${esc(t)}</button>`).join('') +
    '<button class="edit" data-act="qr-edit">＋ 편집</button>';
}

function useQuickReply(i) {
  const t = QR[i];
  const inp = $('room-input');
  if (t == null || !inp) return;
  // 쓰던 글이 있으면 지우지 않고 뒤에 붙인다 — 지워버리면 다시는 안 누른다
  const cur = inp.value || '';
  inp.value = cur ? (cur.replace(/\s+$/, '') + ' ' + t) : t;
  inp.focus();
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
}

function openQuickSheet() {
  sheet(`
    <h3 class="serif">빠른 답장 관리</h3>
    <p class="muted" style="margin-bottom:0.9rem;">자주 쓰는 문장을 저장해 두면 대화방 입력창 위에 칩으로 뜹니다.
      <b>이 기기에만 저장</b>되고 서버로 보내지 않아요.</p>
    <div class="card pad0" style="margin-bottom:0.8rem;">
      ${QR.length ? QR.map((t, i) => `
        <div class="listrow" style="padding:0.7rem 0.9rem;">
          <span class="grow" style="font-size:0.86rem;">${esc(t)}</span>
          <button class="iconbtn" data-act="qr-del" data-arg="${i}" aria-label="삭제" style="width:32px;height:32px;color:var(--danger);">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/></svg>
          </button>
        </div>`).join('')
      : '<p class="muted" style="padding:1rem;">저장된 문장이 없어요. 아래에서 추가해 주세요.</p>'}
    </div>
    <label><span>새 문장 (100자까지)</span>
      <textarea id="qr-new" rows="2" maxlength="100" placeholder="예: 오늘 상담 어떠셨는지 한 줄만 남겨주세요"></textarea></label>
    <button class="btn" data-act="qr-add">추가하기</button>
    <button class="btn ghost" style="margin-top:0.5rem;" data-act="qr-reset">기본 문구로 되돌리기</button>`);
}

// ── 내담자 메모 (이 기기에만) ─────────────────────────────────────────
//  회기 사이에 기억해야 할 것들 — 서버로 보내지 않는다. 여기 적힌 건 상담사만 본다.
const noteKey = t => 'k:' + (t.clientId || ('n:' + t.clientName));
const noteOf = t => (NOTES[noteKey(t)] || {}).text || '';

function openNoteSheet() {
  const t = curThread();
  if (!t) return;
  const cur = NOTES[noteKey(t)] || {};
  sheet(`
    <h3 class="serif">${esc(t.clientName)} 님 메모</h3>
    <p class="muted" style="margin-bottom:0.8rem;">회기 사이에 기억해 둘 것들을 적어두세요.
      호소 문제, 지난 회기 요약, 다음에 물어볼 것.</p>
    <label><span>메모 (2000자까지)</span>
      <textarea id="note-text" rows="9" maxlength="2000" placeholder="예: 3회기 — 직장 상사와의 갈등이 핵심.&#10;다음 회기에 '거절하는 연습' 이어가기.">${esc(cur.text || '')}</textarea></label>
    <p class="muted" style="margin-bottom:0.8rem; padding:0.55rem 0.7rem; background:var(--accent-soft); border-radius:10px; color:var(--accent);">
      🔒 이 메모는 <b>내 기기에만 저장됩니다</b>. 서버로 전송되지 않고 내담자에게도 보이지 않아요.
      다만 기기를 바꾸거나 브라우저 데이터를 지우면 함께 사라집니다.</p>
    ${cur.ts ? `<p class="muted" style="margin-bottom:0.6rem;">마지막 수정 ${new Date(cur.ts).toLocaleString('ko-KR')}</p>` : ''}
    <button class="btn" data-act="note-save">메모 저장</button>
    ${cur.text ? '<button class="btn ghost" style="margin-top:0.5rem;" data-act="note-del">메모 지우기</button>' : ''}`);
}

// ── 대화방 메뉴 ───────────────────────────────────────────────────────
function openRoomMenu() {
  const t = curThread();
  if (!t) return;
  const note = noteOf(t);
  const hw = D.homework.filter(h => h.clientId && h.clientId === t.clientId);
  const mi = svg => `<span class="mi">${svg}</span>`;
  sheet(`
    <div class="row" style="gap:0.7rem; margin-bottom:0.9rem;">
      ${avatar(t.clientName)}
      <div class="grow">
        <h3 style="font-size:1rem;">${esc(t.clientName)} 님</h3>
        <p class="muted">메시지 ${t.msgs.length}개 · 숙제 ${hw.length}개</p>
      </div>
    </div>
    <button class="menurow" data-act="note-open">
      ${mi('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H15l5 5v9.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M14 4v6h6"/></svg>')}
      <span class="grow">메모<br><span class="ms">${note ? esc(note.slice(0, 26)) + (note.length > 26 ? '…' : '') : '이 기기에만 저장되는 내 기록'}</span></span>
      ${note ? '<span class="chip ok">있음</span>' : ''}
    </button>
    <button class="menurow" data-act="hw-open">
      ${mi('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2.5 2.5L16 8"/><rect x="4" y="4" width="16" height="16" rx="4"/></svg>')}
      <span class="grow">숙제 내기<br><span class="ms">${hw.length ? `완료 ${hw.filter(h => h.doneAt).length}/${hw.length}` : '아직 낸 숙제가 없어요'}</span></span>
    </button>
    <button class="menurow" data-act="qr-edit">
      ${mi('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></svg>')}
      <span class="grow">빠른 답장 관리<br><span class="ms">저장된 문장 ${QR.length}개</span></span>
    </button>
    <button class="menurow" data-act="room-refresh">
      ${mi('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>')}
      <span class="grow">대화 새로고침<br><span class="ms">지금 바로 서버에서 다시 받아오기</span></span>
    </button>`);
}

// ── 숙제 ──────────────────────────────────────────────────────────────
//  전에는 '완료 처리된 예약'에서만 낼 수 있었다. 바로상담만 한 내담자는
//  예약 행이 없어서 영영 숙제를 못 받았다. 채팅 스레드에는 clientId 가 있으므로
//  여기서 내면 그 사람에게 바로 꽂힌다 (내담자 앱은 clientId 로 폴링한다).
function openHomeworkSheet() {
  const t = curThread();
  if (!t) return;
  if (!t.clientId) { toast('이 대화에는 내담자 식별자가 없어 숙제를 보낼 수 없어요.'); return; }
  const mine = D.homework.filter(h => h.clientId === t.clientId);
  sheet(`
    <h3 class="serif">${esc(t.clientName)} 님에게 숙제 내기</h3>
    <p class="muted" style="margin-bottom:0.9rem;">오늘 안에 30분 이내로 할 수 있는 <b>행동</b> 하나로 적어주세요.
      내담자 앱의 '나를 위한 미션'에 그대로 꽂힙니다.</p>
    <label><span>과제 내용 (필수)</span>
      <textarea id="hw-text" rows="3" maxlength="200" placeholder="예: 자기 전에 오늘 잘한 일 한 가지를 적어보기"></textarea></label>
    <label><span>왜 이 과제인지 (선택) — 이유를 아는 사람이 끝까지 합니다</span>
      <input id="hw-why" maxlength="200" placeholder="예: 스스로를 깎아내리는 습관을 뒤집기 위해"></label>
    <label><span>마감일 (선택)</span>
      <input id="hw-due" type="date"></label>
    <button class="btn" data-act="hw-send">숙제 보내기</button>
    <div class="sec-title">${esc(t.clientName)} 님에게 낸 숙제 ${mine.length ? `· 완료 ${mine.filter(h => h.doneAt).length}/${mine.length}` : ''}</div>
    <div class="card">${mine.length ? hwListHtml(mine) : '<p class="muted">아직 낸 숙제가 없어요.</p>'}</div>
  `);
}

function hwListHtml(items, withClient) {
  if (!items.length) return empty('hw', '아직 낸 숙제가 없어요',
    '대화방에서 [숙제] 버튼을 누르면<br>예약이 없는 내담자에게도 바로 낼 수 있어요.');
  return items.map(h => `
    <div class="listrow" style="display:block;">
      <div class="row">
        <strong class="grow" style="font-size:0.86rem;">${esc(h.text)}</strong>
        ${h.doneAt ? '<span class="chip ok">했어요</span>' : '<span class="chip new">진행 중</span>'}
      </div>
      ${withClient && h.clientId ? `<p class="muted" style="margin-top:0.15rem;">${esc(nameOfClient(h.clientId))} 님</p>` : ''}
      ${h.why ? `<p class="muted" style="margin-top:0.15rem;">이유 · ${esc(h.why)}</p>` : ''}
      ${h.note ? `<p class="muted" style="margin-top:0.15rem; color:var(--accent);">내담자 소감 · "${esc(h.note)}"</p>` : ''}
      <p class="muted" style="margin-top:0.15rem; font-size:0.72rem;">
        낸 날 ${new Date(h.assignedAt).toLocaleDateString('ko-KR')}${h.dueAt ? ' · 마감 ' + new Date(h.dueAt).toLocaleDateString('ko-KR') : ''}${h.doneAt ? ' · 완료 ' + new Date(h.doneAt).toLocaleDateString('ko-KR') : ''}</p>
    </div>`).join('');
}

async function sendHomework() {
  const t = curThread();
  if (!t) return;
  const text = ($('hw-text').value || '').trim();
  if (!text) { toast('과제 내용을 적어주세요'); $('hw-text').focus(); return; }
  const why = ($('hw-why').value || '').trim();
  const dueStr = ($('hw-due').value || '').trim();
  // 마감은 그날 하루가 끝날 때까지로 잡는다 — 0시로 잡으면 하루를 통째로 잃는다
  const dueAt = dueStr ? new Date(dueStr + 'T23:59:00').getTime() : 0;
  const r = await postJson('/api/homework', authBody({
    clientId: t.clientId, clientName: t.clientName, text, why, dueAt
  }));
  if (!r || !r.ok) { toast((r && r.error) || '보내지 못했어요'); return; }
  closeSheet();
  toast(t.clientName + ' 님에게 숙제를 보냈어요');
  await loadHomework();
  renderRoom(); renderHome();
}

// ============================================================================
//  ③ 예약
// ============================================================================
function bookingCard(b) {
  const now = Date.now();
  const dead = DEAD.includes(b.status);
  const past = b.whenTs <= now;
  const soon = !dead && b.status === 'confirmed' && Math.abs(b.whenTs - now) < 3600000;
  const done = b.status === 'done', disputed = b.status === 'disputed', paid = b.settledAt > 0;

  const badge =
      b.status === 'cancelled' ? '<span class="chip off">내담자 취소</span>'
    : b.status === 'declined' ? '<span class="chip bad">거절함 · 전액 환불</span>'
    : b.status === 'noshow' ? '<span class="chip bad">미진행</span>'
    : b.status === 'refunded' ? '<span class="chip bad">환불함</span>'
    : disputed ? '<span class="chip bad">이의 접수 · 정산 보류</span>'
    : paid ? '<span class="chip ok">정산 완료</span>'
    : done && b.confirmAt ? '<span class="chip ok">확인됨 · 정산 대기</span>'
    : done ? '<span class="chip new">내담자 확인 대기</span>'
    : soon ? '<span class="chip new">곧 시작</span>'
    : past ? '<span class="chip new">완료 처리 필요</span>'
    : '<span class="chip ok">확정</span>';

  const hint = (!dead && !done && !disputed && past)
    ? '<p class="muted" style="margin-top:0.35rem; color:var(--warn);">상담을 마치셨다면 [상담 완료]를 눌러주세요. 눌러야 정산이 시작됩니다.</p>' : '';
  const autoNote = (done && !b.confirmAt && b.autoAt)
    ? `<p class="muted" style="margin-top:0.35rem;">내담자가 확인하지 않아도 ${new Date(b.autoAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}에 자동 확정돼요.</p>` : '';
  const disputeNote = disputed
    ? `<p class="muted" style="margin-top:0.35rem; color:var(--danger);">사유: ${esc(b.dispute)}<br>운영자가 확인 후 연락드립니다.</p>` : '';
  const noteBox = b.cnote
    ? `<p class="muted" style="margin-top:0.4rem; padding:0.45rem 0.6rem; background:var(--bg); border-radius:9px;">메모 · ${esc(b.cnote)}</p>` : '';

  const mini = (label, act, cls) =>
    `<button class="btn ${cls || 'ghost'} sm" style="margin:0.4rem 0.3rem 0 0;" data-act="${act}" data-id="${esc(b.id)}" data-nm="${esc(b.clientName)}" data-cid="${esc(b.clientId || '')}">${label}</button>`;

  let actions = '';
  if (!dead && !paid) {
    if (b.status === 'confirmed' && !past) actions += mini('예약 거절 (전액 환불)', 'bk-decline');
    if (b.status === 'confirmed' && past) {
      actions += mini('상담 완료', 'bk-done', '');
      actions += mini('미진행 처리', 'bk-refund');
    }
    actions += mini(b.cnote ? '메모 고치기' : '메모 남기기', 'bk-note');
    if (!done && !disputed && b.status === 'confirmed') actions += mini('환불', 'bk-refund');
  }

  const wd = new Date(b.whenTs);
  return `<div class="card" style="${dead ? 'opacity:0.55;' : ''}${soon || (past && b.status === 'confirmed') ? 'border-color:var(--accent);' : ''}">
      <div class="bkitem">
        <div class="bktime ${soon ? 'hot' : ''}">
          <b>${hhmm(b.whenTs)}</b><span>${wd.getMonth() + 1}/${wd.getDate()} (${DAYNM[wd.getDay()]})</span>
        </div>
        <div class="grow">
          <div class="row" style="gap:0.4rem;">
            <strong class="grow" style="font-size:0.94rem;${dead ? 'text-decoration:line-through;' : ''}">${esc(b.clientName)} 님${dead ? '' : ' · 30분'}</strong>
            ${badge}
          </div>
          <p class="muted" style="margin-top:0.3rem;">${esc(b.time)}<br>${won(b.price)}캐시${dead ? '' : ` · 내 몫 <b style="color:var(--accent)">${won(b.payout ? b.payout.counselor : 0)}캐시</b>`}</p>
          ${hint}${autoNote}${disputeNote}${noteBox}${actions}
        </div>
      </div>
    </div>`;
}

// ── 달력 뷰 ───────────────────────────────────────────────────────────
//  목록은 '다음에 뭐가 있나'에 강하고, 달력은 '이번 달이 얼마나 찼나'에 강하다.
//  둘 다 필요해서 토글로 둔다.
function calHtml() {
  const y = CAL.y, m = CAL.m;
  const first = new Date(y, m, 1);
  const lead = first.getDay();                       // 1일 앞에 비는 칸 수
  const days = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + days) / 7) * 7;
  const todayKey = ymd(Date.now());

  // 날짜별로 묶어 둔다 — 셀마다 필터를 돌리면 42번 훑게 된다
  const byDay = {};
  D.bookings.forEach(b => {
    const k = ymd(b.whenTs);
    (byDay[k] = byDay[k] || []).push(b);
  });

  let grid = DAYNM.map((d, i) => `<div class="dh ${i === 0 ? 'sun' : ''}">${d}</div>`).join('');
  for (let i = 0; i < cells; i++) {
    const dnum = i - lead + 1;
    const inMonth = dnum >= 1 && dnum <= days;
    const dt = new Date(y, m, dnum);
    const key = ymd(dt.getTime());
    const list = inMonth ? (byDay[key] || []).filter(b => !DEAD.includes(b.status)) : [];
    const needsDone = list.some(b => b.status === 'confirmed' && b.whenTs <= Date.now());
    const dots = list.slice(0, 3).map(() => `<i class="${needsDone ? 'warn' : ''}"></i>`).join('');
    grid += `<button class="cell ${inMonth ? '' : 'off'} ${key === todayKey ? 'today' : ''} ${key === CAL.sel ? 'sel' : ''}"
        ${inMonth ? `data-act="cal-day" data-arg="${key}"` : 'disabled'}>
        <span>${dnum >= 1 && dnum <= days ? dnum : ''}</span>
        <span class="row" style="gap:2px; height:5px;">${dots}</span>
      </button>`;
  }

  const selList = CAL.sel
    ? D.bookings.filter(b => ymd(b.whenTs) === CAL.sel).sort((a, b) => a.whenTs - b.whenTs)
    : [];
  const selDate = CAL.sel ? CAL.sel.split('-') : null;
  const monthCount = D.bookings.filter(b => {
    const d = new Date(b.whenTs);
    return d.getFullYear() === y && d.getMonth() === m && !DEAD.includes(b.status);
  }).length;

  return `<div class="card">
      <div class="row" style="margin-bottom:0.6rem;">
        <button class="iconbtn" data-act="cal-move" data-arg="-1" aria-label="이전 달">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <div class="grow" style="text-align:center;">
          <strong class="serif" style="font-size:1.05rem;">${y}년 ${m + 1}월</strong>
          <div class="muted">예약 ${monthCount}건</div>
        </div>
        <button class="iconbtn" data-act="cal-move" data-arg="1" aria-label="다음 달">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
      <div class="cal">${grid}</div>
      <p class="muted" style="margin-top:0.6rem; text-align:center;">점이 있는 날에 예약이 있어요 ·
        <span style="color:var(--warn); font-weight:700;">주황 점</span>은 완료 처리가 밀린 날이에요</p>
    </div>
    ${CAL.sel ? `<div class="sec-title">${selDate[1]}월 ${selDate[2]}일<span class="right muted">${selList.length}건</span></div>` +
        (selList.length ? selList.map(bookingCard).join('')
          : `<div class="card">${empty('cal', '이 날은 예약이 없어요', '비어 있는 시간도 회복에 필요합니다.')}</div>`)
      : '<p class="muted" style="text-align:center; margin-top:0.9rem;">날짜를 누르면 그 날의 예약을 볼 수 있어요.</p>'}`;
}

function renderBookings() {
  const el = $('view-book');
  if (busy(el)) return;
  const now = Date.now();
  const up = D.bookings.filter(b => b.whenTs > now && !DEAD.includes(b.status)).sort((a, b) => a.whenTs - b.whenTs);
  const pastAll = D.bookings.filter(b => !(b.whenTs > now && !DEAD.includes(b.status))).sort((a, b) => b.whenTs - a.whenTs);
  const todo = pastAll.filter(b => b.status === 'confirmed');
  const rest = pastAll.filter(b => b.status !== 'confirmed');

  const toggle = `
    <div class="row" style="margin:0.1rem 0.1rem 0.7rem;">
      <div class="seg grow" style="flex:0 0 auto;">
        <button class="${BOOKVIEW === 'list' ? 'on' : ''}" data-act="bookview" data-arg="list">목록</button>
        <button class="${BOOKVIEW === 'cal' ? 'on' : ''}" data-act="bookview" data-arg="cal">달력</button>
      </div>
      <span class="grow"></span>
      <button class="btn ghost sm" data-act="refresh">새로고침</button>
    </div>`;

  if (!D.bookings.length) {
    el.innerHTML = toggle + `<div class="card">${empty('cal', '아직 예약이 없어요',
      '내담자가 앱에서 예약하면 여기에 실시간으로 떠요.<br>[내 정보 → 예약 가능 시간]을 열어두면 더 빨리 찹니다.')}</div>`;
    return;
  }
  if (BOOKVIEW === 'cal') { el.innerHTML = toggle + calHtml(); return; }

  el.innerHTML = toggle +
    (todo.length ? `<div class="sec-title" style="color:var(--warn);">완료 처리가 필요해요<span class="right">${todo.length}건</span></div>${todo.map(bookingCard).join('')}` : '') +
    `<div class="sec-title">다가오는 예약<span class="right muted">${up.length}건</span></div>` +
    (up.length ? up.map(bookingCard).join('') : `<div class="card">${empty('cal', '앞으로 잡힌 예약이 없어요', '예약 가능 시간을 넓혀두면 매칭이 늘어요.')}</div>`) +
    (rest.length ? `<div class="sec-title">지난 예약<span class="right muted">${rest.length}건</span></div>${rest.slice(0, 40).map(bookingCard).join('')}` : '');
}

// ============================================================================
//  ④ 정산
// ============================================================================
function renderMoney() {
  const el = $('view-money');
  if (busy(el)) return;
  const earned = D.bookings.filter(isEarned);
  const total = earned.reduce((s, b) => s + (b.payout ? b.payout.counselor : 0), 0);
  const ms = monthStart();
  const month = earned.filter(b => b.whenTs >= ms);
  const monthSum = month.reduce((s, b) => s + (b.payout ? b.payout.counselor : 0), 0);
  const paid = earned.filter(b => b.settledAt > 0).reduce((s, b) => s + b.payout.counselor, 0);
  const waiting = total - paid;

  // 최근 6개월 — '이번 달이 지난달보다 나은가'는 숫자 하나로는 절대 안 보인다
  const months = [];
  const mref = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(mref.getFullYear(), mref.getMonth() - i, 1);
    const from = d.getTime(), to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const v = earned.filter(b => b.whenTs >= from && b.whenTs < to)
      .reduce((s, b) => s + (b.payout ? b.payout.counselor : 0), 0);
    months.push({ label: (d.getMonth() + 1) + '월', v, n: earned.filter(b => b.whenTs >= from && b.whenTs < to).length });
  }
  const prev = months[4] ? months[4].v : 0;
  const diff = monthSum - prev;
  const trend = !prev && !monthSum ? '아직 기록이 쌓이는 중이에요'
    : diff > 0 ? `지난달보다 <b style="color:var(--accent)">+${won(diff)}캐시</b>`
    : diff < 0 ? `지난달보다 <b style="color:var(--warn)">${won(diff)}캐시</b>`
    : '지난달과 같아요';

  const chartCard = `<div class="card">
      <div class="row" style="margin-bottom:0.5rem;">
        <strong class="grow" style="font-size:0.9rem;">최근 6개월 수입</strong>
        <span class="muted">${trend}</span>
      </div>
      <div class="chartwrap">${barchart(months)}</div>
      <p class="muted" style="margin-top:0.3rem;">막대 위 숫자는 천 캐시 단위예요 (예: 120k = 120,000캐시)</p>
    </div>`;

  const rows = earned.slice().sort((a, b) => b.whenTs - a.whenTs).slice(0, 60).map(b => `
    <div class="listrow">
      ${avatar(b.clientName, 'sm')}
      <div class="grow">
        <strong style="font-size:0.86rem;">${esc(b.clientName)} 님</strong>
        <div class="muted">${esc(b.time)}</div>
      </div>
      <div style="text-align:right;">
        <strong style="font-size:0.88rem; color:var(--accent);">+${won(b.payout ? b.payout.counselor : 0)}</strong>
        <div>${b.settledAt ? '<span class="chip ok">지급 완료</span>'
              : b.status === 'done' ? '<span class="chip gold">정산 대기</span>'
              : '<span class="chip off">완료 처리 전</span>'}</div>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="card" style="background:linear-gradient(135deg, var(--accent-soft), #fff);">
      <div class="muted">이번 달 내 수입</div>
      <div class="serif" style="font-size:2rem; color:var(--accent); line-height:1.3;">${won(monthSum)}<span style="font-size:0.9rem;">캐시</span></div>
      <div class="row" style="margin-top:0.6rem; gap:1.4rem;">
        <div><div class="muted">이번 달 상담</div><strong>${month.length}건</strong></div>
        <div><div class="muted">누적 수입</div><strong>${won(total)}캐시</strong></div>
        <div><div class="muted">지급 대기</div><strong style="color:var(--warn);">${won(waiting)}캐시</strong></div>
      </div>
      <p class="muted" style="margin-top:0.6rem;">상담사 70% · 결제 수수료 3% · 플랫폼 27%</p>
      <button class="btn" style="margin-top:0.7rem;" ${waiting ? '' : 'disabled'} data-act="withdraw">출금 신청</button>
    </div>
    <div class="sec-title">수입 흐름</div>
    ${chartCard}
    <div class="sec-title">계좌</div>
    ${foldPayout()}
    <div class="sec-title">정산 내역<span class="right muted">${earned.length ? earned.length + '건' : ''}</span></div>
    <div class="card ${rows ? 'pad0' : ''}" ${rows ? 'style="padding:0 1.1rem;"' : ''}>${rows ||
      empty('money', '완료된 상담이 아직 없어요', '상담을 마치고 [상담 완료]를 누르면<br>여기에 정산이 쌓이기 시작해요.')}</div>`;
}

// ── 내 정보 · 시간표 · 계좌 (기존 기능 전부 유지) ──────────────────────
// 화면을 다시 그리기 전에 지금 칸에 적혀 있는 값을 ME 로 옮긴다.
//  (태그 칩 하나 지웠다고 방금 고쳐 쓴 소개글이 날아가면 아무도 안 고친다)
function syncProfileForm() {
  if (!ME || !$('pf-hospital')) return;
  const g = id => ($(id) || {}).value || '';
  ME.hospital = g('pf-hospital'); ME.addr = g('pf-addr'); ME.tel = g('pf-tel');
  ME.license = g('pf-license'); ME.intro = g('pf-intro');
  ME.price = parseInt(g('pf-price'), 10) || 0;
  ME.callRate = parseInt(g('pf-callrate'), 10) || 0;
}

function foldProfile() {
  if (!ME) return '';
  const f = (id, label, val, ph, type, hint) => `
    <label><span>${label}</span>
      <input id="${id}" type="${type || 'text'}" value="${esc(String(val == null ? '' : val))}" placeholder="${esc(ph || '')}">
      ${hint ? `<span class="muted" style="margin-top:0.2rem;">${hint}</span>` : ''}</label>`;
  const tags = ME.tags || [];
  const sum = [ME.hospital || '소속 미입력', won(ME.price) + '원'].join(' · ');
  return fold('profile', '내 정보 수정', esc(sum), `
    <p style="font-weight:700; margin:0.8rem 0 0.2rem;">${esc(ME.name)}
      <span class="muted" style="font-weight:500;">${esc(ME.email || '이메일 미등록')}</span></p>
    <p class="muted" style="margin-bottom:0.8rem;">이름은 자격 확인을 거친 값이라 바꿀 수 없어요.
      개명 등으로 바뀌었다면 운영자에게 문의해 주세요.</p>
    ${f('pf-hospital', '소속 기관', ME.hospital, '예: OO 정신건강의학과 (OO점)')}
    ${f('pf-tel', '연락처', ME.tel, '예: 02-1234-5678 (기관 대표번호)')}
    ${f('pf-addr', '주소', ME.addr, '예: 서울 서대문구 …')}
    ${f('pf-license', '자격', ME.license, '예: 임상심리전문가 1급')}
    ${f('pf-price', '예약 상담료 · 30분 (원)', ME.price, '40000', 'number')}
    ${f('pf-callrate', '바로상담 요율 (30초당 캐시)', ME.callRate, '500', 'number',
        '0 이면 바로상담 요금이 붙지 않아요. 30초마다 이 금액이 차감됩니다.')}
    <label><span>전문 분야 (최대 6개)</span>
      <div class="row" style="flex-wrap:wrap; gap:0.3rem; margin-bottom:0.4rem;">
        ${tags.length ? tags.map((t, i) => `<span class="chip ok" style="gap:0.3rem;">${esc(t)}
            <button data-act="tag-del" data-arg="${i}" aria-label="삭제"
              style="all:unset; cursor:pointer; font-weight:900; opacity:0.7;">×</button></span>`).join('')
          : '<span class="muted">아직 없어요. 내담자가 나를 찾는 검색어가 됩니다.</span>'}
      </div>
      ${tags.length >= 6 ? '<span class="muted">6개까지만 넣을 수 있어요.</span>' : `<div class="row">
        <input id="pf-tag" class="grow" maxlength="20" placeholder="예: 불안장애">
        <button class="btn ghost sm" data-act="tag-add">추가</button></div>`}
    </label>
    <label><span>소개 (600자까지 · 내담자에게 보입니다)</span>
      <textarea id="pf-intro" rows="4" maxlength="600" placeholder="내담자에게 보일 짧은 소개">${esc(ME.intro)}</textarea></label>
    <button class="btn" id="pf-save" data-act="save-profile">내 정보 저장</button>`);
}

// 24시간. 마음이 제일 무너지는 시간은 낮이 아니라 새벽이라, 그 시간대를 막아두면 안 된다.
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00');
// 24칸 × 7일 = 168개를 하나씩 누르게 하면 아무도 안 쓴다. 묶어서 한 번에 켠다.
const BANDS = [
  { key: 'dawn', label: '새벽 0-6', hrs: HOURS.slice(0, 7) },
  { key: 'morn', label: '오전 7-11', hrs: HOURS.slice(7, 12) },
  { key: 'noon', label: '오후 12-17', hrs: HOURS.slice(12, 18) },
  { key: 'night', label: '저녁 18-23', hrs: HOURS.slice(18, 24) }
];
const _getDay = d => { ME.slots = ME.slots || {}; return ME.slots[d] || ME.slots[String(d)] || []; };
function _setDay(d, list) { ME.slots = ME.slots || {}; delete ME.slots[String(d)]; ME.slots[d] = [...new Set(list)].sort(); }

function foldSlots() {
  if (!ME) return '';
  const sel = ME.slots || {};
  const chip = (label, act, d, arg) =>
    `<button class="btn ghost sm" style="padding:0.22rem 0.5rem; min-height:0; font-size:0.68rem; border-radius:999px;"
       data-act="${act}" data-d="${d}" data-arg="${arg || ''}">${label}</button>`;

  const grid = DAYNM.map((dn, d) => {
    const on = sel[d] || sel[String(d)] || [];
    const bandRows = BANDS.map(b => {
      const allOn = b.hrs.every(h => on.includes(h));
      return `<div class="row" style="gap:0.3rem; margin-bottom:0.22rem;">
          <button data-act="band" data-d="${d}" data-arg="${b.key}" title="${b.label} 전체"
            style="all:unset; cursor:pointer; flex-shrink:0; width:4.6rem; font-size:0.66rem; font-weight:700; color:${allOn ? 'var(--accent)' : 'var(--sub)'};">${b.label}</button>
          <div style="display:flex; flex-wrap:wrap; gap:0.2rem;">
            ${b.hrs.map(h => `<button data-act="slot" data-d="${d}" data-arg="${h}"
              style="all:unset; cursor:pointer; font-size:0.67rem; padding:0.2rem 0.34rem; border-radius:6px;
                     border:1px solid ${on.includes(h) ? 'var(--accent)' : 'var(--line)'};
                     background:${on.includes(h) ? 'var(--accent)' : 'transparent'};
                     color:${on.includes(h) ? '#fff' : 'var(--sub)'};">${h.slice(0, 2)}</button>`).join('')}
          </div>
        </div>`;
    }).join('');
    return `<div style="padding:0.5rem 0; border-top:1px solid var(--line);">
        <div class="row" style="gap:0.35rem; margin-bottom:0.35rem; flex-wrap:wrap;">
          <strong style="font-size:0.84rem; width:1.2rem;">${dn}</strong>
          <span class="muted grow">${on.length ? on.length + '시간 열림' : '예약 안 받음'}</span>
          ${chip('전체', 'fillday', d, 'all')}${chip('업무시간', 'fillday', d, 'work')}
          ${chip('비우기', 'fillday', d, 'none')}${chip('전 요일 복사', 'copyday', d)}
        </div>${bandRows}
      </div>`;
  }).join('');

  const total = Object.values(sel).reduce((s, a) => s + (a || []).length, 0);
  const openDays = Object.keys(sel).filter(k => (sel[k] || []).length).length;
  return fold('slots', '예약 가능 시간', total ? `${openDays}일 · 주 ${total}시간` : '아직 안 정함', `
    <p class="muted" style="margin:0.8rem 0 0.5rem;">켜 둔 시간에만 내담자가 예약할 수 있어요. 비워 두면 그 요일은 예약을 받지 않습니다.</p>
    ${grid}
    <label style="margin-top:0.6rem;"><span>쉬는 날 (쉼표로 구분, 예: 2026-08-15)</span>
      <input id="sl-off" value="${esc((ME.offdays || []).join(', '))}" placeholder="2026-08-15, 2026-09-01"></label>
    <button class="btn" id="sl-save" data-act="save-slots">시간표 저장</button>`);
}

// 알림·소리 — 진료실에서 앱을 여는 상담사가 제일 먼저 찾는 스위치다.
//  '내 정보' 옆에 두되, 전화 벨은 여기서 끌 수 없다는 걸 분명히 적어 둔다.
function foldPrefs() {
  const notiOk = ('Notification' in window) && Notification.permission === 'granted';
  const notiDenied = ('Notification' in window) && Notification.permission === 'denied';
  return fold('pref', '알림 · 소리', SOUND ? '알림음 켜짐' : '알림음 꺼짐', `
    <div class="row" style="margin-top:0.9rem;">
      <div class="grow">
        <strong style="font-size:0.9rem;">새 메시지 알림음</strong>
        <p class="muted" style="margin-top:0.2rem;">내담자 메시지가 도착하면 짧은 소리로 알려드려요.
          회기 중에는 꺼두셔도 됩니다.</p>
      </div>
      <button class="sw ${SOUND ? 'on' : ''}" data-act="sound" aria-label="알림음 토글"><i></i></button>
    </div>
    <p class="muted" style="margin-top:0.6rem; padding:0.5rem 0.65rem; background:var(--bg); border-radius:10px;">
      걸려오는 <b>전화 벨은 이 설정과 상관없이 울립니다</b>. 놓치면 되돌릴 수 없는 건 통화뿐이라 일부러 남겨뒀어요.</p>
    <div class="row" style="margin-top:0.8rem;">
      <div class="grow"><strong style="font-size:0.9rem;">기기 알림</strong>
        <p class="muted" style="margin-top:0.2rem;">${notiOk ? '켜져 있어요. 화면을 꺼둬도 전화와 메시지를 받습니다.'
          : notiDenied ? '브라우저에서 차단돼 있어요. 주소창 자물쇠 → 알림 허용으로 바꿔주세요.'
          : '아직 허용하지 않았어요.'}</p></div>
      ${notiOk ? '<span class="chip ok">허용됨</span>' : notiDenied ? '<span class="chip bad">차단됨</span>'
        : '<button class="btn sm" data-act="ask-noti">켜기</button>'}
    </div>`);
}

function foldPayout() {
  if (!ME) return '';
  const p = ME.payout || { set: false };
  return fold('payout', '정산 계좌',
    p.set ? `${esc(p.bank)} ${esc(p.masked)}` : '<b style="color:var(--danger);">미등록 — 정산 보류</b>', `
    <div style="margin-top:0.8rem;"></div>
    ${p.set
      ? `<p style="margin-bottom:0.6rem;"><b>${esc(p.bank)}</b> ${esc(p.masked)} <span class="muted">· 예금주 ${esc(p.holder)}</span></p>
         <p class="muted" style="margin-bottom:0.7rem;">보안을 위해 전체 번호는 다시 보여드리지 않아요. 바꾸시려면 새로 입력해 주세요.</p>`
      : '<p class="muted" style="margin-bottom:0.7rem;">정산받을 계좌를 등록해 주세요. 등록 전에는 정산이 보류됩니다.</p>'}
    <label><span>은행</span><input id="po-bank" placeholder="예: 국민은행" value="${esc(p.bank || '')}"></label>
    <label><span>계좌번호</span><input id="po-no" placeholder="숫자만" inputmode="numeric" autocomplete="off"></label>
    <label><span>예금주</span><input id="po-holder" placeholder="예금주" value="${esc(p.holder || '')}"></label>
    <button class="btn" id="po-save" data-act="save-payout">계좌 저장</button>
    <p class="muted" style="margin-top:0.6rem;">계좌 정보는 정산 목적으로만 쓰이며 내담자에게는 절대 보이지 않습니다.</p>`);
}

// ============================================================================
//  걸려오는 전화
//   보이스톡처럼 벨이 울리고, 받으면 앱 안에서 바로 연결된다.
//   전화번호는 오가지 않는다 — 유출할 번호 자체가 없다.
// ============================================================================
let CUR_CALL = null;

async function pollIncoming() {
  if (CUR_CALL || (!SESSION && !CODE)) return;
  const d = await getJson('/api/rtc/incoming?' + authQS());
  if (d && d.call) showIncoming(d.call);
}

// 통화 화면에 이름을 띄우려면 clientId 로 되짚어야 한다 — /rtc/incoming 은 이름을 주지 않는다
function nameOfClient(clientId) {
  if (!clientId) return '내담자';
  const b = D.bookings.find(x => x.clientId === clientId);
  if (b) return b.clientName;
  const m = D.chats.find(x => x.clientId === clientId);
  return m ? m.clientName : '내담자';
}

// 한 화면을 발신·수신이 같이 쓴다 — 버튼만 상황에 맞게 갈아끼운다.
//  발신 중에 거절/받기가 보이면 자기 전화를 자기가 받는 촌극이 벌어진다.
function callBtns(mode) {
  const no = $('call-btn-no'), yes = $('call-btn-yes'), end = $('call-btn-end');
  if (no) no.hidden = mode !== 'incoming';
  if (yes) yes.hidden = mode !== 'incoming';
  if (end) end.hidden = mode === 'incoming';
}

function showIncoming(call) {
  if (CUR_CALL) return;
  CUR_CALL = call;
  callBtns('incoming');
  // 발신자에게 "지금 벨 울리는 중"을 알린다 → 저쪽 화면이 '통화 대기 중…'으로 바뀐다
  try {
    fetch(API_BASE + '/api/rtc/signal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: call.room, sender: 'counselor', kind: 'ring', payload: '1' })
    }).catch(() => {});
  } catch (e) {}
  $('call-who').textContent = nameOfClient(call.clientId) + ' 님';
  $('call-st').textContent = '걸려온 상담 전화';
  $('call-clock').textContent = '00:00';
  $('callov').hidden = false;
  ringStart();
  // 발신자가 끊었는데 벨이 계속 울리면 고문이다 — 2.5초마다 생사를 확인한다
  clearInterval(call.watch);
  call.watch = setInterval(async () => {
    if (!CUR_CALL || CUR_CALL.id !== call.id) { clearInterval(call.watch); return; }
    const st = await getJson('/api/rtc/state?callId=' + encodeURIComponent(call.id));
    if (st && st.ended) {
      clearInterval(call.watch);
      ringStop();
      $('callov').hidden = true;
      CUR_CALL = null;
      toast('상대방이 통화를 취소했어요');
      loadChats().then(() => { renderChatList(); renderDots(); });
    }
  }, 2500);
}

async function answerCall() {
  ringStop();
  if (!CUR_CALL) return;
  clearInterval(CUR_CALL.watch);
  callBtns('active'); // 받았다 — 이제 남은 버튼은 종료뿐
  $('call-st').textContent = '연결 중…';
  window.RtcCall.onEvent = (type, d) => {
    if (type === 'connected') $('call-st').textContent = '통화 중';
    if (type === 'tick') {
      const sec = Math.floor(d.ms / 1000);
      $('call-clock').textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }
    if (type === 'remote-hangup') closeCall();
    if (type === 'audio-blocked') $('call-st').textContent = '🔇 소리가 막혔어요 — 화면을 한 번 탭해주세요';
    if (type === 'audio-ok') $('call-st').textContent = '통화 중';
    if (type === 'error') $('call-st').textContent = d.message || '연결 실패';
  };
  await window.RtcCall.answer({ room: CUR_CALL.room, callId: CUR_CALL.id });
}

async function rejectCall() {
  ringStop();
  if (CUR_CALL) await postJson('/api/rtc/end', { callId: CUR_CALL.id, by: 'counselor' });
  closeCall();
}

// ============================================================================
//  상담사 → 내담자 발신 — 숙제를 안 하거나 부재중을 남긴 내담자에게 먼저 건다.
//  내담자에게는 요금이 붙지 않는다 (rate 0).
// ============================================================================
async function callClient(clientId, clientName) {
  if (CUR_CALL) { toast('이미 통화 중이에요'); return; }
  CUR_CALL = { out: true, clientId };
  callBtns('outgoing'); // 발신 화면엔 [종료]만
  $('call-who').textContent = (clientName || nameOfClient(clientId)) + ' 님';
  $('call-st').textContent = '전화 거는 중…';
  $('call-clock').textContent = '00:00';
  $('callov').hidden = false;
  window.RtcCall.onEvent = (type, d) => {
    if (type === 'peer-ringing') $('call-st').textContent = '통화 대기 중…';
    if (type === 'connected') $('call-st').textContent = '통화 중';
    if (type === 'unstable') $('call-st').textContent = '연결이 불안정합니다…';
    if (type === 'stable') $('call-st').textContent = '통화 중';
    if (type === 'tick') {
      const sec = Math.floor(d.ms / 1000);
      $('call-clock').textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }
    if (type === 'remote-hangup') closeCall();
    if (type === 'audio-blocked') $('call-st').textContent = '🔇 소리가 막혔어요 — 화면을 한 번 탭해주세요';
    if (type === 'audio-ok') $('call-st').textContent = '통화 중';
    if (type === 'error') { $('call-st').textContent = d.message || '연결 실패'; }
  };
  const auth = {};
  if (SESSION) auth.session = SESSION; else if (CODE) auth.code = CODE;
  const ok = await window.RtcCall.call({
    counselorId: ME ? ME.id : '', clientId, rate: 0,
    as: 'counselor', startPath: '/api/rtc/start-c2c', auth
  });
  if (ok) {
    CUR_CALL.id = window.RtcCall.callId; CUR_CALL.room = window.RtcCall.room;
    // 60초 무응답이면 자동으로 접는다 — 부재중 기록은 서버가 남긴다
    clearTimeout(CUR_CALL.missTimer);
    CUR_CALL.missTimer = setTimeout(() => {
      if (CUR_CALL && CUR_CALL.out && window.RtcCall.callId && !window.RtcCall.connectAt) {
        $('call-st').textContent = '받지 않아요 — 부재중으로 남겼어요';
        setTimeout(closeCall, 1500);
      }
    }, 60000);
  } else {
    $('call-st').textContent = '연결하지 못했어요 (내담자 앱이 꺼져 있으면 알림으로 전달돼요)';
    setTimeout(closeCall, 2200);
  }
}

async function closeCall() {
  ringStop();
  if (CUR_CALL) clearInterval(CUR_CALL.watch);
  try { if (window.RtcCall && window.RtcCall.callId) await window.RtcCall.hangup('counselor'); } catch (e) {}
  $('callov').hidden = true;
  CUR_CALL = null;
  loadChats().then(() => { renderChatList(); renderDots(); });   // 통화 기록이 채팅에 남는다
}

// ============================================================================
//  푸시 · 서비스워커
//   폴링은 탭이 뒤로 가는 순간 죽는다. 그래서 푸시가 있어야 한다.
//   본문은 싣지 않는다(암호화가 필요해진다). 깨우기만 하고
//   서비스워커가 서버에 다시 물어본다. sw.js 의 push 핸들러 참고.
// ============================================================================
const VAPID_PUB = 'BG_UE9SHpc89xc3kpLthgs4q1oFPHzA_6xUm25mxOYPaSnirh-hbUxEKThUB3iRY8jlRxxLREM1rnDp_qUvI9uc';
let SWREG = null;

function b64ToU8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  // updateViaCache:'none' — sw.js 가 HTTP 캐시를 거치면 새 버전을 못 본다
  try { SWREG = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }); } catch (e) { return; }
  try { SWREG.update(); } catch (e) {}
  navigator.serviceWorker.addEventListener('message', ev => {
    const d = ev.data || {};
    if (d.type === 'push' && d.call) showIncoming(d.call);
    if (d.type === 'push' && !d.call) loadChats().then(() => { renderChatList(); renderDots(); });
    if (d.type === 'open-call') pollIncoming();
  });
}

function tellSwWhoIAm() {
  if (!ME) return;
  // 서비스워커도 서버에 물어보려면 자격증명이 있어야 한다.
  //  같은 출처의 캐시에만 들어가므로 localStorage 와 노출 범위가 같다.
  const msg = { type: 'me', id: ME.id, auth: authQS() };
  if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(msg);
  else if (SWREG && SWREG.active) SWREG.active.postMessage(msg);
}

async function enablePush() {
  if (!SWREG || !ME || !('PushManager' in window)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    let sub = await SWREG.pushManager.getSubscription();
    if (!sub) sub = await SWREG.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUB) });
    tellSwWhoIAm();
    await postJson('/api/push/subscribe', authBody({ sub: sub.toJSON() }));
  } catch (e) { /* 푸시가 안 되어도 앱은 그대로 돌아간다 */ }
}

// ============================================================================
//  바텀시트
// ============================================================================
function sheet(html) {
  $('sheet-body').innerHTML = '<div class="grab"></div>' + html;
  $('sheet').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('sheet').hidden = true;
  if (!ROOM) document.body.style.overflow = '';
}

// ============================================================================
//  동작 — 클릭 한 곳에서 받는다 (인라인 onclick 은 따옴표 하나에 무너진다)
// ============================================================================
const ACT = {
  tab: (el) => setTab(el.dataset.tab),
  refresh: () => { loadAll(); toast('새로고침했어요'); },
  logout,
  fold: (el) => { OPEN[el.dataset.key] = !OPEN[el.dataset.key]; renderHome(); renderMoney(); },
  'ask-noti': askNotify,

  presence: async (el) => {
    const on = el.dataset.on === '1';
    el.classList.toggle('on', on);   // 눌린 즉시 움직여야 '먹었다'고 느낀다
    await postJson('/api/presence', authBody({ available: on }));
    await loadPresence(); renderHome();
  },
  'force-end': async (el) => {
    if (!confirm('통화 회선을 수동으로 해제할까요?\n(내담자 앱이 비정상 종료된 경우에만 사용하세요)')) return;
    await postJson('/api/call/end', authBody({ counselorId: el.dataset.id }));
    await loadPresence(); renderHome();
  },

  'inbox-open': async (el) => {
    const id = el.dataset.id;
    OPEN['ib-' + id] = !OPEN['ib-' + id];
    renderHome();
    if (OPEN['ib-' + id]) {
      await postJson('/api/inbox/read', authBody({ id }));
      const it = D.inbox.find(x => x.id === id);
      if (it) it.read = true;
      renderDots();
    }
  },
  'rv-reply': async (el) => {
    const inp = $('rvr-' + el.dataset.id);
    const t = (inp.value || '').trim();
    if (!t) return;
    inp.blur();
    await postJson('/api/reviews/reply', authBody({ id: el.dataset.id, text: t }));
    await loadReviews(); renderHome();
  },

  'room-open': (el) => openRoom(el.dataset.key),
  'room-close': closeRoom,
  'room-send': sendReply,
  'room-menu': openRoomMenu,
  'room-refresh': async () => { closeSheet(); await loadChats(); renderRoom(true); renderChatList(); renderDots(); toast('대화를 새로 받아왔어요'); },
  'hw-open': () => { closeSheet(); openHomeworkSheet(); },
  'hw-send': sendHomework,
  'sheet-close': closeSheet,

  // ── 빠른 답장 ──
  'qr-use': (el) => useQuickReply(+el.dataset.arg),
  'qr-edit': () => openQuickSheet(),
  'qr-add': () => {
    const v = (($('qr-new') || {}).value || '').trim();
    if (!v) { toast('문장을 적어주세요'); return; }
    if (QR.length >= 12) { toast('빠른 답장은 12개까지 저장할 수 있어요'); return; }
    QR.push(v); lsSet('pro_quickreply', QR);
    renderQuickBar(); openQuickSheet();
    toast('빠른 답장을 추가했어요');
  },
  'qr-del': (el) => {
    QR.splice(+el.dataset.arg, 1); lsSet('pro_quickreply', QR);
    renderQuickBar(); openQuickSheet();
  },
  'qr-reset': () => {
    if (!confirm('저장한 문장을 지우고 기본 3개로 되돌릴까요?')) return;
    QR = QR_DEFAULT.slice(); lsSet('pro_quickreply', QR);
    renderQuickBar(); openQuickSheet();
    toast('기본 문구로 되돌렸어요');
  },

  // ── 내담자 메모 (이 기기에만) ──
  'note-open': openNoteSheet,
  'note-save': () => {
    const t = curThread();
    if (!t) return;
    const v = (($('note-text') || {}).value || '').trim();
    if (v) NOTES[noteKey(t)] = { text: v, ts: Date.now() };
    else delete NOTES[noteKey(t)];
    lsSet('pro_notes', NOTES);
    closeSheet(); renderRoom();
    toast(v ? '메모를 저장했어요 (이 기기에만)' : '메모를 비웠어요');
  },
  'note-del': () => {
    const t = curThread();
    if (!t || !confirm('이 내담자의 메모를 지울까요? 되돌릴 수 없어요.')) return;
    delete NOTES[noteKey(t)];
    lsSet('pro_notes', NOTES);
    closeSheet(); renderRoom();
    toast('메모를 지웠어요');
  },

  // ── 채팅 검색 ──
  'chat-clear': () => { CHATQ = ''; renderChatList(); },

  // ── 예약 목록 · 달력 ──
  bookview: (el) => {
    BOOKVIEW = el.dataset.arg;
    lsSet('pro_bookview', BOOKVIEW);
    // 달력을 처음 열면 오늘이 선택돼 있어야 한 번 더 누르지 않는다
    if (BOOKVIEW === 'cal' && !CAL.sel) {
      const n = new Date();
      CAL.y = n.getFullYear(); CAL.m = n.getMonth(); CAL.sel = ymd(Date.now());
    }
    renderBookings();
  },
  'cal-move': (el) => {
    const d = new Date(CAL.y, CAL.m + (+el.dataset.arg), 1);
    CAL.y = d.getFullYear(); CAL.m = d.getMonth();
    renderBookings();
  },
  'cal-day': (el) => {
    CAL.sel = CAL.sel === el.dataset.arg ? '' : el.dataset.arg;
    renderBookings();
  },

  // ── 소리 ──
  sound: () => {
    SOUND = !SOUND;
    lsSet('pro_sound', SOUND);
    renderHome();
    if (SOUND) { unlockAudio(); chime(); toast('알림음을 켰어요'); }
    else toast('알림음을 껐어요 (전화 벨은 그대로 울려요)');
  },

  // ── 예약 ──
  'bk-decline': async (el) => {
    if (!confirm(`${el.dataset.nm} 님의 예약을 거절할까요?\n내담자에게 전액 환불되며 취소 알림이 전달됩니다.\n(부득이한 경우에만 — 잦은 거절은 노출에 불이익)`)) return;
    await postJson('/api/bookings/decline', authBody({ id: el.dataset.id }));
    await loadBookings(); renderBookings(); renderDots();
  },
  'bk-done': async (el) => {
    if (!confirm(`${el.dataset.nm} 님과의 상담을 마치셨나요?\n\n완료로 표시하면 내담자 확인을 거쳐 정산 대상이 됩니다.\n되돌릴 수 없어요.`)) return;
    const note = prompt('다음 회기를 위한 메모를 남기시겠어요? (내담자에게는 보이지 않아요)', '') || '';
    const r = await postJson('/api/bookings/done', authBody({ id: el.dataset.id, note }));
    if (!r || !r.ok) { toast((r && r.error) || '처리하지 못했어요'); return; }
    await loadBookings(); renderBookings(); renderMoney(); renderDots();
    toast('완료 처리했어요. 정산이 시작됩니다.');
  },
  'bk-refund': async (el) => {
    const why = prompt(`${el.dataset.nm} 님 상담을 환불 처리합니다.\n사유를 적어주세요 (내담자에게 전달됩니다):`, '');
    if (why === null) return;
    if (!confirm('전액 환불로 처리할까요? 이 상담은 정산에서 빠집니다.')) return;
    const r = await postJson('/api/bookings/refund', authBody({ id: el.dataset.id, why: (why || '').trim() }));
    if (!r || !r.ok) { toast((r && r.error) || '처리하지 못했어요'); return; }
    await loadBookings(); renderBookings(); renderMoney(); renderDots();
  },
  'bk-note': async (el) => {
    const cur = (D.bookings.find(b => b.id === el.dataset.id) || {}).cnote || '';
    const v = prompt('상담 메모 (내담자에게는 보이지 않아요)', cur);
    if (v === null) return;
    await postJson('/api/bookings/note', authBody({ id: el.dataset.id, note: v }));
    await loadBookings(); renderBookings();
  },

  withdraw: () => alert('출금 신청이 접수되었습니다. (데모)\n실서비스에서는 등록 계좌로 정산됩니다.'),

  // ── 프로필 · 시간표 · 계좌 ──
  settings: () => {
    setTab('home');
    OPEN.profile = true;
    renderHome();
    const c = document.querySelectorAll('#view-home .fold')[0];
    if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'tag-add': () => {
    const v = (($('pf-tag') || {}).value || '').trim();
    syncProfileForm();
    if (!v) return;
    ME.tags = [...new Set([...(ME.tags || []), v])].slice(0, 6);
    renderHome();
  },
  'tag-del': (el) => {
    syncProfileForm();
    ME.tags = (ME.tags || []).filter((_, i) => i !== +el.dataset.arg);
    renderHome();
  },
  'save-profile': async (el) => {
    syncProfileForm();
    el.disabled = true; el.textContent = '저장 중…';
    const r = await postJson('/api/me', authBody({
      hospital: ME.hospital, addr: ME.addr, tel: ME.tel, license: ME.license,
      intro: ME.intro, price: ME.price, callRate: ME.callRate, tags: ME.tags || []
    }));
    el.disabled = false; el.textContent = '내 정보 저장';
    if (!r || !r.ok) { toast((r && r.error) || '저장하지 못했어요'); return; }
    toast('내 정보를 저장했어요');
    await loadMe(); renderHome();
  },
  slot: (el) => {
    const d = +el.dataset.d, h = el.dataset.arg;
    const cur = new Set(_getDay(d));
    cur.has(h) ? cur.delete(h) : cur.add(h);
    _setDay(d, [...cur]); renderHome();
  },
  band: (el) => {
    const d = +el.dataset.d, b = BANDS.find(x => x.key === el.dataset.arg);
    if (!b) return;
    const on = _getDay(d);
    const allOn = b.hrs.every(h => on.includes(h));
    _setDay(d, allOn ? on.filter(h => !b.hrs.includes(h)) : on.concat(b.hrs));
    renderHome();
  },
  fillday: (el) => {
    const d = +el.dataset.d, mode = el.dataset.arg;
    if (mode === 'all') _setDay(d, HOURS.slice());
    else if (mode === 'none') _setDay(d, []);
    else _setDay(d, ['10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
    renderHome();
  },
  copyday: (el) => {
    const d = +el.dataset.d;
    const src = _getDay(d).slice();
    if (!confirm(`${DAYNM[d]}요일 시간표를 나머지 요일에도 똑같이 적용할까요?`)) return;
    for (let i = 0; i <= 6; i++) _setDay(i, src);
    renderHome();
  },
  'save-slots': async (el) => {
    el.disabled = true; el.textContent = '저장 중…';
    const off = ($('sl-off').value || '').split(',').map(x => x.trim()).filter(Boolean);
    const r = await postJson('/api/me/slots', authBody({ slots: ME.slots || {}, offdays: off }));
    el.disabled = false; el.textContent = '시간표 저장';
    if (!r || !r.ok) { toast('저장하지 못했어요'); return; }
    ME.slots = r.slots; ME.offdays = r.offdays;
    toast('시간표를 저장했어요'); renderHome();
  },
  'save-payout': async (el) => {
    const g = id => ($(id) || {}).value || '';
    el.disabled = true; el.textContent = '저장 중…';
    const r = await postJson('/api/me/payout', authBody({ bank: g('po-bank'), bankNo: g('po-no'), bankHolder: g('po-holder') }));
    el.disabled = false; el.textContent = '계좌 저장';
    if (!r || !r.ok) { toast((r && r.error) || '저장하지 못했어요'); return; }
    // 서버가 돌려준 마스킹 값으로 바로 바꿔 둔다 — 전체 번호는 다시 화면에 띄우지 않는다
    ME.payout = { set: true, bank: g('po-bank'), holder: g('po-holder'), masked: r.masked || '****' };
    toast('계좌를 저장했어요');
    renderMoney();
    await loadMe(); renderMoney();
  },

  'call-yes': answerCall,
  'call-no': rejectCall
};

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tab[data-tab]');
  if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

// ============================================================================
//  시작
// ============================================================================
$('code-btn').addEventListener('click', loginWithCode);
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithCode(); });

const inp = $('room-input');
inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 110) + 'px'; });
inp.addEventListener('keydown', e => {
  // 데스크톱에선 Enter 로 보낸다. 줄바꿈은 Shift+Enter.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(min-width: 768px)').matches) {
    e.preventDefault(); sendReply();
  }
});

// 채팅 검색 — 한 글자마다 목록만 갈아 끼운다(입력창은 그대로 두어야 커서가 안 튄다)
document.addEventListener('input', e => {
  if (!e.target || e.target.id !== 'chat-search') return;
  CHATQ = e.target.value || '';
  const x = $('chat-x');
  if (x) x.hidden = !CHATQ;
  renderChatList();
});

// 빠른 답장 칩 길게 누르기 → 관리 시트. 편집 버튼을 못 찾는 사람이 반드시 있다.
(function bindQuickLongPress() {
  const bar = $('qrbar');
  if (!bar) return;
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  bar.addEventListener('pointerdown', e => {
    const chip = e.target.closest('button[data-act="qr-use"]');
    if (!chip) return;
    timer = setTimeout(() => {
      timer = null;
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (err) {}
      openQuickSheet();
      // 길게 눌러 시트를 연 뒤 손을 떼면 클릭이 또 들어온다 — 한 번만 막는다
      bar.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    }, 550);
  }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(ev =>
    bar.addEventListener(ev, cancel, { passive: true }));
})();

renderQuickBar();

// ============================================================================
//  PWA 설치 — 폰이든 PC든 앱처럼. 설치돼 있으면 카드 자체가 안 보인다.
// ============================================================================
let installEv = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEv = e;
  try { if (!$('screen-login').hidden === false && !$('app').hidden) renderHome(); } catch (err) {}
});
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
ACT['call-cancel'] = () => closeCall();

// 앱을 나갔다 돌아왔을 때 — 걸다 만·하다 만 통화가 서버에 남아 있으면 이어붙인다
async function checkMyActive() {
  if (CUR_CALL || (!SESSION && !CODE)) return;
  const d = await getJson('/api/rtc/my-active?' + authQS());
  if (!d || !d.call || d.call.dir !== 'to-client') return;
  const c = d.call;
  // 얼어붙은 세션의 통화는 살릴 수 없다(옛 연결 정보가 죽었다) — 정리하고 다시 건다
  await postJson('/api/rtc/end', { callId: c.id, by: 'counselor' }).catch(() => {});
  const nm = nameOfClient(c.clientId);
  if (confirm(`걸던 전화가 끊겼어요 (${nm} 님).\n다시 걸까요?`)) callClient(c.clientId, nm);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkMyActive(); });
setTimeout(checkMyActive, 2500); // 앱 시작 직후 한 번

ACT['call-client'] = () => {
  const t = curThread();
  if (!t) return;
  callClient(t.clientId, t.clientName);
};

ACT['install'] = async () => {
  if (installEv) {
    installEv.prompt();
    const r = await installEv.userChoice.catch(() => null);
    installEv = null;
    if (r && r.outcome === 'accepted') toast('설치 완료! 홈 화면·바탕화면에서 열 수 있어요');
    renderHome();
  } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    toast('사파리 공유 버튼 → "홈 화면에 추가"를 눌러주세요');
  } else {
    toast('브라우저 메뉴(⋮) → "앱 설치"를 눌러주세요');
  }
};

// ============================================================================
//  실시간 수신 (웹소켓) — 내담자 메시지가 저장되는 순간 바로 도착한다.
//  끊기면 지수 백오프로 다시 붙고, 그동안은 15초 폴링이 받친다.
// ============================================================================
let hubWs = null, hubRetry = 0;
function connectHub() {
  if (!(SESSION || CODE) || !ME || !ME.id || hubWs) return;
  try {
    const ws = new WebSocket(API_BASE.replace(/^http/, 'ws') + '/ws?ch=' + encodeURIComponent('c:' + ME.id) + '&' + authQS());
    hubWs = ws;
    ws.onopen = () => { hubRetry = 0; };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'chat') {
          loadChats().then(() => {
            renderChatList(); renderDots();
            if (ROOM) renderRoom();
            if (d.msg && d.msg.from === 'client') chime();
          });
        }
        // 전화가 오는 순간 — 3초 폴링을 기다리지 않고 즉시 벨 화면을 띄운다
        if (d.type === 'call-state' && d.state === 'ringing') pollIncoming();
        // 상대가 취소한 순간 — 벨을 즉시 멈춘다
        if (d.type === 'call-state' && d.state === 'ended' && CUR_CALL && CUR_CALL.id === d.callId && !window.RtcCall.callId) {
          clearInterval(CUR_CALL.watch);
          ringStop();
          $('callov').hidden = true;
          CUR_CALL = null;
          toast('상대방이 통화를 취소했어요');
        }
      } catch (err) {}
    };
    ws.onclose = () => {
      hubWs = null;
      hubRetry = Math.min(hubRetry + 1, 6);
      setTimeout(connectHub, 1000 * Math.pow(2, hubRetry));
    };
    ws.onerror = () => { try { ws.close(); } catch (err) {} };
  } catch (e) { hubWs = null; }
}

(async () => {
  const t = new URLSearchParams(location.search).get('t');
  if (t) { if (await verifyLink(t)) askNotify(); }
  if (SESSION || CODE) { enterApp(); await loadAll(); connectHub(); }
})();

initSW();

// 폴링 — 채팅은 자주, 나머지는 느긋하게. 화면이 뒤에 있으면 쉰다.
setInterval(() => {
  if (!(SESSION || CODE) || document.hidden) return;
  loadChats().then(() => { renderChatList(); renderDots(); if (ROOM) renderRoom(); });
}, 15000);

setInterval(() => {
  if (!(SESSION || CODE) || document.hidden) return;
  Promise.all([loadInbox(), loadBookings(), loadPresence(), loadHomework(), loadReviews()]).then(renderAll);
}, 45000);

// 걸려오는 전화는 자주 확인해야 한다 — 늦게 뜨면 이미 끊긴 뒤다
setInterval(() => { if (SESSION || CODE) pollIncoming(); }, 3000);

// 화면을 다시 켜면 곧바로 최신으로 (뒤에 있는 동안 폴링이 죽어 있었다)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (SESSION || CODE)) { loadAll(); pollIncoming(); }
});
