// ============================================================================
//  보이스톡 — AI 상담사와 실시간 음성 통화 (마인드카페식 초당 과금)
//  · 30초당 RATE 캐시가 실시간 차감된다. 잔액이 떨어지면 통화가 끝난다.
//  · STT(듣기) ↔ LLM(생각) ↔ TTS(말하기) 핑퐁 루프.
//  · 대화 내용은 채팅 기록에 그대로 남아 장기기억·사고기록과 이어진다.
// ============================================================================
window.CallTalk = {
  RATE: 150,          // 30초당 캐시
  TICK_MS: 30 * 1000, // 과금 주기

  _active: false,
  _startTs: 0,
  _spent: 0,
  _billTimer: null,
  _clockTimer: null,
  _rec: null,
  _listening: false,
  _thinking: false,
  _ttsWasEnabled: null,

  start(personaId) {
    if (this._active) return;
    if (!window.Wallet || window.Wallet.balance() < this.RATE) {
      alert(`보이스톡은 30초당 ${this.RATE}캐시가 사용돼요.\n잔액이 부족합니다. 마이페이지에서 캐시를 충전해주세요.`);
      if (window.App) window.App.switchTab('mypage');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 사용해주세요.'); return; }

    const p = window.Personas ? window.Personas.getActive() : { id: 'woorung', name: '우렁의사', tagline: '' };
    this._active = true;
    this._startTs = Date.now();
    this._spent = 0;

    // 통화 중에는 TTS 강제 사용 (통화니까), 끝나면 원래 설정 복원
    if (window.Voice) {
      this._ttsWasEnabled = window.Voice.isTtsEnabled;
      window.Voice.isTtsEnabled = true;
    }

    this._renderOverlay(p);
    // 첫 과금 + 30초마다 차감
    this._bill();
    this._billTimer = setInterval(() => this._bill(), this.TICK_MS);
    this._clockTimer = setInterval(() => this._updateClock(), 1000);

    // 상담사가 먼저 받는다
    const hello = { role: 'bot', text: `여보세요? 나 ${p.name}${p.id === 'woorung' ? '예요' : '이야'}. 목소리로 들으니까 더 반갑다. 무슨 얘기부터 할까?`, timestamp: new Date().toISOString() };
    window.Storage.saveMessage(hello);
    if (window.App) window.App.displayMessage(hello);
    this._speakThen(hello.text, p.id, () => this._listen());
  },

  _bill() {
    if (!this._active) return;
    if (!window.Wallet.spend(this.RATE, `보이스톡 (30초)`)) {
      this.end('잔액이 모두 사용되어 통화를 종료했어요.');
      return;
    }
    this._spent += this.RATE;
    const el = document.getElementById('call-spent');
    if (el) el.textContent = `${this._spent.toLocaleString()}캐시 사용 중 · 30초당 ${this.RATE}`;
  },

  _updateClock() {
    const el = document.getElementById('call-clock');
    if (!el) return;
    const s = Math.floor((Date.now() - this._startTs) / 1000);
    el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  },

  _setStatus(t) {
    const el = document.getElementById('call-status');
    if (el) el.textContent = t;
  },

  // --- 듣기 → 생각 → 말하기 루프 ---
  _listen() {
    if (!this._active || this._listening || this._thinking) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec;
    try { rec = new SR(); } catch (e) { return; }
    this._rec = rec;
    rec.lang = ({ en: 'en-US', ja: 'ja-JP' })[(window.Storage._safeGet('cbt_lang', 'ko'))] || 'ko-KR';
    rec.interimResults = false;
    rec.continuous = false;
    this._listening = true;
    this._setStatus('듣고 있어요 🎙️');

    rec.onresult = async (e) => {
      const text = (e.results[0] && e.results[0][0] && e.results[0][0].transcript || '').trim();
      this._listening = false;
      if (!text || !this._active) { this._listen(); return; }
      this._thinking = true;
      this._setStatus('생각 중…');
      window.Storage.saveMessage({ role: 'user', text, timestamp: new Date().toISOString() });
      if (window.App) window.App.displayMessage({ role: 'user', text });
      try {
        const res = await window.LLM.generateResponse(text);
        if (!this._active) return;
        const pid = window.Personas ? window.Personas.getActive().id : 'woorung';
        const speakables = res.filter(r => r.text);
        speakables.forEach((r, i) => {
          window.Storage.saveMessage({ role: 'bot', text: r.text, timestamp: new Date().toISOString() });
          if (window.App) window.App.displayMessage({ role: 'bot', text: r.text });
        });
        this._setStatus('말하는 중…');
        this._speakAllThen(speakables.map(r => r.text), pid, () => { this._thinking = false; this._listen(); });
      } catch (err) {
        this._thinking = false;
        this._listen();
      }
    };
    rec.onerror = () => { this._listening = false; if (this._active && !this._thinking) setTimeout(() => this._listen(), 500); };
    rec.onend = () => { this._listening = false; if (this._active && !this._thinking) setTimeout(() => this._listen(), 400); };
    try { rec.start(); } catch (e) { this._listening = false; }
  },

  _speakThen(text, personaId, done) {
    this._speakAllThen([text], personaId, done);
  },

  _speakAllThen(texts, personaId, done) {
    if (!window.Voice) { done && done(); return; }
    texts.forEach(t => window.Voice.speak(t, personaId));
    // 큐가 빌 때까지 대기 후 콜백
    const wait = () => {
      if (!this._active) return;
      if (!window.Voice._ttsPlaying && window.Voice._ttsQueue.length === 0) { done && done(); }
      else setTimeout(wait, 300);
    };
    setTimeout(wait, 400);
  },

  end(reason) {
    if (!this._active) return;
    this._active = false;
    clearInterval(this._billTimer);
    clearInterval(this._clockTimer);
    try { if (this._rec) this._rec.abort(); } catch (e) {}
    if (window.Voice) {
      window.Voice.stopSpeaking();
      if (this._ttsWasEnabled !== null) window.Voice.isTtsEnabled = this._ttsWasEnabled;
    }
    const secs = Math.floor((Date.now() - this._startTs) / 1000);
    const ov = document.getElementById('call-overlay');
    if (ov) ov.remove();
    alert(`${reason ? reason + '\n\n' : ''}통화 종료\n· 통화 시간: ${Math.floor(secs / 60)}분 ${secs % 60}초\n· 사용 캐시: ${this._spent.toLocaleString()}캐시`);
  },

  _renderOverlay(p) {
    const old = document.getElementById('call-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'call-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10001; background: linear-gradient(180deg, #2e4237 0%, #1d2c24 100%); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 3rem 1.5rem 2.5rem; color: #f2ede4;';
    ov.innerHTML = `
      <div style="text-align: center;">
        <div id="call-status" style="font-size: 0.85rem; opacity: 0.8;">연결 중…</div>
        <div id="call-clock" style="font-size: 1.1rem; font-weight: 700; margin-top: 0.3rem;">00:00</div>
      </div>
      <div style="text-align: center;">
        <div style="width: 148px; height: 148px; border-radius: 50%; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; margin: 0 auto; animation: callPulse 2.2s ease-in-out infinite;">
          ${window.Personas ? window.Personas.avatarSvg(p.id, 120) : ''}
        </div>
        <h2 style="margin: 1rem 0 0.2rem; font-size: 1.4rem;">${p.name}</h2>
        <p style="margin: 0; font-size: 0.82rem; opacity: 0.75;">${p.tagline || ''}</p>
        <p id="call-spent" style="margin: 0.9rem 0 0; font-size: 0.8rem; color: #f5c74e; font-weight: 700;">0캐시 사용 중 · 30초당 ${this.RATE}</p>
      </div>
      <button onclick="window.CallTalk.end()" style="width: 68px; height: 68px; border-radius: 50%; border: none; background: #d9534f; color: #fff; font-size: 1.6rem; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.35);">📞</button>
      <style>@keyframes callPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }</style>`;
    document.body.appendChild(ov);
  }
};
