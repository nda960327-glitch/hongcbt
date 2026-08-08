// ============================================================================
//  우렁이 옷장 — 우렁이에게 옷을 입힌다
//  · 아이템은 밭에서 거둔 씨앗코인(농장 화폐) 또는 우렁 캐시(현질)로 산다
//  · 일부는 퀘스트(미션·레벨·뱃지) 보상으로만 얻는다
//  · 착용한 아이템은 stickers.js 의 _base() 에서 몸 위에 겹쳐 그려진다
//
//  좌표계: viewBox 0 0 140 140. 몸통 x 27~119 / y 42~125,
//          눈 y≈86 (좌 52 · 우 88), 입 y≈98, 볼 y≈96, 발 y≈124.
//          => 머리 위 y 26~50 / 눈 위 y 76~94 / 배 아래 y 104~120
// ============================================================================
window.Closet = {

  SLOTS: [
    { id: 'hat',  name: '모자' },
    { id: 'face', name: '안경' },
    { id: 'neck', name: '목도리' },
    { id: 'hand', name: '소품' }
  ],

  // --------------------------------------------------------------------------
  //  아이템 목록
  //   price  : 씨앗코인 가격 (밭에서 수확해 모은다)
  //   cash   : 우렁 캐시 가격 (현질 — 이게 있으면 프리미엄)
  //   quest  : 퀘스트 전용 (돈으로 못 삼). 획득 조건 설명
  // --------------------------------------------------------------------------
  ITEMS: [
    // ── 모자 ──────────────────────────────────────────────────────────────
    {
      id: 'straw', slot: 'hat', name: '밀짚모자', desc: '농부 우렁이의 기본 장비', price: 65,
      svg: () => `
        <g>
          <path d="M32 50 q38 12 76 0 q-6 -9 -18 -11 q-2 -12 -20 -12 q-18 0 -20 12 q-12 2 -18 11z"
                fill="#E8C77A" stroke="#A9803C" stroke-width="3" stroke-linejoin="round"/>
          <path d="M46 41 q24 7 48 0" fill="none" stroke="#A9803C" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M50 47 q20 5 40 0" fill="none" stroke="#C79F55" stroke-width="2" stroke-linecap="round"/>
        </g>`
    },
    {
      id: 'sprout', slot: 'hat', name: '새싹 머리', desc: '머리에서 싹이 났다', quest: '밭에서 처음 수확하면',
      svg: () => `
        <g>
          <path d="M70 46 V30" fill="none" stroke="#6FA87E" stroke-width="3.4" stroke-linecap="round"/>
          <path d="M70 34 q-13 -3 -15 -13 q13 -2 15 10z" fill="#8FC79B" stroke="#5C8F6B" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M70 30 q12 -5 15 -14 q-13 -3 -15 11z" fill="#A9DCB2" stroke="#5C8F6B" stroke-width="2.4" stroke-linejoin="round"/>
        </g>`
    },
    {
      id: 'beanie', slot: 'hat', name: '털모자', desc: '겨울 우렁이', price: 120,
      svg: () => `
        <g>
          <path d="M36 51 q34 10 68 0 q2 -25 -34 -25 q-36 0 -34 25z" fill="#C57C7C" stroke="#8E5050" stroke-width="3" stroke-linejoin="round"/>
          <path d="M34 50 q36 11 72 0 q1 7 -3 9 q-33 9 -66 0 q-4 -2 -3 -9z" fill="#E4A0A0" stroke="#8E5050" stroke-width="2.8" stroke-linejoin="round"/>
          <circle cx="70" cy="22" r="7" fill="#F4D9D9" stroke="#8E5050" stroke-width="2.6"/>
        </g>`
    },
    {
      id: 'crown', slot: 'hat', name: '황금 왕관', desc: '마음의 왕', cash: 1200,
      svg: () => `
        <g>
          <path d="M40 50 L36 26 l13 10 L70 20 l21 16 13 -10 -4 24 z"
                fill="#F2C64B" stroke="#B98A22" stroke-width="3" stroke-linejoin="round"/>
          <path d="M40 50 q30 7 60 0" fill="none" stroke="#B98A22" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="70" cy="38" r="4" fill="#E4676B" stroke="#B98A22" stroke-width="2"/>
        </g>`
    },
    // ── 안경 ──────────────────────────────────────────────────────────────
    {
      id: 'glasses', slot: 'face', name: '동그란 안경', desc: '지적인 척', price: 90,
      svg: () => `
        <g fill="none" stroke="#4A4038" stroke-width="3">
          <circle cx="52" cy="86" r="12" fill="#EAF2F6" fill-opacity="0.55"/>
          <circle cx="88" cy="86" r="12" fill="#EAF2F6" fill-opacity="0.55"/>
          <path d="M64 85 q6 -3 12 0" stroke-linecap="round"/>
          <path d="M40 84 q-8 -2 -11 2M100 84 q8 -2 11 2" stroke-linecap="round"/>
        </g>`
    },
    {
      id: 'shades', slot: 'face', name: '선글라스', desc: '오늘은 좀 멋있고 싶다', price: 155,
      svg: () => `
        <g>
          <path d="M37 78 h30 q3 0 3 4 v4 q0 9 -9 9 h-13 q-9 0 -10 -9 l-2 -5 q-1 -3 1 -3z" fill="#3B3630" stroke="#22201C" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M103 78 h-30 q-3 0 -3 4 v4 q0 9 9 9 h13 q9 0 10 -9 l2 -5 q1 -3 -1 -3z" fill="#3B3630" stroke="#22201C" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M42 82 q6 -1 9 2" fill="none" stroke="#8E877C" stroke-width="2.4" stroke-linecap="round"/>
        </g>`
    },
    // ── 목도리 ────────────────────────────────────────────────────────────
    {
      id: 'scarf', slot: 'neck', name: '빨간 목도리', desc: '목은 없지만 두른다', price: 100,
      svg: () => `
        <g>
          <path d="M40 108 q30 11 60 0 q2 8 -2 11 q-28 10 -56 0 q-4 -3 -2 -11z"
                fill="#D46A63" stroke="#9C4640" stroke-width="2.8" stroke-linejoin="round"/>
          <path d="M92 116 q9 6 8 15 q-8 2 -11 -5z" fill="#E08A83" stroke="#9C4640" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M52 113 v9M66 116 v9M80 116 v9" fill="none" stroke="#9C4640" stroke-width="1.8" opacity="0.5"/>
        </g>`
    },
    {
      id: 'bowtie', slot: 'neck', name: '나비넥타이', desc: '중요한 날', price: 75,
      svg: () => `
        <g>
          <path d="M70 112 l-15 -7 v14 z" fill="#7B93C9" stroke="#4E639A" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M70 112 l15 -7 v14 z" fill="#7B93C9" stroke="#4E639A" stroke-width="2.6" stroke-linejoin="round"/>
          <circle cx="70" cy="112" r="4" fill="#9DB2DC" stroke="#4E639A" stroke-width="2.4"/>
        </g>`
    },
    // ── 소품 ──────────────────────────────────────────────────────────────
    {
      id: 'can', slot: 'hand', name: '물뿌리개', desc: '밭일 필수품', quest: '작물 3개 수확하면',
      svg: () => `
        <g>
          <path d="M112 96 h15 q3 0 3 3 v11 q0 3 -3 3 h-15 q-3 0 -3 -3 v-11 q0 -3 3 -3z"
                fill="#8FB6C4" stroke="#5A7F8E" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M130 100 l6 -5 q2 -1 2 1 l-1 9" fill="none" stroke="#5A7F8E" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M115 96 q4 -7 10 -1" fill="none" stroke="#5A7F8E" stroke-width="2.4" stroke-linecap="round"/>
        </g>`
    },
    {
      id: 'carrot', slot: 'hand', name: '당근 한 개', desc: '오늘의 수확', quest: '당근을 수확하면',
      svg: () => `
        <g transform="rotate(18 122 104)">
          <path d="M122 96 q7 2 6 9 q-1 10 -6 15 q-5 -5 -6 -15 q-1 -7 6 -9z" fill="#E58A47" stroke="#B05F26" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M120 96 q-4 -8 -8 -9M122 95 q0 -9 2 -11M124 96 q4 -7 8 -8" fill="none" stroke="#6FA87E" stroke-width="2.8" stroke-linecap="round"/>
        </g>`
    },
    {
      id: 'halo', slot: 'hat', name: '천사 고리', desc: '착한 우렁이 한정', cash: 1500,
      svg: () => `
        <g>
          <ellipse cx="70" cy="28" rx="20" ry="7" fill="none" stroke="#F2D06B" stroke-width="5"/>
          <ellipse cx="70" cy="28" rx="20" ry="7" fill="none" stroke="#FFF0B8" stroke-width="2"/>
          <path d="M56 22 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="#FFF6D6"/>
        </g>`
    },
    {
      id: 'stars', slot: 'face', name: '반짝 눈', desc: '세상이 아름다워 보인다', cash: 1000,
      svg: () => `
        <g>
          <path d="M52 78 l3.2 6.6 6.8 3.4 -6.8 3.4 -3.2 6.6 -3.2 -6.6 -6.8 -3.4 6.8 -3.4z" fill="#F5C74E" stroke="#C9962A" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M88 78 l3.2 6.6 6.8 3.4 -6.8 3.4 -3.2 6.6 -3.2 -6.6 -6.8 -3.4 6.8 -3.4z" fill="#F5C74E" stroke="#C9962A" stroke-width="1.8" stroke-linejoin="round"/>
        </g>`
    },
    {
      id: 'cape', slot: 'neck', name: '영웅 망토', desc: '내 마음의 히어로', cash: 1800,
      svg: () => `
        <g>
          <path d="M34 104 q36 12 72 0 q6 16 2 24 q-38 12 -76 0 q-4 -8 2 -24z"
                fill="#B05A63" stroke="#7C3A42" stroke-width="2.8" stroke-linejoin="round" opacity="0.95"/>
          <path d="M40 106 q30 10 60 0" fill="none" stroke="#D98C93" stroke-width="2.4" stroke-linecap="round"/>
        </g>`
    },
    {
      id: 'ribbon', slot: 'hand', name: '반짝 리본', desc: '한정판 반짝이', cash: 800,
      svg: () => `
        <g>
          <path d="M24 92 l-13 -6 v13 z" fill="#E9A7C6" stroke="#B76E93" stroke-width="2.4" stroke-linejoin="round"/>
          <path d="M24 92 l13 -6 v13 z" fill="#E9A7C6" stroke="#B76E93" stroke-width="2.4" stroke-linejoin="round"/>
          <circle cx="24" cy="92" r="3.6" fill="#F7CFE0" stroke="#B76E93" stroke-width="2.2"/>
          <path d="M14 74 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#F5C74E"/>
        </g>`
    }
  ],

  // --------------------------------------------------------------------------
  //  보유 / 착용 상태
  // --------------------------------------------------------------------------
  _S() { return window.Storage; },

  owned() { return this._S()._safeGet('cbt_closet_owned', {}) || {}; },
  has(id) { return !!this.owned()[id]; },

  equipped() { return this._S()._safeGet('cbt_closet_equipped', {}) || {}; },

  item(id) { return this.ITEMS.find(i => i.id === id) || null; },

  _grant(id) {
    const o = this.owned();
    if (o[id]) return false;
    o[id] = Date.now();
    this._S()._safeSet('cbt_closet_owned', o);
    return true;
  },

  // 퀘스트 보상 지급 (이미 있으면 조용히 무시)
  grant(id, reason) {
    const it = this.item(id);
    if (!it || !this._grant(id)) return false;
    if (window.App) {
      window.App.showRecordToast(`🎁 옷장에 '${it.name}' 도착! ${reason || ''}`.trim());
      window.App.stickerPop('gift', 1600);
    }
    if (window.App && window.App.notify) window.App.notify('우렁이 옷장', `'${it.name}'을(를) 얻었어요!`);
    this.render();
    return true;
  },

  buy(id) {
    const it = this.item(id);
    if (!it || this.has(id)) return;
    const lv = (window.Growth && window.Growth.level) ? window.Growth.level() : 1;
    if (it.lv && lv < it.lv) {
      if (window.Sfx) window.Sfx.hit('denied');
      alert(`'${it.name}'은(는) Lv.${it.lv} 부터 살 수 있어요.\n(지금 Lv.${lv})`);
      return;
    }
    if (it.quest) { alert(`'${it.name}'은(는) 살 수 없어요.\n${it.quest} 받을 수 있어요.`); return; }

    if (it.cash) {
      if (!window.Wallet || window.Wallet.balance() < it.cash) {
        alert(`우렁 캐시가 부족해요. (${it.cash.toLocaleString()}캐시 필요)\n마이페이지에서 충전할 수 있어요.`);
        return;
      }
      if (!confirm(`'${it.name}'을(를) ${it.cash.toLocaleString()}캐시에 살까요?`)) return;
      window.Wallet.spend(it.cash, `옷장 · ${it.name}`);
    } else {
      const coins = window.Farm ? window.Farm.coins() : 0;
      if (coins < it.price) {
        alert(`씨앗코인이 부족해요. (${it.price}코인 필요 · 지금 ${coins}코인)\n밭에서 작물을 키워 수확해보세요.`);
        return;
      }
      if (!confirm(`'${it.name}'을(를) ${it.price}코인에 살까요?`)) return;
      window.Farm.spendCoins(it.price);
    }

    if (window.Sfx) window.Sfx.hit('buy');
    this._grant(id);
    this.equip(id);
    if (window.App) {
      const thanks = [
        `우와아 '${it.name}'…?! 나 주는 거야?! 고마워!! 💚`,
        `헉 '${it.name}' 진짜 갖고 싶었는데!! 평생 잘 입을게!`,
        `'${it.name}' 받았다!! 나 오늘 제일 행복한 달팽이야`,
        `고마워… '${it.name}' 소중하게 아껴 입을게 🥹`
      ];
      window.App.showRecordToast(thanks[Math.floor(Math.random() * thanks.length)]);
      window.App.stickerPop(['love', 'stareyes', 'dance', 'bow'][Math.floor(Math.random() * 4)], 1700);
    }
  },

  equip(id) {
    const it = this.item(id);
    if (!it || !this.has(id)) return;
    const e = this.equipped();
    e[it.slot] = (e[it.slot] === id) ? null : id;   // 같은 걸 다시 누르면 벗기
    this._S()._safeSet('cbt_closet_equipped', e);
    if (window.Sfx) window.Sfx.hit('equip');
    this.render();
    if (window.App && window.App.refreshAllStickers) window.App.refreshAllStickers();
  },

  unequipAll() {
    this._S()._safeSet('cbt_closet_equipped', {});
    this.render();
    if (window.App && window.App.refreshAllStickers) window.App.refreshAllStickers();
  },

  // --------------------------------------------------------------------------
  //  stickers.js 가 호출 — 착용 중인 아이템 SVG 조각을 순서대로 반환
  //  (목도리 → 안경 → 소품 → 모자 순으로 겹쳐야 자연스럽다)
  // --------------------------------------------------------------------------
  layer() {
    try {
      const e = this.equipped();
      return ['neck', 'face', 'hand', 'hat']
        .map(slot => {
          const it = this.item(e[slot]);
          return it ? it.svg() : '';
        })
        .join('');
    } catch (err) { return ''; }
  },

  // --------------------------------------------------------------------------
  //  탈의실 씬 — 거울 앞에서 입어보고 멋진 척하는 우렁이
  // --------------------------------------------------------------------------
  _shopOpen: false,

  toggleShop() {
    this._shopOpen = !this._shopOpen;
    if (window.Sfx) window.Sfx.play('nav');
    this.render();
  },

  POSES: [
    { s: 'proud',    cap: '흠… 오늘 좀 치는데?' },
    { s: 'stareyes', cap: '거울 속 저 멋쟁이 누구야' },
    { s: 'shy',      cap: '이거 나한테 너무 과한가…?' },
    { s: 'ok',       cap: '결정했어. 오늘은 이거다' },
    { s: 'think',    cap: '음… 모자를 바꿔볼까' },
    { s: 'dance',    cap: '새 옷 입고 한 바퀴~' }
  ],

  scene() {
    const pose = this.POSES[Math.floor(Math.random() * this.POSES.length)];
    const snail = window.Stickers ? window.Stickers.svgDressed(null, pose.s, 92) : '';
    return `
      <div style="position: relative; border-radius: 16px; overflow: hidden; border: 1.5px solid var(--glass-border); box-shadow: var(--shadow-sm); margin-bottom: 0.7rem;">
        <svg viewBox="0 0 320 200" width="100%" style="display: block;" role="img" aria-label="우렁이 탈의실">
          <rect width="320" height="200" fill="#EFE4D2"/>
          <rect y="152" width="320" height="48" fill="#C9A278"/>
          <path d="M0 152 H320" stroke="#B08B63" stroke-width="3"/>
          <!-- 옷걸이 행거 -->
          <path d="M28 44 h96" stroke="#8A6F55" stroke-width="5" stroke-linecap="round"/>
          <path d="M36 44 v108M116 44 v108" stroke="#8A6F55" stroke-width="5" stroke-linecap="round"/>
          <g stroke="#6E5844" stroke-width="2.6" fill="none">
            <path d="M56 44 v10M78 44 v10M100 44 v10"/>
          </g>
          <path d="M48 58 q8 -6 16 0 v26 q-8 5 -16 0z" fill="#D46A63" stroke="#9C4640" stroke-width="2.4"/>
          <path d="M70 58 q8 -6 16 0 v32 q-8 5 -16 0z" fill="#7B93C9" stroke="#4E639A" stroke-width="2.4"/>
          <path d="M92 58 q8 -6 16 0 v22 q-8 5 -16 0z" fill="#E8C77A" stroke="#A9803C" stroke-width="2.4"/>
          <!-- 스탠딩 거울 -->
          <g>
            <ellipse cx="245" cy="160" rx="34" ry="8" fill="#B08B63" stroke="#8A6039" stroke-width="2.6"/>
            <rect x="207" y="34" width="76" height="122" rx="34" fill="#BFE0EE" stroke="#8A6F55" stroke-width="6"/>
            <path d="M222 60 q10 -16 26 -14" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.75"/>
            <path d="M218 84 q4 -8 10 -10" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5"/>
            <!-- 거울에 비친 뿌연 실루엣 -->
            <ellipse cx="247" cy="118" rx="24" ry="20" fill="#9FCBDD" opacity="0.55"/>
            <circle cx="238" cy="116" r="1.8" fill="#7BA7B8"/><circle cx="252" cy="116" r="1.8" fill="#7BA7B8"/>
          </g>
          <path d="M150 20 l1.8 3.8 3.8 1.8 -3.8 1.8 -1.8 3.8 -1.8 -3.8 -3.8 -1.8 3.8 -1.8z" fill="#F5C74E" opacity="0.8"/>
        </svg>
        <div style="position: absolute; left: 43%; bottom: 5%; width: 29%; line-height: 0;">${snail}</div>
        <div style="position: absolute; left: 50%; top: 4%; transform: translateX(-50%); max-width: 90%; font-size: 0.66rem; font-weight: 700; color: #4a4038; background: rgba(255,252,245,0.88); border: 1px solid rgba(74,64,56,0.18); padding: 0.2rem 0.6rem; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pose.cap}</div>
      </div>`;
  },

  // --------------------------------------------------------------------------
  //  옷장 UI (대시보드 허브 안에서 렌더)
  // --------------------------------------------------------------------------
  render() {
    const el = document.getElementById('closet-body');
    if (!el) return;
    const owned = this.owned();
    const eq = this.equipped();
    const coins = window.Farm ? window.Farm.coins() : 0;
    const cash = window.Wallet ? window.Wallet.balance() : 0;

    const cell = (it) => {
      const has = !!owned[it.id];
      const on = eq[it.slot] === it.id;
      const tag = it.quest ? '퀘스트' : it.cash ? `${it.cash.toLocaleString()}캐시` : `${it.price}코인`;
      const tagColor = it.quest ? 'var(--accent-secondary)' : it.cash ? '#c9a227' : 'var(--accent-primary)';
      return `
        <button onclick="window.Closet.${has ? `equip('${it.id}')` : `buy('${it.id}')`}"
          title="${it.desc}"
          style="all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.5rem 0.3rem; border-radius: 14px; text-align: center;
                 border: 1.5px solid ${on ? 'var(--accent-primary)' : 'var(--glass-border)'};
                 background: ${on ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)'};">
          <span style="line-height: 0; ${has ? '' : 'opacity: 0.35; filter: grayscale(1);'}">
            <svg width="46" height="46" viewBox="0 0 140 140" aria-hidden="true">${it.svg()}</svg>
          </span>
          <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-primary);">${it.name}</span>
          <span style="font-size: 0.62rem; font-weight: 800; color: ${has ? (on ? 'var(--accent-primary)' : 'var(--text-muted)') : tagColor};">
            ${has ? (on ? '착용 중' : '보유') : tag}
          </span>
        </button>`;
    };

    el.innerHTML = `
      <button onclick="window.Game && window.Game.show('room')" style="all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; font-weight: 800; color: var(--text-muted); margin-bottom: 0.55rem;">‹ 방으로 돌아가기</button>
      ${this.scene()}
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem;">
        <span style="font-size: 0.76rem; font-weight: 800; color: var(--accent-primary);">🌰 ${coins.toLocaleString()}코인</span>
        <span style="font-size: 0.72rem; color: var(--text-muted);">💰 ${cash.toLocaleString()}캐시</span>
        <button onclick="window.Closet.unequipAll()" style="all: unset; margin-left: auto; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); cursor: pointer; border-bottom: 1px solid var(--glass-border);">전부 벗기</button>
        <button onclick="window.Closet.toggleShop()" style="all: unset; box-sizing: border-box; cursor: pointer; font-size: 0.76rem; font-weight: 800; color: ${this._shopOpen ? 'var(--text-muted)' : '#fff'}; background: ${this._shopOpen ? 'var(--bg-tertiary)' : 'var(--accent-primary)'}; border: 1px solid ${this._shopOpen ? 'var(--glass-border)' : 'transparent'}; padding: 0.35rem 0.8rem; border-radius: 999px;">
          ${this._shopOpen ? '닫기 ▲' : '🛍 쇼핑하기 ▼'}
        </button>
      </div>
      <div style="${this._shopOpen ? '' : 'display: none;'} margin-top: 0.5rem;">
        ${this.SLOTS.map(s => {
          const items = this.ITEMS.filter(i => i.slot === s.id);
          if (!items.length) return '';
          return `
            <p style="margin: 0.55rem 0 0.4rem; font-size: 0.72rem; font-weight: 800; color: var(--text-muted);">${s.name}</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 0.45rem;">
              ${items.map(cell).join('')}
            </div>`;
        }).join('')}
        <p style="margin: 0.8rem 0 0; font-size: 0.68rem; color: var(--text-muted); line-height: 1.5;">
          코인은 밭에서 작물을 수확하면 모여요. 회색 아이템을 누르면 구매, 가진 아이템을 누르면 입고 벗을 수 있어요.
        </p>
      </div>`;
  }
};
