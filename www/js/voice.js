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
      this.recognition.lang = 'ko-KR';
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
  },

  _loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    this.selectedVoice = voices.find(v => v.lang === 'ko-KR' || v.lang === 'ko_KR') || voices.find(v => v.lang.startsWith('ko')) || null;
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
        input.placeholder = '듣고 있어요… 편하게 말씀하세요';
      } else {
        input.placeholder = '마음속 이야기를 편하게 적어주세요...';
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
      if (iconSpan) iconSpan.setAttribute('data-icon', 'volume-2');
      if (textSpan) textSpan.textContent = '소리 켬';
    } else {
      ttsBtn.style.borderColor = 'var(--glass-border)';
      ttsBtn.style.color = 'var(--text-muted)';
      if (iconSpan) iconSpan.setAttribute('data-icon', 'volume-off');
      if (textSpan) textSpan.textContent = '소리 끔';
    }
    if (window.Icons) window.Icons.renderAll();
  },

  speak(text, personaId = 'woorung') {
    if (!this.isTtsEnabled || !this.synth) return;
    this.stopSpeaking();

    let clean = text
      .replace(/\|\|\|/g, " ")
      .replace(/\[세션끝\]/g, "")
      .replace(/\[세션안내\]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .trim();

    if (!clean) return;

    const utter = new SpeechSynthesisUtterance(clean);
    if (this.selectedVoice) utter.voice = this.selectedVoice;
    utter.lang = 'ko-KR';

    switch (personaId) {
      case 'haru': // 햇님이
        utter.pitch = 1.25;
        utter.rate = 1.05;
        break;
      case 'dalnim': // 달님
        utter.pitch = 0.85;
        utter.rate = 0.88;
        break;
      case 'sonamu': // 소나무
        utter.pitch = 0.92;
        utter.rate = 0.85;
        break;
      default: // 우렁의사
        utter.pitch = 1.0;
        utter.rate = 1.0;
    }

    this.synth.speak(utter);
  },

  stopSpeaking() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }
};
