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

  // seed: 씨앗 값(씨앗코인). 상추는 무료라 코인이 없어도 농사를 시작할 수 있다.
  CROPS: [
    { id: 'lettuce', emoji: '🥬', name: '상추',   need: 6,  coin: 8,  seed: 0  },
    { id: 'carrot',  emoji: '🥕', name: '당근',   need: 9,  coin: 14, seed: 4  },
    { id: 'corn',    emoji: '🌽', name: '옥수수', need: 12, coin: 20, seed: 6  },
    { id: 'tomato',  emoji: '🍅', name: '토마토', need: 14, coin: 24, seed: 8  },
    { id: 'berry',   emoji: '🍓', name: '딸기',   need: 16, coin: 34, seed: 12 },
    { id: 'pumpkin', emoji: '🎃', name: '호박',   need: 22, coin: 55, seed: 20 }
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
    if (window.Sfx) window.Sfx.hit('buy');
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
        <strong style="font-size: 0.84rem; color: var(--text-primary); display: inline-flex; align-items: center; gap: 0.3rem;">${window.Icons ? window.Icons.svg('water', { size: 16 }) : ''}물 충전소</strong>
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
    if (c.seed > 0) {
      if (this.coins() < c.seed) {
        if (window.Sfx) window.Sfx.play('denied');
        alert(`${c.emoji} ${c.name} 씨앗은 🌰${c.seed}코인이에요. (지금 ${this.coins()}코인)\n상추 씨앗은 공짜니 상추부터 키워보세요!`);
        return;
      }
      this.spendCoins(c.seed);
    }
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
            style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.55rem 0.3rem; border-radius: 12px; border: 1.5px solid ${c.seed === 0 ? 'color-mix(in srgb, var(--accent-primary) 40%, transparent)' : 'var(--glass-border)'}; background: var(--bg-tertiary);">
            <div style="font-size: 1.5rem; line-height: 1.2;">${c.emoji}</div>
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-primary);">${c.name}</div>
            <div style="font-size: 0.6rem; font-weight: 800; color: ${c.seed === 0 ? 'var(--accent-primary)' : '#c9a227'};">씨앗 ${c.seed === 0 ? '무료' : '🌰' + c.seed}</div>
            <div style="font-size: 0.6rem; color: var(--text-muted);">물 ${c.need} → 🌰${c.coin}</div>
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
      if (window.Sfx) window.Sfx.hit('ripe');
      if (window.App) {
        window.App.showRecordToast(`${c.emoji} ${c.name}이(가) 다 자랐어요! 눌러서 수확하세요`);
        window.App.stickerPop('stareyes', 1600);
      }
      if (window.App && window.App.notify) {
        window.App.notify('🌱 우렁이 농장', `${c.emoji} ${c.name}이(가) 다 자랐어요! 수확하러 오세요`);
      }
    }
  },

  // 심은 작물 뽑기 — 되돌릴 수 없고, 준 물도 돌아오지 않는다
  pull(i) {
    const p = this.plots();
    const slot = p[i];
    if (!slot) return;
    const c = this.crop(slot.crop);
    const name = c ? c.emoji + ' ' + c.name : '작물';
    if (!confirm(`${name}을(를) 뽑아버릴까요?\n지금까지 준 물 ${slot.water}방울은 돌아오지 않아요.`)) return;
    p[i] = null;
    this._savePlots(p);
    if (window.Sfx) window.Sfx.play('plant');
    if (window.App) window.App.showRecordToast(`${name}을(를) 뽑았어요. 밭이 비었습니다`);
    this.render();
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

    if (window.Sfx) window.Sfx.hit('harvest');
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
  //  야외 밭 풍경 — 오늘의 감정 날씨가 하늘에 그대로 반영된다
  // --------------------------------------------------------------------------
  weather() {
    const moods = this._S()._safeGet('cbt_mood_log', []) || [];
    const today = new Date().toLocaleDateString('sv-CA');
    const vals = moods.filter(x => new Date(x.ts).toLocaleDateString('sv-CA') === today)
      .map(x => x.v ?? x.value ?? 3).filter(v => v != null);
    if (!vals.length) return 'mild';
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg >= 3.5 ? 'sunny' : avg >= 2.5 ? 'cloudy' : 'rain';
  },

  scene() {
    const w = this.weather();
    const p = this.plots();
    const uid = 'fw' + Math.floor(Math.random() * 1e6);

    const SKY = { sunny: ['#AEDBEF', '#DDF0F7'], mild: ['#C4E0EA', '#E6F1EF'], cloudy: ['#B9C3C9', '#DDE3E5'], rain: ['#8FA0AE', '#B9C6CE'] }[w];
    const CAP = {
      sunny: '오늘 마음 날씨: 맑음 — 밭일하기 딱 좋은 날!',
      mild:  '아직 체크인 전 — 오늘 마음 날씨는 어떨까요?',
      cloudy: '오늘 마음 날씨: 흐림 — 그래도 씨앗은 자라요',
      rain:  '오늘 마음 날씨: 비 — 우렁이가 잎사귀 우산을 폈어요'
    }[w];

    // 하늘 소품
    let skyArt = '';
    if (w === 'sunny') skyArt = '<circle cx="272" cy="38" r="17" fill="#F5CE5E"/><g stroke="#F5CE5E" stroke-width="3" stroke-linecap="round"><path d="M272 12 v-1M292 18 l1 -1M298 38 h1M292 58 l1 1M252 18 l-1 -1M246 38 h-1"/></g>';
    else if (w === 'mild') skyArt = '<circle cx="278" cy="36" r="14" fill="#F5CE5E" opacity="0.85"/><ellipse cx="72" cy="40" rx="30" ry="12" fill="#FFFFFF" opacity="0.8"/>';
    else if (w === 'cloudy') skyArt = '<ellipse cx="80" cy="38" rx="36" ry="14" fill="#EDF1F2"/><ellipse cx="118" cy="46" rx="26" ry="11" fill="#E2E8EA"/><ellipse cx="240" cy="32" rx="32" ry="12" fill="#EDF1F2"/>';
    else skyArt = '<ellipse cx="90" cy="34" rx="38" ry="14" fill="#AEB9C0"/><ellipse cx="235" cy="30" rx="34" ry="13" fill="#AEB9C0"/>'
      + '<g class="' + uid + '-r1"><path d="M60 56 l-4 11M120 52 l-4 11M200 54 l-4 11M280 50 l-4 11" stroke="#D7E4EC" stroke-width="2.6" stroke-linecap="round"/></g>'
      + '<g class="' + uid + '-r2"><path d="M90 60 l-4 11M160 56 l-4 11M240 58 l-4 11M305 60 l-4 11" stroke="#D7E4EC" stroke-width="2.6" stroke-linecap="round"/></g>';

    // 밭이랑 6개 (실제 밭 상태를 그대로 보여준다)
    const mounds = p.map((slot, i) => {
      const x = 34 + (i % 3) * 96, y = i < 3 ? 150 : 180;
      let art = '<ellipse cx="' + x + '" cy="' + (y + 8) + '" rx="26" ry="8" fill="#9C7550"/>';
      if (slot) {
        const c = this.crop(slot.crop);
        const stage = this._stageEmoji(slot, c);
        const ripe = slot.water >= c.need;
        art += '<text x="' + x + '" y="' + (y + 4) + '" font-size="' + (ripe ? 20 : 15) + '" text-anchor="middle"' + (ripe ? ' class="' + uid + '-bounce"' : '') + '>' + stage + '</text>';
      }
      return art;
    }).join('');

    // 우렁이: 비는 비피하기, 익은 작물 있으면 수확 포즈, 물주는 중이면 물주기, 평소엔 기쁨
    const anyRipe = p.some(s => s && this.crop(s.crop) && s.water >= this.crop(s.crop).need);
    const anyGrowing = p.some(s => s && this.crop(s.crop) && s.water < this.crop(s.crop).need);
    const pose = w === 'rain' ? 'shelter' : anyRipe ? 'harvesting' : anyGrowing ? 'watering' : 'joy';
    const snail = window.Stickers ? window.Stickers.svgDressed(null, pose, 84) : '';

    return '<div style="position: relative; border-radius: 16px; overflow: hidden; border: 1.5px solid var(--glass-border); box-shadow: var(--shadow-sm); margin-bottom: 0.8rem;">'
      + '<svg viewBox="0 0 320 210" width="100%" style="display: block;" role="img" aria-label="우렁이 농장">'
      + '<style>.' + uid + '-r1{animation:' + uid + 'rain 0.9s linear infinite}.' + uid + '-r2{animation:' + uid + 'rain 0.9s linear 0.45s infinite}@keyframes ' + uid + 'rain{0%{transform:translateY(-8px);opacity:0}30%{opacity:1}100%{transform:translateY(20px);opacity:0}}.' + uid + '-bounce{animation:' + uid + 'bnc 0.9s ease-in-out infinite}@keyframes ' + uid + 'bnc{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}</style>'
      + '<defs><linearGradient id="' + uid + '-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + SKY[0] + '"/><stop offset="1" stop-color="' + SKY[1] + '"/></linearGradient></defs>'
      + '<rect width="320" height="132" fill="url(#' + uid + '-sky)"/>'
      + skyArt
      + '<path d="M0 118 q46 -16 92 -6 q54 12 108 -4 q60 -16 120 -2 V132 H0z" fill="#93B98A"/>'
      + '<path d="M0 124 q60 -12 120 -3 q100 12 200 -5 V132 H0z" fill="#A8C79A"/>'
      // 먼 나무 몇 그루
      + '<g opacity="0.55">'
        + '<path d="M36 118 v-9M36 109 l-7 9h14z" stroke="#6E9268" stroke-width="2.4" fill="#6E9268"/>'
        + '<path d="M282 116 v-11M282 105 l-8 11h16z" stroke="#6E9268" stroke-width="2.4" fill="#6E9268"/>'
        + '<path d="M212 119 v-7M212 112 l-6 7h12z" stroke="#7CA275" stroke-width="2.2" fill="#7CA275"/>'
      + '</g>'
      + '<rect y="128" width="320" height="82" fill="#B08B63"/>'
      // 흙 결 + 자잘한 돌
      + '<g opacity="0.22" stroke="#7A5B3C" stroke-width="1.1">'
        + '<path d="M0 146 H320M0 168 H320M0 190 H320"/>'
      + '</g>'
      + '<g opacity="0.3" fill="#8C6A47">'
        + '<circle cx="52" cy="160" r="2"/><circle cx="148" cy="196" r="1.6"/><circle cx="238" cy="172" r="2.2"/><circle cx="296" cy="144" r="1.5"/>'
      + '</g>'
      + '<path d="M0 132 H320" stroke="#9C7550" stroke-width="3"/>'
      + '<path d="M0 135 H320" stroke="#000" stroke-opacity="0.08" stroke-width="2"/>'
      + mounds
      + '</svg>'
      // 비 오는 날은 제자리에서 비를 긋고, 그 외에는 밭을 오간다
      + '<div style="position: absolute; right: 4%; bottom: 6%; width: 27%; line-height: 0;">'
        + (w === 'rain'
            ? '<div class="wr-stand">' + snail + '</div>'
            : '<div class="wr-wander" style="--wr-far: -' + (40 + Math.floor(Math.random() * 60)) + 'px; animation: wr-stroll ' + (18 + Math.random() * 10).toFixed(1) + 's ease-in-out infinite;"><div class="wr-stand">' + snail + '</div></div>')
      + '</div>'
      + '<div style="position: absolute; left: 50%; top: 4%; transform: translateX(-50%); max-width: 92%; font-size: 0.66rem; font-weight: 700; color: #3d4650; background: rgba(255,255,255,0.85); border: 1px solid rgba(61,70,80,0.15); padding: 0.2rem 0.6rem; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + CAP + '</div>'
      + '</div>';
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
          style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; padding: 0.6rem 0.2rem 0.5rem; border-radius: 14px; position: relative;
                 border: 1.5px solid ${ripe ? 'var(--accent-primary)' : 'var(--glass-border)'};
                 background: ${ripe ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'var(--bg-tertiary)'};">
          <span role="button" title="뽑기" onclick="event.stopPropagation(); window.Farm.pull(${i});"
            style="position: absolute; top: 2px; right: 5px; font-size: 0.72rem; color: var(--text-muted); opacity: 0.7; padding: 0.15rem; line-height: 1;">✕</span>
          <div style="font-size: 1.5rem; line-height: 1.25;">${this._stageEmoji(slot, c)}</div>
          <div style="height: 4px; margin: 0.3rem 0.4rem 0.25rem; border-radius: 999px; background: var(--bg-secondary); overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: var(--accent-primary);"></div>
          </div>
          <div style="font-size: 0.62rem; font-weight: 800; color: ${ripe ? 'var(--accent-primary)' : 'var(--text-muted)'};">
            ${ripe ? '수확!' : `${slot.water}/${c.need}`}
          </div>
        </button>`;
    }).join('');

    el.innerHTML = this.scene() + `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin: 0.15rem 0 0.6rem;">
        <span style="font-size: 0.72rem; color: var(--text-muted);">누적 수확 ${st.harvested || 0}개</span>
        <button onclick="window.Farm.toggleShop()" style="all: unset; cursor: pointer; margin-left: auto; font-size: 0.72rem; font-weight: 800; color: #c9a227; border: 1px solid color-mix(in srgb, #c9a227 40%, transparent); padding: 0.25rem 0.7rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.28rem;">${window.Icons ? window.Icons.svg('water', { size: 14 }) : ''}물 충전</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">${cells}</div>
      <div id="farm-shop" class="hidden" style="margin-top: 0.7rem; padding: 0.75rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);"></div>
      <div id="farm-picker" class="hidden" style="margin-top: 0.7rem; padding: 0.75rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border);"></div>
      <p style="margin: 0.7rem 0 0; font-size: 0.68rem; color: var(--text-muted); line-height: 1.5;">
        체크인·미션·하루정리·사고기록·호흡을 하면 물이 고여요. 밭을 눌러 물을 주고, 다 자라면 눌러서 수확하세요.
        방치해도 시들지 않으니 안심하세요.
      </p>` + (window.Game ? window.Game.careBar() : '');
  }
};
