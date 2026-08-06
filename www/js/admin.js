// ============================================================================
//  운영자 콘솔 (데모 백오피스)
//  실서비스에서는 별도 웹 어드민 + 서버로 분리될 화면. 지금은 시연·검수용으로
//  앱 안에서 상담사 입점 심사(승인/반려), 입점 관리, 핵심 지표를 보여준다.
//  진입: 마이페이지 하단 '운영자 콘솔' → 코드 입력 (기본 1234 — 아래 PASS 수정)
// ============================================================================
window.Admin = {
  PASS: '1234',

  open() {
    // prompt()가 막힌 환경(웹뷰 등)에서도 동작하도록 자체 입력 오버레이 사용
    let code = null;
    try { code = prompt('운영자 코드를 입력하세요'); } catch (e) { code = undefined; }
    if (code === undefined) { this._askCode(); return; }
    if (code === null) return;
    if (code !== this.PASS) { try { alert('코드가 올바르지 않습니다.'); } catch (e) {} return; }
    this._render();
  },

  _askCode() {
    const old = document.getElementById('admin-code-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'admin-code-overlay';
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 300px; text-align: center;">
        <h2 style="margin: 0 0 0.8rem; font-size: 1.05rem;">🛠️ 운영자 코드</h2>
        <input id="admin-code-input" type="password" inputmode="numeric" placeholder="코드 입력" style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.9rem; border-radius: 12px; border: 1.5px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); outline: none; text-align: center; font-size: 1rem;">
        <p id="admin-code-err" class="hidden" style="color: #c14a4a; font-size: 0.76rem; margin: 0.5rem 0 0;">코드가 올바르지 않습니다.</p>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.9rem;">
          <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('admin-code-overlay').remove()">취소</button>
          <button class="btn-primary" style="flex: 1;" id="admin-code-go">입장</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = document.getElementById('admin-code-input');
    const go = () => {
      if (input.value === this.PASS) { ov.remove(); this._render(); }
      else document.getElementById('admin-code-err').classList.remove('hidden');
    };
    document.getElementById('admin-code-go').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 150);
  },

  close() {
    const ov = document.getElementById('admin-overlay');
    if (ov) ov.remove();
  },

  _apps() { return window.Storage._safeGet('cbt_counselor_apps', []) || []; },
  _customs() { return window.Storage._safeGet('cbt_custom_counselors', []) || []; },

  // 승인: 신청 → 매칭 탭 상담사 카드로 (app.js의 승인 로직 재사용, confirm은 여기서)
  approve(appId) {
    const apps = this._apps();
    const a = apps.find(x => x.id === appId);
    if (!a) return;
    if (!confirm(`'${a.name}' (${a.license})\n소속: ${a.hospital}\n\n자격·소속기관 검수를 통과 처리하고 입점을 승인할까요?`)) return;
    const origConfirm = window.confirm, origAlert = window.alert;
    window.confirm = () => true; window.alert = () => {};
    try { window.App.approveCounselorApp(appId); } finally { window.confirm = origConfirm; window.alert = origAlert; }
    if (window.App && window.App.showRecordToast) window.App.showRecordToast(`✅ '${a.name}' 입점 승인 완료`);
    this._render();
  },

  reject(appId) {
    const apps = this._apps();
    const a = apps.find(x => x.id === appId);
    if (!a || a.status === 'approved') return;
    const reason = prompt(`'${a.name}' 신청을 반려합니다.\n반려 사유를 입력하세요 (신청자에게 표시됩니다):`, '자격 서류 확인이 필요합니다');
    if (reason === null) return;
    a.status = 'rejected';
    a.rejectReason = reason.trim() || '요건 미충족';
    window.Storage._safeSet('cbt_counselor_apps', apps);
    if (window.App && window.App.renderCounselorApps) window.App.renderCounselorApps();
    this._render();
  },

  // 입점 상담사 노출 중단 (기본 제공 상담사는 제외, 입점분만)
  delist(counselorId) {
    const customs = this._customs();
    const c = customs.find(x => x.id === counselorId);
    if (!c) return;
    if (!confirm(`'${c.name}' 상담사의 매칭 탭 노출을 중단할까요?`)) return;
    window.Storage._safeSet('cbt_custom_counselors', customs.filter(x => x.id !== counselorId));
    // 연결된 신청서 상태도 '노출 중단'으로 — 신청자 마이페이지 표시가 어긋나지 않게
    if (c.fromApp) {
      const apps = this._apps();
      const a = apps.find(x => x.id === c.fromApp);
      if (a) { a.status = 'delisted'; window.Storage._safeSet('cbt_counselor_apps', apps); }
      if (window.App && window.App.renderCounselorApps) window.App.renderCounselorApps();
    }
    if (window.Marketplace) window.Marketplace.renderCounselors();
    this._render();
  },

  _render() {
    this.close();
    const S = window.Storage;
    const apps = this._apps();
    const customs = this._customs();
    const pending = apps.filter(a => !a.status || a.status === 'pending');
    const bookings = S._safeGet('cbt_bookings', []) || [];

    const stat = (label, v) => `
      <div style="flex: 1; min-width: 90px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.5rem; text-align: center;">
        <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-primary);">${v}</div>
        <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 0.15rem;">${label}</div>
      </div>`;

    const appCard = (a) => {
      const approved = a.status === 'approved';
      const rejected = a.status === 'rejected';
      const delisted = a.status === 'delisted';
      const chip = approved
        ? '<span style="background: color-mix(in srgb, var(--accent-primary) 18%, transparent); color: var(--accent-primary); font-size: 0.68rem; font-weight: 800; padding: 0.18rem 0.5rem; border-radius: 999px;">승인됨</span>'
        : rejected
          ? '<span style="background: #e05d5d22; color: #c14a4a; font-size: 0.68rem; font-weight: 800; padding: 0.18rem 0.5rem; border-radius: 999px;">반려됨</span>'
          : delisted
            ? '<span style="background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--glass-border); font-size: 0.68rem; font-weight: 800; padding: 0.18rem 0.5rem; border-radius: 999px;">노출 중단</span>'
            : '<span style="background: #f5c74e33; color: #b98a1a; font-size: 0.68rem; font-weight: 800; padding: 0.18rem 0.5rem; border-radius: 999px;">심사 대기</span>';
      return `
      <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.85rem 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
            ${a.photo ? `<img src="${a.photo}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">` : ''}
            <strong style="font-size: 0.9rem; color: var(--text-primary);">${a.name} <span style="font-weight: 500; color: var(--text-muted); font-size: 0.76rem;">· ${a.license}${a.career ? ` · 경력 ${a.career}년` : ''}</span></strong>
          </div>
          ${chip}
        </div>
        ${(a.tags && a.tags.length) ? `<div style="display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.4rem;">${a.tags.map(t => `<span style="font-size: 0.7rem; font-weight: 700; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); padding: 0.12rem 0.5rem; border-radius: 999px;">${t}</span>`).join('')}</div>` : ''}
        <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.35rem; line-height: 1.5;">
          🏥 ${a.hospital}<br>
          📍 ${a.addr || '(주소 미입력)'}${a.tel ? `<br>☎️ ${a.tel}` : ''}<br>
          💰 30분 ${(a.price || 0).toLocaleString()}원 · 신청일 ${new Date(a.ts).toLocaleDateString('ko-KR')}
          ${a.intro ? `<br>💬 ${a.intro}` : ''}
          ${rejected && a.rejectReason ? `<br><span style="color: #c14a4a;">반려 사유: ${a.rejectReason}</span>` : ''}
        </div>
        ${(!approved && !rejected) ? `
          <div style="display: flex; gap: 0.4rem; margin-top: 0.6rem;">
            <button class="btn-primary" style="flex: 1; font-size: 0.78rem; padding: 0.45rem;" onclick="window.Admin.approve('${a.id}')">✅ 승인</button>
            <button class="btn-secondary" style="flex: 1; font-size: 0.78rem; padding: 0.45rem; color: #c14a4a;" onclick="window.Admin.reject('${a.id}')">반려</button>
          </div>` : ''}
      </div>`;
    };

    const ov = document.createElement('div');
    ov.id = 'admin-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10006; background: var(--bg-primary); overflow-y: auto; max-width: 480px; margin: 0 auto;';
    ov.innerHTML = `
      <div style="position: sticky; top: 0; z-index: 1; background: var(--bg-secondary); border-bottom: 1px solid var(--glass-border); padding: 0.85rem 1.1rem; display: flex; align-items: center; gap: 0.6rem;">
        <strong style="font-size: 1rem; color: var(--text-primary);">🛠️ 운영자 콘솔</strong>
        <span style="font-size: 0.66rem; font-weight: 700; color: #b98a1a; background: #f5c74e33; padding: 0.15rem 0.5rem; border-radius: 999px;">데모 · 실서비스는 별도 어드민</span>
        <span style="flex: 1;"></span>
        <button onclick="window.Admin.close()" style="all: unset; font-size: 1.2rem; cursor: pointer; color: var(--text-muted); padding: 0.2rem 0.4rem;">✕</button>
      </div>
      <div style="padding: 1rem 1.1rem 2rem; display: flex; flex-direction: column; gap: 1.2rem;">

        <div>
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);">📊 핵심 지표</h3>
          <div style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
            ${stat('심사 대기', pending.length)}
            ${stat('입점 상담사', customs.length)}
            ${stat('예약 건수', bookings.length)}
            ${stat('누적 대화', (S._safeGet('cbt_total_chats', 0) || 0).toLocaleString())}
            ${stat('기분 체크인', ((S._safeGet('cbt_mood_log', []) || []).length).toLocaleString())}
          </div>
          <p style="font-size: 0.68rem; color: var(--text-muted); margin: 0.5rem 0 0;">※ 서버가 없는 데모라 이 기기의 데이터만 집계됩니다.</p>
        </div>

        <div>
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);">💼 수익 구조</h3>
          <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.85rem 1rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.7;">
            <b style="color: var(--text-primary);">인간 상담 (카드결제 PG)</b><br>
            상담사 55% · 병원 35% · 플랫폼 10% — PG 수수료(~3%)는 플랫폼 부담 → <b style="color: var(--accent-primary);">플랫폼 실수익 7%</b><br>
            <span id="admin-rev" style="font-size: 0.76rem; color: var(--text-muted);">완료 상담 정산 집계 중…</span>
            <div style="border-top: 1px dashed var(--glass-border); margin: 0.5rem 0; padding-top: 0.5rem;">
              <b style="color: var(--text-primary);">바로상담 (캐시 결제 · 30초당)</b><br>
              요금 = 예약 상담료 ÷60 × <b>1.25</b> (즉시성 프리미엄, 자동 책정) — 정산은 구글 순액(85%) 기준 55/35/10 → 상담사 몫이 예약 상담 대비 분당 약 +6%
            </div>
            <div style="border-top: 1px dashed var(--glass-border); margin: 0.5rem 0; padding-top: 0.5rem;">
              <b style="color: var(--text-primary);">AI 구독·캐시 (구글 인앱결제)</b><br>
              구글 수수료 15% 선차감 후 <b>순액 기준</b> 정산 — 구독 9,900원 → 순입금 8,415원 (전액 플랫폼, API 원가 차감)
            </div>
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);">🗂️ 상담사 입점 심사 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.78rem;">(${apps.length}건)</span></h3>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            ${apps.length ? apps.map(appCard).join('') : '<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">접수된 신청이 없습니다.</p>'}
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);">📥 전달된 상담 자료 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.78rem;">(이 기기 기록)</span></h3>
          <p style="font-size: 0.72rem; color: var(--text-muted); margin: 0 0 0.5rem;">서버 수신함은 <a href="/counselor.html" target="_blank" style="color: var(--accent-primary); font-weight: 700;">상담사 전용 페이지(/counselor.html)</a>에서 열람 — 열람 코드 1234</p>
          ${(() => {
            const packs = Object.entries(S._safeGet('cbt_shared_packs', {}) || {});
            if (!packs.length) return '<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 0.6rem 0 1rem;">아직 전달된 자료가 없습니다.<br><span style="font-size: 0.72rem;">내담자가 예약 카드에서 \'상담 자료 보내기\'로 동의·전달하면 여기 쌓여요.</span></p>';
            return '<div style="display: flex; flex-direction: column; gap: 0.5rem;">' + packs.map(([bid, p]) => `
              <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <strong style="flex: 1; font-size: 0.84rem; color: var(--text-primary);">→ ${p.counselor || '상담사'} <span style="font-weight: 500; color: var(--text-muted); font-size: 0.72rem;">${new Date(p.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 전달</span></strong>
                  <button class="btn-secondary" style="width: auto; font-size: 0.72rem; padding: 0.3rem 0.6rem;" onclick="const b = this.closest('div').parentElement.querySelector('.pack-body'); b.classList.toggle('hidden'); this.textContent = b.classList.contains('hidden') ? '열람' : '접기';">열람</button>
                </div>
                <div class="pack-body hidden" style="margin-top: 0.55rem; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.6; white-space: pre-line; border-top: 1px dashed var(--glass-border); padding-top: 0.55rem; max-height: 300px; overflow-y: auto;">${(p.text || '(원문 미보관 — 구버전 전달)').replace(/</g, '&lt;')}</div>
              </div>`).join('') + '</div>';
          })()}
        </div>

        <div>
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);">👩‍⚕️ 입점 상담사 관리 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.78rem;">(${customs.length}명)</span></h3>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            ${customs.length ? customs.map(c => `
              <div style="display: flex; align-items: center; gap: 0.6rem; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem;">
                <div style="flex: 1; min-width: 0;">
                  <strong style="font-size: 0.86rem; color: var(--text-primary);">${c.name}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${c.hospital} · 30분 ${c.price.toLocaleString()}원</div>
                  <div style="font-size: 0.72rem; margin-top: 0.15rem; ${c.inboxCode ? 'color: var(--accent-primary); font-weight: 700;' : 'color: var(--text-muted);'}">🔑 수신함 코드: ${c.inboxCode || '(서버 미연결 — 발급 안 됨)'}</div>
                </div>
                <button class="btn-secondary" style="width: auto; font-size: 0.72rem; padding: 0.35rem 0.6rem; color: #c14a4a; flex-shrink: 0;" onclick="window.Admin.delist('${c.id}')">노출 중단</button>
              </div>`).join('') : '<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">입점 승인된 상담사가 없습니다.</p>'}
          </div>
        </div>

      </div>`;
    document.body.appendChild(ov);
    // 서버 예약 장부에서 완료 상담 집계 → 플랫폼 실수익(7%) 표시
    fetch('/api/bookings?code=' + this.PASS).then(r => r.ok ? r.json() : null).then(d => {
      const el = document.getElementById('admin-rev');
      if (!el) return;
      if (!d) { el.textContent = '서버 미연결 — 정산 집계 불가'; return; }
      const now = Date.now();
      const done = (d.items || []).filter(b => b.status !== 'cancelled' && b.whenTs <= now);
      const gross = done.reduce((s, b) => s + (b.price || 0), 0);
      el.innerHTML = `완료 상담 ${done.length}건 · 총 결제 ${gross.toLocaleString()}캐시 → 상담사 ${Math.round(gross * 0.55).toLocaleString()} · 병원 ${Math.round(gross * 0.35).toLocaleString()} · <b style="color: var(--accent-primary);">플랫폼 ${Math.round(gross * 0.07).toLocaleString()}</b> (PG ${Math.round(gross * 0.03).toLocaleString()})`;
    }).catch(() => {});
  }
};
