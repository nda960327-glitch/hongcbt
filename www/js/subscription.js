// ============================================================================
//  구독 — 7일 무료 체험 후: 무료 플랜(챗봇 하루 30회) / 구독(무제한 + 보이스톡)
//  · 가격 미정: 아래 PRICE 숫자 하나만 바꾸면 앱 전체(문구·결제)에 반영된다.
//  · 결제는 우렁 캐시로 처리 (플레이스토어 구독 연동 지점은 subscribe() 하나)
//  · 챗봇: 체험·구독 중 무제한, 그 외 하루 30회 무료
//  · 보이스톡(AI 전화): 체험·구독 전용
// ============================================================================
window.Subscription = {
  PRICE: 9900,      // 월 구독가 (원) — 미정이라 임시값, 여기만 수정하면 됨
  TRIAL_DAYS: 7,
  FREE_DAILY_CHATS: 30, // 비구독자 하루 무료 대화 횟수

  init() {
    // 첫 실행 시점부터 체험 시작
    if (!window.Storage._safeGet('cbt_trial_start', null)) {
      window.Storage._safeSet('cbt_trial_start', Date.now());
    }
    this.renderCard();
    this.renderBadge();
    this._expiryNudge();
  },

  // 만료 예고 — 당일에야 알게 되지 않도록, 구독 3일 전 / 체험 2일 전부터 하루 한 번 안내
  _expiryNudge() {
    const today = new Date().toLocaleDateString('sv-CA');
    if (window.Storage._safeGet('cbt_sub_nudged', '') === today) return;
    let msg = null;
    if (this.isSubscribed()) {
      const d = Math.ceil((this.subUntil() - Date.now()) / 86400000);
      if (d <= 3) msg = `구독이 ${d}일 후 만료돼요. 마이페이지에서 연장할 수 있어요`;
    } else if (this.hasAccess()) {
      const d = this.trialDaysLeft();
      if (d <= 2) msg = `무료 체험이 ${d}일 남았어요. 이후엔 매일 30회 무료 대화로 전환돼요`;
    }
    if (msg) {
      window.Storage._safeSet('cbt_sub_nudged', today);
      setTimeout(() => {
        if (window.App && window.App.showRecordToast) window.App.showRecordToast('⏳ ' + msg);
        if (window.App && window.App.notify) window.App.notify('우렁의사', msg);
      }, 2500);
    }
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

  // === 무료 플랜: 하루 대화 횟수 ===
  _todayKey() {
    return new Date().toLocaleDateString('sv-CA');
  },

  chatUsedToday() {
    const d = window.Storage._safeGet('cbt_daily_chat', null);
    return (d && d.date === this._todayKey()) ? d.count : 0;
  },

  chatLeft() {
    return Math.max(0, this.FREE_DAILY_CHATS - this.chatUsedToday());
  },

  bumpChat() {
    const key = this._todayKey();
    const d = window.Storage._safeGet('cbt_daily_chat', null);
    const count = (d && d.date === key) ? d.count + 1 : 1;
    window.Storage._safeSet('cbt_daily_chat', { date: key, count });
    this.renderBadge();
    const left = this.chatLeft();
    if ((left === 5 || left === 1) && window.App && window.App.showRecordToast) {
      window.App.showRecordToast(`오늘 무료 대화가 ${left}회 남았어요`);
    }
  },

  // 챗봇 진입 관문: 체험·구독은 무제한, 무료 플랜은 하루 30회
  guardChat() {
    if (this.hasAccess()) return true;
    if (this.chatLeft() > 0) return true;
    this.showPaywall('chat');
    return false;
  },

  // 보이스톡(AI 전화) 진입 관문: 체험·구독 전용
  guardCall() {
    if (this.hasAccess()) return true;
    this.showPaywall('call');
    return false;
  },

  // 하위 호환 (기존 호출부)
  guard() {
    return this.guardChat();
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

  showPaywall(kind) {
    const m = document.getElementById('sub-paywall-modal');
    if (!m) return;
    const priceEl = document.getElementById('sub-paywall-price');
    if (priceEl) priceEl.textContent = `월 ${this.PRICE.toLocaleString()}원`;
    const st = document.getElementById('sub-paywall-sticker');
    if (st && window.Stickers) st.innerHTML = window.Stickers.svg('sad', 96);
    // 상황별 안내 문구
    const title = document.getElementById('sub-paywall-title');
    const desc = document.getElementById('sub-paywall-desc');
    if (title && desc) {
      if (kind === 'call') {
        title.textContent = '보이스톡은 구독 전용이에요';
        desc.innerHTML = '우렁이와 목소리로 나누는 통화는<br>구독하면 바로 이용할 수 있어요.';
      } else if (kind === 'chat') {
        title.textContent = `오늘 무료 대화 ${this.FREE_DAILY_CHATS}회를 다 썼어요`;
        desc.innerHTML = '내일이 되면 다시 30회가 채워져요.<br>구독하면 횟수 걱정 없이 계속 이야기할 수 있어요.';
      } else {
        title.textContent = '일주일 무료 체험이 끝났어요';
        desc.innerHTML = `이제 매일 ${this.FREE_DAILY_CHATS}회 무료로 대화할 수 있어요.<br>구독하면 무제한 대화 + 보이스톡이 열립니다.`;
      }
    }
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
      el.textContent = `무료 · 오늘 ${this.chatLeft()}/${this.FREE_DAILY_CHATS}회`;
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
        <p style="margin: 0 0 0.35rem; font-size: 0.9rem; color: var(--text-primary);"><b style="color: #c14a4a;">무료 플랜</b> · 오늘 대화 ${this.chatUsedToday()}/${this.FREE_DAILY_CHATS}회 사용</p>
        <p style="margin: 0 0 0.6rem; font-size: 0.76rem; color: var(--text-muted);">구독하면 <b>무제한 대화</b>에 <b>보이스톡(음성 통화)</b>까지 열려요.</p>
        <button class="btn-primary" style="width: 100%; font-size: 0.85rem;" onclick="window.Subscription.subscribe()">구독 시작하기 (월 ${this.PRICE.toLocaleString()}원)</button>`;
    }
  }
};
