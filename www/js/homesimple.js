// ============================================================================
//  홈 화면 두 가지 — 기본(카드형)과 심플(큰 버튼 다섯 개).
//
//  클라이언트가 두 안을 나란히 보고 고르려고 만든 것이다. 앱을 두 벌로 나누지 않고
//  한 앱 안에서 즉시 바꿔 볼 수 있게 한다.
//   · 주소 뒤에 ?home=simple / ?home=classic 을 붙이면 그 모양으로 열리고 기억된다.
//   · 마이 → 앱 → '홈 화면 모양' 에서도 바꾼다.
//  기본값은 지금까지 쓰던 카드형(classic)이다. 고르지 않은 사람에게는 아무것도 바뀌지 않는다.
//
//  심플 홈은 어디로도 새 화면을 만들지 않는다. 기존 탭·오버레이를 그대로 연다.
//  그래야 두 안의 차이가 '첫 화면의 짜임새' 하나로만 남아 비교가 된다.
// ============================================================================
window.HomeSimple = {
  KEY: 'cbt_home_variant',
  DEFAULT: 'classic',

  // A/B (2026-09-28 팀 결정): 처음 여는 사람은 반은 심플, 반은 기본으로 시작한다.
  //  한 번 정해지면 기억되고, 마이 → 홈 화면 모양에서 언제든 바꿀 수 있다. 어느 쪽으로 시작했는지는 cbt_home_ab 에.
  get() {
    let v = window.Storage._safeGet(this.KEY, null);
    if (v !== 'simple' && v !== 'classic') {
      v = Math.random() < 0.5 ? 'simple' : 'classic';
      window.Storage._safeSet(this.KEY, v);
      window.Storage._safeSet('cbt_home_ab', { start: v, at: Date.now() });
    }
    return v;
  },

  // 심플 홈에도 '오늘'(기분 체크인·오늘 할 일)과 추천 영상을 올린다 (2026-09-28 팀 피드백).
  //  카드를 새로 만들지 않고 기본 홈의 카드를 그대로 옮겨 온다 — 같은 id·같은 기능, 되돌리면 제자리로.
  _SHARED: ['home-mood-card', 'todo-card', 'home-feed-sec'],
  _place(simple) {
    const slot = document.getElementById('home-simple-top');
    if (!slot) return;
    const todo = document.getElementById('todo-card-body');
    if (todo && !todo.closest('.home-card').id) todo.closest('.home-card').id = 'todo-card';
    this._SHARED.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!this._marks) this._marks = {};
      if (!this._marks[id]) { const m = document.createComment('home:' + id); el.parentNode.insertBefore(m, el); this._marks[id] = m; }
      if (simple) {
        const box = slot.querySelector(`[data-slot="${id}"]`);
        if (box && el.parentNode !== box) box.appendChild(el);
      } else {
        const m = this._marks[id];
        if (m.parentNode && el.previousSibling !== m) m.parentNode.insertBefore(el, m.nextSibling);
      }
    });
    // 영상이 없으면 심플 홈의 '추천 영상' 제목도 숨긴다
    const fs = document.getElementById('home-feed-sec'), head = document.getElementById('home-simple-feed-head');
    if (head) head.classList.toggle('hidden', !fs || fs.classList.contains('hidden'));
  },

  set(v, quiet) {
    const next = v === 'simple' ? 'simple' : 'classic';
    window.Storage._safeSet(this.KEY, next);
    this.apply();
    if (!quiet && window.App && window.App.showRecordToast) {
      window.App.showRecordToast(next === 'simple' ? '심플 홈으로 바꿨어요' : '기본 홈으로 되돌렸어요');
    }
    if (window.Sfx) window.Sfx.play('pop');
  },

  toggle() { this.set(this.get() === 'simple' ? 'classic' : 'simple'); },

  // ── 홈 안내 카드 ────────────────────────────────────────────────────
  //  '홈 화면 모양'과 '글씨 크기'는 설정 안쪽에만 있어서 있는 줄 모르고 쓴다(임상 자문 피드백 2026-10:
  //  "버튼이 많고 글씨가 작다, 심플 옵션이 있지만 처음에 안내가 없다"). 홈 맨 위에 한 번 알려준다.
  renderTip() {
    const el = document.getElementById('home-tip');
    if (!el) return;
    let off = false;
    try { off = !!window.Storage._safeGet('cbt_home_tip_off', false); } catch (e) {}
    if (off) { el.classList.add('hidden'); return; }
    // 원래 화면 / 간단한 화면 — 둘 중 하나를 고른다. 지금 쓰는 쪽이 채워진 버튼.
    const simple = this.get() === 'simple';
    document.getElementById('home-tip-title').textContent = '홈 화면을 골라 주세요';
    document.getElementById('home-tip-sub').textContent = '원래 화면은 기능이 한눈에 보이고, 간단한 화면은 큰 버튼 몇 개만 보여요.';
    document.getElementById('home-tip-classic').className = simple ? 'btn-secondary' : 'btn-primary';
    document.getElementById('home-tip-simple').className = simple ? 'btn-primary' : 'btn-secondary';
    el.classList.remove('hidden');
  },
  tipPick(v) { this.set(v, true); this.dismissTip(); },
  dismissTip() {
    try { window.Storage._safeSet('cbt_home_tip_off', true); } catch (e) {}
    const el = document.getElementById('home-tip');
    if (el) el.classList.add('hidden');
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('마이 › 설정에서 언제든 바꿀 수 있어요', null);
  },

  apply() {
    const simple = this.get() === 'simple';
    const c = document.getElementById('home-classic');
    const s = document.getElementById('home-simple');
    if (c) c.classList.toggle('hidden', simple);
    if (s) s.classList.toggle('hidden', !simple);
    this._place(simple);
    this.renderRow();
    if (simple && window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(s);
  },

  // 마이 → 앱 → 홈 화면 모양
  renderRow() {
    const el = document.getElementById('home-variant-row');
    if (!el) return;
    const simple = this.get() === 'simple';
    el.innerHTML = `
      <span class="my-row__ico" data-ic="swap" data-ic-size="19"></span>
      <span class="my-row__txt"><b>홈 화면 모양</b><span>${simple ? '심플 — 큰 버튼 다섯 개' : '기본 — 오늘·도구·추천 카드'}</span></span>
      <button class="my-row__btn" data-home-variant="${simple ? 'classic' : 'simple'}">${simple ? '기본으로' : '심플로'}</button>`;
    if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(el);
  },

  init() {
    try {
      const q = new URLSearchParams(location.search).get('home');
      if (q === 'simple' || q === 'classic') window.Storage._safeSet(this.KEY, q);
    } catch (e) {}
    this.apply();
    this.renderTip();
  },

  // ── 다섯 버튼이 여는 곳 ──
  go(what) {
    const A = window.App;
    if (what === 'chat') { if (A) A.switchTab('chat'); return; }
    if (what === 'call') { if (A) A.switchTab('counselors'); return; }
    if (what === 'tools') { this.openTools(); return; }
    if (what === 'community') { if (A) A.switchTab('home'); if (window.Community) window.Community.openAll(); return; }
    if (what === 'clinic') {
      if (A) A.switchTab('home');
      const C = window.Clinics;
      if (!C) return;
      if (C._state === 'ready') C.openAll();
      else if (C._geo && C._geo()) { C.load(C._geo()); C.openAll(); }
      else C.locate(false);
      return;
    }
    if (what === 'report') {
      if (window.Dashboard && window.Dashboard.openReports) window.Dashboard.openReports();
      else if (A) A.switchTab('dashboard');
    }
  },

  // 마음도구는 네 가지다. 심플 홈에서는 한 번 더 고르게 한다.
  TOOLS: [
    { id: 'record', icon: 'note', t: '사고 기록', d: '생각 정리' },
    { id: 'calm', icon: 'breath', t: '마음 안정', d: '호흡·그라운딩' },
    { id: 'night', icon: 'moon', t: '하루 정리', d: '3분 회고' },
    { id: 'learn', icon: 'book', t: '인지왜곡 학습', d: '10가지 함정' }
  ],

  openTools() {
    const old = document.getElementById('simple-tools-ov');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'simple-tools-ov';
    ov.dataset.ovGuard = '1';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1210; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end;';
    ov.innerHTML = `<div class="feed-ov">
      <div class="feed-ov__bar"><span class="feed-tag">마음도구</span><button class="feed-ov__x" data-simple-close>닫기</button></div>
      <h3>무엇부터 해볼까요?</h3>
      <div class="simple-tools">
        ${this.TOOLS.map(t => `
        <button class="simple-tool" data-simple-tool="${t.id}">
          <span class="simple-tool__ico" data-icon="${t.icon}" data-icon-size="20"></span>
          <span class="simple-tool__txt"><b>${t.t}</b><span>${t.d}</span></span>
          <span class="simple-tool__go">›</span>
        </button>`).join('')}
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  openTool(id) {
    const ov = document.getElementById('simple-tools-ov');
    if (ov) ov.remove();
    if (id === 'record') { if (window.App) window.App.switchTab('record'); return; }
    if (id === 'calm') { if (window.Calm) window.Calm.openMenu(); return; }
    if (id === 'night') { if (window.Growth) window.Growth.startNight(); return; }
    if (id === 'learn') { if (window.App) window.App.switchTab('learn'); }
  }
};

document.addEventListener('click', function (e) {
  const H = window.HomeSimple;
  if (!H) return;
  const go = e.target.closest('[data-simple-go]');
  if (go) { H.go(go.dataset.simpleGo); return; }
  const tool = e.target.closest('[data-simple-tool]');
  if (tool) { H.openTool(tool.dataset.simpleTool); return; }
  if (e.target.closest('[data-simple-close]')) { const o = document.getElementById('simple-tools-ov'); if (o) o.remove(); return; }
  const v = e.target.closest('[data-home-variant]');
  if (v) { H.set(v.dataset.homeVariant); }
});
