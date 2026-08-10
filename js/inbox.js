// ============================================================================
//  알림함 — 앱이 보낸 모든 알림이 모이는 곳
//   시스템 알림은 한 번 지나가면 끝이다. 권한을 안 줬거나, 화면을 보고 있었거나,
//   알림창을 쓸어 넘겼으면 그 말은 영영 사라진다. 그래서 앱 안에도 똑같이 쌓아둔다.
//   홈 우측 상단의 종 버튼(#notif-chip)이 입구다.
// ============================================================================
window.Inbox = {
  KEY: 'cbt_notif_inbox',
  MAX: 50,

  // --- 저장소 ---------------------------------------------------------------
  all() {
    if (!window.Storage) return [];
    const list = window.Storage._safeGet(this.KEY, []);
    return Array.isArray(list) ? list : [];
  },

  _save(list) {
    if (!window.Storage) return;
    window.Storage._safeSet(this.KEY, list.slice(0, this.MAX));
  },

  // act 는 눌렀을 때 갈 곳. 없으면 그냥 읽고 마는 알림.
  add(title, body, act) {
    if (!window.Storage) return null;
    const item = {
      id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: String(title || ''),
      body: String(body || ''),
      ts: Date.now(),
      read: false,
      act: act || ''
    };
    const list = this.all();
    list.unshift(item); // 최신이 앞
    this._save(list);
    this.renderChip();
    return item;
  },

  remove(id) {
    this._save(this.all().filter(n => n.id !== id));
    this._renderList();
    this.renderChip();
  },

  // 확인 없이 비운다. 알림함은 지워도 잃을 게 없는 곳이라 한 번에 끝내는 편이 낫다.
  clearAll() {
    this._save([]);
    this._renderList();
    this.renderChip();
    if (window.Sfx) window.Sfx.play('pop');
  },

  unread() {
    return this.all().filter(n => !n.read).length;
  },

  // --- 홈 상단 종 버튼 -------------------------------------------------------
  _bellSvg(size) {
    // icons.js 에 종이 없어서 여기서 직접 그린다 (손그림 세트와 같은 라인 스타일)
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '"'
      + ' fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'
      + ' stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M18 15.5V10.5a6 6 0 1 0-12 0v5l-1.4 2.2a.6.6 0 0 0 .5.9h14.8a.6.6 0 0 0 .5-.9Z"/>'
      + '<path d="M10 21a2.2 2.2 0 0 0 4 0"/></svg>';
  },

  renderChip() {
    const el = document.getElementById('notif-chip');
    if (!el) return;
    const n = this.unread();
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.position = 'relative';
    el.setAttribute('aria-label', n ? '알림함 · 안 읽은 알림 ' + n + '개' : '알림함');
    el.innerHTML =
      '<span style="line-height:0;display:inline-flex;">' + this._bellSvg(16) + '</span>'
      + (n
        ? '<span style="position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;'
          + 'box-sizing:border-box;padding:0 3px;border-radius:999px;background:#e05d5d;color:#fff;'
          + 'font-size:0.6rem;font-weight:800;line-height:15px;text-align:center;">'
          + (n > 99 ? '99+' : n) + '</span>'
        : '');
  },

  // --- 시각 표기 -------------------------------------------------------------
  _rel(ts) {
    const diff = Date.now() - (ts || 0);
    if (diff < 60 * 1000) return '방금';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '분 전';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '시간 전';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // --- 패널 -----------------------------------------------------------------
  open() {
    this.close();
    const ov = document.createElement('div');
    ov.id = 'inbox-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10045; background: var(--bg-primary); overflow-y: auto;'
      + ' padding: calc(0.9rem + env(safe-area-inset-top)) 1.1rem calc(2rem + env(safe-area-inset-bottom));';
    ov.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.9rem;">
        <button onclick="window.Inbox.close()" aria-label="닫기"
          style="all: unset; cursor: pointer; font-size: 1.15rem; color: var(--text-muted); padding: 0.2rem 0.4rem;">&#8592;</button>
        <strong style="font-size: 1.05rem; color: var(--text-primary);">알림</strong>
        <button onclick="window.Inbox.clearAll()"
          style="all: unset; margin-left: auto; cursor: pointer; font-size: 0.76rem; font-weight: 700; color: var(--text-muted); padding: 0.35rem 0.5rem;">모두 지우기</button>
      </div>
      <div id="inbox-list" style="display: flex; flex-direction: column; gap: 0.55rem;"></div>`;
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');

    this._renderList();
    // 연 순간 전부 읽음 처리 — 뱃지는 '새로 온 게 있다'만 알려주면 된다
    const list = this.all();
    if (list.some(n => !n.read)) {
      list.forEach(n => { n.read = true; });
      this._save(list);
    }
    this.renderChip();
  },

  close() {
    const ov = document.getElementById('inbox-overlay');
    if (ov) ov.remove();
  },

  _renderList() {
    const box = document.getElementById('inbox-list');
    if (!box) return;
    const list = this.all();

    if (!list.length) {
      box.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem;">
          <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('waiting', 96) : ''}</span>
          <p style="margin: 0.9rem 0 0; font-size: 0.88rem; color: var(--text-muted);">아직 온 알림이 없어요</p>
        </div>`;
      return;
    }

    box.innerHTML = list.map(n => `
      <div ${n.act ? `onclick="window.Inbox.tap('${n.id}')"` : ''} style="position: relative; border-radius: 14px; padding: 0.75rem 2.1rem 0.75rem 0.85rem;
        background: var(--bg-tertiary); border: 1px solid var(--glass-border);${n.act ? ' cursor: pointer;' : ''}">
        <div style="display: flex; align-items: baseline; gap: 0.4rem;">
          <strong style="font-size: 0.88rem; color: var(--text-primary);">${this._esc(n.title)}</strong>
          <span style="margin-left: auto; flex-shrink: 0; font-size: 0.68rem; color: var(--text-muted);">${this._rel(n.ts)}</span>
        </div>
        <p style="margin: 0.25rem 0 0; font-size: 0.79rem; line-height: 1.55; color: var(--text-secondary);
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${this._esc(n.body)}</p>
        <button onclick="event.stopPropagation(); window.Inbox.remove('${n.id}')" aria-label="이 알림 지우기"
          style="all: unset; position: absolute; top: 0.45rem; right: 0.5rem; cursor: pointer;
          font-size: 0.95rem; color: var(--text-muted); padding: 0.25rem 0.4rem;">&#215;</button>
      </div>`).join('');
  },

  tap(id) {
    const item = this.all().find(n => n.id === id);
    if (!item) return;
    this.close();
    this.runAct(item.act);
  },

  // --- 알림 → 기능 이동 ------------------------------------------------------
  //  없는 모듈이면 조용히 무시한다. 알림 하나 눌렀다고 앱이 멈추면 안 된다.
  runAct(act) {
    if (!act) return;
    try {
      switch (act) {
        case 'home':
          if (window.App) window.App.switchTab('home');
          break;
        case 'breath':
          if (window.Calm) window.Calm.startBreath('box');
          break;
        case 'calm':
          if (window.Calm) window.Calm.openMenu();
          break;
        case 'night':
          if (window.Growth) window.Growth.startNight();
          break;
        case 'chat':
          if (window.App) window.App.switchTab('chat');
          break;
        case 'mypage':
          if (window.App) window.App.switchTab('mypage');
          break;
        case 'dashboard':
          if (window.App) window.App.switchTab('dashboard');
          break;
      }
    } catch (e) {}
  }
};

// 홈 종 버튼은 앱 초기화보다 먼저 눈에 보인다. DOM 이 준비되면 바로 한 번 그린다.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Inbox.renderChip());
} else {
  window.Inbox.renderChip();
}
