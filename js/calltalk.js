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
    // 보이스톡은 체험·구독 전용 (무료 플랜은 페이월 안내)
    if (window.Subscription && !window.Subscription.guardCall()) return;
    if (!window.Wallet || window.Wallet.balance() < this.RATE) {
      alert(`보이스톡은 30초당 ${this.RATE}캐시가 사용돼요.\n잔액이 부족합니다. 마이페이지에서 캐시를 충전해주세요.`);
      if (window.App) window.App.switchTab('mypage');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 사용해주세요.'); return; }

    const p = window.Personas ? window.Personas.getActive() : { id: 'woorung', name: '우렁의사', tagline: '' };
    this._active = true;
    this._human = false;
    this._rate = this.RATE;
    this._startTs = Date.now();
    this._lastTalk = Date.now();
    this._spent = 0;

    // 통화 중에는 TTS 강제 사용 (통화니까), 끝나면 원래 설정 복원
    if (window.Voice) {
      this._ttsWasEnabled = window.Voice.isTtsEnabled;
      window.Voice.isTtsEnabled = true;
    }

    this._renderOverlay(p);
    // 연결음(뚜루루) — 상담사가 받으면 멈춘다
    if (window.App && window.App.ringStart) window.App.ringStart();

    // 첫 과금 + 30초마다 차감
    this._bill();
    this._billTimer = setInterval(() => this._bill(), this.TICK_MS);
    this._clockTimer = setInterval(() => this._updateClock(), 1000);

    // 1.8초 뒤 상담사가 받는다
    setTimeout(() => {
      if (!this._active) return;
      if (window.App && window.App.ringStop) window.App.ringStop();
      this._setStatus('통화 중');
      const hello = { role: 'bot', text: `여보세요? 나 ${p.name}${p.id === 'woorung' ? '예요' : '이야'}. 목소리로 들으니까 더 반갑다. 무슨 얘기부터 할까?`, timestamp: new Date().toISOString() };
      window.Storage.saveMessage(hello);
      if (window.App) window.App.displayMessage(hello);
      this._speakThen(hello.text, p.id, () => this._listen());
    }, 1800);
  },

  _bill() {
    if (!this._active) return;
    // 무발화 자동 종료: 5분간 말이 없으면 끊는다.
    // 켜둔 채 잠들거나 자리를 비웠을 때 캐시·API 비용이 새는 것을 막는 안전장치.
    if (!this._human && this._lastTalk && Date.now() - this._lastTalk > 5 * 60000) {
      this.end('5분 동안 대화가 없어서 우렁이가 조용히 전화를 끊었어요.\n(캐시가 새지 않도록 지켜드렸어요)');
      return;
    }
    const rate = (this._rate != null) ? this._rate : this.RATE;
    if (rate <= 0) return; // 회기권 통화는 과금 없음
    if (!window.Wallet.spend(rate, `보이스톡 (30초)`)) {
      this.end('잔액이 모두 사용되어 통화를 종료했어요.');
      return;
    }
    this._spent += rate;
    const el = document.getElementById('call-spent');
    if (el) el.textContent = `${this._spent.toLocaleString()}캐시 사용 중 · 30초당 ${rate}`;
  },

  // ==========================================================================
  //  인간 상담사 통화방 — 050 안심번호 연결 + 30초당 실시간 과금
  //  (실번호는 서로 공개되지 않는다. 인앱 VoIP는 서버 연동 후 교체 지점)
  // ==========================================================================
  startHuman(counselorId, opts = {}) {
    if (this._active) return;
    const c = window.Marketplace.getCounselor(counselorId);
    if (!c) return;
    const prepaid = !!opts.prepaid;
    const liveRate = window.Marketplace.callRateFor(c); // 예약 상담료 ÷60 ×1.25 자동 책정
    this._rate = prepaid ? 0 : liveRate;

    if (!prepaid && (!window.Wallet || window.Wallet.balance() < this._rate * 2)) {
      alert(`바로상담은 30초당 ${liveRate.toLocaleString()}캐시가 실시간 차감돼요.\n잔액이 부족합니다. 마이페이지에서 충전해주세요.`);
      if (window.App) window.App.switchTab('mypage');
      return;
    }

    this._active = true;
    this._human = true;
    this._startTs = Date.now();
    this._spent = 0;

    // 통화 기록
    const logs = window.Storage._safeGet('cbt_call_logs', []) || [];
    logs.unshift({ ts: Date.now(), counselorId: c.id, name: c.name, safeTel: c.safeTel, mode: prepaid ? '회기권' : '초당결제' });
    window.Storage._safeSet('cbt_call_logs', logs.slice(0, 50));

    this._renderHumanOverlay(c, prepaid);
    if (window.App && window.App.ringStart) {
      window.App.ringStart();
      setTimeout(() => { if (window.App.ringStop) window.App.ringStop(); this._setStatus('전화 연결 버튼을 눌러주세요'); }, 2400);
    }
    this._clockTimer = setInterval(() => this._updateClock(), 1000);
    if (!prepaid) {
      this._bill();
      this._billTimer = setInterval(() => this._bill(), this.TICK_MS);
    } else {
      // 회기권 = 예약된 30분. 5분 전 안내, 만료 시 동의한 경우에만 초당 과금으로 연장.
      this._warnTimer = setTimeout(() => { if (this._active) this._setStatus('⏰ 상담 종료 5분 전이에요'); }, 25 * 60000);
      this._prepaidTimer = setTimeout(() => {
        if (!this._active) return;
        const rate = window.Marketplace.callRateFor(c);
        if (confirm(`예약된 30분 상담 시간이 끝났어요.\n계속 통화하면 지금부터 30초당 ${rate.toLocaleString()}캐시가 차감됩니다.\n연장할까요?`)) {
          this._rate = rate;
          const el = document.getElementById('call-spent');
          if (el) el.textContent = `연장 통화 중 · 30초당 ${rate.toLocaleString()}캐시`;
          this._bill();
          this._billTimer = setInterval(() => this._bill(), this.TICK_MS);
        } else {
          this.end('예약된 30분 상담이 완료되었습니다. 수고하셨어요!');
        }
      }, 30 * 60000);
    }
  },

  dialSafe(safeTel) {
    this._setStatus('안심번호로 연결 중…');
    window.location.href = 'tel:' + String(safeTel || '').replace(/-/g, '');
  },

  _renderHumanOverlay(c, prepaid) {
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
      <div style="text-align: center; width: 100%;">
        <div style="width: 132px; height: 132px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 3rem; animation: callPulse 2.2s ease-in-out infinite;">👩‍⚕️</div>
        <h2 style="margin: 1rem 0 0.2rem; font-size: 1.35rem;">${c.name}</h2>
        <p style="margin: 0; font-size: 0.8rem; opacity: 0.75;">${c.hospital}</p>
        <p id="call-spent" style="margin: 0.9rem 0 0; font-size: 0.82rem; color: #f5c74e; font-weight: 700;">${prepaid ? '회기권(예약 30분) 이용 중 · 추가 과금 없음' : `0캐시 사용 중 · 30초당 ${window.Marketplace.callRateFor(c).toLocaleString()}`}</p>
        <button onclick="window.CallTalk.dialSafe('${c.safeTel}')" style="margin-top: 1.1rem; border: none; border-radius: 999px; background: #f2ede4; color: #2e4237; font-weight: 800; font-size: 0.95rem; padding: 0.75rem 1.4rem; cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,0.3);">📞 안심번호로 전화 연결</button>
        <p style="margin: 0.7rem auto 0; font-size: 0.72rem; opacity: 0.65; max-width: 260px; line-height: 1.5;">050 안심번호로 연결되어 <b>서로의 실제 번호는 공개되지 않아요.</b> 통화를 마치면 아래 종료 버튼으로 정산을 끝내주세요.</p>
      </div>
      <button onclick="window.CallTalk.end()" style="width: 68px; height: 68px; border-radius: 50%; border: none; background: #d9534f; color: #fff; font-size: 1.6rem; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.35);">📞</button>
      <style>@keyframes callPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }</style>`;
    document.body.appendChild(ov);
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
      this._lastTalk = Date.now(); // 실제 발화 시각 — 무발화 자동 종료 기준
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
    this._human = false;
    this._rate = null;
    if (window.App && window.App.ringStop) window.App.ringStop();
    clearInterval(this._billTimer);
    clearInterval(this._clockTimer);
    clearTimeout(this._prepaidTimer);
    clearTimeout(this._warnTimer);
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
