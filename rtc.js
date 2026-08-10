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

import { notifyCounselor, notifyClient } from './push.js';
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

// 통화 상태(거는 중·통화 중·끝)를 양쪽 앱에 실시간으로 민다 — 저장하지 않는 순간 신호.
//  카톡처럼 채팅방에 '전화 거는 중…'이 떠 있으려면 이게 있어야 한다.
function pushCallState(env, ctx, counselorId, clientId, state, extra) {
  if (!env.HUB || !ctx || !ctx.waitUntil) return;
  const evt = JSON.stringify({ type: 'call-state', counselorId, clientId, state, ...(extra || {}) });
  const pub = (ch) => env.HUB.get(env.HUB.idFromName(ch))
    .fetch('https://hub/publish', { method: 'POST', body: evt }).catch(() => {});
  ctx.waitUntil(Promise.all([pub('c:' + counselorId), pub('cl:' + clientId)]));
}

// 통화 기록 한 줄을 채팅 스레드에 남기고, 열린 앱들에는 실시간으로 민다.
//  부재중 전화가 여기서 나온다 — 카톡처럼 양쪽 대화에 남아야
//  상담사가 "전화 왔었네" 하고 회신할 수 있다.
async function logCallToChat(db, env, ctx, call, line, sender) {
  const t = nowMs();
  const cmId = rid('cm');
  try {
    await db.prepare(
      `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(cmId, call.counselor_id, '', call.client_id, '', sender, '[통화] ' + line, t).run();
  } catch (e) { return; }
  if (env.HUB && ctx && ctx.waitUntil) {
    const evt = JSON.stringify({
      type: 'chat',
      msg: { id: cmId, counselorId: call.counselor_id, counselorName: '', clientId: call.client_id,
             clientName: '', from: sender, text: '[통화] ' + line, ts: t }
    });
    const pub = (ch) => env.HUB.get(env.HUB.idFromName(ch))
      .fetch('https://hub/publish', { method: 'POST', body: evt }).catch(() => {});
    ctx.waitUntil(Promise.all([pub('c:' + call.counselor_id), pub('cl:' + call.client_id)]));
  }
}

export async function handleRtc(request, env, cors, path, body, url, ctx) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  const s = (v, n) => String(v == null ? '' : v).slice(0, n || 64);

  // ── 연결에 쓸 서버 목록 ──────────────────────────────────────────────
  //  STUN 만으로는 한국 LTE(대칭 NAT)끼리 절대 못 붙는다 — TURN 이 필수다.
  //  공개 무료 릴레이(openrelay)는 죽은 것으로 실측 확인돼 걷어냈다.
  //  Cloudflare Calls TURN: 시크릿 두 개(CF_TURN_KEY_ID·CF_TURN_KEY_TOKEN)가
  //  들어오면 짧은 TTL 자격증명을 자동 발급한다 (30분 캐시 — 매 통화마다
  //  발급 API 를 때리면 느려지고 한도도 먹는다).
  if (path === '/rtc/ice' && method === 'GET') {
    const servers = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    let turn = false;

    let dbg = '';
    if (env.CF_TURN_KEY_ID && env.CF_TURN_KEY_TOKEN) {
      try {
        const now = Date.now();
        if (!globalThis.__turnCache || globalThis.__turnCache.exp < now) {
          // 발급 API 가 신·구 두 형태다 — 새 것(generate-ice-servers, 배열)을 먼저,
          //  안 되면 옛 것(generate, 단일 객체)을 시도한다.
          // 붙여넣기 과정에서 끝에 공백·줄바꿈이 섞여도 살아남게 반드시 다듬는다
          const keyId = String(env.CF_TURN_KEY_ID).trim();
          const keyTok = String(env.CF_TURN_KEY_TOKEN).trim();
          const call = (ep) => fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/${ep}`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${keyTok}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ ttl: 3600 })
            }
          );
          let r = await call('generate-ice-servers');
          dbg = 'new:' + r.status;
          if (!r.ok) { r = await call('generate'); dbg += ' old:' + r.status; }
          if (r.ok) {
            const d = await r.json();
            const list = Array.isArray(d.iceServers) ? d.iceServers : (d.iceServers ? [d.iceServers] : []);
            globalThis.__turnCache = { servers: list, exp: now + 30 * 60000 };
          }
        }
        if (globalThis.__turnCache && globalThis.__turnCache.servers.length) {
          for (const s of globalThis.__turnCache.servers) servers.push(s);
          turn = true;
        }
      } catch (e) { dbg += ' err:' + String(e && e.message).slice(0, 60); }
    } else {
      dbg = 'no-secrets';
    }
    if (!turn && env.TURN_URL && env.TURN_USER && env.TURN_CRED) {
      // 자체 coturn 등을 쓸 때의 예비 경로
      servers.push({
        urls: String(env.TURN_URL).split(',').map(x => x.trim()).filter(Boolean),
        username: env.TURN_USER, credential: env.TURN_CRED
      });
      turn = true;
    }
    // 디버그 플래그가 있을 때만 발급 상태를 보여준다 (평소엔 감춘다)
    return json(q('debug') ? { iceServers: servers, turn, dbg } : { iceServers: servers, turn }, 200, cors);
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
      "INSERT INTO calls (id, room, counselor_id, client_id, booking_id, rate, ring_at, dir) VALUES (?,?,?,?,?,?,?,'to-counselor')"
    ).bind(id, room, counselorId, clientId, s(body.bookingId), Math.max(0, Number(body.rate) || 0), t).run();

    // 상담사 기기를 깨운다. 앱이 닫혀 있어도 알림이 뜬다.
    //  응답보다 뒤에 보낸다 — 푸시가 느려도 전화 거는 쪽은 기다리지 않는다.
    const wake = notifyCounselor(env, counselorId).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(wake); else await wake;
    // 열려 있는 앱에는 웹소켓으로 즉시 — 3초 폴링보다 벨이 훨씬 빨리 울린다
    pushCallState(env, ctx, counselorId, clientId, 'ringing', { callId: id, room });

    return json({ ok: true, room, callId: id }, 200, cors);
  }

  // ── 상담사가 내담자에게 건다 ─────────────────────────────────────────
  //  숙제 안 한 내담자에게, 부재중을 남긴 내담자에게 — 상담사도 걸 수 있어야 한다.
  //  아무에게나는 아니다: 대화·예약이 있던 '내 내담자'에게만.
  if (path === '/rtc/start-c2c' && method === 'POST') {
    const me = await resolveCounselor(db, {
      session: s(body.session, 128), code: s(body.code, 64)
    });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const clientId = s(body.clientId);
    if (!clientId) return json({ error: 'missing' }, 400, cors);
    const knows = await db.prepare(
      'SELECT id FROM chat_msgs WHERE counselor_id = ? AND client_id = ? LIMIT 1'
    ).bind(me.id, clientId).first()
      || await db.prepare('SELECT id FROM bookings WHERE counselor_id = ? AND client_id = ? LIMIT 1')
        .bind(me.id, clientId).first().catch(() => null);
    if (!knows) return json({ error: '대화한 적 있는 내담자에게만 걸 수 있어요' }, 403, cors);

    const room = roomOf(me.id, clientId);
    const t = nowMs();
    // 좀비 정리: 예전에 걸다 만 통화(벨 시간 초과)가 남아 있으면 부재중으로 닫는다.
    //  안 닫으면 resumed 로 죽은 방을 계속 돌려줘서 새 전화가 영영 안 걸린다.
    try {
      await db.prepare(
        "UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE room = ? AND end_at = 0 AND connect_at = 0 AND ring_at <= ?"
      ).bind(t, room, t - RING_TIMEOUT).run();
      await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(room).run();
    } catch (e) {}
    const mine = await db.prepare(
      'SELECT * FROM calls WHERE room = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1'
    ).bind(room).first();
    if (mine) return json({ ok: true, room, callId: mine.id, resumed: true }, 200, cors);
    const id = rid('call');
    // 상담사 발신은 요금 0 — 내담자에게 과금할 수 없다
    await db.prepare(
      "INSERT INTO calls (id, room, counselor_id, client_id, booking_id, rate, ring_at, dir) VALUES (?,?,?,?,?,0,?,'to-client')"
    ).bind(id, room, me.id, clientId, '', t).run();
    const wake = notifyClient(env, clientId).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(wake); else await wake;
    pushCallState(env, ctx, me.id, clientId, 'ringing', { callId: id, room, from: 'counselor', counselorName: me.name });
    return json({ ok: true, room, callId: id }, 200, cors);
  }

  // ── 내담자에게 걸려온 전화가 있나 (앱을 켰을 때·푸시로 깨어났을 때 확인) ──
  if (path === '/rtc/incoming-client' && method === 'GET') {
    const cid = s(q('clientId'));
    if (!cid) return json({ call: null }, 200, cors);
    const t = nowMs();
    // 흘러간 발신을 부재중으로 정리 (상담사 폴링과 대칭)
    try {
      const stale = await db.prepare(
        "SELECT id, room, counselor_id, client_id FROM calls WHERE client_id = ? AND dir = 'to-client' AND end_at = 0 AND connect_at = 0 AND ring_at <= ?"
      ).bind(cid, t - RING_TIMEOUT).all();
      for (const x of (stale.results || [])) {
        await db.prepare("UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE id = ?").bind(t, x.id).run();
        await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(x.room).run();
        await logCallToChat(db, env, ctx, x, '부재중 전화 — 상담사님이 전화했었어요', 'counselor');
      }
    } catch (e) {}
    const r = await db.prepare(
      "SELECT c.*, k.name AS cname FROM calls c LEFT JOIN counselors k ON k.id = c.counselor_id WHERE c.client_id = ? AND c.dir = 'to-client' AND c.end_at = 0 AND c.connect_at = 0 AND c.ring_at > ? ORDER BY c.ring_at DESC LIMIT 1"
    ).bind(cid, t - RING_TIMEOUT).first();
    if (!r) return json({ call: null }, 200, cors);
    return json({ call: { id: r.id, room: r.room, counselorId: r.counselor_id, counselorName: r.cname || '상담사', ringAt: r.ring_at } }, 200, cors);
  }

  // ── 내가 걸던·하던 통화가 남아 있나 (상담사 복귀용) ──────────────────
  //  모바일 브라우저는 앱을 나가는 순간 페이지를 얼리거나 죽인다.
  //  돌아왔을 때 '아까 그 통화'를 이어붙일 근거가 서버에 있어야 한다.
  if (path === '/rtc/my-active' && method === 'GET') {
    const me = await resolveCounselor(db, {
      session: s(q('session'), 128), code: s(q('code'), 64)
    });
    if (!me) return json({ call: null }, 403, cors);
    const r = await db.prepare(
      'SELECT * FROM calls WHERE counselor_id = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1'
    ).bind(me.id).first();
    if (!r) return json({ call: null }, 200, cors);
    return json({
      call: {
        id: r.id, room: r.room, clientId: r.client_id, dir: r.dir || '',
        phase: r.connect_at ? 'connected' : 'ringing', ringAt: r.ring_at
      }
    }, 200, cors);
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
        "SELECT id, room, counselor_id, client_id FROM calls WHERE counselor_id = ? AND dir != 'to-client' AND end_at = 0 AND connect_at = 0 AND ring_at <= ?"
      ).bind(counselorId, t - RING_TIMEOUT).all();
      for (const x of (stale.results || [])) {
        await db.prepare("UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE id = ?")
          .bind(t, x.id).run();
        await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(x.room).run();
        // 벨만 울리다 흘러간 전화도 '부재중'으로 남긴다 — 기록이 없으면
        //  내담자가 앱을 그냥 꺼버린 통화는 상담사가 영영 모른다
        await logCallToChat(db, env, ctx, x, '부재중 전화 (받지 않았어요)', 'client');
      }
      if ((stale.results || []).length) {
        await db.prepare('UPDATE counselors SET busy_until = 0 WHERE id = ?').bind(counselorId).run();
      }
    } catch (e) {}
    const r = await db.prepare(
      "SELECT * FROM calls WHERE counselor_id = ? AND dir != 'to-client' AND end_at = 0 AND connect_at = 0 AND ring_at > ? ORDER BY ring_at DESC LIMIT 1"
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
    const r = await db.prepare('SELECT counselor_id, client_id, connect_at, rate FROM calls WHERE id = ?').bind(id).first();
    if (r) pushCallState(env, ctx, r.counselor_id, r.client_id, 'connected', { callId: id });
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
    const mm = Math.floor(ms / 60000), ss = Math.round((ms % 60000) / 1000);
    // 연결 전 종료의 세 얼굴: 건 사람이 끊음=취소 · 받는 사람이 끊음=거절 · 아무도 안 끊음=부재중
    const toClient = r.dir === 'to-client';
    const caller = toClient ? 'counselor' : 'client';
    const line = !r.connect_at
      ? (by === 'timeout'
        ? (toClient ? '부재중 전화 — 내담자가 받지 않았어요' : '부재중 전화 (받지 않았어요)')
        : by === 'failed'
          ? '통화 연결 실패'
          : (by === caller
            ? '통화 취소'
            : (toClient ? '부재중 전화 — 지금 받기 어려워요' : '부재중 전화 — 상담사가 지금 받기 어려워요')))
      : `음성 상담 ${mm > 0 ? mm + '분 ' : ''}${ss}초`;
    await logCallToChat(db, env, ctx, r, line, by === 'counselor' ? 'counselor' : 'client');
    pushCallState(env, ctx, r.counselor_id, r.client_id, 'ended', { callId: id });
    // 내담자가 걸었는데 못 받고 끝났다 — 상담사 폰이 이걸 알아야 회신한다
    if (!r.connect_at && by !== 'counselor') {
      const wake = notifyCounselor(env, r.counselor_id).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(wake);
    }
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
    // 'ring' = 수신 기기가 "벨 울리는 중"이라고 발신자에게 알리는 신호 —
    //  이게 있어야 발신 화면이 '전화 거는 중…'에서 '통화 대기 중…'으로 바뀐다.
    if (!room || !['offer', 'answer', 'ice', 'bye', 'ring'].includes(kind)) {
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
