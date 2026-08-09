// ============================================================================
//  우렁이 세계 — 대시보드의 통합 게임 컨테이너
//  방·농장·옷장·퀘스트·훈장·서재를 한 화면 안에서 오간다.
//  각 화면의 실제 내용은 기존 모듈(Room/Farm/Closet/Missions/Growth/Dashboard/
//  Weekly)이 그리고, Game은 HUD·내비게이션·화면 전환만 맡는다.
// ============================================================================
window.Game = {

 // 옷장·훈장은 탭이 아니라 방 안의 하위 화면 (방의 / 버튼으로 진입)
  VIEWS: [
    { id: 'room',   ico: 'home',   name: '방' },
    { id: 'quest',  ico: 'quest',  name: '퀘스트' },
    { id: 'care',   ico: 'checkin', name: '돌봄' },
    { id: 'letter', ico: 'letter', name: '서재' }
  ],

  SHIELD_COIN_PRICE: 260,   // 씨앗코인으로 사는 스트릭 보호권

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
    // 옷장·훈장은 방의 하위 화면이라 내비에서는 '방'을 켜둔다
    const navView = (view === 'closet' || view === 'medal' || view === 'farm') ? 'room' : view;
    document.querySelectorAll('#game-nav button').forEach(b => {
      b.classList.toggle('active', b.dataset.view === navView);
    });

    if (!force && window.Sfx) window.Sfx.play('nav');

    // 화면별 내용 렌더 (각 모듈이 자기 컨테이너에 그린다)
    if (view === 'room'   && window.Room) { window.Room.pickIdle(); window.Room.render(); }
    if (view === 'farm'   && window.Farm)   window.Farm.render();
    if (view === 'closet' && window.Closet) window.Closet.render();
    if (view === 'care') {
      if (window.CarePlan) window.CarePlan.render();
      if (window.Progress) window.Progress.render();
      if (window.Goals) window.Goals.render();
    }
    if (view === 'quest') {
      if (window.Missions)  window.Missions.renderCard();
      if (window.Dashboard) window.Dashboard.renderCareFootprint();
    }
    if (view === 'medal') {
      if (window.Growth) window.Growth.renderBadgeCard();
      this.renderShieldShop();
    }
    // 나의 우렁이(레벨)는 방 계열 화면에서만 — 농장·퀘스트·서재에선 숨긴다
    const snailPanel = document.getElementById('my-snail-panel');
    const showSnail = (view === 'room' || view === 'closet' || view === 'medal');
    if (snailPanel) snailPanel.style.display = showSnail ? '' : 'none';
    if (showSnail && window.Growth) window.Growth.renderLevelCard();
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
      if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(document.getElementById('gv-letter'));
    }
    this.renderHud();
  },

  // --------------------------------------------------------------------------
  //  돌봄 퀵버튼 — 물이 고이는 다섯 가지 행동 (방·농장에 표시)
  // --------------------------------------------------------------------------
  careBar() {
    // 5칸 균등 그리드 — 좁은 화면에서도 한눈에, 스크롤 없음
    const cell = (ico, label, water, onclick) => `
      <button onclick="${onclick}" title="${label} · 물 +${water}"
        style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.55rem 0.1rem 0.5rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);">
        <span style="display: block; line-height: 0; margin-bottom: 0.3rem; color: var(--accent-primary);">${window.Icons ? window.Icons.svg(ico, { size: 24 }) : ''}</span>
        <span class="care-lbl" style="display: block; font-size: 0.74rem; font-weight: 700; color: var(--text-primary); white-space: nowrap;">${label}</span>
        <span style="display: block; font-size: 0.68rem; font-weight: 800; color: #6f97ab; margin-top: 0.05rem;">+${water}</span>
      </button>`;
    return `
      <div style="margin: 0.7rem 0 0.15rem;">
        <p style="margin: 0 0 0.35rem; font-size: 0.76rem; font-weight: 800; color: var(--text-muted); display: flex; align-items: center; gap: 0.3rem;">${window.Icons ? window.Icons.svg('water', { size: 13 }) : ''}물이 고이는 돌봄</p>
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.26rem;">
          ${cell('checkin', '체크인', 2, 'window.Game.openCheckin()')}
          ${cell('quest', '퀘스트', 3, 'window.Game.openQuestSheet()')}
          ${cell('moon', '하루정리', 4, "window.Growth && window.Growth.startNight()")}
          ${cell('note', '사고기록', 4, "window.App.switchTab('record')")}
          ${cell('breath', '호흡', 2, "window.Calm && window.Calm.openMenu()")}
        </div>
        <div id="game-sheet" class="hidden" style="margin-top: 0.5rem; padding: 0.8rem 0.85rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);"></div>
      </div>`;
  },

  // ── 그 자리에서 뜨는 시트 (탭 이동 없이 바로 처리) ──────────────────────
  _ic(n, sz) { return window.Icons ? window.Icons.svg(n, { size: sz || 15 }) : ''; },

  closeSheet() {
    const el = document.getElementById('game-sheet');
    if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
  },

  _sheet(title, inner) {
    const el = document.getElementById('game-sheet');
    if (!el) return;
    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.55rem;">
        <strong style="font-size: 0.94rem; color: var(--text-primary); display: inline-flex; align-items: center; gap: 0.3rem;">${title}</strong>
 <button onclick="window.Game.closeSheet()"style="all: unset; cursor: pointer; color: var(--text-muted); font-size: 1rem; padding: 0.1rem 0.35rem;"></button>
      </div>${inner}`;
    el.classList.remove('hidden');
    if (window.Sfx) window.Sfx.play('pop');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  openCheckin() {
    const EMO = [
 { v: 5, e:'기쁨', s:'joy', i:''}, { v: 4, e:'편안', s:'empathy', i:''},
 { v: 3, e:'보통', s:'blank', i:''}, { v: 2, e:'불안', s:'surprise', i:''},
 { v: 1.5, e:'우울', s:'sad', i:''}
    ];
    const last = window.Storage._safeGet('cbt_last_mood_ts', 0) || 0;
    const waitMin = Math.ceil((20 * 60000 - (Date.now() - last)) / 60000);
    if (Date.now() - last < 20 * 60000) {
      this._sheet(this._ic('checkin') + ' 지금 마음은 어때요?', `<p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">방금 마음을 들었어요. ${waitMin}분 뒤에 다시 물어볼게요.</p>`);
      return;
    }
    this._sheet(this._ic('checkin') + ' 지금 마음은 어때요?', `
      <div class="home-mood" data-mood-row>
        ${EMO.map(m => `
          <button class="home-mood__btn" data-emo="${m.e}" onclick="window.App.quickMood(${m.v},'${m.e}','${m.i}'); window.Game.afterCare();">
            <span data-sticker="${m.s}" data-sticker-size="42"></span>
            <span class="home-mood__lbl">${m.e === '불안' ? '불안/불편' : m.e === '우울' ? '우울/고통' : m.e}</span>
          </button>`).join('')}
      </div>`);
    if (window.App && window.App.refreshAllStickers) window.App.refreshAllStickers(document.getElementById('game-sheet'));
  },

  openQuestSheet() {
    this._sheet(this._ic('quest') + ' 오늘의 퀘스트', '<div data-mission-card></div>');
    if (window.Missions) window.Missions.renderCard();
  },

  // 시트에서 뭔가 완료된 뒤 — HUD·화면 갱신
  afterCare() {
    setTimeout(() => {
      this.closeSheet();
      this.renderHud();
      if (this._view === 'farm' && window.Farm) window.Farm.render();
      if (this._view === 'room' && window.Room) window.Room.render();
    }, 700);
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

    // 재화 3종을 균등 분할 — 숫자가 커져도 줄바꿈·잘림 없음
    const money = (ico, label, val, title, onclick, color) => `
      <button onclick="${onclick}" title="${title}"
        style="all: unset; box-sizing: border-box; cursor: pointer; flex: 1 1 0%; min-width: 0; text-align: center;
               background: var(--bg-tertiary); border: 1px solid var(--glass-border); padding: 0.42rem 0.2rem; border-radius: 11px;">
        <span style="display: flex; align-items: center; justify-content: center; gap: 0.25rem; font-size: 0.74rem; font-weight: 700; color: var(--text-muted); line-height: 1.25;">${window.Icons ? window.Icons.svg(ico, { size: 15 }) : ''}${label}</span>
        <span style="display: block; font-size: 1.02rem; font-weight: 800; color: ${color}; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${val}</span>
      </button>`;

    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.4rem;">
        <button onclick="window.Game.show('medal')" title="레벨·훈장"
          style="all: unset; cursor: pointer; font-size: 0.8rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent); padding: 0.26rem 0.7rem; border-radius: 999px;">Lv.${lv}</button>
        ${streak >= 2 ? `<span style="font-size: 0.78rem; font-weight: 800; color: #e8590c; background: color-mix(in srgb, #e8590c 12%, transparent); border: 1px solid color-mix(in srgb, #e8590c 28%, transparent); padding: 0.24rem 0.62rem; border-radius: 999px;">${streak}일 연속</span>` : ''}
      </div>
      <div style="display: flex; gap: 0.35rem;">
        ${money('water', '물', water, '물 — 돌봄으로 모아요', "window.Game.show('farm')", '#6f97ab')}
        ${money('coin', '코인', coins.toLocaleString(), '씨앗코인 — 농장 수확', "window.Game.show('farm')", 'var(--accent-primary)')}
        ${money('cash', '캐시', cash.toLocaleString(), '우렁 캐시 — 마이페이지 충전', "window.App.switchTab('mypage')", '#c9a227')}
      </div>`;
  },

  renderNav() {
    const el = document.getElementById('game-nav');
    if (!el) return;
    el.innerHTML = this.VIEWS.map(v => `
      <button data-view="${v.id}" class="${v.id === this._view ? 'active' : ''}" onclick="window.Game.show('${v.id}')">
        <span class="game-nav-emoji">${window.Icons ? window.Icons.svg(v.ico, { size: 21 }) : ''}</span>
        <span class="game-nav-label">${v.name}</span>
      </button>`).join('');
  },

  // --------------------------------------------------------------------------
  //  스트릭 보호권 — 훈장 화면의 아이템 (씨앗코인 또는 캐시)
  // --------------------------------------------------------------------------
  async buyShieldWithCoins() {
    const G = window.Growth;
    if (!G || !window.Farm) return;
    if (G.shields() >= G.SHIELD_MAX) { window.UI.alert(`보호권은 최대 ${G.SHIELD_MAX}개까지 보관할 수 있어요.`); return; }
    if (window.Farm.coins() < this.SHIELD_COIN_PRICE) {
      window.UI.alert(`씨앗코인이 부족해요. (${this.SHIELD_COIN_PRICE}코인 필요)\n농장에서 작물을 수확해보세요.`);
      return;
    }
 if (!await window.UI.confirm(`스트릭 보호권 1개를 ${this.SHIELD_COIN_PRICE}코인에 살까요?`)) return;
    window.Farm.spendCoins(this.SHIELD_COIN_PRICE);
    window.Storage._safeSet('cbt_streak_shields', G.shields() + 1);
    if (window.Sfx) window.Sfx.hit('shield');
    if (window.App) window.App.showRecordToast('스트릭 보호권을 손에 넣었어요!');
    this.renderShieldShop();
    this.renderHud();
    if (window.Growth) window.Growth.renderBadgeCard();
  },

  renderShieldShop() {
    // 아주 작게 — 한 줄짜리 각주. 스트릭이 2일 이상일 때만 보인다.
    const el = document.getElementById('shield-shop');
    if (!el || !window.Growth) return;
    const G = window.Growth;
    const streak = (window.Storage.getStreak && window.Storage.getStreak()) || 0;
    if (streak < 2 && G.shields() === 0) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <p style="margin: 0; font-size: 0.66rem; color: var(--text-muted); text-align: right;">
 보호권 ${G.shields()}개
        <button onclick="window.Game.buyShieldWithCoins()" style="all: unset; cursor: pointer; font-weight: 700; color: var(--text-muted); border-bottom: 1px solid var(--glass-border); margin-left: 0.3rem;">코인으로 채우기</button>
      </p>`;
  }
};
