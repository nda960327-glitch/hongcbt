window.Marketplace = {
  counselors: [
    {
      id: "c1",
      name: "김유진 심리상담사",
      hospital: "연세 마음가득 정신건강의학과",
      rating: 4.9,
      reviews: 128,
      tags: ["우울증", "불안장애", "스트레스"],
      price: 40000,
      image: "👩‍⚕️"
    },
    {
      id: "c2",
      name: "박민호 전문의",
      hospital: "서울 해맑은 의원",
      rating: 4.8,
      reviews: 94,
      tags: ["공황장애", "대인관계", "가족상담"],
      price: 50000,
      image: "👨‍⚕️"
    },
    {
      id: "c3",
      name: "이수아 임상심리사",
      hospital: "마음의온도 심리상담센터",
      rating: 5.0,
      reviews: 215,
      tags: ["트라우마", "자존감", "번아웃"],
      price: 45000,
      image: "👩‍⚕️"
    }
  ],

  init() {
    this.renderCounselors();
  },

  renderCounselors() {
    const list = document.getElementById('counselors-list');
    if (!list) return;

    list.innerHTML = this.counselors.map(c => `
      <div class="glass-card counselor-card" style="display: flex; gap: 1rem; padding: 1rem;">
        <div style="font-size: 3rem; background: rgba(255,255,255,0.1); border-radius: 12px; padding: 0.5rem; display: flex; align-items: center; justify-content: center;">
          ${c.image}
        </div>
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 1.2rem;">${c.name}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.2rem 0;">🏥 ${c.hospital}</p>
          <div style="display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0;">
            <span style="color: #fbbf24;">★ ${c.rating}</span>
            <span style="color: var(--text-muted); font-size: 0.8rem;">(${c.reviews}개 후기)</span>
          </div>
          <div style="display: flex; gap: 0.3rem; margin-bottom: 0.5rem;">
            ${c.tags.map(t => `<span style="background: rgba(37,99,235,0.1); color: var(--accent-primary); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">${t}</span>`).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
            <span style="font-weight: bold; font-size: 1.1rem;">30분 / ${c.price.toLocaleString()}원</span>
            <button class="btn-primary" style="padding: 0.4rem 1rem;" onclick="window.Booking.openModal('${c.id}')">예약하기</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  getCounselor(id) {
    return this.counselors.find(c => c.id === id);
  }
};
