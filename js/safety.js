// ============================================================================
//  나의 안전 계획 (Safety Plan) — Stanley-Brown 안전계획 프로토콜 기반
//  괜찮을 때 미리 적어두고, 위기의 순간 원탭으로 꺼내 보는 나만의 구급상자.
//  위기 모달·마이페이지에서 진입한다.
// ============================================================================
window.Safety = {
  // 위기 순간엔 새 방법을 제안하기 전에, 본인이 미리 적어둔 계획을 먼저 보여준다.
  //  그 순간의 사람은 새로 생각할 힘이 없다.
  openPlanFirst() {
    if (window.SafetyPlan) { window.SafetyPlan.showNow(); return true; }
    return false;
  },

  get() {
    return window.Storage._safeGet('cbt_safety_plan', null);
  },

  has() {
    const p = this.get();
    return !!(p && (p.signals || p.calm || (p.people || []).length || p.reasons));
  },

  // 위기 모달 등에서: 있으면 열람, 없으면 작성 제안
  async open() {
    if (this.has()) this.view();
    else if (await window.UI.confirm('아직 안전 계획이 없어요.\n\n괜찮은 지금 미리 적어두면, 마음이 무너지는 순간 큰 힘이 돼요.\n지금 함께 만들어볼까요? (3분)')) this.edit();
  },

  // === 작성/수정 ===
  edit() {
    const p = this.get() || { signals: '', calm: '', people: [{ name: '', phone: '' }, { name: '', phone: '' }], reasons: '' };
    const old = document.getElementById('safety-edit');
    if (old) old.remove();
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const ov = document.createElement('div');
    ov.id = 'safety-edit';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10008; background: var(--bg-primary); overflow-y: auto; padding: 1.2rem 1.4rem 2.5rem;';
    const ta = (id, ph, val) => `<textarea id="${id}" rows="3" placeholder="${ph}" style="width: 100%; box-sizing: border-box; padding: 0.8rem; border-radius: 12px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none; resize: vertical; font-size: 0.9rem; line-height: 1.6;">${esc(val)}</textarea>`;
    ov.innerHTML = `
      <div style="max-width: 420px; margin: 0 auto;">
        <div style="text-align: center;">
          <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('hero', 96) : '🛟'}</span>
          <h2 style="margin: 0.5rem 0 0.2rem;">🛟 나의 안전 계획</h2>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0 0 1.2rem; line-height: 1.6;">마음이 무너지는 순간의 나를 위해,<br>괜찮은 지금의 내가 남겨두는 안내서예요.</p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div>
            <strong style="font-size: 0.88rem; color: var(--text-primary);">1. 🚨 나의 경고 신호</strong>
            <p style="font-size: 0.74rem; color: var(--text-muted); margin: 0.2rem 0 0.4rem;">위기가 오기 전 나에게 나타나는 신호들 (예: 잠을 못 잔다, 연락을 끊는다)</p>
            ${ta('sf-signals', '예: 며칠씩 씻기 싫어진다, 사람을 피하게 된다…', p.signals)}
          </div>
          <div>
            <strong style="font-size: 0.88rem; color: var(--text-primary);">2. 🫧 혼자서 나를 진정시키는 방법</strong>
            <p style="font-size: 0.74rem; color: var(--text-muted); margin: 0.2rem 0 0.4rem;">효과 있었던 것들 (산책, 샤워, 음악, 앱의 호흡·그라운딩…)</p>
            ${ta('sf-calm', '예: 4-7-8 호흡, 좋아하는 플레이리스트, 따뜻한 샤워…', p.calm)}
          </div>
          <div>
            <strong style="font-size: 0.88rem; color: var(--text-primary);">3. 👥 힘들 때 연락할 사람</strong>
            <p style="font-size: 0.74rem; color: var(--text-muted); margin: 0.2rem 0 0.4rem;">"나 지금 좀 힘들어"라고 말해도 되는 사람</p>
            ${[0, 1].map(i => `
              <div style="display: flex; gap: 0.4rem; margin-bottom: 0.4rem;">
                <input id="sf-pname${i}" placeholder="이름" value="${esc((p.people[i] || {}).name)}" style="flex: 1; min-width: 0; padding: 0.6rem 0.8rem; border-radius: 10px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none;">
                <input id="sf-pphone${i}" placeholder="전화번호" inputmode="tel" value="${esc((p.people[i] || {}).phone)}" style="flex: 1.2; min-width: 0; padding: 0.6rem 0.8rem; border-radius: 10px; border: 1.5px solid var(--glass-border); background: var(--bg-secondary); color: var(--text-primary); outline: none;">
              </div>`).join('')}
          </div>
          <div>
            <strong style="font-size: 0.88rem; color: var(--text-primary);">4. 💌 그래도 살아갈 이유</strong>
            <p style="font-size: 0.74rem; color: var(--text-muted); margin: 0.2rem 0 0.4rem;">나에게 소중한 것, 지키고 싶은 것, 기다리는 것</p>
            ${ta('sf-reasons', '예: 우리 강아지, 내년 봄 여행, 아직 못 해본 것들…', p.reasons)}
          </div>
          <p style="font-size: 0.72rem; color: var(--text-muted); margin: 0;">전문 기관 연락처(109·1577-0199·1366)는 자동으로 함께 담겨요. 이 계획은 이 기기에만 저장됩니다.</p>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('safety-edit').remove()">닫기</button>
            <button class="btn-primary" style="flex: 1.4;" onclick="window.Safety.save()">안전 계획 저장 🛟</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  },

  save() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    const plan = {
      signals: v('sf-signals'),
      calm: v('sf-calm'),
      people: [0, 1].map(i => ({ name: v('sf-pname' + i), phone: v('sf-pphone' + i) })).filter(x => x.name || x.phone),
      reasons: v('sf-reasons'),
      updated: Date.now()
    };
    window.Storage._safeSet('cbt_safety_plan', plan);
    if (window.Sfx) window.Sfx.hit('shield');
    const ov = document.getElementById('safety-edit');
    if (ov) ov.remove();
    if (window.App) {
      window.App.showRecordToast('안전 계획을 저장했어요. 필요할 때 늘 여기 있을게요');
      window.App.stickerPop('hero', 1500);
    }
    this.renderRow();
  },

  // === 위기의 순간 열람 — 따뜻하고 큰 글씨, 원탭 전화 ===
  view() {
    const p = this.get();
    if (!p) return;
    const old = document.getElementById('safety-view');
    if (old) old.remove();
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const ov = document.createElement('div');
    ov.id = 'safety-view';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10008; background: var(--bg-primary); overflow-y: auto; padding: 1.2rem 1.4rem 2.5rem;';
    const sec = (emoji, title, body) => body ? `
      <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1rem 1.1rem;">
        <strong style="font-size: 0.85rem; color: var(--accent-primary);">${emoji} ${title}</strong>
        <p style="margin: 0.4rem 0 0; font-size: 0.98rem; color: var(--text-primary); line-height: 1.75; white-space: pre-line;">${esc(body)}</p>
      </div>` : '';
    ov.innerHTML = `
      <div style="max-width: 420px; margin: 0 auto;">
        <div style="text-align: center;">
          <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('love', 100) : '💚'}</span>
          <h2 style="margin: 0.5rem 0 0.2rem;">지금의 당신에게,<br>괜찮았던 당신이 남긴 말</h2>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 1.1rem;">이 계획은 당신이 직접 쓴 거예요. 하나씩, 천천히.</p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.7rem;">
          ${sec('🫧', '지금 바로 해볼 수 있는 것', p.calm)}
          <button class="btn-primary" style="width: 100%;" onclick="document.getElementById('safety-view').remove(); window.Calm && window.Calm.startBreath('478');">🫧 우렁이와 1분 호흡부터</button>
          ${(p.people || []).length ? `
            <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1rem 1.1rem;">
              <strong style="font-size: 0.85rem; color: var(--accent-primary);">👥 연락해도 되는 사람</strong>
              ${p.people.map(x => `
                <a href="tel:${esc(x.phone).replace(/[^0-9+]/g, '')}" style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.5rem; padding: 0.7rem 0.9rem; background: var(--bg-tertiary); border-radius: 12px; text-decoration: none;">
                  <span style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${esc(x.name) || '연락처'}</span>
                  <span style="font-size: 0.85rem; color: var(--accent-primary); font-weight: 800;">📞 전화하기</span>
                </a>`).join('')}
            </div>` : ''}
          <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 16px; padding: 1rem 1.1rem;">
            <strong style="font-size: 0.85rem; color: var(--accent-primary);">🏥 전문가는 24시간 기다리고 있어요</strong>
            <a href="tel:109" style="display: flex; justify-content: space-between; margin-top: 0.5rem; padding: 0.7rem 0.9rem; background: var(--bg-tertiary); border-radius: 12px; text-decoration: none;"><span style="color: var(--text-primary); font-weight: 700;">자살예방상담전화</span><b style="color: var(--accent-primary);">109</b></a>
            <a href="tel:15770199" style="display: flex; justify-content: space-between; margin-top: 0.4rem; padding: 0.7rem 0.9rem; background: var(--bg-tertiary); border-radius: 12px; text-decoration: none;"><span style="color: var(--text-primary); font-weight: 700;">정신건강위기상담</span><b style="color: var(--accent-primary);">1577-0199</b></a>
          </div>
          ${sec('💌', '그래도 살아갈 이유 — 당신이 쓴 것', p.reasons)}
          ${sec('🚨', '나의 경고 신호였던 것', p.signals)}
          <div style="display: flex; gap: 0.5rem; margin-top: 0.3rem;">
            <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('safety-view').remove()">닫기</button>
            <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('safety-view').remove(); window.Safety.edit();">수정하기</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  },

  renderRow() {
    const btn = document.getElementById('safety-row-btn');
    if (btn) btn.textContent = this.has() ? '이미 만들어뒀어요 — 눌러서 열어보기' : '힘든 순간 나를 지켜주는 안내서 (3분)';
  }
};
