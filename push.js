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
//
//  ── 2025.08 추가: 스토어 앱은 FCM 으로 간다 ─────────────────────────
//   Capacitor 앱은 server.url 로 원격 페이지를 띄우는 웹뷰다.
//   그 웹뷰에는 서비스워커가 등록되지 않는다(실기기 로그로 확인) —
//   서비스워커가 없으면 웹푸시는 받을 곳이 없다. 그래서 앱만 FCM 으로 옮긴다.
//   같은 push_subs 테이블에 kind 칸(web|fcm)을 하나 두고,
//   fcm 이면 endpoint 자리에 기기 토큰이 들어간다.
//   보내는 쪽(notifyCounselor/notifyClient)은 둘을 모두 찾아 각각의 길로 보낸다.
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

// ── FCM (스토어 앱) ──────────────────────────────────────────────────
//  구글은 서버 키(레거시)를 없앴다. 지금은 서비스계정으로 OAuth2 액세스 토큰을
//  받아 HTTP v1 API 를 부른다. 토큰을 받으려면 RS256 으로 서명한 JWT 가 필요한데,
//  Workers 의 crypto.subtle 이 RSASSA-PKCS1-v1_5 를 지원하므로 그대로 만든다.
//  (위 VAPID 의 ES256 서명과 원리는 같다 — 곡선 대신 RSA 일 뿐이다)
//
//  시크릿이 하나라도 없으면 이 구역 전체가 조용히 잠든다.
//  FCM 이 없다고 웹푸시까지 죽으면 안 된다.
function fcmReady(env) {
  return !!(env && env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

// PEM(-----BEGIN PRIVATE KEY----- ... ) → pkcs8 바이트.
//  wrangler secret 에 넣을 때 줄바꿈이 '\n' 두 글자로 들어오는 일이 흔해서 되돌린다.
function pemToBuf(pem) {
  const body = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let FCM_KEY = null;                       // 임포트한 개인키 (인스턴스 수명 동안 재사용)
let FCM_TOKEN = { value: '', exp: 0 };    // 액세스 토큰 캐시 (구글은 1시간짜리를 준다)

async function fcmKey(env) {
  if (FCM_KEY) return FCM_KEY;
  try {
    FCM_KEY = await crypto.subtle.importKey(
      'pkcs8', pemToBuf(env.FCM_PRIVATE_KEY).buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
  } catch (e) { FCM_KEY = null; }
  return FCM_KEY;
}

// 액세스 토큰 — 50분만 쓰고 새로 받는다 (유효기간 60분, 10분은 여유)
async function fcmAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (FCM_TOKEN.value && FCM_TOKEN.exp > now) return FCM_TOKEN.value;
  const key = await fcmKey(env);
  if (!key) return '';
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64u(enc.encode(JSON.stringify({
    iss: env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })));
  const unsigned = head + '.' + claim;
  let jwt;
  try {
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
    jwt = unsigned + '.' + b64u(sig);
  } catch (e) { return ''; }
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(jwt)
    });
    if (!res.ok) return '';
    const d = await res.json();
    if (!d || !d.access_token) return '';
    FCM_TOKEN = { value: d.access_token, exp: now + 50 * 60 };
    return FCM_TOKEN.value;
  } catch (e) { return ''; }
}

// 앱 한 대에 보내기. 본문은 웹푸시와 같은 원칙 — 최소한만.
//  data.act 에 목적지를 실어 알림을 눌렀을 때 갈 곳을 알려준다.
async function fcmOne(env, db, row, retried) {
  const access = await fcmAccessToken(env);
  if (!access) return 'no-key';
  const isClient = String(row.counselor_id || '').startsWith('cl:');
  const body = {
    message: {
      token: row.endpoint,
      notification: {
        title: isClient ? '우렁의사' : '우렁의사 프로',
        body: '새 소식이 도착했어요'
      },
      android: {
        priority: 'HIGH',
        ttl: TTL + 's',
        notification: {
          sound: 'default',
          tag: 'woorung-wake',
          default_vibrate_timings: true
        }
      },
      data: { act: isClient ? 'counselors' : 'call' }
    }
  };
  let res;
  try {
    res = await fetch(
      'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(env.FCM_PROJECT_ID) + '/messages:send',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + access, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
  } catch (e) { return 'net'; }
  // 404 = 이 토큰은 더 이상 없다(앱 삭제·재설치), 403 = 다른 프로젝트의 토큰이다.
  //  둘 다 붙들고 있어봐야 영원히 실패한다 — 바로 지운다.
  //  400 은 지우지 않는다. 우리 쪽 본문이 잘못됐을 때도 400 이라서,
  //  한 번의 실수로 구독 전체를 날려버릴 수 있다. 실패 횟수만 센다.
  if (res.status === 404 || res.status === 403) {
    await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(row.endpoint).run().catch(() => {});
    return 'gone-' + res.status;
  }
  // 액세스 토큰이 먼저 만료됐다 — 버리고 딱 한 번만 다시 시도한다.
  //  전화는 유통기한이 60초다. '다음 번에 잘 되겠지'로 넘기면 그 전화는 끝난 뒤다.
  if (res.status === 401) {
    FCM_TOKEN = { value: '', exp: 0 };
    if (retried) return 'auth';
    return fcmOne(env, db, row, true);
  }
  if (res.status >= 200 && res.status < 300) {
    if (row.fail_count) await db.prepare('UPDATE push_subs SET fail_count = 0 WHERE endpoint = ?').bind(row.endpoint).run().catch(() => {});
    return 'ok';
  }
  const n = (row.fail_count || 0) + 1;
  if (n >= MAX_FAIL) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(row.endpoint).run().catch(() => {});
  else await db.prepare('UPDATE push_subs SET fail_count = ? WHERE endpoint = ?').bind(n, row.endpoint).run().catch(() => {});
  return 'http-' + res.status;
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

// kind 칸이 아직 없는 DB 에서도 죽지 않는다.
//  스키마 적용(ALTER TABLE)은 사람이 하는 일이고, 배포는 그보다 먼저 나갈 수 있다.
//  한 번 없다고 확인하면 그 인스턴스에서는 다시 물어보지 않는다.
let HAS_KIND = null;
async function subsOf(db, key) {
  if (HAS_KIND !== false) {
    try {
      const r = await db.prepare(
        'SELECT endpoint, fail_count, kind, counselor_id FROM push_subs WHERE counselor_id = ? LIMIT 12'
      ).bind(key).all();
      HAS_KIND = true;
      return (r && r.results) || [];
    } catch (e) { HAS_KIND = false; }
  }
  const r = await db.prepare(
    'SELECT endpoint, fail_count, counselor_id FROM push_subs WHERE counselor_id = ? LIMIT 12'
  ).bind(key).all();
  return (r && r.results) || [];
}

// 상담사 한 명의 모든 기기를 깨운다 (폰·태블릿·PC 를 같이 쓸 수 있다)
//  웹 구독은 VAPID 로, 앱 구독은 FCM 으로 — 한 사람이 둘 다 가질 수 있다.
export async function notifyCounselor(env, counselorId) {
  const db = env.DB;
  if (!db || !counselorId) return { sent: 0 };
  const canWeb = !!env.VAPID_PRIVATE;
  const canFcm = fcmReady(env);
  if (!canWeb && !canFcm) return { sent: 0 };
  let rows = [];
  try {
    rows = await subsOf(db, String(counselorId));
  } catch (e) { return { sent: 0 }; }
  const out = await Promise.all(rows.map(r => {
    const fcm = r.kind === 'fcm';
    if (fcm && !canFcm) return Promise.resolve('skip-fcm');
    if (!fcm && !canWeb) return Promise.resolve('skip-web');
    return (fcm ? fcmOne(env, db, r) : pushOne(env, db, r)).catch(() => 'err');
  }));
  return { sent: out.filter(x => x === 'ok').length, total: rows.length, results: out };
}

// 내담자 한 명의 기기들을 깨운다 — 상담사 답장·숙제가 앱이 꺼져 있어도 닿게.
//  별도 테이블을 만들지 않고 push_subs 의 counselor_id 칸에 'cl:'+clientId 로
//  구분해 담는다 (스키마 변경 없이, 같은 정리·실패 처리 로직을 그대로 탄다).
export async function notifyClient(env, clientId) {
  if (!clientId) return { sent: 0 };
  return notifyCounselor(env, 'cl:' + String(clientId).slice(0, 64));
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

  // 내담자 구독 — 내담자에겐 코드가 없다. 기기 고유 clientId 가 곧 본인이다
  //  (메시지 조회 GET 과 같은 신뢰 모델. 남의 clientId 를 알아내면 그 사람의
  //   '깨우기 신호'만 받을 뿐, 내용은 어차피 푸시에 실리지 않는다).
  if (path === '/push/client-subscribe' && method === 'POST') {
    const clientId = String(body.clientId || '').slice(0, 64).replace(/[^\w-]/g, '');
    const sub = body.sub || {};
    const endpoint = String(sub.endpoint || '').slice(0, 900);
    if (!clientId || !/^https:\/\//.test(endpoint)) return json({ error: 'missing' }, 400, cors);
    const keys = sub.keys || {};
    await db.prepare(
      `INSERT INTO push_subs (endpoint, counselor_id, p256dh, auth, created_at, fail_count)
       VALUES (?,?,?,?,?,0)
       ON CONFLICT(endpoint) DO UPDATE SET counselor_id = excluded.counselor_id, fail_count = 0`
    ).bind(endpoint, 'cl:' + clientId, String(keys.p256dh || '').slice(0, 200),
           String(keys.auth || '').slice(0, 100), Date.now()).run();
    return json({ ok: true }, 200, cors);
  }

  // 스토어 앱(FCM) 구독 — endpoint 자리에 기기 토큰이 들어간다.
  //  상담사는 코드·세션으로 본인 확인을 한다(웹과 같은 이유 — 남의 신호를 가로챌 수 있다).
  //  내담자는 기기 고유 clientId 가 곧 본인이다(웹 구독과 같은 신뢰 모델).
  if (path === '/push/fcm-subscribe' && method === 'POST') {
    const token = String(body.token || '').slice(0, 900);
    if (!token || token.length < 20) return json({ error: 'missing' }, 400, cors);
    let key = '';
    const clientId = String(body.clientId || '').slice(0, 64).replace(/[^\w-]/g, '');
    if (clientId) {
      key = 'cl:' + clientId;
    } else {
      const me = await resolveCounselor(db, {
        session: String(body.session || '').slice(0, 128),
        code: String(body.code || '').slice(0, 64)
      });
      if (!me) return json({ error: 'bad-code' }, 403, cors);
      key = me.id;
    }
    try {
      await db.prepare(
        `INSERT INTO push_subs (endpoint, counselor_id, p256dh, auth, created_at, fail_count, kind)
         VALUES (?,?,'','',?,0,'fcm')
         ON CONFLICT(endpoint) DO UPDATE SET counselor_id = excluded.counselor_id, kind = 'fcm', fail_count = 0`
      ).bind(token, key, Date.now()).run();
    } catch (e) {
      // kind 칸이 아직 없는 DB — 스키마를 올리기 전이다. 앱을 죽이지는 않는다.
      return json({ ok: false, error: 'schema' }, 200, cors);
    }
    return json({ ok: true }, 200, cors);
  }

  if (path === '/push/unsubscribe' && method === 'POST') {
    const endpoint = String((body.sub && body.sub.endpoint) || body.endpoint || body.token || '').slice(0, 900);
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
    return json({ ok: true, ...r, configured: !!env.VAPID_PRIVATE, fcm: fcmReady(env) }, 200, cors);
  }

  return null;
}
