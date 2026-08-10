// ============================================================================
//  오늘의 우렁 카드 — 하루 한 장, 마음에 쥐여주는 문장
//  피드처럼 무한히 넘기게 하지 않는다. 딱 한 장이라서 읽고, 하루 종일 남는다.
//  문장은 CBT·ACT·자기자비의 언어를 우렁이 말투로 옮긴 자체 덱 30장.
//  날짜로 고르므로 모두가 같은 날 같은 카드를 받는다 (앱을 다시 켜도 안 바뀜).
// ============================================================================
window.Cards = {
  DECK: [
    '생각은 명령이 아니에요. 오늘은 한 번만, 생각과 나 사이에 반 발짝 거리를 둬봐요.',
    '감정은 파도예요. 정점을 찍으면 반드시 내려와요 — 그 90초를 같이 세어봐요.',
    '오늘 잘한 일이 없다고요? 살아낸 것 자체가 오늘의 일이에요.',
    '"항상"과 "절대"가 붙은 생각은 대개 과장이에요. 오늘 딱 하나만 예외를 찾아봐요.',
    '남에게 하지 않을 말을 나에게 하고 있진 않나요? 오늘은 친구에게 하듯 말해줘요.',
    '불안은 위험의 증거가 아니라, 소중한 게 있다는 증거일 때가 많아요.',
    '기분이 따라주지 않아도 발은 먼저 갈 수 있어요. 작게, 아주 작게 한 걸음.',
    '쉬는 것도 회복의 일부예요. 오늘의 휴식에 죄책감을 붙이지 마세요.',
    '완벽한 하루가 아니라, 견딜 만한 하루면 충분해요.',
    '어제의 나와 비교해요. 남과 비교하는 순간 시합은 끝나지 않아요.',
    '몸이 먼저예요 — 잠, 밥, 햇빛. 마음은 그 위에 세워져요.',
    '지금 이 감정에 이름을 붙여봐요. 이름이 붙는 순간 조금 작아져요.',
    '도움을 청하는 건 약해서가 아니라, 낫고 싶어서예요.',
    '오늘 하루 중 숨이 쉬어졌던 순간 하나만 기억해둬요. 그게 내일의 지도예요.',
    '남의 마음을 읽으려 애쓰지 마요. 물어보면 되는 걸, 혼자 결론 내리지 않기.',
    '실수한 나를 혼내는 시간과 고치는 시간은 달라요. 오늘은 고치는 쪽에 서요.',
    '"해야 한다"를 "하고 싶다/하기로 했다"로 바꿔 말해봐요. 무게가 달라져요.',
    '마음이 시끄러운 날엔 발바닥을 느껴봐요. 몸은 언제나 지금 여기에 있어요.',
    '괜찮은 척은 오늘 하루 쉬어도 돼요. 여기서는요.',
    '큰 결심보다 작은 반복이 사람을 바꿔요. 오늘의 1%면 충분해요.',
    '거절당한 것은 나의 전부가 아니라 그 하나의 요청이에요.',
    '오늘의 나에게 필요한 건 채찍이 아니라 물 한 잔일지도 몰라요.',
    '감정을 밀어내면 커지고, 자리를 내주면 지나가요.',
    '지난 일을 곱씹는 건 두 번 사는 게 아니라 두 번 아픈 거예요. 오늘로 돌아와요.',
    '나를 지키는 거절은 이기적인 게 아니에요. 관계를 오래 가게 하는 기술이에요.',
    '기분이 사실을 만들지 않아요. 최악의 기분에도 사실은 그대로예요.',
    '오늘 웃을 일이 없었다면, 우렁이가 한 번 웃겨드릴게요 — 채팅에 놀러 와요.',
    '회복은 직선이 아니에요. 오르락내리락하면서도 방향은 앞일 수 있어요.',
    '내가 어떻게 살고 싶은지는 기분이 아니라 가치가 알려줘요. 오늘의 방향 한 단어는?',
    '충분히 애쓰고 있어요. 그리고 동시에, 더 나아질 수 있어요. 둘 다 참이에요.'
  ],

  todayCard() {
    // 날짜 → 덱 인덱스. 연속된 날에 같은 카드가 안 나오게 소수 곱으로 섞는다.
    const d = new Date();
    const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    return { idx: (seed * 7) % this.DECK.length, text: this.DECK[(seed * 7) % this.DECK.length] };
  },

  _kept() { return window.Storage._safeGet('cbt_kept_cards', []) || []; },

  isKept(idx) { return this._kept().some(k => k.idx === idx); },

  keep(idx) {
    const list = this._kept();
    const i = list.findIndex(k => k.idx === idx);
    if (i >= 0) list.splice(i, 1);           // 다시 누르면 간직 해제
    else {
      list.push({ idx, text: this.DECK[idx], ts: Date.now() });
      if (window.Sfx) window.Sfx.play('pop');
      if (window.App) window.App.showRecordToast('이 문장을 간직했어요');
    }
    window.Storage._safeSet('cbt_kept_cards', list.slice(-100));
    this.render();
  },

  render() {
    const el = document.getElementById('daily-card');
    if (!el) return;
    const c = this.todayCard();
    const kept = this.isKept(c.idx);
    const keptN = this._kept().length;
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
        <span style="flex-shrink: 0; line-height: 0; margin-top: 0.1rem;">${window.Stickers ? window.Stickers.svg('tea', 40) : ''}</span>
        <div style="flex: 1; min-width: 0;">
          <p style="margin: 0 0 0.15rem; font-size: 0.68rem; font-weight: 800; color: var(--text-muted);">오늘의 우렁 카드</p>
          <p style="margin: 0; font-size: 0.88rem; line-height: 1.65; color: var(--text-primary); font-weight: 600;">${c.text}</p>
        </div>
        <button onclick="window.Cards.keep(${c.idx})" title="${kept ? '간직 해제' : '간직하기'}"
          style="all: unset; cursor: pointer; flex-shrink: 0; padding: 0.25rem; line-height: 0;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="${kept ? '#e05d5d' : 'none'}" stroke="${kept ? '#e05d5d' : 'var(--text-muted)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 14c1.5-1.5 2-3.2 2-5a5 5 0 0 0-9-3 5 5 0 0 0-9 3c0 1.8.5 3.5 2 5l7 7z"/>
          </svg>
          ${keptN ? `<span style="display: block; text-align: center; font-size: 0.58rem; font-weight: 800; color: var(--text-muted); margin-top: 1px;">${keptN}</span>` : ''}
        </button>
      </div>`;
  }
};
