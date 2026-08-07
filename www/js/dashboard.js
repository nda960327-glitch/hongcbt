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
    this.renderTodayMoodChart();
    this.renderMoodCalendar();
    this.renderMonthlyReport();
    this.renderMyReports();
    this.renderChatInsights();
    this.renderCareFootprint();
    if (window.Weekly) window.Weekly.renderCard();
    if (window.Growth) window.Growth.renderNightList();
  },

  // ==========================================================================
  //  월간 리포트 — 한 달을 숫자와 감정으로 돌아보고, 지난달과 비교한다
  // ==========================================================================
  _mrOffset: 0,

  shiftMonthly(d) {
    this._mrOffset = Math.min(0, this._mrOffset + d);
    this.renderMonthlyReport();
  },

  _monthStats(offset) {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + offset);
    const y = base.getFullYear(), m = base.getMonth();
    const inMonth = ts => { const d = new Date(ts); return d.getFullYear() === y && d.getMonth() === m; };
    const S = window.Storage;
    const moods = (S._safeGet('cbt_mood_log', []) || []).filter(x => inMonth(x.ts));
    const emoCnt = {};
    moods.forEach(x => { if (x.emo) emoCnt[x.emo] = (emoCnt[x.emo] || 0) + 1; });
    return {
      y, m,
      label: `${y}년 ${m + 1}월`,
      checkins: moods.length,
      avg: moods.length ? moods.reduce((s, x) => s + (x.v || 3), 0) / moods.length : null,
      topEmos: Object.entries(emoCnt).sort((a, b) => b[1] - a[1]).slice(0, 3),
      nights: (S._safeGet('cbt_night_journal', []) || []).filter(x => inMonth(x.ts)).length,
      missions: ((S._safeGet('cbt_mission_log', []) || []).filter(x => x.done && inMonth(x.ts))).length,
      records: (S.getThoughtRecords() || []).filter(r => !String(r.id).startsWith('rec_mock_') && inMonth(new Date(r.date).getTime())).length,
      activeDays: (S._safeGet('cbt_active_days', []) || []).filter(d => { const t = new Date(d + 'T00:00:00'); return t.getFullYear() === y && t.getMonth() === m; }).length
    };
  },

  renderMonthlyReport() {
    const el = document.getElementById('monthly-report');
    if (!el) return;
    const cur = this._monthStats(this._mrOffset);
    const prev = this._monthStats(this._mrOffset - 1);
    const MOOD_EMOJI = { '기쁨': '😄', '편안': '🙂', '보통': '😐', '불안': '😟', '우울': '😢', '뿌듯': '😊', '분노': '😠', '외로움': '🥲', '좌절': '😞' };

    const diff = (a, b) => {
      if (b === 0 && a === 0) return '';
      const d = a - b;
      if (d > 0) return `<span style="color: var(--accent-primary); font-size: 0.62rem; font-weight: 800;">▲${d}</span>`;
      if (d < 0) return `<span style="color: var(--text-muted); font-size: 0.62rem;">▼${-d}</span>`;
      return '<span style="color: var(--text-muted); font-size: 0.62rem;">—</span>';
    };
    const tile = (emoji, label, v, cmp) => `
      <div style="flex: 1; min-width: 74px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.6rem 0.4rem; text-align: center;">
        <div style="font-size: 1.05rem;">${emoji}</div>
        <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary);">${v} ${cmp}</div>
        <div style="font-size: 0.64rem; color: var(--text-muted);">${label}</div>
      </div>`;

    let moodLine;
    if (cur.avg == null) moodLine = '이 달엔 기분 기록이 없어요.';
    else if (prev.avg == null) moodLine = `평균 기분 <b>${cur.avg.toFixed(1)}</b>/5로 한 달을 보냈어요.`;
    else {
      const d = cur.avg - prev.avg;
      moodLine = d >= 0.3 ? `지난달보다 마음이 <b style="color: var(--accent-primary);">한결 가벼워졌어요</b> (${prev.avg.toFixed(1)} → ${cur.avg.toFixed(1)})`
        : d <= -0.3 ? `지난달보다 조금 무거운 달이었어요 (${prev.avg.toFixed(1)} → ${cur.avg.toFixed(1)}) — 그래도 ${cur.checkins}번이나 마음을 들여다봤어요`
        : `지난달과 비슷한 흐름이에요 (평균 ${cur.avg.toFixed(1)}/5)`;
    }

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <h3 style="margin: 0;">📈 월간 리포트</h3>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <button class="btn-secondary" style="width: auto; padding: 0.2rem 0.6rem; font-size: 0.85rem;" onclick="window.Dashboard.shiftMonthly(-1)">‹</button>
          <strong style="font-size: 0.88rem; color: var(--text-primary); min-width: 88px; text-align: center;">${cur.label}</strong>
          <button class="btn-secondary" style="width: auto; padding: 0.2rem 0.6rem; font-size: 0.85rem; ${this._mrOffset >= 0 ? 'opacity: 0.35; pointer-events: none;' : ''}" onclick="window.Dashboard.shiftMonthly(1)">›</button>
        </div>
      </div>
      <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 0.7rem; line-height: 1.55;">${moodLine}<br><span style="font-size: 0.74rem; color: var(--text-muted);">이 달에 나를 돌본 날: <b>${cur.activeDays}일</b> (지난달 ${prev.activeDays}일)</span></p>
      <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
        ${tile('🫶', '체크인', cur.checkins, diff(cur.checkins, prev.checkins))}
        ${tile('🌙', '하루 정리', cur.nights, diff(cur.nights, prev.nights))}
        ${tile('🎯', '미션', cur.missions, diff(cur.missions, prev.missions))}
        ${tile('📝', '사고 기록', cur.records, diff(cur.records, prev.records))}
      </div>
      ${cur.topEmos.length ? `
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.7rem; align-items: center;">
          <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">자주 만난 감정:</span>
          ${cur.topEmos.map(([e, c]) => `<span style="font-size: 0.74rem; font-weight: 700; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 999px; padding: 0.18rem 0.6rem;">${MOOD_EMOJI[e] || ''} ${e} ${c}회</span>`).join('')}
        </div>` : ''}`;
  },

  // ==========================================================================
  //  마음 돌봄 정원 — 딱딱한 CBT 숫자 대신, 나를 돌본 흔적이 자라나는 정원.
  //  행동활성화(BA) 원리: 돌봄 행동이 눈에 보이면 다음 행동이 쉬워진다.
  // ==========================================================================
  renderCareFootprint() {
    const el = document.getElementById('care-footprint');
    if (!el) return;
    const S = window.Storage;
    const dayKey = ts => new Date(ts).toLocaleDateString('sv-CA');

    // 최근 7일 각 날의 '돌봄 행동' 수집 (체크인·하루정리·미션·사고기록·호흡은 카운터라 제외)
    const events = {};
    const add = (ts, label) => { const k = dayKey(ts); (events[k] = events[k] || []).push(label); };
    (S._safeGet('cbt_mood_log', []) || []).forEach(m => add(m.ts, '감정 체크인'));
    (S._safeGet('cbt_night_journal', []) || []).forEach(j => add(j.ts, '하루 정리'));
    ((S._safeGet('cbt_mission_log', []) || []).filter(m => m.done)).forEach(m => add(m.ts, '행동 미션'));
    (S.getThoughtRecords() || []).filter(r => !String(r.id).startsWith('rec_mock_')).forEach(r => add(new Date(r.date).getTime(), '사고 기록'));

    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toLocaleDateString('sv-CA');
      week.push({ k, dow: d.toLocaleDateString('ko-KR', { weekday: 'short' }), n: (events[k] || []).length, today: i === 0 });
    }
    const weekTotal = week.reduce((s, d) => s + d.n, 0);
    const plant = n => n === 0 ? '·' : n === 1 ? '🌱' : n <= 3 ? '🌿' : '🌸';

    // 이번 주 돌봄 종류별 집계
    const from = Date.now() - 7 * 86400000;
    const week7 = ts => ts >= from;
    const care = [
      { emoji: '🫶', name: '감정 체크인', n: (S._safeGet('cbt_mood_log', []) || []).filter(m => week7(m.ts)).length },
      { emoji: '🌙', name: '하루 정리',   n: (S._safeGet('cbt_night_journal', []) || []).filter(j => week7(j.ts)).length },
      { emoji: '🎯', name: '행동 미션',   n: ((S._safeGet('cbt_mission_log', []) || []).filter(m => m.done && week7(m.ts))).length },
      { emoji: '📝', name: '생각 정리',   n: (S.getThoughtRecords() || []).filter(r => !String(r.id).startsWith('rec_mock_') && week7(new Date(r.date).getTime())).length },
      { emoji: '🫧', name: '호흡·안정',   n: null, total: S._safeGet('cbt_breath_count', 0) || 0 }
    ];
    const streak = S.getStreak() || 0;

    // 우렁이의 응원 한 줄 (데이터 기반)
    let cheer;
    if (weekTotal === 0) cheer = '이번 주 첫 돌봄을 시작해볼까요? 체크인 한 번이면 씨앗이 심어져요.';
    else if (weekTotal < 5) cheer = `이번 주 나를 ${weekTotal}번 돌봤어요. 씨앗이 움트고 있어요.`;
    else if (weekTotal < 12) cheer = `이번 주 나를 ${weekTotal}번 돌봤어요! 정원이 제법 푸릇푸릇해요.`;
    else cheer = `이번 주 ${weekTotal}번의 돌봄이라니, 정원이 활짝 피었어요! 🌸`;

    el.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
        <h3 style="margin: 0;">🌿 나의 마음 정원</h3>
        ${streak >= 2 ? `<span style="font-size: 0.74rem; font-weight: 800; color: #e8590c;">🔥 ${streak}일 연속</span>` : ''}
      </div>
      <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0.25rem 0 0.8rem;">나를 돌본 만큼 자라나요 — ${cheer}</p>
      <div style="display: flex; gap: 0.35rem; margin-bottom: 0.9rem;">
        ${week.map(d => `
          <div title="${d.k} · 돌봄 ${d.n}회" style="flex: 1; text-align: center; padding: 0.5rem 0 0.4rem; border-radius: 12px; background: ${d.n > 0 ? 'color-mix(in srgb, var(--accent-primary) 10%, var(--bg-tertiary))' : 'var(--bg-tertiary)'}; ${d.today ? 'outline: 2px solid var(--accent-primary); outline-offset: 1px;' : ''}">
            <div style="font-size: ${d.n > 0 ? '1.25rem' : '1.1rem'}; line-height: 1.3; ${d.n === 0 ? 'color: var(--text-muted); opacity: 0.5;' : ''}">${plant(d.n)}</div>
            <div style="font-size: 0.62rem; font-weight: 700; color: var(--text-muted); margin-top: 0.15rem;">${d.dow}</div>
          </div>`).join('')}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
        ${care.map(c => `
          <span style="display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.74rem; font-weight: 700; padding: 0.3rem 0.65rem; border-radius: 999px; background: ${(c.n || c.total) ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-tertiary)'}; color: ${(c.n || c.total) ? 'var(--accent-primary)' : 'var(--text-muted)'}; border: 1px solid ${(c.n || c.total) ? 'color-mix(in srgb, var(--accent-primary) 28%, transparent)' : 'var(--glass-border)'};">
            ${c.emoji} ${c.name} ${c.n != null ? (c.n ? `주 ${c.n}회` : '—') : (c.total ? `누적 ${c.total}회` : '—')}
          </span>`).join('')}
      </div>`;
  },

  // ==========================================================================
  //  감정 캘린더 — 한 달을 색으로 (원탭 체크인·대화·하루정리 기분 로그 기반)
  // ==========================================================================
  _calOffset: 0,

  shiftCalendar(d) {
    this._calOffset = Math.min(0, this._calOffset + d);
    this.renderMoodCalendar();
  },

  renderMoodCalendar() {
    const el = document.getElementById('mood-calendar');
    if (!el) return;
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + this._calOffset);
    const y = base.getFullYear(), m = base.getMonth();

    const log = (window.Storage && window.Storage._safeGet('cbt_mood_log', [])) || [];
    const byDay = {};
    log.forEach(e => {
      const k = new Date(e.ts).toLocaleDateString('sv-CA');
      (byDay[k] = byDay[k] || []).push(e.v || 3);
    });

    const colorFor = v => v >= 4.3 ? '#4f8a6b' : v >= 3.5 ? '#8fbf7f' : v >= 2.6 ? '#e0c36b' : v >= 1.9 ? '#dd9a62' : '#cf6b60';
    const emoFor = v => v >= 4.3 ? '😄' : v >= 3.5 ? '🙂' : v >= 2.6 ? '😐' : v >= 1.9 ? '😟' : '😢';
    const firstDow = new Date(y, m, 1).getDay(); // 0=일
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = new Date().toLocaleDateString('sv-CA');

    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const arr = byDay[key];
      const avg = arr ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const isToday = key === todayStr;
      const isFuture = key > todayStr;
      cells += `<div onclick="${!isFuture ? `window.Dashboard.openDayDetail('${key}')` : ''}"
        style="aspect-ratio: 1; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 700; cursor: ${!isFuture ? 'pointer' : 'default'};
        ${avg != null ? `background: ${colorFor(avg)}; color: #fff;` : `background: var(--bg-tertiary); color: var(--text-muted); ${isFuture ? 'opacity: 0.35;' : ''}`}
        ${isToday ? 'outline: 2px solid var(--accent-primary); outline-offset: 1.5px;' : ''}">${d}</div>`;
    }

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
        <h3 style="margin: 0;">🗓️ 감정 캘린더</h3>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <button class="btn-secondary" style="width: auto; padding: 0.2rem 0.6rem; font-size: 0.85rem;" onclick="window.Dashboard.shiftCalendar(-1)">‹</button>
          <strong style="font-size: 0.88rem; color: var(--text-primary); min-width: 82px; text-align: center;">${y}년 ${m + 1}월</strong>
          <button class="btn-secondary" style="width: auto; padding: 0.2rem 0.6rem; font-size: 0.85rem; ${this._calOffset >= 0 ? 'opacity: 0.35; pointer-events: none;' : ''}" onclick="window.Dashboard.shiftCalendar(1)">›</button>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.3rem; font-size: 0.64rem; font-weight: 700; color: var(--text-muted); text-align: center; margin-bottom: 0.3rem;">
        <div style="color: #cf6b60;">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div style="color: #6f97ab;">토</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.3rem;">${cells}</div>
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.35rem; margin-top: 0.7rem; font-size: 0.66rem; color: var(--text-muted);">
        힘든 날
        ${['#cf6b60', '#dd9a62', '#e0c36b', '#8fbf7f', '#4f8a6b'].map(c => `<span style="width: 13px; height: 13px; border-radius: 4px; background: ${c};"></span>`).join('')}
        좋은 날 · 날짜를 누르면 그날의 일기가 열려요
      </div>`;
  },

  // '그날의 나'에서 잘못 남긴 기록 삭제 (재미로 눌러본 가짜 데이터 정리용)
  deleteMood(ts, key) {
    const log = (window.Storage._safeGet('cbt_mood_log', []) || []).filter(m => m.ts !== ts);
    window.Storage._safeSet('cbt_mood_log', log);
    this.renderMoodCalendar();
    this.renderTodayMoodChart();
    this.openDayDetail(key);
  },

  deleteNight(ts, key) {
    if (!confirm('이 하루 정리를 삭제할까요?')) return;
    const j = (window.Storage._safeGet('cbt_night_journal', []) || []).filter(x => x.ts !== ts);
    window.Storage._safeSet('cbt_night_journal', j);
    if (window.Growth) window.Growth.renderNightList();
    this.openDayDetail(key);
  },

  deleteMission(ts, key) {
    const log = (window.Storage._safeGet('cbt_mission_log', []) || []).filter(m => m.ts !== ts);
    window.Storage._safeSet('cbt_mission_log', log);
    // 오늘 미션을 지운 거라면 홈 카드의 '완료' 상태도 되돌린다 (다시 도전 가능)
    const s = window.Storage._safeGet('cbt_daily_mission', null);
    if (s && s.done && new Date(ts).toLocaleDateString('sv-CA') === s.date) {
      s.done = false;
      delete s.ts;
      window.Storage._safeSet('cbt_daily_mission', s);
      if (window.Missions) window.Missions.renderCard();
    }
    this.renderCareFootprint();
    this.openDayDetail(key);
  },

  // 날짜 탭 → 그날의 나: 기분 체크인·하루정리·미션·사고기록을 한 장으로
  openDayDetail(key) {
    const S = window.Storage;
    const dayStart = new Date(key + 'T00:00:00').getTime();
    const dayEnd = dayStart + 86400000;
    const inDay = ts => ts >= dayStart && ts < dayEnd;
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

    const moods = (S._safeGet('cbt_mood_log', []) || []).filter(m => inDay(m.ts));
    const nights = (S._safeGet('cbt_night_journal', []) || []).filter(j => inDay(j.ts));
    const missions = (S._safeGet('cbt_mission_log', []) || []).filter(m => m.done && inDay(m.ts));
    const records = (S.getThoughtRecords() || []).filter(r => !String(r.id).startsWith('rec_mock_') && inDay(new Date(r.date).getTime()));
    const MOOD_EMOJI = { '기쁨': '😄', '편안': '🙂', '보통': '😐', '불안': '😟', '우울': '😢', '뿌듯': '😊', '분노': '😠', '외로움': '🥲', '좌절': '😞' };
    const missionName = id => { const m = (window.Missions && window.Missions.POOL.find(x => x.id === id)); return m ? `${m.emoji} ${m.text}` : ''; };
    const hasAny = moods.length || nights.length || missions.length || records.length;
    const dateStr = new Date(dayStart).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });

    const old = document.getElementById('day-detail-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'day-detail-overlay';
    ov.className = 'modal-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 380px; max-height: 80vh; overflow-y: auto; text-align: left;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.8rem;">
          <h2 style="margin: 0; font-size: 1.1rem;">📖 ${dateStr}의 나</h2>
          <button class="close-btn" onclick="document.getElementById('day-detail-overlay').remove()">✕</button>
        </div>
        ${!hasAny ? `
          <div style="text-align: center; padding: 0.6rem 0 1rem;">
            <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('blank', 90) : ''}</span>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.6rem 0 0;">이 날은 남긴 기록이 없어요.<br>기록이 없던 날도, 살아낸 하루예요.</p>
          </div>` : `
          ${moods.length ? `
            <p style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted); margin: 0 0 0.4rem;">🫶 감정 체크인 <span style="font-weight: 500; font-size: 0.68rem;">(✕로 잘못 누른 기록 삭제)</span></p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.9rem;">
              ${moods.map(m => `<span style="display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 999px; padding: 0.25rem 0.35rem 0.25rem 0.6rem;">${MOOD_EMOJI[m.emo] || '🙂'} ${esc(m.emo)} <span style="color: var(--text-muted); font-size: 0.68rem;">${new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span><button onclick="window.Dashboard.deleteMood(${m.ts}, '${key}')" style="all: unset; cursor: pointer; width: 16px; height: 16px; border-radius: 50%; background: var(--glass-border); color: var(--text-muted); font-size: 0.62rem; display: inline-flex; align-items: center; justify-content: center;">✕</button></span>`).join('')}
            </div>` : ''}
          ${nights.map(j => `
            <p style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted); margin: 0 0 0.4rem;">🌙 하루 정리 <span style="font-weight: 600;">(${new Date(j.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 취침)</span></p>
            <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem; margin-bottom: 0.9rem; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.6; position: relative;">
              <button onclick="window.Dashboard.deleteNight(${j.ts}, '${key}')" title="이 하루 정리 삭제" style="all: unset; cursor: pointer; position: absolute; top: 0.5rem; right: 0.6rem; color: var(--text-muted); font-size: 0.78rem; padding: 0.15rem;">✕</button>
              ${j.mood ? `그날의 기분: ${MOOD_EMOJI[j.mood.emo] || ''} ${esc(j.mood.emo)}<br>` : ''}
              ${j.moment ? `남은 순간: ${esc(j.moment)}<br>` : ''}
              ${j.note ? `나에게: ${esc(j.note)}` : ''}
            </div>`).join('')}
          ${missions.length ? `
            <p style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted); margin: 0 0 0.4rem;">🎯 해낸 미션</p>
            <div style="margin-bottom: 0.9rem; font-size: 0.84rem; color: var(--text-secondary); line-height: 1.7;">${missions.map(m => `${esc(m.text ? `🌱 ${m.text}` : missionName(m.id))} <button onclick="window.Dashboard.deleteMission(${m.ts}, '${key}')" style="all: unset; cursor: pointer; color: var(--text-muted); font-size: 0.66rem; padding: 0.1rem 0.3rem;">✕</button>`).join('<br>')}</div>` : ''}
          ${records.length ? `
            <p style="font-size: 0.78rem; font-weight: 800; color: var(--text-muted); margin: 0 0 0.4rem;">📝 사고 기록 ${records.length}건</p>
            ${records.map(r => `<div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55;">"${esc((r.thought || '').slice(0, 60))}"${r.alternative ? `<br><span style="color: var(--accent-primary);">→ ${esc(r.alternative.slice(0, 60))}</span>` : ''}</div>`).join('')}
            <button class="btn-secondary" style="width: 100%; font-size: 0.8rem; margin-top: 0.2rem;" onclick="document.getElementById('day-detail-overlay').remove(); window.App.switchTab('record');">사고 기록지 전체 보기 ›</button>` : ''}
        `}
      </div>`;
    document.body.appendChild(ov);
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

  async generateDailySummary() {
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

    // 진짜 AI 요약: 최근 대화를 모델이 직접 읽고 요약한다 (템플릿 조합 아님)
    try {
      const raw = await this._generateAiSummaryText();
      // 첫 줄 = "[주요 감정: ...] 제목", 나머지 = 본문
      const lines = raw.split('\n');
      const title = (lines[0] || '').trim();
      const body = lines.slice(1).join('\n').trim() || raw;

      const now = new Date();
      const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
        + ' ' + now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const summaryObj = { date: dateStr, title, body };

      if (window.Storage && window.Storage.saveSummaryReport) {
        window.Storage.saveSummaryReport(summaryObj);
      }
      // 지난 리포트 목록에도 쌓는다 (최대 10개 — 무한정 길어지지 않게 자동 정리)
      const reports = (window.Storage._safeGet('cbt_my_reports', []) || []);
      reports.unshift({ id: 'rep_' + Date.now(), date: dateStr, title, body });
      window.Storage._safeSet('cbt_my_reports', reports.slice(0, 10));

      this.updateSampleBadges();
      this.updateStats();
      this.renderSummaryReportCard(summaryObj);
      this.renderMyReports();
    } catch (e) {
      container.innerHTML = `
        <div style="background: var(--bg-tertiary); border: 1px dashed var(--glass-border); border-radius: 12px; padding: 1.1rem; text-align: center;">
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${
            e && e.message === 'NO_CHAT'
              ? '요약할 대화가 아직 없어요. 챗봇과 이야기를 나눈 뒤 다시 시도해주세요.'
              : 'AI 요약 생성에 실패했어요. 네트워크를 확인하고 다시 시도해주세요.'
          }</p>
        </div>`;
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✨ 요약 다시 생성하기';
    }
  },

  // 최근 대화 → AI 요약 본문 (대시보드·마이페이지 리포트가 공용으로 사용)
  async _generateAiSummaryText() {
    const messages = (window.Storage && window.Storage.getMessages()) || [];
    const userCount = messages.filter(m => m.role === 'user').length;
    if (userCount < 2 || !window.LLM) throw new Error('NO_CHAT');

    const recent = messages.slice(-40).map(m => `${m.role === 'user' ? '나' : '상담사'}: ${m.text}`).join('\n');
    const memory = (window.Storage.getUserMemory && window.Storage.getUserMemory()) || '';

    const prompt = `아래는 심리상담 앱에서 나눈 최근 대화입니다. 사용자 본인이 나중에 다시 읽어볼 'AI 상담 요약 리포트'를 한국어로 작성하세요.

첫 줄은 반드시 이 형식의 제목: [주요 감정: 감정1, 감정2] 한 줄 제목
그 다음 줄부터 본문 (각 항목 1~2문장, 마크다운 기호 없이 아래 제목 그대로):
· 오늘 나눈 이야기: ...
· 주요 감정: ...
· 발견한 생각 패턴: 관찰된 인지왜곡이 있으면 이름과 함께 구체적으로
· 좋아지고 있는 것: 이전과 비교해 나아지고 있는 점을 세밀하게 (참고 기록의 흐름 활용, 없으면 솔직하게)
· 다뤄볼 점: 앞으로 고쳐가거나 살펴보면 좋을 부분을 구체적으로
· 한 줄 정리: ...

따뜻하되 담백하게, 사용자에게 말하듯 쓰세요. 과장이나 진단은 금지. 전체 450자 이내.

[참고 기록]
${memory || '(없음)'}

[최근 대화]
${recent}`;

    const res = await window.LLM._chatCompletion({
      model: window.LLM.MEMORY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 500
    });
    if (!res.ok) throw new Error('API');
    const data = await res.json();
    const text = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
    if (!text) throw new Error('API');
    return text;
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
          <p style="margin: 0 0 0.4rem 0; font-size: 0.88rem; font-weight: 700; color: var(--text-primary);">아직 생성된 요약이 없습니다.</p>
          <p style="margin: 0; font-size: 0.82rem; color: var(--text-muted);">상단의 <strong>[+ 오늘의 대화 요약 생성하기]</strong>를 누르면 AI가 최근 대화를 읽고 요약해드려요.</p>
        </div>
      `;
      return;
    }

    // 요약 본문: 새 형식(body) 우선, 예전 형식(항목별)은 이어붙여 호환
    const body = report.body
      || [report.chiefComplaint, report.distortionText, report.clinicalNote].filter(Boolean).join('\n');

    container.innerHTML = `
      <div id="summary-report-card" style="background: var(--bg-secondary); border: 1px solid color-mix(in srgb, var(--accent-primary) 35%, transparent); border-radius: 14px; padding: 1.15rem; box-shadow: var(--shadow-sm);">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px dashed var(--glass-border); padding-bottom: 0.6rem; margin-bottom: 0.8rem;">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--accent-primary);">✨ AI 상담 요약</div>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${report.date || ''}</span>
        </div>
        ${report.title ? `<h4 style="margin: 0 0 0.55rem 0; font-size: 0.97rem; color: var(--text-primary); line-height: 1.4;">${report.title}</h4>` : ''}
        <div id="summary-report-body" data-raw="" style="margin: 0;">${this._formatReportRows(body).join('')}</div>
        <div style="display: flex; justify-content: flex-end; margin-top: 0.85rem; border-top: 1px solid var(--glass-border); padding-top: 0.7rem;">
          <button onclick="window.Dashboard.copySummaryReport()" class="btn-secondary-sm" style="font-size: 0.78rem; padding: 0.4rem 0.85rem; border-radius: 8px; cursor: pointer; border: 1px solid var(--glass-border); background: var(--bg-primary); color: var(--text-primary);">📋 복사하기</button>
        </div>
      </div>
    `;
  },

  copySummaryReport() {
    const bodyEl = document.getElementById('summary-report-body');
    const card = document.getElementById('summary-report-card');
    if (!bodyEl && !card) return;
    const text = (bodyEl ? bodyEl.innerText : card.innerText.replace(/📋 복사하기|✨ AI 상담 요약/g, '')).trim();
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

  // === 마이페이지 CBT 요약 리포트 (실제 AI 생성 + 샘플 자동 정리) ===
  getMyReports() {
    return (window.Storage && window.Storage._safeGet('cbt_my_reports', [])) || [];
  },

  // "· 라벨: 내용" 형식의 본문을 읽기 좋은 행들로 변환
  _formatReportRows(body) {
    return String(body || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = l.match(/^[·•-]\s*([^:：]{1,14})[:：]\s*(.*)$/);
      if (m) {
        return `<div style="margin: 0.45rem 0;">
          <span style="display: inline-block; font-size: 0.7rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 11%, transparent); padding: 0.12rem 0.55rem; border-radius: 999px; margin-bottom: 0.2rem;">${m[1].trim()}</span>
          <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.55;">${m[2].trim()}</div>
        </div>`;
      }
      return `<div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.55; margin: 0.3rem 0;">${l}</div>`;
    });
  },

  deleteReport(id) {
    if (!confirm('이 리포트를 삭제할까요?\n(이야기 자체는 우렁이의 기억에 그대로 남아있어요)')) return;
    const reports = this.getMyReports().filter(r => r.id !== id);
    window.Storage._safeSet('cbt_my_reports', reports);
    this.renderMyReports();
  },

  renderMyReports() {
    const list = document.getElementById('report-list');
    if (!list) return;
    const reports = this.getMyReports();
    const note = document.getElementById('report-list-note');
    if (note) note.classList.toggle('hidden', reports.length === 0);
    list.innerHTML = '';

    reports.forEach(r => {
      const rows = this._formatReportRows(r.body);
      const div = document.createElement('div');
      div.style.cssText = 'background: var(--bg-tertiary); border-radius: 12px; padding: 1rem; border-left: 4px solid var(--accent-primary); position: relative;';
      div.innerHTML = `
        <button class="rep-del" title="리포트 삭제" style="position: absolute; top: 0.6rem; right: 0.6rem; background: none; border: none; color: var(--text-muted); font-size: 1rem; cursor: pointer; padding: 0.2rem 0.4rem;">✕</button>
        <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 0.3rem; padding-right: 1.6rem;">${r.date} 작성
          <span style="background: color-mix(in srgb, var(--accent-primary) 14%, transparent); color: var(--accent-primary); font-size: 0.66rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.3rem;">AI 생성</span>
        </div>
        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.94rem; color: var(--text-primary); line-height: 1.4;"></h4>
        <div class="rep-rows-head"></div>
        <div class="rep-rows-rest" style="display: none;"></div>
        <div style="margin-top: 0.7rem; display: flex; gap: 0.5rem;">
          <button class="btn-secondary rep-detail" style="font-size: 0.75rem; padding: 0.3rem 0.7rem; width: auto;">상세보기</button>
          <button class="btn-primary rep-share" style="font-size: 0.75rem; padding: 0.3rem 0.7rem; width: auto; background: var(--success-color, #10b981); border: none;">상담사에게 전송</button>
        </div>`;
      div.querySelector('h4').textContent = r.title || 'AI 상담 요약';
      div.querySelector('.rep-rows-head').innerHTML = rows.slice(0, 2).join('');
      div.querySelector('.rep-rows-rest').innerHTML = rows.slice(2).join('');
      const rest = div.querySelector('.rep-rows-rest');
      const detailBtn = div.querySelector('.rep-detail');
      if (rows.length <= 2) detailBtn.style.display = 'none';
      detailBtn.addEventListener('click', () => {
        const open = rest.style.display !== 'none';
        rest.style.display = open ? 'none' : 'block';
        detailBtn.textContent = open ? '상세보기' : '접기';
      });
      div.querySelector('.rep-share').addEventListener('click', () => {
        if (window.App && window.App.sendReportToCounselor) window.App.sendReportToCounselor(r);
      });
      div.querySelector('.rep-del').addEventListener('click', () => this.deleteReport(r.id));
      list.appendChild(div);
    });
  },

  // 다른 모듈에서 부르는 별칭
  renderReports() { this.renderMyReports(); },

  async generateMyReport() {
    const list = document.getElementById('report-list');
    if (!list) return;
    const loading = document.createElement('div');
    loading.style.cssText = 'background: var(--bg-tertiary); border: 1px dashed var(--accent-primary); border-radius: 8px; padding: 1rem; text-align: center; font-size: 0.85rem; color: var(--text-primary);';
    loading.textContent = '⏳ AI가 최근 대화를 읽고 요약하는 중...';
    list.insertBefore(loading, list.firstChild);

    try {
      const body = await this._generateAiSummaryText();
      const now = new Date();
      const reports = this.getMyReports();
      reports.unshift({
        id: 'rep_' + Date.now(),
        date: now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
          + ' ' + now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        body
      });
      window.Storage._safeSet('cbt_my_reports', reports.slice(0, 20));
      this.renderMyReports();
    } catch (e) {
      loading.remove();
      alert(e && e.message === 'NO_CHAT'
        ? '요약할 대화가 아직 없어요. 챗봇과 이야기를 나눈 뒤 다시 시도해주세요.'
        : 'AI 요약 생성에 실패했어요. 잠시 후 다시 시도해주세요.');
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
  
  // 감정 감지 규칙 (오늘 차트·주간 차트·영속 로그가 공유)
  MOOD_RULES: [
    { emo: '기쁨',   v: 5,   c: '#5fa986', keys: ['기뻐', '기쁘', '좋아', '좋았', '행복', '즐거', '신나', '최고', '설레', '재밌', '재미있'] },
    { emo: '편안',   v: 4,   c: '#7fc29b', keys: ['편안', '안심', '평화', '괜찮', '나아졌', '가벼워', '후련'] },
    { emo: '뿌듯',   v: 4.5, c: '#8fae5f', keys: ['뿌듯', '해냈', '성공', '완성', '칭찬'] },
    { emo: '불안',   v: 2,   c: '#c98a5a', keys: ['불안', '걱정', '긴장', '두렵', '무섭', '떨려', '초조'] },
    { emo: '우울',   v: 1.5, c: '#7b6fa8', keys: ['우울', '슬프', '슬퍼', '눈물', '울었', '서럽', '허무', '공허', '힘들', '지쳤', '지친'] },
    { emo: '분노',   v: 1.5, c: '#c96a5a', keys: ['화나', '화가', '짜증', '열받', '분노', '억울', '빡치'] },
    { emo: '외로움', v: 2,   c: '#7ba0b8', keys: ['외로', '혼자', '고독', '쓸쓸'] },
    { emo: '좌절',   v: 1.5, c: '#a8836f', keys: ['좌절', '실패', '포기', '망했', '망쳤', '답답', '절망', '무기력'] }
  ],

  detectMood(text) {
    const t = String(text || '').replace(/\s+/g, '');
    return this.MOOD_RULES.find(r => r.keys.some(k => t.includes(k))) || null;
  },

  // 로컬(기기) 기준 날짜 문자열 — toISOString은 UTC라 한국 새벽(00~09시)에
  // '어제'가 되어 오늘 차트가 비어버리는 버그가 있었다.
  _localDate(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  // 감정 로그에 기록 — 대화를 초기화해도 감정 흐름은 살아남는다
  logMood(text, ts) {
    const hit = this.detectMood(text);
    if (!hit || !window.Storage) return;
    const log = window.Storage._safeGet('cbt_mood_log', []) || [];
    log.push({ ts: ts || Date.now(), emo: hit.emo, v: hit.v });
    window.Storage._safeSet('cbt_mood_log', log.slice(-800));
  },

  // 기존 사용자 마이그레이션: 로그가 비어 있으면 현재 대화에서 한 번 채워넣는다
  _backfillMoodLog() {
    if (!window.Storage || this._backfilled) return;
    this._backfilled = true;
    const log = window.Storage._safeGet('cbt_mood_log', []) || [];
    if (log.length > 0) return;
    const msgs = (window.Storage.getMessages() || []).filter(m => m.role === 'user' && m.text && m.timestamp);
    msgs.forEach(m => this.logMood(m.text, new Date(m.timestamp).getTime()));
  },

  // 오늘의 감정 흐름 — 영속 감정 로그를 시간순으로 그린다.
  // 위쪽일수록 편안한 감정, 아래쪽일수록 힘든 감정. (대화를 지워도 유지)
  renderTodayMoodChart() {
    const container = document.getElementById('today-mood-chart');
    if (!container) return;

    this._backfillMoodLog();
    const todayStr = this._localDate(new Date());
    const colorOf = emo => (this.MOOD_RULES.find(r => r.emo === emo) || {}).c || 'var(--text-muted)';
    const points = ((window.Storage && window.Storage._safeGet('cbt_mood_log', [])) || [])
      .filter(p => p.ts && this._localDate(p.ts) === todayStr)
      .map(p => {
        const d = new Date(p.ts);
        return { time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), emo: p.emo, v: p.v, c: colorOf(p.emo) };
      });

    if (points.length < 2) {
      container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem 0; margin: 0;">오늘 나눈 감정 이야기가 아직 적어요. 지금 기분을 이야기해보면 흐름이 그려져요.</p>`;
      return;
    }

    const shown = points.slice(-8);
    const W = 340, H = 132, padL = 40, padR = 16, padT = 14, padB = 30;
    const innerH = H - padT - padB;
    const step = shown.length > 1 ? (W - padL - padR) / (shown.length - 1) : 0;
    const y = v => padT + innerH - ((v - 1) / 4) * innerH;
    const pts = shown.map((p, i) => ({ x: padL + i * step, y: y(p.v) }));
    const linePath = this._createSmoothPath ? this._createSmoothPath(pts)
      : pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    const areaPath = `${linePath} L ${pts[pts.length - 1].x},${H - padB} L ${pts[0].x},${H - padB} Z`;

    // 주간 차트와 같은 손그림 얼굴 마커 (시스템 이모지 대신 앱 고유 그림체)
    const FACE_NAMES = ['faceSad', 'faceDown', 'faceNeutral', 'faceSmile', 'faceGrin'];
    const faceMark = (level, fx, fy, size, color) => {
      const inner = (window.Icons && window.Icons.faces && window.Icons.faces[FACE_NAMES[(level || 1) - 1]]) || '';
      const sc = size / 24;
      return `<g transform="translate(${fx - size / 2},${fy - size / 2}) scale(${sc})" style="color:${color}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
    };
    const lvl = v => Math.max(1, Math.min(5, Math.round(v)));
    // 같은 시각이 반복되면 라벨 생략
    const timeLabels = shown.map((p, i) => (i > 0 && shown[i - 1].time === p.time) ? '' : p.time);

    // 하루를 한 줄로: 시작점과 끝점을 비교해 요약
    const first = shown[0], last = shown[shown.length - 1];
    let summary;
    if (last.v - first.v >= 1) summary = '아래에서 위로, 마음이 올라온 하루예요 ☀️';
    else if (first.v - last.v >= 1) summary = '마음이 조금 가라앉았네요. 우렁이가 곁에 있을게요 🌙';
    else if (last.v >= 3.5) summary = '오늘은 대체로 편안하게 흘러갔어요 🍃';
    else summary = '오늘은 마음이 묵직한 편이었어요. 잘 버텨냈어요 ☁️';

    container.innerHTML = `
      <div style="width: 100%; flex: 1 1 100%;">
      <svg viewBox="0 0 ${W} ${H}" style="width: 100%; height: auto; display: block;">
        <defs>
          <linearGradient id="todayMoodArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#7fc29b" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#7fc29b" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <!-- 점선 가이드 + 왼쪽 얼굴 축 (위=편안, 아래=힘듦) — 주간 차트와 같은 문법 -->
        ${[1, 3, 5].map(v => `
          <line x1="${padL - 4}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="rgba(140,128,114,0.25)" stroke-dasharray="4,4"/>
          ${faceMark(v, padL - 22, y(v), 16, '#9c9187')}
        `).join('')}

        <path d="${areaPath}" fill="url(#todayMoodArea)"/>
        <path d="${linePath}" fill="none" stroke="#5fa986" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>

        ${shown.map((p, i) => `
          <g>
            <title>${p.time} · ${p.emo}</title>
            <circle cx="${pts[i].x}" cy="${pts[i].y}" r="11" fill="var(--bg-secondary)" stroke="${p.c}" stroke-width="2.2"/>
            ${faceMark(lvl(p.v), pts[i].x, pts[i].y, 15, p.c)}
          </g>
          ${timeLabels[i] ? `<text x="${pts[i].x}" y="${H - padB + 15}" text-anchor="middle" font-size="8.5" fill="var(--text-muted)">${timeLabels[i]}</text>` : ''}
        `).join('')}
      </svg>
      <p style="margin: 0.45rem 0 0; text-align: center; font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${summary}</p>
      </div>`;
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
    const records = (window.Storage && window.Storage.getThoughtRecords()) || [];
    const stats = (window.Storage && window.Storage.getDistortionStats()) || {};

    // 총 대화 = 영속 누적 카운터. 대화를 지워도 줄지 않는다.
    // (마이그레이션: 기존 사용자는 현재 대화 수로 최소값을 맞춰준다)
    let totalChats = (window.Storage && window.Storage._safeGet('cbt_total_chats', 0)) || 0;
    if (userMsgs > totalChats) {
      totalChats = userMsgs;
      if (window.Storage) window.Storage._safeSet('cbt_total_chats', totalChats);
    }
    const isOnlyMock = records.length > 0 && records.every(r => r.id && r.id.startsWith('rec_mock_')) && totalChats === 0;

    const uniqueTypes = Object.keys(stats).filter(k => stats[k] > 0).length;
    const streak = (window.Storage && window.Storage.getStreak()) || 0;

    if (elSessions) {
      this._animateCounter(elSessions, isOnlyMock ? 11 : totalChats);
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
      const dateStr = this._localDate(d);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;

      let score = null;

      // 0. 영속 감정 로그 (대화를 지워도 남는 하루 평균) — 최우선
      const dayPoints = ((window.Storage && window.Storage._safeGet('cbt_mood_log', [])) || [])
        .filter(p => p.ts && this._localDate(p.ts) === dateStr);
      if (dayPoints.length > 0) {
        const avg = dayPoints.reduce((s, p) => s + p.v, 0) / dayPoints.length;
        score = Math.max(1, Math.min(5, Math.round(avg)));
      }

      // 1. 저장된 명시적 기분 기록 확인
      if (!score) {
        const entry = moodEntries.find(e => e.date && e.date.startsWith(dateStr));
        if (entry) score = entry.score;
      }

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
          return mDate.toLocaleDateString('sv-CA') === dateStr;
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
