// ============================================================================
//  주간 회고 리포트 — 일요일 밤, 우렁이가 한 주를 돌아보는 편지를 쓴다.
//  기분 체크인·하루정리·사고기록을 집계해 AI가 따뜻한 편지 형태로 정리.
//  오프라인/AI 실패 시에도 통계 기반 기본 편지를 만들어준다.
// ============================================================================
window.Weekly = {
  // 이번 주의 키: 그 주 월요일 날짜 (sv-CA = YYYY-MM-DD)
  weekKey(d) {
    const dt = new Date(d || Date.now());
    const day = (dt.getDay() + 6) % 7; // 월=0 … 일=6
    dt.setDate(dt.getDate() - day);
    return dt.toLocaleDateString('sv-CA');
  },

  letters() {
    return window.Storage._safeGet('cbt_weekly_letters', []) || [];
  },

  // 다음 주 월요일 0시까지 남은 시간 (주 1회 제한 안내용)
  nextLetterAt() {
    const dt = new Date();
    const day = (dt.getDay() + 6) % 7;
    dt.setDate(dt.getDate() - day + 7);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  },

  waitText() {
    const ms = this.nextLetterAt() - Date.now();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    return d > 0 ? d + '일 ' + h + '시간 뒤' : h + '시간 뒤';
  },

  hasThisWeek() {
    const key = this.weekKey();
    return this.letters().some(l => l.weekKey === key);
  },

  // 최근 7일 데이터 집계
  _collect() {
    const now = Date.now();
    const from = now - 7 * 86400000;
    const moods = (window.Storage._safeGet('cbt_mood_log', []) || []).filter(m => m.ts >= from);
    const nights = (window.Storage._safeGet('cbt_night_journal', []) || []).filter(j => j.ts >= from);
    const records = (window.Storage.getThoughtRecords() || []).filter(r => new Date(r.date).getTime() >= from);
    const missions = (window.Storage._safeGet('cbt_mission_log', []) || []).filter(m => m.ts >= from && m.done);

    const avg = moods.length ? (moods.reduce((s, m) => s + (m.v || 3), 0) / moods.length) : null;
    // 요일별 평균 (감정 흐름 문장용)
    const byDay = {};
    moods.forEach(m => {
      const k = new Date(m.ts).toLocaleDateString('ko-KR', { weekday: 'short' });
      (byDay[k] = byDay[k] || []).push(m.v || 3);
    });
    const emoCount = {};
    moods.forEach(m => { if (m.emo) emoCount[m.emo] = (emoCount[m.emo] || 0) + 1; });
    const topEmo = Object.entries(emoCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, c]) => `${e}(${c}회)`);

    return { moods, nights, records, missions, avg, byDay, topEmo };
  },

  _fallbackLetter(s) {
    const moodLine = s.avg == null
      ? '이번 주는 기분 기록이 많지 않았어요. 기록이 없어도 당신의 한 주가 잘 흘러갔기를 바라요.'
      : (s.avg >= 3.5
        ? `이번 주 마음의 평균 온도는 꽤 따뜻했어요 (${s.avg.toFixed(1)}/5). 이 흐름, 우렁이가 다 봤어요.`
        : `이번 주는 마음이 조금 무거운 날이 많았어요 (${s.avg.toFixed(1)}/5). 그 와중에도 ${s.moods.length}번이나 마음을 들여다봤다는 게 대단해요.`);
    return `한 주 동안 수고 많았어요.\n\n${moodLine}\n` +
      (s.topEmo.length ? `자주 만난 감정은 ${s.topEmo.join(', ')} 이었네요.\n` : '') +
      (s.nights.length ? `하루 정리를 ${s.nights.length}번 함께했고, ` : '') +
      (s.records.length ? `사고 기록을 ${s.records.length}개 남겼어요.\n` : '\n') +
`\n다음 주의 당신에게도 우렁이가 꼭 붙어있을게요.`;
  },

  async generate(force) {
    const key = this.weekKey();
    if (!force && this.hasThisWeek()) return this.letters().find(l => l.weekKey === key);

    const s = this._collect();
    let text = this._fallbackLetter(s);

    try {
      if (window.LLM && (s.moods.length || s.nights.length || s.records.length)) {
        const nightLines = s.nights.slice(0, 7).map(j =>
          `- ${new Date(j.ts).toLocaleDateString('ko-KR', { weekday: 'short' })}: 기분 ${j.mood ? j.mood.emo : '미기록'}${j.moment ? ` / 남은 순간: ${j.moment}` : ''}${j.note ? ` / 스스로에게: ${j.note}` : ''}`).join('\n');
        const recordLines = s.records.slice(0, 5).map(r => `- ${r.thought || ''} → ${r.alternative || '(대안 미작성)'}`).join('\n');
        const res = await window.LLM._chatCompletion({
          model: window.LLM.MODEL_LIGHT || window.LLM.MODEL,
          messages: [{ role: 'user', content: `당신은 '우렁이'입니다. 하찮고 뚱뚱하고 마음은 대왕인 달팽이 상담사예요. 한 주를 마친 사용자에게 편지를 씁니다.

[이번 주 데이터]
기분 체크인 ${s.moods.length}회, 평균 ${s.avg ? s.avg.toFixed(1) : '기록 없음'}/5
자주 나온 감정: ${s.topEmo.join(', ') || '기록 없음'}
하루 정리:
${nightLines || '(없음)'}
사고 기록(생각→대안):
${recordLines || '(없음)'}
완료한 행동 미션: ${s.missions.length}개
[장기기억 발췌]
${(window.Storage.getUserMemory() || '').slice(0, 1500) || '(없음)'}

[우렁이 말투 — 이게 이 편지의 핵심입니다]
· 우렁이는 특유의 울음소리를 냅니다: 우렁우렁, 우로로록, 호고고곡, 우덩우덩, 뿌롱, 꾸물꾸물, 오도도독, 슈르릉, 웅기중기.
  편지에 2~3번만 섞으세요. 매 문장마다 넣으면 정신 사납습니다.
· 자기 얘기를 자꾸 합니다. 느리고, 뚱뚱하고, 껍데기가 무겁고, 상추를 좋아하고, 소금은 무서워하고, 계단을 싫어합니다.
  이 설정으로 자학 개그를 치세요. 예: "나는 이번 주에 3cm 갔어. 너는 훨씬 멀리 갔더라."
· 위트가 반드시 있어야 합니다. 한 번은 피식 웃겨야 해요. 다만 힘들었던 이야기를 농담으로 뭉개지는 마세요 —
  아픈 부분에서는 잠깐 진지해졌다가, 마지막에 다시 능청스럽게 돌아오세요.
· 반말입니다. 친구가 쓴 편지처럼. "~했더라", "~하자", "~였잖아".
· 이모지는 편지 전체에 2개 이하.

편지 규칙:
- 첫 줄은 우렁이답게 툭 던지며 시작 (예: "우로로록. 한 주 살아남은 거 축하해.")
- 실제 데이터 속 구체적인 순간을 한두 개 짚어주기 (절대 지어내지 말 것)
- 힘들었던 날은 진지하게 수고를 알아주고, 좋았던 순간은 호들갑스럽게 같이 기뻐하기
- 다음 주를 위한 아주 작은 제안 하나 — 우렁이답게 게으르고 만만한 걸로
- 전체 6~9문장, 마지막에"— 느리지만 계속 가고 있는, 우렁이"서명
- 편지 본문만 출력

[결 참고용 예시 — 그대로 베끼지 말고 리듬만]
"우로로록. 이번 주 너 체크인 5번 했더라. / 수요일에 '아무것도 하기 싫다'고 해놓고 결국 산책 나간 거, 나 봤다. / 그거 진짜 대단한 거야. 나는 그런 날엔 껍데기 안에서 안 나와. / 목요일은 좀 무거웠지. 그날은 농담 안 할게. / 다음 주엔 딱 하나만 하자 — 물 한 잔. 그것도 벅차면 반 잔. / 나는 이번 주에 3cm 이동했어. 우덩우덩."` }],
          temperature: 0.8,
          max_tokens: 500
        });
        if (res.ok) {
          const data = await res.json();
          const t = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
          if (t) text = t;
        }
      }
    } catch (e) {}

    const letter = {
      id: 'wl_' + Date.now(),
      weekKey: key,
      ts: Date.now(),
      text,
      stats: { moods: s.moods.length, avg: s.avg, nights: s.nights.length, records: s.records.length, missions: s.missions.length }
    };
    const list = this.letters().filter(l => l.weekKey !== key);
    list.unshift(letter);
    window.Storage._safeSet('cbt_weekly_letters', list.slice(0, 12));
    return letter;
  },

  // 일요일 18시 ~ 월요일 정오: 이번 주 편지를 '자동으로' 써서 배달한다
  async autoDeliver() {
    const d = new Date();
    const isWindow = (d.getDay() === 0 && d.getHours() >= 18) || (d.getDay() === 1 && d.getHours() < 12);
    if (!isWindow || this.hasThisWeek()) return;
    if (window.Storage._safeGet('cbt_weekly_nudged', '') === this.weekKey()) return;
    window.Storage._safeSet('cbt_weekly_nudged', this.weekKey()); // 단일 실행 가드
    await this.generate();
    this.renderCard();
    if (window.App) {
      if (window.App._notifOn && window.App._notifOn('letter')) {
 if (window.App.notify) window.App.notify('우렁이의 주간 편지','이번 주를 돌아본 편지가 도착했어요');
        if (window.App.playWoorung) window.App.playWoorung();
      }
      if (window.App.showRecordToast) window.App.showRecordToast('주간 편지가 도착했어요 (대시보드)');
      if (window.App._setNavBadge) window.App._setNavBadge('dashboard', true);
    }
  },

  // 하위 호환 별칭
  maybeNudge() { return this.autoDeliver(); },

  // 편지는 한 주에 딱 한 통 — 다시 쓰기 없음 (기다림이 편지의 값어치다)
  async requestLetter() {
    if (this.hasThisWeek()) {
      if (window.Sfx) window.Sfx.play('denied');
      window.UI.alert(`이번 주 편지는 이미 도착했어요.\n\n우렁이는 한 주에 딱 한 통만 씁니다 — 느리게 쓰는 게 우렁이 방식이라서요.\n다음 편지는 ${this.waitText()} 만나요.`);
      return;
    }
    const btn = document.getElementById('weekly-generate');
 if (btn) { btn.disabled = true; btn.textContent ='우렁이가 편지 쓰는 중…'; }
    await this.generate(false);
    this.renderCard();
  },

  // 편지를 예쁜 이미지 카드로 — 저장하거나 친구에게 공유 (은은한 입소문 루프)
  async shareCard(letterId) {
    const l = this.letters().find(x => x.id === letterId) || this.letters()[0];
    if (!l) return;
    const W = 720, PAD = 64, LH = 46;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    // 본문 줄바꿈 계산
    ctx.font = '26px "Noto Sans KR", sans-serif';
    const lines = [];
    l.text.split('\n').forEach(par => {
      if (!par.trim()) { lines.push(''); return; }
      let cur = '';
      for (const ch of par) {
        if (ctx.measureText(cur + ch).width > W - PAD * 2) { lines.push(cur); cur = ch; }
        else cur += ch;
      }
      if (cur) lines.push(cur);
    });
    const H = 300 + lines.length * LH + 140;
    cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    // 배경: 크림 + 상단 세이지 그라데이션 띠
    c2.fillStyle = '#faf5ee'; c2.fillRect(0, 0, W, H);
    const grad = c2.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#4f8a6b'); grad.addColorStop(1, '#86cba8');
    c2.fillStyle = grad; c2.fillRect(0, 0, W, 14);
    // 제목·날짜
    c2.fillStyle = '#362f28';
    c2.font = 'bold 40px "Gowun Batang", serif';
 c2.fillText('우렁이의 주간 편지', PAD, 110);
    c2.fillStyle = '#7f7264';
    c2.font = '24px "Noto Sans KR", sans-serif';
    c2.fillText(new Date(l.ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }), PAD, 156);
    c2.strokeStyle = 'rgba(120,96,66,0.18)'; c2.beginPath(); c2.moveTo(PAD, 190); c2.lineTo(W - PAD, 190); c2.stroke();
    // 본문
    c2.fillStyle = '#4a4239';
    c2.font = '26px "Noto Sans KR", sans-serif';
    lines.forEach((ln, i) => c2.fillText(ln, PAD, 250 + i * LH));
    // 푸터
    c2.fillStyle = '#4f8a6b';
    c2.font = 'bold 26px "Noto Sans KR", sans-serif';
 c2.fillText('우렁의사 — 당신을 기억하는 AI 마음 주치의', PAD, H - 60);

    cv.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], '우렁이_주간편지.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '우렁이의 주간 편지' }).catch(() => {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '우렁이_주간편지.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        if (window.App) window.App.showRecordToast('편지 카드를 저장했어요');
      }
    }, 'image/png');
  },

  renderCard() {
    const el = document.getElementById('weekly-letter-body');
    if (!el) return;
    const list = this.letters();
    const latest = list[0];
    const thisWeek = this.hasThisWeek();

    const letterHtml = (l, open) => `
      <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 14px; padding: 1rem 1.1rem; ${open ? '' : 'cursor: pointer;'}" ${open ? '' : `onclick="this.querySelector('.wl-body').classList.toggle('hidden')"`}>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: ${open ? '0.6rem' : '0.3rem'};">
 <span style="font-size: 1.05rem;"></span>
          <strong style="font-size: 0.85rem; color: var(--text-primary);">${new Date(l.ts).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}의 편지</strong>
          <span style="flex: 1;"></span>
          <span style="font-size: 0.68rem; color: var(--text-muted);">체크인 ${l.stats.moods} · 하루정리 ${l.stats.nights} · 기록 ${l.stats.records}</span>
        </div>
        <p class="wl-body ${open ? '' : 'hidden'}" style="margin: 0; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.75; white-space: pre-line;">${l.text}</p>
      </div>`;

    el.innerHTML = `
      ${latest ? letterHtml(latest, true) : `
        <div style="text-align: center; padding: 0.4rem 0 0.6rem;">
 <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('think', 84) :''}</span>
          <p style="font-size: 0.83rem; color: var(--text-muted); margin: 0.5rem 0 0;">아직 받은 편지가 없어요.<br>일주일을 보내고 나면 우렁이가 편지를 써드려요.</p>
        </div>`}
      <div style="display: flex; gap: 0.5rem; margin-top: 0.8rem;">
        <button id="weekly-generate" class="btn-primary" style="flex: 1.4; font-size: 0.85rem; ${thisWeek ? 'opacity: 0.5; cursor: default;' : ''}" onclick="window.Weekly.requestLetter()">
 ${thisWeek ?'이번 주 편지 도착함':'이번 주 편지 받기'}
        </button>
 ${latest ?`<button class="btn-secondary"style="flex: 1; font-size: 0.85rem;"onclick="window.Weekly.shareCard('${latest.id}')"> 카드로 저장</button>`:''}
      </div>
      ${thisWeek ? `<p style="font-size: 0.72rem; color: var(--text-muted); margin: 0.5rem 0 0; text-align: center;">우렁이는 한 주에 한 통만 써요 · 다음 편지는 ${this.waitText()}</p>` : ''}
      ${list.length > 1 ? `
        <p style="font-size: 0.74rem; color: var(--text-muted); margin: 0.8rem 0 0.4rem; font-weight: 700;">지난 편지들</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">${list.slice(1).map(l => letterHtml(l, false)).join('')}</div>` : ''}
    `;
  }
};
