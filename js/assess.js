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
  MIN_TOTAL: 40,   // 이 미만이면 생성 자체를 막는다

  // --------------------------------------------------------------------------
  //  자가검진 — 표준 선별도구(PHQ-9·GAD-7, 공개 도구) + 탐색 문항(비표준) 분리
  //  ⚠️ 표준 문항의 문구·순서·채점은 원 도구 그대로 유지할 것 (임의 수정 금지)
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
      { name: '자가 문답',    pct: qa ? 100 : 0, hint: qa ? '완료' : '아직 안 함 (아래에서 3분)' }
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

  _scoreBar(x) {
    const score = Math.max(0, Math.min(100, x.score | 0));
    const color = score >= 67 ? '#c96a5a' : score >= 34 ? '#c9a227' : 'var(--accent-primary)';
    return `
      <div style="margin-bottom: 0.6rem;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.15rem;">
          <span style="font-size: 0.76rem; font-weight: 700; color: var(--text-primary);">${x.name}</span>
          <span style="font-size: 0.72rem; font-weight: 800; color: ${color};">${x.level || ''} ${score}</span>
        </div>
        <div style="height: 9px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;">
          <div style="height: 100%; width: ${score}%; border-radius: 999px; background: ${color};"></div>
        </div>
        ${x.evidence ? `<p style="margin: 0.2rem 0 0; font-size: 0.68rem; color: var(--text-muted); line-height: 1.45;">${x.evidence}</p>` : ''}
      </div>`;
  },

  // 웰빙 지표는 높을수록 좋으니 색을 반대로
  _goodBar(x) {
    const score = Math.max(0, Math.min(100, x.score | 0));
    const color = score >= 67 ? 'var(--accent-primary)' : score >= 34 ? '#c9a227' : '#c96a5a';
    return `
      <div style="margin-bottom: 0.55rem;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.15rem;">
          <span style="font-size: 0.76rem; font-weight: 700; color: var(--text-primary);">${x.name}</span>
          <span style="font-size: 0.72rem; font-weight: 800; color: ${color};">${score}</span>
        </div>
        <div style="height: 9px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;">
          <div style="height: 100%; width: ${score}%; border-radius: 999px; background: ${color};"></div>
        </div>
      </div>`;
  },

  // 구조화 리포트 HTML (json 있으면 그래프형, 없으면 옛 텍스트형)
  _reportHtml(r) {
    if (!r.json) return `<div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.7; white-space: pre-wrap;">${(r.body || '').replace(/</g, '&lt;')}</div>`;
    const j = r.json;
    const esc = t => String(t == null ? '' : t).replace(/</g, '&lt;');
    const sec = (title, inner) => `<div style="margin-top: 1rem;"><strong style="display: block; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.5rem;">${title}</strong>${inner}</div>`;
    const relColor = j.reliability && /낮/.test(j.reliability.level || '') ? '#c96a5a' : /보통/.test((j.reliability || {}).level || '') ? '#c9a227' : 'var(--accent-primary)';
    return `
      ${j.headline ? `<p style="margin: 0 0 0.7rem; padding: 0.75rem 0.9rem; border-left: 4px solid var(--accent-secondary); background: color-mix(in srgb, var(--accent-secondary) 8%, transparent); border-radius: 0 12px 12px 0; font-size: 0.9rem; font-weight: 700; color: var(--text-primary); line-height: 1.55;">"${esc(j.headline)}"</p>` : ''}
      ${j.reliability ? `<p style="margin: 0 0 0.6rem; font-size: 0.74rem;"><b style="color: ${relColor};">데이터 신뢰도: ${esc(j.reliability.level)}</b> <span style="color: var(--text-muted);">${esc(j.reliability.note)}</span></p>` : ''}
      ${j.overall ? `<p style="margin: 0; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.7;">${esc(j.overall)}</p>` : ''}
      ${Array.isArray(j.signals) && j.signals.length ? sec('🧠 마음 신호', j.signals.map(x => this._scoreBar(x)).join('')) : ''}
      ${Array.isArray(j.needs) && j.needs.length ? sec('🔥 욕구·동기 패턴', j.needs.map(x => this._scoreBar(x)).join('')) : ''}
      ${Array.isArray(j.wellbeing) && j.wellbeing.length ? sec('🌿 웰빙 지표 (높을수록 좋아요)', j.wellbeing.map(x => this._goodBar(x)).join('')) : ''}
      ${j.hiddenPattern ? sec('🔮 본인은 모를 수 있는 패턴', `<p style="margin: 0; font-size: 0.84rem; color: var(--text-primary); line-height: 1.7; background: var(--bg-tertiary); border-radius: 12px; padding: 0.8rem 0.9rem;">${esc(j.hiddenPattern)}</p>`) : ''}
      ${j.coreHypothesis ? sec('🧩 핵심 가설', `<p style="margin: 0; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.7;">${esc(j.coreHypothesis)}</p>`) : ''}
      ${Array.isArray(j.whatYouNeed) && j.whatYouNeed.length ? sec('💡 지금 당신에게 필요한 것', `<ul style="margin: 0; padding-left: 1.1rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.8;">${j.whatYouNeed.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`) : ''}
      ${Array.isArray(j.happinessRx) && j.happinessRx.length ? sec('🗺 행복해지는 4주 처방', j.happinessRx.map(x => `
        <div style="display: flex; gap: 0.6rem; margin-bottom: 0.45rem;">
          <span style="flex-shrink: 0; font-size: 0.7rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); border-radius: 999px; padding: 0.2rem 0.55rem; height: fit-content;">${esc(x.week)}</span>
          <span style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.6;">${esc(x.do)}</span>
        </div>`).join('')) : ''}
      ${j.strengths ? sec('💪 강점과 보호요인', `<p style="margin: 0; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.7;">${esc(j.strengths)}</p>`) : ''}
      ${j.referral ? `<p style="margin: 1rem 0 0; font-size: 0.76rem; color: var(--text-primary); background: color-mix(in srgb, #c96a5a 9%, transparent); border: 1px solid color-mix(in srgb, #c96a5a 25%, transparent); border-radius: 12px; padding: 0.7rem 0.85rem; line-height: 1.6;">🏥 ${esc(j.referral)}</p>` : ''}
      ${j.limits ? `<p style="margin: 0.7rem 0 0; font-size: 0.68rem; color: var(--text-muted); line-height: 1.5;">한계: ${esc(j.limits)}</p>` : ''}`;
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
          ⚠️ <b>이것은 진단이 아니라 참고용 리포트예요.</b> 우울·불안은 표준 선별검사(PHQ-9·GAD-7) 점수를 쓰고,
          나머지는 기록 기반의 탐색 지표입니다. 마음이 걱정되면 전문가를 만나보세요. 위기 순간엔 <b>1393</b>, <b>1577-0199</b>.
        </p>
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.65rem;">
          <strong style="font-size: 0.9rem; color: var(--text-primary);">📊 데이터 충분도</strong>
          <span style="font-size: 1.05rem; font-weight: 800; color: ${canGen ? 'var(--accent-primary)' : '#c96a5a'};">${m.total}%</span>
        </div>
        <div style="height: 12px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; margin-bottom: 0.8rem; position: relative;">
          <div style="height: 100%; width: ${m.total}%; border-radius: 999px; background: linear-gradient(90deg, #c9a227, var(--accent-primary));"></div>
          <div style="position: absolute; top: -2px; bottom: -2px; left: ${this.MIN_TOTAL}%; width: 2px; background: #c96a5a; opacity: 0.7;" title="최소 기준 ${this.MIN_TOTAL}%"></div>
        </div>
        ${m.bars.map(bar).join('')}
        <p style="margin: 0.5rem 0 0; font-size: 0.7rem; color: var(--text-muted);">
          ${canGen ? (m.total >= 60 ? '충분한 데이터예요. 정밀 분석이 가능합니다.' : `기본 분석은 가능하지만, ${60}% 이상 모이면 훨씬 깊어져요.`)
                   : `아직 부족해요 (최소 ${this.MIN_TOTAL}%). 우렁이와 더 대화하고, 체크인·기록을 쌓고, 자가 문답에 답하면 채워집니다. 그 전에는 생성하지 않아요 — 얕은 데이터로 만든 리포트는 당신을 오해할 수 있으니까요.`}
        </p>
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <strong style="font-size: 0.86rem; color: var(--text-primary);">🧪 데이터 신뢰도: <span style="color: ${relTxt[1]};">${relTxt[0]}</span></strong>
        ${m.flags.length ? `<ul style="margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.74rem; color: var(--text-muted); line-height: 1.6;">${m.flags.map(f => `<li>${f}</li>`).join('')}</ul>` : `<p style="margin: 0.4rem 0 0; font-size: 0.74rem; color: var(--text-muted);">입력 패턴이 자연스러워요.</p>`}
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
          <div>
            <strong style="font-size: 0.86rem; color: var(--text-primary);">📝 표준 자가검진 (5분)</strong>
            <p style="margin: 0.2rem 0 0; font-size: 0.72rem; color: var(--text-muted);">${m.qa ? '완료! 다시 하면 답이 갱신돼요.' : 'PHQ-9(우울)·GAD-7(불안) 표준 선별검사 + 탐색 문항이에요.'}</p>
          </div>
          <button class="btn-secondary" style="width: auto; font-size: 0.76rem; padding: 0.4rem 0.75rem; flex-shrink: 0;" onclick="window.Assess.openQuiz()">${m.qa ? '다시 하기' : '시작하기'}</button>
        </div>
        ${(() => {
          const sc = this.scores();
          if (!sc || sc.phq == null) return '';
          return `
          <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.6rem;">
            <span style="font-size: 0.72rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary);">PHQ-9 <b style="color: ${sc.phq >= 10 ? '#c96a5a' : sc.phq >= 5 ? '#c9a227' : 'var(--accent-primary)'};">${sc.phq}/27</b> · ${sc.phqBand}</span>
            <span style="font-size: 0.72rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary);">GAD-7 <b style="color: ${sc.gad >= 10 ? '#c96a5a' : sc.gad >= 5 ? '#c9a227' : 'var(--accent-primary)'};">${sc.gad}/21</b> · ${sc.gadBand}</span>
          </div>
          <p style="margin: 0.4rem 0 0; font-size: 0.66rem; color: var(--text-muted);">표준 선별검사 점수예요. 선별은 진단이 아니며, 10점 이상이면 전문가와 이야기해보길 권해요.</p>`;
        })()}
        <div id="assess-quiz"></div>
      </div>

      <button class="btn-primary" style="width: 100%; padding: 0.8rem; font-size: 0.92rem; ${canGen ? '' : 'opacity: 0.45;'}" onclick="window.Assess.generate()">
        🔍 AI 마음 리포트 생성 — ${this.PRICE.toLocaleString()}캐시
      </button>
      <p style="margin: 0.4rem 0 0; font-size: 0.68rem; color: var(--text-muted); text-align: center;">깊은 분석에 고성능 AI가 오래 돌아가는 유료 기능이에요. 생성 실패 시 전액 자동 환불.</p>

      <div id="assess-result" style="margin-top: 0.9rem;"></div>

      ${reps.length ? `<p style="margin: 1.1rem 0 0.5rem; font-size: 0.78rem; font-weight: 800; color: var(--text-muted);">지난 진단서 — 누르면 펼쳐져요</p>` : ''}
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
              <div style="display: flex; gap: 0.45rem; margin-top: 0.8rem;">
                <button class="btn-secondary" style="width: auto; font-size: 0.74rem; padding: 0.35rem 0.7rem;" onclick="window.Assess.download('${r.id}')">📄 파일로 저장</button>
                <button class="btn-secondary" style="width: auto; font-size: 0.74rem; padding: 0.35rem 0.7rem;" onclick="window.Assess.printPdf('${r.id}')">🖨 인쇄 · PDF</button>
              </div>
            </div>
          </div>`).join('')}
      </div>`;
  },

  openQuiz() {
    const el = document.getElementById('assess-quiz');
    if (!el) return;
    const prev = (this.answers() || {}).map || {};
    const qHtml = q => `
        <div style="margin-bottom: 0.7rem;">
          <p style="margin: 0 0 0.3rem; font-size: 0.78rem; color: var(--text-primary); line-height: 1.5;">${q.t}</p>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem;" data-q="${q.id}">
            ${this.SCALE.map((s, i) => `
              <button data-v="${i}" onclick="window.Assess._pick(this)"
                style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 0.66rem; font-weight: 700; padding: 0.4rem 0.1rem; border-radius: 9px;
                       border: 1.5px solid ${prev[q.id] === i ? 'var(--accent-primary)' : 'var(--glass-border)'};
                       background: ${prev[q.id] === i ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)'};
                       color: ${prev[q.id] === i ? 'var(--accent-primary)' : 'var(--text-secondary)'};">${s}</button>`).join('')}
          </div>
        </div>`;
    el.innerHTML = this.SECTIONS.map(sec => `
      <div style="margin-top: 0.9rem; padding-top: 0.7rem; border-top: 1px dashed var(--glass-border);">
        <p style="margin: 0 0 0.15rem; font-size: 0.8rem; font-weight: 800; color: ${sec.standard ? 'var(--accent-primary)' : 'var(--text-muted)'};">${sec.name}</p>
        <p style="margin: 0 0 0.6rem; font-size: 0.7rem; color: var(--text-muted);">${sec.intro}</p>
        ${sec.items.map(qHtml).join('')}
      </div>`).join('')
      + `<button class="btn-primary" style="width: 100%; margin-top: 0.3rem;" onclick="window.Assess.saveQuiz()">답변 저장</button>`;
    document.querySelectorAll('#assess-quiz [data-q]').forEach(row => {
      const qid = row.dataset.q;
      if (prev[qid] != null) row.dataset.picked = prev[qid];
    });
  },

  _pick(btn) {
    const row = btn.parentElement;
    row.querySelectorAll('button').forEach(b => {
      const on = b === btn;
      b.style.borderColor = on ? 'var(--accent-primary)' : 'var(--glass-border)';
      b.style.background = on ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)';
      b.style.color = on ? 'var(--accent-primary)' : 'var(--text-secondary)';
      if (on) row.dataset.picked = b.dataset.v;
    });
  },

  saveQuiz() {
    const map = {};
    let missing = 0;
    document.querySelectorAll('#assess-quiz [data-q]').forEach(row => {
      if (row.dataset.picked == null) { missing++; return; }
      map[row.dataset.q] = parseInt(row.dataset.picked, 10);
    });
    if (missing > 0) { alert(`${missing}개 문항이 남았어요. 전부 답해주세요.`); return; }
    this._S()._safeSet('cbt_assess_answers', { ts: Date.now(), map });
    if (window.App) window.App.showRecordToast('📝 자가검진 저장 완료');
    if (window.Sfx) window.Sfx.play('ripe');
    const sc = this.scores();
    if (sc && sc.item9 > 0) {
      alert('마지막 우울 문항(자해 관련)에 응답하셨어요.\n\n혼자 견디지 마세요 — 자살예방상담 1393, 정신건강상담 1577-0199 에서 지금 바로 이야기할 수 있어요. 우렁이도 늘 여기 있어요.');
    }
    this.render();
  },

  // --------------------------------------------------------------------------
  //  파일 저장 / 인쇄(PDF)
  // --------------------------------------------------------------------------
  _docHtml(r) {
    // 파일·인쇄용 독립 문서 (밝은 배경, 앱 CSS 변수 인라인 치환)
    const inner = this._reportHtml(r)
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
<style>body{font-family:'Malgun Gothic',system-ui,sans-serif;background:#fffdf9;color:#2b2620;max-width:680px;margin:0 auto;padding:28px 22px;line-height:1.6}
h1{font-size:20px;margin:0 0 2px}p.meta{font-size:12px;color:#8a8073;margin:0 0 18px}
.box{border:1px solid #e5ddd0;border-radius:14px;padding:16px 18px;margin-bottom:14px}
@media print{body{padding:0}}</style></head><body>
<h1>🔍 우렁의사 AI 마음 리포트</h1>
<p class="meta">${r.date} 생성 · 참고용 리포트 (의학적 진단 아님) · 위기 시 1393 / 1577-0199</p>
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
    if (window.App) window.App.showRecordToast('📄 진단서 파일을 저장했어요 (브라우저로 열 수 있어요)');
  },

  printPdf(id) {
    const r = this.report(id);
    if (!r) return;
    const w = window.open('', '_blank');
    if (!w) { alert('팝업이 차단됐어요. 팝업을 허용해주세요.'); return; }
    w.document.write(this._docHtml(r));
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
  },

  // --------------------------------------------------------------------------
  //  생성 (유료)
  // --------------------------------------------------------------------------
  async generate() {
    const m = this.metrics();
    if (m.total < this.MIN_TOTAL) {
      if (window.Sfx) window.Sfx.play('denied');
      alert(`데이터가 아직 ${m.total}%뿐이라 진단서를 만들 수 없어요. (최소 ${this.MIN_TOTAL}%)\n\n얕은 데이터로 만든 리포트는 당신을 오해하게 됩니다.\n우렁이와 대화하고, 체크인·하루정리를 쌓고, 자가 문답(3분)에 답해주세요.`);
      return;
    }
    if (!window.Wallet || window.Wallet.balance() < this.PRICE) {
      alert(`우렁 캐시가 부족해요. (${this.PRICE.toLocaleString()}캐시 필요)\n마이페이지에서 충전할 수 있어요.`);
      return;
    }
    const warn = m.total < 60 ? `\n\n⚠️ 데이터 충분도 ${m.total}% — 분석 깊이가 제한될 수 있어요. 그래도 진행할까요?` : '';
    if (!confirm(`AI 마음 리포트를 ${this.PRICE.toLocaleString()}캐시로 생성할까요?${warn}`)) return;
    if (!window.Wallet.spend(this.PRICE, 'AI 마음 리포트 생성')) return;

    const box = document.getElementById('assess-result');
    if (box) box.innerHTML = `<div class="glass-card" style="padding: 1rem; text-align: center;"><p style="margin: 0; font-size: 0.84rem; color: var(--text-primary);">⏳ 표준 검진 점수와 기록 전체를 정밀 분석 중… (30초~1분)</p></div>`;

    try {
      const { json, raw } = await this._generate(m);
      const reps = this.reports();
      const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const rec = { id: 'as_' + Date.now(), date, json, body: json ? '' : raw };
      reps.unshift(rec);
      this._S()._safeSet('cbt_assessments', reps.slice(0, 10));
      if (window.Sfx) window.Sfx.play('harvest');
      this.render();
      const first = document.getElementById('as-' + rec.id);
      if (first) { first.classList.remove('hidden'); first.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } catch (e) {
      window.Wallet.refund(this.PRICE, 'AI 마음 리포트 생성 실패 환불');
      if (box) box.innerHTML = `<div class="glass-card" style="padding: 1rem; text-align: center;"><p style="margin: 0; font-size: 0.84rem; color: #c96a5a;">생성에 실패해서 ${this.PRICE.toLocaleString()}캐시를 환불했어요. 잠시 후 다시 시도해주세요.</p></div>`;
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

    const prompt = `당신은 20년 경력의 임상심리 전문가입니다. 심리상담 앱에 쌓인 한 사람의 기록 전체를 읽고, 그 사람 자신도 몰랐던 것을 짚어주는 심층 패턴 리포트를 작성합니다.

[태도 — 매우 중요]
· 겁내지 마세요. "~일 수 있습니다", "~로 보입니다"를 남발하는 리포트는 무가치합니다. 관찰된 패턴은 단정적으로 말하세요. 병명(우울증, ADHD, 조울증 등 진단명)을 붙이는 것만 하지 않으면 됩니다.
· 점쟁이가 맞히듯 소름 돋게 구체적으로. 기록 속 실제 표현·사건·반복을 근거로 그 사람의 내면 논리를 꿰뚫어 서술하세요. 대담한 추론 환영 — 단, 근거 없는 지어내기는 금지.
· 표준 선별검사(PHQ-9·GAD-7)가 실시됐다면 그 점수와 밴드를 우울·불안 신호의 근거로 그대로 사용하세요(우울 score = PHQ-9/27을 100 환산, 불안 = GAD-7/21 환산, evidence 에 "PHQ-9 X점(밴드)" 명기). 대화 관찰은 보조 근거로만. 나머지 축(기분변동·주의력·분노·인지왜곡·욕구·웰빙)은 표준 도구가 아니므로 반드시 "탐색 지표(비표준)"임을 evidence 안에 명시하고, 대화·탐색 문항을 근거로 추정하세요. 문항9(자해)가 1 이상이면 referral 에 반드시 반영.
· 신뢰도: 데이터 신뢰도 플래그가 2개 이상이면 reliability.level 을 "낮음"으로 하고 note 에 "이 데이터는 믿을만하지 못합니다"와 사실 근거(기간·입력 패턴)만 적으세요. 과장·연기·기계적 입력 의심 같은 표현은 절대 금지 — 사람을 비난하지 마세요.
· 자·타해, 폭력의 위험 신호가 보이면 referral 에 분명히 적고 1393·1577-0199 를 포함하세요.

[데이터 요약]
기간 ${m.spanDays}일 · 활동일 ${m.activeDays}일 · 발화 ${m.userMsgs}개 · 체크인 ${m.moods}회 · 깊은기록 ${m.records + m.nights}개 · 충분도 ${m.total}%
신뢰도 플래그: ${m.flags.length ? m.flags.join(' · ') : '없음'}
${m.total < 60 ? '(충분도 60% 미만 — overall 첫 문장에 데이터가 제한적임을 한 번만 언급하고, 그 뒤로는 위축되지 말고 분석하세요)' : ''}

[출력 형식 — 반드시 아래 JSON 만, 코드펜스·설명 없이]
{
 "reliability": {"level": "높음|보통|낮음", "note": "한 문장"},
 "headline": "이 사람을 관통하는 한 문장 통찰 (점쟁이처럼, 30자 내외)",
 "overall": "전반적 인상 4~6문장. 단정적으로, 구체적 근거를 섞어서.",
 "signals": [
   {"name": "우울·무기력", "score": 0-100, "level": "낮음|중간|높음", "evidence": "실제 표현 인용 포함 근거 한 문장"},
   {"name": "불안·걱정", ...}, {"name": "기분 변동", ...}, {"name": "주의력·충동", ...}, {"name": "분노·공격성", ...}, {"name": "인지왜곡 강도", ...}
 ],
 "needs": [
   {"name": "인정 욕구", "score": 0-100, "evidence": "..."}, {"name": "거절·버림 두려움", ...}, {"name": "소속·연결 열망", ...}, {"name": "통제·완벽", ...}, {"name": "자율", ...}, {"name": "안전", ...}
 ],
 "wellbeing": [
   {"name": "행복도", "score": 0-100}, {"name": "에너지", "score": ...}, {"name": "회복탄력성", "score": ...}, {"name": "자기효능감", "score": ...}, {"name": "관계 만족", "score": ...}
 ],
 "hiddenPattern": "본인은 인식 못 했을 가능성이 큰 패턴 1~2개를 과감하게. '당신은 ~할 때마다 ~하는 버릇이 있습니다' 식으로.",
 "coreHypothesis": "핵심 신념 → 두려움 → 대처 행동 → 결과, 한 문장으로.",
 "whatYouNeed": ["지금 이 사람에게 실제로 필요한 것 3~5개 — 구체적으로"],
 "happinessRx": [{"week": "1주차", "do": "구체적 행동 처방"}, {"week": "2주차", ...}, {"week": "3주차", ...}, {"week": "4주차", ...}],
 "strengths": "기록에서 확인된 강점·보호요인 2~3문장",
 "referral": "전문가 상담이 필요한 시점과 이유 (위험 신호 있으면 여기에 명시)",
 "limits": "이 리포트가 놓칠 수 있는 것, 한 문장"
}

[장기기억 요약]
${memory.slice(0, 1500)}

[표준 선별검사 결과]
${scTxt}

[자가검진 원자료(최근 2주)]
${qaTxt}

[기분 체크인 흐름]
${moods}

[최근 대화]
${msgs}`;

    const res = await window.LLM._chatCompletion({
      model: window.LLM.MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 1500
    });
    if (!res.ok) throw new Error('API');
    const data = await res.json();
    const text = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
    if (!text) throw new Error('EMPTY');

    // JSON 파싱 (코드펜스·앞뒤 잡음 제거). 실패하면 원문 텍스트로라도 보여준다.
    let json = null;
    try {
      let t = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s >= 0 && e > s) json = JSON.parse(t.slice(s, e + 1));
    } catch (e) { json = null; }
    return { json, raw: text };
  }
};
