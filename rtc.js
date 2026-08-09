// ============================================================================
//  앱 내 음성통화 — 시그널링과 과금
//
//  전화번호를 쓰지 않는다. tel: 로 걸면 내담자 발신번호가 상담사 폰에
//  그대로 찍히고, 안심번호를 붙여도 '번호'가 존재하는 한 언젠가 샌다.
//  양쪽이 앱/브라우저에서 붙으면 유출할 번호 자체가 없다.
//
//  서버가 하는 일은 '처음 만나게 해주는 것'뿐이다.
//  음성은 P2P 로 직접 흐르므로 대화 내용은 서버를 지나가지 않는다.
//
//  과금 원칙: 실제로 연결된 시간에만 받는다.
//   전에는 앱이 타이머를 돌려서, 상담사가 안 받아도 초가 쌓였다.
//   이제 connect_at 은 서버가 찍고, 그 시각부터만 계산한다.
// ============================================================================

import { notifyCounselor } from './push.js';
import { resolveCounselor } from './auth.js';

const SIGNAL_TTL = 10 * 60 * 1000;     // 신호는 10분이면 버린다
const RING_TIMEOUT = 60 * 1000;        // 60초 안 받으면 부재중
const MAX_CALL_MS = 90 * 60 * 1000;    // 90분이면 강제 종료(회선 잠김 방지)

const nowMs = () => Date.now();
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 8);

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// 방 이름은 서버가 정한다. 클라이언트가 마음대로 정하면 남의 통화에 낄 수 있다.
const roomOf = (counselorId, clientId) => 'r_' + counselorId + '__' + clientId;

// 30초 단위 올림. 1초를 써도 30초 요금 — 통화 요금의 관행이고,
//  화면에도 그렇게 적어 둔다.
function billFor(rate, ms) {
  if (!rate || ms <= 0) return 0;
  return Math.ceil(ms / 30000) * rate;
}

export async function handleRtc(request, env, cors, path, body, url, ctx) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  const s = (v, n) => String(v == null ? '' : v).slice(0, n || 64);

  // ── 연결에 쓸 서버 목록 ──────────────────────────────────────────────
  //  STUN 만으로도 대부분 붙지만, 회사망·일부 LTE 는 TURN 이 있어야 한다.
  //  TURN 자격증명은 시크릿으로만 넣는다.
  if (path === '/rtc/ice' && method === 'GET') {
    const servers = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    if (env.TURN_URL && env.TURN_USER && env.TURN_CRED) {
      servers.push({
        urls: String(env.TURN_URL).split(',').map(x => x.trim()).filter(Boolean),
        username: env.TURN_USER, credential: env.TURN_CRED
      });
    }
    return json({ iceServers: servers, turn: !!env.TURN_URL }, 200, cors);
  }

  // ── 통화 걸기 (내담자) ───────────────────────────────────────────────
  if (path === '/rtc/start' && method === 'POST') {
    const counselorId = s(body.counselorId), clientId = s(body.clientId);
    if (!counselorId || !clientId) return json({ error: 'missing' }, 400, cors);

    const c = await db.prepare(
      'SELECT id, name, active FROM counselors WHERE id = ? AND active = 1'
    ).bind(counselorId).first();
    if (!c) return json({ error: '지금은 연결할 수 없어요' }, 404, cors);

    const room = roomOf(counselorId, clientId);
    // 내가 이미 걸어둔 통화면 그걸 이어 쓴다 (중복 생성 방지)
    const mine = await db.prepare(
      'SELECT * FROM calls WHERE room = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1'
    ).bind(room).first();
    if (mine) return json({ ok: true, room, callId: mine.id, resumed: true }, 200, cors);

    const t = nowMs();
    // 회선 잠금은 '조건부 UPDATE 한 방'으로 잡는다.
    //  전에는 busy_until 을 읽고 → 판단하고 → 쓰는 3단계였는데,
    //  두 사람이 동시에 걸면 둘 다 '비어 있다'를 읽고 둘 다 통과한다.
    //  WHERE 절에 조건을 넣어 한 명만 이기게 만든다.
    const lock = await db.prepare(
      'UPDATE counselors SET busy_until = ? WHERE id = ? AND (busy_until IS NULL OR busy_until <= ?)'
    ).bind(t + MAX_CALL_MS, counselorId, t).run();
    const won = lock && lock.meta && lock.meta.changes > 0;

    if (!won) {
      // 진 사람에게는 누구와 통화 중인지가 아니라 '지금은 안 된다'만 알린다
      const busy = await db.prepare(
        'SELECT connect_at, ring_at FROM calls WHERE counselor_id = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1'
      ).bind(counselorId).first();
      return json({
        error: 'busy',
        message: busy && busy.connect_at
          ? `${c.name} 선생님이 지금 다른 분과 상담 중이에요.`
          : `${c.name} 선생님이 지금 통화 연결 중이에요.`,
        canQueue: true
      }, 409, cors);
    }

    const id = rid('call');
    await db.prepare(
      'INSERT INTO calls (id, room, counselor_id, client_id, booking_id, rate, ring_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(id, room, counselorId, clientId, s(body.bookingId), Math.max(0, Number(body.rate) || 0), t).run();

    // 상담사 기기를 깨운다. 앱이 닫혀 있어도 알림이 뜬다.
    //  응답보다 뒤에 보낸다 — 푸시가 느려도 전화 거는 쪽은 기다리지 않는다.
    const wake = notifyCounselor(env, counselorId).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(wake); else await wake;

    return json({ ok: true, room, callId: id }, 200, cors);
  }

  // ── 상담사에게 걸려온 전화가 있나 ────────────────────────────────────
  //  상담사 아이디만으로 열어두면 안 된다. 아이디는 상담사 목록에
  //  그대로 실려 나가는 공개값이라, 남의 전화를 훔쳐볼 수 있고
  //  room·callId 까지 받아가면 통화를 가로챌 수도 있다.
  //  누구인지는 자격증명으로 정한다 — 쿼리의 counselorId 는 믿지 않는다.
  if (path === '/rtc/incoming' && method === 'GET') {
    const me = await resolveCounselor(db, {
      session: s(q('session'), 128), code: s(q('code'), 64)
    });
    if (!me) return json({ call: null, error: 'bad-code' }, 403, cors);
    const counselorId = me.id;
    const t = nowMs();
    // 안 받고 흘러간 통화를 정리한다.
    //  이게 없으면 회선이 잠긴 채 남아서, 그다음 사람들이 전부
    //  '통화 중'을 보게 된다 (실제로는 아무도 통화하지 않는데).
    try {
      const stale = await db.prepare(
        'SELECT id, room, counselor_id FROM calls WHERE counselor_id = ? AND end_at = 0 AND connect_at = 0 AND ring_at <= ?'
      ).bind(counselorId, t - RING_TIMEOUT).all();
      for (const x of (stale.results || [])) {
        await db.prepare("UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE id = ?")
          .bind(t, x.id).run();
        await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(x.room).run();
      }
      if ((stale.results || []).length) {
        await db.prepare('UPDATE counselors SET busy_until = 0 WHERE id = ?').bind(counselorId).run();
      }
    } catch (e) {}
    const r = await db.prepare(
      'SELECT * FROM calls WHERE counselor_id = ? AND end_at = 0 AND connect_at = 0 AND ring_at > ? ORDER BY ring_at DESC LIMIT 1'
    ).bind(counselorId, t - RING_TIMEOUT).first();
    if (!r) return json({ call: null }, 200, cors);
    return json({
      call: { id: r.id, room: r.room, clientId: r.client_id, bookingId: r.booking_id, ringAt: r.ring_at }
    }, 200, cors);
  }

  // ── 붙었다 (양쪽이 알림) ─────────────────────────────────────────────
  //  과금 시작점은 여기다. 벨만 울린 시간에는 돈을 받지 않는다.
  if (path === '/rtc/connected' && method === 'POST') {
    const id = s(body.callId, 80);
    await db.prepare('UPDATE calls SET connect_at = ? WHERE id = ? AND connect_at = 0')
      .bind(nowMs(), id).run();
    const r = await db.prepare('SELECT connect_at, rate FROM calls WHERE id = ?').bind(id).first();
    return json({ ok: true, connectAt: r ? r.connect_at : 0, rate: r ? r.rate : 0 }, 200, cors);
  }

  // ── 상태 조회 (과금·화면 동기화) ─────────────────────────────────────
  if (path === '/rtc/state' && method === 'GET') {
    const id = s(q('callId'), 80);
    const r = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    const live = r.end_at ? 0 : (r.connect_at ? nowMs() - r.connect_at : 0);
    return json({
      id: r.id, connected: !!r.connect_at, ended: !!r.end_at, endBy: r.end_by || '',
      rate: r.rate, elapsedMs: r.end_at ? (r.end_at - (r.connect_at || r.end_at)) : live,
      billed: r.billed
    }, 200, cors);
  }

  // ── 끊기 ─────────────────────────────────────────────────────────────
  if (path === '/rtc/end' && method === 'POST') {
    const id = s(body.callId, 80);
    const r = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    if (r.end_at) return json({ ok: true, billed: r.billed, already: true }, 200, cors);

    const t = nowMs();
    // 연결된 적이 없으면 요금 0 — 안 받은 전화에 돈을 받지 않는다
    const ms = r.connect_at ? (t - r.connect_at) : 0;
    const billed = billFor(r.rate, ms);
    const by = s(body.by, 20) || 'client';
    await db.prepare('UPDATE calls SET end_at = ?, end_by = ?, billed = ? WHERE id = ?')
      .bind(t, by, billed, id).run();
    await db.prepare('UPDATE counselors SET busy_until = 0 WHERE id = ?').bind(r.counselor_id).run();
    await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(r.room).run();

    // 채팅에 통화 기록을 남긴다. 카톡처럼 '부재중 전화' 가 대화에 보여야
    //  못 받은 쪽이 나중에라도 알고 다시 연락할 수 있다.
    //  안 남기면 상담사는 걸었다는 걸, 내담자는 왔다는 걸 서로 모른다.
    try {
      const mm = Math.floor(ms / 60000), ss = Math.round((ms % 60000) / 1000);
      const line = !r.connect_at
        ? (by === 'counselor' ? '부재중 전화 (상담사가 걸었어요)' : '부재중 전화 (받지 않았어요)')
        : `음성 상담 ${mm > 0 ? mm + '분 ' : ''}${ss}초`;
      await db.prepare(
        `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(rid('cm'), r.counselor_id, '', r.client_id, '',
        by === 'counselor' ? 'counselor' : 'client', '[통화] ' + line, t).run();
    } catch (e) {}
    return json({
      ok: true, billed, connected: !!r.connect_at,
      seconds: Math.round(ms / 1000),
      noAnswer: !r.connect_at
    }, 200, cors);
  }

  // ── 신호 주고받기 ────────────────────────────────────────────────────
  if (path === '/rtc/signal' && method === 'POST') {
    const room = s(body.room, 160), sender = body.sender === 'counselor' ? 'counselor' : 'client';
    const kind = s(body.kind, 12);
    if (!room || !['offer', 'answer', 'ice', 'bye'].includes(kind)) {
      return json({ error: 'bad-signal' }, 400, cors);
    }
    await db.prepare('INSERT INTO rtc_signals (room, sender, kind, payload, ts) VALUES (?,?,?,?,?)')
      .bind(room, sender, kind, String(body.payload || '').slice(0, 20000), nowMs()).run();
    return json({ ok: true }, 200, cors);
  }

  if (path === '/rtc/poll' && method === 'GET') {
    const room = s(q('room'), 160);
    const me = q('as') === 'counselor' ? 'counselor' : 'client';
    const since = Number(q('since')) || 0;
    if (!room) return json({ items: [], seq: since }, 200, cors);
    const r = await db.prepare(
      'SELECT seq, sender, kind, payload FROM rtc_signals WHERE room = ? AND seq > ? AND sender != ? ORDER BY seq ASC LIMIT 60'
    ).bind(room, since, me).all();
    const items = r.results || [];
    const last = items.length ? items[items.length - 1].seq : since;
    // 지나간 신호 청소 (가끔)
    if (Math.random() < 0.05) {
      try { await db.prepare('DELETE FROM rtc_signals WHERE ts < ?').bind(nowMs() - SIGNAL_TTL).run(); } catch (e) {}
    }
    return json({ items, seq: last }, 200, cors);
  }

  return null;
}
