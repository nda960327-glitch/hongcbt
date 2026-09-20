// ============================================================================
//  대면상담 및 진료 — 내 주변 정신건강의학과를 가까운 순으로.
//  홈 맨 아래 카드(가로 스크롤) + '전체 보기' 세로 목록 + 상세 시트(전화·길찾기).
//  위치는 검색에만 쓰고 서버에 남기지 않는다. 위치 권한이 없으면 지역·역 이름으로 찾는다.
//  운영자가 등록한 제휴 병원은 배지가 붙고, 담당 병원과 이어진 곳은 '앱 연동'으로 표시된다.
// ============================================================================
window.Clinics = {
  GEO_KEY: 'cbt_geo',
  GEO_TTL: 30 * 60 * 1000,
  HOME_MAX: 6,
  PAGE: 20,
  RADII: [3000, 10000, 30000],
  _items: [],
  _center: null,
  _live: true,
  _state: 'idle',        // idle · locating · loading · ready · denied · error · notfound
  _all: null,
  _esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  init() {
    this.render();
    const g = this._geo();
    if (g) { this.load({ lat: g.lat, lng: g.lng }); return; }
    // 이미 허용한 기기면 묻지 않고 바로 찾는다 — 매번 버튼을 누르게 하면 아무도 안 쓴다
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') this.locate(true); }).catch(() => {});
      }
    } catch (e) {}
  },

  _geo() {
    const g = window.Storage._safeGet(this.GEO_KEY, null);
    return g && g.ts && Date.now() - g.ts < this.GEO_TTL ? g : null;
  },

  locate(silent) {
    if (!navigator.geolocation) { this._state = 'denied'; this.render(); return; }
    this._state = 'locating'; this.render();
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        window.Storage._safeSet(this.GEO_KEY, c);
        this.load({ lat: c.lat, lng: c.lng });
      },
      () => { this._state = silent ? 'idle' : 'denied'; this.render(); },
      { timeout: 10000, maximumAge: 5 * 60 * 1000, enableHighAccuracy: false }
    );
  },

  radius() { return Number(window.Storage._safeGet('cbt_clinic_radius', 10000)) || 10000; },

  async load(center, q) {
    this._state = 'loading'; this.render();
    const p = new URLSearchParams();
    if (center) { p.set('lat', center.lat.toFixed(5)); p.set('lng', center.lng.toFixed(5)); }
    if (q) p.set('q', q);
    p.set('radius', String(this.radius()));
    let d = null;
    try { d = await window.Api.json('/api/clinics/near?' + p.toString()); } catch (e) {}
    if (!d || !Array.isArray(d.items)) {
      this._state = d && d.error === 'not-found' ? 'notfound' : 'error';
      this.render(); this.renderAll(); return;
    }
    this._items = d.items; this._center = d.center; this._live = !!d.live;
    this._state = (!d.items.length && !d.registered) ? 'empty' : 'ready';
    this.render(); this.renderAll();
  },

  get(id) { return this._items.find(x => x.id === id) || null; },
  _km(m) { return m == null ? '' : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`; },
  _badge(it) {
    if (it.hospitalId) return '<span class="clinic-badge clinic-badge--link">앱 연동</span>';
    if (it.partner) return '<span class="clinic-badge clinic-badge--partner">제휴</span>';
    return `<span class="clinic-badge">${this._esc(it.kind || '의원')}</span>`;
  },
  _toLink(it) { return `https://map.naver.com/p/directions/-/${it.lng},${it.lat},${encodeURIComponent(it.name)}/-/transit`; },
  // 진료시간: hours = {1:[s,c] … 7:일, 8:공휴일}. 지금 열었는지 — true/false, 자료가 없으면 null
  DAYS: ['', '월', '화', '수', '목', '금', '토', '일', '공휴일'],
  _hm(v) { return v ? `${v.slice(0, 2)}:${v.slice(2)}` : ''; },
  _openNow(it, now) {
    const h = it && it.hours;
    if (!h) return null;
    const d = now || new Date();
    const day = d.getDay() === 0 ? 7 : d.getDay();
    const cur = d.getHours() * 100 + d.getMinutes();
    const t = h[day];
    if (!t) return false;
    const s = Number(t[0]); let c = Number(t[1]);
    if (c <= s) c += 2400;
    return cur >= s && cur < c;
  },
  _openLabel(it) {
    const o = this._openNow(it);
    if (o === null) return '';
    const d = new Date(); const day = d.getDay() === 0 ? 7 : d.getDay();
    const t = it.hours[day];
    if (o) return `<span class="clinic-open clinic-open--on">진료 중 · ${this._hm(t[1])}까지</span>`;
    const cur = d.getHours() * 100 + d.getMinutes();
    if (t && cur < Number(t[0])) return `<span class="clinic-open">오늘 ${this._hm(t[0])} 시작</span>`;
    return '<span class="clinic-open">진료 종료</span>';
  },
  _hoursTable(it) {
    const h = it && it.hours;
    if (!h) return '<p class="feed-ov__author">진료시간 정보가 없어요. 방문 전에 전화로 확인해주세요.</p>';
    const d = new Date(); const today = d.getDay() === 0 ? 7 : d.getDay();
    return `<div class="clinic-hours">${[1, 2, 3, 4, 5, 6, 7, 8].map(i => `<div class="clinic-hours__row${i === today ? ' is-today' : ''}"><span>${this.DAYS[i]}</span><b>${h[i] ? this._hm(h[i][0]) + ' ~ ' + this._hm(h[i][1]) : '휴진'}</b></div>`).join('')}</div>`;
  },
  _mapLink(it) { return `https://map.naver.com/p/search/${encodeURIComponent(it.name + ' ' + (it.roadAddr || it.addr || ''))}`; },

  // ── 홈 카드 ──
  render() {
    const el = document.getElementById('home-clinics');
    if (!el) return;
    const esc = this._esc;
    const st = this._state;
    const prompt = (title, sub, denied) => `
      <div class="glass-card clinic-prompt">
        <div class="clinic-prompt__ico" data-ic="hospital" data-ic-size="22"></div>
        <div class="clinic-prompt__txt"><b>${title}</b><span>${sub}</span></div>
        <div class="clinic-prompt__btns">
          ${denied ? '' : `<button class="btn-primary" data-clinics-locate>내 주변 찾기</button>`}
          <button class="btn-secondary" data-clinics-search>지역으로 찾기</button>
        </div>
      </div>`;
    if (st === 'idle') el.innerHTML = prompt('내 주변 정신건강의학과 찾기', '가까운 순으로 보여드려요. 위치는 검색에만 쓰고 저장하지 않아요.');
    else if (st === 'locating') el.innerHTML = prompt('내 위치를 확인하고 있어요…', '잠깐만요. 오래 걸리면 지역 이름으로 찾아도 돼요.');
    else if (st === 'loading') el.innerHTML = `<div class="glass-card clinic-prompt"><div class="clinic-prompt__txt"><b>가까운 병원을 찾는 중…</b><span>느루가 지도를 펼치고 있어요. 느적느적.</span></div></div>`;
    else if (st === 'denied') el.innerHTML = prompt('위치를 쓸 수 없어요', '설정에서 위치 권한을 켜거나, 동네·역 이름으로 찾아보세요.', true);
    else if (st === 'notfound') el.innerHTML = prompt('그 이름의 장소를 못 찾았어요', '"수원 영통", "강남구 역삼동" 처럼 동네 이름으로 넣어보세요. 역 이름은 아직 안 돼요.');
    else if (st === 'error') el.innerHTML = prompt('지금은 불러오지 못했어요', '잠시 후 다시 시도해주세요.');
    else if (st === 'empty') el.innerHTML = prompt('아직 이 지역 병원이 등록되지 않았어요', '운영팀이 전국 병원 자료를 채우면 바로 보여요. 조금만 기다려주세요.');
    else {
      const items = this._items.slice(0, this.HOME_MAX);
      if (!items.length) { el.innerHTML = prompt('반경 안에 정신건강의학과가 없어요', '전체 보기에서 반경을 30km 로 넓혀보세요.'); }
      else el.innerHTML = `
        <p class="clinic-where">${this._center && this._center.label ? `<b>${esc(this._center.label)}</b> 근처` : '내 위치 근처'} · ${this._items.length}곳 <button class="clinic-where__btn" data-clinics-search>다른 곳</button></p>
        <div class="home-ads">
          ${items.map(it => `
          <button class="glass-card home-ad clinic-card" data-clinic-open="${esc(it.id)}">
            <div class="clinic-card__top">${this._badge(it)}<span class="clinic-card__dist">${this._km(it.dist)}</span></div>
            <h4 class="clinic-card__name">${esc(it.name)}</h4>
            <p class="clinic-card__addr">${esc(it.roadAddr || it.addr)}</p>
            ${this._openLabel(it)}
            ${it.note ? `<p class="clinic-card__note">${esc(it.note)}</p>` : ''}
            <div class="clinic-card__acts">
              ${it.tel ? `<a class="clinic-act" href="tel:${esc(it.tel.replace(/[^\d+]/g, ''))}" data-clinic-tel>전화</a>` : ''}
              <a class="clinic-act" href="${this._toLink(it)}" target="_blank" rel="noopener" data-clinic-tel>길찾기</a>
            </div>
          </button>`).join('')}
          <button class="glass-card home-ad clinic-card clinic-card--more" data-clinics-all><b>전체 보기</b><span>${this._items.length}곳 · 반경 ${this._km(this.radius())}</span><span class="clinic-card__arrow">›</span></button>
        </div>`;
    }
    if (window.App && window.App.hydrateInlineIcons) window.App.hydrateInlineIcons(el);
  },

  // ── 지역으로 찾기 ──
  openSearch() {
    const old = document.getElementById('clinic-search-ov');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'clinic-search-ov';
    ov.dataset.ovGuard = '1';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1210; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end;';
    ov.innerHTML = `<div class="feed-ov">
      <div class="feed-ov__bar"><span class="feed-tag">지역으로 찾기</span><button class="feed-ov__x" data-clinics-close>닫기</button></div>
      <h3>어디 근처를 볼까요?</h3>
      <p class="feed-ov__author">동네 이름을 넣어주세요. 예: 수원 영통, 강남구 역삼동, 부산 해운대</p>
      <input id="clinic-q" type="search" autocomplete="off" placeholder="예: 마포구 서교동" style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.85rem; border-radius: 12px; border: 1px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 1rem; margin-bottom: 0.7rem;">
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn-secondary" style="flex: 1;" data-clinics-locate data-clinics-close>내 위치로</button>
        <button class="btn-primary" style="flex: 2;" data-clinics-go>찾기</button>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    const inp = ov.querySelector('#clinic-q');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.goSearch(); });
    setTimeout(() => inp.focus(), 80);
    if (window.Sfx) window.Sfx.play('pop');
  },
  goSearch() {
    const inp = document.getElementById('clinic-q');
    const q = ((inp && inp.value) || '').trim();
    if (!q) return;
    const ov = document.getElementById('clinic-search-ov');
    if (ov) ov.remove();
    this.load(null, q);
  },

  // ── 전체 보기 ──
  openAll() {
    if (document.getElementById('clinic-all-ov')) { this.renderAll(); return; }
    this._all = { filter: '', shown: this.PAGE };
    const ov = document.createElement('div');
    ov.id = 'clinic-all-ov';
    ov.className = 'feed-all';
    ov.dataset.ovGuard = '1';
    ov.innerHTML = `
      <div class="feed-all__head">
        <button class="feed-all__back" data-clinics-all-close aria-label="닫기">‹</button>
        <h2>내 주변 정신건강의학과</h2>
        <select class="feed-all__sort" data-clinics-radius aria-label="반경">
          ${this.RADII.map(r => `<option value="${r}" ${r === this.radius() ? 'selected' : ''}>${this._km(r)} 안</option>`).join('')}
        </select>
      </div>
      <div class="feed-all__chips" data-clinics-chips></div>
      <div class="feed-all__list" data-clinics-list></div>`;
    document.body.appendChild(ov);
    this.renderAll();
    if (window.Sfx) window.Sfx.play('nav');
  },
  renderAll() {
    const ov = document.getElementById('clinic-all-ov');
    if (!ov) return;
    const esc = this._esc;
    const st = this._all;
    const chips = ov.querySelector('[data-clinics-chips]');
    const list = ov.querySelector('[data-clinics-list]');
    const all = this._items;
    const F = [['', `전체 ${all.length}`], ['open', `지금 진료 중 ${all.filter(x => this._openNow(x) === true).length}`], ['partner', `제휴 ${all.filter(x => x.partner).length}`], ['link', `앱 연동 ${all.filter(x => x.hospitalId).length}`],
      ['의원', `의원 ${all.filter(x => x.kind === '의원').length}`], ['병원', `병원 ${all.filter(x => /병원/.test(x.kind)).length}`]];
    chips.innerHTML = `<button class="feed-chip" data-clinics-search>📍 ${this._center && this._center.label ? esc(this._center.label) : '내 위치'} · 바꾸기</button>`
      + F.filter(([k, l]) => !k || !/ 0$/.test(l)).map(([k, l]) => `<button class="feed-chip${st.filter === k ? ' on' : ''}" data-clinics-filter="${k}">${esc(l)}</button>`).join('');
    const items = all.filter(x => !st.filter || (st.filter === 'open' ? this._openNow(x) === true : st.filter === 'partner' ? x.partner : st.filter === 'link' ? !!x.hospitalId : st.filter === '병원' ? /병원/.test(x.kind) : x.kind === st.filter));
    if (this._state === 'loading') { list.innerHTML = '<p class="feed-all__empty">찾는 중…</p>'; return; }
    if (this._state !== 'ready') { list.innerHTML = `<p class="feed-all__empty">먼저 위치를 정해주세요.</p><button class="feed-all__more" data-clinics-locate>내 주변 찾기</button><button class="feed-all__more" data-clinics-search>지역으로 찾기</button>`; return; }
    if (!items.length) { list.innerHTML = '<p class="feed-all__empty">이 조건에 맞는 곳이 없어요. 반경을 넓혀보세요.</p>'; return; }
    list.innerHTML = items.slice(0, st.shown).map(it => `
      <button class="feed-row clinic-row" data-clinic-open="${esc(it.id)}">
        <div class="clinic-row__dist"><b>${this._km(it.dist)}</b></div>
        <div class="feed-row__body">
          <div class="clinic-card__top">${this._badge(it)}${it.tags.length ? it.tags.slice(0, 3).map(t => `<span class="clinic-badge clinic-badge--tag">${esc(t)}</span>`).join('') : ''}</div>
          <span class="clinic-card__name">${esc(it.name)}</span>
          <span class="clinic-card__addr">${esc(it.roadAddr || it.addr)}</span>
          ${this._openLabel(it)}
          ${it.note ? `<span class="clinic-card__note">${esc(it.note)}</span>` : ''}
        </div>
      </button>`).join('')
      + (items.length > st.shown ? `<button class="feed-all__more" data-clinics-more>더 보기 (${items.length - st.shown}곳 남음)</button>` : '')
      + `<p class="feed-all__empty" style="padding: 1rem 0 0;">국립중앙의료원 자료 · 지도는 네이버 · 진료 시간·예약은 병원에 직접 확인해주세요.<br>응급 상황이면 119, 마음이 급하면 1577-0199</p>`;
  },
  closeAll() { const ov = document.getElementById('clinic-all-ov'); if (ov) ov.remove(); },

  // ── 상세 ──
  open(id) {
    const it = this.get(id);
    if (!it) return;
    const esc = this._esc;
    const old = document.getElementById('clinic-ov');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'clinic-ov';
    ov.dataset.ovGuard = '1';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 1220; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end;';
    const tel = (it.tel || '').replace(/[^\d+]/g, '');
    ov.innerHTML = `<div class="feed-ov">
      <div class="feed-ov__bar">${this._badge(it)}<span class="feed-ov__author" style="margin: 0 auto 0 0.4rem;">${this._km(it.dist)} 거리</span><button class="feed-ov__x" data-clinics-close>닫기</button></div>
      <h3>${esc(it.name)}</h3>
      <p class="feed-ov__author">${esc(it.roadAddr || it.addr)}${it.roadAddr && it.addr && it.addr !== it.roadAddr ? `<br><span style="opacity: 0.7;">지번 ${esc(it.addr)}</span>` : ''}</p>
      ${this._openLabel(it)}
      ${it.note ? `<div class="feed-ov__note"><span>${esc(it.note)}</span></div>` : ''}
      ${this._hoursTable(it)}
      ${it.hospitalId ? `<div class="feed-ov__note"><span><b>마인드 인사이드 연동 기관</b>이에요. 상담소 코드를 받으면 담당 선생님이 상담 기록을 함께 볼 수 있어요.</span></div>` : ''}
      <div class="clinic-ov__acts">
        ${tel ? `<a class="btn-primary" href="tel:${esc(tel)}">전화 ${esc(it.tel)}</a>` : '<button class="btn-primary" disabled>전화번호 없음</button>'}
        <a class="btn-secondary" href="${this._toLink(it)}" target="_blank" rel="noopener">길찾기</a>
        <a class="btn-secondary" href="${this._mapLink(it)}" target="_blank" rel="noopener">네이버 지도에서 보기</a>
        ${it.url && !/naver\.com/.test(it.url) ? `<a class="btn-secondary" href="${esc(it.url)}" target="_blank" rel="noopener">병원 홈페이지</a>` : ''}
        ${it.hospitalId && window.Hospital && !window.Hospital.link() ? `<button class="btn-secondary" data-clinics-link>상담소 코드로 담당의 연결</button>` : ''}
      </div>
      <p class="feed-ov__author" style="margin-top: 0.8rem;">진료 시간·예약 가능 여부는 병원에 직접 확인해주세요. 첫 방문이면 신분증을 챙기세요.</p>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  promptContext() {
    if (this._state !== 'ready' || !this._items.length) return '[대면 진료] 홈 맨 아래 "대면상담 및 진료"에서 내 주변 정신건강의학과를 가까운 순으로 찾을 수 있습니다(전화·길찾기).';
    const top = this._items.slice(0, 3).map(it => `${it.name}(${this._km(it.dist)}${it.partner ? ', 제휴' : ''})`).join(', ');
    return `[대면 진료] 사용자 주변 정신건강의학과: ${top}. 홈 맨 아래에서 전화·길찾기가 됩니다. 병원 방문을 권할 때 이 정보를 자연스럽게 쓸 수 있습니다.`;
  }
};

document.addEventListener('click', function (e) {
  const C = window.Clinics;
  if (!C) return;
  const t = e.target;
  if (t.closest('[data-clinic-tel]')) { e.stopPropagation(); return; }   // 카드 안의 전화·길찾기 링크는 그대로 보낸다
  const open = t.closest('[data-clinic-open]');
  if (open) { C.open(open.dataset.clinicOpen); return; }
  if (t.closest('[data-clinics-locate]')) { const ov = document.getElementById('clinic-search-ov'); if (ov) ov.remove(); C.locate(false); return; }
  if (t.closest('[data-clinics-search]')) { C.openSearch(); return; }
  if (t.closest('[data-clinics-go]')) { C.goSearch(); return; }
  if (t.closest('[data-clinics-all-close]')) { C.closeAll(); return; }
  if (t.closest('[data-clinics-all]')) { C.openAll(); return; }
  if (t.closest('[data-clinics-more]')) { C._all.shown += C.PAGE; C.renderAll(); return; }
  const f = t.closest('[data-clinics-filter]');
  if (f) { C._all.filter = f.dataset.clinicsFilter; C._all.shown = C.PAGE; C.renderAll(); return; }
  if (t.closest('[data-clinics-link]')) { ['clinic-ov', 'clinic-all-ov'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); }); if (window.Hospital) window.Hospital.openLink(); return; }
  if (t.closest('[data-clinics-close]')) { ['clinic-ov', 'clinic-search-ov'].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); }); }
});
document.addEventListener('change', function (e) {
  const C = window.Clinics;
  if (!C || !e.target || !e.target.hasAttribute('data-clinics-radius')) return;
  window.Storage._safeSet('cbt_clinic_radius', Number(e.target.value) || 10000);
  const c = C._center;
  if (c) C.load({ lat: c.lat, lng: c.lng }, c.label || '');
});
