// ============================================================================
//  첫 실행 동의 — 약관·개인정보·민감정보·국외 이전
//
//  마음 건강 정보는 개인정보보호법의 민감정보(제23조)라 '따로' 동의를 받아야 한다.
//  AI 답변은 해외 서버(DeepSeek 중국 · OpenAI 미국)에서 만들어지고 서버·저장소도 해외(Cloudflare)라
//  국외 이전 동의도 필요하다. 약관 링크만 걸어 두는 것으로는 부족하다.
//
//  · 약관이 바뀌면 VER 를 올린다 → 기존 사용자도 다음 실행 때 한 번 더 동의한다.
//  · 동의 기록은 기기와 서버 양쪽에 남긴다. '동의를 받았다'는 입증 책임은 회사에 있다.
//  · 이 화면은 뒤로가기로 닫히지 않는다 (js/app.js 의 EXCLUDE 목록).
//  · 동의하지 않으면 앱을 쓸 수 없다 — 필수 항목만 두고, 선택 항목은 두지 않는다.
// ============================================================================
window.Consent = {
  VER: '2026-10-v3',   // v3: AI 대화 생성처에 DeepSeek(중국) 추가 — 국외이전 항목이 바뀌어 다시 동의를 받는다
  KEY: 'cbt_consent',
  ITEMS: [
    { id: 'age', t: '만 14세 이상입니다', d: '만 14세 미만은 이용할 수 없어요.' },
    { id: 'terms', t: '서비스 이용약관', link: './terms.html',
      d: '느루는 의료 서비스가 아니에요. 응급 상황에는 119, 1577-0199, 109로 연락해주세요.' },
    { id: 'privacy', t: '개인정보 수집·이용', link: './privacy.html#collect',
      d: '기기 번호, 예약·결제 기록, 상담사와 나눈 채팅, 로그인 정보를 서비스 제공에 써요.' },
    { id: 'sensitive', t: '민감정보(마음 건강 정보) 처리', link: './privacy.html#sensitive',
      d: '기분 기록, 검사 점수, 상담 기록 같은 정보를 서비스 제공에만 써요. 느루와 나눈 대화 원문은 이 기기에만 남아요.' },
    { id: 'overseas', t: '개인정보 국외 이전', link: './privacy.html#overseas',
      d: 'AI 답변 생성은 DeepSeek(중국)와 OpenAI(미국), 서버와 저장소는 Cloudflare, 이메일은 Resend, 로그인·알림은 Google(미국)이에요. 대화 원문은 이 기기에만 남고, 답을 만들 때만 전송돼요.' }
  ],

  record() {
    try { return window.Storage._safeGet(this.KEY, null); } catch (e) { return null; }
  },
  done() {
    const c = this.record();
    return !!(c && c.ver === this.VER);
  },
  ensure() {
    this.renderRow();
    if (this.done()) { this.resend(); return; }
    this.open();
  },

  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  open() {
    if (document.getElementById('consent-overlay')) return;
    const esc = this._esc;
    const again = !!this.record();   // 예전 버전에 동의했던 사람 — 문구를 바꿔 준다
    const ov = document.createElement('div');
    ov.id = 'consent-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'consent-title');
    ov.innerHTML = `
      <div class="consent">
        <div class="consent__head">
          <span class="consent__mark" data-sticker="joy" data-sticker-size="48"></span>
          <h2 id="consent-title">${again ? '약관이 새로워졌어요' : '마인드 인사이드에 오신 걸 환영해요'}</h2>
          <p>${again ? '계속 쓰시려면 바뀐 내용에 한 번 더 동의해주세요.' : '시작하기 전에 아래 내용에 동의해주세요. 모두 필수예요.'}</p>
        </div>
        <label class="consent__all">
          <input type="checkbox" id="consent-all">
          <span>모두 동의합니다</span>
        </label>
        <div class="consent__list">
          ${this.ITEMS.map(it => `
          <div class="consent__item">
            <label class="consent__row">
              <input type="checkbox" id="consent-${it.id}" data-consent-item="${it.id}">
              <span class="consent__t"><em>필수</em> ${esc(it.t)}</span>
            </label>
            ${it.link ? `<a class="consent__link" href="${it.link}" target="_blank" rel="noopener">보기</a>` : ''}
            <p class="consent__d">${esc(it.d)}</p>
          </div>`).join('')}
        </div>
        <p class="consent__note">동의는 설정에서 언제든 철회할 수 있어요. 철회하면 서비스를 계속 이용할 수 없어요.</p>
        <button type="button" class="btn-primary consent__go" id="consent-go" disabled>동의하고 시작하기</button>
      </div>`;
    document.body.appendChild(ov);
    if (window.App && window.App.refreshAllStickers) { try { window.App.refreshAllStickers(ov); } catch (e) {} }

    const boxes = [...ov.querySelectorAll('[data-consent-item]')];
    const all = ov.querySelector('#consent-all');
    const go = ov.querySelector('#consent-go');
    const sync = () => {
      const n = boxes.filter(b => b.checked).length;
      all.checked = n === boxes.length;
      all.indeterminate = n > 0 && n < boxes.length;
      go.disabled = n !== boxes.length;
    };
    boxes.forEach(b => b.addEventListener('change', sync));
    all.addEventListener('change', () => { boxes.forEach(b => { b.checked = all.checked; }); sync(); });
    go.addEventListener('click', () => this.submit(boxes.filter(b => b.checked).map(b => b.dataset.consentItem)));
    setTimeout(() => { try { all.focus(); } catch (e) {} }, 60);
  },

  submit(items) {
    if (items.length !== this.ITEMS.length) return;
    const rec = { ver: this.VER, items, ts: Date.now() };
    try { window.Storage._safeSet(this.KEY, rec); } catch (e) {}
    // 서버에도 남긴다 — 실패해도 사용은 막지 않고, 다음 실행 때 다시 보낸다
    this._send(rec);
    const ov = document.getElementById('consent-overlay');
    if (ov) ov.remove();
    this.renderRow();
    if (window.Sfx) { try { window.Sfx.play('pop'); } catch (e) {} }
  },

  async _send(rec) {
    try {
      const cid = (window.App && window.App.clientId) ? window.App.clientId() : '';
      if (!cid || !window.Api) return;
      const r = await window.Api.post('/api/consent', { clientId: cid, ver: rec.ver, items: rec.items, ts: rec.ts });
      if (r && r.ok) {
        rec.sent = Date.now();
        window.Storage._safeSet(this.KEY, rec);
      }
    } catch (e) {}
  },

  // 마이 → 앱 → 동의 내역
  renderRow() {
    const el = document.getElementById('consent-row');
    if (!el) return;
    const c = this.record();
    const when = c && c.ts ? new Date(c.ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    el.innerHTML = `
      <span class="my-row__ico" data-ic="shield" data-ic-size="19"></span>
      <span class="my-row__txt"><b>약관·개인정보 동의</b><span>${c && c.ver === this.VER ? when + ' 동의 · 필수 5개' : '동의 필요'}</span></span>
      <button class="my-row__btn" data-consent-withdraw>철회</button>`;
    if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(el);
  },

  // 앱이 켜질 때 — 서버 기록이 아직 없으면 조용히 다시 보낸다
  resend() {
    const c = this.record();
    if (c && c.ver === this.VER && !c.sent) this._send(c);
  },

  // 동의 철회 — 기기 기록을 지우고 동의 화면을 다시 띄운다
  async withdraw() {
    const ok = window.UI && window.UI.confirm
      ? await window.UI.confirm('동의를 철회할까요? 철회하면 다시 동의하기 전까지 앱을 쓸 수 없어요. 서버의 계정·기록 삭제는 설정의 데이터 삭제에서 요청할 수 있어요.')
      : window.confirm('동의를 철회할까요?');
    if (!ok) return;
    try {
      const cid = (window.App && window.App.clientId) ? window.App.clientId() : '';
      if (cid && window.Api) window.Api.post('/api/consent', { clientId: cid, ver: this.VER, items: ['withdraw'], ts: Date.now() });
    } catch (e) {}
    try { window.Storage._safeSet(this.KEY, null); } catch (e) {}
    this.open();
  }
};

document.addEventListener('click', function (e) {
  if (e.target.closest('[data-consent-withdraw]') && window.Consent) window.Consent.withdraw();
});
