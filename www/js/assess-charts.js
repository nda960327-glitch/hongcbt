// ============================================================================
//  마음 리포트 차트 — 라이브러리 없이 순수 SVG로 그린다 (오프라인·인쇄 동일)
//
//  설계 원칙
//   · 텍스트는 currentColor 를 쓴다 → 앱(다크)·인쇄본(라이트) 어디서든 읽힌다
//   · 데이터 마크는 고정 팔레트 → 배경이 바뀌어도 의미(정상/주의/높음)가 유지된다
//   · '사실'을 그리는 차트(추이·히트맵·활동)는 앱이 로컬 데이터로 직접 계산한다.
//     AI는 해석만 하고 수치를 만들어내지 않는다. (근거 추적 가능성 확보)
// ============================================================================
window.AssessCharts = {

  C: {
    ok: '#4f8a6b', okL: '#7fc29b',
    warn: '#c9a227',
    bad: '#c96a5a',
    blue: '#6f97ab',
    violet: '#7b6fa8',
    grid: 'rgba(140,130,115,0.28)',
    soft: 'rgba(140,130,115,0.14)'
  },

  esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },

  // **강조** → <b> (본문 가독성: 핵심어만 진하게)
  md(t) {
    return this.esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  },

  tone(pct) { return pct >= 67 ? this.C.bad : pct >= 34 ? this.C.warn : this.C.ok; },

  // ── ① 반원 게이지 — 표준 선별검사용. 절단점 밴드를 호(arc) 위에 그린다 ──
  gauge(o) {
    const { score, max, bands = [], label = '', band = '' } = o;
    const R = 78, CX = 100, CY = 96;
    const pol = (deg, r) => [CX + r * Math.cos(Math.PI * (180 - deg) / 180), CY - r * Math.sin(Math.PI * (180 - deg) / 180)];
    const arc = (fromV, toV, r, w, color) => {
      const a1 = fromV / max * 180, a2 = toV / max * 180;
      const [x1, y1] = pol(a1, r), [x2, y2] = pol(a2, r);
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="butt"/>`;
    };
    let segs = '', prev = 0;
    const palette = [this.C.ok, this.C.okL, this.C.warn, this.C.bad, '#a34b3f'];
    bands.forEach((b, i) => {
      segs += arc(prev, Math.min(b.to + 1, max), R, 13, palette[Math.min(i, palette.length - 1)]);
      prev = Math.min(b.to + 1, max);
    });
    if (!bands.length) segs = arc(0, max, R, 13, this.C.soft);
    const ang = Math.max(0, Math.min(180, score / max * 180));
    const [nx, ny] = pol(ang, R - 20);
    const tickLabels = bands.map((b, i) => {
      if (i === bands.length - 1) return '';
      const a = (b.to + 1) / max * 180;
      const [tx, ty] = pol(a, R + 11);
      return `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="8" fill="currentColor" opacity="0.55" text-anchor="middle">${b.to + 1}</text>`;
    }).join('');

    return `
      <svg viewBox="0 0 200 120" width="100%" style="display:block;max-width:230px;margin:0 auto;color:inherit" role="img" aria-label="${this.esc(label)} ${score}/${max}">
        ${segs}${tickLabels}
        <line x1="${CX}" y1="${CY}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
        <circle cx="${CX}" cy="${CY}" r="5" fill="currentColor"/>
        <text x="${CX}" y="${CY - 26}" font-size="26" font-weight="800" fill="currentColor" text-anchor="middle">${score}</text>
        <text x="${CX}" y="${CY - 13}" font-size="9" fill="currentColor" opacity="0.6" text-anchor="middle">/ ${max}</text>
        <text x="${CX}" y="${CY + 18}" font-size="11" font-weight="800" fill="currentColor" text-anchor="middle">${this.esc(band)}</text>
      </svg>`;
  },

  // ── ② 레이더 — 다축 프로파일(욕구·역동). 한눈에 '모양'이 보인다 ──
  radar(items, opt = {}) {
    const n = items.length;
    if (!n) return '';
    const CX = 110, CY = 112, R = 74;
    const color = opt.color || this.C.violet;
    const pt = (i, v) => {
      const a = (Math.PI * 2 * i / n) - Math.PI / 2;
      const r = R * Math.max(0, Math.min(100, v)) / 100;
      return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    };
    const rings = [25, 50, 75, 100].map(p => {
      const d = items.map((_, i) => pt(i, p)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
      return `<path d="${d}" fill="none" stroke="${this.C.grid}" stroke-width="${p === 100 ? 1.2 : 0.8}"/>`;
    }).join('');
    const spokes = items.map((_, i) => {
      const [x, y] = pt(i, 100);
      return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${this.C.grid}" stroke-width="0.8"/>`;
    }).join('');
    const poly = items.map((it, i) => pt(i, it.score)).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
    const dots = items.map((it, i) => { const [x, y] = pt(i, it.score); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`; }).join('');
    const labels = items.map((it, i) => {
      const [x, y] = pt(i, 122);
      const anchor = Math.abs(x - CX) < 12 ? 'middle' : (x > CX ? 'start' : 'end');
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="8.5" font-weight="700" fill="currentColor" text-anchor="${anchor}">${this.esc(it.name)}</text>`;
    }).join('');
    return `
      <svg viewBox="0 0 220 232" width="100%" style="display:block;max-width:300px;margin:0 auto;color:inherit" role="img" aria-label="프로파일 레이더 차트">
        ${rings}${spokes}
        <path d="${poly}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2"/>
        ${dots}${labels}
      </svg>`;
  },

  // ── ③ 도넛 — 구성비(인지왜곡 분포) ──
  donut(items, centerLabel = '') {
    const total = items.reduce((a, b) => a + (b.pct || 0), 0) || 1;
    const R = 62, W = 26, CX = 90, CY = 90;
    const pal = [this.C.bad, this.C.warn, this.C.violet, this.C.blue, this.C.okL, this.C.ok];
    let acc = 0;
    const circ = 2 * Math.PI * R;
    const segs = items.map((it, i) => {
      const frac = (it.pct || 0) / total;
      const seg = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${pal[i % pal.length]}" stroke-width="${W}"
        stroke-dasharray="${(circ * frac).toFixed(2)} ${(circ * (1 - frac)).toFixed(2)}"
        stroke-dashoffset="${(-circ * acc).toFixed(2)}" transform="rotate(-90 ${CX} ${CY})"/>`;
      acc += frac;
      return seg;
    }).join('');
    const legend = items.map((it, i) => `
      <div style="display:flex;align-items:center;gap:0.35rem;font-size:0.7rem;line-height:1.5;">
        <span style="flex-shrink:0;width:9px;height:9px;border-radius:2px;background:${pal[i % pal.length]}"></span>
        <span style="flex:1 1 0%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.esc(it.name)}</span>
        <b>${Math.round((it.pct || 0) / total * 100)}%</b>
      </div>`).join('');
    return `
      <div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;">
        <svg viewBox="0 0 180 180" width="132" height="132" style="flex-shrink:0;color:inherit" role="img" aria-label="구성비 도넛 차트">
          ${segs}
          <text x="${CX}" y="${CY - 2}" font-size="15" font-weight="800" fill="currentColor" text-anchor="middle">${this.esc(centerLabel)}</text>
          <text x="${CX}" y="${CY + 13}" font-size="8" fill="currentColor" opacity="0.6" text-anchor="middle">비중</text>
        </svg>
        <div style="flex:1 1 130px;min-width:130px;display:flex;flex-direction:column;gap:0.2rem;">${legend}</div>
      </div>`;
  },

  // ── ④ 추이 라인 — 실제 기분 로그(사실). 추세선까지 ──
  line(series, opt = {}) {
    if (!series.length) return '';
    const W = 320, H = 130, PL = 26, PR = 8, PT = 12, PB = 22;
    const xs = (i) => PL + (W - PL - PR) * (series.length === 1 ? 0.5 : i / (series.length - 1));
    const lo = opt.min ?? 1, hi = opt.max ?? 5;
    const ys = (v) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
    const pts = series.map((d, i) => [xs(i), ys(d.v)]);
    const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${path} L${pts[pts.length - 1][0].toFixed(1)} ${H - PB} L${pts[0][0].toFixed(1)} ${H - PB} Z`;
    // 선형 회귀 추세선
    const n = series.length;
    const sx = series.reduce((a, _, i) => a + i, 0), sy = series.reduce((a, d) => a + d.v, 0);
    const sxx = series.reduce((a, _, i) => a + i * i, 0), sxy = series.reduce((a, d, i) => a + i * d.v, 0);
    const den = n * sxx - sx * sx;
    const slope = den ? (n * sxy - sx * sy) / den : 0;
    const icept = (sy - slope * sx) / n;
    const trend = n >= 3
      ? `<line x1="${xs(0).toFixed(1)}" y1="${ys(icept).toFixed(1)}" x2="${xs(n - 1).toFixed(1)}" y2="${ys(icept + slope * (n - 1)).toFixed(1)}" stroke="${this.C.warn}" stroke-width="1.8" stroke-dasharray="4 3"/>` : '';
    const grid = [1, 2, 3, 4, 5].filter(v => v >= lo && v <= hi).map(v =>
      `<line x1="${PL}" y1="${ys(v).toFixed(1)}" x2="${W - PR}" y2="${ys(v).toFixed(1)}" stroke="${this.C.grid}" stroke-width="0.7"/>
       <text x="${PL - 5}" y="${(ys(v) + 3).toFixed(1)}" font-size="7.5" fill="currentColor" opacity="0.5" text-anchor="end">${v}</text>`).join('');
    const step = Math.max(1, Math.ceil(n / 5));
    const xlab = series.map((d, i) => i % step === 0 || i === n - 1
      ? `<text x="${xs(i).toFixed(1)}" y="${H - 6}" font-size="7.5" fill="currentColor" opacity="0.5" text-anchor="middle">${this.esc(d.label)}</text>` : '').join('');
    const dots = pts.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${this.C.blue}"/>`).join('');
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;color:inherit" role="img" aria-label="기분 추이">
        ${grid}
        <path d="${area}" fill="${this.C.blue}" fill-opacity="0.14"/>
        <path d="${path}" fill="none" stroke="${this.C.blue}" stroke-width="2.2" stroke-linejoin="round"/>
        ${trend}${dots}${xlab}
      </svg>
      <p style="margin:0.25rem 0 0;font-size:0.66rem;opacity:0.62;text-align:center;">파란선 = 실제 기분(1~5) · 점선 = 추세 ${slope > 0.02 ? '↗ 상승' : slope < -0.02 ? '↘ 하강' : '→ 평탄'}</p>`;
  },

  // ── ⑤ 히트맵 — 요일×시간대. '언제' 무너지는지 패턴이 드러난다 ──
  heatmap(matrix, opt = {}) {
    const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
    const SLOTS = opt.slots || ['새벽', '아침', '점심', '오후', '저녁', '밤'];
    const cw = 40, ch = 20, PL = 26, PT = 16;
    const W = PL + cw * SLOTS.length + 6, H = PT + ch * 7 + 6;
    let cells = '';
    for (let d = 0; d < 7; d++) {
      for (let s = 0; s < SLOTS.length; s++) {
        const cell = matrix[d] && matrix[d][s];
        const has = cell && cell.n > 0;
        // 값이 낮을수록(기분 나쁨) 붉게, 높을수록 초록
        const v = has ? cell.avg : null;
        const color = !has ? this.C.soft : v <= 2 ? this.C.bad : v <= 3 ? this.C.warn : v <= 4 ? this.C.okL : this.C.ok;
        const op = !has ? 1 : Math.min(1, 0.45 + cell.n * 0.18);
        cells += `<rect x="${PL + s * cw + 1}" y="${PT + d * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="4" fill="${color}" fill-opacity="${op.toFixed(2)}"><title>${DAYS[d]} ${SLOTS[s]}${has ? ` · 평균 ${v.toFixed(1)} (${cell.n}회)` : ' · 기록 없음'}</title></rect>`;
      }
    }
    const rowLab = DAYS.map((d, i) => `<text x="${PL - 6}" y="${PT + i * ch + 14}" font-size="8" fill="currentColor" opacity="0.6" text-anchor="end">${d}</text>`).join('');
    const colLab = SLOTS.map((s, i) => `<text x="${PL + i * cw + cw / 2}" y="${PT - 5}" font-size="8" fill="currentColor" opacity="0.6" text-anchor="middle">${s}</text>`).join('');
    return `
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;color:inherit" role="img" aria-label="요일·시간대 기분 히트맵">
        ${cells}${rowLab}${colLab}
      </svg>
      <div style="display:flex;align-items:center;gap:0.3rem;justify-content:center;margin-top:0.35rem;font-size:0.64rem;opacity:0.62;">
        <span>낮음</span>
        <span style="width:14px;height:9px;border-radius:2px;background:${this.C.bad}"></span>
        <span style="width:14px;height:9px;border-radius:2px;background:${this.C.warn}"></span>
        <span style="width:14px;height:9px;border-radius:2px;background:${this.C.okL}"></span>
        <span style="width:14px;height:9px;border-radius:2px;background:${this.C.ok}"></span>
        <span>높음</span>
        <span style="margin-left:0.4rem;width:14px;height:9px;border-radius:2px;background:${this.C.soft}"></span><span>기록없음</span>
      </div>`;
  },

  // ── ⑥ 사례개념화 흐름도 — 신념→두려움→행동→결과 사슬 ──
  flow(steps) {
    const cols = [this.C.violet, this.C.bad, this.C.warn, this.C.blue];
    return `
      <div style="display:flex;flex-direction:column;gap:0;">
        ${steps.map((s, i) => `
          <div style="display:flex;gap:0.6rem;align-items:stretch;">
            <div style="flex-shrink:0;width:26px;display:flex;flex-direction:column;align-items:center;">
              <span style="width:22px;height:22px;border-radius:50%;background:${cols[i % cols.length]};color:#fff;font-size:0.68rem;font-weight:800;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
              ${i < steps.length - 1 ? `<span style="flex:1;width:2px;background:${this.C.grid};margin:2px 0;"></span>` : ''}
            </div>
            <div style="flex:1 1 0%;min-width:0;padding-bottom:${i < steps.length - 1 ? '0.7rem' : '0'};">
              <p style="margin:0 0 0.1rem;font-size:0.66rem;font-weight:800;color:${cols[i % cols.length]};">${this.esc(s.k)}</p>
              <p style="margin:0;font-size:0.84rem;line-height:1.6;">${this.md(s.v)}</p>
            </div>
          </div>`).join('')}
      </div>`;
  },

  // ── ⑦ 근거 강도 표시 (●●●○○) — 학술 보고서의 confidence 표기 ──
  strength(n) {
    const full = Math.max(0, Math.min(5, n | 0));
    return `<span style="letter-spacing:1px;font-size:0.7rem;color:${full >= 4 ? this.C.ok : full >= 3 ? this.C.warn : this.C.bad};">${'●'.repeat(full)}<span style="opacity:0.3">${'○'.repeat(5 - full)}</span></span>`;
  },

  // ── ⑧ 수평 막대 (탐색 지표용) ──
  bar(x) {
    const s = Math.max(0, Math.min(100, x.score | 0));
    const c = x.good ? (s >= 67 ? this.C.ok : s >= 34 ? this.C.warn : this.C.bad) : this.tone(s);
    return `
      <div style="margin-bottom:0.55rem;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.12rem;gap:0.5rem;">
          <span style="font-size:0.78rem;font-weight:700;">${this.esc(x.name)}</span>
          <span style="font-size:0.72rem;font-weight:800;color:${c};white-space:nowrap;">${x.level ? this.esc(x.level) + ' ' : ''}${s}</span>
        </div>
        <div style="height:9px;border-radius:999px;background:${this.C.soft};overflow:hidden;">
          <div style="height:100%;width:${s}%;border-radius:999px;background:${c};"></div>
        </div>
        ${x.evidence ? `<p style="margin:0.18rem 0 0;font-size:0.69rem;opacity:0.68;line-height:1.5;">${this.md(x.evidence)}</p>` : ''}
      </div>`;
  }
};
