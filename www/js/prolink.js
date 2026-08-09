// ============================================================================
//  상담사 앱으로 가는 숨은 문
//
//  상담사도 평소엔 이 앱을 쓰는 한 사람이다. 화면 어딘가에 '상담사 전용'
//  버튼을 상시로 두면 내담자 눈에도 계속 보이고, 앱의 성격이 흐려진다.
//  그래서 왼쪽 위 우렁이를 길게 누르면 열리게 했다.
//  아는 사람만 쓰는 문이고, 어차피 저쪽은 코드가 있어야 들어간다.
//
//  배지는 반대 방향이다 — 숨겨두면 못 보니까,
//  받을 게 있을 때만 로고 위에 빨간 숫자를 올린다.
// ============================================================================

window.ProLink = {
  HOLD_MS: 700,
  POLL_MS: 45000,
  _t: null, _fired: false, _timer: null,

  url() {
    return (window.App && window.App.proAppUrl)
      ? window.App.proAppUrl()
      : location.origin + location.pathname.replace(/[^/]*$/, '') + 'pro/index.html';
  },

  // 승인된 상담사만 코드를 갖고 있다. 없으면 배지도 폴링도 하지 않는다.
  //  (일반 사용자에게 45초마다 쓸데없는 요청을 보내지 않기 위해서이기도 하다)
  code() {
    try {
      const apps = (window.Storage && window.Storage._safeGet('cbt_counselor_apps', [])) || [];
      const ok = apps.find(a => a && a.inboxCode);
      return ok ? String(ok.inboxCode) : '';
    } catch (e) { return ''; }
  },

  seen(v) {
    if (v === undefined) return Number(localStorage.getItem('pro_badge_seen') || 0);
    try { localStorage.setItem('pro_badge_seen', String(v)); } catch (e) {}
  },

  init() {
    const logo = document.querySelector('#app-header .app-logo');
    if (!logo) return;
    logo.style.position = 'relative';
    logo.style.touchAction = 'manipulation';
    logo.setAttribute('title', '길게 누르면 상담사 앱');

    const start = e => {
      this._fired = false;
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        this._fired = true;
        // 손끝에 '열렸다'는 신호를 준다 — 길게 누르기는 피드백이 없으면 불안하다
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (err) {}
        if (window.Sfx && window.Sfx.play) { try { window.Sfx.play('appear'); } catch (err) {} }
        this.open();
      }, this.HOLD_MS);
    };
    const cancel = () => clearTimeout(this._t);

    logo.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => logo.addEventListener(ev, cancel));
    // 길게 눌렀다가 뗄 때 클릭이 따라오는 걸 막는다
    logo.addEventListener('click', e => { if (this._fired) { e.preventDefault(); e.stopPropagation(); } });
    logo.addEventListener('contextmenu', e => e.preventDefault());

    this.refresh();
    clearInterval(this._timer);
    this._timer = setInterval(() => this.refresh(), this.POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  },

  open() {
    this.seen(Date.now());     // 지금 보러 가므로 여기까지는 본 것으로 친다
    this.paint(0);
    window.open(this.url(), '_blank', 'noopener');
  },

  async refresh() {
    const code = this.code();
    if (!code) { this.paint(0); return; }
    try {
      const api = window.Api;
      const r = api && api.json
        ? await api.json('/api/badge?code=' + encodeURIComponent(code) + '&since=' + this.seen())
        : await fetch('/api/badge?code=' + encodeURIComponent(code) + '&since=' + this.seen())
            .then(x => x.ok ? x.json() : null);
      if (r && r.ok) this.paint(r.total || 0, r);
    } catch (e) { /* 조용히 — 배지가 안 뜨는 것보다 앱이 멈추는 게 나쁘다 */ }
  },

  paint(n, detail) {
    const logo = document.querySelector('#app-header .app-logo');
    if (!logo) return;
    let b = logo.querySelector('.pro-badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('span');
      b.className = 'pro-badge';
      logo.appendChild(b);
    }
    b.textContent = n > 99 ? '99+' : String(n);
    // 전화가 울리는 중이면 배지도 같이 뛴다 — 이건 몇 초 안에 끝나는 일이다
    b.classList.toggle('ringing', !!(detail && detail.ringing));
    b.title = detail
      ? `새 채팅 ${detail.chats} · 새 예약 ${detail.bookings} · 안 읽은 자료 ${detail.inbox}` +
        (detail.ringing ? ' · 전화 오는 중' : '')
      : '';
  }
};

document.addEventListener('DOMContentLoaded', () => window.ProLink.init());
