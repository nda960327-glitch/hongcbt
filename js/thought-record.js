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
    this.loadRecords();
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
        <span class="record-date">${dateStr}</span>
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
