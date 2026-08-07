// ============================================================================
//  우렁이 농장 — 마음을 돌본 만큼 밭이 자란다
//
//  세계관: 우렁이는 마음밭을 가꾼다. 사용자가 자기를 돌볼 때마다(체크인·미션·
//  하루정리·사고기록·호흡) 물이 고이고, 그 물로 작물을 키운다. 다 자란 작물을
//  거두면 씨앗코인이 생기고, 그 코인으로 우렁이 옷을 사 입힌다.
//
//  ※ 시간이 지나서 자라는 게 아니라 '돌봄 행동'으로만 자란다. 방치해도 시들지
//     않는다 — 죄책감을 주는 게임이 되면 안 되기 때문.
// ============================================================================
window.Farm = {

  PLOTS: 6,

  CROPS: [
    { id: 'lettuce', emoji: '🥬', name: '상추',   need: 6,  coin: 8  },
    { id: 'carrot',  emoji: '🥕', name: '당근',   need: 9,  coin: 14 },
    { id: 'corn',    emoji: '🌽', name: '옥수수', need: 12, coin: 20 },
    { id: 'tomato',  emoji: '🍅', name: '토마토', need: 14, coin: 24 },
    { id: 'berry',   emoji: '🍓', name: '딸기',   need: 16, coin: 34 },
    { id: 'pumpkin', emoji: '🎃', name: '호박',   need: 22, coin: 55 }
  ],

  _S() { return window.Storage; },
  crop(id) { return this.CROPS.find(c => c.id === id) || null; },

  // --------------------------------------------------------------------------
  //  상태
  // --------------------------------------------------------------------------
  plots() {
    const p = this._S()._safeGet('cbt_farm_plots', null);
    if (Array.isArray(p) && p.length === this.PLOTS) return p;
    const fresh = Array.from({ length: this.PLOTS }, () => null);
    this._S()._safeSet('cbt_farm_plots', fresh);
    return fresh;
  },
  _savePlots(p) { this._S()._safeSet('cbt_farm_plots', p); },

  water() { return this._S()._safeGet('cbt_farm_water', 0) || 0; },
  _setWater(n) { this._S()._safeSet('cbt_farm_water', Math.max(0, n)); },

  coins() { return this._S()._safeGet('cbt_farm_coins', 0) || 0; },
  addCoins(n) { this._S()._safeSet('cbt_farm_coins', this.coins() + n); },
  spendCoins(n) {
    const c = this.coins();
    if (c < n) return false;
    this._S()._safeSet('cbt_farm_coins', c - n);
    this.render();
    if (window.Closet) window.Closet.render();
    return true;
  },

  stats() { return this._S()._safeGet('cbt_farm_stats', { harvested: 0, byCrop: {} }) || { harvested: 0, byCrop: {} }; },

  // --------------------------------------------------------------------------
  //  물 — 돌봄 행동이 부를 진입점
  // --------------------------------------------------------------------------
  addWater(n, reason) {
    if (!n || n <= 0) return;
    this._setWater(this.water() + n);
    if (window.App && window.App.showRecordToast) {
      window.App.showRecordToast(`💧 물 +${n} — ${reason || '마음을 돌봤어요'}`);
    }
    this.render();
  },

  // 우렁 캐시로 물 사기 (급할 때만 — 기본은 돌봄 행동으로 모으는 것)
  WATER_PACKS: [
    { water: 10, cash: 300 },
    { water: 30, cash: 800 },
    { water: 70, cash: 1500 }
  ],

  buyWater(idx) {
    const pack = this.WATER_PACKS[idx];
    if (!pack || !window.Wallet) return;
    if (window.Wallet.balance() < pack.cash) {
      alert(`우렁 캐시가 부족해요. (${pack.cash.toLocaleString()}캐시 필요)\n마이페이지에서 충전할 수 있어요.`);
      return;
    }
    if (!confirm(`💧 물 ${pack.water}개를 ${pack.cash.toLocaleString()}캐시에 살까요?`)) return;
    window.Wallet.spend(pack.cash, `농장 · 물 ${pack.water}`);
    if (window.Sfx) window.Sfx.play('buy');
    this._setWater(this.water() + pack.water);
    if (window.App) window.App.showRecordToast(`💧 물 ${pack.water}개를 채웠어요!`);
    this.render();
    if (window.Closet) window.Closet.render();
  },

  toggleShop() {
    const el = document.getElementById('farm-shop');
    if (!el) return;
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    const cash = window.Wallet ? window.Wallet.balance() : 0;
    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.55rem;">
        <strong style="font-size: 0.84rem; color: var(--text-primary);">💧 물 충전소</strong>
        <span style="font-size: 0.72rem; color: var(--text-muted);">보유 ${cash.toLocaleString()}캐시</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem;">
        ${this.WATER_PACKS.map((p, i) => `
          <button onclick="window.Farm.buyWater(${i})"
            style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.6rem 0.25rem; border-radius: 12px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary);">
            <div style="font-size: 1.15rem; line-height: 1.3;">💧</div>
            <div style="font-size: 0.78rem; font-weight: 800; color: var(--text-primary);">물 ${p.water}</div>
            <div style="font-size: 0.66rem; font-weight: 700; color: #c9a227;">${p.cash.toLocaleString()}캐시</div>
          </button>`).join('')}
      </div>
      <p style="margin: 0.6rem 0 0; font-size: 0.66rem; color: var(--text-muted);">
        물은 원래 마음을 돌보면 저절로 고여요. 급할 때만 쓰세요.
      </p>`;
    el.classList.remove('hidden');
  },

  // --------------------------------------------------------------------------
  //  심기 · 물주기 · 수확
  // --------------------------------------------------------------------------
  plant(i, cropId) {
    const p = this.plots();
    if (p[i]) return;
    const c = this.crop(cropId);
    if (!c) return;
    p[i] = { crop: c.id, water: 0, ts: Date.now() };
    this._savePlots(p);
    this.closePicker();
    if (window.Sfx) window.Sfx.play('plant');
    if (window.App && window.App.stickerPop) window.App.stickerPop('farming', 1200);
    this.render();
  },

  openPicker(i) {
    const el = document.getElementById('farm-picker');
    if (!el) return;
    el.dataset.plot = String(i);
    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
        <strong style="font-size: 0.88rem; color: var(--text-primary);">무엇을 심을까요?</strong>
        <button onclick="window.Farm.closePicker()" style="all: unset; cursor: pointer; color: var(--text-muted); font-size: 1rem; padding: 0.1rem 0.4rem;">✕</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem;">
        ${this.CROPS.map(c => `
          <button onclick="window.Farm.plant(${i}, '${c.id}')"
            style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.55rem 0.3rem; border-radius: 12px; border: 1.5px solid var(--glass-border); background: var(--bg-tertiary);">
            <div style="font-size: 1.5rem; line-height: 1.2;">${c.emoji}</div>
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-primary);">${c.name}</div>
            <div style="font-size: 0.62rem; color: var(--text-muted);">물 ${c.need} · ${c.coin}코인</div>
          </button>`).join('')}
      </div>`;
    el.classList.remove('hidden');
  },

  closePicker() {
    const el = document.getElementById('farm-picker');
    if (el) el.classList.add('hidden');
  },

  tap(i) {
    const p = this.plots();
    const slot = p[i];
    if (!slot) { this.openPicker(i); return; }

    const c = this.crop(slot.crop);
    if (!c) { p[i] = null; this._savePlots(p); this.render(); return; }

    // 다 자랐으면 수확
    if (slot.water >= c.need) { this.harvest(i); return; }

    // 아니면 물주기
    if (this.water() <= 0) {
      if (window.Sfx) window.Sfx.play('denied');
      if (window.App) window.App.showRecordToast('💧 물이 없어요 — 체크인·미션·하루정리로 물을 모아요');
      return;
    }
    this._setWater(this.water() - 1);
    slot.water += 1;
    this._savePlots(p);
    if (window.Sfx) window.Sfx.play('water');
    if (window.App && window.App.stickerPop) window.App.stickerPop('watering', 850);

    const nowRipe = slot.water >= c.need;
    this.render();

    if (nowRipe) {
      if (window.Sfx) window.Sfx.play('ripe');
      if (window.App) {
        window.App.showRecordToast(`${c.emoji} ${c.name}이(가) 다 자랐어요! 눌러서 수확하세요`);
        window.App.stickerPop('stareyes', 1600);
      }
      if (window.App && window.App.notify) {
        window.App.notify('🌱 우렁이 농장', `${c.emoji} ${c.name}이(가) 다 자랐어요! 수확하러 오세요`);
      }
    }
  },

  harvest(i) {
    const p = this.plots();
    const slot = p[i];
    if (!slot) return;
    const c = this.crop(slot.crop);
    if (!c || slot.water < c.need) return;

    p[i] = null;
    this._savePlots(p);
    this.addCoins(c.coin);

    const st = this.stats();
    st.harvested = (st.harvested || 0) + 1;
    st.byCrop = st.byCrop || {};
    st.byCrop[c.id] = (st.byCrop[c.id] || 0) + 1;
    this._S()._safeSet('cbt_farm_stats', st);

    if (window.Sfx) window.Sfx.play('harvest');
    if (window.App) {
      window.App.showRecordToast(`${c.emoji} ${c.name} 수확! 🌰 +${c.coin}코인`);
      window.App.stickerPop('harvesting', 1800);
    }

    this._checkQuests(st, c);
    this.render();
    if (window.Closet) window.Closet.render();
  },

  // 수확 퀘스트 → 옷장 아이템 지급
  _checkQuests(st, c) {
    if (!window.Closet) return;
    if (st.harvested >= 1) window.Closet.grant('sprout', '첫 수확 기념!');
    if (st.harvested >= 3) window.Closet.grant('can', '농부 우렁이 인정!');
    if (c.id === 'carrot') window.Closet.grant('carrot', '당근 수확 기념!');
  },

  // 앱을 열었을 때 수확할 게 있으면 알려준다
  checkOnOpen() {
    const ripe = this.plots().filter(s => {
      if (!s) return false;
      const c = this.crop(s.crop);
      return c && s.water >= c.need;
    }).length;
    if (ripe > 0 && window.App && window.App.showRecordToast) {
      setTimeout(() => window.App.showRecordToast(`🧺 밭에 수확할 작물이 ${ripe}개 있어요`), 1800);
    }
  },

  // --------------------------------------------------------------------------
  //  렌더
  // --------------------------------------------------------------------------
  _stageEmoji(slot, c) {
    const r = slot.water / c.need;
    if (r >= 1) return c.emoji;
    if (r >= 0.6) return '🌿';
    if (r >= 0.25) return '🌱';
    return '🌰';
  },

  render() {
    const el = document.getElementById('farm-body');
    if (!el) return;
    const p = this.plots();
    const w = this.water();
    const st = this.stats();

    const cells = p.map((slot, i) => {
      if (!slot) {
        return `
          <button onclick="window.Farm.tap(${i})" title="빈 밭 — 눌러서 심기"
            style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.75rem 0.2rem; border-radius: 14px; border: 1.5px dashed var(--glass-border); background: var(--bg-tertiary);">
            <div style="font-size: 1.35rem; line-height: 1.3; opacity: 0.45;">＋</div>
            <div style="font-size: 0.64rem; font-weight: 700; color: var(--text-muted);">심기</div>
          </button>`;
      }
      const c = this.crop(slot.crop);
      const ripe = slot.water >= c.need;
      const pct = Math.min(100, Math.round(slot.water / c.need * 100));
      return `
        <button onclick="window.Farm.tap(${i})" title="${c.name} · ${slot.water}/${c.need}"
          style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.6rem 0.2rem 0.5rem; border-radius: 14px;
                 border: 1.5px solid ${ripe ? 'var(--accent-primary)' : 'var(--glass-border)'};
                 background: ${ripe ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'var(--bg-tertiary)'};">
          <div style="font-size: 1.5rem; line-height: 1.25;">${this._stageEmoji(slot, c)}</div>
          <div style="height: 4px; margin: 0.3rem 0.4rem 0.25rem; border-radius: 999px; background: var(--bg-secondary); overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: var(--accent-primary);"></div>
          </div>
          <div style="font-size: 0.62rem; font-weight: 800; color: ${ripe ? 'var(--accent-primary)' : 'var(--text-muted)'};">
            ${ripe ? '수확!' : `${slot.water}/${c.need}`}
          </div>
        </button>`;
    }).join('');

    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.7rem;">
        <span style="font-size: 0.8rem; font-weight: 800; color: #6f97ab;">💧 물 ${w}</span>
        <span style="font-size: 0.8rem; font-weight: 800; color: var(--accent-primary);">🌰 ${this.coins().toLocaleString()}코인</span>
        <span style="margin-left: auto; font-size: 0.7rem; color: var(--text-muted);">누적 ${st.harvested || 0}개</span>
        <button onclick="window.Farm.toggleShop()" style="all: unset; cursor: pointer; font-size: 0.7rem; font-weight: 800; color: #c9a227; border: 1px solid color-mix(in srgb, #c9a227 40%, transparent); padding: 0.15rem 0.5rem; border-radius: 999px;">물 충전</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">${cells}</div>
      <div id="farm-shop" class="hidden" style="margin-top: 0.7rem; padding: 0.75rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);"></div>
      <div id="farm-picker" class="hidden" style="margin-top: 0.7rem; padding: 0.75rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);"></div>
      <p style="margin: 0.7rem 0 0; font-size: 0.68rem; color: var(--text-muted); line-height: 1.5;">
        체크인·미션·하루정리·사고기록·호흡을 하면 💧물이 고여요. 밭을 눌러 물을 주고, 다 자라면 눌러서 수확하세요.
        방치해도 시들지 않으니 안심하세요.
      </p>`;
  }
};
