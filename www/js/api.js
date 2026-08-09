// ============================================================================
//  /api/* 요청을 어디로 보낼지 한 곳에서 정한다.
//
//  · 로컬 개발: 같은 출처에 server.js 가 떠 있으면 그쪽이 빠르다.
//  · 배포본(정적 호스팅): 같은 출처에는 /api 가 없다. Cloudflare Worker 로 보낸다.
//
//  전에는 파일마다 fetch('/api/...') 를 직접 불러서, 정적 호스팅에 올리면
//  상담사 마켓 기능이 통째로 404 였다. 여기 하나만 보게 만든다.
// ============================================================================
window.Api = {
  // undefined=미확인 · true=같은 출처 사용 · false=Worker 로
  //  판정을 기억해 둔다. 안 그러면 앱을 켤 때마다 첫 요청이 404 를 한 번
  //  받고서야 Worker 로 넘어가, 그 요청만 300ms 넘게 느려진다.
  //  하필 그 첫 요청이 로그인 검사라 사용자는 '느린 앱'으로 체감한다.
  _sameOrigin: (() => {
    try {
      const v = localStorage.getItem('cbt_api_same_origin');
      const at = +(localStorage.getItem('cbt_api_same_origin_at') || 0);
      // 하루 지나면 다시 확인 (서버를 나중에 붙일 수도 있으므로)
      if (!v || Date.now() - at > 86400000) return undefined;
      return v === '1';
    } catch (e) { return undefined; }
  })(),

  _remember(v) {
    this._sameOrigin = v;
    try {
      localStorage.setItem('cbt_api_same_origin', v ? '1' : '0');
      localStorage.setItem('cbt_api_same_origin_at', String(Date.now()));
    } catch (e) {}
  },

  // 앱이 뜰 때 조용히 한 번 재 둔다 — 사용자가 뭘 누르기 전에 끝나 있도록
  warmup() {
    if (this._sameOrigin !== undefined) return;
    try { this.f('/api/presence').catch(() => {}); } catch (e) {}
  },

  base() {
    return (window.LLM && window.LLM.BACKEND_URL)
      ? window.LLM.BACKEND_URL.replace(/\/+$/, '') : '';
  },

  // path 는 항상 '/api/...' 형태로 받는다.
  async f(path, opts) {
    const p = String(path || '');
    const isHttp = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);

    // 1) 같은 출처 (아직 없다고 판명되지 않았을 때만)
    if (this._sameOrigin !== false && isHttp) {
      try {
        const r = await fetch(p, opts);
        // 정적 서버는 없는 경로에 404 나 index.html(HTML) 을 돌려준다
        const ct = (r.headers.get('content-type') || '');
        if (r.status !== 404 && !ct.includes('text/html')) {
          this._remember(true);
          return r;
        }
        this._remember(false);
      } catch (e) {
        this._remember(false);
      }
    }

    // 2) Worker
    const base = this.base();
    if (!base) throw new Error('no-backend');
    return fetch(base + p, opts);
  },

  // 편의 — JSON 을 바로 돌려준다. 실패하면 null (호출부가 조용히 넘어가도록)
  async json(path, opts) {
    try {
      const r = await this.f(path, opts);
      if (!r || !r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  },

  post(path, data) {
    return this.f(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
  }
};
