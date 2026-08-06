// ============================================================================
//  성장 시스템 — 스트릭 · 뱃지 · 야간 루틴("오늘 하루 정리")
//  꾸준함이 보상이 되도록: 연속 방문 칩, 마일스톤 뱃지, 잠들기 전 3분 정리.
// ============================================================================
window.Growth = {
  BADGES: [
    { id: 'first_chat', emoji: '🐌', name: '첫 만남',       desc: '우렁이와 첫 대화',        check: s => s.chats >= 1 },
    { id: 'chat50',     emoji: '💬', name: '단골 손님',     desc: '대화 50회',               check: s => s.chats >= 50 },
    { id: 'chat200',    emoji: '🗣️', name: '속마음 단짝',   desc: '대화 200회',              check: s => s.chats >= 200 },
    { id: 'streak3',    emoji: '🌱', name: '사흘의 새싹',   desc: '3일 연속 방문',           check: s => s.streak >= 3 },
    { id: 'streak7',    emoji: '🔥', name: '일주일 불꽃',   desc: '7일 연속 방문',           check: s => s.streak >= 7 },
    { id: 'streak30',   emoji: '🏆', name: '한 달의 마음',  desc: '30일 연속 방문',          check: s => s.streak >= 30 },
    { id: 'record5',    emoji: '📝', name: '마음 기록가',   desc: '사고 기록 5개',           check: s => s.records >= 5 },
    { id: 'mood30',     emoji: '🌈', name: '감정 관찰자',   desc: '기분 기록 30개',          check: s => s.moods >= 30 },
    { id: 'breath10',   emoji: '🫧', name: '숨 고르기 달인', desc: '호흡 연습 10회',          check: s => s.breaths >= 10 },
    { id: 'night7',     emoji: '🌙', name: '굿나잇 요정',   desc: '하루 정리 7회',           check: s => s.nights >= 7 }
  ],

  init() {
    this.renderStreakChip();
    this.maybeShowNightCard();
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
      nights: (S._safeGet('cbt_night_journal', []) || []).length
    };
  },

  bumpBreath() {
    window.Storage._safeSet('cbt_breath_count', (window.Storage._safeGet('cbt_breath_count', 0) || 0) + 1);
    this.checkAwards();
  },

  checkAwards(silent) {
    const earned = window.Storage._safeGet('cbt_badges', {}) || {};
    const s = this.stats();
    let newly = null;
    this.BADGES.forEach(b => {
      if (!earned[b.id] && b.check(s)) {
        earned[b.id] = Date.now();
        newly = b;
      }
    });
    window.Storage._safeSet('cbt_badges', earned);
    if (newly && !silent && window.App && window.App.showRecordToast) {
      window.App.showRecordToast(`${newly.emoji} 뱃지 획득! '${newly.name}'`);
      if (window.App.playNotify) window.App.playNotify();
    }
    this.renderStreakChip();
  },

  renderStreakChip() {
    const el = document.getElementById('streak-chip');
    if (!el) return;
    const st = this.stats().streak;
    el.textContent = st >= 2 ? `🔥 ${st}일 연속` : '';
    el.style.display = st >= 2 ? '' : 'none';
  },

  renderBadgeCard() {
    const line = document.getElementById('growth-streak-line');
    if (line) {
      const st = this.stats().streak;
      line.textContent = st >= 2 ? `🔥 ${st}일 연속 방문 중` : (st === 1 ? '🌱 오늘부터 스트릭 시작!' : '');
    }
    const el = document.getElementById('badge-grid');
    if (!el) return;
    const earned = window.Storage._safeGet('cbt_badges', {}) || {};
    el.innerHTML = this.BADGES.map(b => {
      const has = !!earned[b.id];
      return `<div title="${b.desc}" style="text-align: center; padding: 0.6rem 0.2rem; border-radius: 12px; background: ${has ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-tertiary)'}; border: 1px solid ${has ? 'color-mix(in srgb, var(--accent-primary) 35%, transparent)' : 'var(--glass-border)'}; ${has ? '' : 'opacity: 0.45; filter: grayscale(1);'}">
        <div style="font-size: 1.5rem;">${b.emoji}</div>
        <div style="font-size: 0.66rem; font-weight: 700; color: var(--text-primary); margin-top: 0.15rem;">${b.name}</div>
        <div style="font-size: 0.58rem; color: var(--text-muted);">${b.desc}</div>
      </div>`;
    }).join('');
  },

  // ==========================================================================
  //  야간 루틴 — "오늘 하루 정리" (저녁 8시~새벽 2시에 홈에서 권유)
  // ==========================================================================
  maybeShowNightCard() {
    const card = document.getElementById('night-card');
    if (!card) return;
    const h = new Date().getHours();
    const isNight = h >= 20 || h < 2;
    const today = new Date().toLocaleDateString('sv-CA');
    const doneToday = (window.Storage._safeGet('cbt_night_journal', []) || [])
      .some(j => new Date(j.ts).toLocaleDateString('sv-CA') === today);
    const dismissed = window.Storage._safeGet('cbt_night_dismiss', '') === today;
    card.classList.toggle('hidden', !isNight || doneToday || dismissed);
  },

  dismissNightToday() {
    window.Storage._safeSet('cbt_night_dismiss', new Date().toLocaleDateString('sv-CA'));
    this.maybeShowNightCard();
    if (window.App && window.App.showRecordToast) window.App.showRecordToast('🌙 오늘은 푹 쉬어요. 내일 밤 다시 물어볼게요');
  },

  startNight() {
    this._night = { mood: null, moment: '', note: '' };
    this._nightStep(1);
  },

  _nightStep(n) {
    const wrap = (inner) => {
      const old = document.getElementById('night-overlay');
      if (old) old.remove();
      const ov = document.createElement('div');
      ov.id = 'night-overlay';
      ov.style.cssText = 'position: fixed; inset: 0; z-index: 10003; background: linear-gradient(180deg, #232f3b 0%, #141c24 100%); color: #f0ead9; display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem;';
      ov.innerHTML = `<div style="width: 100%; max-width: 320px; text-align: center;">${inner}</div>
        <button onclick="document.getElementById('night-overlay').remove()" style="all: unset; position: absolute; top: 1rem; right: 1.2rem; font-size: 1.3rem; cursor: pointer; opacity: 0.6; padding: 0.3rem;">✕</button>`;
      document.body.appendChild(ov);
    };
    const nextBtn = (label, fn) => `<button id="ng-next" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.85rem; border-radius: 999px; background: #f0ead9; color: #232f3b; font-weight: 800; cursor: pointer; margin-top: 1.1rem;">${label}</button>`;

    if (n === 1) {
      wrap(`
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('sleepy', 110) : '🌙'}</span>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.3rem;">오늘 하루도 살아냈네요</h2>
        <p style="font-size: 0.86rem; opacity: 0.85; line-height: 1.6;">자기 전에 딱 3분,<br>우렁이랑 오늘을 같이 정리하고 자요.</p>
        ${nextBtn('좋아, 시작할게')}`);
      document.getElementById('ng-next').addEventListener('click', () => this._nightStep(2));
    } else if (n === 2) {
      wrap(`
        <p style="font-size: 0.75rem; opacity: 0.6; margin: 0 0 0.6rem;">1 / 3</p>
        <h2 style="margin: 0 0 1rem; font-size: 1.2rem;">오늘 하루, 전체적으로 어땠어요?</h2>
        <div style="display: flex; justify-content: space-between; gap: 0.3rem;">
          ${[['😄', 5, '기쁨'], ['🙂', 4, '편안'], ['😐', 3, '보통'], ['😟', 2, '불안'], ['😢', 1.5, '우울']].map(([e, v, emo]) =>
            `<button data-v="${v}" data-emo="${emo}" class="ng-mood" style="all: unset; box-sizing: border-box; flex: 1; text-align: center; font-size: 1.8rem; padding: 0.5rem 0; border-radius: 14px; cursor: pointer; background: rgba(255,255,255,0.08);">${e}</button>`).join('')}
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
        <p style="font-size: 0.75rem; opacity: 0.6; margin: 0 0 0.6rem;">2 / 3</p>
        <h2 style="margin: 0 0 0.4rem; font-size: 1.2rem;">오늘 가장 마음에 남는 순간은?</h2>
        <p style="font-size: 0.78rem; opacity: 0.7; margin: 0 0 0.8rem;">좋았든 힘들었든, 한 장면이면 충분해요.</p>
        <textarea id="ng-moment" rows="3" placeholder="예: 점심에 동료가 건넨 말 한마디…" style="width: 100%; box-sizing: border-box; padding: 0.8rem; border-radius: 12px; border: none; background: rgba(255,255,255,0.1); color: #f0ead9; outline: none; resize: none; font-size: 0.9rem;"></textarea>
        ${nextBtn('다음 ›')}
        <button onclick="window.Growth._nightStep(4)" style="all: unset; display: block; width: 100%; text-align: center; padding: 0.6rem; font-size: 0.78rem; opacity: 0.6; cursor: pointer;">건너뛰기</button>`);
      document.getElementById('ng-next').addEventListener('click', () => {
        this._night.moment = document.getElementById('ng-moment').value.trim();
        this._nightStep(4);
      });
    } else if (n === 4) {
      wrap(`
        <p style="font-size: 0.75rem; opacity: 0.6; margin: 0 0 0.6rem;">3 / 3</p>
        <h2 style="margin: 0 0 0.4rem; font-size: 1.2rem;">오늘의 나에게 한마디</h2>
        <p style="font-size: 0.78rem; opacity: 0.7; margin: 0 0 0.8rem;">칭찬도, 위로도, 잔소리도 좋아요.</p>
        <textarea id="ng-note" rows="3" placeholder="예: 오늘도 버텨줘서 고마워" style="width: 100%; box-sizing: border-box; padding: 0.8rem; border-radius: 12px; border: none; background: rgba(255,255,255,0.1); color: #f0ead9; outline: none; resize: none; font-size: 0.9rem;"></textarea>
        ${nextBtn('하루 정리 끝내기')}`);
      document.getElementById('ng-next').addEventListener('click', () => {
        this._night.note = document.getElementById('ng-note').value.trim();
        this._finishNight();
      });
    }
  },

  async _finishNight() {
    // 저장
    const journal = window.Storage._safeGet('cbt_night_journal', []) || [];
    journal.unshift({ ts: Date.now(), ...this._night });
    window.Storage._safeSet('cbt_night_journal', journal.slice(0, 60));
    if (window.Storage.markDayActive) window.Storage.markDayActive();

    // 우렁이의 굿나잇 한마디 (AI, 실패 시 기본 문구)
    let goodnight = '오늘의 이야기, 우렁이가 잘 안아 두었어요.\n내일의 당신은 조금 더 가벼울 거예요. 잘 자요.';
    try {
      if (window.LLM) {
        const m = this._night;
        const res = await window.LLM._chatCompletion({
          model: window.LLM.MODEL,
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
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10003; background: linear-gradient(180deg, #232f3b 0%, #141c24 100%); color: #f0ead9; display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem;';
    ov.innerHTML = `
      <div style="width: 100%; max-width: 320px; text-align: center;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('love', 110) : '💤'}</span>
        <h2 style="margin: 0.8rem 0 0.5rem; font-size: 1.25rem;">오늘 하루 정리 완료</h2>
        <p style="font-size: 0.9rem; opacity: 0.92; line-height: 1.7; white-space: pre-line;">${goodnight}</p>
        <button onclick="document.getElementById('night-overlay').remove(); window.Growth.maybeShowNightCard(); window.Growth.checkAwards();" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.85rem; border-radius: 999px; background: #f0ead9; color: #232f3b; font-weight: 800; cursor: pointer; margin-top: 1.3rem;">잘 자요 🌙</button>
        <button onclick="document.getElementById('night-overlay').remove(); window.Growth.maybeShowNightCard(); window.Growth.checkAwards(); window.Calm && window.Calm.startBreath('478');" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.8rem; opacity: 0.7; cursor: pointer;">🫧 4·7·8 호흡하면서 잠들기</button>
      </div>`;
    document.body.appendChild(ov);
  }
};
