// ============================================================================
//  AI 진단서 v2 — 쌓인 기록 전체를 정밀 분석한 심층 패턴 리포트 (유료: 30,000캐시)
//
//  · 의학적 '진단명'만 붙이지 않을 뿐, 관찰된 패턴은 확신 있게 말한다.
//  · 점수(0~100)로 구조화해 그래프로 보여준다. 파일 저장/인쇄(PDF) 지원.
//  · 데이터가 최소 기준(40%) 미만이면 아예 만들지 않는다 (결제도 안 받음).
//  · 신뢰도가 낮으면 "이 데이터는 믿을만하지 못합니다"라고 명시하되,
//    과장·연기·기계적 입력 같은 의심/비난성 표현은 쓰지 않는다.
// ============================================================================
window.Assess = {

  PRICE: 30000,
  MIN_TOTAL: 80,      // 충분도가 이 미만이면 생성 자체를 막는다
  // 리포트는 14일에 한 번만. 돈을 더 내도 열어주지 않는다.
  //  PHQ-9·GAD-7 이 '지난 2주'를 묻는 도구라 그보다 짧은 간격은 비교 자체가 성립하지 않고,
  //  같은 기록으로 리포트만 다시 뽑으면 표현만 달라진 결과를 진짜 변화로 오해하게 된다.
  COOLDOWN_DAYS: 14,
  QA_VALID_DAYS: 14,  // PHQ-9·GAD-7은 '지난 2주'를 묻는 도구 — 2주가 지나면 만료로 본다

  // --------------------------------------------------------------------------
  //  자가검진 — 표준 선별도구(PHQ-9·GAD-7, 공개 도구) + 탐색 문항(비표준) 분리
 // 표준 문항의 문구·순서·채점은 원 도구 그대로 유지할 것 (임의 수정 금지)
  // --------------------------------------------------------------------------
  SECTIONS: [
    {
      id: 'phq9', name: 'PHQ-9 · 우울 선별 (표준)', standard: true,
      intro: '지난 2주 동안, 다음 문제들로 얼마나 자주 방해를 받았습니까?',
      items: [
        { id: 'p1', t: '일 또는 여가 활동을 하는 데 흥미나 즐거움을 느끼지 못함' },
        { id: 'p2', t: '기분이 가라앉거나, 우울하거나, 희망이 없다고 느낌' },
        { id: 'p3', t: '잠이 들거나 계속 잠을 자는 것이 어려움, 또는 잠을 너무 많이 잠' },
        { id: 'p4', t: '피곤하다고 느끼거나 기운이 거의 없음' },
        { id: 'p5', t: '입맛이 없거나 과식을 함' },
        { id: 'p6', t: '자신을 부정적으로 봄 — 혹은 자신이 실패자라고 느끼거나 자신 또는 가족을 실망시켰다고 느낌' },
        { id: 'p7', t: '신문을 읽거나 텔레비전 보는 것과 같은 일에 집중하는 것이 어려움' },
        { id: 'p8', t: '다른 사람들이 주목할 정도로 너무 느리게 움직이거나 말을 함, 또는 반대로 평상시보다 많이 움직여서 너무 안절부절못하거나 들떠 있음' },
        { id: 'p9', t: '자신이 죽는 것이 더 낫다고 생각하거나 어떤 식으로든 자신을 해칠 것이라고 생각함' }
      ]
    },
    {
      id: 'gad7', name: 'GAD-7 · 불안 선별 (표준)', standard: true,
      intro: '지난 2주 동안, 다음 문제들로 얼마나 자주 방해를 받았습니까?',
      items: [
        { id: 'g1', t: '초조하거나 불안하거나 조마조마하게 느낀다' },
        { id: 'g2', t: '걱정하는 것을 멈추거나 조절할 수가 없다' },
        { id: 'g3', t: '여러 가지 것들에 대해 걱정을 너무 많이 한다' },
        { id: 'g4', t: '편하게 있기가 어렵다' },
        { id: 'g5', t: '너무 안절부절못해서 가만히 있기가 힘들다' },
        { id: 'g6', t: '쉽게 짜증이 나거나 쉽게 성을 내게 된다' },
        { id: 'g7', t: '끔찍한 일이 생길 것처럼 두렵게 느껴진다' }
      ]
    },
    {
      id: 'extra', name: '탐색 문항 (비표준 · 참고용)', standard: false,
      intro: '아래는 표준 검사가 아닌, 리포트의 욕구·패턴 분석을 돕는 참고 문항이에요.',
      items: [
        { id: 'x_up',      t: '평소와 달리 기분이 지나치게 들뜨거나, 잠을 안 자도 쌩쌩한 날이 있었다' },
        { id: 'x_updown',  t: '의욕이 넘치다가 갑자기 무기력해지는 큰 오르내림이 있었다' },
        { id: 'x_focus',   t: '해야 할 일에 집중을 유지하기 어려웠다' },
        { id: 'x_impulse', t: '생각 전에 말이나 행동이 먼저 나갔다' },
        { id: 'x_reject',  t: '상대가 실망할까 봐, 싫어도 부탁을 거절하지 못했다' },
        { id: 'x_belong',  t: '혼자 남는 게 두려워서 무리해서라도 맞췄다' },
        { id: 'x_approve', t: '칭찬이나 인정을 받지 못하면 내 가치가 없는 것처럼 느껴졌다' },
        { id: 'x_give',    t: '관계를 지키려고 먼저 챙기거나 더 많이 내주는 편이었다' },
        { id: 'x_perfect', t: '실수하면 안 된다는 생각에 시작을 미루거나 스스로를 몰아붙였다' },
        { id: 'x_alone',   t: '속마음을 말하면 상대가 떠날 것 같아 혼자 삼켰다' }
      ]
    }
  ],
  get QUESTIONS() { return this.SECTIONS.flatMap(s => s.items.map(i => ({ id: i.id, axis: s.standard ? s.name.split(' ·')[0] : '탐색', t: i.t }))); },
  SCALE: ['전혀 없음', '며칠 동안', '일주일 이상', '거의 매일'],

  // 표준 채점 (밴드는 원 도구의 절단점 그대로)
  scores() {
    const qa = this.answers();
    if (!qa || !qa.map) return null;
    const sum = ids => ids.reduce((a, id) => a + (qa.map[id] ?? 0), 0);
    const pIds = ['p1','p2','p3','p4','p5','p6','p7','p8','p9'];
    const gIds = ['g1','g2','g3','g4','g5','g6','g7'];
    const done = ids => ids.every(id => qa.map[id] != null);
    const phq = done(pIds) ? sum(pIds) : null;
    const gad = done(gIds) ? sum(gIds) : null;
    const phqBand = phq == null ? null : phq <= 4 ? '정상 수준' : phq <= 9 ? '가벼운 우울' : phq <= 14 ? '중간 정도 우울' : phq <= 19 ? '약간 심한 우울' : '심한 우울';
    const gadBand = gad == null ? null : gad <= 4 ? '정상 수준' : gad <= 9 ? '가벼운 불안' : gad <= 14 ? '중간 정도 불안' : '심한 불안';
    return { phq, phqBand, gad, gadBand, item9: qa.map.p9 ?? 0 };
  },

  _S() { return window.Storage; },

  answers() { return this._S()._safeGet('cbt_assess_answers', null); },

  // 검진이 유효한가 (완료 + 2주 이내)
  qaStatus() {
    const qa = this.answers();
    if (!qa || !qa.map) return { ok: false, state: 'none' };
    const sc = this.scores();
    if (!sc || sc.phq == null || sc.gad == null) return { ok: false, state: 'partial' };
    const days = Math.floor((Date.now() - (qa.ts || 0)) / 86400000);
    if (days >= this.QA_VALID_DAYS) return { ok: false, state: 'expired', days };
    return { ok: true, state: 'valid', days, left: this.QA_VALID_DAYS - days };
  },
  reports() { return this._S()._safeGet('cbt_assessments', []) || []; },
  report(id) { return this.reports().find(r => r.id === id) || null; },

  // --------------------------------------------------------------------------
  //  데이터 충분도 + 신뢰도
  // --------------------------------------------------------------------------
  metrics() {
    const S = this._S();
    const msgs = (S.getMessages && S.getMessages()) || [];
    const userMsgs = msgs.filter(m => m.role === 'user');
    const moods = S._safeGet('cbt_mood_log', []) || [];
    const records = (S.getThoughtRecords ? S.getThoughtRecords() : []).filter(r => !String(r.id).startsWith('rec_mock_'));
    const nights = S._safeGet('cbt_night_journal', []) || [];

    const days = new Set();
    userMsgs.forEach(m => { if (m.ts) days.add(new Date(m.ts).toLocaleDateString('sv-CA')); });
    moods.forEach(m => days.add(new Date(m.ts).toLocaleDateString('sv-CA')));
    nights.forEach(n => days.add(new Date(n.ts).toLocaleDateString('sv-CA')));

    const allTs = [...userMsgs.map(m => m.ts), ...moods.map(m => m.ts)].filter(Boolean);
    const spanDays = allTs.length ? Math.max(1, Math.round((Math.max(...allTs) - Math.min(...allTs)) / 86400000) + 1) : 0;
    const avgLen = userMsgs.length ? Math.round(userMsgs.reduce((a, m) => a + (m.text || '').length, 0) / userMsgs.length) : 0;

    const qa = this.answers();
    const bars = [
      { name: '대화량',      pct: Math.min(100, Math.round(userMsgs.length / 120 * 100)), hint: `사용자 발화 ${userMsgs.length}개 (충분: 120개)` },
      { name: '기간(꾸준함)', pct: Math.min(100, Math.round(days.size / 14 * 100)),        hint: `활동한 날 ${days.size}일 (충분: 14일)` },
      { name: '감정 기록',    pct: Math.min(100, Math.round(moods.length / 20 * 100)),      hint: `기분 체크인 ${moods.length}회 (충분: 20회)` },
      { name: '깊은 기록',    pct: Math.min(100, Math.round((records.length + nights.length) / 8 * 100)), hint: `사고기록 ${records.length} + 하루정리 ${nights.length} (충분: 8개)` },
      { name: '표준 자가검진', pct: this.qaStatus().ok ? 100 : 0,
        hint: (() => { const st = this.qaStatus();
          return st.state === 'valid' ? `완료 · ${st.left}일 남음`
            : st.state === 'expired' ? `만료됨 (${st.days}일 전) — 다시 필요`
            : st.state === 'partial' ? '진행 중 — 끝까지 답해주세요'
            : '필수 · 아직 안 함 (5분)'; })() }
    ];
    const total = Math.round(bars[0].pct * 0.3 + bars[1].pct * 0.25 + bars[2].pct * 0.15 + bars[3].pct * 0.15 + bars[4].pct * 0.15);

    // 신뢰도 — 사실만 적는다 (의심·비난 표현 금지)
    const flags = [];
    if (spanDays > 0 && spanDays < 5) flags.push(`전체 기록 기간이 ${spanDays}일`);
    if (userMsgs.length >= 20 && avgLen < 8) flags.push(`발화가 매우 짧음 (평균 ${avgLen}자)`);
    if (moods.length >= 8) {
      const vals = moods.map(m => m.v ?? m.value ?? m.score).filter(v => v != null);
      if (vals.length >= 8 && new Set(vals).size === 1) flags.push('기분 체크인이 전부 동일한 값');
      const sorted = moods.map(m => m.ts).sort((a, b) => a - b);
      let burst = 0;
      for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < 90000) burst++;
      if (burst >= Math.floor(sorted.length * 0.5)) flags.push('기분 체크인 다수가 짧은 시간 안에 연달아 입력됨');
    }
    if (days.size > 0 && userMsgs.length / Math.max(1, days.size) > 60) flags.push('하루 발화량이 비정상적으로 많음');
    const reliability = flags.length >= 2 ? 'low' : flags.length === 1 ? 'mid' : 'high';

    return { userMsgs: userMsgs.length, spanDays, activeDays: days.size, moods: moods.length,
             records: records.length, nights: nights.length, avgLen, bars, total, flags, reliability, qa };
  },

  // --------------------------------------------------------------------------
  //  UI
  // --------------------------------------------------------------------------
  // 대시보드에 놓는 상태 카드. 준비됐을 때만 눈에 띈다.
  // 카드 버튼이 실제로 하는 일. 라벨과 동작이 어긋나면 안 된다 —
  //  "그래도 만들기" 를 눌렀는데 화면만 열리고 끝나면 눌린 게 아니라고 느낀다.
  // 생성 전 확인 팝업. await window.UI.confirm() 은 문구가 길면 읽히지 않아 직접 그린다.
  //  items: [{icon, title, body}] · onOk: 진행
  confirmSheet(o) {
    const old = document.getElementById('assess-confirm');
    if (old) old.remove();
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const wrap = document.createElement('div');
    wrap.id = 'assess-confirm';
    wrap.style.cssText = 'position: fixed; inset: 0; z-index: 10080; background: rgba(0,0,0,0.42); display: flex; align-items: flex-end;';

    const warn = (o.items || []).length > 0;
    wrap.innerHTML = `
      <div style="width: 100%; max-height: 86vh; overflow-y: auto; background: var(--bg-secondary);
                  border-radius: 22px 22px 0 0; padding: 0.9rem 1.25rem calc(1.4rem + env(safe-area-inset-bottom));
                  animation: slideUp 0.22s ease;">
        <div style="width: 38px; height: 4px; border-radius: 2px; background: var(--glass-border); margin: 0 auto 1rem;"></div>

        <div style="text-align: center; margin-bottom: 0.9rem;">
          <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg(warn ? 'think' : 'detective', 76) : ''}</span>
          <p style="margin: 0.5rem 0 0.2rem; font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">${esc(o.title)}</p>
          ${o.lede ? `<p style="margin: 0; font-size: 0.82rem; line-height: 1.65; color: var(--text-secondary);">${esc(o.lede)}</p>` : ''}
        </div>

        ${(o.items || []).map(it => `
          <div style="display: flex; gap: 0.6rem; padding: 0.75rem 0.85rem; margin-bottom: 0.5rem; border-radius: 14px;
                      background: color-mix(in srgb, #c9a227 9%, transparent);
                      border: 1px solid color-mix(in srgb, #c9a227 26%, transparent);">
            <span style="flex-shrink: 0; line-height: 0; margin-top: 1px; color: #c9a227;">
              ${window.Icons ? window.Icons.svg(it.icon || 'bolt', { size: 17 }) : ''}</span>
            <span style="flex: 1 1 0%; min-width: 0;">
              <b style="display: block; font-size: 0.84rem; color: var(--text-primary);">${esc(it.title)}</b>
              <span style="display: block; margin-top: 0.15rem; font-size: 0.77rem; line-height: 1.6; color: var(--text-secondary);">${esc(it.body)}</span>
            </span>
          </div>`).join('')}

        ${o.price ? `<div style="display: flex; align-items: baseline; justify-content: space-between; margin: 0.9rem 0 0.6rem;
                    padding-top: 0.7rem; border-top: 1px dashed var(--glass-border);">
          <span style="font-size: 0.8rem; color: var(--text-muted);">지금 결제</span>
          <b style="font-size: 1.02rem; color: var(--text-primary);">${o.price}</b>
        </div>` : '<div style="height: 0.6rem;"></div>'}

        <button class="btn-primary" style="width: 100%; padding: 0.78rem; font-size: 0.92rem;"
          onclick="window.Assess._confirmOk()">${esc(o.okLabel)}</button>
        <button onclick="window.Assess._confirmClose()"
          style="all: unset; display: block; width: 100%; text-align: center; margin-top: 0.55rem; padding: 0.5rem 0;
                 cursor: pointer; font-size: 0.82rem; font-weight: 700; color: var(--text-muted);">${esc(o.cancelLabel || '다음에 할게요')}</button>

        ${warn ? `<p style="margin: 0.6rem 0 0; font-size: 0.71rem; line-height: 1.55; color: var(--text-muted); text-align: center;">
          생성에 실패하면 캐시는 전액 자동 환불돼요.</p>` : ''}
      </div>`;

    wrap.addEventListener('click', e => { if (e.target === wrap) this._confirmClose(); });
    document.body.appendChild(wrap);
    if (window.Sfx) window.Sfx.play('pop');
    this._onConfirm = o.onOk;
  },

  _confirmClose() {
    const el = document.getElementById('assess-confirm');
    if (el) el.remove();
    this._onConfirm = null;
    if (window.Sfx) window.Sfx.play('close');
  },

  _confirmOk() {
    const fn = this._onConfirm;
    this._confirmClose();
    if (typeof fn === 'function') fn();
  },

  ctaAction() {
    const fresh = this.qaFresh();
    const left = this.cooldownLeft();
    this.open();
    if (!fresh.ok) { this.openQuiz(); return; }   // 검진부터
    if (left > 0) return;                        // 지난 리포트 보기
    this.generate();                             // 경고·확인창은 generate 안에 있다
  },

  ctaCard() {
    const el = document.getElementById('assess-cta');
    if (!el) return;
    const m = this.metrics();
    const fresh = this.qaFresh();
    const left = this.cooldownLeft();
    const has = this.reports().length;

    let state, line, action, accent;
    if (left > 0) {
      state = 'wait';
      line = `다음 리포트까지 ${left}일 — 그동안 케어플랜을 실행해주세요`;
      action = '지난 리포트 보기';
      accent = false;
    } else if (!fresh.ok) {
      state = 'quiz';
      line = fresh.why === 'stale' || fresh.why === 'expired'
        ? '표준 검진을 다시 받으면 준비 끝나요 (5분)'
        : '표준 검진(PHQ-9·GAD-7)부터 받아주세요 (5분)';
      action = '검진하기';
      accent = true;
    } else if (m.total < this.MIN_TOTAL) {
      state = 'collect';
      line = `기록이 ${m.total}% 모였어요 — ${this.MIN_TOTAL}%부터 정확해져요`;
      action = '그래도 만들기';
      accent = false;
    } else {
      state = 'ready';
      line = has ? '새 리포트를 만들 수 있어요' : '이제 만들 수 있어요';
      action = '리포트 만들기';
      accent = true;
    }

    const bar = `<div style="height:6px;border-radius:999px;background:var(--bg-tertiary);overflow:hidden;margin:0.5rem 0 0.55rem;">
      <div style="height:100%;width:${Math.min(100, m.total)}%;background:var(--accent-primary);"></div></div>`;

    el.innerHTML = `
      <div class="glass-card" style="position:relative;padding:0.9rem 1rem;border:1.5px solid color-mix(in srgb, var(--accent-primary) ${accent ? '45' : '28'}%, transparent);box-shadow:0 3px 14px color-mix(in srgb, var(--accent-primary) 12%, transparent);">
        <span style="position:absolute;top:-9px;right:12px;background:linear-gradient(90deg,#e8b93c,#d98f2b);color:#fff;font-size:0.64rem;font-weight:900;padding:0.2rem 0.6rem;border-radius:999px;letter-spacing:0.05em;box-shadow:0 2px 8px rgba(217,143,43,0.45);">★ 추천</span>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span style="line-height:0;color:var(--accent-primary);">${window.Icons ? window.Icons.svg('search', { size: 18 }) : ''}</span>
          <strong style="font-size:0.92rem;color:var(--text-primary);">AI 마음 리포트</strong>
          <span style="font-size:0.68rem;font-weight:800;color:#c9a227;background:color-mix(in srgb, #c9a227 14%, transparent);padding:0.15rem 0.5rem;border-radius:999px;">30,000캐시</span>
        </div>
        <p style="margin:0.35rem 0 0;font-size:0.78rem;line-height:1.6;color:var(--text-secondary);">
          내 기록을 정밀 분석해 <b>2주 케어플랜</b>을 처방하고, <b>나의 변화</b>를 채워요.
        </p>
        ${state === 'collect' ? bar : ''}
        <p style="margin:0.4rem 0 0.6rem;font-size:0.76rem;font-weight:700;color:${accent ? 'var(--accent-primary)' : 'var(--text-muted)'};">${line}</p>
        <button onclick="window.Assess.ctaAction()" class="${accent ? 'btn-primary' : 'btn-secondary'}"
          style="width:100%;padding:0.62rem;font-size:0.85rem;">${action} ›</button>
      </div>`;
  },

  open() {
    const ov = document.getElementById('assess-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    this.render();
  },

  close() {
    const ov = document.getElementById('assess-overlay');
    if (ov) ov.classList.add('hidden');
  },

  // ── 로컬 데이터에서 사실 차트를 계산한다 (AI가 만든 수치가 아님) ──
  factCharts() {
    const S = this._S();
    const moods = (S._safeGet('cbt_mood_log', []) || []).filter(m => m.ts);
    const out = {};

    // 일자별 평균 기분 (최근 21일)
    const byDay = {};
    moods.forEach(m => {
      const k = new Date(m.ts).toLocaleDateString('sv-CA');
      const v = m.v ?? m.value ?? m.score;
      if (v == null) return;
      (byDay[k] = byDay[k] || []).push(v);
    });
    const days = Object.keys(byDay).sort().slice(-21);
    out.series = days.map(k => ({
      label: k.slice(5).replace('-', '/'),
      v: byDay[k].reduce((a, b) => a + b, 0) / byDay[k].length
    }));

    // 요일 × 시간대 히트맵
    const M = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => ({ n: 0, sum: 0 })));
    const slotOf = h => h < 5 ? 0 : h < 9 ? 1 : h < 13 ? 2 : h < 17 ? 3 : h < 21 ? 4 : 5;
    moods.forEach(m => {
      const v = m.v ?? m.value ?? m.score;
      if (v == null) return;
      const d = new Date(m.ts);
      const row = (d.getDay() + 6) % 7;   // 월=0
      const cell = M[row][slotOf(d.getHours())];
      cell.n++; cell.sum += v;
    });
    out.matrix = M.map(r => r.map(c => ({ n: c.n, avg: c.n ? c.sum / c.n : 0 })));

    // 인지왜곡 분포 (사고기록에서 집계)
    const recs = (S.getThoughtRecords ? S.getThoughtRecords() : []).filter(r => !String(r.id).startsWith('rec_mock_'));
    const dmap = {};
    recs.forEach(r => (r.distortions || []).forEach(d => { dmap[d] = (dmap[d] || 0) + 1; }));
    const NAMES = (window.ThoughtRecord && window.ThoughtRecord.distortions) || [];
    out.distortions = Object.entries(dmap).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, n]) => ({ name: (NAMES.find(x => x.id === id) || {}).label || id, pct: n }));
    out.recordCount = recs.length;
    out.moodCount = moods.length;
    return out;
  },

  // ── 구조화 리포트 HTML (json 없으면 옛 텍스트형 폴백) ──
  _reportHtml(r) {
    const K = window.AssessCharts;
    if (!r.json || !K) return '<div style="font-size:0.84rem;line-height:1.8;white-space:pre-wrap;">' + String(r.body || '').replace(/</g, '&lt;') + '</div>';
    const j = r.json;
    const f = r.facts || this.factCharts();

    // 공통 섹션 껍데기 — 번호 + 제목 + 부제
    const sec = (no, title, sub, inner, tint) => `
      <section style="margin-top:1.4rem;">
        <div style="display:flex;align-items:baseline;gap:0.5rem;padding-bottom:0.4rem;border-bottom:2px solid ${tint || K.C.grid};margin-bottom:0.85rem;">
          <span style="font-size:0.72rem;font-weight:800;color:${tint || K.C.ok};letter-spacing:0.06em;">${no}</span>
          <h3 style="margin:0;font-size:1rem;font-weight:800;letter-spacing:-0.01em;">${title}</h3>
        </div>
        ${sub ? `<p style="margin:-0.5rem 0 0.75rem;font-size:0.7rem;opacity:0.6;">${sub}</p>` : ''}
        ${inner}
      </section>`;

    const card = (inner, pad) => `<div style="border:1px solid ${K.C.grid};border-radius:14px;padding:${pad || '0.9rem'};">${inner}</div>`;

    // ── 표지: 헤드라인 + 신뢰도 배지 ──
    const relLow = j.reliability && /낮/.test(j.reliability.level || '');
    const relMid = j.reliability && /보통/.test(j.reliability.level || '');
    const relColor = relLow ? K.C.bad : relMid ? K.C.warn : K.C.ok;
    const cover = `
      <div style="border-radius:16px;padding:1.1rem 1.15rem;background:linear-gradient(135deg, color-mix(in srgb, ${K.C.ok} 14%, transparent), transparent);border:1px solid ${K.C.grid};">
        <p style="margin:0 0 0.4rem;font-size:0.64rem;font-weight:800;letter-spacing:0.12em;opacity:0.55;">MIND REPORT · 참고용 심리 리포트</p>
        <p style="margin:0 0 0.6rem;font-size:1.22rem;font-weight:800;line-height:1.5;letter-spacing:-0.02em;word-break:keep-all;">${K.md(j.headline || '')}</p>
        ${j.summaryLine ? `<p style="margin:0 0 0.75rem;font-size:0.86rem;line-height:1.7;opacity:0.85;">${K.md(j.summaryLine)}</p>` : ''}
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">
          <span style="font-size:0.68rem;font-weight:800;padding:0.22rem 0.6rem;border-radius:999px;background:${relColor};color:#fff;">신뢰도 ${K.esc((j.reliability || {}).level || '-')}</span>
          <span style="font-size:0.68rem;font-weight:700;padding:0.22rem 0.6rem;border-radius:999px;border:1px solid ${K.C.grid};">데이터 ${f.moodCount}건 · 기록 ${f.recordCount}편</span>
          <span style="font-size:0.68rem;font-weight:700;padding:0.22rem 0.6rem;border-radius:999px;border:1px solid ${K.C.grid};">${K.esc(r.date || '')}</span>
        </div>
        ${(j.reliability || {}).note ? `<p style="margin:0.6rem 0 0;font-size:0.72rem;line-height:1.6;opacity:0.75;">${K.md(j.reliability.note)}</p>` : ''}
      </div>`;

    // ── Ⅰ 표준 선별검사: 게이지 2개 나란히 ──
    const std = Array.isArray(j.standard) && j.standard.length ? sec('Ⅰ', '표준 선별검사 결과', '국제 표준 도구 · 원 절단점 그대로 적용',
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.7rem;">
        ${j.standard.map(x => `<div style="border:1px solid ${K.C.grid};border-radius:14px;padding:0.8rem 0.5rem 0.6rem;text-align:center;">
          <p style="margin:0 0 0.15rem;font-size:0.74rem;font-weight:800;">${K.esc(x.name)}</p>
          ${K.gauge({ score: x.score, max: x.max, band: x.band, bands: x.bands || [], label: x.name })}
          ${x.note ? `<p style="margin:0.3rem 0 0;font-size:0.68rem;opacity:0.7;line-height:1.5;">${K.md(x.note)}</p>` : ''}
        </div>`).join('')}
      </div>
      <p style="margin:0.6rem 0 0;font-size:0.68rem;opacity:0.62;line-height:1.6;">※ 선별검사는 <b>진단이 아니라 위험도 스크리닝</b>입니다. 색 띠는 원 도구의 절단점 구간이에요.</p>`, K.C.ok) : '';

    // ── Ⅰ-1 표준검사 재측정 추이 (개입 효과를 보여주는 가장 신뢰할 만한 근거) ──
    const hist = (r.history && r.history.length >= 2)
      ? r.history
      : (((this._S()._safeGet('cbt_assess_history', []) || []).length >= 2) ? this._S()._safeGet('cbt_assess_history', []) : null);
    const dlab = h => new Date(h.ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
    const retest = hist ? sec('Ⅰ-1', '표준검사 재측정 추이', '같은 도구를 반복 측정한 기록 — 변화를 보는 가장 신뢰할 만한 근거',
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.7rem;">
        ${card(K.retest(hist.map(h => ({ v: h.phq, label: dlab(h) })), { name: 'PHQ-9', max: 27, cuts: [{ to: 4 }, { to: 9 }, { to: 14 }, { to: 19 }, { to: 27 }] }))}
        ${card(K.retest(hist.map(h => ({ v: h.gad, label: dlab(h) })), { name: 'GAD-7', max: 21, cuts: [{ to: 4 }, { to: 9 }, { to: 14 }, { to: 21 }] }))}
      </div>`, K.C.ok) : '';

    // ── Ⅱ 실제 기분 추이 (사실 데이터) ──
    const trend = f.series && f.series.length >= 2 ? sec('Ⅱ', '기분 추이 (최근 3주)', '앱 자체 5점 체크인 — 검증된 척도가 아닌 원자료 · 표준검사(2주 단면)와 시간 단위가 다름',
      card(K.line(f.series))) : '';

    // ── Ⅲ 요일·시간대 패턴 (사실 데이터) ──
    const heat = f.moodCount >= 6 ? sec('Ⅲ', '언제 무너지는가 — 요일·시간대 지도', '같은 하루 안에서도 취약한 시간대가 있어요',
      card(K.heatmap(f.matrix)) + (j.timePattern ? `<p style="margin:0.7rem 0 0;font-size:0.84rem;line-height:1.75;">${K.md(j.timePattern)}</p>` : ''), K.C.blue) : '';

    // ── Ⅳ 탐색 지표 (막대) ──
    const signals = Array.isArray(j.signals) && j.signals.length ? sec('Ⅳ', '탐색 지표', '검증된 심리검사가 아님 · 3단계 경향으로만 읽어주세요',
      card(j.signals.map(x => K.band(x)).join('')), K.C.warn) : '';

    // ── Ⅴ 욕구 레이더 + 웰빙 레이더 (2열) ──
    const hasNeeds = Array.isArray(j.needs) && j.needs.length;
    const hasWell = Array.isArray(j.wellbeing) && j.wellbeing.length;
    const profile = (hasNeeds || hasWell) ? sec('Ⅴ', '심리적 프로파일', '탐색 지표 · 축의 모양으로 읽어주세요',
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.8rem;">
        ${hasNeeds ? `<div>${card(`<p style="margin:0 0 0.2rem;font-size:0.76rem;font-weight:800;text-align:center;">욕구·동기</p>${K.radar(j.needs, { color: K.C.violet })}<div style="margin-top:0.6rem;">${j.needs.map(x => K.band(x)).join('')}</div>`)}</div>` : ''}
        ${hasWell ? `<div>${card(`<p style="margin:0 0 0.2rem;font-size:0.76rem;font-weight:800;text-align:center;">적응 자원</p>${K.radar(j.wellbeing, { color: K.C.ok })}<div style="margin-top:0.6rem;">${j.wellbeing.map(x => K.band({ ...x, good: true })).join('')}</div>`)}</div>` : ''}
      </div>
      ${j.profileRead ? `<p style="margin:0.75rem 0 0;font-size:0.84rem;line-height:1.75;">${K.md(j.profileRead)}</p>` : ''}
      <p style="margin:0.5rem 0 0;font-size:0.68rem;opacity:0.62;line-height:1.6;">※ 이 축들은 <b>표준화된 심리검사가 아닙니다</b>. 규준(비교 집단) 자료가 없어 절대적 위치를 뜻하지 않으며, 같은 기록으로 다시 생성하면 결과가 달라질 수 있습니다.</p>`, K.C.violet) : '';

    // ── Ⅵ 인지왜곡 도넛 (사실 데이터) ──
    const dist = f.distortions && f.distortions.length ? sec('Ⅵ', '생각의 함정 분포', `사고기록 ${f.recordCount}편에서 실제 집계`,
      card(K.donut(f.distortions, f.distortions[0] ? f.distortions[0].name.slice(0, 4) : ''))
      + (j.distortionRead ? `<p style="margin:0.7rem 0 0;font-size:0.84rem;line-height:1.75;">${K.md(j.distortionRead)}</p>` : ''), K.C.bad) : '';

    // ── Ⅶ 사례개념화 흐름도 ──
    const fm = j.formulation;
    const form = fm ? sec('Ⅶ', '사례 개념화 (가설)', '반복되는 고리를 하나의 문장으로 — 검증 대상인 가설입니다',
      card(K.flow([
        { k: '핵심 신념', v: fm.belief || '' },
        { k: '그래서 두려운 것', v: fm.fear || '' },
        { k: '그래서 하는 행동', v: fm.behavior || '' },
        { k: '그 결과', v: fm.result || '' }
      ]), '1rem'), K.C.violet) : '';

    // ── Ⅷ 근거 추적표 ──
    const ev = Array.isArray(j.evidence) && j.evidence.length ? sec('Ⅷ', '근거 추적', '각 판단이 어떤 기록에서 나왔는지 · ●는 근거 강도',
      j.evidence.map(e => `
        <div style="border-left:3px solid ${K.C.grid};padding:0 0 0 0.75rem;margin-bottom:0.8rem;">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.5rem;">
            <p style="margin:0;font-size:0.84rem;font-weight:700;line-height:1.6;">${K.md(e.claim || '')}</p>
            <span style="flex-shrink:0;">${K.strength(e.strength)}</span>
          </div>
          ${(e.quotes || []).map(q => `<p style="margin:0.3rem 0 0;font-size:0.76rem;opacity:0.75;line-height:1.6;font-style:italic;">"${K.esc(q)}"</p>`).join('')}
        </div>`).join('')) : '';

    // ── Ⅸ 요약 및 제언: 필요한 것 + 4주 타임라인 ──
    const needList = Array.isArray(j.whatYouNeed) && j.whatYouNeed.length ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.5rem;margin-bottom:0.9rem;">
        ${j.whatYouNeed.map((t, i) => `<div style="border:1px solid ${K.C.grid};border-radius:12px;padding:0.65rem 0.75rem;">
          <span style="font-size:0.62rem;font-weight:800;opacity:0.5;">NEED ${i + 1}</span>
          <p style="margin:0.15rem 0 0;font-size:0.82rem;line-height:1.6;">${K.md(t)}</p>
        </div>`).join('')}
      </div>` : '';
    const rx = Array.isArray(j.happinessRx) && j.happinessRx.length ? `
      <div style="position:relative;padding-left:0.2rem;">
        ${j.happinessRx.map((x, i) => `
          <div style="display:flex;gap:0.7rem;">
            <div style="flex-shrink:0;width:44px;text-align:center;">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:color-mix(in srgb, ${K.C.ok} ${18 + i * 14}%, transparent);font-size:0.68rem;font-weight:800;">${K.esc(x.week)}</span>
              ${i < j.happinessRx.length - 1 ? `<div style="width:2px;height:22px;background:${K.C.grid};margin:2px auto;"></div>` : ''}
            </div>
            <div style="flex:1 1 0%;min-width:0;padding-top:0.35rem;padding-bottom:0.5rem;">
              <p style="margin:0;font-size:0.85rem;font-weight:700;line-height:1.6;">${K.md(x.do || '')}</p>
              ${x.why ? `<p style="margin:0.15rem 0 0;font-size:0.72rem;opacity:0.66;line-height:1.55;">${K.md(x.why)}</p>` : ''}
            </div>
          </div>`).join('')}
      </div>` : '';
    // 2주 케어플랜 — 이 리포트가 곧바로 실행으로 이어지는 부분
    const cp = j.carePlan && Array.isArray(j.carePlan.weeks) && j.carePlan.weeks.length ? j.carePlan : null;
    const TECH = (window.CarePlan && window.CarePlan.TECHNIQUES) || {};
    const rxPlan = cp ? `
      <div style="border-radius:14px;padding:0.9rem 1rem;margin-bottom:0.9rem;background:color-mix(in srgb, ${K.C.ok} 9%, transparent);border:1px solid color-mix(in srgb, ${K.C.ok} 28%, transparent);">
        <span style="font-size:0.62rem;font-weight:800;opacity:0.55;">앞으로 2주, 이것 하나</span>
        <p style="margin:0.2rem 0 0.3rem;font-size:0.94rem;font-weight:800;line-height:1.6;">${K.md(cp.focus || '')}</p>
        ${cp.why ? `<p style="margin:0;font-size:0.8rem;line-height:1.7;opacity:0.8;">${K.md(cp.why)}</p>` : ''}
      </div>
      ${cp.weeks.map((w, i) => `
        <div style="border:1px solid ${K.C.grid};border-radius:14px;padding:0.85rem 0.95rem;margin-bottom:0.6rem;">
          <div style="display:flex;align-items:center;gap:0.45rem;margin-bottom:0.35rem;flex-wrap:wrap;">
            <span style="flex-shrink:0;font-size:0.64rem;font-weight:800;color:#fff;background:${K.C.ok};padding:0.15rem 0.5rem;border-radius:999px;">${i + 1}주차</span>
            ${w.technique ? `<span style="flex-shrink:0;font-size:0.64rem;font-weight:800;color:${K.C.ok};border:1px solid color-mix(in srgb, ${K.C.ok} 45%, transparent);padding:0.13rem 0.5rem;border-radius:999px;">${K.esc(w.technique)}</span>` : ''}
          </div>
          <p style="margin:0 0 0.2rem;font-size:0.86rem;font-weight:700;line-height:1.6;">${K.md(w.goal || '')}</p>
          ${TECH[w.technique] ? `<p style="margin:0 0 0.45rem;font-size:0.72rem;line-height:1.55;opacity:0.62;">${K.esc(TECH[w.technique])}</p>` : ''}
          <ul style="margin:0;padding-left:1.05rem;font-size:0.81rem;line-height:1.75;">
            ${(w.actions || []).map(a => `<li>${K.md(a)}</li>`).join('')}
          </ul>
          ${w.measure ? `<p style="margin:0.45rem 0 0;padding-top:0.4rem;border-top:1px dashed ${K.C.grid};font-size:0.72rem;opacity:0.66;line-height:1.55;">확인 방법 · ${K.esc(w.measure)}</p>` : ''}
        </div>`).join('')}
      ${Array.isArray(cp.ifThen) && cp.ifThen.length ? `
        <div style="border:1px dashed ${K.C.grid};border-radius:14px;padding:0.8rem 0.95rem;margin-bottom:0.6rem;">
          <span style="font-size:0.62rem;font-weight:800;opacity:0.55;">못 하는 날을 위해 미리 정해두기</span>
          ${cp.ifThen.map(x => `<p style="margin:0.3rem 0 0;font-size:0.8rem;line-height:1.7;"><b>${K.esc(x.if)}</b> 하면 → ${K.esc(x.then)}</p>`).join('')}
        </div>` : ''}
      ${cp.redFlag ? `<p style="margin:0;font-size:0.76rem;line-height:1.6;color:${K.C.bad};">멈추고 전문가를 만나야 할 신호 · ${K.esc(cp.redFlag)}</p>` : ''}
    ` : '';

    const plan = (needList || rx || rxPlan)
      ? sec('Ⅸ', '요약 및 제언', cp ? '읽고 끝내지 않도록 — 앞으로 2주 처방' : '오늘부터 4주, 실행 가능한 것만',
            needList + rxPlan + rx, K.C.ok)
      : '';

    // ── Ⅹ 강점 / 연계 / 한계 ──
    const strengths = j.strengths ? sec('Ⅹ', '강점 및 보호요인', '',
      `<div style="border-radius:14px;padding:0.9rem 1rem;background:color-mix(in srgb, ${K.C.ok} 10%, transparent);border:1px solid color-mix(in srgb, ${K.C.ok} 30%, transparent);">
        <p style="margin:0;font-size:0.86rem;line-height:1.8;">${K.md(j.strengths)}</p>
      </div>`, K.C.ok) : '';

    // 지난 리포트 이후 무엇이 달라졌는지 — 상담사에게 갈 문서에도 남는다.
    //  대시보드의 '나의 변화'는 매일 보는 살아있는 화면이고, 이건 그 시점의 스냅샷이다.
    const chg = (window.Progress && window.Progress.reportBlock) ? window.Progress.reportBlock(K) : '';
    const change = chg ? sec('Ⅰ', '지난 리포트 이후의 변화', '같은 도구로 다시 재서 비교', chg, K.C.ok) : '';

    const overall = j.overall ? sec('0', '전반적 인상', '임상적 인상 · 진단 아님',
      `<p style="margin:0;font-size:0.9rem;line-height:1.85;">${K.md(j.overall)}</p>`) : '';

    const tail = `
      ${j.referral ? `<div style="margin-top:1.3rem;border-radius:14px;padding:0.9rem 1rem;background:color-mix(in srgb, ${K.C.bad} 9%, transparent);border:1px solid color-mix(in srgb, ${K.C.bad} 28%, transparent);">
        <p style="margin:0 0 0.2rem;font-size:0.72rem;font-weight:800;color:${K.C.bad};">전문가 연계 권고</p>
        <p style="margin:0;font-size:0.84rem;line-height:1.75;">${K.md(j.referral)}</p>
      </div>` : ''}
      <div style="margin:1.3rem 0 0;border-top:2px solid ${K.C.grid};padding-top:0.9rem;">
        <p style="margin:0 0 0.5rem;font-size:0.74rem;font-weight:800;">한계 및 고지</p>
        <div style="font-size:0.69rem;opacity:0.75;line-height:1.75;">
          <p style="margin:0 0 0.45rem;">${K.md(j.limits || '')}</p>
          <p style="margin:0 0 0.45rem;"><b>① 사용 도구</b> · PHQ-9(Kroenke, Spitzer &amp; Williams, 2001), GAD-7(Spitzer 외, 2006). 공개 도구이며 원문항·원절단점을 그대로 사용했습니다. 두 도구 모두 <b>선별(screening)</b> 도구로, 점수가 높다고 진단이 되지는 않습니다.</p>
          <p style="margin:0 0 0.45rem;"><b>② 비표준 지표</b> · 욕구·적응 자원·탐색 지표는 표준화된 심리검사가 아니며 <b>규준(비교 집단) 자료가 없습니다</b>. 절대적 수준이 아니라 상대적 경향으로만 읽어야 합니다.</p>
          <p style="margin:0 0 0.45rem;"><b>③ 재현성</b> · 해석은 생성형 AI가 작성하므로 <b>같은 기록으로 다시 만들면 표현과 강조점이 달라질 수 있습니다</b>. 재현 가능한 수치는 표준검사 점수뿐입니다.</p>
          <p style="margin:0 0 0.45rem;"><b>④ 선택 편향</b> · 앱 기록은 <b>힘들 때 더 많이 남는 경향</b>이 있어 부정 정서가 과대 표집될 수 있습니다. 기분 추이는 앱 자체 5점 척도로 검증된 도구가 아닙니다.</p>
          <p style="margin:0 0 0.45rem;"><b>⑤ 시간 단위</b> · 표준검사는 특정 2주의 <b>단면</b>, 추이 차트는 3주 <b>종단</b>입니다. 나란히 볼 때 해석에 주의가 필요합니다.</p>
          <p style="margin:0 0 0.45rem;"><b>⑥ 자동 분류·가중치</b> · 인지왜곡 태그는 대화에서 AI가 부여한 것으로 <b>분류 정확도가 검증되지 않았습니다</b>. 데이터 충분도 가중치(대화 30 · 기간 25 · 감정 15 · 기록 15 · 검진 15)는 실무적 판단에 따른 값입니다.</p>
          <p style="margin:0;">본 문서는 심리평가 보고서의 구조를 참고한 <b>참고용 자료</b>이며 의학적 진단·처방을 대신하지 않습니다. 위기 시 자살예방상담 <b>109</b>, 정신건강상담 <b>1577-0199</b>.</p>
        </div>
      </div>`;

    return cover + overall + std + retest + trend + heat + signals + profile + dist + form + ev + plan + strengths + tail;
  },

  render() {
    const el = document.getElementById('assess-body');
    if (!el) return;
    const m = this.metrics();
    const relTxt = { high: ['높음', 'var(--accent-primary)'], mid: ['보통', '#c9a227'], low: ['낮음 — 이 데이터는 믿을만하지 못합니다', '#c96a5a'] }[m.reliability];

    const bar = b => `
      <div style="margin-bottom: 0.55rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem;">
          <span style="font-weight: 700; color: var(--text-primary);">${b.name}</span>
          <span style="color: var(--text-muted);">${b.hint}</span>
        </div>
        <div style="height: 8px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;">
          <div style="height: 100%; width: ${b.pct}%; border-radius: 999px; background: ${b.pct >= 100 ? 'var(--accent-primary)' : b.pct >= 50 ? 'color-mix(in srgb, var(--accent-primary) 70%, #c9a227)' : '#c9a227'};"></div>
        </div>
      </div>`;

    const reps = this.reports();
    const canGen = m.total >= this.MIN_TOTAL;
    el.innerHTML = `
      <div class="glass-card" style="padding: 0.95rem; border: 1.5px solid color-mix(in srgb, #c96a5a 25%, transparent); margin-bottom: 0.8rem;">
        <p style="margin: 0; font-size: 0.76rem; color: var(--text-secondary); line-height: 1.6;">
 <b>이것은 진단이 아니라 참고용 리포트예요.</b> 우울·불안은 표준 선별검사(PHQ-9·GAD-7) 점수를 쓰고,
          나머지는 기록 기반의 탐색 지표입니다. 마음이 걱정되면 전문가를 만나보세요. 위기 순간엔 <b>109</b>, <b>1577-0199</b>.
        </p>
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.65rem;">
 <strong style="font-size: 0.9rem; color: var(--text-primary);"> 데이터 충분도</strong>
          <span style="font-size: 1.05rem; font-weight: 800; color: ${canGen ? 'var(--accent-primary)' : '#c96a5a'};">${m.total}%</span>
        </div>
        <div style="height: 12px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; margin-bottom: 0.8rem; position: relative;">
          <div style="height: 100%; width: ${m.total}%; border-radius: 999px; background: linear-gradient(90deg, #c9a227, var(--accent-primary));"></div>
          <div style="position: absolute; top: -2px; bottom: -2px; left: ${this.MIN_TOTAL}%; width: 2px; background: #c96a5a; opacity: 0.7;" title="최소 기준 ${this.MIN_TOTAL}%"></div>
        </div>
        ${m.bars.map(bar).join('')}
        <p style="margin: 0.5rem 0 0; font-size: 0.7rem; color: var(--text-muted);">
          ${canGen ? '충분한 데이터예요. 정밀 분석이 가능합니다.'
                   : `아직 ${m.total}%예요. 리포트는 <b>${this.MIN_TOTAL}% 이상</b>일 때만 만들어요 — 얕은 데이터로 만든 리포트는 당신을 오해하게 하니까요.<br>표준 자가검진(필수)을 하고, 우렁이와 대화하고, 매일 체크인·기록을 쌓으면 채워집니다.`}
        </p>
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
 <strong style="font-size: 0.86rem; color: var(--text-primary);"> 데이터 신뢰도: <span style="color: ${relTxt[1]};">${relTxt[0]}</span></strong>
        ${m.flags.length ? `<ul style="margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.74rem; color: var(--text-muted); line-height: 1.6;">${m.flags.map(f => `<li>${f}</li>`).join('')}</ul>` : `<p style="margin: 0.4rem 0 0; font-size: 0.74rem; color: var(--text-muted);">입력 패턴이 자연스러워요.</p>`}
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
          <div>
 <strong style="font-size: 0.86rem; color: var(--text-primary);"> 표준 자가검진 <span style="font-size: 0.66rem; font-weight: 800; color: #c96a5a;">필수</span></strong>
            <p style="margin: 0.2rem 0 0; font-size: 0.72rem; color: var(--text-muted);">${(() => { const st = this.qaStatus();
              return st.state === 'valid' ? `완료 · ${st.left}일 뒤 만료돼요`
                : st.state === 'expired' ? `${st.days}일 전에 했어요 — 최근 2주 상태를 묻는 검사라 다시 해야 해요`
                : st.state === 'partial' ? '아직 안 끝났어요 — 이어서 답해주세요'
                : 'PHQ-9(우울)·GAD-7(불안) 표준 검사. 한 문항씩 천천히 답하면 돼요.'; })()}</p>
          </div>
          <button class="btn-primary" style="width: auto; font-size: 0.78rem; padding: 0.45rem 0.85rem; flex-shrink: 0;" onclick="window.Assess.openQuiz()">${this.qaFresh().ok ? '다시 하기' : '검진하기 ›'}</button>
        </div>
        ${(() => {
          const sc = this.scores();
          if (!sc || sc.phq == null) return '';
          return `
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.6rem;">
            <span style="font-size: 0.72rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary);">PHQ-9 <b style="color: ${sc.phq >= 10 ? '#c96a5a' : sc.phq >= 5 ? '#c9a227' : 'var(--accent-primary)'};">${sc.phq}/27</b> · ${sc.phqBand}</span>
            <span style="font-size: 0.72rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary);">GAD-7 <b style="color: ${sc.gad >= 10 ? '#c96a5a' : sc.gad >= 5 ? '#c9a227' : 'var(--accent-primary)'};">${sc.gad}/21</b> · ${sc.gadBand}</span>
          </div>
          <p style="margin: 0.4rem 0 0; font-size: 0.66rem; color: var(--text-muted);">선별검사 점수 · 진단이 아니에요. 10점 이상이면 전문가와 상담을 권해요.</p>`;
        })()}
        <div id="assess-quiz"></div>
      </div>
      <div id="assess-risk"></div>

      <!-- 추천 카드 — 검진의 종착지가 이 리포트라서, 버튼 하나로 두면 지나친다.
           금테 두른 카드로 '여기가 하이라이트'임을 한눈에 보이게 한다. -->
      <div style="position: relative; margin-top: 1rem; border-radius: 16px; padding: 1rem 1rem 0.9rem;
        background: linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 16%, var(--bg-secondary)), var(--bg-secondary) 72%);
        border: 1.5px solid color-mix(in srgb, var(--accent-primary) 45%, transparent);
        box-shadow: 0 4px 18px color-mix(in srgb, var(--accent-primary) 16%, transparent);">
        <span style="position: absolute; top: -10px; right: 14px; background: linear-gradient(90deg, #e8b93c, #d98f2b);
          color: #fff; font-size: 0.68rem; font-weight: 900; padding: 0.24rem 0.7rem; border-radius: 999px;
          letter-spacing: 0.05em; box-shadow: 0 2px 8px rgba(217,143,43,0.45);">★ 추천</span>
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="line-height: 0; flex-shrink: 0;">${window.Stickers ? window.Stickers.svg('joy', 40) : '✨'}</span>
          <div>
            <strong style="display: block; font-size: 1.02rem; color: var(--text-primary);">AI 마음 리포트</strong>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">검진 점수 + 대화 흐름 종합 분석</span>
          </div>
        </div>
        <p style="margin: 0.6rem 0 0.75rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.6;">
          점수만으로는 보이지 않는 것까지 — 우렁이가 최근 대화의 결을 함께 읽고
          <b style="color: var(--text-primary);">지금 마음 상태와 다음 한 걸음</b>을 정리해드려요.
          상담사에게 그대로 보낼 수도 있어요.</p>
        <button class="btn-primary" style="width: 100%; padding: 0.8rem; font-size: 0.92rem; ${canGen ? '' : 'opacity: 0.45;'}" onclick="window.Assess.generate()">
 지금 만들어보기 — ${this.PRICE.toLocaleString()}캐시
        </button>
        <p style="margin: 0.45rem 0 0; font-size: 0.68rem; color: var(--text-muted); text-align: center;">유료 · 생성 실패 시 전액 환불 · 참고용(진단 아님)</p>
      </div>

      <div id="assess-result" style="margin-top: 0.9rem;"></div>

      ${reps.length ? `<p style="margin: 1.1rem 0 0.5rem; font-size: 0.78rem; font-weight: 800; color: var(--text-muted);">지난 리포트 — 누르면 펼쳐져요</p>` : ''}
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${reps.map(r => `
          <div style="background: var(--bg-tertiary); border-radius: 12px; border-left: 4px solid #c96a5a; overflow: hidden;">
            <button onclick="document.getElementById('as-${r.id}').classList.toggle('hidden')" style="all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.7rem 0.85rem; cursor: pointer;">
              <span style="flex: 1 1 0%; width: 0; min-width: 0;">
                <span style="display: block; font-size: 0.68rem; color: var(--text-muted);">${r.date}</span>
                <strong style="font-size: 0.84rem; color: var(--text-primary);">AI 마음 리포트 ${r.json && r.json.headline ? '— ' + String(r.json.headline).slice(0, 18) + '…' : '(참고용)'}</strong>
              </span><span style="color: var(--text-muted); font-weight: 800;">›</span>
            </button>
            <div id="as-${r.id}" class="hidden" style="padding: 0 0.85rem 0.85rem;">
              ${this._reportHtml(r)}
              <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.8rem;">
 <button class="btn-primary"style="width: auto; font-size: 0.74rem; padding: 0.35rem 0.7rem; background: var(--success-color, #10b981); border: none;"onclick="window.Assess.sendToCounselor('${r.id}')"> 상담사에게 보내기</button>
 <button class="btn-secondary"style="width: auto; font-size: 0.74rem; padding: 0.35rem 0.7rem;"onclick="window.Assess.download('${r.id}')"> 저장</button>
 <button class="btn-secondary"style="width: auto; font-size: 0.74rem; padding: 0.35rem 0.7rem;"onclick="window.Assess.printPdf('${r.id}')"> 인쇄·PDF</button>
 <button class="btn-secondary"style="width: auto; font-size: 0.74rem; padding: 0.35rem 0.7rem; color: #c96a5a;"onclick="window.Assess.deleteReport('${r.id}')"> 삭제</button>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
  },

  // --------------------------------------------------------------------------
  //  자가검진 위저드 — 한 화면에 한 문항. 큰 글씨·세로 선택지·자동 진행.
  //  (읽기 부담을 줄이기 위해 문항을 절대 여러 개 동시에 보여주지 않는다)
  // --------------------------------------------------------------------------
  _qi: 0,
  _qmap: {},

  _flat() {
    return this.SECTIONS.flatMap(sec => sec.items.map(it => ({ ...it, sec })));
  },

  openQuiz() {
    const prev = (this.answers() || {}).map || {};
    this._qmap = { ...prev };
    const flat = this._flat();
    const firstUnanswered = flat.findIndex(q => this._qmap[q.id] == null);
    this._qi = firstUnanswered < 0 ? 0 : firstUnanswered;
    this._renderQ();
  },

  _renderQ() {
    const el = document.getElementById('assess-quiz');
    if (!el) return;
    const flat = this._flat();
    const total = flat.length;

    if (this._qi >= total) { this._renderQDone(); return; }

    const q = flat[this._qi];
    const cur = this._qmap[q.id];
    const pct = Math.round(this._qi / total * 100);

    el.innerHTML = `
      <div style="margin-top: 0.9rem; padding-top: 0.85rem; border-top: 1px dashed var(--glass-border);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.35rem;">
          <span style="font-size: 0.7rem; font-weight: 800; color: ${q.sec.standard ? 'var(--accent-primary)' : 'var(--text-muted)'};">${q.sec.name}</span>
          <span style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted);">${this._qi + 1} / ${total}</span>
        </div>
        <div style="height: 6px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; margin-bottom: 0.9rem;">
          <div style="height: 100%; width: ${pct}%; border-radius: 999px; background: var(--accent-primary); transition: width 0.25s;"></div>
        </div>

        <p style="margin: 0 0 0.35rem; font-size: 0.72rem; color: var(--text-muted);">지난 2주 동안, 얼마나 자주 그랬나요?</p>
        <p style="margin: 0 0 1rem; font-size: 1.08rem; font-weight: 700; color: var(--text-primary); line-height: 1.75; letter-spacing: 0.01em; word-break: keep-all;">${q.t}</p>

        <div style="display: flex; flex-direction: column; gap: 0.45rem;">
          ${this.SCALE.map((label, v) => `
            <button onclick="window.Assess._answer(${v})"
              style="all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 0.7rem; padding: 0.85rem 0.95rem; border-radius: 14px; font-size: 0.98rem; font-weight: 700; line-height: 1.5;
                     border: 2px solid ${cur === v ? 'var(--accent-primary)' : 'var(--glass-border)'};
                     background: ${cur === v ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)'};
                     color: ${cur === v ? 'var(--accent-primary)' : 'var(--text-primary)'};">
              <span style="flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 800;
                           background: ${cur === v ? 'var(--accent-primary)' : 'var(--bg-secondary)'}; color: ${cur === v ? '#fff' : 'var(--text-muted)'};">${v}</span>
              ${label}
            </button>`).join('')}
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.9rem;">
          <button onclick="window.Assess._prevQ()" ${this._qi === 0 ? 'disabled' : ''}
            style="all: unset; box-sizing: border-box; cursor: ${this._qi === 0 ? 'default' : 'pointer'}; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); padding: 0.5rem 0.8rem; border-radius: 10px; border: 1px solid var(--glass-border); opacity: ${this._qi === 0 ? '0.35' : '1'};">‹ 이전</button>
          <span style="flex: 1;"></span>
          <button onclick="window.Assess._closeQuiz()" style="all: unset; cursor: pointer; font-size: 0.76rem; color: var(--text-muted); padding: 0.5rem 0.6rem;">나중에</button>
        </div>
      </div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _answer(v) {
    const flat = this._flat();
    const q = flat[this._qi];
    if (!q) return;
    this._qmap[q.id] = v;
    if (window.Sfx) window.Sfx.play('nav');
    // 고르면 잠깐 보여준 뒤 자동으로 다음 문항 (되돌아갈 수 있게 이전 버튼 유지)
    this._renderQ();
    setTimeout(() => { this._qi += 1; this._renderQ(); }, 260);
  },

  _prevQ() {
    if (this._qi > 0) { this._qi -= 1; this._renderQ(); }
  },

  _closeQuiz() {
    // 여기까지 답한 것은 저장해둔다 (이어서 하기 가능)
    const prev = (this.answers() || {}).map || {};
    this._S()._safeSet('cbt_assess_answers', { ts: Date.now(), map: { ...prev, ...this._qmap } });
    const el = document.getElementById('assess-quiz');
    if (el) el.innerHTML = '';
    this.render();
  },

  _renderQDone() {
    const el = document.getElementById('assess-quiz');
    if (!el) return;
    el.innerHTML = `
      <div style="margin-top: 0.9rem; padding: 1rem; border-radius: 14px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); text-align: center;">
 <p style="margin: 0 0 0.2rem; font-size: 1rem; font-weight: 800; color: var(--text-primary);">다 답하셨어요 </p>
        <p style="margin: 0 0 0.9rem; font-size: 0.78rem; color: var(--text-muted); line-height: 1.6;">천천히 끝까지 해주셔서 고마워요. 저장하면 점수가 계산돼요.</p>
        <button class="btn-primary" style="width: 100%;" onclick="window.Assess.saveQuiz()">결과 저장하기</button>
        <button onclick="window.Assess._prevQ()" style="all: unset; display: block; width: 100%; text-align: center; cursor: pointer; font-size: 0.76rem; color: var(--text-muted); padding: 0.6rem 0;">‹ 마지막 문항 다시 보기</button>
      </div>`;
  },

  // 2주 케어플랜이 끝나면 같은 도구로 다시 잰다.
  //  같은 척도로 재야 비교가 되므로 새 문항을 만들지 않는다 — 그게 변화 측정의 전부다.
  async startRetest() {
    const prev = this._S()._safeGet('cbt_assess_history', []) || [];
    const msg = prev.length
      ? '같은 검진(PHQ-9·GAD-7)을 다시 받습니다.\n\n2주 전과 같은 문항이라야 무엇이 달라졌는지 비교할 수 있어요. 5분이면 끝나요.'
      : '표준 검진(PHQ-9·GAD-7)을 시작합니다. 5분이면 끝나요.';
    if (!await window.UI.confirm(msg)) return;
    if (window.App) window.App.switchTab('dashboard');
    this.open();
    this.openQuiz();
  },

  saveQuiz() {
    const map = { ...this._qmap };
    const missing = this._flat().filter(q => map[q.id] == null);
    if (missing.length > 0) {
      window.UI.alert(`${missing.length}개 문항이 남았어요. 이어서 답해주세요.`);
      this._qi = this._flat().findIndex(q => map[q.id] == null);
      this._renderQ();
      return;
    }
    this._S()._safeSet('cbt_assess_answers', { ts: Date.now(), map });
    // 재측정 추이를 위해 점수 이력을 남긴다 (개입 효과 추적)
    try {
      const sc0 = this.scores();
      if (sc0 && sc0.phq != null) {
        const hist = this._S()._safeGet('cbt_assess_history', []) || [];
        hist.push({ ts: Date.now(), phq: sc0.phq, gad: sc0.gad, item9: sc0.item9 });
        this._S()._safeSet('cbt_assess_history', hist.slice(-24));
      }
    } catch (e) {}
    if (window.App) window.App.showRecordToast('자가검진 저장 완료');
    // 변화 화면이 이 결과를 바로 반영하도록
    if (window.Progress) window.Progress.render();
    if (window.Sfx) window.Sfx.play('ripe');
    this._riskProtocol();
    const el = document.getElementById('assess-quiz');
    if (el) el.innerHTML = '';
    this.render();
  },

  // 위험도 단계별 대응 — 경고 → 안전계획 → 전문가 연계
  _riskProtocol() {
    const sc = this.scores();
    if (!sc) return;
    const item9 = sc.item9 || 0;
    const phq = sc.phq || 0;
    // 3단계: 자해문항 2~3 = 높음 / 자해문항 1 또는 PHQ 20+ = 중간 / PHQ 15~19 = 주의
    const level = item9 >= 2 ? 3 : (item9 === 1 || phq >= 20) ? 2 : phq >= 15 ? 1 : 0;
    if (!level) return;

    const box = document.getElementById('assess-risk');
    const COPY = {
      3: { t: '지금 바로 도움을 받으셨으면 해요', d: '자해에 대한 생각이 자주 있다고 응답하셨어요. 이건 혼자 견딜 일이 아니에요.', cta: '지금 전화 연결' },
      2: { t: '전문가와 이야기해볼 시점이에요', d: '지금 상태는 스스로 버티기에 무거운 수준이에요. 도움을 받는 게 빠른 길입니다.', cta: '상담 전화 연결' },
      1: { t: '혼자 두지 마세요', d: '우울 점수가 높은 편이에요. 안전 계획을 미리 만들어두면 힘든 순간에 나를 지켜줍니다.', cta: '상담 전화 연결' }
    }[level];
    const color = level === 3 ? '#c96a5a' : level === 2 ? '#c9a227' : '#6f97ab';
    if (box) {
      box.innerHTML = `
        <div class="glass-card" style="padding: 1rem; border: 2px solid ${color}; background: color-mix(in srgb, ${color} 10%, transparent); margin-bottom: 0.8rem;">
 <p style="margin: 0 0 0.3rem; font-size: 0.92rem; font-weight: 800; color: ${color};">${COPY.t}</p>
          <p style="margin: 0 0 0.7rem; font-size: 0.8rem; line-height: 1.7; color: var(--text-secondary);">${COPY.d}</p>
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
 <a href="tel:109"style="all: unset; cursor: pointer; font-size: 0.78rem; font-weight: 800; color: #fff; background: ${color}; padding: 0.45rem 0.85rem; border-radius: 999px;">${COPY.cta} (109)</a>
 <button onclick="window.Safety && window.Safety.open()"style="all: unset; cursor: pointer; font-size: 0.78rem; font-weight: 800; color: ${color}; border: 1px solid ${color}; padding: 0.45rem 0.85rem; border-radius: 999px;"> 안전 계획 만들기</button>
            <button onclick="window.App.switchTab('counselors')" style="all: unset; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); border: 1px solid var(--glass-border); padding: 0.45rem 0.85rem; border-radius: 999px;">전문 상담사 찾기</button>
          </div>
        </div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (level >= 2) {
      window.UI.alert(`${COPY.t}\n\n${COPY.d}\n\n자살예방상담 109 (24시간)\n정신건강상담 1577-0199`);
    }
  },

  // 상담사에게 전송 / 삭제
  async sendToCounselor(id) {
    const r = this.report(id);
    if (!r) return;
    const j = r.json || {};
    if (!await window.UI.confirm('이 리포트를 상담사에게 보낼까요?\n\n주의: 리포트에는 마음 상태·검사 점수 같은 민감한 정보가 담겨 있어요.\n보내면 상담사가 내용을 볼 수 있습니다.')) return;
    const lines = [
      '[우렁의사 AI 마음 리포트 · 참고용 — 진단 아님]',
      r.date,
      j.headline ? '— ' + String(j.headline).replace(/\*\*/g, '') : '',
      (j.standard || []).map(x => `${x.name}: ${x.score}/${x.max} (${x.band})`).join(' · '),
      j.overall ? '\n[전반] ' + String(j.overall).replace(/\*\*/g, '') : '',
      j.referral ? '\n[연계] ' + String(j.referral).replace(/\*\*/g, '') : ''
    ].filter(Boolean).join('\n');
    if (window.App && window.App.sendReportToCounselor) {
      window.App.sendReportToCounselor({ date: r.date, title: 'AI 마음 리포트', body: lines });
    } else if (navigator.share) {
      navigator.share({ title: 'AI 마음 리포트', text: lines }).catch(() => {});
    } else {
      try { navigator.clipboard.writeText(lines); } catch (e) {}
      window.UI.alert('리포트 요약을 복사했어요. 상담사에게 붙여넣어 전달하세요.');
      return;
    }
    if (window.App) window.App.showRecordToast('상담사에게 리포트를 보냈어요');
  },

  async deleteReport(id) {
    const r = this.report(id);
    if (!r) return;
    if (!await window.UI.confirm('이 리포트를 삭제할까요?\n되돌릴 수 없어요. (사용한 캐시는 환불되지 않습니다)')) return;
    this._S()._safeSet('cbt_assessments', this.reports().filter(x => x.id !== id));
    if (window.App) window.App.showRecordToast('리포트를 삭제했어요');
    this.render();
  },

  // --------------------------------------------------------------------------
  //  파일 저장 / 인쇄(PDF)
  // --------------------------------------------------------------------------
  _docHtml(r) {
    // 파일·인쇄용 독립 문서 (밝은 배경, 앱 CSS 변수 인라인 치환)
    const inner = this._reportHtml(r)
      .replace(/color-mix\(in srgb, #4f8a6b (\d+)%, transparent\)/g, '#e8f1eb')
      .replace(/color-mix\(in srgb, #c96a5a (\d+)%, transparent\)/g, '#faeeec')
      .replace(/var\(--text-primary\)/g, '#2b2620')
      .replace(/var\(--text-secondary\)/g, '#4a443c')
      .replace(/var\(--text-muted\)/g, '#8a8073')
      .replace(/var\(--accent-primary\)/g, '#4f8a6b')
      .replace(/var\(--accent-secondary\)/g, '#c57c54')
      .replace(/var\(--bg-tertiary\)/g, '#f1ece3')
      .replace(/color-mix\(in srgb, #c96a5a 9%, transparent\)/g, '#faeeec')
      .replace(/color-mix\(in srgb, #c96a5a 25%, transparent\)/g, '#e8c5bf')
      .replace(/color-mix\(in srgb, #4f8a6b 12%, transparent\)/g, '#e4efe8')
      .replace(/color-mix\(in srgb, #c57c54 8%, transparent\)/g, '#f8efe9');
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>우렁의사 AI 마음 리포트 — ${r.date}</title>
<style>
body{font-family:'Malgun Gothic',system-ui,sans-serif;background:#fffdf9;color:#2b2620;max-width:720px;margin:0 auto;padding:30px 24px;line-height:1.75;font-size:15px}
h1{font-size:22px;margin:0 0 2px;letter-spacing:-0.02em}
p.meta{font-size:12px;color:#8a8073;margin:0 0 20px}
.box{padding:0}
section{break-inside:avoid}
b{font-weight:800}
@media print{body{padding:0;font-size:12.5pt} section{page-break-inside:avoid}}
</style></head><body>
<h1> 우렁의사 AI 마음 리포트</h1>
<p class="meta">${r.date} 생성 · 참고용 리포트 (의학적 진단 아님) · 위기 시 109 / 1577-0199</p>
<div class="box">${inner}</div>
<p style="font-size:11px;color:#8a8073">이 리포트는 우렁의사 앱의 대화·기록 데이터를 AI가 분석한 참고 자료이며, 의료적 진단이나 처방을 대신할 수 없습니다.</p>
</body></html>`;
  },

  download(id) {
    const r = this.report(id);
    if (!r) return;
    const blob = new Blob([this._docHtml(r)], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `우렁의사_AI마음리포트_${new Date().toLocaleDateString('sv-CA')}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    if (window.App) window.App.showRecordToast('진단서 파일을 저장했어요 (브라우저로 열 수 있어요)');
  },

  printPdf(id) {
    const r = this.report(id);
    if (!r) return;
    const w = window.open('', '_blank');
    if (!w) { window.UI.alert('팝업이 차단됐어요. 팝업을 허용해주세요.'); return; }
    w.document.write(this._docHtml(r));
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
  },

  // --------------------------------------------------------------------------
  //  생성 (유료)
  // --------------------------------------------------------------------------
  // 이번 리포트에 쓸 검진이 "지금"의 것인가.
  //  지난 리포트 이후에 다시 잰 검진만 인정한다 — 리포트 1개 = 검진 1개.
  qaFresh() {
    const qa = this.answers();
    if (!qa || !qa.ts) return { ok: false, why: 'none' };
    const st = this.qaStatus();
    if (!st.ok) return { ok: false, why: st.state, days: st.days };   // 없음·미완료·만료
    const last = this.reports()[0];
    if (!last) return { ok: true, first: true };
    const lastTs = Number(String(last.id).replace('as_', '')) || 0;
    if (qa.ts <= lastTs) {
      return { ok: false, why: 'stale', days: Math.floor((Date.now() - qa.ts) / 86400000) };
    }
    return { ok: true };
  },

  // 다음 리포트까지 남은 일수 (0 이면 지금 가능)
  cooldownLeft() {
    const last = this.reports()[0];
    if (!last) return 0;
    const ts = Number(String(last.id).replace('as_', '')) || 0;
    if (!ts) return 0;
    const passed = (Date.now() - ts) / 86400000;
    return Math.max(0, Math.ceil(this.COOLDOWN_DAYS - passed));
  },

  async generate() {
    const m = this.metrics();
    const st = this.qaStatus();

    // ── 관문: 이번 리포트를 위한 검진을 지금 다시 잰다 ─────────────
    //  예전 점수로 지금을 설명할 수는 없다. 5분이면 끝나고, 그래야 추이도 쌓인다.
    const fresh = this.qaFresh();
    if (!fresh.ok) {
      if (window.Sfx) window.Sfx.play('denied');
      const C = {
        none: {
          title: '표준 검진부터 받을게요',
          lede: '이 검진 없이는 우울·불안을 표준 기준으로 판단할 수 없어요.',
          item: { icon: 'note', title: 'PHQ-9 · GAD-7 · 5분',
                  body: '전 세계가 같은 문항으로 쓰는 표준 선별검사예요. 한 문항씩 답하면 금방 끝나요.' }
        },
        partial: {
          title: '검진이 중간에 멈춰 있어요',
          lede: '남은 문항까지 마쳐야 점수가 나와요.',
          item: { icon: 'note', title: '이어서 답하기', body: '지금까지 답한 것은 그대로 남아 있어요.' }
        },
        expired: {
          title: `검종을 ${fresh.days}일 전에 하셨어요`,
          lede: '그 답은 지금의 당신이 아니에요.',
          item: { icon: 'booking', title: `PHQ-9 · GAD-7 은 '지난 2주' 를 묻는 검사예요`,
                  body: `${fresh.days}일 전 점수로 만들면 지금이 아니라 그때를 설명하게 돼요. 다시 재고 만들게요. (5분)` }
        },
        stale: {
          title: '이 점수는 지난 리포트에 이미 썼어요',
          lede: '같은 점수로 새 리포트를 만들면 그때를 다시 설명하게 돼요.',
          item: { icon: 'dashboard', title: '지금 상태로 다시 재요 · 5분',
                  body: '그래야 무엇이 달라졌는지 나란히 보이고, 변화 그래프에도 점이 찍혀요.' }
        }
      }[fresh.why] || {
        title: '표준 검진부터 받을게요', lede: '',
        item: { icon: 'note', title: '5분이면 끝나요', body: '' }
      };
      this.confirmSheet({
        title: C.title, lede: C.lede, items: [C.item], price: null,
        okLabel: '검진하러 가기', cancelLabel: '나중에 할게요',
        onOk: () => this.openQuiz()
      });
      return;
    }

    if (!window.Wallet || window.Wallet.balance() < this.PRICE) {
      if (window.Sfx) window.Sfx.play('denied');
      const have = window.Wallet ? window.Wallet.balance() : 0;
      this.confirmSheet({
        title: '캐시가 모자라요',
        lede: `리포트를 만들려면 ${this.PRICE.toLocaleString()}캐시가 필요해요.`,
        items: [{ icon: 'cash', title: `지금 ${have.toLocaleString()}캐시 있어요`,
                  body: '마이 탭에서 충전할 수 있어요. 충전 금액이 클수록 보너스가 붙어요.' }],
        price: null,
        okLabel: '충전하러 가기', cancelLabel: '다음에 할게요',
        onOk: () => { if (window.App) window.App.switchTab('mypage'); }
      });
      return;
    }

    // ── 경고하는 것: 결과가 나빠질 조건 ─────────────────────────────
    //  막지는 않는다. 무엇이 어떻게 나빠지는지만 정확히 알리고 본인이 고르게 한다.
    const warns = [];

    const left = this.cooldownLeft();
    if (left > 0) {
      const passed = this.COOLDOWN_DAYS - left;
      warns.push({
        icon: 'booking',
        title: `지난 리포트로부터 ${passed}일 지났어요`,
        body: `권장은 ${this.COOLDOWN_DAYS}일이에요. 같은 기록으로 다시 만드는 셈이라 표현만 달라진 결과가 나오기 쉬워요. `
          + `그 차이를 '나아졌다' 로 읽으면 오히려 손해예요.`
      });
    }

    if (m.total < this.MIN_TOTAL) {
      warns.push({
        icon: 'note',
        title: `기록이 ${m.total}% 모였어요`,
        body: `${this.MIN_TOTAL}%부터 정확해져요. 기록이 얕으면 AI가 당신을 오해한 채로 단정할 수 있어요. `
          + `대화·체크인·하루정리를 더 쌓으면 훨씬 정확해집니다.`
      });
    }

    // 팝업은 알리는 용도지 막는 용도가 아니다 — 판단은 본인 몫으로 남긴다.
    const proceed = () => this._doGenerate(m);
    if (warns.length) {
      if (window.Sfx) window.Sfx.play('denied');
      this.confirmSheet({
        title: '이 상태로 만들면 정확도가 떨어져요',
        lede: '아래를 알고도 괜찮다면 지금 만들 수 있어요.',
        items: warns,
        price: this.PRICE.toLocaleString() + '캐시',
        okLabel: '그래도 만들기',
        cancelLabel: '조금 더 모으고 만들래요',
        onOk: proceed
      });
    } else {
      this.confirmSheet({
        title: 'AI 마음 리포트를 만들까요?',
        lede: '표준 검진과 기록 전체를 정밀 분석해 2주 케어플랜을 처방해요.',
        items: [],
        price: this.PRICE.toLocaleString() + '캐시',
        okLabel: '만들기',
        onOk: proceed
      });
    }
  },

  // 결제와 생성 — 확인 팝업에서 진행을 누르면 여기로 온다
  async _doGenerate(m) {
    if (!window.Wallet.spend(this.PRICE, 'AI 마음 리포트 생성')) return;

    const box = document.getElementById('assess-result');
    if (box) box.innerHTML = `<div class="glass-card" style="padding: 1rem; text-align: center;"><p style="margin: 0; font-size: 0.84rem; color: var(--text-primary);">⏳ 표준 검진 점수와 기록 전체를 정밀 분석 중… (30초~1분)</p></div>`;

    try {
      const { json } = await this._generate(m);
      const reps = this.reports();
      const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const rec = { id: 'as_' + Date.now(), date, json, facts: this.factCharts(),
                    history: (this._S()._safeGet('cbt_assess_history', []) || []).slice(-8) };
      reps.unshift(rec);
      this._S()._safeSet('cbt_assessments', reps.slice(0, 30)); // 유료 AI 리포트 — 상한 10→30
      // 리포트를 읽고 끝내지 않는다 — 2주 케어플랜을 바로 심는다
      if (window.CarePlan) {
        // 계획을 못 담아냈으면(모델이 필드를 빠뜨림) 조용히 넘기지 않는다 —
        //  돌봄 화면에서 다시 가져올 수 있으므로 그 사실만 알린다.
        const adopted = window.CarePlan.adopt(rec);
        if (window.Game) window.Game.show('care', true);   // 처방을 바로 보여준다
        if (!adopted && window.App) {
          window.App.showRecordToast('이번 리포트에는 2주 계획이 담기지 않았어요', null);
        }
      }
      if (window.Missions && window.Missions.render) window.Missions.render();
      if (window.Sfx) window.Sfx.play('harvest');
      this.render();
      const first = document.getElementById('as-' + rec.id);
      if (first) { first.classList.remove('hidden'); first.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } catch (e) {
      window.Wallet.refund(this.PRICE, 'AI 마음 리포트 생성 실패 환불');
      if (box) box.innerHTML = `<div class="glass-card" style="padding: 1rem; text-align: center;"><p style="margin: 0; font-size: 0.84rem; color: #c96a5a;">리포트를 만들지 못해 ${this.PRICE.toLocaleString()}캐시를 <b>전액 환불</b>했어요.${e && e.message === 'PARSE' ? '<br>분석 결과가 중간에 끊겼어요 — 다시 시도하면 대개 성공합니다.' : '<br>잠시 후 다시 시도해주세요.'}</p></div>`;
    }
  },

  async _generate(m) {
    const S = this._S();
    const msgs = (S.getMessages() || []).slice(-200).map(x => `${x.role === 'user' ? '내담자' : '상담사'}: ${x.text}`).join('\n').slice(-24000);
    const memory = (S.getUserMemory && S.getUserMemory()) || '(없음)';
    const qa = this.answers();
    const sc = this.scores();
    const scTxt = sc && sc.phq != null
      ? `PHQ-9(우울 선별, 표준): ${sc.phq}/27 — ${sc.phqBand} / 문항9(자해사고): ${sc.item9}
GAD-7(불안 선별, 표준): ${sc.gad}/21 — ${sc.gadBand}`
      : '(표준 검진 미실시)';
    const qaTxt = qa ? this.QUESTIONS.map(q => `[${q.axis}] ${q.t} → ${this.SCALE[qa.map[q.id]] || '무응답'}`).join('\n') : '(자가검진 안 함)';
    const moods = (S._safeGet('cbt_mood_log', []) || []).slice(-60).map(x => `${new Date(x.ts).toLocaleDateString('sv-CA')} ${x.emo || ''} ${x.v ?? ''}`).join(', ') || '(없음)';
    const F = this.factCharts();
    const DAYK = ['월','화','수','목','금','토','일'], SLOTK = ['새벽','아침','점심','오후','저녁','밤'];
    const heatTxt = F.matrix.map((row, d) => row.map((c, s) => c.n ? `${DAYK[d]}${SLOTK[s]}:${c.avg.toFixed(1)}(${c.n})` : '').filter(Boolean).join(' ')).filter(Boolean).join(' | ') || '(자료 부족)';
    const distTxt = F.distortions.length ? F.distortions.map(d => `${d.name} ${d.pct}회`).join(', ') : '(사고기록 없음)';

    const prompt = `당신은 20년 경력의 임상심리 전문가입니다. 심리상담 앱에 쌓인 한 사람의 기록 전체를 읽고, 그 사람 자신도 몰랐던 것을 짚어주는 심층 패턴 리포트를 작성합니다.

[태도 — 매우 중요]
· 이 보고서는 임상심리평가 보고서의 표준 구조(배경정보 → 평가도구 → 결과 → 행동관찰 → 요약 및 제언)를 따릅니다. 격식 있는 평가 보고서 문체로 쓰되, 읽는 사람은 내담자 본인이므로 어렵지 않게.
· 진단 금지의 범위: 병명(우울증·ADHD·양극성장애 등)뿐 아니라 "~장애가 의심됩니다", "~증상입니다" 같은 진단 시사 표현도 금지. 오직 "선별검사 점수", "관찰된 패턴", "경향" 의 언어만 사용.
· 그 범위 안에서는 겁내지 마세요. "~일 수 있습니다" 남발은 무가치합니다. 관찰된 패턴은 근거와 함께 명확히 서술하세요. 기록 속 실제 표현·사건·반복을 인용해 구체적으로.
· needs/wellbeing/signals 는 0~100 으로 주되, 앱이 이를 '낮음/보통/높음' 3단계로만 표시합니다. 정밀한 숫자처럼 서술하지 말고 경향으로만 쓰세요.
· limits 에는 반드시 다음을 포함하세요: 앱 기록은 힘들 때 더 많이 남는 선택 편향이 있다는 점, 표준검사는 2주 단면이고 추이 차트는 3주 종단이라 시간 단위가 다르다는 점.
· 표준 선별검사(PHQ-9·GAD-7)가 실시됐다면 그 점수와 밴드를 우울·불안 신호의 근거로 그대로 사용하세요(우울 score = PHQ-9/27을 100 환산, 불안 = GAD-7/21 환산, evidence 에 "PHQ-9 X점(밴드)" 명기). 대화 관찰은 보조 근거로만. 나머지 축(기분변동·주의력·분노·인지왜곡·욕구·웰빙)은 표준 도구가 아니므로 반드시 "탐색 지표(비표준)"임을 evidence 안에 명시하고, 대화·탐색 문항을 근거로 추정하세요. 문항9(자해)가 1 이상이면 referral 에 반드시 반영.
· 신뢰도: 데이터 신뢰도 플래그가 2개 이상이면 reliability.level 을 "낮음"으로 하고 note 에 "이 데이터는 믿을만하지 못합니다"와 사실 근거(기간·입력 패턴)만 적으세요. 과장·연기·기계적 입력 의심 같은 표현은 절대 금지 — 사람을 비난하지 마세요.
· 자·타해, 폭력의 위험 신호가 보이면 referral 에 분명히 적고 109·1577-0199 를 포함하세요.

[데이터 요약]
기간 ${m.spanDays}일 · 활동일 ${m.activeDays}일 · 발화 ${m.userMsgs}개 · 체크인 ${m.moods}회 · 깊은기록 ${m.records + m.nights}개 · 충분도 ${m.total}%
신뢰도 플래그: ${m.flags.length ? m.flags.join(' · ') : '없음'}
${m.total < 60 ? '(충분도 60% 미만 — overall 첫 문장에 데이터가 제한적임을 한 번만 언급하고, 그 뒤로는 위축되지 말고 분석하세요)' : ''}

[문체 규칙]
· 본문에서 **핵심 어구만** 별표 두 개로 감싸 강조하세요 (예: **거절이 두려워** 먼저 내줍니다). 한 문단에 1~2개만.
· 문장은 짧게 끊고, 어려운 임상 용어는 괄호로 풀어 쓰세요.

[출력 형식 — 반드시 아래 JSON 만, 코드펜스·설명 없이]
{
 "reliability": {"level": "높음|보통|낮음", "note": "한 문장"},
 "headline": "이 사람을 관통하는 한 문장 통찰 (25자 내외, **강조** 사용 가능)",
 "summaryLine": "헤드라인을 풀어주는 한 문장",
 "overall": "전반적 인상 4~6문장. 단정적으로, 구체적 근거를 섞어서.",
 "standard": [
   {"name": "PHQ-9 우울", "score": <제공된 PHQ 총점 그대로>, "max": 27, "band": "<제공된 밴드 그대로>",
    "bands": [{"to":4,"label":"정상"},{"to":9,"label":"경도"},{"to":14,"label":"중등도"},{"to":19,"label":"중등도이상"},{"to":27,"label":"심함"}],
    "note": "이 점수가 뜻하는 바 한 문장"},
   {"name": "GAD-7 불안", "score": <제공된 GAD 총점 그대로>, "max": 21, "band": "<제공된 밴드 그대로>",
    "bands": [{"to":4,"label":"정상"},{"to":9,"label":"경도"},{"to":14,"label":"중등도"},{"to":21,"label":"심함"}],
    "note": "한 문장"}
 ],
 "timePattern": "제공된 '요일·시간대 분포' 원자료를 보고 언제 취약한지 2~3문장. 데이터가 적으면 그렇다고 쓸 것.",
 "signals": [
   {"name": "기분 변동", "score": 0-100, "level": "낮음|중간|높음", "evidence": "근거 한 문장"},
   {"name": "주의력·충동", ...}, {"name": "분노·공격성", ...}, {"name": "반추(곱씹기)", ...}
 ],
 "needs": [
   {"name": "인정", "score": 0-100}, {"name": "거절두려움", ...}, {"name": "소속", ...}, {"name": "통제·완벽", ...}, {"name": "자율", ...}, {"name": "안전", ...}
 ],
 "wellbeing": [
   {"name": "행복도", "score": 0-100}, {"name": "에너지", ...}, {"name": "회복탄력성", ...}, {"name": "자기효능감", ...}, {"name": "관계만족", ...}
 ],
 "profileRead": "위 두 레이더의 '모양'을 해석한 3~4문장. 어느 축이 튀고 어느 축이 꺼졌는지, 그 조합이 뜻하는 것.",
 "distortionRead": "제공된 인지왜곡 집계를 보고 2~3문장. 집계가 비어 있으면 이 필드는 빈 문자열.",
 "formulation": {"belief": "핵심 신념 한 문장", "fear": "그래서 두려운 것", "behavior": "그래서 하는 행동", "result": "그 결과"},
 "evidence": [
   {"claim": "리포트의 주요 판단 한 줄", "quotes": ["기록에서 실제로 나온 표현 1~2개"], "strength": 1-5}
 ],
 "whatYouNeed": ["지금 실제로 필요한 것 3~4개 — 짧고 구체적으로"],
 "happinessRx": [{"week": "1주차", "do": "구체적 행동", "why": "왜 이게 듣는지 한 줄"}, {"week": "2주차", ...}, {"week": "3주차", ...}, {"week": "4주차", ...}],
 "strengths": "기록에서 확인된 강점·보호요인 2~3문장",
 "referral": "전문가 상담이 필요한 시점과 이유 (위험 신호 있으면 여기에 명시)",
 "limits": "이 리포트가 놓칠 수 있는 것, 한 문장",
 "carePlan": {
   "focus": "앞으로 2주간 딱 하나만 다룬다면 무엇인지 한 문장. 위 분석에서 가장 지렛대가 큰 것.",
   "why": "왜 이것부터인지 2문장. 위 evidence·formulation 과 연결해서.",
   "weeks": [
     {"week": 1, "goal": "1주차 목표 한 문장", "technique": "<아래 기법 목록에서 하나 그대로>",
      "actions": ["아주 작고 구체적인 행동 2~3개. 빈도·시간·장소가 들어가게. 예: 매일 밤 10시, 침대에 눕기 전 5분 호흡"],
      "measure": "됐는지 무엇으로 아는가 한 줄"},
     {"week": 2, "goal": "...", "technique": "...", "actions": ["..."], "measure": "..."}
   ],
   "ifThen": [{"if": "못 하게 만드는 가장 그럴듯한 상황", "then": "그때 대신 할 아주 작은 행동"}],
   "quests": [{"text": "하루 안에 끝나는 미션 한 줄(20자 내외)", "why": "이 사람에게 왜 이 미션인지 한 문장"}],
   "followUps": [{"day": 3, "q": "..."}, {"day": 7, "q": "..."}, {"day": 14, "q": "..."}],
   "redFlag": "이 계획을 멈추고 전문가를 만나야 하는 신호 한 줄"
 }
}
· standard 의 score/band 는 아래 제공된 표준 검사 결과를 **그대로 옮기세요**. 임의로 계산하지 마세요.
· evidence 는 3~5개. strength 는 근거가 반복 관찰되면 4~5, 한두 번이면 2~3, 추론이면 1.

[carePlan 규칙 — 리포트를 처방으로 잇는 부분]
· technique 은 반드시 다음 중 하나를 글자 그대로 쓰세요. 새로 지어내지 마세요:
  행동활성화 / 인지재구성 / 행동실험 / 걱정 시간 정하기 / 점진적 노출 / 마음챙김 호흡 /
  자기자비 훈련 / 수면 위생 / 문제해결치료 / 대인관계 기술 / 반대 행동 / 고통 감내
· actions 는 "노력하기·신경쓰기" 같은 다짐이 아니라 관찰 가능한 행동이어야 합니다.
  나쁜 예: "긍정적으로 생각하기" / 좋은 예: "출근길 지하철에서 어제 잘한 일 한 가지 메모하기"
· 1주차는 이 사람이 지금 상태로도 반드시 해낼 수 있는 크기로. 실패 경험을 만들면 안 됩니다.
· ifThen 은 2~3개. 실패를 예상하고 미리 정해두는 약속입니다("그날은 대신 ~만 한다").
· quests 는 4~6개. 게임 미션으로 나가므로 하루 안에 끝나는 크기로.
· followUps 는 day 3·7·14 세 개. 안부(밥 먹었어?)가 아니라 이 리포트에서 세운 가설을 확인하는 질문이어야 합니다.
  나쁜 예: "요즘 어때?" / 좋은 예: "지난번에 사람들 표정을 자주 살핀다고 했잖아. 이번 주에도 그런 순간 있었어?"
· 자·타해 위험이 있으면 carePlan 을 가볍게 만들지 말고, redFlag 에 분명히 적고 109 를 포함하세요.

[장기기억 요약]
${memory.slice(0, 1500)}

[표준 선별검사 결과]
${scTxt}

[자가검진 원자료(최근 2주)]
${qaTxt}

[기분 체크인 흐름]
${moods}

[요일·시간대 분포 — 평균(횟수)]
${heatTxt}

[인지왜곡 집계 — 사고기록에서]
${distTxt}

[최근 대화]
${msgs}`;

    const res = await window.LLM._chatCompletion({
      // 리포트는 품질이 곧 신뢰다 — 여기는 상위 모델을 쓴다
      model: window.LLM.MODEL_HIGH || window.LLM.MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 8000   // carePlan 이 스키마 끝이라 잘리면 계획이 통째로 날아간다
    });
    if (!res.ok) throw new Error('API');
    const data = await res.json();
    const text = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
    if (!text) throw new Error('EMPTY');

    const json = this._parseJson(text);
    if (!json) throw new Error('PARSE');   // 원문 JSON을 사용자에게 보여주지 않는다
    return { json, raw: text };
  },

  // 모델 출력에서 JSON 을 최대한 살려낸다 (코드펜스 · 중간 절단 대응)
  //  ① 펜스 제거 → ② 그대로 파싱 → ③ 닫아서 파싱 →
  //  ④ 실패하면 마지막 쉼표까지 잘라내며 반복 (불완전한 마지막 항목만 버린다)
  _parseJson(text) {
    if (!text) return null;
    let t = String(text).replace(/```[a-zA-Z]*\s*/g, '').trim();
    const s0 = t.indexOf('{');
    if (s0 < 0) return null;
    t = t.slice(s0);

    const tryParse = str => { try { return JSON.parse(str); } catch (e) { return null; } };
    const usable = j => j && typeof j === 'object' && (j.headline || j.overall || j.standard || j.summaryLine);

    // 완전한 응답이면 여기서 끝
    const lastBrace = t.lastIndexOf('}');
    if (lastBrace > 0) { const j = tryParse(t.slice(0, lastBrace + 1)); if (usable(j)) return j; }

    // 문자열/괄호 상태를 훑어 안전하게 닫아준다
    const closeUp = str => {
      let inStr = false, esc = false;
      const open = [];
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{' || c === '[') open.push(c);
        else if (c === '}' || c === ']') open.pop();
      }
      let body = str;
      if (inStr) body += '"';
      body = body.replace(/[,:]\s*$/, '');
      for (let i = open.length - 1; i >= 0; i--) body += (open[i] === '{' ? '}' : ']');
      return body;
    };

    // 문자열 밖의 마지막 쉼표 위치 (여기서 자르면 불완전한 항목이 통째로 사라진다)
    const lastComma = str => {
      let inStr = false, esc = false, pos = -1;
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr && c === ',') pos = i;
      }
      return pos;
    };

    let base = t;
    for (let attempt = 0; attempt < 60; attempt++) {
      const closed = closeUp(base);
      const j = tryParse(closed) || tryParse(closed.replace(/,(\s*[}\]])/g, '$1'));
      if (usable(j)) return j;
      const cut = lastComma(base);
      if (cut <= 0) break;
      base = base.slice(0, cut);
    }
    return null;
  }
};
