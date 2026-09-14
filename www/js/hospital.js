// ============================================================================
//  담당 병원 — 정신과에서 앱을 권한 환자가 병원 코드를 넣으면 담당의와 이어진다.
//  이어지면 상담사가 남긴 회기 기록·숙제와 담당의 피드백을 마이페이지에서 본다.
//  기기 안의 대화 원문은 병원으로 가지 않는다 — 서버에 있는 기록만 오간다.
// ============================================================================
window.Hospital = {
  KEY: 'cbt_hospital_link',
  REC: 'cbt_hospital_records',
  POLL_MS: 10 * 60 * 1000,
  _lastPoll: 0,
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  link() { return window.Storage._safeGet(this.KEY, null); },
  records() { return window.Storage._safeGet(this.REC, { notes: [], feedback: [] }) || { notes: [], feedback: [] }; },
  _cid() { return (window.App && window.App.clientId) ? window.App.clientId() : ''; },
  _md(ts) { const d = new Date(ts); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; },
  _ymd(ts) { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }); },

  init() {
    this.render();
    if (this.link()) this.refresh();
    else this._syncLink();   // 다른 기기·재설치 뒤에도 서버가 기억한다
  },

  async _syncLink() {
    try {
      const d = await window.Api.json('/api/patient/hospital?clientId=' + encodeURIComponent(this._cid()));
      if (d && d.link) { window.Storage._safeSet(this.KEY, d.link); this.render(); this.refresh(); }
    } catch (e) {}
  },

  tick() {
    if (!this.link()) return;
    if (Date.now() - this._lastPoll < this.POLL_MS) return;
    this.refresh();
  },

  async refresh() {
    this._lastPoll = Date.now();
    try {
      const d = await window.Api.json('/api/patient/records?clientId=' + encodeURIComponent(this._cid()));
      if (!d || !Array.isArray(d.feedback)) return;
      const before = new Set(this.records().feedback.map(f => f.id));
      const fresh = d.feedback.filter(f => !before.has(f.id) && !f.readP);
      window.Storage._safeSet(this.REC, { notes: d.notes || [], feedback: d.feedback, ts: Date.now() });
      const lk = this.link();
      // App.notify 가 알림함(Inbox)에도 같이 쌓는다 — 따로 넣으면 두 번 뜬다
      fresh.forEach(f => {
        const who = (f.doctor ? f.doctor + ' 선생님' : '담당의');
        if (window.App && window.App.notify && lk) window.App.notify(`${lk.hospital.name} · ${who} 피드백`, String(f.text).slice(0, 90), 'hospital');
      });
      this.render();
    } catch (e) {}
  },

  render() {
    const el = document.getElementById('hospital-card');
    if (!el) return;
    const esc = this._esc;
    const lk = this.link();
    if (!lk) {
      el.innerHTML = `
        <button class="my-row" data-hosp-link>
          <span class="my-row__ico" data-ic="hospital" data-ic-size="19"></span>
          <span class="my-row__txt"><b>담당 병원 연결하기</b><span>정신과에서 받은 병원 코드를 넣으면 담당 선생님이 상담 기록을 함께 봐요</span></span>
          <span class="my-row__go">›</span>
        </button>`;
    } else {
      const rec = this.records();
      const unread = rec.feedback.filter(f => !f.readP).length;
      const h = lk.hospital || {};
      el.innerHTML = `
        <div class="my-row my-row--static">
          <span class="my-row__ico" data-ic="hospital" data-ic-size="19"></span>
          <span class="my-row__txt"><b>${esc(h.name)}</b><span>${esc([h.dept, h.doctor ? h.doctor + ' 선생님' : ''].filter(Boolean).join(' · ') || '담당 병원')} · ${this._md(lk.linkedAt)} 연결</span></span>
          <button class="my-row__btn" data-hosp-unlink>연결 해제</button>
        </div>
        <button class="my-row" data-hosp-records>
          <span class="my-row__ico" data-ic="note" data-ic-size="19"></span>
          <span class="my-row__txt"><b>병원과 나누는 기록</b><span>상담 요약 ${rec.notes.length}건 · 담당의 피드백 ${rec.feedback.length}건${unread ? ` · <b style="color: var(--accent-primary);">새 피드백 ${unread}</b>` : ''}</span></span>
          <span class="my-row__go">›</span>
        </button>`;
    }
    if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(el);
  },

  _sheet(id, html) {
    const old = document.getElementById(id);
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = id;
    ov.dataset.ovGuard = '1';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end;';
    ov.innerHTML = `<div class="feed-ov">${html}</div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
    return ov;
  },

  openLink() {
    const name = window.Storage._safeGet('cbt_user_name', '') || '';
    this._sheet('hospital-link-ov', `
      <div class="feed-ov__bar"><span class="feed-tag">담당 병원 연결</span><button class="feed-ov__x" data-hosp-close>닫기</button></div>
      <h3>병원 코드를 넣어주세요</h3>
      <p class="feed-ov__author">진료실에서 받은 코드예요. 형식: H-XXXX-XXXX</p>
      <input id="hosp-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="H-XXXX-XXXX" style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.85rem; border-radius: 12px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.6rem;">
      <input id="hosp-name" type="text" maxlength="40" value="${this._esc(name)}" placeholder="이름 (진료 때 쓰는 이름)" style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.85rem; border-radius: 12px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.95rem; margin-bottom: 0.6rem;">
      <input id="hosp-birth" type="text" inputmode="numeric" maxlength="10" placeholder="생년월일 (선택, 예: 1995-03-27)" style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.85rem; border-radius: 12px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.95rem; margin-bottom: 0.7rem;">
      <div class="feed-ov__note"><span>연결하면 담당 병원의 선생님이 <b>상담사가 남긴 상담 요약·계획·숙제</b>를 볼 수 있고, 선생님이 남긴 피드백이 이 앱으로 옵니다.
        느루와 나눈 <b>대화 내용은 병원으로 가지 않아요.</b> 언제든 연결을 해제할 수 있어요.</span></div>
      <p id="hosp-err" class="feed-ov__author" style="color: #cf6b60; display: none;"></p>
      <button class="btn-primary" style="width: 100%; padding: 0.8rem;" data-hosp-submit>동의하고 연결하기</button>`);
    setTimeout(() => { const i = document.getElementById('hosp-code'); if (i) i.focus(); }, 80);
  },

  async submitLink(btn) {
    const code = (document.getElementById('hosp-code') || {}).value || '';
    const name = ((document.getElementById('hosp-name') || {}).value || '').trim();
    const birth = ((document.getElementById('hosp-birth') || {}).value || '').trim();
    const err = document.getElementById('hosp-err');
    const say = m => { if (err) { err.textContent = m; err.style.display = 'block'; } };
    if (!/^H-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(code.trim())) return say('코드 형식이 달라요. H-XXXX-XXXX 처럼 넣어주세요.');
    if (!name) return say('이름을 적어주세요. 선생님이 누구인지 알아봐야 해요.');
    if (btn) { btn.disabled = true; btn.textContent = '연결 중…'; }
    let d = null;
    try {
      const r = await window.Api.post('/api/patient/link', { clientId: this._cid(), hcode: code.trim().toUpperCase(), name, birth });
      d = r ? await r.json().catch(() => null) : null;
    } catch (e) {}
    if (btn) { btn.disabled = false; btn.textContent = '동의하고 연결하기'; }
    if (!d || !d.ok) {
      return say(d && d.error === 'bad-code' ? '이 코드로 등록된 병원을 찾지 못했어요. 병원에 다시 확인해주세요.' : '지금은 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    window.Storage._safeSet(this.KEY, { hospital: d.hospital, name: d.name, birth: d.birth, linkedAt: d.linkedAt });
    if (name && !window.Storage._safeGet('cbt_user_name', '')) window.Storage._safeSet('cbt_user_name', name);
    const ov = document.getElementById('hospital-link-ov');
    if (ov) ov.remove();
    if (window.Sfx) window.Sfx.hit('levelup');
    if (window.App) window.App.showRecordToast(`${d.hospital.name}에 연결됐어요`);
    this.render();
    this.refresh();
  },

  async unlink() {
    const lk = this.link();
    if (!lk) return;
    if (!await window.UI.confirm(`${lk.hospital.name} 연결을 해제할까요?\n이후 상담 기록이 병원에 공유되지 않고, 담당의 피드백도 오지 않아요.`)) return;
    try { await window.Api.post('/api/patient/unlink', { clientId: this._cid() }); } catch (e) {}
    window.Storage._safeSet(this.KEY, null);
    window.Storage._safeSet(this.REC, { notes: [], feedback: [] });
    if (window.Sfx) window.Sfx.play('close');
    this.render();
  },

  openRecords() {
    const lk = this.link();
    if (!lk) return;
    const esc = this._esc;
    const rec = this.records();
    const KIND = { booking: '예약 상담', call: '전화 상담', chat: '채팅 상담' };
    const fbHtml = rec.feedback.length ? rec.feedback.map(f => `
      <div class="todo-row${f.readP ? '' : ' is-new'}" style="margin-bottom: 0.45rem;">
        <div class="todo-row__body" style="display: block;">
          <span class="todo-row__s">${esc(f.doctor ? f.doctor + ' 선생님' : lk.hospital.name)} · ${this._ymd(f.ts)}${f.readP ? '' : ' · <b style="color: var(--accent-primary);">새 피드백</b>'}</span>
          <span class="todo-row__t" style="font-weight: 500; white-space: pre-wrap;">${esc(f.text)}</span>
        </div>
      </div>`).join('') : '<p class="feed-ov__author">아직 담당의 피드백이 없어요.</p>';
    const noteHtml = rec.notes.length ? rec.notes.map(n => `
      <div class="todo-row" style="margin-bottom: 0.45rem;">
        <div class="todo-row__body" style="display: block;">
          <span class="todo-row__s">${esc(n.counselor || '상담사')} · ${KIND[n.kind] || '상담'} · ${this._ymd(n.ts)}</span>
          <span class="todo-row__t" style="font-weight: 500; white-space: pre-wrap;">${esc(n.summary)}</span>
          ${n.plan ? `<span class="todo-row__s" style="margin-top: 0.3rem;"><b>다음 계획</b> ${esc(n.plan)}</span>` : ''}
          ${n.homework ? `<span class="todo-row__s"><b>숙제</b> ${esc(n.homework)}</span>` : ''}
        </div>
      </div>`).join('') : '<p class="feed-ov__author">아직 공유된 상담 기록이 없어요. 상담사와 상담을 마치면 여기에 요약이 쌓여요.</p>';
    this._sheet('hospital-records-ov', `
      <div class="feed-ov__bar"><span class="feed-tag">${esc(lk.hospital.name)}</span><button class="feed-ov__x" data-hosp-close>닫기</button></div>
      <h3>담당의 피드백</h3>${fbHtml}
      <h3 style="margin-top: 1rem;">병원과 공유된 상담 기록</h3>
      <p class="feed-ov__author">상담사가 남긴 요약이에요. 느루와 나눈 대화는 여기 포함되지 않아요.</p>${noteHtml}`);
    // 열어봤으면 읽음 처리
    const unread = rec.feedback.filter(f => !f.readP).map(f => f.id);
    if (unread.length) {
      rec.feedback.forEach(f => { if (!f.readP) f.readP = Date.now(); });
      window.Storage._safeSet(this.REC, rec);
      this.render();
      try { window.Api.post('/api/patient/feedback/read', { clientId: this._cid(), ids: unread }); } catch (e) {}
    }
  },

  // 챗봇이 알아야 할 것 — 담당의가 있다는 사실과 최근 피드백 (의학적 판단은 병원 몫)
  promptContext() {
    const lk = this.link();
    if (!lk) return '';
    const fb = this.records().feedback.slice(0, 2);
    return `[담당 병원] 이 사람은 ${lk.hospital.name}${lk.hospital.doctor ? ' ' + lk.hospital.doctor + ' 선생님' : ''}의 진료를 받고 있고, 상담 기록이 병원과 공유됩니다.`
      + (fb.length ? '\n최근 담당의 피드백:\n' + fb.map(f => `- ${String(f.text).slice(0, 160)}`).join('\n') : '')
      + '\n약·진단·치료 방침은 담당의의 영역입니다. 관련 질문이 오면 진료 때 물어보도록 권하세요. 병원과 공유되는 것은 상담사의 요약뿐, 이 대화는 공유되지 않는다고 안심시킬 수 있습니다.';
  }
};

document.addEventListener('click', function (e) {
  const H = window.Hospital;
  if (!H) return;
  if (e.target.closest('[data-hosp-link]')) { H.openLink(); return; }
  if (e.target.closest('[data-hosp-records]')) { H.openRecords(); return; }
  if (e.target.closest('[data-hosp-unlink]')) { H.unlink(); return; }
  const sub = e.target.closest('[data-hosp-submit]');
  if (sub) { H.submitLink(sub); return; }
  if (e.target.closest('[data-hosp-close]')) {
    ['hospital-link-ov', 'hospital-records-ov'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); });
  }
});
