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
      window.UI.alert(`보이스톡은 30초당 ${this.RATE}캐시가 사용돼요.\n잔액이 부족합니다. 마이페이지에서 캐시를 충전해주세요.`);
      if (window.App) window.App.switchTab('mypage');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { window.UI.alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬에서 사용해주세요.'); return; }

    if (window.SleepSounds) window.SleepSounds.stop(true); // 수면 사운드와 겹치지 않게
    const p = window.Personas ? window.Personas.getActive() : { id: 'woorung', name: '우렁의사', tagline: '' };
    this._active = true;
    this._human = false;
    this._connected = false;
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
    this._clockTimer = setInterval(() => this._updateClock(), 1000);

    // 3.4초 뒤 상담사가 받는다 — 뚜루루가 두 번은 울려야 전화 같다.
    //  (여기 통화 종료용 코드가 잘못 섞여 들어와 ReferenceError 로
    //   '연결 중…'에서 영원히 멈추던 버그가 있었다. 받는 일만 한다.)
    setTimeout(() => {
      if (!this._active) return;
      if (window.App && window.App.ringStop) window.App.ringStop();
      this._setStatus('통화 중');
      // 과금은 받는 순간부터다. 벨이 울리는 동안 돈이 나가면 사기다 —
      //  시계도 여기서 0부터 다시 센다 (연결음은 통화 시간이 아니다).
      this._connected = true;
      clearTimeout(this._noAnswerTimer);
      clearTimeout(this._connTimer);
      this._startTs = Date.now();
      this._lastTalk = Date.now();
      this._bill();
      this._billTimer = setInterval(() => this._bill(), this.TICK_MS);
      const hello = { role: 'bot', text: `여보세요? 나 ${p.name}${p.id === 'woorung' ? '예요' : '이야'}. 목소리로 들으니까 더 반갑다. 무슨 얘기부터 할까?`, timestamp: new Date().toISOString() };
      window.Storage.saveMessage(hello);
      if (window.App) window.App.displayMessage(hello);
      this._speakThen(hello.text, p.id, () => this._listen());
    }, 3400);
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
      window.UI.alert(`바로상담은 30초당 ${liveRate.toLocaleString()}캐시가 실시간 차감돼요.\n잔액이 부족합니다. 마이페이지에서 충전해주세요.`);
      if (window.App) window.App.switchTab('mypage');
      return;
    }

    if (window.SleepSounds) window.SleepSounds.stop(true); // 수면 사운드와 겹치지 않게
    this._active = true;
    this._human = true;
    this._connected = false;
    this._counselorId = c.id; // 통화 종료 시 서버 회선 해제용
    this._startTs = Date.now();
    this._spent = 0;

    // 통화 기록
    const logs = window.Storage._safeGet('cbt_call_logs', []) || [];
    logs.unshift({ ts: Date.now(), counselorId: c.id, name: c.name, safeTel: c.safeTel, mode: prepaid ? '회기권' : '초당결제' });
    window.Storage._safeSet('cbt_call_logs', logs.slice(0, 50));

    this._prepaid = prepaid;
    this._pendingCounselor = c;
    this._billStarted = false;
    this._renderHumanOverlay(c, prepaid);
    this._voice(c.id, prepaid ? 0 : this._rate);   // 앱 안에서 음성 연결 (번호 없음)
    // 연결음은 상담사가 받을 때까지 계속 울린다 — 진짜 전화가 그렇듯이.
    //  멈추는 곳은 셋뿐: 받았을 때(connected) · 실패했을 때(error) · 끊었을 때(end)
    if (window.App && window.App.ringStart) window.App.ringStart();
    this._clockTimer = setInterval(() => this._updateClock(), 1000);
    this._wakeLock(); // 통화 중 화면이 잠들면 브라우저가 페이지를 얼린다
    // 60초 무응답이면 접는다 — '연결 중'을 영원히 보게 두지 않는다
    clearTimeout(this._noAnswerTimer);
    this._noAnswerTimer = setTimeout(() => {
      if (this._active && !this._connected) this.end('받지 않아요 — 부재중으로 남겼어요');
    }, 60000);
    // 과금과 회기권 30분 계산은 여기서 시작하지 않는다 —
    //  상담사가 실제로 받은 순간(connected 이벤트)부터다. 벨 울리는 동안은 무료.
  },

  // 화면 꺼짐 방지 — 꺼지는 순간 모바일 브라우저가 통화(페이지)를 얼려버린다
  async _wakeLock() {
    try {
      if ('wakeLock' in navigator) this._wl = await navigator.wakeLock.request('screen');
    } catch (e) {}
    // 네이티브 앱이면 통화 모드로 전환 — 수화기로 나가고, 귀에 대면 화면이 꺼진다
    try {
      const nat = this._native();
      if (nat) { this._spk = false; await nat.startCall({ speaker: false }).catch(() => {}); }
    } catch (e) {}
  },
  _wakeUnlock() {
    try { if (this._wl) { this._wl.release(); this._wl = null; } } catch (e) {}
    // 오디오 모드를 안 되돌리면 통화가 끝난 뒤에도 음악·알림 소리가 이상해진다
    try { const nat = this._native(); if (nat) nat.endCall().catch(() => {}); } catch (e) {}
    this._spk = false;
  },

  // 과금 시작 — 반드시 상담사가 받은 뒤에만 부른다.
  //  (서버 rtc/connected 가 찍는 시각과 같은 순간이라 표시 요금과 실제 차감이 일치한다)
  _startHumanBilling() {
    if (this._billStarted || !this._active) return;
    this._billStarted = true;
    this._connected = true;
    clearTimeout(this._noAnswerTimer);
    clearTimeout(this._connTimer);
    const c = this._pendingCounselor;
    this._startTs = Date.now(); // 통화 시간도 연결부터 센다 — 연결음은 통화가 아니다
    if (!this._prepaid) {
      this._bill();
      this._billTimer = setInterval(() => this._bill(), this.TICK_MS);
    } else {
      // 회기권 = 예약된 30분. 5분 전 안내, 만료 시 동의한 경우에만 초당 과금으로 연장.
      this._warnTimer = setTimeout(() => { if (this._active) this._setStatus('⏰ 상담 종료 5분 전이에요'); }, 25 * 60000);
      this._prepaidTimer = setTimeout(async () => {
        if (!this._active) return;
        const rate = window.Marketplace.callRateFor(c);
        if (await window.UI.confirm(`예약된 30분 상담 시간이 끝났어요.\n계속 통화하면 지금부터 30초당 ${rate.toLocaleString()}캐시가 차감됩니다.\n연장할까요?`)) {
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

  // 앱 안에서 음성을 연결한다.
  //  전화(tel:)로 걸면 내담자 발신번호가 상담사 폰에 그대로 찍힌다.
  //  안심번호를 붙여도 '번호'가 존재하는 한 언젠가 샌다. 번호를 아예 없앤다.
  async _voice(counselorId, rate) {
    if (!window.RtcCall) { this._setStatus('통화 모듈을 불러오지 못했어요'); return; }
    this._humanCounselorId = counselorId;
    window.RtcCall.onEvent = (type, d) => {
      if (type === 'ringing')  this._setStatus('전화 거는 중…');
      if (type === 'peer-ringing') this._setStatus('통화 대기 중…'); // 상대 기기에서 벨이 울리기 시작
      if (type === 'unstable') {
        // 네트워크가 흔들린다 — 타이머는 유지하되 회색으로, 배너로 알린다
        this._setStatus('연결이 불안정합니다… 다시 잇는 중');
        const ck = document.getElementById('call-clock');
        if (ck) ck.style.color = 'rgba(255,255,255,0.45)';
      }
      if (type === 'audio-blocked') this._setStatus('🔇 소리가 막혔어요 — 화면을 한 번 탭해주세요');
      if (type === 'audio-ok') this._setStatus('통화 중');
      // 연결은 됐는데 소리가 안 오간다 — 어느 쪽이 막혔는지 이름을 붙여준다
      if (type === 'no-audio') this._setStatus(
        d.side === 'out' ? '🎤 내 목소리가 안 나가요 — 음소거·마이크 권한을 확인해주세요'
        : d.side === 'in' ? '🔈 상대 목소리가 오지 않아요 — 볼륨을 올려보세요'
        : '소리가 오가지 않아요 — 잠시 후 다시 걸어주세요');
      if (type === 'stable') {
        this._setStatus('통화 중');
        const ck = document.getElementById('call-clock');
        if (ck) ck.style.color = '';
      }
      if (type === 'connected') {
        this._setStatus('통화 중');
        if (window.App && window.App.ringStop) window.App.ringStop();
        this._startHumanBilling(); // 받았다 — 이제부터가 통화고, 이제부터가 과금이다
      }
      if (type === 'tick') {
        const el = document.getElementById('call-clock');
        if (el) {
          const s = Math.floor(d.ms / 1000);
          el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        }
        const sp = document.getElementById('call-spent');
        if (sp && d.spent) sp.textContent = d.spent.toLocaleString() + '캐시 사용 중';
      }
      if (type === 'remote-hangup') this.end(this._connected ? '상담사가 통화를 종료했어요' : '상담사가 지금 받기 어려워요.\n채팅으로 남겨보시면 확인 후 연락드려요.');
      if (type === 'error') {
        this._setStatus(d.message || '연결하지 못했어요');
        if (window.App && window.App.ringStop) window.App.ringStop(); // 실패했는데 벨만 울리면 잔인하다
      }
    };
    const ok = await window.RtcCall.call({
      counselorId, clientId: window.App.clientId(), rate: rate || 0
    });
    if (!ok) {
      // 구체적 이유(권한·거절 메시지)가 이미 화면에 있으면 덮지 않는다
      const cur = (document.getElementById('call-status') || {}).textContent || '';
      if (!cur || /전화 거는 중|연결 중/.test(cur)) this._setStatus('연결하지 못했어요 — 채팅으로 남겨보세요');
      if (window.App && window.App.ringStop) window.App.ringStop();
    }
  },

  // 통화 결과를 내 채팅방에 칩으로 남긴다 — '통화 12:34' / '부재중 전화'.
  //  상담사 쪽 기록은 서버(rtc/end)가 이미 남기므로 여기서 또 보내면 이중이 된다.
  _logCall(c, connected, secs) {
    try {
      const dur = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      const key = 'cbt_hchat_' + c.id;
      const msgs = window.Storage._safeGet(key, []) || [];
      msgs.push({ role: 'call', ok: connected, text: connected ? `통화 ${dur}` : '부재중 전화', ts: Date.now() });
      window.Storage._safeSet(key, msgs.slice(-200));
    } catch (e) {}
  },

  _renderHumanOverlay(c, prepaid) {
    const old = document.getElementById('call-overlay');
    if (old) old.remove();
    // 네이티브 앱이면 진짜 수화기/스피커 전환이 되고, 웹이면 대부분 불가라 버튼을 숨긴다
    const speakerable = !!this._native() || ('setSinkId' in HTMLMediaElement.prototype);
    const btn = (id, label, svg) => `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.35rem;">
        <button id="${id}" style="width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
          background: rgba(255,255,255,0.2); color: #fff; display: inline-flex; align-items: center; justify-content: center;">${svg}</button>
        <span id="${id}-lb" style="font-size: 0.72rem; color: rgba(255,255,255,0.75);">${label}</span>
      </div>`;
    const ov = document.createElement('div');
    ov.id = 'call-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10001; background: linear-gradient(160deg, #37554六 0%, #2e4237 45%, #1d2c24 100%); display: flex; flex-direction: column; align-items: center; padding: calc(1rem + env(safe-area-inset-top)) 1.5rem calc(2.2rem + env(safe-area-inset-bottom)); color: #f7f3ea;'.replace('37554六', '37554a');
    ov.innerHTML = `
      <button id="call-min" title="최소화" style="all: unset; align-self: flex-start; cursor: pointer; padding: 0.5rem; line-height: 0; color: rgba(255,255,255,0.85);">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div style="flex: 0 0 auto; margin-top: 6vh; text-align: center; width: 100%;">
        <div style="width: 120px; height: 120px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center;
                    background: rgba(255,255,255,0.14); border: 2px solid rgba(255,255,255,0.45); font-size: 2.6rem; font-weight: 800; color: #fff;
                    animation: callPulse 2.2s ease-in-out infinite;">${String(c.name || '상').charAt(0)}</div>
        <h2 style="margin: 1rem 0 0.15rem; font-size: 1.5rem; font-weight: 600;">${String(c.name || '상담사').replace(/</g, '&lt;')}</h2>
        <p style="margin: 0 0 0.6rem; font-size: 0.8rem; color: rgba(255,255,255,0.6);">${String(c.hospital || '').replace(/</g, '&lt;')}</p>
        <div id="call-status" style="font-size: 0.94rem; color: rgba(255,255,255,0.7);">전화 거는 중…</div>
        <div id="call-clock" style="font-size: 1.35rem; font-weight: 700; margin-top: 0.35rem; font-variant-numeric: tabular-nums;">00:00</div>
        <p id="call-spent" style="margin: 0.7rem 0 0; font-size: 0.8rem; color: #f5c74e; font-weight: 700;">${prepaid ? '회기권(예약 30분) 이용 중 · 추가 과금 없음' : `연결 전 무료 · 연결 후 30초당 ${window.Marketplace.callRateFor(c).toLocaleString()}캐시`}</p>
        <p id="call-audio-hint" style="margin: 0.5rem auto 0; max-width: 250px; font-size: 0.7rem; line-height: 1.5; color: rgba(255,255,255,0.5);">${this._native() ? '📞 귀에 대고 통화하세요 · 스피커는 아래 버튼으로' : '🔈 스피커로 들려요 · 조용한 곳이 아니면 이어폰을 끼면 훨씬 편해요'}</p>
      </div>
      <div style="flex: 1 1 auto;"></div>
      <div style="display: flex; align-items: flex-start; justify-content: center; gap: 2rem; margin-bottom: 1.4rem;">
        ${btn('call-mute', '음소거', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/></svg>')}
        ${speakerable ? btn('call-spk', '스피커', '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8"/></svg>') : ''}
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.35rem;">
        <button onclick="window.CallTalk.end()" title="통화 종료"
          style="width: 64px; height: 64px; border-radius: 50%; border: none; background: #ea3323; color: #fff; cursor: pointer;
                 display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 22px rgba(0,0,0,0.4);">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="transform: rotate(135deg);"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
        </button>
        <span style="font-size: 0.72rem; color: rgba(255,255,255,0.7);">종료</span>
      </div>
      <style>@keyframes callPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }</style>`;
    document.body.appendChild(ov);
    document.getElementById('call-min').addEventListener('click', () => this.minimize());
    document.getElementById('call-mute').addEventListener('click', () => this.toggleMute());
    const spk = document.getElementById('call-spk');
    if (spk) spk.addEventListener('click', () => this.toggleSpeaker());
  },

  // ==========================================================================
  //  상담사가 건 전화를 받는다 — 수신 화면(수락 펄스·거절/수락 64dp) → 통화
  //  요금 0 (상담사 발신은 내담자에게 과금하지 않는다)
  // ==========================================================================
  showIncoming(call) {
    if (this._active || document.getElementById('call-incoming')) return;
    const name = String(call.counselorName || '상담사').replace(/</g, '&lt;');
    const ov = document.createElement('div');
    ov.id = 'call-incoming';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10006; background: linear-gradient(160deg, #37554a 0%, #2e4237 45%, #1d2c24 100%); display: flex; flex-direction: column; align-items: center; padding: calc(3rem + env(safe-area-inset-top)) 1.5rem calc(2.6rem + env(safe-area-inset-bottom)); color: #f7f3ea;';
    ov.innerHTML = `
      <div style="margin-top: 6vh; text-align: center;">
        <div style="width: 120px; height: 120px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center;
                    background: rgba(255,255,255,0.14); border: 2px solid rgba(255,255,255,0.45); font-size: 2.6rem; font-weight: 800;
                    animation: callPulse 2.2s ease-in-out infinite;">${name.charAt(0)}</div>
        <h2 style="margin: 1rem 0 0.15rem; font-size: 1.5rem; font-weight: 600;">${name}</h2>
        <p style="margin: 0; font-size: 0.94rem; color: rgba(255,255,255,0.7);">음성통화 수신 중…</p>
      </div>
      <div style="flex: 1;"></div>
      <div style="display: flex; gap: 4.5rem;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem;">
          <button id="inc-reject" style="width: 64px; height: 64px; border-radius: 50%; border: none; background: #ea3323; color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 22px rgba(0,0,0,0.4);">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" style="transform: rotate(135deg);"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button><span style="font-size: 0.8rem; color: rgba(255,255,255,0.75);">거절</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.4rem;">
          <button id="inc-accept" style="width: 64px; height: 64px; border-radius: 50%; border: none; background: #4f8a6b; color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 22px rgba(0,0,0,0.4); animation: incPulse 1.2s ease-in-out infinite;">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button><span style="font-size: 0.8rem; color: rgba(255,255,255,0.75);">수락</span>
        </div>
      </div>
      <style>@keyframes callPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      @keyframes incPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }</style>`;
    document.body.appendChild(ov);
    if (window.App && window.App.ringStart) window.App.ringStart();
    const stopRing = () => { if (window.App && window.App.ringStop) window.App.ringStop(); };
    // 상담사가 취소했는데 벨이 계속 울리면 안 된다 — 2.5초마다 생사 확인
    const watch = setInterval(async () => {
      if (!document.getElementById('call-incoming')) { clearInterval(watch); return; }
      try {
        const st = await window.Api.json('/api/rtc/state?callId=' + encodeURIComponent(call.id));
        if (st && st.ended) {
          clearInterval(watch);
          stopRing();
          ov.remove();
          if (window.App) window.App.showRecordToast('상담사님이 통화를 취소했어요');
        }
      } catch (e) {}
    }, 2500);
    document.getElementById('inc-reject').addEventListener('click', () => {
      clearInterval(watch);
      stopRing(); ov.remove();
      try {
        window.Api.f('/api/rtc/end', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.id, by: 'client' }) }).catch(() => {});
      } catch (e) {}
    });
    document.getElementById('inc-accept').addEventListener('click', () => {
      clearInterval(watch);
      stopRing(); ov.remove();
      this.receiveHuman(call);
    });
  },

  async receiveHuman(call) {
    if (this._active) return;
    if (window.SleepSounds) window.SleepSounds.stop(true);
    this._active = true;
    this._human = true;
    this._connected = false;
    this._rate = 0;                 // 상담사 발신 = 내담자 무료
    this._prepaid = false;
    this._billStarted = false;
    this._startTs = Date.now();
    this._spent = 0;
    this._counselorId = null;       // 회선 점유는 발신 쪽이 했다 — 해제도 그쪽 몫
    this._humanCounselorId = call.counselorId;
    this._pendingCounselor = { id: call.counselorId, name: call.counselorName || '상담사', hospital: '' };
    this._renderHumanOverlay(this._pendingCounselor, true);
    this._setStatus('연결 중…');
    const sp = document.getElementById('call-spent');
    if (sp) sp.textContent = '상담사님이 건 전화 · 무료';
    this._clockTimer = setInterval(() => this._updateClock(), 1000);
    if (!window.RtcCall) { this._setStatus('통화 모듈을 불러오지 못했어요'); return; }
    window.RtcCall.onEvent = (type, d) => {
      if (type === 'connected') { this._setStatus('통화 중'); this._startHumanBilling(); }
      if (type === 'unstable') this._setStatus('연결이 불안정합니다… 다시 잇는 중');
      if (type === 'stable') this._setStatus('통화 중');
      if (type === 'audio-blocked') this._setStatus('🔇 소리가 막혔어요 — 화면을 한 번 탭해주세요');
      if (type === 'audio-ok') this._setStatus('통화 중');
      // 연결은 됐는데 소리가 안 오간다 — 어느 쪽이 막혔는지 이름을 붙여준다
      if (type === 'no-audio') this._setStatus(
        d.side === 'out' ? '🎤 내 목소리가 안 나가요 — 음소거·마이크 권한을 확인해주세요'
        : d.side === 'in' ? '🔈 상대 목소리가 오지 않아요 — 볼륨을 올려보세요'
        : '소리가 오가지 않아요 — 잠시 후 다시 걸어주세요');
      if (type === 'remote-hangup') this.end('상담사가 통화를 종료했어요');
      if (type === 'error') this._setStatus(d.message || '연결하지 못했어요');
    };
    this._wakeLock();
    const ok = await window.RtcCall.answer({ room: call.room, callId: call.id, as: 'client' });
    if (!ok) { this._setStatus('마이크를 확인해주세요'); return; }
    // 받았는데 상대(발신자)가 얼어붙어 있으면 '연결 중'이 영원히 남는다 — 20초면 접는다
    clearTimeout(this._connTimer);
    this._connTimer = setTimeout(() => {
      if (this._active && !this._connected) this.end('상담사와 연결이 이어지지 않았어요.\n상담사님께 부재중으로 전달됐어요 — 곧 다시 걸려올 거예요.');
    }, 20000);
  },

  // === 음소거 — 내 마이크 트랙만 잠근다 (연결은 그대로) ===
  _muted: false,
  toggleMute() {
    try {
      this._muted = !this._muted;
      if (window.RtcCall && window.RtcCall.stream) {
        window.RtcCall.stream.getAudioTracks().forEach(t => { t.enabled = !this._muted; });
      }
      const b = document.getElementById('call-mute'), lb = document.getElementById('call-mute-lb');
      if (b) { b.style.background = this._muted ? '#ffffff' : 'rgba(255,255,255,0.2)'; b.style.color = this._muted ? '#1d2c24' : '#fff'; }
      if (lb) lb.textContent = this._muted ? '음소거 중' : '음소거';
    } catch (e) {}
  },

  // === 스피커 ↔ 수화기 ===
  //  네이티브(스토어 앱)에서는 진짜로 귀에 대고 통화할 수 있다.
  //  웹에서는 브라우저가 라우팅을 안 열어줘서 스피커 고정이다 — 버튼도 숨긴다.
  _native() {
    try {
      const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AudioRoute;
      return (p && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? p : null;
    } catch (e) { return null; }
  },

  _spk: false,
  async toggleSpeaker() {
    try {
      const nat = this._native();
      if (nat) {
        this._spk = !this._spk;
        const r = await nat.setSpeaker({ on: this._spk }).catch(() => null);
        if (r && typeof r.on === 'boolean') this._spk = r.on;
      } else {
        const el = window.RtcCall && window.RtcCall.remote;
        if (!el || !el.setSinkId) return;
        this._spk = !this._spk;
        await el.setSinkId(this._spk ? 'default' : '').catch(() => {});
      }
      const b = document.getElementById('call-spk'), lb = document.getElementById('call-spk-lb');
      if (b) { b.style.background = this._spk ? '#ffffff' : 'rgba(255,255,255,0.2)'; b.style.color = this._spk ? '#1d2c24' : '#fff'; }
      if (lb) lb.textContent = this._spk ? '스피커 켬' : '스피커';
      const hint = document.getElementById('call-audio-hint');
      if (hint) hint.textContent = this._spk ? '🔈 스피커로 들려요' : '📞 귀에 대고 통화하세요 · 스피커는 위 버튼으로';
    } catch (e) {}
  },

  // === 최소화 — 통화는 이어진 채, 화면 위 32px 바로 줄어든다 ===
  minimize() {
    const ov = document.getElementById('call-overlay');
    if (!ov) return;
    ov.style.display = 'none';
    let bar = document.getElementById('call-minibar');
    if (!bar) {
      bar = document.createElement('button');
      bar.id = 'call-minibar';
      bar.style.cssText = 'all: unset; box-sizing: border-box; position: fixed; top: 0; left: 0; right: 0; z-index: 10000;'
        + 'height: calc(32px + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top);'
        + 'background: #2e4237; color: #fff; font-size: 0.8rem; font-weight: 700; text-align: center; cursor: pointer;'
        + 'display: flex; align-items: center; justify-content: center; gap: 0.4rem;';
      bar.addEventListener('click', () => this.restore());
      document.body.appendChild(bar);
    }
    this._updateMiniBar();
  },

  restore() {
    const ov = document.getElementById('call-overlay');
    if (ov) ov.style.display = 'flex';
    const bar = document.getElementById('call-minibar');
    if (bar) bar.remove();
  },

  _updateMiniBar() {
    const bar = document.getElementById('call-minibar');
    if (!bar) return;
    const clock = (document.getElementById('call-clock') || {}).textContent || '00:00';
    bar.textContent = this._connected ? `📞 통화 중 ${clock} — 탭하면 돌아가요` : '📞 연결 중… — 탭하면 돌아가요';
  },

  _updateClock() {
    const el = document.getElementById('call-clock');
    if (!el) return;
    // 벨이 울리는 동안은 00:00 — 통화 시간은 연결된 순간부터만 센다.
    //  (연결 전에 숫자가 올라가면 요금이 나가는 줄 알고 놀란다. 실제로도 안 나간다)
    if (!this._connected) { el.textContent = '00:00'; this._updateMiniBar(); return; }
    const s = Math.max(0, Math.floor((Date.now() - this._startTs) / 1000));
    // 1시간을 넘으면 1:02:33 처럼 시(時)를 붙인다
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    el.textContent = h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    this._updateMiniBar();
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
 this._setStatus('듣고 있어요');

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
    if (window.Sfx) window.Sfx.play('close');
    if (!this._active) return;
    // 흔적용 스냅샷 — 아래에서 상태를 지우기 전에 떠 둔다
    const humanCall = this._human;
    const connected = !!this._connected;
    const callSecs = connected ? Math.max(0, Math.floor((Date.now() - this._startTs) / 1000)) : 0;
    const callee = this._pendingCounselor;
    // 인간 상담이었다면 서버 회선 해제 → 다른 내담자가 걸 수 있게
    if (this._human && this._counselorId) {
      try {
        window.Api.f('/api/call/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counselorId: this._counselorId, clientId: window.App ? window.App.clientId() : '' })
        }).catch(() => {});
      } catch (e) {}
      if (window.Marketplace) window.Marketplace.fetchPresence(true);
      this._counselorId = null;
    }
    // 통화가 끝나거나 못 받았어도 대화는 이어져야 한다 — 채팅방으로 보낸다
    const wasWith = this._humanCounselorId || null;
    this._humanCounselorId = null;
    this._active = false;
    this._human = false;
    this._rate = null;
    this._billStarted = false;
    this._prepaid = false;
    this._pendingCounselor = null;
    // 통화는 채팅방에 흔적을 남긴다 — 카톡처럼 '통화 12:34' / '부재중 전화'.
    //  기록이 없으면 부재중인 줄도 모르고, 상담사는 회신할 이유를 못 본다.
    if (humanCall && callee) this._logCall(callee, connected, callSecs);
    // 상담 내역(마이)에도 '몇 분 상담했는지'가 남아야 한다 — 최근 로그에 결과를 채운다
    if (humanCall && callee) {
      try {
        const logs = window.Storage._safeGet('cbt_call_logs', []) || [];
        let recent = logs.find(l => l.counselorId === callee.id && !l.result);
        // 상담사가 걸어온 통화는 startHuman 을 안 거쳐 로그가 없다 — 여기서 만든다
        if (!recent && connected) {
          recent = { ts: Date.now() - callSecs * 1000, counselorId: callee.id, name: callee.name, mode: '상담사 발신' };
          logs.unshift(recent);
        }
        if (recent) {
          recent.result = connected ? 'done' : 'missed';
          recent.secs = callSecs;
          recent.spent = this._spent;
          window.Storage._safeSet('cbt_call_logs', logs.slice(0, 50));
        }
        // 1분 넘게 실제 상담했다면 — 기억이 생생할 때 딱 한 번 리뷰를 청한다
        if (connected && callSecs >= 60 && recent && window.App && window.App.writeCallReview) {
          const reviews = window.Storage._safeGet('cbt_reviews', {}) || {};
          if (!reviews['call_' + recent.ts]) {
            const ts = recent.ts;
            setTimeout(() => { try { window.App.writeCallReview(ts); } catch (e) {} }, 1600);
          }
        }
      } catch (e) {}
    }
    // 인간 상담사 통화(RTC)였으면 회선을 끊고, 상대 채팅방으로 안내한다
    if (window.RtcCall && window.RtcCall.callId) {
      window.RtcCall.hangup('client').then(info => {
        if (info && info.noAnswer && window.App && window.App.showRecordToast) {
          window.App.showRecordToast('연결되지 않았어요. 채팅으로 남겨보세요');
        }
        if (wasWith && window.App && window.App.openHumanChat) {
          setTimeout(() => window.App.openHumanChat(wasWith), 400);
        }
      });
    } else if (wasWith && window.App && window.App.openHumanChat) {
      setTimeout(() => window.App.openHumanChat(wasWith), 400);
    }
    if (window.App && window.App.ringStop) window.App.ringStop();
    clearInterval(this._billTimer);
    clearInterval(this._clockTimer);
    clearTimeout(this._prepaidTimer);
    clearTimeout(this._warnTimer);
    clearTimeout(this._noAnswerTimer);
    clearTimeout(this._connTimer);
    this._wakeUnlock();
    try { if (this._rec) this._rec.abort(); } catch (e) {}
    if (window.Voice) {
      window.Voice.stopSpeaking();
      if (this._ttsWasEnabled !== null) window.Voice.isTtsEnabled = this._ttsWasEnabled;
    }
    const ov = document.getElementById('call-overlay');
    if (ov) ov.remove();
    const mb = document.getElementById('call-minibar');
    if (mb) mb.remove();
    this._connected = false;
    this._muted = false;
    // 종료 UX — 카톡처럼: "통화 종료"를 1.2초 보여주고 채팅방으로 조용히 복귀.
    //  (요약 숫자는 채팅의 '통화 N분 N초' 칩이 이미 말해준다. 팝업으로 또 막지 않는다)
    if (humanCall) {
      const fin = document.createElement('div');
      fin.style.cssText = 'position: fixed; inset: 0; z-index: 10002; background: rgba(20,28,26,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; color: #f7f3ea;';
      fin.innerHTML = `<div style="font-size: 1.15rem; font-weight: 700;">${connected ? '통화 종료' : '연결되지 않았어요'}</div>
        <div style="font-size: 0.82rem; color: rgba(255,255,255,0.65);">${connected ? `${Math.floor(callSecs / 60)}분 ${callSecs % 60}초 · ${this._spent.toLocaleString()}캐시` : '부재중으로 남겨뒀어요 — 채팅으로 이어보세요'}</div>`;
      document.body.appendChild(fin);
      setTimeout(() => fin.remove(), 1200);
    } else {
      // AI 보이스톡은 기존 요약 유지 (정직한 숫자)
      window.UI.alert(connected
        ? `${reason ? reason + '\n\n' : ''}통화 종료\n· 통화 시간: ${Math.floor(callSecs / 60)}분 ${callSecs % 60}초\n· 사용 캐시: ${this._spent.toLocaleString()}캐시`
        : `${reason ? reason + '\n\n' : ''}통화가 연결되지 않았어요\n· 통화 시간: 0초\n· 사용 캐시: 0캐시`);
    }
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
 <button onclick="window.CallTalk.end()"style="width: 68px; height: 68px; border-radius: 50%; border: none; background: #d9534f; color: #fff; font-size: 1.6rem; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.35);"></button>
      <style>@keyframes callPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }</style>`;
    document.body.appendChild(ov);
  }
};
