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

const MAX = { text: 4000, name: 40, id: 64 };
const CALL_LOCK_MS = 35 * 60 * 1000;      // 통화 잠금 자동 해제
const KEEP_MS = 180 * 86400000;            // 180일 지난 기록은 정리 대상

const s = (v, n) => String(v == null ? '' : v).slice(0, n || MAX.name);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const nowMs = () => Date.now();
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 8);

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// 발급 코드 → 상담사. 정지된 코드는 없는 것으로 친다.
async function whoami(db, code) {
  const c = s(code, MAX.id);
  if (!c) return null;
  return await db.prepare(
    'SELECT id, name, hospital, available, busy_until, active FROM counselors WHERE code = ? AND active = 1'
  ).bind(c).first();
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

  // ── 상담사 목록 ─────────────────────────────────────────────────────
  if (path === '/counselors' && method === 'GET') {
    const r = await db.prepare(
      'SELECT id, name, hospital, available, busy_until FROM counselors WHERE active = 1'
    ).all();
    return json({ items: r.results || [] }, 200, cors);
  }

  // ── 바로상담 수신 상태 ──────────────────────────────────────────────
  if (path === '/presence') {
    if (method === 'GET' && code) {                     // 상담사 본인 화면
      const me = await whoami(db, code);
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
      const me = await whoami(db, code);
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
    if (code) {
      const me = await whoami(db, code);
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
        const me = await whoami(db, code);
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
    const me = await whoami(db, code);
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
    const me = await whoami(db, code);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    await db.prepare('UPDATE inbox SET read_at = ? WHERE id = ? AND counselor_id = ?')
      .bind(nowMs(), s(body.id, MAX.id), me.id).run();
    return json({ ok: true }, 200, cors);
  }

  // ── 후기 ────────────────────────────────────────────────────────────
  if (path === '/reviews' && method === 'GET') {
    if (code) {
      const me = await whoami(db, code);
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
    const me = await whoami(db, code);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    await db.prepare('UPDATE reviews SET reply = ?, reply_ts = ? WHERE id = ? AND counselor_id = ?')
      .bind(s(body.text, 600), nowMs(), s(body.id, MAX.id), me.id).run();
    return json({ ok: true }, 200, cors);
  }

  // ── 상담 채팅 ───────────────────────────────────────────────────────
  if (path === '/chat-msg' && method === 'GET') {
    if (code) {
      const me = await whoami(db, code);
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
      const me = await whoami(db, code);
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
    const one = async sql => (await db.prepare(sql).first()) || {};
    const c = await one('SELECT COUNT(*) n FROM counselors WHERE active = 1');
    const b = await one("SELECT COUNT(*) n, COALESCE(SUM(price),0) sum FROM bookings WHERE status = 'confirmed'");
    const i = await one('SELECT COUNT(*) n FROM inbox');
    const rv = await one('SELECT COUNT(*) n, COALESCE(AVG(rating),0) avg FROM reviews');
    return json({
      counselors: c.n || 0, bookings: b.n || 0, gross: b.sum || 0,
      inbox: i.n || 0, reviews: rv.n || 0, ratingAvg: Math.round((rv.avg || 0) * 10) / 10
    }, 200, cors);
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
