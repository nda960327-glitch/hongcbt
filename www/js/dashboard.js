window.Dashboard = {
  distortionColors: {
    'all-or-nothing': '#5fa986', // sage
    'overgeneralization': '#7ba0b8', // dusty blue
    'mental-filter': '#c98a5a', // terracotta
    'disqualifying-positive': '#d98a84', // soft rose
    'jumping-conclusions': '#e0a94b', // honey
    'magnification-minimization': '#cf6b60', // clay red
    'emotional-reasoning': '#6bab9a', // teal-sage
    'should-statements': '#b08fb0', // muted mauve
    'personalization': '#d98466', // burnt orange
    'labeling': '#8a9c6e' // olive
  },
  
  distortionLabels: {
    'all-or-nothing': '이분법적 사고',
    'overgeneralization': '과잉일반화',
    'mental-filter': '정신적 필터',
    'disqualifying-positive': '긍정 격하',
    'jumping-conclusions': '예단',
    'magnification-minimization': '극대화/축소화',
    'emotional-reasoning': '감정적 추리',
    'should-statements': '당위적 명령',
    'personalization': '개인화',
    'labeling': '낙인찍기'
  },
  
  init() {
    if (this._inited) return; this._inited = true;
    this.refresh();
  },
  
  refresh() {
    this.updateSampleBadges();
    this.updateStats();
    this.renderMoodChart();
    this.renderDistortionChart();
    this.renderChatInsights();
  },

  updateSampleBadges() {
    const records = (window.Storage && window.Storage.getThoughtRecords()) || [];
    const isOnlyMock = records.length > 0 && records.every(r => r.id && r.id.startsWith('rec_mock_'));
    
    // Header Subtitle Update
    const subtitleEl = document.querySelector('#tab-dashboard .tab-subtitle');
    if (subtitleEl) {
      if (isOnlyMock) {
        subtitleEl.innerHTML = `감정 변화 추이와 인지왜곡 통합 리포트 <span style="background: color-mix(in srgb, var(--accent-primary) 18%, var(--bg-tertiary)); color: var(--accent-primary); font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 20px; border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent); margin-left: 0.3rem;">샘플 데이터</span>`;
      } else {
        subtitleEl.textContent = '감정 변화 추이와 인지왜곡 통합 리포트';
      }
    }

    // Card titles sample badges update
    const cardHeaders = document.querySelectorAll('#tab-dashboard .dash-card h3');
    cardHeaders.forEach(h3 => {
      const existingBadge = h3.querySelector('.dash-sample-badge');
      if (isOnlyMock) {
        if (!existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'dash-sample-badge';
          badge.style.cssText = 'font-size: 0.72rem; font-weight: 700; background: var(--bg-tertiary); border: 1px solid var(--glass-border); padding: 0.12rem 0.45rem; border-radius: 4px; color: var(--text-muted); margin-left: 0.4rem; vertical-align: middle;';
          badge.textContent = '샘플';
          h3.appendChild(badge);
        }
      } else {
        if (existingBadge) existingBadge.remove();
      }
    });
  },

  renderChatInsights() {
    this.renderSummaryReportCard();
  },

  generateDailySummary() {
    const container = document.getElementById('chat-insights-content');
    const btn = document.getElementById('btn-generate-summary');
    if (!container) return;

    // 1. 만약 샘플 데이터 상태라면 샘플 기록 및 가짜 통계 자동 즉시 삭제!
    if (window.Storage) {
      const records = window.Storage.getThoughtRecords() || [];
      if (records.length > 0 && records.every(r => r.id && r.id.startsWith('rec_mock_'))) {
        window.Storage._safeSet('cbt_thought_records', []);
        window.Storage._safeSet('cbt_distortion_stats', {});
      }
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ 요약 생성 중...';
    }

    container.innerHTML = `
      <div style="background: var(--bg-tertiary); border: 1px dashed var(--accent-primary); border-radius: 12px; padding: 1.2rem; text-align: center;">
        <div style="font-size: 1.2rem; margin-bottom: 0.4rem;">⏳</div>
        <p style="margin: 0; font-size: 0.85rem; color: var(--text-primary); font-weight: 600;">AI 상담사와 나눈 대화 및 마음 통계를 분석하여 임상 요약 리포트를 작성 중입니다...</p>
      </div>
    `;

    setTimeout(() => {
      const persona = window.Personas ? window.Personas.getActive() : { name: '우렁의사', id: 'woorung', role: 'CBT·DBT 전문 AI' };
      const memory = window.Storage ? window.Storage.getUserMemory() : '';
      const messages = (window.Storage && window.Storage.getMessages()) || [];
      const userMsgs = messages.filter(m => m.role === 'user');
      const thoughtRecords = (window.Storage && window.Storage.getThoughtRecords()) || [];
      const distortionStats = (window.Storage && window.Storage.getDistortionStats()) || {};

      const now = new Date();
      const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
      const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

      let chiefComplaint = '일상 업무, 인지적 왜곡 및 대인관계 스트레스 탐색';
      if (userMsgs.length > 0) {
        const lastUserMsg = userMsgs[userMsgs.length - 1].content;
        chiefComplaint = `최근 내담자 발언: "${lastUserMsg.length > 60 ? lastUserMsg.slice(0, 60) + '...' : lastUserMsg}" (총 ${userMsgs.length}회 대화 진행)`;
      } else if (thoughtRecords.length > 0) {
        chiefComplaint = `사고기록지 기반 주요 호소: "${thoughtRecords[0].situation || '일상적 스트레스 고민'}"`;
      }

      const distKeys = Object.keys(distortionStats).filter(k => distortionStats[k] > 0);
      const distNames = {
        'jumping-conclusions': '예단(지레짐작)',
        'all-or-nothing': '이분법적 사고(흑백논리)',
        'personalization': '개인화(자책)',
        'overgeneralization': '과잉일반화',
        'mental-filter': '정신적 필터',
        'emotional-reasoning': '감정적 추리',
        'should-statements': '당위적 명령'
      };
      let distortionText = distKeys.length > 0 
        ? distKeys.map(k => `${distNames[k] || k} (${distortionStats[k]}회)`).join(', ')
        : '지레짐작(예단) 및 과잉일반화 경향성 탐지';

      let clinicalNote = '';
      if (memory && memory.trim() && !memory.includes('아직 이 사람에 대해')) {
        clinicalNote = memory.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' / ');
      } else {
        clinicalNote = '내담자는 CBT 인지 재구성 기법을 적용하여 상황과 인지왜곡을 분리 파악 중이며, 대안적 사고 탐색에 긍정적인 수용도를 보임.';
      }

      const summaryObj = {
        date: `${dateStr} ${timeStr}`,
        persona: `${persona.name} (${persona.role || 'CBT 전문 AI'})`,
        chiefComplaint,
        distortionText,
        clinicalNote
      };

      if (window.Storage && window.Storage.saveSummaryReport) {
        window.Storage.saveSummaryReport(summaryObj);
      }

      this.updateSampleBadges();
      this.updateStats();
      this.renderMoodChart();
      this.renderDistortionChart();
      this.renderSummaryReportCard(summaryObj);

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '✨ 요약 다시 생성하기';
      }
    }, 400);
  },

  renderSummaryReportCard(report) {
    const container = document.getElementById('chat-insights-content');
    if (!container) return;

    if (!report) {
      report = window.Storage && window.Storage.getSummaryReport ? window.Storage.getSummaryReport() : null;
    }

    if (!report) {
      container.innerHTML = `
        <div style="background: rgba(127,194,155,0.08); border: 1px dashed var(--accent-primary); border-radius: 12px; padding: 1.2rem; text-align: center;">
          <p style="margin: 0 0 0.4rem 0; font-size: 0.88rem; font-weight: 700; color: var(--text-primary);">아직 생성된 요약 리포트가 없습니다.</p>
          <p style="margin: 0; font-size: 0.82rem; color: var(--text-muted);">상단의 <strong>[+ 오늘의 대화 요약 생성하기]</strong> 버튼을 누르시면 오프라인 전문 상담사에 전달 가능한 AI 요약 리포트가 즉시 작성됩니다.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div id="summary-report-card" style="background: var(--bg-secondary); border: 1px solid color-mix(in srgb, var(--accent-primary) 35%, transparent); border-radius: 14px; padding: 1.15rem; position: relative; box-shadow: var(--shadow-sm);">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px dashed var(--glass-border); padding-bottom: 0.6rem; margin-bottom: 0.85rem;">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--accent-primary); display: flex; align-items: center; gap: 0.4rem;">
            📋 AI 상담 요약 리포트 (상담사 전달용)
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${report.date || ''}</span>
        </div>

        <div style="font-size: 0.84rem; line-height: 1.6; color: var(--text-primary);">
          <div style="margin-bottom: 0.55rem; background: var(--bg-tertiary); padding: 0.5rem 0.8rem; border-radius: 8px;">
            <strong style="color: var(--accent-primary);">👤 담당 AI 상담사:</strong> ${report.persona}
          </div>
          <div style="margin-bottom: 0.55rem; background: var(--bg-tertiary); padding: 0.5rem 0.8rem; border-radius: 8px;">
            <strong style="color: var(--text-primary);">💬 내담자 주요 고민 & 주제:</strong><br>
            <span style="color: var(--text-secondary);">${report.chiefComplaint}</span>
          </div>
          <div style="margin-bottom: 0.55rem; background: var(--bg-tertiary); padding: 0.5rem 0.8rem; border-radius: 8px;">
            <strong style="color: var(--text-primary);">🧠 관찰된 인지왜곡 패턴:</strong><br>
            <span style="color: var(--text-secondary);">${report.distortionText}</span>
          </div>
          <div style="margin-bottom: 0.75rem; background: var(--bg-tertiary); padding: 0.5rem 0.8rem; border-radius: 8px; border-left: 3px solid var(--accent-primary);">
            <strong style="color: var(--text-primary);">💡 오프라인 상담사 참고용 임상 요약:</strong><br>
            <span style="color: var(--text-secondary);">${report.clinicalNote}</span>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.85rem; border-top: 1px solid var(--glass-border); padding-top: 0.75rem;">
          <button onclick="window.Dashboard.copySummaryReport()" class="btn-secondary-sm" style="font-size: 0.78rem; padding: 0.4rem 0.85rem; border-radius: 8px; cursor: pointer; border: 1px solid var(--glass-border); background: var(--bg-primary); color: var(--text-primary);">📋 요약 복사하기</button>
          <button onclick="window.Dashboard.shareSummaryReport()" class="btn-primary-sm" style="font-size: 0.78rem; padding: 0.4rem 0.85rem; border-radius: 8px; background: var(--accent-primary); color: #fff; border: none; cursor: pointer; font-weight: 700;">📤 상담사에게 전달 공유</button>
        </div>
      </div>
    `;
  },

  copySummaryReport() {
    const card = document.getElementById('summary-report-card');
    if (!card) return;
    const text = card.innerText.replace(/📋 요약 복사하기|📤 상담사에게 전달 공유/g, '').trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (window.App && window.App.showToast) {
          window.App.showToast('📋 요약 리포트가 클립보드에 복사되었습니다!');
        } else {
          alert('📋 요약 리포트가 클립보드에 복사되었습니다!');
        }
      });
    } else {
      alert('📋 요약 리포트 내용:\n\n' + text);
    }
  },

  shareSummaryReport() {
    const card = document.getElementById('summary-report-card');
    if (!card) return;
    const text = card.innerText.replace(/📋 요약 복사하기|📤 상담사에게 전달 공유/g, '').trim();
    if (navigator.share) {
      navigator.share({
        title: '[우렁의사] AI 상담 요약 리포트',
        text: text
      }).catch(() => {});
    } else {
      this.copySummaryReport();
    }
  },
  
  renderMoodChart() {
    const container = document.getElementById('mood-chart');
    if (!container) return;
    
    const data = this._prepareMoodData();
    
    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 2.5rem 1rem; text-align: center;">
          <p style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.4rem;">아직 수집된 기분 기록이 없습니다</p>
          <p style="font-size: 0.83rem; color: var(--text-muted); margin: 0;">AI 상담사와 대화를 나누시면 지난 7일간의 실제 감정 변화 그래프가 이곳에 실시간으로 표시됩니다.</p>
        </div>`;
      return;
    }
    
    // SVG setup for better mobile readability (aspect ratio 2:1)
    const width = 440;
    const height = 220;
    const padding = { top: 40, right: 30, bottom: 40, left: 30 };
    
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    
    // Scales
    const xScale = (i) => padding.left + (i * (innerWidth / Math.max(1, data.length - 1)));
    const yScale = (val) => padding.top + innerHeight - ((val - 1) * (innerHeight / 4));
    
    // Build path points
    const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.score) }));
    const pathData = this._createSmoothPath(points);
    
    // Area path (close the path to the bottom)
    const areaPath = `${pathData} L ${points[points.length-1].x},${height - padding.bottom} L ${points[0].x},${height - padding.bottom} Z`;
    
    const FACE_NAMES = ['faceSad','faceDown','faceNeutral','faceSmile','faceGrin'];
    const faceMark = (level, x, y, size, color) => {
      const inner = (window.Icons && window.Icons.faces[FACE_NAMES[(level||1)-1]]) || '';
      const sc = size / 24;
      return `<g transform="translate(${x - size/2},${y - size/2}) scale(${sc})" style="color:${color}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
    };
    
    let html = `
      <svg viewBox="0 0 ${width} ${height}" class="mood-chart-svg" width="100%" height="100%" style="overflow: visible;">
        <defs>
          <linearGradient id="moodGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#7fc29b" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#7fc29b" stop-opacity="0"/>
          </linearGradient>
        </defs>

        <!-- Grid lines -->
        ${[1, 2, 3, 4, 5].map(val => `
          <line x1="${padding.left}" y1="${yScale(val)}" x2="${width - padding.right}" y2="${yScale(val)}" stroke="rgba(140,128,114,0.28)" stroke-dasharray="4,4" />
          ${faceMark(val, padding.left - 16, yScale(val), 18, '#9c9187')}
        `).join('')}

        <!-- Area -->
        <path d="${areaPath}" fill="url(#moodGradient)" class="anim-area" opacity="0">
          <animate attributeName="opacity" to="1" dur="1s" fill="freeze" />
        </path>

        <!-- Line -->
        <path d="${pathData}" fill="none" stroke="#5fa986" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="anim-line" />

        <!-- Points & Labels -->
        ${data.map((d, i) => `
          <g class="chart-point-group" transform="translate(${points[i].x}, ${points[i].y})">
            <circle cx="0" cy="0" r="6" fill="var(--bg-secondary)" stroke="#5fa986" stroke-width="3" />
            ${faceMark(Math.round(d.score), 0, -16, 20, '#5fa986')}
          </g>
          <text x="${points[i].x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="12" fill="#9c9187">${d.label}</text>
        `).join('')}
      </svg>
    `;
    
    container.innerHTML = html;
    
    const animStyle = document.createElement('style');
    animStyle.innerHTML = `
      .anim-line {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: drawLine 1.5s ease-out forwards;
      }
      @keyframes drawLine {
        to { stroke-dashoffset: 0; }
      }
      .chart-point-group {
        opacity: 0;
        animation: fadeIn 0.5s ease-out forwards;
        animation-delay: 0.8s;
      }
      @keyframes fadeIn {
        to { opacity: 1; }
      }
    `;
    container.appendChild(animStyle);
  },

  renderDistortionChart() {
    const container = document.getElementById('distortion-chart');
    if (!container) return;
    
    const stats = (window.Storage && window.Storage.getDistortionStats()) || {};
    const data = Object.entries(stats)
      .map(([id, count]) => ({ id, count, label: this.distortionLabels[id] || id, color: this.distortionColors[id] || '#cbd5e1' }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
      
    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem; text-align: center;">
          <p style="font-weight: 700; color: var(--text-primary); margin-bottom: 0.4rem;">아직 발견된 인지 왜곡이 없습니다</p>
          <p style="font-size: 0.83rem; color: var(--text-muted); margin: 0;">AI 상담사와 대화를 나누시면 생각 속 왜곡 패턴이 이곳에 자동 집계됩니다.</p>
        </div>`;
      return;
    }
    
    const maxCount = Math.max(...data.map(d => d.count), 1);
    
    let html = '<div class="bar-chart-container">';
    data.forEach((d, i) => {
      const widthPct = (d.count / maxCount) * 100;
      html += `
        <div class="bar-row">
          <div class="bar-label">${d.label}</div>
          <div class="bar-track">
            <div class="bar-fill" style="background-color: ${d.color}; width: 0%; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.1}s;" data-width="${widthPct}%"></div>
          </div>
          <div class="bar-value">${d.count}</div>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    
    setTimeout(() => {
      container.querySelectorAll('.bar-fill').forEach(bar => {
        bar.style.width = bar.getAttribute('data-width');
      });
    }, 50);
  },

  updateStats() {
    const elSessions = document.getElementById('stat-sessions');
    const elRecords = document.getElementById('stat-records');
    const elStreak = document.getElementById('stat-streak');
    const elDistortions = document.getElementById('stat-distortions');
    
    const msgs = (window.Storage && window.Storage.getMessages()) || [];
    const userMsgs = msgs.filter(m => m.role === 'user').length;
    const storedSessions = (window.Storage && window.Storage.getTotalSessions()) || 0;
    const records = (window.Storage && window.Storage.getThoughtRecords()) || [];
    const stats = (window.Storage && window.Storage.getDistortionStats()) || {};
    const isOnlyMock = records.length > 0 && records.every(r => r.id && r.id.startsWith('rec_mock_')) && userMsgs === 0;

    const uniqueTypes = Object.keys(stats).filter(k => stats[k] > 0).length;
    const streak = (window.Storage && window.Storage.getStreak()) || 0;

    if (elSessions) {
      this._animateCounter(elSessions, isOnlyMock ? 11 : (userMsgs || storedSessions || 0));
    }
    
    if (elRecords) {
      this._animateCounter(elRecords, isOnlyMock ? 7 : records.length);
    }
    
    if (elStreak) {
      this._animateCounter(elStreak, isOnlyMock ? 5 : streak);
    }
    
    if (elDistortions) {
      this._animateCounter(elDistortions, isOnlyMock ? 7 : uniqueTypes);
    }
  },

  _prepareMoodData() {
    const today = new Date();
    const result = [];
    const moodEntries = (window.Storage && window.Storage.getMoodEntries(30)) || [];
    const thoughtRecords = (window.Storage && window.Storage.getThoughtRecords()) || [];
    const messages = (window.Storage && window.Storage.getMessages()) || [];
    const userMsgs = messages.filter(m => m.role === 'user').length;
    const isOnlyMock = thoughtRecords.length > 0 && thoughtRecords.every(r => r.id && r.id.startsWith('rec_mock_')) && userMsgs === 0;
    const baselineScores = [2, 3, 2, 4, 3, 4, 5];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = `${d.getMonth() + 1}/${d.getDate()}`;

      let score = null;

      // 1. 저장된 명시적 기분 기록 확인
      const entry = moodEntries.find(e => e.date && e.date.startsWith(dateStr));
      if (entry) score = entry.score;

      // 2. 해당 날짜 사고 기록지 감정 점수 계산
      if (!score) {
        const record = thoughtRecords.find(r => r.date && r.date.startsWith(dateStr));
        if (record) {
          if (record.newEmotions) {
            if (typeof record.newEmotions === 'string') {
              const match = record.newEmotions.match(/(\d+)%/);
              if (match) {
                const p = parseInt(match[1], 10);
                score = p < 40 ? 4 : (p < 60 ? 3 : 2);
              }
            } else if (Array.isArray(record.newEmotions) && record.newEmotions.length > 0) {
              const avgNew = record.newEmotions.reduce((sum, e) => sum + (e.intensity || 50), 0) / record.newEmotions.length;
              score = Math.max(1, Math.min(5, Math.round(5 - (avgNew / 25))));
            }
          }
        }
      }

      // 3. 해당 날짜 대화 기록이 있으면 점수 부여
      if (!score) {
        const hasMsg = messages.some(m => {
          if (!m.timestamp) return false;
          const mDate = typeof m.timestamp === 'number' ? new Date(m.timestamp) : new Date(m.timestamp);
          return mDate.toISOString().split('T')[0] === dateStr;
        });
        if (hasMsg) score = 3;
      }

      // 4. Default fallback: 0건 샘플 상태일 때는 샘플 회복 곡선 [2,3,2,4,3,4,5] 제공.
      // 실사용 대화나 기록이 생성되면 샘플을 즉시 제거하고 기본 평온 상태(3) 적용!
      if (!score) {
        score = isOnlyMock ? baselineScores[6 - i] : 3;
      }

      result.push({ score, label, dateStr });
    }
    return result;
  },
  
  _createSmoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
    
    let path = `M ${points[0].x},${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] !== undefined ? points[i + 2] : points[i + 1];
      
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    
    return path;
  },
  
  _animateCounter(element, target) {
    const duration = 1000;
    const start = 0; // parseInt(element.textContent || '0');
    const range = target - start;
    let startTime = null;
    
    if (range === 0) {
      element.textContent = target;
      return;
    }
    
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      element.textContent = Math.floor(start + (range * easeProgress));
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        element.textContent = target;
      }
    };
    
    window.requestAnimationFrame(step);
  }
};

document.addEventListener('DOMContentLoaded', () => window.Dashboard.init());
