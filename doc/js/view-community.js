// ── 커뮤니티(소식) — 글 표 · 편집기(패널) · 댓글 관리 · 상담소 페이지 ────────
//  글은 이용자 앱 홈 '커뮤니티'에 보이고, 이용자는 좋아요·댓글만 단다. 서버: community.js
//  본문 표기: '# ' 큰 글씨 · '## ' 제목 · **굵게** · {red|글}(색) · [img:0] 사진. HTML 은 전부 이스케이프.
LOADERS.posts = () => hget('posts').then(d => (d && Array.isArray(d.items)) ? (DATA.posts = d.items, DATA.profile = d.profile || {}, d) : null);
const POSTS = { comments: null, cmPost: null };

VIEWS.community = {
  title: '커뮤니티', keys: ['posts'],
  sub: () => DATA.posts ? `내 글 ${DATA.posts.length}개 · 공개 ${DATA.posts.filter(p => p.published && !p.hidden).length}개` : '',
  html() {
    const g = gate(['posts'], 'community'); if (g) return g;
    const list = DATA.posts;
    return `
      <div class="vhead">
        <p class="muted grow">공개한 글은 이용자 앱 홈 <b>커뮤니티</b>와 상담소 페이지에 바로 보여요. 개인 상담 내용이나 특정 내담자 이야기는 쓰지 마세요.</p>
        <button class="btn sm" data-act="post-new">＋ 새 글</button>
      </div>
      ${list.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th></th><th>제목</th><th>상태</th><th>고정</th><th class="r">좋아요</th><th class="r">댓글</th><th class="t">작성일</th><th class="acts"></th></tr></thead><tbody>
        ${list.map(it => `
          <tr class="${it.hidden ? 'dim' : ''}">
            <td>${it.thumb ? `<img class="thumb" src="${esc(it.thumb)}" alt="">` : '<div class="thumb"></div>'}</td>
            <td><b>${esc(it.title)}</b><div class="muted ell" style="max-width:360px;">${esc(it.excerpt || '')}</div>${it.tags && it.tags.length ? `<div class="muted">#${it.tags.map(esc).join(' #')}</div>` : ''}</td>
            <td>${it.hidden ? '<span class="chip bad">운영팀 숨김</span>' : it.published ? '<span class="chip ok">공개</span>' : '<span class="chip off">초안</span>'}</td>
            <td>${it.pinned ? '<span class="chip gold">상단 고정</span>' : ''}</td>
            <td class="r num">${it.likes || 0}</td><td class="r num">${it.comments || 0}</td>
            <td class="t sub">${fmtDate(it.created)}</td>
            <td class="acts"><button class="btn ghost xs" data-act="post-comments" data-id="${esc(it.id)}">댓글</button> <button class="btn ghost xs" data-act="post-edit" data-id="${esc(it.id)}">수정</button> <button class="btn ghost xs danger-t" data-act="post-del" data-id="${esc(it.id)}">삭제</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : empty('아직 올린 글이 없어요', '마음 돌봄 이야기, 상담소 안내, 프로그램 소식을 올려보세요.')}`;
  }
};

// ── 글 본문 표기 — 내담자 앱(js/community.js _body)과 같은 규칙. 여기서는 미리보기에 쓴다 ──
function renderPostBody(text, images) {
  const imgs = Array.isArray(images) ? images : [];
  const inline = t => esc(t)
    .replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '<span class="pc pc-$1">$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
  const fig = n => imgs[n] ? `<figure class="pfig"><img src="${esc(imgs[n])}" alt=""></figure>` : '';
  return String(text || '').split(/\n{2,}/).map(p => {
    const t = p.trim();
    if (!t) return '';
    const im = t.match(/^\[img:(\d+)\]$/);
    if (im) return fig(+im[1]);
    if (/^## /.test(t)) return '<h4 class="ph">' + inline(t.slice(3)) + '</h4>';
    if (/^# /.test(t)) return '<p class="pbig">' + inline(t.slice(2)) + '</p>';
    return '<p>' + inline(t).replace(/\[img:(\d+)\]/g, (m, n) => imgs[+n] ? '</p>' + fig(+n) + '<p>' : '') + '</p>';
  }).join('').replace(/<p><\/p>/g, '');
}
// 사진은 앱에서 먼저 작게 줄인다 — 서버(D1)에 원본을 두면 글 목록이 통째로 무거워진다.
//  긴 변 640px, 품질 0.72 → 보통 40~80KB. 그래도 100KB 를 넘으면 품질·크기를 더 깎는다.
const POST_IMG_PX = 640, POST_IMG_BUDGET = 100 * 1024, POST_IMG_MAX = 4;
const POST_THUMB_PX = 240, POST_THUMB_BUDGET = 22 * 1024;
async function decodeImage(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {} }
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); });
}
function drawScaled(img, px, budget, q0) {
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
  for (const side of [px, Math.round(px * 0.75), Math.round(px * 0.5)]) {
    const sc = Math.min(1, side / Math.max(w, h));
    cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    for (let q = q0; q >= 0.45; q -= 0.09) { const url = cv.toDataURL('image/jpeg', q); if (url.length <= budget) return url; }
  }
  return null;
}
async function shrinkPostImage(file) {
  const img = await decodeImage(file);
  const full = drawScaled(img, POST_IMG_PX, POST_IMG_BUDGET, 0.72);
  const thumb = drawScaled(img, POST_THUMB_PX, POST_THUMB_BUDGET, 0.7);
  if (img.close) img.close();
  if (!full) throw new Error('too-big');
  return { full, thumb: thumb || '' };
}
const DRAFT = { images: [], thumbs: [] };   // 편집 중인 글의 사진 (저장할 때 함께 보낸다)

function openPostEditor(id) {
  const it = id ? (DATA.posts || []).find(x => x.id === id) : null;
  DRAFT.images = (it && Array.isArray(it.images)) ? it.images.slice() : [];
  DRAFT.thumbs = DRAFT.images.map(() => '');
  if (it && it.thumb && DRAFT.images.length) DRAFT.thumbs[0] = it.thumb;
  const swatch = c => `<button type="button" class="ptool ptool-c pc-${c}" data-act="po-wrap" data-open="{${c}|" data-close="}" title="${c}">가</button>`;
  openPanel(it ? '글 고치기' : '새 글', `
    <p class="muted" style="margin-bottom:0.6rem;">이용자 앱에 그대로 보여요. 개인 상담 내용이나 특정 내담자 이야기는 쓰지 마세요.</p>
    <label class="f"><span>제목</span><input id="po-title" maxlength="80" value="${esc(it ? it.title : '')}" placeholder="예: 잠이 안 오는 밤, 이렇게 해보세요"></label>
    <div class="muted">본문</div>
    <div class="ptools">
      <button type="button" class="ptool" data-act="po-line" data-prefix="## " title="제목 줄">제목</button>
      <button type="button" class="ptool" data-act="po-line" data-prefix="# " title="큰 글씨 줄">큰 글씨</button>
      <button type="button" class="ptool" data-act="po-wrap" data-open="**" data-close="**" title="굵게"><b>굵게</b></button>
      ${['red', 'orange', 'green', 'blue', 'purple', 'gray'].map(swatch).join('')}
      <button type="button" class="ptool" data-act="po-photo" title="사진 넣기">📷 사진</button>
      <button type="button" class="ptool" data-act="po-preview" title="미리보기">미리보기</button>
    </div>
    <textarea id="po-body" rows="14" maxlength="6000" placeholder="문단은 빈 줄로 나눠주세요. 글자를 드래그해 고른 뒤 위 버튼을 누르면 굵게·색이 들어가요.">${esc(it ? it.body : '')}</textarea>
    <input id="po-file" type="file" accept="image/*" hidden>
    <div id="po-imgs" class="pimgs"></div>
    <div id="po-preview" class="card flat pprev" hidden></div>
    <label class="f" style="margin-top:0.6rem;"><span>태그 (쉼표로 구분, 5개까지)</span><input id="po-tags" maxlength="80" value="${esc(it ? (it.tags || []).join(', ') : '')}" placeholder="수면, 불안, 상담소 안내"></label>
    <div class="row wrap" style="gap:1rem;">
      <label class="row" style="gap:0.4rem; font-size:0.86rem;"><input type="checkbox" id="po-pub" ${!it || it.published ? 'checked' : ''}> 공개</label>
      <label class="row" style="gap:0.4rem; font-size:0.86rem;"><input type="checkbox" id="po-pin" ${it && it.pinned ? 'checked' : ''}> 상담소 페이지 상단 고정</label>
    </div>
    <p id="po-err" class="muted danger-t" style="display:none; margin-top:0.4rem;"></p>
    <button class="btn block" data-act="post-save" data-id="${esc(it ? it.id : '')}" style="margin-top:0.8rem;">${it ? '저장' : '올리기'}</button>`, '', 'editor');
  renderDraftImages();
  setTimeout(() => { const t = $('po-title'); if (t && !it) t.focus(); }, 80);
}
// 텍스트 영역의 선택 부분을 기호로 감싼다 (선택이 없으면 기호만 넣고 커서를 그 사이에 둔다)
function wrapSelection(open, close) {
  const ta = $('po-body'); if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
  const sel = v.slice(a, b);
  ta.value = v.slice(0, a) + open + sel + close + v.slice(b);
  ta.focus();
  const pos = sel ? a + open.length + sel.length + close.length : a + open.length;
  ta.setSelectionRange(pos, pos);
}
// 커서가 있는 줄 앞에 표기를 붙인다 (이미 있으면 뗀다)
function prefixLine(prefix) {
  const ta = $('po-body'); if (!ta) return;
  const v = ta.value, a = ta.selectionStart;
  const ls = v.lastIndexOf('\n', a - 1) + 1;
  const le = v.indexOf('\n', a); const end = le < 0 ? v.length : le;
  let line = v.slice(ls, end).replace(/^#{1,2} /, '');
  const had = v.slice(ls, end).startsWith(prefix);
  line = had ? line : prefix + line;
  ta.value = v.slice(0, ls) + line + v.slice(end);
  ta.focus(); ta.setSelectionRange(ls + line.length, ls + line.length);
}
function insertAtCursor(text) {
  const ta = $('po-body'); if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
  const before = v.slice(0, a), after = v.slice(b);
  const pad1 = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '';
  const pad2 = after && !/^\n\n/.test(after) ? (/^\n/.test(after) ? '\n' : '\n\n') : '';
  ta.value = before + pad1 + text + pad2 + after;
  const pos = (before + pad1 + text + pad2).length;
  ta.focus(); ta.setSelectionRange(pos, pos);
}
function renderDraftImages() {
  const box = $('po-imgs'); if (!box) return;
  box.innerHTML = DRAFT.images.map((src, i) => `
    <div class="pimg"><img src="${esc(src)}" alt=""><span>[img:${i}]</span>
      <button type="button" class="btn ghost xs" data-act="po-img-del" data-i="${i}">빼기</button></div>`).join('')
    + (DRAFT.images.length < POST_IMG_MAX ? '' : '<p class="muted">사진은 글 하나에 4장까지예요.</p>');
}
async function addDraftImage(file) {
  if (!file) return;
  if (DRAFT.images.length >= POST_IMG_MAX) { toast('사진은 4장까지 넣을 수 있어요'); return; }
  toast('사진을 줄이는 중…');
  try {
    const r = await shrinkPostImage(file);
    DRAFT.images.push(r.full); DRAFT.thumbs.push(r.thumb);
    insertAtCursor('[img:' + (DRAFT.images.length - 1) + ']');
    renderDraftImages();
    toast(`사진을 넣었어요 (${Math.round(r.full.length / 1024)}KB)`);
  } catch (e) { toast('이 사진은 넣을 수 없어요. 다른 사진으로 해주세요'); }
}
function removeDraftImage(i) {
  DRAFT.images.splice(i, 1); DRAFT.thumbs.splice(i, 1);
  const ta = $('po-body');
  if (ta) ta.value = ta.value.replace(/\[img:(\d+)\]/g, (m, n) => { n = +n; if (n === i) return ''; return n > i ? '[img:' + (n - 1) + ']' : m; }).replace(/\n{3,}/g, '\n\n');
  renderDraftImages();
}
function togglePreview() {
  const pv = $('po-preview'); if (!pv) return;
  if (!pv.hidden) { pv.hidden = true; return; }
  pv.innerHTML = renderPostBody($('po-body').value, DRAFT.images) || '<p class="muted">본문이 비어 있어요.</p>';
  pv.hidden = false;
}
async function savePost(btn) {
  const title = ($('po-title').value || '').trim(), body = ($('po-body').value || '').trim();
  if (!title || !body) { showErr('po-err', '제목과 본문을 적어주세요.'); return; }
  btn.disabled = true; btn.textContent = '저장 중…';
  const r = await hpost('posts/save', { post: {
    id: btn.dataset.id || '', title, body, tags: ($('po-tags').value || '').split(','),
    published: $('po-pub').checked, pinned: $('po-pin').checked,
    images: DRAFT.images, thumb: DRAFT.thumbs.find(Boolean) || '' } });
  btn.disabled = false; btn.textContent = '저장';
  if (!r || !r.ok) { showErr('po-err', r && r.error === 'too-many' ? '오늘은 글을 더 올릴 수 없어요.' : r && r.error === 'bad-image' ? '사진이 너무 커요. 사진을 빼고 다시 넣어주세요.' : '저장하지 못했어요. 잠시 뒤 다시 해주세요.'); return; }
  closePanel(); toast(r.post.published ? '공개했어요 — 이용자 앱 커뮤니티에 바로 보여요' : '초안으로 저장했어요');
  loadKey('posts', true);
}
async function deletePost(id) {
  if (!(await confirmBox({ title: '이 글을 지울까요?', body: '좋아요와 댓글도 함께 지워져요.', okLabel: '지우기', danger: true }))) return;
  const r = await hpost('posts/delete', { id });
  toast(r && r.ok ? '지웠어요' : '지우지 못했어요');
  loadKey('posts', true);
}
// ── 댓글 관리 ──
async function openComments(id) {
  POSTS.cmPost = id; POSTS.comments = null;
  renderComments();
  const d = await hget('comments?id=' + encodeURIComponent(id));
  if (POSTS.cmPost !== id) return;
  POSTS.comments = d && Array.isArray(d.comments) ? d.comments : [];
  renderComments();
}
function renderComments() {
  const it = (DATA.posts || []).find(x => x.id === POSTS.cmPost) || {};
  const cm = POSTS.comments;
  openPanel('댓글 · ' + (it.title || ''), `
    <p class="muted" style="margin-bottom:0.6rem;">이용자 댓글이에요. 숨기면 이용자 앱에서 보이지 않아요. 상담소 이름으로 답글을 달 수 있어요.</p>
    ${cm === null ? loadingHtml() : cm.length ? cm.map(c => `
      <div class="card flat" style="margin-bottom:0.4rem; padding:0.6rem 0.8rem; ${c.hidden ? 'opacity:0.55;' : ''} ${c.byHospital ? 'border-color: var(--accent);' : ''}">
        <div class="row wrap" style="gap:0.4rem;"><b class="small">${esc(c.name)}</b>${c.byHospital ? '<span class="chip ok">상담소</span>' : ''}${c.hidden ? '<span class="chip off">숨김</span>' : ''}<span class="muted right">${fmtDT(c.ts)}</span></div>
        <p class="pre small" style="margin:0.25rem 0 0;">${esc(c.text)}</p>
        ${c.byHospital ? '' : `<div class="row" style="justify-content:flex-end; margin-top:0.3rem;"><button class="btn ghost xs" data-act="cm-hide" data-cid="${esc(c.id)}" data-hidden="${c.hidden ? 0 : 1}">${c.hidden ? '다시 보이기' : '숨기기'}</button></div>`}
      </div>`).join('') : empty('아직 댓글이 없어요')}
    <div class="row" style="gap:0.4rem; margin-top:0.6rem; align-items:flex-end;">
      <textarea id="cm-reply" rows="2" maxlength="500" placeholder="상담소 이름으로 답글 남기기" style="flex:1;"></textarea>
      <button class="btn sm" data-act="cm-reply">답글</button>
    </div>`, '', 'comments');
}
async function hideComment(cid, hidden) {
  const r = await hpost('comments/hide', { cid, hidden: !!hidden });
  if (r && r.ok && POSTS.comments) { const c = POSTS.comments.find(x => x.id === cid); if (c) c.hidden = !!hidden; renderComments(); }
  else toast('처리하지 못했어요');
}
async function replyComment(btn) {
  const ta = $('cm-reply'); const text = (ta.value || '').trim();
  if (!text) { ta.focus(); return; }
  btn.disabled = true;
  const r = await hpost('comments/reply', { id: POSTS.cmPost, text });
  btn.disabled = false;
  if (r && r.ok) { POSTS.comments = (POSTS.comments || []).concat([r.comment]); renderComments(); toast('답글을 남겼어요'); }
  else toast('답글을 남기지 못했어요');
}

// ── 상담소 페이지 — 편집 + 이용자 앱 카드 미리보기 ──
VIEWS.page = {
  title: '상담소 페이지', keys: ['posts'], sub: '이용자 앱에서 상담소 이름을 누르면 보이는 소개',
  html() {
    const g = gate(['posts'], 'page'); if (g) return g;
    const p = DATA.profile || {}, h = DATA.hospital || {};
    return `
      <div class="grid2">
        <div class="card">
          <b style="font-size:0.9rem;">소개 고치기</b>
          <p class="muted" style="margin:0.2rem 0 0.7rem;">이름·전문 분야는 운영팀이 바꿔요. 소개에도 글 본문과 같은 표기(**굵게**, {green|색})를 쓸 수 있어요.</p>
          <label class="f"><span>소개</span><textarea id="pf-intro" rows="7" maxlength="600" placeholder="어떤 고민을 함께 다루는지, 어떤 분위기인지 편하게 적어주세요.">${esc(p.intro || '')}</textarea></label>
          <label class="f"><span>운영시간</span><input id="pf-hours" maxlength="200" value="${esc(p.hours || '')}" placeholder="평일 10:00–20:00 · 토 10:00–15:00"></label>
          <label class="f"><span>전화</span><input id="pf-tel" maxlength="30" value="${esc(p.tel || '')}" placeholder="02-000-0000" inputmode="tel"></label>
          <label class="f"><span>주소</span><input id="pf-addr" maxlength="120" value="${esc(p.addr || '')}" placeholder="서울시 ○○구 ○○로 00, 3층"></label>
          <label class="f"><span>홈페이지·블로그</span><input id="pf-url" maxlength="200" value="${esc(p.url || '')}" placeholder="https://" inputmode="url"></label>
          <div class="row" style="gap:0.4rem; justify-content:flex-end;"><button class="btn ghost sm" data-act="profile-preview">미리보기 갱신</button><button class="btn sm" data-act="profile-save">저장</button></div>
        </div>
        <div>
          <div class="sec-title">이용자 앱에서 보이는 모습</div>
          <div class="card hosp-prev" id="hosp-prev">${hospPreviewHtml(p, h)}</div>
        </div>
      </div>`;
  }
};
function hospPreviewHtml(p, h) {
  return `
    <div class="head"><span class="av">${esc((h.name || '상').slice(0, 1))}</span><div><h3>${esc(h.name || '')}</h3><p class="muted">${esc([h.dept, h.doctor ? h.doctor + ' 소장' : ''].filter(Boolean).join(' · ') || '심리상담')}${DATA.dash ? ` · 연결 내담자 ${DATA.dash.patients}명` : ''}</p></div></div>
    ${p.intro ? `<div class="intro">${renderPostBody(p.intro, [])}</div>` : '<p class="muted intro">아직 소개글이 없어요.</p>'}
    <div class="facts">${p.hours ? `<div><b>운영시간</b><span>${esc(p.hours)}</span></div>` : ''}${p.addr ? `<div><b>주소</b><span>${esc(p.addr)}</span></div>` : ''}${p.tel ? `<div><b>전화</b><span>${esc(p.tel)}</span></div>` : ''}</div>
    <div class="btns">${p.tel ? '<span class="btn sm">전화하기</span>' : ''}${p.url ? '<span class="btn ghost sm">홈페이지</span>' : ''}<span class="btn ghost sm">상담소 코드로 연결</span></div>
    <p class="muted" style="margin-top:0.6rem;">아래에 공개한 글 목록이 이어져요.</p>`;
}
function profileFromForm() { return { intro: $('pf-intro').value, hours: $('pf-hours').value, tel: $('pf-tel').value, addr: $('pf-addr').value, url: $('pf-url').value }; }
async function saveProfile(btn) {
  btn.disabled = true;
  const r = await hpost('profile', { profile: profileFromForm() });
  btn.disabled = false;
  if (r && r.ok) { DATA.profile = r.profile; if (DATA.info) { DATA.info.tel = r.profile.tel; DATA.info.addr = r.profile.addr; } toast('상담소 페이지를 저장했어요'); render(true); }
  else toast('저장하지 못했어요');
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'post-new') { if (DATA.posts == null) loadKey('posts'); openPostEditor(''); }
  else if (act === 'post-edit') openPostEditor(el.dataset.id);
  else if (act === 'post-save') savePost(el);
  else if (act === 'po-wrap') wrapSelection(el.dataset.open, el.dataset.close);
  else if (act === 'po-line') prefixLine(el.dataset.prefix);
  else if (act === 'po-photo') { const f = $('po-file'); if (f) { f.value = ''; f.click(); } }
  else if (act === 'po-img-del') removeDraftImage(+el.dataset.i);
  else if (act === 'po-preview') togglePreview();
  else if (act === 'post-del') deletePost(el.dataset.id);
  else if (act === 'post-comments') openComments(el.dataset.id);
  else if (act === 'cm-hide') hideComment(el.dataset.cid, el.dataset.hidden === '1');
  else if (act === 'cm-reply') replyComment(el);
  else if (act === 'profile-save') saveProfile(el);
  else if (act === 'profile-preview') { const pv = $('hosp-prev'); if (pv) pv.innerHTML = hospPreviewHtml(profileFromForm(), DATA.hospital || {}); }
});
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'po-file' && e.target.files && e.target.files[0]) addDraftImage(e.target.files[0]);
});
