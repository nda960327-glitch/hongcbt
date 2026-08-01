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
    this.updateStats();
    this.renderMoodChart();
    this.renderDistortionChart();
  },
  
  renderMoodChart() {
    const container = document.getElementById('mood-chart');
    if (!container) return;
    
    // Get last 7 days mood data from Storage
    const moodEntries = window.Storage.getMoodEntries(7) || [];
    
    if (moodEntries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>아직 기분 기록이 없습니다.</p>
          <p>채팅이나 기록을 통해 감정을 남겨보세요.</p>
        </div>`;
      return;
    }
    
    // Format data for chart
    const data = this._prepareMoodData(moodEntries);
    
    // SVG setup
    const width = 600;
    const height = 250;
    const padding = { top: 40, right: 30, bottom: 40, left: 40 };
    
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
    
    // Add CSS for animation dynamically or assume it exists
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
        animation-delay: 1s;
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
    
    const stats = window.Storage.getDistortionStats() || {};
    const data = Object.entries(stats)
      .map(([id, count]) => ({ id, count, label: this.distortionLabels[id] || id, color: this.distortionColors[id] || '#cbd5e1' }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // top 5
      
    if (data.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>아직 발견된 인지 왜곡이 없습니다.</p>
          <p>사고 기록지를 꾸준히 작성해보세요.</p>
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
    
    // Trigger animation next frame
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
    
    if (elSessions) this._animateCounter(elSessions, window.Storage.getTotalSessions());
    
    if (elRecords) {
      const records = window.Storage.getThoughtRecords() || [];
      this._animateCounter(elRecords, records.length);
    }
    
    if (elStreak) this._animateCounter(elStreak, window.Storage.getStreak());
    
    if (elDistortions) {
      const stats = window.Storage.getDistortionStats() || {};
      const uniqueTypes = Object.keys(stats).filter(k => stats[k] > 0).length;
      this._animateCounter(elDistortions, uniqueTypes);
    }
  },
  
  _prepareMoodData(entries) {
    // Return last 7 days of data with labels
    // For simplicity, just format what we have
    return entries.map(e => {
      const date = new Date(e.date);
      const label = `${date.getMonth()+1}/${date.getDate()}`;
      return { score: e.score, label };
    });
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
