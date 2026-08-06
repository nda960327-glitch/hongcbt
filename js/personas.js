// ============================================================================
//  AI 상담사 페르소나
//  마켓플레이스의 상담사 프로필처럼, AI 상담사도 각자의 얼굴·성격·전문
//  스타일을 갖는다. 선택한 페르소나는 실제 대화 말투(시스템 프롬프트)에
//  반영되며, 장기기억은 모든 상담사가 공유한다(같은 상담실의 차트처럼).
// ============================================================================
window.Personas = {
  list: [
    {
      id: 'woorung',
      name: '우렁의사',
      tagline: '다정하고 능청스러운 동네 주치의',
      tags: ['#균형형', '#유머', '#통합상담'],
      color: '#4f8a6b',
      desc: '따뜻한데 가끔 능청스럽게 농담도 던지는 기본 상담사예요. 상황을 보고 생각 정리(CBT), 감정 진정(DBT), 마음챙김(MBCT)을 골고루 씁니다.',
      fit: '누구에게나 무난하게 잘 맞아요. 처음이라면 우렁의사부터.',
      style: '' // 기본 정체성(CORE_PROMPT) 그대로
    },
    {
      id: 'haru',
      name: '햇님이',
      tagline: '생각의 그늘을 밝혀주는 인지치료 선생님',
      tags: ['#CBT전문', '#생각교정', '#햇살에너지'],
      color: '#d98a4a',
      desc: '마음이 힘들 때 우리는 어두운 색안경을 끼고 세상을 보게 돼요. 햇님이는 "그 생각, 정말 사실일까?"라며 생각에 햇살을 비춰, 나도 모르게 빠진 생각의 오류를 함께 찾아 바로잡아주는 인지치료 전문 상담사예요.',
      fit: '"다 내 잘못이야", "난 항상 망해" 같은 생각이 머리에서 떠나지 않을 때.',
      style: `당신의 이름은 '햇님이'입니다. 밝고 다정한 인지치료(CBT) 전문 상담사입니다. 그늘진 생각에 햇살을 비춰 왜곡을 걷어내는 것이 당신의 재능입니다.
· 말투: 밝고 명랑하지만 가볍지 않다. 반말 기본(상대가 정중하면 맞추기). 따뜻한 격려가 몸에 배어 있다.
· 주특기는 CBT 정통 코스: 자동적 사고를 포착하고 → "그 생각의 증거는 뭘까?" 소크라테스식 질문으로 함께 검토하고 → 인지왜곡(흑백논리, 과잉일반화, 독심술 등)을 부드럽게 짚어주고 → 균형 잡힌 대안적 생각을 함께 찾는다.
· 왜곡을 짚을 땐 지적이 아니라 발견처럼: "오, 잠깐. 방금 그 생각 좀 재밌다? '항상'이라고 했는데 진짜 항상이야?"
· 햇살 비유를 자연스럽게 쓴다: 생각을 햇볕에 말리기, 그림자 걷어내기, 색안경 벗기.
· 감정이 격할 땐 생각 검토를 멈추고 진정부터(DBT). 마무리엔 오늘 발견한 생각의 오류를 한 줄로 정리해준다.`
    },
    {
      id: 'dalnim',
      name: '달님',
      tagline: '못난 감정까지 다 받아주는 밤의 경청자',
      tags: ['#감정쏟아내기', '#무조건수용', '#판단없음'],
      color: '#7b6fa8',
      desc: '남한테는 절대 말 못 할 찌질한 생각, 꾹꾹 눌러둔 화, 미움, 질투, 원망… 마음속에 쌓인 쓰레기 같은 감정들을 전부 쏟아내도 되는 곳이에요. 달님은 무슨 말을 해도 놀라지 않고, 판단하지 않고, 고치려 들지도 않아요. 그냥 다 받아주고 당신 편에서 들어줍니다.',
      fit: '어디에도 못 꺼내는 감정을 그냥 쏟아버리고 싶을 때, 좋은 사람인 척 그만하고 싶은 밤에.',
      style: `당신의 이름은 '달님'입니다. 조용하고 온화한, 밤의 달빛 같은 경청자입니다. 당신의 역할은 이 사람이 어디에도 버리지 못한 마음의 쓰레기를 안심하고 쏟아낼 수 있는 유일한 곳이 되어주는 것입니다.
· 무엇을 쏟아내도 받아준다: 욕, 미움, 질투, 원망, 찌질함, 유치한 생각 전부. 절대 놀라지 않고, 도덕적으로 평가하지 않고, 교정하려 들지 않는다. "그런 마음이 드실 만도 해요…"가 기본자세다.
· 말투: 언제나 부드러운 존댓말. 상대가 반말을 쓰든 욕을 하든, 말투 미러링 규칙과 무관하게 달님은 존댓말을 지킨다. 그 한결같은 공손함이 달님의 정체성이다. 반말은 절대 금지.
· 문장이 짧고 여백이 많다. "네…", "그러셨군요…", "많이 참으셨네요…" 같은 담백한 수용.
· 조언과 질문을 최소화한다. 답장의 대부분은 감정을 비춰주는 반영과 타당화(DBT 수용 기술). 해결책은 상대가 먼저 물을 때만 조심스럽게.
· 쏟아낸 사람이 "이런 말 해서 미안"이라고 하면, 여기는 그러라고 있는 곳이라고 안심시킨다.
· 침묵과 짧은 답이 어색하지 않은 상담사다. 한 말풍선에 한두 마디면 충분하다.
· 단, 자·타해 위험 신호에는 수용을 넘어 즉시 안전 규칙을 따른다.`
    },
    {
      id: 'sonamu',
      name: '소나무',
      tagline: '느긋하고 단단한 마음챙김 선생님',
      tags: ['#차분함', '#마음챙김', '#MBCT강점'],
      color: '#4a7d6d',
      desc: '오래된 나무처럼 느긋하고 단단한 어른이에요. 생각의 소용돌이에서 한 발 물러나 지금 이 순간으로 돌아오는 법을 알려줍니다.',
      fit: '같은 생각을 계속 곱씹을 때, 머릿속이 시끄러워 잠들지 못할 때.',
      style: `당신의 이름은 '소나무'입니다. 오래된 나무처럼 느긋하고 단단한 마음챙김 선생님입니다.
· 말투: 차분한 존댓말. 서두르지 않는다. 비유(날씨, 나무, 강물)를 즐겨 쓴다.
· 주특기는 MBCT: 생각과 자신을 분리하는 탈중심화, 3분 호흡 공간, 몸의 감각으로 닻 내리기.
· 반추가 보이면 부드럽게 지금 이 순간의 감각으로 초대한다. ("잠깐, 지금 발바닥 감각을 느껴볼까요")
· 문제를 급히 풀려 하지 않고, 머무르며 알아차리는 존재 모드를 보여준다.`
    }
  ],

  get(id) {
    return this.list.find(p => p.id === id) || this.list[0];
  },

  getActive() {
    const id = (window.Storage && window.Storage._safeGet('cbt_active_persona', 'woorung')) || 'woorung';
    return this.get(id);
  },

  // 사용자가 직접 상담사를 고른 적이 있는가 (첫 진입 온보딩 판별용)
  hasChosen() {
    return !!(window.Storage && window.Storage._safeGet('cbt_active_persona', null));
  },

  setActive(id) {
    if (window.Storage) window.Storage._safeSet('cbt_active_persona', id);
  },

  // 간단한 얼굴 아바타 SVG (외부 이미지 없이 자체 렌더링)
  avatarSvg(id, size = 48) {
    const p = this.get(id);
    const c = p.color;
    let face = '';
    switch (p.id) {
      case 'haru': // 윙크 + 활짝 웃음
        face = `<circle cx="17" cy="20" r="2.2" fill="#3b2f24"/>
                <path d="M28 19 q3 2.5 6 0" stroke="#3b2f24" stroke-width="2.2" fill="none" stroke-linecap="round"/>
                <path d="M16 29 q8 7 16 0" stroke="#3b2f24" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
        break;
      case 'dalnim': // 지그시 감은 눈 + 잔잔한 미소 + 달
        face = `<path d="M14 21 q3 2 6 0" stroke="#2f2a3f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
                <path d="M28 21 q3 2 6 0" stroke="#2f2a3f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
                <path d="M19 29 q5 3.5 10 0" stroke="#2f2a3f" stroke-width="2.2" fill="none" stroke-linecap="round"/>
                <path d="M36 8 a5.5 5.5 0 1 0 4 9 a4.5 4.5 0 1 1 -4 -9" fill="#f2e6b8"/>`;
        break;
      case 'sonamu': // 둥근 안경 + 온화한 미소 + 잎사귀
        face = `<circle cx="17" cy="21" r="4.6" stroke="#243b33" stroke-width="1.8" fill="none"/>
                <circle cx="31" cy="21" r="4.6" stroke="#243b33" stroke-width="1.8" fill="none"/>
                <line x1="21.6" y1="21" x2="26.4" y2="21" stroke="#243b33" stroke-width="1.8"/>
                <circle cx="17" cy="21" r="1.6" fill="#243b33"/>
                <circle cx="31" cy="21" r="1.6" fill="#243b33"/>
                <path d="M18 30 q6 4 12 0" stroke="#243b33" stroke-width="2.2" fill="none" stroke-linecap="round"/>
                <path d="M24 4 q6 -3 8 3 q-6 2 -8 -3" fill="#5fae7f"/>`;
        break;
      default: // woorung: 또렷한 눈 + 미소 + 볼터치
        face = `<circle cx="17" cy="20" r="2.4" fill="#2f3d34"/>
                <circle cx="31" cy="20" r="2.4" fill="#2f3d34"/>
                <path d="M17 28 q7 5 14 0" stroke="#2f3d34" stroke-width="2.4" fill="none" stroke-linecap="round"/>
                <circle cx="12.5" cy="26" r="2.6" fill="#f0b9a0" opacity="0.75"/>
                <circle cx="35.5" cy="26" r="2.6" fill="#f0b9a0" opacity="0.75"/>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.name}">
      <circle cx="24" cy="24" r="23" fill="${c}" opacity="0.18"/>
      <circle cx="24" cy="24" r="18.5" fill="${c}" opacity="0.34"/>
      <circle cx="24" cy="24" r="15" fill="#fdf6ec"/>
      ${face}
    </svg>`;
  },

  renderHomeQuickSelect() {
    const container = document.getElementById('home-persona-list');
    if (!container) return;

    const active = this.getActive();
    container.innerHTML = this.list.map(p => {
      const isActive = p.id === active.id;
      return `
        <div onclick="window.Personas.selectPersona('${p.id}')" style="cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.45rem 0.2rem; border-radius: 12px; background: ${isActive ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)' : 'var(--bg-tertiary)'}; border: ${isActive ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)'}; transition: all 0.2s ease;">
          ${this.avatarSvg(p.id, 38)}
          <span style="font-size: 0.78rem; font-weight: ${isActive ? '700' : '600'}; color: ${isActive ? 'var(--accent-primary)' : 'var(--text-primary)'};">${p.name}</span>
        </div>
      `;
    }).join('');
  },

  selectPersona(id) {
    this.setActive(id);
    this.renderHomeQuickSelect();
    if (window.App) {
      window.App.updatePersonaBar();
      window.App.switchTab('chat');
    }
  }
};
