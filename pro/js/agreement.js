// 입점계약서 — 앱 안에서 읽고 손글씨로 서명한다 (서버: agreements.js)
//  운영자가 계약서를 [게시]하면, 아직 그 판에 서명하지 않은 상담사에게 앱을 열 때마다 서명 창이 뜬다([나중에]로 닫을 수 있다).
//  서명하면 그 순간의 본문·서명 그림·시각이 서버에 남고, 설정 › 입점계약서에서 언제든 다시 볼 수 있다.
//  app.js 의 getJson·postJson·authQS·authBody·sheet·closeSheet·toast·esc 를 쓴다(이 파일은 app.js 다음에 읽힌다).
window.ProAgr = {
  st: null,          // /agreement/current 응답
  pad: null,
  shown: false,      // 이번 실행에서 이미 띄웠으면 다시 띄우지 않는다
  async check(force) {
    const d = await getJson('/api/agreement/current?kind=counselor&' + authQS());
    if (!d || d.error) return;
    this.st = d;
    if (d.needSign && (force || !this.shown)) { this.shown = true; this.open(); }
  },
  // 설정 메뉴 한 줄
  rowHtml() {
    const d = this.st;
    if (!d || (!d.published && !d.signed)) return '';
    const need = d.needSign;
    const sub = need ? (d.signed ? `새 계약서(${d.ver}판)가 나왔어요 — 다시 서명해 주세요` : '아직 서명하지 않았어요') : `${d.signed.ver}판 · ${new Date(d.signed.at).toLocaleDateString('ko-KR')} 서명`;
    return `<button class="menurow" data-act="agr-open"><span class="mi"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 13h6M9 17h3"/><path d="M14 3v5h5"/></svg></span>
      <span class="grow">입점계약서<br><span class="ms">${sub}</span></span>${need ? '<span class="chip new">서명 필요</span>' : ''}<span style="color:var(--sub); line-height:0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></span></button>`;
  },
  async open() {
    if (!this.st) await this.check();
    const d = this.st; if (!d) return toast('계약서를 불러오지 못했어요');
    if (!d.needSign) return this.openSigned();
    sheet(`
      <div class="card" style="background:var(--accent-soft, #eaf2ec); border:0;">
        <b>${esc(d.title)} · ${d.ver}판</b>
        <p class="muted" style="margin:0.3rem 0 0;">끝까지 읽고 아래에 서명해 주세요. 서명하면 이 내용 그대로 저장되고, 설정 › 입점계약서에서 언제든 다시 볼 수 있어요.</p>
      </div>
      <div class="card" id="agr-body" style="font-size:0.9rem;">${window.agreementHtml(d.body)}</div>
      <div class="card">
        <label style="display:flex; gap:0.55rem; align-items:flex-start; font-weight:700;"><input type="checkbox" id="agr-ok" style="width:20px;height:20px;margin-top:0.1rem;"> 위 계약서를 모두 읽었고, 내용에 동의합니다.</label>
        <label style="display:block; margin-top:0.8rem;"><span class="muted">서명하는 사람 이름</span>
          <input id="agr-name" maxlength="40" value="${esc((d.party && (d.party.signer || d.party.name)) || '')}" style="margin-top:0.3rem;"></label>
        <div class="row" style="justify-content:space-between; margin-top:0.8rem;"><span class="muted">아래 칸에 손가락으로 서명해 주세요</span><button class="btn sm ghost" data-act="agr-clear">다시 쓰기</button></div>
        <canvas id="agr-pad" style="display:block; width:100%; height:170px; margin-top:0.4rem; border:1.5px dashed var(--line, #cfc6b8); border-radius:12px; background:#fff;"></canvas>
        <p class="muted" style="margin-top:0.5rem; font-size:0.78rem;">서명 그림, 서명 시각, 접속 정보(IP·기기)와 계약서 내용의 지문이 함께 저장돼 전자 서명의 증빙이 됩니다.</p>
      </div>`,
    { title: '입점계약서 서명', sub: `${esc(d.party ? d.party.name : '')} 선생님`, kind: 'agr',
      foot: '<button class="btn ghost" data-act="agr-later" style="flex:1;">나중에</button><button class="btn" data-act="agr-sign" style="flex:2;">서명하고 제출</button>' });
    const cv = document.getElementById('agr-pad');
    this.pad = cv ? window.SigPad(cv) : null;
  },
  clear() { if (this.pad) this.pad.clear(); },
  later() { closeSheet(); toast('설정 › 입점계약서에서 언제든 서명할 수 있어요'); },
  async sign() {
    const d = this.st; if (!d) return;
    if (!(document.getElementById('agr-ok') || {}).checked) return toast('계약서를 읽고 동의에 체크해 주세요');
    const name = ((document.getElementById('agr-name') || {}).value || '').trim();
    if (name.length < 2) return toast('서명하는 사람 이름을 적어 주세요');
    if (!this.pad || this.pad.empty()) return toast('서명 칸에 서명해 주세요');
    const r = await postJson('/api/agreement/sign', authBody({ kind: 'counselor', ver: d.ver, signerName: name, signature: this.pad.png(), agree: true }));
    if (r && r.ok) {
      closeSheet(); toast('서명했어요. 설정 › 입점계약서에서 다시 볼 수 있어요');
      this.st = Object.assign({}, d, { needSign: false, signed: { ver: r.ver, at: r.at, name } });
      return;
    }
    if (r && r.error === 'stale') { toast('계약서가 방금 새로 나왔어요. 새 판을 보여 드릴게요'); this.st = null; return this.check(true); }
    toast('제출하지 못했어요. 잠시 뒤 다시 해 주세요');
  },
  async openSigned() {
    const r = await getJson('/api/agreement/mine?kind=counselor&' + authQS());
    const it = r && r.item;
    if (!it) return toast('아직 서명한 계약서가 없어요');
    sheet(`
      <div class="card" style="background:var(--accent-soft, #eaf2ec); border:0;"><b>${esc(it.title)} · ${it.ver}판 · 서명 완료</b>
        <p class="muted" style="margin:0.3rem 0 0;">${new Date(it.signed_at).toLocaleString('ko-KR')} · ${esc(it.signer_name)}</p></div>
      <div class="card" style="font-size:0.9rem;">${window.agreementHtml(it.body)}</div>
      <div class="card"><span class="muted">서명</span><img src="${it.signature}" alt="서명" style="display:block; max-width:100%; height:110px; object-fit:contain; margin-top:0.3rem; background:#fff; border-radius:10px;">
        <p class="muted" style="font-size:0.74rem; margin-top:0.4rem; word-break:break-all;">문서 지문(SHA-256) ${esc(it.body_hash)}</p></div>`,
    { title: '입점계약서', sub: '내가 서명한 계약서' });
  }
};
