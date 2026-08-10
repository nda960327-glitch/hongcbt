// ============================================================================
//  채팅 시각 카드 — 말로 하기 어려운 것을 그림으로
//  상담사가 답장에 [그림:종류|인자|인자] 표식을 넣으면 (llm.js 가 파싱),
//  여기서 말풍선 안에 들어갈 SVG/HTML 카드를 그린다.
//  숫자(감정 강도)는 눈으로 봐야 실감이 나고, before→after 는 나란히 놓아야
//  변화가 보인다. 전부 오프라인 자체 렌더링 — 외부 이미지·라이브러리 없음.
// ============================================================================
window.ChatViz = {
  RX: /\[그림:\s*([^\]]+)\]/g,

  parse(body) {
    const parts = String(body || '').split('|').map(s => s.trim());
    if (!parts[0]) return null;
    return { type: parts[0], args: parts.slice(1) };
  },

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _num(v, min, max, fallback) {
    const n = Number(String(v || '').replace(/[^\d.-]/g, ''));
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  },

  // 강도별 색 — 높을수록 뜨겁게
  _heat(score) {
    if (score >= 70) return '#c0564f';
    if (score >= 40) return '#d98a4a';
    return '#6f97ab';
  },

  render(viz) {
    if (!viz || !viz.type) return '';
    try {
      switch (viz.type) {
        case '감정온도':   return this.gauge(viz.args);
        case '감정파도':   return this.wave(viz.args);
        case '생각저울':   return this.scale(viz.args);
        case '가치나침반': return this.compass(viz.args);
        case '수업진행':   return this.steps(viz.args);
        case '요약카드':   return this.summary(viz.args);
        case '버튼':       return this.buttons(viz.args);
        case '수업카드':   return this.lesson(viz.args);
      }
    } catch (e) {}
    return '';
  },

  // --- 채팅 속 버튼: 상담사가 "이거 해볼래?" 하고 내미는 손 ------------------
  //  args = ['라벨=보낼 메시지', ...] — 누르면 그 메시지를 사용자가 보낸 것처럼 전송.
  //  '=' 가 없으면 라벨을 그대로 보낸다.
  buttons(args) {
    const pairs = (args || []).map(s => {
      const i = String(s).indexOf('=');
      return i > 0 ? [String(s).slice(0, i).trim(), String(s).slice(i + 1).trim()] : [String(s).trim(), ''];
    }).filter(p => p[0]);
    if (!pairs.length) return '';
    return `
      <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.1rem 0;">
        ${pairs.slice(0, 3).map(p => `
          <button data-send="${this._esc(p[1] || p[0])}" onclick="window.ChatViz.send(this)"
            style="all: unset; box-sizing: border-box; cursor: pointer; padding: 0.5rem 0.85rem; border-radius: 999px;
                   font-size: 0.84rem; font-weight: 700; color: var(--accent-primary);
                   background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
                   border: 1.5px solid color-mix(in srgb, var(--accent-primary) 45%, transparent);">${this._esc(p[0])} ›</button>`).join('')}
      </div>`;
  },

  send(el) {
    const text = el && el.dataset ? el.dataset.send : '';
    const inp = document.getElementById('chat-input');
    if (!text || !inp || !window.App) return;
    if (window.Sfx) window.Sfx.play('pop');
    inp.value = text;
    window.App.sendMessage();
  },

  // --- 수업카드(마커명은 유지): 6단계 구조화 상담을 채팅 속 전용 카드로 --------
  //  args[0] = 페르소나 id (마커를 만든 시점의 상담사). 누르면 상담 소개 시트가 열린다.
  lesson(args) {
    if (!window.Personas) return '';
    const p = window.Personas.get(args && args[0] ? args[0] : window.Personas.getActive().id);
    const prog = window.Personas.programOf(p.id);
    if (!prog) return '';
    return `
      <div style="min-width: 215px; padding: 0.1rem 0;">
        <div style="border-radius: 13px; overflow: hidden; border: 1.5px solid color-mix(in srgb, ${p.color} 45%, transparent);">
          <div style="padding: 0.6rem 0.75rem; background: color-mix(in srgb, ${p.color} 16%, transparent); display: flex; align-items: center; gap: 0.5rem;">
            <span style="line-height: 0;">${window.Icons ? window.Icons.svg(prog.icon, { size: 20, line: p.color }) : ''}</span>
            <span style="flex: 1; min-width: 0;">
              <strong style="display: block; font-size: 0.9rem; color: var(--text-primary);">${this._esc(prog.name)}</strong>
              <span style="font-size: 0.66rem; font-weight: 700; color: ${p.color};">${this._esc(prog.full)} · ${this._esc(p.name)}</span>
            </span>
          </div>
          <div style="padding: 0.55rem 0.75rem; background: var(--bg-secondary);">
            ${prog.steps.map((s, i) => `
              <div style="display: flex; align-items: center; gap: 0.45rem; padding: 0.16rem 0;">
                <span style="flex-shrink: 0; width: 17px; height: 17px; border-radius: 50%; background: color-mix(in srgb, ${p.color} 16%, transparent); color: ${p.color}; font-size: 0.62rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;">${i + 1}</span>
                <span style="font-size: 0.76rem; font-weight: 600; color: var(--text-primary);">${this._esc(s)}</span>
              </div>`).join('')}
            <button onclick="if (window.Sfx) window.Sfx.play('pop'); window.Personas.openProgram('${p.id}')"
              style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; cursor: pointer;
                     margin-top: 0.5rem; padding: 0.55rem; border-radius: 10px; font-size: 0.84rem; font-weight: 800;
                     color: #fff; background: ${p.color};">상담 시작하기 ›</button>
          </div>
        </div>
      </div>`;
  },

  // --- 감정온도: [그림:감정온도|불안|72] -------------------------------------
  gauge(args) {
    const name = this._esc(args[0] || '지금 마음');
    const score = this._num(args[1], 0, 100, 50);
    const c = this._heat(score);
    return `
      <div style="min-width: 200px; padding: 0.15rem 0;">
        <div style="display: flex; align-items: baseline; gap: 0.45rem; margin-bottom: 0.45rem;">
          <strong style="font-size: 0.85rem; color: var(--text-primary);">${name}</strong>
          <span style="margin-left: auto; font-size: 1.25rem; font-weight: 800; color: ${c};">${score}<span style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted);"> /100</span></span>
        </div>
        <div style="height: 10px; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); overflow: hidden;">
          <div style="height: 100%; width: ${score}%; border-radius: 999px; background: linear-gradient(90deg, #6f97ab, ${c}); transition: width 0.6s ease;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 0.25rem; font-size: 0.62rem; color: var(--text-muted);">
          <span>잔잔</span><span>출렁</span><span>폭풍</span>
        </div>
      </div>`;
  },

  // --- 감정파도: [그림:감정파도|화남|80] -------------------------------------
  //  파도는 반드시 정점을 찍고 내려온다 — DBT의 핵심 심상을 곡선 위 점으로.
  wave(args) {
    const name = this._esc(args[0] || '감정');
    const score = this._num(args[1], 0, 100, 70);
    const W = 220, H = 86, base = H - 14, peakX = 0.6, sig = 0.2;
    const f = t => Math.exp(-((t - peakX) * (t - peakX)) / (2 * sig * sig)); // 0~1 봉우리
    let d = '';
    for (let i = 0; i <= 44; i++) {
      const t = i / 44, x = t * W, y = base - f(t) * (H - 30);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    // 지금 위치: 강도가 높을수록 정점에 가깝게 (오르막 위에)
    const tDot = 0.1 + (score / 100) * (peakX - 0.1);
    const dx = tDot * W, dy = base - f(tDot) * (H - 30);
    const c = this._heat(score);
    return `
      <div style="min-width: 210px; padding: 0.15rem 0;">
        <div style="display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.2rem;">
          <strong style="font-size: 0.85rem; color: var(--text-primary);">${name}의 파도</strong>
          <span style="margin-left: auto; font-size: 0.95rem; font-weight: 800; color: ${c};">${score}</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width: 100%; display: block;">
          <path d="${d} L${W} ${base} L0 ${base} Z" fill="${c}" opacity="0.13"/>
          <path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
          <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--glass-border)" stroke-width="1"/>
          <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="5" fill="${c}"/>
          <circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="8.5" fill="none" stroke="${c}" opacity="0.4">
            <animate attributeName="r" values="6;11;6" dur="1.6s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.5;0.08;0.5" dur="1.6s" repeatCount="indefinite"/>
          </circle>
          <text x="${Math.min(dx + 9, W - 52).toFixed(1)}" y="${Math.max(dy - 9, 11).toFixed(1)}" font-size="10" font-weight="800" fill="var(--text-primary)">지금 여기</text>
        </svg>
        <p style="margin: 0.25rem 0 0; font-size: 0.68rem; line-height: 1.5; color: var(--text-muted);">파도는 반드시 정점을 찍고 내려와요 · 정점은 약 90초</p>
      </div>`;
  },

  // --- 생각저울: [그림:생각저울|원래 생각|균형 생각] --------------------------
  scale(args) {
    const before = this._esc(args[0] || '');
    const after = this._esc(args[1] || '');
    if (!before || !after) return '';
    return `
      <div style="min-width: 210px; padding: 0.15rem 0;">
        <div style="padding: 0.55rem 0.65rem; border-radius: 11px; background: var(--bg-tertiary); border: 1px dashed var(--glass-border);">
          <span style="display: block; font-size: 0.62rem; font-weight: 800; color: var(--text-muted); margin-bottom: 0.15rem;">스쳐간 생각</span>
          <span style="font-size: 0.82rem; line-height: 1.55; color: var(--text-muted);">${before}</span>
        </div>
        <div style="text-align: center; line-height: 0; margin: 0.3rem 0;">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--accent-primary)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v14M6 12l6 6 6-6"/></svg>
        </div>
        <div style="padding: 0.55rem 0.65rem; border-radius: 11px; background: color-mix(in srgb, var(--accent-primary) 11%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 32%, transparent);">
          <span style="display: block; font-size: 0.62rem; font-weight: 800; color: var(--accent-primary); margin-bottom: 0.15rem;">다시 본 생각</span>
          <span style="font-size: 0.84rem; line-height: 1.55; font-weight: 700; color: var(--text-primary);">${after}</span>
        </div>
      </div>`;
  },

  // --- 가치나침반: [그림:가치나침반|성장|매일 10분 책 읽기] -------------------
  compass(args) {
    const value = this._esc(args[0] || '');
    const step = this._esc(args[1] || '');
    if (!value) return '';
    return `
      <div style="min-width: 200px; padding: 0.15rem 0; text-align: center;">
        <svg viewBox="0 0 90 90" style="width: 84px; display: block; margin: 0 auto;">
          <circle cx="45" cy="45" r="40" fill="none" stroke="var(--glass-border)" stroke-width="2"/>
          <circle cx="45" cy="45" r="33" fill="color-mix(in srgb, var(--accent-primary) 8%, transparent)"/>
          ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
            const r1 = a % 90 === 0 ? 36 : 38, rad = a * Math.PI / 180;
            return `<line x1="${45 + Math.sin(rad) * r1}" y1="${45 - Math.cos(rad) * r1}" x2="${45 + Math.sin(rad) * 40}" y2="${45 - Math.cos(rad) * 40}" stroke="var(--text-muted)" stroke-width="${a % 90 === 0 ? 2 : 1}"/>`;
          }).join('')}
          <g>
            <path d="M45 18 L51 45 L45 41 L39 45 Z" fill="var(--accent-primary)"/>
            <path d="M45 72 L39 45 L45 49 L51 45 Z" fill="var(--text-muted)" opacity="0.45"/>
            <animateTransform attributeName="transform" type="rotate" values="-8 45 45; 6 45 45; -3 45 45; 0 45 45" dur="2.2s" fill="freeze"/>
          </g>
          <circle cx="45" cy="45" r="3.2" fill="var(--text-primary)"/>
        </svg>
        <div style="margin-top: 0.35rem; font-size: 0.68rem; font-weight: 800; color: var(--text-muted);">나의 가치 방향</div>
        <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-primary); margin-top: 0.05rem;">${value}</div>
        ${step ? `<div style="margin-top: 0.4rem; padding: 0.45rem 0.6rem; border-radius: 10px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); font-size: 0.78rem; line-height: 1.5; color: var(--text-primary); text-align: left;"><b style="font-size: 0.64rem; color: var(--text-muted); display: block; margin-bottom: 0.1rem;">오늘의 한 걸음</b>${step}</div>` : ''}
      </div>`;
  },

  // --- 수업진행(마커명은 유지): [그림:수업진행|3|6|고통감내] — 상담 코스 단계 표시 ---
  steps(args) {
    const total = this._num(args[1], 1, 8, 6);
    const cur = this._num(args[0], 1, total, 1);
    const label = this._esc(args[2] || '');
    const dots = [];
    for (let i = 1; i <= total; i++) {
      const done = i < cur, now = i === cur;
      dots.push(`<span style="flex: 1 1 0%; height: 7px; border-radius: 999px; position: relative;
        background: ${done || now ? 'var(--accent-primary)' : 'var(--bg-tertiary)'};
        border: 1px solid ${done || now ? 'var(--accent-primary)' : 'var(--glass-border)'};
        ${now ? 'box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--accent-primary) 30%, transparent);' : ''}
        ${done ? 'opacity: 0.55;' : ''}"></span>`);
    }
    return `
      <div style="min-width: 200px; padding: 0.15rem 0;">
        <div style="display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.4rem;">
          <strong style="font-size: 0.84rem; color: var(--text-primary);">${label || '상담 진행'}</strong>
          <span style="margin-left: auto; font-size: 0.78rem; font-weight: 800; color: var(--accent-primary);">${cur}<span style="color: var(--text-muted); font-weight: 700;">/${total}</span></span>
        </div>
        <div style="display: flex; gap: 4px;">${dots.join('')}</div>
      </div>`;
  },

  // --- 요약카드: [그림:요약카드|오늘의 정리|항목1;항목2;항목3] ----------------
  summary(args) {
    const title = this._esc(args[0] || '오늘의 정리');
    const items = String(args[1] || '').split(';').map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (!items.length) return '';
    return `
      <div style="min-width: 205px; padding: 0.15rem 0;">
        <div style="display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.45rem;">
          <span style="line-height: 0; color: var(--accent-primary);">${window.Icons ? window.Icons.svg('note', { size: 15 }) : ''}</span>
          <strong style="font-size: 0.85rem; color: var(--text-primary);">${title}</strong>
        </div>
        ${items.map(it => `
          <div style="display: flex; align-items: flex-start; gap: 0.4rem; padding: 0.22rem 0;">
            <span style="flex-shrink: 0; margin-top: 3px; width: 13px; height: 13px; border-radius: 4px; background: color-mix(in srgb, var(--accent-primary) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent); display: inline-flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="var(--accent-primary)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>
            </span>
            <span style="font-size: 0.8rem; line-height: 1.5; color: var(--text-primary);">${this._esc(it)}</span>
          </div>`).join('')}
      </div>`;
  }
};
