window.Marketplace = {
  counselors: [
    {
      id: "c1",
      name: "김유진 심리상담사",
      hospital: "연세 마음가득 정신건강의학과",
      rating: 4.9,
      reviews: 128,
      tags: ["우울증", "불안장애", "스트레스"],
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
      hospital: "서울 해맑은 의원",
      rating: 4.8,
      reviews: 94,
      tags: ["공황장애", "대인관계", "가족상담"],
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
      hospital: "마음의온도 심리상담센터",
      rating: 5.0,
      reviews: 215,
      tags: ["트라우마", "자존감", "번아웃"],
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
    }
  ],

  init() {
    this.renderCounselors();
  },

  renderCounselors() {
    const list = document.getElementById('counselors-list');
    if (!list) return;

    const sortType = document.getElementById('counselor-sort') ? document.getElementById('counselor-sort').value : 'rating';
    const filterAvailable = document.getElementById('counselor-available-now') ? document.getElementById('counselor-available-now').checked : false;

    let filtered = [...this.counselors];
    if (filterAvailable) {
      filtered = filtered.filter(c => c.isAvailableNow);
    }

    filtered.sort((a, b) => {
      if (sortType === 'rating') return b.rating - a.rating;
      if (sortType === 'reviews') return b.reviews - a.reviews;
      if (sortType === 'price_low') return a.price - b.price;
      return 0;
    });

    list.innerHTML = filtered.map(c => `
      <div class="glass-card counselor-card">
        <div class="cc-top">
          <div class="counselor-avatar">
            ${window.Icons ? window.Icons.art.avatar(c.avatar, 72) : ''}
          </div>
          <div class="cc-info">
            <div class="cc-name-row">
              <h3>${c.name}</h3>
              ${c.isAvailableNow ? '<span class="cc-badge">상담가능</span>' : ''}
            </div>
            <p class="meta-line cc-hospital">${window.Icons ? window.Icons.svg('hospital', { size: 14 }) : ''}<span>${c.hospital}</span></p>
            <div class="cc-rating">
              ${window.Icons ? window.Icons.svg('starFull', { size: 15, color: '#e8b04b' }) : ''}
              <strong>${c.rating}</strong>
              <span class="cc-reviews">(${c.reviews}개 후기)</span>
            </div>
            <div class="cc-tags">
              ${c.tags.map(t => `<span class="cc-tag">${t}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="cc-bottom">
          <div class="cc-price"><span>30분 상담</span><strong>${c.price.toLocaleString()}원</strong></div>
          <div class="cc-actions">
            <button class="btn-secondary cc-btn" onclick="window.Marketplace.openProfile('${c.id}')">프로필</button>
            <button class="btn-primary cc-btn" onclick="window.Booking.openModal('${c.id}')">예약하기</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  getCounselor(id) {
    return this.counselors.find(c => c.id === id);
  },

  openProfile(id) {
    const counselor = this.getCounselor(id);
    if (!counselor) return;
    
    const modal = document.getElementById('counselor-profile-modal');
    const content = document.getElementById('counselor-profile-content');
    if (!modal || !content) return;
    
    content.innerHTML = `
      <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
        <div class="counselor-avatar counselor-avatar--lg">
          ${window.Icons ? window.Icons.art.avatar(counselor.avatar, 96) : ''}
        </div>
        <div>
          <h2 style="margin: 0;">${counselor.name}</h2>
          <p class="meta-line" style="color: var(--text-muted); font-size: 0.9rem; margin: 0.3rem 0;">${window.Icons ? window.Icons.svg('hospital', { size: 15 }) : ''}${counselor.hospital}</p>
          <div style="display: flex; gap: 0.4rem; align-items: center; margin: 0.5rem 0;">
            ${window.Icons ? window.Icons.stars(counselor.rating, 17) : ''}
            <span style="font-weight: 700; font-size: 1.05rem;">${counselor.rating}</span>
            <span style="color: var(--text-muted); font-size: 0.9rem;">(${counselor.reviews}개 후기)</span>
          </div>
        </div>
      </div>
      
      <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.5rem 0; color: var(--accent-primary);" class="card-head">${window.Icons ? window.Icons.svg('pin',{size:16}):''}주요 이력</h4>
        <ul style="font-size: 0.85rem; padding-left: 1.2rem; margin: 0; line-height: 1.6;">
          ${counselor.career.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.8rem 0; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem;" class="card-head">${window.Icons ? window.Icons.svg('quote',{size:17}):''}내담자 리얼 리뷰</h4>
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
