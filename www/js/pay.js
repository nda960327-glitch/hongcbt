// ============================================================================
//  우렁 캐시 충전 — 토스페이먼츠 결제창
//
//  흐름 (돈이 걸린 부분은 전부 서버가 판정한다):
//    ① 앱      : /api/pay/ready 로 금액을 못 박고 orderId 를 받는다
//    ② 결제창  : 토스 SDK 가 열고, 끝나면 pay-done.html 로 돌아온다
//    ③ pay-done: /api/pay/confirm 으로 서버가 토스에 승인을 요청한다
//    ④ 앱      : 승인된 캐시만 지갑에 얹는다 (applyPending)
//
//  왜 SDK 를 index.html 에 안 넣나:
//   토스 SDK 는 결제창을 여는 순간에만 필요하다. 미리 넣으면 앱을 켜는
//   모든 사람이 쓰지도 않을 스크립트를 기다린다. 충전 버튼을 누른 뒤
//   동적으로 넣는다 — 그때는 몇백 ms 를 기다려도 이상하지 않다.
// ============================================================================
window.Pay = {
  // 토스 공식 문서에 공개된 테스트 클라이언트 키. 클라이언트 키는 원래
  //  브라우저에 드러나는 값이라 숨길 필요가 없다(승인은 시크릿 키로 서버가 한다).
  //  라이브 전환 시 이 한 줄과 워커 시크릿 TOSS_SECRET_KEY 만 바꾸면 된다.
  CLIENT_KEY: 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm',
  SDK_URL: 'https://js.tosspayments.com/v2/standard',

  // pay-done.html 이 남기고 앱이 집어가는 자리
  PENDING_KEY: 'cbt_cash_pending',
  DONE_KEY: 'cbt_cash_orders',

  _sdk: null,

  loadSdk() {
    if (window.TossPayments) return Promise.resolve(window.TossPayments);
    if (this._sdk) return this._sdk;
    this._sdk = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = this.SDK_URL;
      el.async = true;
      el.onload = () => {
        if (window.TossPayments) resolve(window.TossPayments);
        else { this._sdk = null; reject(new Error('sdk-missing')); }
      };
      el.onerror = () => { this._sdk = null; reject(new Error('sdk-network')); };
      document.head.appendChild(el);
    });
    return this._sdk;
  },

  // 결제 후 돌아올 주소.
  //  location.origin 이 아니라 '지금 문서가 있는 폴더' 기준으로 만든다 —
  //  서브디렉터리 배포(로컬 http-server 포함)와 Capacitor 웹뷰에서도
  //  같은 규칙으로 맞아야 하기 때문이다. (js/app.js proAppUrl 과 같은 방식)
  returnUrl() {
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'pay-done.html';
  },

  // 토스 customerKey 규격: 2~50자 [A-Za-z0-9-_=.@]. clientId 는 'u_xxx' 라
  //  그대로 통과하지만, 예전 기기에서 온 이상한 값이 섞일 수 있어 한 번 거른다.
  customerKey() {
    const raw = (window.App && window.App.clientId) ? String(window.App.clientId()) : '';
    const k = raw.replace(/[^A-Za-z0-9\-_=.@]/g, '').slice(0, 50);
    return k.length >= 2 ? k : 'woorung-guest';
  },

  _won(n) { return (Math.round(n) || 0).toLocaleString('ko-KR'); },

  // ── 충전 ────────────────────────────────────────────────────────────
  //  js/wallet.js 의 충전 버튼이 전부 여기로 들어온다.
  async charge(pay, bonus = 0) {
    pay = Math.round(Number(pay) || 0);
    bonus = Math.round(Number(bonus) || 0);
    if (pay <= 0) return false;
    const total = pay + bonus;

    const ok = await window.UI.confirm({
      title: `${this._won(pay)}원을 결제할까요?`,
      body: bonus
        ? `보너스 ${this._won(bonus)}캐시를 더 얹어 드려요.\n결제창은 토스페이먼츠에서 열립니다.`
        : '결제창은 토스페이먼츠에서 열립니다.',
      priceLabel: '받는 캐시',
      price: `${this._won(total)}캐시`,
      okLabel: '결제하기'
    });
    if (!ok) return false;

    // ① 금액을 서버에 못 박는다. 여기서 받은 orderId·amount 만 결제창에 넘긴다 —
    //   화면에 적힌 숫자를 그대로 결제하면 콘솔에서 얼마든지 바꿀 수 있다.
    let order = null;
    try {
      order = await window.Api.json('/api/pay/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: window.App.clientId(), amount: pay })
      });
    } catch (e) { order = null; }
    if (!order || !order.orderId) {
      await window.UI.alert({
        title: '결제를 시작하지 못했어요',
        body: '잠시 후 다시 시도해주세요. 계속 안 되면 문의해 주세요.',
        icon: 'alert'
      });
      return false;
    }

    // ② 결제창 SDK
    let TossPayments = null;
    try { TossPayments = await this.loadSdk(); }
    catch (e) {
      await window.UI.alert({
        title: '결제창을 불러오지 못했어요',
        body: '인터넷 연결을 확인하고 다시 시도해주세요.',
        icon: 'alert'
      });
      return false;
    }

    // 결제 성공/실패 모두 같은 주소로 돌아온다. 토스가 성공이면
    //  paymentKey·orderId·amount 를, 실패면 code·message 를 붙여 준다.
    const back = this.returnUrl();
    try {
      const payment = TossPayments(this.CLIENT_KEY).payment({ customerKey: this.customerKey() });
      // 카드로 제한한다. 가상계좌는 '입금 전'에도 결제창이 성공으로 끝나서
      //  캐시를 언제 줘야 하는지가 통째로 달라진다(입금 웹훅이 따로 필요하다).
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName || '우렁 캐시 충전',
        successUrl: back,
        failUrl: back,
        card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false }
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 것은 오류가 아니다 — 조용히 돌아간다
      const code = (e && e.code) || '';
      if (code === 'USER_CANCEL' || code === 'PAY_PROCESS_CANCELED') return false;
      await window.UI.alert({
        title: '결제를 마치지 못했어요',
        body: (e && e.message) ? String(e.message).slice(0, 120) : '잠시 후 다시 시도해주세요.',
        icon: 'alert'
      });
      return false;
    }
    return true;   // 여기까지 오면 브라우저는 이미 결제창/리디렉션으로 넘어간 상태다
  },

  // ── 돌아온 뒤 ────────────────────────────────────────────────────────
  //  왜 pay-done.html 이 잔액을 직접 안 건드리나:
  //   잔액은 내역·게임 HUD·효과음이 함께 움직여야 한다. 그 규칙은 Wallet
  //   한 곳에만 두는 게 안전하다. pay-done 은 '승인된 캐시'만 적어 두고
  //   앱이 뜰 때 여기서 지갑에 얹는다.
  applyPending() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(this.PENDING_KEY) || 'null'); } catch (e) { p = null; }
    if (!p || !p.orderId || !(p.cash > 0)) return;

    // 같은 주문을 두 번 얹지 않는다 — 뒤로 가기·세션 복원으로 다시 들어올 수 있다
    const done = (window.Storage && window.Storage._safeGet(this.DONE_KEY, [])) || [];
    if (done.indexOf(p.orderId) >= 0) {
      // 이미 반영된 주문 — 남아 있던 대기표만 정리한다
      try { localStorage.removeItem(this.PENDING_KEY); } catch (e) {}
      return;
    }

    // 순서가 중요하다: 지갑에 먼저 얹고, 실제로 얹혔음을 확인한 뒤에야
    //  대기표(PENDING_KEY)를 지운다. 예전에는 대기표를 먼저 지워서, credit 이
    //  용량 초과 등으로 조용히 실패하면 "돈은 냈는데 캐시도 재시도 근거도 소멸"했다.
    const expected = Math.max(0, Math.round(Number(p.cash) || 0));
    const before = window.Wallet.balance ? window.Wallet.balance() : null;
    window.Wallet.credit(p.cash, p.bonus || 0);
    // credit 은 _safeSet 실패를 알려주지 않으므로 잔액으로 직접 확인한다.
    if (before != null && expected > 0) {
      const after = window.Wallet.balance ? window.Wallet.balance() : null;
      if (after != null && after < before + expected) {
        // 반영 실패 — 대기표를 남겨 다음 부팅에 다시 시도한다 (돈은 지키고 재시도 근거 보존)
        return;
      }
    }
    // 여기까지 왔으면 캐시가 지갑에 실제로 얹혔다 — 이제 완료 기록하고 대기표를 지운다
    window.Storage._safeSet(this.DONE_KEY, [p.orderId].concat(done).slice(0, 50));
    try { localStorage.removeItem(this.PENDING_KEY); } catch (e) {}
    // 앱이 다 뜬 뒤에 알려준다 — 부팅 도중 띄우면 토스트가 화면과 함께 날아간다
    setTimeout(() => {
      try {
        if (window.App && window.App.showRecordToast) {
          window.App.showRecordToast(`${this._won(p.cash)}캐시가 충전됐어요!`);
        }
      } catch (e) {}
    }, 700);
  }
};

// defer 스크립트라 이 시점에는 Storage·Wallet 이 이미 올라와 있다.
//  pay.js 는 app.js 보다 먼저 실행되므로 이 리스너도 먼저 걸린다 —
//  잔액을 먼저 맞춰 놓아야 첫 화면에 옛 숫자가 스치지 않는다.
document.addEventListener('DOMContentLoaded', () => {
  try { window.Pay.applyPending(); } catch (e) {}
});
