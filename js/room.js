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
      svg: () => `<rect x="0" y="0" width="320" height="140" fill="#F3E9DA"/>
        <g opacity="0.5" stroke="#E7DAC6" stroke-width="1">${Array.from({length:16},(_,i)=>`<path d="M${i*21+8} 0 V140"/>`).join('')}</g>
        <g opacity="0.35" fill="#E2D3BB">${[[28,34],[92,58],[156,26],[220,62],[284,40],[60,102],[188,110],[252,92]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.2"/>`).join('')}</g>` },
    { id: 'wp_mint', slot: 'wallpaper', name: '민트 줄무늬', price: 55,
      svg: () => `<rect x="0" y="0" width="320" height="140" fill="#DFEFE6"/>
        ${Array.from({length:11},(_,i)=>`<rect x="${i*30+6}" y="0" width="9" height="140" fill="#C8E3D5"/>`).join('')}` },
    { id: 'wp_night', slot: 'wallpaper', name: '밤하늘', price: 130,
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
    { id: 'fl_tile', slot: 'floor', name: '체크 타일', price: 55,
      svg: () => `<rect x="0" y="140" width="320" height="70" fill="#EDE6DC"/>
        ${Array.from({length:14},(_,i)=>Array.from({length:4},(_,j)=>
          (i+j)%2 ? `<rect x="${i*24}" y="${140+j*18}" width="24" height="18" fill="#D6CCBE"/>` : '').join('')).join('')}` },
    { id: 'fl_grass', slot: 'floor', name: '잔디밭', price: 120,
      svg: () => `<rect x="0" y="140" width="320" height="70" fill="#8FBE85"/>
        ${Array.from({length:26},(_,i)=>`<path d="M${i*13+5} ${206-((i*7)%12)} v${6+((i*5)%7)}" stroke="#6EA166" stroke-width="2.4" stroke-linecap="round"/>`).join('')}` },

    // ── 벽장식 ────────────────────────────────────────────────────────────
    { id: 'wl_window', slot: 'wall', name: '작은 창문', price: 90,
      svg: () => `<g>
        <rect x="196" y="26" width="82" height="62" rx="5" fill="#BFE0EE" stroke="#8A7457" stroke-width="4"/>
        <path d="M237 26 V88 M196 57 H278" stroke="#8A7457" stroke-width="4"/>
        <circle cx="216" cy="44" r="7" fill="#F5EDCB"/>
      </g>` },
    { id: 'wl_frame', slot: 'wall', name: '우렁이 액자', price: 75,
      svg: () => `<g>
        <rect x="206" y="30" width="62" height="50" rx="4" fill="#FBF6EC" stroke="#A9855C" stroke-width="4"/>
        <circle cx="237" cy="58" r="15" fill="#FFF9F0" stroke="#8A6F55" stroke-width="3"/>
        <circle cx="231" cy="56" r="2" fill="#3F352A"/><circle cx="243" cy="56" r="2" fill="#3F352A"/>
        <path d="M232 64 q5 4 10 0" fill="none" stroke="#3F352A" stroke-width="2" stroke-linecap="round"/>
      </g>` },
    { id: 'wl_clock', slot: 'wall', name: '벽시계', price: 100,
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
    { id: 'lf_plant', slot: 'left', name: '몬스테라 화분', price: 65,
      svg: () => `<g>
        <path d="M28 200 h40 l-6 -32 H34z" fill="#C9835A" stroke="#8E5A38" stroke-width="3" stroke-linejoin="round"/>
        <path d="M48 168 V128" stroke="#5E8F5F" stroke-width="4" stroke-linecap="round"/>
        <path d="M48 140 q-26 -6 -30 -26 q26 -6 30 22z" fill="#79B37A" stroke="#4F7E52" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M48 132 q24 -10 28 -30 q-26 -4 -28 26z" fill="#93C894" stroke="#4F7E52" stroke-width="2.6" stroke-linejoin="round"/>
      </g>` },
    { id: 'lf_shelf', slot: 'left', name: '책장', price: 145,
      svg: () => `<g>
        <rect x="16" y="112" width="62" height="88" rx="3" fill="#B98A5E" stroke="#8A6039" stroke-width="3.4"/>
        <path d="M16 142 H78 M16 172 H78" stroke="#8A6039" stroke-width="3.4"/>
        ${[[22,118,22],[31,120,20],[40,117,23],[24,148,21],[33,150,19],[42,147,22],[26,178,19],[35,180,17]]
          .map(([x,y,h],i)=>`<rect x="${x}" y="${y}" width="7" height="${h}" fill="${['#C96A62','#6F97AB','#E0B45E','#7FA98A','#B98ABF','#D98A6A','#6F97AB','#C96A62'][i]}" stroke="#5E4530" stroke-width="1.6"/>`).join('')}
      </g>` },
    { id: 'lf_lamp', slot: 'left', name: '플로어 스탠드', price: 110,
      svg: () => `<g>
        <path d="M30 200 h34 l-17 -8z" fill="#7C6B58" stroke="#5A4C3B" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M47 192 V128" stroke="#7C6B58" stroke-width="4"/>
        <path d="M28 128 h38 l-7 -26 h-24z" fill="#F1D89B" stroke="#B99A55" stroke-width="3" stroke-linejoin="round"/>
        <ellipse cx="47" cy="140" rx="26" ry="9" fill="#F7E7B5" opacity="0.4"/>
      </g>` },

    // ── 오른쪽 가구 ───────────────────────────────────────────────────────
    { id: 'rt_table', slot: 'right', name: '티테이블', price: 100,
      svg: () => `<g>
        <rect x="244" y="150" width="62" height="7" rx="3" fill="#C09A6E" stroke="#8A6039" stroke-width="2.6"/>
        <path d="M252 157 v43 M298 157 v43" stroke="#8A6039" stroke-width="4" stroke-linecap="round"/>
        <path d="M268 150 v-13 h14 v13z" fill="#EFE6D6" stroke="#A38F73" stroke-width="2.4"/>
        <path d="M282 141 q7 -1 7 4 q0 5 -7 4" fill="none" stroke="#A38F73" stroke-width="2.4"/>
        <path d="M272 133 q2 -6 -1 -9 M278 133 q2 -6 -1 -9" fill="none" stroke="#C6BBA8" stroke-width="2" stroke-linecap="round"/>
      </g>` },
    { id: 'rt_guitar', slot: 'right', name: '기타', price: 155,
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
    { id: 'rg_round', slot: 'rug', name: '동그란 러그', price: 65,
      svg: () => `<g>
        <ellipse cx="160" cy="188" rx="66" ry="17" fill="#D8907F" stroke="#B06D5D" stroke-width="3"/>
        <ellipse cx="160" cy="188" rx="42" ry="10" fill="none" stroke="#EFC0B2" stroke-width="3"/>
      </g>` },
    { id: 'rg_star', slot: 'rug', name: '별무늬 러그', price: 120,
      svg: () => `<g>
        <ellipse cx="160" cy="188" rx="70" ry="18" fill="#7E8FC0" stroke="#5B6A98" stroke-width="3"/>
        ${[[126,186],[160,181],[194,187],[143,193],[178,193]].map(([x,y])=>
          `<path d="M${x} ${y-5} l1.7 3.6 3.6 1.7 -3.6 1.7 -1.7 3.6 -1.7 -3.6 -3.6 -1.7 3.6 -1.7z" fill="#F2E7B8"/>`).join('')}
      </g>` },

    // ── 후반부 전용 (Lv.15~30) — 오래 함께한 사람에게만 열리는 것들 ──
    { id: 'wp_spring', slot: 'wallpaper', name: '봄 벚꽃', price: 180, lv: 15,
      svg: () => '<rect x="0" y="0" width="320" height="150" fill="#FBE9EE"/>'
        + '<g fill="#F5C6D3">' + [30,80,130,180,230,280].map((x, k) => '<circle cx="' + x + '" cy="' + (28 + (k % 3) * 34) + '" r="7"/>').join('') + '</g>'
        + '<g fill="#EFB3C4" opacity="0.7">' + [55,105,155,205,255,305].map((x, k) => '<circle cx="' + x + '" cy="' + (48 + (k % 3) * 32) + '" r="5"/>').join('') + '</g>' },

    { id: 'wp_autumn', slot: 'wallpaper', name: '가을 단풍', price: 180, lv: 18,
      svg: () => '<rect x="0" y="0" width="320" height="150" fill="#F7EBD9"/>'
        + '<g fill="#D98A4A" opacity="0.75">' + [40,110,180,250].map((x, k) => '<path d="M' + x + ' ' + (30 + k * 26) + ' q10 -12 20 0 q-10 14 -20 0z"/>').join('') + '</g>'
        + '<g fill="#C25E3A" opacity="0.6">' + [75,145,215,285].map((x, k) => '<path d="M' + x + ' ' + (52 + k * 24) + ' q9 -11 18 0 q-9 13 -18 0z"/>').join('') + '</g>' },

    { id: 'wp_winter', slot: 'wallpaper', name: '겨울 눈밤', price: 220, lv: 22,
      svg: () => '<rect x="0" y="0" width="320" height="150" fill="#2E3A52"/>'
        + '<g fill="#FFFFFF" opacity="0.85">' + [25,70,115,160,205,250,295].map((x, k) => '<circle cx="' + x + '" cy="' + (22 + (k % 4) * 30) + '" r="' + (2 + (k % 3)) + '"/>').join('') + '</g>'
        + '<circle cx="262" cy="36" r="16" fill="#F2E6A8"/><circle cx="254" cy="32" r="14" fill="#2E3A52"/>' },

    { id: 'fl_wood2', slot: 'floor', name: '헤링본 마루', price: 200, lv: 20,
      svg: () => '<rect x="0" y="150" width="320" height="60" fill="#C99A6B"/>'
        + '<g stroke="#A87B50" stroke-width="1.6">' + Array.from({length: 11}, (_, k) => '<path d="M' + (k * 30) + ' 150 l16 60 M' + (k * 30 + 16) + ' 150 l-16 60"/>').join('') + '</g>' },

    { id: 'lf_piano', slot: 'left', name: '업라이트 피아노', price: 260, lv: 24,
      svg: () => '<rect x="14" y="96" width="58" height="62" rx="4" fill="#4A3B33"/>'
        + '<rect x="18" y="120" width="50" height="13" fill="#FFF9F0"/>'
        + '<g fill="#3A2E28">' + [22,30,38,46,54,62].map(x => '<rect x="' + x + '" y="120" width="3" height="8"/>').join('') + '</g>'
        + '<rect x="14" y="92" width="58" height="6" rx="3" fill="#5C4A40"/>' },

    { id: 'rt_fire', slot: 'right', name: '벽난로', price: 280, lv: 27,
      svg: () => '<rect x="244" y="92" width="62" height="66" rx="4" fill="#8A6F55"/>'
        + '<rect x="254" y="110" width="42" height="40" rx="3" fill="#2E241E"/>'
        + '<path d="M275 146 q-9 -12 0 -22 q4 8 9 4 q6 9 -1 18z" fill="#E8934B"/>'
        + '<path d="M275 146 q-5 -7 0 -13 q3 5 5 2 q3 6 -1 11z" fill="#F5CE5E"/>' },

    { id: 'rt_telescope', slot: 'right', name: '천체망원경', price: 320, lv: 30,
      svg: () => '<path d="M258 152 l16 -8 M282 152 l-8 -8 M274 144 v-6" stroke="#6B5A4A" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
        + '<g transform="rotate(-28 276 118)"><rect x="252" y="110" width="52" height="15" rx="7" fill="#5D5490"/>'
        + '<rect x="298" y="107" width="10" height="21" rx="3" fill="#8A7FC0"/></g>' }
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

  async buy(id) {
    const it = this.item(id);
    if (!it || this.has(id)) return;
    // 레벨 조건이 붙은 물건 — 돈이 있어도 아직은 못 산다
    if (it.lv && this.level() < it.lv) {
      if (window.Sfx) window.Sfx.hit('denied');
      window.UI.alert(`'${it.name}'은(는) Lv.${it.lv} 부터 살 수 있어요.\n(지금 Lv.${this.level()})`);
      return;
    }
    if (it.cash) {
      if (!window.Wallet || window.Wallet.balance() < it.cash) {
        window.UI.alert(`우렁 캐시가 부족해요. (${it.cash.toLocaleString()}캐시 필요)\n마이페이지에서 충전할 수 있어요.`);
        return;
      }
      if (!await window.UI.confirm(`'${it.name}'을(를) ${it.cash.toLocaleString()}캐시에 살까요?`)) return;
      window.Wallet.spend(it.cash, `방꾸미기 · ${it.name}`);
    } else {
      const coins = window.Farm ? window.Farm.coins() : 0;
      if (coins < it.price) {
        window.UI.alert(`씨앗코인이 부족해요. (${it.price}코인 필요 · 지금 ${coins}코인)\n밭에서 작물을 키워 수확해보세요.`);
        return;
      }
      if (!await window.UI.confirm(`'${it.name}'을(를) ${it.price}코인에 살까요?`)) return;
      window.Farm.spendCoins(it.price);
    }
    if (window.Sfx) window.Sfx.hit('buy');
    const o = this._S()._safeGet('cbt_room_owned', {}) || {};
    o[id] = Date.now();
    this._S()._safeSet('cbt_room_owned', o);
    this.place(id);
    if (window.App) {
      const thanks = [
`'${it.name}'…?! 내 방에?! 고마워, 집들이 하자!!`,
        `우와 '${it.name}' 생겼다!! 방이 점점 근사해져!`,
`'${it.name}'최고야… 이 은혜 상추로 갚을게`,
        `고마워!! '${it.name}' 놓으니까 우리 집 같아졌어`
      ];
      window.App.showRecordToast(thanks[Math.floor(Math.random() * thanks.length)]);
      window.App.stickerPop(['love', 'stareyes', 'dance', 'party'][Math.floor(Math.random() * 4)], 1700);
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
    if (window.Sfx) window.Sfx.hit('place');
    this.render();
  },

  // --------------------------------------------------------------------------
  //  방 안의 우렁이 — 들어갈 때마다 랜덤한 일상을 보내고 있다
  //  ("오 오늘은 얘 자고 있네?" 하는 재미. 밤에는 잘 확률이 높다)
  // --------------------------------------------------------------------------
  // active: true 면 방 안을 돌아다닌다 (정적인 포즈는 제자리)
  // 우렁이가 방에서 하는 행동. lv 는 이 행동이 열리는 레벨.
  //  처음부터 전부 나오면 레벨업이 아무 의미가 없어서, 하나씩 열리게 했다.
  IDLES: [
    { s: 'blank',    cap: '대자로 뻗어 멍때리는 중', lv: 1 },
    { s: 'sleepy',   cap: '쿨쿨… 자고 있다', night: 3, lv: 1 },
    { s: 'peek',     cap: '어? 온 거 봤다. 빼꼼', lv: 2 },
    { s: 'tea',      cap: '느긋하게 티타임 중', lv: 3 },
    { s: 'waiting',  cap: '문 쪽만 보고 있었다…', lv: 4 },
    { s: 'laugh',    cap: '혼자 뭐가 웃긴지 빵 터짐', lv: 5 },
    { s: 'write',    cap: '일기 쓰는 중… 뭐라고 쓸까', lv: 6 },
    { s: 'watering', cap: '화분들 물 주러 다니는 중', active: true, lv: 7 },
    { s: 'hungry',   cap: '간식 찾아 어슬렁거리는 중', active: true, lv: 8 },
    { s: 'dance',    cap: '신나서 춤추는 중', active: true, lv: 9 },
    { s: 'sing',     cap: '흥얼흥얼 콘서트 중', active: true, lv: 10 },
    { s: 'muscle',   cap: '운동 중 (아직 3분째)', active: true, lv: 11 },
    { s: 'tea',      cap: '햇님이 놀러 와서 수다 중!', skin: 'haru', lv: 12 },
    { s: 'sing',     cap: '달님이 자장가를 불러주고 있다…', skin: 'dalnim', lv: 13 },
    { s: 'think',    cap: '소나무 아저씨와 조용한 시간', skin: 'sonamu', lv: 14 },
    // ── 후반부 (Lv.15~30) — 여기까지 오면 우렁이가 제법 다양해진다 ──
    { s: 'stareyes', cap: '뭔가 발견하고 눈이 반짝', lv: 15 },
    { s: 'shy',      cap: '칭찬받은 게 부끄러운지 배배 꼬는 중', lv: 16 },
    { s: 'gift',     cap: '뭔가 포장하는 중… 누구 주려나', active: true, lv: 17 },
    { s: 'detective',cap: '돋보기 들고 뭘 찾는 중', active: true, lv: 18 },
    { s: 'cold',     cap: '이불 속에서 안 나오는 중', night: 2, lv: 19 },
    { s: 'aha',      cap: '아! 뭔가 깨달은 표정', lv: 20 },
    { s: 'bow',      cap: '거울 보고 인사 연습 중', lv: 21 },
    { s: 'judge',    cap: '팔짱 끼고 심드렁하게 앉아있다', lv: 22 },
    { s: 'run',      cap: '이유 없이 방을 뛰어다니는 중', active: true, lv: 23 },
    { s: 'melt',     cap: '더운지 흐물흐물 녹는 중', lv: 24 },
    { s: 'teacher',  cap: '허공에 대고 뭔가 설명하는 중', lv: 25 },
    { s: 'party',    cap: '혼자 파티 중 (이유는 모름)', active: true, lv: 26 },
    { s: 'ok',       cap: '엄지 척. 오늘은 만족스러운가 보다', lv: 27 },
    { s: 'hero',     cap: '망토 두르고 뭔가 결심한 표정', lv: 28 },
    { s: 'ghost',    cap: '방전됐다… 충전이 필요해', night: 2, lv: 29 },
    { s: 'love',     cap: '온 방에 하트가 둥둥 떠다닌다', lv: 30 }
  ],
  _idle: null,

  // 지금 레벨
  level() {
    try { return (window.Growth && window.Growth.level) ? window.Growth.level() : 1; }
    catch (e) { return 1; }
  },

  unlocked() {
    const lv = this.level();
    return this.IDLES.filter(i => (i.lv || 1) <= lv);
  },

  // 다음에 열릴 행동 (전부 열었으면 null)
  nextIdle() {
    const lv = this.level();
    const rest = this.IDLES.filter(i => (i.lv || 1) > lv).sort((x, y) => (x.lv || 1) - (y.lv || 1));
    return rest[0] || null;
  },

  pickIdle() {
    const h = new Date().getHours();
    const nightish = (h >= 22 || h < 7);
    const pool = [];
    this.unlocked().forEach(i => {
      const w = (nightish && i.night) ? i.night : 1;
      for (let k = 0; k < w; k++) pool.push(i);
    });
    if (!pool.length) pool.push(this.IDLES[0]);   // 안전장치
    this._idle = pool[Math.floor(Math.random() * pool.length)];
    return this._idle;
  },

  // --------------------------------------------------------------------------
  //  행동 도감 — 우렁이가 할 수 있는 일과 앞으로 열릴 것
  // --------------------------------------------------------------------------
  openIdleBook() {
    const old = document.getElementById('idle-book-ov');
    if (old) old.remove();
    const lv = this.level();
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const list = this.IDLES.slice().sort((x, y) => (x.lv || 1) - (y.lv || 1));
    const got = list.filter(i => (i.lv || 1) <= lv).length;

    const ov = document.createElement('div');
    ov.id = 'idle-book-ov';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10045; background: var(--bg-primary); overflow-y: auto;'
      + ' padding: calc(0.9rem + env(safe-area-inset-top)) 1.1rem calc(2rem + env(safe-area-inset-bottom));';

    ov.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.15rem;">
        <span style="line-height: 0; color: var(--accent-primary);">${window.Icons ? window.Icons.svg('star', { size: 19 }) : ''}</span>
        <strong style="font-size: 1.05rem; color: var(--text-primary);">우렁이가 할 수 있는 일</strong>
        <button onclick="document.getElementById('idle-book-ov').remove(); window.Sfx && window.Sfx.play('close');"
 style="all: unset; margin-left: auto; cursor: pointer; font-size: 1.1rem; color: var(--text-muted); padding: 0.2rem 0.4rem;"></button>
      </div>
      <p style="margin: 0 0 0.9rem; font-size: 0.78rem; line-height: 1.65; color: var(--text-muted);">
        ${got} / ${list.length}가지를 열었어요 · 레벨이 오를 때마다 하나씩 늘어나요<br>
        대화·체크인·미션이 전부 경험치예요.
      </p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(102px, 1fr)); gap: 0.5rem;">
        ${list.map(i => {
          const open = (i.lv || 1) <= lv;
          const art = open ? (window.Stickers ? (i.skin ? window.Stickers.svgFor(i.skin, i.s, 56) : window.Stickers.svg(i.s, 56)) : '') : '';
          return `
          <div style="text-align: center; padding: 0.6rem 0.3rem 0.5rem; border-radius: 13px;
                      background: ${open ? 'var(--bg-secondary)' : 'var(--bg-tertiary)'};
                      border: 1px solid ${open ? 'color-mix(in srgb, var(--accent-primary) 28%, transparent)' : 'var(--glass-border)'};
                      opacity: ${open ? 1 : 0.62};">
            <div style="height: 58px; display: flex; align-items: center; justify-content: center; line-height: 0;">
              ${open ? art : `<span style="line-height:0;color:var(--text-muted);">${window.Icons ? window.Icons.svg('lock', { size: 26 }) : ''}</span>`}
            </div>
            <p style="margin: 0.3rem 0 0; font-size: 0.68rem; line-height: 1.45; font-weight: 700; color: ${open ? 'var(--text-primary)' : 'var(--text-muted)'};">
              ${open ? esc(i.cap) : 'Lv.' + (i.lv || 1) + ' 에서 열려요'}
            </p>
          </div>`;
        }).join('')}
      </div>`;

    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  // --------------------------------------------------------------------------
  //  방 씬 그리기 (우렁이는 옷장 착용분이 그대로 반영된 스티커를 씀)
  // --------------------------------------------------------------------------
  scene(width = 420) {
    const p = this.placed();
    const draw = slot => { const it = this.item(p[slot]); return it ? it.svg() : ''; };
    const uid = 'rm' + Math.floor(Math.random() * 1e6);
    // 배회 폭·속도를 매번 다르게 (같은 움직임 반복 방지)
    const far = 42 + Math.floor(Math.random() * 46);
    // 사용자가 우렁이를 직접 옮겨둔 자리가 있으면 배회하지 않고 그 자리에 머문다
    const pos = this._pos();
    const hasPos = !!(pos && (Math.abs(pos.x) > 0.002 || Math.abs(pos.y) > 0.002));
    const roam = !hasPos && Math.random() < 0.5;   // 활발해도 절반은 제자리에서 논다
    const dur = (16 + Math.random() * 10).toFixed(1);   // 대부분 제자리, 가끔 한 바퀴
    const idle = this._idle || this.pickIdle();
    const snail = window.Stickers
      ? window.Stickers.svgDressed(idle.skin || null, idle.s, 118)
      : '';
    return `
      <div id="wr-stage" style="position: relative; width: 100%; max-width: ${width}px; margin: 0 auto; border-radius: 16px; overflow: hidden; border: 1.5px solid var(--glass-border); box-shadow: var(--shadow-sm);">
        <svg viewBox="0 0 320 210" width="100%" role="img" aria-label="우렁이의 방" style="display: block;">
          <defs>
            <linearGradient id="${uid}-wallsh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#000" stop-opacity="0.10"/>
              <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
            </linearGradient>
            <radialGradient id="${uid}-lamp" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stop-color="#FFF3D0" stop-opacity="0.55"/>
              <stop offset="1" stop-color="#FFF3D0" stop-opacity="0"/>
            </radialGradient>
          </defs>
          ${draw('wallpaper')}
          <rect x="0" y="0" width="320" height="140" fill="url(#${uid}-wallsh)"/>
          ${draw('floor')}
          <!-- 원근 마루 이음선 -->
          <g opacity="0.16" stroke="#5E4530" stroke-width="1.2">
            <path d="M40 210 L74 143M110 210 L128 143M186 210 L192 143M262 210 L250 143"/>
          </g>
          <!-- 걸레받이 (벽-바닥 경계) -->
          <rect x="0" y="134" width="320" height="9" fill="#EFE6D6"/>
          <rect x="0" y="134" width="320" height="2.5" fill="#D9CBB4"/>
          <rect x="0" y="141" width="320" height="2" fill="#000" opacity="0.10"/>
          <!-- 은은한 조명 웅덩이 -->
          <ellipse cx="160" cy="176" rx="118" ry="40" fill="url(#${uid}-lamp)"/>
          ${draw('wall')}
          <!-- 벽 콘센트 (디테일) -->
          <g opacity="0.5">
            <rect x="24" y="118" width="13" height="11" rx="2.5" fill="#EFE6D6" stroke="#C6B79E" stroke-width="1.4"/>
            <circle cx="28" cy="123.5" r="1.2" fill="#B7A88F"/><circle cx="33" cy="123.5" r="1.2" fill="#B7A88F"/>
          </g>
          ${draw('rug')}
          ${draw('left')}
          ${draw('right')}
          <!-- 코너 비네트 -->
          <path d="M0 0 h46 q-30 24 -46 66z" fill="#000" opacity="0.05"/>
          <path d="M320 0 h-46 q30 24 46 66z" fill="#000" opacity="0.05"/>
        </svg>
        <div id="wr-snail" class="wr-snail" role="button" tabindex="0" aria-label="우렁이 — 만지거나 옮겨보세요" style="position: absolute; left: 50%; bottom: 8%; width: 30%; line-height: 0;">
          <div class="wr-move">
            <div class="${idle.active && roam ? 'wr-wander' : ''}" style="width: 100%; ${idle.active && roam ? ('--wr-far: ' + far + 'px; animation: wr-stroll ' + dur + 's ease-in-out infinite;') : ''}"><div class="wr-squish"><div class="wr-stand">${snail}</div></div></div>
          </div>
        </div>
        <div style="position: absolute; left: 50%; top: 5%; transform: translateX(-50%); max-width: 88%; font-size: 0.76rem; font-weight: 700; color: #4a4038; background: rgba(255, 252, 245, 0.88); border: 1px solid rgba(74, 64, 56, 0.18); padding: 0.2rem 0.6rem; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${idle.cap}
        </div>
      </div>`;
  },

  _shopOpen: false,

  toggleShop() {
    this._shopOpen = !this._shopOpen;
    if (window.Sfx) window.Sfx.play('nav');
    this.render();
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
      const locked = it.lv && this.level() < it.lv;
      const tag = locked ? `Lv.${it.lv} 부터` : it.free ? '기본' : it.cash ? `${it.cash.toLocaleString()}캐시` : `${it.price}코인`;
      const tagColor = locked ? 'var(--text-muted)' : it.free ? 'var(--text-muted)' : it.cash ? '#c9a227' : 'var(--accent-primary)';
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
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem; margin-top: 0.6rem;">
        <button onclick="window.Game && window.Game.show('closet')" style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 0.8rem; font-weight: 800; color: var(--text-primary); background: var(--bg-tertiary); border: 1px solid var(--glass-border); padding: 0.55rem 0.15rem; border-radius: 11px; display: flex; align-items: center; justify-content: center; gap: 0.25rem;">${window.Icons ? window.Icons.svg('closet', { size: 16 }) : ''}옷장</button>
        <button onclick="window.Game && window.Game.show('medal')" style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 0.8rem; font-weight: 800; color: var(--text-primary); background: var(--bg-tertiary); border: 1px solid var(--glass-border); padding: 0.55rem 0.15rem; border-radius: 11px; display: flex; align-items: center; justify-content: center; gap: 0.25rem;">${window.Icons ? window.Icons.svg('medal', { size: 16 }) : ''}훈장</button>
        <button onclick="window.Room.toggleShop()" style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 0.8rem; font-weight: 800; color: ${this._shopOpen ? 'var(--text-muted)' : '#fff'}; background: ${this._shopOpen ? 'var(--bg-tertiary)' : 'var(--accent-primary)'}; border: 1px solid ${this._shopOpen ? 'var(--glass-border)' : 'transparent'}; padding: 0.55rem 0.15rem; border-radius: 11px; display: flex; align-items: center; justify-content: center; gap: 0.25rem;">${this._shopOpen ? '닫기 ▲' : (window.Icons ? window.Icons.svg('shop', { size: 16, line: '#fff' }) : '') + ' 상점'}</button>
        <button onclick="window.Game && window.Game.show('farm')" style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 0.8rem; font-weight: 800; color: var(--text-primary); background: var(--bg-tertiary); border: 1px solid var(--glass-border); padding: 0.55rem 0.15rem; border-radius: 11px; display: flex; align-items: center; justify-content: center; gap: 0.25rem;">${window.Icons ? window.Icons.svg('sprout', { size: 16 }) : ''}농장</button>
      </div>
      <div style="${this._shopOpen ? '' : 'display: none;'} margin-top: 0.6rem;">
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
        </p>
      </div>
      ${window.Game ? window.Game.careBar() : ''}`;

    // 우렁이를 만지고 옮길 수 있게 — 방을 다시 그릴 때마다 새 캐릭터에 붙인다
    this._mountSnail();
  },

  // ==========================================================================
  //  우렁이 터치·롱프레스·드래그  (cbt_uroong_pos 에 위치 저장)
  //   · 탭        → 통통 튀는 반응 + 효과음 + 가끔 말풍선
  //   · 롱프레스   → 말랑하게 찌그러짐 (누르는 동안 유지, 떼면 탱글 복원)
  //   · 드래그(8px+)→ 방 안에서 위치 이동, 놓으면 저장 (경계 clamp)
  //   · 더블탭     → 원래 자리로 복귀
  // ==========================================================================
  _SAYS: ['아야!', '간지러워~', '또 눌렀네', '히힛', '왜 자꾸 만져~', '어? 불렀어?', '말랑말랑'],
  _curDx: 0, _curDy: 0, _lastTap: 0, _reacting: false,

  _pos() {
    try {
      const p = this._S() && this._S()._safeGet('cbt_uroong_pos', null);
      if (p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number') return p;
    } catch (e) {}
    return { x: 0, y: 0 };
  },
  _savePos(x, y) {
    try { this._S() && this._S()._safeSet('cbt_uroong_pos', { x, y }); } catch (e) {}
  },

  // 저장 좌표(무대 대비 분수) → 이동 한계. 우렁이 상자가 방 밖으로 안 나가게.
  _bounds(sr, nr) {
    const w = nr.width, h = nr.height;
    const halfFree = Math.max(0, sr.width / 2 - w / 2);
    return {
      minX: -halfFree, maxX: halfFree,
      minY: Math.min(0, h - sr.height * 0.92),   // 위로 (천장까지)
      maxY: sr.height * 0.08                       // 아래로 (바닥까지)
    };
  },

  _mountSnail() {
    const snail = document.getElementById('wr-snail');
    if (!snail || snail.dataset.wrBound) return;   // 새 캐릭터에만 한 번 바인딩
    snail.dataset.wrBound = '1';
    const stage = document.getElementById('wr-stage');
    const squish = snail.querySelector('.wr-squish');
    if (!stage || !squish) return;
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // 저장된 위치 반영 (분수 → px, 현재 무대 크기 기준으로 다시 clamp)
    const applyPos = () => {
      const sr = stage.getBoundingClientRect();
      const nr = snail.getBoundingClientRect();
      if (!sr.width || !nr.width) return;
      const p = this._pos();
      const b = this._bounds(sr, nr);
      let dx = Math.max(b.minX, Math.min(b.maxX, p.x * sr.width));
      let dy = Math.max(b.minY, Math.min(b.maxY, p.y * sr.height));
      snail.style.setProperty('--wr-dx', dx + 'px');
      snail.style.setProperty('--wr-dy', dy + 'px');
      this._curDx = dx; this._curDy = dy;
    };
    applyPos();                      // 레이아웃이 이미 잡혔으면 즉시
    requestAnimationFrame(applyPos); // 아직이면 다음 프레임에 (0폭 방어)

    let g = null;

    const onDown = (e) => {
      if (e.button != null && e.button !== 0) return;   // 좌클릭·터치·펜만
      const sr = stage.getBoundingClientRect();
      const nr = snail.getBoundingClientRect();
      g = {
        id: e.pointerId, sx: e.clientX, sy: e.clientY, t: Date.now(),
        baseDx: this._curDx || 0, baseDy: this._curDy || 0,
        bounds: this._bounds(sr, nr), mode: null, lp: null
      };
      try { snail.setPointerCapture(e.pointerId); } catch (_) {}
      // 400ms 유지 → 찌그러짐
      g.lp = setTimeout(() => {
        if (!g || g.mode) return;
        g.mode = 'squish';
        squish.classList.remove('is-tapped', 'is-release');
        squish.classList.add('is-squishing');
        if (window.Sfx) window.Sfx.hit('squish');
      }, 400);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (g.mode !== 'drag' && (dx * dx + dy * dy) > 64) {   // 8px 넘으면 드래그
        g.mode = 'drag';
        clearTimeout(g.lp);
        squish.classList.remove('is-squishing', 'is-tapped', 'is-release');
        snail.classList.add('wr-dragging');
      }
      if (g.mode === 'drag') {
        const b = g.bounds;
        const nx = Math.max(b.minX, Math.min(b.maxX, g.baseDx + dx));
        const ny = Math.max(b.minY, Math.min(b.maxY, g.baseDy + dy));
        snail.style.setProperty('--wr-dx', nx + 'px');
        snail.style.setProperty('--wr-dy', ny + 'px');
        this._curDx = nx; this._curDy = ny;
        e.preventDefault();
      }
    };

    const onUp = (e) => {
      if (!g || e.pointerId !== g.id) return;
      clearTimeout(g.lp);
      try { snail.releasePointerCapture(e.pointerId); } catch (_) {}
      if (g.mode === 'drag') {
        snail.classList.remove('wr-dragging');
        const sr = stage.getBoundingClientRect();
        this._savePos((this._curDx || 0) / (sr.width || 1), (this._curDy || 0) / (sr.height || 1));
        if (window.Sfx) window.Sfx.hit('place');   // 착지
      } else if (g.mode === 'squish') {
        squish.classList.remove('is-squishing');
        if (!reduce) {
          squish.classList.add('is-release');
          setTimeout(() => squish.classList.remove('is-release'), 520);
        }
      } else {
        // 짧게 뗌 → 탭. 320ms 안에 두 번이면 원위치 복귀.
        const now = Date.now();
        if (this._lastTap && now - this._lastTap < 320) {
          this._lastTap = 0;
          this._resetPos(snail, stage);
        } else {
          this._lastTap = now;
          this._tapReact(snail, squish);
        }
      }
      g = null;
    };

    snail.addEventListener('pointerdown', onDown);
    snail.addEventListener('pointermove', onMove);
    snail.addEventListener('pointerup', onUp);
    snail.addEventListener('pointercancel', onUp);
    snail.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._tapReact(snail, squish); }
    });
  },

  _tapReact(snail, squish) {
    if (this._reacting) return;                    // 연타 디바운스
    this._reacting = true;
    setTimeout(() => { this._reacting = false; }, 420);
    squish.classList.remove('is-squishing', 'is-release', 'is-tapped');
    void squish.offsetWidth;                        // 애니메이션 재시작
    squish.classList.add('is-tapped');
    setTimeout(() => squish.classList.remove('is-tapped'), 440);
    if (window.Sfx) window.Sfx.hit('poke');
    if (Math.random() < 0.55) this._say(snail);
  },

  _say(snail) {
    const move = snail.querySelector('.wr-move');
    if (!move) return;
    const old = move.querySelector('.wr-say');
    if (old) old.remove();
    const b = document.createElement('div');
    b.className = 'wr-say';
    b.textContent = this._SAYS[Math.floor(Math.random() * this._SAYS.length)];
    move.appendChild(b);
    setTimeout(() => { if (b.parentNode) b.remove(); }, 1350);
  },

  _resetPos(snail, stage) {
    this._curDx = 0; this._curDy = 0;
    this._savePos(0, 0);
    snail.style.setProperty('--wr-dx', '0px');
    snail.style.setProperty('--wr-dy', '0px');
    if (window.Sfx) window.Sfx.hit('appear');
  }
};
