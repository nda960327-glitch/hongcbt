// ============================================================================
//  우렁 캐시 지갑
//  충전 → 예약 결제·보이스톡 실시간 과금에 사용. 모든 내역이 남는다.
//  ※ 지금은 앱 내 모의 충전. 플레이스토어 인앱결제/PG 연동 지점은 charge() 하나다.
// ============================================================================
window.Wallet = {
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
    { pay: 10000,  bonus: 300,   label: '1만' },   // +3%
    { pay: 30000,  bonus: 1500,  label: '3만' },   // +5%
    { pay: 50000,  bonus: 3500,  label: '5만' },   // +7%
    { pay: 100000, bonus: 10000, label: '10만' },  // +10%
    { pay: 300000, bonus: 45000, label: '30만' }   // +15%
  ],

  // 충전 — 실제 서비스에서는 이 함수 안이 Google Play Billing / PG 호출로 바뀐다
  // 게임 HUD 의 캐시 숫자도 같이 맞춘다
  _syncHud() { if (window.Game && window.Game.renderHud) window.Game.renderHud(); },

  charge(pay, bonus = 0) {
    if (!pay || pay <= 0) return false;
    const total = pay + bonus;
    if (!confirm(`${pay.toLocaleString()}원을 결제하고 ${total.toLocaleString()}캐시를 받을까요?${bonus ? `\n🎁 보너스 +${bonus.toLocaleString()}캐시 포함!` : ''}\n(현재는 테스트 충전 — 스토어 결제 연동 전)`)) return false;
    const bal = this.balance() + total;
    window.Storage._safeSet('cbt_cash', bal);
    this._record('charge', total, bonus ? `캐시 충전 (보너스 +${bonus.toLocaleString()})` : '캐시 충전', bal);
    this.renderCard();
    this._syncHud();
    if (bonus && window.App && window.App.showRecordToast) window.App.showRecordToast(`🎁 보너스 ${bonus.toLocaleString()}캐시를 더 받았어요!`);
    return true;
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
                <div style="font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${h.desc}</div>
                <div style="color: var(--text-muted); font-size: 0.68rem;">${new Date(h.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 잔액 ${h.balance.toLocaleString()}</div>
              </div>
              <strong style="flex-shrink: 0; color: ${h.type === 'spend' ? '#c96a5a' : 'var(--accent-primary)'};">${h.type === 'spend' ? '-' : '+'}${h.amount.toLocaleString()}</strong>
            </div>`).join('')}
      </div>`;
  }
};
