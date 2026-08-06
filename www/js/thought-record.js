window.ThoughtRecord = {
  iconMap: {
    'all-or-nothing':'d_all','overgeneralization':'d_over','mental-filter':'d_filter',
    'disqualifying-positive':'d_disq','jumping-conclusions':'d_jump','magnification-minimization':'d_mag',
    'emotional-reasoning':'d_emo','should-statements':'d_should','personalization':'d_person','labeling':'d_label'
  },
  distortions: [
    { id: 'all-or-nothing', label: '이분법적 사고', emoji: '' },
    { id: 'overgeneralization', label: '과잉일반화', emoji: '' },
    { id: 'mental-filter', label: '정신적 필터', emoji: '' },
    { id: 'disqualifying-positive', label: '긍정 격하', emoji: '' },
    { id: 'jumping-conclusions', label: '예단', emoji: '' },
    { id: 'magnification-minimization', label: '극대화/축소화', emoji: '' },
    { id: 'emotional-reasoning', label: '감정적 추리', emoji: '' },
    { id: 'should-statements', label: '당위적 명령', emoji: '' },
    { id: 'personalization', label: '개인화', emoji: '' },
    { id: 'labeling', label: '낙인찍기', emoji: '' }
  ],
  
  init() {
    if (this._inited) return; this._inited = true;
    const btnNew = document.getElementById('btn-new-record');
    if (btnNew) btnNew.addEventListener('click', () => this.showForm());
    
    const formClose = document.getElementById('record-form-close');
    const formCancel = document.getElementById('rf-cancel');
    if (formClose) formClose.addEventListener('click', () => this.hideForm());
    if (formCancel) formCancel.addEventListener('click', () => this.hideForm());
    
    const addEmotionBtn = document.getElementById('rf-add-emotion');
    if (addEmotionBtn) {
      addEmotionBtn.addEventListener('click', () => {
        this.addEmotionRow(document.getElementById('rf-emotions'));
      });
    }
    
    const form = document.getElementById('record-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
      // 슬라이더 값 실시간 표시
      form.addEventListener('input', (e) => {
        if (e.target.type === 'range') {
          const row = e.target.closest('.emotion-row');
          const span = row && row.querySelector('.emotion-value, .intensity-value');
          if (span) span.textContent = e.target.value + (span.classList.contains('intensity-value') ? '%' : '');
        }
      });
    }

    this.setupDistortionChips();

    if (window.Storage.getThoughtRecords().length === 0) {
      this.populateMockRecords();
    }

    this.loadRecords();
  },
  
  populateMockRecords() {
    const now = Date.now();
    const DAY_MS = 1000 * 60 * 60 * 24;

    const mockRecords = [
      {
        id: 'rec_mock_1',
        date: new Date(now - DAY_MS * 0).toISOString(),
        situation: '팀장님께 주간 보고서를 제출했을 때, 아무 설명 없이 한숨을 푹 쉬셨음.',
        thought: '내 보고서가 마음에 안 들어서 날 무능하다고 생각하시는 게 틀림없어. 이번 인사평가 망했다.',
        emotions: [{ name: '불안함', intensity: 85 }, { name: '위축감', intensity: 75 }],
        distortions: ['jumping-conclusions', 'personalization'],
        alternative: '팀장님의 한숨은 피곤함이나 다른 업무 스트레스 때문일 수 있다. 피드백을 직접 받기 전까지 내 멋대로 지레짐작하지 말자.',
        newEmotions: '불안함 35%, 편안함 65%'
      },
      {
        id: 'rec_mock_2',
        date: new Date(now - DAY_MS * 1).toISOString(),
        situation: '자격증 시험 결과가 발표되어 92점으로 합격했으나 수석 1등을 놓쳤을 때',
        thought: '1등을 못 했으니 결국 완전한 실패자나 다름없어. 완벽하게 해내지 못해서 수치스럽다.',
        emotions: [{ name: '자책감', intensity: 80 }, { name: '좌절감', intensity: 70 }],
        distortions: ['all-or-nothing', 'jumping-conclusions'],
        alternative: '92점이라는 점수와 합격 자체도 충분히 값진 결과이다. 성공과 실패 사이에는 무수한 성장의 과정이 존재한다.',
        newEmotions: '자존감 75%, 성취감 70%'
      },
      {
        id: 'rec_mock_3',
        date: new Date(now - DAY_MS * 2).toISOString(),
        situation: '친구 단톡방에 주말 저녁 모임을 제안했는데 몇 시간 동안 아무도 답장이 없을 때',
        thought: '다들 속으로 날 귀찮아하고 은근히 따돌리려는 게 분명해.',
        emotions: [{ name: '외로움', intensity: 85 }, { name: '서운함', intensity: 80 }],
        distortions: ['jumping-conclusions', 'personalization', 'all-or-nothing'],
        alternative: '퇴근 시간대라 다들 바쁘거나 확인을 못했을 뿐이다. 답장이 늦는 것은 내 가치나 인품과 아무 상관이 없다.',
        newEmotions: '외로움 30%, 편안함 70%'
      },
      {
        id: 'rec_mock_4',
        date: new Date(now - DAY_MS * 3).toISOString(),
        situation: '내일 회사 전체 미팅에서 10분간 연사 발표를 앞두고 가슴이 심하게 두근거릴 때',
        thought: '이렇게 극도로 불안하고 심장이 뛰는 걸 보니 내일 발표 때 말이 막히고 완전히 망할 거야.',
        emotions: [{ name: '극심한 불안', intensity: 90 }, { name: '중압감', intensity: 85 }],
        distortions: ['jumping-conclusions', 'overgeneralization'],
        alternative: '신체적 긴장감은 중요한 일을 앞둔 정상적인 에너지 활성화 반응일 뿐이다. 불안한 기분이 실패 결과를 의미하진 않는다.',
        newEmotions: '용기 65%, 평정심 60%'
      },
      {
        id: 'rec_mock_5',
        date: new Date(now - DAY_MS * 4).toISOString(),
        situation: '프로젝트 리뷰에서 칭찬 3개와 아쉬운 피드백 1개를 받았을 때',
        thought: '결국 그 아쉬운 점 하나 때문에 이번 발표와 내 노력은 전부 꽝이 된 거야.',
        emotions: [{ name: '침울함', intensity: 75 }, { name: '무기력', intensity: 65 }],
        distortions: ['jumping-conclusions', 'personalization', 'mental-filter'],
        alternative: '받은 3가지 긍정적 칭찬의 가치도 똑같이 인정하자. 부족한 1가지는 다음 개선을 위한 힌트일 뿐이다.',
        newEmotions: '자신감 70%, 안도감 60%'
      },
      {
        id: 'rec_mock_6',
        date: new Date(now - DAY_MS * 5).toISOString(),
        situation: '새 모임 첫날 사람들과 대화하다 엉뚱한 단어를 말해 잠시 어색한 정적이 흘렀을 때',
        thought: '난 늘 사교 모임에서 말실수를 하는 사회성 제로인 사람이다.',
        emotions: [{ name: '부끄러움', intensity: 80 }, { name: '위축감', intensity: 75 }],
        distortions: ['all-or-nothing', 'overgeneralization'],
        alternative: '단 한 번의 말실수로 나라는 사람 전체를 단정지을 수 없다. 누구나 처음 만난 자리에서는 어색할 수 있다.',
        newEmotions: '수용 75%, 평온 65%'
      },
      {
        id: 'rec_mock_7',
        date: new Date(now - DAY_MS * 6).toISOString(),
        situation: '주말 동안 운동과 독서 계획을 짰으나 몸이 지쳐 하루 종일 늦잠을 잤을 때',
        thought: '나는 의지력이 빵점이고 평생 이렇게 나태하게 살 게 틀림없어.',
        emotions: [{ name: '무기력', intensity: 85 }, { name: '죄책감', intensity: 80 }],
        distortions: ['all-or-nothing'],
        alternative: '몸이 충분한 휴식을 원했던 것이다. 오늘 하루 쉰 것이 내 전체 삶의 의지력을 결정하지 않는다.',
        newEmotions: '휴식감 80%, 편안함 70%'
      }
    ];

    mockRecords.forEach(rec => {
      window.Storage.saveThoughtRecord(rec);
      (rec.distortions || []).forEach(d => {
        window.Storage.incrementDistortion(d);
      });
    });
  },
  
  loadRecords() {
    const records = window.Storage.getThoughtRecords() || [];
    const container = document.getElementById('record-list');
    const emptyState = document.getElementById('record-empty');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    if (records.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      
      const isOnlyMock = records.every(r => r.id && r.id.startsWith('rec_mock_'));
      if (isOnlyMock) {
        const noticeBanner = document.createElement('div');
        noticeBanner.className = 'sample-notice-banner';
        noticeBanner.style.cssText = 'background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-secondary)); border: 1px solid color-mix(in srgb, var(--accent-primary) 32%, transparent); border-radius: 12px; padding: 0.95rem 1.1rem; margin-bottom: 1.1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; box-shadow: var(--shadow-sm);';
        noticeBanner.innerHTML = `
          <div style="font-size: 0.84rem; color: var(--text-primary); line-height: 1.45;">
            💡 <strong>가이드용 샘플 사고 기록 안내</strong><br>
            현재 기록은 0건일 때 안내되는 <strong>샘플 데이터</strong>입니다. 챗봇 대화나 직접 작성으로 내 사고 기록이 생성되면 <strong>샘플은 자동으로 삭제</strong>됩니다!
          </div>
          <span style="background: var(--accent-primary); color: #fff; font-size: 0.73rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 20px; white-space: nowrap; flex-shrink: 0;">샘플 데이터</span>
        `;
        container.appendChild(noticeBanner);
      }

      // Sort by descending date
      records.sort((a, b) => new Date(b.date) - new Date(a.date));
      records.forEach(record => {
        container.appendChild(this.renderRecordCard(record));
      });
    }
  },
  
  renderRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card glass-card';
    const isMock = record.id && record.id.startsWith('rec_mock_');
    
    const dateStr = new Date(record.date).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    let emotionsHtml = (record.emotions || []).map(e => {
      let intensityColor = e.intensity > 70 ? 'high' : e.intensity > 40 ? 'med' : 'low';
      return `<span class="emotion-tag intensity-${intensityColor}">${e.name} ${e.intensity}%</span>`;
    }).join('');
    
    let distortionsHtml = (record.distortions || []).map(dId => {
      const dist = this.distortions.find(d => d.id === dId);
      return dist ? `<span class="distortion-chip small"><span class="chip-ico">${window.Icons?window.Icons.svg(this.iconMap[dist.id],{size:14}):''}</span>${dist.label}</span>` : '';
    }).join('');
    
    card.innerHTML = `
      <div class="record-header">
        <span class="record-date">
          ${dateStr}
          ${isMock ? '<span style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-muted); font-size: 0.7rem; font-weight: 700; padding: 0.12rem 0.45rem; border-radius: 4px; margin-left: 0.35rem;">샘플</span>' : ''}
          ${record.source === 'chat' ? '<span style="background: color-mix(in srgb, var(--accent-primary) 14%, transparent); color: var(--accent-primary); font-size: 0.7rem; font-weight: 700; padding: 0.12rem 0.45rem; border-radius: 4px; margin-left: 0.35rem;">AI 자동 기록</span>' : ''}
        </span>
        <button class="btn-delete-record" data-id="${record.id}" aria-label="삭제">${window.Icons?window.Icons.svg('close',{size:16}):'✕'}</button>
      </div>
      <div class="record-body">
        <div class="record-section">
          <strong>상황:</strong>
          <p class="record-text clamp">${record.situation || ''}</p>
        </div>
        <div class="record-section">
          <strong>자동적 사고:</strong>
          <p class="record-text clamp">${record.thought || ''}</p>
        </div>
        ${emotionsHtml ? `<div class="record-emotions">${emotionsHtml}</div>` : ''}
        ${distortionsHtml ? `<div class="record-distortions">${distortionsHtml}</div>` : ''}
        
        <div class="record-detail hidden">
          <div class="record-section">
            <strong>대안적 사고:</strong>
            <p class="record-text">${record.alternative || ''}</p>
          </div>
          ${record.newEmotions ? `<div class="record-section"><strong>새로운 감정 결과:</strong><p>${record.newEmotions}</p></div>` : ''}
        </div>
      </div>
      <button class="btn-expand-record">자세히 보기 ▼</button>
    `;
    
    card.querySelector('.btn-delete-record').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteRecord(record.id);
    });
    
    card.querySelector('.btn-expand-record').addEventListener('click', (e) => {
      this.expandRecord(card);
      const btn = e.target;
      if (card.querySelector('.record-detail').classList.contains('hidden')) {
        btn.textContent = '자세히 보기 ▼';
        card.querySelectorAll('.clamp').forEach(el => el.classList.add('clamp'));
      } else {
        btn.textContent = '접기 ▲';
        card.querySelectorAll('.clamp').forEach(el => el.classList.remove('clamp'));
      }
    });
    
    return card;
  },
  
  showForm(prefilled = {}) {
    const overlay = document.getElementById('record-form-overlay');
    const form = document.getElementById('record-form');
    if (!overlay || !form) return;
    
    form.reset();
    
    // Clear dynamic emotions
    const emotionsContainer = document.getElementById('rf-emotions');
    if (emotionsContainer) emotionsContainer.innerHTML = '';
    this.addEmotionRow(emotionsContainer);
    
    // Reset distortion chips
    document.querySelectorAll('#rf-distortions .distortion-chip').forEach(chip => {
      chip.classList.remove('selected');
    });
    
    if (prefilled.thought) document.getElementById('rf-thought').value = prefilled.thought;
    if (prefilled.situation) document.getElementById('rf-situation').value = prefilled.situation;
    
    overlay.classList.remove('hidden');
  },
  
  hideForm() {
    const overlay = document.getElementById('record-form-overlay');
    if (overlay) overlay.classList.add('hidden');
  },
  
  setupDistortionChips() {
    const container = document.getElementById('rf-distortions');
    if (!container) return;
    
    container.innerHTML = '';
    this.distortions.forEach(dist => {
      const chip = document.createElement('div');
      chip.className = 'distortion-chip';
      chip.dataset.id = dist.id;
      chip.innerHTML = `<span class="chip-ico">${window.Icons?window.Icons.svg(this.iconMap[dist.id],{size:15}):''}</span>${dist.label}`;
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
      });
      container.appendChild(chip);
    });
  },
  
  addEmotionRow(container) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'emotion-row';
    row.innerHTML = `
      <input type="text" class="emotion-name" placeholder="감정 (예: 우울함, 불안함)" required>
      <input type="range" class="emotion-intensity" min="0" max="100" value="50">
      <span class="intensity-value">50%</span>
      <button type="button" class="btn-remove-emotion" aria-label="삭제">${window.Icons?window.Icons.svg('close',{size:14}):'✕'}</button>
    `;
    
    const slider = row.querySelector('.emotion-intensity');
    const display = row.querySelector('.intensity-value');
    slider.addEventListener('input', (e) => {
      display.textContent = `${e.target.value}%`;
    });
    
    row.querySelector('.btn-remove-emotion').addEventListener('click', () => {
      if (container.children.length > 1) row.remove();
    });
    
    container.appendChild(row);
  },
  
  handleSubmit() {
    const situation = document.getElementById('rf-situation').value;
    const thought = document.getElementById('rf-thought').value;
    const alternative = document.getElementById('rf-alternative').value;

    const readEmotions = (sel) => Array.from(document.querySelectorAll(sel + ' .emotion-row')).map(row => {
      const nameEl = row.querySelector('.emotion-name');
      const rangeEl = row.querySelector('.emotion-intensity, .emotion-slider');
      return {
        name: nameEl ? nameEl.value : '',
        intensity: rangeEl ? parseInt(rangeEl.value, 10) : 0
      };
    }).filter(e => e.name.trim() !== '');

    const emotions = readEmotions('#rf-emotions');
    // 변화된 감정: 표시용 문자열로 정리
    const newEmotions = readEmotions('#rf-new-emotions').map(e => `${e.name} ${e.intensity}%`).join(', ');
    
    const selectedDistortions = Array.from(document.querySelectorAll('#rf-distortions .distortion-chip.selected'))
      .map(chip => chip.dataset.id);
    
    const record = {
      id: 'rec_' + Date.now(),
      date: new Date().toISOString(),
      situation,
      thought,
      emotions,
      distortions: selectedDistortions,
      alternative,
      newEmotions
    };
    
    window.Storage.saveThoughtRecord(record);
    
    // Update distortion stats
    selectedDistortions.forEach(distId => {
      window.Storage.incrementDistortion(distId);
    });
    
    // Add mood entry based on primary emotion (if any)
    if (emotions.length > 0) {
      // rough heuristic: inverse of average negative intensity
      let avgInt = emotions.reduce((sum, e) => sum + e.intensity, 0) / emotions.length;
      let moodScore = Math.max(1, Math.min(5, Math.round(5 - (avgInt / 25))));
      window.Storage.saveMoodEntry({
        date: new Date().toISOString(),
        score: moodScore
      });
    }
    
    this.hideForm();
    this.loadRecords();
    
    if (window.Dashboard && window.App.currentTab === 'dashboard') {
      window.Dashboard.refresh();
    }
  },
  
  deleteRecord(id) {
    if (confirm('이 기록을 삭제하시겠습니까?')) {
      window.Storage.deleteThoughtRecord(id);
      this.loadRecords();
    }
  },
  
  expandRecord(cardElement) {
    const detail = cardElement.querySelector('.record-detail');
    if (detail) detail.classList.toggle('hidden');
  },
  
  createFromChat(data) {
    window.App.switchTab('record');
    this.showForm(data);
  }
};

document.addEventListener('DOMContentLoaded', () => window.ThoughtRecord.init());
