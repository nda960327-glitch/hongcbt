// ============================================================================
//  상담사 마켓 백엔드 — Cloudflare D1
//
//  인증: 상담사는 발급 코드 하나로 자기 것만 본다.
//    · 코드가 곧 열쇠다. 링크가 새면 그 상담사의 수신함이 통째로 열린다.
//      그래서 코드는 22자 난수이고, 정지(active=0)로 즉시 끊을 수 있다.
//    · 내담자는 계정이 없다. 기기가 만든 clientId 로만 자기 것을 조회한다.
//      추측을 막기 위해 clientId 는 길고, 남의 것으로 조회해도
//      쓰기 작업은 불가능하도록 읽기와 쓰기를 나눠 뒀다.
//
//  저장 안 하는 것: 상담 대화 원문·일기 전문·검진 답변.
//    내담자가 [동의하고 보내기]를 누른 요약본만 inbox 에 들어온다.
// ============================================================================

import { resolveCounselor, handleAuth } from './auth.js';

const MAX = { text: 4000, name: 40, id: 64 };
const CALL_LOCK_MS = 35 * 60 * 1000;      // 통화 잠금 자동 해제
const KEEP_MS = 180 * 86400000;            // 180일 지난 기록은 정리 대상

const s = (v, n) => String(v == null ? '' : v).slice(0, n || MAX.name);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const nowMs = () => Date.now();
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 8);

// 상담사 코드. 이 문자열 하나가 그 사람의 수신함 열쇠라서
//  · 암호학적 난수를 쓰고 (Math.random 아님)
//  · 헷갈리는 0/O/1/I 를 뺀 32자 알파벳으로 22자 → 추측 불가
//  · 5자마다 하이픈을 넣어 전화로 불러줄 수 있게 한다
function makeCode() {
  const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  let out = '';
  for (let i = 0; i < 20; i++) {
    out += AB[b[i] % AB.length];
    if (i % 5 === 4 && i !== 19) out += '-';
  }
  return out;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// 상담사 식별. 이메일 로그인 세션이 우선이고, 발급 코드는 아직 이메일이
//  없는 상담사와 긴급 접속용으로 남겨 둔다. 정지된 계정은 둘 다 통하지 않는다.
async function whoami(db, cred) {
  const session = typeof cred === 'object' && cred ? cred.session : '';
  const code = typeof cred === 'object' && cred ? cred.code : cred;
  return await resolveCounselor(db, {
    session: s(session, 128), code: s(code, MAX.id)
  });
}

// 운영자 마스터 코드 — 전체 열람. 시크릿으로만 준다.
const isAdmin = (env, code) => !!env.ADMIN_CODE && code === env.ADMIN_CODE;

// ---------------------------------------------------------------------------
export async function handleMarket(request, env, cors, path) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);

  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const code = s(body.code || q('code'), MAX.id);
  const session = s(body.session || q('session'), 128);
  const cred = { session, code };

  // 로그인(이메일 매직링크)은 별도 모듈. 여기서 처리되면 바로 돌려준다.
  if (path.startsWith('/auth/')) {
    const r = await handleAuth(request, env, cors, path, body, url);
    if (r) return r;
  }

  // ── 상담사 목록 ─────────────────────────────────────────────────────
  if (path === '/counselors' && method === 'GET') {
    const r = await db.prepare(
      'SELECT id, name, hospital, available, busy_until FROM counselors WHERE active = 1'
    ).all();
    return json({ items: r.results || [] }, 200, cors);
  }

  // ── 바로상담 수신 상태 ──────────────────────────────────────────────
  if (path === '/presence') {
    if (method === 'GET' && (code || session)) {        // 상담사 본인 화면
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      return json({
        id: me.id, name: me.name,
        available: !!me.available,
        busy: me.busy_until > nowMs()
      }, 200, cors);
    }
    if (method === 'GET') {                             // 앱: 전체 상태
      const r = await db.prepare(
        'SELECT id, available, busy_until FROM counselors WHERE active = 1'
      ).all();
      const presence = {};
      const t = nowMs();
      (r.results || []).forEach(c => {
        presence[c.id] = { available: !!c.available, busy: c.busy_until > t };
      });
      return json({ presence }, 200, cors);
    }
    if (method === 'POST') {                            // 상담사가 켜고 끔
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      await db.prepare('UPDATE counselors SET available = ? WHERE id = ?')
        .bind(body.available ? 1 : 0, me.id).run();
      return json({ ok: true }, 200, cors);
    }
  }

  // ── 예약 ────────────────────────────────────────────────────────────
  if (path === '/bookings' && method === 'GET') {
    if (isAdmin(env, code)) {
      const r = await db.prepare('SELECT * FROM bookings ORDER BY when_ts DESC LIMIT 500').all();
      return json({ items: (r.results || []).map(rowBooking), scope: 'admin' }, 200, cors);
    }
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      const r = await db.prepare(
        'SELECT * FROM bookings WHERE counselor_id = ? ORDER BY when_ts DESC LIMIT 200'
      ).bind(me.id).all();
      return json({ items: (r.results || []).map(rowBooking), scope: 'counselor' }, 200, cors);
    }
    const cid = s(q('clientId'), MAX.id);
    if (!cid) return json({ items: [] }, 200, cors);
    const r = await db.prepare(
      'SELECT * FROM bookings WHERE client_id = ? ORDER BY when_ts DESC LIMIT 100'
    ).bind(cid).all();
    return json({ items: (r.results || []).map(rowBooking) }, 200, cors);
  }

  if (path === '/bookings' && method === 'POST') {
    const id = s(body.id, MAX.id) || rid('bk');
    const clientId = s(body.clientId, MAX.id);
    if (!clientId || !body.counselorId) return json({ error: 'missing' }, 400, cors);
    await db.prepare(
      `INSERT OR REPLACE INTO bookings
       (id, counselor_id, counselor_name, client_id, client_name, when_ts, time_label, price, status, created)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, s(body.counselorId, MAX.id), s(body.counselorName || body.name),
      clientId, s(body.clientName) || '익명',
      num(body.whenTs), s(body.time, 120), num(body.price),
      'confirmed', nowMs()).run();
    return json({ ok: true, id }, 200, cors);
  }

  // 취소(내담자) · 미진행(내담자) · 거절(상담사)
  for (const [seg, status, byCounselor] of [
    ['/bookings/cancel', 'cancelled', false],
    ['/bookings/noshow', 'noshow', false],
    ['/bookings/decline', 'declined', true]
  ]) {
    if (path === seg && method === 'POST') {
      const id = s(body.id, MAX.id);
      if (!id) return json({ error: 'missing-id' }, 400, cors);
      if (byCounselor) {
        const me = await whoami(db, cred);
        if (!me) return json({ error: 'bad-code' }, 403, cors);
        await db.prepare('UPDATE bookings SET status = ? WHERE id = ? AND counselor_id = ?')
          .bind(status, id, me.id).run();
      } else {
        await db.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, id).run();
      }
      return json({ ok: true }, 200, cors);
    }
  }

  // ── 상담 자료 수신함 ────────────────────────────────────────────────
  if (path === '/inbox' && method === 'GET') {
    if (isAdmin(env, code)) {
      const r = await db.prepare('SELECT * FROM inbox ORDER BY ts DESC LIMIT 300').all();
      return json({ scope: 'admin', items: (r.results || []).map(rowInbox) }, 200, cors);
    }
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const r = await db.prepare(
      'SELECT * FROM inbox WHERE counselor_id = ? ORDER BY ts DESC LIMIT 200'
    ).bind(me.id).all();
    return json({
      scope: 'counselor', counselorName: me.name,
      items: (r.results || []).map(rowInbox)
    }, 200, cors);
  }

  if (path === '/inbox' && method === 'POST') {
    const text = s(body.text, MAX.text);
    const clientId = s(body.clientId, MAX.id);
    if (!text || !clientId) return json({ error: 'missing' }, 400, cors);
    const id = rid('ib');
    await db.prepare(
      `INSERT INTO inbox (id, counselor_id, counselor_name, booking_id, client_id, client_name, body, read_at, ts)
       VALUES (?,?,?,?,?,?,?,0,?)`
    ).bind(id, s(body.counselorId, MAX.id), s(body.counselorName),
      s(body.bookingId, MAX.id), clientId, s(body.clientName) || '익명', text, nowMs()).run();
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/inbox/read' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    await db.prepare('UPDATE inbox SET read_at = ? WHERE id = ? AND counselor_id = ?')
      .bind(nowMs(), s(body.id, MAX.id), me.id).run();
    return json({ ok: true }, 200, cors);
  }

  // ── 후기 ────────────────────────────────────────────────────────────
  if (path === '/reviews' && method === 'GET') {
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      const r = await db.prepare(
        'SELECT * FROM reviews WHERE counselor_id = ? ORDER BY ts DESC LIMIT 200'
      ).bind(me.id).all();
      return json({ items: (r.results || []).map(rowReview) }, 200, cors);
    }
    const cid = s(q('clientId'), MAX.id);
    if (!cid) return json({ items: [] }, 200, cors);
    const r = await db.prepare(
      'SELECT * FROM reviews WHERE client_id = ? AND reply IS NOT NULL ORDER BY ts DESC LIMIT 50'
    ).bind(cid).all();
    return json({ items: (r.results || []).map(rowReview) }, 200, cors);
  }

  if (path === '/reviews' && method === 'POST') {
    const clientId = s(body.clientId, MAX.id);
    const rating = Math.max(1, Math.min(5, num(body.rating) || 5));
    if (!clientId || !body.counselorId) return json({ error: 'missing' }, 400, cors);
    const id = rid('rv');
    await db.prepare(
      `INSERT INTO reviews (id, counselor_id, booking_id, client_id, client_name, rating, body, reply, reply_ts, ts)
       VALUES (?,?,?,?,?,?,?,NULL,0,?)`
    ).bind(id, s(body.counselorId, MAX.id), s(body.bookingId, MAX.id),
      clientId, s(body.clientName) || '익명', rating, s(body.text, 600), nowMs()).run();
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/reviews/reply' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    await db.prepare('UPDATE reviews SET reply = ?, reply_ts = ? WHERE id = ? AND counselor_id = ?')
      .bind(s(body.text, 600), nowMs(), s(body.id, MAX.id), me.id).run();
    return json({ ok: true }, 200, cors);
  }

  // ── 상담 채팅 ───────────────────────────────────────────────────────
  if (path === '/chat-msg' && method === 'GET') {
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      const r = await db.prepare(
        'SELECT * FROM chat_msgs WHERE counselor_id = ? ORDER BY ts ASC LIMIT 500'
      ).bind(me.id).all();
      return json({ items: (r.results || []).map(rowMsg) }, 200, cors);
    }
    const cid = s(q('clientId'), MAX.id);
    if (!cid) return json({ items: [] }, 200, cors);
    const counselorId = s(q('counselorId'), MAX.id);
    const stmt = counselorId
      ? db.prepare('SELECT * FROM chat_msgs WHERE client_id = ? AND counselor_id = ? ORDER BY ts ASC LIMIT 300').bind(cid, counselorId)
      : db.prepare('SELECT * FROM chat_msgs WHERE client_id = ? ORDER BY ts ASC LIMIT 300').bind(cid);
    const r = await stmt.all();
    return json({ items: (r.results || []).map(rowMsg) }, 200, cors);
  }

  if (path === '/chat-msg' && method === 'POST') {
    const text = s(body.text, 2000);
    if (!text) return json({ error: 'empty' }, 400, cors);
    const from = body.from === 'counselor' ? 'counselor' : 'client';
    let counselorId = s(body.counselorId, MAX.id);
    let clientId = s(body.clientId, MAX.id);

    if (from === 'counselor') {
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      counselorId = me.id;
      // 상담사 화면은 clientId 대신 이름으로 스레드를 잡는다 — 최근 메시지에서 되찾는다
      if (!clientId) {
        const prev = await db.prepare(
          'SELECT client_id FROM chat_msgs WHERE counselor_id = ? AND client_name = ? ORDER BY ts DESC LIMIT 1'
        ).bind(me.id, s(body.clientName)).first();
        clientId = prev ? prev.client_id : '';
      }
    }
    if (!clientId || !counselorId) return json({ error: 'missing' }, 400, cors);

    const id = rid('cm');
    await db.prepare(
      `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, counselorId, s(body.counselorName), clientId,
      s(body.clientName) || '익명', from, text, nowMs()).run();
    return json({ ok: true, id }, 200, cors);
  }

  // ── 바로상담 대기열 ─────────────────────────────────────────────────
  if (path === '/call/queue' && method === 'GET') {
    const counselorId = s(q('counselorId'), MAX.id);
    const clientId = s(q('clientId'), MAX.id);
    if (!counselorId || !clientId) return json({ position: -1 }, 200, cors);
    const r = await db.prepare(
      'SELECT client_id FROM call_queue WHERE counselor_id = ? ORDER BY ts ASC'
    ).bind(counselorId).all();
    const list = (r.results || []).map(x => x.client_id);
    const c = await db.prepare('SELECT available, busy_until FROM counselors WHERE id = ?')
      .bind(counselorId).first();
    return json({
      position: list.indexOf(clientId),           // 0 이면 내 차례
      waiting: list.length,
      ready: !!(c && c.available && c.busy_until <= nowMs() && list[0] === clientId)
    }, 200, cors);
  }

  if (path === '/call/queue' && method === 'POST') {
    const counselorId = s(body.counselorId, MAX.id), clientId = s(body.clientId, MAX.id);
    if (!counselorId || !clientId) return json({ error: 'missing' }, 400, cors);
    await db.prepare(
      'INSERT OR REPLACE INTO call_queue (counselor_id, client_id, client_name, ts) VALUES (?,?,?,?)'
    ).bind(counselorId, clientId, s(body.clientName) || '익명', nowMs()).run();
    return json({ ok: true }, 200, cors);
  }

  if (path === '/call/queue/leave' && method === 'POST') {
    await db.prepare('DELETE FROM call_queue WHERE counselor_id = ? AND client_id = ?')
      .bind(s(body.counselorId, MAX.id), s(body.clientId, MAX.id)).run();
    return json({ ok: true }, 200, cors);
  }

  if (path === '/call/start' && method === 'POST') {
    const counselorId = s(body.counselorId, MAX.id);
    if (!counselorId) return json({ error: 'missing' }, 400, cors);
    await db.prepare('UPDATE counselors SET busy_until = ? WHERE id = ?')
      .bind(nowMs() + CALL_LOCK_MS, counselorId).run();
    await db.prepare('DELETE FROM call_queue WHERE counselor_id = ? AND client_id = ?')
      .bind(counselorId, s(body.clientId, MAX.id)).run();
    return json({ ok: true }, 200, cors);
  }

  if (path === '/call/end' && method === 'POST') {
    const counselorId = s(body.counselorId, MAX.id);
    if (!counselorId) return json({ error: 'missing' }, 400, cors);
    await db.prepare('UPDATE counselors SET busy_until = 0 WHERE id = ?').bind(counselorId).run();
    return json({ ok: true }, 200, cors);
  }

  // ── 운영 통계 ───────────────────────────────────────────────────────
  if (path === '/stats' && method === 'GET') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    // 전에는 지표마다 따로 물어서 D1 을 5번 왕복했다. 한 번에 가져온다.
    //  (운영자 콘솔이 뜨는 속도가 여기에 직접 걸린다)
    const t = nowMs();
    const r = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM counselors WHERE active = 1) AS counselors,
      (SELECT COUNT(*) FROM counselors WHERE active = 1 AND (email IS NULL OR email = '')) AS noMail,
      (SELECT COUNT(DISTINCT client_id) FROM bookings) AS clientsA,
      (SELECT COUNT(DISTINCT client_id) FROM inbox) AS clientsB,
      (SELECT COUNT(*) FROM bookings) AS bkTotal,
      (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND when_ts > ?) AS bkUpcoming,
      (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND when_ts <= ?) AS bkDone,
      (SELECT COUNT(*) FROM bookings WHERE status IN ('cancelled','declined','noshow')) AS bkCancelled,
      (SELECT COALESCE(SUM(price),0) FROM bookings WHERE status = 'confirmed' AND when_ts <= ?) AS gross,
      (SELECT COUNT(*) FROM inbox) AS ibTotal,
      (SELECT COUNT(*) FROM inbox WHERE read_at = 0) AS ibUnread,
      (SELECT COUNT(DISTINCT counselor_id || '|' || client_id) FROM chat_msgs) AS threads,
      (SELECT COUNT(*) FROM reviews) AS rvCount,
      (SELECT COALESCE(AVG(rating),0) FROM reviews) AS rvAvg
    `).bind(t, t, t).first() || {};

    // 답장 대기: 스레드별 마지막 발신자가 내담자인 것
    const aw = await db.prepare(`SELECT COUNT(*) n FROM (
        SELECT counselor_id, client_id, MAX(ts) mts FROM chat_msgs GROUP BY counselor_id, client_id
      ) g JOIN chat_msgs m
        ON m.counselor_id = g.counselor_id AND m.client_id = g.client_id AND m.ts = g.mts
      WHERE m.sender = 'client'`).first() || {};

    const gross = r.gross || 0;
    const SPLIT = { counselor: 70, hospital: 10, pg: 3, platform: 17 };  // js/payout.js 와 같은 값
    return json({
      // 앱의 운영자 콘솔이 기대하는 모양 그대로 (여기가 어긋나면 화면이 빈칸이 된다)
      uniqueClients: Math.max(r.clientsA || 0, r.clientsB || 0),
      counselors: r.counselors || 0,
      bookings: {
        total: r.bkTotal || 0, upcoming: r.bkUpcoming || 0,
        done: r.bkDone || 0, cancelled: r.bkCancelled || 0
      },
      chat: { threads: r.threads || 0, awaiting: aw.n || 0 },
      inbox: { total: r.ibTotal || 0, unread: r.ibUnread || 0 },
      reviews: { count: r.rvCount || 0, avg: Math.round((r.rvAvg || 0) * 10) / 10 },
      revenue: {
        gross,
        platform: Math.round(gross * SPLIT.platform / 100),
        counselor: Math.round(gross * SPLIT.counselor / 100),
        hospital: Math.round(gross * SPLIT.hospital / 100),
        pg: Math.round(gross * SPLIT.pg / 100),
        split: SPLIT
      },
      // 메일 발송 설정 상태는 운영자만 본다 (로그인 응답에 담으면 가입 여부가 샌다)
      mailReady: !!(env.RESEND_API_KEY && env.MAIL_FROM),
      counselorsWithoutEmail: r.noMail || 0
    }, 200, cors);
  }

  // ── 상담사 관리 (운영자만) ──────────────────────────────────────────
  //  터미널 없이 앱에서 다 되게 한다. 상담사 한 명 넣자고 wrangler 를
  //  띄우게 만들면 결국 아무도 관리하지 않는다.
  if (path.startsWith('/admin/counselors')) {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);

    if (path === '/admin/counselors' && method === 'GET') {
      const r = await db.prepare(
        'SELECT id, name, hospital, email, code, available, busy_until, active, created FROM counselors ORDER BY created DESC'
      ).all();
      return json({ items: r.results || [] }, 200, cors);
    }

    if (path === '/admin/counselors' && method === 'POST') {
      const id = s(body.id, MAX.id).trim();
      const name = s(body.name).trim();
      if (!id || !name) return json({ error: 'id·name 필요' }, 400, cors);
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return json({ error: 'id 는 영문·숫자만' }, 400, cors);
      const dup = await db.prepare('SELECT id FROM counselors WHERE id = ?').bind(id).first();
      if (dup) return json({ error: '이미 있는 ID 입니다' }, 409, cors);
      // 이메일은 로그인 식별자다. 겹치면 남의 수신함으로 링크가 갈 수 있으므로 막는다.
      const email = s(body.email, 160).trim().toLowerCase();
      if (email) {
        const de = await db.prepare('SELECT id FROM counselors WHERE email = ?').bind(email).first();
        if (de) return json({ error: '이미 쓰이는 이메일입니다' }, 409, cors);
      }
      const newCode = makeCode();
      await db.prepare(
        `INSERT INTO counselors (id, name, hospital, email, code, available, busy_until, active, created)
         VALUES (?,?,?,?,?,0,0,1,?)`
      ).bind(id, name, s(body.hospital, 120), email || null, newCode, nowMs()).run();
      return json({ ok: true, id, name, email, code: newCode }, 200, cors);
    }

    // 이메일 등록·변경. 바꾸면 이전 세션을 전부 끊는다 —
    //  주소가 바뀌었다는 건 담당자가 바뀌었을 수 있다는 뜻이다.
    if (path === '/admin/counselors/email' && method === 'POST') {
      const id = s(body.id, MAX.id);
      const email = s(body.email, 160).trim().toLowerCase();
      if (!email) return json({ error: '이메일이 비었습니다' }, 400, cors);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: '형식이 올바르지 않습니다' }, 400, cors);
      const de = await db.prepare('SELECT id FROM counselors WHERE email = ? AND id != ?')
        .bind(email, id).first();
      if (de) return json({ error: '이미 쓰이는 이메일입니다' }, 409, cors);
      await db.prepare('UPDATE counselors SET email = ? WHERE id = ?').bind(email, id).run();
      await db.prepare('DELETE FROM sessions WHERE counselor_id = ?').bind(id).run();
      return json({ ok: true, email }, 200, cors);
    }

    if (path === '/admin/counselors/rotate' && method === 'POST') {
      const id = s(body.id, MAX.id);
      const newCode = makeCode();
      const r = await db.prepare('UPDATE counselors SET code = ? WHERE id = ?').bind(newCode, id).run();
      return json({ ok: true, id, code: newCode }, 200, cors);
    }

    if (path === '/admin/counselors/active' && method === 'POST') {
      const id = s(body.id, MAX.id);
      await db.prepare('UPDATE counselors SET active = ? WHERE id = ?')
        .bind(body.active ? 1 : 0, id).run();
      return json({ ok: true }, 200, cors);
    }

    // 완전 삭제는 남긴 기록까지 지우므로 확인 문구를 서버에서도 요구한다
    if (path === '/admin/counselors/delete' && method === 'POST') {
      const id = s(body.id, MAX.id);
      if (body.confirm !== id) return json({ error: 'confirm 불일치' }, 400, cors);
      for (const t of ['chat_msgs', 'inbox', 'bookings', 'call_queue']) {
        await db.prepare(`DELETE FROM ${t} WHERE counselor_id = ?`).bind(id).run();
      }
      await db.prepare('DELETE FROM reviews WHERE counselor_id = ?').bind(id).run();
      await db.prepare('DELETE FROM counselors WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, cors);
    }
  }

  // ── 오래된 기록 정리 (운영자만) ─────────────────────────────────────
  if (path === '/purge' && method === 'POST') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const cut = nowMs() - KEEP_MS;
    await db.prepare('DELETE FROM chat_msgs WHERE ts < ?').bind(cut).run();
    await db.prepare('DELETE FROM inbox WHERE ts < ?').bind(cut).run();
    await db.prepare('DELETE FROM call_queue WHERE ts < ?').bind(nowMs() - 3600000).run();
    return json({ ok: true }, 200, cors);
  }

  return null;   // 이 모듈이 다룰 경로가 아님
}

// ── 행 → 앱이 기대하는 모양 ────────────────────────────────────────────
const rowBooking = r => ({
  id: r.id, counselorId: r.counselor_id, name: r.counselor_name,
  clientId: r.client_id, clientName: r.client_name,
  whenTs: r.when_ts, time: r.time_label, price: r.price, status: r.status
});
const rowInbox = r => ({
  id: r.id, counselorId: r.counselor_id, counselorName: r.counselor_name,
  bookingId: r.booking_id, clientName: r.client_name,
  text: r.body, read: !!r.read_at, ts: r.ts
});
const rowReview = r => ({
  id: r.id, counselorId: r.counselor_id, clientName: r.client_name,
  rating: r.rating, text: r.body, ts: r.ts,
  reply: r.reply ? { text: r.reply, ts: r.reply_ts } : null
});
const rowMsg = r => ({
  id: r.id, counselorId: r.counselor_id, counselorName: r.counselor_name,
  clientId: r.client_id, clientName: r.client_name,
  from: r.sender, text: r.body, ts: r.ts
});
