// ============================================================================
//  상담사 로그인 — 이메일 매직링크
//
//  코드 방식의 문제: 문자열 하나가 영구 열쇠라, 카톡으로 돌리다 한 번 새면
//  그 상담사의 수신함이 통째로 열린다. 상담사가 1,000명이면 반드시 샌다.
//
//  링크 방식이 나은 이유
//   · 본인 메일함을 통과해야 한다 (주소를 안다고 로그인되지 않는다)
//   · 링크는 15분이면 죽고, 한 번 쓰면 그 자리에서 폐기된다
//   · 세션은 기기마다 따로 생겨서 잃어버린 기기만 골라 끊을 수 있다
//
//  일부러 하지 않는 것
//   · "그런 이메일 없습니다" 라고 알려주지 않는다 — 가입 여부가 새기 때문.
//     등록됐든 아니든 응답은 같다.
//   · 토큰을 로그에 남기지 않는다.
// ============================================================================

const LINK_TTL = 15 * 60 * 1000;          // 로그인 링크
const SESSION_TTL = 30 * 86400000;        // 세션
const RATE = { perEmail: 5, windowMs: 3600000 };   // 한 주소당 시간당 5통

const nowMs = () => Date.now();

function token(n) {
  const b = new Uint8Array(n || 32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 160);
const looksLikeEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// ── 세션 또는 발급 코드로 상담사를 찾는다 ─────────────────────────────
//  코드는 이메일이 아직 없는 상담사·긴급 접속용으로 남겨 둔다.
export async function resolveCounselor(db, { session, code }) {
  if (session) {
    const s = await db.prepare(
      `SELECT c.id, c.name, c.hospital, c.email, c.available, c.busy_until, c.active, s.token
         FROM sessions s JOIN counselors c ON c.id = s.counselor_id
        WHERE s.token = ? AND s.expires > ? AND c.active = 1`
    ).bind(String(session).slice(0, 128), nowMs()).first();
    if (s) {
      // 마지막 접속 갱신 (하루 한 번 정도만 써도 충분하지만 비용이 미미하다)
      await db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?')
        .bind(nowMs(), s.token).run();
      return s;
    }
    return null;
  }
  if (code) {
    return await db.prepare(
      'SELECT id, name, hospital, email, available, busy_until, active FROM counselors WHERE code = ? AND active = 1'
    ).bind(String(code).slice(0, 64)).first();
  }
  return null;
}

// ── 메일 발송 ─────────────────────────────────────────────────────────
//  Resend 를 쓴다. 키가 없으면 보내지 않고, 개발 중에는 링크를 응답에 담아
//  화면에서 바로 확인할 수 있게 한다(운영에서는 절대 담지 않는다).
// 발신자 이름에 한글을 쓰면 그대로는 못 보낸다.
//  이메일 헤더는 ASCII 만 허용해서, 비ASCII 이름은 RFC 2047 로 인코딩해야 한다.
//  (안 하면 Resend 가 422 Invalid `from` field 로 거절한다 — 실제로 여기서 막혔다)
//  인코딩해 두면 받는 쪽 메일함에는 '우렁의사' 로 제대로 보인다.
function encodeFrom(from) {
  const s = String(from || '').trim();
  const m = s.match(/^(.*)<([^>]+)>\s*$/);
  if (!m) return s;                                  // 주소만 온 경우
  const nameRaw = m[1].trim().replace(/^"|"$/g, '');
  const addr = m[2].trim();
  if (!nameRaw) return addr;
  if (!/[^\x00-\x7F]/.test(nameRaw)) return `${nameRaw} <${addr}>`;   // ASCII 면 그대로
  const bytes = new TextEncoder().encode(nameRaw);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return `=?UTF-8?B?${btoa(bin)}?= <${addr}>`;
}

async function sendMail(env, to, link, name) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { sent: false, reason: 'not-configured' };
  const html = `
<div style="font-family:'Noto Sans KR',-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#3f352a;">
  <p style="font-size:13px;letter-spacing:.08em;color:#8a7b68;margin:0 0 6px;">우렁의사 상담사</p>
  <h1 style="font-size:20px;margin:0 0 14px;letter-spacing:-.02em;">${name ? name + ' 선생님, ' : ''}로그인 링크입니다</h1>
  <p style="font-size:14px;line-height:1.75;margin:0 0 20px;">
    아래 버튼을 누르면 상담사 페이지로 바로 들어갑니다.<br>
    이 링크는 <b>15분 뒤에 만료</b>되고, <b>한 번만</b> 쓸 수 있습니다.</p>
  <a href="${link}" style="display:inline-block;background:#4f8a6b;color:#fff;text-decoration:none;
     padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;">상담사 페이지 열기</a>
  <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:22px 0 0;">
    버튼이 안 눌리면 이 주소를 복사해 열어주세요:<br>
    <span style="word-break:break-all;color:#4f8a6b;">${link}</span></p>
  <hr style="border:0;border-top:1px solid #e8ddcd;margin:22px 0 12px;">
  <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">
    요청한 적이 없다면 이 메일은 그냥 버리셔도 됩니다. 아무 일도 일어나지 않습니다.<br>
    이 링크를 다른 사람에게 전달하지 마세요 — 열람 권한이 그대로 넘어갑니다.</p>
</div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: encodeFrom(env.MAIL_FROM), to: [to],
        subject: '우렁의사 상담사 로그인 링크 (15분 유효)',
        html
      })
    });
    if (r.ok) return { sent: true, reason: '' };
    // 실패 사유를 그대로 남긴다. 도메인 미인증(403)·키 오류(401)가 대부분인데,
    //  이걸 안 남기면 상담사는 '메일이 안 온다'고만 하고 원인을 못 찾는다.
    let detail = '';
    try { detail = (await r.text()).slice(0, 220); } catch (e) {}
    // from 값을 통째로 남기지 않는다.
    //  한때 진단하려고 그대로 기록했는데, MAIL_FROM 자리에 API 키가
    //  잘못 들어가 있던 적이 있어 키가 로그로 새어 나갔다.
    //  설정값이라도 '비밀이 잘못 들어올 수 있는 자리'는 마스킹한다.
    //  형태만 알려주면 원인 파악에는 충분하다.
    const f = String(env.MAIL_FROM || '');
    const shape = !f ? 'empty'
      : /^re_/.test(f) ? 'looks-like-api-key'
      : f.includes('@') ? (/<[^>]+@[^>]+>/.test(f) ? 'name-and-address' : 'address-only')
      : 'no-@';
    detail += ' | from-shape=' + shape + ' len=' + f.length;
    return { sent: false, reason: 'http-' + r.status, detail };
  } catch (e) {
    return { sent: false, reason: 'network', detail: String(e && e.message || e).slice(0, 200) };
  }
}

// 메일 주소는 통째로 남기지 않는다 — 로그가 곧 연락처 목록이 되면 안 된다
const maskMail = e => {
  const s = String(e || '');
  const i = s.indexOf('@');
  if (i < 1) return '***';
  return s[0] + '*'.repeat(Math.max(1, i - 1)) + s.slice(i);
};

async function logMail(db, to, res) {
  try {
    await db.prepare(
      'INSERT INTO mail_log (id, addr, ok, reason, detail, ts) VALUES (?,?,?,?,?,?)'
    ).bind('ml_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      maskMail(to), res.sent ? 1 : 0, res.reason || '', res.detail || '', nowMs()).run();
    // 최근 것만 남긴다
    await db.prepare('DELETE FROM mail_log WHERE ts < ?').bind(nowMs() - 30 * 86400000).run();
  } catch (e) {}
}

// ---------------------------------------------------------------------------
export async function handleAuth(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);

  // ── 로그인 링크 요청 ────────────────────────────────────────────────
  if (path === '/auth/request' && request.method === 'POST') {
    const email = normEmail(body.email);
    // 형식이 틀려도 "보냈습니다"로 답한다 — 주소 존재 여부를 흘리지 않기 위해
    const generic = { ok: true, message: '등록된 주소라면 로그인 링크를 보냈어요. 메일함을 확인해주세요.' };
    if (!looksLikeEmail(email)) return json(generic, 200, cors);

    // 같은 주소로 시간당 5통까지
    const since = nowMs() - RATE.windowMs;
    const cnt = await db.prepare('SELECT COUNT(*) n FROM login_attempts WHERE email = ? AND ts > ?')
      .bind(email, since).first();
    if ((cnt && cnt.n) >= RATE.perEmail) {
      return json({ ok: true, message: '조금 뒤에 다시 시도해주세요. (요청이 많았어요)' }, 200, cors);
    }
    await db.prepare('INSERT INTO login_attempts (email, ts) VALUES (?,?)').bind(email, nowMs()).run();
    await db.prepare('DELETE FROM login_attempts WHERE ts < ?').bind(since).run();

    const c = await db.prepare('SELECT id, name FROM counselors WHERE email = ? AND active = 1')
      .bind(email).first();
    if (!c) return json(generic, 200, cors);      // 없는 주소여도 같은 응답

    const t = token(32);
    await db.prepare(
      'INSERT INTO login_tokens (token, counselor_id, expires, used_at, created) VALUES (?,?,?,0,?)'
    ).bind(t, c.id, nowMs() + LINK_TTL, nowMs()).run();

    const base = (env.APP_URL || url.origin).replace(/\/+$/, '');
    const link = `${base}/counselor.html?t=${t}`;
    const mail = await sendMail(env, email, link, c.name);
    await logMail(db, email, mail);

    // 발송 성공·실패를 응답으로 구분해서 알려주지 않는다.
    //  처음에는 설정 편의로 mail:'not-configured' 를 붙였는데,
    //  그건 '이 주소는 등록돼 있다'는 신호가 되어 가입 여부가 그대로 샜다.
    //  (등록 안 된 주소는 이 줄까지 오지도 않으므로 필드 유무가 곧 답이 된다)
    //  메일 설정 상태는 운영자만 /api/stats 에서 확인한다.
    return json(generic, 200, cors);
  }

  // ── 링크 클릭 → 세션 발급 ───────────────────────────────────────────
  if (path === '/auth/verify' && request.method === 'POST') {
    const t = String(body.t || '').slice(0, 128);
    if (!t) return json({ error: 'no-token' }, 400, cors);
    const row = await db.prepare(
      'SELECT token, counselor_id, expires, used_at FROM login_tokens WHERE token = ?'
    ).bind(t).first();
    if (!row) return json({ error: 'invalid' }, 403, cors);
    if (row.used_at) return json({ error: 'used' }, 403, cors);
    if (row.expires < nowMs()) return json({ error: 'expired' }, 403, cors);

    await db.prepare('UPDATE login_tokens SET used_at = ? WHERE token = ?').bind(nowMs(), t).run();

    const c = await db.prepare('SELECT id, name FROM counselors WHERE id = ? AND active = 1')
      .bind(row.counselor_id).first();
    if (!c) return json({ error: 'inactive' }, 403, cors);

    const st = token(32);
    await db.prepare(
      'INSERT INTO sessions (token, counselor_id, expires, created, last_seen, agent) VALUES (?,?,?,?,?,?)'
    ).bind(st, c.id, nowMs() + SESSION_TTL, nowMs(), nowMs(),
      String(request.headers.get('user-agent') || '').slice(0, 160)).run();

    // 만료된 찌꺼기 정리
    await db.prepare('DELETE FROM login_tokens WHERE expires < ?').bind(nowMs() - 86400000).run();
    await db.prepare('DELETE FROM sessions WHERE expires < ?').bind(nowMs()).run();

    return json({ ok: true, session: st, name: c.name, id: c.id }, 200, cors);
  }

  // ── 로그아웃 ────────────────────────────────────────────────────────
  if (path === '/auth/logout' && request.method === 'POST') {
    const st = String(body.session || '').slice(0, 128);
    if (st) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(st).run();
    return json({ ok: true }, 200, cors);
  }

  // ── 내 세션 확인 ────────────────────────────────────────────────────
  if (path === '/auth/me' && request.method === 'GET') {
    const st = url.searchParams.get('session') || '';
    const me = await resolveCounselor(db, { session: st });
    if (!me) return json({ error: 'no-session' }, 403, cors);
    return json({ ok: true, id: me.id, name: me.name, email: me.email }, 200, cors);
  }

  // ── 이 기기 외 모두 로그아웃 ────────────────────────────────────────
  if (path === '/auth/logout-others' && request.method === 'POST') {
    const st = String(body.session || '').slice(0, 128);
    const me = await resolveCounselor(db, { session: st });
    if (!me) return json({ error: 'no-session' }, 403, cors);
    await db.prepare('DELETE FROM sessions WHERE counselor_id = ? AND token != ?')
      .bind(me.id, st).run();
    return json({ ok: true }, 200, cors);
  }

  return null;
}
