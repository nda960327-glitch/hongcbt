// ============================================================================
//  웹 푸시 — 상담사가 화면을 꺼두어도 전화를 놓치지 않게
//
//  폴링(3초마다 물어보기)은 탭이 뒤로 가는 순간 브라우저가 재워버린다.
//  상담사가 주머니에 폰을 넣고 있으면 전화가 와도 아무 일도 일어나지 않는다.
//  그래서 서버가 먼저 두드려야 한다.
//
//  본문은 싣지 않는다.
//   Web Push 에서 본문을 보내려면 ECDH 로 키를 맞추고 HKDF 로 늘려서
//   AES-GCM 으로 암호화해야 한다(aes128gcm). 코드가 150줄쯤 늘어난다.
//   우리는 '깨우기'만 하면 된다 — 서비스워커가 깨어나서 서버에 다시 묻는다.
//   어차피 알림을 띄울 시점의 최신 상태가 필요하므로, 이쪽이 더 정확하다.
//
//  인증은 VAPID(RFC 8292). ES256 으로 서명한 JWT 한 장이면 된다.
//   개인키는 시크릿(VAPID_PRIVATE)으로만 들어온다. 코드에 없다.
// ============================================================================

import { resolveCounselor } from './auth.js';

const TTL = 60;                    // 60초 안에 못 꽂으면 버려라 — 전화는 유통기한이 짧다
const MAX_FAIL = 3;                // 세 번 연속 실패하면 죽은 구독으로 본다

const enc = new TextEncoder();

function b64u(buf) {
  const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToBuf(s) {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// ── VAPID 서명 ───────────────────────────────────────────────────────
//  키 임포트는 요청마다 하지 않는다. 한 인스턴스가 여러 요청을 처리하므로
//  한 번 만들어 두면 이후 푸시는 서명만 한다.
let KEY = null;
async function signKey(env) {
  if (KEY) return KEY;
  if (!env.VAPID_PRIVATE) return null;
  try {
    KEY = await crypto.subtle.importKey(
      'pkcs8', b64uToBuf(env.VAPID_PRIVATE).buffer,
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
  } catch (e) { KEY = null; }
  return KEY;
}

async function vapidAuth(env, endpoint) {
  const key = await signKey(env);
  if (!key || !env.VAPID_PUBLIC) return '';
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claim = b64u(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:help@neurumind.com'
  })));
  const unsigned = head + '.' + claim;
  // Web Crypto 의 ECDSA 서명은 r||s 원시 64바이트 — JWS ES256 이 요구하는 그대로다.
  //  (OpenSSL 계열의 DER 서명이었다면 변환이 필요했다)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));
  return 'vapid t=' + unsigned + '.' + b64u(sig) + ', k=' + env.VAPID_PUBLIC;
}

// ── 한 사람에게 보내기 ───────────────────────────────────────────────
async function pushOne(env, db, row) {
  const auth = await vapidAuth(env, row.endpoint);
  if (!auth) return 'no-key';
  let res;
  try {
    res = await fetch(row.endpoint, {
      method: 'POST',
      headers: { 'Authorization': auth, 'TTL': String(TTL), 'Urgency': 'high', 'Content-Length': '0' }
    });
  } catch (e) {
    return 'net';
  }
  // 404/410 은 '이 구독은 더 이상 없다'는 뜻 — 바로 지운다.
  if (res.status === 404 || res.status === 410) {
    await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(row.endpoint).run();
    return 'gone';
  }
  if (res.status >= 200 && res.status < 300) {
    if (row.fail_count) await db.prepare('UPDATE push_subs SET fail_count = 0 WHERE endpoint = ?').bind(row.endpoint).run();
    return 'ok';
  }
  const n = (row.fail_count || 0) + 1;
  if (n >= MAX_FAIL) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(row.endpoint).run();
  else await db.prepare('UPDATE push_subs SET fail_count = ? WHERE endpoint = ?').bind(n, row.endpoint).run();
  return 'http-' + res.status;
}

// 상담사 한 명의 모든 기기를 깨운다 (폰·태블릿·PC 를 같이 쓸 수 있다)
export async function notifyCounselor(env, counselorId) {
  const db = env.DB;
  if (!db || !counselorId || !env.VAPID_PRIVATE) return { sent: 0 };
  let rows = [];
  try {
    const r = await db.prepare(
      'SELECT endpoint, fail_count FROM push_subs WHERE counselor_id = ? LIMIT 8'
    ).bind(String(counselorId)).all();
    rows = (r && r.results) || [];
  } catch (e) { return { sent: 0 }; }
  const out = await Promise.all(rows.map(r => pushOne(env, db, r).catch(() => 'err')));
  return { sent: out.filter(x => x === 'ok').length, total: rows.length, results: out };
}

// ── 엔드포인트 ───────────────────────────────────────────────────────
export async function handlePush(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const method = request.method;

  if (path === '/push/subscribe' && method === 'POST') {
    // 아이디만 받으면 남의 이름으로 구독해서 그 상담사에게 오는
    //  '전화 왔다' 신호를 대신 받아볼 수 있다. 본인 확인부터 한다.
    const me = await resolveCounselor(db, {
      session: String(body.session || '').slice(0, 128),
      code: String(body.code || '').slice(0, 64)
    });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const counselorId = me.id;
    const sub = body.sub || {};
    const endpoint = String(sub.endpoint || '').slice(0, 900);
    if (!/^https:\/\//.test(endpoint)) return json({ error: 'missing' }, 400, cors);
    const keys = sub.keys || {};
    await db.prepare(
      `INSERT INTO push_subs (endpoint, counselor_id, p256dh, auth, created_at, fail_count)
       VALUES (?,?,?,?,?,0)
       ON CONFLICT(endpoint) DO UPDATE SET counselor_id = excluded.counselor_id, fail_count = 0`
    ).bind(endpoint, counselorId, String(keys.p256dh || '').slice(0, 200),
           String(keys.auth || '').slice(0, 100), Date.now()).run();
    return json({ ok: true }, 200, cors);
  }

  if (path === '/push/unsubscribe' && method === 'POST') {
    const endpoint = String((body.sub && body.sub.endpoint) || body.endpoint || '').slice(0, 900);
    if (endpoint) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
    return json({ ok: true }, 200, cors);
  }

  // 상담사가 '알림이 오나?' 를 직접 확인해볼 수 있어야 한다.
  //  안 오는 걸 통화 중에 알게 되면 늦다.
  if (path === '/push/test' && method === 'POST') {
    // 인증이 없으면 아이디만 알아내 알림을 무한정 쏠 수 있다.
    const me = await resolveCounselor(db, {
      session: String(body.session || '').slice(0, 128),
      code: String(body.code || '').slice(0, 64)
    });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    const r = await notifyCounselor(env, me.id);
    return json({ ok: true, ...r, configured: !!env.VAPID_PRIVATE }, 200, cors);
  }

  return null;
}
