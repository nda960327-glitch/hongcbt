// ============================================================================
//  공용 팝업 — 브라우저 기본 alert/confirm/prompt 를 대신한다.
//
//  왜 만드나: 안드로이드 웹뷰에서 confirm() 을 띄우면 제목 줄에
//  "localhost:8177 내용:" 같은 게 그대로 보인다. 그 한 줄 때문에 앱이
//  웹페이지처럼 읽힌다. 예약 확인·캐시 부족처럼 중요한 순간일수록 더 그렇다.
//
//  전부 Promise 를 돌려준다. 호출부는 async/await 로 쓴다.
//    if (!await UI.confirm({ title: '지울까요?' })) return;
//
//  받는 모양 (전부 선택):
//    문자열 하나                      — 첫 줄이 제목, 나머지가 본문
//    { title, body, html }            — html 은 우리가 만든 마크업만
//    { tone: 'info'|'success'|'warning'|'danger' }  — 위쪽 동그란 아이콘 색·모양
//    { danger: true }                 — tone:'danger' + 확인 버튼이 빨강
//    { icon, sticker }                — 아이콘 이름(Icons) / 느루 스티커
//    { okLabel, cancelLabel, price, priceLabel }
//    prompt: { value, placeholder, multiline, maxLength, inputType }
//
//  기본 다이얼로그와 다른 점:
//  · 여러 개가 겹쳐도 맨 위 것만 닫힌다 (스택)
//  · Esc·뒷배경 탭·뒤로가기로 닫으면 취소로 처리된다
//  · Tab 이 창 밖으로 새지 않고, 닫히면 원래 누르던 자리로 초점이 돌아간다
//  · 좁은 화면은 아래에서 올라오는 시트, 넓은 화면은 가운데 카드
//  · 글이 길면 창 안에서만 스크롤되고 버튼은 늘 보인다
//  · 시스템 이모지를 쓰지 않는다 — 아이콘은 직접 그린 것만
// ============================================================================
window.UI = {
  _seq: 0,
  _stack: [],

  // 모양은 여기 한 곳에만 둔다. style.css 가 늦게 오거나 못 와도 팝업은 제 모양으로 뜬다.
  _css: `
.ui-dlg { position: fixed; inset: 0; z-index: 10090; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(24, 18, 12, 0.5); animation: uiDlgFade 0.18s ease; -webkit-tap-highlight-color: transparent; }
.ui-dlg__panel { position: relative; width: 100%; max-width: 520px; max-height: 88vh; max-height: 88dvh;
  display: flex; flex-direction: column; box-sizing: border-box;
  background: var(--bg-secondary, #fff); color: var(--text-primary, #2b251f);
  border-radius: 22px 22px 0 0; box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.28);
  animation: uiDlgUp 0.24s cubic-bezier(0.2, 0.8, 0.2, 1); outline: none; }
.ui-dlg__grab { flex: none; width: 38px; height: 4px; border-radius: 2px; margin: 0.6rem auto 0.3rem;
  background: var(--text-muted, #999); opacity: 0.35; }
.ui-dlg__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; padding: 0.7rem 1.25rem 0.3rem; }
.ui-dlg__head { text-align: center; }
.ui-dlg__badge { width: 52px; height: 52px; margin: 0 auto 0.7rem; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; line-height: 0;
  color: var(--ui-tone, var(--accent-primary, #4f8a6b));
  background: rgba(127, 194, 155, 0.16);
  background: color-mix(in srgb, var(--ui-tone, var(--accent-primary, #4f8a6b)) 15%, transparent); }
.ui-dlg--info { --ui-tone: var(--accent-primary, #4f8a6b); }
.ui-dlg--success { --ui-tone: #4f9d73; }
.ui-dlg--warning { --ui-tone: #d6952b; }
.ui-dlg--danger { --ui-tone: #d0605c; }
.ui-dlg__sticker { display: inline-block; line-height: 0; margin-bottom: 0.45rem; }
.ui-dlg__title { margin: 0; font-size: 1.05rem; font-weight: 800; line-height: 1.45; letter-spacing: -0.01em;
  color: var(--text-primary, #2b251f); word-break: keep-all; overflow-wrap: anywhere; }
.ui-dlg__body { margin: 0.4rem 0 0; font-size: 0.86rem; line-height: 1.7; color: var(--text-secondary, #5d5247);
  word-break: keep-all; overflow-wrap: anywhere; }
.ui-dlg__body--long { text-align: left; }
.ui-dlg__title + .ui-dlg__html, .ui-dlg__body + .ui-dlg__html { margin-top: 0.75rem; }
.ui-dlg__html { text-align: left; }
.ui-dlg__price { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem;
  margin: 0.85rem 0 0; padding-top: 0.75rem; border-top: 1px dashed var(--glass-border, rgba(0,0,0,0.12)); }
.ui-dlg__price span { font-size: 0.8rem; color: var(--text-muted, #7f7264); }
.ui-dlg__price b { font-size: 1.04rem; color: var(--text-primary, #2b251f); }
.ui-dlg__field { display: block; width: 100%; box-sizing: border-box; margin-top: 0.85rem; padding: 0.75rem 0.85rem;
  border-radius: 13px; background: var(--bg-tertiary, #f2e9dc); border: 1.5px solid var(--glass-border, rgba(0,0,0,0.12));
  color: var(--text-primary, #2b251f); outline: none; font-family: inherit; line-height: 1.5;
  font-size: 16px; /* 16px 미만이면 아이폰이 입력할 때 화면을 확대한다 */ }
.ui-dlg__field:focus { border-color: var(--accent-primary, #4f8a6b); }
textarea.ui-dlg__field { resize: vertical; min-height: 6.2rem; }
.ui-dlg__foot { flex: none; display: flex; flex-direction: column; gap: 0.5rem;
  padding: 0.85rem 1.25rem calc(1.05rem + env(safe-area-inset-bottom)); }
.ui-dlg__btn { flex: 1 1 0; box-sizing: border-box; width: 100%; min-height: 46px; margin: 0; padding: 0.7rem 1rem;
  border-radius: 999px; font-family: inherit; font-size: 0.92rem; font-weight: 700; line-height: 1.3; cursor: pointer;
  -webkit-appearance: none; appearance: none; }
.ui-dlg__btn--ghost { background: var(--bg-tertiary, #f2e9dc); color: var(--text-primary, #2b251f);
  border: 1px solid var(--glass-border, rgba(0,0,0,0.12)); }
.ui-dlg__btn--danger { background: #c9524f !important; color: #fff !important; border: 0 !important; box-shadow: none !important; }
.ui-dlg__btn:focus-visible, .ui-dlg__field:focus-visible { outline: 2px solid var(--accent-primary, #4f8a6b); outline-offset: 2px; }
@media (min-width: 561px) {
  .ui-dlg { align-items: center; padding: 1.5rem; }
  .ui-dlg__panel { max-width: 420px; max-height: min(82vh, 640px); border-radius: 22px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35); animation-name: uiDlgPop; }
  .ui-dlg__grab { display: none; }
  .ui-dlg__scroll { padding: 1.5rem 1.5rem 0.3rem; }
  .ui-dlg__foot { flex-direction: row-reverse; padding: 1rem 1.5rem 1.35rem; }
}
@media (max-width: 360px) {
  .ui-dlg__scroll { padding-left: 16px; padding-right: 16px; }
  .ui-dlg__foot { padding-left: 16px; padding-right: 16px; }
}
@keyframes uiDlgFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes uiDlgUp { from { transform: translateY(28px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes uiDlgPop { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ui-dlg, .ui-dlg__panel { animation: none; } }
`,

  // 톤별 아이콘 — Icons 세트에 없는 것들이라 여기서 직접 그린다 (24x24 선 아이콘)
  _toneSvg: {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6v.2"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.7L16 9.6"/>',
    warning: '<path d="M12 4.2l8.6 14.9H3.4L12 4.2z"/><path d="M12 10v4.2"/><path d="M12 16.6v.2"/>',
    danger: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16v.2"/>'
  },

  _ensureCss() {
    if (this._cssDone) return;
    this._cssDone = true;
    try {
      const st = document.createElement('style');
      st.id = 'ui-dlg-css';
      st.textContent = this._css;
      document.head.appendChild(st);
    } catch (e) {}
    // 키 입력은 한 곳에서만 받는다. 시트마다 리스너를 달았더니 Esc 한 번에
    //  겹쳐 있던 창이 전부 닫혔다 — 맨 위 창만 닫혀야 한다.
    document.addEventListener('keydown', (e) => this._onKey(e), true);
  },

  _onKey(e) {
    const top = this._stack[this._stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); top.close(undefined); return; }
    if (e.key !== 'Tab') return;
    // 초점 가두기 — Tab 이 뒤에 깔린 화면의 버튼으로 넘어가지 않게
    const els = [...top.wrap.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!els.length) { e.preventDefault(); return; }
    const first = els[0], last = els[els.length - 1];
    const cur = document.activeElement;
    if (!top.wrap.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  },

  _esc(t) {
    return String(t == null ? '' : t)
      .replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
  },

  // 줄바꿈을 살린 본문 (기존 alert 문구들이 \n 을 쓰고 있다)
  _body(t) {
    return this._esc(t).replace(/\n/g, '<br>');
  },

  _icon(name, size) {
    if (!window.Icons || !name) return '';
    try { return window.Icons.svg(name, { size: size || 20 }) || ''; } catch (e) { return ''; }
  },

  // 문자열 하나로 부르는 경우를 받아준다 — 기존 alert/confirm 문구를 그대로 옮길 수 있게.
  //  첫 줄이 제목, 나머지가 본문이 된다. 원래 문구들이 대부분 그렇게 쓰여 있다.
  //    "잔액이 부족해요.\n상담료 40,000캐시\n\n충전해주세요."
  //     → 제목 "잔액이 부족해요." / 본문 "상담료 40,000캐시\n\n충전해주세요."
  //  제목처럼 읽히지 않는 긴 줄은 억지로 굵게 만들지 않는다:
  //   · 한 줄인데 길면 첫 문장만 제목으로 뗀다
  //   · 첫 문장도 길면 제목 없이 본문으로만 보여준다
  TITLE_MAX: 38,
  _norm(o) {
    if (o == null) return {};
    if (typeof o !== 'string') {
      if (typeof o !== 'object') return this._norm(String(o));
      return o;
    }
    const t = o.replace(/\r/g, '').trim();
    const i = t.indexOf('\n');
    if (i >= 0) {
      const first = t.slice(0, i).trim();
      const rest = t.slice(i + 1).replace(/^\n+/, '').trim();
      if (first.length <= this.TITLE_MAX) return rest ? { title: first, body: rest } : { title: first };
      return { body: t };
    }
    if (t.length <= this.TITLE_MAX) return { title: t };
    const m = t.match(/^(.{4,38}?[.?!。])\s+(\S[\s\S]*)$/);
    if (m) return { title: m[1], body: m[2] };
    return { body: t };
  },

  _tone(o) {
    if (o.danger) return 'danger';
    return /^(info|success|warning|danger)$/.test(o.tone || '') ? o.tone : '';
  },

  // 공통 시트 생성. onClose 는 닫힐 때 호출된다.
  //  parts: { body: 스크롤되는 부분 HTML, foot: 버튼 줄 HTML, role }
  _sheet(o, parts, onClose) {
    this._ensureCss();
    if (typeof parts === 'string') parts = { body: parts, foot: '' };
    const id = 'ui-sheet-' + (++this._seq);
    const tone = this._tone(o);
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'ui-dlg' + (tone ? ' ui-dlg--' + tone : '');
    // 안드로이드 뒤로가기 가드(app._initBackGuard)가 이 시트를 '닫히는 오버레이'로
    //  인식하게 한다 — 이게 없으면 계정삭제·로그아웃 확인창에서 뒤로가기 시 앱이 꺼졌다.
    wrap.dataset.ovGuard = '1';
    wrap.setAttribute('role', parts.role || 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    if (o.title) wrap.setAttribute('aria-labelledby', id + '-t');
    else wrap.setAttribute('aria-label', '알림');

    wrap.innerHTML = `
      <div class="ui-dlg__panel" tabindex="-1">
        <div class="ui-dlg__grab" aria-hidden="true"></div>
        <div class="ui-dlg__scroll">${parts.body.replace('data-ui-title', 'id="' + id + '-t"')}</div>
        ${parts.foot ? `<div class="ui-dlg__foot">${parts.foot}</div>` : ''}
      </div>`;

    // 닫힌 뒤 초점을 원래 누르던 버튼으로 돌려준다 (키보드·스크린리더 사용자가 길을 잃지 않게)
    const prev = document.activeElement;
    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      wrap.remove();
      this._stack = this._stack.filter(x => x.id !== id);
      if (window.Sfx) window.Sfx.play('close');
      try { if (prev && prev.isConnected && prev.focus && prev !== document.body) prev.focus({ preventScroll: true }); } catch (e) {}
      onClose(result);
    };

    // 뒷배경 탭 = 취소. 창 안에서 누르기 시작해 밖에서 뗀 것(글자 끌어 선택 등)은 닫지 않는다.
    let downOnBackdrop = false;
    wrap.addEventListener('pointerdown', e => { downOnBackdrop = e.target === wrap; });
    wrap.addEventListener('click', e => { if (e.target === wrap && downOnBackdrop) close(undefined); });

    document.body.appendChild(wrap);
    this._stack.push({ id, close, wrap });
    if (window.Sfx) window.Sfx.play('pop');
    return { wrap, close };
  },

  // 처음 초점 — 화면이 초점을 따라 튀지 않게 preventScroll
  _focus(wrap, sel, select) {
    setTimeout(() => {
      try {
        const el = wrap.querySelector(sel) || wrap.querySelector('.ui-dlg__panel');
        if (!el) return;
        el.focus({ preventScroll: true });
        if (select && el.select) el.select();
      } catch (e) {}
    }, 60);
  },

  _head(o) {
    const tone = this._tone(o);
    let top = '';
    if (o.sticker && window.Stickers) {
      top = `<span class="ui-dlg__sticker">${window.Stickers.svg(o.sticker, 72)}</span><br>`;
    } else {
      // 아이콘 이름을 줬으면 그것을, 톤만 줬으면 톤 기본 그림을 쓴다
      const ic = (o.icon && this._icon(o.icon, 26)) ||
        (tone ? `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${this._toneSvg[tone]}</svg>` : '');
      if (ic) top = `<div class="ui-dlg__badge">${ic}</div>`;
    }
    const body = o.body == null ? '' : String(o.body);
    // 긴 글은 가운데 정렬로 두면 줄 끝이 들쭉날쭉해 읽기 힘들다 — 왼쪽으로 붙인다
    const long = body.length > 110 || body.split('\n').length > 5;
    return `
      <div class="ui-dlg__head">
        ${top}
        ${o.title ? `<p class="ui-dlg__title" data-ui-title>${this._esc(o.title)}</p>` : ''}
        ${body ? `<p class="ui-dlg__body${long ? ' ui-dlg__body--long' : ''}"${o.title ? '' : ' style="margin-top: 0; font-size: 0.92rem; color: var(--text-primary);"'}>${this._body(body)}</p>` : ''}
        ${o.html ? `<div class="ui-dlg__html">${o.html}</div>` : ''}
      </div>`;
  },
  // o.html 은 우리가 만든 마크업만 넣는다(목록·표 같은 것).
  //  사용자가 입력한 문자열은 절대 여기로 보내지 말 것 — title/body 로 보내면
  //  이스케이프된다. 그래서 이 옵션은 코드에서만 쓴다.

  _okBtn(o, label) {
    return `<button type="button" class="btn-primary ui-dlg__btn${o.danger ? ' ui-dlg__btn--danger' : ''}" data-ui-ok>${this._esc(o.okLabel || label || '확인')}</button>`;
  },
  _cancelBtn(o) {
    return `<button type="button" class="ui-dlg__btn ui-dlg__btn--ghost" data-ui-cancel>${this._esc(o.cancelLabel || '취소')}</button>`;
  },

  // ── 알림 — 확인 버튼 하나 ────────────────────────────────────────────
  //  UI.alert('저장했어요')  또는  UI.alert({ title, body, icon, tone })
  alert(o) {
    o = this._norm(o);
    return new Promise(resolve => {
      const { wrap, close } = this._sheet(o, { body: this._head(o), foot: this._okBtn(o), role: 'alertdialog' }, () => resolve());
      wrap.querySelector('[data-ui-ok]').addEventListener('click', () => close());
      this._focus(wrap, '[data-ui-ok]');
    });
  },

  // ── 확인 — true / false ──────────────────────────────────────────────
  //  const ok = await UI.confirm({ title: '지울까요?', danger: true });
  confirm(o) {
    o = this._norm(o);
    return new Promise(resolve => {
      const body = this._head(o) + (o.price ? `
        <div class="ui-dlg__price">
          <span>${this._esc(o.priceLabel || '지금 결제')}</span>
          <b>${this._esc(o.price)}</b>
        </div>` : '');
      const { wrap, close } = this._sheet(o, { body, foot: this._okBtn(o) + this._cancelBtn(o) }, r => resolve(r === true));
      wrap.querySelector('[data-ui-ok]').addEventListener('click', () => close(true));
      wrap.querySelector('[data-ui-cancel]').addEventListener('click', () => close(false));
      // 되돌릴 수 없는 일은 취소 쪽에 초점을 둔다 — Enter 를 습관처럼 눌러도 지워지지 않게
      this._focus(wrap, o.danger ? '[data-ui-cancel]' : '[data-ui-ok]');
    });
  },

  // ── 입력 — 문자열 또는 null ──────────────────────────────────────────
  prompt(o) {
    o = this._norm(o);
    return new Promise(resolve => {
      const multiline = !!o.multiline;
      const field = multiline
        ? `<textarea class="ui-dlg__field" data-ui-input rows="4" maxlength="${parseInt(o.maxLength, 10) || 500}" placeholder="${this._esc(o.placeholder || '')}">${this._esc(o.value || '')}</textarea>`
        : `<input class="ui-dlg__field" data-ui-input type="${this._esc(o.inputType || 'text')}" maxlength="${parseInt(o.maxLength, 10) || 200}"
             value="${this._esc(o.value || '')}" placeholder="${this._esc(o.placeholder || '')}" autocomplete="off">`;
      const { wrap, close } = this._sheet(o, { body: this._head(o) + field, foot: this._okBtn(o) + this._cancelBtn(o) },
        r => resolve(r === undefined ? null : r));
      const input = wrap.querySelector('[data-ui-input]');
      const ok = () => close(String(input.value || ''));
      wrap.querySelector('[data-ui-ok]').addEventListener('click', ok);
      wrap.querySelector('[data-ui-cancel]').addEventListener('click', () => close(null));
      // 한글 조합 중의 Enter 는 글자 확정이다 — 그때 닫으면 마지막 글자가 날아간다
      if (!multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); } });
      this._focus(wrap, '[data-ui-input]', true);
    });
  },

  // 열려 있는 시트 전부 닫기 (탭 이동 등에서)
  closeAll() {
    [...this._stack].forEach(s => s.close(undefined));
  }
};
