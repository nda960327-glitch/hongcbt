// ============================================================================
//  우렁이 세계 — 대시보드의 통합 게임 컨테이너
//  방·농장·옷장·퀘스트·훈장·서재를 한 화면 안에서 오간다.
//  각 화면의 실제 내용은 기존 모듈(Room/Farm/Closet/Missions/Growth/Dashboard/
//  Weekly)이 그리고, Game은 HUD·내비게이션·화면 전환만 맡는다.
// ============================================================================
window.Game = {

  VIEWS: [
    { id: 'room',   emoji: '🏡', name: '방' },
    { id: 'farm',   emoji: '🌱', name: '농장' },
    { id: 'closet', emoji: '👒', name: '옷장' },
    { id: 'quest',  emoji: '🗡️', name: '퀘스트' },
    { id: 'medal',  emoji: '🏅', name: '훈장' },
    { id: 'letter', emoji: '💌', name: '서재' }
  ],

  SHIELD_COIN_PRICE: 120,   // 씨앗코인으로 사는 스트릭 보호권

  _view: 'room',

  open() {
    this.renderNav();
    this.show(this._view, true);
  },

  show(view, force) {
    if (!force && this._view === view) return;
    this._view = view;

    document.querySelectorAll('.game-view').forEach(el => {
      el.classList.toggle('hidden', el.id !== 'gv-' + view);
    });
    document.querySelectorAll('#game-nav button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    if (!force && window.Sfx) window.Sfx.play('nav');

    // 화면별 내용 렌더 (각 모듈이 자기 컨테이너에 그린다)
    if (view === 'room'   && window.Room) { window.Room.pickIdle(); window.Room.render(); }
    if (view === 'farm'   && window.Farm)   window.Farm.render();
    if (view === 'closet' && window.Closet) window.Closet.render();
    if (view === 'quest') {
      if (window.Missions)  window.Missions.renderCard();
      if (window.Dashboard) window.Dashboard.renderCareFootprint();
    }
    if (view === 'medal') {
      if (window.Growth) { window.Growth.renderLevelCard(); window.Growth.renderBadgeCard(); }
      this.renderShieldShop();
    }
    if (view === 'letter') {
      if (window.Dashboard) {
        window.Dashboard.renderTodayMoodChart();
        window.Dashboard.renderMoodChart();
        window.Dashboard.renderMonthlyReport();
        if (window.Dashboard.renderMoodCalendar) window.Dashboard.renderMoodCalendar();
      }
      if (window.Mail)   window.Mail.render();
      if (window.Weekly) window.Weekly.renderCard();
      if (window.Growth) window.Growth.renderNightList();
    }
    this.renderHud();
  },

  // --------------------------------------------------------------------------
  //  HUD — 물·코인·캐시·레벨·스트릭 (누르면 관련 화면으로)
  // --------------------------------------------------------------------------
  renderHud() {
    const el = document.getElementById('game-hud');
    if (!el) return;
    const water  = window.Farm   ? window.Farm.water()      : 0;
    const coins  = window.Farm   ? window.Farm.coins()      : 0;
    const cash   = window.Wallet ? window.Wallet.balance()  : 0;
    const lv     = window.Growth ? window.Growth.level()    : 1;
    const streak = (window.Storage && window.Storage.getStreak) ? (window.Storage.getStreak() || 0) : 0;

    const chip = (txt, title, onclick, color) => `
      <button onclick="${onclick}" title="${title}"
        style="all: unset; box-sizing: border-box; cursor: pointer; font-size: 0.72rem; font-weight: 800; color: ${color};
               background: var(--bg-tertiary); border: 1px solid var(--glass-border); padding: 0.28rem 0.6rem; border-radius: 999px; white-space: nowrap;">
        ${txt}</button>`;

    el.innerHTML = `
      <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center;">
        ${chip(`Lv.${lv}`, '우렁이 레벨 — 훈장 보기', "window.Game.show('medal')", 'var(--accent-primary)')}
        ${streak >= 2 ? chip(`🔥 ${streak}일`, '연속 돌봄 스트릭', "window.Game.show('medal')", '#e8590c') : ''}
        <span style="flex: 1;"></span>
        ${chip(`💧 ${water}`, '물 — 퀘스트로 모아요', "window.Game.show('quest')", '#6f97ab')}
        ${chip(`🌰 ${coins.toLocaleString()}`, '씨앗코인 — 농장에서 수확', "window.Game.show('farm')", 'var(--accent-primary)')}
        ${chip(`💰 ${cash.toLocaleString()}`, '우렁 캐시 — 마이페이지에서 충전', "window.App.switchTab('mypage')", '#c9a227')}
      </div>`;
  },

  renderNav() {
    const el = document.getElementById('game-nav');
    if (!el) return;
    el.innerHTML = this.VIEWS.map(v => `
      <button data-view="${v.id}" class="${v.id === this._view ? 'active' : ''}" onclick="window.Game.show('${v.id}')">
        <span class="game-nav-emoji">${v.emoji}</span>
        <span class="game-nav-label">${v.name}</span>
      </button>`).join('');
  },

  // --------------------------------------------------------------------------
  //  스트릭 보호권 — 훈장 화면의 아이템 (씨앗코인 또는 캐시)
  // --------------------------------------------------------------------------
  buyShieldWithCoins() {
    const G = window.Growth;
    if (!G || !window.Farm) return;
    if (G.shields() >= G.SHIELD_MAX) { alert(`보호권은 최대 ${G.SHIELD_MAX}개까지 보관할 수 있어요.`); return; }
    if (window.Farm.coins() < this.SHIELD_COIN_PRICE) {
      alert(`씨앗코인이 부족해요. (${this.SHIELD_COIN_PRICE}코인 필요)\n농장에서 작물을 수확해보세요.`);
      return;
    }
    if (!confirm(`🛡️ 스트릭 보호권 1개를 ${this.SHIELD_COIN_PRICE}코인에 살까요?`)) return;
    window.Farm.spendCoins(this.SHIELD_COIN_PRICE);
    window.Storage._safeSet('cbt_streak_shields', G.shields() + 1);
    if (window.Sfx) window.Sfx.play('shield');
    if (window.App) window.App.showRecordToast('🛡️ 스트릭 보호권을 손에 넣었어요!');
    this.renderShieldShop();
    this.renderHud();
    if (window.Growth) window.Growth.renderBadgeCard();
  },

  renderShieldShop() {
    const el = document.getElementById('shield-shop');
    if (!el || !window.Growth) return;
    const G = window.Growth;
    const n = G.shields();
    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.7rem; padding: 0.75rem 0.85rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);">
        <span style="font-size: 1.6rem; line-height: 1;">🛡️</span>
        <div style="flex: 1; min-width: 0;">
          <strong style="font-size: 0.84rem; color: var(--text-primary); display: block;">스트릭 보호권 <span style="color: var(--accent-primary);">${n}개 보유</span></strong>
          <span style="font-size: 0.7rem; color: var(--text-muted);">하루 걸러도 🔥스트릭이 끊기지 않게 지켜줘요 (최대 ${G.SHIELD_MAX}개)</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.3rem; flex-shrink: 0;">
          <button onclick="window.Game.buyShieldWithCoins()" style="all: unset; cursor: pointer; text-align: center; font-size: 0.7rem; font-weight: 800; color: var(--accent-primary); border: 1px solid color-mix(in srgb, var(--accent-primary) 45%, transparent); padding: 0.3rem 0.6rem; border-radius: 999px;">🌰 ${this.SHIELD_COIN_PRICE}코인</button>
          <button onclick="window.Growth.buyShield(); window.Game.renderShieldShop(); window.Game.renderHud();" style="all: unset; cursor: pointer; text-align: center; font-size: 0.7rem; font-weight: 800; color: #c9a227; border: 1px solid color-mix(in srgb, #c9a227 45%, transparent); padding: 0.3rem 0.6rem; border-radius: 999px;">💰 ${(G.SHIELD_PRICE || 0).toLocaleString()}캐시</button>
        </div>
      </div>`;
  }
};
