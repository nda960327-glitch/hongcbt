// ============================================================================
//  느루의 추천 — 운영자 콘솔에서 올린 정신건강 영상·글을 홈에 보여주고,
//  이용자가 '도움됐어요 / 별로예요'로 반응한다.
//  목록은 서버(D1)에 있고 기기에는 마지막으로 받은 사본만 둔다 — 오프라인에도 카드는 뜬다.
//  홈에는 맛보기(고민에 맞는 6개)만 가로로, 나머지는 '전체 보기' 세로 목록에서
//  태그로 걸러 내리며 본다. 유튜브는 홈에 직접 박지 않는다(무겁다) — 썸네일 → 시트에서 재생.
// ============================================================================
window.Feed = {
  // 온보딩 고민 → 먼저 보여줄 태그
  // 온보딩 고민 → 추천 콘텐츠 분류 (2026-09 self-care 분류표 7개). 옛 태그도 같이 둬서 예전 콘텐츠도 올라온다.
  TAG_OF_CONCERN: { dep: ['마음건강 알아보기', '생각과 마음 회복', '우울'], anx: ['감정 이해와 조절', '마음챙김·명상', '불안'], stress: ['스트레스·번아웃 관리', '스트레스'],
    rel: ['건강한 관계', '관계'], self: ['나를 돌보는 법', '자존감'], sleep: ['마음챙김·명상', '수면'] },
  HOME_MAX: 6,
  PAGE: 20,

  _items: null,
  _tags: ['감정 이해와 조절', '생각과 마음 회복', '스트레스·번아웃 관리', '마음챙김·명상', '나를 돌보는 법', '건강한 관계', '마음건강 알아보기'],
  _all: { tag: '', sort: 'rec', shown: 20 },
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  init() {
    const c = window.Storage._safeGet('cbt_feed_cache', null);
    if (c && Array.isArray(c.items)) { this._items = c.items; if (Array.isArray(c.tags) && c.tags.length) this._tags = c.tags; this.render(); }
    this.refresh();
  },

  async refresh() {
    try {
      const cid = (window.App && window.App.clientId) ? window.App.clientId() : '';
      const d = await window.Api.json('/api/feed' + (cid ? '?clientId=' + encodeURIComponent(cid) : ''));
      if (!d || !Array.isArray(d.items)) return;
      this._items = d.items;
      if (Array.isArray(d.tags) && d.tags.length) this._tags = d.tags;
      this._saveCache();
      this.render();
      if (document.getElementById('feed-all-ov')) this.renderAll();
    } catch (e) {}
  },

  _saveCache() {
    window.Storage._safeSet('cbt_feed_cache', { ts: Date.now(), items: (this._items || []).slice(0, 200), tags: this._tags });
  },

  // 내 고민에 맞는 태그가 앞, 고정 항목 다음, 반응이 나쁜 건(별로 ≥ 도움×2, 5표 이상) 뒤로
  sorted(mode) {
    const items = (this._items || []).filter(it => it && it.id && it.title);
    if (mode === 'new') return items.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    if (mode === 'up') return items.slice().sort((a, b) => (b.up || 0) - (a.up || 0) || (b.created || 0) - (a.created || 0));
    const concerns = window.Storage._safeGet('cbt_user_concerns', []) || [];
    const want = new Set([].concat(...concerns.map(c => this.TAG_OF_CONCERN[c] || [])));
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

  _thumb(sz) {
    return `<svg width="${sz || 12}" height="${sz || 12}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.5 0 2.5 1 2.5 2.5V10h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17.5 20H7"/></svg>`;
  },

  // 카드 한 장 — 홈(세로 카드)과 전체 보기(가로 행)가 같은 조각을 쓴다
  _card(it, row) {
    const esc = this._esc;
    const yt = it.type === 'youtube';
    const thumb = it.thumb || (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '');
    const thumbHtml = `
      <span class="feed-card__thumb">
        ${thumb ? `<img loading="lazy" src="${esc(thumb)}" alt="">` : `<span class="feed-card__ph">${window.Icons ? window.Icons.svg('note', { size: 28 }) : ''}</span>`}
        ${yt ? '<span class="feed-card__play">▶</span>' : ''}
        <span class="feed-card__type">${yt ? '영상' : '글'}</span>
      </span>`;
    const textHtml = `
      <span class="feed-card__t">${esc(it.title)}</span>
      ${it.note ? `<span class="feed-card__note">"${esc(it.note)}"</span>` : ''}
      <span class="feed-card__meta">
        ${(it.tags || []).slice(0, 2).map(t => `<span class="feed-tag">${esc(t)}</span>`).join('')}
        <span class="feed-card__up">${this._thumb()} ${it.up || 0}</span>
      </span>`;
    return row
      ? `<button class="feed-row" data-feed-open="${esc(it.id)}">${thumbHtml}<span class="feed-row__body">${textHtml}</span></button>`
      : `<button class="feed-card" data-feed-open="${esc(it.id)}">${thumbHtml}${textHtml}</button>`;
  },

  render() {
    const sec = document.getElementById('home-feed-sec');
    const el = document.getElementById('home-feed');
    if (!sec || !el) return;
    const items = this.sorted();
    // '전체 보기'는 '내 마음 도구' 제목 줄에 있다 — 카드와 같이 보이고 같이 숨는다
    const link = document.getElementById('home-feed-all');
    if (!items.length) { sec.classList.add('hidden'); if (link) link.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    if (link) link.classList.remove('hidden');
    el.innerHTML = items.slice(0, this.HOME_MAX).map(it => this._card(it, false)).join('');
    if (link) link.textContent = items.length > this.HOME_MAX ? `전체 보기 (${items.length}) ›` : '전체 보기 ›';
  },

  // ── 전체 보기 — 세로 목록 + 태그 필터 ──
  openAll(tag) {
    this.close();
    if (document.getElementById('feed-all-ov')) { this.renderAll(); return; }
    this._all = { tag: tag || '', sort: 'rec', shown: this.PAGE };
    const ov = document.createElement('div');
    ov.id = 'feed-all-ov';
    ov.className = 'feed-all';
    ov.dataset.ovGuard = '1';   // 뒤로가기로 홈에 돌아온다
    ov.innerHTML = `
      <div class="feed-all__head">
        <button class="feed-all__back" data-feed-all-close aria-label="닫기">‹</button>
        <h2>추천 콘텐츠</h2>
        <select class="feed-all__sort" data-feed-sort aria-label="정렬">
          <option value="rec">나에게 맞는 순</option>
          <option value="new">최신순</option>
          <option value="up">도움됐어요순</option>
        </select>
      </div>
      <div class="feed-all__chips" data-feed-chips></div>
      <div class="feed-all__list" data-feed-list></div>`;
    document.body.appendChild(ov);
    this.renderAll();
    if (window.Sfx) window.Sfx.play('nav');
  },

  renderAll() {
    const ov = document.getElementById('feed-all-ov');
    if (!ov) return;
    const esc = this._esc;
    const st = this._all;
    const chips = ov.querySelector('[data-feed-chips]');
    const list = ov.querySelector('[data-feed-list]');
    const sel = ov.querySelector('[data-feed-sort]');
    if (sel && sel.value !== st.sort) sel.value = st.sort;
    const all = this.sorted(st.sort);
    const count = t => all.filter(it => (it.tags || []).includes(t)).length;
    chips.innerHTML = [['', `전체 ${all.length}`]].concat(this._tags.map(t => [t, `${t} ${count(t)}`]))
      .filter(([t]) => !t || count(t))
      .map(([t, label]) => `<button class="feed-chip${st.tag === t ? ' on' : ''}" data-feed-tag="${esc(t)}">${esc(label)}</button>`).join('');
    const items = st.tag ? all.filter(it => (it.tags || []).includes(st.tag)) : all;
    if (!items.length) { list.innerHTML = '<p class="feed-all__empty">아직 이 태그의 콘텐츠가 없어요.</p>'; return; }
    list.innerHTML = items.slice(0, st.shown).map(it => this._card(it, true)).join('')
      + (items.length > st.shown ? `<button class="feed-all__more" data-feed-more>더 보기 (${items.length - st.shown}개 남음)</button>` : '');
  },

  closeAll() {
    const ov = document.getElementById('feed-all-ov');
    if (ov) ov.remove();
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
    // 같은 분류의 다른 영상 3개 — 다 보고 나서 이어 볼 것
    const tag0 = (it.tags || [])[0];
    const related = yt ? this.sorted().filter(x => x.id !== it.id && x.type === 'youtube' && tag0 && (x.tags || []).includes(tag0)).slice(0, 3) : [];
    ov.innerHTML = `
      <div class="feed-ov${yt ? ' feed-ov--video' : ''}">
        <div class="feed-ov__bar">
          <button class="feed-ov__x" data-feed-close aria-label="닫기">✕</button>
          ${(it.tags || []).map(t => `<span class="feed-tag">${esc(t)}</span>`).join('')}
        </div>
        ${yt && it.videoId ? `<div class="feed-ov__video" id="feed-player-box"><div id="feed-player"></div>
          <div class="feed-ov__poster" id="feed-poster" style="background-image:url('https://i.ytimg.com/vi/${esc(it.videoId)}/hqdefault.jpg')"><span class="feed-ov__spin"></span></div></div>` : ''}
        <h3>${esc(it.title)}</h3>
        ${it.author ? `<p class="feed-ov__author">${esc(it.author)}</p>` : ''}
        ${it.note ? `<div class="feed-ov__note"><span style="line-height: 0; flex-shrink: 0;">${window.Stickers ? window.Stickers.svg('think', 34) : ''}</span><span>${esc(it.note)}</span></div>` : ''}
        ${!yt ? `<div class="feed-ov__body">${this._body(it.body)}</div>` : ''}
        <div class="feed-ov__vote" data-feed-votes>
          <button data-feed-vote="1" class="${it.mine === 1 ? 'on' : ''}">${this._thumb(14)} 도움됐어요 · <span data-up>${it.up || 0}</span></button>
          <button data-feed-vote="-1" class="${it.mine === -1 ? 'on' : ''}"><span style="display:inline-block; transform: scaleY(-1);">${this._thumb(14)}</span> 별로예요 · <span data-down>${it.down || 0}</span></button>
        </div>
        ${yt ? `<a class="feed-ov__ext" href="${esc(it.url)}" data-feed-ext>유튜브 앱에서 보기 ›</a>` : ''}
        ${related.length ? `<div class="feed-ov__more"><div class="feed-ov__more-h">'${esc(tag0)}' 다른 영상</div>${related.map(x => this._card(x, true)).join('')}</div>` : ''}
      </div>`;
    ov.dataset.feedId = it.id;
    ov.addEventListener('click', e => { if (e.target === ov) this.close(); });
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
    if (yt && it.videoId) this._play(it);
  },

  // 앱 안 재생 — 유튜브 IFrame API 로 띄워 '퍼가기 금지' 영상(오류 101·150)을 알아채고 안내 화면으로 바꾼다.
  //  카드를 누른 손짓으로 열렸으니 바로 재생을 건다(휴대폰이 막으면 재생 버튼이 보인다).
  //  API 가 4초 안에 안 오면 그냥 iframe 으로 — 재생은 되고 오류 안내만 못 한다.
  _ytApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (this._ytP) return this._ytP;
    this._ytP = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) {} res(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { this._ytP = null; rej(new Error('yt-api')); };
      document.head.appendChild(s);
    });
    return this._ytP;
  },
  async _play(it) {
    const box = document.getElementById('feed-player-box');
    const poster = document.getElementById('feed-poster');
    const done = () => { if (poster) poster.remove(); };
    const noEmbed = () => {
      if (!box || !box.isConnected) return;
      box.innerHTML = `
        <div class="feed-ov__noembed" style="background-image:url('https://i.ytimg.com/vi/${this._esc(it.videoId)}/hqdefault.jpg')">
          <div><b>이 영상은 유튜브에서만 볼 수 있어요</b><span>만든 분이 다른 앱 안 재생을 막아 두었어요.</span>
          <a href="${this._esc(it.url)}" data-feed-ext>유튜브에서 보기 ›</a></div>
        </div>`;
    };
    try {
      const YT = await Promise.race([this._ytApi(), new Promise((_, r) => setTimeout(() => r(new Error('slow')), 4000))]);
      if (!document.getElementById('feed-player')) return;   // 그사이 닫혔다
      this._player = new YT.Player('feed-player', {
        videoId: it.videoId, width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: done,
          onError: e => { done(); if ([2, 100, 101, 150, 153].includes(e && e.data)) noEmbed(); }
        }
      });
    } catch (e) {
      const slot = document.getElementById('feed-player');
      if (!slot) return;
      slot.outerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${this._esc(it.videoId)}?rel=0&playsinline=1&autoplay=1" title="${this._esc(it.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      done();
    }
  },

  close() {
    try { if (this._player && this._player.destroy) this._player.destroy(); } catch (e) {}
    this._player = null;
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
    this._saveCache();
    this.render();
    if (document.getElementById('feed-all-ov')) this.renderAll();
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
  //  전체 목록을 번호와 함께 준다 — 모델은 [그림:영상|번호] 로 채팅 속 카드를 띄운다. 번호 → id 는 promptIdOf.
  //  번호는 이 턴에만 유효하다. 저장되는 카드에는 id 가 들어가므로 목록이 바뀌어도 옛 카드는 그대로 열린다.
  _promptIds: [],
  promptContext() {
    const items = this.sorted().slice(0, 80);
    this._promptIds = items.map(it => it.id);
    if (!items.length) return '';
    // 번호로 고르게 했더니 모델이 이웃 번호를 집어 "말한 제목 ≠ 카드" 가 됐다 → 제목을 그대로 쓰게 한다.
    const byTag = {};
    items.forEach(it => {
      const t = (it.tags || [])[0] || '기타';
      // 표식을 깨는 [ ] | │ 는 빼고 보여 준다 (맞춰 볼 때는 어차피 문장부호를 무시한다)
      (byTag[t] = byTag[t] || []).push(`「${String(it.title).replace(/[\[\]|│]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48)}」`);
    });
    return '[추천 영상 — 운영자가 고른 self-care 영상. 앱 안에서 바로 볼 수 있음]\n'
      + Object.keys(byTag).map(t => `〈${t}〉 ${byTag[t].join(' ')}`).join('\n')
      + '\n사용자의 지금 고민과 분명히 맞는 영상이 있으면 [그림:영상|「」 안의 제목을 한 글자도 바꾸지 말고 그대로] 로 카드를 보여주세요 (예: [그림:영상|스트레스 바로알기]). 카드에 제목·썸네일이 나오니 답장에서 제목을 따로 말하지 말고, 왜 골랐는지만 한 줄로. 카드를 누르면 앱 안에서 바로 열립니다.'
      + '\n· 한 번에 하나만. 이 대화에서 이미 권했으면 다시 권하지 마세요. 힘든 이야기를 막 꺼낸 첫 답장에서는 먼저 들어주고, 몇 번 주고받은 뒤나 사용자가 방법·자료를 원할 때 권하세요.'
      + '\n· 사용자가 "영상 추천해줘", "볼 만한 거 있어?"처럼 직접 물으면 바로 가장 맞는 것 하나를 카드로 주고, 왜 골랐는지 한 줄로 말해 주세요.'
      + '\n· 위 목록에 없는 영상·링크는 지어내지 마세요. 주소를 직접 쓰지 말고 카드만 쓰세요.';
  },
  // 모델이 쓴 영상 표식 인자 → feed id. 제목이 원칙(공백·문장부호 무시, 앞부분만 써도 하나로 좁혀지면 인정),
  //  옛 번호 방식도 받는다. 못 찾으면 '' — 카드를 띄우지 않는다(엉뚱한 영상보다 없는 게 낫다).
  promptIdOf(arg) {
    const a = String(arg || '').replace(/[「」"'“”‘’]/g, '').trim();
    if (!a) return '';
    if (/^\d{1,3}$/.test(a)) { const i = parseInt(a, 10) - 1; return (i >= 0 && this._promptIds[i]) || ''; }
    const norm = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
    const want = norm(a);
    if (want.length < 2) return '';
    const pool = (this._promptIds.length ? this._promptIds.map(id => this.get(id)) : (this._items || [])).filter(Boolean);
    const exact = pool.find(it => norm(it.title) === want);
    if (exact) return exact.id;
    const part = pool.filter(it => { const t = norm(it.title); return t.startsWith(want) || t.includes(want) || want.includes(t); });
    return part.length === 1 ? part[0].id : '';
  }
};

document.addEventListener('click', function (e) {
  const F = window.Feed;
  if (!F) return;
  if (e.target.closest('[data-feed-all]')) { F.openAll(); return; }
  if (e.target.closest('[data-feed-all-close]')) { F.closeAll(); return; }
  const chip = e.target.closest('[data-feed-tag]');
  if (chip) { F._all.tag = chip.dataset.feedTag || ''; F._all.shown = F.PAGE; F.renderAll(); return; }
  if (e.target.closest('[data-feed-more]')) { F._all.shown += F.PAGE; F.renderAll(); return; }
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
document.addEventListener('change', function (e) {
  const sel = e.target.closest && e.target.closest('[data-feed-sort]');
  if (sel && window.Feed) { window.Feed._all.sort = sel.value; window.Feed._all.shown = window.Feed.PAGE; window.Feed.renderAll(); }
});
