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
//  과금 원칙: 통화는 무료, 상담만 유료, 시간은 서버가 잰다.
//   전에는 내담자 폰의 30초 타이머가 요금을 굴렸다. 화면이 잠기면 그 타이머가
//   얼어붙어서 3분 55초 통화가 0원으로 끝난 사고가 실제로 있었다.
//   반대로 잘못 걸린 전화·안부 전화도 연결만 되면 돈이 나갔다.
//   이제 돈이 붙는 구간은 '상담 세션'뿐이다 — 상담사가 [상담 시작]을 누르고
//   내담자가 동의한 순간부터, 그 시각은 서버가 찍는다(consult_start/consult_end).
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

// ── 상담 세션 ────────────────────────────────────────────────────────────
//  요금은 서버가 정한다. 클라이언트가 보낸 rate 를 그대로 믿으면 누구든
//  30초당 10캐시짜리 상담을 만들어 낼 수 있다.
//  식은 js/marketplace.js 의 callRateFor 와 한 글자도 다르면 안 된다 —
//  화면에 적힌 숫자와 실제로 빠져나가는 숫자가 어긋나는 순간 신뢰가 끝난다.
async function consultRateOf(db, counselorId) {
  try {
    const c = await db.prepare('SELECT price, call_rate FROM counselors WHERE id = ?')
      .bind(counselorId).first();
    if (!c) return 700;
    if (Number(c.call_rate) > 0) return Number(c.call_rate);   // 상담사가 직접 정한 값이 우선
    const price = Number(c.price) || 0;
    if (!price) return 700;
    return Math.max(500, Math.round(price / 60 * 1.25 / 10) * 10);
  } catch (e) { return 700; }
}

// 상담 신호는 서버만 발행한다. /rtc/signal 이 받아주는 kind 목록에 consult-* 가
//  없으므로(claim 과 같은 방식) 밖에서는 위조할 수 없다.
//  sender 로 '누구에게 갈지'가 정해진다 — 폴링이 sender != 나 인 것만 집어가므로
//  'counselor' 는 내담자에게, 'client' 는 상담사에게, 'sys' 는 양쪽 모두에게 간다.
async function consultSignal(db, room, sender, kind, payload) {
  try {
    await db.prepare('INSERT INTO rtc_signals (room, sender, kind, payload, ts) VALUES (?,?,?,?,?)')
      .bind(room, sender, kind, JSON.stringify(payload || {}).slice(0, 2000), nowMs()).run();
  } catch (e) {}
}

// 열려 있는 상담 세션을 마감하고 요금을 calls.billed 에 적는다.
//  upto 는 '통화가 살아 있던 마지막 시각'이다. 죽은 통화를 지금 시각으로 마감하면
//  아무도 없는 방에 요금이 계속 붙는다 — 그래서 마지막 심박을 넘기지 않는다.
//  멱등: 이미 마감됐거나 시작된 적이 없으면 null 을 돌려주고 아무것도 건드리지 않는다.
//  consult_* 컬럼이 아직 없는 배포(스키마 적용 전)에서도 죽지 않는다 — 그때는
//  값이 undefined 라 곧장 null 이고, 통화는 그냥 무료가 된다.
async function endConsult(db, call, upto) {
  try {
    if (!call || !call.consult_start || call.consult_end) return null;
    const end = Math.max(call.consult_start, Math.min(Number(upto) || nowMs(), nowMs()));
    const ms = end - call.consult_start;
    const charge = billFor(call.consult_rate, ms);
    const r = await db.prepare(
      'UPDATE calls SET consult_end = ?, billed = ? WHERE id = ? AND consult_end = 0'
    ).bind(end, charge, call.id).run();
    // 다른 요청이 반 박자 먼저 마감했다면 changes = 0 이다 — 두 번 청구하지 않는다
    if (!(r && r.meta && r.meta.changes > 0)) return null;
    return { seconds: Math.round(ms / 1000), charge, consultEnd: end };
  } catch (e) { return null; }
}

// 이 통화에 붙은 상담 요금 요약 (이미 마감된 것도, 아직 없는 것도 같은 모양으로)
function consultInfo(call, fin) {
  if (fin) return { had: true, seconds: fin.seconds, charge: fin.charge };
  if (call && call.consult_start && call.consult_end) {
    return { had: true, seconds: Math.round((call.consult_end - call.consult_start) / 1000), charge: call.billed || 0 };
  }
  return { had: false, seconds: 0, charge: 0 };
}

// 통화 기록 한 줄의 문구 — 상담이었나 그냥 통화였나를 글자로 구분한다.
//  "음성 상담 3분 20초 · 1,400캐시" / "통화 3분 20초" (무료)
function callLine(ms, info, tail) {
  const s = Math.max(0, Math.round(ms / 1000));
  const dur = `${s >= 60 ? Math.floor(s / 60) + '분 ' : ''}${s % 60}초`;
  const t = tail ? ' ' + tail : '';
  return info && info.had && info.charge > 0
    ? `음성 상담 ${dur} · ${info.charge.toLocaleString()}캐시${t}`
    : `통화 ${dur}${t}`;
}

// 죽은 통화 수거 — 양쪽이 모두 이탈하면(둘 다 앱 종료·크래시) 아무도 끊지
//  않아 통화가 영원히 '진행 중'으로 남고 회선이 잠긴다. 양쪽 클라이언트는
//  통화 중 6초마다 /rtc/state 를 찍으므로(심박), 30초 넘게 심박이 없으면
//  죽은 통화다. 요금은 마지막 심박까지만 — 죽은 시간에 돈을 받지 않는다.
async function reapDeadCalls(db, env, ctx, counselorId) {
  const t = nowMs();
  try {
    const rows = await db.prepare(
      `SELECT * FROM calls WHERE end_at = 0 AND connect_at > 0 AND connect_at < ?
        AND (CASE WHEN last_seen > 0 THEN last_seen ELSE connect_at END) < ?
        ${counselorId ? 'AND counselor_id = ?' : ''} LIMIT 5`
    ).bind(...(counselorId ? [t - 20000, t - 30000, counselorId] : [t - 20000, t - 30000])).all();
    for (const r of (rows.results || [])) {
      const upto = r.last_seen > r.connect_at ? r.last_seen : r.connect_at;
      const ms = Math.max(0, upto - r.connect_at);
      // 통화 자체는 무료다. 열려 있던 상담 세션만 마지막 심박 시각으로 마감한다 —
      //  양쪽 앱이 죽은 뒤의 시간까지 청구하면 그건 없던 상담에 돈을 받는 것이다.
      const fin = await endConsult(db, r, upto);
      const info = consultInfo(r, fin);
      await db.prepare("UPDATE calls SET end_at = ?, end_by = 'dead', billed = ? WHERE id = ? AND end_at = 0")
        .bind(t, info.charge, r.id).run();
      await db.prepare('UPDATE counselors SET busy_until = 0 WHERE id = ?').bind(r.counselor_id).run();
      await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(r.room).run();
      await logCallToChat(db, env, ctx, r, callLine(ms, info, '(연결 끊김)'),
        r.dir === 'to-client' ? 'counselor' : 'client');
    }
  } catch (e) {}
}

// 전화 알림에 띄울 상대 이름 — "010-…" 대신 "홍길동 님"이 떠야 전화 같다.
//  내담자 이름은 calls 테이블에 없다. 대화·예약에 남은 이름을 한 번만 되짚는다.
//  못 찾으면 그냥 '내담자'로 간다 — 이름 하나 때문에 전화를 못 걸면 안 된다.
async function clientNameOf(db, counselorId, clientId) {
  try {
    const r = await db.prepare(
      "SELECT client_name FROM chat_msgs WHERE counselor_id = ? AND client_id = ? AND client_name != '' ORDER BY ts DESC LIMIT 1"
    ).bind(counselorId, clientId).first();
    if (r && r.client_name) return String(r.client_name).slice(0, 30);
  } catch (e) {}
  try {
    const b = await db.prepare(
      "SELECT client_name FROM bookings WHERE counselor_id = ? AND client_id = ? AND client_name != '' ORDER BY rowid DESC LIMIT 1"
    ).bind(counselorId, clientId).first();
    if (b && b.client_name) return String(b.client_name).slice(0, 30);
  } catch (e) {}
  return '내담자';
}

// 울리고 있는 폰을 멈추는 신호. 발신자가 끊었는데 상대 폰이 계속 울리면
//  그건 고문이다 — 웹은 2.5초 폴링이 알아서 멈추지만, 앱의 전체화면 알림은
//  누가 꺼주지 않으면 60초를 다 채운다.
function cancelCallPush(env, ctx, call) {
  if (!call || !call.id) return;
  const toClient = call.dir === 'to-client';
  const p = (toClient
    ? notifyClient(env, call.client_id, { kind: 'cancel', callId: call.id })
    : notifyCounselor(env, call.counselor_id, { kind: 'cancel', callId: call.id })
  ).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
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
    const t = nowMs();
    // 죽은 통화·흘러간 벨을 먼저 걷어낸다 — 안 걷으면 회선이 잠긴 채 남아
    //  모든 새 전화가 '통화 중'으로 튕긴다
    await reapDeadCalls(db, env, ctx, counselorId);
    try {
      await db.prepare(
        "UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE room = ? AND end_at = 0 AND connect_at = 0 AND ring_at <= ?"
      ).bind(t, room, t - RING_TIMEOUT).run();
    } catch (e) {}
    // 내가 이미 걸어둔 통화면 그걸 이어 쓴다 (중복 생성 방지)
    const mine = await db.prepare(
      'SELECT * FROM calls WHERE room = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1'
    ).bind(room).first();
    if (mine) return json({ ok: true, room, callId: mine.id, resumed: true }, 200, cors);
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

    // 상담사 기기를 깨운다. 앱이 닫혀 있어도, 잠긴 화면이어도 벨이 울린다.
    //  응답보다 뒤에 보낸다 — 푸시가 느려도 전화 거는 쪽은 기다리지 않는다.
    //  이름을 실어 보내는 이유: 알림에 '내담자'만 뜨면 받을지 말지 판단할 근거가 없다.
    const wake = clientNameOf(db, counselorId, clientId)
      .then(peer => notifyCounselor(env, counselorId, { kind: 'invite', callId: id, peer }))
      .catch(() => {});
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
    await reapDeadCalls(db, env, ctx, me.id);
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
    // 내담자 폰이 잠겨 있어도 상담사 이름을 띄우고 벨이 울린다
    const wake = notifyClient(env, clientId, { kind: 'invite', callId: id, peer: me.name || '상담사' }).catch(() => {});
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
  //  폰과 태블릿에 같이 로그인해 두면 두 대가 같이 울린다. 둘 다 '받기'를 누르면
  //  같은 방에 answer 가 두 벌 들어가 통화가 꼬인다 — 소리가 한쪽만 나거나,
  //  먼저 받은 사람이 끊긴다. 그래서 여기가 결승선이다.
  //
  //  주의: 이 자리는 '받은 기기'만 부르는 곳이 아니다. 양쪽 피어가 붙는 순간
  //   둘 다 부른다(과금 시각·요금을 받아가야 하므로). 그래서 무턱대고
  //   'connect_at 이 이미 있으면 진 것'으로 처리하면 모든 통화가 깨진다 —
  //   상대편을 남의 기기로 오해하는 것이다.
  //   경쟁이 가능한 쪽은 '받는 쪽'뿐이다. 건 기기는 자기 혼자만 callId 를 알고,
  //   같은 계정의 다른 기기는 수신 조회(dir 필터)에서 그 통화를 보지도 못한다.
  //   누가 받는 쪽인지는 서버가 dir 로 정한다 — 클라이언트가 대는 역할(as)은
  //   '나는 발신/수신 중 어느 다리인가'를 알려주는 힌트로만 쓴다.
  //
  //  자물쇠를 connect_at 으로 걸면 안 된다. 양쪽이 거의 동시에 도착하는데
  //   건 쪽이 반 박자 먼저 오면 진짜 받은 기기가 '늦었다'로 튕긴다 —
  //   동전 던지기로 통화의 절반이 깨진다(로컬 검증에서 실제로 잡았다).
  //   그래서 자물쇠는 따로 둔다: rtc_signals 에 이 통화의 'claim' 한 줄을
  //   조건부 INSERT 로 넣고, 넣은 기기만 이긴다. 한 문장이라 원자적이다.
  //   (kind='claim' 은 /rtc/signal 이 받아주는 목록에 없다 — 밖에서 위조할 수 없고,
  //    폴링으로 흘러가도 양쪽 앱이 모르는 종류라 그냥 무시한다)
  //
  //  진 기기에는 error:'taken' 을 돌려준다. 그쪽은 조용히 접어야 하고,
  //  절대 /rtc/end 나 bye 를 보내면 안 된다 — 이긴 기기의 통화가 끊긴다.
  if (path === '/rtc/connected' && method === 'POST') {
    const id = s(body.callId, 80);
    // 옛 앱(캐시된 JS)은 as 를 안 보낸다. 그때는 예전 그대로 — 아무도 지지 않는다.
    //  새 기능 때문에 업데이트 안 한 폰의 통화가 깨지면 안 된다.
    const as = body.as === 'counselor' ? 'counselor' : (body.as === 'client' ? 'client' : '');
    const pre = await db.prepare('SELECT room, dir, connect_at, end_at FROM calls WHERE id = ?').bind(id).first();
    if (!pre) return json({ ok: false, error: 'not-found' }, 404, cors);
    const answerer = pre.dir === 'to-client' ? 'client' : 'counselor';

    if (as && as === answerer) {
      if (pre.end_at) return json({ ok: false, error: 'ended' }, 200, cors);
      let won = true;
      try {
        const claim = await db.prepare(
          `INSERT INTO rtc_signals (room, sender, kind, payload, ts)
           SELECT ?, 'sys', 'claim', ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM rtc_signals WHERE room = ? AND kind = 'claim' AND payload = ?)`
        ).bind(pre.room, id, nowMs(), pre.room, id).run();
        won = !!(claim && claim.meta && claim.meta.changes > 0);
      } catch (e) {
        // 자물쇠를 못 걸었다고 통화를 막지는 않는다 — 두 대가 같이 받는 사고는
        //  드물고, 아무도 못 받는 사고는 매번이다.
        won = true;
      }
      if (!won) return json({ ok: false, error: 'taken' }, 200, cors);
    }

    // 과금 시작점은 처음 도착한 쪽이 찍는다. 이미 찍혀 있으면 그대로 둔다.
    await db.prepare('UPDATE calls SET connect_at = ? WHERE id = ? AND connect_at = 0')
      .bind(nowMs(), id).run();

    const r = await db.prepare('SELECT counselor_id, client_id, connect_at, rate, dir FROM calls WHERE id = ?').bind(id).first();
    if (r) {
      pushCallState(env, ctx, r.counselor_id, r.client_id, 'connected', { callId: id });
      // 폰을 두 대 쓰는 사람이 있다 — 한 대로 받으면 나머지 한 대의 벨은 꺼져야 한다
      cancelCallPush(env, ctx, { id, dir: r.dir, counselor_id: r.counselor_id, client_id: r.client_id });
    }
    return json({ ok: true, connectAt: r ? r.connect_at : 0, rate: r ? r.rate : 0 }, 200, cors);
  }

  // ── 상태 조회 (과금·화면 동기화 + 심박) ──────────────────────────────
  if (path === '/rtc/state' && method === 'GET') {
    const id = s(q('callId'), 80);
    const r = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    // 살아 있다는 도장 — 리퍼가 이걸 보고 죽은 통화만 걷어간다
    if (!r.end_at) {
      try { await db.prepare('UPDATE calls SET last_seen = ? WHERE id = ?').bind(nowMs(), id).run(); } catch (e) {}
    }
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
    // 이미 끝난 통화도 요금은 그대로 돌려준다 — 늦게 도착한 앱이
    //  '얼마가 나갔는지'를 여기서 알아내 지갑을 맞춘다(멱등)
    if (r.end_at) {
      const done = consultInfo(r, null);
      return json({
        ok: true, billed: r.billed, already: true,
        consult: done, seconds: Math.round(((r.end_at - (r.connect_at || r.end_at)) || 0) / 1000)
      }, 200, cors);
    }

    const t = nowMs();
    // 연결된 적이 없으면 요금 0 — 안 받은 전화에 돈을 받지 않는다
    const ms = r.connect_at ? (t - r.connect_at) : 0;
    // 통화는 무료다. 남아 있는 상담 세션이 있으면 여기서 자동 마감하고,
    //  그 세션의 요금만 청구한다 — 끊고 도망가도 상담비는 정확히 계산된다.
    const fin = await endConsult(db, r, t);
    const info = consultInfo(r, fin);
    const billed = info.charge;
    const by = s(body.by, 20) || 'client';
    await db.prepare('UPDATE calls SET end_at = ?, end_by = ?, billed = ? WHERE id = ?')
      .bind(t, by, billed, id).run();
    await db.prepare('UPDATE counselors SET busy_until = 0 WHERE id = ?').bind(r.counselor_id).run();
    await db.prepare('DELETE FROM rtc_signals WHERE room = ?').bind(r.room).run();
    // 상대 피어에게 '끝났다'를 시그널로도 심는다 — 거절·취소를 상대가
    //  1초 안에 안다 (폴링이 bye 를 집어간다). 이게 없으면 발신자는
    //  거절당한 줄도 모르고 '통화 대기 중…'을 계속 본다.
    try {
      const byeSender = (by === 'counselor') ? 'counselor' : 'client';
      await db.prepare('INSERT INTO rtc_signals (room, sender, kind, payload, ts) VALUES (?,?,?,?,?)')
        .bind(r.room, byeSender, 'bye', '1', t).run();
    } catch (e) {}
    // 상담이 열린 채 통화가 끊겼다면 마감 결과도 양쪽에 심는다 —
    //  bye 만 보면 상대 앱은 '얼마가 청구됐는지'를 영영 모른다.
    //  (신호 청소 뒤에 넣어야 살아남는다)
    if (fin) await consultSignal(db, r.room, 'sys', 'consult-ended', { callId: id, ...fin, auto: true });

    // 채팅에 통화 기록을 남긴다. 카톡처럼 '부재중 전화' 가 대화에 보여야
    //  못 받은 쪽이 나중에라도 알고 다시 연락할 수 있다.
    //  안 남기면 상담사는 걸었다는 걸, 내담자는 왔다는 걸 서로 모른다.
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
      : callLine(ms, info);
    await logCallToChat(db, env, ctx, r, line, by === 'counselor' ? 'counselor' : 'client');
    pushCallState(env, ctx, r.counselor_id, r.client_id, 'ended', { callId: id });
    // 받기 전에 끝났다 = 상대 폰은 아직 울리는 중이다. 그 벨을 꺼준다.
    //  웹은 2.5초 폴링이 알아서 멈추지만, 앱의 전체화면 알림은 누가 꺼주지 않으면
    //  발신자가 포기한 뒤에도 60초를 다 채운다.
    if (!r.connect_at) cancelCallPush(env, ctx, r);
    // 내담자가 걸었는데 못 받고 끝났다 — 상담사 폰이 이걸 알아야 회신한다
    if (!r.connect_at && by !== 'counselor') {
      const wake = notifyCounselor(env, r.counselor_id).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(wake);
    }
    return json({
      ok: true, billed, connected: !!r.connect_at,
      seconds: Math.round(ms / 1000),
      consult: info,               // { had, seconds, charge } — 내담자 앱이 이걸로 지갑을 맞춘다
      noAnswer: !r.connect_at
    }, 200, cors);
  }

  // ══ 상담 세션 ═══════════════════════════════════════════════════════
  //  통화가 붙었다고 상담이 시작된 것은 아니다. 잘못 걸 수도, 안부만 물을 수도,
  //  "지금 통화 되세요?" 하고 약속만 잡을 수도 있다.
  //  그래서 유료 구간은 따로 연다: 상담사가 [상담 시작] → 내담자가 동의 →
  //  그때부터 서버 시계가 돈다. 끝은 [상담 완료]거나 통화 종료다.

  // ── 상담 시작 제안 (상담사만) ────────────────────────────────────────
  if (path === '/rtc/consult/offer' && method === 'POST') {
    const me = await resolveCounselor(db, { session: s(body.session, 128), code: s(body.code, 64) });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const id = s(body.callId, 80);
    const r = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    // 남의 통화에 요금을 제안할 수 없다
    if (r.counselor_id !== me.id) return json({ error: 'forbidden' }, 403, cors);
    // 붙지도 않은 전화에 상담을 열 수 없다 — 벨만 울리는 동안은 아무 일도 일어나지 않는다
    if (!r.connect_at || r.end_at) return json({ error: 'not-connected' }, 409, cors);
    const rate = await consultRateOf(db, me.id);
    // 이미 진행 중이면 다시 묻지 않는다 (버튼 두 번 눌림)
    if (r.consult_start && !r.consult_end) {
      return json({ ok: true, already: true, rate: r.consult_rate || rate, startedAt: r.consult_start }, 200, cors);
    }
    await consultSignal(db, r.room, 'counselor', 'consult-offer',
      { callId: id, rate, counselorName: me.name || '상담사' });
    return json({ ok: true, rate }, 200, cors);
  }

  // ── 상담 시작 동의 (내담자만) ────────────────────────────────────────
  //  요금은 서버가 다시 계산한다. 앱이 보낸 rate 는 쳐다보지도 않는다.
  if (path === '/rtc/consult/accept' && method === 'POST') {
    const id = s(body.callId, 80), clientId = s(body.clientId);
    const r = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    if (!clientId || r.client_id !== clientId) return json({ error: 'forbidden' }, 403, cors);
    if (!r.connect_at || r.end_at) return json({ error: 'not-connected' }, 409, cors);
    // 멱등 — 폴링이 offer 를 두 번 집어 왔거나 버튼이 두 번 눌려도 시각은 하나다
    if (r.consult_start && !r.consult_end) {
      return json({ ok: true, already: true, rate: r.consult_rate, at: r.consult_start }, 200, cors);
    }
    const rate = await consultRateOf(db, r.counselor_id);
    const t = nowMs();
    try {
      const up = await db.prepare(
        'UPDATE calls SET consult_start = ?, consult_rate = ?, consult_end = 0 WHERE id = ? AND end_at = 0 AND consult_start = 0'
      ).bind(t, rate, id).run();
      if (!(up && up.meta && up.meta.changes > 0)) {
        // 한 통화에 상담은 한 번이다. 이미 마감된 상담을 다시 열지 않는다.
        const now = await db.prepare('SELECT consult_start, consult_rate FROM calls WHERE id = ?').bind(id).first();
        return json({ ok: true, already: true, rate: (now && now.consult_rate) || rate, at: (now && now.consult_start) || 0 }, 200, cors);
      }
    } catch (e) {
      // consult_* 컬럼이 아직 없는 배포 — 통화는 살리고 상담만 열지 못한다
      return json({ error: 'not-ready' }, 503, cors);
    }
    await consultSignal(db, r.room, 'client', 'consult-accepted', { callId: id, rate, at: t });
    return json({ ok: true, rate, at: t }, 200, cors);
  }

  // ── 지금은 아니요 (내담자) ───────────────────────────────────────────
  if (path === '/rtc/consult/decline' && method === 'POST') {
    const id = s(body.callId, 80), clientId = s(body.clientId);
    const r = await db.prepare('SELECT room, client_id FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    if (!clientId || r.client_id !== clientId) return json({ error: 'forbidden' }, 403, cors);
    await consultSignal(db, r.room, 'client', 'consult-declined',
      { callId: id, why: s(body.why, 40) });
    return json({ ok: true }, 200, cors);
  }

  // ── 상담 완료 ────────────────────────────────────────────────────────
  //  상담사가 누른다. 잔액이 다 된 내담자도 끝낼 수 있어야 하므로
  //  동의한 본인의 호출도 받는다. 통화는 유지된다 — 마무리 인사가 남았다.
  if (path === '/rtc/consult/end' && method === 'POST') {
    const id = s(body.callId, 80);
    const r = await db.prepare('SELECT * FROM calls WHERE id = ?').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    let by = 'counselor';
    const clientId = s(body.clientId);
    if (clientId && r.client_id === clientId) {
      by = 'client';
    } else {
      const me = await resolveCounselor(db, { session: s(body.session, 128), code: s(body.code, 64) });
      if (!me || me.id !== r.counselor_id) return json({ error: 'forbidden' }, 403, cors);
    }
    if (!r.consult_start) return json({ ok: true, seconds: 0, charge: 0, none: true }, 200, cors);
    // 통화가 이미 끝났다면 그 시각을, 살아 있다면 마지막 심박을 넘지 않는 지금을.
    //  화면이 잠긴 폰의 시계가 아니라 서버가 본 마지막 생존 시각이 기준이다.
    const cap = r.end_at ? r.end_at : nowMs();
    const fin = await endConsult(db, r, cap);
    const info = consultInfo(r, fin);
    if (fin) {
      await consultSignal(db, r.room, 'sys', 'consult-ended', { callId: id, ...fin, by });
    }
    return json({ ok: true, seconds: info.seconds, charge: info.charge, already: !fin }, 200, cors);
  }

  // ── 내가 낸 상담비 (내담자) ──────────────────────────────────────────
  //  차감은 기기가 한다(캐시가 기기에 있다). 그래서 앱이 꺼져 있는 사이에
  //  끝난 상담은 차감이 통째로 빠질 수 있다 — 앱을 켤 때 여기서 되짚어 맞춘다.
  if (path === '/rtc/my-charges' && method === 'GET') {
    const cid = s(q('clientId'));
    if (!cid) return json({ items: [] }, 200, cors);
    const since = nowMs() - 30 * 86400000;
    try {
      const r = await db.prepare(
        `SELECT c.id, c.billed, c.end_at, c.consult_start, c.consult_end, k.name AS cname
           FROM calls c LEFT JOIN counselors k ON k.id = c.counselor_id
          WHERE c.client_id = ? AND c.billed > 0 AND c.end_at > 0 AND c.end_at >= ?
          ORDER BY c.end_at DESC LIMIT 50`
      ).bind(cid, since).all();
      return json({
        items: (r.results || []).map(x => ({
          callId: x.id, charge: x.billed || 0, at: x.end_at,
          seconds: x.consult_start && x.consult_end ? Math.round((x.consult_end - x.consult_start) / 1000) : 0,
          counselorName: x.cname || '상담사'
        }))
      }, 200, cors);
    } catch (e) { return json({ items: [] }, 200, cors); }
  }

  // ── 내가 받은 상담비 (상담사) ────────────────────────────────────────
  //  정산 탭은 예약(bookings)만 보고 있었다. 바로상담은 /settle 에서만 잡혀서
  //  상담사 화면에는 통화 수입이 통째로 보이지 않았다.
  if (path === '/rtc/my-calls' && method === 'GET') {
    const me = await resolveCounselor(db, { session: s(q('session'), 128), code: s(q('code'), 64) });
    if (!me) return json({ items: [] }, 403, cors);
    const since = nowMs() - 400 * 86400000;
    try {
      const r = await db.prepare(
        `SELECT id, client_id, billed, connect_at, end_at, consult_start, consult_end, settled_at
           FROM calls WHERE counselor_id = ? AND billed > 0 AND end_at >= ?
          ORDER BY end_at DESC LIMIT 200`
      ).bind(me.id, since).all();
      return json({
        items: (r.results || []).map(x => ({
          id: x.id, clientId: x.client_id, charge: x.billed || 0, at: x.end_at,
          callSeconds: Math.max(0, Math.round(((x.end_at || 0) - (x.connect_at || 0)) / 1000)),
          consultSeconds: x.consult_start && x.consult_end ? Math.round((x.consult_end - x.consult_start) / 1000) : 0,
          settledAt: x.settled_at || 0
        }))
      }, 200, cors);
    } catch (e) { return json({ items: [] }, 200, cors); }
  }

  // ── 신호 주고받기 ────────────────────────────────────────────────────
  //  consult-* 와 claim 은 이 목록에 없다 — 서버만 발행한다.
  //  밖에서 넣을 수 있게 두면 내담자 동의 없이 과금을 시작하거나,
  //  남의 상담을 멋대로 끝낼 수 있다.
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
