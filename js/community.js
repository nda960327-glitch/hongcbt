// ============================================================================
//  상담소 소식 — 제휴 상담소가 블로그처럼 올리는 글. 이용자는 읽고, 좋아요와 댓글만 단다.
//
//  · 홈: '대면상담 및 진료' 위에 가로 카드(최신 6개). '전체 보기'는 세로 목록(무한 더 보기).
//  · 글 화면: 전체 화면 오버레이 — 본문 · 좋아요 · 댓글. 상담소 이름을 누르면 상담소 페이지.
//  · 상담소 페이지: 소개·전화·주소·홈페이지·운영시간 + 그 상담소의 글.
//  · 서버(community.js)가 원본이고 기기에는 마지막 목록 사본만 둔다(오프라인에도 카드는 뜬다).
//  · 댓글 이름은 온보딩 별명(cbt_user_name). 없으면 '익명'. 연락처는 서버가 가린다.
// ============================================================================
window.Community = {
  HOME_MAX: 6,
  _items: null, _next: 0, _loading: false,
  _post: null,          // 열려 있는 글 {post, comments, hospital}
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  init() {
    const c = window.Storage._safeGet('cbt_cm_cache', null);
    if (c && Array.isArray(c.items)) { this._items = c.items; this.render(); }
    this.refresh();
  },

  _cid() { return (window.App && window.App.clientId) ? window.App.clientId() : ''; },
  _name() { return (window.Storage._safeGet('cbt_user_name', '') || '').trim(); },

  async refresh() {
    try {
      const cid = this._cid();
      const d = await window.Api.json('/api/community' + (cid ? '?clientId=' + encodeURIComponent(cid) : ''));
      if (!d || !Array.isArray(d.items)) return;
      this._items = d.items; this._next = d.next || 0;
      window.Storage._safeSet('cbt_cm_cache', { ts: Date.now(), items: this._items.slice(0, 60) });
      this.render();
      if (document.getElementById('cm-all')) this.renderAll();
    } catch (e) {}
  },

  async more() {
    if (!this._next || this._loading) return;
    this._loading = true;
    try {
      const cid = this._cid();
      const d = await window.Api.json('/api/community?cursor=' + this._next + (cid ? '&clientId=' + encodeURIComponent(cid) : ''));
      if (d && Array.isArray(d.items)) {
        const seen = new Set((this._items || []).map(x => x.id));
        this._items = (this._items || []).concat(d.items.filter(x => !seen.has(x.id)));
        this._next = d.next || 0;
      }
    } catch (e) {}
    this._loading = false;
    this.renderAll();
  },

  get(id) { return (this._items || []).find(it => it.id === id) || (this._post && this._post.post.id === id ? this._post.post : null); },
  _md(ts) { const d = new Date(ts); return `${d.getMonth() + 1}월 ${d.getDate()}일`; },
  _heart(sz) {
    return `<svg width="${sz || 13}" height="${sz || 13}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 20s-7-4.4-9-8.5C1.5 8.4 3.5 5 7 5c2 0 3.3 1 4 2.2C11.7 6 13 5 15 5c3.5 0 5.5 3.4 4 6.5-2 4.1-7 8.5-7 8.5z"/></svg>`;
  },
  _bubble(sz) {
    return `<svg width="${sz || 13}" height="${sz || 13}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>`;
  },
  // 본문: 문단 + 줄바꿈 + **굵게** 만. HTML 은 전부 이스케이프.
  _body(text) {
    return String(text || '').split(/\n{2,}/).map(p =>
      '<p>' + this._esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');
  },

  _card(it, row) {
    const esc = this._esc;
    const inner = `
      <span class="cm-card__hosp">${esc(it.hospital)}${it.pinned ? ' <em>고정</em>' : ''}</span>
      <span class="cm-card__t">${esc(it.title)}</span>
      <span class="cm-card__ex">${esc(it.excerpt || '')}</span>
      <span class="cm-card__meta">
        ${(it.tags || []).slice(0, 2).map(t => `<span class="feed-tag">${esc(t)}</span>`).join('')}
        <span class="cm-card__n${it.mine ? ' on' : ''}">${this._heart()} ${it.likes || 0}</span>
        <span class="cm-card__n">${this._bubble()} ${it.comments || 0}</span>
        <span class="cm-card__d">${this._md(it.created)}</span>
      </span>`;
    return `<button class="cm-card${row ? ' cm-card--row' : ''}" data-cm-open="${esc(it.id)}">${inner}</button>`;
  },

  render() {
    const el = document.getElementById('home-community');
    if (!el) return;
    const items = (this._items || []).filter(it => it && it.id);
    if (!items.length) {
      el.innerHTML = `<div class="glass-card clinic-prompt"><div class="clinic-prompt__ico" data-ic="note" data-ic-size="22"></div>
        <div class="clinic-prompt__txt"><b>아직 올라온 소식이 없어요</b><span>제휴 상담소가 마음 돌봄 이야기와 안내를 올리면 여기에 보여요.</span></div></div>`;
      if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(el);
      return;
    }
    el.innerHTML = `<div class="home-ads cm-strip">${items.slice(0, this.HOME_MAX).map(it => this._card(it, false)).join('')}</div>`;
  },

  // ── 전체 보기 ──
  openAll() {
    if (document.getElementById('cm-all')) { this.renderAll(); return; }
    const ov = document.createElement('div');
    ov.id = 'cm-all'; ov.className = 'feed-all'; ov.dataset.ovGuard = '1';
    ov.innerHTML = `
      <div class="feed-all__head">
        <button class="feed-all__back" data-cm-all-close aria-label="닫기">‹</button>
        <h2>상담소 소식</h2>
      </div>
      <div class="feed-all__list" data-cm-list></div>`;
    document.body.appendChild(ov);
    this.renderAll();
    if (!this._items || !this._items.length) this.refresh();
    if (window.Sfx) window.Sfx.play('nav');
  },
  renderAll() {
    const ov = document.getElementById('cm-all');
    if (!ov) return;
    const list = ov.querySelector('[data-cm-list]');
    const items = (this._items || []);
    if (!items.length) { list.innerHTML = '<p class="feed-all__empty">아직 올라온 소식이 없어요.</p>'; return; }
    list.innerHTML = items.map(it => this._card(it, true)).join('')
      + (this._next ? `<button class="feed-all__more" data-cm-more>${this._loading ? '불러오는 중…' : '더 보기'}</button>` : '');
  },
  closeAll() { const ov = document.getElementById('cm-all'); if (ov) ov.remove(); },

  // ── 글 하나 ──
  async open(id) {
    this.close();
    const cached = this.get(id);
    const ov = document.createElement('div');
    ov.id = 'cm-post'; ov.className = 'feed-all cm-view'; ov.dataset.ovGuard = '1'; ov.dataset.id = id;
    ov.innerHTML = `
      <div class="feed-all__head">
        <button class="feed-all__back" data-cm-close aria-label="닫기">‹</button>
        <h2 class="ell">${cached ? this._esc(cached.hospital) : '상담소 소식'}</h2>
      </div>
      <div class="feed-all__list cm-view__body" data-cm-body>${cached ? this._postHtml({ post: cached, comments: null, hospital: null }) : '<p class="feed-all__empty">불러오는 중…</p>'}</div>`;
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
    const cid = this._cid();
    const d = await window.Api.json('/api/community/post?id=' + encodeURIComponent(id) + (cid ? '&clientId=' + encodeURIComponent(cid) : ''));
    if (!document.getElementById('cm-post') || ov.dataset.id !== id) return;
    if (!d || !d.ok) {
      if (!cached) ov.querySelector('[data-cm-body]').innerHTML = '<p class="feed-all__empty">이 글은 지금 볼 수 없어요.</p>';
      return;
    }
    this._post = d;
    // 목록 사본의 숫자도 맞춘다
    const it = (this._items || []).find(x => x.id === id);
    if (it) { it.likes = d.post.likes; it.comments = d.post.comments; it.mine = d.post.mine; }
    ov.querySelector('h2').textContent = d.post.hospital;
    ov.querySelector('[data-cm-body]').innerHTML = this._postHtml(d);
  },

  _postHtml(d) {
    const esc = this._esc, p = d.post;
    const name = this._name();
    const cid = this._cid();
    const comments = d.comments;
    return `
      <article class="cm-post">
        <button class="cm-post__hosp" data-cm-hosp="${esc(p.hospitalId)}">${esc(p.hospital)}${p.dept ? ` <span>· ${esc(p.dept)}</span>` : ''} <i>상담소 페이지 ›</i></button>
        <h3>${esc(p.title)}</h3>
        <p class="cm-post__date">${this._md(p.created)}${p.updated && p.updated - p.created > 60000 ? ' · 수정됨' : ''}</p>
        ${(p.tags || []).length ? `<div class="cm-post__tags">${p.tags.map(t => `<span class="feed-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="feed-ov__body">${this._body(p.body)}</div>
        <div class="cm-post__act">
          <button class="cm-like${p.mine ? ' on' : ''}" data-cm-like>${this._heart(16)} 좋아요 <b data-cm-likes>${p.likes || 0}</b></button>
          <span class="cm-card__n">${this._bubble(15)} 댓글 <b data-cm-ccount>${comments ? comments.length : (p.comments || 0)}</b></span>
        </div>
      </article>
      <section class="cm-comments" data-cm-comments>
        ${comments === null ? '' : comments.length ? comments.map(c => this._commentHtml(c, cid)).join('') : '<p class="cm-comments__empty">첫 댓글을 남겨보세요. 따뜻한 한마디면 충분해요.</p>'}
      </section>
      <div class="cm-input">
        ${name ? '' : `<input class="cm-input__name" data-cm-name maxlength="20" placeholder="이름(별명)">`}
        <textarea class="cm-input__text" data-cm-text rows="1" maxlength="500" placeholder="댓글을 남겨보세요"></textarea>
        <button class="cm-input__send" data-cm-send>올리기</button>
      </div>
      <p class="cm-input__note">전화번호·아이디 같은 연락처는 자동으로 가려져요. 상담소와 다른 이용자에게 보이는 공개 댓글이에요.</p>`;
  },

  _commentHtml(c, cid) {
    const esc = this._esc;
    const mine = cid && c.clientId === cid;
    return `<div class="cm-comment${c.byHospital ? ' cm-comment--hosp' : ''}" data-cid="${esc(c.id)}">
      <div class="cm-comment__head"><b>${esc(c.name)}</b>${c.byHospital ? '<span class="cm-comment__badge">상담소</span>' : ''}<span>${this._md(c.ts)}</span>
        ${mine ? '<button class="cm-comment__del" data-cm-del>삭제</button>' : ''}</div>
      <p>${esc(c.text)}</p>
    </div>`;
  },

  close() { const ov = document.getElementById('cm-post'); if (ov) ov.remove(); this._post = null; },

  async like() {
    const d = this._post; if (!d) return;
    const p = d.post;
    p.mine = !p.mine; p.likes = Math.max(0, (p.likes || 0) + (p.mine ? 1 : -1));
    this._paintLike(p);
    if (window.Sfx) window.Sfx.hit(p.mine ? 'save' : 'close');
    try {
      const r = await window.Api.post('/api/community/like', { id: p.id, clientId: this._cid() });
      const j = r && r.ok ? await r.json() : null;
      if (j && j.ok) { p.likes = j.likes; p.mine = j.mine; this._paintLike(p); }
      else if (r && r.status === 403) { p.mine = !p.mine; p.likes = Math.max(0, p.likes + (p.mine ? 1 : -1)); this._paintLike(p); }
    } catch (e) {}
    const it = (this._items || []).find(x => x.id === p.id);
    if (it) { it.likes = p.likes; it.mine = p.mine; }
    this.render();
  },
  _paintLike(p) {
    const ov = document.getElementById('cm-post'); if (!ov) return;
    const b = ov.querySelector('[data-cm-like]'); if (b) b.classList.toggle('on', !!p.mine);
    const n = ov.querySelector('[data-cm-likes]'); if (n) n.textContent = p.likes || 0;
  },

  async send() {
    const ov = document.getElementById('cm-post'); const d = this._post;
    if (!ov || !d) return;
    const ta = ov.querySelector('[data-cm-text]');
    const nameEl = ov.querySelector('[data-cm-name]');
    const text = (ta.value || '').trim();
    if (!text) { ta.focus(); return; }
    let name = this._name();
    if (!name && nameEl) { name = (nameEl.value || '').trim(); if (name) window.Storage._safeSet('cbt_user_name', name); }
    const btn = ov.querySelector('[data-cm-send]'); btn.disabled = true; btn.textContent = '올리는 중…';
    try {
      const r = await window.Api.post('/api/community/comment', { id: d.post.id, text, name: name || '익명', clientId: this._cid() });
      const j = r ? await r.json().catch(() => null) : null;
      if (j && j.ok) {
        d.comments = (d.comments || []).concat([j.comment]);
        d.post.comments = d.comments.length;
        const box = ov.querySelector('[data-cm-comments]');
        box.innerHTML = d.comments.map(c => this._commentHtml(c, this._cid())).join('');
        const n = ov.querySelector('[data-cm-ccount]'); if (n) n.textContent = d.comments.length;
        ta.value = ''; ta.style.height = '';
        if (nameEl) nameEl.remove();
        const it = (this._items || []).find(x => x.id === d.post.id); if (it) it.comments = d.comments.length;
        this.render();
        if (window.App && window.App.showRecordToast) window.App.showRecordToast('댓글을 올렸어요');
      } else if (r && r.status === 429) {
        if (window.App && window.App.showRecordToast) window.App.showRecordToast('댓글을 너무 자주 올렸어요. 잠시 뒤에 다시 해주세요');
      } else if (window.App && window.App.showRecordToast) window.App.showRecordToast('지금은 올리지 못했어요');
    } catch (e) {}
    btn.disabled = false; btn.textContent = '올리기';
  },

  async del(cid) {
    const d = this._post; if (!d) return;
    const ok = window.App && window.App.confirmBox ? await window.App.confirmBox({ title: '댓글을 지울까요?', okLabel: '지우기', cancelLabel: '아니요' }) : confirm('댓글을 지울까요?');
    if (!ok) return;
    try {
      const r = await window.Api.post('/api/community/comment/delete', { cid, clientId: this._cid() });
      const j = r ? await r.json().catch(() => null) : null;
      if (j && j.ok) {
        d.comments = (d.comments || []).filter(c => c.id !== cid);
        d.post.comments = d.comments.length;
        const ov = document.getElementById('cm-post');
        if (ov) {
          const el = ov.querySelector(`[data-cid="${cid}"]`); if (el) el.remove();
          const n = ov.querySelector('[data-cm-ccount]'); if (n) n.textContent = d.comments.length;
        }
      }
    } catch (e) {}
  },

  // ── 상담소 페이지 ──
  async openHospital(id) {
    const old = document.getElementById('cm-hosp'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'cm-hosp'; ov.className = 'feed-all cm-view'; ov.dataset.ovGuard = '1';
    ov.innerHTML = `
      <div class="feed-all__head">
        <button class="feed-all__back" data-cm-hosp-close aria-label="닫기">‹</button>
        <h2>상담소</h2>
      </div>
      <div class="feed-all__list cm-view__body" data-cm-hosp-body><p class="feed-all__empty">불러오는 중…</p></div>`;
    document.body.appendChild(ov);
    const cid = this._cid();
    const d = await window.Api.json('/api/community/hospital?id=' + encodeURIComponent(id) + (cid ? '&clientId=' + encodeURIComponent(cid) : ''));
    if (!document.getElementById('cm-hosp')) return;
    const body = ov.querySelector('[data-cm-hosp-body]');
    if (!d || !d.ok) { body.innerHTML = '<p class="feed-all__empty">상담소 정보를 불러오지 못했어요.</p>'; return; }
    const esc = this._esc, h = d.hospital, p = h.profile || {};
    const lk = window.Hospital && window.Hospital.link ? window.Hospital.link() : null;
    const linkedHere = lk && lk.hospital && lk.hospital.id === h.id;
    ov.querySelector('h2').textContent = h.name;
    // 이 상담소의 글도 목록 사본에 섞어 둔다 — 열 때 캐시가 있게
    const seen = new Set((this._items || []).map(x => x.id));
    this._items = (this._items || []).concat((d.items || []).filter(x => !seen.has(x.id)));
    const tel = (p.tel || '').replace(/[^0-9+]/g, '');
    body.innerHTML = `
      <div class="cm-hosp">
        <div class="cm-hosp__head">
          <span class="cm-hosp__av">${esc((h.name || '상').slice(0, 1))}</span>
          <div><h3>${esc(h.name)}</h3><p>${esc([h.dept, h.doctor ? h.doctor + ' 소장' : ''].filter(Boolean).join(' · ') || '심리상담')}${d.linked ? ` · 연결 내담자 ${d.linked}명` : ''}</p></div>
        </div>
        ${p.intro ? `<div class="cm-hosp__intro">${this._body(p.intro)}</div>` : '<p class="cm-hosp__intro cm-hosp__intro--empty">아직 소개글이 없어요.</p>'}
        <div class="cm-hosp__facts">
          ${p.hours ? `<div><b>운영시간</b><span>${esc(p.hours)}</span></div>` : ''}
          ${p.addr ? `<div><b>주소</b><span>${esc(p.addr)}</span></div>` : ''}
          ${p.tel ? `<div><b>전화</b><span>${esc(p.tel)}</span></div>` : ''}
        </div>
        <div class="cm-hosp__btns">
          ${tel ? `<a class="btn-primary" href="tel:${esc(tel)}">전화하기</a>` : ''}
          ${p.url ? `<a class="btn-secondary" href="${esc(p.url)}" target="_blank" rel="noopener">홈페이지</a>` : ''}
          ${linkedHere ? '<span class="cm-hosp__linked">내 담당 상담소</span>' : (window.Hospital && !lk ? '<button class="btn-secondary" data-cm-hosp-link>상담소 코드로 연결</button>' : '')}
        </div>
      </div>
      <p class="cm-hosp__sec">${esc(h.name)}의 소식 ${d.items.length ? d.items.length + '개' : ''}</p>
      ${d.items.length ? d.items.map(it => this._card(it, true)).join('') : '<p class="feed-all__empty">아직 올린 소식이 없어요.</p>'}`;
  },
  closeHospital() { const ov = document.getElementById('cm-hosp'); if (ov) ov.remove(); },

  // 느루가 알아야 할 것 — 있는 것만 권하게
  promptContext() {
    const items = (this._items || []).slice(0, 5);
    if (!items.length) return '';
    return '[상담소 소식 — 제휴 상담소가 올린 글, 홈 "상담소 소식"에 있음]\n'
      + items.map(it => `- ${it.hospital}: ${it.title}`).join('\n')
      + '\n사용자 고민과 정말 맞을 때만 하나를 자연스럽게 권하세요. 없는 글을 지어내지 마세요.';
  }
};

document.addEventListener('click', function (e) {
  const C = window.Community;
  if (!C) return;
  if (e.target.closest('[data-cm-all]')) { C.openAll(); return; }
  if (e.target.closest('[data-cm-all-close]')) { C.closeAll(); return; }
  if (e.target.closest('[data-cm-more]')) { C.more(); return; }
  const open = e.target.closest('[data-cm-open]');
  if (open) { C.open(open.dataset.cmOpen); return; }
  if (e.target.closest('[data-cm-close]')) { C.close(); return; }
  if (e.target.closest('[data-cm-like]')) { C.like(); return; }
  if (e.target.closest('[data-cm-send]')) { C.send(); return; }
  const del = e.target.closest('[data-cm-del]');
  if (del) { const row = del.closest('[data-cid]'); if (row) C.del(row.dataset.cid); return; }
  const hosp = e.target.closest('[data-cm-hosp]');
  if (hosp) { C.openHospital(hosp.dataset.cmHosp); return; }
  if (e.target.closest('[data-cm-hosp-close]')) { C.closeHospital(); return; }
  if (e.target.closest('[data-cm-hosp-link]')) {
    C.closeHospital(); C.close(); C.closeAll();
    if (window.App && window.App.switchTab) window.App.switchTab('my');
    const b = document.querySelector('[data-hosp-link]'); if (b) b.click();
  }
});
document.addEventListener('input', function (e) {
  const ta = e.target && e.target.closest && e.target.closest('[data-cm-text]');
  if (!ta) return;
  ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
});
