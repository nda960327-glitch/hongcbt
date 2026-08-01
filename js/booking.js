window.Booking = {
  currentCounselorId: null,

  init() {
    const cancelBtn = document.getElementById('booking-cancel');
    const confirmBtn = document.getElementById('booking-confirm');
    
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmBooking());
  },

  openModal(counselorId) {
    this.currentCounselorId = counselorId;
    const counselor = window.Marketplace.getCounselor(counselorId);
    if (!counselor) return;

    const modal = document.getElementById('booking-modal');
    const details = document.getElementById('booking-details');
    
    // Profit sharing logic (10% platform, 45% hospital, 45% counselor)
    const platformFee = counselor.price * 0.10;
    const hospitalShare = counselor.price * 0.45;
    const counselorShare = counselor.price * 0.45;

    details.innerHTML = `
      <h3 style="margin-top:0;">${counselor.name}</h3>
      <p style="color:var(--text-muted); font-size:0.9rem;">${counselor.hospital}</p>
      <hr style="border-color: var(--glass-border); margin: 1rem 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>상담료 (30분)</span>
        <strong>${counselor.price.toLocaleString()}원</strong>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 0.8rem; border-radius: 4px; margin-top: 1rem;">
        <strong>💸 [플랫폼 투명 정산 시스템]</strong><br><br>
        결제하신 금액은 다음과 같이 안전하게 배분됩니다:<br>
        - 우렁의사 플랫폼 운영비 (10%): ${platformFee.toLocaleString()}원<br>
        - 소속 병원 인프라 지원 (45%): ${hospitalShare.toLocaleString()}원<br>
        - 담당 상담사 직접 수익 (45%): ${counselorShare.toLocaleString()}원
      </div>
    `;

    if (modal) modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('booking-modal');
    const datetimeInput = document.getElementById('booking-datetime');
    if (modal) modal.classList.add('hidden');
    if (datetimeInput) datetimeInput.value = '';
    this.currentCounselorId = null;
  },

  confirmBooking() {
    if (!this.currentCounselorId) return;
    const counselor = window.Marketplace.getCounselor(this.currentCounselorId);
    
    const datetimeInput = document.getElementById('booking-datetime');
    const selectedTime = datetimeInput ? datetimeInput.value : '';
    
    if (!selectedTime) {
      alert("예약하실 일시를 선택해주세요.");
      return;
    }
    
    // Format date string for display
    const dateObj = new Date(selectedTime);
    const formattedDate = `${dateObj.getFullYear()}년 ${dateObj.getMonth()+1}월 ${dateObj.getDate()}일 ${dateObj.getHours()}시 ${dateObj.getMinutes()}분`;
    
    alert(`결제가 완료되었습니다!\n\n${counselor.name}님과의 상담이 [${formattedDate}]에 예약되었습니다.\n\n마이페이지에서 확인하세요.`);
    
    // 💡 Add mock logic to update MyPage with this new booking if necessary
    
    this.closeModal();
    
    // Move to MyPage
    document.querySelector('[data-tab="mypage"]').click();
  }
};
