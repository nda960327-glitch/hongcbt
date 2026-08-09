// ============================================================================
//  운영자 콘솔 (데모 백오피스)
//  실서비스에서는 별도 웹 어드민 + 서버로 분리될 화면. 지금은 시연·검수용으로
//  앱 안에서 상담사 입점 심사(승인/반려), 입점 관리, 핵심 지표를 보여준다.
//  진입: 마이페이지 하단 '운영자 콘솔' → Worker 시크릿 ADMIN_CODE 입력
// ============================================================================
window.Admin = {
  // 서버로 보낼 운영자 코드는 앱에 넣지 않는다.
  //  전에는 PASS: '1234' 를 그대로 /api/stats · /api/bookings 의 code 로 보냈다.
  //  이 파일은 모든 사용자에게 배포되므로, 그건 곧 아무나 전체 예약 내역
  //  (내담자 이름·시각·금액)을 조회할 수 있다는 뜻이었다.
  //  이제 운영자가 직접 입력하고, 그 세션에만 들고 있는다.
  //  틀린 코드면 서버가 403 을 준다 — 진짜 검증은 서버에서만 한다.
  code() { return sessionStorage.getItem('cbt_admin_code') || ''; },
  _setCode(v) { try { sessionStorage.setItem('cbt_admin_code', v || ''); } catch (e) {} },

  // js/api.js 가 못 실려 오면(배포 중 새로고침·순간 오프라인) window.Api 가 없다.
  //  전에는 그럴 때 버튼을 눌러도 조용히 아무 일도 안 일어나 '안 눌린다'로 보였다.
  //  이제 눈에 보이는 안내를 띄우고, 새로고침으로 복구할 길을 준다.
  _api() {
    if (window.Api && window.Api.json) return window.Api;
    const msg = '앱 파일 일부를 불러오지 못했어요.\n새로고침하면 대개 해결됩니다.';
    if (window.UI) {
      window.UI.confirm({ title: '잠시만요', body: msg, okLabel: '새로고침', cancelLabel: '닫기' })
        .then(ok => { if (ok) location.reload(true); });
    } else if (confirm(msg + '\n\n새로고침할까요?')) location.reload(true);
    return null;
  },

  open() {
    if (!this._api()) return;
    if (this.code()) { this._render(); return; }
    this._askCode();
  },

  _askCode() {
    const old = document.getElementById('admin-code-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'admin-code-overlay';
    // .modal-overlay 는 z-index 100 · position:absolute 라, 이 버튼이 놓인
    //  설정 화면(#settings-overlay, fixed · z-index 900) 뒤로 깔린다.
    //  창은 열리는데 화면에 안 보여서 '눌러도 반응 없다'로 보였다.
    ov.style.cssText =
      'position: fixed; inset: 0; z-index: 10095; background: rgba(33,26,20,0.55);' +
      'backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);' +
      'display: flex; align-items: center; justify-content: center; padding: 1.2rem;';
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 300px; text-align: center;">
 <h2 style="margin: 0 0 0.8rem; font-size: 1.05rem;"> 운영자 코드</h2>
        <input id="admin-code-input" type="password" placeholder="코드 입력" autocomplete="off" style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.9rem; border-radius: 12px; border: 1.5px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); outline: none; text-align: center; font-size: 1rem;">
        <p id="admin-code-err" class="hidden" style="color: #c14a4a; font-size: 0.76rem; margin: 0.5rem 0 0;">코드가 올바르지 않습니다.</p>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.9rem;">
          <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('admin-code-overlay').remove()">취소</button>
          <button class="btn-primary" style="flex: 1;" id="admin-code-go">입장</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const input = document.getElementById('admin-code-input');
    // 여기서는 형식만 본다. 맞는 코드인지는 서버가 판단한다(틀리면 통계가 403).
    const go = async () => {
      const v = (input.value || '').trim();
      if (v.length < 6) { document.getElementById('admin-code-err').classList.remove('hidden'); return; }
      const api = this._api();
      if (!api) return;
      const btn = document.getElementById('admin-code-go');
      btn.disabled = true; btn.textContent = '확인 중…';
      const r = await api.json('/api/stats?code=' + encodeURIComponent(v));
      btn.disabled = false; btn.textContent = '입장';
      if (!r) { document.getElementById('admin-code-err').classList.remove('hidden'); return; }
      this._setCode(v);
      ov.remove();
      // 방금 받은 통계를 그대로 넘긴다 — 같은 걸 또 부르면 그만큼 더 기다린다
      this._stats = r;
      this._render();
    };
    document.getElementById('admin-code-go').addEventListener('click', go);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => input.focus(), 150);
  },

  close() {
    const ov = document.getElementById('admin-overlay');
    if (ov) ov.remove();
  },

  // ==========================================================================
  //  상담사 관리 — 터미널 없이 여기서 다 한다
  //   추가하면 코드가 즉시 발급되고, [링크 복사] 한 번이면 전달 준비가 끝난다.
  //   코드는 비밀번호와 같아서 목록에서는 가려 두고 눌러야 보인다.
  // ==========================================================================
  _cs: null,          // 서버에서 받아온 상담사 목록
  _showCode: {},      // id → 코드 보이기 여부

  // 누른 즉시 눌렸다는 걸 보여준다.
  //  실제 지연은 0.2초여도 아무 반응이 없으면 '느리다'로 읽히고,
  //  사용자는 한 번 더 누른다 (그래서 정말로 느려진다).
  async _busy(el, label, fn) {
    const b = typeof el === 'string' ? document.getElementById(el) : el;
    const old = b ? b.textContent : '';
    if (b) { b.disabled = true; b.style.opacity = '0.6'; b.textContent = label; }
    try { return await fn(); }
    finally { if (b && b.isConnected) { b.disabled = false; b.style.opacity = ''; b.textContent = old; } }
  },

  async loadCounselors() {
    const d = await window.Api.json('/api/admin/counselors?code=' + encodeURIComponent(this.code()));
    this._cs = d ? (d.items || []) : null;
    this.renderCounselorBox();
  },

  counselorLink(code) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base + 'counselor.html';
  },

  async addCounselor() {
    const name = (document.getElementById('ac-name') || {}).value || '';
    const hospital = (document.getElementById('ac-hosp') || {}).value || '';
    const email = ((document.getElementById('ac-mail') || {}).value || '').trim();
    let id = ((document.getElementById('ac-id') || {}).value || '').trim();
    if (!name.trim()) { window.UI.alert('상담사 이름을 적어주세요'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      window.UI.alert('이메일 형식이 올바르지 않아요'); return;
    }
    if (!id) id = 'c' + Date.now().toString(36).slice(-6);   // 안 적으면 자동
    const r = await this._busy('ac-go', '발급 중…', () =>
      window.Api.json('/api/admin/counselors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: this.code(), id, name: name.trim(), hospital: hospital.trim(), email })
      }));
    if (!r || !r.ok) { window.UI.alert(r && r.error ? r.error : '추가하지 못했어요'); return; }
    ['ac-name', 'ac-hosp', 'ac-mail', 'ac-id'].forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
    this._showCode[r.id] = true;
    if (window.Sfx) window.Sfx.hit('levelup');
    // 코드는 이미 손에 있다. 목록이 다시 내려오기를 기다릴 이유가 없다.
    this.shareCounselor(r.id, r.name, r.code);
    this.loadCounselors();
  },

  // 발급된 코드를 전달하기 좋은 형태로 한 번에 보여준다
  shareCounselor(id, name, code) {
    const link = this.counselorLink();
    const msg = `[우렁의사] ${name} 선생님 상담사 페이지 안내\n\n`
      + `주소: ${link}\n열람 코드: ${code}\n\n`
      + `· 위 주소를 열고 코드를 붙여넣으면 로그인됩니다.\n`
      + `· 코드는 비밀번호와 같습니다. 단톡방에 올리지 마세요.\n`
      + `· 코드가 새면 즉시 알려주세요. 새로 발급해 드립니다.`;
    window.UI.confirm({
      title: '코드가 발급됐어요',
      body: msg,
      okLabel: '이 안내문 복사하기',
      cancelLabel: '닫기'
    }).then(ok => {
      if (!ok) return;
      try {
        navigator.clipboard.writeText(msg)
          .then(() => window.App && window.App.showRecordToast('복사했어요. 상담사에게 붙여넣어 전달하세요'))
          .catch(() => {});
      } catch (e) {}
    });
  },

  async rotateCounselor(id, name) {
    if (!await window.UI.confirm({
      title: '코드를 새로 발급할까요?',
      body: `${name} 선생님의 지금 코드는 즉시 못 쓰게 됩니다.\n새 코드를 다시 전달해야 해요.`,
      okLabel: '새로 발급', danger: true
    })) return;
    const r = await window.Api.json('/api/admin/counselors/rotate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: this.code(), id })
    });
    if (!r || !r.ok) { window.UI.alert('발급하지 못했어요'); return; }
    this._showCode[id] = true;
    await this.loadCounselors();
    this.shareCounselor(id, name, r.code);
  },

  async toggleCounselor(id, name, on) {
    if (!on && !await window.UI.confirm({
      title: `${name} 선생님을 정지할까요?`,
      body: '즉시 로그인이 막히고 매칭 목록에서도 빠집니다.\n기록은 지워지지 않아요.',
      okLabel: '정지', danger: true
    })) return;
    await window.Api.json('/api/admin/counselors/active', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: this.code(), id, active: on })
    });
    if (window.Sfx) window.Sfx.play(on ? 'ripe' : 'close');
    this.loadCounselors();
  },

  async removeCounselor(id, name) {
    const typed = await window.UI.prompt({
      title: `${name} 선생님을 완전히 삭제할까요?`,
      body: `예약·수신함·채팅·후기가 전부 함께 지워집니다. 되돌릴 수 없어요.\n계속하려면 아래에 ID(${id})를 그대로 입력하세요.`,
      placeholder: id, okLabel: '삭제', cancelLabel: '취소'
    });
    if (typed !== id) { if (typed !== null) window.UI.alert('ID 가 달라서 취소했어요'); return; }
    const r = await window.Api.json('/api/admin/counselors/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: this.code(), id, confirm: id })
    });
    if (!r || !r.ok) { window.UI.alert('삭제하지 못했어요'); return; }
    if (window.App) window.App.showRecordToast(`${name} 선생님을 삭제했어요`);
    this.loadCounselors();
  },

  // 이메일 등록·변경 → 이후로는 상담사가 스스로 링크를 받아 들어온다
  async setEmail(id, name, current) {
    const v = await window.UI.prompt({
      title: `${name} 선생님 이메일`,
      body: current
        ? '바꾸면 지금 로그인돼 있는 기기가 모두 로그아웃됩니다.'
        : '등록하면 상담사가 이 주소로 로그인 링크를 받을 수 있어요.',
      value: current || '', placeholder: 'name@example.com',
      inputType: 'email', okLabel: '저장'
    });
    if (v === null) return;
    const r = await window.Api.json('/api/admin/counselors/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: this.code(), id, email: (v || '').trim() })
    });
    if (!r || !r.ok) { window.UI.alert(r && r.error ? r.error : '저장하지 못했어요'); return; }
    if (window.App) window.App.showRecordToast('이메일을 저장했어요');
    this.loadCounselors();
  },

  // 운영자가 대신 링크를 쏴 준다 (상담사가 로그인 화면을 못 찾을 때)
  async sendLink(id, name, email) {
    if (!email) { window.UI.alert('먼저 이메일을 등록해주세요'); return; }
    const r = await window.Api.json('/api/auth/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const st = await window.Api.json('/api/stats?code=' + encodeURIComponent(this.code()));
    if (st && st.mailReady === false) {
      window.UI.alert({
        title: '메일 발송이 아직 설정되지 않았어요',
        body: '도메인과 발송 키(RESEND_API_KEY · MAIL_FROM)를 넣으면 바로 동작합니다.\n그전까지는 [안내문]의 열람 코드로 접속을 안내해주세요.'
      });
      return;
    }
    window.UI.alert({ title: '로그인 링크를 보냈어요', body: `${email}\n15분 안에 열어달라고 전해주세요.` });
  },

  peekCode(id) { this._showCode[id] = !this._showCode[id]; this.renderCounselorBox(); },

  copyCode(code) {
    try {
      navigator.clipboard.writeText(code)
        .then(() => window.App && window.App.showRecordToast('코드를 복사했어요'))
        .catch(() => {});
    } catch (e) {}
  },

  renderCounselorBox() {
    const el = document.getElementById('admin-counselor-box');
    if (!el) return;
    const esc = t => String(t || '').replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));

    if (this._cs === null) {
      el.innerHTML = '<p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">불러오는 중…</p>';
      return;
    }
    const rows = this._cs.map(c => {
      const on = !!c.active;
      const shown = !!this._showCode[c.id];
      return `
      <div style="background: var(--bg-tertiary); border: 1px solid ${on ? 'var(--glass-border)' : '#c14a4a55'}; border-radius: 12px; padding: 0.75rem 0.85rem; ${on ? '' : 'opacity: 0.7;'}">
        <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
          <strong style="font-size: 0.88rem; color: var(--text-primary);">${esc(c.name)}</strong>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${esc(c.hospital || '')}</span>
          <span style="flex: 1;"></span>
          ${on
            ? (c.available
              ? '<span style="font-size: 0.64rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 16%, transparent); padding: 0.12rem 0.45rem; border-radius: 999px;">수신 중</span>'
              : '<span style="font-size: 0.64rem; font-weight: 800; color: var(--text-muted); background: var(--bg-secondary); padding: 0.12rem 0.45rem; border-radius: 999px;">부재중</span>')
            : '<span style="font-size: 0.64rem; font-weight: 800; color: #c14a4a; background: #c14a4a1e; padding: 0.12rem 0.45rem; border-radius: 999px;">정지됨</span>'}
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.35rem;">
          <span style="flex: 1; min-width: 0; font-size: 0.74rem; color: ${c.email ? 'var(--text-secondary)' : '#c9a227'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${c.email ? esc(c.email) : '이메일 미등록 — 코드로만 접속 가능'}</span>
          <button onclick="window.Admin.setEmail('${esc(c.id)}','${esc(c.name)}','${esc(c.email || '')}')" style="all: unset; cursor: pointer; font-size: 0.7rem; font-weight: 700; color: var(--accent-primary); padding: 0.25rem 0.4rem;">${c.email ? '변경' : '등록'}</button>
          ${c.email ? `<button onclick="window.Admin.sendLink('${esc(c.id)}','${esc(c.name)}','${esc(c.email)}')" style="all: unset; cursor: pointer; font-size: 0.7rem; font-weight: 700; color: var(--accent-primary); padding: 0.25rem 0.4rem;">링크 발송</button>` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 0.35rem;">
          <code style="flex: 1; min-width: 0; font-size: 0.74rem; letter-spacing: 0.02em; color: var(--text-primary); background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 8px; padding: 0.35rem 0.5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${shown ? esc(c.code) : '••••-••••-••••-••••'}</code>
          <button onclick="window.Admin.peekCode('${esc(c.id)}')" style="all: unset; cursor: pointer; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); padding: 0.3rem 0.45rem;">${shown ? '가리기' : '보기'}</button>
          ${shown ? `<button onclick="window.Admin.copyCode('${esc(c.code)}')" style="all: unset; cursor: pointer; font-size: 0.7rem; font-weight: 700; color: var(--accent-primary); padding: 0.3rem 0.45rem;">복사</button>` : ''}
        </div>
        <div style="display: flex; gap: 0.3rem; margin-top: 0.5rem; flex-wrap: wrap;">
          <button class="btn-secondary" style="width: auto; flex: 1; min-width: 84px; font-size: 0.72rem; padding: 0.35rem;" onclick="window.Admin.shareCounselor('${esc(c.id)}','${esc(c.name)}','${esc(c.code)}')">안내문</button>
          <button class="btn-secondary" style="width: auto; flex: 1; min-width: 84px; font-size: 0.72rem; padding: 0.35rem;" onclick="window.Admin.rotateCounselor('${esc(c.id)}','${esc(c.name)}')">코드 재발급</button>
          <button class="btn-secondary" style="width: auto; flex: 1; min-width: 84px; font-size: 0.72rem; padding: 0.35rem; ${on ? 'color: #c14a4a;' : 'color: var(--accent-primary);'}" onclick="window.Admin.toggleCounselor('${esc(c.id)}','${esc(c.name)}',${on ? 'false' : 'true'})">${on ? '정지' : '정지 해제'}</button>
          <button class="btn-secondary" style="width: auto; font-size: 0.72rem; padding: 0.35rem 0.6rem; color: #c14a4a;" onclick="window.Admin.removeCounselor('${esc(c.id)}','${esc(c.name)}')">삭제</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${rows || '<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 0.8rem 0; margin: 0;">등록된 상담사가 없습니다. 아래에서 추가하세요.</p>'}
      </div>
      <div style="margin-top: 0.7rem; background: var(--bg-secondary); border: 1px dashed var(--glass-border); border-radius: 12px; padding: 0.75rem 0.85rem;">
        <p style="margin: 0 0 0.5rem; font-size: 0.78rem; font-weight: 800; color: var(--text-primary);">상담사 추가</p>
        <input id="ac-name" placeholder="이름 (예: 김유진 심리상담사)" style="width: 100%; box-sizing: border-box; margin-bottom: 0.35rem; padding: 0.5rem 0.6rem; border-radius: 9px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; outline: none;">
        <input id="ac-hosp" placeholder="소속 (예: 연세 마음가득 정신건강의학과)" style="width: 100%; box-sizing: border-box; margin-bottom: 0.35rem; padding: 0.5rem 0.6rem; border-radius: 9px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; outline: none;">
        <input id="ac-mail" type="email" placeholder="이메일 (로그인 링크를 받을 주소)" style="width: 100%; box-sizing: border-box; margin-bottom: 0.35rem; padding: 0.5rem 0.6rem; border-radius: 9px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; outline: none;">
        <input id="ac-id" placeholder="ID (비워두면 자동 · 앱 상담사 카드와 맞추려면 c1 등)" style="width: 100%; box-sizing: border-box; padding: 0.5rem 0.6rem; border-radius: 9px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; outline: none;">
        <button id="ac-go" class="btn-primary" style="width: 100%; margin-top: 0.5rem; padding: 0.5rem; font-size: 0.82rem;" onclick="window.Admin.addCounselor()">추가하고 코드 발급</button>
      </div>`;
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
 if (window.App && window.App.showRecordToast) window.App.showRecordToast(`'${a.name}'입점 승인 완료`);
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

  // ── 리뷰 신고 관리 ───────────────────────────────────────────────
  _reports() { return window.Storage._safeGet('cbt_review_reports', []) || []; },
  _hidden() { return window.Storage._safeGet('cbt_review_hidden', {}) || {}; },

  hideReview(key) {
    const h = this._hidden();
    h[key] = Date.now();
    window.Storage._safeSet('cbt_review_hidden', h);
    const reports = this._reports();
    const r = reports.find(x => x.key === key); if (r) r.status = 'hidden';
    window.Storage._safeSet('cbt_review_reports', reports);
    if (window.App) window.App.showRecordToast('후기를 숨겼어요');
    this._render();
  },

  unhideReview(key) {
    const h = this._hidden();
    delete h[key];
    window.Storage._safeSet('cbt_review_hidden', h);
    const reports = this._reports();
    const r = reports.find(x => x.key === key); if (r) r.status = 'kept';
    window.Storage._safeSet('cbt_review_reports', reports);
    if (window.App) window.App.showRecordToast('후기를 복원했어요');
    this._render();
  },

  dismissReport(key) {
    const reports = this._reports();
    const r = reports.find(x => x.key === key); if (r) r.status = 'kept';
    window.Storage._safeSet('cbt_review_reports', reports);
    this._render();
  },

  reviewSection() {
    const reports = this._reports();
    const hidden = this._hidden();
    const esc = t => String(t || '').replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const open = reports.filter(r => r.status === 'open');
    const done = reports.filter(r => r.status !== 'open');

    const row = r => `
      <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.75rem 0.85rem; margin-bottom: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem; flex-wrap: wrap;">
          <strong style="font-size: 0.78rem;">${esc(r.counselor)}</strong>
          <span style="font-size: 0.68rem; color: var(--text-muted);">작성자 ${esc(r.author)}</span>
          <span style="flex: 1;"></span>
          <span style="font-size: 0.64rem; font-weight: 800; padding: 0.1rem 0.45rem; border-radius: 999px; ${r.status === 'hidden' ? 'color: #c14a4a; background: rgba(193,74,74,0.12);' : r.status === 'kept' ? 'color: var(--text-muted); background: var(--bg-secondary);' : 'color: #c9a227; background: rgba(201,162,39,0.14);'}">${r.status === 'hidden' ? '숨김' : r.status === 'kept' ? '유지' : '검토 대기'}</span>
        </div>
        <p style="margin: 0 0 0.3rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.55;">"${esc(r.text)}"</p>
        <p style="margin: 0 0 0.5rem; font-size: 0.7rem; color: #c14a4a;">신고 사유: ${esc(r.reason)}</p>
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
          ${hidden[r.key]
            ? `<button class="btn-secondary" style="width: auto; font-size: 0.72rem; padding: 0.3rem 0.7rem;" onclick="window.Admin.unhideReview('${r.key}')">복원</button>`
            : `<button class="btn-primary" style="width: auto; font-size: 0.72rem; padding: 0.3rem 0.7rem; background: #c14a4a; border: none;" onclick="window.Admin.hideReview('${r.key}')">숨기기</button>
               <button class="btn-secondary" style="width: auto; font-size: 0.72rem; padding: 0.3rem 0.7rem;" onclick="window.Admin.dismissReport('${r.key}')">유지(반려)</button>`}
        </div>
      </div>`;

    return `
      <div style="margin-top: 1.2rem;">
        <h3 style="margin: 0 0 0.2rem; font-size: 0.95rem;">신고된 후기 관리</h3>
        <p style="margin: 0 0 0.7rem; font-size: 0.72rem; color: var(--text-muted);">검토 대기 ${open.length}건 · 처리 완료 ${done.length}건 · 현재 숨김 ${Object.keys(hidden).length}건</p>
        ${open.length ? open.map(row).join('') : '<p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 0.6rem;">검토할 신고가 없어요.</p>'}
        ${done.length ? `<details><summary style="cursor: pointer; font-size: 0.76rem; color: var(--text-muted); margin-bottom: 0.5rem;">처리 완료 ${done.length}건 보기</summary>${done.map(row).join('')}</details>` : ''}
      </div>`;
  },

  // 정산표 — 완료된 상담을 누구에게 얼마씩 보내야 하는지.
  //  비율은 Payout.SPLIT 한 곳에서만 정의된다.
  payoutSection() {
    if (!window.Payout) return '';
    const bookings = (window.Storage._safeGet('cbt_bookings', []) || []).filter(b => b && b.price);
    const esc = t => String(t || '').replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const P = window.Payout;
    const w = n => P.won(n);

    const sum = { total: 0, counselor: 0, hospital: 0, pg: 0, platform: 0 };
    bookings.forEach(b => {
      const x = P.breakdown(b.price);
      sum.total += x.total; sum.counselor += x.counselor;
      sum.hospital += x.hospital; sum.pg += x.pg; sum.platform += x.platform;
    });

    const rows = bookings.slice(0, 20).map(b => {
      const x = P.breakdown(b.price);
      return `
      <div style="display: flex; align-items: baseline; gap: 0.4rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--glass-border); font-size: 0.74rem;">
        <span style="flex: 1 1 0%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(b.name)}</span>
        <span style="flex-shrink: 0; color: var(--text-muted);">${w(x.total)}</span>
        <span style="flex-shrink: 0; font-weight: 800;">${w(x.counselor)}</span>
        <span style="flex-shrink: 0; color: var(--text-muted);">${w(x.hospital)}</span>
        <span style="flex-shrink: 0; color: var(--accent-primary); font-weight: 800;">${w(x.platform)}</span>
      </div>`;
    }).join('');

    return `
      <div style="margin-top: 1.2rem;">
        <h3 style="margin: 0 0 0.2rem; font-size: 0.95rem;">상담 정산</h3>
        <p style="margin: 0 0 0.7rem; font-size: 0.72rem; color: var(--text-muted);">
          상담사 ${P.SPLIT.counselor}% · 기관 ${P.SPLIT.hospital}% · PG ${P.SPLIT.pg}% · 우렁의사 ${P.SPLIT.platform}%
          · 완료 ${P.SETTLE_DAYS}일 뒤 지급
        </p>
        ${bookings.length ? `
          <div style="display: flex; gap: 0.4rem; font-size: 0.64rem; font-weight: 800; color: var(--text-muted); padding-bottom: 0.3rem;">
            <span style="flex: 1 1 0%;">상담</span><span>결제</span><span>상담사</span><span>기관</span><span>우렁의사</span>
          </div>
          ${rows}
          <div style="display: flex; align-items: baseline; gap: 0.4rem; padding-top: 0.55rem; font-size: 0.78rem; font-weight: 800;">
            <span style="flex: 1 1 0%;">합계 (${bookings.length}건)</span>
            <span style="color: var(--text-muted);">${w(sum.total)}</span>
            <span>${w(sum.counselor)}</span>
            <span style="color: var(--text-muted);">${w(sum.hospital)}</span>
            <span style="color: var(--accent-primary);">${w(sum.platform)}</span>
          </div>
        ` : '<p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">아직 정산할 상담이 없어요.</p>'}
      </div>`;
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
 ${a.hospital}<br>
 ${a.addr ||'(주소 미입력)'}${a.tel ?`<br>${a.tel}`:''}<br>
 30분 ${(a.price || 0).toLocaleString()}원 · 신청일 ${new Date(a.ts).toLocaleDateString('ko-KR')}
 ${a.intro ?`<br>${a.intro}`:''}
          ${rejected && a.rejectReason ? `<br><span style="color: #c14a4a;">반려 사유: ${a.rejectReason}</span>` : ''}
        </div>
        ${(!approved && !rejected) ? `
          <div style="display: flex; gap: 0.4rem; margin-top: 0.6rem;">
 <button class="btn-primary"style="flex: 1; font-size: 0.78rem; padding: 0.45rem;"onclick="window.Admin.approve('${a.id}')"> 승인</button>
            <button class="btn-secondary" style="flex: 1; font-size: 0.78rem; padding: 0.45rem; color: #c14a4a;" onclick="window.Admin.reject('${a.id}')">반려</button>
          </div>` : ''}
      </div>`;
    };

    const ov = document.createElement('div');
    ov.id = 'admin-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10006; background: var(--bg-primary); overflow-y: auto; max-width: 480px; margin: 0 auto;';
    ov.innerHTML = `
      <div style="position: sticky; top: 0; z-index: 1; background: var(--bg-secondary); border-bottom: 1px solid var(--glass-border); padding: 0.85rem 1.1rem; display: flex; align-items: center; gap: 0.6rem;">
 <strong style="font-size: 1rem; color: var(--text-primary);"> 운영자 콘솔</strong>
        <span style="font-size: 0.66rem; font-weight: 700; color: #b98a1a; background: #f5c74e33; padding: 0.15rem 0.5rem; border-radius: 999px;">데모 · 실서비스는 별도 어드민</span>
        <span style="flex: 1;"></span>
 <button onclick="window.Admin.close()"style="all: unset; font-size: 1.2rem; cursor: pointer; color: var(--text-muted); padding: 0.2rem 0.4rem;"></button>
      </div>
      <div style="padding: 1rem 1.1rem 2rem; display: flex; flex-direction: column; gap: 1.2rem;">

        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.6rem;">
 <h3 style="margin: 0; font-size: 0.95rem; color: var(--text-primary);"> 서비스 현황 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.74rem;">(서버 집계)</span></h3>
 <button class="btn-secondary"style="width: auto; font-size: 0.72rem; padding: 0.3rem 0.6rem;"onclick="window.Admin._render()"> 새로고침</button>
          </div>
          <div id="admin-stats-grid" style="display: flex; gap: 0.45rem; flex-wrap: wrap;">
            <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">서버 통계를 불러오는 중…</p>
          </div>
          <div style="margin-top: 0.7rem; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem; font-size: 0.76rem; color: var(--text-secondary); line-height: 1.7;">
 <b style="color: var(--text-primary);"> 이 기기 사용자</b> ·
            ${window.Subscription ? (window.Subscription.isSubscribed() ? `<b style="color: var(--accent-primary);">구독중</b> (${new Date(window.Subscription.subUntil()).toLocaleDateString('ko-KR')}까지)` : window.Subscription.hasAccess() ? `체험 D-${window.Subscription.trialDaysLeft()}` : `무료 플랜 (오늘 ${window.Subscription.chatLeft()}/${window.Subscription.FREE_DAILY_CHATS}회 남음)`) : '-'}
            · 누적 대화 ${(S._safeGet('cbt_total_chats', 0) || 0).toLocaleString()}회 · 체크인 ${((S._safeGet('cbt_mood_log', []) || []).length).toLocaleString()}회 · 심사 대기 ${pending.length}건
          </div>
          <p style="font-size: 0.66rem; color: var(--text-muted); margin: 0.4rem 0 0;">※ 가입자·구독자 정확 집계는 회원 서버 구축 후 가능 — 지금은 서버에 기록을 남긴 기기 수를 이용자 수로 셉니다.</p>
        </div>

        <div>
 <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);"> 수익 구조</h3>
          <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.85rem 1rem; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.7;">
            <b style="color: var(--text-primary);">인간 상담 (카드결제 PG)</b><br>
            상담사 <b style="color: var(--text-primary);">70%</b> · 소속 기관 10% · 결제 수수료(PG) 3% · 플랫폼 <b style="color: var(--accent-primary);">17%</b><br>
            <span id="admin-rev" style="font-size: 0.76rem; color: var(--text-muted);">완료 상담 정산 집계 중…</span>
            <div style="border-top: 1px dashed var(--glass-border); margin: 0.5rem 0; padding-top: 0.5rem;">
              <b style="color: var(--text-primary);">바로상담 (캐시 결제 · 30초당)</b><br>
              요금 = 예약 상담료 ÷60 × <b>1.25</b> (즉시성 프리미엄, 자동 책정) — 정산 배분율은 예약 상담과 동일 (상담사 70 · 기관 10 · PG 3 · 플랫폼 17)
            </div>
            <div style="border-top: 1px dashed var(--glass-border); margin: 0.5rem 0; padding-top: 0.5rem;">
              <b style="color: var(--text-primary);">AI 구독·캐시 (구글 인앱결제)</b><br>
              구글 수수료 15% 선차감 후 <b>순액 기준</b> 정산 — 구독 9,900원 → 순입금 8,415원 (전액 플랫폼, API 원가 차감)
            </div>
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);">상담사 관리 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.74rem;">(서버 · 코드 발급)</span></h3>
          <div id="admin-counselor-box">
            <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">불러오는 중…</p>
          </div>
        </div>

        <div>
 <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);"> 상담사 입점 심사 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.78rem;">(${apps.length}건)</span></h3>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            ${apps.length ? apps.map(appCard).join('') : '<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">접수된 신청이 없습니다.</p>'}
          </div>
        </div>

        <div>
          ${this.reviewSection()}
          ${this.payoutSection()}
        </div>

        <div>
 <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);"> 전달된 상담 자료 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.78rem;">(이 기기 기록)</span></h3>
          <p style="font-size: 0.72rem; color: var(--text-muted); margin: 0 0 0.5rem;">서버 수신함은 <a href="/counselor.html" target="_blank" style="color: var(--accent-primary); font-weight: 700;">상담사 전용 페이지(/counselor.html)</a>에서 열람 — 코드는 위 [상담사 관리]에서 발급</p>
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
 <h3 style="margin: 0 0 0.6rem; font-size: 0.95rem; color: var(--text-primary);"> 입점 상담사 관리 <span style="font-weight: 500; color: var(--text-muted); font-size: 0.78rem;">(${customs.length}명)</span></h3>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            ${customs.length ? customs.map(c => `
              <div style="display: flex; align-items: center; gap: 0.6rem; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.9rem;">
                <div style="flex: 1; min-width: 0;">
                  <strong style="font-size: 0.86rem; color: var(--text-primary);">${c.name}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${c.hospital} · 30분 ${c.price.toLocaleString()}원</div>
 <div style="font-size: 0.72rem; margin-top: 0.15rem; ${c.inboxCode ?'color: var(--accent-primary); font-weight: 700;':'color: var(--text-muted);'}"> 수신함 코드: ${c.inboxCode ||'(서버 미연결 — 발급 안 됨)'}</div>
                </div>
                <button class="btn-secondary" style="width: auto; font-size: 0.72rem; padding: 0.35rem 0.6rem; color: #c14a4a; flex-shrink: 0;" onclick="window.Admin.delist('${c.id}')">노출 중단</button>
              </div>`).join('') : '<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">입점 승인된 상담사가 없습니다.</p>'}
          </div>
        </div>

      </div>`;
    document.body.appendChild(ov);
    this.loadCounselors();          // 상담사 목록·코드
    // 서버 통계 → 서비스 현황 그리드
    //  로그인할 때 이미 받아둔 게 있으면 그걸 먼저 그리고, 네트워크는 안 탄다.
    //  (같은 걸 다시 부르면 콘솔이 그만큼 늦게 뜬다)
    const paint = (d) => {
      const grid = document.getElementById('admin-stats-grid');
      if (!grid) return;
      if (!d) { grid.innerHTML = '<p style="font-size: 0.78rem; color: var(--text-muted); margin: 0;">서버 미연결 — 통계를 불러올 수 없어요.</p>'; return; }
      const cell = (label, v, sub) => `
        <div style="flex: 1; min-width: 96px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.5rem; text-align: center;">
          <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-primary);">${v}</div>
          <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 0.15rem;">${label}</div>
          ${sub ? `<div style="font-size: 0.6rem; color: var(--text-muted); opacity: 0.8;">${sub}</div>` : ''}
        </div>`;
      grid.innerHTML =
        cell('누적 이용자', d.uniqueClients, '서버 기록 기기 수') +
        cell('입점 상담사', d.counselors) +
        cell('예약', d.bookings.total, `예정 ${d.bookings.upcoming} · 완료 ${d.bookings.done} · 취소 ${d.bookings.cancelled}`) +
        cell('채팅 스레드', d.chat.threads, `답장 대기 ${d.chat.awaiting}`) +
        cell('상담 자료', d.inbox.total, `안 읽음 ${d.inbox.unread}`) +
        cell('플랫폼 수익', d.revenue.platform.toLocaleString(),
             `총 결제 ${d.revenue.gross.toLocaleString()}캐시의 ${d.revenue.split ? d.revenue.split.platform : 17}%`) +
        (d.mailReady === false
          ? `<div style="flex: 1 1 100%; background: rgba(201,162,39,0.1); border: 1px solid rgba(201,162,39,0.3); border-radius: 12px; padding: 0.6rem 0.8rem; font-size: 0.74rem; color: var(--text-secondary); line-height: 1.6;">
               메일 발송이 아직 설정되지 않았어요 — 상담사 로그인 링크가 나가지 않습니다.
               ${d.counselorsWithoutEmail ? `<br>이메일 미등록 상담사 <b>${d.counselorsWithoutEmail}명</b>` : ''}
             </div>` : '');
    };
    if (this._stats) paint(this._stats);
    else window.Api.json('/api/stats?code=' + encodeURIComponent(this.code()))
      .then(d => { if (d) this._stats = d; paint(d); });   // 실패해도 '서버 미연결'을 보여준다
    // 서버 예약 장부에서 완료 상담 집계 → 플랫폼 실수익(7%) 표시
    window.Api.f('/api/bookings?code=' + this.code()).then(r => r.ok ? r.json() : null).then(d => {
      const el = document.getElementById('admin-rev');
      if (!el) return;
      if (!d) { el.textContent = '서버 미연결 — 정산 집계 불가'; return; }
      const now = Date.now();
      const done = (d.items || []).filter(b => b.status !== 'cancelled' && b.whenTs <= now);
      const gross = done.reduce((s, b) => s + (b.price || 0), 0);
      el.innerHTML = `완료 상담 ${done.length}건 · 총 결제 ${gross.toLocaleString()}캐시 → 상담사 ${Math.round(gross * 0.80).toLocaleString()} · 병원 ${Math.round(gross * 0.10).toLocaleString()} · <b style="color: var(--accent-primary);">플랫폼 ${Math.round(gross * 0.07).toLocaleString()}</b> (PG 실비 ${Math.round(gross * 0.03).toLocaleString()})`;
    }).catch(() => {});
  }
};
