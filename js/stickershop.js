// ============================================================================
//  이모티콘 상점 — 우렁이 스티커 팩을 캐시로 구매해 채팅에서 직접 보낸다.
//  라포 형성(우렁이가 스티커에 반응) + 캐시 사용처(수익화)를 동시에.
// ============================================================================
window.StickerShop = {
  PACKS: [
    { id: 'basic', name: '기본 감정', emoji: '🙂', price: 0,
      desc: '처음부터 함께하는 기본 표정들',
      stickers: ['joy', 'empathy', 'sad', 'cheer', 'blank', 'sleepy'] },
    { id: 'reaction', name: '리액션 팩', emoji: '😆', price: 1500,
      desc: '폭소·삐짐·반짝… 대화가 살아나는 리액션',
      stickers: ['laugh', 'hmph', 'stareyes', 'ok', 'no', 'shy', 'judge', 'bow'] },
    { id: 'feelings', name: '격한 감정 팩', emoji: '🌋', price: 2000,
      desc: '말로 못 할 마음은 격하게 — 분노·대성통곡·기절',
      stickers: ['rage', 'bigcry', 'panic', 'faint', 'ghost', 'dizzy', 'melt', 'hide'] },
    { id: 'daily', name: '일상 팩', emoji: '☕', price: 1500,
      desc: '배고픔·티타임·춤… 소소한 하루 공유용',
      stickers: ['hungry', 'run', 'cold', 'hot', 'sing', 'dance', 'tea', 'party'] },
    { id: 'special', name: '스페셜 팩', emoji: '🦸', price: 2500,
      desc: '히어로·탐정·선물… 우렁이의 특별한 모습들',
      stickers: ['hero', 'detective', 'gift', 'muscle', 'write', 'aha', 'peek', 'love', 'proud', 'surprise'] }
  ],

  owned() {
    const o = window.Storage._safeGet('cbt_sticker_packs', {}) || {};
    o.basic = o.basic || 1; // 기본팩은 항상 소유
    return o;
  },

  has(packId) {
    return !!this.owned()[packId];
  },

  buy(packId) {
    const pack = this.PACKS.find(p => p.id === packId);
    if (!pack || this.has(packId)) return;
    if (!confirm(`'${pack.emoji} ${pack.name}' (${pack.stickers.length}종)을\n${pack.price.toLocaleString()}캐시로 구매할까요?\n구매한 이모티콘은 채팅에서 계속 쓸 수 있어요.`)) return;
    if (!window.Wallet || !window.Wallet.spend(pack.price, `이모티콘 '${pack.name}' 구매`)) {
      alert(`캐시가 부족해요. (${pack.price.toLocaleString()}캐시 필요)\n마이페이지에서 충전해주세요.`);
      return;
    }
    const o = this.owned();
    o[packId] = Date.now();
    window.Storage._safeSet('cbt_sticker_packs', o);
    if (window.App) {
      window.App.showRecordToast(`${pack.emoji} '${pack.name}' 구매 완료! 채팅에서 바로 써보세요`);
      window.App.stickerPop(pack.stickers[0], 1500);
      window.App.playWoorung();
    }
    this.renderDrawer();
  },

  // === 스티커 서랍 (채팅 입력창 위 패널) ===
  toggleDrawer() {
    const btn = document.getElementById('btn-sticker');
    const old = document.getElementById('sticker-drawer');
    if (old) {
      old.remove();
      if (btn) btn.style.color = 'var(--text-secondary)';
      return;
    }
    if (btn) btn.style.color = 'var(--accent-primary)'; // 열림 상태 표시
    const area = document.getElementById('chat-input-area');
    if (!area) return;
    const panel = document.createElement('div');
    panel.id = 'sticker-drawer';
    panel.style.cssText = 'position: absolute; left: 0.9rem; right: 0.9rem; bottom: calc(100% - 60px); max-height: 320px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 18px; box-shadow: var(--shadow-md); padding: 0.6rem 0.9rem 0.8rem; z-index: 6;';
    area.appendChild(panel);
    this.renderDrawer();
    // 바깥을 탭하면 닫힌다 (이모티콘 버튼 재탭·ESC로도 닫힘)
    this._outside = (e) => {
      const d = document.getElementById('sticker-drawer');
      if (!d) return;
      if (!d.contains(e.target) && !(e.target.closest && e.target.closest('#btn-sticker'))) this.closeDrawer();
    };
    this._esc = (e) => { if (e.key === 'Escape') this.closeDrawer(); };
    setTimeout(() => {
      document.addEventListener('click', this._outside, true);
      document.addEventListener('keydown', this._esc);
    }, 50);
  },

  closeDrawer() {
    const d = document.getElementById('sticker-drawer');
    if (d) d.remove();
    const btn = document.getElementById('btn-sticker');
    if (btn) btn.style.color = 'var(--text-secondary)';
    if (this._outside) { document.removeEventListener('click', this._outside, true); this._outside = null; }
    if (this._esc) { document.removeEventListener('keydown', this._esc); this._esc = null; }
  },

  renderDrawer() {
    const panel = document.getElementById('sticker-drawer');
    if (!panel || !window.Stickers) return;
    const owned = this.owned();
    panel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; position: sticky; top: -0.6rem; background: var(--bg-secondary); padding: 0.4rem 0; z-index: 1;">
        <strong style="font-size: 0.85rem; color: var(--text-primary);">😊 우렁이 이모티콘</strong>
        <button onclick="window.StickerShop.closeDrawer()" style="all: unset; cursor: pointer; color: var(--text-muted); font-size: 1.05rem; padding: 0.1rem 0.4rem;">✕</button>
      </div>` + this.PACKS.map(pack => {
      const has = !!owned[pack.id];
      return `
        <div style="margin-bottom: 0.7rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem;">
            <strong style="font-size: 0.8rem; color: var(--text-primary);">${pack.emoji} ${pack.name}</strong>
            ${has
              ? (pack.price ? '<span style="font-size: 0.62rem; font-weight: 800; color: var(--accent-primary);">보유 중</span>' : '')
              : `<button onclick="window.StickerShop.buy('${pack.id}')" style="all: unset; font-size: 0.66rem; font-weight: 800; color: #fff; background: var(--accent-secondary); padding: 0.16rem 0.55rem; border-radius: 999px; cursor: pointer;">🔓 ${pack.price.toLocaleString()}캐시</button>`}
            <span style="flex: 1;"></span>
            ${!has ? `<span style="font-size: 0.62rem; color: var(--text-muted);">${pack.desc}</span>` : ''}
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem;">
            ${pack.stickers.map(s => `
              <button ${has ? `onclick="window.StickerShop.send('${s}')"` : `onclick="window.StickerShop.buy('${pack.id}')"`}
                title="${window.Stickers.labels[s] || s}"
                style="all: unset; box-sizing: border-box; cursor: pointer; border-radius: 12px; padding: 0.25rem 0.1rem 0.35rem; text-align: center; ${has ? '' : 'filter: grayscale(1); opacity: 0.4;'}"
                onmousedown="this.style.background='var(--bg-tertiary)'" onmouseup="this.style.background=''" onmouseleave="this.style.background=''">
                <span style="display: block; line-height: 0;">${window.Stickers.svg(s, 62)}</span>
                <span style="display: block; font-size: 0.62rem; font-weight: 700; color: var(--text-muted); margin-top: 0.15rem;">${window.Stickers.labels[s] || s}</span>
              </button>`).join('')}
          </div>
        </div>`;
    }).join('') + `<p style="margin: 0.2rem 0 0; font-size: 0.62rem; color: var(--text-muted); text-align: center;">이모티콘을 보내면 우렁이가 반응해요 · 잠긴 팩은 캐시로 열 수 있어요</p>`;
  },

  // 스티커 전송 → 우렁이가 반응 (일반 메시지와 같은 파이프라인)
  send(name) {
    if (window.Subscription && !window.Subscription.guardChat()) return;
    const App = window.App;
    if (!App) return;
    this.closeDrawer();
    if (window.Subscription && !window.Subscription.hasAccess()) window.Subscription.bumpChat();
    const label = (window.Stickers && window.Stickers.labels[name]) || name;

    if (window.Storage) {
      window.Storage.incrementSessions();
      window.Storage.markDayActive();
      window.Storage._safeSet('cbt_total_chats', ((window.Storage._safeGet('cbt_total_chats', 0)) || 0) + 1);
    }
    App.displayMessage({ role: 'user', sticker: name });
    // 히스토리에는 텍스트로 남겨 우렁이(LLM)가 알아보게 한다
    window.Storage.saveMessage({ role: 'user', sticker: name, text: `('${label}' 이모티콘을 보냈다)`, timestamp: new Date().toISOString() });
    if (window.Growth) window.Growth.checkAwards();

    App.showTypingIndicator();
    const seq = ++App._replySeq;
    clearTimeout(App._replyTimer);
    App._replyTimer = setTimeout(async () => {
      let responses;
      if (window.LLM) {
        responses = await window.LLM.generateResponse(`(방금 '${label}' 이모티콘을 보냈어요 — 짧고 다정하게, 어울리는 스티커나 말로 반응해주세요)`);
      } else {
        responses = [{ text: `${label} 이모티콘 잘 받았어! 🐌`, delay: 300 }];
      }
      if (seq !== App._replySeq) return;
      App.removeTypingIndicator();
      await App.displayBotResponses(responses);
    }, 700);
  }
};
