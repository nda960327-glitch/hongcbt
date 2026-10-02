// 다른 앱에서 '공유'로 넘어온 글·사진 받기.
//  카카오톡 "대화 내용 내보내기"의 공유 목록에서 이 앱을 고르면, 받은 대화가 대화 분석 화면에 바로 들어간다.
//  · 스토어 앱(안드로이드): android/…/ShareInPlugin.java 가 받아 두고, 여기서 take() 로 가져온다.
//  · 홈 화면에 설치한 웹앱(PWA): manifest.json 의 share_target → sw.js 가 받아 캐시에 두고, 여기서 꺼낸다.
//  글(.txt) → 대화 분석(js/talkcheck.js) · 사진 → 글자 읽기(js/imgtext.js)
window.ShareIn = {
  _busy: false,

  async check() {
    if (this._busy) return;
    this._busy = true;
    try {
      let items = [];
      const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShareIn;
      if (P && P.take) { try { const r = await P.take(); items = (r && r.items) || []; } catch (e) {} }
      if (!items.length) items = await this._fromCache();
      if (items.length) this._route(items);
    } finally { this._busy = false; }
  },

  // 웹앱(PWA) 경로 — 서비스워커가 'share-inbox' 캐시에 넣어 둔 것
  async _fromCache() {
    const out = [];
    if (!('caches' in window)) return out;
    try {
      const c = await caches.open('share-inbox');
      const keys = await c.keys();
      for (const k of keys) {
        const res = await c.match(k); await c.delete(k);
        if (!res) continue;
        const mime = res.headers.get('content-type') || '';
        const name = decodeURIComponent(res.headers.get('x-name') || '');
        if (/^image\//.test(mime)) out.push({ kind: 'image', name, mime, blob: await res.blob() });
        else out.push({ kind: 'text', name, mime, text: await res.text() });
      }
    } catch (e) {}
    return out;
  },

  _route(items) {
    // 동의 화면이 떠 있으면 닫힌 뒤에 — 받은 것은 그때까지 들고 있는다
    if (window.Consent && window.Consent.record && !window.Consent.record()) { this._held = items; return; }
    const texts = items.filter(x => x.kind === 'text' && x.text && x.text.trim());
    const imgs = items.filter(x => x.kind === 'image');
    if (texts.length && window.TalkCheck) {
      window.TalkCheck.open();
      const ta = document.getElementById('tc-text');
      if (ta) { ta.value = texts.map(x => x.text).join('\n').slice(0, 2000000); window.TalkCheck._changed(); }
      if (window.App && window.App.showRecordToast) window.App.showRecordToast('받은 대화를 넣었어요. 누가 나인지 고르고 [분석하기]를 눌러 주세요');
      return;
    }
    if (imgs.length && window.ImgText) {
      const files = imgs.map((x, i) => {
        if (x.blob) return new File([x.blob], x.name || ('share' + i + '.jpg'), { type: x.mime || 'image/jpeg' });
        const bin = atob(x.data || ''); const u8 = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
        return new File([u8], x.name || ('share' + i + '.jpg'), { type: x.mime || 'image/jpeg' });
      });
      window.ImgText.read(files);
    }
  },

  init() {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShareIn;
    if (P && P.addListener) { try { P.addListener('share', () => this.check()); } catch (e) {} }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
    // 동의를 마친 뒤 들고 있던 것을 이어서 처리한다
    setInterval(() => { if (this._held && window.Consent && window.Consent.record && window.Consent.record()) { const h = this._held; this._held = null; this._route(h); } }, 1500);
    setTimeout(() => this.check(), 1200);
  }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.ShareIn.init());
else window.ShareIn.init();
