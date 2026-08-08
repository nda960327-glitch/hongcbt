// ============================================================================
//  수면 사운드 — 백색소음·빗소리·파도를 WebAudio로 실시간 생성 (음원 파일 불필요)
//  하루정리 마무리·마음 응급처치 메뉴에서 진입. 타이머로 자동 종료.
// ============================================================================
window.SleepSounds = {
  _ctx: null,
  _nodes: [],
  _timer: null,
  _current: null,

  SOUNDS: [
    { id: 'rain',  emoji: '🌧️', name: '빗소리',   desc: '창밖에 비 내리는 밤' },
    { id: 'waves', emoji: '🌊', name: '파도',     desc: '밀려왔다 밀려가는 바닷가' },
    { id: 'white', emoji: '🌫️', name: '백색소음', desc: '생각을 덮어주는 고른 소리' }
  ],

  _audioCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  },

  // 화이트노이즈 버퍼 (2초 루프)
  _noiseSource(ctx) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  },

  start(type) {
    if (window.Sfx) window.Sfx.play('appear');
    this.stop(true);
    const ctx = this._audioCtx();
    this._current = type;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this._master = master;

    if (type === 'white') {
      const src = this._noiseSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; // 부드러운 저역 위주
      src.connect(lp); lp.connect(master);
      src.start();
      this._nodes = [src, lp];
    } else if (type === 'rain') {
      // 빗줄기: 대역 통과 노이즈 / 빗방울: 고역의 노이즈를 LFO 없이 잘게
      const body = this._noiseSource(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.5;
      const g1 = ctx.createGain(); g1.gain.value = 0.7;
      body.connect(bp); bp.connect(g1); g1.connect(master);
      body.start();
      const drops = this._noiseSource(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 5000;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      drops.connect(hp); hp.connect(g2); g2.connect(master);
      drops.start();
      this._nodes = [body, bp, g1, drops, hp, g2];
    } else if (type === 'waves') {
      const src = this._noiseSource(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600;
      const swell = ctx.createGain(); swell.gain.value = 0.4;
      // 파도의 밀물썰물: 0.08Hz LFO가 볼륨을 천천히 오르내리게
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.32;
      lfo.connect(lfoGain); lfoGain.connect(swell.gain);
      src.connect(lp); lp.connect(swell); swell.connect(master);
      src.start(); lfo.start();
      this._nodes = [src, lp, swell, lfo, lfoGain];
    }

    // 페이드 인
    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    this._updateUI();
  },

  stop(silent) {
    clearTimeout(this._timer); this._timer = null; this._timerEnd = null;
    if (this._master && this._ctx) {
      try {
        this._master.gain.exponentialRampToValueAtTime(0.0001, this._ctx.currentTime + 0.4);
        const nodes = this._nodes, master = this._master;
        setTimeout(() => { nodes.forEach(n => { try { n.stop && n.stop(); n.disconnect(); } catch (e) {} }); try { master.disconnect(); } catch (e) {} }, 600);
      } catch (e) {}
    }
    this._nodes = []; this._master = null; this._current = null;
    if (!silent) this._updateUI();
  },

  setTimer(mins) {
    clearTimeout(this._timer);
    if (!mins) { this._timerEnd = null; this._updateUI(); return; }
    this._timerEnd = Date.now() + mins * 60000;
    this._timer = setTimeout(() => { this.stop(); const ov = document.getElementById('sleep-overlay'); if (ov) ov.remove(); }, mins * 60000);
    this._updateUI();
  },

  open() {
    const old = document.getElementById('sleep-overlay');
    if (old) { old.remove(); return; }
    const ov = document.createElement('div');
    ov.id = 'sleep-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10004; background: linear-gradient(180deg, #1c2733 0%, #10161d 100%); color: #f5f1e6; display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem;';
    ov.innerHTML = `
      <div style="width: 100%; max-width: 320px; text-align: center;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('sleepy', 100) : '😴'}</span>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.25rem; color: #ffffff;">수면 사운드</h2>
        <p style="font-size: 0.86rem; color: #d9d2c0; margin: 0 0 1.2rem;">잔잔한 소리가 생각을 덮어줄 거예요.<br>화면을 꺼도 소리는 계속돼요.</p>
        <div id="sleep-sound-btns" style="display: flex; flex-direction: column; gap: 0.55rem; margin-bottom: 1rem;"></div>
        <p style="font-size: 0.78rem; color: #cfc7b4; margin: 0 0 0.4rem;">자동 끄기</p>
        <div id="sleep-timer-btns" style="display: flex; gap: 0.4rem; justify-content: center;"></div>
      </div>
      <button onclick="window.SleepSounds.stop(true); document.getElementById('sleep-overlay').remove();" style="all: unset; position: absolute; top: 1rem; right: 1.2rem; font-size: 1.3rem; cursor: pointer; opacity: 0.8; padding: 0.3rem;">✕</button>`;
    document.body.appendChild(ov);
    this._updateUI();
  },

  _updateUI() {
    const btns = document.getElementById('sleep-sound-btns');
    if (btns) {
      btns.innerHTML = this.SOUNDS.map(s => {
        const on = this._current === s.id;
        return `<button onclick="window.SleepSounds.${on ? 'stop()' : `start('${s.id}')`}"
          style="all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 0.7rem; width: 100%; text-align: left; padding: 0.8rem 1rem; border-radius: 14px; cursor: pointer; background: ${on ? 'rgba(151,199,235,0.22)' : 'rgba(255,255,255,0.1)'}; border: 1.5px solid ${on ? '#97c7eb' : 'transparent'};">
          <span style="font-size: 1.5rem;">${s.emoji}</span>
          <span style="flex: 1;">
            <strong style="display: block; font-size: 0.95rem; color: #ffffff;">${s.name} ${on ? '<span style="font-size:0.7rem; color:#97c7eb;">재생 중</span>' : ''}</strong>
            <span style="font-size: 0.76rem; color: #cfc7b4;">${s.desc}</span>
          </span>
          <span style="font-size: 1.1rem; opacity: 0.9;">${on ? '⏸' : '▶'}</span>
        </button>`;
      }).join('');
    }
    const timers = document.getElementById('sleep-timer-btns');
    if (timers) {
      timers.innerHTML = [15, 30, 60].map(m => {
        const on = this._timerEnd && Math.abs(this._timerEnd - Date.now() - m * 60000) < 90000;
        return `<button onclick="window.SleepSounds.setTimer(${on ? 0 : m})" style="all: unset; box-sizing: border-box; padding: 0.45rem 0.9rem; border-radius: 999px; cursor: pointer; font-size: 0.82rem; font-weight: 700; background: ${on ? '#97c7eb' : 'rgba(255,255,255,0.1)'}; color: ${on ? '#10161d' : '#f5f1e6'};">${m}분</button>`;
      }).join('') + `<button onclick="window.SleepSounds.setTimer(0)" style="all: unset; box-sizing: border-box; padding: 0.45rem 0.9rem; border-radius: 999px; cursor: pointer; font-size: 0.82rem; font-weight: 700; background: ${this._timerEnd ? 'rgba(255,255,255,0.1)' : '#97c7eb'}; color: ${this._timerEnd ? '#f5f1e6' : '#10161d'};">계속</button>`;
    }
  }
};
