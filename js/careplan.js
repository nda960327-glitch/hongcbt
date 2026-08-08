// ============================================================================
//  케어플랜 — AI 마음 리포트를 '읽고 끝'이 아니라 '2주간 실행'으로 잇는 축.
//
//  리포트가 만들어지면 그 안의 carePlan 을 여기로 옮겨 심는다(adopt).
//  이후 앱의 다른 부분이 전부 이 하나를 바라본다:
//    · 퀘스트  — 무작위 풀 대신 이 사람에게 필요한 미션을 섞어 낸다 (missions.js)
//    · 챗봇    — 지금 며칠차인지, 무엇을 하기로 했는지 알고 먼저 묻는다 (llm.js)
//    · 재검사  — 2주가 끝나면 PHQ-9·GAD-7 을 다시 받아 변화를 본다 (assess.js)
//
//  기법 이름은 임의로 짓지 않는다. 근거 있는 개입만 쓰도록 화이트리스트로 제한하고,
//  리포트가 목록 밖 이름을 뱉으면 '일반 자기돌봄'으로 낮춰 표시한다.
// ============================================================================
window.CarePlan = {
  DAYS: 14,

  // 근거가 확립된 개입만. 리포트 프롬프트와 이 목록은 반드시 같이 움직인다.
  TECHNIQUES: {
    '행동활성화':        '우울할 때 기분이 나아지길 기다리지 않고 활동을 먼저 늘리는 방법 (BA)',
    '인지재구성':        '자동으로 스친 생각을 붙잡아 증거를 따져보는 방법 (CBT)',
    '행동실험':          '머릿속 예측이 진짜인지 현실에서 작게 시험해보는 방법 (CBT)',
    '걱정 시간 정하기':  '걱정을 하루 중 정해둔 시간으로 미뤄두는 방법 (자극통제)',
    '점진적 노출':       '피하던 상황을 아주 쉬운 것부터 단계적으로 마주하는 방법',
    '마음챙김 호흡':     '지금 이 순간의 감각으로 주의를 되돌리는 방법 (MBCT)',
    '자기자비 훈련':     '자신에게 친구에게 하듯 말해주는 연습 (CFT)',
    '수면 위생':         '잠드는 조건을 정돈해 수면을 회복하는 방법',
    '문제해결치료':      '막연한 고민을 풀 수 있는 문제로 쪼개는 방법 (PST)',
    '대인관계 기술':     '내 몫을 말하고 상대의 몫을 남기는 연습 (DBT DEAR MAN)',
    '반대 행동':         '감정이 시키는 것과 반대로 움직여보는 방법 (DBT)',
    '고통 감내':         '지금 당장 못 바꿀 때 견디는 힘을 쓰는 방법 (DBT)'
  },

  _S() { return window.Storage; },

  // --------------------------------------------------------------------------
  //  상태
  // --------------------------------------------------------------------------
  active() { return this._S()._safeGet('cbt_careplan', null); },

  // 리포트에서 계획을 꺼내 심는다. 이전 계획이 있으면 기록으로 밀어둔다.
  adopt(report) {
    const p = report && report.json && report.json.carePlan;
    if (!p || !Array.isArray(p.weeks) || !p.weeks.length) return false;

    const prev = this.active();
    if (prev) {
      const hist = this._S()._safeGet('cbt_careplan_history', []) || [];
      hist.unshift({ ...prev, endedAt: Date.now() });
      this._S()._safeSet('cbt_careplan_history', hist.slice(0, 6));
    }

    this._S()._safeSet('cbt_careplan', {
      reportId: report.id,
      startedAt: Date.now(),
      focus: p.focus || '',
      why: p.why || '',
      weeks: p.weeks,
      ifThen: Array.isArray(p.ifThen) ? p.ifThen : [],
      quests: Array.isArray(p.quests) ? p.quests : [],
      followUps: Array.isArray(p.followUps) ? p.followUps : [],
      redFlag: p.redFlag || '',
      done: {},        // 'w1a0' → 완료 시각
      asked: {}        // 후속질문 day → 물어본 시각
    });
    return true;
  },

  // 계획이 안 맞을 때 언제든 갈아탄다.
  //  안 맞는 계획을 붙들고 실패를 쌓는 것보다, 다시 고르는 편이 낫다.
  restart() {
    const p = this.active();
    if (!p) { this.startStarter(); return; }
    if (!confirm('지금 계획을 접고 새로 시작할까요?\n\n지금까지 체크한 것은 기록에 남아요.')) return;
    const hist = this._S()._safeGet('cbt_careplan_history', []) || [];
    hist.unshift({ ...p, endedAt: Date.now(), restarted: true });
    this._S()._safeSet('cbt_careplan_history', hist.slice(0, 6));
    this._S()._safeSet('cbt_careplan', null);
    if (window.Sfx) window.Sfx.play('close');
    this.render();
    if (window.Missions) window.Missions.renderCard();
  },

  // 계획을 담고 있는 가장 최근 리포트
  latestPlanReport() {
    const reps = (window.Assess && window.Assess.reports()) || [];
    return reps.find(r => r && r.json && r.json.carePlan
      && Array.isArray(r.json.carePlan.weeks) && r.json.carePlan.weeks.length) || null;
  },

  // 리포트가 처방한 계획을 (다시) 심는다.
  adoptLatest() {
    const r = this.latestPlanReport();
    if (!r) return false;
    if (!this.adopt(r)) return false;
    if (window.Sfx) window.Sfx.hit('levelup');
    if (window.App) window.App.showRecordToast('리포트가 처방한 2주 계획을 시작했어요', null);
    this.render();
    if (window.Missions) window.Missions.renderCard();
    return true;
  },

  discard() {
    const p = this.active();
    if (!p) return;
    if (!confirm('진행 중인 케어플랜을 그만둘까요?\n다음 리포트를 만들면 새 계획이 생겨요.')) return;
    const hist = this._S()._safeGet('cbt_careplan_history', []) || [];
    hist.unshift({ ...p, endedAt: Date.now(), abandoned: true });
    this._S()._safeSet('cbt_careplan_history', hist.slice(0, 6));
    this._S()._safeSet('cbt_careplan', null);
    if (window.Sfx) window.Sfx.play('close');
    this.render();
  },

  // --------------------------------------------------------------------------
  //  기본 계획 — 리포트가 없는 사람을 위한 무료 2주 코스
  // --------------------------------------------------------------------------
  //  AI 리포트는 유료다. 그런데 "몸을 먼저 움직인다", "숨을 고른다" 같은 기본 개입은
  //  개인 분석 없이도 근거가 있고, 이걸 막으면 앱이 그냥 결제 유도 장치가 된다.
  //  검진 점수가 있으면 우울/불안 중 높은 쪽에 맞추고, 없으면 일반형으로 준다.
  STARTERS: {
    depress: {
      focus: '기분이 나아지길 기다리지 말고, 움직임을 먼저 되돌리기',
      why: '가라앉을수록 활동이 줄고, 활동이 줄면 더 가라앉습니다. 이 고리는 기분보다 행동 쪽에서 끊는 게 쉽습니다.',
      weeks: [
        { week: 1, goal: '하루에 딱 하나, 몸을 쓰는 일 되찾기', technique: '행동활성화',
          actions: ['아침에 일어나면 커튼 열고 창가에 1분 서 있기', '하루 한 번 10분 걷기 (집 앞도 괜찮아요)'],
          measure: '한 주에 몇 번 했는지 손으로 세어보기' },
        { week: 2, goal: '나를 몰아세우는 말투를 한 번씩 바꿔보기', technique: '자기자비 훈련',
          actions: ['자책이 올라오면 "친구가 이랬으면 뭐라고 할까" 한 번 떠올리기', '잠들기 전 오늘 해낸 일 하나 적기 (아주 작아도 됨)'],
          measure: '적어둔 문장이 며칠 치 쌓였는지' }
      ],
      ifThen: [{ if: '도저히 나갈 힘이 없으면', then: '현관문만 열고 1분 서 있다 들어온다' },
                { if: '아무것도 못 한 날이면', then: '물 한 컵 마시는 것으로 그날을 마감한다' }],
      quests: [{ text: '10분 걷기', why: '움직임이 기분보다 먼저 회복됩니다' },
                { text: '창가에서 햇빛 1분', why: '수면·기분 리듬을 잡아줍니다' },
                { text: '오늘 해낸 일 하나 적기', why: '못 한 것만 기억하는 편향을 깨려고' },
                { text: '누군가에게 안부 한 줄', why: '고립이 깊어지는 걸 막으려고' }],
      followUps: [{ day: 3, q: '걷기, 몇 번쯤 해봤어? 안 됐으면 뭐가 제일 걸렸는지 궁금해' },
                   { day: 7, q: '움직인 날이랑 아닌 날, 저녁 기분이 좀 달랐어?' },
                   { day: 14, q: '2주 전이랑 비교하면 아침에 일어나는 게 조금은 덜 무거워?' }],
      redFlag: '2주가 지나도 나아지는 느낌이 전혀 없거나 죽고 싶은 생각이 들면 전문가를 만나세요 (109)'
    },

    anxious: {
      focus: '불안이 몸부터 올라올 때, 숨으로 먼저 내려놓기',
      why: '불안은 생각보다 몸이 먼저 반응합니다. 호흡을 늦추면 몸이 먼저 진정되고, 그다음에야 생각을 다룰 수 있습니다.',
      weeks: [
        { week: 1, goal: '불안이 올라올 때 쓸 도구 하나를 몸에 익히기', technique: '마음챙김 호흡',
          actions: ['하루 한 번, 정해진 시간에 3분 호흡하기', '가슴이 답답해질 때 앱의 마음 안정 열어보기'],
          measure: '호흡 전후로 답답함이 10점 중 몇 점에서 몇 점이 됐는지' },
        { week: 2, goal: '걱정이 하루 종일 새어나오지 않게 가두기', technique: '걱정 시간 정하기',
          actions: ['걱정이 떠오르면 메모에 한 줄만 적고 미뤄두기', '저녁 정해둔 15분에 그 메모를 몰아서 보기'],
          measure: '미뤄둔 걱정 중 실제로 남아 있던 것이 몇 개였는지' }
      ],
      ifThen: [{ if: '3분 호흡이 오히려 답답해지면', then: '숨을 세지 말고 찬물로 손목만 씻는다' },
                { if: '걱정 시간에 감당이 안 되면', then: '오늘은 세 줄만 보고 덮는다' }],
      quests: [{ text: '3분 호흡하기', why: '불안한 몸을 먼저 내려놓으려고' },
                { text: '걱정 한 줄 적어 미루기', why: '하루 종일 새는 걸 막으려고' },
                { text: '5·4·3·2·1 그라운딩', why: '생각의 소용돌이에서 지금으로 돌아오려고' },
                { text: '자기 전 휴대폰 30분 일찍 놓기', why: '잠이 불안에 제일 크게 물립니다' }],
      followUps: [{ day: 3, q: '호흡 해봤어? 하고 나서 몸이 조금이라도 달라졌는지 궁금해' },
                   { day: 7, q: '걱정을 미뤄뒀다가 나중에 보니 어땠어? 그대로였어, 아니면 작아졌어?' },
                   { day: 14, q: '2주 전이랑 비교하면 불안이 올라올 때 대처할 게 있다는 느낌이 좀 들어?' }],
      redFlag: '숨이 안 쉬어지거나 공황이 반복되면 혼자 버티지 말고 진료를 받으세요 (1577-0199)'
    },

    general: {
      focus: '무엇이 나를 흔드는지, 2주간 관찰해서 알아내기',
      why: '아직 데이터가 적어 방향을 좁히기 어렵습니다. 이 2주는 치료라기보다 나를 관찰하는 기간입니다.',
      weeks: [
        { week: 1, goal: '매일 마음을 한 번씩 기록해 흐름 만들기', technique: '마음챙김 호흡',
          actions: ['하루 한 번 체크인하기 (10초면 끝나요)', '잠들기 전 3분 호흡하기'],
          measure: '한 주에 며칠이나 기록이 남았는지' },
        { week: 2, goal: '기분이 크게 흔들린 날을 붙잡아 들여다보기', technique: '인지재구성',
          actions: ['기분이 나빴던 순간 하나를 사고 기록지에 적기', '그때 스친 생각이 사실인지 근거를 한 줄 적기'],
          measure: '적어둔 기록이 몇 개인지' }
      ],
      ifThen: [{ if: '쓸 말이 없으면', then: '"오늘은 별일 없었다" 한 줄만 남긴다' }],
      quests: [{ text: '지금 마음 체크인하기', why: '흐름은 매일 찍어야 보입니다' },
                { text: '3분 호흡하기', why: '가장 부작용 없는 안정 도구라서' },
                { text: '오늘 있었던 일 한 줄 쓰기', why: '나중에 패턴을 찾을 재료가 됩니다' }],
      followUps: [{ day: 3, q: '며칠 기록해보니 어때? 쓰는 것 자체가 부담이진 않았어?' },
                   { day: 7, q: '이번 주에 기분이 제일 많이 흔들린 순간은 언제였어?' },
                   { day: 14, q: '2주 모아놓고 보니 반복되는 게 좀 보여?' }],
      redFlag: '스스로를 해치고 싶은 생각이 들면 즉시 109 로 연락하세요'
    }
  },

  // 검진 점수가 있으면 높은 쪽, 없으면 최근 기분, 그것도 없으면 일반형
  _starterKey() {
    try {
      const sc = window.Assess && window.Assess.scores ? window.Assess.scores() : null;
      if (sc && sc.phq != null) {
        const dep = sc.phq / 27, anx = (sc.gad || 0) / 21;
        if (dep < 0.19 && anx < 0.24) return 'general';   // 둘 다 정상 범위
        return dep >= anx ? 'depress' : 'anxious';
      }
      const log = (window.Storage._safeGet('cbt_mood_log', []) || []).slice(-10);
      if (log.length >= 3) {
        const avg = log.reduce((a, x) => a + (x.v || 3), 0) / log.length;
        if (avg <= 2.4) return 'depress';
      }
    } catch (e) {}
    return 'general';
  },

  // 기본 계획을 시작한다 (사용자가 버튼을 누를 때만 — 몰래 심지 않는다)
  startStarter() {
    const key = this._starterKey();
    const p = this.STARTERS[key];
    if (!p) return false;
    this._S()._safeSet('cbt_careplan', {
      reportId: '', starter: key, startedAt: Date.now(),
      focus: p.focus, why: p.why, weeks: p.weeks, ifThen: p.ifThen,
      quests: p.quests, followUps: p.followUps, redFlag: p.redFlag,
      done: {}, asked: {}
    });
    if (window.Sfx) window.Sfx.hit('levelup');
    if (window.App) window.App.showRecordToast('2주 기본 계획을 시작했어요', null);
    this.render();
    if (window.Missions) window.Missions.renderCard();
    return true;
  },

  // 시작일로부터 며칠째인가 (1일차부터)
  dayIndex() {
    const p = this.active();
    if (!p) return 0;
    return Math.floor((Date.now() - p.startedAt) / 86400000) + 1;
  },

  // 지금은 몇 주차인가 (1 또는 2, 끝났으면 weeks.length 로 고정)
  weekIndex() {
    const p = this.active();
    if (!p) return 0;
    const w = Math.ceil(this.dayIndex() / 7);
    return Math.min(Math.max(w, 1), p.weeks.length);
  },

  isOver() {
    const p = this.active();
    return !!p && this.dayIndex() > this.DAYS;
  },

  // 기법별 기본 행동 — 리포트가 할 일을 못 담아냈을 때 쓰는 마지막 안전망.
  //  각 기법의 표준적인 첫 연습이라, 개인화는 덜해도 근거는 있다.
  DEFAULT_ACTIONS: {
    '행동활성화':       ['하루 한 번 10분 걷기 (집 앞도 괜찮아요)', '아침에 일어나면 커튼 열고 창가에 1분 서 있기'],
    '인지재구성':       ['기분이 확 나빠진 순간 하나를 그날 밤 한 줄로 적기', '그때 스친 생각이 사실인지 근거를 한 줄 적기'],
    '행동실험':         ['걱정하는 일이 실제로 일어날지 예측을 먼저 적어두기', '작게 한 번 시도하고 실제 결과를 적어 비교하기'],
    '걱정 시간 정하기': ['걱정이 떠오르면 메모에 한 줄만 적고 미뤄두기', '저녁에 정해둔 15분 동안 그 메모를 몰아서 보기'],
    '점진적 노출':      ['피하던 일 중 가장 쉬운 것 하나를 골라 적기', '그 하나를 이번 주에 한 번 해보기'],
    '마음챙김 호흡':    ['하루 한 번, 정해진 시간에 3분 호흡하기', '답답해질 때 앱의 마음 안정 열어보기'],
    '자기자비 훈련':    ['자책이 올라오면 "친구가 이랬으면 뭐라고 할까" 떠올리기', '잠들기 전 오늘 해낸 일 하나 적기'],
    '수면 위생':        ['잘 시간 30분 전에 휴대폰 내려놓기', '아침에 같은 시각에 일어나기'],
    '문제해결치료':     ['막막한 고민 하나를 종이에 적고 세 조각으로 쪼개기', '그중 오늘 할 수 있는 한 조각만 해보기'],
    '대인관계 기술':    ['"지금은 어려워요" 를 소리 내어 세 번 연습하기', '실제 상황에서 한 번 써보기'],
    '반대 행동':        ['숨고 싶을 때 딱 한 사람에게 연락해보기', '그때 몸이 어땠는지 한 줄 적기'],
    '고통 감내':        ['견디기 힘들 때 찬물로 손목 씻기', '5분만 버텨보고 그 뒤에 어땠는지 적기']
  },

  // 이번 주에 체크할 할 일.
  //  리포트가 actions 를 비워 보내는 일이 있는데, 그러면 체크할 게 없어
  //  실행률이 영영 0% 다. 그럴 땐 같은 계획의 퀘스트를 할 일로 쓴다.
  weekActions(w) {
    // ① 리포트가 준 할 일
    if (w && Array.isArray(w.actions) && w.actions.length) return w.actions;
    // ② 같은 계획의 퀘스트
    const p = this.active();
    const qs = (p && Array.isArray(p.quests)) ? p.quests : [];
    const fromQuests = qs.slice(0, 3).map(q => q.text).filter(Boolean);
    if (fromQuests.length) return fromQuests;
    // ③ 기법별 기본 행동 — 여기까지 오면 리포트가 잘린 것이지만, 계획은 굴러가야 한다
    const tech = w && w.technique;
    if (tech && this.DEFAULT_ACTIONS[tech]) return this.DEFAULT_ACTIONS[tech].slice();
    return ['오늘 마음을 한 번 체크인하기', '자기 전 3분 호흡하기'];
  },

  currentWeek() {
    const p = this.active();
    if (!p) return null;
    return p.weeks[this.weekIndex() - 1] || p.weeks[p.weeks.length - 1] || null;
  },

  // --------------------------------------------------------------------------
  //  실행 체크
  // --------------------------------------------------------------------------
  _key(w, i) { return 'w' + w + 'a' + i; },

  isDone(w, i) {
    const p = this.active();
    return !!(p && p.done && p.done[this._key(w, i)]);
  },

  toggle(w, i) {
    const p = this.active();
    if (!p) return;
    const k = this._key(w, i);
    if (p.done[k]) {
      delete p.done[k];
      if (window.Sfx) window.Sfx.play('close');
    } else {
      p.done[k] = Date.now();
      if (window.Sfx) window.Sfx.hit('save');
      if (window.Farm && window.Farm.addWater) window.Farm.addWater(2, '케어플랜 실천');
      // 전후 기분을 두 번만 물어 기록한다 — 이게 쌓여서 "정말 듣는가"의 답이 된다
      const wk = this.currentWeek();
      const act = wk && wk.actions ? wk.actions[i] : '';
      if (window.Progress) setTimeout(() => window.Progress.askAfter(act, wk ? wk.technique : '', null), 260);
    }
    this._S()._safeSet('cbt_careplan', p);
    this.render();
  },

  // 이번 주 실행률 (0~1)
  progress() {
    const p = this.active();
    const w = this.currentWeek();
    if (!p || !w) return 0;
    const wi = this.weekIndex();
    const acts = this.weekActions(w);
    if (!acts.length) return 0;
    const done = acts.filter((_, i) => this.isDone(wi, i)).length;
    return done / acts.length;
  },

  // --------------------------------------------------------------------------
  //  후속 질문 — 챗봇이 먼저 꺼낼 것 (llm.js 가 가져간다)
  // --------------------------------------------------------------------------
  //  안부가 아니라 리포트에서 세운 가설을 확인하는 질문이다.
  //  예정일이 지났고 아직 안 물어본 것 중 가장 이른 하나를 돌려준다.
  dueFollowUp() {
    const p = this.active();
    if (!p || !p.followUps.length) return null;
    const d = this.dayIndex();
    const pending = p.followUps
      .filter(f => f && f.q && Number(f.day) <= d && !(p.asked && p.asked[f.day]))
      .sort((a, b) => Number(a.day) - Number(b.day));
    return pending[0] || null;
  },

  markAsked(day) {
    const p = this.active();
    if (!p) return;
    p.asked = p.asked || {};
    p.asked[day] = Date.now();
    this._S()._safeSet('cbt_careplan', p);
  },

  // --------------------------------------------------------------------------
  //  퀘스트 — missions.js 가 가져간다
  // --------------------------------------------------------------------------
  //  계획의 quests 를 날마다 돌려 쓰되, 같은 날엔 같은 것이 나오게 한다.
  questsFor(dateKey, n = 2) {
    const p = this.active();
    if (!p || !p.quests.length || this.isOver()) return [];
    const seed = String(dateKey).split('-').join('') | 0;
    const out = [];
    for (let k = 0; k < Math.min(n, p.quests.length); k++) {
      const q = p.quests[(seed + k) % p.quests.length];
      if (q && q.text && !out.some(x => x.text === q.text)) out.push(q);
    }
    return out;
  },

  // --------------------------------------------------------------------------
  //  챗봇 프롬프트용 요약
  // --------------------------------------------------------------------------
  promptContext() {
    const p = this.active();
    if (!p) return '';
    const w = this.currentWeek();
    const d = this.dayIndex();
    if (this.isOver()) {
      return `[케어플랜] 2주 과정이 끝났습니다(${d}일차). 초점은 "${p.focus}"였습니다.`
        + ` 잘 지킨 것과 못 지킨 것을 같이 돌아보고, 표준 검진(PHQ-9·GAD-7) 재검사를 권해 변화를 확인하세요.`;
    }
    const acts = this.weekActions(w).map((a, i) => `${this.isDone(this.weekIndex(), i) ? '✓' : '·'} ${a}`).join(' / ');
    const rate = Math.round(this.progress() * 100);
    return `[케어플랜 ${d}일차 · ${this.weekIndex()}주차]
초점: ${p.focus}
이번 주 목표: ${w ? w.goal : ''} (기법: ${w ? w.technique : ''})
할 일: ${acts || '(없음)'} — 이번 주 실행률 ${rate}%
${p.ifThen.length ? '막혔을 때 약속: ' + p.ifThen.map(x => `"${x.if}" → "${x.then}"`).join(' / ') : ''}
· 이 계획을 아는 사람처럼 대화하세요. 실행률이 낮으면 다그치지 말고 무엇이 걸렸는지 물으세요.
· 사용자가 이미 한 일을 다시 시키지 마세요(✓ 표시된 것).`;
  },

  // --------------------------------------------------------------------------
  //  화면 — 대시보드 상단 카드
  // --------------------------------------------------------------------------
  ic(name, size = 16, line) {
    return window.Icons ? window.Icons.svg(name, { size, line }) : '';
  },

  render() {
    const el = document.getElementById('careplan-card');
    if (!el) return;
    const p = this.active();
    if (!p) {
      // 리포트가 없어도 돌봄은 시작할 수 있어야 한다.
      el.classList.remove('hidden');
      const key = this._starterKey();
      const label = key === 'depress' ? '가라앉은 기분' : key === 'anxious' ? '불안·긴장' : '아직 방향을 찾는 중';
      // 리포트가 처방한 계획이 있으면 그게 우선이다 — 기본 코스는 그 아래 작은 선택지로 내린다.
      const rp = this.latestPlanReport();
      const hasReport = ((window.Assess && window.Assess.reports()) || []).length > 0;
      el.innerHTML = `
        <div class="glass-card" style="padding: 0.95rem 1rem; border-left: 4px solid var(--accent-primary);">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem;">
            <span style="line-height: 0; color: var(--accent-primary);">${this.ic('target', 17)}</span>
            <strong style="font-size: 0.92rem; color: var(--text-primary);">2주 케어플랜</strong>
            <span style="margin-left: auto; font-size: 0.7rem; font-weight: 800; color: var(--accent-primary);">무료</span>
          </div>
          ${rp ? `
            <p style="margin: 0 0 0.7rem; font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary);">
              내 리포트가 처방한 2주 계획이 준비돼 있어요.
            </p>
            <button class="btn-primary" style="width: 100%; padding: 0.7rem; font-size: 0.87rem;"
              onclick="window.CarePlan.adoptLatest()">내 계획으로 2주 시작하기</button>
            <button onclick="window.CarePlan.startStarter()"
              style="all: unset; display: block; width: 100%; text-align: center; margin-top: 0.55rem; cursor: pointer;
                     font-size: 0.73rem; font-weight: 700; color: var(--text-muted);">대신 기본 코스로 시작하기</button>
          ` : `
            <p style="margin: 0 0 0.7rem; font-size: 0.82rem; line-height: 1.6; color: var(--text-secondary);">
              <b>${label}</b>에 맞춘 2주 코스를 무료로 시작할 수 있어요.
            </p>
            <button class="btn-primary" style="width: 100%; padding: 0.7rem; font-size: 0.87rem;"
              onclick="window.CarePlan.startStarter()">2주 시작하기</button>
            <p style="margin: 0.5rem 0 0; font-size: 0.72rem; line-height: 1.55; color: var(--text-muted); text-align: center;">
              ${hasReport
                ? '지금 리포트에는 계획이 없어요 — 다음 리포트부터 담겨요'
                : 'AI 마음 리포트를 만들면 내 기록에 맞게 바뀌어요'}
            </p>
          `}
        </div>`;
      return;
    }
    el.classList.remove('hidden');

    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const d = this.dayIndex();
    const wi = this.weekIndex();
    const w = this.currentWeek();
    const over = this.isOver();
    const rate = Math.round(this.progress() * 100);
    const techNote = w && this.TECHNIQUES[w.technique] ? this.TECHNIQUES[w.technique] : '';

    const actList = this.weekActions(w);
    const actions = actList.map((a, i) => {
      const done = this.isDone(wi, i);
      return `
        <button onclick="window.CarePlan.toggle(${wi}, ${i})"
          style="all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 0.5rem; width: 100%; cursor: pointer;
                 padding: 0.55rem 0.6rem; border-radius: 11px; margin-bottom: 0.3rem;
                 background: ${done ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-tertiary)'};
                 border: 1px solid ${done ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)' : 'var(--glass-border)'};">
          <span style="flex-shrink: 0; width: 17px; height: 17px; margin-top: 1px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center;
                       background: ${done ? 'var(--accent-primary)' : 'transparent'}; border: 1.5px solid ${done ? 'var(--accent-primary)' : 'var(--text-muted)'};">
            ${done ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>' : ''}
          </span>
          <span style="flex: 1 1 0%; min-width: 0; font-size: 0.82rem; line-height: 1.55; font-weight: ${done ? '600' : '700'};
                       color: ${done ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${done ? 'line-through' : 'none'};">${esc(a)}</span>
        </button>`;
    }).join('');

    const ifThen = p.ifThen.length ? `
      <details style="margin-top: 0.55rem;">
        <summary style="cursor: pointer; font-size: 0.74rem; font-weight: 700; color: var(--text-muted);">막혔을 때 약속 ${p.ifThen.length}개</summary>
        <div style="margin-top: 0.4rem;">
          ${p.ifThen.map(x => `
            <div style="font-size: 0.76rem; line-height: 1.6; color: var(--text-secondary); padding: 0.3rem 0;">
              <b style="color: var(--text-primary);">${esc(x.if)}</b> 하면 → ${esc(x.then)}
            </div>`).join('')}
        </div>
      </details>` : '';

    // 2주가 끝나면 카드가 '재검사 하러 가기'로 바뀐다
    const body = over ? `
      <p style="margin: 0 0 0.7rem; font-size: 0.83rem; line-height: 1.6; color: var(--text-secondary);">
        2주 완료. 같은 검진을 다시 받아 변화를 확인할 차례예요.
      </p>
      <button class="btn-primary" style="width: 100%; padding: 0.7rem; font-size: 0.86rem;"
        onclick="window.Assess && window.Assess.startRetest()">검진 다시 하고 변화 보기</button>
      <button class="btn-secondary" style="width: 100%; margin-top: 0.35rem; padding: 0.5rem; font-size: 0.76rem;"
        onclick="window.CarePlan.restart()">새 계획 시작하기</button>`
      : `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <div style="flex: 1 1 0%; height: 6px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;">
          <div style="height: 100%; width: ${rate}%; background: var(--accent-primary); transition: width 0.3s;"></div>
        </div>
        <span style="flex-shrink: 0; font-size: 0.72rem; font-weight: 800; color: var(--accent-primary);">${rate}%</span>
      </div>
      <p style="margin: 0 0 0.5rem; font-size: 0.82rem; line-height: 1.65; color: var(--text-primary); font-weight: 700;">${esc(w ? w.goal : '')}</p>
      ${w && w.technique ? `<p style="margin: 0 0 0.6rem; font-size: 0.72rem; line-height: 1.55;">
        <b style="color: var(--accent-primary);">${esc(w.technique)}</b></p>` : ''}
      ${actions || `<p style="margin:0.2rem 0 0;font-size:0.78rem;line-height:1.6;color:var(--text-muted);">
        이번 주 할 일이 비어 있어요. 다음 리포트에서 채워집니다.</p>`}
      ${w && w.measure ? `<p style="margin: 0.45rem 0 0; font-size: 0.72rem; color: var(--text-muted); line-height: 1.55;">확인 방법 · ${esc(w.measure)}</p>` : ''}
      ${ifThen}
`;

    el.innerHTML = `
      <div class="glass-card" style="padding: 0.95rem 1rem; border-left: 4px solid var(--accent-primary);">
        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem;">
          <span style="line-height: 0; color: var(--accent-primary);">${this.ic('target', 17)}</span>
          <strong style="font-size: 0.92rem; color: var(--text-primary);">나의 케어플랜</strong>
          <span style="margin-left: auto; font-size: 0.7rem; font-weight: 800; color: var(--text-muted);">
            ${p.starter ? '기본 · ' : ''}${over ? '2주 완료' : `${d}일차 · ${wi}주차`}
          </span>
        </div>
        <p style="margin: 0 0 0.6rem; font-size: 0.78rem; line-height: 1.6; color: var(--text-secondary);">${esc(p.focus)}</p>
        ${body}
        ${p.redFlag ? `<p style="margin: 0.6rem 0 0; padding-top: 0.5rem; border-top: 1px dashed var(--glass-border); font-size: 0.71rem; line-height: 1.55; color: #c14a4a;">
          멈추고 전문가에게 갈 신호 · ${esc(p.redFlag)}</p>` : ''}
      </div>`;
  }
};
