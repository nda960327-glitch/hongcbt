window.Chatbot = {
  state: 'GREETING',
  userData: {}, // Collected data during conversation
  
  init() {
    // Initialize chatbot. Check for existing session state.
    if (window.Storage) {
      const savedState = window.Storage.getSessionState();
      if (savedState) {
        this.state = savedState.state;
        this.userData = savedState.userData || {};
      }
    }
    
    if (this.state === 'GREETING' || !this.state) {
      this.state = 'GREETING';
      this.userData = {};
      return this._generateResponses();
    }
    return [];
  },
  
  _saveSession() {
    if (window.Storage) {
      window.Storage.saveSessionState({
        state: this.state,
        userData: this.userData
      });
    }
  },
  
  processInput(userText) {
    if (!userText || userText.trim() === '') return [];
    
    // Always check for crisis first
    if (this._detectCrisis(userText)) {
      this.state = 'CRISIS';
      this._saveSession();
      return [{
        text: "지금 많이 힘드시군요. 당신의 안전이 가장 중요합니다. 혼자 견디기 힘들 때는 꼭 전문가의 도움을 받아야 해요.\n\n자살예방상담전화: 1393\n정신건강상담전화: 1577-0199\n희망의 전화: 129",
        crisis: true,
        delay: 500
      }];
    }
    
    // Gentle pacing: during the reflective stages, if the user is unsure
    // ("모르겠어요", "그냥"...), reassure them instead of pushing forward.
    // Only once per stage, so we never loop or nag.
    const reflectiveStates = ['THOUGHT_EXPLORE', 'SOCRATIC', 'REFRAME'];
    if (reflectiveStates.includes(this.state) &&
        this._isUncertain(userText) &&
        this.userData._reassuredState !== this.state) {
      this.userData._reassuredState = this.state;
      this._saveSession();
      const reassure = [
        { text: "괜찮아요, 바로 떠오르지 않는 게 당연해요. 정답을 찾으려 애쓰지 않으셔도 됩니다.", delay: 800 },
        { text: "천천히, 지금 마음에 스치는 아주 작은 생각이라도 편하게 들려주세요. 어떤 이야기든 괜찮아요.", delay: 1500 }
      ];
      if (window.Storage) {
        reassure.forEach(r => window.Storage.saveMessage({ role: 'bot', text: r.text }));
      }
      return reassure;
    }

    let responses = [];

    // State Machine Processing
    switch (this.state) {
      case 'GREETING':
        this.userData.initialMoodText = userText;
        const moodObj = this._detectEmotion(userText);
        this.userData.initialMood = moodObj.emotion;
        this.userData.moodIntensity = moodObj.intensity;
        
        this.state = 'MOOD_EXPLORE';
        responses = this._generateResponses();
        break;
        
      case 'MOOD_EXPLORE':
        this.userData.moodContext = userText;
        // If the first message was emotionally ambiguous, try again on this clarification.
        if (!this.userData.initialMood) {
          const reDetect = this._detectEmotion(userText);
          if (reDetect.emotion) {
            this.userData.initialMood = reDetect.emotion;
            this.userData.moodIntensity = reDetect.intensity;
          }
        }
        this.state = 'SITUATION_ASK';
        responses = this._generateResponses();
        break;
        
      case 'SITUATION_ASK':
        this.userData.situation = userText;
        this.state = 'THOUGHT_EXPLORE';
        responses = this._generateResponses();
        break;
        
      case 'THOUGHT_EXPLORE':
        this.userData.automaticThought = userText;
        this.userData.distortions = this._identifyDistortions(userText);
        
        if (this.userData.distortions.length > 0) {
          this.state = 'DISTORTION_ID';
        } else {
          // If no specific distortion found, general Socratic questioning
          this.state = 'SOCRATIC';
        }
        responses = this._generateResponses();
        break;
        
      case 'DISTORTION_ID':
        this.state = 'SOCRATIC';
        responses = this._generateResponses();
        break;
        
      case 'SOCRATIC':
        this.userData.socraticResponse = userText;
        this.state = 'REFRAME';
        responses = this._generateResponses();
        break;
        
      case 'REFRAME':
        this.userData.alternativeThought = userText;
        this.state = 'NEW_FEELING';
        responses = this._generateResponses();
        break;
        
      case 'NEW_FEELING':
        this.userData.finalFeeling = userText;
        this.state = 'WRAP_UP';
        responses = this._generateResponses();
        break;
        
      case 'WRAP_UP':
        if (userText.includes('저장')) {
          this._saveThoughtRecord();
          responses = [{text: "기록이 성공적으로 저장되었습니다! 나중에 언제든 다시 볼 수 있어요.", delay: 800}];
        } else if (userText.includes('다른 이야기')) {
          this.reset();
          responses = [{text: "좋아요, 다른 이야기를 시작해볼까요?", delay: 800}].concat(this._generateResponses());
        } else {
          responses = [{text: "수고하셨습니다. 오늘 하루도 평안하게 마무리하시길 바랄게요.언제든 또 찾아와주세요.", delay: 800}];
          this.state = 'GREETING'; // Reset for next time implicitly
        }
        break;
        
      case 'FREE_TALK':
        responses = [{
          text: "제가 잘 듣고 있어요. 편하게 계속 이야기해주세요.",
          delay: 1000
        }];
        break;
        
      default:
        this.state = 'GREETING';
        responses = this._generateResponses();
    }
    
    this._saveSession();
    
    // Save generated bot messages
    if (window.Storage && responses.length > 0) {
      responses.forEach(resp => {
        window.Storage.saveMessage({
          role: 'bot',
          text: resp.text,
          quickReplies: resp.quickReplies
        });
      });
    }
    
    return responses;
  },
  
  _saveThoughtRecord() {
    if (window.Storage) {
      window.Storage.saveThoughtRecord({
        situation: this.userData.situation,
        thought: this.userData.automaticThought,
        emotions: [{name: this.userData.initialMood || '알 수 없음', intensity: 4}],
        distortions: this.userData.distortions || [],
        alternativeThought: this.userData.alternativeThought,
        newEmotions: [{name: '편안함', intensity: 2}] // Simplified
      });
      
      // Update stats
      if (this.userData.distortions) {
        this.userData.distortions.forEach(d => {
          window.Storage.incrementDistortion(d.type);
        });
      }
    }
  },
  
  reset() {
    this.state = 'GREETING';
    this.userData = {};
    this._saveSession();
  },
  
  getState() {
    return {
      state: this.state,
      userData: this.userData
    };
  },
  
  _generateResponses() {
    const responses = [];
    
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    
    switch (this.state) {
      case 'GREETING':
        responses.push({
          text: getRandom([
            "안녕하세요! 저는 우렁의사의 마음챙김 CBT AI 도우미예요. 당신의 마음 이야기를 듣고 싶어요.",
            "반가워요! 우렁의사의 마음챙김 CBT에 오신 것을 환영해요. 오늘 하루 마음은 안녕하신가요?",
            "어서오세요. 우렁의사와 함께 편안하게 이야기 나눌 준비가 되셨나요?",
            "만나서 반가워요. 오늘 하루 어떤 고민이 있었는지 우렁의사에게 들려주세요.",
            "환영합니다! 우렁의사 CBT 공간에서는 어떤 고민이든 편안하게 나눌 수 있어요."
          ]),
          delay: 800
        });
        responses.push({
          text: getRandom([
            "오늘 하루는 어떠셨어요? 지금의 기분을 간단히 알려주실래요?",
            "지금 어떤 감정을 느끼고 계신지 궁금해요.",
            "현재 당신의 마음 상태를 점검해볼까요?",
            "마음이 어떤지 이모티콘으로 표현해주셔도 좋아요.",
            "지금 가장 크게 느껴지는 감정은 무엇인가요?"
          ]),
          quickReplies: ['좋아요', '그저 그래요', '별로예요', '힘들어요', '화나요'],
          delay: 1500
        });
        break;
        
      case 'MOOD_EXPLORE':
        const mood = this.userData.initialMood;
        const label = this._emotionLabel(mood);
        const strong = this.userData.moodIntensity === 'high';
        if (mood === '기쁨' || mood === '편안함') {
          responses.push({
            text: getRandom([
              "좋은 기분이시군요! 다행이에요.",
              "긍정적인 감정을 느끼고 계신다니 저도 기쁩니다.",
              "마음이 편안하시다니 정말 기쁜 소식이네요.",
              "따뜻한 마음 상태를 나눠주셔서 감사해요."
            ]),
            delay: 1000
          });
          responses.push({
            text: getRandom([
              "어떤 일 덕분에 그런 기분을 느끼셨는지 조금 더 이야기해주시겠어요?",
              "오늘 어떤 즐거운 일이 있었나요?",
              "그런 좋은 기분을 느끼게 해준 순간을 공유해주실 수 있을까요?"
            ]),
            delay: 1500
          });
        } else if (!mood) {
          // Emotion is unclear — reflect neutrally and ask. Never assume a negative label.
          responses.push({
            text: getRandom([
              "이야기를 들려주셔서 고마워요. 지금 마음이 어떤지 제가 좀 더 잘 이해하고 싶어요.",
              "말씀해주셔서 감사해요. 지금 이 순간의 마음을 조금만 더 들여다봐도 될까요?",
              "솔직하게 이야기해주셔서 고마워요. 어떤 마음이신지 함께 살펴보고 싶어요."
            ]),
            delay: 1200
          });
          responses.push({
            text: getRandom([
              "지금 느끼시는 감정을 한 단어로 표현한다면, 어떤 말에 가장 가까울까요?",
              "혹시 지금 마음에 가장 크게 자리한 감정이 있다면 무엇일까요?"
            ]),
            delay: 1500,
            quickReplies: ['불안해요', '우울해요', '화가나요', '외로워요', '그냥 지쳐요', '잘 모르겠어요']
          });
        } else {
          responses.push({
            text: getRandom([
              `그렇군요, ${strong ? '많이 ' : ''}${label} 마음이 드시는군요. 이야기 나눠주셔서 고마워요.`,
              `지금 ${label} 마음이 ${strong ? '크게 ' : ''}느껴지시는군요. 그 마음을 알아차리는 것만으로도 큰 의미가 있어요.`,
              `${label} 감정이 드는 건 아주 자연스러운 일이랍니다. 혼자 견디지 않으셔도 돼요.`,
              `그런 감정을 느끼고 계셨군요. 스스로의 감정을 솔직하게 마주하는 모습이 멋집니다.`
            ]),
            delay: 1200
          });
          responses.push({
            text: getRandom([
              "그 감정에 대해 조금 더 자세히 들어보고 싶어요. 편하게 말씀해주시겠어요?",
              "어떤 점이 마음을 가장 무겁게 하는지 이야기해주실 수 있나요?",
              "조금 더 구체적으로 당신의 마음을 들려주시겠어요?"
            ]),
            delay: 1500
          });
        }
        break;
        
      case 'SITUATION_ASK':
        responses.push({
          text: getRandom([
            "말씀해주셔서 감사합니다. 충분히 그렇게 느끼실 수 있어요.",
            "그렇군요. 당신의 마음이 어떤지 조금 더 이해가 가요.",
            "공유해주셔서 고마워요. 그런 감정이 드는 건 자연스러운 일이에요.",
            "이야기해주셔서 정말 감사해요. 듣고 나니 저도 마음이 쓰이네요."
          ]),
          delay: 1200
        });
        responses.push({
          text: getRandom([
            "혹시 구체적으로 어떤 상황에서 그런 감정이 가장 크게 들었나요?",
            "그런 기분을 느끼게 한 특정한 상황이나 사건이 있었을까요?",
            "언제, 어디서, 누구와 있었던 일인지 상황을 조금 더 떠올려보시겠어요?",
            "그 감정이 촉발된 순간을 자세히 묘사해주실 수 있나요?"
          ]),
          delay: 2000
        });
        break;
        
      case 'THOUGHT_EXPLORE':
        // Reflect what the user actually talked about, so it feels heard —
        // not like a script. Falls back to a warm generic line.
        const topicReflection = this._reflectTopic(this.userData.situation);
        responses.push({
          text: topicReflection || getRandom([
            "그런 상황이 있었군요. 쉽지 않은 순간이었을 것 같아요.",
            "이야기해주셔서 고맙습니다. 마음고생이 많으셨겠어요.",
            "듣고 보니 정말 마음이 쓰이는 일이었네요."
          ]),
          delay: 1200
        });
        responses.push({
          text: getRandom([
            "그 상황이 벌어졌을 때, 머릿속에 가장 먼저 떠오른 '생각'은 무엇이었나요?",
            "그 순간, 스스로에게 어떤 말을 하고 계셨나요?",
            "그때 머리를 스치고 지나간 자동적인 생각이나 이미지가 있었다면 무엇일까요?",
            "사건 직후에 마음속에서 속삭이던 목소리는 뭐라고 했나요?"
          ]),
          delay: 2000
        });
        break;
        
      case 'DISTORTION_ID':
        const dists = this.userData.distortions || [];
        const mainDist = dists.length > 0 ? dists[0] : null;
        
        responses.push({
          text: getRandom([
            "말씀해주신 생각을 주의 깊게 들어보았어요.",
            "당신의 솔직한 생각들을 잘 들었습니다.",
            "그렇게 생각하실 수밖에 없었던 상황이 이해가 됩니다."
          ]),
          delay: 1000
        });
        
        if (mainDist) {
          responses.push({
            text: getRandom([
              "말씀을 듣다 보니, 지금 마음이 그 상황을 실제보다 조금 더 아프게 비추고 있는 것 같기도 해요.",
              "혹시 이 생각이 스스로를 실제보다 더 몰아세우고 있는 건 아닐까, 조심스럽게 느껴졌어요.",
              "그 마음, 충분히 이해돼요. 그런데 한 가지, 같이 살짝 들여다보고 싶은 게 있어요."
            ]),
            delay: 1800
          });
          responses.push({
            text: mainDist.description,
            delay: 2500
          });
          responses.push({
            text: getRandom([
              "우리 마음은 힘들 때 나도 모르게 상황을 더 어둡게 보는 색안경을 쓰곤 해요. 당신이 이상해서가 아니라, 누구나 그래요.",
              "이런 생각의 습관은 약해서가 아니라 마음을 지키려다 생기는 거예요. 그래서 더 다정하게 봐줘도 괜찮아요."
            ]),
            delay: 2500,
            quickReplies: ['네, 같이 볼게요', '잘 모르겠어요']
          });
        } else {
          this.state = 'SOCRATIC'; // Fallback
          return this._generateResponses();
        }
        break;
        
      case 'SOCRATIC':
        const distForSoc = (this.userData.distortions && this.userData.distortions.length > 0) ? this.userData.distortions[0].type : 'general';
        const q = this._generateSocraticQuestion(distForSoc, this.userData.automaticThought);
        
        responses.push({
          text: getRandom([
            "생각의 습관을 살펴보는 건 아주 용기 있는 일이에요.",
            "자신의 생각을 마주하는 과정이 쉽지 않겠지만, 정말 훌륭하게 해내고 계세요.",
            "이 과정을 통해 우리는 조금 더 단단해질 수 있어요."
          ]),
          delay: 1200
        });
        responses.push({
          text: q,
          delay: 2000
        });
        break;
        
      case 'REFRAME':
        responses.push({
          text: getRandom([
            "깊게 생각해보시고 답변해주셔서 감사합니다.",
            "새로운 관점을 시도해보는 모습이 정말 멋지네요.",
            "스스로 질문을 던지고 답을 찾아가는 모습이 감동적입니다."
          ]),
          delay: 1200
        });
        responses.push({
          text: getRandom([
            "그렇다면, 이 상황을 조금 더 균형 잡히고 현실적인 시각으로 다시 써본다면 어떨까요?",
            "만약 당신이 정말 아끼는 친구가 똑같은 상황에서 똑같은 생각을 하고 있다면, 친구에게 어떤 따뜻한 말을 해주고 싶으신가요?",
            "처음의 생각 대신, 지금은 스스로에게 어떤 더 도움이 되는 말을 해줄 수 있을까요?",
            "다른 관점으로 이 상황을 바라본다면, 어떤 새로운 의미를 발견할 수 있을까요?"
          ]),
          delay: 2500
        });
        break;
        
      case 'NEW_FEELING':
        responses.push({
          text: getRandom([
            "아주 좋은 대안적 생각이네요! 그렇게 생각하니 저도 마음이 한결 편안해지는 것 같아요.",
            "정말 훌륭한 통찰이에요. 스스로 찾아낸 건강한 생각이네요.",
            "그렇게 바라볼 수 있다니, 대단합니다. 긍정적인 힘이 느껴져요."
          ]),
          delay: 1500
        });
        responses.push({
          text: getRandom([
            "처음에는 많이 힘드셨는데, 이렇게 새로운 관점으로 상황을 바라보니 지금 마음 상태는 어떠신가요?",
            "지금 이 순간, 다시 당신의 감정을 돌아본다면 어떤 기분이 드나요?",
            "생각을 바꾸어보니 감정에도 어떤 변화가 생겼는지 궁금해요."
          ]),
          delay: 2000
        });
        break;
        
      case 'WRAP_UP':
        const distName = (this.userData.distortions && this.userData.distortions.length > 0) ? this.userData.distortions[0].name : '부정적 생각';
        
        responses.push({
          text: getRandom([
            `오늘 정말 뜻깊은 대화였어요. '${distName}'이라는 생각의 습관을 알아차리고, 스스로 더 건강한 관점을 찾아내셨네요!`,
            `자신의 생각을 객관적으로 바라보는 연습을 아주 훌륭하게 해내셨어요. 정말 자랑스럽습니다!`,
            `오늘의 대화가 당신의 마음에 작은 위안과 성장의 밑거름이 되었기를 바라요. 수고하셨어요!`
          ]),
          delay: 2000
        });
        responses.push({
          text: "이 과정을 기록으로 남겨두면 나중에 비슷한 상황이 왔을 때 큰 도움이 될 거예요. 오늘 나눈 대화를 생각 기록지에 저장하시겠어요?",
          delay: 2500,
          quickReplies: ['사고 기록 저장', '다른 이야기하기', '마무리하기']
        });
        break;
    }
    
    return responses;
  },
  
  _detectCrisis(text) {
    const t = text.replace(/\s+/g, '');
    const crisisKeywords = [
      '죽고싶', '자살', '죽을', '죽어버리', '죽는게', '자해', '목숨', '목매',
      '살기싫', '살고싶지않', '살아갈이유', '죽여', '끝내고싶', '끝내버리',
      '뛰어내리', '세상떠나', '사라지고싶', '없어지고싶', '유서'
    ];
    return crisisKeywords.some(keyword => t.includes(keyword));
  },
  
  _detectEmotion(text) {
    // Keyword-based emotion mapping with negation & intensity awareness.
    const t = text.replace(/\s+/g, '');

    const maps = [
      { e: '불안/긴장', keys: ['불안', '걱정', '긴장', '두렵', '무섭', '떨려', '초조', '조마조마'] },
      { e: '우울/슬픔', keys: ['우울', '슬프', '슬퍼', '눈물', '서러', '허무', '공허', '가라앉', '울적', '별로', '힘들'] },
      { e: '분노', keys: ['화나', '짜증', '열받', '분노', '억울', '분통', '성질', '빡쳐'] },
      { e: '외로움', keys: ['외로', '혼자', '고독', '쓸쓸'] },
      { e: '수치심', keys: ['부끄럽', '창피', '민망', '수치', '모욕'] },
      { e: '좌절감', keys: ['좌절', '실패', '지쳐', '답답', '절망', '무기력', '지친'] },
      { e: '기쁨', keys: ['기뻐', '기쁘', '좋아', '행복', '즐거', '신나', '최고', '설레'] },
      { e: '편안함', keys: ['편안', '안심', '평화', '괜찮', '그저그래', '보통', '무난'] }
    ];

    // A keyword is "negated" when a negation marker sits right around it,
    // so "불안하지 않아", "걱정 없어", "안 힘들어" are NOT read as that emotion.
    const isNegated = (idx, key) => {
      const after = t.slice(idx + key.length, idx + key.length + 5);
      if (/(않|없)/.test(after)) return true;
      const before = t.slice(Math.max(0, idx - 1), idx);
      if (before === '안') return true;
      return false;
    };

    // Rough intensity from adverbs.
    let intensity = 'medium';
    if (/(너무|정말|진짜|매우|극도|엄청|미칠|참을수없)/.test(t)) intensity = 'high';
    else if (/(조금|약간|살짝|다소)/.test(t)) intensity = 'low';

    for (const m of maps) {
      for (const k of m.keys) {
        const idx = t.indexOf(k);
        if (idx !== -1 && !isNegated(idx, k)) {
          return { emotion: m.e, intensity };
        }
      }
    }

    // No clear emotion found — DO NOT assume the user is depressed.
    // Return an unknown result so the bot gently asks instead of labeling.
    return { emotion: null, intensity: 'unknown' };
  },
  
  _isUncertain(text) {
    const t = text.replace(/\s+/g, '');
    if (t.length <= 6 && /^(그냥|글쎄|음+|흠+|모름)$/.test(t)) return true;
    return /(모르겠|잘모름|생각안나|생각이안|떠오르지않|안떠올|없는것같|글쎄요|어렵네|어려워요|말못)/.test(t);
  },

  _reflectTopic(text) {
    // Detect the life domain the user is talking about, so the bot can
    // reflect the actual content instead of a generic "그렇군요".
    const t = (text || '').replace(/\s+/g, '');
    const topics = [
      { keys: ['회사', '직장', '상사', '팀장', '동료', '업무', '출근', '야근', '퇴사', '면접', '취업', '일하', '일이'], say: '직장과 일에서 오는 무게가 느껴져요.' },
      { keys: ['시험', '성적', '공부', '과제', '학교', '교수', '학점', '수능', '졸업', '입시'], say: '학업에 대한 부담이 참 크셨겠어요.' },
      { keys: ['엄마', '아빠', '부모', '가족', '형', '누나', '언니', '동생', '아들', '딸', '시댁'], say: '가족과의 일은 늘 마음을 더 복잡하게 하죠.' },
      { keys: ['남친', '여친', '애인', '연인', '남편', '아내', '헤어', '이별', '썸', '짝사랑'], say: '관계에서 오는 마음의 흔들림이 느껴져요.' },
      { keys: ['친구', '사람들', '인간관계', '모임', '왕따', '따돌'], say: '사람 사이의 일이 마음을 많이 쓰이게 했겠어요.' },
      { keys: ['돈', '빚', '월세', '생활비', '경제', '실직', '백수'], say: '현실적인 걱정까지 겹치면 정말 버겁죠.' },
      { keys: ['아프', '병원', '건강', '불면', '잠이', '피곤', '지쳐'], say: '몸도 마음도 많이 지치셨겠어요.' },
      { keys: ['미래', '진로', '앞날', '불확실', '뭘해야'], say: '앞날이 잘 안 보일 때의 막막함이 느껴져요.' }
    ];
    for (const tp of topics) {
      if (tp.keys.some(k => t.includes(k))) return tp.say;
    }
    return null;
  },

  _emotionLabel(emotion) {
    // Turn the internal emotion code into a natural Korean adjective phrase.
    const labels = {
      '불안/긴장': '불안하고 긴장된',
      '우울/슬픔': '우울하고 슬픈',
      '분노': '화가 나는',
      '외로움': '외로운',
      '수치심': '부끄럽고 위축되는',
      '좌절감': '좌절스럽고 지친',
      '기쁨': '기쁜',
      '편안함': '편안한'
    };
    return labels[emotion] || '복잡한';
  },

  _identifyDistortions(thought) {
    const distortions = [];
    const t = thought.replace(/\s+/g, '');
    
    // 1. 이분법적 사고 (All-or-Nothing)
    if (/(항상|절대|완벽|다|전혀|하나도|전부)/.test(t)) {
      distortions.push({
        type: 'all_or_nothing',
        name: '이분법적 사고 (흑백논리)',
        description: "상황을 '완벽 아니면 실패'처럼 두 가지로만 나누어 보는 습관이에요. 중간 지점이나 회색 지대를 보지 못하게 만들죠."
      });
    }
    
    // 2. 과잉일반화 (Overgeneralization)
    if (/(매번|늘|언제나|다시또)/.test(t)) {
      distortions.push({
        type: 'overgeneralization',
        name: '과잉일반화',
        description: "한두 번의 부정적인 사건을 마치 '항상 일어나는 패턴'처럼 결론 내리는 경향이에요."
      });
    }
    
    // 3. 정신적 필터 (Mental Filter)
    if (/(다망했|하나도안|전부안|나쁜것만)/.test(t)) {
      distortions.push({
        type: 'mental_filter',
        name: '정신적 필터',
        description: "마치 색안경을 낀 것처럼, 긍정적인 면은 모두 걸러내고 부정적인 한 가지 세부 사항에만 집착하는 왜곡입니다."
      });
    }
    
    // 4. 긍정 격하 (Disqualifying Positive)
    if (/(운이좋았|운이좋아|누구나하는|아무나|어쩌다|우연히)/.test(t)) {
      distortions.push({
        type: 'disqualifying_positive',
        name: '긍정 격하',
        description: "스스로가 이룬 성취나 긍정적인 경험을 '운이 좋았을 뿐이다' 혹은 '누구나 하는 거다'라며 그 가치를 깎아내리는 습관입니다."
      });
    }
    
    // 5. 예단 (Jumping to Conclusions)
    if (/(분명|틀림없이|일거야|나를싫어)/.test(t)) {
      distortions.push({
        type: 'jumping_to_conclusions',
        name: '독심술 / 지레짐작',
        description: "충분한 증거가 없는데도 상대방의 마음을 부정적으로 추측하거나, 미래가 나쁠 것이라고 단정 짓는 습관입니다."
      });
    }
    
    // 6. 극대화/축소화 (Magnification/Minimization)
    if (/(최악|끔찍|재앙|별거아닌)/.test(t)) {
      distortions.push({
        type: 'magnification',
        name: '극대화 혹은 축소화',
        description: "자신의 실수나 문제는 너무 크게 부풀려 보고(망원경 효과), 자신의 장점이나 성취는 아주 작게 축소해 보는 경향입니다."
      });
    }
    
    // 7. 감정적 추리 (Emotional Reasoning)
    if (/(느끼니까|불안하니까|느낌이)/.test(t)) {
      distortions.push({
        type: 'emotional_reasoning',
        name: '감정적 추리',
        description: "자신의 감정을 마치 객관적인 사실이나 진실처럼 믿어버리는 왜곡입니다. '내가 멍청하게 느껴지니 나는 멍청하다'라고 믿는 식이죠."
      });
    }
    
    // 8. 당위적 명령 (Should Statements)
    if (/(해야해|해야만|해야하는데|의무)/.test(t)) {
      distortions.push({
        type: 'should_statements',
        name: '당위적 명령',
        description: "자신이나 타인에게 '반드시 ~해야 한다'는 엄격한 규칙을 세우고, 지켜지지 않았을 때 크게 자책하거나 실망하는 패턴입니다."
      });
    }
    
    // 9. 개인화 (Personalization)
    if (/(내탓|내잘못|나때문에)/.test(t)) {
      distortions.push({
        type: 'personalization',
        name: '개인화',
        description: "자신이 온전히 통제할 수 없는 상황이나 타인의 행동조차 모두 자신의 책임으로 돌리고 자책하는 습관이에요."
      });
    }
    
    // 10. 낙인찍기 (Labeling)
    if (/(나는~야|실패자|멍청|쓸모없|바보)/.test(t)) {
      distortions.push({
        type: 'labeling',
        name: '낙인찍기',
        description: "특정한 실수나 행동을 바탕으로 자신이나 타인에게 부정적이고 고정된 라벨(꼬리표)을 붙이는 극단적인 형태의 일반화입니다."
      });
    }
    
    return distortions;
  },
  
  _generateSocraticQuestion(distortionType, thought) {
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    
    switch (distortionType) {
      case 'all_or_nothing':
        return getRandom([
          "완벽하지 않다고 해서 그것이 정말 100% 실패를 의미할까요? 혹시 그 사이 어딘가, 이를테면 60점이나 70점짜리 성공일 수는 없을까요?",
          "세상에 완벽한 사람이 있을까요? 작은 실수 하나가 전체의 가치를 모두 깎아내리는 것은 아닐 수 있어요. 어떻게 생각하시나요?",
          "흑백으로 나누기보다는 이 상황을 스펙트럼(정도)으로 본다면, 현재 몇 점 정도에 위치해 있다고 볼 수 있을까요?"
        ]);
      case 'overgeneralization':
        return getRandom([
          "항상 그랬다고 느끼시지만, 아주 가끔이라도 예외적인 경우는 한 번도 없었을까요?",
          "과거의 단 한 번의 실패가 미래의 모든 결과를 결정짓는다는 확신은 어디서 오는 걸까요?",
          "이번 일이 다음에도 무조건 반복될 거라고 확신할 수 있는 분명한 근거가 있을까요?"
        ]);
      case 'mental_filter':
        return getRandom([
          "부정적인 부분에 마음이 쏠려 있네요. 반대로 잘 된 부분이나 긍정적인 요소는 정말 하나도 없었을까요?",
          "이 상황에서 당신이 간과하고 있는 작은 장점이나 긍정적인 면이 있다면 무엇일까요?"
        ]);
      case 'disqualifying_positive':
        return getRandom([
          "스스로 해낸 일을 너무 작게 평가하고 계신 건 아닐까요? 남이 똑같이 해냈어도 그렇게 말씀하실 건가요?",
          "그것이 단지 '운'이나 '우연'이었다고만 볼 수 있을까요? 당신의 노력이나 능력이 기여한 부분은 전혀 없었을까요?"
        ]);
      case 'jumping_to_conclusions':
        return getRandom([
          "그렇게 생각하시는 이유를 뒷받침할 만한 객관적이고 확실한 '증거'가 있을까요? 아니면 느낌일까요?",
          "상대방이 그 행동을 한 다른 여러 가지 이유가 있을지도 몰라요. 다른 가능성은 전혀 없을까요?",
          "아직 일어나지 않은 미래를 100% 부정적으로 확신할 수 있을까요? 다른 결과가 나올 가능성은 없나요?"
        ]);
      case 'magnification':
        return getRandom([
          "이 일이 한 달 뒤, 혹은 1년 뒤에도 지금처럼 '최악'의 문제로 느껴질까요?",
          "혹시 문제의 심각성을 너무 크게 부풀려서 걱정하고 계신 것은 아닐까요?"
        ]);
      case 'emotional_reasoning':
        return getRandom([
          "감정이 항상 사실을 말해주는 것은 아니에요. 불안하다고 해서 상황이 정말 위험하다는 객관적인 증거가 있을까요?",
          "그렇게 '느껴지는' 것 말고, 실제 '사실'은 무엇인지 구분해볼 수 있을까요?"
        ]);
      case 'should_statements':
        return getRandom([
          "그 '~해야 한다'는 규칙은 누가 만든 것일까요? 그 규칙을 조금 유연하게 '~하면 좋겠다'로 바꾸면 느낌이 어떻게 달라지나요?",
          "스스로에게 너무 엄격한 잣대를 대고 있는 것은 아닐까요? 남에게는 관대하면서 나에게만 가혹한 규칙을 적용하고 있지는 않나요?"
        ]);
      case 'personalization':
        return getRandom([
          "그 결과가 정말 100% 본인의 통제하에 있었던 일일까요? 상황이나 다른 사람의 영향은 없었을까요?",
          "그 사건에 영향을 미친 외부 요인들을 피자 조각처럼 나누어본다면, 본인의 책임은 몇 퍼센트 정도 될까요?"
        ]);
      case 'labeling':
        return getRandom([
          "한 번의 실수로 당신의 전체 정체성을 '실패자'로 정의할 수 있을까요?",
          "그 행동 하나가 당신이라는 사람의 모든 것을 대변한다고 볼 수 있을까요?"
        ]);
      default:
        return getRandom([
          "이 생각은 100% 사실일까요? 이 생각을 뒷받침하는 증거와 반대되는 증거는 무엇이 있을까요?",
          "이 생각이 사실이라는 것을 입증하려면 어떤 객관적인 사실들이 필요할까요?",
          "지금의 생각이 당신을 편안하게 만들어주나요, 아니면 더 힘들게 만들고 있나요?",
          "만약 가장 친한 친구가 이런 생각을 하고 있다면, 어떤 조언을 해주고 싶으신가요?"
        ]);
    }
  },
  
  _suggestReframe(distortion, thought) {
    return "이 상황을 다른 관점에서 바라보면 어떨까요?";
  }
};
