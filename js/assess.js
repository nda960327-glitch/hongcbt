// ============================================================================
//  AI 진단서 — 쌓인 대화·기록을 바탕으로 한 심층 패턴 리포트 (유료: 30,000캐시)
//
//  ⚠️ 의학적 진단이 아니다. 병명을 붙이지 않고 '관찰된 신호'와 근거만 정리하며,
//     반드시 전문가 상담을 권한다. 데이터가 부족하면 부족하다고, 신뢰할 수
//     없으면 "믿을만하지 못합니다"라고 명시한다.
// ============================================================================
window.Assess = {

  PRICE: 30000,

  // --------------------------------------------------------------------------
  //  자가 문답 — 데이터가 부족한 축을 채우는 12문항 (최근 2주 기준, 0~3점)
  // --------------------------------------------------------------------------
  QUESTIONS: [
    { id: 'q_mood',    axis: '기분',    t: '기분이 가라앉거나, 우울하거나, 희망이 없다고 느꼈다' },
    { id: 'q_anhedo',  axis: '기분',    t: '일상에서 흥미나 즐거움을 거의 느끼지 못했다' },
    { id: 'q_sleep',   axis: '수면',    t: '잠들기 어렵거나, 자주 깨거나, 너무 많이 잤다' },
    { id: 'q_energy',  axis: '에너지',  t: '피곤하고 기운이 없었다' },
    { id: 'q_anx',     axis: '불안',    t: '초조하거나 불안하거나 조마조마하게 느꼈다' },
    { id: 'q_worry',   axis: '불안',    t: '걱정을 멈추거나 조절할 수가 없었다' },
    { id: 'q_up',      axis: '기분변동', t: '평소와 달리 기분이 지나치게 들뜨거나, 잠을 안 자도 쌩쌩한 날이 있었다' },
    { id: 'q_updown',  axis: '기분변동', t: '의욕이 넘치다가 갑자기 무기력해지는 큰 오르내림이 있었다' },
    { id: 'q_focus',   axis: '주의력',  t: '해야 할 일에 집중을 유지하기 어려웠다' },
    { id: 'q_impulse', axis: '주의력',  t: '차례를 기다리기 힘들거나, 생각 전에 말/행동이 먼저 나갔다' },
    { id: 'q_irrit',   axis: '충동·분노', t: '사소한 일에도 짜증이나 화가 치밀었다' },
    { id: 'q_agg',     axis: '충동·분노', t: '화가 나서 물건을 던지거나 소리를 지르고 싶은 충동이 들었다' },
    { id: 'q_reject',  axis: '욕구', t: '상대가 실망할까 봐, 싫어도 부탁을 거절하지 못했다' },
    { id: 'q_belong',  axis: '욕구', t: '무리에서 빠지거나 혼자 남는 게 두려워서 무리해서라도 맞췄다' },
    { id: 'q_approve', axis: '욕구', t: '칭찬이나 인정을 받지 못하면 내 가치가 없는 것처럼 느껴졌다' },
    { id: 'q_give',    axis: '욕구', t: '관계를 지키려고 먼저 사주거나, 먼저 챙기거나, 더 많이 내주는 편이었다' },
    { id: 'q_perfect', axis: '욕구', t: '실수하면 안 된다는 생각에 시작을 미루거나 스스로를 심하게 몰아붙였다' },
    { id: 'q_alone',   axis: '욕구', t: '속마음을 말하면 상대가 떠날 것 같아 혼자 삼켰다' }
  ],
  SCALE: ['전혀 아님', '며칠', '절반 이상', '거의 매일'],

  _S() { return window.Storage; },

  answers() { return this._S()._safeGet('cbt_assess_answers', null); },   // {ts, map}
  reports() { return this._S()._safeGet('cbt_assessments', []) || []; },

  // --------------------------------------------------------------------------
  //  데이터 충분도 — 축별 막대 (0~100%)
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

    // 신뢰도 — 가짜/성의없는 데이터 감지 휴리스틱
    const flags = [];
    if (spanDays > 0 && spanDays < 5) flags.push(`전체 기록 기간이 ${spanDays}일뿐 (하루이틀에 몰아친 데이터)`);
    if (userMsgs.length >= 20 && avgLen < 8) flags.push(`발화가 극단적으로 짧음 (평균 ${avgLen}자) — 성의 없는 응답 가능성`);
    if (moods.length >= 8) {
      const vals = moods.map(m => m.v ?? m.value ?? m.score).filter(v => v != null);
      if (vals.length >= 8 && new Set(vals).size === 1) flags.push('기분 체크인이 전부 동일한 값 — 기계적 입력 의심');
      const sorted = moods.map(m => m.ts).sort((a, b) => a - b);
      let burst = 0;
      for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < 90000) burst++;
      if (burst >= Math.floor(sorted.length * 0.5)) flags.push('기분 체크인 절반 이상이 몇 분 안에 연달아 입력됨');
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

  render() {
    const el = document.getElementById('assess-body');
    if (!el) return;
    const m = this.metrics();
    const relTxt = { high: ['높음', 'var(--accent-primary)'], mid: ['보통 — 일부 패턴이 자연스럽지 않아요', '#c9a227'], low: ['낮음 — 이 데이터는 믿을만하지 못합니다', '#c96a5a'] }[m.reliability];

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
    el.innerHTML = `
      <div class="glass-card" style="padding: 0.95rem; border: 1.5px solid color-mix(in srgb, #c96a5a 25%, transparent); margin-bottom: 0.8rem;">
        <p style="margin: 0; font-size: 0.76rem; color: var(--text-secondary); line-height: 1.6;">
          ⚠️ <b>이것은 의학적 진단이 아닙니다.</b> 쌓인 대화·기록에서 보이는 패턴을 정리한 <b>참고용 리포트</b>예요.
          마음이 걱정된다면 반드시 정신건강 전문가를 만나보세요. 위기 순간엔 <b>자살예방상담 1393</b>, <b>정신건강상담 1577-0199</b>.
        </p>
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.65rem;">
          <strong style="font-size: 0.9rem; color: var(--text-primary);">📊 데이터 충분도</strong>
          <span style="font-size: 1.05rem; font-weight: 800; color: ${m.total >= 60 ? 'var(--accent-primary)' : '#c9a227'};">${m.total}%</span>
        </div>
        <div style="height: 12px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; margin-bottom: 0.8rem;">
          <div style="height: 100%; width: ${m.total}%; border-radius: 999px; background: linear-gradient(90deg, #c9a227, var(--accent-primary));"></div>
        </div>
        ${m.bars.map(bar).join('')}
        <p style="margin: 0.5rem 0 0; font-size: 0.7rem; color: var(--text-muted);">
          ${m.total >= 60 ? '진단서를 만들기에 충분한 데이터예요.' : '아직 데이터가 부족해요. 우렁이와 더 대화하고, 체크인·기록을 쌓고, 아래 자가 문답에 답하면 채워져요. 지금 만들면 리포트에도 "데이터 부족"이 명시됩니다.'}
        </p>
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <strong style="font-size: 0.86rem; color: var(--text-primary);">🧪 데이터 신뢰도: <span style="color: ${relTxt[1]};">${relTxt[0]}</span></strong>
        ${m.flags.length ? `<ul style="margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.74rem; color: var(--text-muted); line-height: 1.6;">${m.flags.map(f => `<li>${f}</li>`).join('')}</ul>` : `<p style="margin: 0.4rem 0 0; font-size: 0.74rem; color: var(--text-muted);">입력 패턴이 자연스러워요.</p>`}
      </div>

      <div class="glass-card" style="padding: 0.95rem; margin-bottom: 0.8rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
          <div>
            <strong style="font-size: 0.86rem; color: var(--text-primary);">📝 자가 문답 (3분)</strong>
            <p style="margin: 0.2rem 0 0; font-size: 0.72rem; color: var(--text-muted);">${m.qa ? '완료! 다시 하면 답이 갱신돼요.' : '대화만으로 알기 어려운 축(수면·집중·기분변동)을 채워줘요.'}</p>
          </div>
          <button class="btn-secondary" style="width: auto; font-size: 0.76rem; padding: 0.4rem 0.75rem; flex-shrink: 0;" onclick="window.Assess.openQuiz()">${m.qa ? '다시 하기' : '시작하기'}</button>
        </div>
        <div id="assess-quiz"></div>
      </div>

      <button class="btn-primary" style="width: 100%; padding: 0.8rem; font-size: 0.92rem;" onclick="window.Assess.generate()">
        🔍 AI 진단서 생성 — ${this.PRICE.toLocaleString()}캐시
      </button>
      <p style="margin: 0.4rem 0 0; font-size: 0.68rem; color: var(--text-muted); text-align: center;">깊은 분석에 고성능 AI가 오래 돌아가는 유료 기능이에요. 생성 실패 시 전액 자동 환불.</p>

      <div id="assess-result" style="margin-top: 0.9rem;"></div>

      ${reps.length ? `<p style="margin: 1.1rem 0 0.5rem; font-size: 0.78rem; font-weight: 800; color: var(--text-muted);">지난 진단서 — 누르면 펼쳐져요</p>` : ''}
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${reps.map(r => `
          <div style="background: var(--bg-tertiary); border-radius: 12px; border-left: 4px solid #c96a5a; overflow: hidden;">
            <button onclick="document.getElementById('as-${r.id}').classList.toggle('hidden')" style="all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 0.6rem; width: 100%; padding: 0.7rem 0.85rem; cursor: pointer;">
              <span style="flex: 1; min-width: 0;">
                <span style="display: block; font-size: 0.68rem; color: var(--text-muted);">${r.date}</span>
                <strong style="font-size: 0.84rem; color: var(--text-primary);">AI 진단서 (참고용)</strong>
              </span><span style="color: var(--text-muted); font-weight: 800;">›</span>
            </button>
            <div id="as-${r.id}" class="hidden" style="padding: 0 0.85rem 0.8rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.7; white-space: pre-wrap;">${(r.body || '').replace(/</g, '&lt;')}</div>
          </div>`).join('')}
      </div>`;
  },

  openQuiz() {
    const el = document.getElementById('assess-quiz');
    if (!el) return;
    const prev = (this.answers() || {}).map || {};
    el.innerHTML = `
      <p style="margin: 0.8rem 0 0.6rem; font-size: 0.74rem; color: var(--text-secondary);">지난 <b>2주</b> 동안 얼마나 자주 그랬는지 골라주세요.</p>
      ${this.QUESTIONS.map(q => `
        <div style="margin-bottom: 0.7rem;">
          <p style="margin: 0 0 0.3rem; font-size: 0.78rem; color: var(--text-primary); line-height: 1.45;"><b style="color: var(--text-muted); font-size: 0.66rem;">[${q.axis}]</b> ${q.t}</p>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem;" data-q="${q.id}">
            ${this.SCALE.map((s, i) => `
              <button data-v="${i}" onclick="window.Assess._pick(this)"
                style="all: unset; box-sizing: border-box; cursor: pointer; text-align: center; font-size: 0.66rem; font-weight: 700; padding: 0.4rem 0.1rem; border-radius: 9px;
                       border: 1.5px solid ${prev[q.id] === i ? 'var(--accent-primary)' : 'var(--glass-border)'};
                       background: ${prev[q.id] === i ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)'};
                       color: ${prev[q.id] === i ? 'var(--accent-primary)' : 'var(--text-secondary)'};">${s}</button>`).join('')}
          </div>
        </div>`).join('')}
      <button class="btn-primary" style="width: 100%; margin-top: 0.3rem;" onclick="window.Assess.saveQuiz()">답변 저장</button>`;
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
    if (window.App) window.App.showRecordToast('📝 자가 문답 저장 완료 — 데이터가 채워졌어요');
    if (window.Sfx) window.Sfx.play('ripe');
    this.render();
  },

  // --------------------------------------------------------------------------
  //  생성 (유료)
  // --------------------------------------------------------------------------
  async generate() {
    const m = this.metrics();
    if (!window.Wallet || window.Wallet.balance() < this.PRICE) {
      alert(`우렁 캐시가 부족해요. (${this.PRICE.toLocaleString()}캐시 필요)\n마이페이지에서 충전할 수 있어요.`);
      return;
    }
    const warn = m.total < 60 ? '\n\n⚠️ 지금은 데이터가 부족해서(충분도 ' + m.total + '%) 리포트의 정확도가 낮아요. 그래도 진행할까요?' : '';
    if (!confirm(`AI 진단서를 ${this.PRICE.toLocaleString()}캐시로 생성할까요?${warn}`)) return;
    if (!window.Wallet.spend(this.PRICE, 'AI 진단서 생성')) return;

    const box = document.getElementById('assess-result');
    if (box) box.innerHTML = `<div class="glass-card" style="padding: 1rem; text-align: center;"><p style="margin: 0; font-size: 0.84rem; color: var(--text-primary);">⏳ 쌓인 기록 전체를 정밀 분석 중… (30초 정도)</p></div>`;

    try {
      const body = await this._generate(m);
      const reps = this.reports();
      const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      reps.unshift({ id: 'as_' + Date.now(), date, body });
      this._S()._safeSet('cbt_assessments', reps.slice(0, 10));
      if (window.Sfx) window.Sfx.play('harvest');
      this.render();
      const first = document.querySelector('#assess-body [id^="as-as_"]');
      if (first) first.classList.remove('hidden');
    } catch (e) {
      window.Wallet.refund(this.PRICE, 'AI 진단서 생성 실패 환불');
      if (box) box.innerHTML = `<div class="glass-card" style="padding: 1rem; text-align: center;"><p style="margin: 0; font-size: 0.84rem; color: #c96a5a;">생성에 실패해서 ${this.PRICE.toLocaleString()}캐시를 환불했어요. 잠시 후 다시 시도해주세요.</p></div>`;
    }
  },

  async _generate(m) {
    const S = this._S();
    const msgs = (S.getMessages() || []).slice(-200).map(x => `${x.role === 'user' ? '내담자' : '상담사'}: ${x.text}`).join('\n').slice(-24000);
    const memory = (S.getUserMemory && S.getUserMemory()) || '(없음)';
    const qa = this.answers();
    const qaTxt = qa ? this.QUESTIONS.map(q => `[${q.axis}] ${q.t} → ${this.SCALE[qa.map[q.id]] || '무응답'}`).join('\n') : '(자가 문답 안 함)';
    const moods = (S._safeGet('cbt_mood_log', []) || []).slice(-60).map(x => `${new Date(x.ts).toLocaleDateString('sv-CA')} ${x.emo || ''} ${x.v ?? ''}`).join(', ') || '(없음)';

    const prompt = `당신은 심리상담 앱의 기록을 검토하는 임상심리 자문가입니다. 아래 데이터를 근거로 '참고용 패턴 리포트'를 한국어로 작성하세요.

[절대 규칙]
· 이것은 의학적 진단이 아닙니다. 병명을 단정하지 마세요. "…경향이 관찰됩니다", "…신호가 있습니다" 로만 표현합니다.
· 모든 판단에는 반드시 근거(실제 기록 속 구체적 표현·패턴·빈도)를 붙입니다. 근거 없는 추정 금지.
· 데이터 충분도 ${m.total}% / 신뢰도 플래그: ${m.flags.length ? m.flags.join(' · ') : '없음'}.
  - 충분도가 60% 미만이면 첫 부분에 "데이터가 부족하여 정확도가 낮습니다"를 명시.
  - 신뢰도 플래그가 2개 이상이면 첫 부분에 "이 데이터는 믿을만하지 못합니다"를 그대로 명시하고 이유를 쓰세요. 과장·연기·기계적 입력이 의심되는 기록은 판단에서 제외하세요.
· 위험 신호(자·타해, 폭력)가 보이면 부드럽지만 분명하게 짚고 1393·1577-0199 안내.

[형식 — 제목 그대로, 마크다운 기호 없이]
■ 데이터 요약: 기간 ${m.spanDays}일, 활동일 ${m.activeDays}일, 발화 ${m.userMsgs}개, 체크인 ${m.moods}회, 깊은기록 ${m.records + m.nights}개
■ 신뢰도 평가: (위 규칙대로)
■ 전반적 인상: 2~3문장
■ 관찰된 신호: 아래 각 영역을 [낮음/중간/높음/신호 없음] + 근거 1~2개로.
  - 우울 · 무기력
  - 불안 · 걱정
  - 기분 변동(들뜸↔가라앉음의 큰 진폭)
  - 주의력 · 충동성
  - 분노 · 공격성
  - 인지왜곡 패턴(가장 자주 보이는 왜곡 이름과 예시)
■ 욕구·동기 패턴: 이 사람의 행동을 움직이는 심층 욕구를 분석. 아래 축마다 [강함/보통/약함/판단불가] + 근거.
  - 인정 욕구 (칭찬·평가에 얼마나 좌우되는가)
  - 거절·버림받음에 대한 두려움 (관계를 지키려 자신을 굽히는가, 갈등 회피가 심한가)
  - 소속·연결 열망 (혼자가 되는 것을 얼마나 두려워하는가, 무리에 들기 위해 무엇을 내주는가)
  - 통제·완벽 욕구 (실수 허용도, '~해야만 해'의 빈도)
  - 자율 욕구 (간섭받을 때의 반응)
  - 안전 욕구 (불확실함을 견디는 정도)
  분석 방법: 반복되는 관계 패턴(예: 먼저 베풀고 상처받음), 갈등 장면에서의 선택, 스스로에 대한 평가 언어, 같은 주제로 돌아오는 빈도를 근거로 삼되, 한두 번 나온 말로 단정하지 말 것. 패턴이 3회 이상 반복될 때만 '강함'을 부여.
  마지막에 '핵심 가설' 한 문장: "○○ 욕구가 크고 △△이 두려워, □□하는 방식으로 대처하는 경향" 형태로. 근거가 부족하면 가설임을 명시.
■ 강점과 보호요인: 기록에서 보이는 회복 자원
■ 권장 사항: 앱 안에서 해볼 것 + 전문가 상담이 도움될 시점과 이유
■ 한계: 이 리포트가 놓칠 수 있는 것

전체 1200자 이내. 따뜻하되 정직하게 — 좋은 말만 하는 리포트는 무가치합니다.

[장기기억 요약]
${memory.slice(0, 1200)}

[자가 문답(최근 2주)]
${qaTxt}

[기분 체크인 흐름]
${moods}

[최근 대화]
${msgs}`;

    const res = await window.LLM._chatCompletion({
      model: window.LLM.MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500
    });
    if (!res.ok) throw new Error('API');
    const data = await res.json();
    const text = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
    if (!text) throw new Error('EMPTY');
    return text;
  }
};
