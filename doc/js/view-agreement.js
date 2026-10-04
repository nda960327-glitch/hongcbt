// 제휴계약서 — 상담소 콘솔 안에서 읽고 손글씨로 서명한다 (서버: agreements.js)
//  운영자가 계약서를 [게시]하면, 아직 서명하지 않은 상담소는 콘솔에 들어올 때 서명 창이 뜬다([나중에]로 닫을 수 있다).
//  설정 맨 위 '제휴계약서' 칸에서 서명하거나, 서명한 계약서를 다시 본다. core.js 의 getJson·postJson·authQS·authBody·openPanel·closePanel·toast·esc 를 쓴다.
window.DocAgr = {
  st: null, pad: null, shown: false,
  async check(force) {
    const d = await getJson('/api/agreement/current?kind=clinic&' + authQS());
    if (!d || d.error) return;
    this.st = d;
    this.fillCard();
    if (d.needSign && (force || !this.shown)) { this.shown = true; this.open(); }
  },
  fillCard() {
    const el = document.getElementById('agr-card'); if (!el) return;
    const d = this.st;
    if (!d || (!d.published && !d.signed)) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<b style="font-size:0.9rem;">제휴계약서</b>
      <p class="muted" style="margin:0.2rem 0 0.6rem;">${d.needSign
        ? (d.signed ? `새 계약서(${d.ver}판)가 나왔어요. 다시 읽고 서명해 주세요.` : '아직 서명하지 않았어요. 읽고 서명해 주세요.')
        : `${d.signed.ver}판 · ${new Date(d.signed.at).toLocaleDateString('ko-KR')} · ${esc(d.signed.name)} 서명`}</p>
      <div class="row" style="justify-content:flex-end;">${d.needSign ? '<button class="btn sm" data-act="agr-open">읽고 서명하기</button>' : '<button class="btn sm ghost" data-act="agr-view">서명한 계약서 보기</button>'}</div>`;
  },
  open() {
    const d = this.st; if (!d) return;
    if (!d.needSign) return this.view();
    openPanel(`${d.title} · ${d.ver}판`, `
      <div class="card" style="background:var(--soft, #eaf2ec); border:0;"><p style="margin:0;">끝까지 읽고 아래에 서명해 주세요. 서명하면 이 내용 그대로 저장되고, 설정 › 제휴계약서에서 언제든 다시 볼 수 있어요.</p></div>
      <div class="card" style="font-size:0.88rem;">${window.agreementHtml(d.body)}</div>
      <div class="card">
        <label style="display:flex; gap:0.55rem; align-items:flex-start; font-weight:700;"><input type="checkbox" id="agr-ok" style="width:18px;height:18px;margin-top:0.15rem;"> 위 계약서를 모두 읽었고, 내용에 동의합니다.</label>
        <label class="f" style="margin-top:0.8rem;"><span>서명하는 사람 (대표자·소장)</span><input id="agr-name" maxlength="40" value="${esc((d.party && (d.party.signer || d.party.name)) || '')}"></label>
        <div class="row" style="justify-content:space-between; margin-top:0.6rem;"><span class="muted">아래 칸에 마우스나 손가락으로 서명해 주세요</span><button class="btn sm ghost" data-act="agr-clear">다시 쓰기</button></div>
        <canvas id="agr-pad" style="display:block; width:100%; height:170px; margin-top:0.4rem; border:1.5px dashed var(--line, #cfc6b8); border-radius:12px; background:#fff;"></canvas>
        <p class="muted" style="margin-top:0.5rem; font-size:0.76rem;">서명 그림, 서명 시각, 접속 정보(IP·기기)와 계약서 내용의 지문이 함께 저장돼 전자 서명의 증빙이 됩니다.</p>
        <div class="row" style="justify-content:flex-end; gap:0.4rem; margin-top:0.7rem;"><button class="btn ghost" data-act="agr-later">나중에</button><button class="btn" data-act="agr-sign">서명하고 제출</button></div>
      </div>`, '', 'agr');
    const cv = document.getElementById('agr-pad');
    this.pad = cv ? window.SigPad(cv) : null;
  },
  async sign() {
    const d = this.st; if (!d) return;
    if (!(document.getElementById('agr-ok') || {}).checked) return toast('계약서를 읽고 동의에 체크해 주세요');
    const name = ((document.getElementById('agr-name') || {}).value || '').trim();
    if (name.length < 2) return toast('서명하는 사람 이름을 적어 주세요');
    if (!this.pad || this.pad.empty()) return toast('서명 칸에 서명해 주세요');
    const r = await postJson('/api/agreement/sign', authBody({ kind: 'clinic', ver: d.ver, signerName: name, signature: this.pad.png(), agree: true }));
    if (r && r.ok) {
      closePanel(); toast('서명했어요. 설정 › 제휴계약서에서 다시 볼 수 있어요');
      this.st = Object.assign({}, d, { needSign: false, signed: { ver: r.ver, at: r.at, name } });
      this.fillCard(); return;
    }
    if (r && r.error === 'stale') { toast('계약서가 방금 새로 나왔어요. 새 판을 보여 드릴게요'); return this.check(true); }
    toast('제출하지 못했어요. 잠시 뒤 다시 해 주세요');
  },
  async view() {
    const r = await getJson('/api/agreement/mine?kind=clinic&' + authQS());
    const it = r && r.item; if (!it) return toast('아직 서명한 계약서가 없어요');
    openPanel(`${it.title} · ${it.ver}판`, `
      <div class="card" style="background:var(--soft, #eaf2ec); border:0;"><b>서명 완료</b> · ${new Date(it.signed_at).toLocaleString('ko-KR')} · ${esc(it.signer_name)}</div>
      <div class="card" style="font-size:0.88rem;">${window.agreementHtml(it.body)}</div>
      <div class="card"><span class="muted">서명</span><img src="${it.signature}" alt="서명" style="display:block; max-width:100%; height:110px; object-fit:contain; margin-top:0.3rem; background:#fff; border-radius:10px;">
        <p class="muted" style="font-size:0.72rem; margin-top:0.4rem; word-break:break-all;">문서 지문(SHA-256) ${esc(it.body_hash)}</p></div>`, '', 'agr-view');
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'agr-open') DocAgr.open();
  else if (a === 'agr-view') DocAgr.view();
  else if (a === 'agr-sign') DocAgr.sign();
  else if (a === 'agr-clear') { if (DocAgr.pad) DocAgr.pad.clear(); }
  else if (a === 'agr-later') { closePanel(); toast('설정 › 제휴계약서에서 언제든 서명할 수 있어요'); }
});
// 설정 화면이 그려질 때 계약서 칸을 채운다
(function () {
  const v = VIEWS.settings; if (!v) return;
  const prev = v.after;
  v.after = function () { if (prev) prev.apply(this, arguments); DocAgr.fillCard(); };
})();
