window.ThoughtRecord = {
  iconMap: {
    'all-or-nothing':'d_all','overgeneralization':'d_over','mental-filter':'d_filter',
    'disqualifying-positive':'d_disq','jumping-conclusions':'d_jump','magnification-minimization':'d_mag',
    'emotional-reasoning':'d_emo','should-statements':'d_should','personalization':'d_person','labeling':'d_label'
  },
  distortions: [
    { id: 'all-or-nothing', label: '이분법적 사고', icon: 'd_all' },
    { id: 'overgeneralization', label: '과잉일반화', icon: 'd_over' },
    { id: 'mental-filter', label: '정신적 필터', icon: 'd_filter' },
    { id: 'disqualifying-positive', label: '긍정 격하', icon: 'd_disq' },
    { id: 'jumping-conclusions', label: '예단', icon: 'd_jump' },
    { id: 'magnification-minimization', label: '극대화/축소화', icon: 'd_mag' },
    { id: 'emotional-reasoning', label: '감정적 추리', icon: 'd_emo' },
    { id: 'should-statements', label: '당위적 명령', icon: 'd_should' },
    { id: 'personalization', label: '개인화', icon: 'd_person' },
    { id: 'labeling', label: '낙인찍기', icon: 'd_label' }
  ],
  
  init() {
    if (this._inited) return; this._inited = true;
    const btnNew = document.getElementById('btn-new-record');
    if (btnNew) btnNew.addEventListener('click', () => this.startWizard());
    
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

    // 기록 검색: 상황·생각·대안 텍스트로 실시간 필터
    const search = document.getElementById('record-search');
    if (search) search.addEventListener('input', () => { this._query = search.value.trim(); this.loadRecords(); });

    // 완성형: 샘플(목업) 기록을 심지 않는다 — 빈 상태 안내가 대신한다
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
  
  // 상단 인지왜곡 패턴 그래프 — 내가 자주 걸리는 생각의 함정 TOP
  renderPatternChart(records) {
    const real = records.filter(r => !String(r.id).startsWith('rec_mock_'));
    const counts = {};
    real.forEach(r => (r.distortions || []).forEach(d => { counts[d] = (counts[d] || 0) + 1; }));
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!entries.length) return null;
    const max = entries[0][1];
    const total = real.length;
    const top = this.distortions.find(d => d.id === entries[0][0]);

    const div = document.createElement('div');
    div.className = 'glass-card';
    div.style.cssText = 'padding: 1rem 1.05rem; margin-bottom: 1rem;';
    div.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem;">
 <strong style="font-size: 0.92rem; color: var(--text-primary);"> 나의 생각 함정 패턴</strong>
        <span style="font-size: 0.68rem; color: var(--text-muted);">기록 ${total}건 기준</span>
      </div>
      <p style="margin: 0 0 0.75rem; font-size: 0.74rem; color: var(--text-muted);">가장 자주 걸리는 함정은 <b style="color: var(--accent-secondary);">${top ? top.label : ''}</b>이에요. 패턴을 알면 절반은 이긴 거예요.</p>
      ${entries.map(([id, n], i) => {
        const d = this.distortions.find(x => x.id === id);
        if (!d) return '';
        const pct = Math.round(n / max * 100);
        return `
          <div style="display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.45rem;">
            <span style="flex-shrink: 0; width: 86px; font-size: 0.72rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${d.label}</span>
            <div style="flex: 1; height: 14px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;">
              <div style="height: 100%; width: ${pct}%; border-radius: 999px; background: ${i === 0 ? 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))' : 'color-mix(in srgb, var(--accent-primary) ' + (70 - i * 12) + '%, var(--bg-tertiary))'}; transition: width 0.5s;"></div>
            </div>
            <span style="flex-shrink: 0; width: 30px; text-align: right; font-size: 0.72rem; font-weight: 800; color: var(--text-secondary);">${n}회</span>
          </div>`;
      }).join('')}
      <button onclick="window.App.switchTab('learn')" style="all: unset; cursor: pointer; margin-top: 0.4rem; font-size: 0.72rem; font-weight: 700; color: var(--accent-primary);">이 함정들 이겨내는 법 배우기 ›</button>`;
    return div;
  },

  loadRecords() {
    let records = window.Storage.getThoughtRecords() || [];
    const container = document.getElementById('record-list');
    const emptyState = document.getElementById('record-empty');

    if (!container) return;

    // 검색어 필터
    if (this._query) {
      const q = this._query.toLowerCase();
      records = records.filter(r =>
        [r.situation, r.thought, r.alternative, (r.emotions || []).map(e => e.name).join(' ')]
          .some(t => (t || '').toLowerCase().includes(q)));
    }

    container.innerHTML = '';

    if (this._query && records.length === 0) {
      if (emptyState) emptyState.classList.add('hidden');
      container.innerHTML = `<p style="text-align: center; font-size: 0.84rem; color: var(--text-muted); padding: 1.5rem 0;">'${this._query.replace(/</g, '&lt;')}'에 맞는 기록이 없어요.</p>`;
      return;
    }

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
 <strong>가이드용 샘플 사고 기록 안내</strong><br>
            현재 기록은 0건일 때 안내되는 <strong>샘플 데이터</strong>입니다. 챗봇 대화나 직접 작성으로 내 사고 기록이 생성되면 <strong>샘플은 자동으로 삭제</strong>됩니다!
          </div>
          <span style="background: var(--accent-primary); color: #fff; font-size: 0.73rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 20px; white-space: nowrap; flex-shrink: 0;">샘플 데이터</span>
        `;
        container.appendChild(noticeBanner);
      }

      // 상단: 인지왜곡 패턴 그래프 (검색 중이 아닐 때만)
      if (!this._query) {
        const chart = this.renderPatternChart(records);
        if (chart) container.appendChild(chart);
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
        <span style="display: inline-flex; gap: 0.1rem;">
 ${isMock ?'':`<button class="btn-edit-record"data-id="${record.id}"aria-label="수정"title="수정"style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 0.2rem 0.3rem; font-size: 0.9rem;"></button>`}
 <button class="btn-delete-record"data-id="${record.id}"aria-label="삭제">${window.Icons?window.Icons.svg('close',{size:16}):''}</button>
        </span>
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

    const editBtn = card.querySelector('.btn-edit-record');
    if (editBtn) editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editRecord(record.id);
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
 <button type="button"class="btn-remove-emotion"aria-label="삭제">${window.Icons?window.Icons.svg('close',{size:14}):''}</button>
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
    
    if (window.Sfx) window.Sfx.hit('save');
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
  
  async deleteRecord(id) {
    if (await window.UI.confirm('이 기록을 삭제하시겠습니까?')) {
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
    this.startWizard(data);
  },

  // ==========================================================================
  //  손으로 쓰는 사고기록 위저드 — 한 화면 한 질문, 우렁이가 CBT 순서대로 안내
  //  (기존 한 장짜리 폼은 showForm으로 유지 — 위저드 1단계에서 전환 가능)
  // ==========================================================================
  EMOTION_PRESETS: ['불안', '우울', '분노', '짜증', '수치심', '죄책감', '외로움', '서운함', '무기력', '긴장'],

  // 기존 기록 수정: 위저드를 그 기록의 내용으로 채워 연다
  editRecord(id) {
    const r = window.Storage.getThoughtRecord(id);
    if (!r) return;
    // "불안 30%, 수치심 30%" → {불안: 30, ...}
    const after = {};
    String(r.newEmotions || '').split(',').forEach(s => {
      const m = s.trim().match(/^(.+?)\s+(\d+)%$/);
      if (m) after[m[1]] = parseInt(m[2], 10);
    });
    this.startWizard({
      editId: r.id,
      editDate: r.date,
      situation: r.situation,
      thought: r.thought,
      emotions: (r.emotions || []).map(e => ({ name: e.name, intensity: e.intensity })),
      distortions: [...(r.distortions || [])],
      alternative: r.alternative || '',
      after
    });
  },

  // 초안 자동 저장 — 새로고침·이탈해도 쓰던 기록이 살아있다 (24시간 보관)
  _saveDraft(step) {
    const w = this._wiz;
    if (!w || w._saved || w.editId) return; // 수정 모드는 원본이 있으니 초안 불필요
    if (step === 1 && !w.situation && !w.thought) return;
    window.Storage._safeSet('cbt_wiz_draft', { wiz: w, step, ts: Date.now() });
  },

  _clearDraft() {
    localStorage.removeItem('cbt_wiz_draft');
  },

  async startWizard(prefilled = {}) {
    // 새로 쓰기인데 쓰다 만 초안이 있으면 이어쓰기 제안
    if (!prefilled.editId && !prefilled.situation && !prefilled.thought) {
      const d = window.Storage._safeGet('cbt_wiz_draft', null);
      if (d && d.wiz && Date.now() - d.ts < 24 * 3600000) {
 if (await window.UI.confirm('쓰다 만 사고 기록이 있어요.\n이어서 쓸까요? (취소하면 새로 시작하고 초안은 지워져요)')) {
          this._wiz = d.wiz;
          this._wizStep(d.step || 1);
          return;
        }
        this._clearDraft();
      }
    }
    this._wiz = {
      editId: prefilled.editId || null,       // 수정 모드면 원본 id 유지
      editDate: prefilled.editDate || null,
      situation: prefilled.situation || '',
      thought: prefilled.thought || '',
      emotions: prefilled.emotions || [],      // [{name, intensity}]
      distortions: prefilled.distortions || [],
      alternative: prefilled.alternative || '',
      after: prefilled.after || {}             // {name: intensity}
    };
    this._wizStep(1);
  },

  _wizWrap(inner, step) {
    const old = document.getElementById('tr-wizard');
    if (old) old.remove();
    const TOTAL = 6;
    const ov = document.createElement('div');
    ov.id = 'tr-wizard';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10003; background: var(--bg-primary); color: var(--text-primary); display: flex; flex-direction: column; overflow-y: auto; padding: 1.2rem 1.4rem;';
    const dots = step ? `<div style="display: flex; gap: 0.35rem; justify-content: center; margin-bottom: 1.1rem;">${Array.from({ length: TOTAL }, (_, i) =>
      `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${i < step ? 'var(--accent-primary)' : 'var(--glass-border)'}; transition: background 0.3s;"></span>`).join('')}</div>` : '';
    ov.innerHTML = `<div style="width: 100%; max-width: 400px; margin: auto; padding: 1.6rem 0 2rem;">${dots}${inner}</div>
 <button onclick="window.ThoughtRecord._wizClose()"style="all: unset; position: fixed; top: 0.9rem; right: 1.1rem; font-size: 1.3rem; cursor: pointer; opacity: 0.6; padding: 0.3rem;"></button>`;
    document.body.appendChild(ov);
    const ta = ov.querySelector('textarea');
    if (ta) setTimeout(() => ta.focus(), 150);
  },

  async _wizClose() {
    const w = this._wiz || {};
    // 닫기 직전 화면의 타이핑까지 초안에 담는다
    const ta = document.getElementById('trw-input');
    if (ta && !w._saved) {
      const n = this._wizCurStep || 1;
      if (n === 1) w.situation = ta.value;
      else if (n === 2) w.thought = ta.value;
      else if (n === 5) w.alternative = ta.value;
    }
    const hasContent = (w.situation || w.thought) && !w._saved;
    if (hasContent) {
      // 초안이 저장돼 있으니 안심하고 닫아도 된다는 안내
      if (!await window.UI.confirm('그만 쓸까요?\n(쓰던 내용은 초안으로 저장돼요 — 다음에 [+ 새 기록]을 누르면 이어쓸 수 있어요)')) return;
      this._saveDraft(this._wizCurStep || 1);
    }
    const ov = document.getElementById('tr-wizard');
    if (ov) ov.remove();
  },

  _wizNav(backStep, nextLabel) {
    return `<div style="display: flex; gap: 0.5rem; margin-top: 1.2rem;">
      ${backStep ? `<button id="trw-back" class="btn-secondary" style="flex: 0 0 auto; width: auto; padding: 0.8rem 1rem;">‹ 이전</button>` : ''}
      <button id="trw-next" class="btn-primary" style="flex: 1;">${nextLabel}</button>
    </div>`;
  },

  // ‹ 이전을 눌러도 쓰던 입력이 사라지지 않도록: 저장 콜백 후 이동
  _wizBindBack(backStep, save) {
    const b = document.getElementById('trw-back');
    if (b) b.addEventListener('click', () => { if (save) save(); this._wizStep(backStep); });
  },

  _wizStep(n) {
    const w = this._wiz;
    const sticker = (name, size) => window.Stickers ? window.Stickers.svg(name, size || 84) : '';
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    this._wizCurStep = n;
    this._saveDraft(n); // 단계를 오갈 때마다 초안 저장
    // 타이핑도 실시간 초안 반영 (1:상황 / 2:생각 / 5:대안)
    setTimeout(() => {
      const ta = document.getElementById('trw-input');
      if (!ta || ![1, 2, 5].includes(n)) return;
      ta.addEventListener('input', () => {
        if (n === 1) w.situation = ta.value;
        else if (n === 2) w.thought = ta.value;
        else w.alternative = ta.value;
        this._saveDraft(n);
      });
    }, 100);

    if (n === 1) {
      this._wizWrap(`
        <div style="text-align: center;">${sticker('empathy', 92)}</div>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.25rem; text-align: center;">무슨 일이 있었어요?</h2>
        <p style="font-size: 0.83rem; color: var(--text-muted); text-align: center; margin: 0 0 1rem; line-height: 1.55;">언제, 어디서, 누구와 있었던 일인지<br>사진 찍듯 그 장면만 적어보세요.</p>
        <textarea id="trw-input" rows="4" placeholder="예: 월요일 아침 회의에서 내 제안이 조용히 넘어갔다" style="width: 100%; box-sizing: border-box; padding: 0.9rem; border-radius: 14px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; resize: none; font-size: 0.95rem; line-height: 1.6;">${esc(w.situation)}</textarea>
        ${this._wizNav(null, '다음 ›')}
        ${w.editId ? '' : `<button onclick="window.ThoughtRecord._wizToClassicForm()" style="all: unset; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.76rem; color: var(--text-muted); cursor: pointer;">한 화면에서 한꺼번에 쓰기 (기존 양식)</button>`}`, 1);
      document.getElementById('trw-next').addEventListener('click', () => {
        const v = document.getElementById('trw-input').value.trim();
        if (!v) { document.getElementById('trw-input').placeholder = '한 줄이면 충분해요. 그 장면을 적어주세요 :)'; return; }
        w.situation = v;
        this._wizStep(2);
      });

    } else if (n === 2) {
      this._wizWrap(`
        <div style="text-align: center;">${sticker('surprise', 92)}</div>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.25rem; text-align: center;">그 순간, 머릿속을<br>스친 생각은?</h2>
        <p style="font-size: 0.83rem; color: var(--text-muted); text-align: center; margin: 0 0 1rem; line-height: 1.55;">검열하지 말고 떠오른 그대로,<br>따옴표 안에 넣듯 적어보세요.</p>
        <textarea id="trw-input" rows="4" placeholder='예: "역시 내 의견은 별로인가 봐"' style="width: 100%; box-sizing: border-box; padding: 0.9rem; border-radius: 14px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; resize: none; font-size: 0.95rem; line-height: 1.6;">${esc(w.thought)}</textarea>
        ${this._wizNav(1, '다음 ›')}`, 2);
      this._wizBindBack(1, () => { w.thought = document.getElementById('trw-input').value; });
      document.getElementById('trw-next').addEventListener('click', () => {
        const v = document.getElementById('trw-input').value.trim();
        if (!v) { document.getElementById('trw-input').placeholder = '짧아도 괜찮아요. 스친 생각 하나만요'; return; }
        w.thought = v;
        this._wizStep(3);
      });

    } else if (n === 3) {
      const selected = w.emotions.map(e => e.name);
      this._wizWrap(`
        <h2 style="margin: 0 0 0.3rem; font-size: 1.25rem; text-align: center;">그때 마음은 어땠어요?</h2>
        <p style="font-size: 0.83rem; color: var(--text-muted); text-align: center; margin: 0 0 1rem;">느꼈던 감정을 골라주세요 (최대 3개)</p>
        <div id="trw-emo-chips" style="display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: center;">
          ${this.EMOTION_PRESETS.map(name => `<button data-emo="${name}" style="all: unset; box-sizing: border-box; padding: 0.5rem 0.95rem; border-radius: 999px; font-size: 0.88rem; font-weight: 600; cursor: pointer; border: 1.5px solid ${selected.includes(name) ? 'var(--accent-primary)' : 'var(--glass-border)'}; background: ${selected.includes(name) ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'var(--bg-secondary)'}; color: ${selected.includes(name) ? 'var(--accent-primary)' : 'var(--text-primary)'};">${name}</button>`).join('')}
        </div>
        <div style="display: flex; gap: 0.4rem; margin-top: 0.7rem;">
          <input id="trw-emo-custom" placeholder="다른 감정 직접 쓰기" style="flex: 1; min-width: 0; padding: 0.55rem 0.8rem; border-radius: 999px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; font-size: 0.85rem;">
          <button id="trw-emo-add" class="btn-secondary" style="width: auto; padding: 0.5rem 0.9rem; font-size: 0.85rem;">추가</button>
        </div>
        <div id="trw-emo-sliders" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.7rem;"></div>
        ${this._wizNav(2, '다음 ›')}`, 3);

      const renderSliders = () => {
        const box = document.getElementById('trw-emo-sliders');
        box.innerHTML = w.emotions.map((e, i) => `
          <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 700; margin-bottom: 0.35rem;">
              <span>${esc(e.name)}</span><span id="trw-ev-${i}" style="color: var(--accent-primary);">${e.intensity}%</span>
            </div>
            <input type="range" data-i="${i}" min="0" max="100" value="${e.intensity}" style="width: 100%; accent-color: var(--accent-primary);">
          </div>`).join('');
        box.querySelectorAll('input[type=range]').forEach(sl => sl.addEventListener('input', () => {
          const i = parseInt(sl.dataset.i, 10);
          w.emotions[i].intensity = parseInt(sl.value, 10);
          document.getElementById(`trw-ev-${i}`).textContent = sl.value + '%';
        }));
      };
      const toggleEmo = (name) => {
        const idx = w.emotions.findIndex(e => e.name === name);
        if (idx >= 0) w.emotions.splice(idx, 1);
        else if (w.emotions.length < 3) w.emotions.push({ name, intensity: 70 });
        else { if (window.App && window.App.showRecordToast) window.App.showRecordToast('감정은 3개까지 고를 수 있어요'); return; }
        this._wizStep(3); // 칩 상태 다시 그림
      };
      document.querySelectorAll('#trw-emo-chips button').forEach(b => b.addEventListener('click', () => toggleEmo(b.dataset.emo)));
      document.getElementById('trw-emo-add').addEventListener('click', () => {
        const v = document.getElementById('trw-emo-custom').value.trim();
        if (v) toggleEmo(v);
      });
      renderSliders();
      this._wizBindBack(2);
      document.getElementById('trw-next').addEventListener('click', () => {
        if (w.emotions.length === 0) { if (window.App && window.App.showRecordToast) window.App.showRecordToast('감정을 하나만 골라주세요'); return; }
        this._wizStep(4);
      });

    } else if (n === 4) {
      this._wizWrap(`
        <h2 style="margin: 0 0 0.3rem; font-size: 1.25rem; text-align: center;">혹시 생각의 함정에<br>빠진 건 아닐까요?</h2>
        <p style="font-size: 0.83rem; color: var(--text-muted); text-align: center; margin: 0 0 0.4rem; line-height: 1.5;">"${esc(w.thought).slice(0, 40)}${w.thought.length > 40 ? '…' : ''}"</p>
        <p style="font-size: 0.78rem; color: var(--text-muted); text-align: center; margin: 0 0 1rem;">이 생각에 숨어있는 패턴이 보이면 골라주세요. 몰라도 괜찮아요.</p>
        <div id="trw-dist-chips" style="display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: center;">
          ${this.distortions.map(d => `<button data-d="${d.id}" style="all: unset; box-sizing: border-box; padding: 0.5rem 0.85rem; border-radius: 999px; font-size: 0.84rem; font-weight: 600; cursor: pointer; border: 1.5px solid ${w.distortions.includes(d.id) ? 'var(--accent-primary)' : 'var(--glass-border)'}; background: ${w.distortions.includes(d.id) ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'var(--bg-secondary)'}; color: ${w.distortions.includes(d.id) ? 'var(--accent-primary)' : 'var(--text-primary)'};">${d.label}</button>`).join('')}
        </div>
        ${this._wizNav(3, '다음 ›')}
        <button onclick="window.ThoughtRecord._wiz.distortions = []; window.ThoughtRecord._wizStep(5)" style="all: unset; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.78rem; color: var(--text-muted); cursor: pointer;">잘 모르겠어요, 건너뛰기</button>`, 4);
      document.querySelectorAll('#trw-dist-chips button').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.d;
        const idx = w.distortions.indexOf(id);
        if (idx >= 0) w.distortions.splice(idx, 1); else w.distortions.push(id);
        this._wizStep(4);
      }));
      this._wizBindBack(3);
      document.getElementById('trw-next').addEventListener('click', () => this._wizStep(5));

    } else if (n === 5) {
      this._wizWrap(`
        <div style="text-align: center;">${sticker('cheer', 92)}</div>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.25rem; text-align: center;">친구가 같은 생각을 한다면,<br>뭐라고 말해줄래요?</h2>
        <p style="font-size: 0.83rem; color: var(--text-muted); text-align: center; margin: 0 0 1rem; line-height: 1.55;">나에게도 그 다정함을 돌려주세요.<br>조금 더 균형 잡힌 생각을 적어봐요.</p>
        <textarea id="trw-input" rows="4" placeholder="예: 한 번 조용히 넘어갔다고 내 의견이 별로라는 증거는 아니야" style="width: 100%; box-sizing: border-box; padding: 0.9rem; border-radius: 14px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; resize: none; font-size: 0.95rem; line-height: 1.6;">${esc(w.alternative)}</textarea>
 <button id="trw-hint"style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.65rem; margin-top: 0.6rem; border-radius: 12px; border: 1.5px dashed color-mix(in srgb, var(--accent-primary) 45%, transparent); color: var(--accent-primary); font-size: 0.85rem; font-weight: 700; cursor: pointer;"> 우렁이에게 힌트 받기</button>
        <div id="trw-hint-box" class="hidden" style="margin-top: 0.6rem; padding: 0.85rem 1rem; border-radius: 12px; background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary)); border: 1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent); font-size: 0.85rem; line-height: 1.6;"></div>
        ${this._wizNav(4, '다음 ›')}`, 5);
      this._wizBindBack(4, () => { w.alternative = document.getElementById('trw-input').value; });
      document.getElementById('trw-hint').addEventListener('click', () => this._wizHint());
      document.getElementById('trw-next').addEventListener('click', () => {
        w.alternative = document.getElementById('trw-input').value.trim();
        // 이전 감정 강도를 초기값으로 복사
        w.emotions.forEach(e => { if (!(e.name in w.after)) w.after[e.name] = e.intensity; });
        this._wizStep(6);
      });

    } else if (n === 6) {
      this._wizWrap(`
        <h2 style="margin: 0 0 0.3rem; font-size: 1.25rem; text-align: center;">지금은 어때요?</h2>
        <p style="font-size: 0.83rem; color: var(--text-muted); text-align: center; margin: 0 0 1rem; line-height: 1.55;">방금 쓴 생각을 한 번 소리 내어 읽고,<br>같은 감정을 다시 느껴보세요.</p>
 ${w.alternative ?`<div style="padding: 0.8rem 1rem; border-radius: 12px; background: var(--bg-secondary); border: 1px solid var(--glass-border); font-size: 0.86rem; line-height: 1.6; margin-bottom: 1rem;">${esc(w.alternative)}</div>`:''}
        <div style="display: flex; flex-direction: column; gap: 0.7rem;">
          ${w.emotions.map((e, i) => `
            <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 700; margin-bottom: 0.35rem;">
                <span>${esc(e.name)} <span style="font-weight: 400; color: var(--text-muted); font-size: 0.76rem;">(처음 ${e.intensity}%)</span></span>
                <span id="trw-av-${i}" style="color: var(--accent-primary);">${w.after[e.name]}%</span>
              </div>
              <input type="range" data-name="${esc(e.name)}" data-i="${i}" min="0" max="100" value="${w.after[e.name]}" style="width: 100%; accent-color: var(--accent-primary);">
            </div>`).join('')}
        </div>
 ${this._wizNav(5,'기록 저장하기')}`, 6);
      this._wizBindBack(5);
      document.querySelectorAll('#tr-wizard input[type=range]').forEach(sl => sl.addEventListener('input', () => {
        w.after[sl.dataset.name] = parseInt(sl.value, 10);
        document.getElementById(`trw-av-${sl.dataset.i}`).textContent = sl.value + '%';
      }));
      document.getElementById('trw-next').addEventListener('click', () => this._wizFinish());
    }
  },

  _wizToClassicForm() {
    const w = this._wiz || {};
    const ov = document.getElementById('tr-wizard');
    const cur = document.getElementById('trw-input');
    if (cur) w.situation = cur.value; // 1단계(상황 입력)에서만 진입 가능 — 쓰던 내용 보존
    if (ov) ov.remove();
    this._wiz = null;
    this.showForm({ situation: w.situation, thought: w.thought });
  },

  async _wizHint() {
    const w = this._wiz;
    const btn = document.getElementById('trw-hint');
    const box = document.getElementById('trw-hint-box');
    if (!btn || !box) return;
    btn.style.pointerEvents = 'none';
 btn.textContent ='우렁이가 생각 중…';
    let hint = '이렇게 스스로에게 물어보세요:\n· 이 생각이 100% 사실이라는 증거는 뭘까?\n· 반대되는 증거는 하나도 없을까?\n· 가장 친한 친구가 이 생각을 말했다면 나는 뭐라고 답할까?';
    try {
      if (window.LLM) {
        const distLabels = w.distortions.map(id => (this.distortions.find(d => d.id === id) || {}).label).filter(Boolean).join(', ');
        const res = await window.LLM._chatCompletion({
          model: window.LLM.MODEL_LIGHT || window.LLM.MODEL,
          messages: [{ role: 'user', content: `당신은 다정한 CBT 상담사 '우렁이'입니다. 사용자가 사고기록지를 쓰는 중입니다.\n상황: ${w.situation}\n자동적 사고: ${w.thought}\n감정: ${w.emotions.map(e => `${e.name} ${e.intensity}%`).join(', ')}\n${distLabels ? `사용자가 고른 인지왜곡: ${distLabels}\n` : ''}\n이 생각을 다시 바라보게 돕는 (1) 소크라테스식 질문 1개와 (2) 균형 잡힌 대안적 사고 예시 1문장을 제시하세요. 반말 없이 부드럽게, 60자 내외 두 줄로. 머리기호 없이 줄바꿈으로만 구분해 출력.` }],
          temperature: 0.7,
          max_tokens: 160
        });
        if (res.ok) {
          const data = await res.json();
          const t = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
          if (t) hint = t;
        }
      }
    } catch (e) {}
    box.classList.remove('hidden');
 box.innerHTML =`${hint.replace(/\n/g,'<br>')}`;
 btn.textContent ='다른 힌트 받기';
    btn.style.pointerEvents = '';
  },

  _wizFinish() {
    const w = this._wiz;
    const newEmotions = w.emotions.map(e => `${e.name} ${w.after[e.name]}%`).join(', ');
    const editing = !!w.editId;
    const record = {
      id: editing ? w.editId : 'rec_' + Date.now(),
      date: editing ? w.editDate : new Date().toISOString(),
      situation: w.situation,
      thought: w.thought,
      emotions: w.emotions,
      distortions: w.distortions,
      alternative: w.alternative,
      newEmotions
    };
    if (editing) {
      // 수정: 왜곡 통계는 이전 선택을 빼고 새 선택을 더한다 (이중 집계 방지)
      const old = window.Storage.getThoughtRecord(w.editId);
      if (old) {
        const stats = window.Storage.getDistortionStats();
        (old.distortions || []).forEach(id => { if (stats[id]) stats[id] = Math.max(0, stats[id] - 1); });
        window.Storage._safeSet('cbt_distortion_stats', stats);
      }
    }
    if (window.Sfx) window.Sfx.hit('save');
    window.Storage.saveThoughtRecord(record);
    w.distortions.forEach(id => window.Storage.incrementDistortion(id));
    if (!editing && w.emotions.length > 0) {
      const avgInt = w.emotions.reduce((s, e) => s + e.intensity, 0) / w.emotions.length;
      window.Storage.saveMoodEntry({ date: new Date().toISOString(), score: Math.max(1, Math.min(5, Math.round(5 - (avgInt / 25)))) });
    }
    window.Storage.markDayActive();
    w._saved = true;
    this._clearDraft();
    this.loadRecords();
    if (window.Growth) window.Growth.checkAwards();
    if (window.Dashboard && window.App && window.App.currentTab === 'dashboard') window.Dashboard.refresh();

    // 완료 화면: 감정 변화 전/후 비교
    const before = Math.round(w.emotions.reduce((s, e) => s + e.intensity, 0) / w.emotions.length);
    const after = Math.round(w.emotions.reduce((s, e) => s + w.after[e.name], 0) / w.emotions.length);
    const drop = before - after;
    const bar = (v, color) => `<div style="width: 100%; background: var(--bg-tertiary); border-radius: 99px; height: 12px; overflow: hidden;"><div style="width: ${v}%; background: ${color}; height: 100%; border-radius: 99px; transition: width 0.8s;"></div></div>`;
    this._wizWrap(`
 <div style="text-align: center;">${window.Stickers ? window.Stickers.svg('proud', 110) :''}</div>
      <h2 style="margin: 0.8rem 0 0.4rem; font-size: 1.3rem; text-align: center;">${editing ? '수정 완료!' : '기록 완료!'}</h2>
      <p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; margin: 0 0 1.2rem; line-height: 1.6;">${drop > 0 ? `생각을 정리하는 것만으로<br>마음의 무게가 <b style="color: var(--accent-primary);">${drop}%p</b> 가벼워졌어요.` : '지금 당장 가벼워지지 않아도 괜찮아요.<br>알아차린 것 자체가 큰 걸음이에요.'}</p>
      <div style="display: flex; flex-direction: column; gap: 0.8rem; text-align: left;">
        <div><div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.3rem;"><span>기록 전</span><b>${before}%</b></div>${bar(before, 'linear-gradient(90deg, #f87171, #ef4444)')}</div>
        <div><div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 0.3rem;"><span>기록 후</span><b>${after}%</b></div>${bar(after, 'linear-gradient(90deg, #34d399, #10b981)')}</div>
      </div>
 <button onclick="window.ThoughtRecord._wizClose()"class="btn-primary"style="width: 100%; margin-top: 1.4rem;">확인 </button>`);
  }
};

document.addEventListener('DOMContentLoaded', () => window.ThoughtRecord.init());
