window.Marketplace = {
  userLat: 37.5665,   // 기본 위치 (서울 시청 중심)
  userLng: 126.9780,
  hasGps: false,

  // 공용 이스케이프 — & < > " ' 5자 전부. 상담사가 프로 앱에서 자유 입력한
  //  이름·병원·소개·태그·후기가 그대로 innerHTML 에 들어가므로 반드시 통과시킨다.
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  // 상담사 사진 URL 은 스킴 화이트리스트 — data:image/ 또는 https:// 만 허용.
  //  그 밖(javascript: 등)은 빈 값으로 떨어뜨려 기본 아바타가 뜨게 한다.
  _safePhoto(u) {
    const s = String(u == null ? '' : u).trim();
    return (/^data:image\//i.test(s) || /^https:\/\//i.test(s)) ? s : '';
  },

  // 시연용 가짜 상담사 5명(c1~c5)이 여기 박혀 있었다.
  //  실제 상담사가 서버에 들어오기 전까지 화면을 채우는 용도였는데,
  //  이제 신청·승인이 서버로 도니 진짜와 섞이면 안 된다. 내담자가
  //  존재하지 않는 상담사를 보고 예약·결제하는 일이 실제로 생길 수 있다.
  counselors: [],

  init() {
    this.renderCounselors();
    this.loadServer();          // 입점 상담사는 서버에서 — 받아오면 다시 그린다
    // 위치 동기화 자동 시도 (GPS)
    this.requestUserLocation(true);

    // 실시간 반영 — 앱을 켠 채로 두면 운영자가 상담사를 등록·삭제해도 몰랐다.
    //  매칭 탭에 들어올 때마다, 그리고 화면에 다시 돌아올 때마다 명부를 새로 받는다.
    //  (15초 안에 또 부르면 건너뛰어 서버를 괴롭히지 않는다)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item[data-tab="counselors"]')) this.loadServer();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.loadServer();
    });
  },

  // 하버스인(Haversine) 공식을 이용한 두 위경도 좌표 간 직선 거리(km) 계산
  calcDistance(lat1, lon1, lat2, lon2) {
    // 좌표가 없으면 '멀다'가 아니라 '모른다'. 999 를 돌려주면
    //  서버에서 온 상담사(좌표 없음)가 카드에 '999km' 로 찍힌다.
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // 지구 반지름 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
  },

  requestUserLocation(silent = false) {
    const statusText = document.getElementById('gps-status-text');
    if (!navigator.geolocation) {
      if (!silent && statusText) statusText.textContent = "GPS 미지원";
      return;
    }

    if (!silent && statusText) statusText.textContent = "위치 측정 중...";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userLat = pos.coords.latitude;
        this.userLng = pos.coords.longitude;
        this.hasGps = true;
        if (statusText) statusText.textContent = "내 위치 연결됨";
        this.renderCounselors();
      },
      (err) => {
        console.warn("Geolocation error or permission denied:", err);
        if (!silent && statusText) statusText.textContent = "내 위치 탐색";
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  },

  handleSortChange() {
    this.renderCounselors();
  },

 // === 즐겨찾는 상담사 () — 항상 맨 위에 고정 ===
  favs() {
    return (window.Storage && window.Storage._safeGet('cbt_favs', [])) || [];
  },

  isFav(id) {
    return this.favs().includes(id);
  },

  toggleFav(id) {
    if (window.Sfx) window.Sfx.hit('pop');
    let f = this.favs();
    if (f.includes(id)) { f = f.filter(x => x !== id); if (window.App) window.App.showRecordToast('즐겨찾기에서 뺐어요'); }
    else { f.push(id); if (window.App) window.App.showRecordToast('즐겨찾기! 항상 맨 위에 보여드릴게요'); }
    window.Storage._safeSet('cbt_favs', f);
    this.renderCounselors();
  },

  // === 정렬·필터 상태 — 대중적 패턴: 정렬은 드롭다운(바텀시트) 하나, 필터는 토글 칩 ===
  _sort: 'distance',
  _availOnly: false,
  SORTS: [['distance', '가까운 순'], ['rating', '별점 높은 순'], ['reviews', '후기 많은 순'], ['price_low', '가격 낮은 순']],

  setSort(v) {
    if (window.Sfx) window.Sfx.play('nav');
    this._sort = v;
    this.renderCounselors();
  },

  // 이름·병원·전문분야 검색 (검색창은 정적 DOM이라 입력 포커스가 유지된다)
  _query: '',
  setQuery(v) {
    this._query = (v || '').trim().toLowerCase();
    this.renderCounselors();
  },

  toggleAvail() {
    if (window.Sfx) window.Sfx.play('nav');
    this._availOnly = !this._availOnly;
    this.renderCounselors();
  },

  renderFilterBar() {
    const row = document.getElementById('cc-filter-row');
    if (!row) return;
    const sortLabel = (this.SORTS.find(s => s[0] === this._sort) || this.SORTS[0])[1];
    const caret = '<svg width="10" height="10" viewBox="0 0 10 10" style="flex-shrink: 0;"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    row.innerHTML = `
      <button class="cc-chip" style="flex-shrink: 0; display: inline-flex; align-items: center; gap: 0.3rem;" title="최신 정보로 새로고침" onclick="window.Marketplace.refresh(this)">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>
      </button>
      <button class="cc-chip" style="flex-shrink: 0; display: inline-flex; align-items: center; gap: 0.3rem;" onclick="window.Marketplace.openSortSheet()">${sortLabel} ${caret}</button>
      <button class="cc-chip ${this._availOnly ? 'on' : ''}" style="flex-shrink: 0;" onclick="window.Marketplace.toggleAvail()">바로상담 가능만</button>
 <button class="cc-chip"style="flex-shrink: 0;"onclick="window.Marketplace.requestUserLocation()">${window.Icons ? window.Icons.svg('pinloc', { size: 13 }) :''}<span id="gps-status-text">${this.hasGps ?'내 위치':'내 위치'}</span></button>`;
  },

  // 정렬 바텀시트 — 배달앱처럼 아래에서 올라오는 선택지
  openSortSheet() {
    try { if (window.Sfx) window.Sfx.play('nav'); } catch (e) {}
    if (document.getElementById('cc-sort-sheet')) return;
    const wrap = document.createElement('div');
    wrap.id = 'cc-sort-sheet';
    wrap.style.cssText = 'position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,0.38); display: flex; align-items: flex-end;';
    wrap.innerHTML = `
      <div style="width: 100%; background: var(--bg-secondary); border-radius: 20px 20px 0 0; padding: 0.8rem 1.25rem calc(1.4rem + env(safe-area-inset-bottom)); animation: slideUp 0.22s ease;">
        <div style="width: 38px; height: 4px; border-radius: 2px; background: var(--glass-border); margin: 0 auto 0.9rem;"></div>
        <strong style="font-size: 0.98rem; color: var(--text-primary); display: block; margin-bottom: 0.3rem;">정렬</strong>
        ${this.SORTS.map(([v, label], i) => `
          <button onclick="window.Marketplace.pickSort('${v}')" style="all: unset; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0.8rem 0.15rem; font-size: 0.93rem; cursor: pointer; color: ${this._sort === v ? 'var(--accent-primary)' : 'var(--text-primary)'}; font-weight: ${this._sort === v ? '800' : '500'}; ${i < this.SORTS.length - 1 ? 'border-bottom: 1px solid var(--glass-border);' : ''}">
 <span>${label}</span>${this._sort === v ?'<span style="font-weight: 900;"></span>':''}
          </button>`).join('')}
      </div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  },

  pickSort(v) {
    const sheet = document.getElementById('cc-sort-sheet');
    if (sheet) sheet.remove();
    this.setSort(v);
  },

  renderCounselors() {
    const list = document.getElementById('counselors-list');
    if (!list) return;

    // 내 캐시 잔액 칩 — 결제 직전에야 잔액 부족을 아는 일이 없게
    const chip = document.getElementById('wallet-chip');
    if (chip && window.Wallet) chip.innerHTML = (window.Icons ? window.Icons.svg('cash', { size: 14 }) : '') + ` ${window.Wallet.balance().toLocaleString()}캐시 · 충전 ›`;

    // 서버의 실시간 통화 상태 갱신 (10초 캐시)
    if (!this._skipPresenceFetch) this.fetchPresence();

    this.renderFilterBar();
    const sortType = this._sort;
    const filterAvailable = this._availOnly;

    // 각 상담사의 사용자 위치로부터의 거리(km) 실시간 계산
    let filtered = this.all().map(c => {
      const dist = this.calcDistance(this.userLat, this.userLng, c.lat, c.lng);
      return { ...c, distance: dist };
    });

    if (filterAvailable) {
      filtered = filtered.filter(c => this.liveState(c) === 'avail');
    }

    if (this._query) {
      const q = this._query;
      filtered = filtered.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.hospital || '').toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q)));
    }

 // 1순위: 즐겨찾기, 2순위: 지금 걸 수 있는 사람 (가능 → 통화 중 → 부재), 3순위: 선택한 정렬
    const stateRank = { avail: 0, busy: 1, off: 2 };
    filtered.sort((a, b) => {
      const f = (this.isFav(a.id) ? 0 : 1) - (this.isFav(b.id) ? 0 : 1);
      if (f !== 0) return f;
      const r = stateRank[this.liveState(a)] - stateRank[this.liveState(b)];
      if (r !== 0) return r;
      // 거리를 모르는 사람은 뒤로. null 을 그냥 빼면 NaN 이 되어 정렬이 흐트러진다.
      if (sortType === 'distance') {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      }
      if (sortType === 'rating') return b.rating - a.rating;
      if (sortType === 'reviews') return b.reviews - a.reviews;
      if (sortType === 'price_low') return a.price - b.price;
      return 0;
    });

    if (!filtered.length) {
      // 아무도 없는 것과 '걸러져서' 없는 것은 다르다.
      //  둘 다 '검색어를 바꿔보세요'로 안내하면, 아직 상담사가 한 명도
      //  없을 때 사용자는 자기가 뭘 잘못한 줄 안다.
      const none = !this.all().length;
      list.innerHTML = `<div style="text-align: center; padding: 2.2rem 1rem; color: var(--text-muted);">
 <div style="margin-bottom: 0.5rem;">${window.Stickers ? window.Stickers.svg('think', 72) :''}</div>
        ${none ? `
        <p style="font-size: 0.88rem; margin: 0; color: var(--text-primary); font-weight: 700;">아직 상담사가 준비 중이에요</p>
        <p style="font-size: 0.78rem; margin: 0.4rem 0 0; line-height: 1.6;">자격을 확인한 선생님들만 모시고 있어요.<br>준비되는 대로 여기에서 만나실 수 있어요.</p>
        <p style="font-size: 0.76rem; margin: 0.9rem 0 0;">그동안은 우렁이와 이야기하며 마음을 정리해보세요.</p>`
        : `
        <p style="font-size: 0.88rem; margin: 0;">${this._query ? `'${this._query.replace(/[<>&"']/g, '')}' 검색 결과가 없어요` : '조건에 맞는 상담사가 없어요'}</p>
        <p style="font-size: 0.76rem; margin: 0.3rem 0 0;">검색어나 필터를 바꿔보세요</p>`}
      </div>`;
      return;
    }

    list.innerHTML = filtered.map(c => {
      const st = this.liveState(c);
      return `
      <div class="glass-card cc2" onclick="window.Marketplace.openProfile('${c.id}')" style="position: relative;">
        <button onclick="event.stopPropagation(); window.Marketplace.toggleFav('${c.id}')" title="즐겨찾기"
          style="all: unset; position: absolute; top: 0.7rem; right: 0.8rem; cursor: pointer; font-size: 1.1rem; padding: 0.15rem; line-height: 1; line-height: 0;">${window.Icons ? window.Icons.svg(this.isFav(c.id) ? 'favOn' : 'favOff', { size: 20, line: this.isFav(c.id) ? '#C98A93' : '#B7A88F' }) : ''}</button>
        <div class="cc2-top">
          <div class="cc2-ava">
            ${this._safePhoto(c.photo) ? `<img src="${this._esc(this._safePhoto(c.photo))}" alt="${this._esc(c.name)}">` : (window.Icons ? window.Icons.art.avatar(c.avatar, 56) : '')}
            <span class="cc2-dot ${st}"></span>
          </div>
          <div class="cc2-info">
            <div class="cc2-name">${this._esc(c.name)}${c.isNew ? ' <span class="cc2-new">NEW</span>' : ''}</div>
            <div class="cc2-hosp">${this._esc(c.hospital)}</div>
            <div class="cc2-meta">
              <span role="button" onclick="event.stopPropagation(); window.Marketplace.openReviews('${c.id}')" style="cursor: pointer; text-decoration: underline; text-decoration-color: var(--glass-border); text-underline-offset: 3px;">${window.Icons ? window.Icons.svg('star', { size: 13 }) : ''} <b>${c.rating}</b> (${c.reviews})</span>
              ${c.distance == null ? '' : `<span>${window.Icons ? window.Icons.svg('pinloc', { size: 13 }) : ''} ${c.distance}km</span>`}
              <span class="cc2-st ${st}">${st === 'avail' ? '● 상담 가능' : st === 'busy' ? '● 통화 중' : '● 부재중'}</span>
            </div>
            <div class="cc2-tags">${(c.tags || []).slice(0, 3).map(t => `<span class="cc2-tag">${this._esc(t)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="cc2-duo" onclick="event.stopPropagation()">
          <button class="cc2-book" onclick="window.Booking.openModal('${c.id}')">
            <b>${window.Icons ? window.Icons.svg('booking', { size: 14 }) : ''} 예약 상담</b><span>30분 ${c.price.toLocaleString()}원</span>
          </button>
          ${st === 'avail'
            ? `<button class="cc2-live" onclick="window.App.startInstantChat('${c.id}')"><b>${window.Icons ? window.Icons.svg('bolt', { size: 14 }) : ''} 바로상담</b><span>채팅방으로 바로 연결</span></button>`
            : st === 'busy'
              ? (window.App && window.App.isWaitingFor(c.id)
                ? `<button class="cc2-live is-busy" onclick="window.App.leaveCallQueue('${c.id}')"><b>대기 중</b><span>탭하면 대기 취소</span></button>`
                : `<button class="cc2-live is-busy" onclick="window.App.joinCallQueue('${c.id}')" style="cursor: pointer;"><b>통화 중</b><span>다음 순서 잡기</span></button>`)
              : `<div class="cc2-live is-off"><b>${window.Icons ? window.Icons.svg('bolt', { size: 14 }) : ''} 바로상담</b><span>지금은 부재중</span></div>`}
        </div>
        <div class="cc2-links" onclick="event.stopPropagation()">
          <button onclick="window.Marketplace.openProfile('${c.id}')">프로필·후기 보기</button>
          <i></i>
          <button onclick="window.App.openHumanChat('${c.id}')">${window.Icons ? window.Icons.svg('bubble', { size: 14 }) : ''} 채팅 문의</button>
        </div>
      </div>`;
    }).join('');
  },

  // ==========================================================================
  //  전체 후기 페이지 — 별점 분포 · 정렬 · 내 후기 표시 (작성자는 익명 처리)
  // ==========================================================================
  _revSort: 'recent',

  // 내가 남긴 후기까지 합쳐 전체 목록을 만든다
  allReviews(c) {
    const S = window.Storage;
    const bookings = (S && S._safeGet('cbt_bookings', [])) || [];
    const mine = (S && S._safeGet('cbt_reviews', {})) || {};
    const own = bookings.filter(b => b.counselorId === c.id && mine[b.id]).map(b => ({
      author: '나', rating: mine[b.id].rating || 5, text: mine[b.id].text || '',
      ts: mine[b.id].ts || b.whenTs || Date.now(), isMine: true
    }));
    const base = (c.reviewsList || []).map((r, i) => ({
      author: r.author, rating: r.rating, text: r.text,
      ts: r.ts || (Date.now() - (i + 1) * 86400000 * 9), isMine: false
    }));
    return own.concat(base);
  },

  // ── 리뷰 관리(신고·숨김) ────────────────────────────────────────
  _hidden() { return (window.Storage && window.Storage._safeGet('cbt_review_hidden', {})) || {}; },
  _reports() { return (window.Storage && window.Storage._safeGet('cbt_review_reports', [])) || []; },

  // 리뷰 고유키 (상담사 + 작성자 + 본문 앞부분)
  reviewKey(cid, r) {
    return cid + '|' + (r.author || '') + '|' + String(r.text || '').slice(0, 24);
  },

  isHidden(cid, r) { return !!this._hidden()[this.reviewKey(cid, r)]; },

  async reportReview(cid, key) {
    const reason = await window.UI.prompt('이 후기를 신고하는 이유를 적어주세요.\n(욕설·허위·광고·개인정보 노출 등)');
    if (reason === null) return;
    const reports = this._reports();
    if (reports.some(x => x.key === key)) { window.UI.alert('이미 신고된 후기예요. 검토 중입니다.'); return; }
    const c = this.all().find(x => x.id === cid);
    const all = c ? this.allReviews(c) : [];
    const r = all.find(x => this.reviewKey(cid, x) === key) || {};
    reports.unshift({ key, cid, counselor: c ? c.name : '', author: r.author || '', text: r.text || '',
                      reason: (reason || '').trim() || '사유 미기재', ts: Date.now(), status: 'open' });
    window.Storage._safeSet('cbt_review_reports', reports.slice(0, 200));
    if (window.App) window.App.showRecordToast('신고가 접수됐어요. 검토 후 조치할게요');
    this.renderReviews();
  },

  // 대표 후기 선정 — 별점 높은 것만 골라 보여주면 신뢰를 잃는다.
  //  ① 정보량(길이) 70% + 최신성 30% 으로 점수화
  //  ② 긍정(4점 이상) 1개 + 비판(3점 이하) 1개를 반드시 섞는다
  //  ③ 비판 후기가 없으면 그때만 정보량 순으로 채운다
  pickHighlights(list, n) {
    n = n || 2;
    if (!list || !list.length) return [];
    const score = r => {
      const len = Math.min((r.text || '').length, 160) / 160;
      const fresh = Math.max(0, 1 - (Date.now() - (r.ts || 0)) / (180 * 86400000));
      return len * 0.7 + fresh * 0.3;
    };
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    const out = [];
    const pos = sorted.find(r => r.rating >= 4);
    const neg = sorted.find(r => r.rating <= 3);
    if (pos) out.push(pos);
    if (neg && out.length < n) out.push(neg);
    for (const r of sorted) { if (out.length >= n) break; if (!out.includes(r)) out.push(r); }
    return out.slice(0, n);
  },

  openReviews(id) {
    try { if (window.Sfx) window.Sfx.play('pop'); } catch (e) {}
    const c = this.all().find(x => x.id === id);
    if (!c) return;
    this._revId = id;
    const old = document.getElementById('review-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'review-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 960; background: var(--bg-primary); overflow-y: auto; padding-bottom: 2rem;';
    document.body.appendChild(ov);
    this.renderReviews();
  },

  closeReviews() {
    const ov = document.getElementById('review-overlay');
    if (ov) ov.remove();
  },

  setRevSort(v) { this._revSort = v; this.renderReviews(); },

  renderReviews() {
    const ov = document.getElementById('review-overlay');
    if (!ov) return;
    const c = this.all().find(x => x.id === this._revId);
    if (!c) return;
    let list = this.allReviews(c).filter(r => !this.isHidden(c.id, r));

    // 별점 분포 (실제 목록 기준)
    const dist = [5, 4, 3, 2, 1].map(v => ({ v, n: list.filter(r => Math.round(r.rating) === v).length }));
    const total = list.length || 1;

    if (this._revSort === 'high') list = [...list].sort((a, b) => b.rating - a.rating);
    else if (this._revSort === 'low') list = [...list].sort((a, b) => a.rating - b.rating);
    else list = [...list].sort((a, b) => b.ts - a.ts);

    const esc = this._esc;
    // 작성자는 익명 처리 — 앞 한 글자만 남기고 가린다
    const anon = (name, isMine) => {
      if (isMine) return '나';
      const n = String(name || '익명');
      return n.length <= 1 ? n + '○○' : n[0] + '○'.repeat(Math.min(3, n.length - 1));
    };
    const ago = ts => { const d = Math.floor((Date.now() - ts) / 86400000); return d < 1 ? '오늘' : d < 30 ? d + '일 전' : Math.floor(d / 30) + '개월 전'; };

    const SORTS = [['recent', '최신순'], ['high', '별점 높은순'], ['low', '별점 낮은순']];

    ov.innerHTML = `
      <div style="position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 0.55rem; padding: 0.85rem 1rem; background: var(--bg-secondary); border-bottom: 1px solid var(--glass-border);">
        <button onclick="window.Marketplace.closeReviews()" style="all: unset; box-sizing: border-box; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.3rem; color: var(--text-primary);">←</button>
        <strong style="font-size: 1.02rem; color: var(--text-primary);">${esc(c.name)} 후기</strong>
      </div>

      <div style="padding: 1rem;">
        <div class="glass-card" style="padding: 1rem; display: flex; gap: 1rem; align-items: center;">
          <div style="text-align: center; flex-shrink: 0;">
            <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary); line-height: 1.1;">${c.rating}</div>
            <div style="line-height: 0; margin: 0.2rem 0;">${window.Icons ? window.Icons.stars(Math.round(c.rating), 13) : ''}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">후기 ${c.reviews}개</div>
          </div>
          <div style="flex: 1 1 0%; min-width: 0;">
            ${dist.map(d => `
              <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.22rem;">
                <span style="font-size: 0.66rem; color: var(--text-muted); width: 14px;">${d.v}</span>
                <div style="flex: 1; height: 6px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden;">
                  <div style="height: 100%; width: ${Math.round(d.n / total * 100)}%; background: var(--accent-warm, #e8b04b);"></div>
                </div>
                <span style="font-size: 0.64rem; color: var(--text-muted); width: 18px; text-align: right;">${d.n}</span>
              </div>`).join('')}
          </div>
        </div>

        <div style="display: flex; gap: 0.35rem; margin: 0.9rem 0 0.7rem;">
          ${SORTS.map(([k, label]) => `
            <button onclick="window.Marketplace.setRevSort('${k}')" style="all: unset; cursor: pointer; font-size: 0.74rem; font-weight: 700; padding: 0.3rem 0.7rem; border-radius: 999px;
                   border: 1px solid ${this._revSort === k ? 'transparent' : 'var(--glass-border)'};
                   background: ${this._revSort === k ? 'var(--accent-primary)' : 'transparent'};
                   color: ${this._revSort === k ? '#fff' : 'var(--text-secondary)'};">${label}</button>`).join('')}
        </div>

        <p style="margin: 0 0 0.7rem; font-size: 0.68rem; color: var(--text-muted); line-height: 1.6;">
          작성자는 개인정보 보호를 위해 <b>익명</b>으로 표시돼요. 상담을 완료하면 후기를 남길 수 있어요.
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          ${list.length ? list.map(r => `
            <div style="background: var(--bg-secondary); border: 1px solid var(--glass-border); ${r.isMine ? 'border-color: color-mix(in srgb, var(--accent-primary) 45%, transparent);' : ''} border-radius: 14px; padding: 0.85rem 0.95rem;">
              <div style="display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.35rem;">
                <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary);">${anon(r.author, r.isMine)}</span>
                ${r.isMine ? '<span style="font-size: 0.62rem; font-weight: 800; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 14%, transparent); padding: 0.08rem 0.4rem; border-radius: 999px;">내 후기</span>' : ''}
                <span style="flex: 1;"></span>
                <span style="line-height: 0;">${window.Icons ? window.Icons.stars(Math.round(r.rating), 12) : ''}</span>
                <span style="font-size: 0.66rem; color: var(--text-muted);">${ago(r.ts)}</span>
              </div>
              <div style="display: flex; justify-content: flex-end; margin-top: 0.3rem;">
                ${r.isMine ? '' : `<button data-mk-act="report" data-mk-cid="${esc(c.id)}" data-mk-key="${esc(this.reviewKey(c.id, r))}" style="all: unset; cursor: pointer; font-size: 0.66rem; color: var(--text-muted); text-decoration: underline; text-underline-offset: 2px;">신고</button>`}
              </div>
              <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.65;">${esc(r.text)}</p>
            </div>`).join('')
            : `<p style="text-align: center; font-size: 0.82rem; color: var(--text-muted); padding: 2rem 0;">아직 등록된 후기가 없어요.</p>`}
        </div>
      </div>`;
  },

  // 새로고침 — 목록·바로상담 가능 여부를 지금 시점으로 다시 받아온다
  async refresh(btn) {
    if (window.Sfx) window.Sfx.play('nav');
    if (btn) { btn.style.opacity = '0.35'; btn.disabled = true; }
    try {
      await Promise.resolve(this.loadServer(true));
      await Promise.resolve(this.fetchPresence(true));
      this.renderCounselors();
      if (window.App) window.App.showRecordToast('최신 정보로 새로고침했어요');
    } catch (e) {} finally {
      if (btn) { btn.style.opacity = ''; btn.disabled = false; }
    }
  },

  // === 바로상담 실시간 상태 (서버 presence) ===
  _presence: {},
  _presenceTs: 0,

  fetchPresence(force) {
    if (!force && Date.now() - this._presenceTs < 10000) return; // 10초 캐시
    // 서버가 없는 배포본에서는 조용히 접는다 (App 이 30분마다 다시 확인한다)
    if (window.App && window.App._serverOk === false) return;
    this._presenceTs = Date.now();
    window.Api.f('/api/presence').then(r => {
      if (window.App && !r.ok) window.App._serverOk = false;
      return r.ok ? r.json() : null;
    }).then(d => {
      if (!d) return;
      const changed = JSON.stringify(d.presence) !== JSON.stringify(this._presence);
      this._presence = d.presence || {};
      if (changed && document.getElementById('tab-counselors')?.classList.contains('active')) {
        this._skipPresenceFetch = true;
        this.renderCounselors();
        this._skipPresenceFetch = false;
      }
    }).catch(() => {});
  },

  // 카드에 표시할 상태: avail(지금 통화 가능) / busy(통화 중) / off(부재중)
  liveState(c) {
    const p = this._presence[c.id];
    if (!p) return c.isAvailableNow ? 'avail' : 'off'; // 서버 미연결 시 데모 폴백
    if (!p.available) return 'off';
    return p.busy ? 'busy' : 'avail';
  },

  // 바로상담(30초당) 요금 — 예약 상담료에서 자동 책정: ÷60 × 1.25(즉시성 프리미엄)
  // 상담사가 따로 정할 필요 없이 예약 상담료와 항상 정합. 10캐시 단위, 최저 500.
  callRateFor(c) {
    if (!c || !c.price) return 700;
    return Math.max(500, Math.round(c.price / 60 * 1.25 / 10) * 10);
  },

  // ── 서버 명부 ────────────────────────────────────────────────────
  //  입점 상담사는 서버에 있다. 기기 사본만 보면 A 폰에서 승인한 사람이
  //  B 폰에는 없다 — 실제로 그래서 아무도 안 보였다.
  //  all() 은 동기라 여기저기서 그대로 부른다. 비동기로 바꾸면 파장이 커지므로
  //  받아둔 걸 캐시에 넣고 all() 은 그걸 읽기만 한다.
  _server: [],

  _loadedAt: 0,
  async loadServer(force) {
    if (!force && Date.now() - this._loadedAt < 15000) return;   // 15초 안 중복 호출 방지
    this._loadedAt = Date.now();
    const d = await (window.Api && window.Api.json
      ? window.Api.json('/api/counselors')
      : fetch('/api/counselors').then(r => r.ok ? r.json() : null)).catch(() => null);
    if (!d || !Array.isArray(d.items)) { this._loadedAt = 0; return; }
    // 서버가 정상 응답한 순간, 서버에 없는 기기 사본은 '삭제된 상담사'다.
    //  전에는 "구버전 잔재"라며 남겨뒀는데, 그 탓에 운영자가 지운 상담사가
    //  옛날에 저장해둔 폰에서만 유령처럼 계속 보였다. 지운다.
    try {
      const liveIds = new Set(d.items.map(c => c.id));
      const customs = (window.Storage && window.Storage._safeGet('cbt_custom_counselors', [])) || [];
      const kept = customs.filter(c => liveIds.has(c.id));
      if (kept.length !== customs.length && window.Storage) {
        window.Storage._safeSet('cbt_custom_counselors', kept);
      }
    } catch (e) {}
    this._server = d.items.map(c => ({
      id: c.id, name: c.name, hospital: c.hospital || '', addr: c.addr || '',
      tags: c.tags || [], price: c.price || 40000,
      callRate: c.callRate || this.callRateFor({ price: c.price }),
      // 얼굴과 좌표. 전에는 이 둘을 안 받아서, 서버 상담사는 전부 그림 아바타에
      //  '내 위치에서 null km' 였다 — 좌표가 undefined 라 calcDistance 가
      //  null 을 돌려주는데 그 null 이 그대로 화면에 찍혔다.
      photo: c.photo || '',
      lat: c.lat || 0, lng: c.lng || 0,
      rating: 5, reviews: 0, avatar: 0,
      isAvailableNow: !!c.available, isNew: true, fromServer: true,
      career: [c.hospital ? '현) ' + c.hospital : '', c.license || '', c.intro || ''].filter(Boolean),
      reviewsList: []
    }));
    if (this.renderCounselors) this.renderCounselors();
  },

  // 기본 상담사 + 입점 상담사 합본, 내가 남긴 리뷰를 별점·후기 목록에 실반영
  all() {
    // 서버 명부가 원본이다. 기기 사본은 서버에 없는 것만 (구버전 잔재) 남긴다.
    const ids = new Set(this._server.map(c => c.id));
    const customs = ((window.Storage && window.Storage._safeGet('cbt_custom_counselors', [])) || [])
      .filter(c => !ids.has(c.id));
    const base = this._server.concat(customs, this.counselors);
    const bookings = (window.Storage && window.Storage._safeGet('cbt_bookings', [])) || [];
    const reviews = (window.Storage && window.Storage._safeGet('cbt_reviews', {})) || {};
    return base.map(c => {
      const mine = bookings.filter(b => b.counselorId === c.id && reviews[b.id]).map(b => reviews[b.id]);
      if (!mine.length) return c;
      const total = (c.reviews || 0) + mine.length;
      const rating = (((c.rating || 5) * (c.reviews || 0)) + mine.reduce((s, r) => s + (r.rating || 5), 0)) / total;
      return {
        ...c,
        rating: Math.round(rating * 10) / 10,
        reviews: total,
        reviewsList: [
          ...mine.map(r => ({ author: '나 (실제 이용)', text: r.text || '(별점만 남겼어요)', rating: r.rating })),
          ...(c.reviewsList || [])
        ]
      };
    });
  },

  getCounselor(id) {
    return this.all().find(c => c.id === id);
  },

  openProfile(id) {
    try { if (window.Sfx) window.Sfx.play('pop'); } catch (e) {}   // 카드가 펼쳐지는 느낌
    const counselor = this.getCounselor(id);
    if (!counselor) return;
    
    const dist = this.calcDistance(this.userLat, this.userLng, counselor.lat, counselor.lng);
    const modal = document.getElementById('counselor-profile-modal');
    const content = document.getElementById('counselor-profile-content');
    if (!modal || !content) return;
    
    content.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <div class="counselor-avatar counselor-avatar--lg">
          ${this._safePhoto(counselor.photo) ? `<img src="${this._esc(this._safePhoto(counselor.photo))}" alt="${this._esc(counselor.name)}" style="width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 2px solid var(--glass-border);">` : (window.Icons ? window.Icons.art.avatar(counselor.avatar, 96) : '')}
        </div>
        <div>
          <h2 style="margin: 0;">${this._esc(counselor.name)}</h2>
          <p class="meta-line" style="color: var(--text-muted); font-size: 0.9rem; margin: 0.3rem 0;">${window.Icons ? window.Icons.svg('hospital', { size: 15 }) : ''}${this._esc(counselor.hospital)}</p>
          <div style="display: flex; gap: 0.4rem; align-items: center; margin: 0.4rem 0;">
 ${dist == null
   ? (counselor.addr ? `<span style="background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 20px;">${this._esc(counselor.addr)}</span>` : '')
   : `<span style="background: color-mix(in srgb, var(--accent-primary) 15%, transparent); color: var(--accent-primary); font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 20px;"> 내 위치에서 ${dist} km</span>`}
          </div>
          <div style="display: flex; gap: 0.4rem; align-items: center; margin: 0.5rem 0;">
            ${window.Icons ? window.Icons.stars(counselor.rating, 17) : ''}
            <span style="font-weight: 700; font-size: 1.05rem;">${counselor.rating}</span>
            <span style="color: var(--text-muted); font-size: 0.9rem;">(${counselor.reviews}개 후기)</span>
          </div>
        </div>
      </div>
      
      <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.5rem 0; color: var(--accent-primary);" class="card-head">${window.Icons ? window.Icons.svg('pin',{size:16}):''}주요 이력 및 병원 위치</h4>
        <ul style="font-size: 0.85rem; padding-left: 1.2rem; margin: 0; line-height: 1.6;">
          ${counselor.career.map(c => `<li>${this._esc(c)}</li>`).join('')}
        </ul>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; margin-bottom: 0.8rem;">
          <h4 style="margin: 0;" class="card-head">${window.Icons ? window.Icons.svg('quote',{size:17}):''}내담자 후기</h4>
          <span style="flex: 1;"></span>
          <button onclick="window.Marketplace.openReviews('${counselor.id}')" style="all: unset; cursor: pointer; font-size: 0.76rem; font-weight: 800; color: var(--accent-primary);">전체 ${counselor.reviews}개 보기 ›</button>
        </div>
        <p style="margin: -0.4rem 0 0.7rem; font-size: 0.67rem; color: var(--text-muted); line-height: 1.5;">자세하고 최근인 후기 · 아쉬운 후기도 함께</p>
        <div style="display: flex; flex-direction: column; gap: 0.8rem;">
          ${this.pickHighlights(this.allReviews(counselor), 2).map(r => `
            <div style="background: var(--bg-tertiary); padding: 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                <span style="font-weight: bold; font-size: 0.85rem;">${this._esc(r.author)}</span>
                ${window.Icons ? window.Icons.stars(r.rating,14) : ''}
              </div>
              <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">"${this._esc(r.text)}"</p>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div style="position: sticky; bottom: -1rem; background: var(--bg-primary); padding: 1rem 0; border-top: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; margin: 0 -1rem -1rem -1rem;">
        <div style="padding-left: 1rem;">
          <span style="font-size: 0.85rem; color: var(--text-muted); display: block;">30분 상담료</span>
          <span style="font-weight: bold; font-size: 1.2rem; color: var(--text-primary);">${counselor.price.toLocaleString()}원</span>
        </div>
        <div style="padding-right: 1rem;">
          <button class="btn-primary" style="padding: 0.6rem 2rem; font-size: 1.1rem;" onclick="window.Marketplace.closeProfile(); window.Booking.openModal('${counselor.id}')">예약하기</button>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
  },
  
  closeProfile() {
    const modal = document.getElementById('counselor-profile-modal');
    if (modal) modal.classList.add('hidden');
  }
};

// 후기 신고 버튼 위임 — reviewKey 는 작성자 이름·본문 앞부분을 담으므로
//  onclick 문자열에 심으면 따옴표 하나로 벌어진다. data-* 로만 넘기고
//  실제 호출은 여기서 한다(값이 코드 위치에 닿지 않는다).
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-mk-act]');
  if (!el || !window.Marketplace) return;
  if (el.dataset.mkAct === 'report') {
    window.Marketplace.reportReview(el.dataset.mkCid || '', el.dataset.mkKey || '');
  }
});
