// ============================================================================
//  상담소 블로그 — 소속 상담사가 상담소 소식(이용자 앱 '커뮤니티')에 글을 쓴다.
//
//  전에는 소장만 소장 콘솔(PC)에서 쓸 수 있었다. 상담사는 폰으로 일하니, 폰에서 한 손으로 쓸 수 있어야 한다.
//   · 홈 › 관리 › '상담소 블로그' 와 설정 › '블로그 글쓰기' 에서 연다.
//   · 막막하지 않게: 글감을 고르면 제목과 뼈대가 채워진다. 쓰는 도중 닫아도 이 기기에 남는다(자동 임시저장).
//   · 꾸미기는 버튼으로: 소제목 · 큰 글씨 · 굵게 · 색 · 사진. 미리보기는 이용자 앱에서 보이는 모습 그대로.
//   · 소속이 확인된 상담사만 쓴다(서버가 다시 확인). 글에는 '○○ 상담사'로 이름이 붙고, 소장은 소장 콘솔에서 모두 관리한다.
//  서버: community.js /pro/posts · 본문 표기는 소장 콘솔(doc/js/view-community.js)·이용자 앱(js/community.js)과 같다.
//  app.js 뒤에 불러온다 — api·sheet·toast·ACT 같은 것은 거기 것을 그대로 쓴다.
// ============================================================================
const BLOG = { items: null, canWrite: false, pending: false, hospital: null, busy: false, d: null, mode: 'edit' };
const BLOG_DRAFT_KEY = 'pro_blog_draft';
const BLOG_IMG_MAX = 4, BLOG_IMG_PX = 640, BLOG_IMG_BUDGET = 100 * 1024, BLOG_THUMB_PX = 240, BLOG_THUMB_BUDGET = 22 * 1024;
const BLOG_COLORS = ['green', 'blue', 'orange', 'red', 'purple'];
const BLOG_TAGS = ['마음 돌봄', '수면', '불안', '우울', '관계', '스트레스', '상담 안내'];
// 글감 — 고르면 제목과 뼈대가 채워진다. 뼈대의 괄호 부분만 바꿔 써도 글 한 편이 된다.
const BLOG_SEEDS = [
  { k: '마음 돌봄 팁', title: '잠이 안 오는 밤, 이렇게 해보세요', tags: ['수면', '마음 돌봄'],
    body: '# (한 문장으로 — 이 글이 누구에게 도움이 되는지)\n\n## 왜 이런 일이 생길까요\n\n(쉬운 말로 두세 문장)\n\n## 오늘 해볼 수 있는 한 가지\n\n(구체적인 방법 하나. 5분 안에 할 수 있는 것으로)\n\n## 이럴 땐 도움을 받으세요\n\n(혼자 해결하기 어려운 신호)' },
  { k: '자주 받는 질문', title: '상담에서 자주 받는 질문 — ', tags: ['상담 안내'],
    body: '# "(자주 듣는 질문을 그대로 적어주세요)"\n\n상담실에서 정말 자주 듣는 질문이에요.\n\n## 제 답은 이래요\n\n(쉬운 말로)\n\n## 덧붙이고 싶은 말\n\n(안심이 되는 한마디)' },
  { k: '상담사 소개', title: '안녕하세요, 상담사 ○○○입니다', tags: ['상담 안내'],
    body: '# (어떤 마음으로 상담하는지 한 문장)\n\n## 이런 고민을 주로 함께해요\n\n(예: 불안, 관계, 직장 스트레스)\n\n## 상담은 이렇게 진행돼요\n\n(첫 상담에서 무엇을 하는지)\n\n## 처음 오시는 분께\n\n(망설이는 분에게 건네는 말)' },
  { k: '추천', title: '요즘 내담자분들께 권하는 것 — ', tags: ['마음 돌봄'],
    body: '# (책·습관·영상 등 무엇을 권하는지)\n\n## 왜 권하는지\n\n(어떤 분에게 도움이 되는지)\n\n## 이렇게 해보세요\n\n(시작하는 방법)' }
];

const blogCanSee = () => !!(ME && ME.hospitalId);
const blogBlank = () => ({ id: '', title: '', body: '', tags: [], images: [], thumbs: [], published: false });

async function loadBlog() {
  if (!blogCanSee()) return;
  const d = await getJson('/api/pro/posts?' + authQS());
  if (!d || !d.ok) { if (BLOG.items === null) BLOG.items = []; return; }
  BLOG.items = d.items || []; BLOG.canWrite = !!d.canWrite; BLOG.pending = !!d.pending; BLOG.hospital = d.hospital || null;
}

// ── 홈 › 관리 의 접힌 칸 ──
function blogFoldHtml() {
  if (!blogCanSee()) return '';
  if (BLOG.items === null && !BLOG.busy) { BLOG.busy = true; loadBlog().then(() => { BLOG.busy = false; renderHome(); }); }
  const n = (BLOG.items || []).length, pub = (BLOG.items || []).filter(p => p.published && !p.hidden).length;
  const draft = lsGet(BLOG_DRAFT_KEY, null);
  const sum = BLOG.items === null ? '' : draft && (draft.title || draft.body) ? '<b style="color:var(--accent);">쓰던 글이 있어요</b>' : n ? `글 ${n}개 · 공개 ${pub}` : '첫 글을 써보세요';
  return fold('blog', '상담소 블로그', sum, blogListHtml());
}
function blogListHtml() {
  if (BLOG.items === null) return '<p class="muted">불러오는 중…</p>';
  if (!BLOG.canWrite) return `<p class="muted">${BLOG.pending ? '소속 상담소의 소장이 소속을 확인하면 글을 쓸 수 있어요.' : '소속 상담소가 확인된 상담사만 글을 쓸 수 있어요.'}</p>`;
  const draft = lsGet(BLOG_DRAFT_KEY, null);
  const hasDraft = !!(draft && (draft.title || draft.body));
  return `
    <p class="muted" style="margin-bottom:0.7rem;">이용자 앱 <b>커뮤니티</b>와 ${esc((BLOG.hospital && BLOG.hospital.name) || '상담소')} 페이지에 <b>${esc(ME.name || '')} 상담사</b> 이름으로 올라가요.</p>
    <button class="btn" data-act="blog-new">${hasDraft ? '쓰던 글 이어서 쓰기' : '＋ 새 글 쓰기'}</button>
    ${BLOG.items.length ? `<div style="margin-top:0.6rem;">${BLOG.items.map(blogRowHtml).join('')}</div>`
      : '<p class="muted" style="text-align:center; margin-top:0.9rem;">아직 쓴 글이 없어요. 마음 돌봄 팁이나 자주 받는 질문부터 가볍게 시작해 보세요.</p>'}`;
}
function blogRowHtml(it) {
  const st = it.hidden ? '<span class="chip bad">운영팀 숨김</span>' : it.published ? '<span class="chip ok">공개</span>' : '<span class="chip off">임시저장</span>';
  return `<button class="listrow blog-row" data-act="blog-edit" data-id="${esc(it.id)}">
      ${it.thumb ? `<img class="blog-thumb" src="${esc(it.thumb)}" alt="">` : ''}
      <span class="grow" style="min-width:0; text-align:left;">
        <strong class="ell" style="display:block; font-size:0.88rem;">${esc(it.title)}</strong>
        <span class="muted ell" style="display:block;">${esc(it.excerpt || '')}</span>
        <span class="muted" style="font-size:0.72rem;">${new Date(it.created).toLocaleDateString('ko-KR')} · 좋아요 ${it.likes || 0} · 댓글 ${it.comments || 0}</span>
      </span>${st}</button>`;
}

// ── 본문 표기 → 화면 (이용자 앱과 같은 규칙) ──
function blogBodyHtml(text, images) {
  const imgs = Array.isArray(images) ? images : [];
  const inline = t => esc(t)
    .replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '<span class="pc-$1">$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
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

// ── 편집기 ──
function openBlogEditor(id) {
  if (!BLOG.canWrite) { toast('소속 상담소가 확인된 뒤에 글을 쓸 수 있어요'); return; }
  const it = id ? (BLOG.items || []).find(x => x.id === id) : null;
  if (it) {
    BLOG.d = { id: it.id, title: it.title, body: it.body, tags: (it.tags || []).slice(), images: (it.images || []).slice(),
      thumbs: (it.images || []).map((x, i) => i === 0 ? (it.thumb || '') : ''), published: !!it.published };
  } else {
    const saved = lsGet(BLOG_DRAFT_KEY, null);
    BLOG.d = saved && (saved.title || saved.body) ? Object.assign(blogBlank(), saved, { id: '' }) : blogBlank();
  }
  BLOG.mode = 'edit';
  renderBlogEditor();
}
// 화면에 적힌 것을 BLOG.d 로 옮긴다 — 시트를 다시 그리기 전, 저장하기 전에 부른다
function blogSync() {
  const d = BLOG.d; if (!d) return;
  const t = $('bl-title'), b = $('bl-body'), g = $('bl-tags');
  if (t) d.title = t.value;
  if (b) d.body = b.value;
  if (g) d.tags = g.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 5);
}
// 새 글만 이 기기에 남긴다(고치는 글은 서버에 원본이 있다). 사진까지 넣으면 용량이 커서 글자만.
function blogDraftSave() {
  const d = BLOG.d; if (!d || d.id || BLOG.mode !== 'edit') return;
  blogSync();
  if (d.title || d.body) { try { localStorage.setItem(BLOG_DRAFT_KEY, JSON.stringify({ title: d.title, body: d.body, tags: d.tags })); } catch (e) {} }
  else localStorage.removeItem(BLOG_DRAFT_KEY);
  const c = $('bl-count'); if (c) c.textContent = `${d.body.length.toLocaleString()} / 6,000자 · 자동으로 임시저장돼요`;
}
function renderBlogEditor(keepScroll) {
  const d = BLOG.d;
  if (BLOG.mode === 'preview') {
    sheet(`
      <p class="muted" style="margin-bottom:0.7rem;">이용자 앱에서 이렇게 보여요.</p>
      <div class="card blog-prev">
        <p class="muted" style="font-size:0.74rem;">${esc((BLOG.hospital && BLOG.hospital.name) || '')}</p>
        <h3 style="font-size:1.08rem; margin:0.15rem 0 0.2rem;">${esc(d.title || '(제목 없음)')}</h3>
        <p class="muted" style="font-size:0.74rem; margin-bottom:0.7rem;">${esc(ME.name || '')} 상담사 · 오늘</p>
        ${d.tags.length ? `<p style="margin-bottom:0.6rem;">${d.tags.map(t => `<span class="chip off" style="margin-right:0.25rem;">${esc(t)}</span>`).join('')}</p>` : ''}
        ${blogBodyHtml(d.body, d.images) || '<p class="muted">본문이 비어 있어요.</p>'}
      </div>`,
    { title: '미리보기', back: 'blog-back-edit', kind: 'blog',
      foot: '<button class="btn ghost" data-act="blog-back-edit">계속 쓰기</button><button class="btn" data-act="blog-publish">올리기</button>' });
    return;
  }
  const isNew = !d.id, empty = !d.title && !d.body;
  sheet(`
    ${isNew && empty ? `
      <div class="sec-title" style="margin-top:0;">무엇을 쓸지 막막하다면 — 글감 고르기</div>
      <div class="fchips" style="flex-wrap:wrap; overflow:visible;">${BLOG_SEEDS.map((s, i) => `<button type="button" data-act="blog-seed" data-i="${i}">${esc(s.k)}</button>`).join('')}</div>` : ''}
    <label><span>제목</span><input id="bl-title" maxlength="80" value="${esc(d.title)}" placeholder="예: 잠이 안 오는 밤, 이렇게 해보세요" enterkeyhint="next"></label>
    <div class="blog-tools" role="toolbar" aria-label="글 꾸미기">
      <button type="button" class="ptool" data-act="blog-line" data-prefix="## ">소제목</button>
      <button type="button" class="ptool" data-act="blog-line" data-prefix="# ">큰 글씨</button>
      <button type="button" class="ptool" data-act="blog-wrap" data-open="**" data-close="**"><b>굵게</b></button>
      ${BLOG_COLORS.map(c => `<button type="button" class="ptool ptool-c pc-${c}" data-act="blog-wrap" data-open="{${c}|" data-close="}" aria-label="글자색 ${c}">가</button>`).join('')}
      <button type="button" class="ptool" data-act="blog-photo">사진 넣기</button>
    </div>
    <textarea id="bl-body" rows="11" maxlength="6000" placeholder="편하게 적어주세요. 문단은 빈 줄로 나눠요.&#10;&#10;글자를 길게 눌러 고른 뒤 위 버튼을 누르면 굵게·색이 들어가요.">${esc(d.body)}</textarea>
    <p class="muted" id="bl-count" style="margin:0.25rem 0 0.6rem; font-size:0.72rem;">${d.body.length.toLocaleString()} / 6,000자${isNew ? ' · 자동으로 임시저장돼요' : ''}</p>
    <div id="bl-imgs" class="blog-imgs">${blogImgsHtml()}</div>
    <label style="margin-top:0.7rem;"><span>태그 (5개까지 · 눌러서 넣기)</span>
      <input id="bl-tags" maxlength="80" value="${esc(d.tags.join(', '))}" placeholder="수면, 불안"></label>
    <div class="fchips" style="flex-wrap:wrap; overflow:visible;">${BLOG_TAGS.map(t => `<button type="button" data-act="blog-tag" data-t="${esc(t)}" class="${d.tags.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
    <div class="blog-note">내담자를 알아볼 수 있는 이야기(나이·직업·사연)는 쓰지 말아 주세요. 연락처나 다른 곳으로 오라는 안내도 넣을 수 없어요.</div>
    ${d.id ? `<button class="btn ghost sm" data-act="blog-del" data-id="${esc(d.id)}" style="color:var(--danger); margin-top:0.8rem;">이 글 지우기</button>` : (empty ? '' : '<button class="btn ghost sm" data-act="blog-reset" style="margin-top:0.8rem;">처음부터 새로 쓰기</button>')}`,
  { title: d.id ? '글 고치기' : '새 글 쓰기', sub: `${esc((BLOG.hospital && BLOG.hospital.name) || '')} · ${esc(ME.name || '')} 상담사`, kind: 'blog', keepScroll: !!keepScroll,
    foot: `<button class="btn ghost" data-act="blog-preview">미리보기</button><button class="btn ghost" data-act="blog-save-draft">${d.published ? '내리기' : '임시저장'}</button><button class="btn" data-act="blog-publish">${d.published ? '저장' : '올리기'}</button>` });
}
function blogImgsHtml() {
  const d = BLOG.d;
  return d.images.map((src, i) => `<div class="blog-img"><img src="${esc(src)}" alt=""><button type="button" data-act="blog-img-del" data-i="${i}" aria-label="사진 ${i + 1} 빼기">×</button></div>`).join('');
}

// ── 글 꾸미기 (선택한 글자를 기호로 감싼다 / 줄 앞에 표기를 붙인다) ──
function blogWrap(open, close) {
  const ta = $('bl-body'); if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, sel = v.slice(a, b);
  ta.value = v.slice(0, a) + open + sel + close + v.slice(b);
  ta.focus();
  const pos = sel ? a + open.length + sel.length + close.length : a + open.length;
  ta.setSelectionRange(pos, pos);
  if (!sel) toast('기호 사이에 글자를 적어주세요');
  blogDraftSave();
}
function blogLine(prefix) {
  const ta = $('bl-body'); if (!ta) return;
  const v = ta.value, a = ta.selectionStart;
  const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', a), end = le < 0 ? v.length : le;
  const cur = v.slice(ls, end), had = cur.startsWith(prefix);
  const line = had ? cur.slice(prefix.length) : prefix + cur.replace(/^#{1,2} /, '');
  ta.value = v.slice(0, ls) + line + v.slice(end);
  ta.focus(); ta.setSelectionRange(ls + line.length, ls + line.length);
  blogDraftSave();
}
function blogInsert(text) {
  const ta = $('bl-body'); if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, before = v.slice(0, a), after = v.slice(b);
  const p1 = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '';
  const p2 = after && !/^\n\n/.test(after) ? (/^\n/.test(after) ? '\n' : '\n\n') : '';
  ta.value = before + p1 + text + p2 + after;
  const pos = (before + p1 + text + p2).length;
  ta.setSelectionRange(pos, pos);
}

// ── 사진 — 폰 사진을 그대로 올리면 수 MB 다. 긴 변 640px·100KB 아래로 줄인다(서버도 다시 막는다) ──
function blogScale(img, px, budget, q0) {
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const cv = document.createElement('canvas'), cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
  for (const side of [px, Math.round(px * 0.75), Math.round(px * 0.5)]) {
    const sc = Math.min(1, side / Math.max(w, h));
    cv.width = Math.max(1, Math.round(w * sc)); cv.height = Math.max(1, Math.round(h * sc));
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    for (let q = q0; q >= 0.45; q -= 0.09) { const url = cv.toDataURL('image/jpeg', q); if (url.length <= budget) return url; }
  }
  return null;
}
function blogPickPhoto() {
  if (BLOG.d.images.length >= BLOG_IMG_MAX) { toast('사진은 글 하나에 4장까지 넣을 수 있어요'); return; }
  blogSync();
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.addEventListener('change', async () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    toast('사진을 줄이는 중…');
    try {
      const img = await decodePhoto(file);
      const full = blogScale(img, BLOG_IMG_PX, BLOG_IMG_BUDGET, 0.72), thumb = blogScale(img, BLOG_THUMB_PX, BLOG_THUMB_BUDGET, 0.7);
      if (img.close) img.close();
      if (!full) throw new Error('too-big');
      if (!BLOG.d || SHEET_KIND !== 'blog') return;
      BLOG.d.images.push(full); BLOG.d.thumbs.push(thumb || '');
      blogInsert('[img:' + (BLOG.d.images.length - 1) + ']');
      blogSync();
      const box = $('bl-imgs'); if (box) box.innerHTML = blogImgsHtml();
      toast('사진을 넣었어요 — 글에서 [img:…] 가 있는 자리에 보여요');
    } catch (e) { toast('이 사진은 넣을 수 없어요. 다른 사진으로 해주세요'); }
  });
  inp.click();
}
function blogRemovePhoto(i) {
  const d = BLOG.d; blogSync();
  d.images.splice(i, 1); d.thumbs.splice(i, 1);
  d.body = d.body.replace(/\[img:(\d+)\]/g, (m, n) => { n = +n; if (n === i) return ''; return n > i ? '[img:' + (n - 1) + ']' : m; }).replace(/\n{3,}/g, '\n\n');
  renderBlogEditor(true);
}

async function saveBlog(btn, publish) {
  blogSync();
  const d = BLOG.d;
  const title = d.title.trim(), body = d.body.trim();
  if (!title) { BLOG.mode = 'edit'; renderBlogEditor(true); toast('제목을 적어주세요'); const t = $('bl-title'); if (t) t.focus(); return; }
  if (!body) { BLOG.mode = 'edit'; renderBlogEditor(true); toast('본문을 적어주세요'); const b = $('bl-body'); if (b) b.focus(); return; }
  if (/\(.{0,40}(적어주세요|한 문장|쉬운 말로|구체적인|예:)/.test(body) && publish) {
    if (!(await uiConfirm({ title: '안내 문구가 남아 있어요', body: '괄호 안의 안내 문구(글감 뼈대)가 아직 본문에 있어요. 그대로 올릴까요?', ok: '그대로 올리기', cancel: '고치러 가기', tone: 'warn' }))) return;
  }
  if (publish && !d.published) {
    if (!(await uiConfirm({ title: '이 글을 올릴까요?', body: '이용자 앱 커뮤니티에 바로 보여요.\n내담자를 알아볼 수 있는 내용이 없는지 한 번만 확인해 주세요.', ok: '올리기', cancel: '다시 볼게요' }))) return;
  }
  const label = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
  const r = await postJson('/api/pro/posts/save', authBody({ post: {
    id: d.id, title, body, tags: d.tags, published: !!publish, images: d.images, thumb: d.thumbs.find(Boolean) || '' } }));
  if (!r || !r.ok) {
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    const e = r && r.error;
    toast(e === 'too-many' ? '오늘은 글을 더 올릴 수 없어요 (하루 5개까지)' : e === 'bad-image' ? '사진이 너무 커요. 사진을 빼고 다시 넣어주세요'
      : e === 'no-hospital' ? '소속 상담소가 확인된 뒤에 글을 쓸 수 있어요' : '저장하지 못했어요. 글은 그대로 있으니 잠시 뒤 다시 눌러주세요');
    return;
  }
  if (!d.id) localStorage.removeItem(BLOG_DRAFT_KEY);
  BLOG.d = null;
  closeSheet();
  toast(publish ? '올렸어요 — 이용자 앱 커뮤니티에 바로 보여요' : '임시저장했어요. 이용자에게는 보이지 않아요');
  await loadBlog();
  OPEN.blog = true; renderHome();
}

Object.assign(ACT, {
  'blog-open': () => { closeSheet(); goFold('home', 'blog'); },
  'blog-new': () => openBlogEditor(''),
  'blog-edit': (el) => openBlogEditor(el.dataset.id),
  'blog-seed': (el) => {
    const s = BLOG_SEEDS[+el.dataset.i]; if (!s) return;
    Object.assign(BLOG.d, { title: s.title, body: s.body, tags: s.tags.slice() });
    renderBlogEditor(); blogDraftSave();
    toast('뼈대를 넣었어요. 괄호 부분만 바꿔 쓰면 돼요');
  },
  'blog-wrap': (el) => blogWrap(el.dataset.open, el.dataset.close),
  'blog-line': (el) => blogLine(el.dataset.prefix),
  'blog-photo': () => blogPickPhoto(),
  'blog-img-del': (el) => blogRemovePhoto(+el.dataset.i),
  'blog-tag': (el) => {
    blogSync();
    const d = BLOG.d, t = el.dataset.t, i = d.tags.indexOf(t);
    if (i >= 0) d.tags.splice(i, 1);
    else if (d.tags.length >= 5) { toast('태그는 5개까지 넣을 수 있어요'); return; }
    else d.tags.push(t);
    $('bl-tags').value = d.tags.join(', ');
    el.classList.toggle('on', i < 0);
    blogDraftSave();
  },
  'blog-preview': () => { blogSync(); BLOG.mode = 'preview'; renderBlogEditor(); },
  'blog-back-edit': () => { BLOG.mode = 'edit'; renderBlogEditor(); },
  'blog-publish': (el) => saveBlog(el, true),
  'blog-save-draft': (el) => saveBlog(el, false),
  'blog-reset': async () => {
    if (!(await uiConfirm({ title: '처음부터 새로 쓸까요?', body: '지금까지 쓴 글이 지워져요.', ok: '새로 쓰기', cancel: '계속 쓰기', tone: 'warn' }))) return;
    localStorage.removeItem(BLOG_DRAFT_KEY);
    BLOG.d = blogBlank(); renderBlogEditor();
  },
  'blog-del': async (el) => {
    if (!(await uiConfirm({ title: '이 글을 지울까요?', body: '좋아요와 댓글도 함께 지워지고, 되돌릴 수 없어요.', ok: '지우기', cancel: '그만두기', tone: 'danger' }))) return;
    const r = await postJson('/api/pro/posts/delete', authBody({ id: el.dataset.id }));
    if (!r || !r.ok) { toast('지우지 못했어요. 잠시 뒤 다시 해주세요'); return; }
    BLOG.d = null; closeSheet(); toast('지웠어요');
    await loadBlog(); renderHome();
  }
});
// 글자를 칠 때마다 이 기기에 남긴다 — 전화가 와서 앱이 닫혀도 쓰던 글이 사라지지 않게
document.addEventListener('input', e => {
  const id = e.target && e.target.id;
  if (id === 'bl-title' || id === 'bl-body' || id === 'bl-tags') blogDraftSave();
});
