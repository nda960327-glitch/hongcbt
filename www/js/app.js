window.App = {
  currentTab: 'chat',
  typingIndicatorElement: null,
  deferredPrompt: null,
  
  // === 소셜 로그인 (카카오/구글/네이버) ===
  // 실서비스 연동 지점: 각 provider의 OAuth SDK 호출로 이 함수 내부만 교체하면 된다.
  // (카카오 JS SDK / Google Identity / 네이버 아이디로그인 — 각각 앱 키 등록 필요, ROADMAP 참고)
  // 예전에는 여기서 localStorage 에 표시만 하고 '정식 출시 시 연결돼요'를 띄웠다.
  //  이제 진짜 로그인이 있으므로 Account 로 넘긴다.
  socialLogin(provider) {
    if (window.Account) window.Account.login(provider);
  },
  logout() {
    if (window.Account) window.Account.logout();
  },

  init() {
    // 0. 로그인 게이트.
    //  '둘러보기'를 없앴으므로 로그인해야 들어온다. 판단 기준은 진짜 세션이다.
    //  Account.init() 은 뒤에 도는데 게이트는 지금 필요하므로 저장소를 직접 본다.
    //  로그인하고 돌아오는 길(?auth=)에는 띄우지 않는다 — 화면이 깜빡인다.
    (() => {
      let has = false;
      try { has = !!localStorage.getItem('cbt_account_session'); } catch (e) {}
      if (!has && !/[?&]auth=/.test(location.search)) {
        const sc = document.getElementById('login-screen');
        if (sc) sc.classList.remove('hidden');
      }
    })();

    // 1. Check first visit
    if (window.Storage.isFirstVisit()) {
      this.showDisclaimerModal();
      window.Storage.markVisited();
    }
    
    // 첫 화면(챗봇)도 헤더 숨김 규칙 적용 (여백까지 제거되는 클래스 방식)
    document.body.classList.toggle('header-hidden', ['home', 'chat', 'counselors', 'dashboard'].includes(this.currentTab));

    // 2. Set up navigation
    document.querySelectorAll('.nav-item[data-tab]').forEach(navItem => {
      navItem.addEventListener('click', (e) => {
        const tabName = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tabName);
      });
    });
    
    // 3. Set up chat UI
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    
    if (chatInput && chatSend) {
      chatInput.addEventListener('input', () => {
        this.autoResizeTextarea();
        chatSend.disabled = !chatInput.value.trim();
        this._saveDraft(chatInput.value);
      });
      // 쓰다 만 이야기는 앱을 껐다 켜도 남아 있어야 한다 (전화가 오거나 앱이 죽어도)
      this._restoreDraft();
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      chatSend.addEventListener('click', () => this.sendMessage());

      // 키보드가 올라오면(입력 중): 하단바 숨김 + 그 여백 제거 → 입력창이 키보드 바로 위에 붙는다
      // 시작할 때 한 번, 그리고 창 크기가 바뀔 때마다 다시 잰다
      setTimeout(() => this.syncChatInputHeight(), 300);
      window.addEventListener('resize', () => this.syncChatInputHeight());
      chatInput.addEventListener('focus', () => { document.body.classList.add('kb-open'); setTimeout(() => this.syncChatInputHeight(), 120); });
      chatInput.addEventListener('blur', () => setTimeout(() => { document.body.classList.remove('kb-open'); this.syncChatInputHeight(); }, 150));
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
          const keyboardOpen = window.visualViewport.height < window.innerHeight * 0.72;
          document.body.classList.toggle('kb-open', keyboardOpen && document.activeElement === chatInput);
          this.syncChatInputHeight();
        });
      }
    }
    
    // 4. Set up header buttons
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetChat());
    }

    // 4.1 기억 금고 (암호화 백업/복원)
    const btnMemExport = document.getElementById('btn-memory-export');
    if (btnMemExport) {
      btnMemExport.addEventListener('click', () => {
        if (window.MemoryVault && window.MemoryVault.exportEncrypted()) {
          window.UI.alert('우렁의사의 기억이 봉인된 파일로 저장되었습니다.');
        }
      });
    }
    const btnMemImport = document.getElementById('btn-memory-import');
    const memFileInput = document.getElementById('memory-import-file');
    if (btnMemImport && memFileInput) {
      btnMemImport.addEventListener('click', () => memFileInput.click());
      memFileInput.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f && window.MemoryVault) window.MemoryVault.importEncrypted(f);
        memFileInput.value = '';
      });
    }

    // 4.2 AI 상담사 페르소나
    this.renderPersonaBar();
    const btnPersona = document.getElementById('btn-persona-change');
    if (btnPersona) btnPersona.addEventListener('click', () => this.showPersonaModal());
    const personaClose = document.getElementById('persona-modal-close');
    if (personaClose) personaClose.addEventListener('click', () => {
      this._savePersonaDontAsk();
      const m = document.getElementById('persona-modal');
      if (m) m.classList.add('hidden');
      // 한 번도 안 골랐는데 닫으면 우렁의사를 기본으로 확정 (다시 강제로 띄우지 않기 위해)
      if (window.Personas && !window.Personas.hasChosen()) {
        window.Personas.setActive('woorung');
        this.renderPersonaBar();
        if ((window.Storage.getMessages() || []).length === 0) this._showPersonaGreeting('woorung');
      }
    });
    
    // 4.24 오래 자리를 비웠다 돌아오면 — 우렁이가 기다리고 있었다
    try {
      const lastV = window.Storage._safeGet('cbt_last_visit', 0) || 0;
      const gapH = lastV ? (Date.now() - lastV) / 3600000 : 0;
      window.Storage._safeSet('cbt_last_visit', Date.now());
      if (gapH >= 48) {
        setTimeout(() => {
          this.stickerPop('waiting', 2400);
 this.showRecordToast(`우렁이가 ${Math.floor(gapH / 24)}일 동안 문 앞에서 기다렸대요`);
        }, 1200);
      }
    } catch (e) {}

    // 4.25 우렁이 스티커 하이드레이션 (빈 화면·설치 팝업 등 data-sticker 요소)
    if (window.Stickers) {
      document.querySelectorAll('[data-sticker]').forEach(el => {
        el.innerHTML = window.Stickers.svg(
          el.getAttribute('data-sticker'),
          parseInt(el.getAttribute('data-sticker-size') || '96', 10)
        );
      });
    }

    // 4.3 챗봇 화면의 대화 초기화 버튼
    const btnChatReset = document.getElementById('btn-chat-reset');
    if (btnChatReset) btnChatReset.addEventListener('click', () => this.resetChat());

    // 4.4 내 프로필 정보 설정 (이름/별명, 전화번호, 성별)
    const nameInput = document.getElementById('user-name-input');
    const phoneInput = document.getElementById('user-phone-input');
    const genderSelect = document.getElementById('user-gender-select');
    const profileSaveBtn = document.getElementById('btn-save-profile') || document.getElementById('btn-save-name');

    if (nameInput && window.Storage) nameInput.value = window.Storage._safeGet('cbt_user_name', '');
    if (phoneInput && window.Storage) phoneInput.value = window.Storage._safeGet('cbt_user_phone', '');
    if (genderSelect && window.Storage) genderSelect.value = window.Storage._safeGet('cbt_user_gender', 'none');

    // 전화번호 자동 하이픈. 규칙은 formatTel 한 곳에만 둔다.
    //  전에는 여기서 직접 3-4-4 로 잘라서 02-312-4711 이 깨졌다.
    this.autoHyphenTel(phoneInput);
    this.autoHyphenTel(document.getElementById('creg-hosp-tel'));

    if (profileSaveBtn) {
      profileSaveBtn.addEventListener('click', () => {
        const nameVal = nameInput ? nameInput.value.trim() : '';
        const phoneVal = phoneInput ? phoneInput.value.trim() : '';
        const genderVal = genderSelect ? genderSelect.value : 'none';
        if (phoneVal && phoneVal.replace(/\D/g, '').length < 10) {
          this.showRecordToast('전화번호를 다시 확인해주세요 (10~11자리)');
          return;
        }
        window.Storage._safeSet('cbt_user_name', nameVal);
        window.Storage._safeSet('cbt_user_phone', phoneVal);
        window.Storage._safeSet('cbt_user_gender', genderVal);
 this.showRecordToast(nameVal ?`프로필 저장! ${nameVal}님이라고 부를게요`:'프로필이 저장되었어요');
        this.renderHomeGreeting();
      });
    }

    // 4.42 언어 설정 (한국어/English/日本語)
    const langSel = document.getElementById('setting-lang');
    if (langSel) {
      langSel.value = window.Storage._safeGet('cbt_lang', 'ko');
      langSel.addEventListener('change', () => {
        window.Storage._safeSet('cbt_lang', langSel.value);
        location.reload(); // UI·음성 인식·챗봇 언어를 한 번에 새로 적용
      });
    }
    if (window.I18N) { window.I18N.apply(); window.I18N.observe(); }

    // 4.43 구독 (7일 체험 → 월 구독)
    if (window.Subscription) window.Subscription.init();

    // 4.45 먼저 말 걸기(체크인) 설정 + 스케줄러
    this.initCheckins();
    // 4.46 알림을 눌러서 들어왔을 때 그 기능으로 데려다준다
    this._initNotifRouting();

    // 4.45+ 글자 크기 복원 + 뒤로가기 가드 + 앱 잠금
    this.initFontScale();
    this._initBackGuard();
    if (window.AppLock) window.AppLock.init();

    // 4.5 Theme toggle
    this.initTheme();
    const btnTheme = document.getElementById('btn-theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => this.toggleTheme());
    }
    
    // 4.7 Fullscreen setup
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }
    
    // 5. Set up modal close handlers
    const crisisClose = document.getElementById('crisis-close');
    if (crisisClose) crisisClose.addEventListener('click', () => this.hideCrisisModal());
    
    const disclaimerAccept = document.getElementById('disclaimer-accept');
    if (disclaimerAccept) disclaimerAccept.addEventListener('click', () => {
      document.getElementById('disclaimer-modal').classList.add('hidden');
      // 이용 안내 확인 후: 신규 사용자는 온보딩(별명→고민→상담사 추천), 기존 사용자는 상담사 선택
      if (window.Onboard && window.Onboard.needed() && !(window.Personas && window.Personas.hasChosen())) {
        window.Onboard.start();
      } else {
        this.maybeForcePersonaChoice();
      }
    });
    
    // 5.5 Init components
    if (window.Voice) window.Voice.init();
    if (window.Booking) window.Booking.init();
    if (window.Marketplace) window.Marketplace.init();
    // 계정·동기화. 로그인 안 했으면 아무 요청도 나가지 않는다.
    if (window.Account) window.Account.init();
    // 옛 코드로 돌고 있으면 조용히 갈아탄다 (캐시 설정에 기대지 않는 마지막 방어)
    if (window.Freshness) window.Freshness.init();
    this.updateSessionUI();

    // 6. Initialize Chat
    const messages = window.Storage.getMessages();
    if (messages && messages.length > 0) {
      this.loadExistingMessages();
    }

    // 상담사를 아직 고른 적 없으면 선택부터 (첫 인사는 선택한 상담사가 한다)
    const needsChoice = this.maybeForcePersonaChoice();
    if (!needsChoice && (!messages || messages.length === 0)) {
      this._showPersonaGreeting(window.Personas ? window.Personas.getActive().id : 'woorung');
    }
    
    // 7. Mark day as active
    window.Storage.markDayActive();
    window.Storage.incrementSessions();
    
    // 8. Initialize other modules
    if (window.ThoughtRecord) window.ThoughtRecord.init();
    if (window.Dashboard) window.Dashboard.init();
    if (window.Learn) window.Learn.init();
    if (window.Growth) window.Growth.init();
    if (window.Missions) window.Missions.renderCard();
    this.initCregForm(); // 상담사 등록 폼: 전문분야 칩·사진 업로드
    this.renderHomeGreeting();
    if (window.Safety) window.Safety.renderRow();
    const soundCb = document.getElementById('setting-sound');
    if (soundCb) soundCb.checked = window.Storage._safeGet('cbt_sound_on', true) !== false;
    const hapticCb = document.getElementById('setting-haptic');
    if (hapticCb) hapticCb.checked = window.Storage._safeGet('cbt_haptic_on', true) !== false;
    ['chat', 'booking', 'letter'].forEach(k => {
      const cb = document.getElementById('notif-' + k);
      if (cb) cb.checked = this._notifOn(k);
    });
    if (window.Weekly) window.Weekly.autoDeliver();
    this._maybeBackupNudge();
    // 기존 사용자(이미 상담사 선택함)는 온보딩을 건너뛴 것으로 처리
    if (window.Onboard && window.Personas && window.Personas.hasChosen()) {
      window.Storage._safeSet('cbt_onboard_done', true);
    }
    if (window.Personas) window.Personas.renderHomeQuickSelect();
    
    // 9. PWA Install Logic
    this.initPWA();
  },

  initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      this.deferredPrompt = e;
      
      // Notify via banner on home
      const installBanner = document.getElementById('pwa-install-banner');
      if (installBanner) {
        installBanner.style.display = 'flex';
      }
    });

    const btnInstall = document.getElementById('btn-install-app');
    const btnGlobalInstall = document.getElementById('btn-global-install');
    
    const triggerInstall = async () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        this.deferredPrompt = null;
        
        const installBanner = document.getElementById('pwa-install-banner');
        if (installBanner) installBanner.style.display = 'none';
        
        const globalModal = document.getElementById('global-install-modal');
        if (globalModal) globalModal.classList.add('hidden');
      } else {
 window.UI.alert("앱 설치 기능이 이 브라우저에서 지원되지 않거나 이미 설치되어 있습니다.\n\n(iOS Safari의 경우 하단의 공유 버튼'홈 화면에 추가'를 선택하세요.)\n(크롬의 경우 메뉴'앱 설치'를 선택하세요.)");
      }
    };

    if (btnInstall) btnInstall.addEventListener('click', triggerInstall);
    if (btnGlobalInstall) btnGlobalInstall.addEventListener('click', triggerInstall);
    
    // Show aggressive popup on ALL mobile visits if not dismissed and not already standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && !isStandalone && !localStorage.getItem('cbt_install_prompt_dismissed')) {
      setTimeout(() => {
        const globalModal = document.getElementById('global-install-modal');
        if (globalModal) globalModal.classList.remove('hidden');
      }, 1500);
    }

    window.addEventListener('appinstalled', () => {
      // Hide the app-provided install promotion
      const installBanner = document.getElementById('pwa-install-banner');
      if (installBanner) installBanner.style.display = 'none';
      // Clear the deferredPrompt so it can be garbage collected
      this.deferredPrompt = null;
      console.log('PWA was installed');
    });
  },
  
  switchTab(tabName, skipModal = false) {
    if (tabName === 'chat' && !skipModal) {
      const chosen = window.Personas && window.Personas.hasChosen();
      const optedOut = window.Storage && window.Storage._safeGet('cbt_persona_reprompt_off', false);
      if (!chosen) {
        // 아직 한 번도 안 골랐으면 반드시 선택
        this.showPersonaModal(true);
        return;
      }
      if (!optedOut) {
        // '다시 묻지 않기'를 안 한 사용자에게만 물어본다
        this.showPersonaModal(false);
        return;
      }
      // 다시 묻지 않기 선택함 → 바로 채팅으로
    }
    this.currentTab = tabName;
    
    // Update nav active state
    document.querySelectorAll('.nav-item[data-tab]').forEach(nav => {
      nav.classList.toggle('active', nav.getAttribute('data-tab') === tabName);
    });
    
    // Hide all tabs, show selected
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.toggle('active', tab.id === `tab-${tabName}`);
    });
    
    // Scroll the newly shown tab back to top
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.scrollTop = 0;

    // Trigger tab-specific refresh
    if (tabName === 'home' && window.Personas) {
      window.Personas.renderHomeQuickSelect();
    }
    if (tabName === 'home' && window.Growth) {
      window.Growth.maybeShowNightCard();
      window.Growth.renderStreakChip();
    }
    if (tabName === 'home' && window.Missions) {
      window.Missions.renderCard();
    }
    if (tabName === 'home') {
      this.hydrateInlineIcons(document.getElementById('tab-home'));
      this.renderHomeGreeting();
    }
    if (tabName === 'counselors' && window.Marketplace) {
      window.Marketplace.renderCounselors();
    }
    if (tabName === 'record' && window.ThoughtRecord) {
      window.ThoughtRecord.loadRecords();
    }
    if (tabName === 'dashboard' && window.Dashboard) {
      window.Dashboard.refresh();
    }
    if (tabName === 'learn' && window.Learn) {
      window.Learn.renderCards();
    }
    // 홈·챗봇·상담사매칭·대시보드에서는 상단 로고 헤더와 그 여백까지 제거
    document.body.classList.toggle('header-hidden', ['home', 'chat', 'counselors', 'dashboard', 'mypage'].includes(tabName));

    if (tabName === 'chat') {
      this.updateSessionUI();
      this._setNavBadge('chat', false); // 확인했으니 미확인 표시 제거
      this._restoreDraft();             // 쓰다 만 이야기가 있으면 되살린다
      setTimeout(() => this.syncChatInputHeight(), 60);
    }
    if (tabName === 'dashboard') {
      if (window.Assess && window.Assess.ctaCard) window.Assess.ctaCard();
      if (window.Dashboard && window.Dashboard.renderMyReports) window.Dashboard.renderMyReports();
      if (window.Growth) window.Growth.renderNightList();
      // 우렁이 세계 — 단일 게임 컨테이너 (HUD·내비·현재 화면 렌더)
      if (window.Game) window.Game.open();
      this.hydrateInlineIcons(document.getElementById('tab-dashboard'));
      this._setNavBadge('dashboard', false); // 확인했으니 배지 제거
    }
    if (tabName === 'mypage') {
      this._setNavBadge('mypage', false); // 답장·예약 변경 확인함
      if (window.Wallet) window.Wallet.renderCard();
      if (window.SafetyPlan) window.SafetyPlan.render();
      if (window.Homework) window.Homework.render();
      if (window.Subscription) window.Subscription.renderCard();
      this.renderMyHero();
      this.hydrateInlineIcons(document.getElementById('tab-mypage'));
      this.renderMyBookings();
      this.renderCounselorApps();
    }
  },
  
  updateSessionUI() {
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    if (inputEl) {
      const ph = '마음속 이야기를 적어주세요';
      inputEl.placeholder = window.I18N ? window.I18N.t(ph) : ph;
      inputEl.disabled = false;
    }
    if (sendBtn) sendBtn.disabled = false;
  },
  
  _replySeq: 0,      // 연속 채팅 배치: 최신 요청만 유효
  _replyTimer: null,

  // === 입력 초안 보존 ===
  //  마음먹고 쓴 긴 이야기가 앱 전환 한 번에 사라지면, 다시 쓸 마음까지 사라진다.
  _draftTimer: null,
  DRAFT_KEY: 'cbt_chat_draft',

  _saveDraft(value) {
    clearTimeout(this._draftTimer); // 타이핑마다 쓰면 느려진다 — 0.3초 쉬면 저장
    this._draftTimer = setTimeout(() => {
      try {
        const v = (value || '').trim();
        if (v) localStorage.setItem(this.DRAFT_KEY, value);
        else localStorage.removeItem(this.DRAFT_KEY);
      } catch (e) {}
    }, 300);
  },

  _clearDraft() {
    clearTimeout(this._draftTimer);
    try { localStorage.removeItem(this.DRAFT_KEY); } catch (e) {}
  },

  // 입력창이 비어 있을 때만 복원한다 (지금 쓰고 있는 글을 덮어쓰면 안 된다)
  _restoreDraft() {
    const el = document.getElementById('chat-input');
    if (!el || el.value.trim()) return;
    let draft = '';
    try { draft = localStorage.getItem(this.DRAFT_KEY) || ''; } catch (e) {}
    if (!draft) return;
    el.value = draft;
    this.autoResizeTextarea();
    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) sendBtn.disabled = !draft.trim();
  },

  async sendMessage() {
    // 구독 관문: 체험·구독은 무제한, 무료 플랜은 하루 30회
    if (window.Subscription && !window.Subscription.guardChat()) return;

    const inputEl = document.getElementById('chat-input');
    const text = inputEl.value.trim();
    if (!text) return;

    // Clear input
    inputEl.value = '';
    this.autoResizeTextarea();
    this.clearQuickReplies();
    this._clearDraft();      // 보냈으니 초안은 지운다
    this._removeRetryPill(); // 새로 말을 걸었으면 지난 실패의 '다시 시도'는 의미가 없다

    if (window.Storage) {
      window.Storage.incrementSessions();
      window.Storage.markDayActive();
    }
    // 무료 플랜이면 오늘 사용 횟수 차감
    if (window.Subscription) {
      window.Subscription.bumpTurns();   // 구독자도 사용량을 센다 (원가·남용 파악)
      if (!window.Subscription.hasAccess()) window.Subscription.bumpChat();
    }

    // Display user message
    // 저장을 먼저 하고 '저장된 객체'를 그린다 — 말풍선이 자기 id 를 알아야
    //  길게 눌러 삭제할 때 어느 메시지인지 정확히 짚을 수 있다.
    if (window.Sfx) window.Sfx.play('send');
    const savedUserMsg = window.Storage.saveMessage({ role: 'user', text: text, timestamp: new Date().toISOString() });
    this.displayMessage(savedUserMsg || { role: 'user', text: text });

    // 영속 통계: 총 대화 카운터 + 감정 로그 (대화를 초기화해도 남는다)
    window.Storage._safeSet('cbt_total_chats', ((window.Storage._safeGet('cbt_total_chats', 0)) || 0) + 1);
    if (window.Growth) window.Growth.checkAwards();
    if (window.Dashboard && window.Dashboard.logMood) window.Dashboard.logMood(text);

    // Show typing indicator
    this.showTypingIndicator();

    this._requestBotReply(text);
  },

  // 봇 응답 요청만 떼어낸 부분 — 전송과 '다시 시도'가 같은 길을 타게 하려고 분리했다.
  //  (다시 시도는 사용자 메시지를 새로 저장·표시하지 않고 이 함수만 다시 부른다)
  _requestBotReply(text, waitMs = 1100) {
    // 연속 채팅 배치: 사람은 메시지를 쪼개 보내니까, 마지막 메시지 후 잠깐
    // 기다렸다가 '한 번만' 답한다. 새 메시지가 오면 이전 예약·응답은 폐기.
    const seq = ++this._replySeq;
    clearTimeout(this._replyTimer);
    this._removeDraft(); // 이전 요청의 스트리밍 초안이 남아 있으면 걷어낸다
    this._replyTimer = setTimeout(async () => {
      let responses;
      let drafted = false;
      if (window.LLM) {
        // 스트리밍 초안: 조각이 도착하는 대로 말풍선에 흘린다.
        //  그 사이 사용자가 또 보냈으면(seq 변경) 이 스트림의 초안은 그리지 않는다.
        responses = await window.LLM.generateResponse(text, (draftText) => {
          if (seq !== this._replySeq || !draftText) return;
          drafted = true;
          this._showDraft(draftText);
        });
      } else {
        responses = window.Chatbot.processInput(text);
      }
      // 응답을 기다리는 동안 사용자가 또 보냈으면 이 응답은 버린다
      // (새 요청이 전체 맥락을 담아 다시 답한다 — 타이핑 표시는 그쪽이 이어받음)
      if (seq !== this._replySeq) return;
      this.removeTypingIndicator();
      this._removeDraft();
      // 초안으로 이미 다 읽고 있었는데 말풍선마다 또 타이핑 연기를 하면 답답하다
      if (drafted && Array.isArray(responses)) {
        responses = responses.map(r => ({ ...r, delay: Math.min(r.delay || 0, 150) }));
      }
      await this.displayBotResponses(responses);
    }, waitMs);
  },

  // === 스트리밍 초안 말풍선 — 완성되면 정식 말풍선(분할·카드)으로 교체된다 ===
  _showDraft(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    let el = document.getElementById('chat-draft');
    if (!el) {
      this.removeTypingIndicator();
      el = document.createElement('div');
      el.id = 'chat-draft';
      el.className = 'message bot';
      el.innerHTML = `
        <div class="message-avatar">${this._msgAvatar({ role: 'bot' })}</div>
        <div class="message-bubble"><p></p></div>`;
      this._tintBubble(el, { role: 'bot' });
      container.appendChild(el);
    }
    const p = el.querySelector('p');
    if (p) p.textContent = text; // textContent — 스트림 중간엔 HTML 해석 금지
    if (this._isNearBottom(container)) container.scrollTop = container.scrollHeight;
  },

  _removeDraft() {
    const el = document.getElementById('chat-draft');
    if (el) el.remove();
  },

  // 연결이 끊겨 답을 못 받았을 때, 마지막에 한 말을 그대로 다시 보낸다.
  //  사용자가 긴 이야기를 처음부터 다시 타이핑하게 두는 건 잔인하다.
  retryLast() {
    const msgs = (window.Storage && window.Storage.getMessages()) || [];
    let last = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user' && msgs[i].text && msgs[i].text.trim()) { last = msgs[i].text; break; }
    }
    if (!last) return;
    this._removeRetryPill();
    // 실패 안내 말풍선도 함께 걷어낸다 (저장 안 된 화면 전용 말풍선)
    document.querySelectorAll('#chat-messages .message.transient-msg').forEach(el => el.remove());
    this.showTypingIndicator();
    this._requestBotReply(last, 200);
  },

  _showRetryPill() {
    this._removeRetryPill();
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.id = 'chat-retry-pill';
    wrap.style.cssText = 'align-self: center; margin: 0.1rem auto 0.5rem; width: fit-content;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '다시 시도';
    btn.style.cssText = 'border: 1px solid var(--chat-accent, var(--accent-primary)); border-radius: 999px; background: var(--bg-secondary); color: var(--chat-accent, var(--accent-primary)); font-size: 0.78rem; font-weight: 800; padding: 0.36rem 1rem; cursor: pointer;';
    btn.addEventListener('click', () => { if (window.Sfx) window.Sfx.play('pop'); this.retryLast(); });
    wrap.appendChild(btn);
    container.appendChild(wrap);
    if (this._isNearBottom(container)) this.scrollToBottom();
  },

  _removeRetryPill() {
    const p = document.getElementById('chat-retry-pill');
    if (p) p.remove();
  },
  
  async displayBotResponses(responses) {
    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      const delay = response.delay || (i === 0 ? 0 : 800);
      
      if (delay > 0) {
        this.showTypingIndicator();
        await new Promise(r => setTimeout(r, delay));
        this.removeTypingIndicator();
      }
      
      if (window.Sfx) window.Sfx.play('recv');
      // 말한 상담사를 메시지에 새겨둔다 — 나중에 다시 볼 때 얼굴·말풍선 색이 섞이지 않게
      const pid = window.Personas ? window.Personas.getActive().id : 'woorung';
      if (response.viz) {
        // 시각 카드 말풍선 (음성 없음 — 그림은 읽어줄 것이 없다)
        const saved = window.Storage.saveMessage({ role: 'bot', viz: response.viz, persona: pid, text: '', timestamp: new Date().toISOString() });
        this.displayMessage(saved || { role: 'bot', viz: response.viz, persona: pid });
      } else if (response.sticker) {
        // 우렁이 스티커 말풍선 (음성 없음)
        const saved = window.Storage.saveMessage({ role: 'bot', sticker: response.sticker, persona: pid, text: '', timestamp: new Date().toISOString() });
        this.displayMessage(saved || { role: 'bot', sticker: response.sticker, persona: pid });
      } else if (response.transient) {
        // 연결 실패 안내 — 화면에만 띄운다. 저장하면 대화 기록에 남아 다음 프롬프트까지
        //  오염시키고, 알림으로 밀어내면 사용자는 상담사가 말을 건 줄 안다.
        this.displayMessage({ role: 'bot', text: response.text, persona: pid, transient: true });
        this._showRetryPill();
      } else {
        const saved = window.Storage.saveMessage({ role: 'bot', text: response.text, persona: pid, ...(response.step ? { step: response.step } : {}), timestamp: new Date().toISOString() });
        this.displayMessage(saved || { role: 'bot', text: response.text, persona: pid, step: response.step });
        if (window.Voice) {
          const personaId = window.Personas ? window.Personas.getActive().id : 'woorung';
          window.Voice.speak(response.text, personaId);
        }
        // 앱이 백그라운드거나 다른 탭을 보고 있으면 놓치지 않게 알림
        const pName = window.Personas ? window.Personas.getActive().name : '우렁의사';
        if (document.hidden) { this.notify(pName, response.text); this.playWoorung(); }
        if (this.currentTab !== 'chat') this._setNavBadge('chat', true);
      }
      
      if (response.crisis) {
        this.showCrisisModal();
      }
      
      if (response.saveRecord && window.ThoughtRecord) {
        // Open pre-filled form
        setTimeout(() => window.ThoughtRecord.showForm({ thought: response.saveRecord }), 1000);
      }
      
      // If it's the last message, show quick replies
      if (i === responses.length - 1 && response.quickReplies) {
        this.displayQuickReplies(response.quickReplies);
      }
    }
  },
  
  displayMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
    const time = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 날짜 구분선: 어제/오늘 대화가 섞여 보이지 않게
    this._appendDateDivider(container, ts);

    const wrapper = document.createElement('div');
    wrapper.className = `message ${msg.role}`;
    // 저장하지 않는 안내 말풍선 — '다시 시도'로 지울 수 있게 표시해둔다
    if (msg.transient) wrapper.classList.add('transient-msg');

    // 스티커 메시지: 말풍선 없이 캐릭터만 폴짝 (사용자가 보낸 이모티콘은 오른쪽)
    if (msg.sticker && window.Stickers) {
      wrapper.classList.add('sticker-msg');
      if (msg.role === 'user') {
        wrapper.style.justifyContent = 'flex-end';
        wrapper.innerHTML = `
          <div style="background: none; border: none; box-shadow: none; padding: 0; text-align: right;">
            ${msg.stickerSkin ? window.Stickers.svgFor(msg.stickerSkin, msg.sticker, 96) : window.Stickers.svg(msg.sticker, 96)}
            <span class="message-time" style="display: block; text-align: center;">${time}</span>
          </div>
        `;
      } else {
        const activeP = window.Personas ? window.Personas.getActive() : { id: 'woorung' };
        wrapper.innerHTML = `
          <div class="message-avatar">${this._msgAvatar(msg)}</div>
          <div style="background: none; border: none; box-shadow: none; padding: 0;">
            ${window.Stickers.svgFor ? window.Stickers.svgFor(activeP.id, msg.sticker, 108) : window.Stickers.svg(msg.sticker, 108)}
            <span class="message-time" style="display: block; text-align: center;">${time}</span>
          </div>
        `;
      }
      container.appendChild(wrapper);
      this._bindMsgActions(wrapper, msg);
      this._smartScroll(msg);
      return;
    }

    // 시각 카드 말풍선 — 숫자·변화·방향은 글보다 그림이 빠르다 (chatviz.js)
    if (msg.viz && window.ChatViz) {
      const inner = window.ChatViz.render(msg.viz);
      if (inner) {
        wrapper.innerHTML = `
          <div class="message-avatar">${this._msgAvatar(msg)}</div>
          <div class="message-bubble viz-bubble">
            ${inner}
            <span class="message-time">${time}</span>
          </div>`;
        this._tintBubble(wrapper, msg);
        container.appendChild(wrapper);
        this._bindMsgActions(wrapper, msg);
        this._smartScroll(msg);
        return;
      }
    }

    // 말풍선 본문은 반드시 이스케이프한 뒤 줄바꿈만 <br> 로 되살린다.
    //  사용자가 <img onerror=...> 를 쳐 넣거나, AI 답변에 태그가 섞여 들어오면
    //  그대로 innerHTML 에 꽂혀 스크립트가 되기 때문이다.
    const body = this._escHtml(msg.text || '').replace(/\n/g, '<br>');
    let html = '';
    if (msg.role === 'bot') {
      // 상담 코스 진행 헤더 — "[2/6] 바닥까지" 날텍스트 대신 점 진행바 + 단계 이름
      let stepHtml = '';
      if (msg.step && msg.step.total) {
        const spid = msg.persona || (window.Personas ? window.Personas.getActive().id : null);
        const pcol = (window.Personas && spid) ? window.Personas.get(spid).color : 'var(--accent-primary)';
        const total = Math.max(1, Math.min(8, +msg.step.total || 6));
        const cur = Math.max(1, Math.min(total, +msg.step.cur || 1));
        let dots = '';
        for (let i = 1; i <= total; i++) {
          dots += `<span style="display: inline-block; width: ${i === cur ? '15px' : '5px'}; height: 5px; border-radius: 999px; background: ${i <= cur ? pcol : `color-mix(in srgb, ${pcol} 22%, transparent)`};"></span>`;
        }
        stepHtml = `
          <span style="display: flex; align-items: center; gap: 3px; margin-bottom: 0.45rem; padding-bottom: 0.45rem; border-bottom: 1px dashed color-mix(in srgb, ${pcol} 35%, transparent);">
            ${dots}
            <span style="margin-left: 0.3rem; font-size: 0.68rem; font-weight: 800; color: ${pcol}; white-space: nowrap;">${cur}/${total}${msg.step.label ? ' · ' + this._escHtml(msg.step.label) : ''}</span>
          </span>`;
      }
      html = `
        <div class="message-avatar">${this._msgAvatar(msg)}</div>
        <div class="message-bubble">
          ${stepHtml}<p>${body}</p>
          <span class="message-time">${time}</span>
        </div>
      `;
    } else {
      html = `
        <div class="message-bubble">
          <p>${body}</p>
          <span class="message-time">${time}</span>
        </div>
      `;
    }

    wrapper.innerHTML = html;
    this._tintBubble(wrapper, msg);
    container.appendChild(wrapper);
    this._bindMsgActions(wrapper, msg);
    this._smartScroll(msg);
  },

  // 화면에 넣기 전에 태그가 될 수 있는 글자를 무해한 글자로 바꾼다
  _escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // === 말풍선 길게 누르기 → 액션 시트 ===
  //  카톡처럼 '꾹 눌러 복사/삭제'가 되기를 기대하는데, 지금은 아무 일도 없다.
  //  주의할 점: 말풍선 안에는 이미 버튼이 산다([그림:버튼] 칩, 수업 카드).
  //  그래서 ①짧은 탭(=click)이 나면 길게 누르기 판정을 취소하고
  //         ②길게 눌러 시트를 연 뒤 손을 떼며 생기는 click 은 캡처 단계에서 삼킨다.
  //  캡처 단계는 안쪽 버튼의 핸들러보다 먼저 도니까 오작동을 막을 수 있다.
  _bindMsgActions(wrapper, msg) {
    if (!wrapper || !msg) return;
    const LONG_MS = 500, MOVE_TOL = 10;
    let timer = null, sx = 0, sy = 0, opened = false;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

    wrapper.style.webkitTouchCallout = 'none'; // iOS 기본 '이미지 저장' 팝업과 겹치지 않게

    wrapper.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;   // 오른쪽 클릭은 contextmenu 가 맡는다
      opened = false;
      sx = e.clientX; sy = e.clientY;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        opened = true;
        this._openMsgSheet(msg, wrapper);
      }, LONG_MS);
    });

    // 손가락이 움직이면 '스크롤하려는 것' — 길게 누르기로 보지 않는다
    wrapper.addEventListener('pointermove', (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - sx) > MOVE_TOL || Math.abs(e.clientY - sy) > MOVE_TOL) cancel();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => wrapper.addEventListener(ev, cancel));

    wrapper.addEventListener('click', (e) => {
      if (opened) {           // 시트를 여느라 눌렀던 손가락 → 안쪽 버튼이 눌리면 안 된다
        e.preventDefault();
        e.stopPropagation();
        opened = false;
        return;
      }
      cancel();               // 짧은 탭(말풍선 속 버튼 클릭 포함) → 시트를 열지 않는다
    }, true);

    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      cancel();
      this._openMsgSheet(msg, wrapper);
    });
  },

  _openMsgSheet(msg, wrapper) {
    if (document.getElementById('msg-action-sheet')) return;
    const isBot = msg.role === 'bot';
    const hasText = !!(msg.text && String(msg.text).trim());

    const wrap = document.createElement('div');
    wrap.id = 'msg-action-sheet';
    wrap.style.cssText = 'position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,0.38); display: flex; align-items: flex-end;';
    const preview = hasText ? (msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text) : (msg.sticker ? '이모티콘' : '카드');
    wrap.innerHTML = `
      <div style="width: 100%; background: var(--bg-secondary); border-radius: 20px 20px 0 0; padding: 0.8rem 1.1rem calc(1.1rem + env(safe-area-inset-bottom)); animation: slideUp 0.22s ease;">
        <div style="width: 38px; height: 4px; border-radius: 2px; background: var(--glass-border); margin: 0 auto 0.8rem;"></div>
        <p style="font-size: 0.76rem; color: var(--text-muted); margin: 0 0 0.7rem; line-height: 1.4; word-break: break-all;">${this._escHtml(preview)}</p>
        <div id="mas-items" style="display: flex; flex-direction: column; gap: 0.4rem;"></div>
      </div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
    if (window.Sfx) window.Sfx.play('pop');

    const list = wrap.querySelector('#mas-items');
    const addItem = (label, danger, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = `all: unset; box-sizing: border-box; display: block; width: 100%; text-align: left; padding: 0.8rem 0.9rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); font-size: 0.9rem; font-weight: 700; cursor: pointer; color: ${danger ? 'var(--danger)' : 'var(--text-primary)'};`;
      b.addEventListener('click', () => { wrap.remove(); fn(); });
      list.appendChild(b);
    };

    // 스티커·시각 카드는 옮겨 담을 글이 없다 — 삭제만 남긴다
    if (hasText) {
      addItem('복사', false, () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg.text)
            .then(() => this.showRecordToast('복사했어요'))
            .catch(() => this.showRecordToast('복사하지 못했어요'));
        } else {
          this.showRecordToast('이 기기에서는 복사를 지원하지 않아요');
        }
      });
      if (isBot) {
        addItem('다시 듣기', false, () => {
          if (!window.Voice || !window.Voice.speak) return;
          const pid = msg.persona || (window.Personas ? window.Personas.getActive().id : 'woorung');
          window.Voice.speak(msg.text, pid);
        });
      } else {
        addItem('사고 기록으로', false, () => {
          if (window.ThoughtRecord && window.ThoughtRecord.showForm) window.ThoughtRecord.showForm({ thought: msg.text });
        });
      }
    }
    addItem('삭제', true, () => this._deleteMsg(msg, wrapper));
  },

  // 저장된 메시지에서 이 말풍선 하나를 지운다.
  //  id 가 있으면 그것으로, 없으면(옛 기록·화면 전용 말풍선) 시각·역할·내용으로 찾는다.
  async _deleteMsg(msg, wrapper) {
    if (!(await window.UI.confirm('이 메시지를 대화에서 지울까요?'))) return;

    // 저장되지 않은 안내 말풍선은 화면에서만 걷어내면 끝
    if (msg.transient) { if (wrapper) wrapper.remove(); this._removeRetryPill(); return; }

    const msgs = (window.Storage && window.Storage.getMessages()) || [];
    let i = -1;
    if (msg.id) i = msgs.findIndex(m => m.id === msg.id);
    if (i < 0) i = msgs.findIndex(m => m.role === msg.role && String(m.timestamp) === String(msg.timestamp) && (m.text || '') === (msg.text || ''));
    if (i < 0) { // 마지막 방어: 같은 역할·같은 내용 중 가장 나중 것
      for (let k = msgs.length - 1; k >= 0; k--) {
        if (msgs[k].role === msg.role && (msgs[k].text || '') === (msg.text || '')) { i = k; break; }
      }
    }
    if (i < 0) { if (wrapper) wrapper.remove(); return; }

    msgs.splice(i, 1);
    window.Storage._safeSet('cbt_messages', msgs);
    this.loadExistingMessages();
    this.showRecordToast('메시지를 지웠어요');
  },

  // 상담사마다 말풍선 색을 달리한다.
  //  넷이 같은 회색이면 지난 대화를 훑을 때 누가 한 말인지 아바타를 일일이 봐야 한다.
  //  우렁의사는 초록, 햇님은 주황, 달님은 보라, 소나무는 짙은 녹색 — 각자의 color 값.
  _tintBubble(wrapper, msg) {
    if (!msg || msg.role !== 'bot' || !window.Personas) return;
    const id = msg.persona || window.Personas.getActive().id;
    const p = window.Personas.get(id);
    const bubble = wrapper.querySelector('.message-bubble');
    if (!p || !bubble) return;
    bubble.style.background = `color-mix(in srgb, ${p.color} 16%, var(--bg-secondary))`;
    bubble.style.borderColor = `color-mix(in srgb, ${p.color} 42%, transparent)`;
  },

  // 말풍선 옆 아바타 — 그 메시지를 보낸 상담사의 얼굴을 쓴다.
  //  (지난 대화를 다시 볼 때 누가 한 말인지 섞이지 않게 저장된 persona 를 우선)
  _msgAvatar(msg) {
    if (!window.Personas) return window.Icons ? window.Icons.art.mascot(34) : '';
    const id = (msg && msg.persona) || window.Personas.getActive().id;
    return window.Personas.avatarSvg(id, 34);
  },

  // 날짜가 바뀌면 '오늘 / 어제 / 8월 5일 (화)' 구분선을 끼워 넣는다
  _appendDateDivider(container, ts) {
    const key = ts.toLocaleDateString('sv-CA');
    if (this._lastMsgDay === key) return;
    this._lastMsgDay = key;
    const today = new Date().toLocaleDateString('sv-CA');
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-CA');
    const label = key === today ? '오늘' : key === yesterday ? '어제'
      : ts.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
    const div = document.createElement('div');
    div.className = 'chat-date-divider';
    div.style.cssText = 'align-self: center; text-align: center; margin: 0.7rem auto 0.3rem; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 999px; padding: 0.2rem 0.8rem; width: fit-content;';
    div.textContent = label;
    container.appendChild(div);
  },

  // 스마트 스크롤: 옛 대화를 읽는 중이면 끌어내리지 않고 '새 메시지' 칩만 띄운다
  _isNearBottom(container) {
    return container.scrollHeight - container.scrollTop - container.clientHeight < 160;
  },

  _smartScroll(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    if (this._bulkLoading) return; // 과거 대화 일괄 렌더 중엔 개별 스크롤 생략
    if (msg.role === 'user' || this._isNearBottom(container)) {
      this.scrollToBottom();
      this._hideNewMsgChip();
    } else if (msg.role === 'bot') {
      this._showNewMsgChip();
    }
  },

  _showNewMsgChip() {
    if (document.getElementById('new-msg-chip')) return;
    const area = document.getElementById('chat-input-area');
    if (!area) return;
    const chip = document.createElement('button');
    chip.id = 'new-msg-chip';
    chip.innerHTML = '<span style="display:inline-flex;align-items:center;gap:0.28rem;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M6 13l6 6 6-6"/></svg>새 메시지</span>';
    chip.style.cssText = 'position: absolute; top: -34px; left: 50%; transform: translateX(-50%); z-index: 5; border: none; border-radius: 999px; background: var(--chat-accent, var(--accent-primary)); color: #fff; font-size: 0.76rem; font-weight: 800; padding: 0.55rem 0.95rem; cursor: pointer; box-shadow: var(--shadow-sm);';
    chip.addEventListener('click', () => { this.scrollToBottom(); this._hideNewMsgChip(); });
    area.style.position = area.style.position || 'absolute';
    area.appendChild(chip);
  },

  _hideNewMsgChip() {
    const chip = document.getElementById('new-msg-chip');
    if (chip) chip.remove();
  },
  
  showTypingIndicator() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // 이미 떠 있으면 새로 만들지 않는다 (연타 시 유령 로딩이 쌓이는 것 방지)
    const existing = document.getElementById('typing-indicator');
    if (existing) {
      this.typingIndicatorElement = existing;
      // 옛 대화를 읽는 중이면 끌어내리지 않는다 — 읽던 자리를 잃는 게 더 답답하다
      if (this._isNearBottom(container)) this.scrollToBottom();
      return existing;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'message bot typing-indicator-wrapper';
    wrapper.id = 'typing-indicator';
    // 꼬물꼬물 우렁이가 입력 중 — 흰 말풍선 안에 넣어 배경에 묻히지 않게
    wrapper.innerHTML = window.Stickers ? `
      <div class="message-avatar">${window.Icons ? window.Icons.art.mascot(34) : ''}</div>
      <div class="message-bubble" style="padding: 0.35rem 0.7rem; line-height: 0; display: inline-flex; align-items: center;">
        ${window.Stickers.typing(40)}
      </div>
    ` : `
      <div class="message-avatar">${window.Icons ? window.Icons.art.mascot(34) : ''}</div>
      <div class="message-bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    // 새로 띄울 때도 마찬가지 — 바닥 근처에서 기다리는 중일 때만 따라 내려간다
    const wasNearBottom = this._isNearBottom(container);
    container.appendChild(wrapper);
    this.typingIndicatorElement = wrapper;
    if (wasNearBottom) this.scrollToBottom();
    return wrapper;
  },
  
  removeTypingIndicator() {
    // 어떤 경로로 생겼든 전부 제거 (유령 로딩 방지)
    document.querySelectorAll('#typing-indicator, .typing-indicator-wrapper').forEach(el => el.remove());
    this.typingIndicatorElement = null;
  },
  
  displayQuickReplies(replies) {
    const container = document.getElementById('quick-replies');
    if (!container) return;
    
    this.clearQuickReplies();
    replies.forEach(replyText => {
      const btn = document.createElement('button');
      btn.className = 'quick-reply-btn';
      btn.textContent = replyText;
      btn.addEventListener('click', () => {
        const inputEl = document.getElementById('chat-input');
        inputEl.value = replyText;
        this.sendMessage();
      });
      container.appendChild(btn);
    });
    this.scrollToBottom();
  },
  
  clearQuickReplies() {
    const container = document.getElementById('quick-replies');
    if (container) container.innerHTML = '';
  },
  
  scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  },
  
  // 입력 영역 높이를 재서 CSS 변수로 넘긴다.
  //  기기·키보드 상태·입력 줄 수에 따라 높이가 달라지는데,
  //  고정값으로 여백을 주면 마지막 말풍선이 입력창 뒤로 잘린다.
  syncChatInputHeight() {
    const area = document.getElementById('chat-input-area');
    if (!area) return;
    const h = Math.round(area.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty('--chat-input-h', h + 'px');
  },

  autoResizeTextarea() {
    const el = document.getElementById('chat-input');
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 100); // approx 4 lines
    el.style.height = newHeight + 'px';
    this.syncChatInputHeight();
  },
  
  showCrisisModal() {
    const modal = document.getElementById('crisis-modal');
    if (modal) modal.classList.remove('hidden');
  },
  
  hideCrisisModal() {
    const modal = document.getElementById('crisis-modal');
    if (modal) modal.classList.add('hidden');
  },
  
  showDisclaimerModal() {
    const modal = document.getElementById('disclaimer-modal');
    if (modal) modal.classList.remove('hidden');
  },
  
  // === AI 상담사 페르소나 UI ===
  renderPersonaBar() {
    if (!window.Personas) return;
    const p = window.Personas.getActive();
    const avatar = document.getElementById('persona-bar-avatar');
    const name = document.getElementById('persona-bar-name');
    const tagline = document.getElementById('persona-bar-tagline');
    if (avatar) avatar.innerHTML = window.Personas.avatarSvg(p.id, 34);
    if (name) name.textContent = p.name;
    if (tagline) tagline.textContent = p.tagline;
    // 상담사마다 채팅방 분위기를 다르게 — 말풍선·아바타·전송 버튼이 이 색을 따라간다
    const chatTab = document.getElementById('tab-chat');
    if (chatTab) chatTab.style.setProperty('--chat-accent', p.color);
    const bar = document.getElementById('persona-bar');
    if (bar) {
      bar.style.background = `linear-gradient(180deg, color-mix(in srgb, ${p.color} 13%, var(--bg-secondary)), var(--bg-secondary))`;
      bar.style.borderBottomColor = `color-mix(in srgb, ${p.color} 30%, transparent)`;
    }
    // 전문 기법 상담 버튼 (햇님 CBT · 달님 DBT · 소나무 ACT) — 있을 땐 CTA가 줄을 채운다
    const progBtn = document.getElementById('btn-program');
    const spacer = document.getElementById('chat-tools-spacer');
    if (progBtn) {
      const prog = window.Personas.programOf(p.id);
      if (prog) {
        progBtn.style.display = 'inline-flex';
        progBtn.innerHTML = `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;">${window.Icons ? window.Icons.svg(prog.icon, { size: 17, line: '#fff' }) : ''}${prog.name} 시작하기</span>`;
        if (spacer) spacer.style.display = 'none';
      } else {
        progBtn.style.display = 'none';
        if (spacer) spacer.style.display = '';
      }
    }
  },

  // === 설정 전체화면 (마이탭에서 진입) ===
  // 캐시가 꼬여 새 버전이 안 올라올 때의 최후 수단.
  //  '인터넷 기록 삭제'로는 서비스워커도 그 캐시도 지워지지 않는다.
  //  기록(localStorage)은 건드리지 않는다 — 코드만 새로 받는다.
  async hardRefresh() {
    if (window.UI && !await window.UI.confirm({
      title: '최신 버전으로 새로고침할까요?',
      body: '앱 코드만 새로 받아요.\n대화·기억·레벨은 그대로 남습니다.',
      okLabel: '새로고침'
    })) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {}
    // 주소에 표식을 붙여 HTTP 캐시까지 확실히 우회한다
    location.replace(location.pathname + '?fresh=' + Date.now());
  },

  // 지금 돌고 있는 코드가 몇 번째 판인지 보여준다.
  //  '업데이트가 됐나?'를 눈으로 확인할 방법이 없으면 서로 답답해진다.
  async _showBuild() {
    const el = document.getElementById('app-build');
    if (!el) return;
    try {
      const r = await fetch('./sw.js', { cache: 'no-store' });
      const t = await r.text();
      const m = t.match(/cbt-app-(v\d+)/);
      el.textContent = m ? '· ' + m[1] : '';
    } catch (e) { el.textContent = ''; }
  },

  openSettings() {
    const ov = document.getElementById('settings-overlay');
    if (ov) ov.classList.remove('hidden');
    this._showBuild();
    // 계정 칸은 열 때마다 다시 그린다 — 다른 화면에서 로그인/로그아웃했을 수 있다
    if (window.Account) window.Account.render();
    // 설정 화면도 초기 아이콘 심기 대상이 아니어서, 열 때 한 번 채운다
    if (ov) this.hydrateInlineIcons(ov);
    if (window.Sfx) window.Sfx.play('pop');
  },

  closeSettings() {
    const ov = document.getElementById('settings-overlay');
    if (ov) ov.classList.add('hidden');
    if (window.Sfx) window.Sfx.play('close');
  },

  // 채팅 도구 더보기 메뉴 (검색·상담사 바꾸기·내보내기·초기화)
  toggleChatMenu(e) {
    if (e) e.stopPropagation();
    const m = document.getElementById('chat-more-menu');
    if (!m) return;
    const willShow = m.classList.contains('hidden');
    m.classList.toggle('hidden');
    // 채팅 탭은 초기 아이콘 심기 대상이 아니어서, 메뉴를 열 때 한 번 채운다
    this.hydrateInlineIcons(m);
    if (willShow) {
      setTimeout(() => {
        const close = ev => {
          if (!m.contains(ev.target)) m.classList.add('hidden');
          document.removeEventListener('click', close);
        };
        document.addEventListener('click', close);
      }, 0);
    }
  },

  updateLastActiveTime() {
    if (window.Storage) {
      window.Storage._safeSet('cbt_last_active_time', Date.now());
    }
  },

  // "다시 묻지 않기" 체크 상태를 저장한다 (닫기·선택 어느 쪽으로 나가든)
  _savePersonaDontAsk() {
    const cb = document.getElementById('persona-dont-ask');
    if (cb && cb.checked && window.Storage) {
      window.Storage._safeSet('cbt_persona_reprompt_off', true);
    }
  },

  checkInactivityAndPrompt(customTitle = null) {
    // 사용자가 '다시 묻지 않기'를 선택했으면 자동으로 띄우지 않는다
    if (window.Storage && window.Storage._safeGet('cbt_persona_reprompt_off', false)) return false;
    const lastActive = window.Storage ? window.Storage._safeGet('cbt_last_active_time', 0) : 0;
    const elapsedMinutes = lastActive ? (Date.now() - lastActive) / (1000 * 60) : 999;

    // 10분 이상 지났거나 대화 내역이 비어있는 경우 상담사 선택 모달 출력
    if (elapsedMinutes >= 10) {
      const title = customTitle || (lastActive ? '다시 오셨군요! 오늘 마음을 나눌 AI 상담사를 선택해주세요' : '대화할 AI 상담사 선택');
      this.showPersonaModal(false, title);
      return true;
    }
    return false;
  },

  showPersonaModal(force = false, customTitle = null) {
    const modal = document.getElementById('persona-modal');
    const listEl = document.getElementById('persona-card-list');
    if (!modal || !listEl || !window.Personas) return;

    // 온보딩(강제 선택) 모드: 닫기 없이 반드시 한 명을 고르게 한다
    const closeBtn = document.getElementById('persona-modal-close');
    if (closeBtn) closeBtn.style.display = force ? 'none' : '';
    const titleEl = modal.querySelector('h2');
    if (titleEl) titleEl.textContent = customTitle || (force ? '함께할 AI 상담사를 골라주세요' : '대화할 AI 상담사 선택');

    // 아직 한 번도 고른 적 없으면(온보딩) '현재 상담사' 표시를 하지 않는다
    const activeId = window.Personas.hasChosen() ? window.Personas.getActive().id : null;
    listEl.innerHTML = '';
    window.Personas.list.forEach(p => {
      const card = document.createElement('div');
      const isActive = p.id === activeId;
      card.style.cssText = `border: 2px solid ${isActive ? p.color : 'var(--glass-border)'}; border-radius: 14px; padding: 0.95rem; cursor: pointer; background: ${isActive ? `color-mix(in srgb, ${p.color} 10%, var(--bg-secondary))` : 'var(--bg-secondary)'}; transition: all 0.2s ease; box-shadow: var(--shadow-sm);`;
      card.innerHTML = `
        <div style="display: flex; gap: 0.8rem; align-items: center;">
          <span style="flex-shrink: 0;">${window.Personas.avatarSvg(p.id, 52)}</span>
          <div style="flex: 1 1 130px; min-width: 0;">
            <div style="font-weight: 800; font-size: 1.02rem; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; flex-wrap: wrap;">
              <span>${p.name}</span>
              ${isActive ? `<span style="font-size:0.72rem; background: color-mix(in srgb, ${p.color} 20%, transparent); color: ${p.color}; padding: 0.15rem 0.5rem; border-radius: 999px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">● 현재 활성 상담사</span>` : ''}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">${p.tagline}</div>
          </div>
        </div>
        ${p.method ? `
        <div style="margin-top: 0.55rem; border-radius: 12px; background: color-mix(in srgb, ${p.color} 7%, var(--bg-tertiary)); border: 1px solid color-mix(in srgb, ${p.color} 22%, transparent); padding: 0.7rem 0.8rem;">
          <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.35rem;">
            <span style="flex-shrink: 0; white-space: nowrap; font-size: 0.66rem; font-weight: 800; color: #fff; background: ${p.color}; padding: 0.16rem 0.55rem; border-radius: 999px;">${p.method}</span>
            ${p.lesson ? `<span style="flex-shrink: 0; white-space: nowrap; font-size: 0.64rem; font-weight: 800; color: ${p.color}; border: 1px solid color-mix(in srgb, ${p.color} 45%, transparent); padding: 0.14rem 0.5rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.22rem;">${p.lessonIcon && window.Icons ? window.Icons.svg(p.lessonIcon, { size: 13, line: p.color }) : ''}${p.lesson} 코스</span>` : ''}
          </div>
          <p style="margin: 0 0 0.45rem; font-size: 0.74rem; color: var(--text-secondary); line-height: 1.55;">${p.why || ''}</p>
          <ol style="margin: 0; padding-left: 1.05rem; font-size: 0.72rem; color: var(--text-secondary); line-height: 1.65;">
            ${(p.howto || []).map(h => `<li>${h}</li>`).join('')}
          </ol>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.55rem; padding-top: 0.4rem; border-top: 1px dashed var(--glass-border);">
          <span style="font-size: 0.74rem; color: var(--text-muted); flex: 1 1 11rem; min-width: 0;"><b>이럴 때:</b> ${p.fit}</span>
          <button class="btn-primary" style="font-size: 0.76rem; padding: 0.35rem 0.85rem; border-radius: var(--radius-full); width: auto; flex-shrink: 0; background: ${p.color}; border: none;">${isActive ? '대화 계속하기 ›' : '상담사 선택 ›'}</button>
        </div>`;
      card.addEventListener('click', () => this.selectPersona(p.id));
      listEl.appendChild(card);
    });
    modal.classList.remove('hidden');
    if (window.Sfx) window.Sfx.play('pop');
  },

  // 상담사별 첫 인사 (선택 직후와 대화 초기화 때 사용)
  personaGreetings: {
    woorung: '안녕하세요, 우렁의사예요. 저는 그날 마음 상태에 맞춰 생각 정리(CBT)·감정 진정(DBT)·마음챙김(MBCT)을 골라 쓰는 통합 상담사예요. ||| 사용법은 간단해요 — 오늘 있었던 일이든 고민이든, 카톡하듯 편하게 말해주세요. 방향은 제가 잡을게요.',
    haru: '안녕! 나는 생각 교정 전문(CBT) 햇님이야. ||| 속상했던 장면을 구체적으로 말해주면, 그 순간 스친 생각을 붙잡아서 진짜 사실인지 같이 검증해줘. "다 내 잘못이야" 같은 생각이 맴돌 때 나한테 와. ||| 차근차근 배우고 싶으면 이 코스로 시작해도 좋아. [그림:수업카드]',
    dalnim: '…안녕하세요, 달님이에요. 여기는 어디에도 못 버린 마음을 쏟아내는 곳이에요. ||| 미움도, 욕도, 찌질한 생각도 다듬지 말고 그냥 쏟아내세요. 놀라지 않아요. 판단하지 않아요. 고치려 들지도 않아요. 그냥 끝까지 듣고, 당신 편에 있을게요. ||| 오늘 쌓인 걸 바닥까지 비우고 싶은 날엔, 이걸로 시작하셔도 좋아요. [그림:수업카드]',
    sonamu: '반갑습니다, 소나무입니다. 저는 수용전념(ACT)과 마음챙김(MBCT)을 함께 쓰는 상담사예요 — 괴로운 생각과 싸우는 대신 한 발 떨어져 바라보고, 호흡으로 지금 이 순간에 닻을 내리고, 내가 원하는 삶의 방향으로 걷게 돕습니다. ||| 없애고 싶은 생각이 있거나 머리가 시끄럽다면 말해보세요. 싸움을 멈추는 것부터 함께합니다. ||| 체계적으로 배우고 싶다면, 이 코스로 시작하셔도 좋습니다. [그림:수업카드]'
  },

  // 영어/일본어 모드용 첫 인사
  personaGreetingsAlt: {
    en: {
      woorung: "Hi, I'm Dr. Woorung! I'll be right here with you. How's your heart today?",
 haru:"Hey! I'm Haetnim Got any gloomy thoughts? Let's dry them out in the sun together.",
      dalnim: "...Hello, I'm Dalnim. You don't have to be 'fine' here. Pour it all out — I'll hold every bit of it.",
      sonamu: "Welcome, I'm Sonamu. Take one slow breath... and let's begin, gently."
    },
    ja: {
      woorung: "こんにちは、ウロン先生です。今日の心はどうですか？ゆっくり話しましょう。",
 haru:"やっほー！ヘッニムだよ 心にかかった曇り、一緒にお日さまに当てて乾かそう。",
      dalnim: "…こんにちは、タルニムです。ここではいい人のふりをしなくて大丈夫。全部、受け止めますよ。",
      sonamu: "ようこそ、ソナムです。ひと呼吸おいて…ゆっくり始めましょうか。"
    }
  },

  _showPersonaGreeting(id) {
    const L = window.Storage._safeGet('cbt_lang', 'ko');
    const text = (L !== 'ko' && this.personaGreetingsAlt[L] && this.personaGreetingsAlt[L][id])
      || this.personaGreetings[id] || this.personaGreetings.woorung;
    // '|||' 는 말풍선을 나누라는 내부 기호다. 통째로 뿌리면 화면에 그대로 노출된다.
    const parts = String(text).split('|||').map(t => t.trim()).filter(Boolean);
    // 인사말에 [그림:수업카드] 가 있으면 그 자리에서 상담 카드 말풍선으로 갈라놓는다
    const msgs = [];
    parts.forEach(t => {
      const viz = [];
      const body = t.replace(window.ChatViz ? window.ChatViz.RX : /\[그림:\s*([^\]]+)\]/g, (m, b) => {
        const v = window.ChatViz ? window.ChatViz.parse(b) : null;
        if (v) { if (!v.args.length && v.type === '수업카드') v.args = [id]; viz.push(v); }
        return '';
      }).trim();
      if (body) msgs.push({ role: 'bot', text: body, persona: id });
      viz.forEach(v => msgs.push({ role: 'bot', viz: v, persona: id, text: '' }));
    });
    msgs.forEach((m, i) => {
      const msg = { ...m, timestamp: new Date(Date.now() + i).toISOString() };
      window.Storage.saveMessage(msg);
      setTimeout(() => this.displayMessage(msg), i * 450);
    });
    if (window.Voice) window.Voice.speak(msgs.map(m => m.text).filter(Boolean).join(' '), id);
  },

  selectPersona(id) {
    if (!window.Personas) return;
    this._savePersonaDontAsk();
    const isFirstChoice = !window.Personas.hasChosen();
    const prev = window.Personas.getActive() ? window.Personas.getActive().id : null;
    window.Personas.setActive(id);
    this.renderPersonaBar();
    const modal = document.getElementById('persona-modal');
    if (modal) modal.classList.add('hidden');
    const closeBtn = document.getElementById('persona-modal-close');
    if (closeBtn) closeBtn.style.display = '';

    // 활성 시간 갱신
    this.updateLastActiveTime();

    // 챗봇 탭으로 화면 전환 (선택 후 바로 입장)
    this.switchTab('chat', true);

    const messages = window.Storage ? window.Storage.getMessages() : [];
    if (isFirstChoice || prev !== id || !messages || messages.length === 0) {
      this._showPersonaGreeting(id);
    }
  },

  // 첫 진입 온보딩: 상담사를 고른 적이 없으면 선택부터 하게 한다
  maybeForcePersonaChoice() {
    if (!window.Personas || window.Personas.hasChosen()) return false;
    const disclaimer = document.getElementById('disclaimer-modal');
    // 이용 안내 모달이 떠 있으면, 안내 확인 후에 이어서 뜨도록 미룬다
    if (disclaimer && !disclaimer.classList.contains('hidden')) return true;
    this.showPersonaModal(true);
    return true;
  },

  // renderPersonaBar의 별칭 (홈 화면 빠른 선택에서 이 이름으로 호출됨)
  updatePersonaBar() {
    this.renderPersonaBar();
  },

  // ==========================================================================
  //  조용한 알림 — 사고 기록 등이 생기면 대화를 끊지 않고 토스트 + 탭 배지로
  // ==========================================================================
  showRecordToast(text, sfx = 'toast') {
    let toast = document.getElementById('record-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'record-toast';
      toast.style.cssText = 'position: fixed; top: 14px; left: 50%; transform: translateX(-50%) translateY(-90px); z-index: 10000; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid color-mix(in srgb, var(--accent-primary) 45%, transparent); box-shadow: 0 8px 24px rgba(0,0,0,0.16); border-radius: 999px; padding: 0.55rem 1.05rem; font-size: 0.82rem; font-weight: 600; display: flex; align-items: center; gap: 0.45rem; cursor: pointer; transition: transform 0.35s ease; max-width: 90vw; white-space: nowrap;';
      toast.addEventListener('click', () => {
        this.switchTab('dashboard');
        toast.style.transform = 'translateX(-50%) translateY(-90px)';
      });
      document.body.appendChild(toast);
    }
 const miniSticker = window.Stickers ? window.Stickers.svg('joy', 30) :'';
    toast.innerHTML = `<span style="line-height:0; flex-shrink:0;">${miniSticker}</span> <span></span> <span style="color: var(--accent-primary); font-weight: 800;">대시보드 ›</span>`;
    toast.querySelectorAll('span')[1].textContent = text;
    if (sfx && window.Sfx) window.Sfx.play(sfx);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; });
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(-90px)'; }, 5000);
    this._setNavBadge('dashboard', true);
  },

  // === 기기 고유 ID — 서버(채팅·예약·수신함)가 나를 알아보는 기준 ===
  // 별명은 표시용일 뿐, 식별은 이 ID로 한다. 별명을 바꿔도 동기화가 안 끊긴다.
  // 상담사 앱(우렁의사 프로)은 별도 앱·별도 도메인이다.
  //  운영 도메인이면 pro.neurumind.com, 로컬·미리보기면 같은 서버의 pro/ 폴더.
  // 전화번호는 숫자만 쳐도 하이픈이 붙게 한다.
  //  02 는 지역번호가 두 자리이고 15xx/16xx/18xx 대표번호는 지역번호가 없다.
  //  전부 3-4-4 로 밀면 02-312-4711 이 023-1247-11 로 깨진다.
  formatTel(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.startsWith('02')) {                        // 서울
      if (d.length <= 2) return d;
      if (d.length <= 5) return d.slice(0, 2) + '-' + d.slice(2);
      if (d.length <= 9) return d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5);
      return d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6, 10);
    }
    if (/^1[5678]/.test(d)) {                        // 1588-1234 대표번호
      if (d.length <= 4) return d;
      return d.slice(0, 4) + '-' + d.slice(4, 8);
    }
    if (d.length <= 3) return d;                     // 010 / 031 / 070 …
    if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length <= 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  },

  // 입력칸에 물려준다.
  //  백스페이스로 하이픈을 지웠을 때 그 자리에 하이픈을 다시 넣으면
  //  영원히 지울 수 없게 된다 — 그때는 앞 숫자 한 자리를 대신 지운다.
  autoHyphenTel(el) {
    if (!el || el._telBound) return;
    el._telBound = true;
    let prevDigits = el.value.replace(/\D/g, '');
    let prevLen = el.value.length;
    const run = () => {
      let d = el.value.replace(/\D/g, '');
      if (el.value.length < prevLen && d === prevDigits) d = d.slice(0, -1);
      el.value = this.formatTel(d);
      prevDigits = el.value.replace(/\D/g, '');
      prevLen = el.value.length;
    };
    el.addEventListener('input', run);
    el.addEventListener('blur', run);
  },

  proAppUrl() {
    const h = location.hostname;
    if (/(^|\.)neurumind\.com$/.test(h)) return 'https://pro.neurumind.com/';
    if (/\.pages\.dev$/.test(h)) return 'https://neurumind-pro.pages.dev/';
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'pro/index.html';
  },

  clientId() {
    let id = window.Storage._safeGet('cbt_client_id', null);
    if (!id) {
      id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      window.Storage._safeSet('cbt_client_id', id);
    }
    return id;
  },

  // === 스티커 팝 — 우렁이가 화면 가운데 폴짝 나타났다 사라지는 리액션 ===
  stickerPop(name, ms = 1400) {
    if (!window.Stickers) return;
    const old = document.getElementById('sticker-pop');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'sticker-pop';
    el.style.cssText = 'position: fixed; left: 50%; top: 42%; transform: translate(-50%,-50%) scale(0.4); z-index: 10009; pointer-events: none; opacity: 0; transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s; line-height: 0; filter: drop-shadow(0 10px 24px rgba(0,0,0,0.25));';
    const pid = window.Personas ? window.Personas.getActive().id : 'woorung';
    el.innerHTML = window.Stickers.svgFor ? window.Stickers.svgFor(pid, name, 150) : window.Stickers.svg(name, 150);
    document.body.appendChild(el);
    if (window.Sfx) window.Sfx.play('appear');
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1)'; });
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translate(-50%,-50%) scale(0.7)'; setTimeout(() => el.remove(), 300); }, ms);
  },

  // 알림 종류별 on/off (설정 > 알림 받기)
  _notifOn(key) {
    return window.Storage._safeGet('cbt_notif_' + key, true) !== false;
  },

  // 마이탭 프로필 헤더 — 이름·레벨·스트릭
  renderMyHero() {
    const nameEl = document.getElementById('my-name');
    const subEl = document.getElementById('my-sub');
    if (!nameEl || !subEl) return;
    const name = window.Storage._safeGet('cbt_user_name', '') || '';
    nameEl.textContent = name ? name + ' 님' : '이름을 알려주세요';
    const lv = window.Growth ? window.Growth.level() : 1;
    const streak = (window.Storage.getStreak && window.Storage.getStreak()) || 0;
    const info = window.Growth ? window.Growth.levelInfo(lv) : null;
 subEl.innerHTML ='Lv.'+ lv + (info ?''+ info.name :'') + (streak >= 2 ?'·'+ streak +'일 연속':'');
    const ava = document.querySelector('.my-hero__ava');
    if (ava && window.Stickers && info) ava.innerHTML = window.Stickers.svg(info.sticker, 62);
  },

  // data-ic="아이콘명" 이 붙은 요소 앞에 라인 아이콘을 심는다
  hydrateInlineIcons(root) {
    if (!window.Icons) return;
    (root || document).querySelectorAll('[data-ic]').forEach(el => {
      if (el.dataset.icDone) return;
      const svg = window.Icons.svg(el.dataset.ic, { size: parseInt(el.dataset.icSize || '15', 10) });
      if (!svg) return;
      el.insertAdjacentHTML('afterbegin', svg);
      el.dataset.icDone = '1';
    });
  },

  // 서재 책장 — 한 번에 한 칸만 펼친다
  toggleLib(id, btn) {
    const target = document.getElementById(id);
    if (!target) return;
    const wasOpen = !target.classList.contains('hidden');
    document.querySelectorAll('#gv-letter .lib-body').forEach(b => b.classList.add('hidden'));
    document.querySelectorAll('#gv-letter .lib-chev').forEach(c => { c.style.transform = ''; });
    if (!wasOpen) {
      target.classList.remove('hidden');
      const chev = btn && btn.querySelector('.lib-chev');
      if (chev) chev.style.transform = 'rotate(90deg)';
      if (window.Sfx) window.Sfx.play('nav');
    }
  },

  // 옷을 갈아입으면 화면에 이미 그려진 우렁이들을 전부 다시 그린다
  refreshAllStickers(root) {
    if (!window.Stickers) return;
    (root || document).querySelectorAll('[data-sticker]').forEach(el => {
      el.innerHTML = window.Stickers.svg(
        el.getAttribute('data-sticker'),
        parseInt(el.getAttribute('data-sticker-size') || '96', 10)
      );
    });
  },

  // === 시스템 알림 (채팅 도착 등) — 안드로이드 크롬은 SW 경유가 필수 ===
  //  act: 알림을 눌렀을 때 갈 곳('breath'|'night'|'calm'|'chat'|'mypage'|'dashboard')
  notify(title, body, act) {
    // 알림함에는 무조건 쌓는다. 권한을 안 줬거나 알림을 쓸어 넘겨도
    //  우렁이가 한 말이 사라지면 안 되기 때문에, 권한 검사보다 앞에 둔다.
    if (window.Inbox) window.Inbox.add(title, body, act);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, icon: 'icon.png', badge: 'icon.png', vibrate: [120, 60, 120], tag: 'woorung-chat', renotify: true, data: { act: act || '' } };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.showNotification) reg.showNotification(title, opts);
          else new Notification(title, opts);
        }).catch(() => { try { new Notification(title, opts); } catch (e) {} });
        return;
      }
      new Notification(title, opts);
    } catch (e) {}
  },

  _setNavBadge(tab, on) {
    const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (!nav) return;
    let dot = nav.querySelector('.nav-badge-dot');
    if (on && !dot) {
      dot = document.createElement('span');
      dot.className = 'nav-badge-dot';
      dot.style.cssText = 'position: absolute; top: 5px; right: 24%; width: 8px; height: 8px; border-radius: 50%; background: #e05d5d;';
      nav.style.position = 'relative';
      nav.appendChild(dot);
    } else if (!on && dot) {
      dot.remove();
    }
  },

  // ==========================================================================
  //  먼저 말 걸기 (체크인) — 상담사가 친구처럼 먼저 안부를 묻는다
  // ==========================================================================
  initCheckins() {
    const cnt = window.Storage._safeGet('cbt_checkin_count', 5);
    const mode = window.Storage._safeGet('cbt_checkin_mode', 'random');
    const times = window.Storage._safeGet('cbt_checkin_times', '');
    const selCnt = document.getElementById('setting-checkin-count');
    const selMode = document.getElementById('setting-checkin-mode');
    const inpTimes = document.getElementById('setting-checkin-times');

    if (selCnt) {
      selCnt.value = String(cnt);
      selCnt.addEventListener('change', () => {
        window.Storage._safeSet('cbt_checkin_count', parseInt(selCnt.value, 10) || 0);
        window.Storage._safeSet('cbt_checkin_slots_date', ''); // 슬롯 재계산
      });
    }
    if (selMode) {
      selMode.value = mode;
      if (inpTimes) inpTimes.classList.toggle('hidden', mode !== 'fixed');
      selMode.addEventListener('change', () => {
        window.Storage._safeSet('cbt_checkin_mode', selMode.value);
        if (inpTimes) inpTimes.classList.toggle('hidden', selMode.value !== 'fixed');
        window.Storage._safeSet('cbt_checkin_slots_date', '');
      });
    }
    if (inpTimes) {
      inpTimes.value = times;
      inpTimes.addEventListener('change', () => {
        window.Storage._safeSet('cbt_checkin_times', inpTimes.value);
        window.Storage._safeSet('cbt_checkin_slots_date', '');
      });
    }

    // 알림 권한 요청 (기능이 켜져 있을 때만, 조용히)
    if (cnt > 0 && 'Notification' in window && Notification.permission === 'default') {
      setTimeout(() => { try { Notification.requestPermission(); } catch (e) {} }, 3000);
    }

    this._checkinTick();
    // /api 를 어디로 보낼지 미리 재 둔다. 사용자가 뭘 누른 뒤에 재면
    //  그 첫 동작만 300ms 넘게 느려진다 (운영자 콘솔 로그인이 특히 그랬다).
    if (window.Api && window.Api.warmup) window.Api.warmup();
    setInterval(() => this._checkinTick(), 60 * 1000);
  },

  // 오늘의 말 걸기 시간표 (랜덤이면 9~21시 사이에서 매일 새로 뽑는다)
  _todayCheckinSlots() {
    const cnt = window.Storage._safeGet('cbt_checkin_count', 5);
    if (!cnt) return [];
    const todayStr = (function(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})(); // 로컬 날짜 (UTC 자정 버그 방지)
    if (window.Storage._safeGet('cbt_checkin_slots_date', '') !== todayStr) {
      let slots = [];
      if (window.Storage._safeGet('cbt_checkin_mode', 'random') === 'fixed') {
        slots = String(window.Storage._safeGet('cbt_checkin_times', ''))
          .split(',').map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}$/.test(s)).slice(0, cnt);
      }
      if (slots.length === 0) {
        const set = new Set();
        let guard = 0;
        while (set.size < cnt && guard++ < 100) {
          const h = 9 + Math.floor(Math.random() * 12);
          const m = Math.floor(Math.random() * 60);
          set.add(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
        }
        slots = [...set].sort();
      }
      window.Storage._safeSet('cbt_checkin_slots_date', todayStr);
      window.Storage._safeSet('cbt_checkin_slots', slots);
      window.Storage._safeSet('cbt_checkin_fired', []);
    }
    return window.Storage._safeGet('cbt_checkin_slots', []);
  },

  // 상담사 마켓 서버(/api/*)가 살아 있는가.
  //  정적 호스팅만으로 배포된 빌드에는 이 엔드포인트들이 없다. 그런데도 60초마다
  //  폴링하면 기기가 하루 1,440번 404 를 받으며 배터리와 데이터를 계속 쓴다.
  //  한 번 없다고 확인되면 30분 쉬었다가 다시 확인한다 (나중에 서버가 붙어도 복구되도록).
  _serverOk: undefined,
  _serverDownUntil: 0,
  _serverProbing: false,

  async _serverAvailable() {
    if (this._serverOk === true) return true;
    if (Date.now() < this._serverDownUntil) return false;
    if (this._serverProbing) return false;
    this._serverProbing = true;
    try {
      const r = await window.Api.f('/api/presence');
      this._serverOk = !!r.ok;
      if (!r.ok) this._serverDownUntil = Date.now() + 30 * 60 * 1000;
      return this._serverOk;
    } catch (e) {
      this._serverOk = false;
      this._serverDownUntil = Date.now() + 30 * 60 * 1000;
      return false;
    } finally {
      this._serverProbing = false;
    }
  },

  async _checkinTick() {
    try {
      this._bookingReminderTick(); // 예약 30분 전 알림 (로컬)
      this._noshowTick();          // 예약 미진행 확인·환불 (로컬)
      // 서버가 있을 때만 도는 것들 — 없으면 조용히 건너뛴다
      if (await this._serverAvailable()) {
        this._hchatBgTick();       // 채팅창을 닫아둬도 상담사 답장 수신
        this._bookingSyncTick();   // 상담사가 예약을 거절했는지 동기화
        this._callQueueTick();     // 바로상담 대기열 — 회선 비면 알림
        this._reviewReplyTick();   // 상담사 리뷰 답글 수신
        this._homeworkTick();      // 상담사가 낸 숙제 수신 → 퀘스트로
      }
      if (window.Weekly) window.Weekly.autoDeliver(); // 일요일 밤 주간 편지 자동 배달
      this._actionCheckinTick();   // 밤에 딱 한 번, 지금 필요한 '행동'을 권한다
      const slots = this._todayCheckinSlots();
      if (!slots.length) return;
      const fired = window.Storage._safeGet('cbt_checkin_fired', []);
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const due = slots.find(s => {
        if (fired.includes(s)) return false;
        const parts = s.split(':');
        const t = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        return nowMin >= t && nowMin - t <= 90; // 슬롯 후 90분 안에 앱을 열면 전달
      });
      if (!due) return;
      fired.push(due);
      window.Storage._safeSet('cbt_checkin_fired', fired);
      await this._sendCheckin();
    } catch (e) {}
  },

  // ==========================================================================
  //  알림 탭 → 기능 이동
  //   앱이 이미 떠 있으면 서비스워커가 postMessage 로 알려주고,
  //   꺼져 있었으면 새 창이 '#act=breath' 를 달고 열린다. 두 길 모두 받는다.
  // ==========================================================================
  _initNotifRouting() {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.addEventListener) {
        navigator.serviceWorker.addEventListener('message', (e) => {
          const d = e && e.data;
          if (d && d.type === 'notif-act' && d.act && window.Inbox) window.Inbox.runAct(d.act);
        });
      }
    } catch (e) {}

    // 새로 열린 창: 해시로 받은 목적지를 실행하고 주소는 깨끗이 지운다
    try {
      const m = /(?:^|[#&])act=([a-z]+)/.exec(location.hash || '');
      if (m) {
        const act = m[1];
        history.replaceState(null, '', location.pathname + location.search);
        setTimeout(() => { if (window.Inbox) window.Inbox.runAct(act); }, 400);
      }
    } catch (e) {}
  },

  // ==========================================================================
  //  맞춤 행동 알림 — "말"이 아니라 "지금 할 것"을 하나만 권한다
  //   말 걸기 체크인은 대화를 열지만, 밤에 필요한 건 대화보다 행동일 때가 많다.
  //   불안이 높으면 호흡을, 하루가 정리되지 않았으면 하루 정리를 권한다.
  //   하루 한 번 · 21시~자정 · 앱이 열려 있을 때만. 자기 전이므로 조용히 보낸다
  //   (playWoorung 호출 안 함 — 진동·소리는 notify 안의 것으로 충분하다).
  // ==========================================================================
  _actionCheckinTick() {
    if (!window.Storage) return;
    const now = new Date();
    const h = now.getHours();
    if (h < 21) return; // 21:00~23:59 만
    const today = now.toLocaleDateString('sv-CA');
    if (window.Storage._safeGet('cbt_action_checkin_date', '') === today) return;

    // 상담사 숙제가 밀려 있으면 그게 최우선이다 —
    //  사람이 낸 과제를 앱이 잊게 두면 상담 연계 전체가 흐지부지된다.
    try {
      const hw = (window.Homework && window.Homework.open()) || [];
      if (hw.length) {
        window.Storage._safeSet('cbt_action_checkin_date', today);
        const h = hw[0];
        this.notify(h.counselor || '상담사', `숙제가 기다리고 있어요 — "${String(h.text).slice(0, 40)}"`, 'home');
        return;
      }
    } catch (e) {}

    // --- 지금 상태 읽기 ---
    // 불안: GAD-7 (0~21). 21점 만점의 1/3(≈7점, '가벼운 불안'의 위쪽)부터 높다고 본다.
    let anxious = false;
    try {
      const sc = window.Assess && window.Assess.scores ? window.Assess.scores() : null;
      if (sc && sc.gad != null && sc.gad / 21 >= 0.33) anxious = true;
    } catch (e) {}

    // 보조 신호: 최근 3일 기분 체크인 평균이 낮으면 마음이 가라앉아 있는 것으로 본다
    let low = false;
    try {
      const from = Date.now() - 3 * 24 * 3600 * 1000;
      const recent = (window.Storage._safeGet('cbt_mood_log', []) || [])
        .filter(m => m && m.ts >= from && typeof m.v === 'number');
      if (recent.length) {
        low = recent.reduce((s, m) => s + m.v, 0) / recent.length < 2.6;
      }
    } catch (e) {}

    if (anxious) {
      window.Storage._safeSet('cbt_action_checkin_date', today);
      this.notify('우렁이', '자기 전에 3분 호흡 어때요? 몸이 먼저 편해져요', 'breath');
      return;
    }

    // 오늘 하루 정리를 이미 했으면 굳이 부르지 않는다
    const doneToday = (window.Storage._safeGet('cbt_night_journal', []) || [])
      .some(j => j && j.ts && new Date(j.ts).toLocaleDateString('sv-CA') === today);
    if (doneToday) return;

    window.Storage._safeSet('cbt_action_checkin_date', today);
    this.notify('우렁이', low
      ? '오늘 좀 무거웠죠? 자기 전 3분만 같이 정리해요'
      : '오늘 하루는 어땠어요? 자기 전 3분만 같이 정리해요', 'night');
  },

  async _sendCheckin() {
    if (!window.LLM || !window.Storage) return;
    // 구독/체험이 아닐 땐 먼저 말 걸기도 조용히 쉰다
    if (window.Subscription && !window.Subscription.hasAccess()) return;
    // 사용자가 방금까지 대화 중이었다면 끼어들지 않는다
    const msgs = window.Storage.getMessages() || [];
    const last = msgs[msgs.length - 1];
    if (last && Date.now() - new Date(last.timestamp).getTime() < 10 * 60 * 1000) return;

    const memory = (window.Storage.getUserMemory && window.Storage.getUserMemory()) || '';
    const persona = window.Personas ? window.Personas.getActive() : { id: 'woorung', name: '우렁의사' };
    const userName = window.Storage._safeGet('cbt_user_name', '');

    const prompt = `당신은 상담사 '${persona.name}'입니다. 지금 사용자에게 '당신이 먼저' 안부 메시지를 보내는 상황입니다.
[장기기억] 속 과거 대화 내용을 바탕으로, 진짜 친구가 먼저 카톡 보내듯 짧게 1~2문장으로 말을 거세요.
최고의 안부는 그 사람의 삶을 기억하는 안부입니다:
· 감정의 후속: "우울한 건 좀 괜찮아?", "어제보다 마음 좀 가벼워?"
· 일상의 후속: "강아지랑 산책 갔다왔어?", "그 시그니처 칵테일은 완성됐어?"
· 그냥 친구처럼: "뭐해?", "밥은 먹었어?"
기억에 쓸 만한 것이 없으면 지금 시간대에 맞는 가벼운 안부만. 상담원 멘트 금지. 시스템 이모지(😊 🥺 ❤️ 같은 것)는 한 개도 쓰지 마세요 — 우렁이의 표정은 전용 스티커로만 표현합니다. 메시지 본문만 출력하세요.
${(() => { const L = window.Storage._safeGet('cbt_lang', 'ko'); return L === 'en' ? 'Write the message in casual, natural English.' : L === 'ja' ? 'メッセージは自然でカジュアルな日本語で書いてください。' : ''; })()}
${userName ? `사용자 이름: ${userName}` : ''}
[현재 시각] ${new Date().toLocaleString('ko-KR')}
[장기기억]
${memory || '(없음)'}`;

    try {
      const res = await window.LLM._chatCompletion({
        model: window.LLM.MODEL_LIGHT || window.LLM.MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 150
      });
      if (!res.ok) return;
      const data = await res.json();
      // 프롬프트로 금지해도 모델은 흘린다. 화면에 나가기 전에 코드로 막는다.
      //  (전에는 프롬프트가 '이모지 최대 1개'라고 허용까지 하고 있었다)
      const raw = ((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim().replace(/^"|"$/g, '');
      const text = (window.LLM && window.LLM._stripEmoji) ? window.LLM._stripEmoji(raw).trim() : raw;
      if (!text) return;

      const msg = { role: 'bot', text, timestamp: new Date().toISOString() };
      this.displayMessage(msg);
      window.Storage.saveMessage(msg);
      this.playWoorung(); // "우렁!" + 진동
      if (window.Voice) window.Voice.speak(text, persona.id);
      this.notify(persona.name, text, 'chat'); // 시스템 알림 (백그라운드에서도 도착) — 누르면 채팅방으로
      if (this.currentTab !== 'chat') this._setNavBadge('chat', true);
    } catch (e) {}
  },

  // ==========================================================================
  //  나의 상담 내역 (실제 예약) + 상담사 등록 신청 현황
  // ==========================================================================
  renderMyBookings() {
    const upEl = document.getElementById('my-bookings');
    const pastEl = document.getElementById('booking-history-full');
    if (!upEl) return;
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const reviews = window.Storage._safeGet('cbt_reviews', {}) || {};
    const now = Date.now();
    // 예약 시간이 지났으면 '상담 완료', 취소된 건 지난 내역으로 분류
    const upcoming = bookings.filter(b => b.status !== 'cancelled' && (!b.whenTs || b.whenTs > now));
    const past = bookings.filter(b => b.status === 'cancelled' || (b.whenTs && b.whenTs <= now));

    if (bookings.length === 0) {
      upEl.innerHTML = `
        <div style="text-align: center; padding: 1.2rem 0.5rem 0.6rem;">
          <span data-sticker="blank" data-sticker-size="72" style="line-height: 0; display: inline-block;"></span>
          <p style="margin: 0.5rem 0 0.7rem; font-size: 0.85rem; color: var(--text-muted);">아직 예약한 상담이 없어요.</p>
          <button class="btn-primary" style="width: auto; font-size: 0.82rem; padding: 0.5rem 1rem;" onclick="window.App.switchTab('counselors')">상담사 둘러보기 ›</button>
        </div>`;
      if (window.Stickers) upEl.querySelectorAll('[data-sticker]').forEach(s => { s.innerHTML = window.Stickers.svg(s.getAttribute('data-sticker'), parseInt(s.getAttribute('data-sticker-size'), 10)); });
      if (pastEl) pastEl.innerHTML = '';
      return;
    }

    upEl.innerHTML = upcoming.map(b => `
      <div style="background: color-mix(in srgb, var(--accent-primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 24%, transparent); border-radius: 12px; padding: 1rem; margin-top: 0.8rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.3rem;">
          <span style="background: var(--accent-primary); color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">예약 확정</span>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${b.price.toLocaleString()}캐시 결제</span>
        </div>
        <h4 class="card-head" style="margin: 0 0 0.2rem 0;"><span class="h-ico" data-icon="counselor" data-icon-size="18"></span>${b.name}</h4>
        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">${b.hospital}</p>
        <div style="margin-top: 0.7rem; font-size: 0.9rem; font-weight: bold; color: var(--text-primary);">
          <span class="h-ico" data-icon="calendar" data-icon-size="17"></span>${b.time}
        </div>
        <div style="margin-top: 0.7rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
          ${b.whenTs && Math.abs(b.whenTs - now) < 3600000
 ?`<button class="btn-primary"style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem;"onclick="window.App.startHumanCall('${b.counselorId}')"> 예약 상담 시작 <span style="font-size: 0.66rem; font-weight: 500;">(30분 정액 · 추가 과금 없음)</span></button>`
 :`<button class="btn-secondary"style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem;"onclick="window.App.startHumanCall('${b.counselorId}')"> 전화 상담</button>`}
 <button class="btn-secondary"style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem;"onclick="window.App.openHumanChat('${b.counselorId}')"> 채팅</button>
 <button class="btn-secondary"style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem;"onclick="window.App.openSharePack('${b.id}')">${(window.Storage._safeGet('cbt_shared_packs', {}) || {})[b.id] ?'자료 전달됨':'상담 자료 보내기'}</button>
          <button class="btn-secondary" style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem; color: #c14a4a;" onclick="window.App.cancelBooking('${b.id}')">예약 취소</button>
        </div>
      </div>`).join('')
      || `<p style="margin: 0.8rem 0 0; font-size: 0.82rem; color: var(--text-muted); text-align: center;">예정된 상담이 없어요. 지난 상담은 [전체 내역 보기]에서 확인하세요.</p>`;

    if (pastEl) {
      pastEl.innerHTML = past.length === 0
        ? `<p style="margin: 0; font-size: 0.8rem; color: var(--text-muted); text-align: center;">완료된 상담이 아직 없어요.</p>`
        : past.map(b => {
          const rv = reviews[b.id];
          const cancelled = b.status === 'cancelled';
          return `
          <div style="background: var(--bg-tertiary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; ${cancelled ? 'opacity: 0.75;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.3rem;">
              ${cancelled
                ? '<span style="background: #e05d5d22; color: #c14a4a; border: 1px solid #e05d5d44; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">취소됨</span>'
                : '<span style="background: var(--text-muted); color: white; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">상담 완료</span>'}
              <span style="font-size: 0.78rem; color: var(--text-muted);">${b.time}</span>
            </div>
            <h4 class="card-head" style="margin: 0 0 0.2rem 0;"><span class="h-ico" data-icon="counselor" data-icon-size="18"></span>${b.name}</h4>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">${b.hospital}</p>
            ${(() => {
              // 상담사가 완료 처리했는데 아직 확인하지 않았다면, 이게 가장 먼저 보여야 한다.
              //  확인해야 상담사에게 정산이 나가고, 3일 뒤엔 자동 확정된다.
              if (cancelled || !b.srvDone) return '';
              if (b.srvDispute) return `
                <div style="margin-top: 0.6rem; padding: 0.6rem 0.75rem; border-radius: 10px;
                            background: rgba(193,74,74,0.08); border: 1px solid rgba(193,74,74,0.25);">
                  <p style="margin: 0; font-size: 0.78rem; color: #c14a4a; line-height: 1.6;">
                    문제를 접수했어요. 운영자가 확인 후 연락드릴게요.</p></div>`;
              if (b.srvConfirmAt) return `
                <p style="margin: 0.55rem 0 0; font-size: 0.78rem; color: var(--accent-primary); font-weight: 700;">
                  상담 확인 완료</p>`;
              const auto = b.srvAutoAt
                ? new Date(b.srvAutoAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
                : '';
              return `
                <div style="margin-top: 0.6rem; padding: 0.7rem 0.8rem; border-radius: 11px;
                            background: color-mix(in srgb, var(--accent-primary) 9%, transparent);
                            border: 1px solid color-mix(in srgb, var(--accent-primary) 26%, transparent);">
                  <p style="margin: 0 0 0.5rem; font-size: 0.82rem; font-weight: 700; color: var(--text-primary);">
                    상담은 어떠셨어요?</p>
                  <p style="margin: 0 0 0.6rem; font-size: 0.74rem; line-height: 1.6; color: var(--text-secondary);">
                    확인하시면 상담사에게 정산이 진행돼요.${auto ? ` 답이 없으면 ${auto}에 자동 확인됩니다.` : ''}</p>
                  <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    <button class="btn-primary" style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem;"
                      onclick="window.App.confirmSession('${b.id}')">잘 받았어요</button>
                    <button class="btn-secondary" style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.85rem; color: #c14a4a;"
                      onclick="window.App.disputeSession('${b.id}')">문제가 있었어요</button>
                  </div>
                </div>`;
            })()}
            <div style="margin-top: 0.7rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${cancelled || b.status === 'noshow'
                ? `<span style="font-size: 0.78rem; color: var(--text-muted);">${b.status === 'noshow' ? '상담 미진행 · ' : b.cancelledBy === 'counselor' ? '상담사 사정으로 취소 · ' : ''}환불 ${(b.refunded || 0).toLocaleString()}캐시 완료</span>`
                : rv
 ?`<span style="font-size: 0.78rem; color: var(--accent-primary); font-weight: 700;">${rv.rating}.0 리뷰 작성 완료</span>`
 :`<button class="btn-primary"style="width: auto; font-size: 0.76rem; padding: 0.35rem 0.8rem;"onclick="window.App.writeReview('${b.id}')"> 리뷰 남기기</button>`}
              <button class="btn-secondary" style="width: auto; font-size: 0.76rem; padding: 0.35rem 0.8rem;" onclick="window.App.switchTab('counselors')">다시 예약</button>
            </div>
 ${(() => { const rep = (window.Storage._safeGet('cbt_review_replies', {}) || {})[b.id]; return rep ?`<p style="margin: 0.55rem 0 0; font-size: 0.78rem; color: var(--text-secondary); background: color-mix(in srgb, var(--accent-primary) 8%, transparent); border-radius: 8px; padding: 0.5rem 0.7rem;"><b>${b.name}</b>의 답글: ${rep.text.replace(/</g,'&lt;')}</p>`:''; })()}
          </div>`;
        }).join('');
    }
  },

  // ==========================================================================
  //  상담 자료 공유 — 예약된 상담사에게 내 기록 요약을 '동의하에' 전달
  //  (서버 연동 전: 공유 시트/클립보드로 상담사에게 직접 전달할 수 있는 텍스트 생성)
  // ==========================================================================
  openSharePack(bookingId) {
    const b = ((window.Storage._safeGet('cbt_bookings', []) || [])).find(x => x.id === bookingId);
    if (!b) return;
    const old = document.getElementById('share-pack-overlay');
    if (old) old.remove();
    const records = (window.Storage.getThoughtRecords() || []).filter(r => !String(r.id).startsWith('rec_mock_'));
    const nights = window.Storage._safeGet('cbt_night_journal', []) || [];
    const reports = window.Storage._safeGet('cbt_my_reports', []) || [];
    const ov = document.createElement('div');
    ov.id = 'share-pack-overlay';
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 400px; max-height: 84vh; overflow-y: auto;">
 <h2 style="margin-top: 0;"> 상담 자료 보내기</h2>
        <p style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.55; margin: 0 0 0.9rem;"><b>${b.name}</b> 상담사에게 전달할 자료를 골라주세요.<br>동의한 항목만 요약본에 담깁니다.</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <label style="display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.85rem; background: var(--bg-tertiary); border-radius: 10px; cursor: pointer; font-size: 0.85rem; color: var(--text-primary);">
            <input type="checkbox" id="sp-records" checked style="accent-color: var(--accent-primary); width: 17px; height: 17px;" ${records.length ? '' : 'disabled'}>
 사고 기록 최근 ${Math.min(records.length, 5)}건 ${records.length ?'':'(없음)'}
          </label>
          <label style="display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.85rem; background: var(--bg-tertiary); border-radius: 10px; cursor: pointer; font-size: 0.85rem; color: var(--text-primary);">
            <input type="checkbox" id="sp-nights" checked style="accent-color: var(--accent-primary); width: 17px; height: 17px;" ${nights.length ? '' : 'disabled'}>
 하루 정리 최근 ${Math.min(nights.length, 7)}건 ${nights.length ?'':'(없음)'}
          </label>
          <label style="display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.85rem; background: var(--bg-tertiary); border-radius: 10px; cursor: pointer; font-size: 0.85rem; color: var(--text-primary);">
            <input type="checkbox" id="sp-report" checked style="accent-color: var(--accent-primary); width: 17px; height: 17px;" ${reports.length ? '' : 'disabled'}>
 AI 상담 요약 리포트 최신 1건 ${reports.length ?'':'(없음)'}
          </label>
          <label style="display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.85rem; background: var(--bg-tertiary); border-radius: 10px; cursor: pointer; font-size: 0.85rem; color: var(--text-primary);">
            <input type="checkbox" id="sp-mood" checked style="accent-color: var(--accent-primary); width: 17px; height: 17px;">
 최근 2주 감정 요약 (평균·자주 나온 감정)
          </label>
        </div>
        <button onclick="window.App.previewSharePack('${bookingId}')"
          style="all: unset; display: block; width: 100%; text-align: center; margin: 0.75rem 0 0; padding: 0.55rem;
                 cursor: pointer; border: 1px dashed var(--glass-border); border-radius: 10px;
                 font-size: 0.79rem; font-weight: 700; color: var(--accent-primary);">
          보낼 내용 그대로 미리보기</button>

        <div style="margin: 0.8rem 0 0; padding: 0.7rem 0.8rem; border-radius: 10px;
                    background: var(--bg-tertiary); border: 1px solid var(--glass-border);">
          <p style="margin: 0 0 0.4rem; font-size: 0.75rem; font-weight: 800; color: var(--text-primary);">보내면 이렇게 됩니다</p>
          <ul style="margin: 0; padding-left: 1rem; font-size: 0.72rem; line-height: 1.7; color: var(--text-secondary);">
            <li>고른 항목의 <b>요약본</b>이 <b>${b.name}</b> 상담사의 수신함으로 전송됩니다.</li>
            <li>대화 원문과 일기 전문은 보내지 않습니다.</li>
            <li>전송된 자료는 상담사가 열람하며, 삭제를 원하면
                <span style="color: var(--text-primary);">nda960327@gmail.com</span> 으로 요청할 수 있습니다.</li>
            <li>보내지 않아도 상담은 정상 진행됩니다.</li>
          </ul>
        </div>

        <div class="form-actions" style="display: flex; gap: 0.5rem; margin-top: 0.8rem;">
          <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('share-pack-overlay').remove()">보내지 않기</button>
          <button class="btn-primary" style="flex: 1;" onclick="window.App.sendSharePack('${bookingId}')">동의하고 보내기</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  },

  // 보낼 요약본을 만드는 곳은 한 군데뿐이다.
  //  미리보기와 실제 전송이 다른 코드를 타면 "보여준 것과 보낸 것"이 어긋나고,
  //  그러면 동의를 받은 의미가 없어진다.
  _buildSharePack(bookingId) {
    const b = ((window.Storage._safeGet('cbt_bookings', []) || [])).find(x => x.id === bookingId);
    if (!b) return null;
    const on = id => { const el = document.getElementById(id); return el && el.checked && !el.disabled; };
    const parts = [`[우렁의사 상담 참고 자료]\n내담자: ${window.Storage._safeGet('cbt_user_name', '') || '(별명 미설정)'} · 상담: ${b.name} (${b.time})\n생성일: ${new Date().toLocaleDateString('ko-KR')}`];

    if (on('sp-mood')) {
      const from = Date.now() - 14 * 86400000;
      const log = (window.Storage._safeGet('cbt_mood_log', []) || []).filter(m => m.ts >= from);
      if (log.length) {
        const avg = log.reduce((s, m) => s + (m.v || 3), 0) / log.length;
        const cnt = {};
        log.forEach(m => { if (m.emo) cnt[m.emo] = (cnt[m.emo] || 0) + 1; });
        const top = Object.entries(cnt).sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([e, c]) => `${e} ${c}회`).join(', ');
        parts.push(`■ 최근 2주 감정\n기록 ${log.length}회 · 평균 ${avg.toFixed(1)}/5\n자주 나온 감정: ${top || '없음'}`);
      }
    }
    if (on('sp-records')) {
      const records = (window.Storage.getThoughtRecords() || []).filter(r => !String(r.id).startsWith('rec_mock_')).slice(0, 5);
      parts.push('■ 사고 기록 (상황 → 자동적 사고 → 대안적 사고)\n' + records.map(r =>
        `· [${new Date(r.date).toLocaleDateString('ko-KR')}] ${r.situation || ''}\n  생각: ${r.thought || ''}\n  대안: ${r.alternative || '(미작성)'}${r.newEmotions ? `\n  감정 변화: ${(r.emotions || []).map(e => `${e.name} ${e.intensity}%`).join(', ')} → ${r.newEmotions}` : ''}`).join('\n'));
    }
    if (on('sp-nights')) {
      const nights = (window.Storage._safeGet('cbt_night_journal', []) || []).slice(0, 7);
      parts.push('■ 하루 정리 (취침 전 회고)\n' + nights.map(j =>
        `· [${new Date(j.ts).toLocaleDateString('ko-KR')}] 기분: ${j.mood ? j.mood.emo : '미기록'}${j.moment ? ` / ${j.moment}` : ''}${j.note ? ` / 스스로에게: ${j.note}` : ''}`).join('\n'));
    }
    if (on('sp-report')) {
      const rep = (window.Storage._safeGet('cbt_my_reports', []) || [])[0];
      if (rep) parts.push(`■ AI 상담 요약 리포트 (${rep.date})\n${(rep.body || '').slice(0, 1200)}`);
    }

    const picked = [
      on('sp-records') && '사고 기록', on('sp-nights') && '하루 정리',
      on('sp-report') && 'AI 요약 리포트', on('sp-mood') && '감정 요약'
    ].filter(Boolean);
    return { b, text: parts.join('\n\n'), picked };
  },

  // 동의 전에 실제로 나갈 글을 그대로 보여준다.
  previewSharePack(bookingId) {
    const p = this._buildSharePack(bookingId);
    if (!p) return;
    window.UI.alert({
      title: '이 내용이 그대로 전달됩니다',
      body: p.text || '(고른 항목이 없어 보낼 내용이 없습니다)',
      okLabel: '닫기'
    });
  },

  sendSharePack(bookingId) {
    const built = this._buildSharePack(bookingId);
    if (!built) return;
    const { b, text, picked } = built;
    if (!picked.length) { window.UI.alert('보낼 항목을 하나 이상 골라주세요'); return; }

    // 무엇에 언제 동의했는지 남긴다 (본인 확인·삭제 요청 때 근거가 된다)
    const consents = window.Storage._safeGet('cbt_share_consents', []) || [];
    consents.unshift({ ts: Date.now(), bookingId, counselor: b.name, items: picked });
    window.Storage._safeSet('cbt_share_consents', consents.slice(0, 50));

    const packs = window.Storage._safeGet('cbt_shared_packs', {}) || {};
    packs[bookingId] = { ts: Date.now(), counselor: b.name, text }; // 원문 보관 — 상담사 수신함(콘솔)에서 열람
    window.Storage._safeSet('cbt_shared_packs', packs);
    // 서버 수신함으로도 전송 — 상담사는 /counselor.html 에서 열람 (오프라인이면 조용히 생략)
    try {
      window.Api.f('/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counselorId: b.counselorId || '',
          counselorName: b.name,
          bookingId,
          clientId: this.clientId(),
          clientName: window.Storage._safeGet('cbt_user_name', '') || '익명',
          text
        })
      }).catch(() => {});
    } catch (e) {}
    const ovEl = document.getElementById('share-pack-overlay');
    if (ovEl) ovEl.remove();
    this.renderMyBookings();

    // 전송은 위에서 이미 끝났다. 아래는 '한 부 더 챙겨두기'일 뿐이므로
    //  문구가 "이제 직접 전달하세요"로 읽히면 안 된다.
    this.showRecordToast(`${b.name} 상담사에게 보냈어요`);
    const copied = () => this.showRecordToast('사본도 클립보드에 담아뒀어요');
    const fallbackShow = () => {};
    if (navigator.share) {
      navigator.share({ title: `[우렁의사] ${b.name} 상담 참고 자료`, text }).catch(() => {
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(copied).catch(fallbackShow);
      });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(copied).catch(fallbackShow);
    } else {
      fallbackShow();
    }
  },

  // 예약 취소 — 안내문 그대로: 24시간 전 전액 환불, 이후 50%, 시작 후 불가
  async cancelBooking(bookingId) {
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const b = bookings.find(x => x.id === bookingId);
    if (!b || b.status === 'cancelled') return;
    const now = Date.now();
    if (b.whenTs && b.whenTs <= now) { window.UI.alert('이미 시작된 상담은 취소할 수 없어요.'); return; }
    const hoursLeft = b.whenTs ? (b.whenTs - now) / 3600000 : 999;
    const refundRate = hoursLeft >= 24 ? 1 : 0.5;
    const refund = Math.round(b.price * refundRate);
    if (!await window.UI.confirm(`${b.name}님과의 예약을 취소할까요?\n[${b.time}]\n\n${hoursLeft >= 24 ? '상담 24시간 전이라 전액 환불돼요.' : '상담 24시간 이내라 50%만 환불돼요.'}\n환불 예정: ${refund.toLocaleString()}캐시`)) return;
    b.status = 'cancelled';
    b.cancelledTs = now;
    b.refunded = refund;
    window.Storage._safeSet('cbt_bookings', bookings);
    if (window.Wallet && refund > 0) window.Wallet.refund(refund, `${b.name} 예약 취소 환불${refundRate < 1 ? ' (50%)' : ''}`);
    // 서버 장부에도 취소 반영 → 상담사 일정에서 '취소됨' 표시
    try { window.Api.f('/api/bookings/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bookingId }) }).catch(() => {}); } catch (e) {}
    this.renderMyBookings();
    this.showRecordToast(`예약이 취소되고 ${refund.toLocaleString()}캐시가 환불됐어요`);
  },

  // === 홈 인사 배너 — 시간대와 오늘의 상태를 읽고 다음 한 걸음을 권한다 ===
  renderHomeGreeting() {
    const el = document.getElementById('home-greeting');
    if (!el) return;   // 홈 인사 배너는 제거됨 — 요소가 없으면 조용히 종료
    const h = new Date().getHours();
    const name = window.Storage._safeGet('cbt_user_name', '');
    const who = name ? `${name} 님` : '당신';
    const today = new Date().toLocaleDateString('sv-CA');

    // 시간대별 기본 인사 + 스티커
    let hello, sticker;
 if (h >= 5 && h < 11) { hello =`좋은 아침이에요, ${who}`; sticker ='joy'; }
    else if (h < 17) { hello = `${who}, 오늘 하루 잘 흘러가고 있나요?`; sticker = 'cheer'; }
 else if (h < 21) { hello =`수고한 저녁이에요, ${who}`; sticker ='tea'; }
 else { hello =`고요한 밤이에요, ${who}`; sticker ='sleepy'; }

    // 오늘 상태를 읽고 '다음 한 걸음' 제안 (우선순위)
    const checkedIn = (window.Storage._safeGet('cbt_mood_log', []) || []).some(m => new Date(m.ts).toLocaleDateString('sv-CA') === today);
    const mission = window.Missions ? window.Missions.todayMission() : null;
    const nightDone = (window.Storage._safeGet('cbt_night_journal', []) || []).some(j => new Date(j.ts).toLocaleDateString('sv-CA') === today);
    const streak = window.Storage.getStreak ? window.Storage.getStreak() : 0;

    let sub, action;
    if (!checkedIn) { sub = '아직 오늘 마음을 안 물어봤네요. 지금 기분 어때요?'; action = null; /* 바로 아래 체크인 카드가 있음 */ }
 else if ((h >= 20 || h < 2) && !nightDone) { sub ='자기 전 3분, 오늘 하루를 같이 정리해볼까요?'; action = { label:'하루 정리하기', fn:"window.Growth && window.Growth.startNight()"}; }
    else if (mission && !mission.done && h >= 9 && h < 21) { sub = `오늘의 미션이 기다리고 있어요 — "${(mission.text || '').slice(0, 24)}…"`; action = null; }
 else if (streak >= 2) { sub =`${streak}일 연속으로 마음을 돌보는 중이에요. 대단해요!`; action = null; }
 else { const cheers = ['오늘도 당신 곁엔 우렁이가 있어요','작은 한 걸음이면 충분한 하루예요','숨 한 번 크게 — 잘하고 있어요']; sub = cheers[Math.floor(Math.random() * cheers.length)]; action = null; }

    el.innerHTML = `
      <div class="glass-card" style="padding: 0.95rem 1.05rem; display: flex; align-items: center; gap: 0.75rem; background: linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary)), var(--bg-secondary));">
        <span style="line-height: 0; flex-shrink: 0;">${(() => {
 if (!window.Stickers) return'';
          // 가끔(15%) 햇님·달님·소나무가 대신 인사한다
          if (Math.random() < 0.15) {
            const friends = ['haru', 'dalnim', 'sonamu'];
            return window.Stickers.svgFor(friends[Math.floor(Math.random() * 3)], sticker, 56);
          }
          return window.Stickers.svg(sticker, 56);
        })()}</span>
        <div style="flex: 1; min-width: 0;">
          <strong style="font-size: 0.95rem; color: var(--text-primary); display: block; font-family: var(--font-heading);">${hello}</strong>
          <span style="font-size: 0.78rem; color: var(--text-secondary);">${sub}</span>
          ${action ? `<button class="btn-primary" style="width: auto; font-size: 0.76rem; padding: 0.35rem 0.8rem; margin-top: 0.45rem;" onclick="${action.fn}">${action.label}</button>` : ''}
        </div>
      </div>`;
  },

  // === 노쇼 확인 — 예약 시간이 지났는데 통화 기록이 없으면 물어본다 ===
  _noshowTick() {
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const now = Date.now();
    if (document.getElementById('noshow-overlay')) return; // 한 번에 하나만
    const target = bookings.find(b =>
      b.status === 'confirmed' && !b.resolved && b.whenTs &&
      b.whenTs + 40 * 60000 < now &&              // 상담 종료 시각 + 여유 지남
      b.whenTs > now - 7 * 86400000 &&            // 너무 오래된 건 묻지 않음
      (!b.askAfter || b.askAfter < now));
    if (!target) return;
    // 통화 기록이 있으면 자동으로 '진행됨' 처리
    const logs = window.Storage._safeGet('cbt_call_logs', []) || [];
    const called = logs.some(l => l.counselorId === target.counselorId && Math.abs(l.ts - target.whenTs) < 90 * 60000);
    if (called) {
      target.resolved = 'done';
      window.Storage._safeSet('cbt_bookings', bookings);
      return;
    }
    const ov = document.createElement('div');
    ov.id = 'noshow-overlay';
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 340px; text-align: center;">
        <span style="line-height: 0; display: inline-block;">${window.Stickers ? window.Stickers.svg('think', 90) : ''}</span>
        <h2 style="margin: 0.6rem 0 0.3rem; font-size: 1.05rem;">${target.name}님과의 상담,<br>잘 진행되었나요?</h2>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 1rem;">[${target.time}] 예약 확인이에요.</p>
        <button class="btn-primary" style="width: 100%; margin-bottom: 0.5rem;" onclick="window.App.resolveNoshow('${target.id}', 'done')">네, 잘 마쳤어요</button>
        <button class="btn-secondary" style="width: 100%; margin-bottom: 0.5rem; color: #c14a4a;" onclick="window.App.resolveNoshow('${target.id}', 'noshow')">상담이 진행되지 않았어요</button>
        <button style="all: unset; font-size: 0.78rem; color: var(--text-muted); cursor: pointer; padding: 0.3rem;" onclick="window.App.resolveNoshow('${target.id}', 'later')">나중에 답할게요</button>
      </div>`;
    document.body.appendChild(ov);
  },

  async resolveNoshow(bookingId, answer) {
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const b = bookings.find(x => x.id === bookingId);
    const ov = document.getElementById('noshow-overlay');
    if (ov) ov.remove();
    if (!b) return;
    if (answer === 'later') {
      b.askAfter = Date.now() + 86400000; // 내일 다시
    } else if (answer === 'done') {
      b.resolved = 'done';
    } else if (answer === 'noshow') {
      if (!await window.UI.confirm('상담이 진행되지 않았다면 전액 환불해드려요.\n환불을 진행할까요?')) { b.askAfter = Date.now() + 86400000; window.Storage._safeSet('cbt_bookings', bookings); return; }
      b.resolved = 'noshow';
      b.status = 'noshow';
      b.refunded = b.price;
      if (window.Wallet) window.Wallet.refund(b.price, `${b.name} 상담 미진행 전액 환불`);
      try { window.Api.f('/api/bookings/noshow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bookingId }) }).catch(() => {}); } catch (e) {}
 this.showRecordToast(`미진행 상담 ${b.price.toLocaleString()}캐시가 전액 환불됐어요`);
      if (this.currentTab === 'mypage') this.renderMyBookings();
    }
    window.Storage._safeSet('cbt_bookings', bookings);
  },

  // === 리뷰 답글 수신 — 상담사가 답글을 달면 알림 ===
  // ── 상담 확인 / 이의 제기 ────────────────────────────────────────────
  //  확인을 눌러야 상담사에게 정산이 나간다. 3일 안에 아무 말이 없으면
  //  자동 확정되므로, 문제가 있었다면 그 전에 알려야 한다는 걸 화면에 적어둔다.
  async confirmSession(bookingId) {
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const b = bookings.find(x => x.id === bookingId);
    if (!b) return;
    if (!await window.UI.confirm({
      title: '상담 잘 받으셨나요?',
      body: `${b.name} 선생님과의 상담을 확인하면 정산이 진행됩니다.\n문제가 있었다면 대신 [문제가 있었어요]를 눌러주세요.`,
      okLabel: '네, 잘 받았어요'
    })) return;
    const r = await window.Api.json('/api/bookings/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId, clientId: this.clientId() })
    });
    if (!r || !r.ok) { window.UI.alert('잠시 후 다시 시도해주세요'); return; }
    b.srvConfirmAt = Date.now();
    window.Storage._safeSet('cbt_bookings', bookings);
    if (window.Sfx) window.Sfx.hit('ripe');
    this.showRecordToast('확인해주셔서 고마워요');
    this.renderMyBookings();
  },

  async disputeSession(bookingId) {
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const b = bookings.find(x => x.id === bookingId);
    if (!b) return;
    const why = await window.UI.prompt({
      title: '무슨 일이 있었나요?',
      body: '운영자가 확인하고 연락드릴게요.\n확인하는 동안 상담사에게 정산이 나가지 않습니다.',
      multiline: true, placeholder: '예: 약속한 시간에 연결되지 않았어요',
      okLabel: '보내기'
    });
    if (why === null || !String(why).trim()) return;
    const r = await window.Api.json('/api/bookings/dispute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookingId, clientId: this.clientId(), why: String(why).trim() })
    });
    if (!r || !r.ok) { window.UI.alert('잠시 후 다시 시도해주세요'); return; }
    b.srvDispute = String(why).trim();
    window.Storage._safeSet('cbt_bookings', bookings);
    window.UI.alert({
      title: '접수했어요',
      body: '운영자가 확인 후 연락드릴게요.\n그때까지 이 상담의 정산은 멈춰 둡니다.'
    });
    this.renderMyBookings();
  },

  // 상담사가 낸 숙제를 받아온다.
  //  Homework.receive() 는 만들어져 있었는데 부르는 곳이 없어서,
  //  상담사가 숙제를 내도 앱까지 오는 다리가 없었다.
  //  들어오면 questSeeds() 를 통해 퀘스트에 섞이고, 챗봇 프롬프트에도 실린다.
  async _homeworkTick() {
    try {
      if (!window.Homework) return;
      const d = await window.Api.json('/api/homework?clientId=' + encodeURIComponent(this.clientId()));
      if (!d || !Array.isArray(d.items)) return;
      const have = new Set((window.Homework.all() || []).map(h => h.srvId || h.id));
      let added = 0;
      d.items.forEach(h => {
        if (have.has(h.id)) return;
        const rec = window.Homework.receive({
          counselorId: h.counselorId, counselor: h.counselor,
          text: h.text, why: h.why, dueAt: h.dueAt
        });
        // 서버 id 를 기억해 둔다 — 완료를 돌려보낼 때와 중복 방지에 쓴다
        if (rec) {
          const list = window.Homework.all();
          const t = list.find(x => x.id === rec.id);
          if (t) { t.srvId = h.id; window.Homework._save(list); }
          added++;
        }
      });
      if (added && window.Missions) window.Missions.renderCard();
    } catch (e) {}
  },

  // 숙제를 마쳤다고 서버에 알린다 (상담사 화면에 결과가 뜬다)
  async syncHomeworkDone(h) {
    try {
      if (!h || !h.srvId) return;
      await window.Api.post('/api/homework/done', {
        id: h.srvId, clientId: this.clientId(), note: h.note || ''
      });
    } catch (e) {}
  },

  async _reviewReplyTick() {
    try {
      const res = await window.Api.f(`/api/reviews?clientId=${encodeURIComponent(this.clientId())}`);
      if (!res.ok) return;
      const items = (await res.json()).items || [];
      const seen = window.Storage._safeGet('cbt_review_replies', {}) || {};
      let changed = false;
      items.forEach(rv => {
        if (rv.reply && (!seen[rv.bookingId] || seen[rv.bookingId].ts !== rv.reply.ts)) {
          seen[rv.bookingId] = { text: rv.reply.text, ts: rv.reply.ts, counselor: rv.counselorName };
          changed = true;
 if (this._notifOn('chat')) { this.notify(`${rv.counselorName}님의 답글`, rv.reply.text); this.playWoorung(); }
 this.showRecordToast(`${rv.counselorName}님이 리뷰에 답글을 남겼어요`);
          this._setNavBadge('mypage', true);
        }
      });
      if (changed) {
        window.Storage._safeSet('cbt_review_replies', seen);
        if (this.currentTab === 'mypage') this.renderMyBookings();
      }
    } catch (e) {}
  },

  // === 바로상담 대기열 — 통화 중이면 줄 서고, 회선이 비면 알림 ===
  joinCallQueue(counselorId) {
    const c = window.Marketplace.getCounselor(counselorId);
    if (!c) return;
    window.Api.f('/api/call/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counselorId: c.id, clientId: this.clientId(), clientName: window.Storage._safeGet('cbt_user_name', '') || '익명' })
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const waits = window.Storage._safeGet('cbt_call_waits', []) || [];
      if (!waits.find(w => w.counselorId === c.id)) waits.push({ counselorId: c.id, name: c.name, ts: Date.now() });
      window.Storage._safeSet('cbt_call_waits', waits);
 this.showRecordToast(`${c.name}님 대기 ${d.position}번째로 등록! 회선이 비면 알려드려요`);
      if (window.Marketplace) window.Marketplace.renderCounselors();
    }).catch(() => {});
  },

  leaveCallQueue(counselorId) {
    window.Api.f('/api/call/queue/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counselorId, clientId: this.clientId() })
    }).catch(() => {});
    const waits = (window.Storage._safeGet('cbt_call_waits', []) || []).filter(w => w.counselorId !== counselorId);
    window.Storage._safeSet('cbt_call_waits', waits);
    this.showRecordToast('대기를 취소했어요');
    if (window.Marketplace) window.Marketplace.renderCounselors();
  },

  isWaitingFor(counselorId) {
    return (window.Storage._safeGet('cbt_call_waits', []) || []).some(w => w.counselorId === counselorId);
  },

  async _callQueueTick() {
    const waits = window.Storage._safeGet('cbt_call_waits', []) || [];
    if (!waits.length) return;
    for (const w of [...waits]) {
      try {
        const res = await window.Api.f(`/api/call/queue?counselorId=${encodeURIComponent(w.counselorId)}&clientId=${encodeURIComponent(this.clientId())}`);
        if (!res.ok) continue;
        const d = await res.json();
        if (d.position === 0) { // 서버에서 사라짐(연결됐거나 리셋) → 조용히 정리
          window.Storage._safeSet('cbt_call_waits', (window.Storage._safeGet('cbt_call_waits', []) || []).filter(x => x.counselorId !== w.counselorId));
          continue;
        }
        if (!d.available) {
          this.showRecordToast(`${w.name}님이 부재중으로 전환해 대기가 종료됐어요`);
          this.leaveCallQueue(w.counselorId);
          continue;
        }
        if (d.free && d.position <= 1) {
 this.notify(`${w.name}님과 통화 가능!`,'회선이 비었어요. 지금 바로 걸어보세요 (대기 1순위)');
          this.playWoorung();
 this.showRecordToast(`${w.name}님 회선이 비었어요! 지금 걸어보세요`);
          if (window.Marketplace) window.Marketplace.fetchPresence(true);
        }
      } catch (e) {}
    }
  },

  // 채팅창이 닫혀 있어도 상담사 답장을 받아온다 (1분 틱)
  async _hchatBgTick() {
    try {
      if (document.getElementById('hchat-overlay')) return; // 열려 있으면 그쪽 8초 폴링이 담당
      const clientName = window.Storage._safeGet('cbt_user_name', '') || '익명';
      const keys = Object.keys(localStorage).filter(k => k.startsWith('cbt_hchat_'));
      for (const key of keys) {
        const cid = key.replace('cbt_hchat_', '');
        const res = await window.Api.f(`/api/chat-msg?clientId=${encodeURIComponent(this.clientId())}&client=${encodeURIComponent(clientName)}&counselorId=${encodeURIComponent(cid)}`).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json();
        const cur = window.Storage._safeGet(key, []) || [];
        const known = new Set(cur.map(m => m.sid).filter(Boolean));
        const fresh = (data.items || []).filter(m => m.from === 'counselor' && !known.has(m.id));
        if (!fresh.length) continue;
        fresh.forEach(m => cur.push({ role: 'them', text: m.text, ts: m.ts, sid: m.id }));
        cur.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        window.Storage._safeSet(key, cur.slice(-200));
        const c = window.Marketplace ? window.Marketplace.getCounselor(cid) : null;
        const name = (c && c.name) || fresh[0].counselorName || '상담사';
 if (this._notifOn('chat')) { this.notify(`${name}님의 답장`, fresh[fresh.length - 1].text); this.playWoorung(); }
 this.showRecordToast(`${name}님이 답장했어요 (마이페이지 › 채팅)`);
        this._setNavBadge('mypage', true);
      }
    } catch (e) {}
  },

  // 상담사가 예약을 거절했으면(병가 등) 전액 환불 + 알림 (1분 틱)
  async _bookingSyncTick() {
    try {
      const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
      // 예정된 것만 보던 것을 넓힌다 — 상담사가 '완료'나 '환불'로 바꾼 것도
      //  받아와야 내담자 화면에 [상담 잘 받았어요] 버튼이 뜬다.
      const active = bookings.filter(b =>
        b.status === 'confirmed' || b.status === 'done' || b.srvDone);
      if (!active.length) return;
      const clientName = window.Storage._safeGet('cbt_user_name', '') || '익명';
      const res = await window.Api.f(`/api/bookings?clientId=${encodeURIComponent(this.clientId())}&client=${encodeURIComponent(clientName)}`).catch(() => null);
      if (!res || !res.ok) return;
      const server = (await res.json()).items || [];
      let changed = false;
      active.forEach(b => {
        const sv = server.find(x => x.id === b.id);
        if (!sv) return;

        // 상담사가 거절 — 전액 환불
        if (sv.status === 'declined' && b.status === 'confirmed') {
          b.status = 'cancelled';
          b.cancelledTs = Date.now();
          b.cancelledBy = 'counselor';
          b.refunded = b.price;
          changed = true;
          if (window.Wallet) window.Wallet.refund(b.price, `${b.name} 예약 취소(상담사 사정) 전액 환불`);
          if (this._notifOn('booking')) { this.notify('예약 취소 안내', `${b.name}님 사정으로 [${b.time}] 예약이 취소되어 전액 환불되었어요.`); this.playWoorung(); }
          this.showRecordToast(`${b.name}님 사정으로 예약이 취소됐어요 (전액 환불)`);
          return;
        }

        // 상담사가 환불 처리 (병가 등)
        if (sv.status === 'refunded' && !b.refunded) {
          b.status = 'cancelled';
          b.cancelledBy = 'counselor';
          b.refunded = sv.refund || b.price;
          changed = true;
          if (window.Wallet) window.Wallet.refund(b.refunded, `${b.name} 상담 환불${sv.refundWhy ? ' · ' + sv.refundWhy : ''}`);
          this.showRecordToast(`${b.name}님이 환불 처리했어요 (${(b.refunded).toLocaleString()}캐시)`);
          return;
        }

        // 상담사가 완료 처리 — 내담자가 확인해야 정산이 확정된다
        if (sv.status === 'done' && !b.srvDone) {
          b.srvDone = true;
          b.srvDoneAt = sv.doneAt || Date.now();
          b.srvAutoAt = sv.autoAt || 0;
          changed = true;
          if (this._notifOn('booking')) {
            this.notify('상담 확인 요청', `${b.name}님과의 상담은 어떠셨어요? 마이페이지에서 확인해주세요.`);
          }
          this.showRecordToast(`${b.name}님이 상담을 완료 처리했어요. 확인해주세요`);
          this._setNavBadge('mypage', true);
          return;
        }

        // 확인·정산 상태 반영
        if (sv.confirmAt && !b.srvConfirmAt) { b.srvConfirmAt = sv.confirmAt; changed = true; }
        if (sv.settledAt && !b.srvSettledAt) { b.srvSettledAt = sv.settledAt; changed = true; }
      });
      if (changed) {
        window.Storage._safeSet('cbt_bookings', bookings);
        if (this.currentTab === 'mypage') this.renderMyBookings();
        this._setNavBadge('mypage', true);
      }
    } catch (e) {}
  },

  // 한 달 넘게 백업이 없으면 부드럽게 권유 (데이터가 유의미할 때만)
  _maybeBackupNudge() {
    const S = window.Storage;
    const meaningful = (S.getMessages() || []).length > 20 || (S.getThoughtRecords() || []).length > 2;
    if (!meaningful) return;
    const last = S._safeGet('cbt_backup_ts', 0) || 0;
    if (last && Date.now() - last < 30 * 86400000) return;
    const monthKey = new Date().toISOString().slice(0, 7);
    if (S._safeGet('cbt_backup_nudged', '') === monthKey) return;
    S._safeSet('cbt_backup_nudged', monthKey);
 setTimeout(() => this.showRecordToast('우렁이의 기억, 이번 달엔 아직 백업 전이에요 (마이페이지 › 기억 간직하기)'), 6000);
  },

  // 예약 30분 전 리마인더 (1분 주기 체크인 틱에서 호출)
  _bookingReminderTick() {
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const reminded = window.Storage._safeGet('cbt_booking_reminded', []) || [];
    const now = Date.now();
    bookings.forEach(b => {
      if (b.status === 'cancelled' || !b.whenTs || reminded.includes(b.id)) return;
      const diff = b.whenTs - now;
      if (diff > 0 && diff <= 30 * 60000) {
        reminded.push(b.id);
        window.Storage._safeSet('cbt_booking_reminded', reminded.slice(-50));
        if (this._notifOn('booking')) { this.notify('상담 예약 알림 ⏰', `${b.name}님과의 상담이 30분 뒤에 시작돼요.`); this.playWoorung(); }
        this.showRecordToast(`⏰ ${b.name}님과의 상담이 30분 뒤 시작돼요`);
      }
    });
  },

  // === 원탭 기분 체크인 (홈) — 대화 없이도 감정 데이터가 쌓인다 ===
  quickMood(v, emo, emoji) {
    if (window.Sfx) window.Sfx.hit('mood');
    // 연속 클릭 방지 — 체크인은 20분에 한 번
    {
      const last = window.Storage._safeGet('cbt_last_mood_ts', 0) || 0;
      const waitMin = Math.ceil((20 * 60000 - (Date.now() - last)) / 60000);
      if (Date.now() - last < 20 * 60000) {
 this.showRecordToast(`방금 마음을 들었어요 — ${waitMin}분 뒤에 다시 물어볼게요`);
        return;
      }
      window.Storage._safeSet('cbt_last_mood_ts', Date.now());
    }
    const log = window.Storage._safeGet('cbt_mood_log', []) || [];
    // 연타 방지: 1분 안에 다시 누르면 새 기록 대신 마지막 '홈 체크인'을 교체.
    // (하루정리·대화에서 남은 기분 기록은 교체 대상에서 제외 — 덮어쓰기 사고 방지)
    const last = log[log.length - 1];
    const replacing = last && last.src === 'quick' && Date.now() - last.ts < 60000;
    if (replacing) log[log.length - 1] = { ts: Date.now(), emo, v, src: 'quick' };
    else log.push({ ts: Date.now(), emo, v, src: 'quick' });
    window.Storage._safeSet('cbt_mood_log', log.slice(-800));
    window.Storage.markDayActive();
    if (window.Growth) window.Growth.checkAwards();
    if (replacing) {
      // 교체 모드: 조용히 바꿨다고만 알리고 끝 (반응 토스트·팝·호흡 권유 생략)
      this.showRecordToast(`방금 체크인을 '${emo}'(으)로 바꿨어요`);
      document.querySelectorAll('[data-mood-row] button').forEach(b => b.style.background = '');
      const rb = document.querySelector(`[data-mood-row] button[data-emo="${emo}"]`);
      if (rb) rb.style.background = 'color-mix(in srgb, var(--accent-primary) 18%, transparent)';
      if (window.Dashboard) window.Dashboard.renderTodayMoodChart();
      return;
    }
    // 우렁이 반응 토스트
    const reactions = {
'기쁨': ['우로록! 좋은 날이네','오늘 기분 최고구나!'],
'편안': ['잔잔한 하루, 좋다','평온함 기록 완료!'],
      '보통': ['그런 날도 있지. 기록해뒀어', '무난한 하루도 소중해'],
      '불안': ['마음이 조마조마하구나. 호흡 한 번 어때?', '불안할 땐 우렁이한테 말해줘'],
      '우울': ['마음이 무겁구나… 우렁이가 있어', '힘든 마음, 잘 기록해뒀어']
    };
    const msgs = reactions[emo] || ['기록했어!'];
    this.showRecordToast(msgs[Math.floor(Math.random() * msgs.length)]);
    // 우렁이 리액션 팝: 고른 감정에 맞는 표정으로 등장
    const popMap = { '기쁨': 'party', '편안': 'tea', '보통': 'ok', '불안': 'shelter', '우울': 'shelter' };
    this.stickerPop(popMap[emo] || 'joy', 1300);
    if (window.Farm) window.Farm.addWater(2, '오늘의 마음 체크인');
    // 선택 강조
    document.querySelectorAll('[data-mood-row] button').forEach(b => b.style.background = '');
    const btn = document.querySelector(`[data-mood-row] button[data-emo="${emo}"]`);
    if (btn) btn.style.background = 'color-mix(in srgb, var(--accent-primary) 18%, transparent)';
    if (window.Dashboard) { window.Dashboard.renderTodayMoodChart(); }
    // 힘든 감정이면 안정 도구 권유
    if (v <= 2 && window.Calm && Math.random() < 0.7) {
      setTimeout(async () => {
        if (await window.UI.confirm('마음이 힘든 것 같아요.\n우렁이와 1분 호흡으로 가라앉혀볼까요?')) window.Calm.startBreath('478');
      }, 900);
    }
  },

  // === 대화 검색 ===
  openChatSearch() {
    const old = document.getElementById('chat-search-overlay');
    if (old) { old.remove(); return; }
    const ov = document.createElement('div');
    ov.id = 'chat-search-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10001; background: var(--bg-primary); display: flex; flex-direction: column; max-width: 480px; margin: 0 auto;';
    ov.innerHTML = `
      <div style="display: flex; gap: 0.5rem; align-items: center; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--glass-border); background: var(--bg-secondary);">
 <button id="cs-close"style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-primary); padding: 0.2rem 0.4rem;"></button>
        <input id="cs-input" placeholder="대화 내용 검색 (예: 발표, 칵테일바)" style="flex: 1; min-width: 0; padding: 0.6rem 0.9rem; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none;">
      </div>
      <div id="cs-results" style="flex: 1; overflow-y: auto; padding: 0.8rem 0.9rem; display: flex; flex-direction: column; gap: 0.5rem;">
        <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin: 1rem 0;">우렁이와 나눈 모든 대화에서 찾아드려요.</p>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('cs-close').addEventListener('click', () => ov.remove());
    const input = document.getElementById('cs-input');
    input.focus();

    const doSearch = () => {
      const q = input.value.trim();
      const box = document.getElementById('cs-results');
      if (q.length < 1) { box.innerHTML = ''; return; }
      const msgs = (window.Storage.getMessages() || []);
      const hits = [];
      msgs.forEach((m, idx) => { if (m.text && m.text.includes(q)) hits.push({ m, idx }); });
      const esc = (s) => this._escHtml(s);
      if (hits.length === 0) {
        box.innerHTML = `<p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; margin: 1rem 0;">'${esc(q)}'에 대한 대화를 찾지 못했어요.</p>`;
        return;
      }
      // 몇 건인지 먼저 알려준다 — 스크롤을 다 내려봐야 감이 오는 건 불친절하다
      const shown = Math.min(hits.length, 60);
      const head = `<div style="font-size: 0.74rem; color: var(--text-muted); font-weight: 700; padding: 0 0.2rem 0.1rem;">${hits.length.toLocaleString()}건${hits.length > shown ? ' · 최근 60건만 표시' : ''}</div>`;
      box.innerHTML = head + hits.slice(-60).reverse().map(h => {
        const t = h.m.timestamp ? new Date(h.m.timestamp).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const preview = h.m.text.length > 70 ? h.m.text.slice(0, 70) + '…' : h.m.text;
        // 먼저 이스케이프하고, 그 다음 이스케이프된 검색어를 <mark> 로 감싼다
        //  (순서를 바꾸면 <mark> 자체가 이스케이프돼 글자로 보인다)
        const marked = esc(preview).split(esc(q)).join(`<mark style="background: none; color: var(--accent-primary); font-weight: 800;">${esc(q)}</mark>`);
        return `<button data-idx="${h.idx}" class="cs-hit" style="all: unset; box-sizing: border-box; display: block; width: 100%; text-align: left; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 0.7rem 0.85rem; cursor: pointer;">
          <div style="font-size: 0.68rem; color: var(--text-muted); margin-bottom: 0.2rem;">${h.m.role === 'user' ? '나' : '상담사'} · ${esc(t)}</div>
          <div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.45;">${marked}</div>
        </button>`;
      }).join('');
      box.querySelectorAll('.cs-hit').forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        ov.remove();
        this.switchTab('chat', true);
        this._jumpToMessage(idx);
      }));
    };
    input.addEventListener('input', doSearch);
  },

  // ── 대화 내보내기 ────────────────────────────────────────────────────────
  //  일기장 내보내기(Growth.exportDiary)와 같은 뼈대다: 독립 HTML 문서를 만들어
  //  mode 에 따라 파일로 내려받거나(download) 새 창에서 인쇄한다(print).
  //  다른 점은 말풍선의 좌우 정렬과 상담사 색 — 종이 위에서도 누가 한 말인지
  //  한눈에 보여야 상담사에게 내밀 수 있는 자료가 된다.
  //  인자 없이 부르면 어떤 방식으로 내보낼지 먼저 묻는다.
  exportChat(mode) {
    const msgs = (window.Storage && window.Storage.getMessages()) || [];
    // 스티커·그림 카드만 있는 말도 기록에 남긴다. 셋 다 없는 빈 말은 버린다.
    const rows = msgs.filter(m => m && ((m.text && String(m.text).trim()) || m.sticker || (m.viz && m.viz.type)));
    if (!rows.length) { window.UI.alert('아직 나눈 대화가 없어요.'); return; }

    if (mode !== 'download' && mode !== 'print') {
      window.UI.alert({
        title: '대화 내보내기',
        body: `지금까지 나눈 ${rows.length.toLocaleString()}개의 말을 한 장의 기록으로 만들어요.`,
        icon: 'download',
        okLabel: '닫기',
        html: `<div style="display: flex; gap: 0.5rem;">
          <button class="btn-secondary" style="flex: 1; font-size: 0.82rem; padding: 0.6rem;"
            onclick="window.UI.closeAll(); window.App.exportChat('download')">파일로 저장(HTML)</button>
          <button class="btn-secondary" style="flex: 1; font-size: 0.82rem; padding: 0.6rem;"
            onclick="window.UI.closeAll(); window.App.exportChat('print')">인쇄 · PDF</button>
        </div>`
      });
      return;
    }

    const esc = s => this._escHtml(s);
    // 상담사 색을 옅게 깔기 위한 변환 — 문서엔 CSS 변수가 없으니 직접 rgba 로 만든다
    const tint = (hex, a) => {
      const h = String(hex || '').replace('#', '');
      if (h.length !== 6) return `rgba(120, 120, 120, ${a})`;
      const n = parseInt(h, 16);
      if (isNaN(n)) return `rgba(120, 120, 120, ${a})`;
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };
    const persona = id => {
      let p = null;
      try { p = id && window.Personas ? window.Personas.get(id) : null; } catch (e) {}
      return { name: (p && p.name) || '우렁의사', color: (p && p.color) || '#4f8a6b' };
    };
    const dayLabel = d => d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    let lastDay = null;
    const body = rows.map(m => {
      const d = m.timestamp ? new Date(m.timestamp) : null;
      const valid = d && !isNaN(d.getTime());
      let sep = '';
      if (valid) {
        const key = d.toLocaleDateString('sv-CA');
        if (key !== lastDay) { sep = `<div class="dsep"><span>${esc(dayLabel(d))}</span></div>`; lastDay = key; }
      }
      const time = valid ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
      const mine = m.role === 'user';
      const text = String(m.text || '').trim();

      // 글이 없는 말(스티커·그림 카드)은 말풍선 대신 한 줄로 적는다
      if (!text) {
        const note = m.sticker ? `(스티커: ${esc(m.sticker)})` : `(그림 카드: ${esc(m.viz && m.viz.type)})`;
        return `${sep}<div class="row ${mine ? 'me' : 'you'}"><p class="note">${note}</p></div>`;
      }

      const safe = esc(text).replace(/\n/g, '<br>');
      if (mine) {
        return `${sep}<div class="row me">
          <div class="bubble mine"><p>${safe}</p>${time ? `<span class="t">${esc(time)}</span>` : ''}</div>
        </div>`;
      }
      const p = persona(m.persona);
      return `${sep}<div class="row you">
        <p class="who" style="color: ${p.color};">${esc(p.name)}</p>
        <div class="bubble bot" style="background: ${tint(p.color, 0.12)}; border-color: ${tint(p.color, 0.32)};">
          <p>${safe}</p>${time ? `<span class="t">${esc(time)}</span>` : ''}</div>
      </div>`;
    }).join('');

    // 기간 — 시각이 없는 옛 메시지가 섞여 있어도 안전하게 유효한 것만 본다
    const stamps = rows.map(m => (m.timestamp ? new Date(m.timestamp) : null))
      .filter(d => d && !isNaN(d.getTime()));
    const span = stamps.length
      ? `${dayLabel(stamps[0])} ~ ${dayLabel(stamps[stamps.length - 1])}`
      : '기간 정보 없음';

    const doc = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>우렁의사 상담 기록</title>
<style>
body{font-family:'Malgun Gothic',system-ui,sans-serif;background:#fbf7f0;color:#3a342e;max-width:640px;margin:0 auto;padding:32px 24px;line-height:1.7}
h1{font-size:22px;margin:0}
p.meta{font-size:12px;color:#a99c8c;margin:4px 0 26px}
.dsep{text-align:center;margin:26px 0 14px}
.dsep span{font-size:11.5px;font-weight:700;color:#8a8073;background:#f1e9dc;border-radius:999px;padding:3px 12px}
.row{display:flex;flex-direction:column;margin:10px 0}
.row.me{align-items:flex-end}
.row.you{align-items:flex-start}
.who{margin:0 0 3px 4px;font-size:11.5px;font-weight:800}
.bubble{max-width:78%;border:1px solid transparent;border-radius:14px;padding:9px 13px}
.bubble p{margin:0;font-size:13.5px;line-height:1.65;word-break:break-word}
.bubble.mine{background:#e8eef1;border-color:#cfdbe2}
.bubble .t{display:block;margin-top:4px;font-size:10.5px;color:#a99c8c}
.note{margin:0;font-size:11.5px;color:#8a8073;font-style:italic}
.foot{margin-top:28px;padding-top:12px;border-top:1px dashed #ddd2c2;font-size:11px;color:#a99c8c;line-height:1.6}
@media print{body{padding:0;background:#fff}.bubble{page-break-inside:avoid}}
</style></head><body>
<h1>우렁의사 상담 기록</h1>
<p class="meta">${esc(span)} · 모두 ${rows.length.toLocaleString()}개의 말</p>
${body}
<p class="foot">이 기록은 내 기기에서 만든 개인 문서입니다. 상담사에게 보여주면 좋은 참고 자료가 됩니다.</p>
</body></html>`;

    if (mode === 'print') {
      const w = window.open('', '_blank');
      if (!w) { window.UI.alert('팝업이 차단됐어요. 팝업을 허용해주세요.'); return; }
      w.document.write(doc); w.document.close();
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
    } else {
      const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `우렁의사_상담기록_${new Date().toLocaleDateString('sv-CA')}.html`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
      this.showRecordToast('상담 기록을 파일로 저장했어요');
    }
  },

  // 저장 배열의 idx 번째 메시지로 점프한다.
  //  화면엔 최근 _chatWindow 개만 그려져 있어서, 저장 인덱스를 그대로 DOM 인덱스로
  //  쓰면 엉뚱한 말풍선이 잡힌다. 먼저 창을 그 메시지가 들어올 만큼 넓혀 다시 그린 뒤
  //  (저장 인덱스 - 창 시작 오프셋)으로 보정해서 진짜 그 노드를 찾는다.
  _jumpToMessage(idx) {
    const messages = (window.Storage && window.Storage.getMessages()) || [];
    if (idx < 0 || idx >= messages.length) return;

    const needed = messages.length - idx + 5;
    if (this._chatWindow < needed) {
      this._chatWindow = Math.max(this._chatWindow, needed);
      this.loadExistingMessages();
    }

    const start = Math.max(0, messages.length - this._chatWindow); // 창 시작 = 첫 렌더 메시지의 저장 인덱스
    const domIdx = idx - start;                                    // '더 보기' 버튼·날짜 구분선은 .message 가 아니라 셈에서 빠진다
    const nodes = document.querySelectorAll('#chat-messages .message');
    const target = nodes[domIdx];
    if (!target) return;
    // 탭 전환 직후엔 레이아웃이 아직 안 잡혀 스크롤이 튄다 — 한 프레임 뒤에
    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const bubble = target.querySelector('.message-bubble') || target;
      const orig = bubble.style.boxShadow;
      bubble.style.boxShadow = '0 0 0 3px var(--accent-primary)';
      setTimeout(() => { bubble.style.boxShadow = orig; }, 2200);
    }, 60);
  },

  // AI 요약 리포트를 상담사에게 전달
  // ① 예약한 상담사의 채팅방에 첨부 (상담 시작 시 함께 확인)
  // ② 카톡/문자 공유로 즉시 직접 전달도 가능
  // 리포트 전송 — 받을 상담사를 '직접 고른 뒤' 보낸다 (자동 발송 금지)
  sendReportToCounselor(report) {
    const full = (report.title ? report.title + '\n\n' : '') + report.body;
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const now = Date.now();
    const seen = new Set();
    const cands = [];
    bookings.filter(b => b.status !== 'cancelled' && b.counselorId).forEach(b => {
      if (seen.has(b.counselorId)) return;
      seen.add(b.counselorId);
      cands.push({ id: b.counselorId, name: b.name, hospital: b.hospital, upcoming: b.whenTs && b.whenTs > now });
    });

    const shareOut = () => {
      if (navigator.share) navigator.share({ title: '[우렁의사] AI 상담 요약 리포트', text: full }).catch(() => {});
 else if (navigator.clipboard) navigator.clipboard.writeText(full).then(() => this.showRecordToast('리포트가 복사됐어요. 메신저에 붙여넣어 전달하세요')).catch(() => window.UI.alert(full.slice(0, 1500)));
      else window.UI.alert(full.slice(0, 1500));
    };

    if (!cands.length) {
      window.UI.alert('아직 예약한 상담사가 없어요.\n카카오톡·문자 공유로 직접 전달하거나, 상담사 매칭에서 예약 후 보내주세요.');
      shareOut();
      return;
    }

    const old = document.getElementById('report-send-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'report-send-overlay';
    ov.className = 'modal-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 360px;">
 <h2 style="margin: 0 0 0.3rem; font-size: 1.1rem;"> 리포트 보내기</h2>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.9rem;">누구에게 보낼까요? 선택한 상담사의 채팅방으로 전달돼요.</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${cands.map(c => `
            <button style="all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 0.7rem; padding: 0.75rem 0.9rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); cursor: pointer;"
              onclick="document.getElementById('report-send-overlay').remove(); window.App._deliverReportTo('${c.id}', ${JSON.stringify(c.name).replace(/"/g, '&quot;')})">
 <span style="flex-shrink: 0; line-height: 0;">${window.Icons ? window.Icons.svg('counselor', { size: 22 }) :''}</span>
              <span style="flex: 1; min-width: 0;">
                <strong style="display: block; font-size: 0.88rem; color: var(--text-primary);">${c.name}</strong>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${c.hospital || ''} ${c.upcoming ? '· 예약 예정' : '· 지난 상담'}</span>
              </span>
              <span style="color: var(--accent-primary); font-weight: 800;">›</span>
            </button>`).join('')}
 <button class="btn-secondary"style="width: 100%; font-size: 0.82rem;"id="report-share-out"> 카카오톡·문자로 직접 공유</button>
          <button class="btn-secondary" style="width: 100%; font-size: 0.82rem;" onclick="document.getElementById('report-send-overlay').remove()">취소</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    this._pendingReport = full;
    document.getElementById('report-share-out').onclick = () => { ov.remove(); shareOut(); };
  },

  async _deliverReportTo(counselorId, name) {
    const full = this._pendingReport || '';
    if (!full) return;
    if (!await window.UI.confirm(`${name}님에게 이 리포트를 보낼까요?`)) return;
    const key = 'cbt_hchat_' + counselorId;
    const msgs = window.Storage._safeGet(key, []) || [];
 const text =`[AI 상담 요약 리포트]\n\n${full}`;
    msgs.push({ role: 'me', text, ts: Date.now() });
 msgs.push({ role:'sys', text:`리포트가 ${name}님께 전달됐어요.\n상담사님이 이 리포트를 먼저 읽고 상담을 준비합니다.`, ts: Date.now() });
    window.Storage._safeSet(key, msgs.slice(-200));
    // 서버 채팅으로도 전송 → 상담사 페이지에 실제 도착
    try {
      window.Api.f('/api/chat-msg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselorId, counselorName: name, clientId: this.clientId(), clientName: window.Storage._safeGet('cbt_user_name', '') || '익명', from: 'client', text })
      }).catch(() => {});
    } catch (e) {}
    this.openHumanChat(counselorId);
  },

  // 리뷰 작성 → 저장 (완료된 상담) + 서버 전송 (상담사가 보고 답글 가능)
  // ==========================================================================
  //  상담 후기
  //   전에는 prompt 두 번이었다 — '별점을 1~5로 입력하세요'에 숫자를 타이핑.
  //   상담을 마치고 마음이 아직 정리 안 된 사람에게 시키기엔 딱딱하고,
  //   무엇보다 별점이 뭘 뜻하는지 알 수가 없었다. 별을 눌러 고르게 한다.
  // ==========================================================================
  REVIEW_LABEL: ['', '아쉬웠어요', '그저 그랬어요', '괜찮았어요', '좋았어요', '정말 좋았어요'],

  writeReview(bookingId) {
    const b = (window.Storage._safeGet('cbt_bookings', []) || []).find(x => x.id === bookingId);
    if (!b) return;
    const old = document.getElementById('review-overlay');
    if (old) old.remove();

    let rating = 0;
    const ov = document.createElement('div');
    ov.id = 'review-overlay';
    ov.style.cssText =
      'position: fixed; inset: 0; z-index: 10090; background: rgba(33,26,20,0.55);' +
      'backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);' +
      'display: flex; align-items: center; justify-content: center; padding: 1.2rem;';
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 340px; width: 100%;">
        <h2 style="margin: 0 0 0.2rem; font-size: 1.05rem;">상담은 어떠셨나요?</h2>
        <p style="margin: 0 0 1rem; font-size: 0.78rem; color: var(--text-muted);">
          ${(b.name || '상담사').replace(/</g, '&lt;')} · ${b.timeLabel || ''}</p>

        <div id="rv-stars" style="display: flex; justify-content: center; gap: 0.35rem; margin-bottom: 0.35rem;">
          ${[1, 2, 3, 4, 5].map(n => `
            <button type="button" data-n="${n}" aria-label="별 ${n}개"
              style="all: unset; cursor: pointer; padding: 0.15rem; line-height: 0;">
              <svg width="34" height="34" viewBox="0 0 24 24" class="rv-star" data-n="${n}">
                <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z"
                  fill="none" stroke="var(--glass-border)" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
            </button>`).join('')}
        </div>
        <p id="rv-label" style="text-align: center; margin: 0 0 0.9rem; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); min-height: 1.2em;">별을 눌러 평가해주세요</p>

        <textarea id="rv-text" rows="4" maxlength="300"
          placeholder="어떤 점이 도움이 되었나요? (선택)&#10;다음 분에게 큰 도움이 됩니다."
          style="width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border-radius: 12px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; font-family: inherit; font-size: 0.86rem; line-height: 1.6; resize: vertical;"></textarea>
        <div style="display: flex; align-items: center; justify-content: space-between; margin: 0.35rem 0 0.9rem;">
          <span style="font-size: 0.7rem; color: var(--text-muted);">이름은 가려서 올라가요</span>
          <span id="rv-count" style="font-size: 0.7rem; color: var(--text-muted);">0/300</span>
        </div>

        <div class="form-actions" style="margin-top: 0;">
          <button class="btn-secondary" id="rv-cancel">취소</button>
          <button class="btn-primary" id="rv-go">후기 남기기</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const paint = n => {
      ov.querySelectorAll('.rv-star').forEach(s => {
        const on = Number(s.dataset.n) <= n;
        const p = s.querySelector('path');
        p.setAttribute('fill', on ? '#f0b429' : 'none');
        p.setAttribute('stroke', on ? '#f0b429' : 'var(--glass-border)');
      });
      const lab = ov.querySelector('#rv-label');
      lab.textContent = n ? this.REVIEW_LABEL[n] : '별을 눌러 평가해주세요';
      lab.style.color = n ? 'var(--text-primary)' : 'var(--text-muted)';
    };
    ov.querySelectorAll('#rv-stars button').forEach(btn => {
      btn.addEventListener('click', () => {
        rating = Number(btn.dataset.n);
        paint(rating);
        if (window.Sfx) { try { window.Sfx.play('pop'); } catch (e) {} }
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
      });
    });

    const ta = ov.querySelector('#rv-text');
    ta.addEventListener('input', () => { ov.querySelector('#rv-count').textContent = ta.value.length + '/300'; });

    ov.querySelector('#rv-cancel').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

    ov.querySelector('#rv-go').addEventListener('click', async () => {
      if (!rating) {
        // 별점 없이 보내면 이 후기는 평점에 아무 의미도 못 준다
        const lab = ov.querySelector('#rv-label');
        lab.textContent = '별점을 먼저 골라주세요';
        lab.style.color = '#c14a4a';
        return;
      }
      const btn = ov.querySelector('#rv-go');
      btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = '올리는 중…';
      await this._saveReview(b, rating, ta.value.trim());
      ov.remove();
    });

    setTimeout(() => paint(0), 0);
  },

  async _saveReview(b, rating, text) {
    const reviews = window.Storage._safeGet('cbt_reviews', {}) || {};
    reviews[b.id] = { rating, text, ts: Date.now() };
    window.Storage._safeSet('cbt_reviews', reviews);

    // 서버로도 보낸다 — 상담사 앱의 '받은 후기'에 도착하고, 답글이 달린다
    await window.Api.f('/api/reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: b.id, counselorId: b.counselorId, counselorName: b.name,
        clientId: this.clientId(),
        clientName: window.Storage._safeGet('cbt_user_name', '') || '익명',
        rating, text
      })
    }).catch(() => {});

    if (window.Sfx) { try { window.Sfx.hit('levelup'); } catch (e) {} }
    this.showRecordToast('후기를 남겼어요. 고맙습니다');
    this.renderMyBookings();
    if (window.Marketplace) window.Marketplace.renderCounselors();
  },

  // 신청서의 진짜 주인은 서버다. 기기에 있는 건 사본일 뿐이라,
  //  운영자가 승인·반려해도 이 기기는 그걸 모른 채 '검수중'을 계속 보여줬다.
  async syncCounselorApps() {
    const d = await window.Api.json('/api/apply?clientId=' + encodeURIComponent(this.clientId()))
      .catch(() => null);
    if (!d || !Array.isArray(d.items)) return;      // 서버가 안 되면 사본을 그대로 쓴다
    const local = window.Storage._safeGet('cbt_counselor_apps', []) || [];
    const merged = d.items.map(s => {
      const old = local.find(x => x.id === s.id) || {};
      return {
        ...old,
        id: s.id, ts: s.ts, status: s.status,
        name: s.name, email: s.email, license: s.license, career: s.career,
        price: s.price, intro: s.intro, hospital: s.hospital, addr: s.addr, tel: s.tel,
        tags: s.tags, photo: s.photo || old.photo || null,
        rejectReason: s.rejectWhy || '',
        counselorId: s.counselorId || ''
      };
    });
    window.Storage._safeSet('cbt_counselor_apps', merged.slice(0, 10));
    this.renderCounselorApps();
  },

  renderCounselorApps() {
    const el = document.getElementById('my-counselor-apps');
    if (!el) return;
    const apps = window.Storage._safeGet('cbt_counselor_apps', []) || [];
    el.innerHTML = apps.map(a => {
      const approved = a.status === 'approved';
      const rejected = a.status === 'rejected';
      const delisted = a.status === 'delisted';
      const chip = approved
        ? '<span style="flex-shrink: 0; background: color-mix(in srgb, var(--accent-primary) 18%, transparent); color: var(--accent-primary); font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">입점 완료</span>'
        : rejected
          ? '<span style="flex-shrink: 0; background: #e05d5d22; color: #c14a4a; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">반려됨</span>'
          : delisted
            ? '<span style="flex-shrink: 0; background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--glass-border); font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">노출 중단됨</span>'
            : '<span style="flex-shrink: 0; background: #f5c74e33; color: #b98a1a; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 999px;">검수중</span>';
      return `
      <div style="background: var(--bg-tertiary); border: 1px dashed var(--glass-border); border-radius: 10px; padding: 0.7rem 0.9rem; margin-top: 0.6rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem;">
          <div style="min-width: 0;">
            <strong style="font-size: 0.85rem; color: var(--text-primary);">상담사 등록 신청 — ${a.name}</strong>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${a.hospital} · ${new Date(a.ts).toLocaleDateString('ko-KR')}</div>
          </div>
          ${chip}
        </div>
        ${rejected && a.rejectReason ? `<p style="margin: 0.4rem 0 0; font-size: 0.74rem; color: #c14a4a;">반려 사유: ${a.rejectReason} — 보완 후 다시 신청해주세요.</p>` : ''}
        ${delisted ? '<p style="margin: 0.4rem 0 0; font-size: 0.7rem; color: var(--text-muted);">운영팀에 의해 노출이 중단되었어요. 문의는 고객센터로 부탁드려요.</p>' : ''}
        ${(!rejected && !delisted) ? `<p style="margin: 0.4rem 0 0; font-size: 0.7rem; color: var(--text-muted);">${approved ? '상담사 매칭 탭에 노출되고 있어요.' : '운영팀이 자격·소속기관을 검토 중이에요. 승인되면 알려드릴게요.'}</p>` : ''}
 ${(approved && a.inboxCode) ?`<p style="margin: 0.35rem 0 0; font-size: 0.72rem; color: var(--accent-primary); font-weight: 700;"> 내 수신함 코드: ${a.inboxCode} — <a href="${this.proAppUrl()}" target="_blank" style="color: var(--accent-primary);">상담사 앱 열기 ›</a></p>`:''}
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.55rem;">
          ${/* 상담 가능 시간·프로필·정산 계좌는 전부 상담사 전용 페이지에서 관리한다.
                앱에도 같은 설정을 두면 둘이 어긋나고, 어느 쪽이 진짜인지 알 수 없게 된다. */''}
          ${approved ? `<a href="${this.proAppUrl()}" target="_blank" class="btn-secondary" style="width: auto; font-size: 0.74rem; padding: 0.32rem 0.7rem; text-decoration: none; display: inline-block;">내 상담사 페이지 열기 ›</a>` : ''}
          ${approved ? `<button class="btn-secondary" style="width: auto; font-size: 0.74rem; padding: 0.32rem 0.7rem;" onclick="window.App.switchTab('counselors')">매칭 탭에서 보기 ›</button>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  // 승인 후 프로필 수정 — 사진·전문분야·상담료·소개를 바꾸면 매칭 카드에 즉시 반영
  editCounselorProfile(appId) {
    const apps = window.Storage._safeGet('cbt_counselor_apps', []) || [];
    const a = apps.find(x => x.id === appId);
    if (!a) return;
    const old = document.getElementById('cprof-edit-overlay');
    if (old) old.remove();
    this._editPhoto = a.photo || null;
    const ov = document.createElement('div');
    ov.id = 'cprof-edit-overlay';
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal-content glass-card" style="max-width: 400px; max-height: 86vh; overflow-y: auto;">
 <h2 style="margin-top: 0;"> 프로필 수정</h2>
        <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.9rem;">
 <div id="ce-photo-preview"style="width: 64px; height: 64px; border-radius: 50%; background: var(--bg-tertiary); border: 1.5px dashed var(--glass-border); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; overflow: hidden; flex-shrink: 0;">${a.photo ?`<img src="${a.photo}"style="width: 100%; height: 100%; object-fit: cover;">`:''}</div>
          <button type="button" class="btn-secondary" style="width: auto; font-size: 0.78rem; padding: 0.4rem 0.8rem;" onclick="document.getElementById('ce-photo-file').click()">사진 변경</button>
          <input type="file" id="ce-photo-file" accept="image/*" style="display: none;">
        </div>
        <strong style="font-size: 0.85rem; color: var(--text-primary);">전문분야 (최대 3개)</strong>
        <div id="ce-tags" style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.45rem 0 0.9rem;">
          ${this.CREG_TAGS.map(t => {
            const on = (a.tags || []).includes(t);
            return `<button type="button" data-tag="${t}" data-on="${on ? 1 : 0}" style="all: unset; box-sizing: border-box; padding: 0.35rem 0.7rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; cursor: pointer; border: 1.5px solid ${on ? 'var(--accent-primary)' : 'var(--glass-border)'}; background: ${on ? 'color-mix(in srgb, var(--accent-primary) 14%, transparent)' : 'var(--bg-tertiary)'}; color: ${on ? 'var(--accent-primary)' : 'var(--text-primary)'};">${t}</button>`;
          }).join('')}
        </div>
        <strong style="font-size: 0.85rem; color: var(--text-primary);">30분 상담료</strong>
        <select id="ce-price" style="width: 100%; margin: 0.4rem 0 0.9rem; padding: 0.6rem 0.8rem; border-radius: 10px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none;">
          ${[30000, 35000, 40000, 45000, 50000, 55000, 60000].map(p => `<option value="${p}" ${a.price === p ? 'selected' : ''}>${p.toLocaleString()}원</option>`).join('')}
        </select>
        <strong style="font-size: 0.85rem; color: var(--text-primary);">자기소개</strong>
        <textarea id="ce-intro" rows="2" style="width: 100%; box-sizing: border-box; margin-top: 0.4rem; padding: 0.6rem 0.8rem; border-radius: 10px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none; resize: vertical;">${(a.intro || '').replace(/</g, '&lt;')}</textarea>
        <div class="form-actions" style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button class="btn-secondary" style="flex: 1;" onclick="document.getElementById('cprof-edit-overlay').remove()">취소</button>
          <button class="btn-primary" style="flex: 1;" onclick="window.App.saveCounselorProfile('${appId}')">저장</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    // 태그 토글 (최대 3개)
    ov.querySelectorAll('#ce-tags button').forEach(b => b.addEventListener('click', () => {
      const on = b.dataset.on === '1';
      if (!on && ov.querySelectorAll('#ce-tags button[data-on="1"]').length >= 3) { this.showRecordToast('전문분야는 3개까지예요'); return; }
      b.dataset.on = on ? '0' : '1';
      b.style.borderColor = on ? 'var(--glass-border)' : 'var(--accent-primary)';
      b.style.background = on ? 'var(--bg-tertiary)' : 'color-mix(in srgb, var(--accent-primary) 14%, transparent)';
      b.style.color = on ? 'var(--text-primary)' : 'var(--accent-primary)';
    }));
    // 사진 변경 (256px 리사이즈)
    document.getElementById('ce-photo-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        const s = Math.min(img.width, img.height);
        cv.width = cv.height = 256;
        cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
        this._editPhoto = cv.toDataURL('image/jpeg', 0.82);
        document.getElementById('ce-photo-preview').innerHTML = `<img src="${this._editPhoto}" style="width: 100%; height: 100%; object-fit: cover;">`;
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(f);
    });
  },

  saveCounselorProfile(appId) {
    const apps = window.Storage._safeGet('cbt_counselor_apps', []) || [];
    const a = apps.find(x => x.id === appId);
    if (!a) return;
    const tags = [...document.querySelectorAll('#ce-tags button[data-on="1"]')].map(b => b.dataset.tag);
    a.tags = tags;
    a.price = parseInt(document.getElementById('ce-price').value, 10);
    a.intro = document.getElementById('ce-intro').value.trim();
    a.photo = this._editPhoto || null;
    window.Storage._safeSet('cbt_counselor_apps', apps);
    // 매칭 탭 카드에 즉시 반영
    const customs = window.Storage._safeGet('cbt_custom_counselors', []) || [];
    const cu = customs.find(x => x.fromApp === appId);
    if (cu) {
      cu.tags = tags.length ? tags : [a.license];
      cu.price = a.price;
      cu.photo = a.photo;
      cu.career = [`현) ${a.hospital}`, a.license + (a.career ? ` · 경력 ${a.career}년` : ''), ...(a.intro ? [a.intro] : [])];
      window.Storage._safeSet('cbt_custom_counselors', customs);
    }
    const ov = document.getElementById('cprof-edit-overlay');
    if (ov) ov.remove();
    this.renderCounselorApps();
    if (window.Marketplace) window.Marketplace.renderCounselors();
 this.showRecordToast('프로필이 수정됐어요. 매칭 카드에 바로 반영됩니다');
  },

  // 관리자 승인 (데모) — 실서비스에서는 백엔드 관리자 콘솔에서 검수 후 승인한다.
  // 승인되면 신청 정보가 실제 상담사 카드로 변환되어 '상담사 매칭' 탭에 노출된다.
  async approveCounselorApp(appId) {
    const apps = window.Storage._safeGet('cbt_counselor_apps', []) || [];
    const a = apps.find(x => x.id === appId);
    if (!a || a.status === 'approved') return;
    if (!await window.UI.confirm(`[관리자 데모]\n'${a.name}' 님의 자격·소속기관 검수를 통과 처리하고 입점을 승인할까요?\n\n실서비스에서는 운영팀 관리자 콘솔에서 서류 검토 후 승인됩니다.`)) return;
    a.status = 'approved';
    window.Storage._safeSet('cbt_counselor_apps', apps);
    // 매칭 탭에 노출될 상담사 카드 생성
    const customs = window.Storage._safeGet('cbt_custom_counselors', []) || [];
    customs.unshift({
      id: 'cu_' + Date.now(),
      fromApp: a.id, // 신청서와 연결 — 노출 중단 시 신청 상태도 함께 바꾼다
      name: `${a.name} ${/전문의/.test(a.license) ? '전문의' : '상담사'}`,
      hospital: a.hospital,
      tel: a.tel || '',
      safeTel: '0507-14' + String(Math.floor(Math.random() * 90) + 10) + '-' + String(Math.floor(Math.random() * 9000) + 1000),
      callRate: Math.max(500, Math.round((a.price || 40000) / 60 * 1.25 / 10) * 10), // 참고값 — 실사용은 callRateFor()가 계산
      lat: 37.5665 + (Math.random() - 0.5) * 0.05,
      lng: 126.9780 + (Math.random() - 0.5) * 0.05,
      rating: 5.0,
      reviews: 0,
      tags: (a.tags && a.tags.length) ? a.tags : [a.license], // 상담사가 고른 전문분야 그대로
      photo: a.photo || null,                                   // 직접 등록한 프로필 사진
      price: a.price || 40000,
      avatar: Math.floor(Math.random() * 3),
      isAvailableNow: true,
      isNew: true,
      career: [
        `현) ${a.hospital}`,
        a.license + (a.career ? ` · 경력 ${a.career}년` : ''),
        ...(a.intro ? [a.intro] : [])
      ],
      reviewsList: []
    });
    window.Storage._safeSet('cbt_custom_counselors', customs);
    this.renderCounselorApps();
 window.UI.alert('입점이 승인되었습니다! \n상담사 매칭 탭에서 카드로 노출됩니다.');
    // 서버 명부 등록 + 상담사 전용 수신함 코드 발급 (서버 꺼져 있으면 조용히 생략)
    const newCu = customs[0];
    try {
      window.Api.f('/api/counselors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newCu.id, name: newCu.name, adminCode: '1234' })
      }).then(r => r.ok ? r.json() : null).then(d => {
        if (!d || !d.inboxCode) return;
        const cs = window.Storage._safeGet('cbt_custom_counselors', []) || [];
        const target = cs.find(x => x.id === newCu.id);
        if (target) { target.inboxCode = d.inboxCode; window.Storage._safeSet('cbt_custom_counselors', cs); }
        const apps2 = window.Storage._safeGet('cbt_counselor_apps', []) || [];
        const a2 = apps2.find(x => x.id === appId);
        if (a2) { a2.inboxCode = d.inboxCode; window.Storage._safeSet('cbt_counselor_apps', apps2); }
        if (document.getElementById('admin-overlay') && window.Admin) window.Admin._render();
        this.renderCounselorApps();
      }).catch(() => {});
    } catch (e) {}
  },

  // === 상담사 가능 시간 설정 (요일 × 시간 토글) ===
  AVAIL_SLOTS: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'],

  openAvailSettings() {
    const grid = document.getElementById('avail-grid');
    if (!grid) return;
    const saved = window.Storage._safeGet('cbt_my_avail', null) || { 1: [...this.AVAIL_SLOTS], 2: [...this.AVAIL_SLOTS], 3: [...this.AVAIL_SLOTS], 4: [...this.AVAIL_SLOTS], 5: [...this.AVAIL_SLOTS], 6: [], 0: [] };
    const dows = [['1', '월'], ['2', '화'], ['3', '수'], ['4', '목'], ['5', '금'], ['6', '토'], ['0', '일']];
    grid.innerHTML = dows.map(([d, label]) => `
      <div>
        <div style="font-size: 0.82rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.3rem;">${label}요일</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
          ${this.AVAIL_SLOTS.map(t => {
            const on = (saved[d] || []).includes(t);
            return `<button data-dow="${d}" data-time="${t}" onclick="this.dataset.on = this.dataset.on === '1' ? '0' : '1'; this.style.background = this.dataset.on === '1' ? 'var(--accent-primary)' : 'var(--bg-tertiary)'; this.style.color = this.dataset.on === '1' ? '#fff' : 'var(--text-muted)';"
              data-on="${on ? 1 : 0}"
              style="all: unset; box-sizing: border-box; padding: 0.32rem 0.55rem; border-radius: 8px; font-size: 0.76rem; cursor: pointer; border: 1px solid var(--glass-border); background: ${on ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; color: ${on ? '#fff' : 'var(--text-muted)'};">${t}</button>`;
          }).join('')}
        </div>
      </div>`).join('');
    document.getElementById('avail-modal').classList.remove('hidden');
  },

  saveAvailSettings() {
    const result = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    document.querySelectorAll('#avail-grid button[data-dow]').forEach(b => {
      if (b.dataset.on === '1') result[b.dataset.dow].push(b.dataset.time);
    });
    window.Storage._safeSet('cbt_my_avail', result);
    document.getElementById('avail-modal').classList.add('hidden');
    window.UI.alert('상담 가능 시간이 저장되었습니다.\n입점 승인 후 예약 캘린더에 반영됩니다.');
  },

  // 다음(카카오) 우편번호 서비스로 주소 검색 — API 키 불필요한 한국 표준 방식
  openAddressSearch() {
    const layer = document.getElementById('creg-postcode-layer');
    if (!layer) return;
    const openIt = () => {
      layer.classList.remove('hidden');
      layer.innerHTML = '';
      new window.daum.Postcode({
        oncomplete: (data) => {
          const addr = data.roadAddress || data.jibunAddress;
          const el = document.getElementById('creg-hosp-addr');
          if (el) el.value = `(${data.zonecode}) ${addr}`;
          layer.classList.add('hidden');
          const d2 = document.getElementById('creg-hosp-addr2');
          if (d2) d2.focus();
        },
        onclose: () => layer.classList.add('hidden'),
        width: '100%', height: '100%'
      }).embed(layer);
      layer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    if (window.daum && window.daum.Postcode) { openIt(); return; }
    const s = document.createElement('script');
    s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    s.onload = openIt;
    s.onerror = () => window.UI.alert('주소 검색 서비스를 불러오지 못했어요. 인터넷 연결을 확인해주세요.');
    document.head.appendChild(s);
  },

  // === 상담사 등록: 전문분야 칩 + 프로필 사진 ===
  CREG_TAGS: ['우울증', '불안장애', '공황장애', '스트레스', '번아웃', '대인관계', '가족상담', '부부상담', '트라우마', '자존감', '수면 문제', '중독', '청소년', 'ADHD'],
  _cregPhoto: null,

  initCregForm() {
    const box = document.getElementById('creg-tags');
    if (box && !box.children.length) {
      box.innerHTML = this.CREG_TAGS.map(t =>
        `<button type="button" data-tag="${t}" style="all: unset; box-sizing: border-box; padding: 0.35rem 0.7rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; cursor: pointer; border: 1.5px solid var(--glass-border); background: var(--bg-tertiary); color: var(--text-primary);">${t}</button>`).join('');
      box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        const on = b.dataset.on === '1';
        if (!on && box.querySelectorAll('button[data-on="1"]').length >= 3) {
          this.showRecordToast('전문분야는 3개까지 선택할 수 있어요');
          return;
        }
        b.dataset.on = on ? '0' : '1';
        b.style.borderColor = on ? 'var(--glass-border)' : 'var(--accent-primary)';
        b.style.background = on ? 'var(--bg-tertiary)' : 'color-mix(in srgb, var(--accent-primary) 14%, transparent)';
        b.style.color = on ? 'var(--text-primary)' : 'var(--accent-primary)';
      }));
    }
    const file = document.getElementById('creg-photo-file');
    if (file && !file.dataset.bound) {
      file.dataset.bound = '1';
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const img = new Image();
        img.onload = () => {
          // 256px 정사각으로 다운스케일 → localStorage 부담 최소화
          const c = document.createElement('canvas');
          const s = Math.min(img.width, img.height);
          c.width = c.height = 256;
          c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
          this._cregPhoto = c.toDataURL('image/jpeg', 0.82);
          const pv = document.getElementById('creg-photo-preview');
          if (pv) pv.innerHTML = `<img src="${this._cregPhoto}" style="width: 100%; height: 100%; object-fit: cover;">`;
          const rm = document.getElementById('creg-photo-remove');
          if (rm) rm.classList.remove('hidden');
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(f);
      });
    }
  },

  clearCregPhoto() {
    this._cregPhoto = null;
    const pv = document.getElementById('creg-photo-preview');
 if (pv) pv.innerHTML ='';
    const rm = document.getElementById('creg-photo-remove');
    if (rm) rm.classList.add('hidden');
    const file = document.getElementById('creg-photo-file');
    if (file) file.value = '';
  },

  // ==========================================================================
  //  상담사 등록 — 한 장의 양식, 두 개의 입구
  //
  //   상담사가 직접 쓰면 → 신청서로 접수되고 운영자가 심사한다
  //   운영자가 대신 쓰면 → 심사할 게 없다. 접수와 동시에 승인된다
  //
  //  전에는 이 둘이 아예 다른 화면이었다. '상담사 추가'는 이름·소속·이메일
  //  네 칸뿐이라 그렇게 넣은 상담사는 상담료도 전문분야도 없는 빈 카드가 됐다.
  //  같은 양식을 쓰면 그런 일이 생기지 않는다.
  // ==========================================================================
  _regAsAdmin: false,

  openCounselorReg(asAdmin) {
    this._regAsAdmin = !!asAdmin;
    const t = document.getElementById('creg-title');
    const lead = document.getElementById('creg-lead');
    const btn = document.getElementById('creg-submit');
    if (t) t.textContent = asAdmin ? '상담사 직접 등록' : '상담사 등록 신청';
    // 정산 비율 안내는 바로 아래 별도 문단에 고정으로 있다 — 여기서 덮지 않는다
    if (lead) lead.textContent = asAdmin
      ? '운영자가 대신 입력합니다. 심사 없이 바로 등록되고, 적어주신 이메일로 로그인 코드가 발송돼요.'
      : '자격과 소속 기관을 확인한 뒤 입점이 승인됩니다. 승인되면 이메일로 상담사 앱 로그인 코드를 보내드려요.';
    if (btn) btn.textContent = asAdmin ? '등록하고 코드 발급' : '신청하기';
    document.getElementById('counselor-reg-modal').classList.remove('hidden');
    if (window.Payout && window.Payout.render) window.Payout.render();
  },

  closeCounselorReg() {
    this._regAsAdmin = false;
    document.getElementById('counselor-reg-modal').classList.add('hidden');
  },

  // 입점 신청.
  //  전에는 이 기기의 localStorage 에만 적었다. 그래서 다른 폰에서 신청하면
  //  운영자 콘솔에 아무것도 뜨지 않았다 — 신청서가 그 폰 안에만 있었으니까.
  //  이제 서버가 원본을 갖고, 기기에는 화면에 쓸 사본만 둔다.
  async submitCounselorReg() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
    const name = v('creg-name'), email = v('creg-email').toLowerCase();
    const license = v('creg-license'), price = v('creg-price');
    const hospital = v('creg-hosp-name'), addr = v('creg-hosp-addr');
    const bank = v('creg-bank'), account = v('creg-account').replace(/[^0-9]/g, ''), holder = v('creg-holder');

    if (!name || !license || !price || !hospital || !addr) {
      window.UI.alert('이름, 자격 구분, 상담료, 병원명, 병원 주소(주소 검색)는 필수입니다.');
      return;
    }
    // 이메일이 없으면 승인돼도 로그인 코드를 보낼 데가 없다
    if (!email) {
      window.UI.alert('이메일을 입력해주세요.\n승인되면 이 주소로 상담사 앱 로그인 코드를 보내드려요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      window.UI.alert('이메일 형식을 다시 확인해주세요.');
      return;
    }
    // 정산 계좌가 없으면 승인돼도 돈을 보낼 수 없다
    if (!bank || !account || !holder) {
      window.UI.alert('정산 계좌(은행·계좌번호·예금주)를 입력해주세요.\n승인 후 상담료를 보내드릴 곳이에요.');
      return;
    }
    if (account.length < 8) {
      window.UI.alert('계좌번호를 다시 확인해주세요.');
      return;
    }

    const tags = [...document.querySelectorAll('#creg-tags button[data-on="1"]')].map(b => b.dataset.tag);
    const payload = {
      clientId: this.clientId(), name, email, license,
      career: v('creg-career'), price: parseInt(price, 10), intro: v('creg-intro'),
      hospital, addr: (addr + ' ' + v('creg-hosp-addr2')).trim(), tel: v('creg-hosp-tel'),
      tags, photo: this._cregPhoto || null,
      bank, bankNo: account, bankHolder: holder
    };
    // 운영자가 대신 넣을 때는 운영자 코드를 같이 보낸다.
    //  같은 기기에서 여러 명을 등록하는 게 정상이라 중복 접수 검사를 건너뛴다.
    if (this._regAsAdmin && window.Admin) payload.code = window.Admin.code();

    const asAdmin = this._regAsAdmin;
    const btn = document.getElementById('creg-submit');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = asAdmin ? '등록 중…' : '접수 중…'; }
    const r = await window.Api.json('/api/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => null);

    if (!r || !r.ok) {
      if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = label; }
      // 조용히 로컬에만 저장하면 신청한 줄 알고 하염없이 기다리게 된다
      window.UI.alert(r && r.error
        ? r.error
        : '지금은 접수할 수 없어요.\n인터넷 연결을 확인하고 잠시 뒤 다시 시도해주세요.');
      return;
    }

    // 운영자가 대신 쓴 경우엔 심사할 게 없다 — 바로 승인해서 코드를 발급한다
    let approved = null;
    if (asAdmin && window.Admin) {
      approved = await window.Api.json('/api/apply/approve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: window.Admin.code(), id: r.id })
      }).catch(() => null);
    }
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = label; }

    this._clearCregForm();
    this.closeCounselorReg();

    if (asAdmin) {
      if (!approved || !approved.ok) {
        window.UI.alert('신청서는 저장했지만 자동 승인에 실패했어요.\n[상담사 관리]의 심사 대기 목록에서 승인해주세요.');
      } else if (approved.mailed) {
        this.showRecordToast(`${approved.name} 선생님 등록 완료 — 코드를 메일로 보냈어요`);
      } else {
        window.Admin.shareCounselor(approved.counselorId, approved.name, approved.code);
      }
      window.Admin.loadCounselors();
      if (window.Marketplace) window.Marketplace.loadServer();
      return;
    }

    const apps = window.Storage._safeGet('cbt_counselor_apps', []) || [];
    apps.unshift({ id: r.id, ts: Date.now(), status: 'pending', ...payload });
    window.Storage._safeSet('cbt_counselor_apps', apps.slice(0, 10));
    window.UI.alert(`등록 신청이 접수되었습니다!\n\n자격·소속기관 검수 후 승인되면\n${email} 으로 상담사 앱 로그인 코드를 보내드려요.`);
    this.renderCounselorApps();
    this.switchTab('mypage');
  },

  _clearCregForm() {
    ['creg-name','creg-email','creg-license','creg-career','creg-price','creg-intro',
     'creg-hosp-name','creg-hosp-addr','creg-hosp-addr2','creg-hosp-tel',
     'creg-bank','creg-account','creg-holder','creg-bizno']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.querySelectorAll('#creg-tags button[data-on="1"]').forEach(b => b.click());
    this.clearCregPhoto();
  },

  // ==========================================================================
  //  사운드·진동 (파일 없이 WebAudio 생성)
  // ==========================================================================
  _audioCtx: null,
  _ringTimer: null,

  _ctx() {
    if (!this._audioCtx) {
      try { this._audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (this._audioCtx && this._audioCtx.state === 'suspended') { try { this._audioCtx.resume(); } catch (e) {} }
    return this._audioCtx;
  },

  _tone(freq, dur, delay = 0, vol = 0.12) {
    const ctx = this._ctx();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  },

  // 알림음: 딩-동 + 진동
  playNotify() {
    this._tone(880, 0.14, 0);
    this._tone(1174, 0.18, 0.16);
    if (navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) {} }
  },

  // 알림 시그니처: '우-렁!' 리듬의 귀여운 방울 알림음 + 진동 (TTS 없음)
  playWoorung() {
    if (navigator.vibrate) { try { navigator.vibrate([90, 50, 160]); } catch (e) {} }
    if (window.Storage._safeGet('cbt_sound_on', true) === false) return; // 알림음 끔 설정
    // 낮게 '우' → 높게 통통 '렁!' 튀는 3음 차임
    this._tone(659, 0.10, 0);          // 우
    this._tone(988, 0.10, 0.11);       // 렁
    this._tone(1319, 0.20, 0.22);      // ! (통-)
  },

  // 전화 연결음(뚜루루): 1초 울리고 2초 쉬는 표준 링백톤
  //  모바일은 오디오 컨텍스트가 잠들어 있으면 소리가 통째로 삼켜진다 —
  //  반드시 깨운 것을 확인한 뒤에 첫 벨을 울린다.
  ringStart() {
    this.ringStop();
    const burst = () => { this._tone(440, 1.0, 0, 0.16); this._tone(480, 1.0, 0, 0.16); if (navigator.vibrate) { try { navigator.vibrate(180); } catch (e) {} } };
    const kick = () => { if (this._ringTimer !== null) return; burst(); this._ringTimer = setInterval(burst, 3000); };
    const ctx = this._ctx();
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume().then(kick, kick); } catch (e) { kick(); }
      // resume 이 영영 안 풀리는 기기도 있다 — 0.3초 안엔 그냥 울린다 (진동이라도)
      setTimeout(kick, 300);
    } else {
      kick();
    }
  },

  ringStop() {
    if (this._ringTimer !== null && this._ringTimer !== undefined) { clearInterval(this._ringTimer); }
    this._ringTimer = null;
  },

  // ==========================================================================
  //  인간 상담사 — 보이스톡(전화망 연결)과 채팅방
  // ==========================================================================
  async startHumanCall(counselorId) {
    const c = window.Marketplace.getCounselor(counselorId);
    if (!c || !window.CallTalk) return;
    // 예약 시간 전후 1시간 안이면 회기권 통화(추가 과금 없음), 아니면 30초당 실시간 과금
    const bookings = window.Storage._safeGet('cbt_bookings', []) || [];
    const prepaid = bookings.some(b => b.counselorId === c.id && b.whenTs && Math.abs(b.whenTs - Date.now()) < 60 * 60 * 1000);
    if (!prepaid) {
      // 이 상담사에게 예약이 있는데 시간 밖이면: 지금 통화는 별도 과금임을 분명히 알린다
      const nextBk = bookings
        .filter(x => x.counselorId === c.id && x.status !== 'cancelled' && x.whenTs && x.whenTs > Date.now())
        .sort((x, y) => x.whenTs - y.whenTs)[0];
      const bkWarn = nextBk
 ?`\n\n 주의: [${nextBk.time}] 예약이 잡혀 있어요.\n예약 시간(전후 1시간)에 걸면 30분 정액으로 추가 과금이 없습니다.\n지금 거는 전화는 예약과 별개인'바로상담'이라 위 요금이 차감돼요.`
        : '';
      if (!await window.UI.confirm(`${c.name}님과 바로상담(보이스톡)\n30초당 ${window.Marketplace.callRateFor(c).toLocaleString()}캐시가 실시간 차감됩니다.\n(예약 상담료 기준 자동 책정 · 쓴 만큼만 결제)${bkWarn}\n\n연결할까요?`)) return;
    }
    // 서버 회선 점유: 다른 내담자가 이미 통화 중이면 연결하지 않는다
    window.Api.f('/api/call/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counselorId: c.id, clientId: this.clientId(), prepaid })
    }).then(async res => {
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}));
        if (window.Marketplace) window.Marketplace.fetchPresence(true);
        if (d.reason === 'busy') {
 if (await window.UI.confirm(`${c.name}님이 지금 다른 내담자와 통화 중이에요. \n\n 다음 순서로 대기를 걸어둘까요?\n회선이 비면 바로 알려드려요. (확인=대기 / 취소=그냥 닫기)`)) this.joinCallQueue(c.id);
        } else {
          window.UI.alert(`${c.name}님이 방금 부재중으로 전환했어요.\n예약을 잡아두시면 그 시간엔 확실히 연결됩니다.`);
        }
        return;
      }
      // 200 성공 또는 서버 미연결(404 등) — 데모 폴백으로 통화 진행
      window.CallTalk.startHuman(c.id, { prepaid });
    }).catch(() => {
      // 오프라인: 회선 관리 없이 데모 통화
      window.CallTalk.startHuman(c.id, { prepaid });
    });
  },

  // ==========================================================================
  //  바로상담 — 통화가 아니라 채팅방으로 연결한다.
  //  전화는 부담스럽다. 채팅으로 시작하고, 필요하면 채팅방 안의 [통화]로.
  //  그리고 한 번에 한 분과만: 여러 상담사에게 동시에 바로상담을 걸어놓으면
  //  상담사들이 유령 내담자를 상대하게 된다.
  // ==========================================================================
  INSTANT_TTL: 24 * 3600 * 1000, // 하루 지나면 자동 해제

  activeInstant() {
    const s = window.Storage._safeGet('cbt_instant_chat', null);
    if (!s || !s.counselorId) return null;
    if (Date.now() - (s.ts || 0) > this.INSTANT_TTL) {
      window.Storage._safeSet('cbt_instant_chat', null);
      return null;
    }
    return s;
  },

  async startInstantChat(counselorId) {
    const c = window.Marketplace.getCounselor(counselorId);
    if (!c) return;
    const cur = this.activeInstant();
    if (cur && cur.counselorId !== c.id) {
      const curC = window.Marketplace.getCounselor(cur.counselorId);
      const curName = curC ? curC.name + '님' : '다른 상담사님';
      if (!await window.UI.confirm(`지금 ${curName}과 바로상담이 진행 중이에요.\n바로상담은 한 번에 한 분과만 할 수 있어요.\n\n기존 상담을 마무리하고 ${c.name}님과 새로 시작할까요?`)) {
        // 유지 선택 → 하던 상담방으로 데려다준다
        if (curC) this.openHumanChat(cur.counselorId);
        return;
      }
    }
    window.Storage._safeSet('cbt_instant_chat', { counselorId: c.id, ts: Date.now() });
    this.openHumanChat(c.id);
  },

  openHumanChat(counselorId) {
    const c = window.Marketplace.getCounselor(counselorId);
    if (!c) return;
    const key = 'cbt_hchat_' + c.id;
    const clientName = window.Storage._safeGet('cbt_user_name', '') || '익명';
    let msgs = window.Storage._safeGet(key, []) || [];
    if (msgs.length === 0) {
 msgs.push({ role:'sys', text:`${c.name}님과의 상담 채팅방이 열렸어요.\n남기신 메시지는 상담사님께 전달되며, 답장이 오면 여기에 표시됩니다.`, ts: Date.now() });
      window.Storage._safeSet(key, msgs);
    }

    // 서버 스레드에서 상담사 답장 가져오기 (8초 폴링)
    const sync = async () => {
      try {
        const res = await window.Api.f(`/api/chat-msg?clientId=${encodeURIComponent(this.clientId())}&client=${encodeURIComponent(clientName)}&counselorId=${encodeURIComponent(c.id)}`);
        if (!res.ok) return;
        const data = await res.json();
        const cur = window.Storage._safeGet(key, []) || [];
        const known = new Set(cur.map(m => m.sid).filter(Boolean));
        let added = false;
        (data.items || []).forEach(m => {
          if (m.from === 'counselor' && !known.has(m.id)) {
            cur.push({ role: 'them', text: m.text, ts: m.ts, sid: m.id });
            added = true;
          }
        });
        if (added) {
          cur.sort((a, b) => (a.ts || 0) - (b.ts || 0));
          window.Storage._safeSet(key, cur.slice(-200));
          if (document.getElementById('hchat-overlay')) render();
          this.playWoorung();
        }
      } catch (e) {}
    };

    const old = document.getElementById('hchat-overlay');
    if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'hchat-overlay';
    ov.style.cssText = 'position: fixed; inset: 0; z-index: 10001; background: var(--bg-primary); display: flex; flex-direction: column; max-width: 480px; margin: 0 auto;';
    ov.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.6rem; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--glass-border); background: var(--bg-secondary);">
 <button id="hchat-close"style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-primary); padding: 0.2rem 0.4rem;"></button>
        <div style="flex: 1; min-width: 0;">
          <strong style="font-size: 0.95rem; color: var(--text-primary); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</strong>
          <span style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${c.hospital}</span>
        </div>
 <button id="hchat-share" title="내 기록을 상담사에게 공유" style="background: none; border: 1px solid var(--glass-border); border-radius: 999px; font-size: 0.73rem; font-weight: 700; padding: 0.4rem 0.7rem; cursor: pointer; color: var(--text-secondary); flex-shrink: 0;">기록 공유</button>
 <button id="hchat-call"class="btn-primary"style="width: auto; font-size: 0.75rem; padding: 0.4rem 0.7rem; flex-shrink: 0;"> 통화</button>
      </div>
      <div id="hchat-msgs" style="flex: 1; overflow-y: auto; padding: 1rem 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;"></div>
      <div style="display: flex; gap: 0.5rem; padding: 0.7rem 0.9rem calc(0.7rem + var(--safe-bottom, 0px)); border-top: 1px solid var(--glass-border); background: var(--bg-secondary);">
        <input id="hchat-input" placeholder="메시지 보내기" style="flex: 1; min-width: 0; padding: 0.65rem 0.9rem; border-radius: 999px; background: var(--bg-tertiary); border: 1px solid var(--glass-border); color: var(--text-primary); outline: none;">
        <button id="hchat-send" class="btn-primary" style="width: auto; padding: 0.5rem 1rem; border-radius: 999px;">전송</button>
      </div>`;
    document.body.appendChild(ov);

    const render = () => {
      const box = document.getElementById('hchat-msgs');
      msgs = window.Storage._safeGet(key, []) || [];
      box.innerHTML = msgs.map(m => {
        if (m.role === 'sys') return `<div style="align-self: center; background: var(--bg-tertiary); border-radius: 10px; padding: 0.6rem 0.9rem; font-size: 0.78rem; color: var(--text-secondary); white-space: pre-line; max-width: 90%;">${m.text}</div>`;
        const mine = m.role === 'me';
        return `<div style="align-self: ${mine ? 'flex-end' : 'flex-start'}; background: ${mine ? 'var(--accent-primary)' : 'var(--bg-secondary)'}; color: ${mine ? '#fff' : 'var(--text-primary)'}; border: 1px solid var(--glass-border); border-radius: 14px; padding: 0.55rem 0.85rem; font-size: 0.88rem; max-width: 78%; white-space: pre-line;">${(m.text || '').replace(/</g, '&lt;')}${!mine ? `<span style="display: block; font-size: 0.64rem; color: var(--text-muted); margin-top: 0.2rem;">${c.name}</span>` : ''}</div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
    };
    render();
    sync();
    clearInterval(this._hchatPoll);
    this._hchatPoll = setInterval(() => {
      if (!document.getElementById('hchat-overlay')) { clearInterval(this._hchatPoll); return; }
      sync();
    }, 8000);

    // 입력창 전송과 '기록 공유'가 같은 길을 탄다 — 저장·서버 발송·안내가 한 곳에
    const sendText = (t) => {
      t = String(t || '').trim();
      if (!t) return;
      msgs.push({ role: 'me', text: t, ts: Date.now() });
      // 첫 발송 시 한 번만: 전달 안내
      if (!msgs.some(m => m.role === 'sys' && m.text.includes('전달되었'))) {
 msgs.push({ role:'sys', text:'메시지가 전달되었어요. 상담사님이 확인하면 답장이 도착합니다.\n급한 상담은 [ 통화] 버튼을 이용해주세요.', ts: Date.now() });
      }
      window.Storage._safeSet(key, msgs.slice(-200));
      // 서버 채팅함으로 전송 → 상담사 앱(우렁의사 프로)에 도착
      try {
        window.Api.f('/api/chat-msg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counselorId: c.id, counselorName: c.name, clientId: this.clientId(), clientName, from: 'client', text: t })
        }).catch(() => {});
      } catch (e) {}
      render();
    };
    const send = () => {
      const inp = document.getElementById('hchat-input');
      const t = inp.value.trim();
      if (!t) return;
      inp.value = '';
      sendText(t);
    };

    // === 기록 공유 — 말로 다시 설명하지 않아도 상담사가 나를 빨리 이해하게 ===
    //  보내기 전에 반드시 내용을 그대로 보여주고 확인받는다. 내 기록이니까.
    const openShare = () => {
      const old2 = document.getElementById('hchat-share-sheet');
      if (old2) { old2.remove(); return; }
      const tr = (window.Storage.getThoughtRecords() || [])[0] || null;
      const sh = document.createElement('div');
      sh.id = 'hchat-share-sheet';
      sh.style.cssText = 'position: fixed; inset: 0; z-index: 10002; background: rgba(0,0,0,0.38); display: flex; align-items: flex-end;';
      sh.innerHTML = `
        <div style="width: 100%; background: var(--bg-secondary); border-radius: 20px 20px 0 0; padding: 1rem 1.2rem calc(1.3rem + env(safe-area-inset-bottom));">
          <strong style="font-size: 0.95rem; color: var(--text-primary);">상담사에게 내 기록 공유</strong>
          <p style="margin: 0.3rem 0 0.8rem; font-size: 0.76rem; color: var(--text-muted); line-height: 1.55;">보내기 전에 내용을 먼저 보여드려요. 상담사님이 내 상태를 미리 알면 상담이 훨씬 빨라져요.</p>
          <button id="hshare-tr" class="btn-secondary" style="width: 100%; margin-bottom: 0.45rem; text-align: left; padding: 0.7rem 0.9rem; ${tr ? '' : 'opacity: 0.45;'}">최근 사고 기록 1건 ${tr ? '' : '<span style="font-size:0.7rem;">(아직 없음)</span>'}</button>
          <button id="hshare-wk" class="btn-secondary" style="width: 100%; text-align: left; padding: 0.7rem 0.9rem;">최근 7일 마음 요약</button>
        </div>`;
      sh.addEventListener('click', e => { if (e.target === sh) sh.remove(); });
      document.body.appendChild(sh);
      const confirmSend = async (text) => {
        sh.remove();
        if (!text) return;
        if (await window.UI.confirm(`이 내용을 ${c.name}님께 보낼까요?\n\n${text.length > 400 ? text.slice(0, 400) + '…' : text}`)) {
          sendText(text);
          this.showRecordToast('상담사님께 전달했어요');
        }
      };
      document.getElementById('hshare-tr').addEventListener('click', () => {
        if (!tr) return;
        const emo = (tr.emotions || []).map(e => `${e.name} ${e.intensity != null ? e.intensity : ''}`.trim()).join(', ');
        confirmSend([
          '[사고 기록 공유]',
          tr.situation ? '상황: ' + tr.situation : '',
          tr.thought ? '그때 든 생각: ' + tr.thought : '',
          emo ? '감정: ' + emo : '',
          tr.balanced || tr.reframe || tr.alternative ? '다시 본 생각: ' + (tr.balanced || tr.reframe || tr.alternative) : ''
        ].filter(Boolean).join('\n'));
      });
      document.getElementById('hshare-wk').addEventListener('click', () => {
        confirmSend(this._mindSummaryText());
      });
    };

    document.getElementById('hchat-send').addEventListener('click', send);
    document.getElementById('hchat-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    document.getElementById('hchat-close').addEventListener('click', () => { clearInterval(this._hchatPoll); ov.remove(); });
    document.getElementById('hchat-call').addEventListener('click', () => this.startHumanCall(c.id));
    document.getElementById('hchat-share').addEventListener('click', openShare);
  },

  // 최근 7일을 상담사가 30초 만에 읽을 수 있는 요약으로 만든다.
  //  진단 언어를 쓰지 않고, 앱에 이미 있는 기록만 그대로 센다.
  _mindSummaryText() {
    const S = window.Storage;
    const from = Date.now() - 7 * 86400000;
    const moods = (S._safeGet('cbt_mood_log', []) || []).filter(m => m && m.ts >= from);
    const avg = moods.length
      ? (moods.reduce((s, m) => s + (typeof m.v === 'number' ? m.v : 3), 0) / moods.length).toFixed(1)
      : null;
    const trs = (S.getThoughtRecords() || []).filter(r => r.date && new Date(r.date).getTime() >= from);
    const nights = (S._safeGet('cbt_night_journal', []) || []).filter(j => j && j.ts >= from);
    const hwOpen = (window.Homework && window.Homework.open ? window.Homework.open() : []).length;
    let scores = null;
    try { scores = window.Assess && window.Assess.scores ? window.Assess.scores() : null; } catch (e) {}
    return [
      '[최근 7일 마음 요약]',
      `기분 체크인 ${moods.length}회` + (avg ? ` · 평균 ${avg}/5` : ''),
      `사고 기록 ${trs.length}건 · 하루 정리 ${nights.length}번`,
      scores && (scores.phq != null || scores.gad != null)
        ? `자가검진: PHQ-9 ${scores.phq != null ? scores.phq + '점' : '-'} · GAD-7 ${scores.gad != null ? scores.gad + '점' : '-'}`
        : '',
      hwOpen ? `진행 중인 상담 숙제 ${hwOpen}개` : '',
      '(우렁의사 앱에서 자동 정리된 요약이에요)'
    ].filter(Boolean).join('\n');
  },

  async resetChat() {
    if (await window.UI.confirm('모든 대화 내용이 삭제됩니다. (우렁의사가 당신에 대해 기억하는 것들은 지워지지 않아요)\n계속하시겠습니까?')) {
      window.Storage.clearMessages();
      window.Storage.clearSessionState();
      window.Chatbot.reset();
      const container = document.getElementById('chat-messages');
      if (container) container.innerHTML = '';
      this._lastMsgDay = null;
      this._chatWindow = 50;
      // '다시 묻지 않기'를 선택한 사용자에게는 모달 대신 현재 상담사가 바로 인사
      const optedOut = window.Storage && window.Storage._safeGet('cbt_persona_reprompt_off', false);
      if (optedOut && window.Personas && window.Personas.hasChosen()) {
        this._showPersonaGreeting(window.Personas.getActive().id);
      } else {
        this.showPersonaModal(false, '대화가 종료되었습니다. 새 대화를 시작할 AI 상담사를 선택하세요');
      }
    }
  },

  async resetAllAppData() {
 if (await window.UI.confirm('정말로 앱의 모든 데이터를 초기화하시겠습니까?\n\n· 모든 대화 내역 삭제\n· 모든 사고 기록지 및 기분 통계 삭제\n· AI 상담사의 장기기억 삭제\n· 상담사 선택 및 설정 초기화\n\n초기화 후에는 데이터를 복구할 수 없습니다.')) {
      if (await window.UI.confirm('마지막 확인: 초기화를 계속 진행하시겠습니까?')) {
        if (window.Storage && window.Storage.clearAllData) {
          window.Storage.clearAllData();
        } else {
          localStorage.clear();
        }
        window.UI.alert('앱의 모든 데이터가 성공적으로 초기화되었습니다.');
        window.location.reload();
      }
    }
  },
  
  _chatWindow: 50, // 처음엔 최근 50개만 렌더 — 긴 대화도 즉시 열린다

  loadExistingMessages() {
    const container = document.getElementById('chat-messages');
    const messages = window.Storage.getMessages() || [];
    if (!container) return;
    container.innerHTML = '';
    this._lastMsgDay = null;
    this._bulkLoading = true;

    const start = Math.max(0, messages.length - this._chatWindow);
    if (start > 0) {
      const more = document.createElement('button');
      more.id = 'chat-load-more';
      more.textContent = `↑ 이전 대화 ${start.toLocaleString()}개 더 보기`;
      more.style.cssText = 'align-self: center; margin: 0.4rem auto 0.6rem; border: 1px solid var(--glass-border); border-radius: 999px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 0.78rem; font-weight: 700; padding: 0.4rem 1rem; cursor: pointer; width: fit-content;';
      more.addEventListener('click', () => {
        // 보고 있던 위치가 튀지 않게: 바닥 기준 오프셋 유지
        const prevBottomOffset = container.scrollHeight - container.scrollTop;
        this._chatWindow += 100;
        this.loadExistingMessages();
        container.scrollTop = container.scrollHeight - prevBottomOffset;
      });
      container.appendChild(more);
    }
    messages.slice(start).forEach(msg => this.displayMessage(msg));
    this._bulkLoading = false;
    container.scrollTop = container.scrollHeight;

    // If chat is waiting for input from latest state, we might need quick replies.
    const state = window.Chatbot.getState();
    if (state && state.quickReplies) {
        this.displayQuickReplies(state.quickReplies);
    }
  },
  
  // === 안드로이드 뒤로가기: 앱이 꺼지는 대신 열린 오버레이가 닫히게 ===
  _initBackGuard() {
    // 뒤로가기로 닫아도 안전한 동적 오버레이 (통화는 실수 종료 방지를 위해 제외)
    const DYNAMIC = ['night-overlay', 'calm-overlay', 'sleep-overlay', 'tr-wizard', 'onboard-overlay',
      'admin-overlay', 'admin-code-overlay', 'hchat-overlay', 'chat-search-overlay', 'day-detail-overlay',
      'share-pack-overlay', 'report-send-overlay', 'cprof-edit-overlay'];
    const currentTop = () => {
      for (let i = document.body.children.length - 1; i >= 0; i--) {
        const el = document.body.children[i];
        if (el.id && DYNAMIC.includes(el.id)) return el;
      }
      const open = [...document.querySelectorAll('.modal-overlay')].filter(m => !m.classList.contains('hidden') && m.offsetParent !== null);
      return open[open.length - 1] || null;
    };
    // 오버레이가 열릴 때마다 히스토리 한 칸 → 뒤로가기가 '닫기'가 된다
    const mo = new MutationObserver(() => {
      const t = currentTop();
      if (t && !t.dataset.bp) {
        t.dataset.bp = '1';
        try { history.pushState({ ov: 1 }, ''); } catch (e) {}
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('popstate', () => {
      const t = currentTop();
      if (!t) return;
      delete t.dataset.bp;
      if (t.id === 'tr-wizard') {
        // 작성 중이면 확인을 거쳐 닫힌다 (내용 실수 유실 방지)
        if (window.ThoughtRecord) window.ThoughtRecord._wizClose();
        if (document.getElementById('tr-wizard')) { // 사용자가 취소함 → 히스토리 복구
          try { history.pushState({ ov: 1 }, ''); document.getElementById('tr-wizard').dataset.bp = '1'; } catch (e) {}
        }
        return;
      }
      if (t.id === 'hchat-overlay') clearInterval(this._hchatPoll);
      if (t.classList.contains('modal-overlay')) t.classList.add('hidden');
      else t.remove();
    });
  },

  // === 글자 크기 (접근성) ===
  initFontScale() {
    let scale = String(window.Storage._safeGet('cbt_font_scale', '100') || '100');
    // 구버전 단계(112/124)는 새 단계로 이관 (레이아웃 깨짐 방지)
    if (scale === '112') scale = '108';
    if (scale === '124') scale = '116';
    window.Storage._safeSet('cbt_font_scale', scale);
    document.documentElement.style.fontSize = scale + '%';
    const sel = document.getElementById('setting-font-scale');
    if (sel) sel.value = scale;
  },

  setFontScale(scale) {
    window.Storage._safeSet('cbt_font_scale', String(scale));
    document.documentElement.style.fontSize = scale + '%';
    this.showRecordToast(String(scale) === '100' ? '글자 크기: 보통' : String(scale) === '108' ? '글자 크기: 크게' : '글자 크기: 아주 크게');
  },

  // === Theme Management ===
  initTheme() {
    const saved = localStorage.getItem('cbt_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // 사용자가 명시적으로 저장한 테마가 있으면 그것을, 없으면 시스템 테마를 따름
    const themeToApply = saved ? saved : (prefersDark ? 'dark' : 'light');
    this.applyTheme(themeToApply);

    // 시스템 테마 변경 감지
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        // 사용자가 수동으로 테마를 고정하지 않은 경우에만 자동 전환
        if (!localStorage.getItem('cbt_theme')) {
          this.applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  },
  
  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    this.applyTheme(next);
    localStorage.setItem('cbt_theme', next);
  },
  
  applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    const btn = document.getElementById('btn-theme');
    if (btn && window.Icons) {
      btn.innerHTML = window.Icons.svg(theme === 'light' ? 'sun' : 'moon', { size: 20 });
    }
  },

  // === Pro Mode Management ===
  initProMode() {
    const isPro = window.Storage.getProMode();
    this.applyProModeUI(isPro);
  },
  
  applyProModeUI(isPro) {
    const btnPro = document.getElementById('btn-pro');
    if (isPro) {
      document.body.classList.add('pro-mode-active');
      if (btnPro) btnPro.style.background = 'var(--gradient-primary)';
      if (btnPro) btnPro.style.color = 'white';
    } else {
      document.body.classList.remove('pro-mode-active');
      if (btnPro) btnPro.style.background = '';
      if (btnPro) btnPro.style.color = 'var(--text-secondary)';
    }
  },
  
  showProModal() {
    const isPro = window.Storage.getProMode();
    if (isPro) {
      // Toggle off
      window.Storage.setProMode(false);
      this.applyProModeUI(false);
      this.updateSessionUI();
    } else {
      // Show modal to enter API key
      const modal = document.getElementById('api-modal');
      const input = document.getElementById('api-key-input');
      if (input) input.value = window.Storage.getApiKey() || '';
      if (modal) modal.classList.remove('hidden');
    }
  },
  
  hideProModal() {
    const modal = document.getElementById('api-modal');
    if (modal) modal.classList.add('hidden');
  },
  
  saveProModeSettings() {
    const input = document.getElementById('api-key-input');
    let key = input ? input.value.trim() : '';
    

    if (key) {
      window.Storage.setApiKey(key);
      window.Storage.setProMode(true);
      window.Storage.setProSessionCount(100); // Reset count on new purchase/login
      this.applyProModeUI(true);
      this.hideProModal();
      this.updateSessionUI();
      window.UI.alert("Pro 모드 결제가 완료되어 무제한으로 활성화되었습니다!");
    } else {
      window.UI.alert("결제 키를 입력해주세요.");
    }
  },
  
  // === Fullscreen Management ===
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => window.App.init());
