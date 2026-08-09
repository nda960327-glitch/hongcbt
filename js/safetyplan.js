// ============================================================================
//  안전계획 (Safety Plan) — Stanley & Brown 안전계획 개입의 6단계.
//
//  위기가 닥친 순간에는 생각이 좁아져서 아무것도 떠오르지 않는다.
//  그래서 '괜찮을 때 미리 적어두고, 위험할 때 그대로 읽는' 것이 핵심이다.
//  AI가 대신 만들어주지 않는다 — 본인의 사람, 본인의 장소여야 작동한다.
//
//  이건 위기 개입의 표준 절차라 학계에서도 문제 삼지 않는다.
//  오히려 자·타해 위험을 다루는 앱에 이게 없으면 그것이 지적 사항이다.
// ============================================================================
window.SafetyPlan = {
  HOTLINES: [
    { name: '자살예방상담전화', tel: '109', note: '24시간 · 무료' },
    { name: '정신건강상담전화', tel: '1577-0199', note: '24시간 · 무료' },
    { name: '생명의전화', tel: '1588-9191', note: '24시간' },
    { name: '응급실', tel: '119', note: '지금 위험할 때' }
  ],

  STEPS: [
    { key: 'warning', n: 1, title: '경고 신호',
      hint: '위기가 오기 직전에 나타나는 내 신호. 생각·기분·몸의 감각·행동.',
      ph: '예) 이틀 넘게 잠을 못 잔다 / "다 의미 없다"는 생각이 맴돈다 / 연락을 다 끊는다' },
    { key: 'coping', n: 2, title: '혼자서 해볼 것',
      hint: '누구에게도 연락하지 않고 나 혼자 할 수 있는 것. 주의를 돌리는 것으로 충분합니다.',
      ph: '예) 샤워하기 / 찬물 세수 / 산책 20분 / 좋아하는 드라마 한 편' },
    { key: 'distract', n: 3, title: '나를 꺼내줄 사람·장소',
      hint: '고민을 털어놓지 않아도 됩니다. 그냥 그 자리에 있으면 마음이 가라앉는 사람이나 장소.',
      ph: '예) 동생네 집 / 단골 카페 / 도서관 / 헬스장' },
    { key: 'contact', n: 4, title: '도움을 청할 사람',
      hint: '힘들다고 말할 수 있는 사람. 이름과 연락처를 같이 적어두세요.',
      ph: '예) 누나 010-0000-0000 / 친구 민지 010-0000-0000' },
    { key: 'pro', n: 5, title: '전문가·기관',
      hint: '다니는 병원이나 상담센터가 있다면 적어두세요. 없어도 아래 상담전화가 있습니다.',
      ph: '예) ○○정신건강의학과 02-000-0000 / 학교 상담센터' },
    { key: 'safe', n: 6, title: '환경 안전하게 만들기',
      hint: '위험할 때 손닿는 곳에 두지 않을 것, 그리고 누구에게 맡길지.',
      ph: '예) 약은 엄마에게 맡긴다 / 술은 집에 두지 않는다' }
  ],

  _S() { return window.Storage; },

  data() { return this._S()._safeGet('cbt_safety_plan', {}) || {}; },
  _save(d) { this._S()._safeSet('cbt_safety_plan', d); },

  // 몇 단계나 채웠는지
  filled() {
    const d = this.data();
    return this.STEPS.filter(s => (d[s.key] || '').trim()).length;
  },

  hasPlan() { return this.filled() >= 3; },

  set(key, val) {
    const d = this.data();
    d[key] = String(val || '').slice(0, 400);
    d.updatedAt = Date.now();
    this._save(d);
  },

  esc(t) { return String(t == null ? '' : t).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m])); },

  // --------------------------------------------------------------------------
  //  작성 화면
  // --------------------------------------------------------------------------
  open() {
    const old = document.getElementById('safety-plan-ov');
    if (old) old.remove();
    const d = this.data();
    const ov = document.createElement('div');
    ov.id = 'safety-plan-ov';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10060; background: var(--bg-primary); overflow-y: auto; padding: calc(1rem + env(safe-area-inset-top)) 1.1rem calc(2rem + env(safe-area-inset-bottom));';

    ov.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <span style="line-height: 0; color: var(--accent-primary);">${window.Icons ? window.Icons.svg('lifering', { size: 20 }) : ''}</span>
        <strong style="font-size: 1.05rem; color: var(--text-primary);">나의 안전계획</strong>
 <button onclick="window.SafetyPlan.close()"style="all: unset; margin-left: auto; cursor: pointer; font-size: 1.1rem; color: var(--text-muted); padding: 0.2rem 0.4rem;"></button>
      </div>
      <p style="margin: 0 0 1rem; font-size: 0.8rem; line-height: 1.75; color: var(--text-secondary);">
        위기가 닥치면 머리가 하얘져서 아무것도 안 떠올라요. 그래서 <b>괜찮은 지금</b> 미리 적어둡니다.
        힘들 때는 생각하지 말고 여기 적힌 대로 1번부터 차례로 하면 돼요.<br>
        <span style="color: var(--text-muted);">빈칸으로 둬도 괜찮아요. 언제든 다시 고칠 수 있어요.</span>
      </p>

      ${this.STEPS.map(s => `
        <div style="margin-bottom: 0.85rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;">
            <span style="flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: var(--accent-primary); color: #fff;
                         font-size: 0.68rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;">${s.n}</span>
            <strong style="font-size: 0.87rem; color: var(--text-primary);">${s.title}</strong>
          </div>
          <p style="margin: 0 0 0.3rem 1.6rem; font-size: 0.73rem; line-height: 1.6; color: var(--text-muted);">${s.hint}</p>
          <textarea id="sp-${s.key}" rows="2" placeholder="${this.esc(s.ph)}"
            oninput="window.SafetyPlan.set('${s.key}', this.value)"
            style="width: 100%; box-sizing: border-box; padding: 0.6rem 0.7rem; border-radius: 11px; background: var(--bg-tertiary);
                   border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; font-size: 0.84rem;
                   line-height: 1.6; font-family: inherit; resize: vertical;">${this.esc(d[s.key] || '')}</textarea>
        </div>`).join('')}

      <div style="margin-top: 0.6rem; border-radius: 14px; padding: 0.85rem 0.95rem; background: color-mix(in srgb, #c14a4a 8%, transparent); border: 1px solid color-mix(in srgb, #c14a4a 26%, transparent);">
        <strong style="font-size: 0.85rem; color: #c14a4a;">언제든 바로 연결되는 곳</strong>
        <div style="margin-top: 0.45rem; display: grid; gap: 0.35rem;">
          ${this.HOTLINES.map(h => `
            <a href="tel:${h.tel}" style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none;
                      padding: 0.5rem 0.6rem; border-radius: 10px; background: var(--bg-secondary); border: 1px solid var(--glass-border);">
              <span style="line-height: 0; color: #c14a4a;">${window.Icons ? window.Icons.svg('phone', { size: 15 }) : ''}</span>
              <span style="flex: 1 1 0%; min-width: 0; font-size: 0.82rem; font-weight: 700; color: var(--text-primary);">${h.name}</span>
              <span style="flex-shrink: 0; font-size: 0.8rem; font-weight: 800; color: #c14a4a;">${h.tel}</span>
              <span style="flex-shrink: 0; font-size: 0.64rem; color: var(--text-muted);">${h.note}</span>
            </a>`).join('')}
        </div>
      </div>

      <button class="btn-primary" style="width: 100%; margin-top: 0.9rem; padding: 0.75rem; font-size: 0.9rem;"
        onclick="window.SafetyPlan.close()">저장하고 닫기</button>
      <p style="margin: 0.6rem 0 0; font-size: 0.7rem; line-height: 1.6; color: var(--text-muted); text-align: center;">
        이 내용은 이 기기에만 저장돼요. 상담사에게 보내려면 리포트 화면에서 함께 보낼 수 있어요.
      </p>`;

    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  close() {
    const ov = document.getElementById('safety-plan-ov');
    if (ov) ov.remove();
    if (window.Sfx) window.Sfx.play('close');
    this.render();
    if (window.App) window.App.showRecordToast(`안전계획 ${this.filled()}/6 단계 저장됐어요`, null);
  },

  // --------------------------------------------------------------------------
  //  위기 순간 — 적어둔 것을 그대로 읽어준다
  // --------------------------------------------------------------------------
  showNow() {
    const d = this.data();
    const old = document.getElementById('safety-now-ov');
    if (old) old.remove();

    // 아직 안 적었으면 지금 적으라고 하지 않는다. 위기 중에 작문시키면 안 된다.
    const filledSteps = this.STEPS.filter(s => (d[s.key] || '').trim());
    const ov = document.createElement('div');
    ov.id = 'safety-now-ov';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10070; background: var(--bg-primary); overflow-y: auto; padding: calc(1.2rem + env(safe-area-inset-top)) 1.1rem calc(2rem + env(safe-area-inset-bottom));';

    ov.innerHTML = `
      <div style="text-align: center; margin-bottom: 1rem;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('empathy', 84) : ''}</span>
        <p style="margin: 0.5rem 0 0.2rem; font-size: 1.02rem; font-weight: 800; color: var(--text-primary);">지금은 아무것도 정하지 않아도 돼요</p>
        <p style="margin: 0; font-size: 0.82rem; line-height: 1.7; color: var(--text-secondary);">
          위에서부터 하나씩만 해봐요. 다 못 해도 괜찮아요.
        </p>
      </div>

      ${filledSteps.length ? filledSteps.map(s => `
        <div style="margin-bottom: 0.6rem; border-radius: 13px; padding: 0.8rem 0.9rem; background: var(--bg-secondary); border: 1px solid var(--glass-border);">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem;">
            <span style="flex-shrink: 0; width: 19px; height: 19px; border-radius: 50%; background: var(--accent-primary); color: #fff;
                         font-size: 0.66rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center;">${s.n}</span>
            <strong style="font-size: 0.83rem; color: var(--text-primary);">${s.title}</strong>
          </div>
          <p style="margin: 0; font-size: 0.88rem; line-height: 1.8; color: var(--text-primary); white-space: pre-wrap;">${this.esc(d[s.key])}</p>
        </div>`).join('')
      : `<div style="border-radius: 13px; padding: 0.9rem 1rem; background: var(--bg-secondary); border: 1px solid var(--glass-border); margin-bottom: 0.6rem;">
          <p style="margin: 0; font-size: 0.86rem; line-height: 1.8; color: var(--text-primary);">
            아직 안전계획을 적어두지 않았어요. <b>지금 적지 않아도 됩니다.</b><br>
            아래 번호로 전화하면 바로 사람이 받아요. 무슨 말을 해야 할지 몰라도 괜찮아요.
          </p>
        </div>`}

      <div style="border-radius: 14px; padding: 0.85rem 0.95rem; background: color-mix(in srgb, #c14a4a 10%, transparent); border: 1px solid color-mix(in srgb, #c14a4a 30%, transparent);">
        <strong style="font-size: 0.86rem; color: #c14a4a;">지금 바로 연결되는 곳</strong>
        <div style="margin-top: 0.5rem; display: grid; gap: 0.4rem;">
          ${this.HOTLINES.map(h => `
            <a href="tel:${h.tel}" style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none;
                      padding: 0.65rem 0.7rem; border-radius: 11px; background: var(--bg-secondary); border: 1px solid var(--glass-border);">
              <span style="line-height: 0; color: #c14a4a;">${window.Icons ? window.Icons.svg('phone', { size: 17 }) : ''}</span>
              <span style="flex: 1 1 0%; min-width: 0; font-size: 0.86rem; font-weight: 700; color: var(--text-primary);">${h.name}</span>
              <span style="flex-shrink: 0; font-size: 0.88rem; font-weight: 800; color: #c14a4a;">${h.tel}</span>
            </a>`).join('')}
        </div>
      </div>

      <button class="btn-secondary" style="width: 100%; margin-top: 0.9rem; padding: 0.7rem; font-size: 0.86rem;"
        onclick="document.getElementById('safety-now-ov').remove(); window.Calm && window.Calm.openMenu();">우렁이랑 호흡 먼저 할래요</button>
      <button class="btn-secondary" style="width: 100%; margin-top: 0.4rem; padding: 0.65rem; font-size: 0.82rem;"
        onclick="document.getElementById('safety-now-ov').remove();">닫기</button>`;

    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.buzz([80, 60, 80]);
  },

  // --------------------------------------------------------------------------
  //  마이탭 카드
  // --------------------------------------------------------------------------
  render() {
    const el = document.getElementById('safetyplan-card');
    if (!el) return;
    const n = this.filled();
    const ok = this.hasPlan();
    el.innerHTML = `
      <button onclick="window.SafetyPlan.open()" class="my-row" style="width: 100%;">
        <span class="my-row__ico" style="color: ${ok ? 'var(--accent-primary)' : '#c14a4a'};">${window.Icons ? window.Icons.svg('lifering', { size: 20 }) : ''}</span>
        <span class="my-row__txt">
          <b>나의 안전계획</b>
          <span>${n ? `${n}/6단계 적어뒀어요 · 힘들 때 바로 열려요` : '괜찮은 지금 미리 적어두면, 힘들 때 그대로 따라가면 돼요'}</span>
        </span>
        <span class="my-row__go">›</span>
      </button>`;
  },

  // 챗봇이 위기를 감지했을 때 쓸 정보
  promptContext() {
    if (!this.hasPlan()) return '';
    return '[안전계획] 이 사람은 위기 대비 안전계획을 미리 적어두었습니다.'
      + ' 위험 신호가 보이면 새로 방법을 제안하기 전에 "전에 적어둔 안전계획 같이 볼까?" 라고 먼저 권하세요.'
      + ' 본인이 고른 사람·장소라 훨씬 잘 작동합니다.';
  }
};
