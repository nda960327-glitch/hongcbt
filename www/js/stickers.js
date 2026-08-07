// ============================================================================
//  우렁이 스티커 v2 — "하찮고 뚱뚱한" 치이카와st 굿즈용
//  앱에 내장된 SVG 이모티콘. 네트워크·AI 토큰 불필요, 전부 CSS 애니메이션.
//  사용: window.Stickers.svg('joy', 96)
// ============================================================================
window.Stickers = {
  list: ['joy', 'surprise', 'empathy', 'sad', 'love', 'cheer', 'blank', 'sleepy', 'proud', 'think', 'detective', 'teacher', 'aha', 'oops',
    'rage', 'bigcry', 'laugh', 'dizzy', 'hungry', 'run', 'hide', 'faint', 'stareyes', 'no', 'ok', 'hmph', 'panic', 'cold', 'hot', 'sing',
    'dance', 'write', 'hero', 'gift', 'tea', 'muscle', 'rainy', 'party', 'shy', 'judge', 'ghost', 'bow', 'melt', 'peek',
    'watering', 'shelter', 'harvesting', 'farming', 'waiting'],
  labels: { joy: '기쁨', surprise: '놀람', empathy: '공감', sad: '슬픔', love: '사랑', cheer: '응원', blank: '멍때림', sleepy: '졸림', proud: '뿌듯',
    think: '골똘', detective: '탐정', teacher: '선생님', aha: '깨달음', oops: '머쓱',
    rage: '분노', bigcry: '대성통곡', laugh: '폭소', dizzy: '어지러움', hungry: '배고픔', run: '질주', hide: '숨기', faint: '기절',
    stareyes: '반짝', no: '거부', ok: '최고', hmph: '삐짐', panic: '혼비백산', cold: '추움', hot: '더움', sing: '노래',
    dance: '춤', write: '필기', hero: '히어로', gift: '선물', tea: '티타임', muscle: '운동', rainy: '비맞음', party: '파티',
    shy: '수줍', judge: '심드렁', ghost: '방전', bow: '꾸벅', melt: '녹아내림', peek: '빼꼼',
    watering: '물주기', shelter: '비피하기', harvesting: '수확', farming: '씨뿌리기', waiting: '기다림' },

  // ==========================================================================
  //  캐릭터 스킨 — 같은 포즈를 우렁이·햇님·달님·소나무 몸으로 그린다
  // ==========================================================================
  SKINS: {
    woorung: {
      body: '#FFF9F0', line: '#8A6F55', cheek: '#F9BCA4',
      deco: `
        <g>
          <circle cx="103" cy="52" r="15" fill="#BBD7C0" stroke="#7FA78C" stroke-width="3"/>
          <path d="M103 52 m0 -9 a9 9 0 1 1 -9 9 a6.4 6.4 0 1 0 6.4 -6.4 a4 4 0 1 1 -4 4" fill="none" stroke="#7FA78C" stroke-width="2.2" stroke-linecap="round"/>
        </g>
        <path d="M36 50 q30 -16 62 -4" fill="none" stroke="#B79B7C" stroke-width="2.2" opacity="0.5"/>
        <g transform="rotate(-8 44 42)">
          <circle cx="44" cy="42" r="7.5" fill="#F4F7F6" stroke="#8FA8B8" stroke-width="2.6"/>
          <circle cx="44" cy="42" r="2.6" fill="#C9D8E2"/>
        </g>`
    },
    haru: { // 햇님: 살구빛 몸 + 삐뚤한 햇살 왕관 + 옆에 미니 해
      body: '#FFF3DA', line: '#B8813C', cheek: '#F7B48A',
      deco: `
        <g transform="rotate(-6 70 44)">
          <path d="M52 46 l4 -9 5 8 M66 42 l3 -10 5 9 M81 43 l4 -9 4 9" fill="none" stroke="#E8A54B" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <g>
          <circle cx="106" cy="50" r="11" fill="#FBD679" stroke="#D9A93C" stroke-width="2.8"/>
          <path d="M106 35 v-4 M117 39 l3 -3 M121 50 h4 M117 61 l3 3" stroke="#E8B04B" stroke-width="2.4" stroke-linecap="round"/>
        </g>`
    },
    dalnim: { // 달님: 라벤더빛 몸 + 초승달 머리핀 + 잔별
      body: '#F5F1FB', line: '#7B6FA8', cheek: '#EBC6DB',
      deco: `
        <g transform="rotate(10 100 46)">
          <path d="M104 34 a10 10 0 1 0 8 16 a7.5 7.5 0 1 1 -8 -16z" fill="#F2E6A8" stroke="#C9B96A" stroke-width="2.4" stroke-linejoin="round"/>
        </g>
        <path d="M40 40 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#D9CBEF"/>
        <circle cx="30" cy="56" r="2" fill="#D9CBEF"/>`
    },
    sonamu: { // 소나무: 연둣빛 몸 + 머리 위 솔가지 + 작은 솔방울
      body: '#F0F7EE', line: '#5C8272', cheek: '#C4DCA9',
      deco: `
        <g transform="rotate(-5 70 42)">
          <path d="M58 44 q12 -10 26 -2" fill="none" stroke="#7FA78C" stroke-width="3" stroke-linecap="round"/>
          <path d="M62 41 l-2 -6 M68 38 l-1 -7 M75 37 l1 -7 M81 39 l3 -6" stroke="#5fae7f" stroke-width="2.6" stroke-linecap="round"/>
        </g>
        <g>
          <ellipse cx="104" cy="52" rx="8.5" ry="11" fill="#C9A876" stroke="#8A6F55" stroke-width="2.6"/>
          <path d="M98 46 h12 M97 52 h14 M99 58 h10" stroke="#8A6F55" stroke-width="1.6" opacity="0.65"/>
        </g>`
    }
  },
  _skinId: 'woorung',
  _skin() { return this.SKINS[this._skinId] || this.SKINS.woorung; },

  // 특정 캐릭터(페르소나)의 몸으로 스티커 그리기
  svgFor(charId, name, size = 96) {
    const map = { woorung: 'woorung', haru: 'haru', dalnim: 'dalnim', sonamu: 'sonamu' };
    const prev = this._skinId;
    this._skinId = map[charId] || 'woorung';
    const out = this.svg(name, size);
    this._skinId = prev;
    return out;
  },

  // 채팅 타이핑 인디케이터: 꼬물꼬물 미니 우렁이 + 점 세 개
  typing(size = 44) {
    const p = 'wr2-typing';
    return `
<svg width="${Math.round(size * 1.9)}" height="${size}" viewBox="0 0 130 68" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="우렁이가 입력 중">
  <style>
    .${p}-b{animation:${p}-wig 1s ease-in-out infinite;transform-origin:34px 52px}
    .${p}-d1{animation:${p}-bob 1.1s ease-in-out infinite}
    .${p}-d2{animation:${p}-bob 1.1s ease-in-out 0.18s infinite}
    .${p}-d3{animation:${p}-bob 1.1s ease-in-out 0.36s infinite}
    @keyframes ${p}-wig{0%,100%{transform:rotate(-4deg) scaleX(1)}25%{transform:rotate(0deg) scaleX(1.05)}50%{transform:rotate(4deg) scaleX(1)}75%{transform:rotate(0deg) scaleX(0.97)}}
    @keyframes ${p}-bob{0%,100%{transform:translateY(0);opacity:0.45}50%{transform:translateY(-5px);opacity:1}}
  </style>
  <g class="${p}-b">
    <circle cx="46" cy="26" r="9" fill="#BBD7C0" stroke="#7FA78C" stroke-width="2.2"/>
    <path d="M46 26 m0 -5.5 a5.5 5.5 0 1 1 -5.5 5.5 a3.8 3.8 0 1 0 3.8 -3.8" fill="none" stroke="#7FA78C" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M34 20 C 45 19, 54 24, 56 32 C 58 40, 54 47, 44 48 C 33 49, 24 46, 21 39 C 18 31, 23 22, 34 20 Z"
          fill="#FFF9F0" stroke="#8A6F55" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="31" cy="35" r="1.7" fill="#3F352A"/>
    <circle cx="45" cy="35" r="1.7" fill="#3F352A"/>
    <circle cx="26" cy="40" r="3.4" fill="#F9BCA4" opacity="0.85"/>
    <circle cx="50" cy="40" r="3.4" fill="#F9BCA4" opacity="0.85"/>
    <path d="M35 41 q3 2.2 6 0" fill="none" stroke="#3F352A" stroke-width="1.8" stroke-linecap="round"/>
  </g>
  <circle class="${p}-d1" cx="76" cy="38" r="4.5" fill="#B7A38B"/>
  <circle class="${p}-d2" cx="94" cy="38" r="4.5" fill="#B7A38B"/>
  <circle class="${p}-d3" cx="112" cy="38" r="4.5" fill="#B7A38B"/>
</svg>`;
  },

  // 공통 몸통: 옆으로 퍼진 찹쌀떡 몸(손그림 울퉁불퉁 외곽) + 스킨별 장식
  // (우렁이=껍질·헤드미러 / 햇님=햇살 / 달님=초승달 / 소나무=솔가지)
  _base(prefix, face = '', armRUp = false) {
    const sk = this._skin();
    const armR = armRUp
      ? `<path class="${prefix}-armR" d="M112 88 q10 -4 10 -14 q-7 -4 -11 3 q-3 6 1 11z" fill="${sk.body}" stroke="${sk.line}" stroke-width="3.2" stroke-linejoin="round"/>`
      : `<path class="${prefix}-armR" d="M113 92 q9 3 7 11 q-8 2 -10 -4 q-1 -5 3 -7z" fill="${sk.body}" stroke="${sk.line}" stroke-width="3.2" stroke-linejoin="round"/>`;
    return `
      <g class="${prefix}-body">
        <!-- 뚱뚱 찹쌀떡 몸 (손그림 울퉁불퉁) -->
        <path d="M70 42
                 C 89 41, 106 50, 112 65
                 C 117 77, 119 94, 112 106
                 C 104 119, 90 125, 70 125
                 C 50 126, 35 119, 27 106
                 C 20 94, 22 77, 28 64
                 C 34 50, 51 43, 70 42 Z"
              fill="${sk.body}" stroke="${sk.line}" stroke-width="3.6" stroke-linejoin="round"/>
        <!-- 콩알 발 -->
        <path d="M50 124 q4 6 10 1" fill="none" stroke="${sk.line}" stroke-width="3" stroke-linecap="round"/>
        <path d="M80 125 q4 6 10 0" fill="none" stroke="${sk.line}" stroke-width="3" stroke-linecap="round"/>
        <!-- 아무것도 못 할 것 같은 짜리몽땅 팔 -->
        <path class="${prefix}-armL" d="M27 92 q-9 3 -7 11 q8 2 10 -4 q1 -5 -3 -7z" fill="${sk.body}" stroke="${sk.line}" stroke-width="3.2" stroke-linejoin="round"/>
        ${armR}
        <!-- 스킨별 시그니처 장식 -->
        ${sk.deco}
        <!-- 큼직한 볼터치 (얼굴 아래쪽) -->
        <circle class="${prefix}-cheek" cx="42" cy="96" r="8" fill="${sk.cheek}" opacity="0.85"/>
        <circle class="${prefix}-cheek" cx="98" cy="96" r="8" fill="${sk.cheek}" opacity="0.85"/>
        ${face}
        <!-- 옷장에서 착용한 아이템 (모자·안경·목도리·소품) -->
        ${(window.Closet && window.Closet.layer) ? window.Closet.layer() : ''}
      </g>`;
  },

  svg(name, size = 96) {
    const p = 'wr2-' + this._skinId + '-' + name;
    const wrap = (style, inner) => `
<svg width="${size}" height="${size}" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="우렁이 ${this.labels[name] || ''}">
  <style>${style}</style>
  ${inner}
</svg>`;

    switch (name) {
      // ── 기다림: 문 쪽만 보며 하염없이… 눈 깜빡 + 말줄임표 ───────────────
      case 'waiting': return wrap(`
        .${p}-eyeL, .${p}-eyeR{animation:${p}-blink 3.2s ease-in-out infinite}
        .${p}-d1{animation:${p}-dot 1.8s ease-in-out infinite}
        .${p}-d2{animation:${p}-dot 1.8s ease-in-out 0.3s infinite}
        .${p}-d3{animation:${p}-dot 1.8s ease-in-out 0.6s infinite}
        .${p}-body{animation:${p}-sigh 4.5s ease-in-out infinite}
        @keyframes ${p}-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(0.1)}}
        @keyframes ${p}-dot{0%,100%{opacity:0.15}50%{opacity:1}}
        @keyframes ${p}-sigh{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}`,
        this._base(p, `
          <g class="${p}-eyeL" style="transform-origin:52px 86px"><circle cx="52" cy="86" r="3" fill="#3F352A"/></g>
          <g class="${p}-eyeR" style="transform-origin:88px 86px"><circle cx="88" cy="86" r="3" fill="#3F352A"/></g>
          <path d="M64 99 q6 -3 12 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<circle class="${p}-d1" cx="112" cy="38" r="3" fill="#B7A895"/>
           <circle class="${p}-d2" cx="122" cy="32" r="3.6" fill="#B7A895"/>
           <circle class="${p}-d3" cx="133" cy="25" r="4.2" fill="#B7A895"/>`);

      // ── 물주기: 물뿌리개 기울여 새싹에 조로록 ───────────────────────────
      case 'watering': return wrap(`
        .${p}-can{animation:${p}-tilt 1.6s ease-in-out infinite;transform-origin:104px 66px}
        .${p}-dr1{animation:${p}-fall 1.6s ease-in infinite}
        .${p}-dr2{animation:${p}-fall 1.6s ease-in 0.5s infinite}
        .${p}-spr{animation:${p}-wig 1.6s ease-in-out infinite;transform-origin:126px 130px}
        @keyframes ${p}-tilt{0%,100%{transform:rotate(0)}40%,75%{transform:rotate(-16deg)}}
        @keyframes ${p}-fall{0%,35%{opacity:0;transform:translateY(0)}50%{opacity:1}92%{opacity:1;transform:translateY(15px)}100%{opacity:0;transform:translateY(17px)}}
        @keyframes ${p}-wig{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(4deg)}}`,
        this._base(p, `
          <path d="M48 86 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 86 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="70" cy="98" rx="3.4" ry="4.2" fill="#C97B72" stroke="#3F352A" stroke-width="2.2"/>`, true)
        + `<g class="${p}-can">
             <path d="M92 60 h20 q4 0 4 4 v9 q0 4 -4 4 h-20 q-4 0 -4 -4 v-9 q0 -4 4 -4z" fill="#9FB9C9" stroke="#5F8194" stroke-width="3" stroke-linejoin="round"/>
             <path d="M116 64 l9 -6 q2 -1 2 1 l-2 10" fill="none" stroke="#5F8194" stroke-width="2.8" stroke-linecap="round"/>
             <path d="M96 60 q5 -8 12 -1" fill="none" stroke="#5F8194" stroke-width="2.6"/>
           </g>
           <g class="${p}-dr1"><circle cx="123" cy="88" r="2.6" fill="#8FC3D9"/></g>
           <g class="${p}-dr2"><circle cx="128" cy="86" r="2.1" fill="#8FC3D9"/></g>
           <g class="${p}-spr">
             <path d="M127 132 v-9" fill="none" stroke="#5C8F6B" stroke-width="2.8" stroke-linecap="round"/>
             <path d="M127 125 q-8 -2 -9 -9 q8 -1 9 7z" fill="#8FC79B" stroke="#5C8F6B" stroke-width="2"/>
             <path d="M127 123 q8 -4 10 -10 q-9 -2 -10 8z" fill="#A9DCB2" stroke="#5C8F6B" stroke-width="2"/>
           </g>`);

      // ── 비피하기: 잎사귀 우산 아래서 포근하게 비를 긋는다 ───────────────
      case 'shelter': return wrap(`
        .${p}-rain g{animation:${p}-drop 1.1s linear infinite}
        .${p}-r2{animation-delay:0.35s!important}
        .${p}-r3{animation-delay:0.7s!important}
        .${p}-um{animation:${p}-sway 2.4s ease-in-out infinite;transform-origin:70px 44px}
        @keyframes ${p}-drop{0%{transform:translateY(-6px);opacity:0}25%{opacity:1}85%{opacity:1}100%{transform:translateY(26px);opacity:0}}
        @keyframes ${p}-sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}`,
        this._base(p, `
          <path d="M48 87 q4.5 3.5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 87 q4.5 3.5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M64 98 q6 4 12 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`, true)
        + `<g class="${p}-um">
             <path d="M70 46 V26" fill="none" stroke="#5C8F6B" stroke-width="3.6" stroke-linecap="round"/>
             <path d="M22 32 q48 -26 96 0 q-24 11 -48 7 q-24 4 -48 -7z" fill="#8FC79B" stroke="#5C8F6B" stroke-width="3" stroke-linejoin="round"/>
             <path d="M34 28 q36 -14 72 0" fill="none" stroke="#5C8F6B" stroke-width="2" opacity="0.45"/>
           </g>
           <g class="${p}-rain">
             <g><path d="M12 44 l-3 8" stroke="#8FC3D9" stroke-width="2.6" stroke-linecap="round"/></g>
             <g class="${p}-r2"><path d="M128 40 l-3 8" stroke="#8FC3D9" stroke-width="2.6" stroke-linecap="round"/></g>
             <g class="${p}-r3"><path d="M8 84 l-3 8" stroke="#8FC3D9" stroke-width="2.6" stroke-linecap="round"/></g>
             <g class="${p}-r2"><path d="M133 80 l-3 8" stroke="#8FC3D9" stroke-width="2.6" stroke-linecap="round"/></g>
             <g class="${p}-r3"><path d="M20 20 l-3 8" stroke="#8FC3D9" stroke-width="2.6" stroke-linecap="round"/></g>
           </g>`);

      // ── 수확: 당근을 번쩍 들고 콩콩 ─────────────────────────────────────
      case 'harvesting': return wrap(`
        .${p}-body{animation:${p}-hop 0.8s ease-in-out infinite}
        .${p}-car{animation:${p}-wave 1.6s ease-in-out infinite;transform-origin:118px 78px}
        .${p}-sp{animation:${p}-tw 1.2s ease-in-out infinite}
        @keyframes ${p}-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}60%{transform:translateY(-3px)}}
        @keyframes ${p}-wave{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(8deg)}}
        @keyframes ${p}-tw{0%,100%{opacity:0;transform:scale(0.5)}50%{opacity:1;transform:scale(1)}}`,
        this._base(p, `
          <path d="M48 86 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 86 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M62 97 q8 9 16 0 z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`, true)
        + `<g class="${p}-car">
             <path d="M122 52 q8 3 7 12 q-2 13 -8 19 q-6 -6 -7 -19 q-1 -9 8 -12z" fill="#E58A47" stroke="#B05F26" stroke-width="2.6" stroke-linejoin="round"/>
             <path d="M119 52 q-4 -9 -9 -10M122 51 q0 -10 2 -12M125 52 q5 -8 9 -9" fill="none" stroke="#6FA87E" stroke-width="3" stroke-linecap="round"/>
           </g>
           <g class="${p}-sp" style="transform-origin:24px 40px"><path d="M24 32 l2.4 5 5 2.4 -5 2.4 -2.4 5 -2.4 -5 -5 -2.4 5 -2.4z" fill="#F5C74E"/></g>`);

      // ── 씨뿌리기: 씨앗을 포물선으로 촥촥 ────────────────────────────────
      case 'farming': return wrap(`
        .${p}-s1{animation:${p}-toss 1.5s ease-in infinite}
        .${p}-s2{animation:${p}-toss 1.5s ease-in 0.25s infinite}
        .${p}-s3{animation:${p}-toss 1.5s ease-in 0.5s infinite}
        .${p}-armR{animation:${p}-fling 1.5s ease-in-out infinite;transform-origin:112px 90px}
        @keyframes ${p}-fling{0%,100%{transform:rotate(0)}20%{transform:rotate(-24deg)}40%{transform:rotate(6deg)}}
        @keyframes ${p}-toss{0%,18%{opacity:0;transform:translate(0,0)}30%{opacity:1}100%{opacity:0;transform:translate(15px,34px)}}`,
        this._base(p, `
          <circle cx="52" cy="86" r="3" fill="#3F352A"/>
          <circle cx="88" cy="86" r="3" fill="#3F352A"/>
          <path d="M63 98 h14" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`, true)
        + `<g class="${p}-s1"><circle cx="116" cy="80" r="2.4" fill="#B98A5E"/></g>
           <g class="${p}-s2"><circle cx="120" cy="76" r="2.1" fill="#96682F"/></g>
           <g class="${p}-s3"><circle cx="113" cy="74" r="1.9" fill="#B98A5E"/></g>
           <path d="M112 128 q6 -4 12 0M122 132 q5 -3 10 0" fill="none" stroke="#8A6F55" stroke-width="2.6" stroke-linecap="round" opacity="0.6"/>`);

      // ── 기쁨: 하찮은 눈웃음 + 감자같이 벌린 입 + 콩콩 ──────────────────
      case 'joy': return wrap(`
        .${p}-body{animation:${p}-hop 0.85s ease-in-out infinite}
        .${p}-sp{animation:${p}-tw 1.2s ease-in-out infinite}
        .${p}-sp2{animation:${p}-tw 1.2s ease-in-out 0.6s infinite}
        @keyframes ${p}-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}60%{transform:translateY(-3px)}}
        @keyframes ${p}-tw{0%,100%{opacity:0;transform:scale(0.5)}50%{opacity:1;transform:scale(1)}}`,
        this._base(p, `
          <path d="M48 86 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 86 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M62 97 q8 9 16 0 z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`)
        + `<g class="${p}-sp" style="transform-origin:20px 36px"><path d="M20 28 l2.4 5 5 2.4 -5 2.4 -2.4 5 -2.4 -5 -5 -2.4 5 -2.4z" fill="#F5C74E"/></g>
           <g class="${p}-sp2" style="transform-origin:126px 100px"><path d="M126 94 l1.8 3.8 3.8 1.8 -3.8 1.8 -1.8 3.8 -1.8 -3.8 -3.8 -1.8 3.8 -1.8z" fill="#F5C74E"/></g>`);

      // ── 놀람: 하찮게 작은 동그란 눈 + 조그만 입 + 식은땀 + 부들부들 ────
      case 'surprise': return wrap(`
        .${p}-body{animation:${p}-shake 0.45s ease-in-out infinite}
        .${p}-sweat{animation:${p}-drop 1.3s ease-in infinite}
        @keyframes ${p}-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
        @keyframes ${p}-drop{0%{transform:translateY(0);opacity:0}25%{opacity:1}85%{transform:translateY(10px);opacity:1}100%{transform:translateY(13px);opacity:0}}`,
        this._base(p, `
          <circle cx="52" cy="86" r="5" fill="#fff" stroke="#3F352A" stroke-width="2.6"/>
          <circle cx="52" cy="86" r="1.9" fill="#3F352A"/>
          <circle cx="88" cy="86" r="5" fill="#fff" stroke="#3F352A" stroke-width="2.6"/>
          <circle cx="88" cy="86" r="1.9" fill="#3F352A"/>
          <circle cx="70" cy="99" r="3.4" fill="#3F352A"/>`)
        + `<g class="${p}-sweat"><path d="M116 68 q3.6 5.5 0 8 q-3.6 -2.5 0 -8" fill="#A9CDEC"/></g>
           <text x="105" y="30" font-size="21" font-weight="900" fill="#E2794F" font-family="sans-serif" transform="rotate(8 105 30)">!?</text>`);

      // ── 공감: 지그시 감은 눈 + 하찮은 일자 입 + 끄덕끄덕 ───────────────
      case 'empathy': return wrap(`
        .${p}-body{animation:${p}-nod 1.5s ease-in-out infinite;transform-origin:70px 110px}
        @keyframes ${p}-nod{0%,100%{transform:rotate(0deg)}28%{transform:rotate(4deg)}56%{transform:rotate(-1.5deg)}}`,
        this._base(p, `
          <path d="M47 87 q5 3.5 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 87 q5 3.5 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M64 98 l12 0" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`));

      // ── 슬픔: >< 눈 + 엉엉 물결 입 + 양쪽 눈물 폭포 ────────────────────
      case 'sad': return wrap(`
        .${p}-body{animation:${p}-sob 0.6s ease-in-out infinite}
        .${p}-t1{animation:${p}-fall 1.1s ease-in infinite}
        .${p}-t2{animation:${p}-fall 1.1s ease-in 0.55s infinite}
        @keyframes ${p}-sob{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
        @keyframes ${p}-fall{0%{transform:translateY(0);opacity:0}20%{opacity:1}80%{transform:translateY(15px);opacity:1}100%{transform:translateY(19px);opacity:0}}`,
        this._base(p, `
          <path d="M47 83 l8 6 M55 83 l-8 6" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M85 83 l8 6 M93 83 l-8 6" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M56 99 q4 -4 7 0 q3 4 7 0 q3 -4 7 0 q3 4 7 0" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`)
        + `<g class="${p}-t1"><path d="M46 90 q4 6.5 0 9.5 q-4 -3 0 -9.5" fill="#A9CDEC"/></g>
           <g class="${p}-t2"><path d="M94 90 q4 6.5 0 9.5 q-4 -3 0 -9.5" fill="#A9CDEC"/></g>`);

      // ── 사랑: 점눈 + 배시시 + 몽글몽글 하트 ────────────────────────────
      case 'love': return wrap(`
        .${p}-body{animation:${p}-sway 1.8s ease-in-out infinite;transform-origin:70px 110px}
        .${p}-h1{animation:${p}-float 1.7s ease-out infinite}
        .${p}-h2{animation:${p}-float 1.7s ease-out 0.6s infinite}
        .${p}-h3{animation:${p}-float 1.7s ease-out 1.1s infinite}
        @keyframes ${p}-sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
        @keyframes ${p}-float{0%{transform:translateY(0) scale(0.6);opacity:0}30%{opacity:1}100%{transform:translateY(-20px) scale(1);opacity:0}}`,
        this._base(p, `
          <circle cx="52" cy="86" r="2.8" fill="#3F352A"/>
          <circle cx="88" cy="86" r="2.8" fill="#3F352A"/>
          <path d="M63 96 q7 6 14 0" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`)
        + `<g class="${p}-h1"><path d="M118 62 c-3 -4 -9 -1 -7 3 c1 3 4.5 4.5 7 7 c2.5 -2.5 6 -4 7 -7 c2 -4 -4 -7 -7 -3z" fill="#F2A0A9"/></g>
           <g class="${p}-h2"><path d="M20 72 c-2.5 -3.5 -8 -1 -6 2.6 c1 2.6 4 4 6 6 c2 -2 5 -3.4 6 -6 c1.7 -3.6 -3.5 -6.1 -6 -2.6z" fill="#F2A0A9"/></g>
           <g class="${p}-h3"><path d="M70 26 c-2.5 -3.5 -8 -1 -6 2.6 c1 2.6 4 4 6 6 c2 -2 5 -3.4 6 -6 c1.7 -3.6 -3.5 -6.1 -6 -2.6z" fill="#F6C4C9"/></g>`);

      // ── 응원: 비장한 점눈+눈썹 + 하찮은 팔 들기 + 별 ───────────────────
      case 'cheer': return wrap(`
        .${p}-body{animation:${p}-pump 0.75s ease-in-out infinite}
        .${p}-armR{animation:${p}-arm 0.75s ease-in-out infinite;transform-origin:112px 90px}
        .${p}-star{animation:${p}-spin 2.4s linear infinite;transform-origin:121px 30px}
        @keyframes ${p}-pump{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes ${p}-arm{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-24deg)}}
        @keyframes ${p}-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`,
        this._base(p, `
          <path d="M46 79 l10 3 M94 79 l-10 3" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="52" cy="88" r="2.8" fill="#3F352A"/>
          <circle cx="88" cy="88" r="2.8" fill="#3F352A"/>
          <path d="M61 97 q9 8 18 0 z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`, true)
        + `<g class="${p}-star"><path d="M121 22 l2.4 5 5 2.4 -5 2.4 -2.4 5 -2.4 -5 -5 -2.4 5 -2.4z" fill="#F5C74E"/></g>`);

      // ── 멍때림: 점눈 + 벌어진 콩입 + 둥둥 떠다니는 … ──────────────────
      case 'blank': return wrap(`
        .${p}-body{animation:${p}-drift 3.2s ease-in-out infinite;transform-origin:70px 110px}
        .${p}-dots{animation:${p}-fade 2.4s ease-in-out infinite}
        @keyframes ${p}-drift{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg)}}
        @keyframes ${p}-fade{0%,100%{opacity:0.25}50%{opacity:1}}`,
        this._base(p, `
          <circle cx="52" cy="86" r="2.8" fill="#3F352A"/>
          <circle cx="88" cy="86" r="2.8" fill="#3F352A"/>
          <ellipse cx="70" cy="98" rx="4" ry="5" fill="none" stroke="#3F352A" stroke-width="2.4"/>`)
        + `<g class="${p}-dots"><circle cx="108" cy="34" r="2.6" fill="#B7A38B"/><circle cx="117" cy="28" r="3" fill="#B7A38B"/><circle cx="127" cy="21" r="3.4" fill="#B7A38B"/></g>`);

      // ── 졸림: 감긴 눈 + 쿨쿨 zZ + 숨쉬기 ──────────────────────────────
      case 'sleepy': return wrap(`
        .${p}-body{animation:${p}-breathe 2.6s ease-in-out infinite;transform-origin:70px 120px}
        .${p}-z1{animation:${p}-zz 2.2s ease-out infinite}
        .${p}-z2{animation:${p}-zz 2.2s ease-out 1.1s infinite}
        @keyframes ${p}-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03, 0.97)}}
        @keyframes ${p}-zz{0%{transform:translate(0,0) scale(0.6);opacity:0}30%{opacity:1}100%{transform:translate(10px,-18px) scale(1.1);opacity:0}}`,
        this._base(p, `
          <path d="M47 87 q5 2.5 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 87 q5 2.5 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="70" cy="99" rx="3" ry="3.6" fill="none" stroke="#3F352A" stroke-width="2.2"/>`)
        + `<g class="${p}-z1"><text x="104" y="36" font-size="17" font-weight="800" fill="#9BB3C6" font-family="sans-serif">z</text></g>
           <g class="${p}-z2"><text x="114" y="26" font-size="22" font-weight="800" fill="#9BB3C6" font-family="sans-serif">Z</text></g>`);

      // ── 뿌듯: 으쓱 눈웃음 + 앙다문 미소 + 가슴 펴기 + 반짝 ─────────────
      case 'proud': return wrap(`
        .${p}-body{animation:${p}-puff 1.6s ease-in-out infinite;transform-origin:70px 120px}
        .${p}-sp{animation:${p}-tw 1.3s ease-in-out infinite}
        .${p}-sp2{animation:${p}-tw 1.3s ease-in-out 0.65s infinite}
        @keyframes ${p}-puff{0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.04, 1.02) rotate(-1.5deg)}}
        @keyframes ${p}-tw{0%,100%{opacity:0;transform:scale(0.5)}50%{opacity:1;transform:scale(1)}}`,
        this._base(p, `
          <path d="M48 85 q4.5 -4.5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 85 q4.5 -4.5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M62 97 q8 5.5 16 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M66 103 q4 2 8 0" fill="none" stroke="#3F352A" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>`)
        + `<g class="${p}-sp" style="transform-origin:22px 30px"><path d="M22 23 l2.2 4.6 4.6 2.2 -4.6 2.2 -2.2 4.6 -2.2 -4.6 -4.6 -2.2 4.6 -2.2z" fill="#F5C74E"/></g>
           <g class="${p}-sp2" style="transform-origin:124px 58px"><path d="M124 52 l1.8 3.8 3.8 1.8 -3.8 1.8 -1.8 3.8 -1.8 -3.8 -3.8 -1.8 3.8 -1.8z" fill="#F5C74E"/></g>`);

      // ── 골똘: 위를 흘겨보는 점눈 + 오므린 입 + 둥둥 물음표 ─────────────
      case 'think': return wrap(`
        .${p}-body{animation:${p}-tilt 2.6s ease-in-out infinite;transform-origin:70px 115px}
        .${p}-q1{animation:${p}-pop 2s ease-out infinite}
        .${p}-q2{animation:${p}-pop 2s ease-out 1s infinite}
        @keyframes ${p}-tilt{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(1.5deg)}}
        @keyframes ${p}-pop{0%{transform:translateY(0) scale(0.6);opacity:0}30%{opacity:1}100%{transform:translateY(-14px) scale(1.05);opacity:0}}`,
        this._base(p, `
          <circle cx="50" cy="84" r="2.8" fill="#3F352A"/>
          <circle cx="86" cy="84" r="2.8" fill="#3F352A"/>
          <ellipse cx="70" cy="99" rx="3" ry="2.4" fill="none" stroke="#3F352A" stroke-width="2.4"/>
          <path d="M44 77 q4 -3 8 -1 M80 77 q4 -3 8 -1" fill="none" stroke="#3F352A" stroke-width="2" stroke-linecap="round" opacity="0.55"/>`)
        + `<g class="${p}-q1"><text x="104" y="34" font-size="20" font-weight="900" fill="#B7A38B" font-family="sans-serif" transform="rotate(10 104 34)">?</text></g>
           <g class="${p}-q2"><text x="118" y="46" font-size="15" font-weight="900" fill="#CBB89D" font-family="sans-serif" transform="rotate(-8 118 46)">?</text></g>`);

      // ── 탐정: 사냥모자 + 돋보기 든 팔 + 예리한(하찮은) 눈 ──────────────
      case 'detective': return wrap(`
        .${p}-body{animation:${p}-sniff 1.4s ease-in-out infinite}
        .${p}-armR{animation:${p}-scan 2.2s ease-in-out infinite;transform-origin:112px 90px}
        @keyframes ${p}-sniff{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes ${p}-scan{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-14deg)}}`,
        this._base(p, `
          <path d="M45 80 l11 2 M95 80 l-11 2" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="52" cy="88" r="2.6" fill="#3F352A"/>
          <circle cx="87" cy="88" r="2.6" fill="#3F352A"/>
          <path d="M64 99 q6 3.5 12 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>
          <!-- 사냥모자 (하찮게 작음) -->
          <path d="M46 58 q24 -14 48 -1 q-2 -8 -10 -11 q3 -4 1 -7 q-15 -6 -30 0 q-2 3 1 7 q-8 3 -10 12z" fill="#C9A876" stroke="#8A6F55" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M58 47 q12 -4 24 0" fill="none" stroke="#8A6F55" stroke-width="1.8" opacity="0.6"/>`, true)
        + `<!-- 돋보기 -->
           <g class="${p}-armR" style="transform-origin:112px 90px">
             <line x1="116" y1="84" x2="124" y2="72" stroke="#8A6F55" stroke-width="4" stroke-linecap="round"/>
             <circle cx="129" cy="63" r="11" fill="rgba(190,220,240,0.35)" stroke="#8A6F55" stroke-width="3.2"/>
             <path d="M124 58 q3 -3 7 -1" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
           </g>`);

      // ── 선생님: 동그란 안경 + 지시봉 + 또랑또랑 설명 입 ────────────────
      case 'teacher': return wrap(`
        .${p}-body{animation:${p}-talk 1.1s ease-in-out infinite;transform-origin:70px 118px}
        .${p}-armR{animation:${p}-point 1.6s ease-in-out infinite;transform-origin:112px 90px}
        @keyframes ${p}-talk{0%,100%{transform:rotate(0deg)}50%{transform:rotate(1.5deg)}}
        @keyframes ${p}-point{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-10deg)}}`,
        this._base(p, `
          <!-- 동그란 안경 -->
          <circle cx="52" cy="86" r="8.5" fill="rgba(255,255,255,0.5)" stroke="#8A6F55" stroke-width="2.4"/>
          <circle cx="88" cy="86" r="8.5" fill="rgba(255,255,255,0.5)" stroke="#8A6F55" stroke-width="2.4"/>
          <line x1="60.5" y1="86" x2="79.5" y2="86" stroke="#8A6F55" stroke-width="2.4"/>
          <circle cx="52" cy="86" r="2.4" fill="#3F352A"/>
          <circle cx="88" cy="86" r="2.4" fill="#3F352A"/>
          <ellipse cx="70" cy="100" rx="4.5" ry="3.6" fill="#C97B72" stroke="#3F352A" stroke-width="2.2"/>`, true)
        + `<!-- 지시봉 -->
           <g class="${p}-armR" style="transform-origin:112px 90px">
             <line x1="116" y1="82" x2="132" y2="52" stroke="#B07C4F" stroke-width="4" stroke-linecap="round"/>
             <circle cx="132" cy="52" r="3" fill="#E2794F"/>
           </g>`);

      // ── 깨달음: 반짝 뜬 눈 + 아! 입 + 머리 위 전구 ─────────────────────
      case 'aha': return wrap(`
        .${p}-body{animation:${p}-jump 1.3s ease-in-out infinite}
        .${p}-bulb{animation:${p}-glow 1.3s ease-in-out infinite;transform-origin:70px 26px}
        @keyframes ${p}-jump{0%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}55%{transform:translateY(0)}}
        @keyframes ${p}-glow{0%,100%{transform:scale(1);opacity:0.85}30%{transform:scale(1.18);opacity:1}}`,
        this._base(p, `
          <circle cx="52" cy="86" r="4.6" fill="#fff" stroke="#3F352A" stroke-width="2.4"/>
          <circle cx="53" cy="85" r="2" fill="#3F352A"/>
          <circle cx="88" cy="86" r="4.6" fill="#fff" stroke="#3F352A" stroke-width="2.4"/>
          <circle cx="89" cy="85" r="2" fill="#3F352A"/>
          <ellipse cx="70" cy="100" rx="4.6" ry="5.4" fill="#C97B72" stroke="#3F352A" stroke-width="2.4"/>`)
        + `<g class="${p}-bulb">
             <circle cx="70" cy="22" r="9" fill="#FBE59B" stroke="#D9A93C" stroke-width="2.6"/>
             <path d="M66 31 h8 M67 35 h6" stroke="#D9A93C" stroke-width="2.2" stroke-linecap="round"/>
             <path d="M56 10 l4 4 M84 10 l-4 4 M70 4 v6" stroke="#F5C74E" stroke-width="2.6" stroke-linecap="round"/>
           </g>`);

      // ── 머쓱: 뱅글 눈 + 물결 입 + 큰 식은땀 + 발그레 ───────────────────
      case 'oops': return wrap(`
        .${p}-body{animation:${p}-wob 0.9s ease-in-out infinite;transform-origin:70px 115px}
        .${p}-sweat{animation:${p}-drip 1.5s ease-in infinite}
        @keyframes ${p}-wob{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}
        @keyframes ${p}-drip{0%{transform:translateY(0);opacity:0}25%{opacity:1}85%{transform:translateY(11px);opacity:1}100%{transform:translateY(14px);opacity:0}}`,
        this._base(p, `
          <path d="M47 83 q5 5 10 0 q-5 -5 -10 0" fill="none" stroke="#3F352A" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M83 83 q5 5 10 0 q-5 -5 -10 0" fill="none" stroke="#3F352A" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M58 99 q4 -3.5 8 0 q4 3.5 8 0 q4 -3.5 8 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="42" cy="96" r="9.5" fill="#F9BCA4" opacity="0.95"/>
          <circle cx="98" cy="96" r="9.5" fill="#F9BCA4" opacity="0.95"/>`)
        + `<g class="${p}-sweat"><path d="M114 62 q4.5 7 0 10 q-4.5 -3 0 -10" fill="#A9CDEC"/></g>
           <g class="${p}-sweat" style="animation-delay:0.6s"><path d="M26 70 q3.6 5.5 0 8 q-3.6 -2.5 0 -8" fill="#A9CDEC"/></g>`);

      // ── 분노: 부들부들 + 뿔김 + 꾹 다문 이빨 ──────────────────────────
      case 'rage': return wrap(`
        .${p}-body{animation:${p}-tremble 0.18s linear infinite}
        .${p}-st1{animation:${p}-puff 1s ease-out infinite}
        .${p}-st2{animation:${p}-puff 1s ease-out 0.5s infinite}
        @keyframes ${p}-tremble{0%,100%{transform:translate(0,0)}25%{transform:translate(-1.5px,0.5px)}75%{transform:translate(1.5px,-0.5px)}}
        @keyframes ${p}-puff{0%{transform:translateY(0) scale(0.5);opacity:0}30%{opacity:1}100%{transform:translateY(-14px) scale(1.2);opacity:0}}`,
        this._base(p, `
          <path d="M44 78 l12 5 M96 78 l-12 5" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <circle cx="52" cy="88" r="2.8" fill="#3F352A"/>
          <circle cx="88" cy="88" r="2.8" fill="#3F352A"/>
          <path d="M60 100 h20 M64 97 v6 M70 97 v6 M76 97 v6" stroke="#3F352A" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M30 74 l6 3 M28 82 l7 1" stroke="#E2794F" stroke-width="2.4" stroke-linecap="round"/>`)
        + `<g class="${p}-st1"><path d="M24 58 q4 -6 0 -10 q6 2 4 8 q-1 3 -4 2z" fill="#E2794F" opacity="0.85"/></g>
           <g class="${p}-st2"><path d="M120 66 q4 -6 0 -10 q6 2 4 8 q-1 3 -4 2z" fill="#E2794F" opacity="0.85"/></g>`);

      // ── 대성통곡: 눈물 분수 양쪽 발사 + 크게 벌린 입 ──────────────────
      case 'bigcry': return wrap(`
        .${p}-body{animation:${p}-heave 0.5s ease-in-out infinite}
        .${p}-f1{animation:${p}-spray 0.8s ease-out infinite}
        .${p}-f2{animation:${p}-spray 0.8s ease-out 0.4s infinite}
        @keyframes ${p}-heave{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(2.5px) scale(1.015,0.985)}}
        @keyframes ${p}-spray{0%{transform:translate(0,0) scale(0.5);opacity:0}25%{opacity:1}100%{transform:translate(var(--dx,-14px),-4px) scale(1.15);opacity:0}}`,
        this._base(p, `
          <path d="M46 84 q6 4 12 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M82 84 q6 4 12 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M58 96 q12 12 24 0 q-12 6 -24 0z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`)
        + `<g class="${p}-f1" style="--dx:-16px"><path d="M45 83 q-7 2 -9 8 q6 2 9 -3z" fill="#A9CDEC"/></g>
           <g class="${p}-f2" style="--dx:16px"><path d="M95 83 q7 2 9 8 q-6 2 -9 -3z" fill="#A9CDEC"/></g>`);

      // ── 폭소: >< 눈 + 데굴데굴 구르는 몸 + ㅋㅋㅋ ─────────────────────
      case 'laugh': return wrap(`
        .${p}-body{animation:${p}-roll 1.4s ease-in-out infinite;transform-origin:70px 110px}
        .${p}-k{animation:${p}-kk 1.4s ease-in-out infinite}
        @keyframes ${p}-roll{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
        @keyframes ${p}-kk{0%,100%{opacity:0.4;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}`,
        this._base(p, `
          <path d="M46 83 l9 5 -9 5" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M94 83 l-9 5 9 5" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M56 95 q14 14 28 0 q-14 7 -28 0z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`)
        + `<g class="${p}-k"><text x="100" y="34" font-size="16" font-weight="900" fill="#B7A38B" font-family="sans-serif" transform="rotate(12 100 34)">ㅋㅋ</text>
           <text x="16" y="46" font-size="13" font-weight="900" fill="#CBB89D" font-family="sans-serif" transform="rotate(-10 16 46)">ㅋ</text></g>`);

      // ── 어지러움: @@ 뱅글 눈 + 물결 입 + 별이 도는 ─────────────────────
      case 'dizzy': return wrap(`
        .${p}-body{animation:${p}-sway 1.6s ease-in-out infinite;transform-origin:70px 118px}
        .${p}-orbit{animation:${p}-spin 2.4s linear infinite;transform-origin:70px 30px}
        @keyframes ${p}-sway{0%,100%{transform:rotate(-3.5deg)}50%{transform:rotate(3.5deg)}}
        @keyframes ${p}-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`,
        this._base(p, `
          <path d="M46 86 a6 6 0 1 1 6 6 a3.5 3.5 0 1 0 -3.5 -3.5" fill="none" stroke="#3F352A" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M82 86 a6 6 0 1 1 6 6 a3.5 3.5 0 1 0 -3.5 -3.5" fill="none" stroke="#3F352A" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M60 101 q5 -4 10 0 q5 4 10 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<g class="${p}-orbit">
             <path d="M46 26 l1.8 3.8 3.8 1.8 -3.8 1.8 -1.8 3.8 -1.8 -3.8 -3.8 -1.8 3.8 -1.8z" fill="#F5C74E"/>
             <circle cx="94" cy="30" r="2.6" fill="#F5C74E"/>
           </g>`);

      // ── 배고픔: 초점 잃은 눈 + 침 + 꼬르륵 ────────────────────────────
      case 'hungry': return wrap(`
        .${p}-body{animation:${p}-slump 2s ease-in-out infinite}
        .${p}-drool{animation:${p}-drip 1.6s ease-in infinite}
        .${p}-rumble{animation:${p}-rr 1.2s ease-in-out infinite}
        @keyframes ${p}-slump{0%,100%{transform:translateY(0)}50%{transform:translateY(2.5px)}}
        @keyframes ${p}-drip{0%,100%{transform:scaleY(0.9)}50%{transform:scaleY(1.15)}}
        @keyframes ${p}-rr{0%,100%{opacity:0.3}50%{opacity:1}}`,
        this._base(p, `
          <circle cx="52" cy="86" r="2.6" fill="#3F352A" opacity="0.75"/>
          <circle cx="88" cy="86" r="2.6" fill="#3F352A" opacity="0.75"/>
          <ellipse cx="70" cy="100" rx="5" ry="4" fill="none" stroke="#3F352A" stroke-width="2.4"/>`)
        + `<g class="${p}-drool" style="transform-origin:78px 102px"><path d="M76 100 q4 7 1 11 q-4 -2 -1 -11" fill="#A9CDEC"/></g>
           <g class="${p}-rumble"><text x="12" y="112" font-size="13" font-weight="900" fill="#B7A38B" font-family="sans-serif" transform="rotate(-14 12 112)">꼬르륵…</text></g>`);

      // ── 질주: 몸 기울여 전력달리기 + 스피드라인 + 땀 ──────────────────
      case 'run': return wrap(`
        .${p}-all{animation:${p}-dash 0.5s ease-in-out infinite;transform-origin:70px 110px}
        @keyframes ${p}-dash{0%,100%{transform:rotate(8deg) translateY(0)}50%{transform:rotate(8deg) translateY(-4px)}}`,
        `<g class="${p}-all">` + this._base(p, `
          <path d="M46 82 l10 3 M94 82 l-10 3" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="52" cy="90" r="2.8" fill="#3F352A"/>
          <circle cx="88" cy="90" r="2.8" fill="#3F352A"/>
          <ellipse cx="70" cy="101" rx="4.5" ry="3.6" fill="#C97B72" stroke="#3F352A" stroke-width="2.2"/>`) + '</g>'
        + `<path d="M8 78 h18 M4 92 h14 M10 106 h16" stroke="#B7A38B" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
           <path d="M116 60 q3.6 5.5 0 8 q-3.6 -2.5 0 -8" fill="#A9CDEC"/>`);

      // ── 숨기: 껍질 속으로 쏙 — 빼꼼 눈만 (우렁이의 정체성 포즈) ────────
      case 'hide': return wrap(`
        .${p}-sh{animation:${p}-wob 2.2s ease-in-out infinite;transform-origin:70px 100px}
        .${p}-eyes{animation:${p}-blink 3.2s ease-in-out infinite}
        @keyframes ${p}-wob{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
        @keyframes ${p}-blink{0%,88%,100%{opacity:1}92%,96%{opacity:0}}`,
        `<g class="${p}-sh">
          <circle cx="70" cy="82" r="38" fill="#BBD7C0" stroke="#7FA78C" stroke-width="3.6"/>
          <path d="M70 82 m0 -24 a24 24 0 1 1 -24 24 a17 17 0 1 0 17 -17 a11 11 0 1 1 -11 11" fill="none" stroke="#7FA78C" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M42 116 q4 6 10 1 M86 117 q4 6 10 0" fill="none" stroke="#8A6F55" stroke-width="3" stroke-linecap="round"/>
          <g class="${p}-eyes">
            <ellipse cx="58" cy="112" rx="9" ry="7" fill="${this._skin().body}" stroke="${this._skin().line}" stroke-width="2.4"/>
            <ellipse cx="82" cy="112" rx="9" ry="7" fill="${this._skin().body}" stroke="${this._skin().line}" stroke-width="2.4"/>
            <circle cx="58" cy="112" r="2.4" fill="#3F352A"/>
            <circle cx="82" cy="112" r="2.4" fill="#3F352A"/>
          </g>
        </g>
        <text x="98" y="40" font-size="15" font-weight="800" fill="#B7A38B" font-family="sans-serif" transform="rotate(10 98 40)">…</text>`);

      // ── 기절: XX 눈 + 영혼이 빠져나감 ─────────────────────────────────
      case 'faint': return wrap(`
        .${p}-body{animation:${p}-flat 3s ease-in-out infinite}
        .${p}-soul{animation:${p}-float 2.4s ease-out infinite}
        @keyframes ${p}-flat{0%,100%{transform:translateY(0)}50%{transform:translateY(1.5px)}}
        @keyframes ${p}-float{0%{transform:translateY(0);opacity:0}30%{opacity:0.9}100%{transform:translateY(-16px);opacity:0}}`,
        this._base(p, `
          <path d="M47 82 l10 8 M57 82 l-10 8" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M83 82 l10 8 M93 82 l-10 8" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M62 101 q8 -5 16 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<g class="${p}-soul"><path d="M104 40 q6 -8 12 0 q0 8 -6 8 q-6 0 -6 -8z M104 48 l-2 5 M110 48 l0 6 M116 48 l2 5" fill="#EAF2F8" stroke="#B9CBD8" stroke-width="1.8" opacity="0.9"/></g>`);

      // ── 반짝: ✦✦ 눈 + 헤벌쭉 기대 ────────────────────────────────────
      case 'stareyes': return wrap(`
        .${p}-body{animation:${p}-bounce 0.8s ease-in-out infinite}
        .${p}-eye{animation:${p}-tw 1s ease-in-out infinite;transform-origin:center}
        @keyframes ${p}-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes ${p}-tw{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}`,
        this._base(p, `
          <g class="${p}-eye" style="transform-origin:52px 86px"><path d="M52 78 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z" fill="#F5C74E" stroke="#D9A93C" stroke-width="1.4"/></g>
          <g class="${p}-eye" style="transform-origin:88px 86px"><path d="M88 78 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z" fill="#F5C74E" stroke="#D9A93C" stroke-width="1.4"/></g>
          <path d="M62 99 q8 7 16 0" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`));

      // ── 거부: 도리도리 + 팔로 X ───────────────────────────────────────
      case 'no': return wrap(`
        .${p}-body{animation:${p}-shakeX 0.6s ease-in-out infinite}
        @keyframes ${p}-shakeX{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}`,
        this._base(p, `
          <path d="M47 87 q5 -3 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 87 q5 -3 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M64 100 l12 0" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`)
        + `<g opacity="0.95"><path d="M18 30 l16 16 M34 30 l-16 16" stroke="#E2794F" stroke-width="5" stroke-linecap="round"/></g>`);

      // ── 최고: 팔 번쩍 + 큰 동그라미 ───────────────────────────────────
      case 'ok': return wrap(`
        .${p}-body{animation:${p}-hop 0.8s ease-in-out infinite}
        .${p}-ring{animation:${p}-pop 1.4s ease-out infinite;transform-origin:112px 34px}
        @keyframes ${p}-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}
        @keyframes ${p}-pop{0%{transform:scale(0.7);opacity:0}30%{opacity:1}70%{transform:scale(1.05);opacity:1}100%{transform:scale(1.1);opacity:0}}`,
        this._base(p, `
          <path d="M48 85 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M83 85 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M61 96 q9 8 18 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>`, true)
        + `<g class="${p}-ring"><circle cx="112" cy="34" r="13" fill="none" stroke="#5fa986" stroke-width="4.6"/></g>`);

      // ── 삐짐: 볼 빵빵 + 고개 홱 돌림 + 콧김 ───────────────────────────
      case 'hmph': return wrap(`
        .${p}-body{animation:${p}-turn 2.6s ease-in-out infinite;transform-origin:70px 110px}
        .${p}-puffA{animation:${p}-pf 1.3s ease-out infinite}
        @keyframes ${p}-turn{0%,100%{transform:rotate(-4deg)}20%,80%{transform:rotate(-4deg)}50%{transform:rotate(2deg)}}
        @keyframes ${p}-pf{0%{transform:translateX(0);opacity:0}30%{opacity:1}100%{transform:translateX(-10px);opacity:0}}`,
        this._base(p, `
          <path d="M46 84 q5 -2 10 1" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M84 85 q5 -3 10 -1" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <circle cx="52" cy="90" r="2.4" fill="#3F352A"/>
          <circle cx="88" cy="89" r="2.4" fill="#3F352A"/>
          <path d="M62 102 q4 -3 9 -1" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="42" cy="97" r="9.5" fill="${this._skin().cheek}" opacity="0.95"/>
          <circle cx="98" cy="96" r="9.5" fill="${this._skin().cheek}" opacity="0.95"/>`)
        + `<g class="${p}-puffA"><path d="M26 84 q-6 -1 -8 3 q5 3 8 0z" fill="#D8CDBD" opacity="0.9"/></g>`);

      // ── 혼비백산: 팔 마구 휘젓기 + !!! + 몸 들썩 ──────────────────────
      case 'panic': return wrap(`
        .${p}-body{animation:${p}-jitter 0.28s linear infinite}
        .${p}-armL{animation:${p}-flailL 0.4s ease-in-out infinite;transform-origin:27px 95px}
        .${p}-armR{animation:${p}-flailR 0.4s ease-in-out 0.2s infinite;transform-origin:113px 95px}
        @keyframes ${p}-jitter{0%,100%{transform:translate(0,0)}50%{transform:translate(0,-3px)}}
        @keyframes ${p}-flailL{0%,100%{transform:rotate(0)}50%{transform:rotate(-38deg)}}
        @keyframes ${p}-flailR{0%,100%{transform:rotate(0)}50%{transform:rotate(38deg)}}`,
        this._base(p, `
          <circle cx="52" cy="85" r="5.2" fill="#fff" stroke="#3F352A" stroke-width="2.6"/>
          <circle cx="51" cy="85" r="1.8" fill="#3F352A"/>
          <circle cx="88" cy="85" r="5.2" fill="#fff" stroke="#3F352A" stroke-width="2.6"/>
          <circle cx="87" cy="85" r="1.8" fill="#3F352A"/>
          <path d="M58 97 q12 11 24 0 q-12 5 -24 0z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`)
        + `<text x="100" y="28" font-size="22" font-weight="900" fill="#E2794F" font-family="sans-serif" transform="rotate(10 100 28)">!!!</text>
           <path d="M22 60 q3.6 5.5 0 8 q-3.6 -2.5 0 -8" fill="#A9CDEC"/>`);

      // ── 추움: 덜덜 + 파란 기 + 눈송이 ─────────────────────────────────
      case 'cold': return wrap(`
        .${p}-body{animation:${p}-shiver 0.16s linear infinite}
        .${p}-sf1{animation:${p}-fall 2.4s linear infinite}
        .${p}-sf2{animation:${p}-fall 2.4s linear 1.2s infinite}
        @keyframes ${p}-shiver{0%,100%{transform:translateX(0)}50%{transform:translateX(2px)}}
        @keyframes ${p}-fall{0%{transform:translateY(-6px) rotate(0);opacity:0}20%{opacity:1}100%{transform:translateY(26px) rotate(180deg);opacity:0}}`,
        this._base(p, `
          <path d="M47 86 q5 2 10 0 M83 86 q5 2 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M60 100 q2.5 -3 5 0 q2.5 3 5 0 q2.5 -3 5 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>
          <path d="M40 74 q30 -8 60 0" fill="none" stroke="#9BB3C6" stroke-width="3" opacity="0.55" stroke-linecap="round"/>`)
        + `<g class="${p}-sf1"><path d="M30 32 v10 M25 37 h10 M26.5 33.5 l7 7 M33.5 33.5 l-7 7" stroke="#A9CDEC" stroke-width="1.8" stroke-linecap="round"/></g>
           <g class="${p}-sf2"><path d="M112 28 v8 M108 32 h8 M109 29 l6 6 M115 29 l-6 6" stroke="#A9CDEC" stroke-width="1.6" stroke-linecap="round"/></g>`);

      // ── 더움: 새빨간 볼 + 땀 뻘뻘 + 아지랑이 ──────────────────────────
      case 'hot': return wrap(`
        .${p}-body{animation:${p}-pant 0.7s ease-in-out infinite}
        .${p}-sw1{animation:${p}-dripS 1.2s ease-in infinite}
        .${p}-sw2{animation:${p}-dripS 1.2s ease-in 0.6s infinite}
        .${p}-heat{animation:${p}-waver 1.6s ease-in-out infinite}
        @keyframes ${p}-pant{0%,100%{transform:scale(1)}50%{transform:scale(1.02,0.98)}}
        @keyframes ${p}-dripS{0%{transform:translateY(0);opacity:0}25%{opacity:1}90%{transform:translateY(12px);opacity:1}100%{transform:translateY(14px);opacity:0}}
        @keyframes ${p}-waver{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}`,
        this._base(p, `
          <path d="M47 87 q5 2.5 10 0 M83 87 q5 2.5 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="70" cy="100" rx="4.5" ry="5.2" fill="#C97B72" stroke="#3F352A" stroke-width="2.2"/>
          <circle cx="42" cy="96" r="10" fill="#F49B86" opacity="0.95"/>
          <circle cx="98" cy="96" r="10" fill="#F49B86" opacity="0.95"/>`)
        + `<g class="${p}-sw1"><path d="M108 64 q4 6 0 9 q-4 -3 0 -9" fill="#A9CDEC"/></g>
           <g class="${p}-sw2"><path d="M32 68 q3.6 5.5 0 8 q-3.6 -2.5 0 -8" fill="#A9CDEC"/></g>
           <g class="${p}-heat"><path d="M116 30 q4 -5 0 -10 M124 34 q4 -5 0 -10" fill="none" stroke="#E2A24F" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/></g>`);

      // ── 노래: 흥얼흥얼 + 음표 퐁퐁 ────────────────────────────────────
      case 'sing': return wrap(`
        .${p}-body{animation:${p}-groove 1.2s ease-in-out infinite;transform-origin:70px 118px}
        .${p}-n1{animation:${p}-note 1.6s ease-out infinite}
        .${p}-n2{animation:${p}-note 1.6s ease-out 0.8s infinite}
        @keyframes ${p}-groove{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
        @keyframes ${p}-note{0%{transform:translate(0,0) scale(0.6);opacity:0}30%{opacity:1}100%{transform:translate(8px,-20px) scale(1.1);opacity:0}}`,
        this._base(p, `
          <path d="M48 85 q4.5 -4.5 9 0 M83 85 q4.5 -4.5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="70" cy="100" rx="5.5" ry="6.5" fill="#C97B72" stroke="#3F352A" stroke-width="2.4"/>`)
        + `<g class="${p}-n1"><path d="M108 44 v-12 l8 -2 v12 M108 44 a3 3 0 1 1 -3 -3 M116 42 a3 3 0 1 1 -3 -3" fill="none" stroke="#8FA8B8" stroke-width="2.4" stroke-linecap="round"/></g>
           <g class="${p}-n2"><path d="M26 56 v-10 M26 56 a2.6 2.6 0 1 1 -2.6 -2.6" fill="none" stroke="#B7A38B" stroke-width="2.4" stroke-linecap="round"/></g>`);

      // ── 춤: 좌우 크게 덩실덩실 + 반짝 ─────────────────────────────────
      case 'dance': return wrap(`
        .${p}-body{animation:${p}-boogie 0.9s ease-in-out infinite;transform-origin:70px 120px}
        .${p}-armL{animation:${p}-wave 0.9s ease-in-out infinite;transform-origin:27px 95px}
        .${p}-armR{animation:${p}-wave 0.9s ease-in-out 0.45s infinite;transform-origin:113px 92px}
        @keyframes ${p}-boogie{0%,100%{transform:rotate(-6deg) translateY(0)}50%{transform:rotate(6deg) translateY(-4px)}}
        @keyframes ${p}-wave{0%,100%{transform:rotate(0)}50%{transform:rotate(-30deg)}}`,
        this._base(p, `
          <path d="M48 85 q4.5 -5 9 0 M83 85 q4.5 -5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M61 96 q9 8 18 0 z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>`, true)
        + `<path d="M20 34 l2.2 4.6 4.6 2.2 -4.6 2.2 -2.2 4.6 -2.2 -4.6 -4.6 -2.2 4.6 -2.2z" fill="#F5C74E"/>
           <circle cx="122" cy="112" r="3" fill="#F2A0A9"/>`);

      // ── 필기: 연필 들고 열공 + 메모지 ─────────────────────────────────
      case 'write': return wrap(`
        .${p}-armR{animation:${p}-scrib 0.5s ease-in-out infinite;transform-origin:113px 95px}
        @keyframes ${p}-scrib{0%,100%{transform:translateX(0)}50%{transform:translateX(-3px)}}`,
        this._base(p, `
          <path d="M46 82 l10 2 M94 82 l-10 2" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="52" cy="89" r="2.6" fill="#3F352A"/>
          <circle cx="88" cy="89" r="2.6" fill="#3F352A"/>
          <path d="M65 100 q5 2.5 10 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<g class="${p}-armR">
             <rect x="112" y="66" width="7" height="26" rx="2.5" transform="rotate(35 115 79)" fill="#E8B04B" stroke="#B8813C" stroke-width="2"/>
             <path d="M126 92 l6 7 -9 -2z" fill="#8A6F55"/>
           </g>
           <rect x="8" y="96" width="26" height="20" rx="3" fill="#FFFDF6" stroke="#CBB89D" stroke-width="2" transform="rotate(-8 21 106)"/>
           <path d="M13 102 h15 M13 107 h12" stroke="#CBB89D" stroke-width="1.6" transform="rotate(-8 21 106)"/>`);

      // ── 히어로: 펄럭이는 망토 + 비장한 눈 ─────────────────────────────
      case 'hero': return wrap(`
        .${p}-body{animation:${p}-stand 2s ease-in-out infinite}
        .${p}-cape{animation:${p}-flap 1.1s ease-in-out infinite;transform-origin:70px 60px}
        @keyframes ${p}-stand{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes ${p}-flap{0%,100%{transform:skewX(0deg)}50%{transform:skewX(-6deg)}}`,
        `<g class="${p}-cape"><path d="M34 58 q-16 30 -8 58 q12 -6 18 -16 q2 12 12 18 q-2 -14 2 -22 l-8 -34z" fill="#E2794F" stroke="#B85C36" stroke-width="2.6" stroke-linejoin="round" opacity="0.95"/></g>`
        + this._base(p, `
          <path d="M45 80 l11 3 M95 80 l-11 3" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <circle cx="52" cy="88" r="2.8" fill="#3F352A"/>
          <circle cx="88" cy="88" r="2.8" fill="#3F352A"/>
          <path d="M62 99 q8 5 16 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>`, true)
        + `<path d="M18 30 l2.4 5 5 2.4 -5 2.4 -2.4 5 -2.4 -5 -5 -2.4 5 -2.4z" fill="#F5C74E"/>`);

      // ── 선물: 리본 상자 내밀기 ────────────────────────────────────────
      case 'gift': return wrap(`
        .${p}-body{animation:${p}-offer 1.6s ease-in-out infinite}
        .${p}-box{animation:${p}-lift 1.6s ease-in-out infinite}
        @keyframes ${p}-offer{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes ${p}-lift{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-4px) rotate(3deg)}}`,
        this._base(p, `
          <path d="M48 85 q4.5 -4.5 9 0 M83 85 q4.5 -4.5 9 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M62 97 q8 6 16 0" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>`)
        + `<g class="${p}-box" style="transform-origin:118px 92px">
             <rect x="104" y="80" width="26" height="22" rx="4" fill="#F2A0A9" stroke="#C97B85" stroke-width="2.6"/>
             <path d="M104 90 h26 M117 80 v22" stroke="#C97B85" stroke-width="2.4"/>
             <path d="M112 78 q5 -8 5 0 q0 -8 6 0" fill="none" stroke="#C97B85" stroke-width="2.6" stroke-linecap="round"/>
           </g>`);

      // ── 티타임: 김 나는 찻잔 + 흡족한 눈 ──────────────────────────────
      case 'tea': return wrap(`
        .${p}-body{animation:${p}-sip 2.4s ease-in-out infinite}
        .${p}-steam1{animation:${p}-rise 2s ease-out infinite}
        .${p}-steam2{animation:${p}-rise 2s ease-out 1s infinite}
        @keyframes ${p}-sip{0%,100%{transform:translateY(0)}50%{transform:translateY(1.5px)}}
        @keyframes ${p}-rise{0%{transform:translateY(0);opacity:0}30%{opacity:0.9}100%{transform:translateY(-14px);opacity:0}}`,
        this._base(p, `
          <path d="M47 87 q5 2.5 10 0 M83 87 q5 2.5 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M64 99 q6 4 12 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<g>
             <path d="M103 88 h26 l-3 16 q-1 5 -6 5 h-8 q-5 0 -6 -5z" fill="#FDF6EC" stroke="#B79B7C" stroke-width="2.6"/>
             <path d="M129 92 q8 1 6 8 q-2 6 -8 4" fill="none" stroke="#B79B7C" stroke-width="2.4"/>
             <g class="${p}-steam1"><path d="M111 80 q3 -5 0 -9" fill="none" stroke="#CBB89D" stroke-width="2.2" stroke-linecap="round"/></g>
             <g class="${p}-steam2"><path d="M120 80 q3 -5 0 -9" fill="none" stroke="#CBB89D" stroke-width="2.2" stroke-linecap="round"/></g>
           </g>`);

      // ── 운동: 하찮은 아령 들기 + 이 악묾 + 땀 ─────────────────────────
      case 'muscle': return wrap(`
        .${p}-armR{animation:${p}-liftW 1s ease-in-out infinite;transform-origin:113px 92px}
        .${p}-sw{animation:${p}-dripM 1.4s ease-in infinite}
        @keyframes ${p}-liftW{0%,100%{transform:rotate(0)}50%{transform:rotate(-22deg)}}
        @keyframes ${p}-dripM{0%{transform:translateY(0);opacity:0}25%{opacity:1}90%{transform:translateY(10px);opacity:1}100%{opacity:0}}`,
        this._base(p, `
          <path d="M46 80 l10 4 M94 80 l-10 4" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M47 88 q5 -2 10 0 M83 88 q5 -2 10 0" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M62 100 h16 M66 97 v6 M74 97 v6" stroke="#3F352A" stroke-width="2.2" stroke-linecap="round"/>`, true)
        + `<g class="${p}-armR" style="transform-origin:113px 92px">
             <rect x="108" y="62" width="24" height="6" rx="3" transform="rotate(-20 120 65)" fill="#8FA8B8"/>
             <circle cx="107" cy="69" r="6" fill="#6E8899"/>
             <circle cx="132" cy="60" r="6" fill="#6E8899"/>
           </g>
           <g class="${p}-sw"><path d="M30 64 q3.6 5.5 0 8 q-3.6 -2.5 0 -8" fill="#A9CDEC"/></g>`);

      // ── 비맞음: 먹구름 + 빗줄기 아래 처량함 ───────────────────────────
      case 'rainy': return wrap(`
        .${p}-body{animation:${p}-droop 2.4s ease-in-out infinite}
        .${p}-rain{animation:${p}-pour 0.7s linear infinite}
        @keyframes ${p}-droop{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
        @keyframes ${p}-pour{0%{transform:translateY(-4px);opacity:0.4}60%{opacity:1}100%{transform:translateY(10px);opacity:0}}`,
        this._base(p, `
          <path d="M47 88 q5 3 10 0 M83 88 q5 3 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M63 101 q7 -4 14 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<g>
             <path d="M38 22 q0 -10 11 -10 q3 -8 13 -6 q9 1 10 9 q10 0 10 9 q0 8 -10 8 l-24 0 q-10 0 -10 -10z" fill="#C4CDD6" stroke="#9BAAB8" stroke-width="2.4"/>
             <g class="${p}-rain">
               <path d="M46 40 l-2 7 M62 38 l-2 7 M78 40 l-2 7 M92 38 l-2 7" stroke="#A9CDEC" stroke-width="2.6" stroke-linecap="round"/>
             </g>
           </g>`);

      // ── 파티: 고깔 + 폭죽 색종이 ──────────────────────────────────────
      case 'party': return wrap(`
        .${p}-body{animation:${p}-jump2 0.7s ease-in-out infinite}
        .${p}-cf{animation:${p}-conf 1.6s ease-out infinite}
        .${p}-cf2{animation:${p}-conf 1.6s ease-out 0.8s infinite}
        @keyframes ${p}-jump2{0%,100%{transform:translateY(0)}45%{transform:translateY(-6px)}}
        @keyframes ${p}-conf{0%{transform:translateY(-4px) rotate(0);opacity:0}25%{opacity:1}100%{transform:translateY(22px) rotate(200deg);opacity:0}}`,
        this._base(p, `
          <path d="M46 83 l9 5 -9 5" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M94 83 l-9 5 9 5" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M58 96 q12 11 24 0 q-12 6 -24 0z" fill="#C97B72" stroke="#3F352A" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M58 46 l12 -22 12 22 q-12 6 -24 0z" fill="#F2A0A9" stroke="#C97B85" stroke-width="2.6" stroke-linejoin="round"/>
          <circle cx="70" cy="23" r="3.4" fill="#F5C74E"/>`)
        + `<g class="${p}-cf"><rect x="24" y="30" width="6" height="6" rx="1" fill="#97C7EB" transform="rotate(20 27 33)"/><rect x="116" y="36" width="6" height="6" rx="1" fill="#A8D8B9" transform="rotate(-15 119 39)"/></g>
           <g class="${p}-cf2"><rect x="40" y="24" width="5" height="5" rx="1" fill="#F2A0A9" transform="rotate(45 42 26)"/><rect x="102" y="26" width="5" height="5" rx="1" fill="#F5C74E" transform="rotate(-30 104 28)"/></g>`);

      // ── 수줍: 몸 배배 + 볼 만개 + 시선 회피 ───────────────────────────
      case 'shy': return wrap(`
        .${p}-body{animation:${p}-wiggle 1.8s ease-in-out infinite;transform-origin:70px 120px}
        @keyframes ${p}-wiggle{0%,100%{transform:rotate(-2.5deg) scale(1)}25%{transform:rotate(1deg) scale(0.99,1.01)}50%{transform:rotate(2.5deg) scale(1)}75%{transform:rotate(-1deg) scale(1.01,0.99)}}`,
        this._base(p, `
          <path d="M46 86 q5 -3 10 -1 M84 85 q5 -2 10 1" fill="none" stroke="#3F352A" stroke-width="2.8" stroke-linecap="round"/>
          <path d="M65 101 q5 2 10 -1" fill="none" stroke="#3F352A" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="42" cy="96" r="11" fill="${this._skin().cheek}" opacity="1"/>
          <circle cx="98" cy="96" r="11" fill="${this._skin().cheek}" opacity="1"/>
          <path d="M37 93 l4 3 M42 92 l4 3 M93 93 l4 3 M98 92 l4 3" stroke="#E58A6E" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`)
        + `<path d="M112 42 c-2.5 -3.5 -8 -1 -6 2.6 c1 2.6 4 4 6 6 c2 -2 5 -3.4 6 -6 c1.7 -3.6 -3.5 -6.1 -6 -2.6z" fill="#F6C4C9" opacity="0.9"/>`);

      // ── 심드렁: 반쯤 감긴 눈 + 일자 입 + 느린 눈 깜빡 ─────────────────
      case 'judge': return wrap(`
        .${p}-body{animation:${p}-still 4s ease-in-out infinite}
        .${p}-lid{animation:${p}-slowblink 4s ease-in-out infinite}
        @keyframes ${p}-still{0%,100%{transform:translateY(0)}50%{transform:translateY(1px)}}
        @keyframes ${p}-slowblink{0%,90%,100%{opacity:1}94%,97%{opacity:0.2}}`,
        this._base(p, `
          <g class="${p}-lid">
            <path d="M45 84 h14 M81 84 h14" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>
            <circle cx="52" cy="88" r="2.4" fill="#3F352A"/>
            <circle cx="88" cy="88" r="2.4" fill="#3F352A"/>
          </g>
          <path d="M64 101 h12" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<text x="104" y="40" font-size="14" font-weight="800" fill="#B7A38B" font-family="sans-serif">흠…</text>`);

      // ── 방전: 하얗게 재가 된 + 영혼 반쯤 이탈 + 넋나감 ────────────────
      case 'ghost': return wrap(`
        .${p}-body{animation:${p}-drain 3.2s ease-in-out infinite}
        .${p}-soul2{animation:${p}-leak 3s ease-out infinite}
        @keyframes ${p}-drain{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(2.5px) rotate(-1deg)}}
        @keyframes ${p}-leak{0%{transform:translate(0,0);opacity:0}30%{opacity:0.8}100%{transform:translate(6px,-18px);opacity:0}}`,
        `<g opacity="0.75">` + this._base(p, `
          <ellipse cx="52" cy="87" rx="4.5" ry="5.5" fill="none" stroke="#8C8072" stroke-width="2.2"/>
          <ellipse cx="88" cy="87" rx="4.5" ry="5.5" fill="none" stroke="#8C8072" stroke-width="2.2"/>
          <path d="M62 102 q8 -3 16 0" fill="none" stroke="#8C8072" stroke-width="2.4" stroke-linecap="round"/>`) + '</g>'
        + `<g class="${p}-soul2"><path d="M100 44 q5 -7 10 0 q0 7 -5 7 q-5 0 -5 -7z" fill="#EAF2F8" stroke="#B9CBD8" stroke-width="1.6" opacity="0.85"/></g>
           <text x="20" y="36" font-size="13" font-weight="800" fill="#B7A38B" font-family="sans-serif" transform="rotate(-8 20 36)">푸시식…</text>`);

      // ── 꾸벅: 앞으로 폴더 인사 + 감사 반짝 ────────────────────────────
      case 'bow': return wrap(`
        .${p}-body{animation:${p}-bowing 2s ease-in-out infinite;transform-origin:70px 122px}
        @keyframes ${p}-bowing{0%,100%{transform:rotate(0)}35%,60%{transform:rotate(10deg) translateY(4px)}}`,
        this._base(p, `
          <path d="M47 86 q5 3 10 0 M83 86 q5 3 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M63 99 q7 3.5 14 0" fill="none" stroke="#3F352A" stroke-width="2.6" stroke-linecap="round"/>`)
        + `<path d="M116 46 l1.8 3.8 3.8 1.8 -3.8 1.8 -1.8 3.8 -1.8 -3.8 -3.8 -1.8 3.8 -1.8z" fill="#F5C74E"/>`);

      // ── 녹아내림: 흐물흐물 눌린 몸 + 반쯤 감긴 눈 ─────────────────────
      case 'melt': return wrap(`
        .${p}-body{animation:${p}-goo 2.8s ease-in-out infinite;transform-origin:70px 125px}
        @keyframes ${p}-goo{0%,100%{transform:scale(1.06,0.9)}50%{transform:scale(1.12,0.84)}}`,
        this._base(p, `
          <path d="M46 89 q5 3 10 0 M84 89 q5 3 10 0" fill="none" stroke="#3F352A" stroke-width="3" stroke-linecap="round"/>
          <path d="M60 102 q5 3 10 0 q5 -3 10 0" fill="none" stroke="#3F352A" stroke-width="2.4" stroke-linecap="round"/>`)
        + `<path d="M24 122 q8 6 18 4 M116 122 q-8 6 -18 4" fill="none" stroke="#CBB89D" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>
           <text x="100" y="38" font-size="14" font-weight="800" fill="#B7A38B" font-family="sans-serif" transform="rotate(8 100 38)">흐물…</text>`);

      // ── 빼꼼: 아래에서 반쯤 올라와 훔쳐보기 ───────────────────────────
      case 'peek': return wrap(`
        .${p}-pk{animation:${p}-rise2 3s ease-in-out infinite}
        @keyframes ${p}-rise2{0%,100%{transform:translateY(34px)}35%,70%{transform:translateY(14px)}}`,
        `<g class="${p}-pk">` + this._base(p, `
          <circle cx="52" cy="80" r="3.2" fill="#3F352A"/>
          <circle cx="88" cy="80" r="3.2" fill="#3F352A"/>
          <ellipse cx="70" cy="93" rx="3" ry="2.4" fill="none" stroke="#3F352A" stroke-width="2.2"/>`) + '</g>'
        + `<text x="14" y="36" font-size="15" font-weight="800" fill="#B7A38B" font-family="sans-serif" transform="rotate(-8 14 36)">...?</text>`);

      default:
        return this.svg('joy', size);
    }
  }
};
