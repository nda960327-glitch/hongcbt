// ============================================================================
//  계정 — 소셜 로그인과 동기화
//
//  로그인은 '새 폰에서도 나를 알아보게' 하는 용도다.
//  올라가는 것은 결과물뿐이다 — 장기기억 요약, 마음 리포트, 검사 점수,
//  레벨과 아이템, 진행 상황. 대화 원문은 한 줄도 올라가지 않는다.
//
//  흰 목록은 서버(sync.js)에도 똑같이 있다. 여기서 실수로 대화를 담아도
//  서버가 거절한다. 두 번 쓰는 건 중복이지만, 대화가 새는 것보다 낫다.
// ============================================================================

window.Account = {
  // 서버가 받아주는 키. 여기 없는 건 애초에 보내지 않는다.
  KEYS: [
    'cbt_user_name', 'cbt_user_gender', 'cbt_user_concerns', 'cbt_active_persona',
    'cbt_lang', 'cbt_font_scale', 'cbt_sound_on', 'cbt_haptic_on',
    'cbt_tts_enabled', 'cbt_tts_gender', 'cbt_checkin_mode', 'cbt_checkin_times',
    'cbt_user_memory',
    'cbt_night_journal', 'cbt_kept_cards', 'cbt_mailbox',
    'cbt_my_reports', 'cbt_latest_summary_report', 'cbt_assessments',
    'cbt_assess_history', 'cbt_careplan', 'cbt_careplan_history',
    'cbt_mood_log', 'cbt_mood_entries', 'cbt_distortion_stats',
    'cbt_stamps', 'cbt_badges', 'cbt_level_seen', 'cbt_quiz_best', 'cbt_streak_shields',
    'cbt_closet_owned', 'cbt_closet_equipped', 'cbt_room_owned', 'cbt_room_placed',
    'cbt_farm_plots', 'cbt_farm_coins', 'cbt_farm_water', 'cbt_farm_stats',
    'cbt_sticker_packs',
    'cbt_goals', 'cbt_safety_plan', 'cbt_homework', 'cbt_weekly_letters',
    'cbt_mission_log', 'cbt_rx_mission_log', 'cbt_daily_mission',
    'cbt_active_days', 'cbt_total_chats', 'cbt_total_sessions',
    'cbt_checkin_count', 'cbt_breath_count', 'cbt_action_log',
    'cbt_cash', 'cbt_cash_history', 'cbt_sub_until', 'cbt_trial_start',
    'cbt_free_sessions', 'cbt_pro_mode',
    'cbt_bookings', 'cbt_reviews', 'cbt_favs', 'cbt_counselor_apps'
  ],

  // 사람에게 보여줄 설명. '무엇이 올라가나요'에 답할 수 없으면 신뢰받지 못한다.
  SCOPE_TEXT: {
    올라감: [
      ['느루의 기억', '대화 내용이 아니라, 느루가 간추린 요약이에요'],
      ['마음 리포트와 검사 결과', '점수 변화 그래프도 함께'],
      ['레벨·뱃지·옷·방·농장', '키운 것들이 사라지지 않게'],
      ['목표·안전계획·숙제·미션', '진행 상황 그대로'],
      ['캐시와 구독', '산 것이 없어지지 않게'],
      ['상담 예약과 후기', '']
    ],
    안올라감: [
      ['대화 원문', '느루와 나눈 이야기는 이 기기에만 있어요'],
      ['생각기록', '직접 쓰신 글은 올리지 않아요'],
      ['밤편지 초안', ''],
      ['전화번호·잠금 PIN', '']
    ]
  },

  _session() { try { return localStorage.getItem('cbt_account_session') || ''; } catch (e) { return ''; } },
  _setSession(v) {
    try { v ? localStorage.setItem('cbt_account_session', v) : localStorage.removeItem('cbt_account_session'); }
    catch (e) {}
  },
  // 마지막으로 확인된 '나'. 서버에 못 닿아도 로그인 칸(과 로그아웃)을 그릴 수 있어야 한다.
  _cachedUser() {
    try { return JSON.parse(localStorage.getItem('cbt_account_user') || 'null'); } catch (e) { return null; }
  },
  _cacheUser(u) {
    try {
      u ? localStorage.setItem('cbt_account_user', JSON.stringify(u))
        : localStorage.removeItem('cbt_account_user');
    } catch (e) {}
  },

  _meta() {
    try { return JSON.parse(localStorage.getItem('cbt_sync_meta') || '{}'); } catch (e) { return {}; }
  },

  // 다른 계정으로 로그인할 때 지우지 않고 남기는 값 — '사람'이 아니라 '이 기기'에 속한 것들.
  //  (기기 식별자·화면·소리·알림 설정·앱 잠금·서버 주소 판정 캐시 등)
  //  여기 없는 cbt_* 는 전 사용자의 기록으로 보고 지운다 (_wipeLocalUserData).
  DEVICE_KEYS: [
    'cbt_account_session', 'cbt_account_user', 'cbt_client_id', 'cbt_client_key', 'cbt_fcm_token',
    'cbt_theme', 'cbt_lang', 'cbt_font_scale', 'cbt_sound_on', 'cbt_haptic_on',
    'cbt_lock_on', 'cbt_lock_pin', 'cbt_consent', 'cbt_onboard_done', 'cbt_first_visit',
    'cbt_api_key', 'cbt_api_same_origin', 'cbt_api_same_origin_at', 'cbt_api_probe_ver', 'cbt_admin_code',
    'cbt_batt_asked', 'cbt_noti_guided', 'cbt_install_prompt_dismissed', 'cbt_home_variant', 'cbt_home_ab'
  ],
  DEVICE_PREFIXES: ['cbt_notif_'],

  // 공용 기기에서 다른 계정으로 로그인하면 앞사람의 기록을 지운다.
  //  안 지우면 뒷사람 화면에 앞사람의 리포트·기억·대화가 보이고, 동기화가 그걸 뒷사람 계정으로 올린다.
  //  지운 키 이름을 돌려준다(값은 남기지 않는다).
  _wipeLocalUserData() {
    const keep = new Set(this.DEVICE_KEYS);
    const gone = [];
    try {
      const all = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) all.push(k); }
      all.forEach(k => {
        if (!/^cbt_/.test(k) || keep.has(k) || this.DEVICE_PREFIXES.some(p => k.startsWith(p))) return;
        try { localStorage.removeItem(k); gone.push(k); } catch (e) {}
      });
    } catch (e) {}
    return gone;
  },

  // 로그인 CSRF 방지용 1회용 난수 — 우리가 시작한 로그인에서 돌아온 교환권만 쓴다
  _rand(n) {
    try { const b = new Uint8Array(n || 12); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
  },
  _newNonce() {
    const n = this._rand(12);
    try { sessionStorage.setItem('cbt_auth_cn', n); } catch (e) {}
    return n;
  },
  _takeNonce(cn) {
    let want = '';
    try { want = sessionStorage.getItem('cbt_auth_cn') || ''; sessionStorage.removeItem('cbt_auth_cn'); } catch (e) {}
    return !!cn && !!want && cn === want;
  },
  _setMeta(m) { try { localStorage.setItem('cbt_sync_meta', JSON.stringify(m)); } catch (e) {} },

  user: null,
  providers: [],
  _pushTimer: null,

  async init() {
    // 로그인하고 돌아온 길이면 주소에 1회용 교환권이 붙어 있다
    const p = new URLSearchParams(location.search);
    const handoff = p.get('auth');
    if (handoff) {
      history.replaceState(null, '', location.pathname + location.hash);   // 주소에 남기지 않는다
      // 이 탭에서 시작한 로그인(sessionStorage 난수 cn 일치)만 받는다.
      //  남이 자기 계정으로 로그인해 만든 ?auth= 링크를 보내면, 예전에는 그 계정으로 로그인돼
      //  내 기록이 남의 계정으로 올라갔다(로그인 CSRF).
      if (this._takeNonce(p.get('cn'))) await this._exchange(handoff);
      else {
        // app.js 는 ?auth= 가 있으면 로그인 게이트를 미뤄 두므로, 세션이 없으면 여기서 다시 띄운다
        try { const sc = document.getElementById('login-screen'); if (sc && !this._session()) sc.classList.remove('hidden'); } catch (e) {}
        if (window.UI) window.UI.alert('이 로그인 링크는 이 화면에서 시작한 로그인이 아니라서 사용하지 않았어요.\n로그인이 필요하면 다시 눌러주세요.');
      }
    }
    // 다른 계정으로 바꿔 로그인하고 새로 연 참이면 인사를 여기서 한다 (_exchange 가 새로고침했다)
    try {
      const sw = sessionStorage.getItem('cbt_acct_switched');
      if (sw != null) {
        sessionStorage.removeItem('cbt_acct_switched');
        if (window.UI) setTimeout(() => window.UI.alert(`${sw || ''}님, 반가워요!\n\n이 기기에 남아 있던 다른 계정의 기록은 지우고, 내 계정의 기록을 받아왔어요.`), 400);
      }
    } catch (e) {}
    // 스토어 앱: 바깥 브라우저에 가 있는 동안 웹뷰가 새로 떴다면 짝 번호 확인을 이어서 한다
    try {
      const pp = JSON.parse(sessionStorage.getItem('cbt_auth_pair') || 'null');
      if (pp && pp.pair && Date.now() - pp.at < 5 * 60 * 1000 && this._nativeScheme()) {
        this._pendingPair = pp.pair;
        this._pollPair(pp.pair, window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser);
      }
    } catch (e) {}

    this.providers = await this._api('/api/oauth/providers')
      .then(d => (d && d.items) || []).catch(() => [])
      // 카카오·네이버 제거(2026-09-29) — 옛 서버가 내려줘도 앱은 구글만 보여준다
      .then(items => items.filter(p => p.key === 'google'));

    if (this._session()) {
      // 확인이 안 됐다고 로그아웃시키면 안 된다.
      //  전에는 응답이 없으면 곧장 세션을 지웠는데, 지하철에서 앱을 켜면
      //  그 자리에서 로그아웃돼 버렸다. '서버가 아니라고 한 것'과
      //  '서버에 못 닿은 것'은 완전히 다른 일이다.
      this.user = this._cachedUser();          // 우선 지난번에 본 나로 그린다
      const d = await this._api('/api/oauth/me?session=' + encodeURIComponent(this._session()))
        .then(r => ({ got: true, d: r })).catch(() => ({ got: false }));
      if (d.got && d.d && d.d.ok) {
        this.user = d.d.user;
        this._cacheUser(d.d.user);
        // 예전 판에서 로그인해 둔 기기 — 기록 주인을 지금 계정으로 적어 둔다
        const m0 = this._meta();
        if (!m0.owner && d.d.user && d.d.user.id) { m0.owner = d.d.user.id; this._setMeta(m0); }
        await this.pull();
      } else if (d.got && d.d && d.d.ok === false) {
        this._setSession(''); this._cacheUser(null); this.user = null;   // 서버가 아니라고 했다
      }
      // d.got 이 false 면(네트워크 실패) 로그인 상태를 그대로 둔다
    }
    this.render();

    // 값이 바뀌면 올린다.
    //  저장하는 곳이 수십 군데라 하나씩 손대면 반드시 빠뜨린다.
    //  통로가 Storage._safeSet 하나뿐이니 거기서 한 번만 잡는다.
    if (window.Storage && window.Storage._safeSet && !window.Storage._syncHooked) {
      const orig = window.Storage._safeSet.bind(window.Storage);
      const watch = new Set(this.KEYS);
      window.Storage._safeSet = (k, v) => {
        const r = orig(k, v);
        if (watch.has(k)) {
          this._noteEdit(k);                                  // 바뀐 시각은 올릴 때가 아니라 지금
          if (this._session()) this.push();                   // 4초 뒤 한 번에
        }
        return r;
      };
      window.Storage._syncHooked = true;
    }

    // 앱을 내려놓을 때 한 번 더 올린다 — 그 순간이 가장 확실하다
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.push(true); });
    window.addEventListener('pagehide', () => this.push(true));
  },

  _api(path, opts) {
    return (window.Api && window.Api.json)
      ? window.Api.json(path, opts)
      : fetch(path, opts).then(r => r.ok ? r.json() : null);
  },
  _post(path, data) {
    return this._api(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  // 스토어 앱(Capacitor)인지. 앱이면 로그인 왕복을 딥링크로 받아야 한다 —
  //  구글은 앱 안 웹뷰에서의 로그인을 막기 때문에 바깥 브라우저로 나갔다 와야 하는데,
  //  그냥 https 주소로 돌아오면 브라우저에 로그인이 남고 앱은 계속 로그아웃 상태다.
  _nativeScheme() {
    try {
      const C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform()) return '';
      return (C.getAppId && C.getAppId()) || 'com.uroong.cbt';
    } catch (e) { return ''; }
  },

  login(provider) {
    const base = (window.Api && window.Api.base && window.Api.base()) || '';
    if (!base) {
      // 백엔드 주소를 모르면 같은 출처로 가는데, 정적 호스팅에는 /api 가 없어
      //  404 페이지만 뜬다. 조용히 실패하느니 왜 안 되는지 말해준다.
      if (window.UI) window.UI.alert('로그인 서버 주소를 불러오지 못했어요.\n앱을 새로고침한 뒤 다시 시도해주세요.');
      return;
    }
    const native = !!this._nativeScheme();
    if (!native) {
      // cn: 이 탭이 시작한 로그인이라는 표시. 돌아올 때 주소의 cn 과 맞아야 교환권을 쓴다.
      location.href = base + '/api/oauth/' + provider + '/start?back=' + encodeURIComponent(location.origin)
        + '&cn=' + this._newNonce();
      return;
    }
    // 스토어 앱: 구글이 앱 안 웹뷰 로그인을 막으므로 바깥 브라우저로 나간다.
    //  돌아오는 길은 딥링크가 아니라 '짝 번호 조회'다 — 웹뷰에서 딥링크 수신이
    //  막혀도(실기기에서 실제로 막혔다) 이 방식은 반드시 완성된다.
    //  단 짝 번호만으로는 교환권이 나오지 않는다(2026-10). 브라우저 화면에 뜬 6자리 확인 번호를
    //  사람이 앱에 넣어야 한다 — 남이 만든 로그인 링크로 내 계정 세션을 빼가지 못하게.
    const pair = 'p' + this._rand(12);
    this._pendingPair = pair; this._pairDone = '';
    try { sessionStorage.setItem('cbt_auth_pair', JSON.stringify({ pair, at: Date.now() })); } catch (e) {}
    const back = location.origin + '/authdone.html';
    const url = base + '/api/oauth/' + provider + '/start?pair=' + pair
      + '&back=' + encodeURIComponent(back);
    const B = window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (B) B.open({ url }).catch(() => { location.href = url; });
    else location.href = url;
    this._pollPair(pair, B);
  },

  // 로그인이 끝났는지 2초마다 물어본다. 3분이면 포기 (사용자가 그냥 닫았을 수 있다)
  //  끝났으면(ready) 확인 번호 입력 창을 띄운다. 브라우저는 닫지 않는다 — 번호가 거기 떠 있다.
  _pollPair(pair, B) {
    clearInterval(this._pairTimer);
    let tries = 0;
    this._pairTimer = setInterval(async () => {
      if (++tries > 90 || this._pairDone === pair) { clearInterval(this._pairTimer); return; }
      try {
        const d = await this._api('/api/oauth/pair?pair=' + encodeURIComponent(pair));
        if (d && d.ready) {
          clearInterval(this._pairTimer);
          this._askPairCode(pair, B);
        }
      } catch (e) {}
    }, 2000);
  },

  // 확인 번호 입력 — 틀리면 다시 묻는다 (서버가 5번에서 끊는다)
  async _askPairCode(pair, B) {
    if (!window.UI) return;
    let note = '';
    for (let i = 0; i < 6; i++) {
      const v = await window.UI.prompt({
        title: '확인 번호를 넣어주세요',
        body: (note ? note + '\n\n' : '') + '구글 로그인을 마친 브라우저 화면에 6자리 확인 번호가 떠 있어요.\n뒤로 가기로 이 화면에 돌아와 그 번호를 넣어주세요.',
        inputType: 'tel', maxLength: 7, placeholder: '000 000', okLabel: '로그인', cancelLabel: '취소'
      });
      if (this._pairDone === pair) return;          // 그 사이 딥링크로 끝났다
      if (v === null) return;                        // 취소
      const r = await this._confirmPair(pair, v, B);
      if (r.done) return;
      note = r.note || '';
    }
  },

  async _confirmPair(pair, pc, B) {
    if (this._pairDone === pair) return { done: true };
    const digits = String(pc || '').replace(/\D/g, '');
    if (digits.length !== 6) return { done: false, note: '숫자 6자리를 넣어주세요.' };
    let d = null;
    try {
      const r = window.Api && window.Api.post
        ? await window.Api.post('/api/oauth/pair/confirm', { pair, pc: digits })
        : null;
      d = r ? await r.json().catch(() => null) : null;
    } catch (e) { d = null; }
    if (d && d.ok && d.code) {
      if (this._pairDone === pair) return { done: true };
      this._pairDone = pair; this._pendingPair = '';
      try { sessionStorage.removeItem('cbt_auth_pair'); } catch (e) {}
      try { if (window.UI && window.UI.closeAll) window.UI.closeAll(); } catch (e) {}
      if (B) B.close().catch(() => {});
      await this._exchange(d.code);
      return { done: true };
    }
    if (d && d.error === 'bad-code') return { done: false, note: `번호가 달라요. (남은 기회 ${d.left}번)` };
    if (!d) return { done: false, note: '연결이 불안정해요. 다시 넣어주세요.' };
    this._pendingPair = '';
    try { sessionStorage.removeItem('cbt_auth_pair'); } catch (e) {}
    window.UI.alert(d.error === 'too-many' ? '확인 번호를 여러 번 틀려서 이번 로그인은 취소했어요.\n처음부터 다시 시도해주세요.' : '로그인 시간이 지났어요.\n처음부터 다시 시도해주세요.');
    return { done: true };
  },

  // 앱으로 되돌아온 딥링크(com.uroong.cbt://auth?auth=코드) 처리
  initDeepLink() {
    try {
      const C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform() || !C.Plugins || !C.Plugins.App) return;
      if (this._dlBound) return;
      this._dlBound = true;
      C.Plugins.App.addListener('appUrlOpen', (ev) => {
        try {
          const u = String(ev && ev.url || '');
          // authdone.html 의 '앱으로 돌아가기' — 짝 번호 + 확인 번호. 내가 지금 기다리는 짝 번호일 때만 쓴다.
          const mp = /[?&]pair=([\w-]+)/.exec(u), mc = /[?&]pc=(\d{6})/.exec(u);
          if (mp && mc) {
            if (this._pendingPair && this._pendingPair === mp[1]) this._confirmPair(mp[1], mc[1], C.Plugins.Browser);
            return;
          }
          const m = /[?&]auth=([\w-]+)/.exec(u);
          if (!m) return;
          // 교환권을 직접 실은 딥링크는 이 기기에서 시작한 로그인(cn 일치)일 때만 받는다 — 로그인 CSRF 방지
          const c = /[?&]cn=([\w-]+)/.exec(u);
          if (!this._takeNonce(c && c[1])) return;
          if (C.Plugins.Browser) C.Plugins.Browser.close().catch(() => {});
          this._exchange(m[1]);
        } catch (e) {}
      });
    } catch (e) {}
  },

  async _exchange(code) {
    const d = await this._post('/api/oauth/exchange', { code }).catch(() => null);
    if (!d || !d.ok) {
      if (window.UI) window.UI.alert('로그인이 만료됐어요.\n다시 시도해주세요.');
      return;
    }
    // 이 기기 기록의 주인(cbt_sync_meta.owner)과 다른 계정이면 앞사람의 기록을 먼저 지운다.
    //  (주인이 적혀 있지 않은 예전 기기는 누구 것인지 알 수 없어 지우지 않고, 지금 계정을 주인으로 적는다)
    const prevOwner = this._meta().owner;
    const switched = !!(prevOwner && d.user && d.user.id && prevOwner !== d.user.id);
    if (switched) this._wipeLocalUserData();
    { const m = switched ? {} : this._meta(); m.owner = d.user && d.user.id; this._setMeta(m); }
    this._setSession(d.session);
    this.user = d.user;
    this._cacheUser(d.user);
    // 로그인 게이트를 내린다 — 앱(웹뷰)은 페이지를 새로 열지 않고 이 자리에서
    //  로그인이 끝나므로, 여기서 안 내리면 게이트가 화면을 영원히 덮는다.
    try {
      const sc = document.getElementById('login-screen');
      if (sc) sc.classList.add('hidden');
    } catch (e) {}
    if (window.Sfx) { try { window.Sfx.hit('levelup'); } catch (e) {} }
    await this.pull();
    if (switched) {
      // 화면·메모리에 남은 앞사람 상태까지 비우려면 새로 여는 게 가장 확실하다
      try { sessionStorage.setItem('cbt_acct_switched', (d.user && d.user.nickname) || ''); } catch (e) {}
      location.reload();
      return;
    }
    if (window.UI) {
      window.UI.alert(`${d.user.nickname || ''}님, 반가워요!\n\n이제 폰을 바꿔도 리포트와 레벨이 따라와요.\n대화 내용은 이 기기에만 남습니다.`);
    }
    this.render();
  },

  // ── 내려받기 ────────────────────────────────────────────────────────
  //  서버가 더 최신인 키만 기기에 덮는다.
  async pull() {
    const s = this._session();
    if (!s) return;
    const d = await this._api('/api/sync?session=' + encodeURIComponent(s) + '&since=0').catch(() => null);
    if (!d || !d.ok) return;
    const meta = this._meta();                 // 기다리는 사이 바뀐 시각이 적혔을 수 있어 받은 뒤에 읽는다
    let n = 0;
    Object.entries(d.items || {}).forEach(([k, it]) => {
      const mine = meta[k] || 0;
      if (it.updated <= mine) return;          // 내 것이 더 최신이면 그대로 둔다
      try {
        localStorage.setItem(k, it.v);
        meta[k] = it.updated;
        // 받은 값의 해시를 적어 둔다 — 안 적으면 다음 push 가 '바뀌었다'고 보고
        //  방금 받은 값을 지금 시각으로 다시 올려, 다른 기기의 더 새 값을 덮었다.
        meta['h:' + k] = this._hash(it.v);
        delete meta['t:' + k];
        n++;
      } catch (e) {}
    });
    this._setMeta(meta);
    if (n) {
      // 화면을 다시 그려야 새로 받은 레벨·리포트가 보인다
      ['renderMyBookings', 'renderCounselorApps', 'updateDashboard'].forEach(fn => {
        if (window.App && typeof window.App[fn] === 'function') { try { window.App[fn](); } catch (e) {} }
      });
      if (window.Game && window.Game.refresh) { try { window.Game.refresh(); } catch (e) {} }
    }
    return n;
  },

  // ── 올리기 ──────────────────────────────────────────────────────────
  //  값이 바뀐 키만 보낸다. 매번 전부 보내면 요금도 배터리도 낭비다.
  async push(now) {
    const s = this._session();
    if (!s) return;
    clearTimeout(this._pushTimer);
    if (!now) { this._pushTimer = setTimeout(() => this.push(true), 4000); return; }

    const meta = this._meta();
    const items = {}, sent = {};
    const t = Date.now();
    this.KEYS.forEach(k => {
      let v;
      try { v = localStorage.getItem(k); } catch (e) { return; }
      if (v == null) return;
      const stamp = meta['h:' + k];
      const h = this._hash(v);
      if (stamp === h) return;                 // 값이 그대로면 보낼 이유가 없다
      // 올리는 시각이 아니라 '이 기기에서 실제로 바뀐 시각'(_noteEdit)을 붙인다.
      //  올리는 시각을 붙이면 오래 오프라인이던 기기가 옛 값을 '최신'으로 올려 다른 기기 값을 덮는다.
      //  감지하지 못한 변경(저장 통로를 거치지 않은 쓰기)만 지금 시각으로 올린다.
      const at = Math.min(t, meta['t:' + k] || t);
      items[k] = { v, updated: at };
      sent[k] = { h, at };
    });
    if (!Object.keys(items).length) return;

    const r = await this._post('/api/sync', { session: s, items }).catch(() => null);
    if (!r || !r.ok) return;                   // 실패하면 해시를 안 남겨 다음에 다시 보낸다
    // 기다리는 사이 다른 변경이 적혔을 수 있으니 다시 읽어서, 보낸 값이 아직 그대로인 키만 '보냄'으로 적는다
    const m2 = this._meta();
    Object.entries(sent).forEach(([k, x]) => {
      let now = null;
      try { now = localStorage.getItem(k); } catch (e) {}
      if (now == null || this._hash(now) !== x.h) return;   // 그 사이 또 바뀌었다 — 다음에 다시 보낸다
      m2['h:' + k] = x.h;
      m2[k] = Math.max(m2[k] || 0, x.at);
      delete m2['t:' + k];
    });
    this._setMeta(m2);
    // 서버에 더 새 값이 있어 건너뛴 키가 있으면 그 값을 받아 온다 (내 옛 값이 이긴 것처럼 남지 않게)
    if (r.skipped && r.skipped.length) this.pull();
    return r.saved;
  },

  // 저장 통로(Storage._safeSet)로 동기화 키가 바뀐 순간을 적는다.
  //  해시가 마지막으로 맞춘 값(보냈거나 받은 값)과 다를 때만 — 같은 값을 다시 저장한 건 변경이 아니다.
  _noteEdit(k) {
    try {
      const v = localStorage.getItem(k);
      if (v == null) return;
      const meta = this._meta();
      if (meta['h:' + k] === this._hash(v)) { if (meta['t:' + k]) { delete meta['t:' + k]; this._setMeta(meta); } return; }
      const now = Date.now();
      meta['t:' + k] = now;
      meta[k] = Math.max(meta[k] || 0, now);   // pull 이 이보다 옛 서버 값으로 덮지 않게
      this._setMeta(meta);
    } catch (e) {}
  },

  // 값이 바뀌었는지만 알면 되므로 짧은 해시로 충분하다
  _hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h + ':' + s.length;
  },

  async logout() {
    if (window.UI && !await window.UI.confirm({
      title: '로그아웃할까요?',
      body: '이 기기의 기록은 그대로 남아요.\n다시 로그인하면 계정에 저장된 내용을 받아옵니다.\n\n다른 계정으로 로그인하면, 이 기기에 남은 기록은 지워지고 그 계정의 기록을 받아와요.',
      okLabel: '로그아웃'
    })) return;
    const s = this._session();
    await this._post('/api/oauth/logout', { session: s }).catch(() => {});
    // meta(동기화 시계)는 지우지 않는다.
    //  지우면 다음 pull 에서 mine=0 이 되어 59개 키를 서버 스냅샷으로 무조건
    //  덮어써, 로그아웃 중 이 기기에 쓴 기록이 전멸했다("기록은 남아요"가 거짓말이 됨).
    //  meta 를 유지하면 재로그인 시 로컬/서버가 정상 병합된다.
    //  (계정 삭제는 사용자가 전체 삭제를 의도한 것이라 removeAccount 쪽은 그대로 둔다.)
    //  meta.owner(기록 주인)도 남는다 — 다음에 '다른' 계정이 로그인하면 이 기기의 기록을 먼저 지운다(_exchange).
    this._setSession(''); this._cacheUser(null); this.user = null;
    this.render();
    // 로그아웃하면 로그인 화면을 다시 띄운다 — 안 그러면 화면에 남아 조용히 401 난다.
    try {
      const sc = document.getElementById('login-screen');
      if (sc) sc.classList.remove('hidden');
    } catch (e) {}
    if (window.App) window.App.showRecordToast('로그아웃했어요');
  },

  async removeAccount() {
    const typed = await window.UI.prompt({
      title: '계정을 삭제할까요?',
      body: '계정에 저장된 리포트·레벨·기억이 모두 지워집니다. 되돌릴 수 없어요.\n'
        + '담당 상담소와 연결돼 있었다면 그 연결 정보(이름·생년)와 주간 요약도 지워집니다.\n'
        + '이 기기 안의 기록은 남습니다 (다른 계정으로 로그인하면 그때 지워져요).\n계속하려면 아래에 "삭제"라고 입력하세요.',
      placeholder: '삭제', okLabel: '계정 삭제', cancelLabel: '취소'
    });
    if (typed !== '삭제') { if (typed !== null) window.UI.alert('입력이 달라서 취소했어요'); return; }
    const s = this._session();
    // 계정에 올라간 값(user_data)은 이제 /oauth/delete 가 같은 트랜잭션에서 지운다.
    //  /sync/wipe 는 옛 서버를 위한 것이라 남겨 두되, 결과에 기대지 않는다.
    await this._post('/api/sync/wipe', { session: s }).catch(() => {});
    const r = await this._post('/api/oauth/delete', { session: s }).catch(() => null);
    if (!r || !r.ok) { window.UI.alert('삭제하지 못했어요. 잠시 뒤 다시 시도해주세요.'); return; }
    // 기기(clientId)에 묶인 상담소 연결 정보도 지운다 — clientKey 는 Api 가 자동으로 붙인다
    try {
      const cid = window.App && window.App.clientId ? window.App.clientId() : '';
      if (cid && window.Api && window.Api.post) await window.Api.post('/api/patient/erase', { clientId: cid }).catch(() => null);
      try { localStorage.removeItem('cbt_hospital_link'); localStorage.removeItem('cbt_hospital_records'); } catch (e) {}
    } catch (e) {}
    // 계정을 지웠는데 이 폰에서 상담 알림이 계속 울리면 '안 지워졌다'로 읽힌다.
    //  이 기기의 구독만 끊는다(다른 기기는 그 기기에서 끊어야 한다).
    //  로그아웃에서는 하지 않는다 — 상담사 전화는 계정이 아니라 기기(clientId)로
    //  오기 때문에, 로그아웃했다고 끊으면 전화가 조용히 사라진다.
    if (window.App && window.App.unsubscribePushHere) await window.App.unsubscribePushHere();
    // 동기화 시계는 비우되 기록 주인은 남긴다 — 이 기기에 남은 기록이 다음에 로그인하는
    //  다른 사람의 계정으로 올라가지 않게 (_exchange 가 주인이 다르면 먼저 지운다)
    { const owner = this._meta().owner; this._setMeta(owner ? { owner } : {}); }
    this._setSession(''); this._cacheUser(null); this.user = null;
    this.render();
    window.UI.alert('계정을 삭제했어요.');
  },

  scopeSheet() {
    const row = ([t, d], on) => `
      <div style="display:flex; gap:0.5rem; align-items:flex-start; padding:0.45rem 0;">
        <span style="flex-shrink:0; width:1.1rem; text-align:center; font-weight:800; color:${on ? 'var(--accent-primary)' : '#c14a4a'};">${on ? '↑' : '×'}</span>
        <div style="flex:1 1 8rem; min-width:0;">
          <b style="font-size:0.84rem; color:var(--text-primary);">${t}</b>
          ${d ? `<div style="font-size:0.74rem; color:var(--text-muted); line-height:1.5;">${d}</div>` : ''}
        </div>
      </div>`;
    window.UI.alert({
      title: '계정에 무엇이 저장되나요',
      html: `
        <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.6; margin:0 0 0.8rem;">
          결과물만 올라가고, <b style="color:var(--text-primary);">대화 원문은 올라가지 않아요.</b>
          저장되는 값은 서버에서 암호화돼요.</p>
        <p style="margin:0.6rem 0 0.2rem; font-size:0.76rem; font-weight:800; color:var(--accent-primary);">계정에 저장돼요</p>
        ${this.SCOPE_TEXT.올라감.map(x => row(x, true)).join('')}
        <p style="margin:0.9rem 0 0.2rem; font-size:0.76rem; font-weight:800; color:#c14a4a;">이 기기에만 남아요</p>
        ${this.SCOPE_TEXT.안올라감.map(x => row(x, false)).join('')}`
    });
  },

  // ── 계정 칸 ─────────────────────────────────────────────────────────
  //  마이 탭과 설정, 두 곳에 같은 내용을 그린다.
  //  로그아웃은 설정에서 먼저 찾기 때문에 한쪽에만 두면 '없다'고 여긴다.
  render() {
    ['account-box', 'account-box-settings'].forEach(id => this._renderInto(id));
  },

  _renderInto(boxId) {
    const el = document.getElementById(boxId);
    if (!el) return;
    const esc = t => String(t || '').replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
    // kakao·naver 는 새 로그인에서 뺐지만(2026-09-29), 옛 세션 표시용으로 이름은 남긴다
    const NAME = { kakao: '카카오', naver: '네이버', google: '구글' };

    if (this.user) {
      el.innerHTML = `
        <div class="my-row my-row--static">
          <span class="my-row__ico">${window.Icons ? window.Icons.svg('shield', { size: 20 }) : ''}</span>
          <div class="my-row__txt">
            <b>${esc(this.user.nickname || '내 계정')}</b>
            <span>${NAME[this.user.provider] || this.user.provider} 로그인 · 폰을 바꿔도 따라와요</span>
          </div>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:0.4rem; padding:0.6rem 1rem 0.9rem;">
          <button class="btn-secondary" style="width:auto; font-size:0.74rem; padding:0.35rem 0.7rem;" onclick="window.Account.scopeSheet()">무엇이 저장되나요?</button>
          <button class="btn-secondary" style="width:auto; font-size:0.74rem; padding:0.35rem 0.7rem;" onclick="window.Account.pull().then(n=>window.App.showRecordToast(n?n+'개 항목을 받아왔어요':'이미 최신이에요'))">지금 동기화</button>
          <button class="btn-secondary" style="width:auto; font-size:0.74rem; padding:0.35rem 0.7rem;" onclick="window.Account.logout()">로그아웃</button>
          <button class="btn-secondary" style="width:auto; font-size:0.74rem; padding:0.35rem 0.7rem; color:#c14a4a;" onclick="window.Account.removeAccount()">계정 삭제</button>
        </div>`;
      return;
    }

    // 로그인 수단을 아직 못 받아왔을 때(오프라인·첫 로딩).
    //  마이 탭은 비워 두지만, 설정의 '계정' 칸은 비면 고장난 것처럼 보인다.
    if (!this.providers.length) {
      el.innerHTML = boxId === 'account-box-settings'
        ? `<p style="font-size:0.8rem; color:var(--text-muted); line-height:1.6; margin:0.2rem 0 0;">
             로그인하면 폰을 바꿔도 리포트와 레벨이 따라와요.<br>
             지금은 연결이 어려워 로그인 수단을 불러오지 못했어요.
             <button style="all:unset; cursor:pointer; color:var(--accent-primary); font-weight:700;"
               onclick="window.Account.init()">다시 시도</button></p>`
        : '';
      return;
    }
    const BTN = {
      google: 'background:#fff; color:#3c4043; border:1px solid #dadce0;'
    };
    el.innerHTML = `
      <div style="padding:0.9rem 1rem 1rem;">
        <b style="display:block; font-size:0.88rem; color:var(--text-primary);">로그인하면 폰을 바꿔도 이어져요</b>
        <span style="display:block; font-size:0.74rem; color:var(--text-muted); line-height:1.55; margin-top:0.2rem;">
          리포트·레벨·느루의 기억이 따라와요.
          <b style="color:var(--text-secondary);">대화 내용은 올라가지 않아요.</b></span>
        <div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.7rem;">
          ${this.providers.map(p => `
            <button onclick="window.Account.login('${p.key}')"
              style="all:unset; box-sizing:border-box; cursor:pointer; text-align:center; width:100%;
                     padding:0.7rem; border-radius:12px; font-weight:800; font-size:0.88rem; ${BTN[p.key] || ''}">
              ${esc(p.name)}로 시작하기</button>`).join('')}
        </div>
        <button class="btn-text" style="margin-top:0.5rem; font-size:0.72rem; color:var(--text-muted); background:none; border:0; cursor:pointer; padding:0.3rem;"
          onclick="window.Account.scopeSheet()">무엇이 저장되나요?</button>
      </div>`;
  }
};
