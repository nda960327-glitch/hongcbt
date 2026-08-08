// ============================================================================
//  앱 잠금 (PIN 4자리) — 정신건강 기록은 가장 사적인 데이터.
//  앱을 열 때, 그리고 1분 이상 백그라운드에 있다 돌아올 때 PIN을 요구한다.
//  (생체 인증은 안드로이드 앱 전환 시 WebAuthn/Biometric으로 확장 지점)
// ============================================================================
window.AppLock = {
  _fails: 0,
  _lockUntil: 0,

  enabled() {
    return !!(window.Storage._safeGet('cbt_lock_on', false) && window.Storage._safeGet('cbt_lock_pin', null));
  },

  _hash(pin) {
    // 데모 수준 난독화 (실서비스: 네이티브 키체인/서버 검증)
    let h = 7;
    const s = 'wr-lock:' + pin + ':v1';
    for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
    return String(h);
  },

  // 마이페이지 설정에서: 켜기(PIN 등록) / 끄기(PIN 확인)
  setup() {
    if (this.enabled()) {
      this._pad('현재 PIN을 입력하면 잠금이 꺼져요', pin => {
        if (this._hash(pin) !== window.Storage._safeGet('cbt_lock_pin', '')) return false;
        window.Storage._safeSet('cbt_lock_on', false);
        window.Storage._safeSet('cbt_lock_pin', null);
        if (window.App) window.App.showRecordToast('앱 잠금을 껐어요');
        this._renderRow();
        return true;
      }, true);
    } else {
      this._pad('사용할 PIN 4자리를 정해주세요', pin1 => {
        this._pad('확인을 위해 한 번 더 입력해주세요', pin2 => {
          if (pin1 !== pin2) { if (window.App) window.App.showRecordToast('두 입력이 달라요. 처음부터 다시 해주세요'); return true; }
          window.Storage._safeSet('cbt_lock_pin', this._hash(pin1));
          window.Storage._safeSet('cbt_lock_on', true);
          if (window.App) window.App.showRecordToast('앱 잠금을 켰어요. 다음 실행부터 PIN을 물어봐요');
          this._renderRow();
          return true;
        }, true);
        return true;
      }, true);
    }
  },

  _renderRow() {
    const btn = document.getElementById('lock-setup-btn');
    if (btn) btn.textContent = this.enabled() ? '잠금 끄기' : '잠금 켜기';
  },

  init() {
    this._renderRow();
    if (this.enabled()) this.guard();
    // 1분 이상 백그라운드에 있다 돌아오면 다시 잠근다
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._hiddenAt = Date.now();
      else if (this.enabled() && this._hiddenAt && Date.now() - this._hiddenAt > 60000) this.guard();
    });
  },

  guard() {
    this._pad('PIN을 입력해주세요', pin => {
      if (this._hash(pin) === window.Storage._safeGet('cbt_lock_pin', '')) { this._fails = 0; return true; }
      this._fails++;
      if (this._fails >= 5) { this._lockUntil = Date.now() + 30000; this._fails = 0; }
      return false;
    }, false); // 닫기 불가 — 풀어야 앱 사용 가능
  },

  // PIN 패드 오버레이 (prompt 미지원 웹뷰에서도 동작)
  _pad(title, onSubmit, dismissible) {
    const old = document.getElementById('applock-overlay');
    if (old) old.remove();
    let buf = '';
    const ov = document.createElement('div');
    ov.id = 'applock-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10030; background: var(--bg-primary); display: flex; align-items: center; justify-content: center; padding: 2rem;';
    const dots = () => '<div id="al-dots" style="display: flex; gap: 0.7rem; justify-content: center; margin: 1rem 0 1.3rem;">' +
      [0, 1, 2, 3].map(i => `<span style="width: 14px; height: 14px; border-radius: 50%; ${i < buf.length ? 'background: var(--accent-primary);' : 'background: transparent; border: 2px solid var(--glass-border);'}"></span>`).join('') + '</div>';
    ov.innerHTML = `
      <div style="width: 100%; max-width: 280px; text-align: center;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('hide', 96) : '🔒'}</span>
        <h2 id="al-title" style="margin: 0.6rem 0 0; font-size: 1.05rem; color: var(--text-primary);">${title}</h2>
        ${dots()}
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === ''
            ? '<span></span>'
            : `<button data-k="${k}" style="all: unset; box-sizing: border-box; aspect-ratio: 1.35; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: var(--bg-secondary); border: 1px solid var(--glass-border); font-size: 1.15rem; font-weight: 700; color: var(--text-primary); cursor: pointer;">${k}</button>`).join('')}
        </div>
        ${dismissible ? '<button id="al-cancel" style="all: unset; margin-top: 1rem; font-size: 0.82rem; color: var(--text-muted); cursor: pointer; padding: 0.4rem;">취소</button>' : '<p style="margin-top: 1rem; font-size: 0.7rem; color: var(--text-muted);">PIN을 잊었다면 앱 데이터 초기화로만 풀 수 있어요</p>'}
      </div>`;
    document.body.appendChild(ov);
    const refresh = () => { const d = ov.querySelector('#al-dots'); if (d) d.outerHTML = dots(); };
    const submit = () => {
      if (this._lockUntil > Date.now()) {
        document.getElementById('al-title').textContent = `너무 많이 틀렸어요 — ${Math.ceil((this._lockUntil - Date.now()) / 1000)}초 후 다시`;
        buf = ''; refresh(); return;
      }
      const ok = onSubmit(buf);
      buf = '';
      if (ok) { ov.remove(); }
      else {
        const t = document.getElementById('al-title');
        if (t) t.textContent = 'PIN이 달라요 — 다시 입력해주세요';
        refresh();
        ov.firstElementChild.style.animation = 'alshake 0.3s';
        setTimeout(() => { if (ov.firstElementChild) ov.firstElementChild.style.animation = ''; }, 350);
      }
    };
    ov.querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === '⌫') buf = buf.slice(0, -1);
      else if (buf.length < 4) buf += k;
      refresh();
      if (buf.length === 4) setTimeout(submit, 120);
    }));
    const cancel = ov.querySelector('#al-cancel');
    if (cancel) cancel.addEventListener('click', () => ov.remove());
    if (!document.getElementById('al-style')) {
      const st = document.createElement('style');
      st.id = 'al-style';
      st.textContent = '@keyframes alshake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }';
      document.head.appendChild(st);
    }
  }
};
