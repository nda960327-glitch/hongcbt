// ============================================================================
//  느루의 추천 — 운영자 콘솔에서 올린 정신건강 영상·글을 홈에 보여주고,
//  이용자가 '도움됐어요 / 별로예요'로 반응한다.
//  목록은 서버(D1)에 있고 기기에는 마지막으로 받은 사본만 둔다 — 오프라인에도 카드는 뜬다.
//  홈에는 유튜브를 직접 박지 않는다(무겁다). 썸네일 카드 → 시트 안에서 재생.
// ============================================================================
window.Feed = {
  // 온보딩 고민 → 먼저 보여줄 태그
  TAG_OF_CONCERN: { dep: '우울', anx: '불안', stress: '스트레스', rel: '관계', self: '자존감', sleep: '수면' },

  _items: null,
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  init() {
    const c = window.Storage._safeGet('cbt_feed_cache', null);
    if (c && Array.isArray(c.items)) { this._items = c.items; this.render(); }
    this.refresh();
  },

  async refresh() {
    try {
      const cid = (window.App && window.App.clientId) ? window.App.clientId() : '';
      const d = await window.Api.json('/api/feed' + (cid ? '?clientId=' + encodeURIComponent(cid) : ''));
      if (!d || !Array.isArray(d.items)) return;
      this._items = d.items;
      window.Storage._safeSet('cbt_feed_cache', { ts: Date.now(), items: d.items.slice(0, 60) });
      this.render();
    } catch (e) {}
  },

  // 내 고민에 맞는 태그가 앞, 고정 항목 다음, 반응이 나쁜 건(별로 ≥ 도움×2, 5표 이상) 뒤로
  sorted() {
    const items = (this._items || []).filter(it => it && it.id && it.title);
    const concerns = window.Storage._safeGet('cbt_user_concerns', []) || [];
    const want = new Set(concerns.map(c => this.TAG_OF_CONCERN[c]).filter(Boolean));
    const score = it => {
      let sc = 0;
      if ((it.tags || []).some(t => want.has(t))) sc += 20;
      if (it.pinned) sc += 10;
      const up = it.up || 0, down = it.down || 0;
      if (up + down >= 5 && down >= up * 2) sc -= 30;
      return sc;
    };
    return items.map((it, i) => ({ it, i, sc: score(it) }))
      .sort((a, b) => b.sc - a.sc || a.i - b.i).map(x => x.it);
  },

  render() {
    const sec = document.getElementById('home-feed-sec');
    const el = document.getElementById('home-feed');
    if (!sec || !el) return;
    const items = this.sorted();
    if (!items.length) { sec.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    const esc = this._esc;
    el.innerHTML = items.slice(0, 12).map(it => {
      const yt = it.type === 'youtube';
      const thumb = it.thumb || (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '');
      return `
      <button class="feed-card" data-feed-open="${esc(it.id)}">
        <span class="feed-card__thumb">
          ${thumb ? `<img loading="lazy" src="${esc(thumb)}" alt="">` : `<span class="feed-card__ph">${window.Icons ? window.Icons.svg('note', { size: 28 }) : ''}</span>`}
          ${yt ? '<span class="feed-card__play">▶</span>' : ''}
          <span class="feed-card__type">${yt ? '영상' : '글'}</span>
        </span>
        <span class="feed-card__t">${esc(it.title)}</span>
        ${it.note ? `<span class="feed-card__note">"${esc(it.note)}"</span>` : ''}
        <span class="feed-card__meta">
          ${(it.tags || []).slice(0, 2).map(t => `<span class="feed-tag">${esc(t)}</span>`).join('')}
          <span class="feed-card__up">${this._thumb()} ${it.up || 0}</span>
        </span>
      </button>`;
    }).join('');
  },

  _thumb(sz) {
    return `<svg width="${sz || 12}" height="${sz || 12}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.5 0 2.5 1 2.5 2.5V10h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17.5 20H7"/></svg>`;
  },

  get(id) { return (this._items || []).find(it => it.id === id) || null; },

  // 글 본문: 문단 + 줄바꿈 + **굵게** 만. HTML 은 전부 이스케이프.
  _body(text) {
    return String(text || '').split(/\n{2,}/).map(p =>
      '<p>' + this._esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');
  },

  open(id) {
    const it = this.get(id);
    if (!it) return;
    this.close();
    const esc = this._esc;
    const yt = it.type === 'youtube';
    const ov = document.createElement('div');
    ov.id = 'feed-overlay';
    ov.dataset.ovGuard = '1';   // 뒤로가기로 닫힌다
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end;';
    ov.innerHTML = `
      <div class="feed-ov">
        <div class="feed-ov__bar">
          <span class="feed-tag">${yt ? '영상' : '글'}</span>
          ${(it.tags || []).map(t => `<span class="feed-tag">${esc(t)}</span>`).join('')}
          <button class="feed-ov__x" data-feed-close>닫기</button>
        </div>
        ${yt && it.videoId ? `<div class="feed-ov__video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(it.videoId)}?rel=0&playsinline=1" title="${esc(it.title)}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : ''}
        <h3>${esc(it.title)}</h3>
        ${it.author ? `<p class="feed-ov__author">${esc(it.author)}</p>` : ''}
        ${it.note ? `<div class="feed-ov__note"><span style="line-height: 0; flex-shrink: 0;">${window.Stickers ? window.Stickers.svg('think', 34) : ''}</span><span>${esc(it.note)}</span></div>` : ''}
        ${!yt ? `<div class="feed-ov__body">${this._body(it.body)}</div>` : ''}
        <div class="feed-ov__vote" data-feed-votes>
          <button data-feed-vote="1" class="${it.mine === 1 ? 'on' : ''}">${this._thumb(14)} 도움됐어요 · <span data-up>${it.up || 0}</span></button>
          <button data-feed-vote="-1" class="${it.mine === -1 ? 'on' : ''}"><span style="display:inline-block; transform: scaleY(-1);">${this._thumb(14)}</span> 별로예요 · <span data-down>${it.down || 0}</span></button>
        </div>
        ${yt ? `<a class="feed-ov__ext" href="${esc(it.url)}" data-feed-ext>유튜브에서 열기 ›</a>` : ''}
      </div>`;
    ov.dataset.feedId = it.id;
    ov.addEventListener('click', e => { if (e.target === ov) this.close(); });
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  close() {
    const ov = document.getElementById('feed-overlay');
    if (ov) ov.remove();
  },

  async vote(id, v) {
    const it = this.get(id);
    if (!it) return;
    const next = it.mine === v ? 0 : v;   // 같은 걸 다시 누르면 취소
    // 화면은 먼저 바꾼다 — 서버가 답하면 그 수치로 맞춘다
    if (it.mine === 1) it.up = Math.max(0, (it.up || 0) - 1);
    if (it.mine === -1) it.down = Math.max(0, (it.down || 0) - 1);
    if (next === 1) it.up = (it.up || 0) + 1;
    if (next === -1) it.down = (it.down || 0) + 1;
    it.mine = next;
    this._paintVotes(it);
    if (window.Sfx) window.Sfx.hit(next ? 'save' : 'close');
    try {
      const cid = (window.App && window.App.clientId) ? window.App.clientId() : '';
      const r = await window.Api.post('/api/feed/vote', { id, v: next, clientId: cid });
      const d = r && r.ok ? await r.json() : null;
      if (d && d.ok) { it.up = d.up; it.down = d.down; it.mine = d.mine; this._paintVotes(it); }
    } catch (e) {}
    window.Storage._safeSet('cbt_feed_cache', { ts: Date.now(), items: (this._items || []).slice(0, 60) });
    this.render();
  },

  _paintVotes(it) {
    const box = document.querySelector('#feed-overlay [data-feed-votes]');
    if (!box) return;
    box.querySelectorAll('[data-feed-vote]').forEach(b => b.classList.toggle('on', +b.dataset.feedVote === it.mine));
    const up = box.querySelector('[data-up]'), down = box.querySelector('[data-down]');
    if (up) up.textContent = it.up || 0;
    if (down) down.textContent = it.down || 0;
  },

  // 챗봇이 알아야 할 것 — 있는 것만 권하게
  promptContext() {
    const items = this.sorted().slice(0, 6);
    if (!items.length) return '';
    return '[느루의 추천 콘텐츠 — 운영자가 고른 영상·글, 홈 화면 "느루의 추천"에 있음]\n'
      + items.map(it => `- ${it.title} (${(it.tags || []).join('·') || '일반'} · ${it.type === 'youtube' ? '영상' : '글'})`).join('\n')
      + '\n사용자의 고민과 정말 맞을 때만 하나를 자연스럽게 권하세요. 링크는 주지 말고 "홈의 느루의 추천에 있어"라고 알려주세요. 여기 없는 콘텐츠를 지어내지 마세요.';
  }
};

document.addEventListener('click', function (e) {
  const F = window.Feed;
  if (!F) return;
  const open = e.target.closest('[data-feed-open]');
  if (open) { F.open(open.dataset.feedOpen); return; }
  if (e.target.closest('[data-feed-close]')) { F.close(); return; }
  const vote = e.target.closest('[data-feed-vote]');
  if (vote) {
    const ov = document.getElementById('feed-overlay');
    if (ov) F.vote(ov.dataset.feedId, +vote.dataset.feedVote);
    return;
  }
  const ext = e.target.closest('[data-feed-ext]');
  if (ext) {
    e.preventDefault();
    const url = ext.getAttribute('href');
    const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (B && B.open) B.open({ url }); else window.open(url, '_blank', 'noopener');
  }
});
