// ============================================================================
//  게임 효과음 — 파일 없이 WebAudio 로 합성 (설정의 알림음 스위치를 따른다)
//  사용: window.Sfx.play('water' | 'plant' | 'ripe' | 'harvest' | 'coin' |
//                        'buy' | 'equip' | 'place' | 'nav' | 'shield' | 'denied' |
//                        'send' | 'recv' | 'pop' | 'close' | 'appear' | 'mood' |
//                        'save' | 'toast' | 'levelup' | 'poke' | 'squish')
// ============================================================================
window.Sfx = {
  _ctx: null,

  ctx() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (this._ctx && this._ctx.state === 'suspended') { try { this._ctx.resume(); } catch (e) {} }
    return this._ctx;
  },

  // 진동은 소리와 따로 끌 수 있다 (조용한 곳에선 진동만 쓰는 사람도 있다)
  hapticOn() {
    return !window.Storage || window.Storage._safeGet('cbt_haptic_on', true) !== false;
  },

  // 손끝 반응. 지원 안 하는 기기(대부분의 iOS 사파리)에선 조용히 무시된다.
  buzz(pattern) {
    if (!this.hapticOn() || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  },

  on() {
    return !window.Storage || window.Storage._safeGet('cbt_sound_on', true) !== false;
  },

  // 단일 톤. slide 를 주면 주파수가 미끄러진다 (물방울·퐁 느낌)
  tone(freq, dur, { delay = 0, vol = 0.11, type = 'sine', slide } = {}) {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  },

  // 화이트노이즈 조각 (물 튀는 소리·스윽 소리·흙 소리)
  noise(dur, { delay = 0, vol = 0.08, freq = 1000, q = 1 } = {}) {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + dur + 0.05);
  },

  // 소리 + 진동을 함께. 소리만 껐어도 진동은 남는다.
  hit(name) {
    this.play(name);
    const H = {
      mood: 14, save: 18, buy: [10, 40, 10], coin: [10, 40, 10],
      levelup: [22, 60, 22, 60, 45], appear: [14, 40, 14], harvest: [18, 50, 18],
      ripe: [12, 45, 12], shield: [16, 50, 16], equip: 12, place: 16,
      denied: [40, 55, 40], poke: 10, squish: [8, 30, 8]
    };
    if (H[name] !== undefined) this.buzz(H[name]);
  },

  // 한 동작이 소리를 여러 개 부르는 일이 있다 (감정 고르기 → 캐릭터 등장 → 토스트).
  //  거들기용 소리는 방금 다른 소리가 났으면 양보하고, 같은 소리가 연달아 겹치는 것도 막는다.
  _QUIET: ['toast', 'nav', 'close'],
  _lastAt: 0,
  _lastName: null,

  play(name) {
    if (!this.on()) return;
    const now = (typeof performance !== undefined && performance.now) ? performance.now() : Date.now();
    if (this._QUIET.indexOf(name) >= 0 && now - this._lastAt < 450) return;
    if (name === this._lastName && now - this._lastAt < 220) return;
    this._lastAt = now; this._lastName = name;
    switch (name) {
      case 'water':    // 조로록 + 퐁당
        this.noise(0.22, { freq: 1600, q: 0.8, vol: 0.06 });
        this.tone(620, 0.12, { slide: 280, vol: 0.09 });
        this.tone(830, 0.10, { delay: 0.09, slide: 380, vol: 0.07 });
        break;
      case 'plant':    // 폭신한 흙 + 톡
        this.noise(0.12, { freq: 320, q: 0.7, vol: 0.09 });
        this.tone(300, 0.12, { slide: 150, vol: 0.1, type: 'triangle' });
        break;
      case 'ripe':     // 반짝 — 다 자랐어요
        this.tone(523, 0.1); this.tone(659, 0.1, { delay: 0.09 }); this.tone(784, 0.16, { delay: 0.18 });
        break;
      case 'harvest':  // 팡파레
        this.tone(784, 0.1); this.tone(988, 0.1, { delay: 0.09 });
        this.tone(1319, 0.22, { delay: 0.18 });
        this.noise(0.25, { delay: 0.18, freq: 5200, q: 0.6, vol: 0.03 });
        break;
      case 'coin':     // 짤랑
        this.tone(1319, 0.07, { type: 'square', vol: 0.05 });
        this.tone(1760, 0.12, { delay: 0.06, type: 'square', vol: 0.05 });
        break;
      case 'buy':      // 결제 콕 + 짤랑
        this.tone(440, 0.06, { type: 'triangle', vol: 0.09 });
        this.tone(1319, 0.07, { delay: 0.07, type: 'square', vol: 0.05 });
        this.tone(1760, 0.12, { delay: 0.13, type: 'square', vol: 0.05 });
        break;
      case 'equip':    // 스윽 (옷 갈아입기)
        this.noise(0.16, { freq: 2600, q: 0.5, vol: 0.05 });
        this.tone(880, 0.08, { delay: 0.1, vol: 0.06 });
        break;
      case 'place':    // 가구 내려놓는 톡-
        this.tone(150, 0.1, { slide: 90, vol: 0.14, type: 'triangle' });
        this.noise(0.06, { freq: 900, q: 1.2, vol: 0.05 });
        break;
      case 'nav':      // 화면 전환 틱
        this.tone(880, 0.045, { vol: 0.045 });
        break;
      case 'shield':   // 보호권 차임
        this.tone(440, 0.12); this.tone(554, 0.12, { delay: 0.05 }); this.tone(659, 0.2, { delay: 0.1 });
        break;
      // ── 대화 ───────────────────────────────────────────────────────
      case 'send':     // 메시지 보냄 — 슥, 하고 위로 톡
        this.noise(0.07, { freq: 3200, q: 0.6, vol: 0.035 });
        this.tone(660, 0.075, { delay: 0.02, slide: 990, vol: 0.055, type: 'triangle' });
        break;
      case 'recv':     // 답장 도착 — 말랑한 또롱 (알림처럼 날카롭지 않게)
        this.tone(784, 0.11, { vol: 0.06, type: 'sine' });
        this.tone(1047, 0.18, { delay: 0.085, vol: 0.05, type: 'sine' });
        break;

      // ── 화면 ───────────────────────────────────────────────────────
      case 'pop':      // 팝업·바텀시트 열림 — 통 하고 부풀어오르는 느낌
        this.tone(392, 0.09, { slide: 620, vol: 0.07, type: 'triangle' });
        this.noise(0.05, { delay: 0.03, freq: 2400, q: 1.2, vol: 0.025 });
        break;
      case 'close':    // 닫힘 — 반대로 내려앉는 톡
        this.tone(520, 0.08, { slide: 300, vol: 0.05, type: 'triangle' });
        break;
      case 'appear':   // 큰 우렁이가 폴짝 튀어나올 때 — 뾰용 + 반짝
        this.tone(330, 0.16, { slide: 880, vol: 0.085, type: 'triangle' });
        this.tone(1319, 0.09, { delay: 0.15, vol: 0.045 });
        this.tone(1760, 0.14, { delay: 0.21, vol: 0.035 });
        this.noise(0.18, { delay: 0.15, freq: 6000, q: 0.5, vol: 0.02 });
        break;

      // ── 기록 ───────────────────────────────────────────────────────
      case 'mood':     // 지금 마음 고르기 — 말랑하게 콕
        this.tone(587, 0.09, { vol: 0.07, type: 'sine' });
        this.tone(880, 0.13, { delay: 0.07, vol: 0.05, type: 'sine' });
        break;
      case 'save':     // 기록 저장 — 사각 하고 덮는 소리 + 딩
        this.noise(0.11, { freq: 1200, q: 0.9, vol: 0.045 });
        this.tone(698, 0.14, { delay: 0.07, vol: 0.06 });
        break;
      case 'toast':    // 상단 알림 배너 — 아주 작게 딩
        this.tone(1047, 0.09, { vol: 0.035 });
        break;
      case 'levelup':  // 레벨 업 — 네 음 올라가는 팡파레
        this.tone(523, 0.1, { vol: 0.08 });
        this.tone(659, 0.1, { delay: 0.09, vol: 0.08 });
        this.tone(784, 0.1, { delay: 0.18, vol: 0.08 });
        this.tone(1047, 0.3, { delay: 0.27, vol: 0.09 });
        this.noise(0.35, { delay: 0.27, freq: 5600, q: 0.5, vol: 0.028 });
        break;

      case 'denied':   // 안 돼요 부-
        this.tone(220, 0.16, { type: 'square', vol: 0.05, slide: 180 });
        break;

      // ── 우렁이 만지기 ─────────────────────────────────────────────────
      case 'poke':     // 콕 찌르기 — 말랑 뾰옹
        this.tone(520, 0.07, { slide: 780, vol: 0.06, type: 'triangle' });
        this.tone(880, 0.06, { delay: 0.05, vol: 0.035, type: 'sine' });
        break;
      case 'squish':   // 롱프레스 찌그러짐 — 낮게 눌리는 말랑 소리
        this.tone(360, 0.16, { slide: 150, vol: 0.08, type: 'triangle' });
        this.noise(0.09, { freq: 500, q: 0.8, vol: 0.04 });
        break;
    }
  }
};
