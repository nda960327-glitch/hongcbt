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
  // 상담 세션 — 통화 중 '유료 구간'. null 이면 지금은 무료 통화다.
  //  { rate, at, callId, name, ended, cut }
  _consult: null,
  _consultAsking: false,

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
    // 사람 상담사와의 통화에서는 여기서 돈을 세지 않는다.
    //  폰의 30초 타이머로 요금을 굴리던 구조가, 화면 잠김 한 번에
    //  3분 55초 통화를 0원으로 만들었다(실사고). 사람 통화의 시간은 서버가 잰다.
    //  이 함수는 이제 AI 보이스톡 전용이다.
    if (this._human) return;
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

    // 전화를 거는 것은 이제 공짜다. 잔액이 없다고 통화를 막지 않는다 —
    //  돈이 붙는 구간은 상담사가 [상담 시작]을 누르고 내가 동의한 뒤부터다.
    //  다만 지금 잔액으로는 상담을 시작할 수 없다는 것은 미리 귀띔한다.
    if (!prepaid && window.Wallet && window.Wallet.balance() < liveRate * 2) {
      if (window.App && window.App.showRecordToast) {
        window.App.showRecordToast(`통화는 무료예요 · 상담을 시작하려면 ${(liveRate * 2).toLocaleString()}캐시 이상 필요해요`);
      }
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
    this._consult = null;           // 지난 통화의 상담 상태가 새 통화에 묻어오면 안 된다
    this._consultAsking = false;
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

  // 통화가 붙었다 — 시계를 0부터 다시 센다.
  //  이름은 그대로 두지만 하는 일이 바뀌었다: 여기서 더는 돈을 세지 않는다.
  //  (예전에는 여기서 30초 타이머가 지갑을 깎았다. 화면이 잠기면 그 타이머가
  //   얼어붙어 3분 55초 통화가 0원으로 끝난 사고가 실제로 났다)
  _startHumanBilling() {
    if (this._billStarted || !this._active) return;
    this._billStarted = true;
    this._connected = true;
    clearTimeout(this._noAnswerTimer);
    clearTimeout(this._connTimer);
    this._startTs = Date.now(); // 통화 시간도 연결부터 센다 — 연결음은 통화가 아니다
    const el = document.getElementById('call-spent');
    if (el && !this._consult) {
      el.textContent = this._prepaid
        ? '회기권(예약 30분) 이용 중 · 추가 과금 없음'
        : '통화는 무료예요 · 상담을 시작하면 그때부터 요금이 붙어요';
    }
    if (this._prepaid) {
      // 회기권 = 예약된 30분. 5분 전에 알려주고, 지나면 알려만 준다.
      //  연장 과금을 앱이 마음대로 시작하지 않는다 — 유료 구간을 여는 건
      //  이제 상담사의 [상담 시작]과 내담자의 동의, 그 두 개뿐이다.
      this._warnTimer = setTimeout(() => { if (this._active) this._setStatus('⏰ 상담 종료 5분 전이에요'); }, 25 * 60000);
      this._prepaidTimer = setTimeout(() => {
        if (!this._active) return;
        this._setStatus('예약된 30분이 지났어요');
        const e2 = document.getElementById('call-spent');
        if (e2 && !this._consult) e2.textContent = '예약 시간이 끝났어요 · 이어서 상담하면 상담사님이 [상담 시작]으로 안내해요';
      }, 30 * 60000);
    }
  },

  // ==========================================================================
  //  상담 세션 — 통화 안의 '유료 구간'
  //
  //  통화는 무료다. 잘못 걸 수도 있고, 안부만 물을 수도 있고, "지금 되세요?"
  //  하고 약속만 잡을 수도 있다. 그런 통화에 돈을 받으면 안 된다.
  //  그래서 유료 구간을 따로 연다 — 상담사가 [상담 시작]을 누르면 여기로
  //  신호가 오고, 내가 동의한 순간부터 서버 시계가 돈다.
  //  차감은 통화가 끝날 때 서버가 잰 시간으로 딱 한 번 일어난다.
  // ==========================================================================

  // 상담사의 제안이 도착했다 (서버가 발행한 consult-offer 신호)
  async _consultOffer(d) {
    if (!this._active) return;
    if (this._consult && !this._consult.ended) return;  // 이미 상담 중이면 다시 묻지 않는다
    if (this._consultAsking) return;                    // 폴링이 같은 신호를 두 번 집어와도 팝업은 하나
    this._consultAsking = true;
    const rate = Math.max(0, Number(d && d.rate) || 0);
    const name = (d && d.counselorName)
      || (this._pendingCounselor && this._pendingCounselor.name) || '상담사';
    const callId = (window.RtcCall && window.RtcCall.callId) || (d && d.callId) || '';
    try {
      const bal = window.Wallet ? window.Wallet.balance() : 0;
      // 1분치(30초 두 단위)도 없으면 시작하게 두면 안 된다 —
      //  시작하자마자 "캐시가 다 됐어요"로 끊기는 편이 더 나쁘다.
      if (rate > 0 && bal < rate * 2) {
        this._consultDecline(callId, 'no-cash');
        await window.UI.alert({
          title: '캐시가 부족해요',
          body: `상담은 30초당 ${rate.toLocaleString()}캐시예요.\n지금 잔액 ${bal.toLocaleString()}캐시로는 시작할 수 없어요.\n통화는 그대로 이어져요 — 충전한 뒤에 다시 시작할 수 있어요.`,
          okLabel: '충전하러 가기'
        });
        // 통화는 끊지 않는다. 미니바로 접고 충전 화면을 열어준다.
        this.minimize();
        if (window.App && window.App.switchTab) window.App.switchTab('mypage');
        if (window.Wallet && window.Wallet.renderCard) window.Wallet.renderCard();
        return;
      }
      const ok = await window.UI.confirm({
        title: `${name} 상담사가 상담을 시작하려고 해요`,
        body: `동의하면 지금부터 시간이 계산되고, 30초당 ${rate.toLocaleString()}캐시가 사용돼요.\n통화 자체는 무료예요 — 동의하지 않아도 대화는 그대로 이어집니다.`,
        okLabel: '동의하고 시작', cancelLabel: '지금은 아니요'
      });
      if (!ok) { this._consultDecline(callId, 'no'); return; }
      const r = await window.Api.json('/api/rtc/consult/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, clientId: window.App ? window.App.clientId() : '' })
      }).catch(() => null);
      if (!r || !r.ok) {
        if (window.App && window.App.showRecordToast) window.App.showRecordToast('상담을 시작하지 못했어요');
        return;
      }
      // 요금은 서버가 정한 값을 쓴다 — 신호에 실려온 숫자가 아니라
      this._consultStart({ rate: r.rate || rate, callId, name });
    } catch (e) {
    } finally { this._consultAsking = false; }
  },

  _consultDecline(callId, why) {
    try {
      window.Api.f('/api/rtc/consult/decline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId, clientId: window.App ? window.App.clientId() : '', why: why || 'no' })
      }).catch(() => {});
    } catch (e) {}
  },

  // 시작 시각은 화면 표시용으로만 내 시계를 쓴다. 실제 청구는 서버가 잰
  //  consult_start ~ consult_end 로만 계산되므로 몇 초 어긋나도 돈은 정확하다.
  _consultStart(o) {
    this._consult = {
      rate: Math.max(0, Number(o.rate) || 0), at: Date.now(),
      callId: o.callId || '', name: o.name || '', ended: false, cut: false
    };
    this._setStatus('상담 중');
    this._consultTick();
    this._updateMiniBar();
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('상담을 시작했어요');
  },

  // 화면의 '지금까지 얼마'. 어디까지나 추정이다 — 진짜 숫자는 끝날 때 서버가 준다.
  _consultTick() {
    const c = this._consult;
    if (!c || c.ended) return;
    const ms = Math.max(0, Date.now() - c.at);
    const s = Math.floor(ms / 1000);
    const est = c.rate ? Math.ceil(ms / 30000) * c.rate : 0;
    const el = document.getElementById('call-spent');
    if (el) {
      el.textContent = `상담 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
        + ` · 사용 ${est.toLocaleString()}캐시(예상)`;
    }
    // 잔액 소진 — 서버는 내 잔액을 모른다(캐시는 이 기기에 있다).
    //  넘기 전에 내가 상담을 닫는다. 통화 자체는 그대로 이어진다.
    if (!c.cut && c.rate > 0 && window.Wallet && est >= window.Wallet.balance()) {
      c.cut = true;
      this._setStatus('캐시가 다 됐어요 — 상담이 곧 종료돼요');
      this.endConsult('no-cash');
    }
  },

  // 상담만 끝낸다 — 통화는 유지된다(마무리 인사가 남았다)
  async endConsult(why) {
    const c = this._consult;
    if (!c || c.ended) return;
    c.ended = true;
    const callId = c.callId || (window.RtcCall && window.RtcCall.callId) || '';
    const r = await window.Api.json('/api/rtc/consult/end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, clientId: window.App ? window.App.clientId() : '' })
    }).catch(() => null);
    if (r && r.ok) this._settleConsult(callId, r.seconds || 0, r.charge || 0, c.name);
    this._consultDone(r ? (r.seconds || 0) : 0, r ? (r.charge || 0) : 0);
    if (why === 'no-cash' && window.App && window.App.showRecordToast) {
      window.App.showRecordToast('캐시가 다 되어 상담을 마쳤어요 — 통화는 이어져요');
    }
  },

  // 상담사가 [상담 완료]를 눌렀거나 서버가 자동 마감했다 (consult-ended 신호)
  _consultEnded(d) {
    const callId = (d && d.callId) || (this._consult && this._consult.callId) || '';
    const secs = Number(d && d.seconds) || 0;
    const charge = Number(d && d.charge) || 0;
    const name = (this._consult && this._consult.name) || '';
    if (this._consult) this._consult.ended = true;
    this._settleConsult(callId, secs, charge, name);
    this._consultDone(secs, charge);
  },

  _consultDone(secs, charge) {
    const el = document.getElementById('call-spent');
    if (el) {
      el.textContent = charge > 0
        ? `상담 마침 ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')} · ${charge.toLocaleString()}캐시`
        : '상담이 마무리됐어요 · 통화는 무료로 이어져요';
    }
    if (this._connected) this._setStatus('통화 중');
    this._updateMiniBar();
  },

  // 지갑 차감은 이 함수 하나에서만 일어난다.
  //  서버가 잰 시간·요금이 진실이고, 차감한 callId 를 기기에 적어 두므로
  //  신호·종료 응답·시작 시 복구가 겹쳐 와도 같은 통화가 두 번 빠지지 않는다.
  _settleConsult(callId, seconds, charge, name) {
    charge = Math.max(0, Math.round(Number(charge) || 0));
    if (!callId || !charge) return false;
    try {
      const done = window.Storage._safeGet('cbt_call_billed', []) || [];
      if (done.indexOf(callId) >= 0) return false;
      done.unshift(callId);
      window.Storage._safeSet('cbt_call_billed', done.slice(0, 300));
    } catch (e) { return false; }
    if (!window.Wallet) return false;
    // 잔액보다 더 뺄 수는 없다 — 마이너스 지갑은 만들지 않는다
    const amt = Math.min(charge, window.Wallet.balance());
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    const label = `음성 상담 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
      + (name ? ' · ' + name : '');
    if (amt > 0) window.Wallet.spend(amt, label);
    this._spent = (this._spent || 0) + amt;
    return true;
  },

  // 통화가 완전히 끝났다 — 서버가 알려준 상담 시간·요금으로 지갑을 맞춘다.
  //  내가 끊었든·상대가 끊었든·서버가 자동 마감했든 길은 여기 하나로 모인다.
  _onCallEnded(info) {
    const c = (info && info.consult) || null;
    const name = (this._consult && this._consult.name) || this._lastConsultName || '';
    if (c && c.charge > 0 && info && info.callId) {
      this._settleConsult(info.callId, c.seconds || 0, c.charge, name);
      // 상담 내역의 숫자도 서버 값으로 고쳐 적는다 — 지갑에서 빠진 액수와
      //  화면에 적힌 액수가 다르면 그것만으로 신뢰가 무너진다.
      try {
        const logs = window.Storage._safeGet('cbt_call_logs', []) || [];
        if (logs[0]) {
          logs[0].spent = c.charge;
          logs[0].consultSecs = c.seconds || 0;
          window.Storage._safeSet('cbt_call_logs', logs);
        }
      } catch (e) {}
    }
    // 종료 화면이 아직 떠 있으면 정확한 숫자로 고쳐 적는다
    const line = document.getElementById('call-fin-line');
    if (line && c && c.had) {
      line.textContent = `음성 상담 ${String(Math.floor((c.seconds || 0) / 60)).padStart(2, '0')}:${String((c.seconds || 0) % 60).padStart(2, '0')}`
        + ` · ${(c.charge || 0).toLocaleString()}캐시`;
    }
  },

  // 통화 이벤트 중 '상담 세션'에 해당하는 것만 골라 처리한다.
  //  발신(_voice)과 수신(receiveHuman)이 같은 규칙을 써야 하므로 한 곳에 모았다.
  _consultEvent(type, d) {
    if (type === 'consult-offer') { this._consultOffer(d); return true; }
    if (type === 'consult-ended') { this._consultEnded(d); return true; }
    if (type === 'ended') { this._onCallEnded(d); return true; }
    return false;
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
      // 상담 세션(제안·마감)과 통화 종료 정산은 한 곳에서 처리한다
      if (this._consultEvent(type, d)) return;
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
        // 요금 줄은 상담 세션이 쓴다 — 통화 시간으로 계산한 금액을 여기 적으면
        //  '무료 통화'인데도 돈이 나가는 것처럼 보인다
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
  //  상담이었던 통화는 '음성 상담 MM:SS · N캐시', 아니면 그냥 '통화 MM:SS'.
  //  둘을 같은 문구로 적으면 나중에 "이 통화에 왜 돈이 나갔지"를 알 길이 없다.
  _logCall(c, connected, secs, consult) {
    try {
      const dur = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      const cs = consult && consult.secs ? consult.secs : 0;
      const cdur = `${String(Math.floor(cs / 60)).padStart(2, '0')}:${String(cs % 60).padStart(2, '0')}`;
      const text = !connected ? '부재중 전화'
        : consult ? `음성 상담 ${cdur}${consult.charge ? ` · ${consult.charge.toLocaleString()}캐시` : ''}`
        : `통화 ${dur}`;
      const key = 'cbt_hchat_' + c.id;
      const msgs = window.Storage._safeGet(key, []) || [];
      msgs.push({ role: 'call', ok: connected, text, ts: Date.now() });
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
      <div style="display: flex; align-items: center; width: 100%; gap: 0.5rem;">
        <button id="call-min" title="최소화" style="all: unset; cursor: pointer; padding: 0.5rem; line-height: 0; color: rgba(255,255,255,0.85);">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div style="flex: 1;"></div>
        <!-- 통화하면서 채팅을 친다 — 말로 못 하는 것(이름·날짜·링크)은 글로 보내야 한다.
             누르면 통화는 위쪽 미니바로 접히고 그 상담사와의 채팅방이 열린다. -->
        <button id="call-chat" title="채팅 보며 통화" style="all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.45rem 0.95rem; border-radius: 999px; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3);
          font-size: 0.8rem; font-weight: 700; color: #f7f3ea;">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-4.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z"/></svg>
          채팅
        </button>
      </div>
      <div style="flex: 0 0 auto; margin-top: 6vh; text-align: center; width: 100%;">
        <div style="width: 120px; height: 120px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center;
                    background: rgba(255,255,255,0.14); border: 2px solid rgba(255,255,255,0.45); font-size: 2.6rem; font-weight: 800; color: #fff;
                    animation: callPulse 2.2s ease-in-out infinite;">${String(c.name || '상').charAt(0)}</div>
        <h2 style="margin: 1rem 0 0.15rem; font-size: 1.5rem; font-weight: 600;">${String(c.name || '상담사').replace(/</g, '&lt;')}</h2>
        <p style="margin: 0 0 0.6rem; font-size: 0.8rem; color: rgba(255,255,255,0.6);">${String(c.hospital || '').replace(/</g, '&lt;')}</p>
        <div id="call-status" style="font-size: 0.94rem; color: rgba(255,255,255,0.7);">전화 거는 중…</div>
        <div id="call-clock" style="font-size: 1.35rem; font-weight: 700; margin-top: 0.35rem; font-variant-numeric: tabular-nums;">00:00</div>
        <p id="call-spent" style="margin: 0.7rem 0 0; font-size: 0.8rem; color: #f5c74e; font-weight: 700;">${prepaid ? '회기권(예약 30분) 이용 중 · 추가 과금 없음' : `통화는 무료예요 · 상담을 시작하면 30초당 ${window.Marketplace.callRateFor(c).toLocaleString()}캐시`}</p>
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
    document.getElementById('call-chat').addEventListener('click', () => this.openChat());
    document.getElementById('call-mute').addEventListener('click', () => this.toggleMute());
    const spk = document.getElementById('call-spk');
    if (spk) spk.addEventListener('click', () => this.toggleSpeaker());
  },

  // === 통화를 켜둔 채 상담사와의 채팅방으로 ===
  //  통화 화면이 화면을 다 덮으면 통화 중에는 아무 것도 쓸 수가 없다.
  //  접고(minimize) 그 상담사 방을 연다 — 통화는 끊기지 않는다.
  openChat() {
    const cid = this._humanCounselorId || (this._pendingCounselor && this._pendingCounselor.id) || null;
    this.minimize();
    if (!cid || !window.App || !window.App.openHumanChat) return;
    // 마켓 목록에 없는 상담사면 채팅방을 만들 수 없다 — 조용히 접기만 하고 이유를 말해준다
    const known = window.Marketplace && window.Marketplace.getCounselor(cid);
    if (!known) {
      if (window.App.showRecordToast) window.App.showRecordToast('이 상담사와의 채팅방을 아직 열 수 없어요');
      return;
    }
    window.App.openHumanChat(cid);
    this._syncMiniBarPad();
  },

  // === 통화 중 도착한 메시지 — 통화 화면 아래 한 줄, 3초 ===
  //  소리는 내지 않는다. 알림음이 통화 목소리를 덮으면 그게 더 큰 방해다.
  //  탭하면 통화를 접고 그 채팅방으로 간다.
  peekChat(name, text, counselorId) {
    try {
      const ov = document.getElementById('call-overlay');
      if (!ov || ov.style.display === 'none') return;   // 이미 접혀 있으면 채팅이 이미 보인다
      const old = document.getElementById('call-peek');
      if (old) old.remove();
      const el = document.createElement('button');
      el.id = 'call-peek';
      el.type = 'button';
      el.style.cssText = 'all: unset; box-sizing: border-box; position: absolute; left: 1rem; right: 1rem;'
        + 'bottom: calc(11rem + env(safe-area-inset-bottom)); cursor: pointer; text-align: left; z-index: 2;'
        + 'display: flex; align-items: center; gap: 0.6rem; background: rgba(255,255,255,0.96); color: #24302b;'
        + 'border-radius: 14px; padding: 0.6rem 0.85rem; box-shadow: 0 10px 26px rgba(0,0,0,0.35);';
      const esc = s => String(s == null ? '' : s).replace(/</g, '&lt;');
      el.innerHTML = `<span style="flex: 1; min-width: 0;">
          <b style="display: block; font-size: 0.72rem; color: #4f8a6b;">${esc(name || '상담사')}</b>
          <span style="display: block; font-size: 0.84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(text)}</span>
        </span>
        <span style="flex-shrink: 0; font-size: 0.72rem; font-weight: 800; color: #4f8a6b;">읽기 ›</span>`;
      el.addEventListener('click', () => { el.remove(); this.openChat(); });
      ov.appendChild(el);
      clearTimeout(this._peekTimer);
      this._peekTimer = setTimeout(() => {
        const e2 = document.getElementById('call-peek');
        if (e2) e2.remove();
      }, 3000);
    } catch (e) {}
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
    // 앱 알림이 울리는 중에 이 화면이 떴다면 벨이 두 겹으로 겹친다 — 알림 쪽을 내린다
    this._stopNativeRing(call.id);
    const stopRing = () => { if (window.App && window.App.ringStop) window.App.ringStop(); this._stopNativeRing(call.id); };
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
    // 알림에서 '받기'로 바로 들어온 길도 있다 — 그때는 수신화면(오버레이)을
    //  거치지 않으므로, 이미 떠 있던 벨 화면과 벨소리를 여기서 직접 걷어낸다.
    //  안 걷으면 통화 화면 뒤에 벨 화면이 남아 통화가 끝나도 사라지지 않는다.
    this._stopNativeRing(call && call.id);
    if (window.App && window.App.ringStop) window.App.ringStop();
    const inc = document.getElementById('call-incoming');
    if (inc) inc.remove();
    if (window.SleepSounds) window.SleepSounds.stop(true);
    this._active = true;
    this._human = true;
    this._connected = false;
    this._rate = 0;                 // 상담사 발신 = 내담자 무료
    this._prepaid = false;
    this._billStarted = false;
    this._consult = null;
    this._consultAsking = false;
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
      // 상담사가 건 전화도 상담이 될 수 있다 — [상담 시작] 제안은 여기로도 온다
      if (this._consultEvent(type, d)) return;
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
      // 내 폰과 태블릿이 같이 울렸고, 다른 기기가 먼저 받았다 — 조용히 물러난다
      if (type === 'taken') this._closeTaken();
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

  // 앱에서 울리고 있는 전화 알림을 내린다.
  //  네이티브 알림은 벨을 반복 재생(FLAG_INSISTENT)하므로 누가 꺼주지 않으면
  //  받은 뒤에도 계속 울린다 — 통화 중에 자기 벨소리를 듣는 꼴이 된다.
  //  플러그인이 없는 웹에서는 아무 일도 하지 않는다.
  _stopNativeRing(callId) {
    try {
      const C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
      const p = C.Plugins && C.Plugins.CallNotification;
      if (p && p.stopRinging) p.stopRinging({ callId: callId || '' }).catch(() => {});
    } catch (e) {}
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

  // === 최소화 — 통화는 이어진 채, 화면 위 바 하나로 줄어든다 ===
  //  바에는 [통화 시간]과 [종료]가 같이 있다. 채팅을 보다가 전화를 끊으려고
  //  통화 화면을 찾아 헤매는 일이 없어야 한다.
  minimize() {
    const ov = document.getElementById('call-overlay');
    if (!ov) return;
    ov.style.display = 'none';
    const peek = document.getElementById('call-peek');
    if (peek) peek.remove();       // 접힌 뒤에도 미리보기가 떠 있으면 유령이 된다
    let bar = document.getElementById('call-minibar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'call-minibar';
      // z-index 는 채팅방(hchat-overlay: 10001)·공유 시트(10002)보다 위여야 한다.
      //  채팅 화면 위에서도 '돌아갈 길'과 '끊을 길'이 항상 보여야 하니까.
      bar.style.cssText = 'box-sizing: border-box; position: fixed; top: 0; left: 0; right: 0; z-index: 10005;'
        + 'padding: 0.35rem 0.7rem; padding-top: calc(0.35rem + env(safe-area-inset-top));'
        + 'background: #2e4237; color: #fff; font-size: 0.8rem; font-weight: 700;'
        + 'display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.28);';
      bar.innerHTML = '<span id="call-minibar-txt" style="flex: 1; min-width: 0; cursor: pointer; padding: 0.3rem 0;'
        + ' overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📞 통화 중</span>'
        + '<button type="button" id="call-minibar-end" style="all: unset; flex-shrink: 0; cursor: pointer;'
        + ' padding: 0.32rem 0.9rem; border-radius: 999px; background: #ea3323; color: #fff; font-size: 0.76rem; font-weight: 800;">종료</button>';
      bar.style.cursor = 'pointer';
      document.body.appendChild(bar);
      // 종료 버튼을 뺀 어디를 눌러도 통화 화면으로 돌아간다 (좁은 여백까지 전부)
      bar.addEventListener('click', e => {
        if (e.target.closest('#call-minibar-end')) return;
        this.restore();
      });
      document.getElementById('call-minibar-end').addEventListener('click', () => this.end());
    }
    this._updateMiniBar();
    this._syncMiniBarPad();
  },

  restore() {
    const ov = document.getElementById('call-overlay');
    if (ov) ov.style.display = 'flex';
    const bar = document.getElementById('call-minibar');
    if (bar) bar.remove();
    this._syncMiniBarPad();
  },

  // 미니바가 채팅방 맨 위(상담사 이름·닫기 버튼)를 덮으면 채팅을 닫을 수조차 없다.
  //  바 높이만큼 채팅방 안쪽을 밀어준다. 바가 없으면 여백도 없다.
  _syncMiniBarPad() {
    try {
      const bar = document.getElementById('call-minibar');
      const h = bar ? bar.offsetHeight : 0;
      const ov = document.getElementById('hchat-overlay');
      if (ov) ov.style.paddingTop = h ? h + 'px' : '';
    } catch (e) {}
  },

  _updateMiniBar() {
    const txt = document.getElementById('call-minibar-txt');
    if (!txt) return;
    const clock = (document.getElementById('call-clock') || {}).textContent || '00:00';
    // 상담 중이면 미니바에도 '상담 시간'이 보여야 한다 — 접어둔 채로도
    //  돈이 붙고 있다는 사실이 화면에서 사라지면 안 된다.
    const c = this._consult;
    if (c && !c.ended && this._connected) {
      const s = Math.max(0, Math.floor((Date.now() - c.at) / 1000));
      txt.textContent = `📞 상담 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')} — 탭하면 돌아가요`;
      return;
    }
    txt.textContent = this._connected ? `📞 통화 중 ${clock} — 탭하면 돌아가요` : '📞 연결 중… — 탭하면 돌아가요';
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
    this._consultTick();   // 상담 중이면 경과·예상 요금도 같이 갱신된다
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

  // 다른 기기가 먼저 받았을 때의 닫기 — end() 와 일부러 다르다.
  //  end() 는 '부재중'으로 기록하고 채팅방을 열고 종료 화면을 1.2초 띄운다.
  //  받아진 전화를 못 받은 것처럼 적으면 거짓말이고, 화면까지 옮기면
  //  옆에서 통화 중인 자기 자신을 방해한다. 여기서는 한 줄만 알리고 사라진다.
  //  (RtcCall 은 이미 abandon 으로 조용히 정리됐다 — 끊기 신호는 나가지 않았다)
  _closeTaken() {
    this._stopNativeRing('');
    if (window.App && window.App.ringStop) window.App.ringStop();
    clearInterval(this._billTimer);
    clearInterval(this._clockTimer);
    clearTimeout(this._prepaidTimer);
    clearTimeout(this._warnTimer);
    clearTimeout(this._noAnswerTimer);
    clearTimeout(this._connTimer);
    this._wakeUnlock();
    this._active = false;
    this._human = false;
    this._connected = false;
    this._counselorId = null;
    this._humanCounselorId = null;
    this._pendingCounselor = null;
    this._consult = null;
    this._consultAsking = false;
    ['call-overlay', 'call-minibar', 'call-peek', 'call-incoming'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    clearTimeout(this._peekTimer);
    this._syncMiniBarPad();   // 채팅방을 열어둔 채였다면 위쪽 여백도 같이 걷는다
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('다른 기기에서 이미 받았어요');
  },

  end(reason) {
    if (window.Sfx) window.Sfx.play('close');
    if (!this._active) return;
    // 통화가 끝났는데 알림이 남아 있으면(다른 기기에서 받았을 때 등) 벨이 계속 운다.
    //  callId 없이 부르면 울리던 전화 알림을 전부 내린다.
    this._stopNativeRing('');
    // 흔적용 스냅샷 — 아래에서 상태를 지우기 전에 떠 둔다
    const humanCall = this._human;
    const connected = !!this._connected;
    const callSecs = connected ? Math.max(0, Math.floor((Date.now() - this._startTs) / 1000)) : 0;
    const callee = this._pendingCounselor;
    // 상담 세션이 있었나 — 리뷰 넛지·기록 문구·종료 화면이 전부 여기서 갈린다.
    //  (정확한 시간·요금은 조금 뒤 서버 응답이 알려준다. 여기서는 내 추정으로 먼저 적고
    //   _onCallEnded 가 도착하면 같은 자리를 고쳐 쓴다)
    const cs = this._consult;
    const hadConsult = !!(cs && cs.at);
    const consultSnap = hadConsult ? {
      secs: Math.max(0, Math.floor((Date.now() - cs.at) / 1000)),
      charge: cs.rate ? Math.ceil(Math.max(0, Date.now() - cs.at) / 30000) * cs.rate : 0
    } : null;
    this._lastConsultName = cs ? cs.name : '';
    this._consult = null;
    this._consultAsking = false;
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
    if (humanCall && callee) this._logCall(callee, connected, callSecs, consultSnap);
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
          recent.consultSecs = consultSnap ? consultSnap.secs : 0;
          // 실제 차감은 서버 응답이 도착한 뒤에 일어난다(_settleConsult).
          //  여기서 this._spent 를 적으면 아직 0이라 '무료 통화'로 남는다 — 추정치를 적는다.
          recent.spent = consultSnap ? consultSnap.charge : 0;
          window.Storage._safeSet('cbt_call_logs', logs.slice(0, 50));
        }
        // 리뷰는 '상담'에만 청한다. 안부 전화·잘못 걸린 전화에 별점을 물으면
        //  그건 무례하고, 별점의 뜻도 흐려진다.
        if (hadConsult && consultSnap.secs >= 60 && recent && window.App && window.App.writeCallReview) {
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
    // 어느 길로 끝나든(내가 끊든·상대가 끊든·잔액이 떨어지든) 미니바와
    //  미리보기, 그리고 채팅방 위쪽 여백까지 여기서 전부 걷힌다.
    const mb = document.getElementById('call-minibar');
    if (mb) mb.remove();
    const pk = document.getElementById('call-peek');
    if (pk) pk.remove();
    clearTimeout(this._peekTimer);
    this._syncMiniBarPad();
    this._connected = false;
    this._muted = false;
    // 종료 UX — 카톡처럼: "통화 종료"를 1.2초 보여주고 채팅방으로 조용히 복귀.
    //  (요약 숫자는 채팅의 '통화 N분 N초' 칩이 이미 말해준다. 팝업으로 또 막지 않는다)
    if (humanCall) {
      const fin = document.createElement('div');
      fin.style.cssText = 'position: fixed; inset: 0; z-index: 10002; background: rgba(20,28,26,0.92); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.4rem; color: #f7f3ea;';
      // 상담이었으면 '음성 상담 MM:SS · N캐시', 아니면 '통화 MM:SS · 무료'.
      //  id 를 붙여두는 이유: 서버가 잰 정확한 숫자가 곧 도착하면 이 줄만 고쳐 쓴다.
      const mmss = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      const line = !connected ? '부재중으로 남겨뒀어요 — 채팅으로 이어보세요'
        : hadConsult ? `음성 상담 ${mmss(consultSnap.secs)} · ${consultSnap.charge.toLocaleString()}캐시`
        : `통화 ${mmss(callSecs)} · 무료`;
      fin.innerHTML = `<div style="font-size: 1.15rem; font-weight: 700;">${connected ? '통화 종료' : '연결되지 않았어요'}</div>
        <div id="call-fin-line" style="font-size: 0.82rem; color: rgba(255,255,255,0.65);">${line}</div>`;
      document.body.appendChild(fin);
      // 서버가 준 정확한 숫자가 늦게 오는 일이 있다 — 조금 더 오래 보여준다
      setTimeout(() => fin.remove(), 1800);
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
