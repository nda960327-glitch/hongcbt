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
    this.uploadWeekly();
    if (Date.now() - this._lastPoll < this.POLL_MS) return;
    this.refresh();
  },

  // ── 주간 상태 요약 ──────────────────────────────────────────────────
  //  환자가 동의했을 때만, 숫자만 올린다. 기분 평균·체크인 횟수·미션·밤 일기·생각 기록·연속일.
  //  일기·대화 원문은 절대 포함하지 않는다. 지난주와 이번 주, 두 주를 하루 한 번 덮어쓴다.
  WEEKLY_KEY: 'cbt_hospital_weekly_at',
  _weeklyAt: null,
  _weekStart(ts) {
    // 주 경계는 앱의 하루 경계(05:00)를 따른다 — 월요일 04:59 는 아직 일요일 밤이다
    const dt = new Date(window.Storage.dayKey(ts) + 'T00:00:00');
    const day = (dt.getDay() + 6) % 7;
    dt.setDate(dt.getDate() - day);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), window.Storage.DAY_START_HOUR || 5, 0, 0).getTime();
  },
  _weekStats(from) {
    const to = from + 7 * 86400000;
    const S = window.Storage;
    const inWin = t => t >= from && t < to;
    const moods = (S._safeGet('cbt_mood_log', []) || []).filter(m => inWin(m.ts));
    const nights = (S._safeGet('cbt_night_journal', []) || []).filter(j => inWin(j.ts)).length;
    const missions = (S._safeGet('cbt_mission_log', []) || []).filter(m => m.done && inWin(m.ts)).length;
    let records = 0;
    try { records = (S.getThoughtRecords() || []).filter(r => inWin(new Date(r.date).getTime())).length; } catch (e) {}
    const avg = moods.length ? moods.reduce((s, m) => s + (Number(m.v) || 3), 0) / moods.length : null;
    return {
      weekKey: new Date(from).toLocaleDateString('sv-CA'),
      moodAvg: avg == null ? null : Math.round(avg * 10) / 10,
      checkins: moods.length, missions, nights, records,
      streak: (typeof S.getStreak === 'function' ? Number(S.getStreak()) || 0 : 0)
    };
  },
  async uploadWeekly() {
    const lk = this.link();
    if (!lk || lk.shareWeekly === false) return;
    if (this._weeklyAt == null) this._weeklyAt = Number(window.Storage._safeGet(this.WEEKLY_KEY, 0)) || 0;
    if (Date.now() - this._weeklyAt < 6 * 3600000) return;   // 하루에 서너 번이면 충분하다
    this._weeklyAt = Date.now();
    window.Storage._safeSet(this.WEEKLY_KEY, this._weeklyAt);
    const thisWeek = this._weekStart(Date.now());
    const weeks = [this._weekStats(thisWeek - 7 * 86400000), this._weekStats(thisWeek)];
    try { await window.Api.post('/api/patient/weekly', { clientId: this._cid(), weeks }); } catch (e) {}
  },
  async toggleWeekly() {
    const lk = this.link();
    if (!lk) return;
    const on = lk.shareWeekly === false;   // 지금 꺼져 있으면 켠다
    if (!on && !await window.UI.confirm('주간 상태 요약 공유를 끌까요?\n이미 올라간 주간 숫자는 병원에서 지워지고, 앞으로 올라가지 않아요. 상담사 기록 공유는 그대로예요.')) return;
    let ok = false;
    try { const r = await window.Api.post('/api/patient/consent', { clientId: this._cid(), shareWeekly: on }); const d = r ? await r.json().catch(() => null) : null; ok = !!(d && d.ok); } catch (e) {}
    if (!ok) { if (window.App) window.App.showRecordToast('지금은 바꾸지 못했어요'); return; }
    lk.shareWeekly = on;
    window.Storage._safeSet(this.KEY, lk);
    this._weeklyAt = 0;
    if (on) this.uploadWeekly();
    if (window.Sfx) window.Sfx.play(on ? 'pop' : 'close');
    this.render();
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
        </button>
        <div class="my-row my-row--static">
          <span class="my-row__ico" data-ic="dashboard" data-ic-size="19"></span>
          <span class="my-row__txt"><b>주간 상태 요약 공유</b><span>${lk.shareWeekly !== false ? '켜짐 · 기분 평균·체크인 횟수 같은 숫자만 주 1회 올라가요' : '꺼짐 · 병원은 상담사 기록만 봐요'}</span></span>
          <button class="my-row__btn" data-hosp-weekly-toggle>${lk.shareWeekly !== false ? '끄기' : '켜기'}</button>
        </div>`;
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
      <label style="display: flex; gap: 0.6rem; align-items: flex-start; margin: 0.6rem 0 0.7rem; font-size: 0.86rem; line-height: 1.5; color: var(--text-primary);">
        <input id="hosp-weekly" type="checkbox" checked style="margin-top: 0.2rem; width: 18px; height: 18px; accent-color: var(--accent-primary);">
        <span><b>주간 상태 요약도 공유할게요</b><br><span style="color: var(--text-secondary);">주 1회, 기분 체크인 평균·횟수·미션 수 같은 <b>숫자 몇 개만</b> 올라가요. 일기·대화 내용은 포함되지 않아요. 나중에 마이페이지에서 끌 수 있어요.</span></span>
      </label>
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
    const shareWeekly = !!((document.getElementById('hosp-weekly') || { checked: true }).checked);
    let d = null;
    try {
      const r = await window.Api.post('/api/patient/link', { clientId: this._cid(), hcode: code.trim().toUpperCase(), name, birth, shareWeekly });
      d = r ? await r.json().catch(() => null) : null;
    } catch (e) {}
    if (btn) { btn.disabled = false; btn.textContent = '동의하고 연결하기'; }
    if (!d || !d.ok) {
      return say(d && d.error === 'bad-code' ? '이 코드로 등록된 병원을 찾지 못했어요. 병원에 다시 확인해주세요.' : '지금은 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    window.Storage._safeSet(this.KEY, { hospital: d.hospital, name: d.name, birth: d.birth, linkedAt: d.linkedAt, shareWeekly: d.shareWeekly !== false });
    this._weeklyAt = 0;   // 연결 직후 첫 주간 요약을 바로 올린다
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
    return `[담당 병원] 이 사람은 ${lk.hospital.name}${lk.hospital.doctor ? ' ' + lk.hospital.doctor + ' 선생님' : ''}의 진료를 받고 있고, 상담사의 상담 기록이 병원과 공유됩니다.${lk.shareWeekly !== false ? ' 주 1회 기분 체크인 평균 같은 숫자 요약도 병원에 올라갑니다(일기·대화는 아님).' : ''}`
      + (fb.length ? '\n최근 담당의 피드백:\n' + fb.map(f => `- ${String(f.text).slice(0, 160)}`).join('\n') : '')
      + '\n약과 의학적 판단은 담당의의 영역입니다. 관련 질문이 오면 진료 때 물어보도록 권하세요. 병원과 공유되는 것은 상담사의 요약뿐, 이 대화는 공유되지 않는다고 안심시킬 수 있습니다.';
  }
};

document.addEventListener('click', function (e) {
  const H = window.Hospital;
  if (!H) return;
  if (e.target.closest('[data-hosp-link]')) { H.openLink(); return; }
  if (e.target.closest('[data-hosp-records]')) { H.openRecords(); return; }
  if (e.target.closest('[data-hosp-unlink]')) { H.unlink(); return; }
  if (e.target.closest('[data-hosp-weekly-toggle]')) { H.toggleWeekly(); return; }
  const sub = e.target.closest('[data-hosp-submit]');
  if (sub) { H.submitLink(sub); return; }
  if (e.target.closest('[data-hosp-close]')) {
    ['hospital-link-ov', 'hospital-records-ov'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); });
  }
});
