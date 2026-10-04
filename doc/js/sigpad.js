// 손글씨 서명 칸 — 상담사 앱·상담소 콘솔이 같은 파일을 쓴다 (doc/js/sigpad.js 와 똑같이 둔다)
//  SigPad(canvas) → { clear(), empty(), png() }  · 손가락·펜·마우스 모두(pointer events) · 지운 뒤 다시 쓸 수 있다
//  그림은 흰 바탕 없이 투명 PNG 로 — 서버에는 data:image/png;base64,… 로 간다(보통 10~40KB)
window.SigPad = function (cv) {
  const ctx = cv.getContext('2d');
  let drawing = false, last = null, ink = 0;
  const fit = () => {
    const r = cv.getBoundingClientRect(), d = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const keep = ink ? cv.toDataURL() : null;
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.4; ctx.strokeStyle = '#1f2a37';
    if (keep) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = keep; }
  };
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', e => { drawing = true; last = pt(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = pt(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ink += Math.hypot(p.x - last.x, p.y - last.y); last = p; e.preventDefault();
  });
  const up = () => { drawing = false; last = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
  fit();
  window.addEventListener('resize', fit);
  return {
    clear() { ink = 0; ctx.clearRect(0, 0, cv.width, cv.height); },
    empty() { return ink < 40; },            // 점 하나 찍은 것은 서명으로 보지 않는다
    png() {
      // 너무 큰 화면에서 쓴 서명은 줄여서 보낸다(최대 가로 600px)
      const w = cv.width, h = cv.height, k = Math.min(1, 600 / w);
      if (k === 1) return cv.toDataURL('image/png');
      const t = document.createElement('canvas'); t.width = Math.round(w * k); t.height = Math.round(h * k);
      t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
      return t.toDataURL('image/png');
    }
  };
};

// 계약서 본문을 읽기 좋게 — '제n조'는 제목으로, 나머지는 문단으로. 아직 남은 [빈칸]은 노랗게 칠해 둔다.
window.agreementHtml = function (text) {
  const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return String(text || '').split('\n').filter(l => l.trim()).map(l => {
    const t = e(l).replace(/\[([^\]]{1,40})\]/g, '<mark>[$1]</mark>');
    if (/^제\s?\d+\s?조/.test(l)) return `<h4 style="margin:1.1rem 0 0.35rem;font-size:0.98rem;">${t}</h4>`;
    if (/^검토 메모/.test(l)) return `<p style="margin:0.35rem 0;padding:0.45rem 0.6rem;border-radius:8px;background:rgba(160,160,160,0.15);font-size:0.82rem;color:#777;">${t}</p>`;
    return `<p style="margin:0.3rem 0;line-height:1.7;">${t}</p>`;
  }).join('');
};
