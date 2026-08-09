// ============================================================================
//  최신 버전 보증
//
//  배포했는데 기기에 옛 화면이 남는 문제를 코드로 끝낸다.
//  캐시 헤더·서비스워커 설정은 이미 손봤지만, 그건 서버와 브라우저의
//  선의에 기대는 방법이다. 도메인 쪽 설정 하나가 다시 덮어쓰면 그만이다.
//  (실제로 neurumind.com 이 max-age=14400 으로 덮고 있었다)
//
//  그래서 확실한 걸 하나 둔다 — 주소에 매번 다른 값을 붙여 version.json 을
//  받아온다. 물음표 뒤가 다르면 HTTP 캐시는 다른 파일로 보고 반드시
//  네트워크로 나간다. 어떤 캐시 설정도 이걸 막지 못한다.
//
//  서버 판 번호가 지금 돌고 있는 것보다 크면 = 내가 옛 코드다.
//  한 번만 조용히 갈아탄다. 여러 번 하면 무한 새로고침이 된다.
// ============================================================================

window.Freshness = {
  // index.html 이 심어 주는 값. 배포할 때 sw.js 와 함께 올라간다.
  local() { return Number(window.APP_BUILD || 0); },

  async serverBuild() {
    try {
      // 캐시를 확실히 피한다: 매번 다른 주소 + no-store
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return 0;
      const d = await r.json();
      return Number(d && d.build) || 0;
    } catch (e) { return 0; }
  },

  async check(auto) {
    const mine = this.local();
    const theirs = await this.serverBuild();
    if (!mine || !theirs || theirs <= mine) return { fresh: true, mine, theirs };

    // 내가 옛 코드다.
    if (auto && !sessionStorage.getItem('cbt_auto_freshened')) {
      // 이번 세션에 딱 한 번만. 안 그러면 배포가 꼬였을 때 무한 새로고침이 된다.
      sessionStorage.setItem('cbt_auto_freshened', '1');
      await this.purge();
      location.replace(location.pathname + '?fresh=' + theirs);
      return { fresh: false, reloading: true, mine, theirs };
    }
    // 이미 한 번 시도했는데도 옛 코드면 사용자에게 맡긴다
    this.banner(theirs);
    return { fresh: false, mine, theirs };
  },

  // 서비스워커와 캐시를 걷어낸다. 기록(localStorage)은 건드리지 않는다.
  async purge() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {}
  },

  banner(theirs) {
    if (document.getElementById('fresh-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'fresh-bar';
    bar.style.cssText =
      'position:fixed; left:50%; transform:translateX(-50%); bottom:calc(4.6rem + env(safe-area-inset-bottom));' +
      'z-index:10120; display:flex; align-items:center; gap:0.5rem 0.6rem; flex-wrap:wrap; justify-content:flex-end;' +
      'max-width:min(92vw,420px); padding:0.6rem 0.7rem 0.6rem 0.95rem; border-radius:14px; font-size:0.82rem;' +
      'background:var(--bg-secondary); color:var(--text-primary);' +
      'border:1px solid var(--glass-border); box-shadow:0 6px 22px rgba(0,0,0,.18);';
    bar.innerHTML =
      '<span style="flex:1 1 9rem; word-break:keep-all;">새 버전이 있어요</span>' +
      '<button id="fresh-go" style="all:unset; cursor:pointer; font-weight:800; padding:0.35rem 0.7rem;' +
      'flex:0 0 auto; white-space:nowrap; border-radius:9px; background:var(--accent-primary); color:#fff;">지금 받기</button>' +
      '<button id="fresh-later" style="all:unset; cursor:pointer; font-size:0.78rem; font-weight:700;' +
      'flex:0 0 auto; white-space:nowrap; color:var(--text-muted); padding:0.35rem 0.3rem;">나중에</button>';
    document.body.appendChild(bar);
    document.getElementById('fresh-go').addEventListener('click', async () => {
      await this.purge();
      location.replace(location.pathname + '?fresh=' + theirs);
    });
    document.getElementById('fresh-later').addEventListener('click', () => bar.remove());
  },

  init() {
    // 켤 때 한 번, 그리고 앱으로 돌아올 때마다.
    //  돌아올 때가 중요하다 — 사람들은 앱을 며칠씩 안 닫는다.
    this.check(true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check(false);
    });
  }
};
