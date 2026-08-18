// ============================================================================
//  정산 — 상담료가 어떻게 나뉘는지 한 곳에서 정의한다.
//
//  이 비율이 코드 여기저기 흩어져 있으면 정책이 바뀔 때 반드시 어긋난다.
//  상담사에게 보여주는 안내, 예약 화면의 내역, 관리자 정산표가 전부 여기를 본다.
//
//  결제는 인앱이 아니라 외부 PG 로 받는다.
//   · 앱 내에서만 쓰이는 것(구독·캐시)은 스토어 인앱 결제 의무 대상이지만,
//     실제 사람이 제공하는 상담은 오프라인 서비스라 외부 결제가 가능하다.
//   · 상담료에서 우리가 가져가는 몫이 0 이 된 뒤에도 이 원칙은 그대로다 —
//     인앱으로 받으면 상담사에게 갈 돈에서 15% 가 먼저 잘려 나간다.
// ============================================================================
window.Payout = {
  // 합이 100 이어야 한다. 바꿀 때 이 주석도 같이 고칠 것.
  //  2026-08-11 개편: 기관 몫은 배분에서 뺐다 — 기관 협의 수수료는 플랫폼 몫에서
  //  나중에 따로 떼어주는 방식이 정산 관리가 훨씬 단순하다.
  //  2026-08-18 개편: 분배 폐지, 상담사 구독제(월 99,000원 · 첫 달 무료) 전환.
  //  상담료는 PG 3% 를 제외한 전액이 상담사 몫이고, 플랫폼은 상담료에서
  //  한 푼도 가져가지 않는다. 우리 수익은 상담사 구독료 하나뿐이다.
  //  (market.js 의 SPLIT · PRO_SUB_PRICE 와 반드시 같은 값이어야 한다)
  SPLIT: {
    counselor: 97,   // 상담을 실제로 하는 사람 — 실비(PG)를 뺀 전액
    hospital: 0,     // (배분 종료 — 기관 수수료는 상담사·기관 사이의 문제다)
    pg: 3,           // 결제대행 수수료 (실비)
    platform: 0      // 우렁의사 — 상담료에서는 받지 않는다. 수익은 구독료.
  },

  // 상담사 구독 — 플랫폼의 유일한 상담 관련 수익원.
  //  market.js 의 PRO_SUB_PRICE · PRO_SUB_FREE_DAYS 와 같은 값이어야 한다.
  PRO_SUB: {
    PRICE: 99000,    // 월 구독료 (원)
    FREE_DAYS: 30    // 등록 승인 후 무료 기간
  },

  LABEL: {
    counselor: '상담사',
    hospital: '소속 기관',
    pg: '결제 수수료',
    platform: '우렁의사'
  },

  // 정산 주기 — 상담 완료일 기준
  SETTLE_DAYS: 7,

  _sum() {
    const s = this.SPLIT;
    return s.counselor + s.hospital + s.pg + s.platform;
  },

  // 상담료를 실제 금액으로 쪼갠다. 반올림 오차는 상담사가 흡수한다 —
  //  실비 몫들만 반올림하고 상담사가 나머지 전부를 가져간다.
  //  (플랫폼 몫이 0 이 된 뒤로는 상담사 몫까지 따로 반올림하면 1,650원 같은
  //   금액에서 합이 총액을 넘어 platform 이 -1원으로 떨어진다)
  //  계산식은 market.js payoutOf 와 한 글자도 다르면 안 된다 — 화면에 뜬 금액과
  //  실제로 입금되는 금액이 갈라지면 그 차이는 전부 문의로 돌아온다.
  breakdown(price) {
    const p = Math.max(0, Math.round(Number(price) || 0));
    const s = this.SPLIT;
    const hospital = Math.round(p * s.hospital / 100);
    const pg = Math.round(p * s.pg / 100);
    const platform = Math.round(p * s.platform / 100);
    const counselor = Math.max(0, p - hospital - pg - platform);
    return { total: p, counselor, hospital, pg, platform };
  },

  won(n) { return (n || 0).toLocaleString('ko-KR') + '원'; },

  // 상담사에게 보여주는 안내 — 신청 화면과 마이페이지에서 쓴다
  noticeHtml(sample = 100000) {
    const b = this.breakdown(sample);
    const s = this.SPLIT;
    const row = (label, pct, amt, strong) => `
      <div style="display: flex; align-items: baseline; gap: 0.5rem; padding: 0.28rem 0;
                  ${strong ? 'border-top: 1px dashed var(--glass-border); margin-top: 0.2rem; padding-top: 0.45rem;' : ''}">
        <span style="flex: 0 0 74px; font-size: 0.78rem; font-weight: ${strong ? '800' : '600'}; color: var(--text-primary);">${label}</span>
        <span style="font-size: 0.74rem; color: var(--text-muted);">${pct}%</span>
        <span style="margin-left: auto; font-size: 0.8rem; font-weight: ${strong ? '800' : '700'};
                     color: ${strong ? 'var(--accent-primary)' : 'var(--text-primary)'};">${this.won(amt)}</span>
      </div>`;

    return `
      <div style="border-radius: 14px; padding: 0.85rem 0.95rem; background: var(--bg-tertiary); border: 1px solid var(--glass-border);">
        <div style="display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.5rem;">
          <span style="line-height: 0; color: var(--accent-primary);">${window.Icons ? window.Icons.svg('cash', { size: 16 }) : ''}</span>
          <strong style="font-size: 0.84rem; color: var(--text-primary);">정산 구조</strong>
          <span style="margin-left: auto; font-size: 0.68rem; color: var(--text-muted);">${this.won(sample)} 상담 기준</span>
        </div>
        ${row(this.LABEL.counselor, s.counselor, b.counselor, true)}
        ${s.hospital > 0 ? row(this.LABEL.hospital, s.hospital, b.hospital) : ''}
        ${row(this.LABEL.pg, s.pg, b.pg)}
        ${s.platform > 0 ? row(this.LABEL.platform, s.platform, b.platform) : ''}
        <p style="margin: 0.55rem 0 0; font-size: 0.71rem; line-height: 1.6; color: var(--text-muted);">
          ${s.platform > 0 ? '' : `우렁의사는 상담료에서 <b style="color: var(--text-primary);">한 푼도 가져가지 않아요.</b>
          ${this.won(b.pg)}은 카드사·PG 로 나가는 실비입니다.<br>`}
          상담 완료 ${this.SETTLE_DAYS}일 뒤 등록한 계좌로 입금돼요.
        </p>
        ${s.platform > 0 ? '' : `
        <p style="margin: 0.5rem 0 0; padding-top: 0.5rem; border-top: 1px dashed var(--glass-border);
                  font-size: 0.71rem; line-height: 1.6; color: var(--text-muted);">
          대신 상담사 <b style="color: var(--text-primary);">월 구독료 ${this.won(this.PRO_SUB.PRICE)}</b>으로 운영해요.
          등록이 승인되면 <b style="color: var(--accent-primary);">첫 ${Math.round(this.PRO_SUB.FREE_DAYS / 30)}개월은 무료</b>입니다.
        </p>`}
      </div>`;
  },

  // 예약 화면에서 내담자에게는 총액만 보이면 된다.
  //  (내부 배분을 내담자에게 보여줄 이유가 없다)
  render() {
    document.querySelectorAll('[data-payout-notice]').forEach(el => {
      const sample = Number(el.dataset.payoutNotice) || 100000;
      el.innerHTML = this.noticeHtml(sample);
    });
  }
};
