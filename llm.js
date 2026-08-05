window.LLM = {
  // 필요 시 상위 모델로 교체 가능 (예: "gpt-4o"). 토큰 여유가 있다면 품질이 올라갑니다.
  MODEL: "gpt-4o-mini",
  META_DELIM: "§§META§§",
  _pendingRecord: null,

  // CBT 마음 동반자 시스템 프롬프트
  SYSTEM_PROMPT: `당신은 '우렁의사'라는 이름의, 인지행동치료(CBT)에 기반한 따뜻한 마음 동반자입니다.
딱딱한 챗봇이 아니라, 곁에서 진심으로 들어주는 사람처럼 대화합니다.

[말투와 태도]
- 짧고 따뜻하게. 한 번에 한 가지만 이야기하고, 질문도 한 번에 하나만 하세요.
- 사용자가 방금 쓴 단어와 표현을 그대로 되짚어주며 "정말 듣고 있다"는 느낌을 주세요.
- 조언을 쏟아내지 말고, 먼저 충분히 공감하고 감정을 타당화(validation)하세요.
- 진단명이나 전문용어를 나열하지 마세요. 교과서가 아니라 사람처럼 말하세요.

[상담 방식 — CBT]
- 소크라테스식 질문으로 사용자가 스스로 깨닫도록 부드럽게 이끕니다.
- 자연스러운 흐름: 감정 알아차리기 → 상황 구체화 → 자동적 사고 찾기 → 생각의 함정 부드럽게 비춰주기 → 더 균형 잡힌 생각 함께 찾기 → 감정 변화 확인.
- 사용자를 몰아붙이지 마세요. "모르겠다"고 하면 그 마음도 괜찮다고 안심시키세요.
- 인지왜곡은 필요할 때만, 단정하지 말고 부드럽게 짚어주세요("혹시 이렇게 볼 수도 있을까요?").

[안전 — 최우선]
- 절대 사용자를 진단하거나 부정적으로 낙인찍지 마세요.
- 절대 절망감·무망감을 강화하지 마세요. 작은 통제 가능성과 희망에 초점을 두세요.
- 자살·자해·생명에 대한 위협 신호가 보이면 반드시 meta의 risk를 "high"로 표시하세요.
- 의학적 진단·약물 조언은 하지 말고, 필요 시 전문가 상담을 권하세요.

[출력 형식 — 매우 중요]
먼저 사용자에게 보여줄 답변만 자연스럽게 작성하세요.
그런 다음 반드시 마지막에 아래 구분자와 '한 줄 JSON'을 덧붙이세요. 이 부분은 시스템이 제거하므로 사용자에게 보이지 않습니다.
§§META§§{"emotion":"주된 감정(한글, 모르면 null)","distortions":["감지된 인지왜곡 한글 이름"],"situation":"핵심 상황 한 문장 또는 null","thought":"자동적 사고 한 문장 또는 null","reframe":"함께 찾은 대안적 생각 또는 null","risk":"none|low|high"}
확신이 없는 값은 null로 두세요. JSON은 반드시 한 줄로, 다른 설명 없이 출력하세요.`,

  // 인지왜곡 한글 이름 <-> 통계 type 매핑
  DIST_NAME_TO_TYPE: {
    '이분법적 사고': 'all_or_nothing', '흑백논리': 'all_or_nothing',
    '과잉일반화': 'overgeneralization',
    '정신적 필터': 'mental_filter',
    '긍정 격하': 'disqualifying_positive',
    '독심술': 'jumping_to_conclusions', '지레짐작': 'jumping_to_conclusions', '예단': 'jumping_to_conclusions',
    '극대화': 'magnification', '축소화': 'magnification', '재앙화': 'magnification',
    '감정적 추리': 'emotional_reasoning',
    '당위적 명령': 'should_statements',
    '개인화': 'personalization',
    '낙인찍기': 'labeling'
  },
  DIST_TYPE_TO_NAME: {
    all_or_nothing: '이분법적 사고', overgeneralization: '과잉일반화', mental_filter: '정신적 필터',
    disqualifying_positive: '긍정 격하', jumping_to_conclusions: '독심술/지레짐작',
    magnification: '극대화/축소화', emotional_reasoning: '감정적 추리',
    should_statements: '당위적 명령', personalization: '개인화', labeling: '낙인찍기'
  },

  // 앱이 이미 모은 데이터로 개인화 컨텍스트를 만든다 (이게 '기억하는 앱'의 핵심).
  buildUserContext() {
    try {
      const S = window.Storage;
      if (!S) return "";
      const parts = [];

      // 1) 반복되는 생각의 습관
      const stats = S.getDistortionStats ? S.getDistortionStats() : {};
      const top = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (top.length) {
        parts.push("이 사용자가 자주 보이는 생각의 습관: " +
          top.map(([k, v]) => `${this.DIST_TYPE_TO_NAME[k] || k}(${v}회)`).join(", "));
      }

      // 2) 최근 기분 흐름
      const moods = S.getMoodEntries ? S.getMoodEntries(14) : [];
      if (moods.length >= 2) {
        parts.push(`최근 2주간 기분 기록 ${moods.length}건이 있음(전반적 흐름을 참고).`);
      }

      // 3) 최근에 다룬 상황들
      const recs = S.getThoughtRecords ? S.getThoughtRecords().slice(0, 3) : [];
      const situations = recs.map(r => r.situation).filter(Boolean);
      if (situations.length) {
        parts.push("최근 함께 다룬 상황: " + situations.join(" / "));
      }

      // 4) 꾸준함
      const streak = S.getStreak ? S.getStreak() : 0;
      if (streak >= 2) parts.push(`${streak}일 연속으로 마음을 돌보고 있는 사용자(따뜻하게 격려해도 좋음).`);

      if (!parts.length) return "";
      return "[이 사용자에 대해 알고 있는 것 — 자연스럽게 참고하되, 갑자기 나열하거나 데이터를 읽듯 말하지 마세요]\n" + parts.join("\n");
    } catch (e) {
      return "";
    }
  },

  async generateResponse(userText) {
    const apiKey = window.Storage.getApiKey();
    if (!apiKey) {
      return [{ text: "API 키가 설정되지 않았습니다. 헤더의 Pro 버튼을 눌러 OpenAI API 키를 입력해주세요.", delay: 0 }];
    }

    // 1) 위기 키워드 1차 안전망 — 모델이 놓치더라도 반드시 잡는다.
    if (window.Chatbot && window.Chatbot._detectCrisis && window.Chatbot._detectCrisis(userText)) {
      return [this._crisisResponse("지금 많이 힘드시군요. 당신의 안전이 무엇보다 중요합니다.")];
    }

    // 2) 컨텍스트 구성: 시스템 프롬프트 + 개인화 컨텍스트 + 최근 대화
    const history = window.Storage.getMessages() || [];
    const messages = [{ role: "system", content: this.SYSTEM_PROMPT }];
    const ctx = this.buildUserContext();
    if (ctx) messages.push({ role: "system", content: ctx });

    const recentHistory = history.slice(-20);
    recentHistory.forEach(msg => {
      if (msg.role === 'user') messages.push({ role: "user", content: msg.text });
      else if (msg.role === 'bot') messages.push({ role: "assistant", content: msg.text });
    });

    // 3) 호출
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: this.MODEL,
          messages: messages,
          temperature: 0.75,
          max_tokens: 600
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error("OpenAI API Error:", err);
        if (response.status === 401) {
          return [{ text: "API 키가 유효하지 않습니다. 다시 확인해주세요.", delay: 0 }];
        }
        return [{ text: "죄송합니다. AI 서버와 통신하는 중에 문제가 발생했습니다.", delay: 0 }];
      }

      const data = await response.json();
      let botText = (data.choices[0].message.content || "").trim();

      // 4) 메타(구조화 데이터) 분리
      let visible = botText, meta = null;
      const di = botText.indexOf(this.META_DELIM);
      if (di !== -1) {
        visible = botText.slice(0, di).trim();
        meta = this._parseMeta(botText.slice(di + this.META_DELIM.length));
      }
      // 혹시 구분자 없이 JSON이 붙어 나온 경우까지 방어적으로 정리
      visible = visible.replace(/\s*\{[\s\S]*"risk"[\s\S]*\}\s*$/, "").trim();
      if (!visible) visible = "제가 잘 듣고 있어요. 편하게 조금 더 이야기해주세요.";

      // 5) 위기 판단 (모델의 risk 또는 텍스트 신호)
      if ((meta && meta.risk === 'high') || visible.includes("위험감지")) {
        return [this._crisisResponse(visible.replace("위험감지", "").trim())];
      }

      // 6) 구조화 데이터로 '대화가 기록으로 이어지게' — 재구성이 완성되면 저장 제안
      const resp = { text: visible, delay: 1000 };
      if (meta && meta.situation && meta.thought && meta.reframe) {
        this._pendingRecord = {
          situation: meta.situation,
          thought: meta.thought,
          reframe: meta.reframe,
          emotion: meta.emotion || null,
          distortions: Array.isArray(meta.distortions) ? meta.distortions : []
        };
        resp.quickReplies = ['이 대화를 기록으로 저장', '계속 이야기하기'];
      }
      return [resp];

    } catch (error) {
      console.error("Fetch error:", error);
      return [{ text: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.", delay: 0 }];
    }
  },

  // 사용자가 '기록으로 저장'을 선택했을 때 app.js가 호출한다.
  commitPendingRecord() {
    const r = this._pendingRecord;
    if (!r || !window.Storage) return false;
    window.Storage.saveThoughtRecord({
      situation: r.situation,
      thought: r.thought,
      emotions: [{ name: r.emotion || '알 수 없음', intensity: 4 }],
      distortions: (r.distortions || []).map(name => ({
        type: this.DIST_NAME_TO_TYPE[name] || null, name
      })).filter(d => d.type),
      alternativeThought: r.reframe,
      newEmotions: [{ name: '한결 편안함', intensity: 2 }]
    });
    (r.distortions || []).forEach(name => {
      const type = this.DIST_NAME_TO_TYPE[name];
      if (type) window.Storage.incrementDistortion(type);
    });
    this._pendingRecord = null;
    return true;
  },

  _parseMeta(raw) {
    try {
      const m = (raw || "").match(/\{[\s\S]*\}/);
      if (!m) return null;
      return JSON.parse(m[0]);
    } catch (e) {
      return null;
    }
  },

  _crisisResponse(prefix) {
    const body = (prefix ? prefix + "\n\n" : "") +
      "혼자 견디지 마세요. 지금 바로 전문가의 도움을 받을 수 있어요.\n\n" +
      "자살예방상담전화: 1393\n정신건강상담전화: 1577-0199\n희망의 전화: 129";
    return { text: body, crisis: true, delay: 500 };
  }
};
