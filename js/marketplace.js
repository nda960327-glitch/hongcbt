window.Marketplace = {
  userLat: 37.5665,   // 기본 위치 (서울 시청 중심)
  userLng: 126.9780,
  hasGps: false,

  counselors: [
    {
      id: "c1",
      name: "김유진 심리상담사",
      hospital: "연세 마음가득 정신건강의학과 (신촌점)",
      tel: "02-312-4711",
      safeTel: "0507-1401-8821",
      callRate: 700,
      lat: 37.5563,
      lng: 126.9380,
      rating: 4.9,
      reviews: 128,
      tags: ["우울증", "불안장애", "스트레스"],
      price: 40000,
      avatar: 0,
      isAvailableNow: true,
      career: [
        "현) 연세 마음가득 정신건강의학과 수석 상담사",
        "전) 서울시 청년마음건강지원센터 전임 상담사",
        "한국심리학회 공인 임상심리전문가 1급",
        "연세대학교 심리학 석사"
      ],
      reviewsList: [
        { author: "익명", text: "정말 제 이야기를 잘 들어주시고, 제가 놓치고 있던 인지적 오류를 정확히 짚어주셨어요. 너무 감사합니다.", rating: 5 },
        { author: "마음단단", text: "앱에서 정리한 요약 리포트를 미리 보시고 상담에 들어가니 시간이 절약되고 핵심만 다룰 수 있어 좋았습니다.", rating: 5 },
        { author: "내일도맑음", text: "친절하시고 솔루션 지향적이십니다. 강력 추천해요.", rating: 4 }
      ]
    },
    {
      id: "c2",
      name: "박민호 전문의",
      hospital: "서울 해맑은 의원 (강남점)",
      tel: "02-555-0182",
      safeTel: "0507-1402-3377",
      callRate: 750,
      lat: 37.5012,
      lng: 127.0396,
      rating: 4.8,
      reviews: 94,
      tags: ["공황장애", "대인관계", "가족상담"],
      price: 50000,
      avatar: 1,
      isAvailableNow: false,
      career: [
        "현) 서울 해맑은 의원 대표원장",
        "전) 삼성서울병원 정신건강의학과 전문의",
        "대한신경정신의학회 정회원"
      ],
      reviewsList: [
        { author: "익명", text: "전문의 선생님이라 그런지 의학적 지식을 바탕으로 설명해주셔서 약물 치료와 병행하기 너무 좋습니다.", rating: 5 },
        { author: "파도타기", text: "공황장애로 너무 힘들었는데, 인지행동치료 접근법을 명쾌하게 알려주셨어요.", rating: 5 }
      ]
    },
    {
      id: "c3",
      name: "이수아 임상심리사",
      hospital: "마음의온도 심리상담센터 (홍대점)",
      tel: "02-334-7720",
      safeTel: "0507-1403-5590",
      callRate: 650,
      lat: 37.5559,
      lng: 126.9234,
      rating: 5.0,
      reviews: 215,
      tags: ["트라우마", "자존감", "번아웃"],
      price: 45000,
      avatar: 2,
      isAvailableNow: true,
      career: [
        "현) 마음의온도 심리상담센터 소장",
        "인지행동치료학회 인지행동치료 전문가",
        "EAP 기업상담 전담 10년"
      ],
      reviewsList: [
        { author: "직장인A", text: "번아웃이 심했는데 어떻게 이겨내야 하는지 구체적인 숙제를 내주셔서 실질적인 도움이 되었습니다.", rating: 5 },
        { author: "익명", text: "항상 따뜻하게 공감해주시면서도 나아갈 방향을 잘 잡아주십니다.", rating: 5 }
      ]
    },
    {
      id: "c4",
      name: "정현우 전문의",
      hospital: "삼성 온마음 정신건강의학과 (잠실점)",
      tel: "02-419-3355",
      safeTel: "0507-1404-2216",
      callRate: 800,
      lat: 37.5113,
      lng: 127.0980,
      rating: 4.9,
      reviews: 156,
      tags: ["공황장애", "우울증", "약물상담"],
      price: 55000,
      avatar: 0,
      isAvailableNow: true,
      career: [
        "현) 삼성 온마음 정신건강의학과 원장",
        "전) 서울아산병원 임상강사",
        "수면장애 및 불안장애 전문"
      ],
      reviewsList: [
        { author: "잠실주민", text: "집 근처라 방문하기도 편하고 상담도 매우 깊이 있게 진행해주셨습니다.", rating: 5 }
      ]
    },
    {
      id: "c5",
      name: "최윤서 심리학박사",
      hospital: "광화문 마음케어 센터 (종로점)",
      tel: "02-733-0904",
      safeTel: "0507-1405-9043",
      callRate: 900,
      lat: 37.5724,
      lng: 126.9769,
      rating: 4.95,
      reviews: 182,
      tags: ["직장인상담", "번아웃", "자존감"],
      price: 42000,
      avatar: 2,
      isAvailableNow: true,
      career: [
        "현) 광화문 마음케어 센터 책임상담사",
        "서울대학교 심리학 박사",
        "직장인 수면 및 스트레스 대처 프로그램 개발"
      ],
      reviewsList: [
        { author: "광화문직장인", text: "회사 근처 점심시간 상담 이용했는데 너무 만족스럽습니다.", rating: 5 }
      ]
    }
  ],

  init() {
    this.renderCounselors();
    // 위치 동기화 자동 시도 (GPS)
    this.requestUserLocation(true);
  },

  // 하버스인(Haversine) 공식을 이용한 두 위경도 좌표 간 직선 거리(km) 계산
  calcDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 999;
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
        if (statusText) statusText.textContent = "📍 내 위치 연결됨";
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

  // === 정렬·필터 상태 (칩 UI) ===
  _sort: 'distance',
  _availOnly: false,
  SORTS: [['distance', '📍 가까운 순'], ['rating', '⭐ 별점 높은'], ['reviews', '💬 후기 많은'], ['price_low', '💸 가격 낮은']],

  setSort(v) {
    this._sort = v;
    this.renderCounselors();
  },

  toggleAvail() {
    this._availOnly = !this._availOnly;
    this.renderCounselors();
  },

  renderFilterBar() {
    const pills = document.getElementById('cc-sort-pills');
    if (pills) {
      pills.innerHTML = this.SORTS.map(([v, label]) =>
        `<button class="cc-chip ${this._sort === v ? 'on' : ''}" onclick="window.Marketplace.setSort('${v}')">${label}</button>`).join('');
    }
    const avail = document.getElementById('cc-avail-pill');
    if (avail) avail.classList.toggle('on', this._availOnly);
  },

  renderCounselors() {
    const list = document.getElementById('counselors-list');
    if (!list) return;

    // 내 캐시 잔액 칩 — 결제 직전에야 잔액 부족을 아는 일이 없게
    const chip = document.getElementById('wallet-chip');
    if (chip && window.Wallet) chip.textContent = `💰 내 캐시 ${window.Wallet.balance().toLocaleString()} · 충전 ›`;

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

    filtered.sort((a, b) => {
      if (sortType === 'distance') return a.distance - b.distance;
      if (sortType === 'rating') return b.rating - a.rating;
      if (sortType === 'reviews') return b.reviews - a.reviews;
      if (sortType === 'price_low') return a.price - b.price;
      return 0;
    });

    list.innerHTML = filtered.map(c => {
      const st = this.liveState(c);
      return `
      <div class="glass-card cc2" onclick="window.Marketplace.openProfile('${c.id}')">
        <div class="cc2-top">
          <div class="cc2-ava">
            ${c.photo ? `<img src="${c.photo}" alt="${c.name}">` : (window.Icons ? window.Icons.art.avatar(c.avatar, 56) : '')}
            <span class="cc2-dot ${st}"></span>
          </div>
          <div class="cc2-info">
            <div class="cc2-name">${c.name}${c.isNew ? ' <span class="cc2-new">NEW</span>' : ''}</div>
            <div class="cc2-hosp">${c.hospital}</div>
            <div class="cc2-meta">
              <span>⭐ <b>${c.rating}</b> (${c.reviews})</span>
              <span>📍 ${c.distance}km</span>
              <span class="cc2-st ${st}">${st === 'avail' ? '● 상담 가능' : st === 'busy' ? '● 통화 중' : '● 부재중'}</span>
            </div>
            <div class="cc2-tags">${(c.tags || []).slice(0, 3).map(t => `<span class="cc2-tag">${t}</span>`).join('')}</div>
          </div>
        </div>
        <div class="cc2-duo" onclick="event.stopPropagation()">
          <button class="cc2-book" onclick="window.Booking.openModal('${c.id}')">
            <b>📅 예약 상담</b><span>30분 ${c.price.toLocaleString()}원</span>
          </button>
          ${st === 'avail'
            ? `<button class="cc2-live" onclick="window.App.startHumanCall('${c.id}')"><b>⚡ 바로상담</b><span>${this.callRateFor(c).toLocaleString()}캐시/30초</span></button>`
            : st === 'busy'
              ? `<div class="cc2-live is-busy"><b>🔴 통화 중</b><span>끝나면 열려요</span></div>`
              : `<div class="cc2-live is-off"><b>⚡ 바로상담</b><span>지금은 부재중</span></div>`}
        </div>
        <div class="cc2-links" onclick="event.stopPropagation()">
          <button onclick="window.Marketplace.openProfile('${c.id}')">프로필·후기 보기</button>
          <i></i>
          <button onclick="window.App.openHumanChat('${c.id}')">💬 채팅 문의</button>
        </div>
      </div>`;
    }).join('');
  },

  // === 바로상담 실시간 상태 (서버 presence) ===
  _presence: {},
  _presenceTs: 0,

  fetchPresence(force) {
    if (!force && Date.now() - this._presenceTs < 10000) return; // 10초 캐시
    this._presenceTs = Date.now();
    fetch('/api/presence').then(r => r.ok ? r.json() : null).then(d => {
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

  // 기본 상담사 + 입점 상담사 합본, 내가 남긴 리뷰를 별점·후기 목록에 실반영
  all() {
    const customs = (window.Storage && window.Storage._safeGet('cbt_custom_counselors', [])) || [];
    const base = customs.concat(this.counselors);
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
    const counselor = this.getCounselor(id);
    if (!counselor) return;
    
    const dist = this.calcDistance(this.userLat, this.userLng, counselor.lat, counselor.lng);
    const modal = document.getElementById('counselor-profile-modal');
    const content = document.getElementById('counselor-profile-content');
    if (!modal || !content) return;
    
    content.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <div class="counselor-avatar counselor-avatar--lg">
          ${counselor.photo ? `<img src="${counselor.photo}" alt="${counselor.name}" style="width: 96px; height: 96px; border-radius: 50%; object-fit: cover; border: 2px solid var(--glass-border);">` : (window.Icons ? window.Icons.art.avatar(counselor.avatar, 96) : '')}
        </div>
        <div>
          <h2 style="margin: 0;">${counselor.name}</h2>
          <p class="meta-line" style="color: var(--text-muted); font-size: 0.9rem; margin: 0.3rem 0;">${window.Icons ? window.Icons.svg('hospital', { size: 15 }) : ''}${counselor.hospital}</p>
          <div style="display: flex; gap: 0.4rem; align-items: center; margin: 0.4rem 0;">
            <span style="background: color-mix(in srgb, var(--accent-primary) 15%, transparent); color: var(--accent-primary); font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 20px;">📍 내 위치에서 ${dist} km</span>
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
          ${counselor.career.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.8rem 0; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem;" class="card-head">${window.Icons ? window.Icons.svg('quote',{size:17}):''}내담자 리얼 후기</h4>
        <div style="display: flex; flex-direction: column; gap: 0.8rem;">
          ${counselor.reviewsList.map(r => `
            <div style="background: var(--bg-tertiary); padding: 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border);">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                <span style="font-weight: bold; font-size: 0.85rem;">${r.author}</span>
                ${window.Icons ? window.Icons.stars(r.rating,14) : ''}
              </div>
              <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;">"${r.text}"</p>
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
