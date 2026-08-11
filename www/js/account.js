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
      ['우렁이의 기억', '대화 내용이 아니라, 우렁이가 간추린 요약이에요'],
      ['마음 리포트와 검사 결과', '점수 변화 그래프도 함께'],
      ['레벨·뱃지·옷·방·농장', '키운 것들이 사라지지 않게'],
      ['목표·안전계획·숙제·미션', '진행 상황 그대로'],
      ['캐시와 구독', '산 것이 없어지지 않게'],
      ['상담 예약과 후기', '']
    ],
    안올라감: [
      ['대화 원문', '우렁이와 나눈 이야기는 이 기기에만 있어요'],
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
      await this._exchange(handoff);
    }

    this.providers = await this._api('/api/oauth/providers')
      .then(d => (d && d.items) || []).catch(() => []);

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
        if (watch.has(k) && this._session()) this.push();   // 4초 뒤 한 번에
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
  //  구글·카카오는 앱 안 웹뷰에서의 로그인을 막기 때문에 바깥 브라우저로 나갔다 와야 하는데,
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
      location.href = base + '/api/oauth/' + provider + '/start?back=' + encodeURIComponent(location.origin);
      return;
    }
    // 스토어 앱: 구글·카카오가 앱 안 웹뷰 로그인을 막으므로 바깥 브라우저로 나간다.
    //  돌아오는 길은 딥링크가 아니라 '짝 번호 조회'다 — 웹뷰에서 딥링크 수신이
    //  막혀도(실기기에서 실제로 막혔다) 이 방식은 반드시 완성된다.
    const pair = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const back = location.origin + '/authdone.html';
    const url = base + '/api/oauth/' + provider + '/start?pair=' + pair
      + '&back=' + encodeURIComponent(back);
    const B = window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (B) B.open({ url }).catch(() => { location.href = url; });
    else location.href = url;
    this._pollPair(pair, B);
  },

  // 로그인이 끝났는지 2초마다 물어본다. 3분이면 포기 (사용자가 그냥 닫았을 수 있다)
  _pollPair(pair, B) {
    clearInterval(this._pairTimer);
    let tries = 0;
    this._pairTimer = setInterval(async () => {
      if (++tries > 90) { clearInterval(this._pairTimer); return; }
      try {
        const d = await this._api('/api/oauth/pair?pair=' + encodeURIComponent(pair));
        if (d && d.ready && d.code) {
          clearInterval(this._pairTimer);
          if (B) B.close().catch(() => {});
          await this._exchange(d.code);
        }
      } catch (e) {}
    }, 2000);
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
          const m = /[?&]auth=([\w-]+)/.exec(String(ev && ev.url) || '');
          if (!m) return;
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
    const meta = this._meta();
    const d = await this._api('/api/sync?session=' + encodeURIComponent(s) + '&since=0').catch(() => null);
    if (!d || !d.ok) return;
    let n = 0;
    Object.entries(d.items || {}).forEach(([k, it]) => {
      const mine = meta[k] || 0;
      if (it.updated <= mine) return;          // 내 것이 더 최신이면 그대로 둔다
      try { localStorage.setItem(k, it.v); meta[k] = it.updated; n++; } catch (e) {}
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
    const items = {};
    const t = Date.now();
    this.KEYS.forEach(k => {
      let v;
      try { v = localStorage.getItem(k); } catch (e) { return; }
      if (v == null) return;
      const stamp = meta['h:' + k];
      const h = this._hash(v);
      if (stamp === h) return;                 // 값이 그대로면 보낼 이유가 없다
      items[k] = { v, updated: t };
      meta['h:' + k] = h;
      meta[k] = t;
    });
    if (!Object.keys(items).length) return;

    const r = await this._post('/api/sync', { session: s, items }).catch(() => null);
    if (!r || !r.ok) return;                   // 실패하면 해시를 안 남겨 다음에 다시 보낸다
    this._setMeta(meta);
    return r.saved;
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
      body: '이 기기의 기록은 그대로 남아요.\n다시 로그인하면 계정에 저장된 내용을 받아옵니다.',
      okLabel: '로그아웃'
    })) return;
    const s = this._session();
    await this._post('/api/oauth/logout', { session: s }).catch(() => {});
    this._setSession(''); this._setMeta({}); this._cacheUser(null); this.user = null;
    this.render();
    if (window.App) window.App.showRecordToast('로그아웃했어요');
  },

  async removeAccount() {
    const typed = await window.UI.prompt({
      title: '계정을 삭제할까요?',
      body: '계정에 저장된 리포트·레벨·기억이 모두 지워집니다. 되돌릴 수 없어요.\n'
        + '이 기기 안의 기록은 남습니다.\n계속하려면 아래에 "삭제"라고 입력하세요.',
      placeholder: '삭제', okLabel: '계정 삭제', cancelLabel: '취소'
    });
    if (typed !== '삭제') { if (typed !== null) window.UI.alert('입력이 달라서 취소했어요'); return; }
    const s = this._session();
    await this._post('/api/sync/wipe', { session: s }).catch(() => {});
    const r = await this._post('/api/oauth/delete', { session: s }).catch(() => null);
    if (!r || !r.ok) { window.UI.alert('삭제하지 못했어요. 잠시 뒤 다시 시도해주세요.'); return; }
    // 계정을 지웠는데 이 폰에서 상담 알림이 계속 울리면 '안 지워졌다'로 읽힌다.
    //  이 기기의 구독만 끊는다(다른 기기는 그 기기에서 끊어야 한다).
    //  로그아웃에서는 하지 않는다 — 상담사 전화는 계정이 아니라 기기(clientId)로
    //  오기 때문에, 로그아웃했다고 끊으면 전화가 조용히 사라진다.
    if (window.App && window.App.unsubscribePushHere) await window.App.unsubscribePushHere();
    this._setSession(''); this._setMeta({}); this._cacheUser(null); this.user = null;
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
      kakao: 'background:#FEE500; color:#191600;',
      naver: 'background:#03C75A; color:#fff;',
      google: 'background:#fff; color:#3c4043; border:1px solid #dadce0;'
    };
    el.innerHTML = `
      <div style="padding:0.9rem 1rem 1rem;">
        <b style="display:block; font-size:0.88rem; color:var(--text-primary);">로그인하면 폰을 바꿔도 이어져요</b>
        <span style="display:block; font-size:0.74rem; color:var(--text-muted); line-height:1.55; margin-top:0.2rem;">
          리포트·레벨·우렁이의 기억이 따라와요.
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
