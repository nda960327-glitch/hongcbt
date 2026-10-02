// 사진·캡처 보내기 — 캡처 속 글자를 이 기기에서 읽어(글자 인식) 채팅으로 보낸다.
//  · 사진은 서버로도 AI 로도 가지 않는다. 글자 인식은 브라우저 안에서 돈다(tesseract.js — 처음 쓸 때만 내려받는다, 약 2MB).
//    그래서 사진 한 장에 드는 AI 비용이 없다(사장님: 사진을 AI 로 다 분석할 여유는 없다).
//  · 읽은 글은 보내기 전에 보여 주고 고칠 수 있다. 카톡 캡처면 [대화 분석]으로 바로 넘길 수 있다(js/talkcheck.js).
//  · 글자가 없는 사진(풍경·셀카 등)은 AI 가 볼 수 없다 — 본 척하지 않는다. 어떤 사진인지 한 줄 적게 하고, 상담사는 그 말에 반응한다(js/llm.js 의 [사진] 규칙).
window.ImgText = {
  LIB: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  MAX_FILES: 5, MAX_SIDE: 1800, MAX_TEXT: 3000,
  _worker: null, _loading: null,

  _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  // 채팅 입력창의 사진 버튼 · 붙여넣기에서 부른다
  pick() {
    let inp = document.getElementById('imgtext-file');
    if (!inp) {
      inp = document.createElement('input');
      // 사진 형식만 적는다 — 폰에서 '카메라·파일' 고르는 창을 거치지 않고 갤러리(사진 고르기)가 바로 열리게
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif'; inp.multiple = true; inp.id = 'imgtext-file'; inp.hidden = true;
      inp.addEventListener('change', () => { const fs = [...(inp.files || [])]; inp.value = ''; if (fs.length) this.read(fs); });
      document.body.appendChild(inp);
    }
    inp.click();
  },

  _lib() {
    if (window.Tesseract) return Promise.resolve();
    if (this._loading) return this._loading;
    this._loading = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = this.LIB; s.onload = () => ok(); s.onerror = () => { this._loading = null; no(new Error('lib')); };
      document.head.appendChild(s);
    });
    return this._loading;
  },
  async _getWorker(onProg) {
    await this._lib();
    this._onProg = onProg;
    if (!this._worker) {
      this._worker = await window.Tesseract.createWorker('kor+eng', 1, { logger: m => { if (this._onProg && m && m.status) this._onProg(m); } });
      // 한 덩어리의 글로 읽는다(6) — 말풍선이 좌우로 흩어진 캡처에서 줄을 가장 덜 놓친다
      try { await this._worker.setParameters({ tessedit_pageseg_mode: '6' }); } catch (e) {}
    }
    return this._worker;
  },

  // 큰 사진은 줄여서 읽는다(빠르고, 폰 메모리를 덜 쓴다). 캡처는 글자가 작아 너무 줄이면 못 읽는다.
  _shrink(file) {
    return new Promise((ok, no) => {
      const im = new Image();
      im.onload = () => {
        const sc = Math.min(1, this.MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
        // 작은 캡처는 키운다(글자가 작으면 못 읽는다) — 긴 변이 1400 이 되도록, 많아야 2.5배
        const up = Math.min(2.5, Math.max(1, 1400 / Math.max(im.naturalWidth, im.naturalHeight)));
        const k = sc < 1 ? sc : up;
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
        const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(im.src); ok(cv);
      };
      im.onerror = () => no(new Error('img'));
      im.src = URL.createObjectURL(file);
    });
  },

  // 흑백으로 — 메신저 캡처는 말풍선 색(노랑·흰색·파랑 바탕) 때문에 그대로는 잘 못 읽는다. 글자만 검게, 나머지는 희게 만든다.
  //  어두운 화면(다크 모드)은 뒤집어서 같은 식으로 읽는다. (실측: 원본 1줄 → 흑백 6줄 중 6줄)
  _bw(src) {
    const o = document.createElement('canvas'); o.width = src.width; o.height = src.height;
    const x = o.getContext('2d'); x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height), p = d.data;
    let sum = 0; const n = p.length / 4;
    for (let i = 0; i < p.length; i += 4) { const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i] = g; sum += g; }
    const dark = sum / n < 110;
    for (let i = 0; i < p.length; i += 4) { let g = p[i]; if (dark) g = 255 - g; g = g < 120 ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = g; }
    x.putImageData(d, 0, 0);
    return o;
  },

  // 글자 인식 결과 다듬기 — 한글 사이에 낀 띄어쓰기('안 녕 하 세 요'), 시계·배터리 같은 상태줄, 빈 줄
  _clean(t) {
    return String(t || '').split('\n').map(l => l.replace(/([가-힣])\s(?=[가-힣]\s[가-힣])/g, '$1').replace(/\s{2,}/g, ' ').trim())
      .filter(l => l && !/^[\d:%\s.·|LTE5G]+$/i.test(l) && l.length > 1)
      .join('\n').trim();
  },

  _sheet(html) {
    let ov = document.getElementById('imgtext-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'imgtext-ov'; ov.dataset.ovGuard = '1';
      ov.style.cssText = 'position: fixed; inset: 0; z-index: 1260; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end; justify-content: center;';
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div style="width: 100%; max-width: 640px; max-height: 88vh; overflow-y: auto; box-sizing: border-box; background: var(--bg-primary); border-radius: 20px 20px 0 0; padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));">${html}</div>`;
    return ov;
  },
  close() { const o = document.getElementById('imgtext-ov'); if (o) o.remove(); },

  async read(files) {
    files = files.filter(f => /^image\//.test(f.type)).slice(0, this.MAX_FILES);
    if (!files.length) return;
    const head = t => `<div style="display: flex; align-items: center; margin-bottom: 0.7rem;"><b style="flex: 1 1 auto; font-size: 1rem; color: var(--text-primary);">${t}</b><button type="button" onclick="window.ImgText.close()" style="all: unset; cursor: pointer; padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); background: var(--bg-tertiary);">닫기</button></div>`;
    this._sheet(head('사진에서 글자를 읽는 중') + `<p id="imgtext-prog" style="margin: 1.2rem 0 1.6rem; text-align: center; font-size: 0.88rem; color: var(--text-secondary);">준비하고 있어요… (처음 한 번은 조금 걸려요)</p>
      <p style="margin: 0; font-size: 0.74rem; line-height: 1.5; color: var(--text-muted);">사진은 이 기기 밖으로 나가지 않아요. 글자만 읽어서 보여 드려요.</p>`);
    const prog = t => { const p = document.getElementById('imgtext-prog'); if (p) p.textContent = t; };
    const parts = []; let thumb = '';
    try {
      const w = await this._getWorker(m => { if (m.status === 'recognizing text') prog(`글자를 읽고 있어요… ${Math.round((m.progress || 0) * 100)}%`); else if (/loading|initializ/.test(m.status)) prog('글자 읽는 도구를 준비하고 있어요…'); });
      for (let i = 0; i < files.length; i++) {
        if (!document.getElementById('imgtext-ov')) return;          // 그 사이 닫았다
        prog(`${files.length > 1 ? (i + 1) + '/' + files.length + '장 · ' : ''}글자를 읽고 있어요…`);
        const cv = await this._shrink(files[i]);
        if (!thumb) { try { const t = document.createElement('canvas'); const sc = 120 / Math.max(cv.width, cv.height); t.width = Math.round(cv.width * sc); t.height = Math.round(cv.height * sc); t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height); thumb = t.toDataURL('image/jpeg', 0.6); } catch (e) {} }
        const r = await w.recognize(this._bw(cv));
        const txt = this._clean(r && r.data && r.data.text);
        if (txt) parts.push(txt);
      }
    } catch (e) {
      if (!document.getElementById('imgtext-ov')) return;
      this._renderNone(head('사진 보내기'), thumb, files.length, '지금은 글자를 읽지 못했어요. 인터넷 연결을 확인하거나, 어떤 사진인지 직접 적어 주세요.');
      return;
    }
    if (!document.getElementById('imgtext-ov')) return;
    const text = parts.join('\n\n').slice(0, this.MAX_TEXT);
    const letters = (text.match(/[가-힣A-Za-z0-9]/g) || []).length;
    if (letters < 8) { this._renderNone(head('사진 보내기'), thumb, files.length, ''); return; }
    const field = 'width: 100%; box-sizing: border-box; font: inherit; font-size: 0.9rem; line-height: 1.55; color: var(--text-primary); background: var(--bg-secondary); border: 1.5px solid var(--glass-border); border-radius: 12px; padding: 0.65rem 0.8rem;';
    this._sheet(head('사진에서 읽은 글') + `
      <p style="margin: 0 0 0.5rem; font-size: 0.8rem; line-height: 1.5; color: var(--text-secondary);">틀리게 읽은 곳이 있으면 고쳐 주세요. 빼고 싶은 부분은 지워도 돼요.</p>
      <textarea id="imgtext-text" rows="9" maxlength="${this.MAX_TEXT}" style="${field} resize: vertical;">${this._esc(text)}</textarea>
      <input id="imgtext-note" type="text" maxlength="120" placeholder="하고 싶은 말 (안 적어도 돼요) — 예: 이거 내가 잘못한 거야?" style="${field} margin-top: 0.5rem;">
      <div style="display: flex; gap: 0.45rem; margin-top: 0.7rem; flex-wrap: wrap;">
        <button type="button" class="btn-secondary" style="flex: 1 1 9rem; width: auto;" onclick="window.ImgText._toTalk()">대화 분석에 넣기</button>
        <button type="button" class="btn-primary" style="flex: 1 1 9rem; width: auto;" onclick="window.ImgText._sendText()">채팅으로 보내기</button>
      </div>
      <p style="margin: 0.6rem 0 0; font-size: 0.72rem; line-height: 1.5; color: var(--text-muted);">사진은 보내지 않아요. 여기 보이는 글만 상담사에게 전해져요.</p>`);
  },

  // 글자가 없는 사진 — 상담사는 사진을 볼 수 없다. 어떤 사진인지 한 줄 적게 한다.
  _renderNone(headHtml, thumb, n, note) {
    const field = 'width: 100%; box-sizing: border-box; font: inherit; font-size: 0.9rem; color: var(--text-primary); background: var(--bg-secondary); border: 1.5px solid var(--glass-border); border-radius: 12px; padding: 0.65rem 0.8rem;';
    this._sheet(headHtml + `
      <div style="display: flex; gap: 0.7rem; align-items: center; margin-bottom: 0.7rem;">
        ${thumb ? `<img src="${thumb}" alt="" style="flex: 0 0 auto; width: 64px; height: 64px; object-fit: cover; border-radius: 12px;">` : ''}
        <p style="margin: 0; font-size: 0.86rem; line-height: 1.55; color: var(--text-secondary);">${note || '이 사진에서는 글자를 찾지 못했어요. 상담사는 사진을 직접 볼 수 없어서, 어떤 사진인지 한 줄 적어 주시면 그 이야기를 나눌 수 있어요.'}</p>
      </div>
      <input id="imgtext-desc" type="text" maxlength="150" placeholder="예: 오늘 산책하다 찍은 노을이야" style="${field}">
      <button type="button" class="btn-primary" style="width: 100%; margin-top: 0.7rem;" onclick="window.ImgText._sendPhoto(${n || 1})">보내기</button>`);
    setTimeout(() => { const i = document.getElementById('imgtext-desc'); if (i) i.focus(); }, 80);
  },

  _send(text) {
    this.close();
    const inp = document.getElementById('chat-input');
    if (!inp || !window.App) return;
    window.App.switchTab('chat', true);
    inp.value = text;
    window.App.sendMessage();
  },
  _sendText() {
    const t = ((document.getElementById('imgtext-text') || {}).value || '').trim();
    const note = ((document.getElementById('imgtext-note') || {}).value || '').trim();
    if (!t) return;
    this._send(`[캡처에서 읽은 글]\n${t}${note ? '\n\n' + note : ''}`);
  },
  _sendPhoto(n) {
    const d = ((document.getElementById('imgtext-desc') || {}).value || '').trim();
    this._send(`[사진을 보냈어요${n > 1 ? ' ' + n + '장' : ''}]${d ? ' ' + d : ''}`);
  },
  // 카톡 캡처면 대화 분석으로
  _toTalk() {
    const t = ((document.getElementById('imgtext-text') || {}).value || '').trim();
    this.close();
    if (!window.TalkCheck || !t) return;
    window.TalkCheck.open();
    const ta = document.getElementById('tc-text');
    if (ta) { ta.value = t; window.TalkCheck._changed(); }
  }
};

// 채팅 입력창에 사진을 붙여넣으면(캡처 후 Ctrl+V · 길게 눌러 붙여넣기) 바로 읽는다
document.addEventListener('paste', e => {
  const t = e.target;
  if (!t || (t.id !== 'chat-input' && t.id !== 'tc-text')) return;
  const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type));
  if (!files.length) return;
  e.preventDefault();
  window.ImgText.read(files);
});
