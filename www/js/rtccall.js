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

    async _ice() {
      const d = await API().json('/api/rtc/ice');
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
        }
        this.remote.srcObject = e.streams[0];
        this.remote.play().catch(() => {});
      };
      pc.onicecandidate = e => {
        if (e.candidate) this._send('ice', JSON.stringify(e.candidate));
      };
      pc.onconnectionstatechange = async () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          // 여기서부터 요금이 붙는다. 시각은 서버가 찍는다 —
          //  기기 시계를 믿으면 조작도 되고 시차도 생긴다.
          const r = await API().json('/api/rtc/connected', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId: this.callId })
          });
          this.connectAt = (r && r.connectAt) || Date.now();
          this.rate = (r && r.rate) || 0;
          this._emit('connected', { rate: this.rate });
          this._startTick();
        } else if (st === 'failed') {
          this._emit('error', { message: '연결에 실패했어요. 네트워크를 확인하고 다시 걸어주세요.' });
          this.hangup('failed');
        } else if (st === 'disconnected' || st === 'closed') {
          this._emit('state', { state: st });
        }
      };
      return pc;
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
              if (!this.pc.currentRemoteDescription) {
                await this.pc.setRemoteDescription({ type: 'answer', sdp: m.payload });
              }
            } else if (m.kind === 'ice') {
              await this.pc.addIceCandidate(JSON.parse(m.payload));
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
      this.tickTimer = setInterval(() => {
        if (!this.connectAt) return;
        const ms = Date.now() - this.connectAt;
        this._emit('tick', {
          ms,
          spent: this.rate ? Math.ceil(ms / 30000) * this.rate : 0
        });
      }, 1000);
    },

    // ── 내담자: 건다 ──────────────────────────────────────────────────
    async call({ counselorId, clientId, bookingId, rate }) {
      const started = await API().json('/api/rtc/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselorId, clientId, bookingId, rate: rate || 0 })
      });
      if (!started || !started.ok) {
        this._emit('error', { message: (started && started.message) || '지금은 연결할 수 없어요' });
        return false;
      }
      this.room = started.room; this.callId = started.callId; this.role = 'client'; this.seq = 0;
      this.stream = await this._mic();
      if (!this.stream) return false;

      await this._setup(await this._ice());
      const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
      await this.pc.setLocalDescription(offer);
      await this._send('offer', offer.sdp);
      this._startPoll();
      this._emit('ringing', {});
      return true;
    },

    // ── 상담사: 받는다 ────────────────────────────────────────────────
    async answer({ room, callId }) {
      this.room = room; this.callId = callId; this.role = 'counselor'; this.seq = 0;
      this.stream = await this._mic();
      if (!this.stream) return false;
      await this._setup(await this._ice());
      this._startPoll();   // offer 가 폴링으로 들어와 answer 를 만든다
      this._emit('answering', {});
      return true;
    },

    async hangup(by, skipSignal) {
      clearInterval(this.pollTimer); clearInterval(this.tickTimer);
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
})();
