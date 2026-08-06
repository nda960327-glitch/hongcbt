// ============================================================================
//  구독 — 7일 무료 체험 후 월 구독
//  · 가격 미정: 아래 PRICE 숫자 하나만 바꾸면 앱 전체(문구·결제)에 반영된다.
//  · 결제는 우렁 캐시로 처리 (플레이스토어 구독 연동 지점은 subscribe() 하나)
// ============================================================================
window.Subscription = {
  PRICE: 9900,      // 월 구독가 (원) — 미정이라 임시값, 여기만 수정하면 됨
  TRIAL_DAYS: 7,

  init() {
    // 첫 실행 시점부터 체험 시작
    if (!window.Storage._safeGet('cbt_trial_start', null)) {
      window.Storage._safeSet('cbt_trial_start', Date.now());
    }
    this.renderCard();
    this.renderBadge();
  },

  trialEnd() {
    return (window.Storage._safeGet('cbt_trial_start', Date.now())) + this.TRIAL_DAYS * 86400000;
  },

  trialDaysLeft() {
    return Math.max(0, Math.ceil((this.trialEnd() - Date.now()) / 86400000));
  },

  subUntil() {
    return window.Storage._safeGet('cbt_sub_until', 0) || 0;
  },

  isSubscribed() {
    return this.subUntil() > Date.now();
  },

  hasAccess() {
    return this.isSubscribed() || Date.now() < this.trialEnd();
  },

  // 대화·통화 진입 관문: 접근 불가면 구독 안내를 띄우고 false
  guard() {
    if (this.hasAccess()) return true;
    this.showPaywall();
    return false;
  },

  // 구독 결제 — 실서비스에서는 이 함수가 Google Play 구독 결제 호출로 바뀐다
  subscribe() {
    if (!window.Wallet || !window.Wallet.spend(this.PRICE, '우렁의사 월 구독')) {
      alert(`캐시가 부족해요. (월 구독 ${this.PRICE.toLocaleString()}원)\n마이페이지에서 충전 후 다시 시도해주세요.`);
      const m = document.getElementById('sub-paywall-modal');
      if (m) m.classList.add('hidden');
      if (window.App) window.App.switchTab('mypage');
      return;
    }
    const base = Math.max(Date.now(), this.subUntil());
    window.Storage._safeSet('cbt_sub_until', base + 30 * 86400000);
    const m = document.getElementById('sub-paywall-modal');
    if (m) m.classList.add('hidden');
    alert(`구독이 시작되었습니다! 🎉\n다음 결제일: ${new Date(this.subUntil()).toLocaleDateString('ko-KR')}\n우렁이와의 대화가 계속됩니다.`);
    this.renderCard();
    this.renderBadge();
  },

  showPaywall() {
    const m = document.getElementById('sub-paywall-modal');
    if (!m) return;
    const priceEl = document.getElementById('sub-paywall-price');
    if (priceEl) priceEl.textContent = `월 ${this.PRICE.toLocaleString()}원`;
    const st = document.getElementById('sub-paywall-sticker');
    if (st && window.Stickers) st.innerHTML = window.Stickers.svg('sad', 96);
    m.classList.remove('hidden');
  },

  // 챗봇 프로필 바의 상태 칩: 체험 D-n / 구독중
  renderBadge() {
    const el = document.getElementById('sub-badge');
    if (!el) return;
    if (this.isSubscribed()) {
      el.textContent = '구독중';
      el.style.cssText = el.style.cssText.replace(/background:[^;]+;?/, '') + ';background: color-mix(in srgb, var(--accent-primary) 18%, transparent); color: var(--accent-primary);';
    } else if (this.hasAccess()) {
      el.textContent = `체험 D-${this.trialDaysLeft()}`;
      el.style.cssText += ';background: #f5c74e33; color: #b98a1a;';
    } else {
      el.textContent = '구독 필요';
      el.style.cssText += ';background: #e05d5d22; color: #c14a4a;';
    }
  },

  // 마이페이지 구독 카드
  renderCard() {
    const el = document.getElementById('sub-card-body');
    if (!el) return;
    if (this.isSubscribed()) {
      el.innerHTML = `
        <p style="margin: 0 0 0.6rem; font-size: 0.9rem; color: var(--text-primary);"><b style="color: var(--accent-primary);">구독 이용 중</b> · ${new Date(this.subUntil()).toLocaleDateString('ko-KR')}까지</p>
        <button class="btn-secondary" style="width: 100%; font-size: 0.82rem;" onclick="window.Subscription.subscribe()">1개월 연장하기 (${this.PRICE.toLocaleString()}원)</button>
        <p style="margin: 0.5rem 0 0; font-size: 0.7rem; color: var(--text-muted);">해지는 만료일까지 그냥 두시면 돼요. 자동 결제되지 않습니다.</p>`;
    } else if (this.hasAccess()) {
      el.innerHTML = `
        <p style="margin: 0 0 0.6rem; font-size: 0.9rem; color: var(--text-primary);"><b style="color: #b98a1a;">무료 체험 중</b> · ${this.trialDaysLeft()}일 남음</p>
        <button class="btn-primary" style="width: 100%; font-size: 0.85rem;" onclick="window.Subscription.subscribe()">미리 구독 시작하기 (월 ${this.PRICE.toLocaleString()}원)</button>
        <p style="margin: 0.5rem 0 0; font-size: 0.7rem; color: var(--text-muted);">체험이 끝나도 기록·기억은 그대로 남아요. 대화만 잠겨요.</p>`;
    } else {
      el.innerHTML = `
        <p style="margin: 0 0 0.6rem; font-size: 0.9rem; color: var(--text-primary);"><b style="color: #c14a4a;">체험 종료</b> · 우렁이가 기다리고 있어요</p>
        <button class="btn-primary" style="width: 100%; font-size: 0.85rem;" onclick="window.Subscription.subscribe()">구독 시작하기 (월 ${this.PRICE.toLocaleString()}원)</button>`;
    }
  }
};
