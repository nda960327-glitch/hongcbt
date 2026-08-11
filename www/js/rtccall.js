// ============================================================================
//  앱 내 음성통화 (WebRTC) — 내담자 앱과 상담사 페이지가 같이 쓴다
//
//  전화번호를 쓰지 않는다. 음성은 두 기기 사이로 직접 흐르고,
//  서버는 '처음 만나게 해주는 것'만 한다. 유출할 번호가 없다.
//
//  과금은 서버가 찍은 '실제로 붙은 시각'부터만 계산한다.
//  벨만 울린 시간은 요금이 0이다.
// ============================================================================
(function () {
  const API = () => (window.Api && window.Api.f)
    ? window.Api
    : { f: (p, o) => fetch((window.RTC_API_BASE || '') + p, o),
        json: async (p, o) => { try { const r = await fetch((window.RTC_API_BASE || '') + p, o); return r.ok ? r.json() : null; } catch (e) { return null; } },
        post: (p, d) => fetch((window.RTC_API_BASE || '') + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d || {}) }) };

  window.RtcCall = {
    pc: null, stream: null, remote: null,
    room: '', callId: '', role: 'client',
    seq: 0, pollTimer: null, tickTimer: null,
    connectAt: 0, rate: 0, onEvent: null,

    _emit(type, data) { try { this.onEvent && this.onEvent(type, data || {}); } catch (e) {} },

    // 원격 진단 — 폰에서 어디까지 갔는지 서버가 알아야 고칠 수 있다.
    //  실패의 순간에만 찍는 게 아니라 갈림길마다 찍는다. (본문 최소·개인정보 없음)
    _diag(stage, msg) {
      try {
        API().f('/api/diag', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app: this.role || 'rtc', stage: String(stage).slice(0, 40),
            msg: String(msg == null ? '' : msg).slice(0, 180),
            build: String(window.APP_BUILD || ''),
            who: String((window.App && window.App.clientId && window.App.clientId()) || '').slice(0, 12)
          })
        }).catch(() => {});
      } catch (e) {}
    },

    async _ice() {
      const d = await API().json('/api/rtc/ice');
      this._diag('ice-list', d ? (d.iceServers.length + ' servers turn=' + d.turn) : 'null');
      return (d && d.iceServers) || [{ urls: 'stun:stun.l.google.com:19302' }];
    },

    // 마이크 권한은 통화를 시작할 때만 묻는다
    async _mic() {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
      } catch (e) {
        this._emit('error', { message: '마이크를 쓸 수 없어요. 브라우저 권한을 확인해주세요.' });
        return null;
      }
    },

    async _setup(iceServers) {
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;
      this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream));

      pc.ontrack = e => {
        if (!this.remote) {
          this.remote = new Audio();
          this.remote.autoplay = true;
          // 모바일 사파리는 playsInline 이 없으면 오디오도 전체화면 플레이어로 끌고 간다
          this.remote.playsInline = true;
          this.remote.setAttribute('playsinline', '');
          this.remote.volume = 1;
        }
        this.remote.srcObject = e.streams[0];
        // 자동재생이 막히면 '한쪽만 안 들리는' 통화가 된다 — 조용히 삼키지 않는다.
        //  다음 터치 한 번으로 살려내고, 화면에도 알린다.
        this.remote.play().then(() => this._diag('audio-play', 'ok')).catch(() => {
          this._diag('audio-play-fail', 'autoplay-blocked');
          this._emit('audio-blocked', {});
          const once = () => {
            document.removeEventListener('pointerdown', once);
            if (this.remote) this.remote.play().then(() => { this._diag('audio-play', 'recovered'); this._emit('audio-ok', {}); }).catch(() => {});
          };
          document.addEventListener('pointerdown', once);
        });
      };
      pc.onicecandidate = e => {
        if (e.candidate) this._send('ice', JSON.stringify(e.candidate));
      };
      pc.onconnectionstatechange = async () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          // 재연결 성공 포함 — 불안정 배너를 걷고 유예 타이머를 푼다
          clearTimeout(this.graceTimer); this.graceTimer = null;
          if (this.connectAt) { this._emit('stable', {}); return; }
          // 여기서부터 요금이 붙는다. 시각은 서버가 찍는다 —
          //  기기 시계를 믿으면 조작도 되고 시차도 생긴다.
          const r = await API().json('/api/rtc/connected', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            // as 로 '나는 건 쪽인가 받은 쪽인가'를 알린다 — 서버는 받는 쪽에만
            //  자물쇠를 채운다(두 대가 같이 받는 사고는 그쪽에서만 난다).
            body: JSON.stringify({ callId: this.callId, as: this.role })
          });
          // 다른 기기가 먼저 받았다. 폰과 태블릿에 같이 로그인해 두면 둘 다 울리고,
          //  둘 다 '받기'를 누를 수 있다 — 서버가 한 대만 통과시킨다.
          //  진 쪽은 조용히 사라져야 한다. hangup 을 부르면 /rtc/end 와 bye 가 나가서
          //  방금 통화를 시작한 기기가 끊긴다 — 그래서 abandon 이다.
          if (r && r.ok === false && (r.error === 'taken' || r.error === 'ended')) {
            this._diag('connected-lost', r.error);
            this._emit('taken', { reason: r.error });
            this.abandon();
            return;
          }
          this.connectAt = (r && r.connectAt) || Date.now();
          this.rate = (r && r.rate) || 0;
          this._emit('connected', { rate: this.rate });
          this._startTick();
          this._startAudioWatch();
          // 어떤 길로 붙었는지 남긴다 — relay 면 TURN 경유, srflx/host 면 직결
          try {
            const stats = await pc.getStats();
            stats.forEach(s => {
              if (s.type === 'candidate-pair' && (s.selected || s.nominated) && s.state === 'succeeded') {
                const l = stats.get(s.localCandidateId);
                if (l) this._diag('pc-connected', 'via=' + l.candidateType);
              }
            });
          } catch (e) { this._diag('pc-connected', ''); }
        } else if (st === 'failed') {
          this._diag('pc-failed', 'ice=' + pc.iceConnectionState);
          this._emit('error', { message: '연결에 실패했어요. 네트워크를 확인하고 다시 걸어주세요.' });
          this.hangup('failed');
        } else if (st === 'disconnected') {
          // LTE↔WiFi 전환 등 — 바로 끊지 않는다. ICE 재협상을 걸고 12초 기다린다.
          this._emit('unstable', {});
          this._tryIceRestart();
          clearTimeout(this.graceTimer);
          this.graceTimer = setTimeout(() => {
            // 반드시 '그때 그 통화'인지 확인한다 — 이전 통화의 유예가
            //  살아남아 방금 새로 건 전화를 오살하면 안 된다
            if (this.pc === pc && pc.connectionState !== 'connected') {
              this._emit('error', { message: '연결이 끊어졌어요.' });
              this.hangup('failed');
            }
          }, 12000);
        } else if (st === 'closed') {
          this._emit('state', { state: st });
        }
      };
      return pc;
    },

    // ── 무음 감시 ────────────────────────────────────────────────────
    //  '연결됐다'와 '들린다'는 다르다. 연결은 붙었는데 소리 바이트가 0이면
    //  사용자는 원인을 모른 채 "안 들려요"만 반복한다.
    //  받는 쪽(상대 목소리)과 보내는 쪽(내 마이크)을 따로 보고, 어느 쪽이
    //  막혔는지 이름을 붙여 알려준다.
    _startAudioWatch() {
      clearInterval(this.audioTimer);
      let lastIn = -1, lastOut = -1, silentIn = 0, silentOut = 0, told = '';
      this.audioTimer = setInterval(async () => {
        if (!this.pc || !this.connectAt) return;
        let inB = 0, outB = 0;
        try {
          const stats = await this.pc.getStats();
          stats.forEach(s => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') inB += s.bytesReceived || 0;
            if (s.type === 'outbound-rtp' && s.kind === 'audio') outB += s.bytesSent || 0;
          });
        } catch (e) { return; }
        if (lastIn >= 0) {
          silentIn = (inB - lastIn) < 300 ? silentIn + 1 : 0;   // 3초간 사실상 무음
          silentOut = (outB - lastOut) < 300 ? silentOut + 1 : 0;
        }
        lastIn = inB; lastOut = outB;

        // 내 마이크가 꺼져 있으면(음소거·권한 회수) 그것부터 알린다
        const myTrack = this.stream && this.stream.getAudioTracks()[0];
        const micDead = !myTrack || myTrack.readyState !== 'live' || myTrack.enabled === false;

        let now = '';
        if (silentIn >= 2 && silentOut >= 2) now = 'both';
        else if (silentIn >= 2) now = 'in';
        else if (silentOut >= 2 && !micDead) now = 'out';
        if (now !== told) {
          told = now;
          if (now) {
            this._diag('audio-silent', now + ' in=' + inB + ' out=' + outB);
            this._emit('no-audio', { side: now });
          } else {
            this._emit('audio-ok', {});
          }
        }
      }, 3000);
    },

    // 네트워크가 바뀌면(LTE↔WiFi) 경로를 다시 뚫는다. 발신자가 새 offer 를 만든다.
    async _tryIceRestart() {
      try {
        if (!this.pc || this.role !== 'client') { this.pc && this.pc.restartIce && this.pc.restartIce(); return; }
        const offer = await this.pc.createOffer({ iceRestart: true });
        await this.pc.setLocalDescription(offer);
        await this._send('offer', offer.sdp);
      } catch (e) {}
    },

    _send(kind, payload) {
      return API().f('/api/rtc/signal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: this.room, sender: this.role, kind, payload })
      }).catch(() => {});
    },

    _startPoll() {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(async () => {
        const d = await API().json(`/api/rtc/poll?room=${encodeURIComponent(this.room)}&as=${this.role}&since=${this.seq}`);
        if (!d || !d.items) return;
        this.seq = d.seq || this.seq;
        for (const m of d.items) {
          try {
            if (m.kind === 'offer') {
              await this.pc.setRemoteDescription({ type: 'offer', sdp: m.payload });
              const ans = await this.pc.createAnswer();
              await this.pc.setLocalDescription(ans);
              this._send('answer', ans.sdp);
            } else if (m.kind === 'answer') {
              // 재협상(ICE restart) offer 에 대한 answer 도 받아야 한다 —
              //  '첫 answer 만'으로 막으면 네트워크 전환 복구가 안 된다
              if (!this.pc.currentRemoteDescription || this.pc.signalingState === 'have-local-offer') {
                await this.pc.setRemoteDescription({ type: 'answer', sdp: m.payload });
              }
            } else if (m.kind === 'ice') {
              await this.pc.addIceCandidate(JSON.parse(m.payload));
            } else if (m.kind === 'ring') {
              this._emit('peer-ringing', {}); // 상대 기기에서 벨이 울리기 시작했다
            } else if (m.kind === 'bye') {
              this._emit('remote-hangup', {});
              this.hangup('remote', true);
            }
          } catch (e) {}
        }
      }, 1200);
    },

    // 화면의 시간·요금 표시. 서버 시각 기준이라 양쪽이 같은 숫자를 본다.
    _startTick() {
      clearInterval(this.tickTimer);
      let n = 0;
      this.tickTimer = setInterval(() => {
        if (!this.connectAt) return;
        const ms = Date.now() - this.connectAt;
        this._emit('tick', {
          ms,
          spent: this.rate ? Math.ceil(ms / 30000) * this.rate : 0
        });
        // 상대가 앱을 강제 종료하면 bye 가 안 온다 — 6초마다 서버에 생사를 묻는다
        if (++n % 6 === 0 && this.callId) {
          API().json(`/api/rtc/state?callId=${encodeURIComponent(this.callId)}`).then(d => {
            if (d && d.ended && this.callId) {
              this._emit('remote-hangup', {});
              this.hangup('remote', true);
            }
          }).catch(() => {});
        }
      }, 1000);
    },

    // ── 건다 (기본: 내담자 → 상담사. 상담사 발신은 as/startPath/auth 로 뒤집는다) ──
    async call({ counselorId, clientId, bookingId, rate, as, startPath, auth }) {
      // 직전 통화의 잔재(pc·타이머)가 남아 있으면 새 통화에 간섭한다 — 깨끗이 밀고 시작
      if (this.pc || this.callId) { try { await this.hangup(this.role, true); } catch (e) {} }
      this.role = as || 'client';
      this._diag('call-try', (startPath || '/api/rtc/start') + ' c=' + counselorId);
      let started = null, netErr = '';
      try {
        const r = await API().f(startPath || '/api/rtc/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counselorId, clientId, bookingId, rate: rate || 0, ...(auth || {}) })
        });
        netErr = 'http-' + r.status;
        try { started = await r.json(); } catch (e) { netErr += ' bad-json'; }
      } catch (e) { netErr = 'fetch-fail ' + String(e && e.message).slice(0, 60); }
      if (!started || !started.ok) {
        const why = (started && (started.message || started.error)) || netErr || '지금은 연결할 수 없어요';
        this._diag('call-start-fail', why);
        this._emit('error', { message: (started && started.message) || `연결 요청이 거절됐어요 (${why})` });
        return false;
      }
      this._diag('call-start-ok', started.callId + (started.resumed ? ' resumed' : ''));
      this.room = started.room; this.callId = started.callId; this.seq = 0;
      this.stream = await this._mic();
      if (!this.stream) { this._diag('mic-fail', ''); return false; }
      this._diag('mic-ok', '');

      await this._setup(await this._ice());
      const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      await this._send('offer', offer.sdp);
      this._startPoll();
      this._emit('ringing', {});
      return true;
    },

    // ── 받는다 (기본: 상담사. 내담자가 받을 땐 as: 'client') ──────────────
    async answer({ room, callId, as }) {
      this.room = room; this.callId = callId; this.role = as || 'counselor'; this.seq = 0;
      this._diag('answer-try', callId);
      this.stream = await this._mic();
      if (!this.stream) { this._diag('answer-mic-fail', ''); return false; }
      this._diag('answer-mic-ok', '');
      await this._setup(await this._ice());
      this._startPoll();   // offer 가 폴링으로 들어와 answer 를 만든다
      this._emit('answering', {});
      return true;
    },

    // 조용히 물러난다 — 서버에도 상대에게도 아무 말 하지 않는다.
    //  '다른 기기가 먼저 받았다'는 이 통화가 남의 것이 됐다는 뜻이라,
    //  끝났다는 신호를 보내는 순간 남의 통화를 끊는 일이 된다.
    //  callId 를 비우는 것도 중요하다 — pagehide 비콘이 그걸 보고 /rtc/end 를 쏜다.
    abandon() {
      clearInterval(this.pollTimer); clearInterval(this.tickTimer); clearInterval(this.audioTimer);
      clearTimeout(this.graceTimer); this.graceTimer = null;
      try { this.pc && this.pc.close(); } catch (e) {}
      try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      if (this.remote) { try { this.remote.srcObject = null; } catch (e) {} }
      this.pc = null; this.stream = null; this.connectAt = 0;
      this.callId = ''; this.room = '';
    },

    async hangup(by, skipSignal) {
      clearInterval(this.pollTimer); clearInterval(this.tickTimer); clearInterval(this.audioTimer);
      clearTimeout(this.graceTimer); this.graceTimer = null;
      if (!skipSignal) { try { await this._send('bye', '1'); } catch (e) {} }
      try { this.pc && this.pc.close(); } catch (e) {}
      try { this.stream && this.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      if (this.remote) { try { this.remote.srcObject = null; } catch (e) {} }

      let res = null;
      if (this.callId) {
        res = await API().json('/api/rtc/end', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: this.callId, by: by || this.role })
        });
      }
      this.pc = null; this.stream = null; this.connectAt = 0;
      const info = res || {};
      this._emit('ended', info);
      this.callId = ''; this.room = '';
      return info;
    }
  };

  // 앱이 닫히는 마지막 순간 — 서버에 '나 끊겨요'를 한 숨에 알린다.
  //  이게 있으면 상대는 30초 리퍼를 기다릴 필요 없이 2~3초 안에 정리된다.
  window.addEventListener('pagehide', () => {
    try {
      const rc = window.RtcCall;
      if (!rc || !rc.callId || !navigator.sendBeacon) return;
      const base = (window.Api && window.Api.base && window.Api.base()) || window.RTC_API_BASE || '';
      navigator.sendBeacon(
        base + '/api/rtc/end',
        new Blob([JSON.stringify({ callId: rc.callId, by: rc.role || 'client' })], { type: 'application/json' })
      );
    } catch (e) {}
  });
})();
