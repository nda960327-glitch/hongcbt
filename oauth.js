// ============================================================================
//  소셜 로그인 — 카카오 · 네이버 · 구글
//
//  하는 일은 '이 사람이 누구인지 확인하는 것' 하나뿐이다.
//  대화·검사·리포트는 여전히 기기 안에만 있고 여기로 올라오지 않는다.
//  그래서 이 파일이 만드는 표에는 상담 내용이 한 줄도 없다.
//
//  흐름
//   1. 앱이 /oauth/kakao/start 로 보낸다 → 서버가 state 를 만들고 카카오로 보냄
//   2. 사용자가 동의 → 카카오가 /oauth/kakao/callback 으로 code 를 들고 돌아옴
//   3. 서버가 code 를 토큰으로 바꾸고(비밀키는 서버에만 있다) 프로필을 읽는다
//   4. 세션을 만들고, 앱으로는 '1회용 교환권'만 주소에 실어 돌려보낸다
//   5. 앱이 그 교환권을 POST 로 세션과 바꾼다
//
//  4번이 중요하다. 세션 토큰을 그대로 주소창에 실으면 방문기록·리퍼러·
//  공유 링크에 로그인 자격이 통째로 남는다. 교환권은 60초, 한 번만 쓰인다.
// ============================================================================

const STATE_TTL = 10 * 60 * 1000;      // 로그인 창을 10분 안에는 끝내야 한다
const HANDOFF_TTL = 60 * 1000;         // 돌아오자마자 바꾼다. 길 이유가 없다
const SESSION_TTL = 180 * 86400000;    // 반년. 마음 앱을 매번 다시 로그인시키지 않는다

const nowMs = () => Date.now();
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 10);

function token(n) {
  const b = new Uint8Array(n || 24);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// ── 사업자별 주소와 키 ────────────────────────────────────────────────
//  비밀키는 전부 시크릿으로만 들어온다. 이 파일에는 값이 없다.
const PROVIDERS = {
  kakao: {
    name: '카카오',
    auth: 'https://kauth.kakao.com/oauth/authorize',
    token: 'https://kauth.kakao.com/oauth/token',
    profile: 'https://kapi.kakao.com/v2/user/me',
    scope: 'account_email profile_nickname',
    // 카카오의 Client Secret 은 콘솔에서 켜야 생기는 '선택' 값이다.
    //  필수로 요구했더니 REST API 키만 넣은 상태에서 버튼이 아예 안 떴다.
    secretOptional: true,
    id: e => e.KAKAO_CLIENT_ID, secret: e => e.KAKAO_CLIENT_SECRET,
    parse: p => ({
      uid: String(p.id),
      email: (p.kakao_account && p.kakao_account.email) || '',
      nickname: (p.kakao_account && p.kakao_account.profile && p.kakao_account.profile.nickname) || ''
    })
  },
  naver: {
    name: '네이버',
    auth: 'https://nid.naver.com/oauth2.0/authorize',
    token: 'https://nid.naver.com/oauth2.0/token',
    profile: 'https://openapi.naver.com/v1/nid/me',
    scope: '',
    id: e => e.NAVER_CLIENT_ID, secret: e => e.NAVER_CLIENT_SECRET,
    parse: p => {
      const r = p.response || {};
      return { uid: String(r.id || ''), email: r.email || '', nickname: r.nickname || r.name || '' };
    }
  },
  google: {
    name: '구글',
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    profile: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    id: e => e.GOOGLE_CLIENT_ID, secret: e => e.GOOGLE_CLIENT_SECRET,
    parse: p => ({ uid: String(p.sub || ''), email: p.email || '', nickname: p.name || '' })
  }
};

const configured = (env, key) => {
  const p = PROVIDERS[key];
  if (!p || !p.id(env)) return false;
  return p.secretOptional ? true : !!p.secret(env);
};

// 콜백 주소는 사업자 콘솔에 등록한 것과 '글자 하나까지' 같아야 한다.
//  다르면 로그인 직전에 redirect_uri_mismatch 로 튕긴다.
const callbackUrl = (env, url, key) =>
  (env.OAUTH_BASE || url.origin).replace(/\/+$/, '') + '/api/oauth/' + key + '/callback';

// 돌아갈 앱 주소. 아무 데나 돌려보내면 오픈 리디렉터가 된다 — 아는 곳만.
function safeBack(env, want) {
  const w = String(want || '').replace(/\/+$/, '');
  // 스토어 앱은 딥링크로 돌아온다. https 로 돌려보내면 로그인이 브라우저에 남고
  //  앱은 계속 로그아웃 상태가 된다 — 앱이 '안 되는' 것처럼 보이던 진짜 이유.
  //  우리 앱의 스킴만 허용한다 (아무 스킴이나 열어주면 오픈 리디렉터가 된다).
  if (/^com\.uroong\.(cbt|pro):\/\//.test(w)) return w;
  const allow = [env.APP_URL, env.PRO_URL, 'https://neurumind.com', 'https://www.neurumind.com']
    .filter(Boolean).map(x => String(x).replace(/\/+$/, ''));
  if (w && allow.some(a => w === a || w.startsWith(a + '/'))) return w;
  return allow[0] || 'https://neurumind.com';
}

async function upsertUser(db, provider, prof) {
  const t = nowMs();
  const found = await db.prepare(
    'SELECT id FROM users WHERE provider = ? AND provider_uid = ?'
  ).bind(provider, prof.uid).first();

  if (found) {
    // 닉네임·이메일은 바뀔 수 있다. 마지막에 본 값으로 맞춰 둔다.
    await db.prepare(
      'UPDATE users SET email = ?, nickname = ?, last_seen = ? WHERE id = ?'
    ).bind(prof.email || null, prof.nickname || null, t, found.id).run();
    return found.id;
  }
  const id = rid('u');
  await db.prepare(
    'INSERT INTO users (id, provider, provider_uid, email, nickname, created, last_seen) VALUES (?,?,?,?,?,?,?)'
  ).bind(id, provider, prof.uid, prof.email || null, prof.nickname || null, t, t).run();
  return id;
}

export async function resolveUser(db, sessionToken) {
  if (!db || !sessionToken) return null;
  const s = await db.prepare(
    `SELECT u.id, u.provider, u.email, u.nickname, u.created, s.token
       FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires > ?`
  ).bind(String(sessionToken).slice(0, 128), nowMs()).first();
  if (!s) return null;
  await db.prepare('UPDATE user_sessions SET last_seen = ? WHERE token = ?').bind(nowMs(), s.token).run();
  return s;
}

// 돌아갈 때 보여줄 오류 화면. 흰 화면에 영어 코드만 뜨면 아무도 못 고친다.
function errPage(msg, back) {
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>로그인하지 못했어요</title></head>
     <body style="font-family:'Noto Sans KR',-apple-system,sans-serif;background:#faf5ee;color:#362f28;
                  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem;">
       <div style="max-width:320px;text-align:center;">
         <h1 style="font-size:1.05rem;margin:0 0 0.6rem;">로그인하지 못했어요</h1>
         <p style="font-size:0.85rem;color:#7f7264;line-height:1.6;margin:0 0 1.2rem;">${msg}</p>
         <a href="${back}" style="display:inline-block;background:#4f8a6b;color:#fff;text-decoration:none;
            font-weight:700;font-size:0.92rem;padding:0.8rem 1.5rem;border-radius:999px;">앱으로 돌아가기</a>
       </div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ── 라우팅 ───────────────────────────────────────────────────────────
export async function handleOauth(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const method = request.method;
  const q = k => url.searchParams.get(k) || '';

  // 어떤 로그인 버튼을 보여줄지. 키가 없는 건 눌러도 안 되므로 아예 숨긴다.
  if (path === '/oauth/providers' && method === 'GET') {
    return json({
      items: Object.keys(PROVIDERS)
        .filter(k => configured(env, k))
        .map(k => ({ key: k, name: PROVIDERS[k].name }))
    }, 200, cors);
  }

  const m = path.match(/^\/oauth\/(kakao|naver|google)\/(start|callback)$/);
  if (m) {
    const key = m[1], step = m[2], P = PROVIDERS[key];
    const back = safeBack(env, q('back'));

    if (!configured(env, key)) {
      return step === 'start'
        ? errPage(`${P.name} 로그인이 아직 설정되지 않았어요. 잠시 뒤 다시 시도해주세요.`, back)
        : errPage(`${P.name} 로그인이 아직 설정되지 않았어요.`, back);
    }

    // ── 1단계: 사업자에게 보낸다 ────────────────────────────────────
    if (step === 'start') {
      const st = token(16);
      // pair: 스토어 앱이 들고 오는 '짝 번호'. 앱은 딥링크를 기다리지 않고
      //  이 번호로 서버에 물어본다 — 웹뷰에서 딥링크 수신이 막혀도 로그인이 된다.
      const pair = String(q('pair') || '').replace(/[^\w-]/g, '').slice(0, 40) || null;
      await db.prepare('INSERT INTO oauth_state (state, provider, back, expires, pair) VALUES (?,?,?,?,?)')
        .bind(st, key, back, nowMs() + STATE_TTL, pair).run();
      // 오래된 state 는 같이 치운다 (따로 도는 청소 작업을 두지 않기 위해)
      await db.prepare('DELETE FROM oauth_state WHERE expires < ?').bind(nowMs()).run();

      const p = new URLSearchParams({
        response_type: 'code',
        client_id: P.id(env),
        redirect_uri: callbackUrl(env, url, key),
        state: st
      });
      if (P.scope) p.set('scope', P.scope);
      return Response.redirect(P.auth + '?' + p.toString(), 302);
    }

    // ── 2단계: 돌아왔다 ─────────────────────────────────────────────
    const code = q('code'), st = q('state');
    if (q('error')) return errPage('로그인을 취소하셨어요.', back);
    if (!code || !st) return errPage('로그인 정보가 올바르지 않아요.', back);

    // state 는 한 번만 쓰인다. 지우면서 확인한다.
    const row = await db.prepare('SELECT * FROM oauth_state WHERE state = ? AND provider = ?')
      .bind(st, key).first();
    await db.prepare('DELETE FROM oauth_state WHERE state = ?').bind(st).run();
    if (!row || row.expires < nowMs()) {
      return errPage('로그인 시간이 만료됐어요. 다시 시도해주세요.', back);
    }
    const realBack = safeBack(env, row.back);

    // code → access_token (비밀키가 필요하므로 반드시 서버에서)
    let tok;
    try {
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: P.id(env),
        redirect_uri: callbackUrl(env, url, key),
        code, state: st
      });
      // 카카오는 콘솔에서 Client Secret 을 켰을 때만 보내야 한다.
      //  안 켰는데 빈 값을 보내면 거절당한다.
      if (P.secret(env)) form.set('client_secret', P.secret(env));
      const r = await fetch(P.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      tok = await r.json();
    } catch (e) {
      return errPage('로그인 서버에 연결하지 못했어요.', realBack);
    }
    if (!tok || !tok.access_token) {
      return errPage(`${P.name}에서 로그인을 확인하지 못했어요. 다시 시도해주세요.`, realBack);
    }

    // 프로필 조회
    let prof;
    try {
      const r = await fetch(P.profile, { headers: { Authorization: 'Bearer ' + tok.access_token } });
      prof = P.parse(await r.json());
    } catch (e) {
      return errPage('회원 정보를 읽지 못했어요.', realBack);
    }
    if (!prof || !prof.uid) return errPage('회원 정보를 읽지 못했어요.', realBack);

    const userId = await upsertUser(db, key, prof);

    // 세션은 서버에 두고, 주소에는 1회용 교환권만 실어 보낸다
    const handoff = token(20);
    await db.prepare('INSERT INTO oauth_handoff (code, user_id, expires, pair) VALUES (?,?,?,?)')
      .bind(handoff, userId, nowMs() + HANDOFF_TTL, row.pair || null).run();
    await db.prepare('DELETE FROM oauth_handoff WHERE expires < ?').bind(nowMs()).run();

    // 딥링크(com.uroong.cbt://auth)는 경로를 덧붙이면 안 된다 — 그대로 물음표만 붙인다
    const isDeep = /^com\.uroong\.(cbt|pro):\/\//.test(realBack);
    return Response.redirect(isDeep ? realBack + '?auth=' + handoff : realBack + '/?auth=' + handoff, 302);
  }

  // ── 짝 번호 조회 (스토어 앱 전용) ───────────────────────────────
  //  앱은 브라우저에서 로그인이 끝났는지를 이 번호로 물어본다.
  //  딥링크가 막힌 웹뷰에서도 로그인이 완성되는 유일하게 확실한 길.
  //  교환권 자체를 돌려줄 뿐이고, 세션은 앱이 /oauth/exchange 로 다시 받아간다.
  if (path === '/oauth/pair' && method === 'GET') {
    const pair = String(q('pair') || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!pair) return json({ error: 'missing' }, 400, cors);
    const h = await db.prepare(
      'SELECT code, expires FROM oauth_handoff WHERE pair = ? ORDER BY expires DESC LIMIT 1'
    ).bind(pair).first();
    if (!h || h.expires < nowMs()) return json({ ok: true, ready: false }, 200, cors);
    return json({ ok: true, ready: true, code: h.code }, 200, cors);
  }

  // ── 3단계: 교환권 → 세션 ────────────────────────────────────────
  if (path === '/oauth/exchange' && method === 'POST') {
    const code = String(body.code || '').slice(0, 64);
    if (!code) return json({ error: 'missing' }, 400, cors);
    const h = await db.prepare('SELECT * FROM oauth_handoff WHERE code = ?').bind(code).first();
    await db.prepare('DELETE FROM oauth_handoff WHERE code = ?').bind(code).run();  // 한 번만
    if (!h || h.expires < nowMs()) return json({ error: 'expired' }, 403, cors);

    const s = token(24);
    const t = nowMs();
    await db.prepare(
      'INSERT INTO user_sessions (token, user_id, expires, created, last_seen) VALUES (?,?,?,?,?)'
    ).bind(s, h.user_id, t + SESSION_TTL, t, t).run();
    const u = await db.prepare('SELECT id, provider, email, nickname FROM users WHERE id = ?')
      .bind(h.user_id).first();
    return json({ ok: true, session: s, user: u }, 200, cors);
  }

  if (path === '/oauth/me' && method === 'GET') {
    const me = await resolveUser(db, q('session'));
    if (!me) return json({ ok: false }, 200, cors);   // 로그아웃 상태는 오류가 아니다
    return json({ ok: true, user: { id: me.id, provider: me.provider, email: me.email, nickname: me.nickname } }, 200, cors);
  }

  if (path === '/oauth/logout' && method === 'POST') {
    const s = String(body.session || '').slice(0, 128);
    if (s) await db.prepare('DELETE FROM user_sessions WHERE token = ?').bind(s).run();
    return json({ ok: true }, 200, cors);
  }

  // 탈퇴 — 계정과 세션을 지운다. 기기 안의 기록은 앱이 따로 지운다.
  if (path === '/oauth/delete' && method === 'POST') {
    const me = await resolveUser(db, String(body.session || '').slice(0, 128));
    if (!me) return json({ error: 'bad-session' }, 403, cors);
    await db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(me.id).run();
    await db.prepare('DELETE FROM users WHERE id = ?').bind(me.id).run();
    return json({ ok: true }, 200, cors);
  }

  return null;
}
