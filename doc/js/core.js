// ============================================================================
//  마인드 인사이드 닥터 — 상담소 관리 콘솔 (doc.neurumind.com) · 공통
//
//  심리상담소 소장이 PC 에서 쓰는 관리 화면. 폰(≤900px)에서는 사이드바가 하단 탭바로 바뀐다.
//   · 로그인: 이메일 매직링크 또는 상담소 코드(H-XXXX-XXXX). 세션은 이 기기의 localStorage 에만.
//   · 서버는 상담사 앱과 같은 Worker (/api/hospital/…). 내담자의 대화 원문은 절대 오지 않는다.
//   · 파일 나눔: core.js(여기) → view-*.js 가 VIEWS[탭] = { title, sub, keys, html } 를 등록한다.
// ============================================================================
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
const getJson = (p) => api(p).then(r => r.ok ? r.json() : r.json().catch(() => null)).catch(() => null);
const postJson = (p, d) => api(p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d || {})
}).then(r => r.json().catch(() => ({}))).catch(() => null);

// ── 인증 (세션이 우선, 코드는 보조) ──
let HS = localStorage.getItem('doc_session') || '';
let HC = localStorage.getItem('doc_code') || '';
const authQS = () => HS ? 'hsession=' + encodeURIComponent(HS) : 'hcode=' + encodeURIComponent(HC);
const authBody = (o) => Object.assign(HS ? { hsession: HS } : { hcode: HC }, o || {});
// 소장 콘솔 경로 축약. 세션이 풀렸으면(bad-code) 로그인 화면으로 돌려보낸다.
async function hget(p) {
  const d = await getJson('/api/hospital/' + p + (p.includes('?') ? '&' : '?') + authQS());
  if (d && d.error === 'bad-code') { dropSession('로그인이 풀렸어요. 다시 들어와주세요.'); return null; }
  return d;
}
async function hpost(p, body) {
  const d = await postJson('/api/hospital/' + p, authBody(body));
  if (d && d.error === 'bad-code') { dropSession('로그인이 풀렸어요. 다시 들어와주세요.'); return null; }
  return d;
}

// ── 작은 도구 ──
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDay = ts => { if (!ts) return '—'; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
const fmtDate = ts => { if (!ts) return '—'; const d = new Date(ts); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
const fmtDT = ts => ts ? new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTime = ts => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const fmtAgo = ts => { if (!ts) return ''; const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return '방금'; if (m < 60) return m + '분 전'; const h = Math.round(m / 60); if (h < 24) return h + '시간 전'; const d = Math.round(h / 24); return d < 30 ? d + '일 전' : fmtDate(ts); };
const won = n => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');
const avColor = name => String(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
const avatar = (name, cls, photo) => `<div class="pav c${avColor(name)}${cls ? ' ' + cls : ''}">${photo ? `<img src="${esc(photo)}" alt="">` : esc(String(name || '내').slice(0, 1))}</div>`;
const empty = (title, body) => `<div class="empty"><b>${title}</b>${body || ''}</div>`;
const loadingHtml = (t) => `<div class="loading">${t || '불러오는 중…'}</div>`;
const failedHtml = (tab) => `<div class="failed"><b>불러오지 못했어요</b>네트워크를 확인하고 다시 시도해주세요.<br><button class="btn ghost sm" style="margin-top:0.6rem;" data-act="retry" data-tab="${esc(tab || '')}">다시 시도</button></div>`;
const busy = el => !!(el && document.activeElement && el.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
const monthKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const monthLabel = k => k ? k.slice(0, 4) + '년 ' + Number(k.slice(5)) + '월' : '';

const RISK_LABEL = { none: '특이사항 없음', watch: '주의 관찰', urgent: '긴급 — 소장 확인 필요' };
const RISK_CHIP = { none: '<span class="chip off">없음</span>', watch: '<span class="chip gold">주의</span>', urgent: '<span class="chip bad">긴급</span>' };
const KIND_LABEL = { booking: '예약 상담', call: '전화 상담', chat: '채팅 상담' };
const BK_STATUS = { confirmed: '예정', done: '완료', cancelled: '취소', declined: '거절', noshow: '불참' };

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2400);
}
// CSV 내려받기 (브라우저 안에서만 만든다 — 서버에 파일이 남지 않는다)
function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('복사했어요'); } catch (e) { toast('복사하지 못했어요 — 직접 선택해 복사해주세요'); } }

// ── 확인·입력 창 (window.confirm/alert/prompt 를 쓰지 않는다) ──
let modalResolve = null;
function modal(o) {
  closeModal(null);
  return new Promise(resolve => {
    modalResolve = resolve;
    const box = $('modal-box');
    box.className = o.wide ? 'wide' : '';
    box.innerHTML = `
      <h3>${esc(o.title || '')}</h3>
      ${o.body ? `<div class="body">${esc(o.body)}</div>` : ''}
      ${o.html || ''}
      ${o.input ? `<input id="modal-input" type="${esc(o.input.type || 'text')}" placeholder="${esc(o.input.placeholder || '')}" value="${esc(o.input.value || '')}" style="margin-top:0.8rem;" autocomplete="off" ${o.input.inputmode ? `inputmode="${esc(o.input.inputmode)}"` : ''}>` : ''}
      ${o.acts === false ? '' : `<div class="acts">
        ${o.cancel === false ? '' : `<button class="btn ghost" data-act="modal-cancel">${esc(o.cancelLabel || '취소')}</button>`}
        <button class="btn ${o.danger ? 'danger' : ''}" data-act="modal-ok">${esc(o.okLabel || '확인')}</button></div>`}`;
    $('modal').hidden = false;
    const inp = $('modal-input');
    if (inp) { setTimeout(() => { inp.focus(); inp.select(); }, 60); inp.addEventListener('keydown', e => { if (e.key === 'Enter') closeModal(inp.value); }); }
    else setTimeout(() => { const f = box.querySelector('[data-act="modal-ok"], input, textarea'); if (f) f.focus(); }, 60);
  });
}
function closeModal(v) {
  if ($('modal').hidden && !modalResolve) return;
  $('modal').hidden = true;
  const r = modalResolve; modalResolve = null;
  if (r) r(v === undefined ? null : v);
}
const alertBox = (title, body) => modal({ title, body, cancel: false, okLabel: '닫기' });
const confirmBox = o => modal(o).then(v => v === true);
const promptBox = o => modal(Object.assign({}, o, { input: { value: o.value || '', placeholder: o.placeholder || '', type: o.type || 'text', inputmode: o.inputmode } }));

// ── 오른쪽 상세 패널 (폰에서는 전체 화면). 뒤로가기로 닫힌다 ──
const PANEL = { key: null, pushed: false };
function openPanel(title, html, acts, key) {
  $('panel-title').textContent = title;
  $('panel-acts').innerHTML = acts || '';
  $('panel-body').innerHTML = html;
  $('panel-body').scrollTop = 0;
  PANEL.key = key || null;
  if ($('panel').hidden) {
    $('panel').hidden = false; document.body.style.overflow = 'hidden';
    history.pushState({ panel: 1 }, ''); PANEL.pushed = true;
  }
}
function closePanel(fromPop) {
  if ($('panel').hidden) return;
  $('panel').hidden = true; document.body.style.overflow = ''; PANEL.key = null;
  const pushed = PANEL.pushed; PANEL.pushed = false;
  if (pushed && !fromPop) history.back();
}
window.addEventListener('popstate', () => { if (!$('panel').hidden) closePanel(true); });

// ── 데이터 캐시 ──
//  DATA[키] 가 null 이면 아직 없다. ST[키] 는 'loading' | 'ok' | 'err'. LOADERS[키] 는 view-*.js 가 채운다.
const DATA = { hospital: null, dash: null, patients: null, counselors: null, apps: null, notes: null, urgent: null, bookings: null, stats: null, settle: null, posts: null, profile: null, info: null };
const ST = {};
const LOADERS = {};
const VIEWS = {};      // 탭 id → { title, sub, keys, html(), after?() }
const UI = { tab: 'dash', gq: '' };
async function loadKey(key, force) {
  if (!LOADERS[key]) return;
  if (ST[key] === 'loading') return;
  if (ST[key] === 'ok' && DATA[key] != null && !force) return;
  ST[key] = 'loading';
  let ok = false;
  try { ok = !!(await LOADERS[key]()); } catch (e) { ok = false; }
  if (!DATA.hospital) return;                       // 그 사이 로그아웃됐다
  ST[key] = ok ? 'ok' : 'err';
  render();
}
function loadTab(tab, force) {
  const v = VIEWS[tab]; if (!v) return Promise.resolve();
  return Promise.all((v.keys || []).map(k => loadKey(k, force)));
}
// 화면이 그릴 수 있는 상태인가. 아니면 '불러오는 중' 또는 '실패' HTML 을 준다.
function gate(keys, tab) {
  const missing = keys.filter(k => DATA[k] == null);
  if (!missing.length) return null;
  if (missing.some(k => ST[k] === 'err')) return failedHtml(tab || UI.tab);
  return loadingHtml();
}

// ── 화면 그리기 ──
const NAV = [
  { id: 'dash', label: '대시보드', short: '홈', icon: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>' },
  { id: 'patients', label: '내담자', short: '내담자', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>' },
  { id: 'counselors', label: '소속 상담사', short: '상담사', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' },
  { id: 'notes', label: '회기 기록', short: '기록', icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>' },
  { id: 'urgent', label: '긴급 알림', short: '긴급', icon: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>' },
  { id: 'calendar', label: '예약 캘린더', short: '예약', icon: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
  { id: 'stats', label: '통계', short: '통계', icon: '<path d="M3 20h18"/><rect x="5" y="11" width="3.4" height="9" rx="1"/><rect x="10.3" y="5" width="3.4" height="15" rx="1"/><rect x="15.6" y="14" width="3.4" height="6" rx="1"/>' },
  { id: 'settle', label: '정산', short: '정산', icon: '<rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 10h20"/><circle cx="7" cy="14.5" r="1.3"/>' },
  { id: 'community', label: '커뮤니티', short: '소식', icon: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/>' },
  { id: 'page', label: '상담소 페이지', short: '페이지', icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M12 8v6M9 11h6M8 21v-4h8v4"/>' },
  { id: 'settings', label: '설정', short: '설정', icon: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1Z"/>' }
];
const svgIcon = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
function buildNav() {
  $('side-nav').innerHTML = NAV.map(n => `<button class="navbtn" data-tab="${n.id}">${svgIcon(n.icon)}<span>${n.label}</span><span class="n" id="n-${n.id}" hidden></span></button>`).join('');
  $('tab-nav').innerHTML = NAV.map(n => `<button class="tab" data-tab="${n.id}">${svgIcon(n.icon)}<span>${n.short}</span><span class="n" id="t-${n.id}" hidden></span></button>`).join('');
}
// 탭 배지 — 대시보드 숫자에서 뽑는다 (승인 대기·미확인 긴급·새 댓글)
function badges() {
  const d = DATA.dash || {};
  const set = (id, n, soft) => ['n-', 't-'].forEach(p => { const el = $(p + id); if (!el) return; el.hidden = !n; el.textContent = n > 99 ? '99+' : n; el.classList.toggle('soft', !!soft); });
  set('counselors', (d.appsPending || 0) + ((d.counselors || {}).pending || 0), true);
  set('urgent', d.urgentUnacked || 0);
  set('community', d.newComments || 0, true);
  set('settings', d.bankSet === false ? 1 : 0);
}
function showTab(tab, force) {
  if (!VIEWS[tab]) tab = 'dash';
  UI.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  render(true);
  loadTab(tab, force);
  window.scrollTo({ top: 0 });
}
function render(force) {
  if (!DATA.hospital) return;
  const v = VIEWS[UI.tab]; if (!v) return;
  const host = $('view-host');
  if (!force && busy(host)) return;
  $('view-title').textContent = v.title;
  $('view-sub').textContent = typeof v.sub === 'function' ? v.sub() : (v.sub || '');
  host.innerHTML = `<section class="view on" id="view-${UI.tab}">${v.html()}</section>`;
  if (v.after) v.after();
  badges();
}

// ── 화면 설정 (다크 모드 · 글자 크기) ──
function applyPrefs() {
  const th = localStorage.getItem('doc_theme') || 'light', fs = localStorage.getItem('doc_font') || 'normal';
  document.documentElement.dataset.theme = th; document.documentElement.dataset.font = fs;
  document.querySelector('meta[name=theme-color]').setAttribute('content', th === 'dark' ? '#17201b' : '#1c3027');
}
function setPref(k, v) { localStorage.setItem(k, v); applyPrefs(); render(true); }
applyPrefs();

// ── 로그인 ──
function showErr(id, msg) { const e = $(id); if (!e) return; e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }
async function requestLink() {
  const email = ($('email').value || '').trim();
  showErr('err', ''); $('sent').style.display = 'none';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showErr('err', '이메일 형식을 확인해주세요.'); return; }
  const btn = $('email-btn'); btn.disabled = true; btn.textContent = '보내는 중…';
  const r = await postJson('/api/hospital/auth/request', { email });
  btn.disabled = false; btn.textContent = '로그인 링크 받기';
  if (!r || !r.ok) { showErr('err', '지금은 보내지 못했어요. 잠시 후 다시 시도해주세요.'); return; }
  $('sent').textContent = r.message || '메일함을 확인해주세요.'; $('sent').style.display = 'block';
}
async function verifyLink(t) {
  const r = await postJson('/api/hospital/auth/verify', { t });
  history.replaceState(null, '', location.pathname);
  if (!r || !r.ok) {
    const why = r && r.error;
    showErr('err', why === 'expired' ? '링크가 만료됐어요 (15분). 다시 받아주세요.' : why === 'used' ? '이미 사용한 링크예요. 다시 받아주세요.' : '링크가 올바르지 않아요. 다시 받아주세요.');
    return false;
  }
  HS = r.hsession; HC = '';
  localStorage.setItem('doc_session', HS); localStorage.removeItem('doc_code');
  enter(r.hospital); return true;
}
async function loginWithCode(v) {
  v = (v || ($('code').value || '')).trim().toUpperCase();
  showErr('err2', '');
  if (!/^H-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(v)) { showErr('err2', 'H-XXXX-XXXX 형식의 상담소 코드를 넣어주세요.'); return; }
  if (!v.includes('-')) v = 'H-' + v.slice(1, 5) + '-' + v.slice(5);
  const btn = $('code-btn'); btn.disabled = true; btn.textContent = '확인 중…';
  const hd = await getJson('/api/hospital/me?hcode=' + encodeURIComponent(v));
  btn.disabled = false; btn.textContent = '시작하기';
  if (!hd || !hd.ok) { showErr('err2', '코드가 올바르지 않거나 정지된 상담소예요.'); return; }
  HC = v; HS = '';
  localStorage.setItem('doc_code', HC); localStorage.removeItem('doc_session');
  enter(hd.hospital);
}
function enter(h) {
  DATA.hospital = h;
  $('screen-login').hidden = true; $('shell').hidden = false; $('tabbar').hidden = false;
  $('side-name').textContent = h.name;
  $('side-sub').textContent = [h.dept, h.doctor ? h.doctor + ' 소장' : ''].filter(Boolean).join(' · ') || '상담소 관리 콘솔';
  $('side-av').textContent = (h.name || '상').slice(0, 1);
  $('side-login').textContent = HS ? '이메일 링크 로그인 · 이 기기 30일' : '상담소 코드 로그인';
  buildNav();
  showTab(UI.tab || 'dash', true);
}
function dropSession(msg) {
  HS = ''; HC = '';
  localStorage.removeItem('doc_session'); localStorage.removeItem('doc_code');
  Object.keys(DATA).forEach(k => { DATA[k] = null; }); Object.keys(ST).forEach(k => { delete ST[k]; });
  closeModal(null); if (!$('panel').hidden) { $('panel').hidden = true; document.body.style.overflow = ''; PANEL.pushed = false; }
  $('shell').hidden = true; $('tabbar').hidden = true; $('screen-login').hidden = false;
  if (msg) toast(msg);
}
async function logout() {
  if (!(await confirmBox({ title: '이 기기에서 로그아웃할까요?', body: '다시 들어오려면 이메일 링크를 새로 받거나 상담소 코드를 넣어야 해요.', okLabel: '로그아웃' }))) return;
  if (HS) await postJson('/api/hospital/auth/logout', { hsession: HS });
  dropSession('');
}

// ── 통합 검색 (상단) — 내담자·상담사·회기 기록을 이미 받은 데이터 안에서 찾는다 ──
function renderSearch() {
  const box = $('gsearch-res'); const q = UI.gq.trim().toLowerCase();
  if (!q) { box.hidden = true; return; }
  const ps = (DATA.patients || []).filter(p => (p.name || '').toLowerCase().includes(q) || (p.birth || '').includes(q)).slice(0, 6);
  const cs = (DATA.counselors || []).filter(c => (c.name || '').toLowerCase().includes(q) || (c.license || '').toLowerCase().includes(q)).slice(0, 5);
  const ns = (DATA.notes || []).filter(n => (n.summary || '').toLowerCase().includes(q) || (n.clientName || '').toLowerCase().includes(q) || (n.counselor || '').toLowerCase().includes(q)).slice(0, 6);
  const hint = (DATA.patients == null || DATA.counselors == null || DATA.notes == null) ? '<div class="gh">아직 안 불러온 목록은 검색에 안 잡혀요 — 해당 메뉴를 한 번 열어주세요</div>' : '';
  box.innerHTML = (ps.length ? '<div class="gh">내담자</div>' + ps.map(p => `<button class="gi" data-act="open-patient" data-id="${esc(p.clientId)}">${avatar(p.name, 'sm')}<b>${esc(p.name)}</b><span class="muted">${esc(p.birth || '')} · ${p.lastRisk === 'urgent' ? '긴급' : p.lastRisk === 'watch' ? '주의' : '기록 ' + (p.notes || 0) + '건'}</span></button>`).join('') : '')
    + (cs.length ? '<div class="gh">소속 상담사</div>' + cs.map(c => `<button class="gi" data-act="goto" data-tab="counselors">${avatar(c.name, 'sm', c.photo)}<b>${esc(c.name)}</b><span class="muted">${esc(c.license || '')} · ${c.hospitalOk ? '소속' : '승인 대기'}</span></button>`).join('') : '')
    + (ns.length ? '<div class="gh">회기 기록</div>' + ns.map(n => `<button class="gi" data-act="open-patient" data-id="${esc(n.clientId)}"><b>${esc(n.clientName || '내담자')}</b><span class="muted">${fmtDay(n.ts)} ${esc(n.counselor)} · ${esc(n.summary)}</span></button>`).join('') : '')
    + ((ps.length || cs.length || ns.length) ? '' : '<div class="gh">검색 결과가 없어요</div>') + hint;
  box.hidden = false;
}

// ── 공통 이벤트 ──
document.addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]');
  if (tb && !e.target.closest('[data-act]')) { showTab(tb.dataset.tab); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'goto') { closePanel(); $('gsearch-res').hidden = true; showTab(el.dataset.tab); }
  else if (act === 'retry') loadTab(el.dataset.tab || UI.tab, true);
  else if (act === 'refresh') { loadTab(UI.tab, true).then(() => toast('새로고침했어요')); }
  else if (act === 'logout') logout();
  else if (act === 'theme') setPref('doc_theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  else if (act === 'font') setPref('doc_font', el.dataset.v);
  else if (act === 'modal-cancel') closeModal(null);
  else if (act === 'modal-ok') { const i = $('modal-input'); closeModal(i ? i.value : true); }
  else if (act === 'panel-close') closePanel();
  else if (act === 'copy') copyText(el.dataset.v || '');
  else if (act === 'logout-others') postJson('/api/hospital/auth/logout-others', { hsession: HS }).then(r => toast(r && r.ok ? '다른 기기를 모두 로그아웃했어요' : '처리하지 못했어요'));
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('modal').hidden) closeModal(null);
  else if (!$('panel').hidden) closePanel();
  else if (!$('gsearch-res').hidden) { $('gsearch-res').hidden = true; $('gsearch').blur(); }
});
$('gsearch').addEventListener('input', e => { UI.gq = e.target.value || ''; renderSearch(); });
$('gsearch').addEventListener('focus', () => { if (UI.gq.trim()) renderSearch(); });
document.addEventListener('mousedown', e => { if (!e.target.closest('#gsearch-wrap')) $('gsearch-res').hidden = true; });
$('email-btn').addEventListener('click', requestLink);
$('email').addEventListener('keydown', e => { if (e.key === 'Enter') requestLink(); });
$('code-btn').addEventListener('click', () => loginWithCode());
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') loginWithCode(); });
$('to-code').addEventListener('click', () => { $('login-email').hidden = true; $('login-code').hidden = false; $('code').focus(); });
$('to-email').addEventListener('click', () => { $('login-code').hidden = true; $('login-email').hidden = false; $('email').focus(); });

// ── 시작 ──
window.addEventListener('DOMContentLoaded', async () => {
  const qs = new URLSearchParams(location.search);
  const t = qs.get('t'), c = qs.get('code');
  if (t) { if (await verifyLink(t)) return; }
  if (c) { history.replaceState(null, '', location.pathname); $('login-email').hidden = true; $('login-code').hidden = false; $('code').value = c; await loginWithCode(c); if (DATA.hospital) return; }
  if (HS || HC) {
    const hd = await getJson('/api/hospital/me?' + authQS());
    if (hd && hd.ok) enter(hd.hospital);
    else { HS = ''; HC = ''; localStorage.removeItem('doc_session'); localStorage.removeItem('doc_code'); }
  }
});
// 화면이 켜져 있으면 3분마다 조용히 새로고침 — 긴급 표시가 늦게 보이면 안 된다. 패널이 열려 있거나 입력 중이면 건너뛴다.
const AUTO_TABS = ['dash', 'patients', 'notes', 'urgent'];
function autoRefresh() {
  if (!DATA.hospital || document.hidden || !$('panel').hidden || !$('modal').hidden) return;
  if (!AUTO_TABS.includes(UI.tab)) return;
  if (busy($('view-host'))) return;
  loadKey('dash', true); loadTab(UI.tab, true);
}
setInterval(autoRefresh, 3 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
