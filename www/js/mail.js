// ============================================================================
//  우렁이네 우편함 — 주간 편지 세계관 확장
//  · 우표(🪶달팽이 우표)를 사서 우렁이에게 편지를 보낸다
//  · 우렁이가 우렁이체로 답장을 써서 우편함에 넣어준다 (비동기, 알림)
//  · 우표: 씨앗코인 40 또는 우렁 캐시 300
// ============================================================================
window.Mail = {

  STAMP_COIN: 40,
  STAMP_CASH: 300,

  _S() { return window.Storage; },

  stamps() { return this._S()._safeGet('cbt_stamps', 0) || 0; },
  _setStamps(n) { this._S()._safeSet('cbt_stamps', Math.max(0, n)); },

  box() { return this._S()._safeGet('cbt_mailbox', []) || []; },   // {id, dir:'sent'|'recv', ts, text, replyTo}
  _saveBox(b) { this._S()._safeSet('cbt_mailbox', b.slice(0, 60)); },

  buyStamp(useCash) {
    if (useCash) {
      if (!window.Wallet || !window.Wallet.spend(this.STAMP_CASH, '달팽이 우표 1장')) {
        alert(`우렁 캐시가 부족해요. (우표 1장 = ${this.STAMP_CASH}캐시)`);
        return;
      }
    } else {
      if (!window.Farm || !window.Farm.spendCoins(this.STAMP_COIN)) {
        alert(`씨앗코인이 부족해요. (우표 1장 = ${this.STAMP_COIN}코인)\n농장에서 작물을 수확해보세요.`);
        return;
      }
    }
    this._setStamps(this.stamps() + 1);
    if (window.Sfx) window.Sfx.hit('buy');
    if (window.App) window.App.showRecordToast('달팽이 우표 1장을 샀어요');
    this.render();
    if (window.Game) window.Game.renderHud();
  },

  // --------------------------------------------------------------------------
  //  편지 쓰기
  // --------------------------------------------------------------------------
  openWrite() {
    if (this.stamps() <= 0) {
      if (confirm(`편지를 보내려면 🪶우표가 필요해요.\n\n우표 1장을 살까요? (🌰${this.STAMP_COIN}코인)`)) this.buyStamp(false);
      if (this.stamps() <= 0) return;
    }
    const old = document.getElementById('mail-write-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'mail-write-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 950; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; padding: 1.2rem;';
    ov.innerHTML = `
      <div class="glass-card" style="width: 100%; max-width: 420px; padding: 1.1rem; background: var(--bg-secondary);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
          <strong style="font-size: 0.95rem; color: var(--text-primary);">✉️ 우렁이에게 보내는 편지</strong>
          <button onclick="document.getElementById('mail-write-overlay').remove()" style="all: unset; cursor: pointer; color: var(--text-muted); font-size: 1.05rem; padding: 0.1rem 0.4rem;">✕</button>
        </div>
        <p style="margin: 0 0 0.6rem; font-size: 0.74rem; color: var(--text-muted);">우표 1장이 붙어요 (보유 ${this.stamps()}장). 우렁이는 느리지만 답장은 꼭 해요.</p>
        <textarea id="mail-write-text" rows="6" maxlength="800" placeholder="우렁이한테 하고 싶은 말을 편하게 적어보세요"
          style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; font-size: 0.88rem; font-family: inherit; resize: vertical;"></textarea>
        <button class="btn-primary" style="width: 100%; margin-top: 0.7rem;" onclick="window.Mail.send()">🪶 우표 붙여서 보내기</button>
      </div>`;
    document.body.appendChild(ov);
    setTimeout(() => { const t = document.getElementById('mail-write-text'); if (t) t.focus(); }, 150);
  },

  send() {
    const ta = document.getElementById('mail-write-text');
    const text = ta ? ta.value.trim() : '';
    if (!text) { alert('편지 내용을 적어주세요.'); return; }
    if (this.stamps() <= 0) { alert('우표가 없어요.'); return; }

    this._setStamps(this.stamps() - 1);
    const b = this.box();
    const id = 'ml_' + Date.now();
    b.unshift({ id, dir: 'sent', ts: Date.now(), text });
    this._saveBox(b);

    const ov = document.getElementById('mail-write-overlay');
    if (ov) ov.remove();
    if (window.Sfx) window.Sfx.hit('coin');
    if (window.App) {
      window.App.showRecordToast('편지를 부쳤어요! 우렁이가 읽고 답장을 쓸 거예요');
      window.App.stickerPop('gift', 1500);
    }
    this.render();
    this._reply(id, text);
  },

  // 우렁이의 답장 (비동기 — 실패하면 기본 답장이라도 넣어준다)
  async _reply(replyTo, userText) {
    let replyText = '';
    try {
      const memory = (this._S().getUserMemory && this._S().getUserMemory()) || '';
      const res = await window.LLM._chatCompletion({
        model: window.LLM.MEMORY_MODEL,
        messages: [{ role: 'user', content: `당신은 '우렁이' — 하찮고 뚱뚱하지만 마음은 대왕인 달팽이 상담사입니다. 사용자가 우표를 붙여 손편지를 보내왔습니다. 답장을 쓰세요.

[우렁이 말투]
· 우렁우렁, 우로로록, 호고고곡, 우덩우덩 같은 울음소리를 1~2번만 섞기
· 반말, 친구의 손편지처럼. 위트 한 스푼 필수, 다만 아픈 얘기엔 잠깐 진지해지기
· 느리고 뚱뚱하고 상추를 좋아하는 자기 설정으로 가벼운 자학 개그 가능
· 4~7문장. 마지막 줄에 "— 답장 느려서 미안, 우렁이 🐌" 서명
· 편지 본문만 출력

[알고 있는 것(기억)]
${memory.slice(0, 1600) || '(없음)'}

[받은 편지]
${userText}` }],
        temperature: 0.85,
        max_tokens: 400
      });
      if (res.ok) {
        const data = await res.json();
        replyText = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
      }
    } catch (e) {}
    if (!replyText) {
      replyText = '우로로록… 편지 잘 받았어. 지금 껍데기 안에서 정성껏 답장을 쓰는 중인데 네트워크가 느려서 말이 잘 안 나가.\n조금 있다가 다시 부쳐볼게. 편지 고마워, 진짜로.\n— 답장 느려서 미안, 우렁이 🐌';
    }
    const b = this.box();
    b.unshift({ id: 'ml_' + Date.now(), dir: 'recv', ts: Date.now(), text: replyText, replyTo });
    this._saveBox(b);
    if (window.App) {
      window.App.showRecordToast('우렁이의 답장이 도착했어요! (대시보드 › 서재)');
      if (window.App.notify) window.App.notify('💌 우렁이네 우편함', '답장이 도착했어요!');
      if (window.App.playWoorung) window.App.playWoorung();
    }
    this.render();
  },

  toggle(id) {
    const el = document.getElementById('mail-item-' + id);
    if (el) el.classList.toggle('hidden');
  },

  render() {
    const el = document.getElementById('mail-body');
    if (!el) return;
    const box = this.box();
    const fmt = ts => new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
      + ' ' + new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    el.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.6rem;">
        <span style="font-size: 0.74rem; font-weight: 800; color: var(--accent-secondary);">🪶 우표 ${this.stamps()}장</span>
        <button onclick="window.Mail.buyStamp(false)" style="all: unset; cursor: pointer; font-size: 0.68rem; font-weight: 800; color: var(--accent-primary); border: 1px solid color-mix(in srgb, var(--accent-primary) 40%, transparent); padding: 0.18rem 0.5rem; border-radius: 999px;">우표 사기 🌰${this.STAMP_COIN}</button>
        <button onclick="window.Mail.buyStamp(true)" style="all: unset; cursor: pointer; font-size: 0.68rem; font-weight: 800; color: #c9a227; border: 1px solid color-mix(in srgb, #c9a227 40%, transparent); padding: 0.18rem 0.5rem; border-radius: 999px;">💰${this.STAMP_CASH}</button>
        <button onclick="window.Mail.openWrite()" style="all: unset; cursor: pointer; margin-left: auto; font-size: 0.72rem; font-weight: 800; color: #fff; background: var(--accent-primary); padding: 0.3rem 0.7rem; border-radius: 999px;">✉️ 편지 쓰기</button>
      </div>
      ${box.length === 0
        ? `<p style="margin: 0.4rem 0 0; font-size: 0.76rem; color: var(--text-muted);">우표를 사서 첫 편지를 보내보세요.</p>`
        : box.map(m => `
          <div style="border: 1px solid var(--glass-border); border-radius: 12px; margin-bottom: 0.45rem; overflow: hidden; background: ${m.dir === 'recv' ? 'color-mix(in srgb, var(--accent-primary) 7%, var(--bg-tertiary))' : 'var(--bg-tertiary)'};">
            <button onclick="window.Mail.toggle('${m.id}')" style="all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.55rem 0.7rem; cursor: pointer;">
              <span style="font-size: 0.95rem;">${m.dir === 'recv' ? '💌' : '📮'}</span>
              <span style="flex: 1 1 0%; width: 0; min-width: 0; font-size: 0.78rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${m.dir === 'recv' ? '우렁이의 답장' : '내가 보낸 편지'} — ${(m.text || '').split('\n')[0].slice(0, 26)}
              </span>
              <span style="font-size: 0.64rem; color: var(--text-muted); flex-shrink: 0;">${fmt(m.ts)}</span>
            </button>
            <div id="mail-item-${m.id}" class="hidden" style="padding: 0 0.85rem 0.75rem; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.65; white-space: pre-wrap;">${(m.text || '').replace(/</g, '&lt;')}</div>
          </div>`).join('')}`;
  }
};
