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

import { resolveCounselor, handleAuth, sendCodeMail, sendApplyReceipt } from './auth.js';
import { handleRtc } from './rtc.js';
import { handlePush, notifyCounselor, notifyClient } from './push.js';
import { handleOauth } from './oauth.js';
import { handleSync } from './sync.js';

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

// ── 연락처 유출 차단 ───────────────────────────────────────────────────
//  상담사가 내담자를 플랫폼 밖으로 빼가면 (또는 내담자가 밖에서 만나자고 하면)
//  기록도 안전장치도 정산도 전부 사라진다. 사고가 나도 우리가 알 수 없다.
//  그래서 채팅에서 오가는 연락처는 서버에서 가린다.
//
//  '완벽한 차단'은 불가능하다 — 사람은 "공일공에 일이삼사" 처럼 얼마든지 우회한다.
//  목표는 우회를 어렵고 눈에 띄게 만드는 것, 그리고 시도를 기록으로 남기는 것이다.
//
//  위기 상담번호(109·1577-0199·1366·1388·119)는 절대 가리지 않는다.
const CRISIS_NUMS = ['109', '1577-0199', '15770199', '1366', '1388', '119', '129', '1393'];

function maskContacts(text) {
  let t = String(text || '');
  let hits = 0;

  // 위기번호는 잠시 빼둔다 — 단, '숫자에 둘러싸이지 않은' 경우에만.
  //  전에는 그냥 치환해서, 01098765432 안의 109 가 먼저 빠지는 바람에
  //  전화번호 패턴이 깨지고 그 번호가 그대로 통과했다.
  const keep = [];
  CRISIS_NUMS.forEach((n, k) => {
    const re = new RegExp('(?<![0-9-])' + n.replace(/-/g, '[-]') + '(?![0-9-])', 'g');
    if (re.test(t)) {
      const tk = '\uE000' + k + '\uE001';   // 사용자 영역 문자 — 본문에 나올 리 없다
      keep.push([tk, n]);
      t = t.replace(re, tk);
    }
  });

  const rules = [
    // 휴대폰·일반 전화 (구분자 자유)
    /0\s?1\s?[0-9][\s.\-]?\d{3,4}[\s.\-]?\d{4}/g,
    /0\d{1,2}[\s.\-]\d{3,4}[\s.\-]\d{4}/g,
    // 한글·유사문자 우회: 공일공 / 영일영 / o1o / ㅇ1ㅇ
    /[공영빵][일이삼사오육칠팔구영공]{1,2}[공영빵]\s*[에의]?\s*[일이삼사오육칠팔구영공\s]{6,}/g,
    /[oO0ㅇ]\s?1\s?[oO0ㅇ][\s.\-]?[\d일이삼사오육칠팔구영공]{3,4}[\s.\-]?[\d일이삼사오육칠팔구영공]{4}/g,
    // 이메일
    /[A-Za-z0-9._%+\-]+\s?@\s?[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    // 링크·오픈채팅
    /(https?:\/\/|www\.)[^\s]+/gi,
    /open\.kakao\.com[^\s]*/gi,
    // 메신저 아이디 유도
    /(카톡|카카오톡|카카오|텔레그램|텔레|라인|인스타|디엠|DM|kakao|telegram|line)\s*(아이디|ID|id|아디)?\s*[:：]?\s*[A-Za-z0-9._\-]{3,}/g
  ];
  rules.forEach(re => {
    t = t.replace(re, () => { hits++; return '[연락처는 전달되지 않아요]'; });
  });

  keep.forEach(([tk, n]) => { t = t.split(tk).join(n); });
  return { text: t, hits };
}

// 운영자 마스터 코드 — 전체 열람. 시크릿으로만 준다.
const isAdmin = (env, code) => !!env.ADMIN_CODE && code === env.ADMIN_CODE;

// ---------------------------------------------------------------------------
export async function handleMarket(request, env, cors, path, ctx) {
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

  // 원격 진단 — 실기기의 통화가 어느 단계에서 죽는지 서버가 알아야 고친다
  if (path === '/diag' && method === 'POST') {
    try {
      await db.prepare('INSERT INTO diag (id, ts, app, who, build, stage, msg) VALUES (?,?,?,?,?,?,?)')
        .bind(rid('dg'), nowMs(), s(body.app, 20), s(body.who, 16), s(body.build, 12),
              s(body.stage, 40), s(body.msg, 200)).run();
      // 쌓이기만 하면 안 되니 가끔 一주일 지난 것을 지운다
      if (Math.random() < 0.02) {
        await db.prepare('DELETE FROM diag WHERE ts < ?').bind(nowMs() - 7 * 86400000).run();
      }
    } catch (e) {}
    return json({ ok: true }, 200, cors);
  }

  // 앱 내 음성통화 — 시그널링·과금
  if (path.startsWith('/rtc/')) {
    const r = await handleRtc(request, env, cors, path, body, url, ctx);
    if (r) return r;
  }

  // 웹 푸시 구독 — 상담사 앱이 화면을 꺼도 전화를 받게
  if (path.startsWith('/push/')) {
    const r = await handlePush(request, env, cors, path, body, url);
    if (r) return r;
  }

  // 소셜 로그인 (카카오·네이버·구글)
  if (path.startsWith('/oauth/')) {
    const r = await handleOauth(request, env, cors, path, body, url);
    if (r) return r;
  }

  // 계정 동기화 — 대화 원문은 올라오지 않는다 (sync.js 흰 목록 참고)
  if (path === '/sync' || path.startsWith('/sync/')) {
    const r = await handleSync(request, env, cors, path, body, url);
    if (r) return r;
  }

  // ── 상담사 목록 ─────────────────────────────────────────────────────
  // 매칭 탭에 뿌릴 공개 명부.
  //  전에는 id·이름·소속만 줬는데, 그것만으로는 카드를 그릴 수 없어서
  //  앱이 결국 기기 안의 사본(cbt_custom_counselors)을 썼다.
  //  그래서 A 폰에서 승인한 상담사가 B 폰에는 없었다. 카드에 필요한 걸 다 준다.
  //  전화번호는 주지 않는다 — 앱 안에서 통화하므로 번호가 오갈 이유가 없다.
  if (path === '/counselors' && method === 'GET') {
    const r = await db.prepare(
      `SELECT id, name, hospital, addr, intro, tags, price, call_rate, license, available, busy_until
         FROM counselors WHERE active = 1 ORDER BY created DESC`
    ).all();
    return json({
      items: (r.results || []).map(c => ({
        id: c.id, name: c.name, hospital: c.hospital || '', addr: c.addr || '',
        intro: c.intro || '', tags: safeJson(c.tags, []),
        price: c.price || 0, callRate: c.call_rate || 0, license: c.license || '',
        available: !!c.available, busyUntil: c.busy_until || 0
      }))
    }, 200, cors);
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
      // 본인 화면에서는 자기 메모가 보여야 한다 (내담자용 rowBooking 에는 없다)
      return json({
        items: (r.results || []).map(x => ({ ...rowBooking(x), cnote: x.cnote || '' })),
        scope: 'counselor'
      }, 200, cors);
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

  // ── 상담 완료 → 확인 → 정산 ─────────────────────────────────────────
  //  돈이 걸린 구간이라 '누가 무엇을 했는지'를 전부 시각으로 남긴다.
  const AUTO_CONFIRM_MS = 72 * 3600000;   // 내담자가 아무 말 없으면 3일 뒤 자동 확정

  // 상담사: 상담을 마쳤다
  if (path === '/bookings/done' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const id = s(body.id, MAX.id);
    const b = await db.prepare('SELECT * FROM bookings WHERE id = ? AND counselor_id = ?')
      .bind(id, me.id).first();
    if (!b) return json({ error: 'not-found' }, 404, cors);
    if (b.status !== 'confirmed') return json({ error: '완료 처리할 수 있는 상태가 아닙니다' }, 400, cors);
    if (b.when_ts > nowMs()) return json({ error: '상담 시각 전에는 완료 처리할 수 없습니다' }, 400, cors);
    const t = nowMs();
    await db.prepare(
      'UPDATE bookings SET status = ?, done_at = ?, auto_at = ?, cnote = COALESCE(?, cnote) WHERE id = ?'
    ).bind('done', t, t + AUTO_CONFIRM_MS, s(body.note, 1000) || null, id).run();
    return json({ ok: true, autoAt: t + AUTO_CONFIRM_MS }, 200, cors);
  }

  // 내담자: 잘 받았다 (확인하면 정산이 확정된다)
  if (path === '/bookings/confirm' && method === 'POST') {
    const id = s(body.id, MAX.id), clientId = s(body.clientId, MAX.id);
    if (!id || !clientId) return json({ error: 'missing' }, 400, cors);
    const r = await db.prepare(
      "UPDATE bookings SET confirm_at = ? WHERE id = ? AND client_id = ? AND status = 'done' AND confirm_at = 0"
    ).bind(nowMs(), id, clientId).run();
    return json({ ok: true }, 200, cors);
  }

  // 내담자: 이의 있음 — 정산을 멈춘다
  if (path === '/bookings/dispute' && method === 'POST') {
    const id = s(body.id, MAX.id), clientId = s(body.clientId, MAX.id);
    const why = s(body.why, 500);
    if (!id || !clientId || !why) return json({ error: '사유를 적어주세요' }, 400, cors);
    await db.prepare(
      "UPDATE bookings SET dispute = ?, dispute_at = ?, status = 'disputed' WHERE id = ? AND client_id = ? AND settled_at = 0"
    ).bind(why, nowMs(), id, clientId).run();
    return json({ ok: true }, 200, cors);
  }

  // 상담사 메모 (내담자에게 보이지 않는다)
  if (path === '/bookings/note' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    await db.prepare('UPDATE bookings SET cnote = ? WHERE id = ? AND counselor_id = ?')
      .bind(s(body.note, 1000), s(body.id, MAX.id), me.id).run();
    return json({ ok: true }, 200, cors);
  }

  // 환불 — 상담사가 스스로, 또는 운영자가
  if (path === '/bookings/refund' && method === 'POST') {
    const id = s(body.id, MAX.id);
    const admin = isAdmin(env, code);
    let owner = null;
    if (!admin) {
      owner = await whoami(db, cred);
      if (!owner) return json({ error: 'bad-code' }, 403, cors);
    }
    const b = admin
      ? await db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first()
      : await db.prepare('SELECT * FROM bookings WHERE id = ? AND counselor_id = ?').bind(id, owner.id).first();
    if (!b) return json({ error: 'not-found' }, 404, cors);
    if (b.settled_at) return json({ error: '이미 정산이 끝난 상담입니다' }, 400, cors);
    const amount = Math.max(0, Math.min(b.price || 0, num(body.amount) || (b.price || 0)));
    await db.prepare(
      "UPDATE bookings SET status = 'refunded', refund = ?, refund_at = ?, refund_why = ? WHERE id = ?"
    ).bind(amount, nowMs(), s(body.why, 300), id).run();
    return json({ ok: true, refund: amount }, 200, cors);
  }

  // 정산 대기 목록 (운영자)
  if (path === '/settle' && method === 'GET') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const t = nowMs();
    const r = await db.prepare(
      `SELECT b.*, c.name cname, c.bank, c.bank_no, c.bank_holder
         FROM bookings b LEFT JOIN counselors c ON c.id = b.counselor_id
        WHERE b.status = 'done' AND b.settled_at = 0
          AND (b.confirm_at > 0 OR b.auto_at <= ?)
        ORDER BY b.done_at ASC LIMIT 300`
    ).bind(t).all();
    const items = (r.results || []).map(x => {
      const p = payoutOf(x.price || 0);
      return {
        id: x.id, counselorId: x.counselor_id, counselor: x.cname || x.counselor_name,
        clientName: x.client_name, time: x.time_label, price: x.price,
        doneAt: x.done_at, confirmed: !!x.confirm_at, auto: !x.confirm_at,
        payout: p,
        bank: x.bank_no ? { bank: x.bank, holder: x.bank_holder, masked: maskAcct(x.bank_no) } : null
      };
    });
    const sum = items.reduce((a, x) => a + x.payout.counselor, 0);
    return json({ items, counselorTotal: sum }, 200, cors);
  }

  // 지급 완료 처리 (운영자)
  if (path === '/settle/pay' && method === 'POST') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => s(x, MAX.id)).filter(Boolean).slice(0, 200);
    if (!ids.length) return json({ error: 'ids 없음' }, 400, cors);
    const t = nowMs();
    await db.batch(ids.map(id =>
      db.prepare("UPDATE bookings SET settled_at = ? WHERE id = ? AND status = 'done' AND settled_at = 0").bind(t, id)));
    return json({ ok: true, n: ids.length }, 200, cors);
  }

  // ── 숙제 ────────────────────────────────────────────────────────────
  if (path === '/homework' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const clientId = s(body.clientId, MAX.id);
    const text = s(body.text, 200);
    if (!clientId || !text) return json({ error: '내담자와 내용을 확인해주세요' }, 400, cors);
    const id = rid('hw');
    const hwTs = nowMs();
    await db.prepare(
      `INSERT INTO homework (id, counselor_id, counselor, client_id, booking_id, text, why, due_at, assigned_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(id, me.id, me.name, clientId, s(body.bookingId, MAX.id),
      text, s(body.why, 200), num(body.dueAt), hwTs).run();
    // 채팅에도 흔적을 남긴다 — "숙제를 냈어요" 말풍선이 있어야 내담자가
    //  대화 흐름 속에서 발견하고, 눌러서 무슨 숙제인지 볼 수 있다.
    //  [숙제:id] 마커는 앱이 카드로 그린다 (글자로 노출되지 않는다).
    try {
      const cmId = rid('cm');
      await db.prepare(
        `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(cmId, me.id, me.name, clientId, s(body.clientName) || '', 'counselor',
        `[숙제:${id}] ${text}`, hwTs).run();
      if (env.HUB && ctx && ctx.waitUntil) {
        const evt = JSON.stringify({
          type: 'chat',
          msg: { id: cmId, counselorId: me.id, counselorName: me.name, clientId,
                 clientName: s(body.clientName) || '', from: 'counselor',
                 text: `[숙제:${id}] ${text}`, ts: hwTs }
        });
        const pub = (ch) => env.HUB.get(env.HUB.idFromName(ch))
          .fetch('https://hub/publish', { method: 'POST', body: evt }).catch(() => {});
        ctx.waitUntil(Promise.all([pub('c:' + me.id), pub('cl:' + clientId)]));
      }
      // 앱이 꺼져 있어도 숙제는 닿아야 한다
      if (ctx && ctx.waitUntil) ctx.waitUntil(notifyClient(env, clientId).catch(() => {}));
    } catch (e) {}
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/homework' && method === 'GET') {
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      const r = await db.prepare(
        'SELECT * FROM homework WHERE counselor_id = ? ORDER BY assigned_at DESC LIMIT 200').bind(me.id).all();
      return json({ items: (r.results || []).map(rowHw) }, 200, cors);
    }
    const cid = s(q('clientId'), MAX.id);
    if (!cid) return json({ items: [] }, 200, cors);
    const r = await db.prepare(
      'SELECT * FROM homework WHERE client_id = ? ORDER BY assigned_at DESC LIMIT 50').bind(cid).all();
    return json({ items: (r.results || []).map(rowHw) }, 200, cors);
  }

  if (path === '/homework/done' && method === 'POST') {
    const id = s(body.id, MAX.id), clientId = s(body.clientId, MAX.id);
    if (!id || !clientId) return json({ error: 'missing' }, 400, cors);
    await db.prepare('UPDATE homework SET done_at = ?, note = ? WHERE id = ? AND client_id = ?')
      .bind(nowMs(), s(body.note, 300), id, clientId).run();
    return json({ ok: true }, 200, cors);
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

    // 연락처는 저장 전에 가린다. 원문을 남겨두면 언젠가 새어 나간다.
    const clean = maskContacts(text);
    const id = rid('cm');
    // 내담자 메시지면 상담사 기기를 깨운다 (통화는 이미 깨우는데 채팅만 조용했다).
    //  연타로 보낼 때 폰이 도배되지 않게, 최근 2분 안에 이미 보낸 적 있으면 쉰다.
    //  판정은 INSERT 전에 — 방금 넣은 내 메시지가 스로틀에 걸리면 안 되니까.
    let wakeCounselor = false;
    let wakeClient = false;
    if (from === 'client') {
      try {
        const recent = await db.prepare(
          "SELECT id FROM chat_msgs WHERE counselor_id = ? AND client_id = ? AND sender = 'client' AND ts > ? LIMIT 1"
        ).bind(counselorId, clientId, nowMs() - 120000).first();
        wakeCounselor = !recent;
      } catch (e) { wakeCounselor = true; }
    } else {
      // 상담사 답장 → 내담자 기기도 깨운다 (같은 2분 스로틀)
      try {
        const recent = await db.prepare(
          "SELECT id FROM chat_msgs WHERE counselor_id = ? AND client_id = ? AND sender = 'counselor' AND ts > ? LIMIT 1"
        ).bind(counselorId, clientId, nowMs() - 120000).first();
        wakeClient = !recent;
      } catch (e) { wakeClient = true; }
    }
    const msgTs = nowMs();
    await db.prepare(
      `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, counselorId, s(body.counselorName), clientId,
      s(body.clientName) || '익명', from, clean.text, msgTs).run();
    if (wakeCounselor && ctx && ctx.waitUntil) {
      ctx.waitUntil(notifyCounselor(env, counselorId).catch(() => {}));
    }
    if (wakeClient && ctx && ctx.waitUntil) {
      ctx.waitUntil(notifyClient(env, clientId).catch(() => {}));
    }
    // 실시간: 양쪽 채널의 열린 앱에 즉시 밀어준다 — 이게 없으면 받는 쪽은
    //  다음 폴링(8~15초)까지 감감무소식이라 '카톡보다 느린' 채팅이 된다.
    if (env.HUB && ctx && ctx.waitUntil) {
      const evt = JSON.stringify({
        type: 'chat',
        msg: { id, counselorId, counselorName: s(body.counselorName), clientId,
               clientName: s(body.clientName) || '익명', from, text: clean.text, ts: msgTs }
      });
      const pub = (ch) => env.HUB.get(env.HUB.idFromName(ch))
        .fetch('https://hub/publish', { method: 'POST', body: evt }).catch(() => {});
      ctx.waitUntil(Promise.all([pub('c:' + counselorId), pub('cl:' + clientId)]));
    }
    // 시도는 기록해 둔다 — 반복되면 운영자가 보고 조치할 수 있어야 한다
    if (clean.hits) {
      try {
        await db.prepare(
          'INSERT INTO contact_attempts (id, counselor_id, client_id, sender, n, ts) VALUES (?,?,?,?,?,?)'
        ).bind(rid('ct'), counselorId, clientId, from, clean.hits, nowMs()).run();
      } catch (e) {}
    }
    return json({ ok: true, id, masked: clean.hits }, 200, cors);
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
      mailReady: !!env.RESEND_API_KEY,
      counselorsWithoutEmail: r.noMail || 0
    }, 200, cors);
  }

  // ── 상담사 본인 정보 ────────────────────────────────────────────────
  //  병원 이전·상담료 변경·계좌 변경은 실제로 일어난다.
  //  운영자에게 전화하게 만들면 1,000명은 감당이 안 된다.
  // ── 배지 숫자 ────────────────────────────────────────────────────────
  //  소비자 앱의 로고 위에 띄울 '안 본 것' 개수. 목록 전체를 받아오지 않는다.
  //  상담사가 앱을 켜두지 않아도 '뭔가 왔다'는 건 알아야 하기 때문이다.
  //  since 는 앱이 마지막으로 상담사 앱을 연 시각 — 서버가 기억할 만한 값이 아니라
  //  기기가 들고 있다가 보내준다.
  if (path === '/badge' && method === 'GET') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const since = Math.max(0, num(q('since')));
    const t = Date.now();
    // 네 번을 Promise.all 로 동시에 던지지 않는다 — D1 은 한 연결에서
    //  동시 실행을 싫어한다(전에 카운터 UPSERT 세 개가 조용히 하나씩 실패했다).
    //  batch 는 한 번의 왕복으로 순서대로 처리해 준다.
    const res = await db.batch([
      db.prepare('SELECT COUNT(*) n FROM inbox WHERE counselor_id = ? AND read_at = 0').bind(me.id),
      db.prepare("SELECT COUNT(*) n FROM chat_msgs WHERE counselor_id = ? AND sender = 'client' AND ts > ?").bind(me.id, since),
      db.prepare('SELECT COUNT(*) n FROM bookings WHERE counselor_id = ? AND created > ?').bind(me.id, since),
      db.prepare('SELECT COUNT(*) n FROM calls WHERE counselor_id = ? AND end_at = 0 AND connect_at = 0 AND ring_at > ?')
        .bind(me.id, t - 60000)
    ]);
    const nOf = i => {
      const r = res[i] && res[i].results && res[i].results[0];
      return r ? Number(r.n || 0) : 0;
    };
    const inbox = nOf(0), chats = nOf(1), bookings = nOf(2), ringing = nOf(3);
    return json({
      ok: true, inbox, chats, bookings, ringing,
      total: inbox + chats + bookings + ringing, now: t
    }, 200, cors);
  }

  if (path === '/me') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);

    if (method === 'GET') {
      const c = await db.prepare(
        `SELECT id,name,hospital,email,tel,addr,intro,tags,price,call_rate,license,
                slots,offdays,bank,bank_no,bank_holder,available,updated
           FROM counselors WHERE id = ?`).bind(me.id).first();
      return json({ ok: true, me: rowProfile(c) }, 200, cors);
    }

    if (method === 'POST') {
      // 이름은 본인이 못 바꾼다 — 자격 확인을 거친 값이라 운영자만 손댄다
      const p = {
        hospital: s(body.hospital, 120), tel: s(body.tel, 40), addr: s(body.addr, 200),
        intro: s(body.intro, 600), license: s(body.license, 80),
        price: Math.max(0, Math.min(1000000, num(body.price))),
        call_rate: Math.max(0, Math.min(100000, num(body.callRate)))
      };
      let tags = '';
      try {
        const t = Array.isArray(body.tags) ? body.tags : [];
        tags = JSON.stringify(t.map(x => s(x, 20)).filter(Boolean).slice(0, 6));
      } catch (e) { tags = '[]'; }
      await db.prepare(
        `UPDATE counselors SET hospital=?, tel=?, addr=?, intro=?, license=?,
                price=?, call_rate=?, tags=?, updated=? WHERE id=?`
      ).bind(p.hospital, p.tel, p.addr, p.intro, p.license,
             p.price, p.call_rate, tags, nowMs(), me.id).run();
      return json({ ok: true }, 200, cors);
    }
  }

  // 예약 가능 시간 — 요일별 시간대 + 특정 날짜 휴무
  if (path === '/me/slots' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const clean = {};
    const src = (body.slots && typeof body.slots === 'object') ? body.slots : {};
    for (let d = 0; d <= 6; d++) {
      const list = Array.isArray(src[d]) ? src[d] : (Array.isArray(src[String(d)]) ? src[String(d)] : []);
      const ok = [...new Set(list.map(x => String(x))
        .filter(x => /^([01]\d|2[0-3]):(00|30)$/.test(x)))].sort();
      // 0~23시를 모두 열 수 있어야 한다(24칸). 30분 단위로 넓힐 여지까지 두고 48.
      if (ok.length) clean[d] = ok.slice(0, 48);
    }
    const off = [...new Set((Array.isArray(body.offdays) ? body.offdays : [])
      .map(x => String(x)).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))].slice(0, 120);
    await db.prepare('UPDATE counselors SET slots=?, offdays=?, updated=? WHERE id=?')
      .bind(JSON.stringify(clean), JSON.stringify(off), nowMs(), me.id).run();
    return json({ ok: true, slots: clean, offdays: off }, 200, cors);
  }

  // 정산 계좌 — 저장은 받되, 돌려줄 때는 항상 가린다
  if (path === '/me/payout' && method === 'POST') {
    const me = await whoami(db, cred);
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const bank = s(body.bank, 40).trim();
    const noRaw = s(body.bankNo, 40).replace(/[^0-9-]/g, '');
    const holder = s(body.bankHolder, 40).trim();
    if (!bank || !noRaw || !holder) return json({ error: '은행·계좌번호·예금주를 모두 적어주세요' }, 400, cors);
    if (noRaw.replace(/-/g, '').length < 8) return json({ error: '계좌번호가 너무 짧습니다' }, 400, cors);
    await db.prepare('UPDATE counselors SET bank=?, bank_no=?, bank_holder=?, updated=? WHERE id=?')
      .bind(bank, noRaw, holder, nowMs(), me.id).run();
    await db.prepare('INSERT INTO payout_changes (id, counselor_id, masked, ts) VALUES (?,?,?,?)')
      .bind(rid('pc'), me.id, maskAcct(noRaw), nowMs()).run();
    return json({ ok: true, masked: maskAcct(noRaw) }, 200, cors);
  }

  // 앱이 예약창에 쓸 '이 상담사의 가능 시간'
  if (path === '/slots' && method === 'GET') {
    const cid = s(q('counselorId'), MAX.id);
    if (!cid) return json({ slots: {}, offdays: [] }, 200, cors);
    const c = await db.prepare('SELECT slots, offdays, price FROM counselors WHERE id = ? AND active = 1')
      .bind(cid).first();
    if (!c) return json({ slots: {}, offdays: [] }, 200, cors);
    return json({
      slots: safeJson(c.slots, {}), offdays: safeJson(c.offdays, []), price: c.price || 0
    }, 200, cors);
  }

  // ── 입점 신청 ───────────────────────────────────────────────────────
  //  신청서가 기기 안에만 있어서, 다른 폰에서 신청하면 운영자 콘솔에
  //  아무것도 안 떴다. 서버로 옮긴다.
  if (path === '/apply' && method === 'POST') {
    const clientId = s(body.clientId, MAX.id);
    const name = s(body.name).trim();
    if (!clientId || !name) return json({ error: '이름을 확인해주세요' }, 400, cors);
    const acct = s(body.bankNo, 40).replace(/[^0-9-]/g, '');
    if (!s(body.bank, 40).trim() || !acct || !s(body.bankHolder, 40).trim()) {
      return json({ error: '정산 계좌를 모두 적어주세요' }, 400, cors);
    }
    // 같은 기기에서 심사 중인 신청이 이미 있으면 막는다 (중복 접수 방지).
    //  단 운영자가 대신 넣는 경우는 예외다 — 한 기기에서 여러 상담사를
    //  등록하는 게 정상이고, 여기서 막으면 두 번째부터 '이미 심사 중'이 뜬다.
    if (!isAdmin(env, code)) {
      const dup = await db.prepare(
        "SELECT id FROM applications WHERE client_id = ? AND status = 'pending'").bind(clientId).first();
      if (dup) return json({ error: '이미 심사 중인 신청이 있어요' }, 409, cors);
    }

    const id = rid('ca');
    let tags = '[]';
    try { tags = JSON.stringify((Array.isArray(body.tags) ? body.tags : []).map(x => s(x, 20)).slice(0, 3)); } catch (e) {}
    await db.prepare(
      `INSERT INTO applications
       (id, client_id, name, license, career, price, intro, hospital, addr, tel, email,
        tags, photo, bank, bank_no, bank_holder, status, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
    ).bind(id, clientId, name, s(body.license, 80), s(body.career, 20),
      num(body.price), s(body.intro, 600), s(body.hospital, 120), s(body.addr, 200),
      s(body.tel, 40), s(body.email, 160).toLowerCase(), tags,
      s(body.photo, 200000) || null,           // 256px 리사이즈본이라 넉넉히
      s(body.bank, 40), acct, s(body.bankHolder, 40), nowMs()).run();

    // 접수됐다는 걸 바로 알려준다. 아무 소식이 없으면 또 신청하거나 잊는다.
    //  응답보다 뒤로 보낸다 — 메일이 느려도 신청 화면은 기다리지 않는다.
    const mail = s(body.email, 160).toLowerCase();
    if (mail) {
      const receipt = sendApplyReceipt(env, db, mail, name).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(receipt); else await receipt;
    }
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/apply' && method === 'GET') {
    if (isAdmin(env, code)) {
      const r = await db.prepare('SELECT * FROM applications ORDER BY ts DESC LIMIT 200').all();
      return json({ items: (r.results || []).map(a => rowApp(a, true)), scope: 'admin' }, 200, cors);
    }
    const cid = s(q('clientId'), MAX.id);
    if (!cid) return json({ items: [] }, 200, cors);
    const r = await db.prepare(
      'SELECT * FROM applications WHERE client_id = ? ORDER BY ts DESC LIMIT 10').bind(cid).all();
    return json({ items: (r.results || []).map(a => rowApp(a, false)) }, 200, cors);
  }

  // 승인 — 상담사 계정을 만들고 코드를 발급한다
  if (path === '/apply/approve' && method === 'POST') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const id = s(body.id, MAX.id);
    const a = await db.prepare('SELECT * FROM applications WHERE id = ?').bind(id).first();
    if (!a) return json({ error: 'not-found' }, 404, cors);
    if (a.status === 'approved') return json({ error: '이미 승인된 신청입니다' }, 400, cors);

    const cid = 'c' + nowMs().toString(36).slice(-6);
    const newCode = makeCode();
    // 신청서에 적힌 계좌를 그대로 상담사 계정으로 옮긴다 (다시 입력하게 하지 않는다)
    await db.prepare(
      `INSERT INTO counselors (id, name, hospital, email, code, available, busy_until, active, created,
                               tel, addr, intro, tags, price, license, bank, bank_no, bank_holder, updated)
       VALUES (?,?,?,?,?,0,0,1,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(cid, a.name, a.hospital, a.email || null, newCode, nowMs(),
      a.tel, a.addr, a.intro, a.tags, a.price, a.license,
      a.bank, a.bank_no, a.bank_holder, nowMs()).run();
    await db.prepare("UPDATE applications SET status='approved', counselor_id=?, decided_at=? WHERE id=?")
      .bind(cid, nowMs(), id).run();
    // 코드를 한 번 메일로 보낸다. 이후로는 상담사가 그 코드로 계속 들어온다.
    let mailed = null;
    if (a.email) mailed = await sendCodeMail(env, db, a.email, a.name, newCode, env.APP_URL);
    return json({ ok: true, counselorId: cid, name: a.name, code: newCode,
                  email: a.email || '', mailed: mailed ? mailed.sent : null }, 200, cors);
  }

  if (path === '/apply/reject' && method === 'POST') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    await db.prepare("UPDATE applications SET status='rejected', reject_why=?, decided_at=? WHERE id=?")
      .bind(s(body.why, 300) || '요건 미충족', nowMs(), s(body.id, MAX.id)).run();
    return json({ ok: true }, 200, cors);
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
      let mailed = null;
      if (email) mailed = await sendCodeMail(env, db, email, name, newCode, env.APP_URL);
      return json({ ok: true, id, name, email, code: newCode, mailed: mailed ? mailed.sent : null }, 200, cors);
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
      await db.prepare('UPDATE counselors SET code = ? WHERE id = ?').bind(newCode, id).run();
      const who = await db.prepare('SELECT name, email FROM counselors WHERE id = ?').bind(id).first();
      let mailed = null;
      if (who && who.email) mailed = await sendCodeMail(env, db, who.email, who.name, newCode, env.APP_URL);
      return json({ ok: true, id, code: newCode, mailed: mailed ? mailed.sent : null }, 200, cors);
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
      // 상담사 행만 지우고 끝냈더니 로그인 세션·매직링크 토큰·푸시 구독이
      //  그대로 남았다. 실제로 지워진 계정의 세션 1건과 푸시 구독 1건이
      //  DB 에 떠돌고 있었다. 딸린 것을 전부 같이 걷어낸다.
      for (const t of ['chat_msgs', 'inbox', 'bookings', 'call_queue', 'reviews',
                       'homework', 'calls', 'sessions', 'login_tokens', 'push_subs']) {
        await db.prepare(`DELETE FROM ${t} WHERE counselor_id = ?`).bind(id).run();
      }
      // 이 상담사로 승인됐던 신청서는 '삭제됨'으로 표시만 한다.
      //  지워버리면 신청자 화면에서 신청 기록이 통째로 사라진다.
      await db.prepare("UPDATE applications SET status = 'delisted' WHERE counselor_id = ?").bind(id).run();
      await db.prepare('DELETE FROM counselors WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, cors);
    }
  }

  // 메일 발송 기록 (운영자만).
  //  매직링크가 조용히 실패하면 상담사는 로그인을 못 하는데 아무도 모른다.
  //  대부분 도메인 미인증(403)이나 키 오류(401)이고, 사유를 봐야 고칠 수 있다.
  if (path === '/maillog' && method === 'GET') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const r = await db.prepare(
      'SELECT addr, ok, reason, detail, ts FROM mail_log ORDER BY ts DESC LIMIT 30').all();
    const items = (r.results || []).map(x => ({
      addr: x.addr, ok: !!x.ok, reason: x.reason || '', detail: x.detail || '', ts: x.ts
    }));
    return json({ items, fails: items.filter(x => !x.ok).length }, 200, cors);
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

// ── 보조 ───────────────────────────────────────────────────────────────
function safeJson(v, fb) { try { return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }

// 계좌번호는 뒤 4자리만 남긴다. 본인 화면에도 전체를 다시 뿌리지 않는다 —
//  어깨너머·스크린샷으로 새는 게 실제로 가장 흔한 경로다.
function maskAcct(n) {
  const d = String(n || '').replace(/[^0-9]/g, '');
  if (d.length < 4) return '****';
  return '*'.repeat(Math.max(3, d.length - 4)) + d.slice(-4);
}

// 정산 배분. js/payout.js 의 SPLIT 과 같은 값이어야 한다.
//  반올림 오차는 플랫폼이 흡수한다 — 상담사·기관 몫이 1원이라도 줄면 안 된다.
const SPLIT = { counselor: 70, hospital: 10, pg: 3, platform: 17 };
function payoutOf(price) {
  const p = Math.max(0, Math.round(price || 0));
  const counselor = Math.round(p * SPLIT.counselor / 100);
  const hospital  = Math.round(p * SPLIT.hospital / 100);
  const pg        = Math.round(p * SPLIT.pg / 100);
  return { gross: p, counselor, hospital, pg, platform: p - counselor - hospital - pg, split: SPLIT };
}

// 신청서. 계좌는 운영자에게도 마스킹해서만 보낸다 —
//  심사에 필요한 건 '계좌가 있다'는 사실이지 번호 자체가 아니다.
//  실제 번호는 승인 시 서버 안에서 상담사 계정으로 바로 옮겨진다.
const rowApp = (a, admin) => ({
  id: a.id, name: a.name, license: a.license || '', career: a.career || '',
  price: a.price || 0, intro: a.intro || '', hospital: a.hospital || '',
  addr: a.addr || '', tel: a.tel || '', email: a.email || '',
  tags: safeJson(a.tags, []), photo: a.photo || null,
  status: a.status, rejectWhy: a.reject_why || '',
  counselorId: a.counselor_id || '', ts: a.ts, decidedAt: a.decided_at || 0,
  bank: a.bank_no ? { bank: a.bank || '', holder: a.bank_holder || '', masked: maskAcct(a.bank_no) } : null,
  ...(admin ? { clientId: a.client_id } : {})
});

const rowHw = h => ({
  id: h.id, counselorId: h.counselor_id, counselor: h.counselor,
  clientId: h.client_id, bookingId: h.booking_id,
  text: h.text, why: h.why || '', dueAt: h.due_at,
  assignedAt: h.assigned_at, doneAt: h.done_at, note: h.note || ''
});

function rowProfile(c) {
  if (!c) return null;
  return {
    id: c.id, name: c.name, hospital: c.hospital || '', email: c.email || '',
    tel: c.tel || '', addr: c.addr || '', intro: c.intro || '',
    license: c.license || '', tags: safeJson(c.tags, []),
    price: c.price || 0, callRate: c.call_rate || 0,
    slots: safeJson(c.slots, {}), offdays: safeJson(c.offdays, []),
    available: !!c.available, updated: c.updated || 0,
    payout: c.bank_no
      ? { bank: c.bank || '', holder: c.bank_holder || '', masked: maskAcct(c.bank_no), set: true }
      : { set: false }
  };
}

// ── 행 → 앱이 기대하는 모양 ────────────────────────────────────────────
const rowBooking = r => ({
  id: r.id, counselorId: r.counselor_id, name: r.counselor_name,
  clientId: r.client_id, clientName: r.client_name,
  whenTs: r.when_ts, time: r.time_label, price: r.price, status: r.status,
  // 상담 이후 흐름 — 화면이 '지금 누가 무엇을 할 차례인지' 판단하는 근거
  doneAt: r.done_at || 0, confirmAt: r.confirm_at || 0, autoAt: r.auto_at || 0,
  settledAt: r.settled_at || 0,
  refund: r.refund || 0, refundAt: r.refund_at || 0, refundWhy: r.refund_why || '',
  dispute: r.dispute || '', disputeAt: r.dispute_at || 0,
  payout: payoutOf(r.price || 0)
  // cnote(상담사 메모)는 일부러 뺀다 — 내담자에게 나가면 안 된다
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
