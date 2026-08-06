// ============================================================================
//  행동 미션 — CBT 행동활성화(Behavioral Activation)
//  우렁이가 매일 아주 작은 숙제 하나를 준다. 몸이 움직이면 마음이 따라온다.
//  완료하면 스트릭·뱃지에 집계되고, 주간 편지에도 반영된다.
// ============================================================================
window.Missions = {
  POOL: [
    // 몸 움직이기
    { id: 'walk10',    emoji: '🚶', text: '10분만 밖을 걸어볼까? 목적지는 없어도 돼', cat: '움직임' },
    { id: 'stretch',   emoji: '🙆', text: '기지개 크게 3번! 굳은 어깨를 풀어주자', cat: '움직임' },
    { id: 'sunlight',  emoji: '☀️', text: '햇빛 5분 쬐기. 창가에 서 있는 것만으로도 좋아', cat: '움직임' },
    { id: 'stairs',    emoji: '🪜', text: '엘리베이터 대신 계단 한 번 이용해보기', cat: '움직임' },
    { id: 'dance',     emoji: '💃', text: '좋아하는 노래 한 곡 틀고 몸을 흔들어보기', cat: '움직임' },
    // 소소한 즐거움
    { id: 'tea',       emoji: '🍵', text: '따뜻한 차 한 잔을 천천히, 맛에 집중해서 마셔보기', cat: '즐거움' },
    { id: 'music',     emoji: '🎵', text: '예전에 좋아했던 노래 한 곡 다시 들어보기', cat: '즐거움' },
    { id: 'photo',     emoji: '📷', text: '오늘 마음에 드는 장면 하나를 사진으로 남기기', cat: '즐거움' },
    { id: 'snack',     emoji: '🍪', text: '좋아하는 간식을 죄책감 없이 맛있게 먹기', cat: '즐거움' },
    { id: 'window',    emoji: '🌥️', text: '창밖 구름이나 하늘을 1분 동안 바라보기', cat: '즐거움' },
    // 연결
    { id: 'message',   emoji: '💬', text: '생각나는 사람에게 안부 메시지 하나 보내보기', cat: '연결' },
    { id: 'thanks',    emoji: '🙏', text: '오늘 고마웠던 사람(또는 나)에게 마음속으로 감사 전하기', cat: '연결' },
    { id: 'compliment',emoji: '💚', text: '거울 보고 나에게 칭찬 한 마디 해주기', cat: '연결' },
    { id: 'smile',     emoji: '😊', text: '마주치는 누군가에게 눈인사 한 번 건네보기', cat: '연결' },
    // 정리·돌봄
    { id: 'desk',      emoji: '🧹', text: '책상 위 딱 한 뼘만 정리해보기', cat: '돌봄' },
    { id: 'water',     emoji: '💧', text: '물 한 컵 천천히 마시기. 지금 바로!', cat: '돌봄' },
    { id: 'shower',    emoji: '🚿', text: '따뜻한 물로 샤워하며 오늘의 긴장 흘려보내기', cat: '돌봄' },
    { id: 'bed',       emoji: '🛏️', text: '이불 정리하기. 작은 성취가 하루를 바꿔요', cat: '돌봄' },
    { id: 'plant',     emoji: '🌱', text: '화분에 물 주기 (없다면 초록색 무언가 찾아보기)', cat: '돌봄' },
    // 마음
    { id: 'breath3',   emoji: '🫧', text: '눈 감고 깊은 호흡 3번. 들이쉬고… 내쉬고…', cat: '마음' },
    { id: 'grateful3', emoji: '✨', text: '오늘 감사한 것 3가지를 마음속으로 떠올려보기', cat: '마음' },
    { id: 'phonefree', emoji: '📵', text: '10분만 휴대폰 내려놓고 멍때리기', cat: '마음' },
    { id: 'praise',    emoji: '🏅', text: '오늘 내가 해낸 일 하나를 인정해주기 (작아도 OK)', cat: '마음' },
    { id: 'slowmeal',  emoji: '🍚', text: '한 끼만 천천히, 맛을 느끼면서 먹어보기', cat: '마음' }
  ],

  _today() {
    return new Date().toLocaleDateString('sv-CA');
  },

  state() {
    const s = window.Storage._safeGet('cbt_daily_mission', null);
    return (s && s.date === this._today()) ? s : null;
  },

  // 오늘의 미션 (없으면 새로 뽑기 — 최근 7일에 나온 미션은 피한다)
  todayMission() {
    let s = this.state();
    if (!s) {
      const recent = (window.Storage._safeGet('cbt_mission_log', []) || []).slice(0, 7).map(m => m.id);
      const pool = this.POOL.filter(m => !recent.includes(m.id));
      const pick = (pool.length ? pool : this.POOL)[Math.floor(Math.random() * (pool.length ? pool.length : this.POOL.length))];
      s = { date: this._today(), id: pick.id, done: false, rerolled: false };
      window.Storage._safeSet('cbt_daily_mission', s);
    }
    return { ...this.POOL.find(m => m.id === s.id), done: s.done, rerolled: s.rerolled };
  },

  doneCount() {
    return (window.Storage._safeGet('cbt_mission_log', []) || []).filter(m => m.done).length;
  },

  complete() {
    const s = this.state();
    if (!s || s.done) return;
    s.done = true;
    s.ts = Date.now();
    window.Storage._safeSet('cbt_daily_mission', s);
    const log = window.Storage._safeGet('cbt_mission_log', []) || [];
    log.unshift({ id: s.id, ts: Date.now(), done: true });
    window.Storage._safeSet('cbt_mission_log', log.slice(0, 200));
    window.Storage.markDayActive();
    this.renderCard();
    if (window.App && window.App.showRecordToast) {
      const cheers = ['우와, 해냈다! 🎉', '역시 당신이야!', '몸이 움직이면 마음이 따라와요', '오늘의 작은 승리 +1'];
      window.App.showRecordToast(`✅ ${cheers[Math.floor(Math.random() * cheers.length)]}`);
    }
    if (window.App && window.App.stickerPop) {
      const pops = ['hero', 'party', 'proud', 'ok', 'dance'];
      window.App.stickerPop(pops[Math.floor(Math.random() * pops.length)], 1500);
    }
    if (window.App && window.App.playNotify) window.App.playNotify();
    if (window.Growth) window.Growth.checkAwards();
  },

  // 하루 1회, 완료 전에만 다른 미션으로 교체
  reroll() {
    const s = this.state();
    if (!s || s.done || s.rerolled) return;
    const pool = this.POOL.filter(m => m.id !== s.id);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    s.id = pick.id;
    s.rerolled = true;
    window.Storage._safeSet('cbt_daily_mission', s);
    this.renderCard();
  },

  renderCard() {
    const el = document.getElementById('mission-card-body');
    if (!el) return;
    const m = this.todayMission();
    const total = this.doneCount();
    if (m.done) {
      el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
          <span style="line-height: 0; flex-shrink: 0;">${window.Stickers ? window.Stickers.svg('proud', 62) : '🎉'}</span>
          <div style="flex: 1; min-width: 0;">
            <strong style="font-size: 0.92rem; color: var(--accent-primary); display: block;">오늘 미션 완료! ${m.emoji}</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">${m.text}</span>
            <span style="display: block; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">지금까지 ${total}개의 작은 승리를 모았어요</span>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.7rem;">
          <span style="font-size: 1.9rem; flex-shrink: 0;">${m.emoji}</span>
          <div style="flex: 1; min-width: 0;">
            <span style="font-size: 0.68rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); padding: 0.12rem 0.5rem; border-radius: 999px;">${m.cat}</span>
            <p style="margin: 0.3rem 0 0; font-size: 0.92rem; font-weight: 600; color: var(--text-primary); line-height: 1.5;">${m.text}</p>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-primary" style="flex: 1; font-size: 0.85rem; padding: 0.6rem;" onclick="window.Missions.complete()">했어요! ✅</button>
          ${m.rerolled ? '' : `<button class="btn-secondary" style="width: auto; font-size: 0.78rem; padding: 0.6rem 0.8rem;" onclick="window.Missions.reroll()" title="오늘 한 번만 바꿀 수 있어요">🔄 다른 거</button>`}
        </div>`;
    }
  }
};
