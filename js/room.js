// ============================================================================
//  우렁이의 방 — 싸이월드 미니룸st 방 꾸미기
//  · 벽지 / 바닥 / 벽장식 / 왼쪽·오른쪽 가구 / 러그 슬롯을 각각 채운다
//  · 씨앗코인(농장 수확) 또는 우렁 캐시(현질)로 구매
//  · 방 한가운데에는 옷을 입은 우렁이가 서 있다
//
//  씬 좌표계: viewBox 0 0 320 210   (벽 y0~140 · 바닥 y140~210)
// ============================================================================
window.Room = {

  SLOTS: [
    { id: 'wallpaper', name: '벽지' },
    { id: 'floor',     name: '바닥' },
    { id: 'wall',      name: '벽장식' },
    { id: 'left',      name: '왼쪽 가구' },
    { id: 'right',     name: '오른쪽 가구' },
    { id: 'rug',       name: '러그' }
  ],

  ITEMS: [
    // ── 벽지 ──────────────────────────────────────────────────────────────
    { id: 'wp_cream', slot: 'wallpaper', name: '크림 벽지', free: true,
      svg: () => `<rect x="0" y="0" width="320" height="140" fill="#F3E9DA"/>` },
    { id: 'wp_mint', slot: 'wallpaper', name: '민트 줄무늬', price: 25,
      svg: () => `<rect x="0" y="0" width="320" height="140" fill="#DFEFE6"/>
        ${Array.from({length:11},(_,i)=>`<rect x="${i*30+6}" y="0" width="9" height="140" fill="#C8E3D5"/>`).join('')}` },
    { id: 'wp_night', slot: 'wallpaper', name: '밤하늘', price: 60,
      svg: () => `<rect x="0" y="0" width="320" height="140" fill="#26314A"/>
        <circle cx="262" cy="34" r="15" fill="#F3E2A9"/><circle cx="256" cy="30" r="13" fill="#26314A"/>
        ${[[30,30],[70,58],[118,26],[168,50],[210,22],[300,70],[52,96],[142,88],[236,96]]
          .map(([x,y],i)=>`<path d="M${x} ${y-4} l1.3 2.8 2.8 1.3 -2.8 1.3 -1.3 2.8 -1.3 -2.8 -2.8 -1.3 2.8 -1.3z" fill="#FBF3D5" opacity="${0.55+((i%3)*0.15)}"/>`).join('')}` },
    { id: 'wp_sakura', slot: 'wallpaper', name: '벚꽃 벽지', cash: 900,
      svg: () => `<rect x="0" y="0" width="320" height="140" fill="#FBEDF0"/>
        ${[[36,28],[92,66],[150,24],[204,72],[262,36],[298,100],[64,110],[176,108],[236,120]]
          .map(([x,y])=>`<g transform="translate(${x} ${y})">${
            Array.from({length:5},(_,k)=>`<ellipse cx="0" cy="-6" rx="3.4" ry="5.4" fill="#F3C3D0" transform="rotate(${k*72})"/>`).join('')
          }<circle cx="0" cy="0" r="1.9" fill="#E39BAE"/></g>`).join('')}` },

    // ── 바닥 ──────────────────────────────────────────────────────────────
    { id: 'fl_wood', slot: 'floor', name: '원목 마루', free: true,
      svg: () => `<rect x="0" y="140" width="320" height="70" fill="#C9A278"/>
        ${Array.from({length:6},(_,i)=>`<path d="M0 ${146+i*11} H320" stroke="#B08B63" stroke-width="1.6"/>`).join('')}` },
    { id: 'fl_tile', slot: 'floor', name: '체크 타일', price: 25,
      svg: () => `<rect x="0" y="140" width="320" height="70" fill="#EDE6DC"/>
        ${Array.from({length:14},(_,i)=>Array.from({length:4},(_,j)=>
          (i+j)%2 ? `<rect x="${i*24}" y="${140+j*18}" width="24" height="18" fill="#D6CCBE"/>` : '').join('')).join('')}` },
    { id: 'fl_grass', slot: 'floor', name: '잔디밭', price: 55,
      svg: () => `<rect x="0" y="140" width="320" height="70" fill="#8FBE85"/>
        ${Array.from({length:26},(_,i)=>`<path d="M${i*13+5} ${206-((i*7)%12)} v${6+((i*5)%7)}" stroke="#6EA166" stroke-width="2.4" stroke-linecap="round"/>`).join('')}` },

    // ── 벽장식 ────────────────────────────────────────────────────────────
    { id: 'wl_window', slot: 'wall', name: '작은 창문', price: 40,
      svg: () => `<g>
        <rect x="196" y="26" width="82" height="62" rx="5" fill="#BFE0EE" stroke="#8A7457" stroke-width="4"/>
        <path d="M237 26 V88 M196 57 H278" stroke="#8A7457" stroke-width="4"/>
        <circle cx="216" cy="44" r="7" fill="#F5EDCB"/>
      </g>` },
    { id: 'wl_frame', slot: 'wall', name: '우렁이 액자', price: 35,
      svg: () => `<g>
        <rect x="206" y="30" width="62" height="50" rx="4" fill="#FBF6EC" stroke="#A9855C" stroke-width="4"/>
        <circle cx="237" cy="58" r="15" fill="#FFF9F0" stroke="#8A6F55" stroke-width="3"/>
        <circle cx="231" cy="56" r="2" fill="#3F352A"/><circle cx="243" cy="56" r="2" fill="#3F352A"/>
        <path d="M232 64 q5 4 10 0" fill="none" stroke="#3F352A" stroke-width="2" stroke-linecap="round"/>
      </g>` },
    { id: 'wl_clock', slot: 'wall', name: '벽시계', price: 45,
      svg: () => `<g>
        <circle cx="237" cy="52" r="24" fill="#FBF6EC" stroke="#8A6F55" stroke-width="4"/>
        <path d="M237 52 V38 M237 52 l11 7" stroke="#5A4C3B" stroke-width="3.4" stroke-linecap="round"/>
        <circle cx="237" cy="52" r="3" fill="#5A4C3B"/>
      </g>` },
    { id: 'wl_neon', slot: 'wall', name: '네온 사인', cash: 1100,
      svg: () => `<g>
        <path d="M198 40 q18 -16 36 0 q18 16 36 0" fill="none" stroke="#E58AB8" stroke-width="6" stroke-linecap="round" opacity="0.95"/>
        <path d="M198 40 q18 -16 36 0 q18 16 36 0" fill="none" stroke="#FFD8EC" stroke-width="2" stroke-linecap="round"/>
        <text x="237" y="76" font-size="17" font-weight="800" fill="#8FD6E8" text-anchor="middle" font-family="sans-serif">쉬어가</text>
      </g>` },

    // ── 왼쪽 가구 ─────────────────────────────────────────────────────────
    { id: 'lf_plant', slot: 'left', name: '몬스테라 화분', price: 30,
      svg: () => `<g>
        <path d="M28 200 h40 l-6 -32 H34z" fill="#C9835A" stroke="#8E5A38" stroke-width="3" stroke-linejoin="round"/>
        <path d="M48 168 V128" stroke="#5E8F5F" stroke-width="4" stroke-linecap="round"/>
        <path d="M48 140 q-26 -6 -30 -26 q26 -6 30 22z" fill="#79B37A" stroke="#4F7E52" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M48 132 q24 -10 28 -30 q-26 -4 -28 26z" fill="#93C894" stroke="#4F7E52" stroke-width="2.6" stroke-linejoin="round"/>
      </g>` },
    { id: 'lf_shelf', slot: 'left', name: '책장', price: 65,
      svg: () => `<g>
        <rect x="16" y="112" width="62" height="88" rx="3" fill="#B98A5E" stroke="#8A6039" stroke-width="3.4"/>
        <path d="M16 142 H78 M16 172 H78" stroke="#8A6039" stroke-width="3.4"/>
        ${[[22,118,22],[31,120,20],[40,117,23],[24,148,21],[33,150,19],[42,147,22],[26,178,19],[35,180,17]]
          .map(([x,y,h],i)=>`<rect x="${x}" y="${y}" width="7" height="${h}" fill="${['#C96A62','#6F97AB','#E0B45E','#7FA98A','#B98ABF','#D98A6A','#6F97AB','#C96A62'][i]}" stroke="#5E4530" stroke-width="1.6"/>`).join('')}
      </g>` },
    { id: 'lf_lamp', slot: 'left', name: '플로어 스탠드', price: 50,
      svg: () => `<g>
        <path d="M30 200 h34 l-17 -8z" fill="#7C6B58" stroke="#5A4C3B" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M47 192 V128" stroke="#7C6B58" stroke-width="4"/>
        <path d="M28 128 h38 l-7 -26 h-24z" fill="#F1D89B" stroke="#B99A55" stroke-width="3" stroke-linejoin="round"/>
        <ellipse cx="47" cy="140" rx="26" ry="9" fill="#F7E7B5" opacity="0.4"/>
      </g>` },

    // ── 오른쪽 가구 ───────────────────────────────────────────────────────
    { id: 'rt_table', slot: 'right', name: '티테이블', price: 45,
      svg: () => `<g>
        <rect x="244" y="150" width="62" height="7" rx="3" fill="#C09A6E" stroke="#8A6039" stroke-width="2.6"/>
        <path d="M252 157 v43 M298 157 v43" stroke="#8A6039" stroke-width="4" stroke-linecap="round"/>
        <path d="M268 150 v-13 h14 v13z" fill="#EFE6D6" stroke="#A38F73" stroke-width="2.4"/>
        <path d="M282 141 q7 -1 7 4 q0 5 -7 4" fill="none" stroke="#A38F73" stroke-width="2.4"/>
        <path d="M272 133 q2 -6 -1 -9 M278 133 q2 -6 -1 -9" fill="none" stroke="#C6BBA8" stroke-width="2" stroke-linecap="round"/>
      </g>` },
    { id: 'rt_guitar', slot: 'right', name: '기타', price: 70,
      svg: () => `<g transform="rotate(-10 278 165)">
        <ellipse cx="278" cy="176" rx="24" ry="26" fill="#D9A45E" stroke="#96682F" stroke-width="3"/>
        <ellipse cx="278" cy="150" rx="17" ry="17" fill="#D9A45E" stroke="#96682F" stroke-width="3"/>
        <circle cx="278" cy="172" r="7" fill="#5E4530"/>
        <path d="M278 133 V104" stroke="#96682F" stroke-width="7" stroke-linecap="round"/>
        <path d="M278 104 v-8" stroke="#5E4530" stroke-width="10" stroke-linecap="round"/>
      </g>` },
    { id: 'rt_fish', slot: 'right', name: '어항', cash: 1300,
      svg: () => `<g>
        <path d="M246 200 h60 v-40 q0 -12 -30 -12 q-30 0 -30 12z" fill="#BFE3EE" stroke="#7BA7B8" stroke-width="3" stroke-linejoin="round"/>
        <path d="M246 174 q30 8 60 0 v26 h-60z" fill="#9FD3E4" opacity="0.7"/>
        <g><path d="M268 182 q8 -6 15 0 q-7 6 -15 0z" fill="#E8925F"/><path d="M283 182 l7 -5 v10z" fill="#E8925F"/></g>
        <circle cx="258" cy="190" r="3" fill="#7BA7B8" opacity="0.6"/><circle cx="296" cy="186" r="2.2" fill="#7BA7B8" opacity="0.6"/>
      </g>` },

    // ── 러그 ──────────────────────────────────────────────────────────────
    { id: 'rg_round', slot: 'rug', name: '동그란 러그', price: 30,
      svg: () => `<g>
        <ellipse cx="160" cy="188" rx="66" ry="17" fill="#D8907F" stroke="#B06D5D" stroke-width="3"/>
        <ellipse cx="160" cy="188" rx="42" ry="10" fill="none" stroke="#EFC0B2" stroke-width="3"/>
      </g>` },
    { id: 'rg_star', slot: 'rug', name: '별무늬 러그', price: 55,
      svg: () => `<g>
        <ellipse cx="160" cy="188" rx="70" ry="18" fill="#7E8FC0" stroke="#5B6A98" stroke-width="3"/>
        ${[[126,186],[160,181],[194,187],[143,193],[178,193]].map(([x,y])=>
          `<path d="M${x} ${y-5} l1.7 3.6 3.6 1.7 -3.6 1.7 -1.7 3.6 -1.7 -3.6 -3.6 -1.7 3.6 -1.7z" fill="#F2E7B8"/>`).join('')}
      </g>` }
  ],

  // --------------------------------------------------------------------------
  _S() { return window.Storage; },
  item(id) { return this.ITEMS.find(i => i.id === id) || null; },

  owned() {
    const o = this._S()._safeGet('cbt_room_owned', {}) || {};
    this.ITEMS.filter(i => i.free).forEach(i => { o[i.id] = o[i.id] || 1; });
    return o;
  },
  has(id) { return !!this.owned()[id]; },

  placed() {
    const p = this._S()._safeGet('cbt_room_placed', null);
    if (p && typeof p === 'object') return p;
    const init = { wallpaper: 'wp_cream', floor: 'fl_wood' };
    this._S()._safeSet('cbt_room_placed', init);
    return init;
  },

  buy(id) {
    const it = this.item(id);
    if (!it || this.has(id)) return;
    if (it.cash) {
      if (!window.Wallet || window.Wallet.balance() < it.cash) {
        alert(`우렁 캐시가 부족해요. (${it.cash.toLocaleString()}캐시 필요)\n마이페이지에서 충전할 수 있어요.`);
        return;
      }
      if (!confirm(`'${it.name}'을(를) ${it.cash.toLocaleString()}캐시에 살까요?`)) return;
      window.Wallet.spend(it.cash, `방꾸미기 · ${it.name}`);
    } else {
      const coins = window.Farm ? window.Farm.coins() : 0;
      if (coins < it.price) {
        alert(`씨앗코인이 부족해요. (${it.price}코인 필요 · 지금 ${coins}코인)\n밭에서 작물을 키워 수확해보세요.`);
        return;
      }
      if (!confirm(`'${it.name}'을(를) ${it.price}코인에 살까요?`)) return;
      window.Farm.spendCoins(it.price);
    }
    const o = this._S()._safeGet('cbt_room_owned', {}) || {};
    o[id] = Date.now();
    this._S()._safeSet('cbt_room_owned', o);
    this.place(id);
    if (window.App) {
      window.App.showRecordToast(`🏡 '${it.name}'을(를) 방에 놓았어요!`);
      window.App.stickerPop('stareyes', 1500);
    }
  },

  place(id) {
    const it = this.item(id);
    if (!it || !this.has(id)) return;
    const p = this.placed();
    // 벽지·바닥은 반드시 하나 있어야 하므로 토글로 비우지 않는다
    const fixed = (it.slot === 'wallpaper' || it.slot === 'floor');
    p[it.slot] = (!fixed && p[it.slot] === id) ? null : id;
    this._S()._safeSet('cbt_room_placed', p);
    this.render();
  },

  // --------------------------------------------------------------------------
  //  방 씬 그리기 (우렁이는 옷장 착용분이 그대로 반영된 스티커를 씀)
  // --------------------------------------------------------------------------
  scene(width = 320) {
    const p = this.placed();
    const draw = slot => { const it = this.item(p[slot]); return it ? it.svg() : ''; };
    const snail = window.Stickers ? window.Stickers.svg('joy', 96) : '';
    return `
      <div style="position: relative; width: 100%; max-width: ${width}px; margin: 0 auto; border-radius: 16px; overflow: hidden; border: 1.5px solid var(--glass-border); box-shadow: var(--shadow-sm);">
        <svg viewBox="0 0 320 210" width="100%" role="img" aria-label="우렁이의 방" style="display: block;">
          ${draw('wallpaper')}
          ${draw('floor')}
          ${draw('wall')}
          ${draw('rug')}
          ${draw('left')}
          ${draw('right')}
        </svg>
        <div style="position: absolute; left: 50%; bottom: 8%; transform: translateX(-50%); width: 30%; line-height: 0;">
          <div style="width: 100%;">${snail}</div>
        </div>
      </div>`;
  },

  render() {
    const el = document.getElementById('room-body');
    if (!el) return;
    const owned = this.owned();
    const p = this.placed();
    const coins = window.Farm ? window.Farm.coins() : 0;
    const cash = window.Wallet ? window.Wallet.balance() : 0;

    const cell = (it) => {
      const has = !!owned[it.id];
      const on = p[it.slot] === it.id;
      const tag = it.free ? '기본' : it.cash ? `${it.cash.toLocaleString()}캐시` : `${it.price}코인`;
      const tagColor = it.free ? 'var(--text-muted)' : it.cash ? '#c9a227' : 'var(--accent-primary)';
      return `
        <button onclick="window.Room.${has ? `place('${it.id}')` : `buy('${it.id}')`}" title="${it.name}"
          style="all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; padding: 0.4rem 0.25rem; border-radius: 12px; text-align: center;
                 border: 1.5px solid ${on ? 'var(--accent-primary)' : 'var(--glass-border)'};
                 background: ${on ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)'};">
          <span style="line-height: 0; ${has ? '' : 'opacity: 0.4; filter: grayscale(1);'}">
            <svg viewBox="0 0 320 210" width="62" height="41" aria-hidden="true">
              <rect x="0" y="0" width="320" height="210" fill="var(--bg-secondary)"/>${it.svg()}
            </svg>
          </span>
          <span style="font-size: 0.66rem; font-weight: 700; color: var(--text-primary);">${it.name}</span>
          <span style="font-size: 0.6rem; font-weight: 800; color: ${has ? (on ? 'var(--accent-primary)' : 'var(--text-muted)') : tagColor};">
            ${has ? (on ? '배치 중' : '보유') : tag}
          </span>
        </button>`;
    };

    el.innerHTML = `
      ${this.scene()}
      <div style="display: flex; align-items: center; gap: 0.6rem; margin: 0.8rem 0 0.5rem;">
        <span style="font-size: 0.76rem; font-weight: 800; color: var(--accent-primary);">🌰 ${coins.toLocaleString()}코인</span>
        <span style="font-size: 0.72rem; color: var(--text-muted);">💰 ${cash.toLocaleString()}캐시</span>
      </div>
      ${this.SLOTS.map(s => {
        const items = this.ITEMS.filter(i => i.slot === s.id);
        if (!items.length) return '';
        return `
          <p style="margin: 0.55rem 0 0.4rem; font-size: 0.72rem; font-weight: 800; color: var(--text-muted);">${s.name}</p>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 0.4rem;">
            ${items.map(cell).join('')}
          </div>`;
      }).join('')}
      <p style="margin: 0.8rem 0 0; font-size: 0.68rem; color: var(--text-muted); line-height: 1.5;">
        회색 아이템을 누르면 구매, 가진 아이템을 누르면 방에 놓거나 치울 수 있어요. 우렁이가 입은 옷도 방에 그대로 나와요.
      </p>`;
  }
};
