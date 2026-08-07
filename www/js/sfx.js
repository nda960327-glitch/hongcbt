// ============================================================================
//  게임 효과음 — 파일 없이 WebAudio 로 합성 (설정의 알림음 스위치를 따른다)
//  사용: window.Sfx.play('water' | 'plant' | 'ripe' | 'harvest' | 'coin' |
//                        'buy' | 'equip' | 'place' | 'nav' | 'shield' | 'denied')
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

  play(name) {
    if (!this.on()) return;
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
      case 'denied':   // 안 돼요 부-
        this.tone(220, 0.16, { type: 'square', vol: 0.05, slide: 180 });
        break;
    }
  }
};
