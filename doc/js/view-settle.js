// ── 정산 — 상담소 채널 상담의 상담료 · 앱 입금 · 상담사 지급 기록 · 정산 계좌 ─────
//  상담소 채널(소속 상담사의 모든 상담 + 상담소와 연결된 내담자의 상담)은 상담소 90 · 앱 7 · 결제 수수료 3.
//  앱은 상담소 계좌로만 보내고, 상담사에게는 상담소가 직접 지급한다(의료법 제27조 — 앱이 상담사에게 직접 주면 내담자 유인 소지).
//  그래서 이 화면은 '앱에서 상담소로 들어온 돈'과 '상담소가 상담사에게 보낸 돈'을 나란히 둔다.
LOADERS.settle = () => hget('settle').then(d => (d && d.items) ? (DATA.settle = d) : null);
const SE = { month: '' };

function settleRows() {
  const d = DATA.settle; if (!d) return [];
  return d.items.filter(x => !SE.month || monthKey(x.at) === SE.month);
}
function settleCsv() {
  const rows = [['일시', '종류', '채널', '내담자', '상담사', '상담료', '상담소 몫', '앱 몫', '결제 수수료', '앱 입금일', '상담사 지급액']];
  settleRows().forEach(x => rows.push([fmtDate(x.at) + ' ' + fmtTime(x.at), x.label, x.channel === 'referral' ? '소개 20%' : '소속 90%', x.clientName, x.counselor, x.gross, x.hospital, x.platform, x.pg, x.appPaidAt ? fmtDate(x.appPaidAt) : '', x.channel === 'referral' ? '앱이 지급' : x.paidToCounselor]));
  downloadCsv('정산_' + (SE.month || '전체') + '.csv', rows);
}
function bankCardHtml() {
  const info = DATA.info;
  if (!info) return `<div class="card">${ST.info === 'err' ? '<p class="muted">계좌 정보를 불러오지 못했어요.</p>' : loadingHtml()}</div>`;
  const b = info.bank || { set: false };
  return `
    <div class="card ${b.set ? '' : 'warnbox'}" id="bank-card">
      <div class="row wrap" style="gap:0.6rem;">
        <div class="grow">
          <b style="font-size:0.9rem;" class="${b.set ? '' : 'danger-t'}">정산 계좌 ${b.set ? '' : '— 아직 없어요'}</b>
          <p class="muted" style="margin-top:0.15rem;">${b.set ? `<b>${esc(b.bank)}</b> ${esc(b.masked)} · 예금주 ${esc(b.holder)} <span class="muted">(보안을 위해 전체 번호는 다시 보여드리지 않아요)</span>` : '앱이 상담소 몫(90%)을 보낼 계좌예요. 상담소 명의(사업자) 계좌를 등록해주세요. 없으면 정산이 보류됩니다.'}</p>
        </div>
        <button class="btn ${b.set ? 'ghost' : ''} sm" data-act="bank-edit">${b.set ? '계좌 바꾸기' : '계좌 등록'}</button>
      </div>
      ${info.migrated === false ? '<p class="muted danger-t" style="margin-top:0.4rem;">계좌 칸이 서버에 아직 준비되지 않았어요 (운영팀 마이그레이션 필요).</p>' : ''}
    </div>`;
}
async function editBank() {
  const b = (DATA.info && DATA.info.bank) || {};
  modal({ title: '상담소 정산 계좌', acts: false, html: `
    <p class="muted" style="margin:0.3rem 0 0.6rem;">계좌 정보는 정산 목적으로만 쓰이며 내담자·상담사에게 보이지 않아요.</p>
    <label class="f"><span>은행</span><input id="bk-bank" placeholder="예: 국민은행" value="${esc(b.bank || '')}"></label>
    <label class="f"><span>계좌번호</span><input id="bk-no" placeholder="숫자와 - 만" inputmode="numeric" autocomplete="off"></label>
    <label class="f"><span>예금주 (상담소 명의)</span><input id="bk-holder" placeholder="예: 마음숲심리상담소" value="${esc(b.holder || '')}"></label>
    <div class="acts"><button class="btn ghost" data-act="modal-cancel">취소</button><button class="btn" data-act="bank-save">저장</button></div>` });
  setTimeout(() => { const f = $('bk-bank'); if (f) f.focus(); }, 80);
}
async function saveBank(btn) {
  const bank = $('bk-bank').value.trim(), no = $('bk-no').value.trim(), holder = $('bk-holder').value.trim();
  if (!bank || no.replace(/[^0-9]/g, '').length < 6 || !holder) { toast('은행·계좌번호·예금주를 모두 적어주세요'); return; }
  btn.disabled = true;
  const r = await hpost('bank', { bank, bankNo: no, holder });
  btn.disabled = false;
  if (!r || !r.ok) { toast(r && r.error === 'migrate' ? '계좌 칸이 서버에 아직 준비되지 않았어요 (운영팀 마이그레이션 필요)' : '저장하지 못했어요'); return; }
  closeModal(null); toast('정산 계좌를 저장했어요');
  if (DATA.info) DATA.info.bank = r.bank;
  loadKey('dash', true); render(true);
}

VIEWS.settle = {
  title: '정산', keys: ['settle', 'info'],
  sub: () => DATA.settle ? `상담소 채널 상담 ${DATA.settle.items.length}건 (최근 400일)` : '',
  html() {
    const g = gate(['settle'], 'settle'); if (g) return g;
    const d = DATA.settle, rows = settleRows();
    const months = [...new Set(d.items.map(x => monthKey(x.at)))].sort().reverse();
    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
    const own = rows.filter(x => !(x.channel === 'referral' || x.counselorByApp));
    const t = { gross: sum(rows, 'gross'), hospital: sum(rows, 'hospital'), received: rows.filter(x => x.appPaidAt).reduce((a, x) => a + x.hospital, 0), paidOut: sum(rows, 'paidToCounselor'), due: sum(own, 'hospital'), referral: sum(rows.filter(x => x.channel === 'referral' || x.counselorByApp), 'hospital') };
    // 상담사별 요약은 '상담소가 상담사에게 줄 돈'을 보는 표라 소속(90%) 건만 — 소개 건은 앱이 상담사에게 직접 준다
    const by = {};
    rows.filter(x => !(x.channel === 'referral' || x.counselorByApp)).forEach(x => { (by[x.counselorId] = by[x.counselorId] || { name: x.counselor, list: [] }).list.push(x); });
    return `
      <div class="card notebox">
        <b style="font-size:0.9rem;">돈은 이렇게 흘러요</b>
        <p class="muted" style="margin-top:0.2rem;"><b>소속(90%)</b> — 상담소 채널 상담(<b>소속 상담사의 모든 상담</b> + <b>상담소와 연결된 내담자가 소속 상담사와 한 상담</b>)의 상담료는 <b>상담소 90% · 마인드 인사이드 7% · 결제 수수료 3%</b>로 나뉩니다. 앱이 상담소 계좌로 90%를 보내고, 상담사에게는 상담소가 직접 지급합니다. 지급한 뒤 '지급 기록'을 눌러 남겨주세요.<br>
        <b>소개(20%)</b> — 상담소와 연결된 내담자가 <b>소속이 아닌 개인 상담사</b>와 상담하면 상담소는 <b>소개료 20%</b>만 받고, 상담사에게는 앱이 직접 지급합니다(지급 기록 칸 없음). 그 밖의 개인 상담사 상담은 여기에 나오지 않습니다. 회기 기록이 없는 상담은 정산에 올라가지 않습니다.</p>
      </div>
      ${bankCardHtml()}
      <div class="filters">
        <select id="se-month"><option value="">전체 기간</option>${months.map(m => `<option value="${m}" ${SE.month === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
        <span class="muted">${rows.length}건</span>
        <button class="btn ghost sm right" data-act="settle-csv">CSV 내보내기</button>
      </div>
      <div class="stats">
        <div class="stat"><div class="lb">총 상담료</div><b>${won(t.gross)}<span class="u">원</span></b></div>
        <div class="stat hi"><div class="lb">상담소 몫</div><b>${won(t.hospital)}<span class="u">원</span></b><div class="sb">소속 90% ${won(t.due)}원 · 소개 20% ${won(t.referral)}원</div></div>
        <div class="stat"><div class="lb">앱에서 받은 금액</div><b>${won(t.received)}<span class="u">원</span></b><div class="sb">입금 대기 ${won(t.hospital - t.received)}원</div></div>
        <div class="stat ${t.paidOut < t.due ? 'gold' : ''}"><div class="lb">상담사에게 지급 기록</div><b>${won(t.paidOut)}<span class="u">원</span></b><div class="sb">${t.paidOut < t.due ? `기록 없음 ${won(t.due - t.paidOut)}원 (소속 건만)` : '모두 기록됨'}</div></div>
      </div>
      <div class="sec-title">상담사별 요약</div>
      ${Object.keys(by).length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>상담사</th><th class="r">상담</th><th class="r">상담료</th><th class="r">상담소 몫</th><th class="r">지급 기록</th><th>상태</th></tr></thead><tbody>
        ${Object.entries(by).map(([cid, o]) => { const due = sum(o.list, 'hospital'), paid = sum(o.list, 'paidToCounselor'); return `
          <tr><td><div class="row">${avatar(o.name, 'sm')}<b>${esc(o.name)}</b></div></td><td class="r num">${o.list.length}건</td><td class="r num">${won(sum(o.list, 'gross'))}원</td><td class="r num">${won(due)}원</td><td class="r num">${won(paid)}원</td>
            <td>${paid >= due ? '<span class="chip ok">기록 완료</span>' : `<span class="chip gold">미기록 ${won(due - paid)}원</span>`}</td></tr>`; }).join('')}
        </tbody></table></div>` : ''}
      <div class="sec-title">건별 내역</div>
      ${rows.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th class="t">일시</th><th>내담자</th><th>상담사</th><th>종류</th><th>채널</th><th class="r">상담료</th><th class="r">상담소 몫</th><th>앱 입금</th><th class="r">상담사 지급</th><th class="acts"></th></tr></thead><tbody>
        ${rows.map(x => { const ref = x.channel === 'referral' || x.counselorByApp; return `
          <tr><td class="t sub">${fmtDT(x.at)}</td>
            <td>${x.clientId && (DATA.patients || []).some(p => p.clientId === x.clientId) ? `<button class="btn ghost xs" data-act="open-patient" data-id="${esc(x.clientId)}">${esc(x.clientName || '내담자')}</button>` : esc(x.clientName || '내담자')}</td>
            <td>${esc(x.counselor)}</td><td class="sub">${esc(x.label || (x.kind === 'call' ? '전화 상담' : '예약 상담'))}</td>
            <td>${ref ? '<span class="chip blue" title="연결된 내담자 + 개인 상담사 — 상담소 소개료 20%, 상담사에게는 앱이 지급">소개 20%</span>' : '<span class="chip ok" title="소속 상담사 — 상담소 90%, 상담사에게는 상담소가 지급">소속 90%</span>'}</td>
            <td class="r num">${won(x.gross)}원</td><td class="r num"><b>${won(x.hospital)}원</b></td>
            <td>${x.appPaidAt ? `<span class="chip ok">${fmtDay(x.appPaidAt)} 입금</span>` : '<span class="chip off">대기</span>'}</td>
            <td class="r num">${ref ? '<span class="muted" title="앱이 상담사에게 직접 지급">앱이 지급</span>' : x.paidToCounselor ? `<span class="chip ok">${won(x.paidToCounselor)}원</span>` : '<span class="muted">—</span>'}</td>
            <td class="acts">${(ref || x.paidToCounselor) ? '' : `<button class="btn soft xs" data-act="pay" data-id="${esc(x.id)}" data-kind="${esc(x.kind)}" data-cid="${esc(x.counselorId)}" data-amt="${x.hospital}" data-nm="${esc(x.counselor)}">지급 기록</button>`}</td></tr>`; }).join('')}
        </tbody><tfoot><tr><td colspan="5">합계 ${rows.length}건</td><td class="r num">${won(t.gross)}원</td><td class="r num">${won(t.hospital)}원</td><td></td><td class="r num">${won(t.paidOut)}원</td><td></td></tr></tfoot></table></div>`
        : empty('아직 정산할 상담이 없어요', '소속 상담사의 상담이나 상담소 코드로 연결된 내담자의 상담이 완료되면 여기에 쌓여요.')}
      ${d.payouts && d.payouts.length ? `<div class="sec-title">지급 기록 <span class="right">${d.payouts.length}건</span></div><div class="card pad0"><table class="tbl"><thead><tr><th class="t">지급일</th><th>상담사</th><th class="r">금액</th><th>메모</th></tr></thead><tbody>
        ${d.payouts.slice(0, 50).map(p => { const c = d.items.find(x => x.counselorId === p.counselorId); return `<tr><td class="t sub">${fmtDate(p.paidAt)}</td><td>${esc(c ? c.counselor : p.counselorId)}</td><td class="r num">${won(p.amount)}원</td><td class="sub">${esc(p.memo || '')}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
  }
};

async function recordPayout(el) {
  const v = await modal({ title: `${el.dataset.nm} 상담사에게 지급 기록`, acts: false, html: `
    <p class="muted" style="margin:0.3rem 0 0.6rem;">실제로 보낸 뒤에 적어주세요. 앱은 이 돈에 관여하지 않고 기록만 보관해요 (미지급 분쟁·증빙 대비).</p>
    <label class="f"><span>보낸 금액 (원) — 상담소 몫 기준 ${won(el.dataset.amt)}원</span><input id="pay-amt" inputmode="numeric" value="${esc(el.dataset.amt)}"></label>
    <label class="f"><span>메모 (선택)</span><input id="pay-memo" maxlength="120" placeholder="예: 9월분 계좌이체"></label>
    <div class="acts"><button class="btn ghost" data-act="modal-cancel">취소</button><button class="btn" data-act="pay-save" data-id="${esc(el.dataset.id)}" data-kind="${esc(el.dataset.kind)}" data-cid="${esc(el.dataset.cid)}">기록 남기기</button></div>` });
  return v;
}
async function savePayout(btn) {
  const n = Math.max(0, Math.round(Number(String($('pay-amt').value).replace(/[^\d]/g, '')) || 0));
  if (!n) { toast('금액을 확인해주세요'); return; }
  btn.disabled = true;
  const r = await hpost('payout', { refId: btn.dataset.id, kind: btn.dataset.kind, counselorId: btn.dataset.cid, amount: n, memo: $('pay-memo').value || '' });
  btn.disabled = false;
  if (!r || !r.ok) { toast('기록하지 못했어요'); return; }
  closeModal(null); toast('지급 기록을 남겼어요');
  loadKey('settle', true); loadKey('dash', true);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'pay') recordPayout(el);
  else if (act === 'pay-save') savePayout(el);
  else if (act === 'settle-csv') settleCsv();
  else if (act === 'bank-edit') editBank();
  else if (act === 'bank-save') saveBank(el);
});
document.addEventListener('change', e => { if (e.target && e.target.id === 'se-month') { SE.month = e.target.value; render(true); } });
