// ============================================================================
//  행동 미션 — CBT 행동활성화(Behavioral Activation)
//  우렁이가 매일 아주 작은 숙제 하나를 준다. 몸이 움직이면 마음이 따라온다.
//  완료하면 스트릭·뱃지에 집계되고, 주간 편지에도 반영된다.
// ============================================================================
window.Missions = {
  POOL: [
    // 몸 움직이기
    { id: 'walk10',    icon: 'move', text: '10분만 밖을 걸어볼까? 목적지는 없어도 돼', cat: '움직임' },
    { id: 'stretch',   icon: 'move', text: '기지개 크게 3번! 굳은 어깨를 풀어주자', cat: '움직임' },
    { id: 'sunlight',  icon: 'move', text: '햇빛 5분 쬐기. 창가에 서 있는 것만으로도 좋아', cat: '움직임' },
    { id: 'stairs',    icon: 'move', text: '엘리베이터 대신 계단 한 번 이용해보기', cat: '움직임' },
    { id: 'dance',     icon: 'move', text: '좋아하는 노래 한 곡 틀고 몸을 흔들어보기', cat: '움직임' },
    // 소소한 즐거움
    { id: 'tea',       icon: 'joy', text: '따뜻한 차 한 잔을 천천히, 맛에 집중해서 마셔보기', cat: '즐거움' },
    { id: 'music',     icon: 'joy', text: '예전에 좋아했던 노래 한 곡 다시 들어보기', cat: '즐거움' },
    { id: 'photo',     icon: 'joy', text: '오늘 마음에 드는 장면 하나를 사진으로 남기기', cat: '즐거움' },
    { id: 'snack',     icon: 'joy', text: '좋아하는 간식을 죄책감 없이 맛있게 먹기', cat: '즐거움' },
    { id: 'window',    icon: 'joy', text: '창밖 구름이나 하늘을 1분 동안 바라보기', cat: '즐거움' },
    // 연결
    { id: 'message',   icon: 'link', text: '생각나는 사람에게 안부 메시지 하나 보내보기', cat: '연결' },
    { id: 'thanks',    icon: 'link', text: '오늘 고마웠던 사람(또는 나)에게 마음속으로 감사 전하기', cat: '연결' },
    { id: 'compliment',icon: 'link', text: '거울 보고 나에게 칭찬 한 마디 해주기', cat: '연결' },
    { id: 'smile',     icon: 'link', text: '마주치는 누군가에게 눈인사 한 번 건네보기', cat: '연결' },
    // 정리·돌봄
    { id: 'desk',      icon: 'care', text: '책상 위 딱 한 뼘만 정리해보기', cat: '돌봄' },
    { id: 'water',     icon: 'care', text: '물 한 컵 천천히 마시기. 지금 바로!', cat: '돌봄' },
    { id: 'shower',    icon: 'care', text: '따뜻한 물로 샤워하며 오늘의 긴장 흘려보내기', cat: '돌봄' },
    { id: 'bed',       icon: 'care', text: '이불 정리하기. 작은 성취가 하루를 바꿔요', cat: '돌봄' },
    { id: 'plant',     icon: 'care', text: '화분에 물 주기 (없다면 초록색 무언가 찾아보기)', cat: '돌봄' },
    // 마음
    { id: 'breath3',   icon: 'mind', text: '눈 감고 깊은 호흡 3번. 들이쉬고… 내쉬고…', cat: '마음' },
    { id: 'grateful3', icon: 'mind', text: '오늘 감사한 것 3가지를 마음속으로 떠올려보기', cat: '마음' },
    { id: 'phonefree', icon: 'mind', text: '10분만 휴대폰 내려놓고 멍때리기', cat: '마음' },
    { id: 'praise',    icon: 'mind', text: '오늘 내가 해낸 일 하나를 인정해주기 (작아도 OK)', cat: '마음' },
    { id: 'slowmeal',  icon: 'mind', text: '한 끼만 천천히, 맛을 느끼면서 먹어보기', cat: '마음' },
    // 확장 — 움직임
    { id: 'tiptoe',    icon: 'move', text: '발끝 들기 10번. 종아리가 깨어나요', cat: '움직임' },
    { id: 'doorstep',  icon: 'move', text: '현관문 밖에 나가 1분만 서 있다 오기', cat: '움직임' },
    { id: 'shakeout',  icon: 'move', text: '손목·발목 30초씩 털어서 긴장 흘려보내기', cat: '움직임' },
    { id: 'newroad',   icon: 'move', text: '평소 안 가던 길로 딱 한 블록 걸어보기', cat: '움직임' },
    { id: 'neckroll',  icon: 'move', text: '목을 천천히 크게 3바퀴 돌려주기', cat: '움직임' },
    // 확장 — 즐거움
    { id: 'oldpic',    icon: 'joy', text: '사진첩에서 좋았던 순간 하나 1분 구경하기', cat: '즐거움' },
    { id: 'funny',     icon: 'joy', text: '웃긴 영상 하나 보고 소리 내서 웃어보기', cat: '즐거움' },
    { id: 'doodle',    icon: 'joy', text: '아무 종이에 1분 낙서하기. 잘 그릴 필요 없어', cat: '즐거움' },
    { id: 'scent',     icon: 'joy', text: '좋아하는 향(커피, 비누, 향수) 한 번 깊게 맡기', cat: '즐거움' },
    { id: 'skywatch',  icon: 'joy', text: '노을이나 밤하늘을 잠깐 올려다보기', cat: '즐거움' },
    { id: 'hum',       icon: 'joy', text: '아는 노래 한 소절 흥얼거려보기', cat: '즐거움' },
    // 확장 — 연결
    { id: 'family',    icon: 'link', text: '가족(또는 가까운 사람)에게 오늘 있었던 일 하나 말해보기', cat: '연결' },
    { id: 'petpat',    icon: 'link', text: '반려동물이나 인형을 1분 쓰다듬어주기', cat: '연결' },
    { id: 'oldfriend', icon: 'link', text: '연락 뜸했던 친구에게 이모티콘 하나라도 보내보기', cat: '연결' },
    { id: 'kindact',   icon: 'link', text: '작은 친절 하나 베풀기 (문 잡아주기도 충분해)', cat: '연결' },
    { id: 'hugself',   icon: 'link', text: '팔을 교차해 나를 10초 안아주기 (나비 포옹)', cat: '연결' },
    // 확장 — 돌봄
    { id: 'nails',     icon: 'care', text: '손톱 정리하기. 나를 돌보는 작은 의식', cat: '돌봄' },
    { id: 'socks',     icon: 'care', text: '포근한 양말 신고 발을 따뜻하게 해주기', cat: '돌봄' },
    { id: 'trash3',    icon: 'care', text: '눈에 보이는 쓰레기 딱 3개만 버리기', cat: '돌봄' },
    { id: 'lotion',    icon: 'care', text: '핸드크림 바르면서 손 꾹꾹 마사지하기', cat: '돌봄' },
    { id: 'airout',    icon: 'care', text: '창문 활짝 열고 방 공기 1분 갈아주기', cat: '돌봄' },
    // 확장 — 마음
    { id: 'sound3',    icon: 'mind', text: '지금 들리는 소리 3가지 찾아보기 (지금 여기로)', cat: '마음' },
    { id: 'shoulder',  icon: 'mind', text: '어깨에 들어간 힘, 후— 하고 한 번에 빼보기', cat: '마음' },
    { id: 'futureme',  icon: 'mind', text: '내일의 나에게 응원 한 줄 남겨보기 (메모장 OK)', cat: '마음' },
    { id: 'nofeed',    icon: 'mind', text: '뉴스·SNS 피드를 30분만 멀리하기', cat: '마음' },
    { id: 'onething',  icon: 'mind', text: '미뤄둔 일 중 제일 작은 것 하나만 5분 해보기', cat: '마음' }
  ],

  _today() {
    return new Date().toLocaleDateString('sv-CA');
  },

  state() {
    const s = window.Storage._safeGet('cbt_daily_mission', null);
    return (s && s.date === this._today()) ? s : null;
  },

  // ==========================================================================
  //  사용자 맞춤 선택
  //  ① 온보딩 고민 → 카테고리 가중치 (우울→움직임·즐거움 / 대인관계→연결 …)
  //  ② 최근 3일 기분 → 가라앉았으면 아주 작은(light) 미션 우선
  //  ③ AI가 장기기억을 읽고 그 사람만의 미션을 생성 (실패 시 ①②로 폴백)
  // ==========================================================================
  CONCERN_CATS: {
    dep: ['움직임', '즐거움'],      // 우울·무기력 → 행동활성화의 정석
    anx: ['마음'],                  // 불안 → 호흡·현재에 닻내리기
    stress: ['즐거움', '돌봄'],
    rel: ['연결'],
    self: ['연결', '마음'],         // 자존감 → 자기칭찬·인정
    sleep: ['돌봄'],
    vent: ['마음', '즐거움'],
    talk: []
  },
  // 기분이 많이 가라앉은 날엔 문턱이 낮은 미션부터
  LIGHT: ['water', 'bed', 'breath3', 'window', 'tea', 'stretch', 'praise', 'sunlight'],

  _recentMoodAvg() {
    const from = Date.now() - 3 * 86400000;
    const log = (window.Storage._safeGet('cbt_mood_log', []) || []).filter(m => m.ts >= from);
    return log.length ? log.reduce((s, m) => s + (m.v || 3), 0) / log.length : null;
  },

  _pickWeighted() {
    const recent = (window.Storage._safeGet('cbt_mission_log', []) || []).slice(0, 7).map(m => m.id);
    const pool = this.POOL.filter(m => !recent.includes(m.id));
    const cand = pool.length ? pool : this.POOL;
    const concerns = window.Storage._safeGet('cbt_user_concerns', []) || [];
    const likedCats = new Set(concerns.flatMap(c => this.CONCERN_CATS[c] || []));
    const avg = this._recentMoodAvg();
    const weights = cand.map(m => {
      let w = 1;
      if (likedCats.has(m.cat)) w += 2;                       // 고민에 맞는 카테고리
      if (avg != null && avg < 2.6 && this.LIGHT.includes(m.id)) w += 2; // 가라앉은 날 → 아주 작은 것
      if (avg != null && avg >= 3.6 && (m.cat === '움직임' || m.cat === '연결')) w += 1; // 컨디션 좋은 날 → 활동적
      return w;
    });
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cand.length; i++) { roll -= weights[i]; if (roll <= 0) return cand[i]; }
    return cand[cand.length - 1];
  },

  // AI 맞춤 미션: 장기기억·고민·기분을 읽고 '그 사람의 오늘'에 맞는 제안 생성
  async _personalizeWithAI() {
    try {
      if (!window.LLM) return;
      const memory = (window.Storage.getUserMemory() || '').slice(0, 1500);
      if (!memory) return; // 아직 아는 게 없으면 풀 미션으로 충분
      const s = this.state();
      if (!s || s.done || s.rerolled || s.custom) return;
      const concerns = (window.Storage._safeGet('cbt_user_concerns', []) || []).join(', ');
      const avg = this._recentMoodAvg();
      const res = await window.LLM._chatCompletion({
        model: window.LLM.MODEL_LIGHT || window.LLM.MODEL,
        messages: [{ role: 'user', content: `당신은 상담사 '우렁이'입니다. 이 사람을 위한 '오늘의 아주 작은 행동 미션' 1개를 만드세요.
[장기기억]\n${memory}\n[온보딩 고민] ${concerns || '(없음)'}\n[최근 3일 기분 평균] ${avg ? avg.toFixed(1) + '/5' : '기록 없음'}

규칙:
- 이 사람의 실제 이야기(반려동물, 취미, 최근 고민 등)와 이어지면 최고. 기억에 없으면 일반 미션.
- 10분 안에 끝나는 아주 작은 행동. 기분이 낮으면(3 미만) 더 작게.
- 부담·죄책감 주는 표현 금지, 다정한 제안 톤, 15~45자.
- JSON만 출력: {"emoji":"이모지1개","text":"미션 문장"}` }],
        temperature: 0.8,
        max_tokens: 100
      });
      if (!res.ok) return;
      const data = await res.json();
      const raw = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return;
      const obj = JSON.parse(m[0]);
      if (!obj.text || obj.text.length < 5) return;
      const cur = this.state();
      if (!cur || cur.done || cur.rerolled) return; // 그 사이 완료·교체했으면 유지
      cur.custom = { emoji: (obj.emoji || '🌱').slice(0, 4), text: String(obj.text).slice(0, 60) };
      window.Storage._safeSet('cbt_daily_mission', cur);
      this.renderCard();
    } catch (e) {}
  },

  // 오늘의 미션.
  //  전에는 무조건 랜덤 풀에서 뽑았다. 그래서 상담사가 낸 숙제나 케어플랜 할 일이
  //  있는 날에도 헤드라인은 '화분에 물 주기' 같은 게 차지하고, 정작 중요한 건
  //  아래로 밀렸다. 순서를 뒤집는다 — 사람이 낸 숙제 > 리포트 처방 > 랜덤.
  _headlineRx() {
    try {
      const rx = this.rxToday() || [];
      return rx.find(q => q.src === 'hw') || rx.find(q => q.src === 'plan') || null;
    } catch (e) { return null; }
  },

  todayMission() {
    let s = this.state();
    if (!s) {
      const rx = this._headlineRx();
      if (rx) {
        // 오늘의 헤드라인을 숙제·처방으로. 완료하면 그 항목도 같이 체크된다.
        s = { date: this._today(), id: 'rx_' + Date.now().toString(36), done: false, rerolled: false,
              custom: { icon: rx.src === 'hw' ? 'counselor' : 'target', text: rx.text },
              rx: { src: rx.src, why: rx.why || '', hwId: rx.hwId || '', text: rx.text } };
      } else {
        const pick = this._pickWeighted();
        s = { date: this._today(), id: pick.id, done: false, rerolled: false };
        setTimeout(() => this._personalizeWithAI(), 800); // 우렁이가 더 좋은 미션을 떠올리면 교체
      }
      window.Storage._safeSet('cbt_daily_mission', s);
    }
    if (s.custom) {
      return {
        id: s.id, icon: s.custom.icon, emoji: s.custom.emoji, text: s.custom.text,
        cat: s.rx ? (s.rx.src === 'hw' ? '상담사 숙제' : '나의 케어플랜') : '우렁이 맞춤',
        why: s.rx ? s.rx.why : '', custom: true, done: s.done, rerolled: s.rerolled
      };
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
    log.unshift({ id: s.id, ts: Date.now(), done: true, text: s.custom ? s.custom.text : undefined });
    window.Storage._safeSet('cbt_mission_log', log.slice(0, 200));
    window.Storage.markDayActive();
    this.renderCard();
    if (window.App && window.App.showRecordToast) {
      const cheers = ['우와, 해냈다! 🎉', '역시 당신이야!', '몸이 움직이면 마음이 따라와요', '오늘의 작은 승리 +1'];
      window.App.showRecordToast(`${cheers[Math.floor(Math.random() * cheers.length)]}`);
    }
    if (window.App && window.App.stickerPop) {
      const pops = ['hero', 'party', 'proud', 'ok', 'dance'];
      window.App.stickerPop(pops[Math.floor(Math.random() * pops.length)], 1500);
    }
    if (window.App && window.App.playNotify) window.App.playNotify();
    if (window.Growth) window.Growth.checkAwards();
    if (window.Farm) window.Farm.addWater(3, '오늘의 미션 완료');
  },

  // 완료 후 보너스 퀘스트 (하루 3개까지)
  more() {
    const s = this.state();
    if (!s || !s.done || (s.bonus || 0) >= 3) return;
    const seen = window.Storage._safeGet('cbt_mission_seen_' + this._today(), []) || [];
    const pool = this.POOL.filter(mm => !seen.includes(mm.id) && mm.id !== s.id);
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : this.POOL[Math.floor(Math.random() * this.POOL.length)];
    seen.push(pick.id);
    window.Storage._safeSet('cbt_mission_seen_' + this._today(), seen);
    window.Storage._safeSet('cbt_daily_mission', { date: this._today(), id: pick.id, done: false, rerolled: false, bonus: (s.bonus || 0) + 1 });
    if (window.Sfx) window.Sfx.hit('ripe');
    if (window.App) window.App.showRecordToast('새 퀘스트가 도착했어요!');
    this.renderCard();
  },

  // 우렁이 맞춤 숙제 — 최근 대화·장기기억을 읽고 이 사람에게 진짜 필요한 행동 하나
  async aiQuest() {
    const s = this.state();
    if (s && s.done && (s.bonus || 0) >= 3) { if (window.App) window.App.showRecordToast('오늘 퀘스트는 여기까지! 내일 또 받아요'); return; }
    if (!window.LLM) return;
    if (window.App) window.App.showRecordToast('우렁이가 딱 맞는 숙제를 고르는 중…');
    try {
      const memory = (window.Storage.getUserMemory && window.Storage.getUserMemory()) || '';
      const recent = (window.Storage.getMessages() || []).slice(-16).map(x => `${x.role === 'user' ? '내담자' : '상담사'}: ${x.text}`).join('\n');
      const res = await window.LLM._chatCompletion({
        model: window.LLM.MEMORY_MODEL,
        messages: [{ role: 'user', content: `아래는 심리상담 앱 사용자의 기록입니다. 이 사람의 최근 고민에 직접 연결되는 '오늘 실행 가능한 행동 숙제' 하나를 처방하세요.

규칙:
- 최근 대화의 실제 주제와 연결될 것 (행동활성화·노출·경계설정·관계 연습 등 치료적 근거 있게)
- 오늘 안에 30분 이내로 끝나는 구체적 행동. 측정 가능하게 ("~에게 ~라고 말해보기", "~를 10분 하기")
- 생각 숙제 말고 행동 숙제. 위험하거나 부담 큰 것 금지
- 출력은 JSON 한 줄만: {"emoji": "이모지1개", "text": "숙제 문장 (40자 이내)"}

[장기기억]
${memory.slice(0, 800)}

[최근 대화]
${recent}` }],
        temperature: 0.7,
        max_tokens: 120
      });
      if (!res.ok) throw new Error('api');
      const data = await res.json();
      let t = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
      const m1 = t.indexOf('{'), m2 = t.lastIndexOf('}');
      const j = JSON.parse(t.slice(m1, m2 + 1));
      if (!j.text) throw new Error('empty');
      const prev = this.state() || { date: this._today(), bonus: 0 };
      window.Storage._safeSet('cbt_daily_mission', {
        date: this._today(), id: 'ai_' + Date.now(), done: false, rerolled: false,
        bonus: prev.done ? (prev.bonus || 0) + 1 : (prev.bonus || 0),
        custom: { emoji: j.emoji || '🐌', text: j.text }
      });
      if (window.Sfx) window.Sfx.hit('ripe');
      if (window.App) { window.App.showRecordToast('우렁이의 맞춤 숙제가 도착했어요!'); window.App.stickerPop('teacher', 1500); }
      this.renderCard();
    } catch (e) {
      if (window.App) window.App.showRecordToast('숙제를 가져오지 못했어요 — 잠시 후 다시 시도해주세요');
    }
  },

  // 완료 전엔 몇 번이든 다른 미션으로 교체 — 그날 이미 본 미션은 다시 안 나온다
  reroll() {
    const s = this.state();
    if (!s || s.done) return;
    s.seen = Array.isArray(s.seen) ? s.seen : [s.id];
    let pool = this.POOL.filter(m => !s.seen.includes(m.id));
    if (!pool.length) { s.seen = [s.id]; pool = this.POOL.filter(m => m.id !== s.id); } // 다 봤으면 한 바퀴 리셋
    const pick = pool[Math.floor(Math.random() * pool.length)];
    s.id = pick.id;
    s.seen.push(pick.id);
    s.rerolled = true; // AI 맞춤 미션이 뒤늦게 덮어쓰지 않게 하는 플래그
    delete s.custom;
    window.Storage._safeSet('cbt_daily_mission', s);
    this.renderCard();
  },

  // 카테고리별 손그림 아이콘 (이모지 대신 톤 통일)
  CAT_ICO: { '움직임': 'move', '마음': 'mind', '돌봄': 'care', '연결': 'link', '즐거움': 'joy', '우렁이 맞춤': 'sprout' },

  catIcon(cat, size) {
    const n = this.CAT_ICO[cat] || 'quest';
    return window.Icons ? window.Icons.svg(n, { size: size || 22 }) : '';
  },

  // --------------------------------------------------------------------------
  //  처방 미션 — 무작위로 뽑은 오늘의 미션과 별개로,
  //   ① AI 리포트가 세운 2주 계획에서 나온 것
  //   ② 본인이 "고치고 싶다"고 직접 적어둔 것
  //  두 갈래를 보여준다. 왜 이 미션인지 근거를 반드시 함께 적는다 —
  //  이유를 모르는 숙제는 며칠 못 간다.
  // --------------------------------------------------------------------------
  rxLog() { return window.Storage._safeGet('cbt_rx_mission_log', {}) || {}; },

  rxKey(text) { return this._today() + '|' + String(text).slice(0, 24); },

  rxDone(text) { return !!this.rxLog()[this.rxKey(text)]; },

  rxToggle(text, src) {
    const log = this.rxLog();
    const k = this.rxKey(text);
    if (log[k]) {
      delete log[k];
      if (window.Sfx) window.Sfx.play('close');
    } else {
      log[k] = Date.now();
      if (window.Sfx) window.Sfx.hit('save');
      if (window.Farm && window.Farm.addWater) window.Farm.addWater(2, '처방 미션 완료');
      if (window.Storage.markDayActive) window.Storage.markDayActive();
      // 전후 기분은 '기법을 실천했을 때' 만 의미가 있다.
      //  케어플랜에서 나온 미션은 특정 개입의 효과를 재는 것이지만,
      //  본인이 적어둔 개선 목표나 상담사 숙제는 습관·과제라
      //  같은 축으로 재면 '나에게 잘 듣는 방법' 집계가 오염된다.
      if (src === 'plan' && window.Progress) {
        const wk = (window.CarePlan && window.CarePlan.currentWeek) ? window.CarePlan.currentWeek() : null;
        const tech = wk && wk.technique ? wk.technique : '';
        setTimeout(() => window.Progress.askAfter(text, tech, null), 260);
      }
    }
    window.Storage._safeSet('cbt_rx_mission_log', log);
    this.renderCard();
  },

  // 오늘 보여줄 처방 미션 목록
  rxToday() {
    const out = [];
    // 케어플랜 카드에 이미 떠 있는 할 일은 여기서 또 보여주지 않는다.
    //  (할 일이 비면 weekActions 가 quests 를 끌어다 쓰기 때문에 그대로 두면 겹친다)
    let planActs = [];
    try {
      if (window.CarePlan && window.CarePlan.active()) {
        planActs = window.CarePlan.weekActions(window.CarePlan.currentWeek()) || [];
      }
    } catch (e) {}
    // 사람 상담사가 낸 숙제가 가장 앞. AI 제안보다 우선한다.
    if (window.Homework && window.Homework.questSeeds) {
      window.Homework.questSeeds().forEach(q => out.push({ ...q, src: 'hw' }));
    }
    if (window.CarePlan && window.CarePlan.questsFor) {
      window.CarePlan.questsFor(this._today(), 2)
        .filter(q => planActs.indexOf(q.text) < 0)
        .forEach(q => out.push({ ...q, src: 'plan' }));
    }
    if (window.Goals && window.Goals.questSeeds) {
      window.Goals.questSeeds().slice(0, 1).forEach(q => out.push({ ...q, src: 'goal' }));
    }
    return out;
  },

  rxHtml() {
    const rows = this.rxToday();
    if (!rows.length) return '';
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const name = (window.Storage._safeGet('cbt_user_name', '') || '').trim();
    const title = name ? esc(name) + '님을 위한 미션' : '나를 위한 미션';
    return `
      <div style="margin-top: 0.8rem; padding-top: 0.75rem; border-top: 1px dashed var(--glass-border);">
        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem 0.35rem; margin-bottom: 0.45rem;">
          <span style="line-height: 0; color: var(--accent-primary);">${window.Icons ? window.Icons.svg('target', { size: 15 }) : ''}</span>
          <strong style="font-size: 0.78rem; color: var(--text-primary); flex-shrink: 0;">${title}</strong>
          <span style="margin-left: auto; font-size: 0.64rem; color: var(--text-muted); flex: 0 1 auto; min-width: 0;">무작위가 아니라 내 기록에서 나온 것</span>
        </div>
        ${rows.map(r => {
          const done = this.rxDone(r.text);
          return `
          <button onclick="window.Missions.rxToggle('${String(r.text).replace(/'/g, "\\'")}', '${r.src}')"
            style="all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 0.5rem; width: 100%; cursor: pointer;
                   padding: 0.5rem 0.6rem; border-radius: 11px; margin-bottom: 0.3rem;
                   background: ${done ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'var(--bg-tertiary)'};
                   border: 1px solid ${done ? 'color-mix(in srgb, var(--accent-primary) 34%, transparent)' : 'var(--glass-border)'};">
            <span style="flex-shrink: 0; width: 16px; height: 16px; margin-top: 2px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center;
                         background: ${done ? 'var(--accent-primary)' : 'transparent'}; border: 1.5px solid ${done ? 'var(--accent-primary)' : 'var(--text-muted)'};">
              ${done ? '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>' : ''}
            </span>
            <span style="flex: 1 1 0%; min-width: 0;">
              <span style="display: block; font-size: 0.82rem; line-height: 1.5; font-weight: 700;
                           color: ${done ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${done ? 'line-through' : 'none'};">${esc(r.text)}</span>
              ${r.why ? `<span style="display: block; margin-top: 0.12rem; font-size: 0.68rem; line-height: 1.5; color: var(--text-muted);">${r.src === 'hw' ? '상담사 숙제' : r.src === 'goal' ? '내가 적어둔 것' : '리포트 근거'} · ${esc(r.why)}</span>` : ''}
            </span>
            <span style="flex-shrink: 0; align-self: center; font-size: 0.68rem; font-weight: 800; white-space: nowrap;
                         display: inline-flex; align-items: center; gap: 0.1rem;
                         color: ${done ? 'var(--text-muted)' : '#6f97ab'};">
              ${done ? '✓' : '+2' + (window.Icons ? window.Icons.svg('water', { size: 12 }) : '')}
            </span>
          </button>`;
        }).join('')}
      </div>`;
  },

  renderCard() {
    // 홈 카드와 대시보드(우렁이 세계) 퀘스트 칸 양쪽에 같은 내용을 그린다
    const targets = [...document.querySelectorAll('[data-mission-card]')];
    if (!targets.length) return;
    const el = { set innerHTML(v) { targets.forEach(t => { t.innerHTML = v; }); } };
    const m = this.todayMission();
    const total = this.doneCount();
    if (m.done) {
      const s = this.state() || {};
      const bonus = s.bonus || 0;
      el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.8rem;">
          <span style="line-height: 0; flex-shrink: 0;">${window.Stickers ? window.Stickers.svg('proud', 62) : '🎉'}</span>
          <div style="flex: 1; min-width: 0;">
            <strong style="font-size: 0.92rem; color: var(--accent-primary); display: block;">퀘스트 완료!</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">${m.text}</span>
            <span style="display: block; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">지금까지 ${total}개의 작은 승리를 모았어요</span>
          </div>
        </div>
        <div style="display: flex; gap: 0.45rem; margin-top: 0.6rem;">
          ${bonus < 3
            ? `<button class="btn-secondary" style="flex: 1; font-size: 0.78rem; padding: 0.5rem;" onclick="window.Missions.more()">퀘스트 더 받기 (${bonus}/3)</button>`
            : `<span style="flex: 1; text-align: center; font-size: 0.72rem; color: var(--text-muted); padding: 0.5rem 0;">오늘의 보너스 퀘스트를 다 했어요! 내일 또 만나요</span>`}
          <button class="btn-secondary" style="flex: 1; font-size: 0.78rem; padding: 0.5rem;" onclick="window.Missions.aiQuest()" title="최근 대화를 바탕으로 우렁이가 숙제를 내줘요">맞춤 숙제 받기</button>
        </div>${this.rxHtml()}`;
    } else {
      el.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 0.7rem; margin-bottom: 0.75rem;">
          <span style="flex-shrink: 0; width: 40px; height: 40px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-tertiary)); border: 1px solid var(--glass-border); line-height: 0;">${this.catIcon(m.cat, 22)}</span>
          <div style="flex: 1 1 0%; min-width: 0; padding-top: 0.1rem;">
            <span style="display: inline-block; font-size: 0.66rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); padding: 0.1rem 0.5rem; border-radius: 999px;">${m.cat}</span>
            <p style="margin: 0.3rem 0 0; font-size: 0.92rem; font-weight: 600; color: var(--text-primary); line-height: 1.5;">${m.text}</p>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-primary" style="flex: 1; font-size: 0.85rem; padding: 0.6rem;" onclick="window.Missions.complete()">했어요!</button>
          <button class="btn-secondary" style="width: auto; font-size: 0.78rem; padding: 0.6rem 0.8rem;" onclick="window.Missions.reroll()" title="마음에 드는 미션이 나올 때까지 바꿔보세요">다른 거</button>
        </div>${this.rxHtml()}`;
    }
  }
};
