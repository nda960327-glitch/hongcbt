// ============================================================================
//  온보딩 — 첫 실행 3화면: 환영·별명 → 요즘 마음 고르기 → AI 상담사 추천
//  선택한 고민은 장기기억의 시드가 되어 첫 대화부터 우렁이가 알고 시작한다.
// ============================================================================
window.Onboard = {
  CONCERNS: [
    { id: 'dep',    emoji: '🌧️', label: '우울감·무기력',   persona: 'dalnim' },
    { id: 'anx',    emoji: '🌪️', label: '불안·걱정',       persona: 'haru' },
    { id: 'stress', emoji: '🔥', label: '스트레스·번아웃', persona: 'sonamu' },
    { id: 'rel',    emoji: '👥', label: '대인관계',        persona: 'haru' },
    { id: 'self',   emoji: '🪞', label: '자존감',          persona: 'haru' },
    { id: 'sleep',  emoji: '🌙', label: '수면 문제',       persona: 'sonamu' },
    { id: 'vent',   emoji: '🗯️', label: '감정 쏟아내기',   persona: 'dalnim' },
    { id: 'talk',   emoji: '☕', label: '그냥 대화 상대',   persona: 'woorung' }
  ],

  needed() {
    return !window.Storage._safeGet('cbt_onboard_done', false);
  },

  start() {
    this._data = { name: '', concerns: [] };
    // 초기화 과정에서 먼저 떠 있을 수 있는 상담사 선택 모달을 정리 (겹침 방지)
    const pm = document.getElementById('persona-modal');
    if (pm) pm.classList.add('hidden');
    this._step(1);
  },

  _wrap(inner) {
    const old = document.getElementById('onboard-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'onboard-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10005; background: var(--bg-primary); color: var(--text-primary); display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem; overflow-y: auto;';
    ov.innerHTML = `<div style="width: 100%; max-width: 340px; text-align: center;">${inner}</div>`;
    document.body.appendChild(ov);
  },

  _step(n) {
    const d = this._data;
    if (n === 1) {
      this._wrap(`
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('joy', 120) : '🐌'}</span>
        <h2 style="margin: 0.8rem 0 0.4rem; font-size: 1.35rem;">만나서 반가워요!</h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.65; margin: 0 0 1.3rem;">저는 당신의 마음 주치의, <b>우렁이</b>예요.<br>뭐라고 불러드리면 될까요?</p>
        <input id="ob-name" maxlength="12" placeholder="별명이나 이름 (건너뛰어도 돼요)" style="width: 100%; box-sizing: border-box; padding: 0.85rem 1rem; border-radius: 14px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; font-size: 0.95rem; text-align: center;">
        <button id="ob-next" class="btn-primary" style="width: 100%; margin-top: 1rem;">다음 ›</button>
        <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 1rem;">모든 이야기는 이 기기에만 저장돼요 🔒</p>`);
      const input = document.getElementById('ob-name');
      setTimeout(() => input.focus(), 200);
      document.getElementById('ob-next').addEventListener('click', () => {
        d.name = input.value.trim();
        if (d.name) window.Storage._safeSet('cbt_user_name', d.name);
        this._step(2);
      });

    } else if (n === 2) {
      this._wrap(`
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('empathy', 100) : '💚'}</span>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.25rem;">${d.name ? d.name + ' 님, ' : ''}요즘 마음은 어때요?</h2>
        <p style="font-size: 0.84rem; color: var(--text-secondary); margin: 0 0 1.1rem;">해당하는 것을 모두 골라주세요.</p>
        <div id="ob-chips" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          ${this.CONCERNS.map(c => `
            <button data-id="${c.id}" style="all: unset; box-sizing: border-box; padding: 0.75rem 0.5rem; border-radius: 14px; cursor: pointer; text-align: center; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">
              <span style="display: block; font-size: 1.4rem; margin-bottom: 0.2rem;">${c.emoji}</span>${c.label}
            </button>`).join('')}
        </div>
        <button id="ob-next" class="btn-primary" style="width: 100%; margin-top: 1.1rem;">다음 ›</button>`);
      document.querySelectorAll('#ob-chips button').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.id;
        const i = d.concerns.indexOf(id);
        if (i >= 0) { d.concerns.splice(i, 1); b.style.borderColor = 'var(--glass-border)'; b.style.background = 'var(--bg-secondary)'; b.style.color = 'var(--text-primary)'; }
        else { d.concerns.push(id); b.style.borderColor = 'var(--accent-primary)'; b.style.background = 'color-mix(in srgb, var(--accent-primary) 14%, transparent)'; b.style.color = 'var(--accent-primary)'; }
      }));
      document.getElementById('ob-next').addEventListener('click', () => this._step(25));

    } else if (n === 25) {
      // 프로필 (선택) — 상담사 예약·연락에 쓰인다. 부담 없게 건너뛰기 허용
      this._wrap(`
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('write', 96) : '📝'}</span>
        <h2 style="margin: 0.7rem 0 0.3rem; font-size: 1.2rem;">연락처를 남겨둘까요?</h2>
        <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0 0 1.1rem; line-height: 1.6;">전문 상담사 예약과 연락에만 쓰여요.<br>지금 건너뛰고 나중에 설정에서 적어도 돼요.</p>
        <input id="ob-phone" type="tel" maxlength="13" placeholder="전화번호 (예: 010-1234-5678)"
          style="width: 100%; box-sizing: border-box; padding: 0.8rem 1rem; border-radius: 14px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; font-size: 0.92rem; text-align: center;">
        <select id="ob-gender" style="width: 100%; box-sizing: border-box; margin-top: 0.6rem; padding: 0.8rem 1rem; border-radius: 14px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; font-size: 0.92rem; cursor: pointer;">
          <option value="none">성별 (선택 안 함)</option>
          <option value="female">여성</option>
          <option value="male">남성</option>
        </select>
        <button id="ob-next" class="btn-primary" style="width: 100%; margin-top: 1rem;">다음 ›</button>
        <button id="ob-skip" style="all: unset; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.8rem; color: var(--text-muted); cursor: pointer;">건너뛰기</button>`);
      document.getElementById('ob-next').addEventListener('click', () => {
        const ph = document.getElementById('ob-phone').value.trim();
        const ge = document.getElementById('ob-gender').value;
        if (ph) window.Storage._safeSet('cbt_user_phone', ph);
        if (ge && ge !== 'none') window.Storage._safeSet('cbt_user_gender', ge);
        this._step(3);
      });
      document.getElementById('ob-skip').addEventListener('click', () => this._step(3));

    } else if (n === 3) {
      // 고민 → 상담사 투표: 최다 득표 페르소나 추천 (기본 우렁의사)
      const votes = {};
      d.concerns.forEach(id => {
        const c = this.CONCERNS.find(x => x.id === id);
        if (c) votes[c.persona] = (votes[c.persona] || 0) + 1;
      });
      const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      const rec = window.Personas.get(top ? top[0] : 'woorung');
      const labels = d.concerns.map(id => (this.CONCERNS.find(c => c.id === id) || {}).label).filter(Boolean);
      this._wrap(`
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.8rem;">${labels.length ? `'${labels.join(', ')}'에는` : '처음 시작하기에는'} 이 상담사가 잘 맞아요</p>
        <div style="background: var(--bg-secondary); border: 1.5px solid color-mix(in srgb, var(--accent-primary) 35%, transparent); border-radius: 18px; padding: 1.3rem 1.1rem; box-shadow: var(--shadow-sm);">
          ${window.Personas.avatarSvg(rec.id, 84)}
          <h2 style="margin: 0.5rem 0 0.15rem; font-size: 1.25rem;">${rec.name}</h2>
          <p style="font-size: 0.8rem; color: var(--accent-primary); font-weight: 700; margin: 0 0 0.5rem;">${rec.tagline}</p>
          <p style="font-size: 0.83rem; color: var(--text-secondary); line-height: 1.6; margin: 0;">${rec.desc}</p>
        </div>
        <button id="ob-go" class="btn-primary" style="width: 100%; margin-top: 1rem;">${rec.name}와 시작하기</button>
        <button id="ob-other" style="all: unset; display: block; width: 100%; text-align: center; padding: 0.7rem; font-size: 0.8rem; color: var(--text-muted); cursor: pointer;">다른 상담사 직접 고르기</button>`);
      const finish = (openChooser) => {
        window.Storage._safeSet('cbt_onboard_done', true);
        window.Storage._safeSet('cbt_user_concerns', d.concerns);
        // 첫 대화부터 우렁이가 알고 시작하도록 장기기억 시드
        if (labels.length) {
          const seed = `[온보딩] ${d.name ? `이름/별명: ${d.name}. ` : ''}요즘 고민: ${labels.join(', ')}. (첫 대화에서 자연스럽게, 부담스럽지 않게 물어봐줄 것)`;
          const prev = window.Storage.getUserMemory() || '';
          if (!prev.includes('[온보딩]')) window.Storage.setUserMemory(prev ? prev + '\n' + seed : seed);
        }
        const ov = document.getElementById('onboard-overlay');
        if (ov) ov.remove();
        if (openChooser) {
          if (window.App) window.App.showPersonaModal(true);
        } else {
          window.Personas.setActive(rec.id);
          window.Storage._safeSet('cbt_persona_reprompt_off', true);
          if (window.App) {
            window.App.updatePersonaBar();
            window.App.switchTab('chat', true);
            if (window.App._showPersonaGreeting) window.App._showPersonaGreeting(rec.id);
          }
        }
      };
      document.getElementById('ob-go').addEventListener('click', () => finish(false));
      document.getElementById('ob-other').addEventListener('click', () => finish(true));
    }
  }
};
