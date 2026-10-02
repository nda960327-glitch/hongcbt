// ============================================================================
//  나의 개선 노트 — 사용자가 직접 적어두는 "내가 고치고 싶은 것".
//
//  케어플랜은 AI가 리포트를 보고 처방한 것이고, 이건 본인이 스스로 정한 것이다.
//  둘은 다르게 다뤄야 한다: 케어플랜은 2주 뒤 끝나지만 이 노트는 지울 때까지 남고,
//  챗봇 프롬프트에 항상 실려서 대화 중에도 잊히지 않는다.
//
//  기록만 남고 아무 일도 안 일어나면 의미가 없으므로,
//  적어둔 항목은 미션 후보로도 나가고(missions.js) 진척을 눈으로 볼 수 있게 한다.
// ============================================================================
window.Goals = {
  MAX: 8,

  _S() { return window.Storage; },

  all() { return this._S()._safeGet('cbt_goals', []) || []; },
  _save(list) { this._S()._safeSet('cbt_goals', list.slice(0, 40)); },

  open() { return this.all().filter(g => !g.doneAt); },

  add(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    const list = this.all();
    if (this.open().length >= this.MAX) {
      window.UI.alert(`한 번에 ${this.MAX}개까지만 담아둘 수 있어요.\n너무 많으면 하나도 안 지켜져요 — 먼저 해낸 것을 정리해주세요.`);
      return false;
    }
    if (list.some(g => !g.doneAt && g.text === t)) return false;
    list.unshift({ id: 'g_' + Date.now(), text: t.slice(0, 60), ts: Date.now(), doneAt: 0, notes: 0 });
    this._save(list);
    if (window.Sfx) window.Sfx.hit('save');
    this.render();
    return true;
  },

  toggle(id) {
    const list = this.all();
    const g = list.find(x => x.id === id);
    if (!g) return;
    if (g.doneAt) {
      g.doneAt = 0;
      if (window.Sfx) window.Sfx.play('close');
      // 체크로 받은 물은 해제하면 돌려준다 (반복 눌러 물 캐는 구멍 방지)
      if (window.Farm && window.Farm.takeWater) window.Farm.takeWater(5, '목표 체크 취소');
    } else {
      g.doneAt = Date.now();
      if (window.Sfx) window.Sfx.hit('levelup');
      if (window.App) window.App.showRecordToast(`"${g.text}" — 해냈다고 표시했어요`, null);
      if (window.App && window.App.stickerPop) window.App.stickerPop('proud', 1400);
      if (window.Farm && window.Farm.addWater) window.Farm.addWater(5, '개선 목표 달성');
    }
    this._save(list);
    this.render();
  },

  async remove(id) {
    const g = this.all().find(x => x.id === id);
    if (!g) return;
    if (!await window.UI.confirm(`"${g.text}"\n\n이 항목을 지울까요?`)) return;
    this._save(this.all().filter(x => x.id !== id));
    if (window.Sfx) window.Sfx.play('close');
    this.render();
  },

  async promptAdd() {
    const t = await window.UI.prompt('고치고 싶은 것을 한 줄로 적어주세요.\n\n예) 화나면 바로 말해버리는 것\n예) 부탁을 못 거절하는 것\n예) 새벽까지 휴대폰 붙잡고 있는 것');
    if (t === null) return;
    this.add(t);
  },

  // --------------------------------------------------------------------------
  //  챗봇이 항상 들고 다니는 문장
  // --------------------------------------------------------------------------
  promptContext() {
    const open = this.open();
    const done = this.all().filter(g => g.doneAt).slice(0, 3);
    if (!open.length && !done.length) return '';
    let out = '[본인이 적어둔 개선 목표]\n';
    if (open.length) out += open.map((g, i) => `${i + 1}. ${g.text}`).join('\n') + '\n';
    if (done.length) out += `(이미 해냈다고 표시한 것: ${done.map(g => g.text).join(', ')})\n`;
    out += '· 이건 AI가 정한 게 아니라 본인이 직접 적은 것입니다. 대화에서 관련된 순간이 나오면 자연스럽게 연결하세요.\n'
        + '· 매번 훈계하듯 꺼내지 마세요. 사용자가 그 주제를 건드릴 때, 또는 진전이 보일 때만 짚으세요.\n'
        + '· 해냈다고 표시한 것은 다시 지적하지 말고 인정해주세요.';
    return out;
  },

  // 미션 후보 — missions.js 가 가져간다
  questSeeds() {
    return this.open().slice(0, 3).map(g => ({
      text: g.text.length > 20 ? g.text.slice(0, 20) + '…' : g.text,
      why: '내가 고치고 싶다고 적어둔 것',
      goalId: g.id
    }));
  },

  // --------------------------------------------------------------------------
  //  화면
  // --------------------------------------------------------------------------
  render() {
    const el = document.getElementById('goals-card');
    if (!el) return;
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const list = this.all();
    const open = list.filter(g => !g.doneAt);
    const done = list.filter(g => g.doneAt);
    const ic = (n, s = 15) => (window.Icons ? window.Icons.svg(n, { size: s }) : '');

    const row = g => `
      <div style="display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0.6rem; border-radius: 11px; margin-bottom: 0.3rem;
                  background: ${g.doneAt ? 'transparent' : 'var(--bg-tertiary)'}; border: 1px solid ${g.doneAt ? 'transparent' : 'var(--glass-border)'};">
        <button onclick="window.Goals.toggle('${g.id}')" title="${g.doneAt ? '아직이라고 되돌리기' : '해냈다고 표시'}"
          style="all: unset; cursor: pointer; flex-shrink: 0; width: 17px; height: 17px; margin-top: 1px; border-radius: 50%;
                 display: inline-flex; align-items: center; justify-content: center;
                 background: ${g.doneAt ? 'var(--accent-primary)' : 'transparent'};
                 border: 1.5px solid ${g.doneAt ? 'var(--accent-primary)' : 'var(--text-muted)'};">
          ${g.doneAt ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>' : ''}
        </button>
        <span style="flex: 1 1 0%; min-width: 0; font-size: 0.82rem; line-height: 1.55; font-weight: ${g.doneAt ? '600' : '700'};
                     color: ${g.doneAt ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${g.doneAt ? 'line-through' : 'none'};">${esc(g.text)}</span>
        <button onclick="window.Goals.remove('${g.id}')" title="지우기"
 style="all: unset; cursor: pointer; flex-shrink: 0; font-size: 0.8rem; color: var(--text-muted); opacity: 0.55; padding: 0 0.15rem;"></button>
      </div>`;

    el.innerHTML = `
      <div class="glass-card" style="padding: 0.95rem 1rem;">
        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem;">
          <span style="line-height: 0; color: var(--accent-primary);">${ic('note', 17)}</span>
          <strong style="font-size: 0.92rem; color: var(--text-primary);">내가 고치고 싶은 것</strong>
          <button onclick="window.Goals.promptAdd()" class="head-chip" style="margin-left: auto;">+ 추가</button>
        </div>
        <p style="margin: 0 0 0.6rem; font-size: 0.74rem; color: var(--text-muted);">
          적어두면 우렁이가 기억하고 대화에서 짚어줘요.
        </p>
        ${open.length ? open.map(row).join('') : `
          <p style="margin: 0.2rem 0 0.4rem; font-size: 0.79rem; color: var(--text-muted); line-height: 1.55;">
            예) 화나면 바로 말해버리는 것
          </p>`}
        ${done.length ? `
          <details style="margin-top: 0.5rem;">
            <summary style="cursor: pointer; font-size: 0.74rem; font-weight: 700; color: var(--text-muted);">해낸 것 ${done.length}개</summary>
            <div style="margin-top: 0.35rem;">${done.map(row).join('')}</div>
          </details>` : ''}
      </div>`;
  }
};
