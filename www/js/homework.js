// ============================================================================
//  상담 숙제 — 상담사가 낸 과제를 앱에서 수행하고, 그 결과가 다시 상담사에게 간다.
//
//  지금까지 마켓플레이스는 '예약하고 만나면 끝'이었다. 그런데 실제 치료에서
//  변화가 일어나는 곳은 상담실이 아니라 그 사이의 일주일이다(회기 간 과제 수행이
//  치료 성과를 예측한다는 건 CBT 문헌에서 반복 확인된 부분이다).
//
//  그래서 숙제를 앱의 미션·케어플랜과 같은 자리에 놓는다.
//  AI가 준 것과 사람이 준 것을 나란히 두되, 출처는 분명히 구분해서 보여준다.
//
//  ※ 지금은 상담사 쪽 입력이 서버로 오기 전이라, 로컬 저장소를 원본으로 둔다.
//    서버가 붙으면 pull() 만 교체하면 된다.
// ============================================================================
window.Homework = {
  _S() { return window.Storage; },

  all() { return this._S()._safeGet('cbt_homework', []) || []; },
  _save(l) { this._S()._safeSet('cbt_homework', l.slice(0, 60)); },

  open() { return this.all().filter(h => !h.doneAt && !h.canceled); },

  // 상담사가 낸 과제를 받는다 (서버 연동 시 여기만 교체)
  receive(item) {
    if (!item || !item.text) return null;
    const list = this.all();
    const rec = {
      id: 'hw_' + Date.now() + '_' + Math.floor(Math.random() * 1000).toString(36),
      counselorId: item.counselorId || '',
      counselor: item.counselor || '상담사',
      text: String(item.text).slice(0, 200),
      why: String(item.why || '').slice(0, 200),
      dueAt: item.dueAt || 0,
      assignedAt: Date.now(),
      doneAt: 0,
      note: ''
    };
    list.unshift(rec);
    this._save(list);
    if (window.App) {
      window.App.showRecordToast(`${rec.counselor}님이 숙제를 보냈어요`, null);
      if (window.App._setNavBadge) window.App._setNavBadge('mypage', true);
      if (window.App.notify) window.App.notify('상담 숙제 도착', rec.text);
    }
    this.render();
    return rec;
  },

  async complete(id) {
    const list = this.all();
    const h = list.find(x => x.id === id);
    if (!h || h.doneAt) return;
    const note = await window.UI.prompt(`"${h.text}"\n\n해보니 어땠는지 한 줄만 적어주세요.\n(상담사에게 그대로 전달돼요 · 비워도 괜찮아요)`);
    if (note === null) return;
    h.doneAt = Date.now();
    h.note = String(note || '').slice(0, 300);
    this._save(list);
    if (window.Sfx) window.Sfx.hit('levelup');
    if (window.App && window.App.stickerPop) window.App.stickerPop('proud', 1400);
    if (window.Farm && window.Farm.addWater) window.Farm.addWater(4, '상담 숙제 완료');
    this.report(h);
    this.render();
  },

  undo(id) {
    const list = this.all();
    const h = list.find(x => x.id === id);
    if (!h) return;
    // 완료로 받은 물은 되돌리면 돌려준다 (반복 눌러 물 캐는 구멍 방지)
    if (h.doneAt && window.Farm && window.Farm.takeWater) window.Farm.takeWater(4, '숙제 완료 취소');
    h.doneAt = 0;
    this._save(list);
    if (window.Sfx) window.Sfx.play('close');
    this.render();
  },

  // 수행 결과를 상담사에게 돌려보낸다
  report(h) {
    // 서버에도 알린다 — 상담사 화면에서 '했어요'와 소감을 바로 본다
    if (window.App && window.App.syncHomeworkDone) window.App.syncHomeworkDone(h);
    const body = [
      '[상담 숙제 결과]',
      '과제: ' + h.text,
      '완료: ' + new Date(h.doneAt).toLocaleString('ko-KR'),
      h.note ? '내담자 메모: ' + h.note : '(메모 없음)'
    ].join('\n');
    if (window.App && window.App.sendReportToCounselor) {
      window.App.sendReportToCounselor({ date: new Date().toLocaleDateString('ko-KR'), title: '숙제 완료', body });
    }
  },

  // 마감까지 남은 '날짜 수'. 자정 기준으로 정규화해서 센다 —
  //  Math.ceil((dueAt-now)/일) 은 시각이 섞여 하루씩 밀렸다(오늘 마감인데 '1일 남음').
  _daysLeft(h) {
    if (!h || !h.dueAt) return null;
    const due = new Date(h.dueAt); due.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
  },

  // 남은 기한 문구
  dueText(h) {
    const d = this._daysLeft(h);
    if (d == null) return '';
    if (d < 0) return `${-d}일 지남`;
    if (d === 0) return '오늘까지';
    return `${d}일 남음`;
  },

  // 미션 목록에 섞을 항목 (missions.js 가 가져간다)
  questSeeds() {
    return this.open().slice(0, 2).map(h => ({
      text: h.text.length > 22 ? h.text.slice(0, 22) + '…' : h.text,
      why: `${h.counselor}님이 낸 숙제` + (h.why ? ' · ' + h.why : ''),
      hwId: h.id
    }));
  },

  // 챗봇이 알아야 할 것
  promptContext() {
    const open = this.open();
    if (!open.length) return '';
    return '[상담사가 낸 숙제]\n'
      + open.map(h => `· ${h.text}${h.why ? ' (이유: ' + h.why + ')' : ''} — ${h.counselor}님`).join('\n')
      + '\n· 이건 사람 상담사가 낸 과제입니다. AI가 준 미션보다 우선합니다.\n'
      + '· 대신 해주거나 내용을 바꾸지 마세요. 막혀 하면 왜 어려운지 같이 풀어보고, 그 내용을 상담 때 말하라고 권하세요.';
  },

  // --------------------------------------------------------------------------
  //  화면
  // --------------------------------------------------------------------------
  render() {
    const el = document.getElementById('homework-card');
    if (!el) return;
    const esc = t => String(t == null ? '' : t).replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]));
    const list = this.all().filter(h => !h.canceled);
    const open = list.filter(h => !h.doneAt);
    const done = list.filter(h => h.doneAt);

    if (!list.length) {
      el.innerHTML = `
        <div class="my-row my-row--static">
          <span class="my-row__ico">${window.Icons ? window.Icons.svg('quest', { size: 20 }) : ''}</span>
          <span class="my-row__txt">
            <b>상담 숙제</b>
            <span>상담사와 연결되면 회기 사이에 할 과제가 여기로 와요</span>
          </span>
        </div>`;
      return;
    }

    const row = h => {
      // 마감일이 지난 뒤에만 빨간 표시 — 자정 기준으로 판정해 dueText('오늘까지')와 어긋나지 않게
      const overdue = !h.doneAt && this._daysLeft(h) != null && this._daysLeft(h) < 0;
      return `
        <div class="my-row my-row--static" style="align-items: flex-start;">
          <button onclick="window.Homework.${h.doneAt ? 'undo' : 'complete'}('${h.id}')"
            title="${h.doneAt ? '되돌리기' : '했어요'}"
            style="all: unset; cursor: pointer; flex-shrink: 0; width: 18px; height: 18px; margin-top: 3px; border-radius: 6px;
                   display: inline-flex; align-items: center; justify-content: center;
                   background: ${h.doneAt ? 'var(--accent-primary)' : 'transparent'};
                   border: 1.5px solid ${h.doneAt ? 'var(--accent-primary)' : (overdue ? '#c14a4a' : 'var(--text-muted)')};">
            ${h.doneAt ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>' : ''}
          </button>
          <span class="my-row__txt" style="margin-left: 0.55rem;">
            <b style="text-decoration: ${h.doneAt ? 'line-through' : 'none'}; color: ${h.doneAt ? 'var(--text-muted)' : 'var(--text-primary)'};">${esc(h.text)}</b>
            <span>
              ${esc(h.counselor)}님${h.why ? ' · ' + esc(h.why) : ''}
              ${h.dueAt && !h.doneAt ? `<b style="color: ${overdue ? '#c14a4a' : 'var(--accent-primary)'};"> · ${this.dueText(h)}</b>` : ''}
              ${h.doneAt && h.note ? `<br><i style="opacity:0.8;">"${esc(h.note)}"</i>` : ''}
            </span>
          </span>
        </div>`;
    };

    el.innerHTML = `
      <div class="my-row my-row--static">
        <span class="my-row__ico" style="color: var(--accent-primary);">${window.Icons ? window.Icons.svg('quest', { size: 20 }) : ''}</span>
        <span class="my-row__txt">
          <b>상담 숙제</b>
          <span>${open.length ? `${open.length}개 남았어요 · 회기 사이에 하는 게 상담 효과를 좌우해요` : '남은 숙제가 없어요'}</span>
        </span>
      </div>
      ${open.map(row).join('')}
      ${done.length ? `
        <div class="my-row__body">
          <details>
            <summary style="cursor: pointer; font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">완료한 숙제 ${done.length}개</summary>
            <div style="margin-top: 0.3rem;">${done.slice(0, 8).map(row).join('')}</div>
          </details>
        </div>` : ''}`;
  }
};
