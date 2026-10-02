// ============================================================================
//  상담 예약 — 마인드카페식 달력 + 시간대 선택 + 우렁이캐시 결제
//  입점 상담사(서버 명부)는 상담사가 프로 앱에서 정한 '예약 가능 시간·휴무일'과
//  이미 찬 시각을 서버(/api/slots)에서 받아 그린다. 서버가 같은 규칙으로 한 번 더 막는다.
//  서버 명부에 없는 기본(데모) 상담사만 결정적 해시로 만든 데모 스케줄을 쓴다.
//
//  시각은 전부 한국 시각(KST, +09:00)이다. 전에는 new Date('YYYY-MM-DDTHH:MM:00') 로
//  '기기 시간대' 기준 시각을 만들어서, 해외에 있거나 시간대가 다른 폰에서 고른 10시가
//  상담사에게는 전혀 다른 시각으로 잡혔다.
// ============================================================================
window.Booking = {
  // 공용 이스케이프 — 상담사 이름·병원이 예약 모달에 그대로 들어간다.
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  SESSION_MS: 30 * 60000,        // 예약 상담 30분 정액 (서버 SESSION_MS 와 같다)
  currentCounselorId: null,
  calYear: 0,
  calMonth: 0, // 0-11
  selDate: null,  // 'YYYY-MM-DD' (한국 날짜)
  selTime: null,  // 'HH:MM'     (한국 시각)
  _sched: {},     // 상담사 id → { at, found, configured, slots, offdays, taken[], error }

  init() {
    const cancelBtn = document.getElementById('booking-cancel');
    const confirmBtn = document.getElementById('booking-confirm');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmBooking());
  },

  _hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  },

  // ── 한국 시각 도우미 ──────────────────────────────────────────────
  _pad: n => String(n).padStart(2, '0'),
  // 한국 날짜·시각 → epoch ms
  kstTs(dateStr, hhmm) { return Date.parse(dateStr + 'T' + (hhmm || '00:00') + ':00+09:00'); },
  // epoch ms → 한국 기준 { date:'YYYY-MM-DD', hm:'HH:MM', y, m(0-11), d, dow }
  kstParts(ts) {
    const k = new Date(Number(ts) + 9 * 3600000);
    const y = k.getUTCFullYear(), m = k.getUTCMonth(), d = k.getUTCDate();
    return {
      y, m, d, dow: k.getUTCDay(),
      date: `${y}-${this._pad(m + 1)}-${this._pad(d)}`,
      hm: `${this._pad(k.getUTCHours())}:${this._pad(k.getUTCMinutes())}`
    };
  },
  // 'YYYY-MM-DD' 의 요일 (시간대와 무관)
  _dow(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  },
  // 추측할 수 없는 예약 id — 전에는 'bk_'+Date.now() 라서 시각만 알면 남의 예약 id 를 맞힐 수 있었다
  _newId() {
    try {
      const b = new Uint8Array(9);
      crypto.getRandomValues(b);
      return 'bk_' + Date.now().toString(36) + '_' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return 'bk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
  },

  // 서버 명부(입점) 상담사인가 — Marketplace 가 서버에서 받은 카드에만 fromServer 를 붙인다
  _isServer(counselorId) {
    const c = window.Marketplace && window.Marketplace.getCounselor(counselorId);
    return !!(c && c.fromServer);
  },

  // 상담사의 가능 시간·찬 시각을 서버에서 받아 둔다 (모달이 열릴 때마다 새로 — 1분 안이면 재사용)
  async loadSchedule(counselorId, force) {
    const cur = this._sched[counselorId];
    if (!force && cur && !cur.error && Date.now() - cur.at < 60000) return cur;
    let d = null;
    try {
      d = await window.Api.json('/api/slots?counselorId=' + encodeURIComponent(counselorId));
    } catch (e) { d = null; }
    const s = d
      ? { at: Date.now(), found: d.found !== false, configured: !!d.configured,
          slots: d.slots || {}, offdays: d.offdays || [], taken: Array.isArray(d.taken) ? d.taken : [] }
      : { at: Date.now(), error: true };
    this._sched[counselorId] = s;
    // 그 사이 모달이 같은 상담사로 열려 있으면 다시 그린다
    if (this.currentCounselorId === counselorId) {
      if (this.selTime && !this.slotsFor(counselorId, this.selDate || '').includes(this.selTime)) this.selTime = null;
      this.renderCal(); this.renderTimes();
    }
    return s;
  },

  // 서버 상담사인데 일정을 아직 모른다(불러오는 중·실패)
  _schedPending(counselorId) {
    if (!this._isServer(counselorId)) return false;
    const s = this._sched[counselorId];
    return !s || !!s.error;
  },

  // 해당 상담사·날짜(한국)의 예약 가능 시간대
  slotsFor(counselorId, dateStr) {
    if (!dateStr) return [];
    const dow = this._dow(dateStr);
    const base = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'];
    let slots;
    let taken = [];
    if (this._isServer(counselorId)) {
      const s = this._sched[counselorId];
      if (!s || s.error || !s.found) return [];              // 모르면 열지 않는다 — 결제 후 튕기는 것보다 낫다
      if ((s.offdays || []).includes(dateStr)) return [];
      if (s.configured) {
        slots = [...((s.slots || {})[dow] || (s.slots || {})[String(dow)] || [])];
      } else {
        // 아직 가능 시간을 저장하지 않은 상담사 — 서버는 시각을 따지지 않는다. 기본 근무 시간(월~토)을 보여준다.
        slots = dow === 0 ? [] : base.slice();
      }
      taken = s.taken || [];
    } else {
      // 서버 명부에 없는 기본(데모) 상담사
      const avail = window.Storage && window.Storage._safeGet('cbt_my_avail', null);
      if (String(counselorId).startsWith('cu_') && avail) {
        slots = [...(avail[dow] || [])];
      } else {
        if (dow === 0) return []; // 일요일 휴무 (기본 상담사)
        const h = this._hash(String(counselorId) + dateStr);
        slots = base.filter((_, i) => ((h >> i) & 3) !== 3); // 약 75% 오픈 (데모 스케줄)
      }
    }
    // 이미 찬 시각은 뺀다 — 서버가 알려준 것 + 이 기기의 예약(아직 서버에 못 올라간 것 포함).
    //  30분 정액이라 30분 안에 붙은 시각은 겹친 것으로 본다.
    const mine = ((window.Storage && window.Storage._safeGet('cbt_bookings', [])) || [])
      .filter(b => b && b.counselorId === counselorId && b.status === 'confirmed' && b.whenTs)
      .map(b => b.whenTs);
    const busy = taken.concat(mine);
    const cut = Date.now() + 2 * 3600000;                     // 지금부터 2시간 안은 예약 불가
    return slots.filter(t => {
      const ts = this.kstTs(dateStr, t);
      if (!Number.isFinite(ts) || ts < cut) return false;
      return !busy.some(x => Math.abs(x - ts) < this.SESSION_MS);
    }).sort();
  },

  openModal(counselorId) {
    try { if (window.Sfx) window.Sfx.play('pop'); } catch (e) {}
    this.currentCounselorId = counselorId;
    const counselor = window.Marketplace.getCounselor(counselorId);
    if (!counselor) return;

    const now = this.kstParts(Date.now());
    this.calYear = now.y;
    this.calMonth = now.m;
    this.selDate = null;
    this.selTime = null;

    const details = document.getElementById('booking-details');
    details.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;">
        <div style="min-width: 0;">
          <strong style="font-size: 1.02rem; color: var(--text-primary);">${this._esc(counselor.name)}</strong>
          <div style="color: var(--text-muted); font-size: 0.78rem;">${this._esc(counselor.hospital)}</div>
        </div>
        <strong style="color: var(--accent-primary); white-space: nowrap;">30분 · ${counselor.price.toLocaleString()}캐시</strong>
      </div>
      <div style="margin-top: 0.65rem; padding-top: 0.6rem; border-top: 1px dashed var(--glass-border); font-size: 0.78rem; color: var(--text-secondary); line-height: 1.7;">
        <b style="color: var(--text-primary);">예약 후 이렇게 진행돼요</b><br>
        · 예약 상담은 <b>30분 정액제</b>예요 — 통화 중 30초당 과금이 <b>전혀 없습니다</b>. (쓴 만큼 과금되는 건 예약 없이 거는 '바로상담'만!)<br>
        · 1회기 상담 시간은 <b>30분</b>입니다. 시간은 모두 <b>한국 시각</b>이에요.<br>
        · 예약이 확정되면 <b>알림</b>으로 알려드려요.<br>
        · 예약 시간이 되면 <b>마이페이지 › 나의 상담 내역</b>의 [전화 상담] 버튼으로 상담사님과 바로 연결됩니다.<br>
        · 상담 전 나누고 싶은 이야기는 [채팅]으로 미리 남겨둘 수 있어요.<br>
        · 취소는 <b>상담 24시간 전까지 무료</b>, 24시간 이내는 50% 환불, 시작 시각 이후·노쇼는 환불되지 않아요.<br>
      </div>`;

    this.renderCal();
    this.renderTimes();
    document.getElementById('booking-modal').classList.remove('hidden');
    // 입점 상담사는 실제 가능 시간을 받아 와서 다시 그린다
    if (this._isServer(counselorId)) this.loadSchedule(counselorId, true);
  },

  renderCal() {
    const el = document.getElementById('bk-cal');
    if (!el) return;
    const y = this.calYear, m = this.calMonth;
    const today = this.kstParts(Date.now());
    const todayStr = today.date;
    const maxStr = this.kstParts(Date.now() + 60 * 86400000).date;   // 60일 이내 예약
    const startDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const mIdx = y * 12 + m, curIdx = today.y * 12 + today.m;
    const canPrev = mIdx > curIdx;
    const canNext = mIdx < curIdx + 2;

    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<span></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const inRange = dateStr >= todayStr && dateStr <= maxStr;
      const hasSlots = inRange && this.slotsFor(this.currentCounselorId, dateStr).length > 0;
      const sel = this.selDate === dateStr;
      const isToday = dateStr === todayStr;
      cells += `<button ${hasSlots ? `onclick="window.Booking.pickDate('${dateStr}')"` : 'disabled'}
        style="all: unset; box-sizing: border-box; width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 0.88rem; cursor: ${hasSlots ? 'pointer' : 'default'};
        ${sel ? 'background: var(--accent-primary); color: #fff; font-weight: 800;'
          : hasSlots ? `color: var(--text-primary); ${isToday ? 'background: color-mix(in srgb, var(--accent-primary) 16%, transparent); font-weight: 700;' : ''}`
          : 'color: var(--text-muted); opacity: 0.35;'}">${d}</button>`;
    }

    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin: 0.2rem 0 0.5rem;">
        <button ${canPrev ? 'onclick="window.Booking.moveMonth(-1)"' : 'disabled style="opacity:0.3;"'} style="all: unset; cursor: pointer; padding: 0.3rem 0.7rem; font-size: 1.1rem; color: var(--text-primary); opacity: ${canPrev ? 1 : 0.3};">‹</button>
        <strong style="font-size: 1.05rem; color: var(--text-primary);">${y}년 ${m + 1}월</strong>
        <button ${canNext ? 'onclick="window.Booking.moveMonth(1)"' : 'disabled'} style="all: unset; cursor: pointer; padding: 0.3rem 0.7rem; font-size: 1.1rem; color: var(--text-primary); opacity: ${canNext ? 1 : 0.3};">›</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.15rem; text-align: center; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">
        <span style="color:#c96a5a;">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span style="color:#7ba0b8;">토</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.15rem;">${cells}</div>`;
  },

  moveMonth(delta) {
    try { if (window.Sfx) window.Sfx.play('nav'); } catch (e) {}
    this.calMonth += delta;
    if (this.calMonth < 0) { this.calMonth = 11; this.calYear--; }
    if (this.calMonth > 11) { this.calMonth = 0; this.calYear++; }
    this.selDate = null; this.selTime = null;
    this.renderCal(); this.renderTimes();
  },

  pickDate(dateStr) {
    try { if (window.Sfx) window.Sfx.play('nav'); } catch (e) {}   // 날짜를 고르는 감각
    if (window.Sfx) window.Sfx.play('pop');
    this.selDate = dateStr;
    this.selTime = null;
    this.renderCal();
    this.renderTimes();
  },

  renderTimes() {
    const el = document.getElementById('bk-times');
    if (!el) return;
    const msg = t => `<p style="grid-column: 1 / -1; margin: 0.2rem 0; font-size: 0.8rem; color: var(--text-muted); text-align: center;">${t}</p>`;
    if (this._schedPending(this.currentCounselorId)) {
      const s = this._sched[this.currentCounselorId];
      el.innerHTML = s && s.error
        ? msg('예약 가능한 시간을 불러오지 못했어요. <a href="#" onclick="window.Booking.loadSchedule(window.Booking.currentCounselorId, true); return false;">다시 불러오기</a>')
        : msg('선생님의 예약 가능한 시간을 불러오는 중…');
      return;
    }
    if (!this.selDate) {
      el.innerHTML = msg('먼저 날짜를 선택해주세요. (한국 시각 기준)');
      return;
    }
    const slots = this.slotsFor(this.currentCounselorId, this.selDate);
    if (!slots.length) { el.innerHTML = msg('이 날은 예약 가능한 시간이 없어요.'); return; }
    el.innerHTML = slots.map(t => `
      <button onclick="window.Booking.pickTime('${t}')"
        style="all: unset; box-sizing: border-box; text-align: center; padding: 0.55rem 0.2rem; border-radius: 10px; font-size: 0.86rem; cursor: pointer;
        border: 1.5px solid ${this.selTime === t ? 'var(--accent-primary)' : 'var(--glass-border)'};
        background: ${this.selTime === t ? 'var(--accent-primary)' : 'var(--bg-tertiary)'};
        color: ${this.selTime === t ? '#fff' : 'var(--text-primary)'}; font-weight: ${this.selTime === t ? '800' : '500'};">${t}</button>`).join('');
  },

  pickTime(t) {
    if (window.Sfx) window.Sfx.play('pop');
    this.selTime = t;
    this.renderTimes();
  },

  closeModal() {
    if (window.Sfx) window.Sfx.play('close');
    document.getElementById('booking-modal').classList.add('hidden');
    this.currentCounselorId = null;
    this.selDate = null;
    this.selTime = null;
  },

  // 서버가 거절할 때 앱이 보여줄 제목
  TITLE: {
    'slot-taken': '이 시간은 방금 마감됐어요',
    'client-overlap': '같은 시간에 다른 예약이 있어요',
    'not-available': '선생님이 상담하지 않는 시간이에요',
    'inactive': '지금은 예약을 받을 수 없어요',
    'no-cash': '결제 확인이 필요해요',
    'too-many': '잠시 후 다시 시도해주세요',
    'too-many-open': '예약은 3건까지 잡을 수 있어요',
    'too-many-today': '오늘은 예약을 더 잡을 수 없어요',
    'bad-time': '예약할 수 없는 시간이에요',
    'forbidden': '이 기기에서는 예약할 수 없어요',
    'sub_expired': '지금은 예약을 받을 수 없어요'
  },

  // 기기의 예약 한 건을 서버 장부에 올린다. 결과:
  //   'ok'     — 서버가 받았다(또는 이미 갖고 있다) → b.srvSynced = true
  //   'reject' — 서버가 받지 않는다(4xx) → 호출부가 되돌린다(캐시 환불)
  //   'retry'  — 네트워크·5xx — 기기에 남겨 두고 나중에 다시(App._bookingSyncTick)
  //  서버는 같은 id 를 두 번 받아도 한 번만 넣는다(멱등).
  async sync(b) {
    let res = null;
    try {
      res = await window.Api.f('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: b.id, counselorId: b.counselorId, counselorName: b.name,
          clientId: window.App ? window.App.clientId() : '',
          clientName: window.Storage._safeGet('cbt_user_name', '') || '익명',
          time: b.time, whenTs: b.whenTs, price: b.price
        })
      });
    } catch (e) { res = null; }
    if (!res) return { result: 'retry' };
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      return { result: 'ok', id: (d && d.id) || b.id };
    }
    if (res.status >= 400 && res.status < 500) {
      const err = await res.json().catch(() => ({}));
      return { result: 'reject', code: (err && err.error) || '', message: (err && err.message) || '' };
    }
    return { result: 'retry' };
  },

  // 동기화 결과를 기기 장부에 적는다 (서버가 id 를 새로 발급했으면 그것으로 바꾼다)
  _markSynced(localId, srvId) {
    const list = window.Storage._safeGet('cbt_bookings', []) || [];
    const x = list.find(v => v && v.id === localId);
    if (!x) return;
    x.srvSynced = true;
    delete x.srvSyncTry;
    if (srvId && srvId !== localId) x.id = srvId;
    window.Storage._safeSet('cbt_bookings', list);
    // 전달 중에 내담자가 기기에서 먼저 취소했다(전달 전이라 서버에 못 알렸다) — 이제 서버에도 취소를 알린다
    if (x.status === 'cancelled') {
      try {
        window.Api.f('/api/bookings/cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: x.id, clientId: window.App ? window.App.clientId() : '' })
        }).catch(() => {});
      } catch (e) {}
    }
  },

  confirmBooking() {
    if (!this.currentCounselorId) return;
    const counselor = window.Marketplace.getCounselor(this.currentCounselorId);

    if (!this.selDate || !this.selTime) {
      if (window.Sfx) window.Sfx.hit('denied');
      window.UI.alert('예약하실 날짜와 시간을 선택해주세요.');
      return;
    }
    // 고른 뒤 그 사이에 찬 시각일 수 있다 — 결제 전에 한 번 더 본다
    if (!this.slotsFor(this.currentCounselorId, this.selDate).includes(this.selTime)) {
      if (window.Sfx) window.Sfx.hit('denied');
      window.UI.alert('방금 이 시간은 예약할 수 없게 됐어요. 다른 시간을 골라주세요.');
      this.selTime = null; this.renderTimes();
      return;
    }

    // 우렁이 캐시로 결제 (잔액 부족 시 충전 유도)
    if (window.Wallet && !window.Wallet.spend(counselor.price, `${counselor.name} 상담 예약`, { serverTracked: true })) {
      if (window.Sfx) window.Sfx.hit('denied');
      window.UI.alert(`잔액이 부족해요.\n상담료 ${counselor.price.toLocaleString()}캐시 / 보유 ${window.Wallet.balance().toLocaleString()}캐시\n\n마이페이지에서 캐시를 충전해주세요.`);
      this.closeModal();
      document.querySelector('[data-tab="mypage"]').click();
      return;
    }

    // 한국 시각으로 못 박는다 (기기 시간대와 무관)
    const whenTs = this.kstTs(this.selDate, this.selTime);
    const kp = this.kstParts(whenTs);
    const dow = ['일', '월', '화', '수', '목', '금', '토'][kp.dow];
    const formattedDate = `${kp.y}년 ${kp.m + 1}월 ${kp.d}일 (${dow}) ${this.selTime}`;

    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const booking = {
      id: this._newId(),
      counselorId: counselor.id,
      name: counselor.name,
      hospital: counselor.hospital,
      price: counselor.price,
      time: formattedDate,
      whenTs,
      status: 'confirmed',
      srvSynced: false,          // 서버 장부에 올라갔는지 — 못 올라갔으면 1분마다 다시 보낸다
      ts: Date.now()
    };
    bookings.unshift(booking);
    window.Storage._safeSet('cbt_bookings', bookings.slice(0, 50));

    // 서버 예약 장부에도 기록 — 상담사 앱 일정에 뜬다
    this.sync(booking).then(r => {
      if (r.result === 'ok') { this._markSynced(booking.id, r.id); return; }
      // 서버가 받지 않은 예약 — 가짜 예약 차단·같은 시간 중복·결제 미확인·과다 요청 등.
      //  캐시는 이미 기기에서 빠졌으므로 반드시 되돌린다. 조용히 넘어가면
      //  상담사 화면에는 예약이 없는데 내담자만 오지 않을 상담을 기다리게 된다.
      if (r.result === 'reject') {
        this._undoBooking(booking, counselor, this.TITLE[r.code] || '예약을 완료하지 못했어요', r.message || '');
        if (this._isServer(counselor.id)) this.loadSchedule(counselor.id, true).catch(() => {});
      }
      // 'retry' — 네트워크가 끊겼거나 서버가 잠시 아팠다. 기기에 남겨 두고 1분마다 다시 보낸다
      //  (App._bookingSyncTick). 상담 시각이 지나도록 못 올라가면 그때 환불하고 알린다.
    }).catch(() => {});

    // 되돌릴 때 이 창이 닫히기를 기다린다 — 안내 두 장이 겹쳐 뜨면 아무도 못 읽는다
    this._payAlert = window.UI.alert(`결제가 완료되었습니다! (-${counselor.price.toLocaleString()}캐시)\n\n${counselor.name}님과의 상담이 [${formattedDate}]에 예약되었습니다.\n\n마이페이지에서 확인하세요.`);

    this.closeModal();
    if (window.App && window.App.renderMyBookings) window.App.renderMyBookings();
    document.querySelector('[data-tab="mypage"]').click();
  },

  // 서버가 예약을 받지 않았을 때 되돌린다.
  //  기기에 적어 둔 예약을 지우고 캐시를 전액 돌려준다 — 돈이 걸린 일이라
  //  '나중에 운영자가 확인해서'로 미룰 수 없다.
  _undoBooking(booking, counselor, title, why) {
    Promise.resolve(this._payAlert).catch(() => {}).then(() => {
      const list = window.Storage._safeGet('cbt_bookings', []) || [];
      if (!list.some(b => b && b.id === booking.id)) return;   // 이미 되돌렸다 — 두 번 환불하지 않는다
      const left = list.filter(b => b && b.id !== booking.id);
      window.Storage._safeSet('cbt_bookings', left);
      const nm = (counselor && counselor.name) || booking.name || '상담사';
      if (window.Wallet) window.Wallet.refund(booking.price, `${nm} 상담 예약 취소`);
      if (window.App && window.App.renderMyBookings) window.App.renderMyBookings();
      // 목록은 굳이 다시 받지 않는다 — 새로고침 효과음·토스트가 사과 문구와 겹친다.
      //  만료된 상담사는 서버가 걸러 주므로 다음 갱신 때 카드에서 조용히 사라진다.
      window.UI.alert({
        title: title || '지금은 예약을 받을 수 없어요',
        body: `${why || (nm + ' 선생님은 현재 상담을 받지 않고 있어요.')}\n\n결제하신 ${booking.price.toLocaleString()}캐시는 전액 돌려드렸어요.`
      });
    });
  }
};
