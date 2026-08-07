// ============================================================================
//  우렁의사 음성 대화 (Voice STT + TTS)
//  - STT: Web Speech API (SpeechRecognition / webkitSpeechRecognition)
//  - TTS: Web Speech API (SpeechSynthesisUtterance)
//  - 각 페르소나별 목소리 톤(Pitch) & 속도(Rate) 적용
// ============================================================================
window.Voice = {
  isListening: false,
  isTtsEnabled: false,
  recognition: null,
  synth: window.speechSynthesis,
  selectedVoice: null,

  init() {
    // 1. 저장된 TTS 활성화 여부 로드
    this.isTtsEnabled = window.Storage ? window.Storage._safeGet('cbt_tts_enabled', false) : false;

    // 2. SpeechRecognition 객체 준비
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = ({ en: 'en-US', ja: 'ja-JP' })[(window.Storage && window.Storage._safeGet('cbt_lang', 'ko')) || 'ko'] || 'ko-KR';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.isListening = true;
        this._updateMicUi(true);
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const input = document.getElementById('chat-input');
        if (input) {
          input.value = transcript;
          const sendBtn = document.getElementById('chat-send');
          if (sendBtn) sendBtn.disabled = !transcript.trim();
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('음성 인식 오류:', event.error);
        this.stopListening();
      };

      this.recognition.onend = () => {
        this.stopListening();
        // 인식 후 내용이 존재하면 자동 전송
        const input = document.getElementById('chat-input');
        if (input && input.value.trim() && window.App) {
          window.App.sendMessage();
        }
      };
    } else {
      console.log('이 브라우저는 Web Speech API 음성 인식을 지원하지 않습니다.');
    }

    // 3. 한국어 TTS 목소리 로드
    if (this.synth) {
      this._loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this._loadVoices();
      }
    }

    // 4. UI 이벤트 바인딩
    this._bindUi();
    this.updateTtsToggleUi();

    // 5. 마이페이지 설정 UI와 동기화
    const settingToggle = document.getElementById('setting-tts-toggle');
    if (settingToggle) settingToggle.checked = this.isTtsEnabled;
    const genderSel = document.getElementById('setting-tts-gender');
    if (genderSel) genderSel.value = this.getGender();
  },

  _loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    const L = ({ en: 'en', ja: 'ja' })[(window.Storage && window.Storage._safeGet('cbt_lang', 'ko')) || 'ko'] || 'ko';
    this.selectedVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(L)) || null;
  },

  _bindUi() {
    const micBtn = document.getElementById('btn-mic');
    if (micBtn) {
      micBtn.addEventListener('click', () => this.toggleListening());
    }

    const ttsBtn = document.getElementById('btn-tts-toggle');
    if (ttsBtn) {
      ttsBtn.addEventListener('click', () => this.toggleTts());
    }
  },

  // --- STT (음성 인식) ---
  toggleListening() {
    if (!this.recognition) {
      alert('사용하시는 기기/브라우저가 음성 인식을 지원하지 않거나 권한이 필요합니다.');
      return;
    }
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.stopSpeaking();
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('Speech recognition start failed:', e);
      }
    }
  },

  stopListening() {
    this.isListening = false;
    this._updateMicUi(false);
  },

  _updateMicUi(listening) {
    const micBtn = document.getElementById('btn-mic');
    const input = document.getElementById('chat-input');
    if (micBtn) {
      if (listening) {
        micBtn.classList.add('recording');
      } else {
        micBtn.classList.remove('recording');
      }
    }
    if (input) {
      if (listening) {
        input.placeholder = window.I18N ? window.I18N.t('듣고 있어요… 편하게 말씀하세요') : '듣고 있어요… 편하게 말씀하세요';
      } else {
        input.placeholder = window.I18N ? window.I18N.t('마음속 이야기를 적어주세요') : '마음속 이야기를 적어주세요';
      }
    }
  },

  // --- TTS (음성 읽어주기) ---
  toggleTts() {
    this.isTtsEnabled = !this.isTtsEnabled;
    if (window.Storage) window.Storage._safeSet('cbt_tts_enabled', this.isTtsEnabled);
    this.updateTtsToggleUi();
    if (!this.isTtsEnabled) this.stopSpeaking();
  },

  updateTtsToggleUi() {
    const ttsBtn = document.getElementById('btn-tts-toggle');
    const iconSpan = document.getElementById('tts-icon');
    const textSpan = document.getElementById('tts-text');
    if (!ttsBtn) return;

    if (this.isTtsEnabled) {
      ttsBtn.style.borderColor = 'var(--accent-primary)';
      ttsBtn.style.color = 'var(--accent-primary)';
      if (textSpan) textSpan.textContent = '소리 켬';
    } else {
      ttsBtn.style.borderColor = 'var(--glass-border)';
      ttsBtn.style.color = 'var(--text-muted)';
      if (textSpan) textSpan.textContent = '소리 끔';
    }
    // 아이콘 갱신: Icons.svg가 있으면 사용, 없거나 실패하면 이모지로 폴백.
    // (예전 코드는 존재하지 않는 Icons.renderAll()을 불러 앱 초기화 전체를 죽였다)
    if (iconSpan) {
      let svg = '';
      try {
        if (window.Icons && typeof window.Icons.svg === 'function') {
          svg = window.Icons.svg(this.isTtsEnabled ? 'volume-2' : 'volume-off', { size: 14 }) || '';
        }
      } catch (e) { svg = ''; }
      iconSpan.innerHTML = svg || (this.isTtsEnabled ? '🔊' : '🔇');
    }
  },

  // ==========================================================================
  //  TTS: OpenAI 음성 모델(사람 같은 목소리) 우선, 실패 시 브라우저 내장으로 폴백.
  //  말풍선들은 큐에 쌓여 순서대로 '끝까지' 재생된다 — 중간에 자르지 않는다.
  // ==========================================================================
  _ttsQueue: [],
  _ttsPlaying: false,
  _audioEl: null,

  speak(text, personaId = 'woorung') {
    if (!this.isTtsEnabled) return;

    const clean = String(text || '')
      .replace(/\|\|\|/g, ' ')
      .replace(/\[세션끝\]/g, '')
      .replace(/\[세션안내\]/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/ㅋㅋ+|ㅎㅎ+/g, ' ')
      .replace(/ㅠㅠ+|ㅜㅜ+/g, '')
      .replace(/[─│*_#>`~]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;

    this._ttsQueue.push({ text: clean, personaId });
    this._drainTts();
  },

  async _drainTts() {
    if (this._ttsPlaying) return;
    const item = this._ttsQueue.shift();
    if (!item) return;
    this._ttsPlaying = true;
    try {
      await this._speakOpenAI(item.text, item.personaId);
    } catch (e) {
      // 네트워크·프록시 문제 시 브라우저 내장 목소리로라도 끝까지 읽는다
      try { await this._speakBrowser(item.text, item.personaId); } catch (e2) {}
    }
    this._ttsPlaying = false;
    this._drainTts();
  },

  // 설정: 소리 켬/끔, 목소리 성별
  setMuted(muted) {
    this.isTtsEnabled = !muted;
    if (window.Storage) window.Storage._safeSet('cbt_tts_enabled', this.isTtsEnabled);
    if (muted) this.stopSpeaking();
    this.updateTtsToggleUi();
  },

  getGender() {
    return (window.Storage && window.Storage._safeGet('cbt_tts_gender', 'female')) || 'female';
  },

  setGender(g) {
    if (window.Storage) window.Storage._safeSet('cbt_tts_gender', g === 'male' ? 'male' : 'female');
  },

  // 상담사별 OpenAI 목소리와 말하는 결 (여성/남성 세트)
  _openaiVoiceFor(personaId) {
    const female = {
      woorung: { voice: 'coral',   speed: 1.0,  instructions: '따뜻하고 다정한 한국어 상담사 톤으로, 자연스럽고 편안하게 말하세요.' },
      haru:    { voice: 'nova',    speed: 1.04, instructions: '밝고 경쾌한 한국어로, 친한 친구처럼 생기 있게 말하세요.' },
      dalnim:  { voice: 'shimmer', speed: 0.9,  instructions: '아주 부드럽고 조용한 한국어로, 다정하게 위로하듯 천천히 말하세요.' },
      sonamu:  { voice: 'sage',    speed: 0.92, instructions: '차분한 한국어로, 명상 안내자처럼 느긋하게 말하세요.' }
    };
    const male = {
      woorung: { voice: 'alloy',   speed: 1.0,  instructions: '따뜻하고 다정한 한국어 남성 상담사 톤으로, 자연스럽고 편안하게 말하세요.' },
      haru:    { voice: 'echo',    speed: 1.04, instructions: '밝고 경쾌한 한국어로, 친한 친구처럼 생기 있게 말하세요.' },
      dalnim:  { voice: 'ash',     speed: 0.9,  instructions: '아주 부드럽고 조용한 한국어로, 다정하게 위로하듯 천천히 말하세요.' },
      sonamu:  { voice: 'onyx',    speed: 0.92, instructions: '낮고 차분한 한국어로, 명상 안내자처럼 느긋하게 말하세요.' }
    };
    const set = this.getGender() === 'male' ? male : female;
    return set[personaId] || set.woorung;
  },

  async _speakOpenAI(text, personaId) {
    const cfg = this._openaiVoiceFor(personaId);
    const payload = {
      model: 'gpt-4o-mini-tts',
      voice: cfg.voice,
      input: text,
      speed: cfg.speed,
      instructions: cfg.instructions,
      response_format: 'mp3'
    };

    // 1) 동일 출처 서버 프록시
    let res = null;
    try {
      res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) { res = null; }

    // 2) 동일 출처 프록시가 없으면(폰·배포본) Cloudflare Worker로
    const isAudio = r => r && r.ok && (r.headers.get('content-type') || '').includes('audio');
    if (!isAudio(res) && window.LLM && window.LLM.BACKEND_URL) {
      try {
        res = await fetch(window.LLM.BACKEND_URL.replace(/\/+$/, '') + '/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) { res = null; }
    }

    // 3) 그래도 없으면 사용자가 직접 넣은 개인 키로 (설정한 사람만)
    if (!isAudio(res)) {
      const key = window.LLM && window.LLM._getApiKey ? window.LLM._getApiKey() : null;
      if (!key) throw new Error('no-key');
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('tts-http-' + res.status);
    }

    const blob = await res.blob();
    if (!blob || blob.size < 200) throw new Error('tts-empty');

    await new Promise((resolve, reject) => {
      if (!this._audioEl) this._audioEl = new Audio();
      const a = this._audioEl;
      a.src = URL.createObjectURL(blob);
      a.onended = () => { try { URL.revokeObjectURL(a.src); } catch (e) {} resolve(); };
      a.onerror = () => reject(new Error('audio-play'));
      a.play().catch(reject);
    });
  },

  _speakBrowser(text, personaId) {
    return new Promise((resolve) => {
      if (!this.synth) return resolve();
      const utter = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) utter.voice = this.selectedVoice;
      utter.lang = ({ en: 'en-US', ja: 'ja-JP' })[(window.Storage && window.Storage._safeGet('cbt_lang', 'ko')) || 'ko'] || 'ko-KR';
      const tone = ({
        haru:   { pitch: 1.25, rate: 1.05 },
        dalnim: { pitch: 0.85, rate: 0.88 },
        sonamu: { pitch: 0.92, rate: 0.85 }
      })[personaId] || { pitch: 1.0, rate: 1.0 };
      utter.pitch = tone.pitch;
      utter.rate = tone.rate;
      utter.onend = resolve;
      utter.onerror = resolve;
      this.synth.speak(utter);
    });
  },

  stopSpeaking() {
    this._ttsQueue = [];
    this._ttsPlaying = false;
    if (this._audioEl) {
      try { this._audioEl.pause(); this._audioEl.src = ''; } catch (e) {}
    }
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }
};
