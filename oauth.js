// ============================================================================
//  소셜 로그인 — 카카오 · 네이버 · 구글
//  (카카오·네이버는 2026-09-29 에 뺐다가 2026-10 사장님 지시로 다시 붙였다.
//   시크릿 KAKAO_CLIENT_ID·NAVER_CLIENT_ID·NAVER_CLIENT_SECRET 이 있어야 버튼이 뜬다 —
//   /oauth/providers 가 키가 있는 사업자만 내려준다)
//
//  하는 일은 '이 사람이 누구인지 확인하는 것' 하나뿐이다.
//  대화·검사·리포트는 여전히 기기 안에만 있고 여기로 올라오지 않는다.
//  그래서 이 파일이 만드는 표에는 상담 내용이 한 줄도 없다.
//
//  흐름
//   1. 앱이 /oauth/google/start 로 보낸다 → 서버가 state 를 만들고 구글로 보냄
//   2. 사용자가 동의 → 구글이 /oauth/google/callback 으로 code 를 들고 돌아옴
//   3. 서버가 code 를 토큰으로 바꾸고(비밀키는 서버에만 있다) 프로필을 읽는다
//   4. 세션을 만들고, 앱으로는 '1회용 교환권'만 주소에 실어 돌려보낸다
//   5. 앱이 그 교환권을 POST 로 세션과 바꾼다
//
//  4번이 중요하다. 세션 토큰을 그대로 주소창에 실으면 방문기록·리퍼러·
//  공유 링크에 로그인 자격이 통째로 남는다. 교환권은 60초, 한 번만 쓰인다.
//
//  보안 (2026-10)
//   · 스토어 앱 '짝 번호(pair)' 로그인: pair 는 시작 주소에 실려 있어 누구나 만들 수 있다.
//     예전에는 pair 만 알면 /oauth/pair 가 교환권을 내줘서, 공격자가 만든 로그인 링크를 누른
//     사람의 구글 계정 세션을 공격자가 가져갈 수 있었다. 이제 콜백은 교환권 대신 6자리
//     '확인 번호'를 로그인한 사람의 브라우저(authdone.html)에만 보여주고, 앱이 그 번호를
//     /oauth/pair/confirm 으로 맞혀야 교환권을 준다 (틀리면 5번까지). 기기 로그인(TV 등)과 같은 방식.
//   · 웹 로그인 CSRF: 앱이 sessionStorage 에 둔 난수(cn)를 state 에 붙여 보냈다가 돌아올 때 돌려준다.
//     앱은 자기가 시작한 로그인(cn 일치)의 교환권만 쓴다 — 남이 만든 ?auth= 링크로 남의 계정에
//     로그인돼 내 기록이 그 계정으로 올라가는 일을 막는다.
// ============================================================================

const STATE_TTL = 10 * 60 * 1000;      // 로그인 창을 10분 안에는 끝내야 한다
const HANDOFF_TTL = 60 * 1000;         // 돌아오자마자 바꾼다. 길 이유가 없다
const PAIR_TTL = 5 * 60 * 1000;        // 짝 번호 로그인은 사람이 확인 번호를 옮겨 적는 시간이 필요하다
const PAIR_TRIES = 5;                  // 확인 번호 오답 허용 횟수 (6자리 → 맞힐 확률 5/1,000,000)
const SESSION_TTL = 180 * 86400000;    // 반년. 마음 앱을 매번 다시 로그인시키지 않는다

const nowMs = () => Date.now();
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 10);

function token(n) {
  const b = new Uint8Array(n || 24);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// 6자리 확인 번호 (앞자리 0 포함)
function sixDigits() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1000000).padStart(6, '0');
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
    // scope 를 요청하지 않는다(2026-10, 사장님: 개인정보 필요 없음). 전에는 이메일·닉네임 동의를 요청했는데,
    //  카카오 콘솔에서 그 동의항목이 꺼져 있으면 '잘못된 요청 (KOE205)'로 로그인 자체가 막혔다.
    //  요청하지 않으면 카카오 고유번호만으로 로그인된다 — 이메일·닉네임은 콘솔에서 켜 둔 경우에만 온다.
    scope: '',
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
    noReferrer: true,   // 아래 start 단계 주석 참고
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
  const allow = [env.APP_URL, env.PRO_URL, env.DOC_URL, 'https://pro.mindinsideapp.com', 'https://doc.mindinsideapp.com', 'https://mindinsideapp.com', 'https://www.mindinsideapp.com', 'https://neurumind.com', 'https://www.neurumind.com']
    .filter(Boolean).map(x => String(x).replace(/\/+$/, ''));
  if (w && allow.some(a => w === a || w.startsWith(a + '/'))) return w;
  return allow[0] || 'https://mindinsideapp.com';
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
      // cn: 앱이 이 로그인을 시작했다는 표시(웹은 sessionStorage 난수). state 끝에 붙여 두면
      //  구글이 그대로 돌려주므로 따로 칸을 두지 않아도 콜백에서 되찾을 수 있다.
      const cn = String(q('cn') || '').replace(/[^\w-]/g, '').slice(0, 40);
      const st = token(16) + (cn ? '.' + cn : '');
      // pair: 스토어 앱이 들고 오는 '짝 번호'. 앱은 딥링크를 기다리지 않고
      //  이 번호로 서버에 물어본다 — 웹뷰에서 딥링크 수신이 막혀도 로그인이 된다.
      //  (pair 는 누구나 만들 수 있으므로 교환권은 확인 번호를 맞혀야 나간다 — 아래 /oauth/pair/confirm)
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
      const dest = P.auth + '?' + p.toString();
      // 네이버는 로그인을 '시작한 사이트'(Referer)가 개발자센터의 서비스 URL 과 다르면
      //  "등록되지 않은 사이트에서 로그인을 시도했습니다"로 막는다. 도메인을 mindinsideapp.com 으로
      //  옮긴 뒤 등록값이 옛 도메인으로 남아 있어 그렇게 막혔다(2026-10). 출발지를 싣지 않고 보내면
      //  등록된 콜백 주소만으로 통과한다. 302 는 앞 페이지의 Referer 를 그대로 물려주므로,
      //  Referer 를 끊는 작은 페이지를 한 번 거친다.
      //  (정석은 네이버 개발자센터 서비스 URL 에 https://mindinsideapp.com 을 넣는 것 — 넣어도 이 코드는 무해하다)
      if (P.noReferrer) {
        const safe = dest.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        return new Response(
          `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">`
          + `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${P.name} 로그인으로 이동</title>`
          + `<meta http-equiv="refresh" content="0;url=${safe}"></head>`
          + `<body style="font-family:sans-serif;text-align:center;padding:3rem 1rem;color:#555;">`
          + `<p>${P.name} 로그인으로 이동하고 있어요…</p><p><a rel="noreferrer" href="${safe}">넘어가지 않으면 여기를 눌러주세요</a></p>`
          + `<script>location.replace(${JSON.stringify(dest)});</script></body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } });
      }
      return Response.redirect(dest, 302);
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
      // 사업자가 준 오류 코드를 같이 보여준다(비밀값은 없다) — 'KOE010'(클라이언트 시크릿 불일치)처럼
      //  설정 문제는 이 코드 없이는 원인을 알 길이 없다.
      const why = String((tok && (tok.error_code || tok.error)) || '').replace(/[^\w.-]/g, '').slice(0, 40);
      return errPage(`${P.name}에서 로그인을 확인하지 못했어요. 다시 시도해주세요.${why ? ' (' + why + ')' : ''}`, realBack);
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
    const cn = st.includes('.') ? st.slice(st.indexOf('.') + 1) : '';

    // 세션은 서버에 두고, 주소에는 1회용 교환권만 실어 보낸다
    const handoff = token(20);
    await db.prepare('DELETE FROM oauth_handoff WHERE expires < ?').bind(nowMs()).run();

    // ── 스토어 앱(짝 번호) ── 교환권은 주소에 싣지 않는다. 로그인한 사람의 브라우저에 확인 번호만 보여준다.
    if (row.pair) {
      const pc = sixDigits();
      try {
        await db.prepare('INSERT INTO oauth_handoff (code, user_id, expires, pair, pc, tries) VALUES (?,?,?,?,?,0)')
          .bind(handoff, userId, nowMs() + PAIR_TTL, row.pair, pc).run();
      } catch (e) {
        // pc·tries 칸이 없는 DB — 확인 번호 없이 교환권을 내주면 예전 구멍이 그대로라 여기서 멈춘다
        return errPage('로그인 서버를 점검하고 있어요. 잠시 뒤 다시 시도해주세요.', realBack);
      }
      const doneBase = /^https:\/\//.test(realBack) ? new URL(realBack).origin : safeBack(env, '');
      return Response.redirect(doneBase + '/authdone.html?pc=' + pc + '&pair=' + encodeURIComponent(row.pair), 302);
    }

    await db.prepare('INSERT INTO oauth_handoff (code, user_id, expires) VALUES (?,?,?)')
      .bind(handoff, userId, nowMs() + HANDOFF_TTL).run();
    const tail = 'auth=' + handoff + (cn ? '&cn=' + encodeURIComponent(cn) : '');
    // 딥링크(com.uroong.cbt://auth)는 경로를 덧붙이면 안 된다 — 그대로 물음표만 붙인다
    const isDeep = /^com\.uroong\.(cbt|pro):\/\//.test(realBack);
    return Response.redirect(isDeep ? realBack + '?' + tail : realBack + '/?' + tail, 302);
  }

  // ── 짝 번호 조회 (스토어 앱 전용) ───────────────────────────────
  //  앱은 브라우저에서 로그인이 끝났는지를 이 번호로 물어본다.
  //  딥링크가 막힌 웹뷰에서도 로그인이 완성되는 유일하게 확실한 길.
  //  여기서는 '끝났다'만 알려준다. 교환권은 확인 번호를 맞혀야(/oauth/pair/confirm) 나간다.
  if (path === '/oauth/pair' && method === 'GET') {
    const pair = String(q('pair') || '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!pair) return json({ error: 'missing' }, 400, cors);
    const h = await db.prepare(
      'SELECT expires FROM oauth_handoff WHERE pair = ? ORDER BY expires DESC LIMIT 1'
    ).bind(pair).first();
    if (!h || h.expires < nowMs()) return json({ ok: true, ready: false }, 200, cors);
    return json({ ok: true, ready: true, confirm: true }, 200, cors);
  }

  // 확인 번호 → 교환권. 로그인한 사람의 브라우저 화면(authdone.html)에만 뜬 6자리를 앱이 보내야 한다.
  if (path === '/oauth/pair/confirm' && method === 'POST') {
    const pair = String(body.pair || '').replace(/[^\w-]/g, '').slice(0, 40);
    const pc = String(body.pc || '').replace(/\D/g, '').slice(0, 6);
    if (!pair || pc.length !== 6) return json({ error: 'missing' }, 400, cors);
    const h = await db.prepare(
      'SELECT code, expires, pc, tries FROM oauth_handoff WHERE pair = ? ORDER BY expires DESC LIMIT 1'
    ).bind(pair).first();
    if (!h || h.expires < nowMs() || !h.pc) return json({ error: 'expired' }, 403, cors);
    if ((h.tries || 0) >= PAIR_TRIES) {
      await db.prepare('DELETE FROM oauth_handoff WHERE code = ?').bind(h.code).run();
      return json({ error: 'too-many' }, 403, cors);
    }
    if (h.pc !== pc) {
      // 오답 횟수를 먼저 올린다 (동시에 여러 번 찔러도 한도를 못 넘게 조건부로)
      await db.prepare('UPDATE oauth_handoff SET tries = tries + 1 WHERE code = ?').bind(h.code).run();
      const left = Math.max(0, PAIR_TRIES - (h.tries || 0) - 1);
      if (!left) await db.prepare('DELETE FROM oauth_handoff WHERE code = ?').bind(h.code).run();
      return json({ error: left ? 'bad-code' : 'too-many', left }, 403, cors);
    }
    // 맞혔다 — 짝 번호를 떼어 두 번 나가지 않게 하고, 교환권은 원래처럼 60초 안에 쓰게 한다
    const r = await db.prepare('UPDATE oauth_handoff SET pair = NULL, pc = NULL, expires = ? WHERE code = ? AND pair = ?')
      .bind(nowMs() + HANDOFF_TTL, h.code, pair).run();
    if (!(r.meta && r.meta.changes === 1)) return json({ error: 'expired' }, 403, cors);
    return json({ ok: true, code: h.code }, 200, cors);
  }

  // ── 3단계: 교환권 → 세션 ────────────────────────────────────────

  // ══ 상담사·상담소장의 소셜 로그인 (2026-10) ══════════════════════════
  //  상담사 앱(pro)·상담소 콘솔(doc)도 구글·카카오·네이버로 들어온다.
  //  소셜 계정만으로는 '누구의 상담사 계정인지' 알 수 없으므로, <처음 한 번만> 코드로 잇는다:
  //   ① 앱이 /oauth/<사업자>/start?back=<pro·doc 주소> 로 보낸다 (이용자 앱과 같은 흐름·같은 콜백)
  //   ② 돌아온 1회용 교환권을 /oauth/staff/exchange 로 보낸다
  //        · 이미 이어진 소셜 계정 → 그 자리에서 세션을 준다 (코드 입력 없음)
  //        · 처음 보는 소셜 계정 → 10분짜리 '연결 표(linkToken)'만 준다
  //   ③ 처음이면 앱이 코드를 한 번 받아 /oauth/staff/link 로 보낸다 → 이어 두고 세션을 준다
  //  role: 'counselor'(상담사 코드) | 'hospital'(소장 관리 코드 HA-…)
  //  코드는 여전히 열쇠다 — 연결은 '코드를 아는 사람'만 할 수 있고, 5번 틀리면 연결 표가 죽는다.
  //  staff_links 표가 없으면(스키마 적용 전) 503 을 주고, 앱은 코드 로그인으로 그대로 쓴다.
  if (path === '/oauth/staff/exchange' || path === '/oauth/staff/link' || path === '/oauth/staff/unlink') {
    if (method !== 'POST') return json({ error: 'method' }, 405, cors);
    const role = body.role === 'hospital' ? 'hospital' : 'counselor';
    const STAFF_SESSION_TTL = 30 * 86400000;   // 상담사·상담소 세션은 30일 (auth.js·hospital.js 와 같게)
    const LINK_TTL = 10 * 60 * 1000;
    const agent = String(request.headers.get('user-agent') || '').slice(0, 160);

    // 이어진 계정으로 세션을 만든다. 비활성 계정이면 null.
    const openSession = async (refId) => {
      const st = token(32), t = nowMs();
      if (role === 'hospital') {
        const h = await db.prepare('SELECT * FROM hospitals WHERE id = ? AND active = 1').bind(refId).first();
        if (!h) return null;
        await db.prepare('INSERT INTO hospital_sessions (token, hospital_id, expires, created, last_seen, agent) VALUES (?,?,?,?,?,?)')
          .bind(st, h.id, t + STAFF_SESSION_TTL, t, t, agent).run();
        return { ok: true, linked: true, role, hsession: st,
          hospital: { id: h.id, name: h.name, dept: h.dept || '', doctor: h.doctor || '', hasEmail: !!h.email } };
      }
      const c = await db.prepare('SELECT id, name FROM counselors WHERE id = ? AND active = 1').bind(refId).first();
      if (!c) return null;
      await db.prepare('INSERT INTO sessions (token, counselor_id, expires, created, last_seen, agent) VALUES (?,?,?,?,?,?)')
        .bind(st, c.id, t + STAFF_SESSION_TTL, t, t, agent).run();
      return { ok: true, linked: true, role, session: st, name: c.name, id: c.id };
    };

    try {
      // ── 연결 끊기 (로그인한 본인) — 소셜 계정을 바꾸거나 잃어버렸을 때
      if (path === '/oauth/staff/unlink') {
        let refId = '';
        if (role === 'hospital') {
          const r = await db.prepare('SELECT hospital_id FROM hospital_sessions WHERE token = ? AND expires > ?')
            .bind(String(body.hsession || '').slice(0, 128), nowMs()).first();
          refId = r ? r.hospital_id : '';
        } else {
          const r = await db.prepare('SELECT counselor_id FROM sessions WHERE token = ? AND expires > ?')
            .bind(String(body.session || '').slice(0, 128), nowMs()).first();
          refId = r ? r.counselor_id : '';
        }
        if (!refId) return json({ error: 'bad-session' }, 403, cors);
        await db.prepare('DELETE FROM staff_links WHERE role = ? AND ref_id = ?').bind(role, refId).run();
        return json({ ok: true }, 200, cors);
      }

      // ── ② 교환권 → 세션 또는 연결 표
      if (path === '/oauth/staff/exchange') {
        const code = String(body.code || '').slice(0, 64);
        if (!code) return json({ error: 'missing' }, 400, cors);
        const h = await db.prepare('SELECT * FROM oauth_handoff WHERE code = ?').bind(code).first();
        await db.prepare('DELETE FROM oauth_handoff WHERE code = ?').bind(code).run();   // 한 번만
        if (!h || h.expires < nowMs() || code.indexOf('sl_') === 0) return json({ error: 'expired' }, 403, cors);

        const link = await db.prepare('SELECT ref_id FROM staff_links WHERE user_id = ? AND role = ?')
          .bind(h.user_id, role).first();
        if (link) {
          const out = await openSession(link.ref_id);
          if (out) return json(out, 200, cors);
          // 이어 둔 계정이 비활성(삭제·정지)이다 — 연결을 지우고 다시 잇게 한다
          await db.prepare('DELETE FROM staff_links WHERE user_id = ? AND role = ?').bind(h.user_id, role).run();
        }
        const u = await db.prepare('SELECT provider, email, nickname FROM users WHERE id = ?').bind(h.user_id).first();
        // 연결 표는 교환권 표를 같이 쓴다 — 'sl_' 로 시작하게 해서 일반 교환권과 섞이지 않게 한다.
        //  pair 칸은 비워 둔다: 값이 있으면 짝 번호 조회(/oauth/pair·/oauth/pair/confirm)로 이 표를 꺼내 갈 수 있다.
        const linkToken = 'sl_' + token(24);
        await db.prepare('INSERT INTO oauth_handoff (code, user_id, expires, pair, pc, tries) VALUES (?,?,?,NULL,?,0)')
          .bind(linkToken, h.user_id, nowMs() + LINK_TTL, role).run();
        return json({ ok: true, linked: false, role, linkToken,
          account: { provider: (u && u.provider) || '', email: (u && u.email) || '', nickname: (u && u.nickname) || '' } }, 200, cors);
      }

      // ── ③ 처음 한 번: 코드로 잇기
      const linkToken = String(body.linkToken || '').slice(0, 64);
      const codeIn = String(body.code || '').trim().slice(0, 64);
      if (!linkToken || !codeIn) return json({ error: 'missing' }, 400, cors);
      const tk = await db.prepare('SELECT * FROM oauth_handoff WHERE code = ?').bind(linkToken).first();
      if (!tk || tk.expires < nowMs() || linkToken.indexOf('sl_') !== 0 || tk.pc !== role) {
        return json({ error: 'expired', message: '시간이 지났어요. 로그인부터 다시 해주세요.' }, 403, cors);
      }
      let refId = '';
      if (role === 'hospital') {
        const h = await db.prepare('SELECT id FROM hospitals WHERE admin_code = ? AND active = 1').bind(codeIn.toUpperCase()).first();
        refId = h ? h.id : '';
      } else {
        // 코드는 대문자다 — 소문자로 쳐도 받는다
        const c = await db.prepare('SELECT id FROM counselors WHERE (code = ? OR code = ?) AND active = 1').bind(codeIn, codeIn.toUpperCase()).first();
        refId = c ? c.id : '';
      }
      if (!refId) {
        // 코드 찍어보기 차단 — 5번 틀리면 이 연결 표는 못 쓴다
        const tries = (tk.tries || 0) + 1;
        if (tries >= 5) await db.prepare('DELETE FROM oauth_handoff WHERE code = ?').bind(linkToken).run();
        else await db.prepare('UPDATE oauth_handoff SET tries = ? WHERE code = ?').bind(tries, linkToken).run();
        return json({ error: 'bad-code', left: Math.max(0, 5 - tries),
          message: tries >= 5 ? '여러 번 틀려서 멈췄어요. 로그인부터 다시 해주세요.' : '코드가 맞지 않아요. 다시 확인해주세요.' }, 403, cors);
      }
      await db.prepare('DELETE FROM oauth_handoff WHERE code = ?').bind(linkToken).run();
      // 한 소셜 계정은 역할마다 한 곳에만, 한 상담사·상담소 계정에는 소셜 계정 여러 개가 붙을 수 있다(구글·카카오 둘 다 등)
      await db.prepare(
        `INSERT INTO staff_links (user_id, role, ref_id, created) VALUES (?,?,?,?)
         ON CONFLICT(user_id, role) DO UPDATE SET ref_id = excluded.ref_id, created = excluded.created`
      ).bind(tk.user_id, role, refId, nowMs()).run();
      const out = await openSession(refId);
      if (!out) return json({ error: 'inactive' }, 403, cors);
      return json(out, 200, cors);
    } catch (e) {
      // staff_links 표·pc 칸이 아직 없다 — 앱은 코드 로그인으로 계속 쓸 수 있다
      return json({ error: 'not-ready', message: '소셜 로그인을 준비하고 있어요. 지금은 코드로 로그인해주세요.' }, 503, cors);
    }
  }

  if (path === '/oauth/exchange' && method === 'POST') {
    const code = String(body.code || '').slice(0, 64);
    if (!code) return json({ error: 'missing' }, 400, cors);
    // 상담사·상담소 연결 표('sl_')는 이용자 세션으로 바꿔 주지 않는다
    if (code.indexOf('sl_') === 0) return json({ error: 'expired' }, 403, cors);
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

  // 탈퇴 — 계정·세션·계정에 올라간 동기화 값(user_data)을 한 번에 지운다. 기기 안의 기록은 앱이 따로 지운다.
  //  예전에는 user_data 를 /sync/wipe 로 따로 지웠는데, 그게 실패해도 앱이 무시하고 계정만 지워
  //  주인 없는 기록이 서버에 남았다. 이제 한 batch(트랜잭션)로 묶어 전부 지워지거나 하나도 안 지워진다.
  if (path === '/oauth/delete' && method === 'POST') {
    const me = await resolveUser(db, String(body.session || '').slice(0, 128));
    if (!me) return json({ error: 'bad-session' }, 403, cors);
    const r = await db.batch([
      db.prepare('DELETE FROM user_data WHERE user_id = ?').bind(me.id),
      db.prepare('DELETE FROM oauth_handoff WHERE user_id = ?').bind(me.id),
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').bind(me.id),
      db.prepare('DELETE FROM users WHERE id = ?').bind(me.id)
    ]);
    return json({ ok: true, dataDeleted: (r[0] && r[0].meta && r[0].meta.changes) || 0 }, 200, cors);
  }

  return null;
}
