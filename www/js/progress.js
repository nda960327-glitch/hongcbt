// ============================================================================
//  나의 변화 — "이걸 하면 정말 나아지나?" 에 대한 답을 본인의 데이터로 준다.
//
//  설득은 말로 하는 게 아니다. 심리치료에서 사람을 붙잡는 건
//  '치료 근거를 이해했다는 느낌(treatment rationale)' 과
//  '나아질 것 같다는 기대(outcome expectancy)' 인데,
//  둘 다 남의 통계가 아니라 자기 데이터를 볼 때 가장 강해진다.
//
//  그래서 이 화면은 세 가지만 보여준다:
//    ① 표준 검진 이전 → 이후 (PHQ-9 · GAD-7)
//    ② 실천 전후 기분 차이 — 본인이 직접 만든 증거
//    ③ 나에게 잘 듣는 기법 — 같은 노력이면 듣는 쪽으로
//
//  숫자를 부풀리지 않는다. 표본이 적으면 적다고 쓰고, 나빠졌으면 나빠졌다고 쓴다.
//  거짓 희망은 한 번 들키면 나머지 전부를 잃는다.
// ============================================================================
window.Progress = {
  MIN_N: 3,   // 이보다 적으면 '아직 판단하기 이르다'고 말한다

  _S() { return window.Storage; },

  // --------------------------------------------------------------------------
  //  실천 전후 기분 로그
  // --------------------------------------------------------------------------
  logs() { return this._S()._safeGet('cbt_action_log', []) || []; },

  addLog(entry) {
    const list = this.logs();
    list.unshift({ ts: Date.now(), ...entry });
    this._S()._safeSet('cbt_action_log', list.slice(0, 300));
  },

  // 전체 평균 전/후
  moodDelta(filterFn) {
    const rows = this.logs().filter(r => r.before != null && r.after != null).filter(filterFn || (() => true));
    if (!rows.length) return null;
    const b = rows.reduce((s, r) => s + r.before, 0) / rows.length;
    const a = rows.reduce((s, r) => s + r.after, 0) / rows.length;
    return { n: rows.length, before: b, after: a, delta: a - b };
  },

  // 기법별 — 이 사람에게 무엇이 듣는가
  byTechnique() {
    const map = {};
    this.logs().filter(r => r.before != null && r.after != null && r.tech).forEach(r => {
      (map[r.tech] = map[r.tech] || []).push(r.after - r.before);
    });
    return Object.entries(map)
      .map(([tech, ds]) => ({ tech, n: ds.length, avg: ds.reduce((s, d) => s + d, 0) / ds.length }))
      .sort((x, y) => y.avg - x.avg);
  },

  // --------------------------------------------------------------------------
  //  표준 검진 이전 → 이후
  // --------------------------------------------------------------------------
  //  Assess 가 검진을 마칠 때마다 스냅샷을 남긴다.
  // 검진 이력. 이력 저장 기능이 생기기 전에 검진한 사람은 여기가 비어 있어서,
  //  분명히 검진을 했는데도 화면에 아무것도 안 나온다. 현재 답안으로 한 번 메워준다.
  screenings() {
    let h = this._S()._safeGet('cbt_assess_history', []) || [];
    if (!h.length && window.Assess) {
      try {
        const qa = window.Assess.answers();
        const sc = window.Assess.scores();
        if (qa && qa.ts && sc && sc.phq != null) {
          h = [{ ts: qa.ts, phq: sc.phq, gad: sc.gad, item9: sc.item9 }];
          this._S()._safeSet('cbt_assess_history', h);
        }
      } catch (e) {}
    }
    return h;
  },

  // 임상에서 '의미 있는 변화'로 보는 최소 폭. 이보다 작으면 변화라고 말하지 않는다.
  //  (PHQ-9 5점, GAD-7 4점 — 널리 쓰이는 최소 임상적 중요 차이)
  MCID: { phq: 5, gad: 4 },

  // 3회 이상이면 두 시점 비교가 아니라 흐름을 봐야 한다.
  TREND_MIN: 3,

  // 표준 절단점 — 그래프 배경 띠로 깔아 지금 어느 구간인지 바로 보이게
  CUTS: {
    phq: [{ to: 4, label: "정상" }, { to: 9, label: "경도" }, { to: 14, label: "중등도" }, { to: 19, label: "중등도이상" }, { to: 27, label: "심함" }],
    gad: [{ to: 4, label: "정상" }, { to: 9, label: "경도" }, { to: 14, label: "중등도" }, { to: 21, label: "심함" }]
  },

  // 재측정 추이 — AssessCharts.retest 를 그대로 쓴다 (절단점 띠 + 꺾은선)
  _trend(key, name, max) {
    const h = this.screenings().filter(x => x && x[key] != null);
    if (h.length < this.TREND_MIN || !window.AssessCharts || !window.AssessCharts.retest) return "";
    const series = h.map(x => ({
      v: x[key],
      label: new Date(x.ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
    }));
    return window.AssessCharts.retest(series, { name, max, cuts: this.CUTS[key] });
  },

  screeningChange() {
    const h = this.screenings().filter(x => x && x.phq != null);
    if (h.length < 2) return null;
    const first = h[0], last = h[h.length - 1];
    const dPhq = last.phq - first.phq;
    const dGad = (last.gad ?? 0) - (first.gad ?? 0);
    const verdict = (d, k) => {
      if (d <= -this.MCID[k]) return 'better';
      if (d >= this.MCID[k]) return 'worse';
      return 'same';
    };
    return {
      first, last, dPhq, dGad,
      phqVerdict: verdict(dPhq, 'phq'),
      gadVerdict: verdict(dGad, 'gad'),
      days: Math.max(1, Math.round((last.ts - first.ts) / 86400000)),
      count: h.length,
      series: h
    };
  },

  // --------------------------------------------------------------------------
  //  화면
  // --------------------------------------------------------------------------
  MOODS: [
    { v: 1, t: '많이 나쁨' }, { v: 2, t: '나쁨' }, { v: 3, t: '보통' },
    { v: 4, t: '좋음' }, { v: 5, t: '아주 좋음' }
  ],

  _bar(pct, color) {
    return `<div style="flex:1 1 0%;height:8px;border-radius:999px;background:var(--bg-tertiary);overflow:hidden;">
      <div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};"></div></div>`;
  },

  render() {
    const el = document.getElementById('progress-card');
    if (!el) return;
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const ic = (n, s = 15) => (window.Icons ? window.Icons.svg(n, { size: s }) : '');
    const OK = '#4f8a6b', BAD = '#c14a4a', MUTE = 'var(--text-muted)';

    // ── ① 표준 검진 이전 → 이후 ──
    const sc = this.screeningChange();
    let scBlock;
    if (!sc) {
      // 아직 한 번뿐이어도 텅 비어 보이지 않게, 지금 점수는 보여준다.
      const one = this.screenings().filter(x => x && x.phq != null).slice(-1)[0];
      scBlock = one
        ? `<div style="display:flex;gap:0.8rem;margin-bottom:0.4rem;">
             <div><div style="font-size:0.66rem;color:${MUTE};">우울 (PHQ-9)</div>
               <div style="font-size:1.15rem;font-weight:800;color:var(--text-primary);">${one.phq}<span style="font-size:0.7rem;color:${MUTE};"> / 27</span></div></div>
             <div><div style="font-size:0.66rem;color:${MUTE};">불안 (GAD-7)</div>
               <div style="font-size:1.15rem;font-weight:800;color:var(--text-primary);">${one.gad ?? 0}<span style="font-size:0.7rem;color:${MUTE};"> / 21</span></div></div>
           </div>
           <p style="margin:0;font-size:0.78rem;line-height:1.6;color:${MUTE};">첫 기록이에요. 한 번 더 받으면 무엇이 달라졌는지 나란히 볼 수 있어요.</p>`
        : `<p style="margin:0;font-size:0.78rem;line-height:1.6;color:${MUTE};">
            표준 검진을 받으면 여기서 변화를 추적해요.</p>`;
    } else {
      const line = (label, a, b, d, verdict, max) => {
        const col = verdict === 'better' ? OK : verdict === 'worse' ? BAD : MUTE;
        const word = verdict === 'better' ? '줄었어요' : verdict === 'worse' ? '늘었어요' : '큰 변화 없어요';
        return `
          <div style="margin-bottom:0.7rem;">
            <div style="display:flex;align-items:baseline;gap:0.4rem;margin-bottom:0.3rem;">
              <strong style="font-size:0.8rem;color:var(--text-primary);">${label}</strong>
              <span style="font-size:0.74rem;color:${MUTE};">${a} → <b style="color:${col};">${b}</b></span>
              <span style="margin-left:auto;font-size:0.72rem;font-weight:800;color:${col};">${d > 0 ? '+' : ''}${d}점 ${word}</span>
            </div>
            <div style="display:flex;align-items:center;gap:0.35rem;">
              ${this._bar((a / max) * 100, MUTE)}
              <span style="flex-shrink:0;font-size:0.62rem;color:${MUTE};">이전</span>
            </div>
            <div style="display:flex;align-items:center;gap:0.35rem;margin-top:0.2rem;">
              ${this._bar((b / max) * 100, col)}
              <span style="flex-shrink:0;font-size:0.62rem;color:${col};font-weight:800;">지금</span>
            </div>
          </div>`;
      };
      const anyBetter = sc.phqVerdict === 'better' || sc.gadVerdict === 'better';
      const anyWorse = sc.phqVerdict === 'worse' || sc.gadVerdict === 'worse';
      // 3회 이상이면 막대 두 개가 아니라 흐름을 보여준다
      const trendPhq = this._trend("phq", "우울 (PHQ-9)", 27);
      const trendGad = this._trend("gad", "불안 (GAD-7)", 21);
      scBlock = (trendPhq || trendGad)
        ? trendPhq + (trendGad ? '<div style="margin-top:0.8rem;">' + trendGad + '</div>' : '')
        : line('우울 (PHQ-9)', sc.first.phq, sc.last.phq, sc.dPhq, sc.phqVerdict, 27)
          + line('불안 (GAD-7)', sc.first.gad ?? 0, sc.last.gad ?? 0, sc.dGad, sc.gadVerdict, 21)
      scBlock += `<p style="margin:0.45rem 0 0;font-size:0.73rem;line-height:1.65;color:${MUTE};">
            ${sc.days}일 사이 ${sc.count}번 측정 · 첫 회 대비.
            ${anyBetter ? `점수가 <b style="color:${OK};">임상에서 의미 있다고 보는 폭</b>만큼 내려갔어요 (PHQ-9 5점·GAD-7 4점 기준).`
              : anyWorse ? `점수가 올라갔어요. 이건 실패가 아니라 <b>지금 도움이 더 필요하다는 신호</b>예요 — 상담사 연결을 권해요.`
              : `아직 기준선을 넘는 변화는 아니에요. 2주는 짧아요 — 계속 쌓이면 여기서 보입니다.`}
          </p>`;
    }

    // ── ② 실천 전후 기분 ──
    const md = this.moodDelta();
    let mdBlock;
    if (!md) {
      mdBlock = `<p style="margin:0;font-size:0.78rem;line-height:1.6;color:${MUTE};">
        케어플랜 할 일을 체크할 때 자동으로 기록돼요.</p>`;
    } else {
      const up = md.delta > 0;
      const col = up ? OK : md.delta < 0 ? BAD : MUTE;
      const enough = md.n >= this.MIN_N;
      mdBlock = `
        <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.45rem;">
          <div style="text-align:center;flex:1 1 0%;">
            <div style="font-size:0.66rem;color:${MUTE};">하기 전</div>
            <div style="font-size:1.3rem;font-weight:800;color:var(--text-primary);">${md.before.toFixed(1)}</div>
          </div>
          <span style="flex-shrink:0;color:${col};font-size:1.1rem;font-weight:800;">→</span>
          <div style="text-align:center;flex:1 1 0%;">
            <div style="font-size:0.66rem;color:${MUTE};">하고 난 뒤</div>
            <div style="font-size:1.3rem;font-weight:800;color:${col};">${md.after.toFixed(1)}</div>
          </div>
          <div style="flex-shrink:0;text-align:right;">
            <div style="font-size:0.66rem;color:${MUTE};">${md.n}번 기록</div>
            <div style="font-size:0.86rem;font-weight:800;color:${col};">${md.delta > 0 ? '+' : ''}${md.delta.toFixed(1)}</div>
          </div>
        </div>
        <p style="margin:0;font-size:0.73rem;line-height:1.65;color:${MUTE};">
          ${!enough ? `아직 ${md.n}번이라 결론짓기엔 일러요. ${this.MIN_N}번만 더 쌓이면 경향이 보입니다.`
            : up ? `할 일을 하고 나면 평균 <b style="color:${OK};">${md.delta.toFixed(1)}점</b> 기분이 올라갔어요. 이건 앱이 만든 숫자가 아니라 <b>당신이 직접 남긴 기록</b>이에요.`
            : `아직 뚜렷한 상승은 안 보여요. 지금 하는 활동이 안 맞을 수 있어요 — 우렁이에게 말해주면 계획을 바꿔볼게요.`}
        </p>`;
    }

    // ── ③ 나에게 듣는 기법 ──
    const tech = this.byTechnique().filter(t => t.n >= 2);
    const techBlock = tech.length ? `
      <div style="margin-top:0.2rem;">
        ${tech.slice(0, 4).map(t => `
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.28rem 0;">
            <span style="flex:0 0 92px;font-size:0.76rem;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.tech)}</span>
            ${this._bar(Math.abs(t.avg) / 2 * 100, t.avg >= 0 ? OK : BAD)}
            <span style="flex-shrink:0;font-size:0.72rem;font-weight:800;color:${t.avg >= 0 ? OK : BAD};">${t.avg > 0 ? '+' : ''}${t.avg.toFixed(1)}</span>
            <span style="flex-shrink:0;font-size:0.64rem;color:${MUTE};">${t.n}회</span>
          </div>`).join('')}
        <p style="margin:0.35rem 0 0;font-size:0.71rem;color:${MUTE};">다음 리포트가 이 결과를 반영해요.</p>
      </div>` : `<p style="margin:0;font-size:0.78rem;line-height:1.6;color:${MUTE};">
        기법별로 2번씩 쌓이면 무엇이 잘 듣는지 비교돼요.</p>`;

    const sect = (num, title, body) => `
      <div style="padding:0.8rem 0;border-top:1px solid var(--glass-border);">
        <div style="display:flex;align-items:center;gap:0.35rem;margin-bottom:0.5rem;">
          <span style="flex-shrink:0;width:17px;height:17px;border-radius:50%;background:var(--bg-tertiary);border:1px solid var(--glass-border);
                       font-size:0.6rem;font-weight:800;color:var(--text-muted);display:inline-flex;align-items:center;justify-content:center;">${num}</span>
          <strong style="font-size:0.83rem;color:var(--text-primary);">${title}</strong>
        </div>
        ${body}
      </div>`;

    el.innerHTML = `
      <div class="glass-card" style="padding: 0.95rem 1rem;">
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span style="line-height:0;color:var(--accent-primary);">${ic('dashboard', 17)}</span>
          <strong style="font-size:0.92rem;color:var(--text-primary);">나의 변화</strong>
          ${(() => {
            // 리포트가 없으면 이 화면은 거의 비어 있다 — 그때는 버튼을 눈에 띄게 둔다.
            const has = (window.Assess && window.Assess.reports().length) > 0;
            return `<button onclick="window.Assess && window.Assess.open()"
              style="all: unset; margin-left: auto; flex-shrink: 0; cursor: pointer; white-space: nowrap;
                     font-size: 0.72rem; font-weight: 800; border-radius: 999px; padding: 0.32rem 0.7rem;
                     ${has
                       ? 'color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);'
                       : 'color: #fff; background: var(--accent-primary); box-shadow: 0 2px 8px color-mix(in srgb, var(--accent-primary) 45%, transparent);'}">
              ${has ? 'AI 마음 리포트 ›' : 'AI 마음 리포트 받기 ›'}</button>`;
          })()}
        </div>

        ${sect('1', '표준 검진 · 이전과 지금', scBlock)}
        ${sect('2', '실천 전후 기분 — 내가 만든 증거', mdBlock)}
        ${sect('3', '나에게 잘 듣는 방법', techBlock)}
      </div>`;
  },

  // --------------------------------------------------------------------------
  //  실천 직후 기분 묻기 — 케어플랜 체크에서 부른다
  // --------------------------------------------------------------------------
  askAfter(action, tech, before) {
    const old = document.getElementById('progress-ask');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'progress-ask';
    wrap.style.cssText = 'position: fixed; inset: 0; z-index: 10050; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end;';
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const stage = before == null ? 'before' : 'after';
    const title = stage === 'before' ? '하기 <b>전</b> 기분은 어땠어요?' : '하고 난 <b>뒤</b> 지금 기분은요?';

    wrap.innerHTML = `
      <div style="width:100%;background:var(--bg-secondary);border-radius:20px 20px 0 0;padding:0.9rem 1.25rem calc(1.4rem + env(safe-area-inset-bottom));animation:slideUp 0.22s ease;">
        <div style="width:38px;height:4px;border-radius:2px;background:var(--glass-border);margin:0 auto 0.9rem;"></div>
        <p style="margin:0 0 0.15rem;font-size:0.74rem;color:var(--text-muted);line-height:1.5;">${esc(action)}</p>
        <p style="margin:0 0 0.15rem;font-size:0.95rem;font-weight:800;color:var(--text-primary);">${title}</p>
        <p style="margin:0 0 0.8rem;font-size:0.72rem;color:var(--text-muted);">두 번만 누르면 끝나요</p>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.35rem;">
          ${this.MOODS.map(m => `
            <button onclick="window.Progress._pick(${m.v})"
              style="all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:0.6rem 0.2rem;border-radius:12px;
                     background:var(--bg-tertiary);border:1px solid var(--glass-border);">
              <div style="font-size:1.05rem;font-weight:800;color:var(--accent-primary);">${m.v}</div>
              <div style="font-size:0.6rem;font-weight:700;color:var(--text-muted);white-space:nowrap;">${m.t}</div>
            </button>`).join('')}
        </div>
        <button onclick="window.Progress._skip()"
          style="all:unset;display:block;width:100%;text-align:center;margin-top:0.7rem;cursor:pointer;font-size:0.76rem;color:var(--text-muted);">건너뛰기</button>
      </div>`;
    document.body.appendChild(wrap);
    if (window.Sfx) window.Sfx.play('pop');
    this._pending = { action, tech, before };
  },

  _pick(v) {
    const p = this._pending;
    if (!p) return this._skip();
    if (window.Sfx) window.Sfx.hit('mood');
    if (p.before == null) {
      // 첫 번째 답 = 하기 전 기분 → 곧바로 '하고 난 뒤' 를 묻는다
      const el = document.getElementById('progress-ask');
      if (el) el.remove();
      this.askAfter(p.action, p.tech, v);
      return;
    }
    this.addLog({ action: p.action, tech: p.tech, before: p.before, after: v });
    this._pending = null;
    this._skip();
    this.render();
    const md = this.moodDelta();
    if (md && md.n >= this.MIN_N && md.delta > 0 && window.App) {
      window.App.showRecordToast(`지금까지 ${md.n}번 — 평균 ${md.delta.toFixed(1)}점 올랐어요`, null);
    }
  },

  _skip() {
    const el = document.getElementById('progress-ask');
    if (el) el.remove();
    this._pending = null;
  },

  // --------------------------------------------------------------------------
  //  리포트에 실을 스냅샷 — 대시보드 카드는 매일 보는 살아있는 화면이고,
  //  이건 리포트가 만들어진 그 시점의 기록이다. 상담사에게 가는 문서에도 남는다.
  // --------------------------------------------------------------------------
  reportBlock(K) {
    const sc = this.screeningChange();
    const md = this.moodDelta();
    if (!sc && !(md && md.n >= this.MIN_N)) return "";   // 비교할 게 없으면 절 자체를 만들지 않는다
    const OK = (K && K.C && K.C.ok) || "#4f8a6b";
    const BAD = (K && K.C && K.C.bad) || "#c14a4a";
    const GRID = (K && K.C && K.C.grid) || "rgba(0,0,0,0.12)";
    const rows = [];

    if (sc) {
      const one = (label, a, b, d, v, max) => {
        const col = v === "better" ? OK : v === "worse" ? BAD : "inherit";
        const word = v === "better" ? "감소" : v === "worse" ? "증가" : "유의한 변화 없음";
        return `<div style="display:flex;align-items:baseline;gap:0.5rem;padding:0.3rem 0;border-bottom:1px dashed ${GRID};">          <span style="flex:0 0 100px;font-size:0.8rem;font-weight:700;">${label}</span>          <span style="font-size:0.82rem;">${a} &rarr; <b style="color:${col};">${b}</b> / ${max}</span>          <span style="margin-left:auto;font-size:0.75rem;font-weight:800;color:${col};white-space:nowrap;">${d > 0 ? "+" : ""}${d}점 ${word}</span>        </div>`;
      };
      // 3회 이상이면 추이 그래프를 먼저, 그 아래 첫 회 대비 수치
      const tPhq = this._trend("phq", "PHQ-9 우울", 27);
      const tGad = this._trend("gad", "GAD-7 불안", 21);
      if (tPhq) rows.push('<div style="margin-bottom:0.55rem;">' + tPhq + '</div>');
      if (tGad) rows.push('<div style="margin-bottom:0.75rem;">' + tGad + '</div>');
      rows.push(one("PHQ-9 우울", sc.first.phq, sc.last.phq, sc.dPhq, sc.phqVerdict, 27));
      rows.push(one("GAD-7 불안", sc.first.gad || 0, sc.last.gad || 0, sc.dGad, sc.gadVerdict, 21));
      rows.push(`<p style="margin:0.5rem 0 0;font-size:0.76rem;line-height:1.7;opacity:0.8;">        ${sc.days}일 간격 ${sc.count}회 측정. 판정 기준은 최소 임상적 중요 차이(PHQ-9 5점 · GAD-7 4점)이며, 그보다 작은 변동은 <b>변화로 보지 않았습니다</b>. 두 시점 비교이므로 인과를 뜻하지 않습니다.      </p>`);
    }

    if (md && md.n >= this.MIN_N) {
      const up = md.delta > 0;
      rows.push(`<div style="margin-top:0.7rem;padding-top:0.6rem;border-top:1px solid ${GRID};">        <span style="font-size:0.62rem;font-weight:800;opacity:0.55;">계획 실행 전후 자기보고 기분 (5점 척도)</span>        <p style="margin:0.25rem 0 0;font-size:0.86rem;line-height:1.7;">${md.n}회 기록 · 평균 <b>${md.before.toFixed(1)}</b> &rarr; <b style="color:${up ? OK : BAD};">${md.after.toFixed(1)}</b> (${md.delta > 0 ? "+" : ""}${md.delta.toFixed(1)})</p>        <p style="margin:0.3rem 0 0;font-size:0.74rem;line-height:1.65;opacity:0.7;">단일 사례 내 전후 비교이며 통제 조건이 없습니다. 경향 파악용으로만 읽어주세요.</p>      </div>`);

      const tech = this.byTechnique().filter(t => t.n >= 2);
      if (tech.length) {
        rows.push(`<div style="margin-top:0.5rem;">          <span style="font-size:0.62rem;font-weight:800;opacity:0.55;">기법별 평균 변화량</span>          ${tech.map(t => `<p style="margin:0.15rem 0 0;font-size:0.8rem;">· ${t.tech} ${t.avg > 0 ? "+" : ""}${t.avg.toFixed(1)} (${t.n}회)</p>`).join("")}        </div>`);
      }
    }

    return rows.join("");
  },

  // 챗봇이 쓸 요약
  promptContext() {
    const md = this.moodDelta();
    const sc = this.screeningChange();
    const parts = [];
    if (md && md.n >= this.MIN_N) {
      parts.push(`실천 전후 기분 ${md.before.toFixed(1)}→${md.after.toFixed(1)} (${md.n}회, ${md.delta > 0 ? '+' : ''}${md.delta.toFixed(1)})`);
    }
    if (sc) {
      parts.push(`PHQ-9 ${sc.first.phq}→${sc.last.phq}, GAD-7 ${sc.first.gad ?? 0}→${sc.last.gad ?? 0} (${sc.days}일)`);
    }
    const tech = this.byTechnique().filter(t => t.n >= 2);
    if (tech.length) parts.push(`잘 듣는 기법: ${tech[0].tech}(${tech[0].avg > 0 ? '+' : ''}${tech[0].avg.toFixed(1)})`);
    if (!parts.length) return '';
    return '[측정된 변화]\n' + parts.join('\n')
      + '\n· 좋아진 게 있으면 근거를 들어 짚어주세요("네가 ○번 했고 평균 ○점 올랐어"). 막연한 칭찬은 힘이 없습니다.'
      + '\n· 나빠졌으면 숨기지 말고 사실대로 말하되, 실패가 아니라 도움이 더 필요한 신호로 다루세요.';
  }
};
