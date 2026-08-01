window.Storage = {
  // === Helper Methods ===
  _safeGet(key, defaultValue) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading ${key} from localStorage`, error);
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

  // === Chat Messages ===
  saveMessage(message) {
    const messages = this.getMessages();
    const messageWithId = {
      id: this._generateId(),
      timestamp: Date.now(),
      ...message
    };
    messages.push(messageWithId);
    this._safeSet('cbt_messages', messages);
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
    const records = this.getThoughtRecords();
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
    const dateStr = entry.date ? entry.date.split('T')[0] : new Date().toISOString().split('T')[0];
    
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
    const todayStr = new Date().toISOString().split('T')[0];
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
    
    activeDays.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // Check if active today
    const lastActiveDate = new Date(activeDays[0]);
    lastActiveDate.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(currentDate - lastActiveDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1) {
      return 0; // Streak broken
    }
    
    streak = 1;
    let checkDate = lastActiveDate;
    
    for (let i = 1; i < activeDays.length; i++) {
      const prevDate = new Date(activeDays[i]);
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
    const todayStr = new Date().toISOString().split('T')[0];
    
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
      'cbt_total_sessions'
    ];
    
    keys.forEach(key => localStorage.removeItem(key));
  }
};
