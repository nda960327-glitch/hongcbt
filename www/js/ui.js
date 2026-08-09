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
//  기본 다이얼로그와 다른 점:
//  · 여러 개가 겹쳐도 각자 자기 것만 닫는다 (스택)
//  · Esc·뒷배경 탭으로 닫으면 취소로 처리된다
//  · 위험한 동작은 danger:true 로 버튼 색을 바꾼다
//  · 시스템 이모지를 쓰지 않는다 — 아이콘은 직접 그린 것만
// ============================================================================
window.UI = {
  _seq: 0,
  _stack: [],

  _esc(t) {
    return String(t == null ? '' : t)
      .replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
  },

  // 줄바꿈을 살린 본문 (기존 alert 문구들이 \n 을 쓰고 있다)
  _body(t) {
    return this._esc(t).replace(/\n/g, '<br>');
  },

  _icon(name, size, color) {
    if (!window.Icons || !name) return '';
    try { return window.Icons.svg(name, { size: size || 20 }); } catch (e) { return ''; }
  },

  // 문자열 하나로 부르는 경우를 받아준다 — 기존 alert/confirm 문구를 그대로 옮길 수 있게.
  //  첫 줄이 제목, 나머지가 본문이 된다. 원래 문구들이 대부분 그렇게 쓰여 있다.
  //    "잔액이 부족해요.\n상담료 40,000캐시\n\n충전해주세요."
  //     → 제목 "잔액이 부족해요." / 본문 "상담료 40,000캐시\n\n충전해주세요."
  _norm(o) {
    if (typeof o !== 'string') return o || {};
    const t = o.replace(/\r/g, '');
    const i = t.indexOf('\n');
    if (i < 0) return { title: t };
    return { title: t.slice(0, i).trim(), body: t.slice(i + 1).replace(/^\n+/, '').trim() };
  },

  // 공통 시트 생성. resolve 는 닫힐 때 호출된다.
  _sheet(o, build, onClose) {
    const id = 'ui-sheet-' + (++this._seq);
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText =
      'position: fixed; inset: 0; z-index: 10090; background: rgba(0,0,0,0.42);' +
      'display: flex; align-items: flex-end; justify-content: center;';

    wrap.innerHTML = `
      <div style="width: 100%; max-width: 520px; max-height: 86vh; overflow-y: auto;
                  background: var(--bg-secondary); border-radius: 22px 22px 0 0;
                  padding: 0.9rem 1.25rem calc(1.3rem + env(safe-area-inset-bottom));
                  animation: slideUp 0.22s ease;">
        <div style="width: 38px; height: 4px; border-radius: 2px; background: var(--glass-border); margin: 0 auto 0.9rem;"></div>
        ${build}
      </div>`;

    const close = (result) => {
      if (!wrap.isConnected) return;
      wrap.remove();
      this._stack = this._stack.filter(x => x.id !== id);
      document.removeEventListener('keydown', onKey, true);
      if (window.Sfx) window.Sfx.play('close');
      onClose(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
    };

    wrap.addEventListener('click', e => { if (e.target === wrap) close(undefined); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    this._stack.push({ id, close });
    if (window.Sfx) window.Sfx.play('pop');
    return { wrap, close };
  },

  _head(o) {
    const sticker = o.sticker && window.Stickers
      ? `<span style="line-height: 0; display: inline-block;">${window.Stickers.svg(o.sticker, 72)}</span>`
      : (o.icon ? `<span style="line-height: 0; display: inline-block; color: ${o.danger ? '#c14a4a' : 'var(--accent-primary)'};">${this._icon(o.icon, 30)}</span>` : '');
    return `
      <div style="text-align: center; margin-bottom: ${o.body ? '0.85rem' : '1rem'};">
        ${sticker}
        <p style="margin: ${sticker ? '0.5rem' : '0'} 0 ${o.body ? '0.3rem' : '0'}; font-size: 1.03rem;
                  font-weight: 800; color: var(--text-primary); line-height: 1.45;">${this._esc(o.title)}</p>
        ${o.body ? `<p style="margin: 0; font-size: 0.84rem; line-height: 1.68; color: var(--text-secondary);">${this._body(o.body)}</p>` : ''}
      </div>`;
  },

  // ── 알림 — 확인 버튼 하나 ────────────────────────────────────────────
  //  UI.alert('저장했어요')  또는  UI.alert({ title, body, icon })
  alert(o) {
    o = this._norm(o);
    return new Promise(resolve => {
      const html = this._head(o) + `
        <button class="btn-primary" data-ui-ok style="width: 100%; padding: 0.76rem; font-size: 0.9rem;">
          ${this._esc(o.okLabel || '확인')}</button>`;
      const { wrap, close } = this._sheet(o, html, () => resolve());
      wrap.querySelector('[data-ui-ok]').addEventListener('click', () => close());
      setTimeout(() => { try { wrap.querySelector('[data-ui-ok]').focus(); } catch (e) {} }, 60);
    });
  },

  // ── 확인 — true / false ──────────────────────────────────────────────
  //  const ok = await UI.confirm({ title: '지울까요?', danger: true });
  confirm(o) {
    o = this._norm(o);
    return new Promise(resolve => {
      const okBg = o.danger
        ? 'background: #c14a4a; color: #fff; border: 0;'
        : '';
      const html = this._head(o) + `
        ${o.price ? `<div style="display: flex; align-items: baseline; justify-content: space-between;
                     margin: 0 0 0.7rem; padding-top: 0.7rem; border-top: 1px dashed var(--glass-border);">
          <span style="font-size: 0.8rem; color: var(--text-muted);">${this._esc(o.priceLabel || '지금 결제')}</span>
          <b style="font-size: 1.02rem; color: var(--text-primary);">${this._esc(o.price)}</b>
        </div>` : ''}
        <button class="btn-primary" data-ui-ok style="width: 100%; padding: 0.76rem; font-size: 0.9rem; ${okBg}">
          ${this._esc(o.okLabel || '확인')}</button>
        <button data-ui-cancel style="all: unset; display: block; width: 100%; text-align: center;
                margin-top: 0.5rem; padding: 0.55rem 0; cursor: pointer; font-size: 0.82rem;
                font-weight: 700; color: var(--text-muted);">${this._esc(o.cancelLabel || '취소')}</button>`;
      const { wrap, close } = this._sheet(o, html, r => resolve(r === true));
      wrap.querySelector('[data-ui-ok]').addEventListener('click', () => close(true));
      wrap.querySelector('[data-ui-cancel]').addEventListener('click', () => close(false));
    });
  },

  // ── 입력 — 문자열 또는 null ──────────────────────────────────────────
  prompt(o) {
    o = this._norm(o);
    return new Promise(resolve => {
      const multiline = !!o.multiline;
      const field = multiline
        ? `<textarea data-ui-input rows="4" maxlength="${o.maxLength || 500}" placeholder="${this._esc(o.placeholder || '')}"
             style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border-radius: 12px;
                    background: var(--bg-tertiary); border: 1px solid var(--glass-border);
                    color: var(--text-primary); outline: none; font-size: 0.9rem; font-family: inherit;
                    resize: vertical;">${this._esc(o.value || '')}</textarea>`
        : `<input data-ui-input type="${o.inputType || 'text'}" maxlength="${o.maxLength || 200}"
             value="${this._esc(o.value || '')}" placeholder="${this._esc(o.placeholder || '')}"
             style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border-radius: 12px;
                    background: var(--bg-tertiary); border: 1px solid var(--glass-border);
                    color: var(--text-primary); outline: none; font-size: 0.9rem; font-family: inherit;">`;
      const html = this._head(o) + field + `
        <button class="btn-primary" data-ui-ok style="width: 100%; margin-top: 0.7rem; padding: 0.76rem; font-size: 0.9rem;">
          ${this._esc(o.okLabel || '확인')}</button>
        <button data-ui-cancel style="all: unset; display: block; width: 100%; text-align: center;
                margin-top: 0.5rem; padding: 0.55rem 0; cursor: pointer; font-size: 0.82rem;
                font-weight: 700; color: var(--text-muted);">${this._esc(o.cancelLabel || '취소')}</button>`;
      const { wrap, close } = this._sheet(o, html, r => resolve(r === undefined ? null : r));
      const input = wrap.querySelector('[data-ui-input]');
      const ok = () => close(String(input.value || ''));
      wrap.querySelector('[data-ui-ok]').addEventListener('click', ok);
      wrap.querySelector('[data-ui-cancel]').addEventListener('click', () => close(null));
      if (!multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      setTimeout(() => { try { input.focus(); input.select && input.select(); } catch (e) {} }, 80);
    });
  },

  // 열려 있는 시트 전부 닫기 (탭 이동 등에서)
  closeAll() {
    [...this._stack].forEach(s => s.close(undefined));
  }
};
