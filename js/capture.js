// ============================================================================
//  대화 캡처 — 우렁이와 나눈 이야기에서 '여기부터 여기까지'를 골라 한 장의 이미지로 만든다.
//
//  화면 캡처는 길게 못 찍고 위아래 버튼까지 같이 찍힌다. 우울한 사람은 그걸 다듬어 올릴 기운이 없다.
//  그래서: 더보기 › [대화 캡처·공유] → 첫 말풍선 → 끝 말풍선 → 끝. 세 번 누르면 예쁜 이미지가 나온다.
//   · [공유하기]  휴대폰의 공유 창(카카오톡·메시지·인스타 등)으로 이미지를 보낸다. 공유 창이 없는 PC 는 내려받는다.
//   · [저장]      이미지 파일로 내려받는다.
//   · [커뮤니티에 올리기]  글쓰기 화면을 열고 이미지를 미리 넣어 준다(우렁이 자랑방).
//  이미지는 이 기기에서만 만들어진다 — 서버로 대화가 올라가지 않는다(커뮤니티에 올리기로 직접 올릴 때만).
//  말풍선의 글자만 그린다. 내 이름·별명은 넣지 않는다.
// ============================================================================
window.ChatCapture = {
  MAX: 40,            // 한 번에 담는 말풍선 수
  _on: false, _a: -1, _b: -1,

  _list() { return Array.prototype.filter.call(document.querySelectorAll('#chat-messages .message'), el => !el.classList.contains('typing-indicator-wrapper')); },
  _toast(m) { if (window.App && window.App.showRecordToast) window.App.showRecordToast(m); },

  start() {
    if (this._on) return;
    if (!this._list().length) { this._toast('아직 캡처할 대화가 없어요'); return; }
    this._on = true; this._a = this._b = -1;
    const bar = document.createElement('div');
    bar.id = 'cap-bar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:1300;background:var(--bg-secondary);border-top:1px solid var(--glass-border);box-shadow:0 -8px 24px -12px rgba(0,0,0,.25);padding:.75rem 1rem calc(.75rem + env(safe-area-inset-bottom));';
    document.body.appendChild(bar);
    document.body.classList.add('cap-mode');
    this._paint();
    if (window.Sfx) window.Sfx.play('nav');
  },
  stop() {
    this._on = false;
    const bar = document.getElementById('cap-bar'); if (bar) bar.remove();
    document.body.classList.remove('cap-mode');
    this._list().forEach(el => el.classList.remove('cap-sel'));
  },

  _paint() {
    const bar = document.getElementById('cap-bar'); if (!bar) return;
    const list = this._list();
    const lo = Math.min(this._a, this._b), hi = Math.max(this._a, this._b);
    list.forEach((el, i) => el.classList.toggle('cap-sel', this._a >= 0 && (this._b < 0 ? i === this._a : i >= lo && i <= hi)));
    const btn = (act, label, primary) => `<button type="button" data-cap="${act}" class="${primary ? 'btn-primary' : 'btn-secondary'}" style="flex:1 1 auto;width:auto;padding:.65rem .8rem;font-size:.86rem;">${label}</button>`;
    const step = this._a < 0 ? '캡처를 시작할 <b>첫 말풍선</b>을 눌러주세요' : this._b < 0 ? '이제 <b>마지막 말풍선</b>을 눌러주세요' : `말풍선 <b>${hi - lo + 1}개</b>를 골랐어요`;
    bar.innerHTML = `<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:${this._b >= 0 ? '.6rem' : '0'};"><span style="flex:1;font-size:.88rem;color:var(--text-primary);">${step}</span><button type="button" data-cap="cancel" class="btn-secondary" style="width:auto;padding:.45rem .8rem;font-size:.8rem;">그만두기</button></div>`
      + (this._b >= 0 ? `<div style="display:flex;gap:.45rem;flex-wrap:wrap;">${btn('share', '공유하기', true)}${btn('save', '저장')}${btn('post', '커뮤니티에 올리기')}${btn('again', '다시 고르기')}</div>` : '');
  },

  _pick(el) {
    const i = this._list().indexOf(el);
    if (i < 0) return;
    if (this._a < 0) this._a = i;
    else if (this._b < 0) {
      if (Math.abs(i - this._a) + 1 > this.MAX) { this._toast(`한 번에 ${this.MAX}개까지 담을 수 있어요`); return; }
      this._b = i;
    } else { this._a = i; this._b = -1; }
    this._paint();
    if (window.Sfx) window.Sfx.play('pop');
  },

  // 고른 말풍선들 → [{bot, text}]
  _items() {
    const list = this._list(), lo = Math.min(this._a, this._b), hi = Math.max(this._a, this._b);
    return list.slice(lo, hi + 1).map(el => {
      const b = el.querySelector('.message-bubble');
      const ps = b ? b.querySelectorAll('p') : [];
      let text = ps.length ? Array.prototype.map.call(ps, p => p.innerText).join('\n') : (b ? b.innerText : '');
      text = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
      return { bot: el.classList.contains('bot'), text };
    }).filter(m => m.text);
  },

  // 캔버스에 직접 그린다 — 바깥 라이브러리 없이, 어느 기기에서나 같은 모양으로.
  async _render() {
    const items = this._items();
    if (!items.length) return null;
    const W = 720, PAD = 36, MAXB = 500, FS = 26, LH = 39, BP = 20;
    const font = `${FS}px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    const cv = document.createElement('canvas'); let cx = cv.getContext('2d'); cx.font = font;
    const wrap = text => {
      const out = [];
      String(text).split('\n').forEach(par => {
        if (!par) { out.push(''); return; }
        let line = '';
        for (const ch of Array.from(par)) {
          if (cx.measureText(line + ch).width > MAXB - BP * 2 && line) { out.push(line); line = ch === ' ' ? '' : ch; }
          else line += ch;
        }
        out.push(line);
      });
      return out;
    };
    const P = window.Personas && window.Personas.getActive ? window.Personas.getActive() : null;
    const who = (P && P.name) || '우렁이';
    const accent = (P && P.color) || '#4f8a6b';
    const blocks = items.map(m => { const lines = wrap(m.text); return { bot: m.bot, lines, w: Math.min(MAXB, Math.max.apply(null, lines.map(l => cx.measureText(l).width)) + BP * 2), h: lines.length * LH + BP * 2 - 6 }; });
    const HEAD = 104, FOOT = 78, GAP = 16;
    const H = Math.min(12000, HEAD + blocks.reduce((s, b) => s + b.h + GAP, 0) + FOOT);
    cv.width = W; cv.height = H; cx = cv.getContext('2d');
    cx.fillStyle = '#f7f3ec'; cx.fillRect(0, 0, W, H);
    cx.fillStyle = '#2f2923'; cx.font = `700 30px "Gowun Batang", ${font.split('px ')[1]}`; cx.textBaseline = 'middle';
    cx.fillText(`${who}와 나눈 이야기`, PAD, 56);
    cx.fillStyle = accent; cx.fillRect(PAD, 86, 44, 4);
    const rr = (x, y, w, h, r) => { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); };
    let y = HEAD; cx.font = font;
    for (const b of blocks) {
      if (y + b.h > H - FOOT) break;
      const x = b.bot ? PAD : W - PAD - b.w;
      cx.fillStyle = b.bot ? '#ffffff' : accent;
      cx.shadowColor = 'rgba(60,45,25,.10)'; cx.shadowBlur = 14; cx.shadowOffsetY = 4;
      rr(x, y, b.w, b.h, 22); cx.fill();
      cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetY = 0;
      cx.fillStyle = b.bot ? '#2f2923' : '#ffffff';
      b.lines.forEach((l, i) => cx.fillText(l, x + BP, y + BP + LH / 2 - 4 + i * LH));
      y += b.h + GAP;
    }
    cx.fillStyle = '#8a7b68'; cx.font = `22px ${font.split('px ')[1]}`;
    cx.fillText('마인드 인사이드 · mindinside.kr', PAD, H - 36);
    return cv;
  },

  async _blob() {
    const cv = await this._render();
    if (!cv) return null;
    return new Promise(res => cv.toBlob(b => res({ blob: b, url: cv.toDataURL('image/jpeg', 0.86) }), 'image/jpeg', 0.9));
  },
  _download(blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '우렁이와-나눈-이야기.jpg';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  },

  async act(what) {
    if (what === 'cancel') { this.stop(); return; }
    if (what === 'again') { this._a = this._b = -1; this._paint(); return; }
    const r = await this._blob();
    if (!r || !r.blob) { this._toast('이미지를 만들지 못했어요'); return; }
    if (what === 'save') { this._download(r.blob); this._toast('이미지로 저장했어요'); this.stop(); return; }
    if (what === 'share') {
      const file = new File([r.blob], 'mindinside.jpg', { type: 'image/jpeg' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: '우렁이와 나눈 이야기', text: '마인드 인사이드에서 우렁이와 나눈 이야기예요. mindinside.kr' });
          this.stop(); return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      this._download(r.blob);
      this._toast('이 기기에는 공유 창이 없어 이미지로 저장했어요. 카카오톡에 붙여 보내세요');
      this.stop(); return;
    }
    if (what === 'post') {
      this.stop();
      if (!window.Community || !window.Community._web) return;
      window.Community._web('/blog/write?board=neru');
      const f = document.querySelector('#cm-web iframe');
      // 글쓰기 화면이 뜨면 이미지를 건넨다 (같은 출처의 화면에만)
      if (f) f.addEventListener('load', () => { try { if (/\/blog\/write/.test(f.contentWindow.location.pathname)) f.contentWindow.postMessage({ mi: 'attach', image: r.url }, location.origin); } catch (e) {} });
    }
  }
};

document.addEventListener('click', function (e) {
  const C = window.ChatCapture;
  if (!C) return;
  const b = e.target.closest('[data-cap]');
  if (b) { C.act(b.dataset.cap); return; }
  if (!C._on) return;
  const m = e.target.closest('#chat-messages .message');
  if (m) { e.preventDefault(); e.stopPropagation(); C._pick(m); }
}, true);
