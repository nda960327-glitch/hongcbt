// ============================================================================
//  상담 예약 — 마인드카페식 달력 + 시간대 선택 + 우렁캐시 결제
//  상담사별·날짜별 가능 시간은 결정적 해시로 생성(서버 연동 전 데모 스케줄).
//  실서비스에서는 slotsFor()가 상담사 가능시간 API 응답으로 교체된다.
// ============================================================================
window.Booking = {
  // 공용 이스케이프 — 상담사 이름·병원이 예약 모달에 그대로 들어간다.
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  currentCounselorId: null,
  calYear: 0,
  calMonth: 0, // 0-11
  selDate: null,  // 'YYYY-MM-DD'
  selTime: null,  // 'HH:MM'

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

  // 해당 상담사·날짜의 예약 가능 시간대
  slotsFor(counselorId, dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    let slots;
    // 입점 상담사(cu_*)는 본인이 설정한 '상담 가능 시간'을 그대로 사용
    const avail = window.Storage && window.Storage._safeGet('cbt_my_avail', null);
    if (String(counselorId).startsWith('cu_') && avail) {
      slots = [...(avail[d.getDay()] || [])];
    } else {
      if (d.getDay() === 0) return []; // 일요일 휴무 (기본 상담사)
      const base = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'];
      const h = this._hash(String(counselorId) + dateStr);
      slots = base.filter((_, i) => ((h >> i) & 3) !== 3); // 약 75% 오픈 (데모 스케줄)
    }
    // 이미 예약된 시간대는 제외 (취소된 예약은 다시 열림)
    const booked = ((window.Storage && window.Storage._safeGet('cbt_bookings', [])) || [])
      .filter(b => b.counselorId === counselorId && b.status !== 'cancelled' && b.whenTs &&
        new Date(b.whenTs).toLocaleDateString('sv-CA') === dateStr)
      .map(b => { const t = new Date(b.whenTs); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); });
    slots = slots.filter(t => !booked.includes(t));
    // 오늘이면 이미 지난 시간 제외 (2시간 여유)
    const today = new Date();
    if (dateStr === today.toLocaleDateString('sv-CA')) {
      const cut = today.getHours() + 2;
      slots = slots.filter(t => parseInt(t, 10) >= cut);
    }
    return slots.sort();
  },

  openModal(counselorId) {
    try { if (window.Sfx) window.Sfx.play('pop'); } catch (e) {}
    this.currentCounselorId = counselorId;
    const counselor = window.Marketplace.getCounselor(counselorId);
    if (!counselor) return;

    const now = new Date();
    this.calYear = now.getFullYear();
    this.calMonth = now.getMonth();
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
        · 1회기 상담 시간은 <b>30분</b>입니다.<br>
        · 예약이 확정되면 <b>알림</b>으로 알려드려요.<br>
        · 예약 시간이 되면 <b>마이페이지 › 나의 상담 내역</b>의 [전화 상담] 버튼으로 상담사님과 바로 연결됩니다.<br>
        · 상담 전 나누고 싶은 이야기는 [채팅]으로 미리 남겨둘 수 있어요.<br>
        · 시간 변경·취소는 <b>상담 24시간 전까지 무료</b>, 이후엔 50% 환불됩니다.<br>
      </div>`;

    this.renderCal();
    this.renderTimes();
    document.getElementById('booking-modal').classList.remove('hidden');
  },

  renderCal() {
    const el = document.getElementById('bk-cal');
    if (!el) return;
    const y = this.calYear, m = this.calMonth;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today.getTime() + 60 * 86400000); // 60일 이내 예약
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const curMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonth = new Date(y, m, 1);
    const canPrev = thisMonth > curMonth;
    const canNext = thisMonth < new Date(today.getFullYear(), today.getMonth() + 2, 1);

    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<span></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m, d);
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const inRange = date >= today && date <= maxDate;
      const hasSlots = inRange && this.slotsFor(this.currentCounselorId, dateStr).length > 0;
      const sel = this.selDate === dateStr;
      const isToday = date.getTime() === today.getTime();
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
    if (!this.selDate) {
      el.innerHTML = `<p style="grid-column: 1 / -1; margin: 0.2rem 0; font-size: 0.8rem; color: var(--text-muted); text-align: center;">먼저 날짜를 선택해주세요.</p>`;
      return;
    }
    const slots = this.slotsFor(this.currentCounselorId, this.selDate);
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

  confirmBooking() {
    if (!this.currentCounselorId) return;
    const counselor = window.Marketplace.getCounselor(this.currentCounselorId);

    if (!this.selDate || !this.selTime) {
      if (window.Sfx) window.Sfx.hit('denied');
      window.UI.alert('예약하실 날짜와 시간을 선택해주세요.');
      return;
    }

    // 우렁 캐시로 결제 (잔액 부족 시 충전 유도)
    if (window.Wallet && !window.Wallet.spend(counselor.price, `${counselor.name} 상담 예약`)) {
      if (window.Sfx) window.Sfx.hit('denied');
      window.UI.alert(`잔액이 부족해요.\n상담료 ${counselor.price.toLocaleString()}캐시 / 보유 ${window.Wallet.balance().toLocaleString()}캐시\n\n마이페이지에서 캐시를 충전해주세요.`);
      this.closeModal();
      document.querySelector('[data-tab="mypage"]').click();
      return;
    }

    const dateObj = new Date(this.selDate + 'T' + this.selTime + ':00');
    const dow = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
    const formattedDate = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 (${dow}) ${this.selTime}`;

    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const booking = {
      id: 'bk_' + Date.now(),
      counselorId: counselor.id,
      name: counselor.name,
      hospital: counselor.hospital,
      price: counselor.price,
      time: formattedDate,
      whenTs: dateObj.getTime(),
      status: 'confirmed',
      ts: Date.now()
    };
    bookings.unshift(booking);
    window.Storage._safeSet('cbt_bookings', bookings.slice(0, 50));

    // 서버 예약 장부에도 기록 — 상담사 페이지(/counselor.html) 일정에 뜬다
    try {
      window.Api.f('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: booking.id, counselorId: counselor.id, counselorName: counselor.name,
          clientId: window.App ? window.App.clientId() : '',
          clientName: window.Storage._safeGet('cbt_user_name', '') || '익명',
          time: formattedDate, whenTs: booking.whenTs, price: counselor.price
        })
      }).then(res => {
        // 구독이 끊긴 상담사는 서버가 신규 예약을 막는다(409 sub_expired).
        //  우리가 보고 있는 목록은 조금 전에 받아온 것이라, 그 사이 만료된 분이
        //  카드에 남아 있을 수 있다. 여기서 조용히 넘어가면 캐시는 빠져나갔는데
        //  상담사 화면에는 예약이 없어서, 내담자만 오지 않을 상담을 기다리게 된다.
        if (!res || res.status !== 409) return;
        return res.json().catch(() => ({})).then(err => {
          if (err && err.error === 'sub_expired') this._undoBooking(booking, counselor);
        });
      }).catch(() => {});   // 네트워크가 끊긴 것뿐이면 예약은 기기에 남겨 둔다
    } catch (e) {}

    // 되돌릴 때 이 창이 닫히기를 기다린다 — 안내 두 장이 겹쳐 뜨면 아무도 못 읽는다
    this._payAlert = window.UI.alert(`결제가 완료되었습니다! (-${counselor.price.toLocaleString()}캐시)\n\n${counselor.name}님과의 상담이 [${formattedDate}]에 예약되었습니다.\n\n마이페이지에서 확인하세요.`);

    this.closeModal();
    if (window.App && window.App.renderMyBookings) window.App.renderMyBookings();
    document.querySelector('[data-tab="mypage"]').click();
  },

  // 서버가 예약을 받지 않았을 때 되돌린다.
  //  기기에 적어 둔 예약을 지우고 캐시를 전액 돌려준다 — 돈이 걸린 일이라
  //  '나중에 운영자가 확인해서'로 미룰 수 없다.
  _undoBooking(booking, counselor) {
    Promise.resolve(this._payAlert).catch(() => {}).then(() => {
      const left = (window.Storage._safeGet('cbt_bookings', []) || []).filter(b => b && b.id !== booking.id);
      window.Storage._safeSet('cbt_bookings', left);
      if (window.Wallet) window.Wallet.refund(booking.price, `${counselor.name} 상담 예약 취소`);
      if (window.App && window.App.renderMyBookings) window.App.renderMyBookings();
      // 목록은 굳이 다시 받지 않는다 — 새로고침 효과음·토스트가 사과 문구와 겹친다.
      //  만료된 상담사는 서버가 걸러 주므로 다음 갱신 때 카드에서 조용히 사라진다.
      window.UI.alert({
        title: '지금은 예약을 받을 수 없어요',
        body: `${counselor.name} 선생님은 현재 상담을 받지 않고 있어요.\n\n결제하신 ${booking.price.toLocaleString()}캐시는 전액 돌려드렸습니다. 다른 선생님을 찾아봐 주세요.`
      });
    });
  }
};
