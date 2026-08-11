window.Storage = {
  // === Helper Methods ===
  _safeGet(key, defaultValue) {
    let item;
    try {
      item = localStorage.getItem(key);
    } catch (error) {
      // 저장소 자체를 못 읽는 경우(사파리 프라이빗 등) — 없음으로 취급
      console.error(`Error reading ${key} from localStorage`, error);
      return defaultValue;
    }
    // "없음(미존재)"은 정상이다 — 그냥 기본값을 준다.
    if (item == null) return defaultValue;
    try {
      return JSON.parse(item);
    } catch (error) {
      // "깨짐"은 다르다. 여기서 기본값([] 등)만 돌려주면 호출부가
      //  읽기→수정→쓰기로 그 빈 값을 원본 위에 덮어써 기록이 영영 사라진다.
      //  기본값 반환 동작은 그대로 두되(호환성 — 호출부 수백 곳), 덮이기 전에
      //  원본 raw 문자열을 백업해 복구 가능성만 확보한다. 세션당 키별 1회만.
      console.warn(`Corrupt JSON in "${key}" — preserving raw value before returning default`, error);
      try {
        this._corruptBackedUp = this._corruptBackedUp || {};
        if (!this._corruptBackedUp[key]) {
          localStorage.setItem(key + '__corrupt_' + Date.now(), item);
          this._corruptBackedUp[key] = true;
        }
      } catch (e) { /* 백업까지 실패하면 어쩔 수 없다 — 원본은 아직 안 지웠다 */ }
      return defaultValue;
    }
  },

  _safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Error writing ${key} to localStorage`, error);
      return false;
    }
  },

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // === Pro Mode & API Key (전체 100% 무료 무제한) ===
  getProMode() {
    return true;
  },
  
  setProMode(enabled) {
    this._safeSet('cbt_pro_mode', true);
  },

  getApiKey() {
    return this._safeGet('cbt_api_key', '');
  },

  setApiKey(key) {
    this._safeSet('cbt_api_key', key);
  },

  // === Free Session Limit (무제한) ===
  getFreeSessionCount() {
    return 999999;
  },
  
  setFreeSessionCount(count) {
    this._safeSet('cbt_free_sessions', 999999);
  },

  decrementFreeSessionCount() {
    return 999999;
  },

  // === Long-term Therapeutic Memory (the "case file") ===
  // A persistent, evolving clinical + personal memo the AI maintains about the user
  // across every session. This is what lets the assistant "remember everything".
  getUserMemory() {
    return this._safeGet('cbt_user_memory', '');
  },

  // 장기기억 상한. growth.js 의 하루정리 append 도 이 값을 함께 본다(상수 통일).
  //  6,000자 ≈ 6KB 로 localStorage 용량에 부담이 없고, 최근 대화를 넉넉히 기억한다.
  MEMORY_MAX: 6000,

  setUserMemory(text) {
    // 상한을 넘기면 잘라내되, 앞이 아니라 뒤(최신)를 남긴다 —
    //  하루정리·대화 요약은 끝에 덧붙으므로, slice(0,N) 이면 방금 추가한
    //  최신 줄이 매번 버려져 "요즘 걸 기억 못 함" 증상이 났다.
    if (typeof text === 'string' && text.length > this.MEMORY_MAX) {
      text = text.slice(-this.MEMORY_MAX);
    }
    this._safeSet('cbt_user_memory', text || '');
  },

  clearUserMemory() {
    localStorage.removeItem('cbt_user_memory');
  },

  // === 상담 세션 경계 (자동 사고 기록의 단위) ===
  getSessionMeta() {
    return this._safeGet('cbt_session_meta', null);
  },

  setSessionMeta(meta) {
    this._safeSet('cbt_session_meta', meta);
  },

  // === Chat Messages ===
  // 대화는 무한히 쌓이는데 localStorage 는 5MB 다. 한도를 넘기면 브라우저가
  //  조용히 저장을 거부해서, 사용자는 앱 전체가 기록을 잃는 걸 모른 채 쓴다.
  //  그래서 ①오래된 말풍선부터 정리하고(장기기억은 별도 보관이라 잃는 건 없다)
  //  ②그래도 저장이 실패하면 숨기지 않고 알린다.
  MAX_MESSAGES: 1500,

  saveMessage(message) {
    // 누가 한 말인지 새겨둔다 — 나중에 상담사를 바꿔도 지난 말풍선의 얼굴이 안 바뀐다
    if (message && message.role === 'bot' && !message.persona && window.Personas) {
      try { message.persona = window.Personas.getActive().id; } catch (e) {}
    }
    let messages = this.getMessages();
    const messageWithId = {
      id: this._generateId(),
      timestamp: Date.now(),
      ...message
    };
    messages.push(messageWithId);
    if (messages.length > this.MAX_MESSAGES) {
      messages = messages.slice(messages.length - this.MAX_MESSAGES);
    }
    let ok = this._safeSet('cbt_messages', messages);
    if (!ok) {
      // 꽉 찼다 — 최근 것만이라도 살린다 (오늘의 대화가 어제의 대화보다 소중하다)
      ok = this._safeSet('cbt_messages', messages.slice(-400));
      if (!this._quotaWarned) {
        this._quotaWarned = true;
        try {
          if (window.App && window.App.showRecordToast) {
            window.App.showRecordToast(ok
              ? '저장 공간이 부족해 오래된 대화를 정리했어요'
              : '저장 공간이 가득 차 대화를 저장하지 못했어요');
          }
        } catch (e) {}
      }
    }

    // 챗봇 대화가 시작되면 샘플 사고기록지와 가짜 통계를 자동으로 깔끔히 정리함!
    const records = this._safeGet('cbt_thought_records', []);
    if (records.length > 0 && records.every(r => r.id && r.id.startsWith('rec_mock_'))) {
      this._safeSet('cbt_thought_records', []);
      this._safeSet('cbt_distortion_stats', {});
    }

    return messageWithId;
  },
  
  getMessages() {
    return this._safeGet('cbt_messages', []);
  },
  
  clearMessages() {
    return this._safeSet('cbt_messages', []);
  },
  
  // === Thought Records ===
  saveThoughtRecord(record) {
    let records = this._safeGet('cbt_thought_records', []);
    const isNewRealRecord = !record.id || !record.id.startsWith('rec_mock_');
    const isOnlyMockPresent = records.length > 0 && records.every(r => r.id && r.id.startsWith('rec_mock_'));

    // 만약 진짜 사용자의 새로운 사고 기록이 저장되는데 기존 기록이 샘플뿐이었다면, 샘플 기록과 통계를 깔끔하게 자동 삭제함
    if (isNewRealRecord && isOnlyMockPresent) {
      records = [];
      this._safeSet('cbt_distortion_stats', {});
    }

    const newRecord = {
      id: record.id || this._generateId(),
      date: record.date || new Date().toISOString(),
      ...record
    };
    
    const existingIndex = records.findIndex(r => r.id === newRecord.id);
    if (existingIndex >= 0) {
      records[existingIndex] = newRecord;
    } else {
      records.push(newRecord);
    }
    
    this._safeSet('cbt_thought_records', records);
    if (existingIndex < 0 && isNewRealRecord && window.Farm) window.Farm.addWater(4, '사고 기록 정리');
    // 사고 기록은 케어플랜의 '기록' 계열 할 일이기도 하다 (연동)
    if (existingIndex < 0 && isNewRealRecord && window.CarePlan && window.CarePlan.autoDone) window.CarePlan.autoDone('record');
    return newRecord;
  },
  
  getThoughtRecords() {
    const records = this._safeGet('cbt_thought_records', []);
    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  
  deleteThoughtRecord(id) {
    const records = this.getThoughtRecords().filter(r => r.id !== id);
    this._safeSet('cbt_thought_records', records);
  },
  
  getThoughtRecord(id) {
    return this.getThoughtRecords().find(r => r.id === id) || null;
  },
  
  // === Mood Entries ===
  saveMoodEntry(entry) {
    const entries = this._safeGet('cbt_mood_entries', []);
    const dateStr = entry.date ? entry.date.split('T')[0] : new Date().toLocaleDateString('sv-CA');
    
    // Check if entry for today already exists, if so update it
    const existingIndex = entries.findIndex(e => e.date.startsWith(dateStr));
    
    const newEntry = {
      id: this._generateId(),
      date: entry.date || new Date().toISOString(),
      ...entry
    };
    
    if (existingIndex >= 0) {
      entries[existingIndex] = newEntry;
    } else {
      entries.push(newEntry);
    }
    
    this._safeSet('cbt_mood_entries', entries);
    return newEntry;
  },
  
  getMoodEntries(days = 30) {
    const entries = this._safeGet('cbt_mood_entries', []);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return entries
      .filter(e => new Date(e.date) >= cutoffDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  },
  
  getTodayMood() {
    const entries = this._safeGet('cbt_mood_entries', []);
    const todayStr = new Date().toLocaleDateString('sv-CA');
    return entries.find(e => e.date.startsWith(todayStr)) || null;
  },
  
  // === Distortion Stats ===
  incrementDistortion(type) {
    const stats = this.getDistortionStats();
    stats[type] = (stats[type] || 0) + 1;
    this._safeSet('cbt_distortion_stats', stats);
  },
  
  getDistortionStats() {
    return this._safeGet('cbt_distortion_stats', {});
  },

  clearAllData() {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.error('Error clearing localStorage', e);
      return false;
    }
  },
  
  // === Session State ===
  saveSessionState(state) {
    this._safeSet('cbt_session_state', state);
  },
  
  getSessionState() {
    return this._safeGet('cbt_session_state', null);
  },
  
  clearSessionState() {
    localStorage.removeItem('cbt_session_state');
  },

  // === Summary Report ===
  saveSummaryReport(report) {
    this._safeSet('cbt_latest_summary_report', report);
  },

  getSummaryReport() {
    return this._safeGet('cbt_latest_summary_report', null);
  },
  
  // === App State ===
  isFirstVisit() {
    return this._safeGet('cbt_first_visit', true);
  },
  
  markVisited() {
    this._safeSet('cbt_first_visit', false);
  },
  
  getStreak() {
    const activeDays = this._safeGet('cbt_active_days', []);
    if (activeDays.length === 0) return 0;
    
    // 날짜 문자열('YYYY-MM-DD')은 'T00:00:00' 을 붙여 로컬 자정으로 읽는다.
    //  안 붙이면 new Date('2026-08-11') 이 UTC 자정으로 파싱돼, 음수 시간대에서는
    //  하루 앞당겨져 스트릭이 깨진다. growth.js:59 와 규칙을 맞춘다.
    activeDays.sort((a, b) => new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime());

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    // Check if active today
    const lastActiveDate = new Date(activeDays[0] + 'T00:00:00');
    lastActiveDate.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(currentDate - lastActiveDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1) {
      return 0; // Streak broken
    }
    
    streak = 1;
    let checkDate = lastActiveDate;
    
    for (let i = 1; i < activeDays.length; i++) {
      const prevDate = new Date(activeDays[i] + 'T00:00:00');
      prevDate.setHours(0, 0, 0, 0);
      
      const checkDiff = Math.floor(Math.abs(checkDate - prevDate) / (1000 * 60 * 60 * 24));
      
      if (checkDiff === 1) {
        streak++;
        checkDate = prevDate;
      } else if (checkDiff === 0) {
        // Same day, ignore
      } else {
        break; // Streak broken
      }
    }
    
    return streak;
  },
  
  markDayActive() {
    const activeDays = this._safeGet('cbt_active_days', []);
    const todayStr = new Date().toLocaleDateString('sv-CA');
    
    if (!activeDays.includes(todayStr)) {
      activeDays.push(todayStr);
      this._safeSet('cbt_active_days', activeDays);
    }
  },
  
  getTotalSessions() {
    return this._safeGet('cbt_total_sessions', 0);
  },
  
  incrementSessions() {
    const count = this.getTotalSessions();
    this._safeSet('cbt_total_sessions', count + 1);
    return count + 1;
  },
  
  // === Utility ===
  exportData() {
    const data = {
      messages: this.getMessages(),
      thoughtRecords: this.getThoughtRecords(),
      moodEntries: this._safeGet('cbt_mood_entries', []),
      distortionStats: this.getDistortionStats(),
      activeDays: this._safeGet('cbt_active_days', []),
      totalSessions: this.getTotalSessions(),
      userMemory: this.getUserMemory(),
      exportDate: new Date().toISOString()
    };
    return JSON.stringify(data);
  },
  
  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.messages) this._safeSet('cbt_messages', data.messages);
      if (data.thoughtRecords) this._safeSet('cbt_thought_records', data.thoughtRecords);
      if (data.moodEntries) this._safeSet('cbt_mood_entries', data.moodEntries);
      if (data.distortionStats) this._safeSet('cbt_distortion_stats', data.distortionStats);
      if (data.activeDays) this._safeSet('cbt_active_days', data.activeDays);
      if (data.totalSessions !== undefined) this._safeSet('cbt_total_sessions', data.totalSessions);
      if (data.userMemory !== undefined) this.setUserMemory(data.userMemory);
      return true;
    } catch (error) {
      console.error('Error importing data', error);
      return false;
    }
  },
  
  clearAll() {
    const keys = [
      'cbt_messages', 
      'cbt_thought_records', 
      'cbt_mood_entries', 
      'cbt_distortion_stats',
      'cbt_session_state',
      'cbt_first_visit',
      'cbt_active_days',
      'cbt_total_sessions',
      'cbt_user_memory'
    ];

    keys.forEach(key => localStorage.removeItem(key));
  }
};
