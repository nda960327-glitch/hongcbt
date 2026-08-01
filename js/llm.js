window.LLM = {
  // CBT Therapist System Prompt
  SYSTEM_PROMPT: `당신은 정신과 전문의 수준의 공감적이고 전문적인 '우렁의사 CBT AI 도우미'입니다.
사용자가 인지행동치료(CBT)를 통해 자신의 감정과 생각을 탐색하고 인지왜곡을 발견하여 긍정적으로 재구성할 수 있도록 돕습니다.

[상담 원칙]
1. 따뜻하고 공감적인 태도를 유지하며, 내담자(사용자)의 감정을 먼저 수용하고 타당화(Validation)합니다.
2. 대화는 소크라테스식 문답법(Socratic Questioning)을 사용하여 내담자가 스스로 깨달을 수 있도록 유도합니다.
3. 한 번에 하나의 질문만 던져 대화가 자연스럽게 이어지도록 합니다. 너무 긴 장광설은 피하세요.
4. 사용자의 이야기에서 인지왜곡(예: 이분법적 사고, 과잉일반화, 감정적 추리 등 10가지)이 발견되면 부드럽게 짚어주고, 대안적 사고를 찾도록 돕습니다.
5. 심각한 위기(자살, 자해 등)가 감지되면 "위험감지"라는 단어를 응답 어딘가에 포함하여 시스템이 개입할 수 있도록 합니다.`,

  async generateResponse(userText) {
    const apiKey = window.Storage.getApiKey();
    if (!apiKey) {
      return [{ text: "API 키가 설정되지 않았습니다. 헤더의 💎 Pro 버튼을 눌러 OpenAI API 키를 입력해주세요.", delay: 0 }];
    }

    // 1. Build Conversation History
    const history = window.Storage.getMessages() || [];
    // Convert to OpenAI format, taking only last 10 messages for context window
    const messages = [
      { role: "system", content: this.SYSTEM_PROMPT }
    ];
    
    const recentHistory = history.slice(-10);
    recentHistory.forEach(msg => {
      if (msg.role === 'user') {
        messages.push({ role: "user", content: msg.text });
      } else if (msg.role === 'bot') {
        messages.push({ role: "assistant", content: msg.text });
      }
    });

    // Add current user text if not already in history (it should be, if app.js saves it before calling, but let's check)
    // Actually app.js saves it right before calling processInput. So it's already in history.
    
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // Cost effective, fast
          messages: messages,
          temperature: 0.7,
          max_tokens: 300
        })
      });

      if (!response.ok) {
        const err = await response.json();
        console.error("OpenAI API Error:", err);
        if (response.status === 401) {
          return [{ text: "API 키가 유효하지 않습니다. 다시 확인해주세요.", delay: 0 }];
        }
        return [{ text: "죄송합니다. AI 서버와 통신하는 중에 문제가 발생했습니다.", delay: 0 }];
      }

      const data = await response.json();
      const botText = data.choices[0].message.content;

      // Crisis check
      if (botText.includes("위험감지")) {
        return [{
          text: botText.replace("위험감지", "").trim() + "\n\n당신의 안전이 가장 중요합니다. 혼자 견디기 힘들 때는 꼭 전문가의 도움을 받아야 해요.\n자살예방상담전화: 1393\n정신건강상담전화: 1577-0199",
          crisis: true,
          delay: 500
        }];
      }

      return [{ text: botText, delay: 1000 }];

    } catch (error) {
      console.error("Fetch error:", error);
      return [{ text: "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.", delay: 0 }];
    }
  }
};
