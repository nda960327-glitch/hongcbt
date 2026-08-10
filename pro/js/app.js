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
const chime = () => tone([[659, 0], [988, 0.11], [1319, 0.22]], 0.12);

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
  loadAll();
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
    return `<div class="listrow">
        <div class="grow">
          <div class="row" style="gap:0.4rem;"><strong style="font-size:0.9rem;">${esc(b.clientName)} 님</strong>
            ${soon ? '<span class="chip new">곧 시작</span>' : ''}</div>
          <div class="muted">${esc(b.time)}</div>
        </div>
        <span class="muted">${won(b.price)}캐시</span>
      </div>`;
  }).join('') : '<p class="muted" style="padding:0.9rem 0;">오늘 예약은 없어요. 편히 쉬셔도 됩니다.</p>';

  const hwDone = D.homework.filter(h => h.doneAt).length;
  const inboxUnread = D.inbox.filter(x => !x.read).length;

  el.innerHTML = `
    ${notiCard}
    <div class="stats">
      <div class="stat" data-act="tab" data-tab="chat"><b style="color:${unreadMsgs ? 'var(--warn)' : 'var(--text)'}">${unreadMsgs}</b><span>안 읽은 메시지</span></div>
      <div class="stat" data-act="tab" data-tab="book"><b>${todays.length}</b><span>오늘 예약</span></div>
      <div class="stat" data-act="tab" data-tab="money"><b style="color:var(--accent)">${won(weekSum)}</b><span>이번 주 수입</span></div>
    </div>
    ${presenceCard}
    <div class="sec-title">오늘 일정</div>
    <div class="card">${todayList}</div>
    <div class="sec-title">관리</div>
    ${foldProfile()}
    ${foldSlots()}
    ${fold('hw', '내가 낸 숙제', D.homework.length ? `${D.homework.length}개 · 완료 ${hwDone}` : '아직 없음', hwListHtml(D.homework, true))}
    ${fold('inbox', '받은 상담 자료', D.inbox.length ? `${D.inbox.length}건 · 안 읽음 ${inboxUnread}` : '아직 없음', inboxHtml())}
    ${fold('rv', '내 리뷰', D.reviews.length ? `${D.reviews.length}개` : '아직 없음', reviewsHtml())}
    <p class="muted" style="text-align:center; margin-top:1.2rem;">
      코드를 잃어버렸거나 코드가 샌 것 같으면 <b>nda960327@gmail.com</b> 으로 알려주세요.</p>`;
}

function inboxHtml() {
  if (!D.inbox.length) return '<p class="muted" style="margin-top:0.8rem;">아직 도착한 자료가 없습니다. 내담자가 앱에서 [상담 자료 보내기]로 동의·전달하면 여기에 쌓여요.</p>';
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
  if (!D.reviews.length) return '<p class="muted" style="margin-top:0.8rem;">아직 리뷰가 없습니다. 상담을 마친 내담자가 별점을 남기면 여기에 표시돼요.</p>';
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

function renderChatList() {
  const el = $('view-chat');
  const list = threads();
  const total = list.reduce((s, t) => s + t.unread, 0);
  if (!list.length) {
    el.innerHTML = `<div class="card"><div class="empty"><span class="ico">💬</span>
      아직 대화가 없습니다.<br>내담자가 앱에서 채팅을 보내면<br>여기에 바로 뜨고 소리로 알려드려요.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="row" style="margin:0.1rem 0.2rem 0.6rem;">
      <span class="muted grow">대화 ${list.length}개${total ? ` · <b style="color:var(--warn)">안 읽음 ${total}</b>` : ''}</span>
      <button class="btn ghost sm" data-act="refresh">새로고침</button>
    </div>
    <div class="card pad0">
      ${list.map(t => `
        <div class="thread ${t.unread ? 'unread' : ''}" data-act="room-open" data-key="${esc(t.key)}">
          <div class="av">${esc((t.clientName || '내').slice(0, 1))}</div>
          <div class="grow">
            <div class="row"><span class="nm grow ell">${esc(t.clientName)} 님</span></div>
            <div class="pv ell">${t.last.from === 'counselor' ? '<span style="color:var(--accent)">나: </span>' : ''}${esc(t.last.text)}</div>
          </div>
          <div class="rt">${relTime(t.last.ts)}${t.unread ? `<div class="cnt">${t.unread}</div>` : ''}</div>
        </div>`).join('')}
    </div>`;
}

function openRoom(key) {
  ROOM = key;
  $('chatroom').hidden = false;
  document.body.style.overflow = 'hidden';
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
  $('room-sub').textContent = hw.length ? `숙제 ${hw.length}개 · 완료 ${hw.filter(h => h.doneAt).length}` : '상담 채팅';

  const box = $('room-msgs');
  const stick = scroll || (box.scrollHeight - box.scrollTop - box.clientHeight < 120);
  let last = '';
  box.innerHTML = t.msgs.map(m => {
    let sep = '';
    if (dayKey(m.ts) !== last) { last = dayKey(m.ts); sep = `<div class="daysep"><span>${dayLabel(m.ts)}</span></div>`; }
    const time = new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const me = m.from === 'counselor';
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
  if (!items.length) return '<p class="muted" style="margin-top:0.8rem;">아직 낸 숙제가 없어요. 대화방에서 [숙제] 버튼을 누르면 예약이 없는 내담자에게도 바로 낼 수 있어요.</p>';
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

  return `<div class="card" style="${dead ? 'opacity:0.55;' : ''}${soon || (past && b.status === 'confirmed') ? 'border-color:var(--accent);' : ''}">
      <div class="row">
        <strong class="grow" style="font-size:0.94rem;${dead ? 'text-decoration:line-through;' : ''}">${esc(b.clientName)} 님${dead ? '' : ' · 30분 상담'}</strong>
        ${badge}
      </div>
      <p class="muted" style="margin-top:0.3rem;">${esc(b.time)} · ${won(b.price)}캐시${dead ? '' : ` · 내 몫 ${won(b.payout ? b.payout.counselor : 0)}캐시`}</p>
      ${hint}${autoNote}${disputeNote}${noteBox}${actions}
    </div>`;
}

function renderBookings() {
  const el = $('view-book');
  if (busy(el)) return;
  const now = Date.now();
  const up = D.bookings.filter(b => b.whenTs > now && !DEAD.includes(b.status)).sort((a, b) => a.whenTs - b.whenTs);
  const pastAll = D.bookings.filter(b => !(b.whenTs > now && !DEAD.includes(b.status))).sort((a, b) => b.whenTs - a.whenTs);
  const todo = pastAll.filter(b => b.status === 'confirmed');
  const rest = pastAll.filter(b => b.status !== 'confirmed');

  if (!D.bookings.length) {
    el.innerHTML = `<div class="card"><div class="empty"><span class="ico">📅</span>
      예약이 없습니다.<br>내담자가 앱에서 예약하면 여기에 실시간으로 표시돼요.</div></div>`;
    return;
  }
  el.innerHTML =
    (todo.length ? `<div class="sec-title" style="color:var(--warn);">완료 처리가 필요해요 ${todo.length}건</div>${todo.map(bookingCard).join('')}` : '') +
    `<div class="sec-title">다가오는 예약 ${up.length}건</div>` +
    (up.length ? up.map(bookingCard).join('') : '<div class="card"><p class="muted">앞으로 잡힌 예약이 없어요.</p></div>') +
    (rest.length ? `<div class="sec-title">지난 예약</div>${rest.slice(0, 40).map(bookingCard).join('')}` : '');
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

  const rows = earned.slice().sort((a, b) => b.whenTs - a.whenTs).slice(0, 60).map(b => `
    <div class="listrow">
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
      <p class="muted" style="margin-top:0.6rem;">상담사 70% · 소속 기관 10% · 결제 수수료 3% · 플랫폼 17%</p>
      <button class="btn" style="margin-top:0.7rem;" ${waiting ? '' : 'disabled'} data-act="withdraw">출금 신청</button>
    </div>
    ${foldPayout()}
    <div class="sec-title">정산 내역</div>
    <div class="card">${rows || '<p class="muted">완료된 상담이 아직 없어요.</p>'}</div>`;
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

function showIncoming(call) {
  if (CUR_CALL) return;
  CUR_CALL = call;
  $('call-who').textContent = nameOfClient(call.clientId) + ' 님';
  $('call-st').textContent = '걸려온 상담 전화';
  $('call-clock').textContent = '00:00';
  $('callov').hidden = false;
  ringStart();
}

async function answerCall() {
  ringStop();
  if (!CUR_CALL) return;
  $('call-st').textContent = '연결 중…';
  window.RtcCall.onEvent = (type, d) => {
    if (type === 'connected') $('call-st').textContent = '통화 중';
    if (type === 'tick') {
      const sec = Math.floor(d.ms / 1000);
      $('call-clock').textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }
    if (type === 'remote-hangup') closeCall();
    if (type === 'error') $('call-st').textContent = d.message || '연결 실패';
  };
  await window.RtcCall.answer({ room: CUR_CALL.room, callId: CUR_CALL.id });
}

async function rejectCall() {
  ringStop();
  if (CUR_CALL) await postJson('/api/rtc/end', { callId: CUR_CALL.id, by: 'counselor' });
  closeCall();
}

async function closeCall() {
  ringStop();
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
  'hw-open': openHomeworkSheet,
  'hw-send': sendHomework,
  'sheet-close': closeSheet,

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

(async () => {
  const t = new URLSearchParams(location.search).get('t');
  if (t) { if (await verifyLink(t)) askNotify(); }
  if (SESSION || CODE) { enterApp(); await loadAll(); }
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
