window.Learn = {
  iconMap: {
    'all-or-nothing':'d_all','overgeneralization':'d_over','mental-filter':'d_filter',
    'disqualifying-positive':'d_disq','jumping-conclusions':'d_jump','magnification-minimization':'d_mag',
    'emotional-reasoning':'d_emo','should-statements':'d_should','personalization':'d_person','labeling':'d_label'
  },
  distortions: [
    {
      id: 'all-or-nothing',
      emoji: '',
      name: '이분법적 사고',
      nameEn: 'All-or-Nothing Thinking',
      brief: '세상을 흑백으로만 봐요',
      description: '상황을 오직 두 가지 범주로만 봅니다. 완벽하지 않으면 완전한 실패로 여기죠. 회색 지대나 중간 단계가 존재하지 않는다고 생각합니다.',
      example: '"시험에서 100점이 아니면 나는 실패자야."',
      counter: '완벽과 실패 사이에는 넓은 스펙트럼이 있어요. 80점도 훌륭한 성과이며, 작은 실수로 전체가 망가지는 것은 아닙니다.',
      color: '#5fa986'
    },
    {
      id: 'overgeneralization',
      emoji: '',
      name: '과잉일반화',
      nameEn: 'Overgeneralization',
      brief: '하나를 보고 전체를 판단해요',
      description: '한두 번의 부정적인 사건을 마치 끝없이 반복될 실패의 법칙처럼 결론짓습니다. "항상", "절대"라는 단어를 자주 사용합니다.',
      example: '"이번 면접에 떨어졌어. 나는 평생 취업을 못할 거야."',
      counter: '하나의 사건은 그저 하나의 사건일 뿐입니다. 한 번의 실패가 미래의 모든 결과를 결정하지 않아요.',
      color: '#7ba0b8'
    },
    {
      id: 'mental-filter',
      emoji: '',
      name: '정신적 필터',
      nameEn: 'Mental Filter',
      brief: '안 좋은 것만 골라 봐요',
      description: '긍정적인 부분은 모두 걸러내고, 오직 부정적인 세부사항 하나에만 집착하여 전체 상황을 어둡게 해석합니다.',
      example: '"발표 때 칭찬을 많이 받았지만, 중간에 한 번 말을 더듬은 것 때문에 발표를 망쳤어."',
      counter: '전체 그림을 보세요. 긍정적인 경험과 성과도 부정적인 부분만큼이나 중요하고 진짜입니다.',
      color: '#c98a5a'
    },
    {
      id: 'disqualifying-positive',
      emoji: '',
      name: '긍정 격하',
      nameEn: 'Disqualifying the Positive',
      brief: '좋은 일은 운으로 돌려요',
      description: '긍정적인 경험이나 성과를 "운이 좋았을 뿐"이라거나 "누구나 할 수 있는 일"이라며 가치를 깎아내립니다.',
      example: '"이번 프로젝트 성공은 내가 잘해서가 아니라 팀원들 덕분이야. 내 능력은 아니지."',
      counter: '자신의 노력과 성과를 정당하게 인정하세요. 좋은 결과에는 당신의 기여가 분명히 있습니다.',
      color: '#d98a84'
    },
    {
      id: 'jumping-conclusions',
      emoji: '',
      name: '예단',
      nameEn: 'Jumping to Conclusions',
      brief: '근거 없이 결론을 내려요',
      description: '확실한 증거가 없는데도 부정적인 결론을 서둘러 내립니다. 독심술(타인이 나를 나쁘게 생각할 거라 믿음)이나 점쟁이 오류(미래가 나쁠 거라 단정) 형태로 나타납니다.',
      example: '"친구가 답장을 안 하네. 분명 나한테 화가 난 게 틀림없어."',
      counter: '객관적인 사실과 나의 추측을 분리하세요. 증거를 확인하기 전까지는 다른 가능성(친구가 바쁘다)을 열어두세요.',
      color: '#e0a94b'
    },
    {
      id: 'magnification-minimization',
      emoji: '',
      name: '극대화/축소화',
      nameEn: 'Magnification/Minimization',
      brief: '단점은 크게, 장점은 작게',
      description: '자신의 실수나 타인의 장점은 쌍안경으로 보듯 부풀리고, 자신의 장점이나 타인의 실수는 거꾸로 보듯 축소합니다.',
      example: '"보고서에서 오타가 하나 났으니 나는 끝이야. (극대화) 내가 딴 자격증은 누구나 따는 거잖아. (축소화)"',
      counter: '사건의 크기를 현실적인 비율로 바라보세요. 모두가 실수를 하며, 당신의 장점도 가치가 있습니다.',
      color: '#cf6b60'
    },
    {
      id: 'emotional-reasoning',
      emoji: '',
      name: '감정적 추리',
      nameEn: 'Emotional Reasoning',
      brief: '내 감정이 곧 사실이에요',
      description: '자신의 부정적인 감정이 현실을 정확하게 반영한다고 믿습니다. "내가 그렇게 느끼니까 그건 사실이다"라고 생각합니다.',
      example: '"내가 너무 불안한 걸 보니, 이 일은 분명 실패할 거야."',
      counter: '감정은 사실이 아닙니다. 감정은 생각에서 비롯될 뿐, 상황의 진실을 알려주는 지표가 아닙니다.',
      color: '#6bab9a'
    },
    {
      id: 'should-statements',
      emoji: '',
      name: '당위적 명령',
      nameEn: 'Should Statements',
      brief: '~해야만 한다고 압박해요',
      description: '자신이나 타인에게 엄격하고 비현실적인 규칙을 정해두고, "반드시 ~해야 한다", "절대 ~해서는 안 된다"라고 스스로를 압박합니다.',
      example: '"나는 항상 완벽하게 친절해야만 해. 화를 내는 건 나쁜 사람이나 하는 짓이야."',
      counter: '절대적인 규칙 대신 "~하면 좋겠다"나 "노력해보겠다"로 바꿔보세요. 융통성을 가지면 죄책감이 줄어듭니다.',
      color: '#b08fb0'
    },
    {
      id: 'personalization',
      emoji: '',
      name: '개인화',
      nameEn: 'Personalization',
      brief: '모든 게 내 탓이에요',
      description: '자신이 통제할 수 없거나 자신과 직접적인 관련이 없는 부정적인 사건조차 모두 자신의 책임으로 돌립니다.',
      example: '"팀 프로젝트가 실패한 건 전적으로 내가 분위기를 잘 이끌지 못했기 때문이야."',
      counter: '결과에 영향을 미친 다양한 외부 요인들을 살펴보세요. 모든 일의 원인이 당신에게만 있는 것은 아닙니다.',
      color: '#d98466'
    },
    {
      id: 'labeling',
      emoji: '',
      name: '낙인찍기',
      nameEn: 'Labeling',
      brief: '나와 타인에게 꼬리표를 붙여요',
      description: '하나의 행동이나 실수를 바탕으로 자신이나 타인에게 극단적이고 부정적인 꼬리표를 붙입니다.',
      example: '"다이어트에 하루 실패했어. 나는 의지박약 돼지야."',
      counter: '사람의 성향과 단일 행동을 분리하세요. "나는 실수를 한 사람"이지, "실패자 그 자체"가 아닙니다.',
      color: '#8a9c6e'
    }
  ],
  
  quizQuestions: [
    { text: '"이번 면접에서 떨어지다니, 난 평생 취업 못 할 거야."', answerId: 'overgeneralization', explanation: '한 번의 실패를 영원한 실패로 일반화하고 있어요.' },
    { text: '"오늘 상사가 인사를 안 받았어. 분명 내가 어제 한 실수 때문에 화난 거야."', answerId: 'jumping-conclusions', explanation: '독심술을 통해 명확한 근거 없이 결론을 내렸어요.' },
    { text: '"99점을 받았지만 1점이 깎였으니 이번 시험은 망친 거나 다름없어."', answerId: 'all-or-nothing', explanation: '완벽하지 않은 것은 실패라고 이분법적으로 생각하고 있어요.' },
    { text: '"내가 발표를 망쳐서 우리 팀 전체의 분위기가 안 좋아진 거야."', answerId: 'personalization', explanation: '팀의 분위기를 온전히 자신의 탓으로 돌리고 있어요.' },
    { text: '"내가 이렇게 멍청하게 느껴지는 걸 보면, 난 진짜 바보가 틀림없어."', answerId: 'emotional-reasoning', explanation: '감정을 곧 사실로 믿는 감정적 추리를 하고 있어요.' },
    { text: '"이번 프로젝트 성과가 좋았던 건 그냥 운이 좋았기 때문이지, 내 실력이 아니야."', answerId: 'disqualifying-positive', explanation: '자신의 능력으로 이룬 성과를 운으로 격하하고 있어요.' },
    { text: '"나는 절대로 실수해서는 안 돼. 항상 남들에게 모범을 보여야 해."', answerId: 'should-statements', explanation: '스스로에게 무리한 절대적 규칙을 강요하는 당위적 명령이에요.' },
    { text: '"약속에 10분 늦다니, 난 진짜 쓸모없는 인간이야."', answerId: 'labeling', explanation: '하나의 실수에 대해 스스로에게 극단적인 꼬리표를 붙였어요.' },
    { text: '"친구들이 내 농담에 웃어줬지만, 처음에 내 인사가 어색했던 것만 계속 떠올라."', answerId: 'mental-filter', explanation: '긍정적인 반응은 거르고 부정적인 세부사항에만 집착하고 있어요.' },
    { text: '"내 보고서의 작은 오타 하나 때문에 전체 기획안이 쓰레기가 됐어."', answerId: 'magnification-minimization', explanation: '작은 실수를 극단적으로 부풀려 해석하고 있어요.' },
    { text: '"다이어트 중인데 과자를 한 입 먹어버렸네. 오늘 다이어트는 완전히 끝났어, 다 먹어버려야지."', answerId: 'all-or-nothing', explanation: '조금의 틈도 실패로 간주하는 이분법적 사고입니다.' },
    { text: '"소개팅에서 분위기가 별로였어. 난 연애와는 담을 쌓고 살 운명인가봐."', answerId: 'overgeneralization', explanation: '한 번의 안 좋은 경험을 인생 전체의 패턴으로 일반화합니다.' },
    { text: '"내가 우울한 기분이 드는 걸 보니 내 인생은 답이 없어."', answerId: 'emotional-reasoning', explanation: '우울한 감정을 인생 전체가 잘못되었다는 증거로 삼고 있어요.' },
    { text: '"내가 이렇게 힘든 건 부모님을 충분히 챙기지 못한 내 죄책감 때문이야."', answerId: 'personalization', explanation: '모든 상황을 자신의 과실로 연결시키는 개인화입니다.' },
    { text: '"사람들은 당연히 내가 먼저 연락하기 전에는 절대 연락하면 안 돼."', answerId: 'should-statements', explanation: '타인의 행동에 대해 자신만의 엄격한 규칙(당위)을 적용하고 있어요.' }
  ],
  
  currentQuizIndex: 0,
  quizScore: 0,
  
  init() {
    if (this._inited) return; this._inited = true;
    this.renderCards();
    
    const quizStartBtn = document.getElementById('quiz-start');
    if (quizStartBtn) quizStartBtn.addEventListener('click', () => this.startQuiz());
    
    const detailClose = document.getElementById('detail-close');
    if (detailClose) detailClose.addEventListener('click', () => {
      document.getElementById('distortion-detail-modal').classList.add('hidden');
    });
  },
  
  renderCards() {
    const container = document.getElementById('distortion-cards');
    if (!container) return;
    
    container.innerHTML = '';
    this.distortions.forEach(dist => {
      const card = document.createElement('div');
      card.className = 'distortion-card glass-card';
      card.style.borderTop = `4px solid ${dist.color}`;
      card.innerHTML = `
        <div class="dc-icon" style="color:${dist.color}">${window.Icons ? window.Icons.svg(this.iconMap[dist.id],{size:28}) : ''}</div>
        <h3 class="dc-title">${dist.name}</h3>
        <p class="dc-subtitle">${dist.nameEn}</p>
        <p class="dc-brief">${dist.brief}</p>
      `;
      card.addEventListener('click', () => this.showDetail(dist.id));
      container.appendChild(card);
    });
  },
  
  showDetail(id) {
    const dist = this.distortions.find(d => d.id === id);
    if (!dist) return;
    
    const modal = document.getElementById('distortion-detail-modal');
    const content = document.getElementById('detail-content');
    
    content.innerHTML = `
      <div class="detail-header" style="background-color: ${dist.color}20; color: ${dist.color}">
        <div class="detail-emoji">${window.Icons ? window.Icons.svg(this.iconMap[dist.id],{size:40}) : ''}</div>
        <h2>${dist.name}</h2>
        <p>${dist.nameEn}</p>
      </div>
      <div class="detail-body">
        <div class="detail-section">
          <h3 class="card-head">${window.Icons?window.Icons.svg('bulb',{size:18}):''}어떤 왜곡인가요?</h3>
          <p>${dist.description}</p>
        </div>
        <div class="detail-section">
          <h3 class="card-head">${window.Icons?window.Icons.svg('quote',{size:18}):''}예를 들면</h3>
          <p class="detail-example"><i>${dist.example}</i></p>
        </div>
        <div class="detail-section">
          <h3 class="card-head">${window.Icons?window.Icons.svg('sparkle',{size:18}):''}이렇게 바꿔봐요</h3>
          <p class="detail-counter">${dist.counter}</p>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
  },
  
  startQuiz() {
    this.currentQuizIndex = 0;
    this.quizScore = 0;
    // Shuffle questions optionally
    this.quizQuestions.sort(() => Math.random() - 0.5);
    
    document.getElementById('quiz-start').classList.add('hidden');
    this.renderQuestion();
  },
  
  renderQuestion() {
    const container = document.getElementById('quiz-content');
    if (!container) return;
    
    if (this.currentQuizIndex >= 15 || this.currentQuizIndex >= this.quizQuestions.length) {
      this.showResults();
      return;
    }
    
    const q = this.quizQuestions[this.currentQuizIndex];
    
    // Generate 4 options (1 correct, 3 random incorrect)
    const options = [q.answerId];
    while(options.length < 4) {
      const randDist = this.distortions[Math.floor(Math.random() * this.distortions.length)].id;
      if (!options.includes(randDist)) {
        options.push(randDist);
      }
    }
    options.sort(() => Math.random() - 0.5);
    
    let optionsHtml = options.map(optId => {
      const dist = this.distortions.find(d => d.id === optId);
      return `<button class="quiz-option" data-id="${optId}"><span class="qo-ico" style="color:${dist.color}">${window.Icons?window.Icons.svg(this.iconMap[optId],{size:18}):''}</span>${dist.name}</button>`;
    }).join('');
    
    container.innerHTML = `
      <div class="quiz-progress">문제 ${this.currentQuizIndex + 1} / 15</div>
      <div class="quiz-question-box">
        <p class="quiz-q-text">${q.text}</p>
        <p class="quiz-q-sub">이 생각에는 어떤 인지 왜곡이 숨어있을까요?</p>
      </div>
      <div class="quiz-options">
        ${optionsHtml}
      </div>
      <div id="quiz-feedback" class="quiz-feedback hidden"></div>
    `;
    
    container.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', (e) => this.selectAnswer(e.target.dataset.id, q.answerId, q.explanation));
    });
  },
  
  selectAnswer(selectedId, correctId, explanation) {
    const container = document.getElementById('quiz-content');
    const options = container.querySelectorAll('.quiz-option');
    const feedback = document.getElementById('quiz-feedback');
    
    options.forEach(btn => {
      btn.disabled = true; // disable all
      if (btn.dataset.id === correctId) {
        btn.classList.add('correct');
      } else if (btn.dataset.id === selectedId) {
        btn.classList.add('incorrect');
      }
    });
    
    const isCorrect = selectedId === correctId;
    if (isCorrect) this.quizScore++;
    
    feedback.innerHTML = `
      <p class="${isCorrect ? 'text-green-600' : 'text-red-500'} font-bold">
        ${isCorrect ? '정답입니다!' : '아쉽네요.'}
      </p>
      <p>${explanation}</p>
    `;
    feedback.classList.remove('hidden');
    
    setTimeout(() => {
      this.currentQuizIndex++;
      this.renderQuestion();
    }, 3000);
  },
  
  showResults() {
    const container = document.getElementById('quiz-content');
    const total = Math.min(15, this.quizQuestions.length);
    const score = this.quizScore;
    const pct = score / total;
    
    let msg = '';
    if (pct === 1) msg = '완벽해요!! 인지 왜곡 마스터네요';
    else if (pct >= 0.7) msg = '훌륭합니다! 인지 왜곡을 아주 잘 이해하고 계세요';
    else if (pct >= 0.4) msg = '좋습니다! 조금만 더 연습하면 금방 익숙해질 거예요';
    else msg = '괜찮아요! 인지 왜곡은 처음엔 헷갈릴 수 있어요. 가이드를 다시 한번 읽어볼까요?';
    
    container.innerHTML = `
      <div class="quiz-results">
        <h2>퀴즈 결과</h2>
        <div class="quiz-score">${score} / ${total}</div>
        <p class="quiz-msg">${msg}</p>
        <button id="quiz-retry" class="btn-primary">다시 도전하기</button>
      </div>
    `;
    
    document.getElementById('quiz-retry').addEventListener('click', () => this.startQuiz());
  }
};

document.addEventListener('DOMContentLoaded', () => window.Learn.init());
