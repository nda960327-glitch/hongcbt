// ============================================================================
//  성장 시스템 — 스트릭 · 뱃지 · 야간 루틴("오늘 하루 정리")
//  꾸준함이 보상이 되도록: 연속 방문 칩, 마일스톤 뱃지, 잠들기 전 3분 정리.
// ============================================================================
window.Growth = {
  BADGES: [
    { id: 'first_chat', emoji: '🐌', name: '첫 만남',       desc: '우렁이와 첫 대화',   metric: 'chats',   goal: 1 },
    { id: 'chat50',     emoji: '💬', name: '단골 손님',     desc: '대화 50회',          metric: 'chats',   goal: 50 },
    { id: 'chat200',    emoji: '🗣️', name: '속마음 단짝',   desc: '대화 200회',         metric: 'chats',   goal: 200 },
    { id: 'streak3',    emoji: '🌱', name: '사흘의 새싹',   desc: '3일 연속 방문',      metric: 'streak',  goal: 3 },
    { id: 'streak7',    emoji: '🔥', name: '일주일 불꽃',   desc: '7일 연속 방문',      metric: 'streak',  goal: 7 },
    { id: 'streak30',   emoji: '🏆', name: '한 달의 마음',  desc: '30일 연속 방문',     metric: 'streak',  goal: 30 },
    { id: 'record5',    emoji: '📝', name: '마음 기록가',   desc: '사고 기록 5개',      metric: 'records', goal: 5 },
    { id: 'mood30',     emoji: '🌈', name: '감정 관찰자',   desc: '기분 기록 30개',     metric: 'moods',   goal: 30 },
    { id: 'breath10',   emoji: '🫧', name: '숨 고르기 달인', desc: '호흡 연습 10회',     metric: 'breaths', goal: 10 },
    { id: 'night7',     emoji: '🌙', name: '굿나잇 요정',   desc: '하루 정리 7회',      metric: 'nights',  goal: 7 },
    { id: 'mission5',   emoji: '🚶', name: '작은 실천가',   desc: '행동 미션 5개',      metric: 'missions', goal: 5 },
    { id: 'mission20',  emoji: '🏃', name: '실천 마스터',   desc: '행동 미션 20개',     metric: 'missions', goal: 20 }
  ],

  init() {
    this.applyShield();       // 빠진 날이 있으면 보호권으로 메꾼다 (스트릭 계산 전에)
    this.renderStreakChip();
    this.maybeShowNightCard();
    this.renderNightList();
    this.checkAwards(true); // 조용히(토스트 없이) 초기 동기화
  },

  stats() {
    const S = window.Storage;
    return {
      chats: S._safeGet('cbt_total_chats', 0) || 0,
      streak: (S.getStreak && S.getStreak()) || 0,
      records: (S.getThoughtRecords() || []).length,
      moods: (S._safeGet('cbt_mood_log', []) || []).length,
      breaths: S._safeGet('cbt_breath_count', 0) || 0,
      nights: (S._safeGet('cbt_night_journal', []) || []).length,
      missions: (S._safeGet('cbt_mission_log', []) || []).filter(m => m.done).length
    };
  },

  // ==========================================================================
  //  스트릭 보호권 — 하루 빠져도 보호권이 자동으로 그 날을 메꿔준다
  // ==========================================================================
  SHIELD_PRICE: 1000,
  SHIELD_MAX: 3,

  shields() {
    return window.Storage._safeGet('cbt_streak_shields', 0) || 0;
  },

  applyShield() {
    let shields = this.shields();
    if (shields <= 0) return;
    const days = window.Storage._safeGet('cbt_active_days', []) || [];
    const todayStr = new Date().toLocaleDateString('sv-CA');
    const prevDays = [...days].sort().filter(d => d < todayStr);
    if (!prevDays.length) return;
    const last = new Date(prevDays[prevDays.length - 1] + 'T00:00:00');
    const today = new Date(todayStr + 'T00:00:00');
    const gap = Math.round((today - last) / 86400000) - 1; // 어제까지 빠진 날 수
    if (gap <= 0 || gap > shields) return; // 빠진 날이 없거나, 보호권으로 못 메꾸면 그대로
    for (let i = 1; i <= gap; i++) {
      days.push(new Date(last.getTime() + i * 86400000).toLocaleDateString('sv-CA'));
    }
    window.Storage._safeSet('cbt_active_days', days);
    window.Storage._safeSet('cbt_streak_shields', shields - gap);
    setTimeout(() => {
      if (window.App && window.App.showRecordToast) window.App.showRecordToast(`🛡️ 스트릭 보호권 ${gap}개가 빠진 날을 지켜줬어요!`);
    }, 1200);
  },

  buyShield() {
    if (this.shields() >= this.SHIELD_MAX) {
      alert(`보호권은 최대 ${this.SHIELD_MAX}개까지 보관할 수 있어요.`);
      return;
    }
    if (!window.Wallet || !window.Wallet.spend(this.SHIELD_PRICE, '스트릭 보호권 구매')) {
      alert(`캐시가 부족해요. (보호권 1개 = ${this.SHIELD_PRICE.toLocaleString()}캐시)\n마이페이지 지갑에서 충전해주세요.`);
      return;
    }
    window.Storage._safeSet('cbt_streak_shields', this.shields() + 1);
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('🛡️ 스트릭 보호권을 손에 넣었어요!');
    this.renderBadgeCard();
  },

  bumpBreath() {
    window.Storage._safeSet('cbt_breath_count', (window.Storage._safeGet('cbt_breath_count', 0) || 0) + 1);
    this.checkAwards();
    if (window.Farm) window.Farm.addWater(2, '호흡으로 마음 가라앉히기');
  },

  checkAwards(silent) {
    const earned = window.Storage._safeGet('cbt_badges', {}) || {};
    const s = this.stats();
    const newly = [];
    this.BADGES.forEach(b => {
      if (!earned[b.id] && s[b.metric] >= b.goal) {
        earned[b.id] = Date.now();
        newly.push(b);
      }
    });
    window.Storage._safeSet('cbt_badges', earned);
    if (newly.length && !silent && window.App && window.App.showRecordToast) {
      const label = newly.map(b => `${b.emoji} '${b.name}'`).join(', ');
      window.App.showRecordToast(newly.length === 1 ? `${label} 뱃지 획득!` : `뱃지 ${newly.length}개 획득! ${label}`);
      if (window.App.playNotify) window.App.playNotify();
      if (window.App.stickerPop) window.App.stickerPop('party', 1600);
    }
    this.checkLevelUp();
    this.renderStreakChip();
  },

  renderStreakChip() {
    const el = document.getElementById('streak-chip');
    if (!el) return;
    const st = this.stats().streak;
    el.textContent = st >= 2 ? `${st}일 연속` : '';
    el.style.display = st >= 2 ? 'inline-flex' : 'none';
  },

  // ==========================================================================
  //  우렁이 우정 레벨 — 마음을 돌본 모든 행동이 XP가 되어 우렁이가 함께 자란다
  // ==========================================================================
  xp() {
    const s = this.stats();
    return s.chats * 2 + s.moods * 3 + s.nights * 10 + s.missions * 8 + s.records * 10 + s.breaths * 5;
  },

  level() {
    return Math.min(30, Math.floor(Math.sqrt(this.xp() / 30)) + 1);
  },

  levelInfo(lv) {
    if (lv <= 2) return { name: '알에서 갓 깬 우렁이', sticker: 'sleepy' };
    if (lv <= 4) return { name: '새싹 우렁이', sticker: 'joy' };
    if (lv <= 7) return { name: '단짝 우렁이', sticker: 'cheer' };
    if (lv <= 11) return { name: '든든 우렁이', sticker: 'proud' };
    if (lv <= 15) return { name: '마음지기 우렁이', sticker: 'hero' };
    if (lv <= 20) return { name: '현자 우렁이', sticker: 'teacher' };
    return { name: '전설의 우렁이', sticker: 'party' };
  },

  checkLevelUp() {
    const lv = this.level();
    const seen = window.Storage._safeGet('cbt_level_seen', 1) || 1;
    if (lv > seen) {
      window.Storage._safeSet('cbt_level_seen', lv);
      if (window.App) {
        const info = this.levelInfo(lv);
        if (window.Sfx) window.Sfx.hit('levelup');
        window.App.showRecordToast(`레벨 업! Lv.${lv} '${info.name}'가 됐어요`, null);
        // 이 레벨에서 새로 열린 행동이 있으면 바로 알려준다 — 레벨업의 보상이 눈에 보여야 한다
        try {
          const opened = (window.Room && window.Room.IDLES || []).filter(i => (i.lv || 1) === lv);
          if (opened.length && window.App.showRecordToast) {
            setTimeout(() => window.App.showRecordToast(`새로운 모습이 열렸어요 — ${opened[0].cap}`, null), 2600);
          }
        } catch (e) {}
        window.App.stickerPop(info.sticker, 1800);
        window.App.playWoorung();
      }
    }
  },

  renderLevelCard() {
    const el = document.getElementById('level-card');
    if (!el) return;
    const xp = this.xp();
    const lv = this.level();
    const info = this.levelInfo(lv);
    const curBase = 30 * Math.pow(lv - 1, 2);   // 현재 레벨 시작 XP
    const nextAt = 30 * Math.pow(lv, 2);        // 다음 레벨 XP
    const pct = lv >= 30 ? 100 : Math.min(100, Math.round((xp - curBase) / (nextAt - curBase) * 100));
    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.8rem; background: linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 12%, var(--bg-tertiary)), var(--bg-tertiary)); border: 1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent); border-radius: 14px; padding: 0.85rem 1rem; margin-bottom: 0.85rem;">
        <span style="line-height: 0; flex-shrink: 0;">${window.Stickers ? window.Stickers.svg(info.sticker, 62) : '🐌'}</span>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: baseline; gap: 0.4rem;">
            <strong style="font-size: 0.95rem; color: var(--text-primary); font-family: var(--font-heading);">Lv.${lv} ${info.name}</strong>
          </div>
          <div style="height: 7px; border-radius: 99px; background: var(--bg-secondary); overflow: hidden; margin: 0.4rem 0 0.25rem;">
            <div style="height: 100%; width: ${pct}%; border-radius: 99px; background: var(--gradient-primary); transition: width 0.6s;"></div>
          </div>
          <span style="font-size: 0.68rem; color: var(--text-muted);">${lv >= 30 ? '최고 레벨! 우렁이가 당신을 자랑스러워해요' : `다음 레벨까지 ${(nextAt - xp).toLocaleString()} XP — 대화·체크인·미션이 전부 경험치예요`}</span>
        </div>
      </div>`;
  },

  renderBadgeCard() {
    this.renderLevelCard();
    this.checkLevelUp();
    const line = document.getElementById('growth-streak-line');
    if (line) {
      const st = this.stats().streak;
      line.textContent = st >= 2 ? `🔥 ${st}일 연속 방문 중` : (st === 1 ? '🌱 오늘부터 스트릭 시작!' : '');
    }
    // 스트릭 보호권
    const shieldRow = document.getElementById('shield-row');
    if (shieldRow) {
      const n = this.shields();
      shieldRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.7rem; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem;">
          <span style="font-size: 1.5rem;">🛡️</span>
          <div style="flex: 1; min-width: 0;">
            <strong style="font-size: 0.85rem; color: var(--text-primary); display: block;">스트릭 보호권 ${'●'.repeat(n)}${'○'.repeat(this.SHIELD_MAX - n)}</strong>
            <span style="font-size: 0.72rem; color: var(--text-muted);">하루 빠져도 자동으로 그 날을 메꿔 스트릭을 지켜줘요 (최대 ${this.SHIELD_MAX}개)</span>
          </div>
          <button class="btn-secondary" style="width: auto; font-size: 0.74rem; padding: 0.4rem 0.7rem; flex-shrink: 0;" onclick="window.Growth.buyShield()">구매<br>${this.SHIELD_PRICE.toLocaleString()}캐시</button>
        </div>`;
    }
    const el = document.getElementById('badge-grid');
    if (!el) return;
    const earned = window.Storage._safeGet('cbt_badges', {}) || {};
    const s = this.stats();
    el.innerHTML = this.BADGES.map(b => {
      const has = !!earned[b.id];
      const cur = Math.min(s[b.metric] || 0, b.goal);
      return `<div title="${b.desc}" style="text-align: center; padding: 0.6rem 0.2rem; border-radius: 12px; background: ${has ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-tertiary)'}; border: 1px solid ${has ? 'color-mix(in srgb, var(--accent-primary) 35%, transparent)' : 'var(--glass-border)'}; ${has ? '' : 'opacity: 0.55;'}">
        <div style="font-size: 1.5rem; ${has ? '' : 'filter: grayscale(1); opacity: 0.6;'}">${b.emoji}</div>
        <div style="font-size: 0.66rem; font-weight: 700; color: var(--text-primary); margin-top: 0.15rem;">${b.name}</div>
        <div style="font-size: 0.58rem; color: var(--text-muted);">${b.desc}</div>
        ${has ? '' : `<div style="margin-top: 0.3rem;">
          <div style="height: 4px; border-radius: 99px; background: var(--glass-border); overflow: hidden;"><div style="height: 100%; width: ${Math.round(cur / b.goal * 100)}%; background: var(--accent-primary); border-radius: 99px;"></div></div>
          <div style="font-size: 0.56rem; color: var(--text-muted); margin-top: 0.15rem;">${cur}/${b.goal}</div>
        </div>`}
      </div>`;
    }).join('');
  },

  // ==========================================================================
  //  야간 루틴 — "오늘 하루 정리" (저녁 8시~새벽 2시에 홈에서 권유)
  // ==========================================================================
  // '밤'의 소속 날짜: 새벽(~06시)에 쓴 정리는 전날 밤으로 친다.
  // 새벽 1시에 정리해도 그날 저녁 8시에 카드가 또 뜨지 않도록.
  _nightKey(ts) {
    return new Date((ts || Date.now()) - 6 * 3600 * 1000).toLocaleDateString('sv-CA');
  },

  maybeShowNightCard() {
    const card = document.getElementById('night-card');
    if (!card) return;
    const h = new Date().getHours();
    const isNight = h >= 20 || h < 2;
    const key = this._nightKey();
    const doneTonight = (window.Storage._safeGet('cbt_night_journal', []) || [])
      .some(j => this._nightKey(j.ts) === key);
    const dismissed = window.Storage._safeGet('cbt_night_dismiss', '') === key;
    card.classList.toggle('hidden', !isNight || doneTonight || dismissed);
  },

  dismissNightToday() {
    window.Storage._safeSet('cbt_night_dismiss', this._nightKey());
    this.maybeShowNightCard();
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('오늘은 푹 쉬어요. 내일 밤 다시 물어볼게요');
  },

  // 대시보드 '지난 밤들' — 하루 정리 아카이브
  MOOD_EMOJI: { '기쁨': '😄', '편안': '🙂', '보통': '😐', '불안': '😟', '우울': '😢' },

  // 자유 일기 — 아무 때나 쓰는 한 편 (하루정리와 같은 일기장에 꽂힌다)
  writeDiary() {
    const old = document.getElementById('diary-write-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'diary-write-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 950; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 1.2rem;';
    ov.innerHTML = `
      <div class="glass-card" style="width: 100%; max-width: 430px; padding: 1.1rem; background: var(--bg-secondary);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
          <strong style="font-size: 0.95rem; color: var(--text-primary);">✍️ 자유 일기</strong>
          <button onclick="document.getElementById('diary-write-overlay').remove()" style="all: unset; cursor: pointer; color: var(--text-muted); font-size: 1.05rem; padding: 0.1rem 0.4rem;">✕</button>
        </div>
        <p style="margin: 0 0 0.6rem; font-size: 0.74rem; color: var(--text-muted);">형식 없이, 지금 마음 가는 대로. 우렁이가 읽고 짧은 답글을 달아줘요.</p>
        <textarea id="diary-write-text" rows="7" maxlength="1200" placeholder="오늘은…"
          style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; font-size: 0.88rem; font-family: inherit; resize: vertical; line-height: 1.7;"></textarea>
        <button class="btn-primary" style="width: 100%; margin-top: 0.7rem;" onclick="window.Growth.saveDiary()">📓 일기장에 꽂기</button>
      </div>`;
    document.body.appendChild(ov);
    setTimeout(() => { const t = document.getElementById('diary-write-text'); if (t) t.focus(); }, 150);
  },

  saveDiary() {
    const ta = document.getElementById('diary-write-text');
    const text = ta ? ta.value.trim() : '';
    if (!text) { alert('한 줄이라도 적어볼까요?'); return; }
    const journal = window.Storage._safeGet('cbt_night_journal', []) || [];
    // 오늘 체크인이 있으면 그 기분을 일기의 날씨로
    const today = new Date().toLocaleDateString('sv-CA');
    const todayMood = (window.Storage._safeGet('cbt_mood_log', []) || [])
      .filter(m => new Date(m.ts).toLocaleDateString('sv-CA') === today).pop() || null;
    const ts = Date.now();
    journal.unshift({ ts, free: true, mood: todayMood ? { emo: todayMood.emo } : null, moment: text, note: '' });
    window.Storage._safeSet('cbt_night_journal', journal.slice(0, 120));
    const ov = document.getElementById('diary-write-overlay');
    if (ov) ov.remove();
    if (window.Farm) window.Farm.addWater(3, '자유 일기 한 편');
    if (window.Storage.markDayActive) window.Storage.markDayActive();
    if (window.Sfx) window.Sfx.play('ripe');
    if (window.App) window.App.showRecordToast('📓 일기를 꽂았어요 — 우렁이가 읽고 있어요');
    this.renderNightList();
    this._diaryReply(ts);
  },

  // 우렁이의 한 줄 답글 (비동기 — 실패해도 일기는 무사)
  async _diaryReply(ts) {
    try {
      if (!window.LLM) return;
      const journal = window.Storage._safeGet('cbt_night_journal', []) || [];
      const j = journal.find(x => x.ts === ts);
      if (!j) return;
      const content = [j.moment, j.note].filter(Boolean).join(' / ');
      if (!content) return;
      const res = await window.LLM._chatCompletion({
        model: window.LLM.MEMORY_MODEL,
        messages: [{ role: 'user', content: `당신은 달팽이 상담사 '우렁이'. 사용자의 일기 아래에 다는 한 줄 답글을 쓰세요.
규칙: 딱 1~2문장, 반말, 따뜻하되 상투적이지 않게. 일기의 구체적 내용을 되받을 것. 가끔 우렁이 울음(우로로록 등)이나 가벼운 위트 허용. 답글 문장만 출력.
[일기] 기분: ${j.mood ? j.mood.emo : '미기록'} / ${content.slice(0, 500)}` }],
        temperature: 0.8,
        max_tokens: 90
      });
      if (!res.ok) return;
      const data = await res.json();
      const reply = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
      if (!reply) return;
      const jr = window.Storage._safeGet('cbt_night_journal', []) || [];
      const target = jr.find(x => x.ts === ts);
      if (!target) return;
      target.reply = reply;
      window.Storage._safeSet('cbt_night_journal', jr);
      this.renderNightList();
      if (window.App) window.App.showRecordToast('🐌 우렁이가 일기에 답글을 달았어요');
    } catch (e) {}
  },

  deleteDiary(ts) {
    if (!confirm('이 일기를 지울까요? 되돌릴 수 없어요.')) return;
    const jr = (window.Storage._safeGet('cbt_night_journal', []) || []).filter(x => x.ts !== ts);
    window.Storage._safeSet('cbt_night_journal', jr);
    this.renderNightList();
  },

  _diaryShowAll: false,
  _diaryQuery: '',
  _diaryDate: '',

  // 일기장 내보내기 — 다이어리 양식의 독립 문서 (download: html 파일 / print: PDF)
  exportDiary(mode) {
    const journal = window.Storage._safeGet('cbt_night_journal', []) || [];
    if (!journal.length) { alert('아직 일기가 없어요. 오늘 밤 첫 일기를 써볼까요?'); return; }
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const name = window.Storage._safeGet('cbt_user_name', '') || '';
    const sorted = [...journal].sort((a, b) => a.ts - b.ts);
    const first = new Date(sorted[0].ts), lastD = new Date(sorted[sorted.length - 1].ts);
    let lastMonth = null;
    const entries = sorted.map(j => {
      const d = new Date(j.ts);
      const mo = d.toISOString().slice(0, 7);
      const monthHead = mo !== lastMonth ? `<h2 class="mhead">${d.getFullYear()}년 ${d.getMonth() + 1}월</h2>` : '';
      lastMonth = mo;
      const emoji = j.mood ? (this.MOOD_EMOJI[j.mood.emo] || '🌙') : (j.free ? '✍️' : '🌙');
      return `${monthHead}<div class="entry">
        <div class="ehead"><span class="edate">${d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}${j.free ? ' · 자유 일기' : ''}</span>
        <span class="eweather">마음 날씨 ${emoji}${j.mood && j.mood.emo ? ' ' + esc(j.mood.emo) : ''}</span></div>
        ${j.moment ? `<p class="emoment">${esc(j.moment)}</p>` : ''}
        ${j.note ? `<p class="enote">✎ 나에게: ${esc(j.note)}</p>` : ''}
        ${j.reply ? `<p class="ereply">🐌 우렁이: ${esc(j.reply)}</p>` : ''}
      </div>`;
    }).join('');
    const coverMeta = `${first.getFullYear()}.${first.getMonth() + 1}.${first.getDate()} ~ ${lastD.getFullYear()}.${lastD.getMonth() + 1}.${lastD.getDate()}`;
    const doc = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(name)} 마음 일기장</title>
<style>
body{font-family:'Malgun Gothic',system-ui,sans-serif;background:#fbf7f0;color:#3a342e;max-width:640px;margin:0 auto;padding:32px 24px;line-height:1.7}
h1{font-size:22px;margin:0}p.meta{font-size:12px;color:#a99c8c;margin:4px 0 26px}
.entry{border-bottom:1.5px dashed #ddd2c2;padding:18px 4px}
.ehead{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.edate{font-weight:800;font-size:14px}.eweather{font-size:12px;color:#8a8073}
.emoment{margin:8px 0 0;font-size:14px}
.enote{margin:6px 0 0;font-size:12.5px;color:#7d6f5d;background:#f4ede1;border-radius:8px;padding:8px 12px}
.ereply{margin:8px 0 0;font-size:12.5px;color:#4f6b58;border-left:3px solid #7fa78c;padding:4px 10px}
h2.mhead{font-size:15px;color:#4f8a6b;margin:26px 0 2px;border-bottom:2px solid #e4efe8;padding-bottom:4px}
@media print{body{padding:0}}
</style></head><body>
<h1>📓 ${esc(name) || '나'}의 마음 일기장</h1>
<p class="meta">${coverMeta} · 모두 ${journal.length}편 · 우렁이와 함께 쓴 기록</p>
${entries}
<p style="font-size:11px;color:#a99c8c;margin-top:24px">— 느리지만 계속 가고 있는 기록. 🐌</p>
</body></html>`;
    if (mode === 'print') {
      const w = window.open('', '_blank');
      if (!w) { alert('팝업이 차단됐어요. 팝업을 허용해주세요.'); return; }
      w.document.write(doc); w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
    } else {
      const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `마음일기장_${new Date().toLocaleDateString('sv-CA')}.html`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      if (window.App) window.App.showRecordToast('일기장을 파일로 저장했어요');
    }
  },

  // --------------------------------------------------------------------------
  //  일기장 전체화면 — 좁은 아코디언 대신 넓은 화면에서 훑어본다.
  //   검색·날짜 필터는 그대로 쓰되(같은 상태를 공유), 목록만 이쪽에 그린다.
  // --------------------------------------------------------------------------
  openDiaryFull() {
    const old = document.getElementById('diary-full-ov');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'diary-full-ov';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10040; background: var(--bg-primary); overflow-y: auto;'
      + ' padding: calc(0.9rem + env(safe-area-inset-top)) 1.1rem calc(2rem + env(safe-area-inset-bottom));';

    const total = (window.Storage._safeGet('cbt_night_journal', []) || []).length;
    ov.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.15rem;">
        <span style="line-height: 0; color: var(--accent-primary);">${window.Icons ? window.Icons.svg('note', { size: 19 }) : ''}</span>
        <strong style="font-size: 1.05rem; color: var(--text-primary);">나의 일기장</strong>
        <button onclick="window.Growth.closeDiaryFull()" style="all: unset; margin-left: auto; cursor: pointer; font-size: 1.1rem; color: var(--text-muted); padding: 0.2rem 0.4rem;">✕</button>
      </div>
      <p style="margin: 0 0 0.85rem; font-size: 0.76rem; color: var(--text-muted);">지금까지 ${total}편을 남겼어요</p>

      <input id="diary-full-search" type="search" placeholder="내용이나 우렁이 답글로 검색"
        oninput="window.Growth._diaryQuery = this.value.trim(); window.Growth.renderNightList();"
        style="width: 100%; box-sizing: border-box; margin-bottom: 0.45rem; padding: 0.6rem 0.85rem; border-radius: 11px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; font-size: 0.85rem;">
      <div style="display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.9rem;">
        <input id="diary-full-date" type="date"
          oninput="window.Growth._diaryDate = this.value; window.Growth.renderNightList();"
          style="flex: 1 1 0%; min-width: 0; box-sizing: border-box; padding: 0.5rem 0.6rem; border-radius: 11px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; font-size: 0.8rem; font-family: inherit;">
        <button onclick="window.Growth.clearDiaryFilter()"
          style="all: unset; flex-shrink: 0; cursor: pointer; font-size: 0.76rem; font-weight: 700; color: var(--text-muted); padding: 0.35rem 0.5rem;">필터 지우기</button>
      </div>

      <div id="night-journal-card">
        <div id="night-journal-list" style="display: flex; flex-direction: column; gap: 0.7rem;"></div>
      </div>
      <p id="diary-empty-note" style="margin: 1rem 0 0; font-size: 0.8rem; color: var(--text-muted); text-align: center; line-height: 1.7;">
        아직 쓴 일기가 없어요.<br>오늘 밤, 딱 한 줄부터 시작해볼까요?
      </p>

      <div style="display: flex; gap: 0.45rem; margin-top: 1.1rem;">
        <button class="btn-secondary" style="flex: 1; font-size: 0.79rem; padding: 0.55rem;" onclick="window.Growth.exportDiary('download')">파일로 저장</button>
        <button class="btn-secondary" style="flex: 1; font-size: 0.79rem; padding: 0.55rem;" onclick="window.Growth.exportDiary('print')">인쇄 · PDF</button>
      </div>
      <button class="btn-primary" style="width: 100%; margin-top: 0.5rem; padding: 0.7rem; font-size: 0.88rem;"
        onclick="window.Growth.closeDiaryFull(); window.Growth.startNight();">오늘 일기 쓰기</button>`;

    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
    this.renderNightList();
  },

  closeDiaryFull() {
    const ov = document.getElementById('diary-full-ov');
    if (ov) ov.remove();
    if (window.Sfx) window.Sfx.play('close');
    this.renderNightList();   // 서재 안 목록도 같은 필터로 다시 그린다
  },

  clearDiaryFilter() {
    this._diaryQuery = '';
    this._diaryDate = '';
    ['diary-search', 'diary-full-search', 'diary-date', 'diary-full-date'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    this.renderNightList();
  },

  renderNightList() {
    const card = document.getElementById('night-journal-card');
    const list = document.getElementById('night-journal-list');
    if (!card || !list) return;
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const journal = window.Storage._safeGet('cbt_night_journal', []) || [];
    card.classList.toggle('hidden', journal.length === 0);
    const emptyNote = document.getElementById('diary-empty-note');
    if (emptyNote) emptyNote.style.display = journal.length ? 'none' : '';
    if (journal.length === 0) return;
    // 키워드 검색 (내용·나에게 한마디·우렁이 답글)
    const q = (this._diaryQuery || '').toLowerCase();
    const dq = this._diaryDate || '';
    let items = q
      ? journal.filter(j => [j.moment, j.note, j.reply].some(t => (t || '').toLowerCase().includes(q)))
      : journal;
    if (dq) items = items.filter(j => new Date(j.ts).toLocaleDateString('sv-CA') === dq);
    if ((q || dq) && items.length === 0) {
      list.innerHTML = '<p style="margin: 0.3rem 0; font-size: 0.78rem; color: var(--text-muted); text-align: center;">검색 결과가 없어요.</p>';
      return;
    }
    const shown = (q || dq || this._diaryShowAll) ? items : items.slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthOf = ts => new Date(ts).toISOString().slice(0, 7);
    let lastMonth = null;
    let html = `<p style="margin: 0 0 0.55rem; font-size: 0.7rem; color: var(--text-muted);">모두 ${journal.length}편 · 이번 달 ${journal.filter(j => monthOf(j.ts) === thisMonth).length}편</p>`;
    shown.forEach(j => {
      const mo = monthOf(j.ts);
      if (mo !== lastMonth) {
        lastMonth = mo;
        const d0 = new Date(j.ts);
        html += `<p style="margin: 0.7rem 0 0.35rem; font-size: 0.72rem; font-weight: 800; color: var(--accent-primary);">${d0.getFullYear()}년 ${d0.getMonth() + 1}월</p>`;
      }
      const d = new Date(j.ts);
      const dateStr = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
      const emoji = j.mood ? (this.MOOD_EMOJI[j.mood.emo] || '🌙') : (j.free ? '✍️' : '🌙');
      html += `<div style="padding: 0.75rem 0.9rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); margin-bottom: 0.5rem; position: relative;">
        <button onclick="window.Growth.deleteDiary(${j.ts})" title="삭제" style="all: unset; position: absolute; top: 0.45rem; right: 0.6rem; cursor: pointer; color: var(--text-muted); opacity: 0.6; font-size: 0.8rem; padding: 0.15rem;">✕</button>
        <div style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; font-weight: 700; color: var(--text-primary); padding-right: 1.4rem;">
          <span style="font-size: 1.1rem;">${emoji}</span>${dateStr}${j.free ? '' : ' 밤'}
          <span style="flex: 1;"></span>
          <span style="font-size: 0.68rem; font-weight: 600; color: var(--text-muted);">${j.free ? '자유 일기' : '🕐 ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 취침'}</span>
        </div>
        ${j.moment ? `<p style="margin: 0.35rem 0 0; font-size: 0.83rem; color: var(--text-secondary); line-height: 1.65; white-space: pre-wrap;">${esc(j.moment)}</p>` : ''}
        ${j.note ? `<p style="margin: 0.3rem 0 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.5;">💬 나에게: ${esc(j.note)}</p>` : ''}
        ${j.reply ? `<p style="margin: 0.45rem 0 0; font-size: 0.76rem; color: var(--text-primary); line-height: 1.55; background: color-mix(in srgb, var(--accent-primary) 9%, transparent); border-left: 3px solid var(--accent-primary); border-radius: 0 8px 8px 0; padding: 0.4rem 0.6rem;">🐌 ${esc(j.reply)}</p>` : ''}
      </div>`;
    });
    if (!q && !dq && !this._diaryShowAll && items.length > 10) {
      html += `<button class="btn-secondary" style="width: 100%; font-size: 0.76rem; padding: 0.45rem;" onclick="window.Growth._diaryShowAll = true; window.Growth.renderNightList();">지난 일기 ${items.length - 10}편 더 보기</button>`;
    }
    list.innerHTML = html;
  },

  startNight() {
    // 쓰다 만 하루 정리가 있으면 이어쓰기 (12시간 보관)
    const d = window.Storage._safeGet('cbt_night_draft', null);
    if (d && d.night && Date.now() - d.ts < 12 * 3600000) {
      if (confirm('🌙 쓰다 만 하루 정리가 있어요. 이어서 쓸까요?')) {
        this._night = d.night;
        this._nightStep(d.step || 1);
        return;
      }
      localStorage.removeItem('cbt_night_draft');
    }
    this._night = { mood: null, moment: '', note: '' };
    this._nightStep(1);
  },

  _saveNightDraft(step) {
    if (!this._night) return;
    if (step <= 1 && !this._night.mood) return;
    window.Storage._safeSet('cbt_night_draft', { night: this._night, step, ts: Date.now() });
  },

  _nightStep(n) {
    this._saveNightDraft(n); // 단계마다 초안 저장 — 새로고침해도 이어쓴다
    setTimeout(() => {
      const ta = document.getElementById('ng-moment') || document.getElementById('ng-note');
      if (!ta) return;
      ta.addEventListener('input', () => {
        if (ta.id === 'ng-moment') this._night.moment = ta.value;
        else this._night.note = ta.value;
        this._saveNightDraft(n);
      });
    }, 100);
    const wrap = (inner) => {
      const old = document.getElementById('night-overlay');
      if (old) old.remove();
      const ov = document.createElement('div');
      ov.id = 'night-overlay';
      ov.style.cssText = 'position: fixed; inset: 0; z-index: 10003; background: linear-gradient(180deg, #232f3b 0%, #141c24 100%); color: #faf6ec; display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem;';
      ov.innerHTML = `<div style="width: 100%; max-width: 320px; text-align: center;">${inner}</div>
        <button onclick="document.getElementById('night-overlay').remove()" style="all: unset; position: absolute; top: 1rem; right: 1.2rem; font-size: 1.3rem; cursor: pointer; opacity: 0.8; padding: 0.3rem;">✕</button>`;
      document.body.appendChild(ov);
    };
    const nextBtn = (label, fn) => `<button id="ng-next" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.85rem; border-radius: 999px; background: #f0ead9; color: #232f3b; font-weight: 800; cursor: pointer; margin-top: 1.1rem;">${label}</button>`;

    if (n === 1) {
      wrap(`
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('sleepy', 110) : '🌙'}</span>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.3rem; color: #ffffff;">오늘 하루도 살아냈네요</h2>
        <p style="font-size: 0.92rem; color: #e9e2d2; line-height: 1.65;">자기 전에 딱 3분,<br>우렁이랑 오늘을 같이 정리하고 자요.</p>
        ${nextBtn('좋아, 시작할게')}`);
      document.getElementById('ng-next').addEventListener('click', () => this._nightStep(2));
    } else if (n === 2) {
      wrap(`
        <p style="font-size: 0.8rem; color: #cfc7b4; margin: 0 0 0.6rem;">1 / 3</p>
        <h2 style="margin: 0 0 1rem; font-size: 1.2rem; color: #ffffff;">오늘 하루, 전체적으로 어땠어요?</h2>
        <div style="display: flex; justify-content: space-between; gap: 0.3rem;">
          ${[['joy', 5, '기쁨'], ['empathy', 4, '편안'], ['blank', 3, '보통'], ['surprise', 2, '불안'], ['sad', 1.5, '우울']].map(([st, v, emo]) =>
            `<button data-v="${v}" data-emo="${emo}" class="ng-mood" style="all: unset; box-sizing: border-box; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.1rem; padding: 0.4rem 0 0.35rem; border-radius: 14px; cursor: pointer; background: rgba(255,255,255,0.14);">
              <span style="line-height: 0;">${window.Stickers ? window.Stickers.svg(st, 46) : ''}</span>
              <span style="font-size: 0.66rem; font-weight: 700; color: #e9e2d2;">${emo}</span>
            </button>`).join('')}
        </div>`);
      document.querySelectorAll('.ng-mood').forEach(b => b.addEventListener('click', () => {
        this._night.mood = { v: parseFloat(b.dataset.v), emo: b.dataset.emo };
        const log = window.Storage._safeGet('cbt_mood_log', []) || [];
        log.push({ ts: Date.now(), emo: b.dataset.emo, v: parseFloat(b.dataset.v) });
        window.Storage._safeSet('cbt_mood_log', log.slice(-800));
        this._nightStep(3);
      }));
    } else if (n === 3) {
      wrap(`
        <p style="font-size: 0.8rem; color: #cfc7b4; margin: 0 0 0.6rem;">2 / 3</p>
        <h2 style="margin: 0 0 0.4rem; font-size: 1.2rem; color: #ffffff;">오늘 가장 마음에 남는 순간은?</h2>
        <p style="font-size: 0.85rem; color: #ded6c3; margin: 0 0 0.8rem;">좋았든 힘들었든, 한 장면이면 충분해요.</p>
        <textarea id="ng-moment" rows="3" placeholder="예: 점심에 동료가 건넨 말 한마디…" style="width: 100%; box-sizing: border-box; padding: 0.85rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.16); color: #ffffff; outline: none; resize: none; font-size: 0.98rem; line-height: 1.6;">${(this._night.moment || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
        ${nextBtn('다음 ›')}
        <button onclick="window.Growth._nightStep(4)" style="all: unset; display: block; width: 100%; text-align: center; padding: 0.6rem; font-size: 0.82rem; color: #cfc7b4; cursor: pointer;">건너뛰기</button>`);
      document.getElementById('ng-next').addEventListener('click', () => {
        this._night.moment = document.getElementById('ng-moment').value.trim();
        this._nightStep(4);
      });
    } else if (n === 4) {
      wrap(`
        <p style="font-size: 0.8rem; color: #cfc7b4; margin: 0 0 0.6rem;">3 / 3</p>
        <h2 style="margin: 0 0 0.4rem; font-size: 1.2rem; color: #ffffff;">오늘의 나에게 한마디</h2>
        <p style="font-size: 0.85rem; color: #ded6c3; margin: 0 0 0.8rem;">칭찬도, 위로도, 잔소리도 좋아요.</p>
        <textarea id="ng-note" rows="3" placeholder="예: 오늘도 버텨줘서 고마워" style="width: 100%; box-sizing: border-box; padding: 0.85rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.16); color: #ffffff; outline: none; resize: none; font-size: 0.98rem; line-height: 1.6;">${(this._night.note || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
        ${nextBtn('하루 정리 끝내기')}`);
      document.getElementById('ng-next').addEventListener('click', () => {
        this._night.note = document.getElementById('ng-note').value.trim();
        this._finishNight();
      });
    }
  },

  async _finishNight() {
    // 저장
    localStorage.removeItem('cbt_night_draft'); // 완료 — 초안 정리
    const journal = window.Storage._safeGet('cbt_night_journal', []) || [];
    const entryTs = Date.now();
    journal.unshift({ ts: entryTs, ...this._night });
    window.Storage._safeSet('cbt_night_journal', journal.slice(0, 120));
    this._diaryReply(entryTs);
    if (window.Farm) window.Farm.addWater(4, '하루 정리 완료');
    if (window.Storage.markDayActive) window.Storage.markDayActive();
    this.renderNightList();

    // 챗봇 우렁이의 장기기억에도 남긴다 — 다음 대화에서 "어제 산책 좋았다며?"가 가능하도록.
    // (다음 대화의 기억 정리 AI가 이 줄을 자연스럽게 사례 기록에 녹여넣는다)
    try {
      const m = this._night;
      const dateStr = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      const line = `\n[하루정리 ${dateStr}] 기분: ${m.mood ? m.mood.emo : '미기록'}` +
        (m.moment ? ` / 남은 순간: ${m.moment}` : '') +
        (m.note ? ` / 스스로에게: ${m.note}` : '');
      let prev = window.Storage.getUserMemory() || '';
      if (prev.length + line.length > 6000) prev = prev.slice(0, 6000 - line.length); // 상한 초과 시 새 줄이 잘리지 않게
      window.Storage.setUserMemory(prev + line);
    } catch (e) {}

    // 우렁이의 굿나잇 한마디 (AI, 실패 시 기본 문구)
    let goodnight = '오늘의 이야기, 우렁이가 잘 안아 두었어요.\n내일의 당신은 조금 더 가벼울 거예요. 잘 자요.';
    try {
      if (window.LLM) {
        const m = this._night;
        const res = await window.LLM._chatCompletion({
          model: window.LLM.MODEL_LIGHT || window.LLM.MODEL,
          messages: [{ role: 'user', content: `당신은 다정한 상담사 '우렁이'입니다. 사용자가 자기 전 하루 정리를 마쳤습니다.\n오늘 기분: ${m.mood ? m.mood.emo : '미기록'}\n마음에 남은 순간: ${m.moment || '(없음)'}\n스스로에게 한마디: ${m.note || '(없음)'}\n[장기기억]\n${window.Storage.getUserMemory() || '(없음)'}\n\n이 사람에게 보내는 굿나잇 메시지를 2문장 이내로, 따뜻하고 구체적으로(오늘 내용을 반영해서) 써주세요. 메시지만 출력.` }],
          temperature: 0.8,
          max_tokens: 120
        });
        if (res.ok) {
          const data = await res.json();
          const t = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
          if (t) goodnight = t;
        }
      }
    } catch (e) {}

    const old = document.getElementById('night-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'night-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10003; background: linear-gradient(180deg, #232f3b 0%, #141c24 100%); color: #faf6ec; display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem;';
    ov.innerHTML = `
      <div style="width: 100%; max-width: 320px; text-align: center;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('love', 110) : '💤'}</span>
        <h2 style="margin: 0.8rem 0 0.5rem; font-size: 1.25rem; color: #ffffff;">오늘 하루 정리 완료</h2>
        <p style="font-size: 0.95rem; color: #f3edde; line-height: 1.75; white-space: pre-line;">${goodnight}</p>
        <button onclick="document.getElementById('night-overlay').remove(); window.Growth.maybeShowNightCard(); window.Growth.checkAwards();" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.85rem; border-radius: 999px; background: #f0ead9; color: #232f3b; font-weight: 800; cursor: pointer; margin-top: 1.3rem;">잘 자요 🌙</button>
        <button onclick="document.getElementById('night-overlay').remove(); window.Growth.maybeShowNightCard(); window.Growth.checkAwards(); window.Calm && window.Calm.startBreath('478');" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.84rem; color: #ded6c3; cursor: pointer;">🫧 4·7·8 호흡하면서 잠들기</button>
        <button onclick="document.getElementById('night-overlay').remove(); window.Growth.maybeShowNightCard(); window.Growth.checkAwards(); window.SleepSounds && window.SleepSounds.open();" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.55rem; font-size: 0.84rem; color: #ded6c3; cursor: pointer;">🌧️ 빗소리 들으면서 잠들기</button>
      </div>`;
    document.body.appendChild(ov);
  }
};
