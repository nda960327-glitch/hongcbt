// ============================================================================
//  정산 — 상담료가 어떻게 나뉘는지 한 곳에서 정의한다.
//
//  이 비율이 코드 여기저기 흩어져 있으면 정책이 바뀔 때 반드시 어긋난다.
//  상담사에게 보여주는 안내, 예약 화면의 내역, 관리자 정산표가 전부 여기를 본다.
//
//  결제는 인앱이 아니라 외부 PG 로 받는다.
//   · 앱 내에서만 쓰이는 것(구독·캐시)은 스토어 인앱 결제 의무 대상이지만,
//     실제 사람이 제공하는 상담은 오프라인 서비스라 외부 결제가 가능하다.
//   · 인앱으로 받으면 수수료 15% 가 붙어 플랫폼 몫(17%)이 거의 남지 않는다.
// ============================================================================
window.Payout = {
  // 합이 100 이어야 한다. 바꿀 때 이 주석도 같이 고칠 것.
  SPLIT: {
    counselor: 70,   // 상담을 실제로 하는 사람
    hospital: 10,    // 소속 기관 (공간·행정·감독)
    pg: 3,           // 결제대행 수수료
    platform: 17     // 우렁의사 — 매칭·기록·리포트·정산 운영
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

  // 상담료를 실제 금액으로 쪼갠다. 반올림 오차는 플랫폼 몫에서 흡수한다.
  //  (상담사·기관에게 1원이라도 덜 주는 일이 없게)
  breakdown(price) {
    const p = Math.max(0, Math.round(Number(price) || 0));
    const s = this.SPLIT;
    const counselor = Math.round(p * s.counselor / 100);
    const hospital = Math.round(p * s.hospital / 100);
    const pg = Math.round(p * s.pg / 100);
    const platform = p - counselor - hospital - pg;
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
        ${row(this.LABEL.hospital, s.hospital, b.hospital)}
        ${row(this.LABEL.pg, s.pg, b.pg)}
        ${row(this.LABEL.platform, s.platform, b.platform)}
        <p style="margin: 0.55rem 0 0; font-size: 0.71rem; line-height: 1.6; color: var(--text-muted);">
          상담 완료 ${this.SETTLE_DAYS}일 뒤 등록한 계좌로 입금돼요.
          소속 기관 몫은 기관 계좌로 따로 보내드려요.
        </p>
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
