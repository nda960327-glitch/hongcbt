// ============================================================================
//  우렁 캐시 지갑
//  충전 → 예약 결제·보이스톡 실시간 과금에 사용. 모든 내역이 남는다.
//  ※ 지금은 앱 내 모의 충전. 플레이스토어 인앱결제/PG 연동 지점은 charge() 하나다.
// ============================================================================
window.Wallet = {
  // 공용 이스케이프 — 내역 desc 에 상담사 이름이 들어간다(booking.js 가 저장).
  //  상담사가 삭제돼도 이 문자열은 피해자 기기에 남으므로(영구 XSS) 반드시 막는다.
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  balance() {
    return (window.Storage && window.Storage._safeGet('cbt_cash', 0)) || 0;
  },

  history() {
    return (window.Storage && window.Storage._safeGet('cbt_cash_history', [])) || [];
  },

  _record(type, amount, desc, balance) {
    const h = this.history();
    h.unshift({ ts: Date.now(), type, amount, desc, balance });
    window.Storage._safeSet('cbt_cash_history', h.slice(0, 200));
  },

  // 충전 패키지 — 많이 충전할수록 보너스 캐시를 더 얹어준다
  PACKAGES: [
    { pay: 5000,   bonus: 0,     label: '5천' },
    { pay: 10000,  bonus: 200,   label: '1만' },   // +2%
    { pay: 30000,  bonus: 900,   label: '3만' },   // +3%
    { pay: 50000,  bonus: 2000,  label: '5만' },   // +4%
    { pay: 100000, bonus: 6000,  label: '10만' },  // +6%
    { pay: 300000, bonus: 24000, label: '30만' }   // +8%
  ],

  // 게임 HUD 의 캐시 숫자도 같이 맞춘다
  _syncHud() { if (window.Game && window.Game.renderHud) window.Game.renderHud(); },

  // 충전 — 실제 결제는 js/pay.js(토스페이먼츠)가 한다.
  //  충전 버튼이 여러 화면에 흩어져 있어서 진입점은 여기 하나로 두고,
  //  이 함수는 결제 모듈로 넘기기만 한다. 잔액은 절대 여기서 올리지 않는다 —
  //  '결제창을 띄웠다'와 '승인됐다'는 전혀 다른 일이기 때문이다.
  async charge(pay, bonus = 0) {
    if (!pay || pay <= 0) return false;
    if (window.Pay) return window.Pay.charge(pay, bonus);
    await window.UI.alert({
      title: '결제 모듈을 불러오지 못했어요',
      body: '앱을 새로고침한 뒤 다시 시도해주세요.'
    });
    return false;
  },

  // 지급 — 서버가 결제를 승인한 뒤에만 불린다 (js/pay.js applyPending).
  //  이 함수를 결제 승인 밖에서 부르면 캐시가 공짜로 생긴다. 부르는 곳을 늘리지 말 것.
  credit(total, bonus = 0) {
    const n = Math.max(0, Math.round(Number(total) || 0));
    if (!n) return this.balance();
    const bal = this.balance() + n;
    window.Storage._safeSet('cbt_cash', bal);
    this._record('charge', n, bonus ? `캐시 충전 (보너스 +${bonus.toLocaleString()})` : '캐시 충전', bal);
    if (window.Sfx) window.Sfx.hit('coin');
    this.renderCard();
    this._syncHud();
    return bal;
  },

  // 차감 — 잔액이 부족하면 false
  spend(amount, desc) {
    const bal = this.balance();
    if (bal < amount) return false;
    const next = bal - amount;
    window.Storage._safeSet('cbt_cash', next);
    this._record('spend', amount, desc || '사용', next);
    this.renderCard();
    this._syncHud();
    return true;
  },

  refund(amount, desc) {
    const bal = this.balance() + amount;
    window.Storage._safeSet('cbt_cash', bal);
    this._record('refund', amount, desc || '환불', bal);
    if (window.Sfx) window.Sfx.play('coin');
    this.renderCard();
    this._syncHud();
  },

  // 마이페이지 지갑 카드 렌더링
  renderCard() {
    const el = document.getElementById('wallet-card-body');
    if (!el) return;
    const bal = this.balance();
    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.7rem;">
        <span style="font-size: 0.85rem; color: var(--text-muted);">보유 캐시</span>
        <strong style="font-size: 1.5rem; color: var(--accent-primary);">${bal.toLocaleString()}<span style="font-size: 0.85rem;"> 캐시</span></strong>
      </div>
      <p style="margin: 0 0 0.4rem; font-size: 0.72rem; color: var(--text-muted);">충전 금액이 클수록 보너스 캐시가 커져요</p>
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.4rem; margin-bottom: 0.6rem;">
        ${this.PACKAGES.map(p =>
          `<button class="btn-secondary" style="width: 100%; font-size: 0.76rem; padding: 0.45rem 0.15rem; display: flex; flex-direction: column; align-items: center; gap: 0.1rem; ${p.bonus ? 'border-color: color-mix(in srgb, var(--accent-primary) 40%, transparent);' : ''}" onclick="window.Wallet.charge(${p.pay}, ${p.bonus})">
            <b>+${p.label}</b>
            <span style="font-size: 0.62rem; font-weight: 800; color: ${p.bonus ? 'var(--accent-primary)' : 'var(--text-muted)'};">${p.bonus ? `+${Math.round(p.bonus / p.pay * 100)}%` : '기본'}</span>
          </button>`
        ).join('')}
      </div>
      <button class="btn-secondary" style="width: 100%; font-size: 0.78rem; padding: 0.4rem;" onclick="document.getElementById('wallet-history').classList.toggle('hidden')">충전·사용 내역 보기</button>
      <div id="wallet-history" class="hidden" style="margin-top: 0.6rem; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem;">
        ${this.history().length === 0
          ? '<p style="font-size: 0.78rem; color: var(--text-muted); text-align: center; margin: 0.5rem 0;">아직 내역이 없어요.</p>'
          : this.history().map(h => `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; background: var(--bg-tertiary); border-radius: 8px; padding: 0.45rem 0.6rem;">
              <div style="min-width: 0;">
                <div style="font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this._esc(h.desc)}</div>
                <div style="color: var(--text-muted); font-size: 0.68rem;">${new Date(h.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 잔액 ${h.balance.toLocaleString()}</div>
              </div>
              <strong style="flex-shrink: 0; color: ${h.type === 'spend' ? '#c96a5a' : 'var(--accent-primary)'};">${h.type === 'spend' ? '-' : '+'}${h.amount.toLocaleString()}</strong>
            </div>`).join('')}
      </div>`;
  }
};
