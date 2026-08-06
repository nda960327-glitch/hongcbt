// ============================================================================
//  우렁이 스티커 v2 — "하찮고 뚱뚱한" 치이카와st 굿즈용
//  앱에 내장된 SVG 이모티콘. 네트워크·AI 토큰 불필요, 전부 CSS 애니메이션.
//  사용: window.Stickers.svg('joy', 96)
// ============================================================================
window.Stickers = {
  list: ['joy', 'surprise', 'empathy', 'sad', 'love', 'cheer', 'blank', 'sleepy', 'proud', 'think', 'detective', 'teacher', 'aha', 'oops'],
  labels: { joy: '기쁨', surprise: '놀람', empathy: '공감', sad: '슬픔', love: '사랑', cheer: '응원', blank: '멍때림', sleepy: '졸림', proud: '뿌듯', think: '골똘', detective: '탐정', teacher: '선생님', aha: '깨달음', oops: '머쓱' },

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

  // 공통 몸통: 옆으로 퍼진 찹쌀떡 몸(손그림 울퉁불퉁 외곽) + 하찮게 작은 껍질
  // + 삐뚤한 헤드미러 + 짜리몽땅 팔 + 콩알 발
  _base(prefix, face = '', armRUp = false) {
    const armR = armRUp
      ? `<path class="${prefix}-armR" d="M112 88 q10 -4 10 -14 q-7 -4 -11 3 q-3 6 1 11z" fill="#FFF9F0" stroke="#8A6F55" stroke-width="3.2" stroke-linejoin="round"/>`
      : `<path class="${prefix}-armR" d="M113 92 q9 3 7 11 q-8 2 -10 -4 q-1 -5 3 -7z" fill="#FFF9F0" stroke="#8A6F55" stroke-width="3.2" stroke-linejoin="round"/>`;
    return `
      <g class="${prefix}-body">
        <!-- 몸에 비해 하찮게 작은 껍질 -->
        <g class="${prefix}-shell">
          <circle cx="103" cy="52" r="15" fill="#BBD7C0" stroke="#7FA78C" stroke-width="3"/>
          <path d="M103 52 m0 -9 a9 9 0 1 1 -9 9 a6.4 6.4 0 1 0 6.4 -6.4 a4 4 0 1 1 -4 4"
                fill="none" stroke="#7FA78C" stroke-width="2.2" stroke-linecap="round"/>
        </g>
        <!-- 뚱뚱 찹쌀떡 몸 (손그림 울퉁불퉁) -->
        <path d="M70 42
                 C 89 41, 106 50, 112 65
                 C 117 77, 119 94, 112 106
                 C 104 119, 90 125, 70 125
                 C 50 126, 35 119, 27 106
                 C 20 94, 22 77, 28 64
                 C 34 50, 51 43, 70 42 Z"
              fill="#FFF9F0" stroke="#8A6F55" stroke-width="3.6" stroke-linejoin="round"/>
        <!-- 콩알 발 -->
        <path d="M50 124 q4 6 10 1" fill="none" stroke="#8A6F55" stroke-width="3" stroke-linecap="round"/>
        <path d="M80 125 q4 6 10 0" fill="none" stroke="#8A6F55" stroke-width="3" stroke-linecap="round"/>
        <!-- 아무것도 못 할 것 같은 짜리몽땅 팔 -->
        <path class="${prefix}-armL" d="M27 92 q-9 3 -7 11 q8 2 10 -4 q1 -5 -3 -7z" fill="#FFF9F0" stroke="#8A6F55" stroke-width="3.2" stroke-linejoin="round"/>
        ${armR}
        <!-- 삐뚤한 헤드미러 -->
        <path d="M36 50 q30 -16 62 -4" fill="none" stroke="#B79B7C" stroke-width="2.2" opacity="0.5"/>
        <g transform="rotate(-8 44 42)">
          <circle cx="44" cy="42" r="7.5" fill="#F4F7F6" stroke="#8FA8B8" stroke-width="2.6"/>
          <circle cx="44" cy="42" r="2.6" fill="#C9D8E2"/>
        </g>
        <!-- 큼직한 볼터치 (얼굴 아래쪽) -->
        <circle class="${prefix}-cheek" cx="42" cy="96" r="8" fill="#F9BCA4" opacity="0.85"/>
        <circle class="${prefix}-cheek" cx="98" cy="96" r="8" fill="#F9BCA4" opacity="0.85"/>
        ${face}
      </g>`;
  },

  svg(name, size = 96) {
    const p = 'wr2-' + name;
    const wrap = (style, inner) => `
<svg width="${size}" height="${size}" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="우렁이 ${this.labels[name] || ''}">
  <style>${style}</style>
  ${inner}
</svg>`;

    switch (name) {
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
        + `<g class="${p}-t1"><path d="M42 94 q4 6.5 0 9.5 q-4 -3 0 -9.5" fill="#A9CDEC"/></g>
           <g class="${p}-t2"><path d="M98 94 q4 6.5 0 9.5 q-4 -3 0 -9.5" fill="#A9CDEC"/></g>`);

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

      default:
        return this.svg('joy', size);
    }
  }
};
