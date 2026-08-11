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

// ── 연락처 정규화 ──────────────────────────────────────────────────────
//  이 번호는 정산·운영 연락용이고 내담자 응답에는 절대 넣지 않는다.
//  그래서 검증은 '형식이 그럴듯한가'까지만 한다 — 대표번호·내선·해외번호를
//  전부 맞히려 들면 정작 진짜 번호가 거부당한다.
const telClean = v => String(v == null ? '' : v).replace(/[^0-9-]/g, '').slice(0, 20);

// ── 프로필 사진 ────────────────────────────────────────────────────────
//  앱이 긴 변 512px·JPEG 0.8 로 줄여서 보낸다(보통 40~60KB).
//  서버가 다시 한 번 막는 이유: 앱은 고쳐 쓸 수 있고, fetch 한 줄이면
//  10MB 짜리 원본을 그대로 밀어 넣을 수 있다. 그러면 /counselors 응답이
//  통째로 무거워져 매칭 탭이 안 뜬다 — 한 사람이 전체를 망가뜨리는 구조다.
const PHOTO_MAX = 70 * 1024;              // base64 는 ASCII 라 length = 바이트
function checkPhoto(v) {
  const p = String(v == null ? '' : v);
  if (!p) return { ok: true, photo: '' };                       // 빈 값 = 사진 삭제
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p)) return { ok: false, code: 'bad-photo' };
  if (p.length > PHOTO_MAX) return { ok: false, code: 'too-big' };
  return { ok: true, photo: p };
}

// ── 주소 → 좌표 ────────────────────────────────────────────────────────
//  내담자 카드의 '내 위치에서 ○km' 는 좌표가 있어야 그릴 수 있는데,
//  상담사가 넣는 건 글자로 된 주소다. 그 사이를 여기서 메운다.
//
//  저장과 묶지 않는다 — Nominatim 은 남의 무료 서비스라 느리거나 안 뜬다.
//  그때 상담사의 [내 정보 저장]이 같이 실패하면, 주소와 상관없는 상담료 변경까지
//  못 하게 된다. 그래서 응답을 먼저 보내고 ctx.waitUntil 로 뒤에서 돈다.
//  실패하면 조용히 넘어간다 — 좌표가 없으면 화면은 주소 글자를 대신 보여준다.
async function geocodeInto(db, id, addr) {
  const q = String(addr || '').trim();
  if (!q) return;
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q),
      { headers: { 'User-Agent': 'neurumind/1.0 (help@neurumind.com)', 'Accept-Language': 'ko' } }
    );
    if (!r.ok) return;
    const j = await r.json();
    const hit = Array.isArray(j) ? j[0] : null;
    if (!hit) return;
    const lat = Number(hit.lat), lng = Number(hit.lon);
    // (0,0)은 대서양 한가운데다. 좌표를 못 찾은 것으로 본다.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (!lat && !lng)) return;
    await db.prepare('UPDATE counselors SET lat = ?, lng = ?, geo_at = ? WHERE id = ?')
      .bind(lat, lng, Date.now(), id).run();
  } catch (e) { /* 좌표는 있으면 좋은 것이지, 없으면 안 되는 것이 아니다 */ }
}
// ctx 가 없는 경로(테스트 하네스 등)에서도 터지지 않게 감싼다
function fireGeocode(ctx, db, id, addr) {
  const p = geocodeInto(db, id, addr);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
}

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

  // 구독 집계 핑 — 구독은 기기 안(localStorage)에만 있어서 서버는 몇 명이
  //  구독 중인지 몰랐다. 앱이 하루 한 번 자기 상태만 알려준다 (결제 검증 아님,
  //  운영자 대시보드 숫자용. 개인정보는 기기 id 뿐).
  if (path === '/subs-ping' && method === 'POST') {
    const cid = s(body.clientId, MAX.id).replace(/[^\w-]/g, '');
    const plan = body.plan === 'sub' ? 'sub' : 'trial';
    const until = Math.max(0, Math.min(nowMs() + 400 * 86400000, num(body.until)));
    if (!cid || !until) return json({ error: 'missing' }, 400, cors);
    try {
      await db.prepare(
        `INSERT INTO subs (client_id, plan, until, updated) VALUES (?,?,?,?)
         ON CONFLICT(client_id) DO UPDATE SET plan = excluded.plan, until = excluded.until, updated = excluded.updated`
      ).bind(cid, plan, until, nowMs()).run();
    } catch (e) {}
    return json({ ok: true }, 200, cors);
  }

  // ── 우렁 캐시 충전 (토스페이먼츠) ───────────────────────────────────
  //  왜 서버가 끼어드나: 결제는 '클라이언트가 성공했다고 말하는 것'으로 끝나면
  //  안 된다. 브라우저 콘솔에서 fetch 한 줄만 흉내 내면 캐시가 무한히 생긴다.
  //  그래서 두 단계로 나눈다.
  //    ① ready   — 결제할 금액을 서버가 먼저 적어 둔다
  //    ② confirm — 토스 승인 API 를 '서버가' 부르고, 성공했을 때만 캐시를 준다
  //  ①의 금액과 ②로 들어온 금액이 다르면 승인하지 않는다. 이게 없으면
  //  5,000원짜리 결제창을 띄우고 300,000원으로 승인 요청을 보낼 수 있다.
  if (path.startsWith('/pay/')) {
    // 지급 캐시(보너스 포함)도 서버가 정한다 — 클라이언트가 보내온 cash 를
    //  믿을 이유가 없다. 아래 표는 js/wallet.js 의 PACKAGES 와 같은 값이어야
    //  한다. 어긋나면 결제는 되는데 캐시가 다르게 들어간다. 바꿀 땐 같이 고칠 것.
    const PACKAGES = [
      { pay: 5000,   bonus: 0 },
      { pay: 10000,  bonus: 200 },
      { pay: 30000,  bonus: 900 },
      { pay: 50000,  bonus: 2000 },
      { pay: 100000, bonus: 6000 },
      { pay: 300000, bonus: 24000 }
    ];
    // 라이브 전환은 `wrangler secret put TOSS_SECRET_KEY` 하나로 끝난다.
    //  아래 값은 토스 공식 문서에 공개된 '테스트 시크릿 키'다. 실제 돈이
    //  움직이지 않으므로 코드에 있어도 사고가 나지 않는다 — 라이브 키는
    //  절대 여기 적지 말 것.
    const TOSS_TEST_SECRET = 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';
    const comma = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const cid = s(body.clientId || q('clientId'), MAX.id).replace(/[^\w-]/g, '');

    // ① 주문 예약 — 금액을 못 박아 둔다
    if (path === '/pay/ready' && method === 'POST') {
      if (!cid) return json({ error: 'missing-client' }, 400, cors);
      const amount = Math.round(num(body.amount));
      const pkg = PACKAGES.find(p => p.pay === amount);
      if (!pkg) return json({ error: 'bad-amount' }, 400, cors);
      // 토스 orderId 규격은 6~64자 [A-Za-z0-9_-] 다. rid() 는 짧아서 그대로 못 쓴다.
      const orderId = 'cash_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 10);
      const cash = pkg.pay + pkg.bonus;
      try {
        await db.prepare(
          `INSERT INTO orders (id, client_id, amount, cash, status, payment_key, method, fail, created, paid_at)
           VALUES (?,?,?,?,'pending','','','',?,0)`
        ).bind(orderId, cid, amount, cash, nowMs()).run();
      } catch (e) {
        return json({ error: 'db' }, 500, cors);
      }
      return json({
        ok: true, orderId, amount, cash,
        orderName: '우렁 캐시 ' + comma(cash)
      }, 200, cors);
    }

    // ② 승인 — 여기서만 캐시가 생긴다
    if (path === '/pay/confirm' && method === 'POST') {
      const orderId = s(body.orderId, 64).replace(/[^\w-]/g, '');
      const paymentKey = s(body.paymentKey, 200).replace(/[^\w-]/g, '');
      const amount = Math.round(num(body.amount));
      if (!orderId || !paymentKey) return json({ error: 'missing' }, 400, cors);

      let row = null;
      try { row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first(); }
      catch (e) { return json({ error: 'no-table' }, 500, cors); }
      if (!row) return json({ error: 'no-order' }, 404, cors);

      // 멱등 — 성공 화면을 새로고침하거나 토스가 재시도해도 캐시는 한 번만.
      //  (실제로 사용자는 결제 직후 화면을 자주 새로고침한다)
      if (row.status === 'paid') {
        return json({ ok: true, cash: row.cash, amount: row.amount, already: true }, 200, cors);
      }
      if (row.amount !== amount) return json({ error: 'amount-mismatch' }, 400, cors);

      const secret = env.TOSS_SECRET_KEY || TOSS_TEST_SECRET;
      let res = null, data = {};
      try {
        res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(secret + ':'),
            'Content-Type': 'application/json',
            // 네트워크가 끊겨 우리가 재시도해도 토스 쪽에서 두 번 결제되지 않게
            'Idempotency-Key': orderId
          },
          body: JSON.stringify({ paymentKey, orderId, amount })
        });
        data = await res.json().catch(() => ({}));
      } catch (e) {
        // 승인 요청 자체가 못 갔다. 주문은 pending 으로 남겨 둔다 —
        //  실제로 결제됐는데 우리만 모르는 상황일 수 있어 failed 로 못 박으면 안 된다.
        return json({ error: 'toss-unreachable' }, 502, cors);
      }

      // DONE 이 아니면 캐시를 주지 않는다. 가상계좌(WAITING_FOR_DEPOSIT)는
      //  입금 전이라 '아직 결제 안 된 것'이다 — 그래서 결제수단을 카드로 제한한다.
      if (!res.ok || data.status !== 'DONE') {
        try {
          await db.prepare("UPDATE orders SET status = 'failed', fail = ? WHERE id = ? AND status = 'pending'")
            .bind(s(data.message || data.code || 'not-approved', 120), orderId).run();
        } catch (e) {}
        return json({
          error: 'not-approved',
          code: s(data.code, 40),
          message: s(data.message || '결제가 승인되지 않았어요', 120)
        }, 400, cors);
      }

      // 지급은 'pending → paid' 로 실제로 바꾼 요청만 한다. 같은 orderId 가
      //  동시에 두 번 들어와도 UPDATE 가 1행을 바꾼 쪽만 캐시를 준다.
      let changed = 0;
      try {
        const r = await db.prepare(
          `UPDATE orders SET status = 'paid', payment_key = ?, method = ?, paid_at = ?
            WHERE id = ? AND status = 'pending'`
        ).bind(paymentKey, s(data.method || '', 30), nowMs(), orderId).run();
        changed = (r && r.meta && r.meta.changes) || 0;
      } catch (e) {}
      return json({
        ok: true, cash: row.cash, amount: row.amount,
        method: s(data.method || '', 30), already: !changed
      }, 200, cors);
    }

    // ③ 내 충전 내역 — 기기(clientId)가 곧 열쇠다 (내담자는 계정이 없다)
    if (path === '/pay/history' && method === 'GET') {
      if (!cid) return json({ items: [] }, 200, cors);
      try {
        const r = await db.prepare(
          `SELECT id, amount, cash, status, method, created, paid_at FROM orders
            WHERE client_id = ? ORDER BY created DESC LIMIT 20`
        ).bind(cid).all();
        return json({ items: r.results || [] }, 200, cors);
      } catch (e) {
        return json({ items: [], error: 'no-table' }, 200, cors);
      }
    }

    return json({ error: 'not-found' }, 404, cors);
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
      `SELECT id, name, hospital, addr, addr_detail, intro, tags, price, call_rate, license,
              photo, lat, lng, available, busy_until
         FROM counselors WHERE active = 1 ORDER BY created DESC`
    ).all();
    return json({
      items: (r.results || []).map(c => ({
        id: c.id, name: c.name, hospital: c.hospital || '',
        // 도로명 + 상세(층·호)를 여기서 합친다. 나눠 두는 건 지오코딩 때문이지
        //  사람에게 보여줄 때까지 나눠 놓을 이유는 없다.
        addr: [c.addr || '', c.addr_detail || ''].filter(Boolean).join(' '),
        intro: c.intro || '', tags: safeJson(c.tags, []),
        price: c.price || 0, callRate: c.call_rate || 0, license: c.license || '',
        photo: c.photo || '',
        // 0 은 '좌표를 모른다'. 앱은 0 이면 거리를 그리지 않고 주소 글자를 보여준다.
        lat: c.lat || 0, lng: c.lng || 0,
        available: !!c.available, busyUntil: c.busy_until || 0
        // tel 은 여기 절대 넣지 않는다. 내담자가 앱 밖에서 전화하면
        //  기록도 정산도 안전장치도 전부 사라진다.
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
        ORDER BY b.done_at ASC LIMIT 300`
    ).all();
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
    // 바로상담 통화도 정산 대상이다. 전에는 예약(bookings)만 집계해서,
    //  내담자 지갑에서는 캐시가 빠져나갔는데 상담사 몫은 어디에도 잡히지 않았다.
    //  통화는 '완료 확인' 절차가 없다 — 연결돼서 요금이 붙은 순간 이미 제공된 상담이다.
    const rc = await db.prepare(
      `SELECT c.id, c.counselor_id, c.client_id, c.billed, c.connect_at, c.end_at,
              k.name cname, k.bank, k.bank_no, k.bank_holder
         FROM calls c LEFT JOIN counselors k ON k.id = c.counselor_id
        WHERE c.billed > 0 AND c.end_at > 0 AND COALESCE(c.settled_at, 0) = 0
        ORDER BY c.end_at ASC LIMIT 300`
    ).all();
    const callItems = (rc.results || []).map(x => {
      const secs = Math.max(0, Math.round(((x.end_at || 0) - (x.connect_at || 0)) / 1000));
      const p = payoutOf(x.billed || 0);   // 캐시 1 = 1원으로 본다
      return {
        id: x.id, kind: 'call', counselorId: x.counselor_id, counselor: x.cname || '상담사',
        clientName: String(x.client_id || '').slice(0, 8),
        time: '바로상담 통화 ' + (secs >= 60 ? Math.floor(secs / 60) + '분 ' : '') + (secs % 60) + '초',
        price: x.billed, doneAt: x.end_at, confirmed: true, auto: false,
        payout: p,
        bank: x.bank_no ? { bank: x.bank, holder: x.bank_holder, masked: maskAcct(x.bank_no) } : null
      };
    });
    const all = items.map(x => ({ ...x, kind: 'booking' })).concat(callItems);
    const sum = all.reduce((a, x) => a + x.payout.counselor, 0);
    return json({ items: all, counselorTotal: sum }, 200, cors);
  }

  // 지급 완료 처리 (운영자)
  if (path === '/settle/pay' && method === 'POST') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(x => s(x, MAX.id)).filter(Boolean).slice(0, 200);
    if (!ids.length) return json({ error: 'ids 없음' }, 400, cors);
    const t = nowMs();
    // 예약과 통화가 같은 목록에 섞여 온다. id 앞머리로 갈라 각자의 표에 도장을 찍는다.
    const callIds = ids.filter(x => x.startsWith('call_'));
    const bkIds = ids.filter(x => !x.startsWith('call_'));
    const jobs = [];
    bkIds.forEach(id => jobs.push(
      db.prepare("UPDATE bookings SET settled_at = ? WHERE id = ? AND status = 'done' AND settled_at = 0").bind(t, id)));
    callIds.forEach(id => jobs.push(
      db.prepare('UPDATE calls SET settled_at = ? WHERE id = ? AND billed > 0 AND COALESCE(settled_at, 0) = 0').bind(t, id)));
    if (jobs.length) await db.batch(jobs);
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
      (SELECT COALESCE(AVG(rating),0) FROM reviews) AS rvAvg,
      (SELECT COUNT(*) FROM subs WHERE plan = 'sub' AND until > ?) AS subsActive,
      (SELECT COUNT(*) FROM subs WHERE plan = 'trial' AND until > ?) AS trialActive
    `).bind(t, t, t, t, t).first() || {};

    // 답장 대기: 스레드별 마지막 발신자가 내담자인 것
    const aw = await db.prepare(`SELECT COUNT(*) n FROM (
        SELECT counselor_id, client_id, MAX(ts) mts FROM chat_msgs GROUP BY counselor_id, client_id
      ) g JOIN chat_msgs m
        ON m.counselor_id = g.counselor_id AND m.client_id = g.client_id AND m.ts = g.mts
      WHERE m.sender = 'client'`).first() || {};

    const gross = r.gross || 0;
    const SPLIT = { counselor: 70, hospital: 0, pg: 3, platform: 27 };  // js/payout.js 와 같은 값
    return json({
      // 앱의 운영자 콘솔이 기대하는 모양 그대로 (여기가 어긋나면 화면이 빈칸이 된다)
      uniqueClients: Math.max(r.clientsA || 0, r.clientsB || 0),
      subs: { active: r.subsActive || 0, trial: r.trialActive || 0 },
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
        `SELECT id,name,hospital,email,tel,addr,addr_detail,intro,tags,price,call_rate,license,
                photo,lat,lng,geo_at,slots,offdays,bank,bank_no,bank_holder,available,updated
           FROM counselors WHERE id = ?`).bind(me.id).first();
      return json({ ok: true, me: rowProfile(c) }, 200, cors);
    }

    if (method === 'POST') {
      // 이름은 본인이 못 바꾼다 — 자격 확인을 거친 값이라 운영자만 손댄다.
      //
      // 보내온 칸만 고친다. 전에는 UPDATE 문에 모든 칸이 박혀 있어서,
      //  사진 칸을 모르는 옛 버전 앱이 저장을 누르면 사진이 통째로 지워졌다.
      //  '안 보낸 것'과 '비우라는 것'은 다르다.
      const has = k => Object.prototype.hasOwnProperty.call(body, k);
      const sets = [], vals = [];
      const put = (col, v) => { sets.push(col + ' = ?'); vals.push(v); };

      if (has('hospital')) put('hospital', s(body.hospital, 120));
      if (has('intro'))    put('intro', s(body.intro, 600));
      if (has('license'))  put('license', s(body.license, 80));
      if (has('price'))    put('price', Math.max(0, Math.min(1000000, num(body.price))));
      if (has('callRate')) put('call_rate', Math.max(0, Math.min(100000, num(body.callRate))));
      // 옛 앱은 tel, 새 앱은 phone 으로 부를 수 있다 — 둘 다 같은 칸이다
      if (has('tel') || has('phone')) put('tel', telClean(has('tel') ? body.tel : body.phone));

      const addr = has('addr') ? s(body.addr, 200).trim() : null;
      if (addr !== null) put('addr', addr);
      if (has('addrDetail') || has('addr_detail')) {
        put('addr_detail', s(has('addrDetail') ? body.addrDetail : body.addr_detail, 100).trim());
      }

      if (has('photo')) {
        const chk = checkPhoto(body.photo);
        if (!chk.ok) {
          return json({
            error: chk.code === 'too-big'
              ? '사진이 너무 커요. 다시 골라주세요 (70KB 이하)'
              : '사진 형식이 올바르지 않아요 (JPEG 만 됩니다)',
            code: chk.code
          }, 400, cors);
        }
        put('photo', chk.photo);
      }

      if (has('tags')) {
        let tags = '[]';
        try {
          const t = Array.isArray(body.tags) ? body.tags : [];
          tags = JSON.stringify(t.map(x => s(x, 20)).filter(Boolean).slice(0, 6));
        } catch (e) { tags = '[]'; }
        put('tags', tags);
      }

      // 주소가 바뀌었는지 보려면 바꾸기 '전' 값이 필요하다.
      //  geo_at 이 0 이면 아직 한 번도 좌표를 못 구한 사람이라, 주소가 그대로여도
      //  다시 시도한다(예전에 등록돼 좌표가 없는 상담사들이 여기에 해당한다).
      const before = addr === null ? null
        : await db.prepare('SELECT addr, geo_at FROM counselors WHERE id = ?').bind(me.id).first();

      put('updated', nowMs());
      vals.push(me.id);
      await db.prepare(`UPDATE counselors SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

      if (addr && before && (addr !== (before.addr || '') || !before.geo_at)) {
        fireGeocode(ctx, db, me.id, addr);
      }
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
    //  사진도 함께 옮긴다 — 신청할 때 올린 얼굴이 승인되는 순간 사라져서,
    //  매칭 카드에 얼굴 없는 상담사로 등장하던 문제가 있었다.
    //  신청서 사진은 256px 라 70KB 제한 안에 들어오지만, 옛 신청서가 그보다 클 수
    //  있으므로 같은 검사를 통과한 것만 옮긴다(거부 대신 조용히 비운다 —
    //  사진 하나 때문에 승인 자체가 막히면 안 된다).
    const apPhoto = checkPhoto(a.photo);
    await db.prepare(
      `INSERT INTO counselors (id, name, hospital, email, code, available, busy_until, active, created,
                               tel, addr, intro, tags, price, license, photo, bank, bank_no, bank_holder, updated)
       VALUES (?,?,?,?,?,0,0,1,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(cid, a.name, a.hospital, a.email || null, newCode, nowMs(),
      telClean(a.tel), a.addr, a.intro, a.tags, a.price, a.license,
      apPhoto.ok ? apPhoto.photo : '',
      a.bank, a.bank_no, a.bank_holder, nowMs()).run();
    await db.prepare("UPDATE applications SET status='approved', counselor_id=?, decided_at=? WHERE id=?")
      .bind(cid, nowMs(), id).run();
    // 승인되자마자 매칭 카드에 뜨는 사람이다. 좌표를 지금 구해 둬야
    //  첫 화면부터 '내 위치에서 ○km' 가 나온다.
    if (a.addr) fireGeocode(ctx, db, cid, a.addr);
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
      // subs = 이 상담사가 등록한 푸시 구독 기기 수.
      //  0 이면 전화가 와도 폰이 울리지 않는다 — 운영자가 가장 먼저 봐야 할 값인데
      //  지금까지는 DB 를 직접 열어야만 알 수 있었다.
      // 연락처·주소는 운영자에게만 준다 — 정산 문의와 서류 발송에 매번 필요한데
      //  지금까지는 D1 을 직접 열어야 알 수 있었다. 사진은 일부러 빼고 '있다/없다'만
      //  보낸다(70KB × 500명 = 35MB. 목록 하나 때문에 콘솔이 안 뜬다).
      const r = await db.prepare(
        `SELECT c.id, c.name, c.hospital, c.email, c.code, c.available, c.busy_until, c.active, c.created,
                c.tel, c.addr, c.addr_detail, c.lat, c.lng, c.geo_at,
                CASE WHEN LENGTH(COALESCE(c.photo, '')) > 0 THEN 1 ELSE 0 END AS has_photo,
                (SELECT COUNT(*) FROM push_subs p WHERE p.counselor_id = c.id) AS subs
           FROM counselors c ORDER BY c.created DESC LIMIT 500`
      ).all();
      return json({ items: r.results || [] }, 200, cors);
    }

    // 연락처·주소 대리 수정. 상담사가 프로 앱을 아직 못 쓰는 동안
    //  운영자가 전화로 받아 적어 넣을 수 있어야 한다(입점 초기엔 이게 대부분이다).
    //  주소를 고치면 좌표도 다시 구한다 — 안 그러면 카드에서 거리가 옛 자리에 찍힌다.
    if (path === '/admin/counselors/profile' && method === 'POST') {
      const id = s(body.id, MAX.id);
      if (!id) return json({ error: 'id 필요' }, 400, cors);
      const has = k => Object.prototype.hasOwnProperty.call(body, k);
      const sets = [], vals = [];
      const put = (col, v) => { sets.push(col + ' = ?'); vals.push(v); };
      if (has('tel') || has('phone')) put('tel', telClean(has('tel') ? body.tel : body.phone));
      const addr = has('addr') ? s(body.addr, 200).trim() : null;
      if (addr !== null) put('addr', addr);
      if (has('addrDetail') || has('addr_detail')) {
        put('addr_detail', s(has('addrDetail') ? body.addrDetail : body.addr_detail, 100).trim());
      }
      if (has('hospital')) put('hospital', s(body.hospital, 120));
      if (!sets.length) return json({ error: '바꿀 값이 없습니다' }, 400, cors);

      const before = addr === null ? null
        : await db.prepare('SELECT addr, geo_at FROM counselors WHERE id = ?').bind(id).first();
      put('updated', nowMs());
      vals.push(id);
      await db.prepare(`UPDATE counselors SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
      if (addr && before && (addr !== (before.addr || '') || !before.geo_at)) {
        fireGeocode(ctx, db, id, addr);
      }
      return json({ ok: true }, 200, cors);
    }

    if (path === '/admin/counselors' && method === 'POST') {
      const name = s(body.name).trim();
      if (!name) return json({ error: 'name 필요' }, 400, cors);
      // ID 는 운영자가 지어내지 않는다 — 서버가 랜덤으로 배정한다.
      //  (직접 입력받던 시절엔 오타·중복·규칙 고민을 사람이 떠안았다)
      let id = s(body.id, MAX.id).trim();
      if (id && !/^[A-Za-z0-9_-]{1,32}$/.test(id)) return json({ error: 'id 는 영문·숫자만' }, 400, cors);
      if (!id) {
        for (let i = 0; i < 5; i++) {
          const cand = 'c' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
          const taken = await db.prepare('SELECT id FROM counselors WHERE id = ?').bind(cand).first();
          if (!taken) { id = cand; break; }
        }
        if (!id) return json({ error: 'ID 생성 실패 — 다시 시도해주세요' }, 500, cors);
      } else {
        const dup = await db.prepare('SELECT id FROM counselors WHERE id = ?').bind(id).first();
        if (dup) return json({ error: '이미 있는 ID 입니다' }, 409, cors);
      }
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

  // ── 운영자 콘솔 확장 (ops 앱 전용) ──────────────────────────────────
  //  여기 있는 것들은 전부 '읽기'거나 '공지·점검' 이다. 돈과 계정을 건드리는
  //  일은 위쪽 블록에 그대로 두고, 이 블록은 운영자가 상황을 '보는' 데 쓴다.
  //  전에는 통화가 몇 건 붙었는지, AI 호출이 한도에 얼마나 다가갔는지,
  //  누가 연락처를 빼돌리려 했는지를 알려면 wrangler d1 로 SQL 을 쳐야 했다.
  //  결국 아무도 안 봤고, 사고는 언제나 뒤늦게 발견됐다.
  const OPS_PATHS = [
    '/admin/calls', '/admin/clients', '/admin/timeseries', '/admin/usage',
    '/admin/contact-attempts', '/admin/reviews', '/admin/reviews/delete',
    '/admin/broadcast', '/admin/push-test', '/admin/payments'
  ];
  if (OPS_PATHS.includes(path)) {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);

    // KST 자정. 서버는 UTC 로 돌지만 운영자는 한국 시간으로 '오늘'을 센다 —
    //  UTC 자정으로 자르면 오전 9시 이전 통화가 전부 어제로 밀린다.
    const KST = 9 * 3600000;
    const t = nowMs();
    const dayStart = Math.floor((t + KST) / 86400000) * 86400000 - KST;
    // sqlite 에서 ms 타임스탬프를 KST 날짜 문자열로 바꾸는 식 (정수 나눗셈)
    const DAYEXPR = c => `strftime('%Y-%m-%d', (${c} + 32400000) / 1000, 'unixepoch')`;

    // ── ① 통화 관제 ───────────────────────────────────────────────────
    //  '지금 붙어 있는 통화'가 맨 위에 보여야 한다. 회선이 잠긴 채 남은
    //  좀비 통화를 운영자가 눈으로 찾아 끊을 수 있어야 하기 때문이다.
    if (path === '/admin/calls' && method === 'GET') {
      try {
        const r = await db.prepare(
          `SELECT c.*, k.name AS cname
             FROM calls c LEFT JOIN counselors k ON k.id = c.counselor_id
            ORDER BY c.ring_at DESC LIMIT 100`
        ).all();
        const items = (r.results || []).map(x => {
          const connected = !!x.connect_at;
          const live = !x.end_at;
          const ms = connected ? ((x.end_at || t) - x.connect_at) : 0;
          return {
            id: x.id, dir: x.dir || 'to-counselor',
            counselorId: x.counselor_id, counselorName: x.cname || '(삭제된 상담사)',
            clientId: String(x.client_id || '').slice(0, 8),   // 앞 8자만 — 식별에는 충분하다
            ringAt: x.ring_at, connectAt: x.connect_at || 0, endAt: x.end_at || 0,
            endBy: x.end_by || '', billed: x.billed || 0, rate: x.rate || 0,
            lastSeen: x.last_seen || 0, connected, live, ms
          };
        });
        // 오늘 요약은 100건 제한과 무관해야 한다 — 따로 센다
        const g = await db.prepare(
          `SELECT COUNT(*) total,
                  SUM(CASE WHEN connect_at > 0 THEN 1 ELSE 0 END) conn,
                  SUM(CASE WHEN connect_at > 0 AND end_at > 0 THEN end_at - connect_at ELSE 0 END) sumMs,
                  SUM(CASE WHEN connect_at > 0 AND end_at > 0 THEN 1 ELSE 0 END) doneN
             FROM calls WHERE ring_at >= ?`
        ).bind(dayStart).first() || {};
        const total = g.total || 0, conn = g.conn || 0, doneN = g.doneN || 0;
        return json({
          items,
          today: {
            total, connected: conn, missed: total - conn,
            connectRate: total ? Math.round(conn * 1000 / total) / 10 : 0,
            avgMs: doneN ? Math.round((g.sumMs || 0) / doneN) : 0
          },
          live: items.filter(x => x.live).length, now: t
        }, 200, cors);
      } catch (e) {
        return json({ items: [], today: null, error: 'no-table', now: t }, 200, cors);
      }
    }

    // ── ② 이용자 현황 ─────────────────────────────────────────────────
    //  내담자는 계정이 없다. 그래서 '몇 명이 실제로 쓰고 있나'를 볼 방법이
    //  누적 기기 수 하나뿐이었다. 활동 흔적(채팅·예약·통화)을 clientId 로 묶는다.
    if (path === '/admin/clients' && method === 'GET') {
      try {
        const r = await db.prepare(
          `SELECT g.client_id, MAX(g.last_ts) last_ts,
                  SUM(g.msgs) msgs, SUM(g.bks) bks, SUM(g.cls) cls, MAX(g.nm) nm
             FROM (
               SELECT client_id, MAX(ts) last_ts, COUNT(*) msgs, 0 bks, 0 cls, MAX(client_name) nm
                 FROM chat_msgs GROUP BY client_id
               UNION ALL
               SELECT client_id, MAX(created) last_ts, 0, COUNT(*), 0, MAX(client_name)
                 FROM bookings GROUP BY client_id
               UNION ALL
               SELECT client_id, MAX(ring_at) last_ts, 0, 0, COUNT(*), ''
                 FROM calls GROUP BY client_id
             ) g
            GROUP BY g.client_id ORDER BY last_ts DESC LIMIT 100`
        ).all();
        const rows = r.results || [];
        // 마지막으로 대화한 상담사 — 이름은 따로 한 번에 받아 맞춘다
        //  (100줄짜리 상관 서브쿼리 두 번보다 왕복 한 번이 싸다)
        const last = await db.prepare(
          `SELECT m.client_id, m.counselor_id FROM chat_msgs m
             JOIN (SELECT client_id, MAX(ts) mts FROM chat_msgs GROUP BY client_id) x
               ON x.client_id = m.client_id AND x.mts = m.ts LIMIT 300`
        ).all();
        const lastOf = {};
        (last.results || []).forEach(x => { lastOf[x.client_id] = x.counselor_id; });
        const cs = await db.prepare('SELECT id, name FROM counselors LIMIT 500').all();
        const nameOf = {};
        (cs.results || []).forEach(x => { nameOf[x.id] = x.name; });
        return json({
          items: rows.map(x => ({
            clientId: String(x.client_id || '').slice(0, 8),   // 앞 8자만
            clientName: x.nm || '',                            // 이름은 그대로 (문의 응대에 필요)
            lastTs: x.last_ts || 0,
            msgs: x.msgs || 0, bookings: x.bks || 0, calls: x.cls || 0,
            lastCounselor: nameOf[lastOf[x.client_id]] || ''
          })), now: t
        }, 200, cors);
      } catch (e) {
        return json({ items: [], error: 'query-failed', now: t }, 200, cors);
      }
    }

    // ── ③ 추이 (최근 14일) ────────────────────────────────────────────
    //  숫자 하나(누적)로는 '늘고 있나 줄고 있나'를 절대 알 수 없다.
    if (path === '/admin/timeseries' && method === 'GET') {
      const DAYS = 14;
      const from = dayStart - (DAYS - 1) * 86400000;
      const bucket = {};
      const keys = [];
      for (let i = 0; i < DAYS; i++) {
        const d = new Date(from + i * 86400000 + KST).toISOString().slice(0, 10);
        keys.push(d);
        bucket[d] = { d, msgs: 0, bookings: 0, calls: 0, newClients: 0 };
      }
      const put = (rows, field) => (rows || []).forEach(x => {
        if (bucket[x.d]) bucket[x.d][field] = x.n || 0;
      });
      try {
        // Promise.all 이 아니라 batch — D1 은 한 연결에 동시 실행을 싫어한다
        //  (/badge 에서 실제로 일부 쿼리가 조용히 실패한 적이 있다). 왕복도 한 번이다.
        const res = await db.batch([
          db.prepare(`SELECT ${DAYEXPR('ts')} d, COUNT(*) n FROM chat_msgs WHERE ts >= ? GROUP BY d ORDER BY d LIMIT 40`).bind(from),
          db.prepare(`SELECT ${DAYEXPR('created')} d, COUNT(*) n FROM bookings WHERE created >= ? GROUP BY d ORDER BY d LIMIT 40`).bind(from),
          db.prepare(`SELECT ${DAYEXPR('ring_at')} d, COUNT(*) n FROM calls WHERE ring_at >= ? AND connect_at > 0 GROUP BY d ORDER BY d LIMIT 40`).bind(from),
          db.prepare(
            `SELECT ${DAYEXPR('f')} d, COUNT(*) n FROM
               (SELECT client_id, MIN(ts) f FROM chat_msgs GROUP BY client_id)
              WHERE f >= ? GROUP BY d ORDER BY d LIMIT 40`).bind(from)
        ]);
        const rs = i => (res[i] && res[i].results) || [];
        put(rs(0), 'msgs'); put(rs(1), 'bookings');
        put(rs(2), 'calls'); put(rs(3), 'newClients');
      } catch (e) {
        return json({ days: keys.map(k => bucket[k]), error: 'query-failed' }, 200, cors);
      }
      return json({ days: keys.map(k => bucket[k]), from, to: dayStart, now: t }, 200, cors);
    }

    // ── ④ AI 사용량·차단 ──────────────────────────────────────────────
    //  usage 의 day 는 UTC 기준이다 (cbtproxy.worker.js 의 utcDay()).
    //  여기서 KST 로 바꿔 보여주면 카운터와 화면이 어긋난다 — UTC 그대로 쓴다.
    if (path === '/admin/usage' && method === 'GET') {
      // cbtproxy.worker.js 의 LIMIT 과 같은 값이어야 한다. 한쪽만 고치면
      //  게이지가 거짓말을 한다 (실제로는 막혔는데 화면은 여유로 보인다).
      const LIMITS = { ip: 600, client: 400, all: 300000 };
      const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
      const today = utcDay(t);
      const from = utcDay(t - 6 * 86400000);
      try {
        const res = await db.batch([
          db.prepare("SELECT day, n FROM usage WHERE kind = 'all' AND key = 'total' AND day >= ? ORDER BY day ASC LIMIT 14")
            .bind(from),
          db.prepare("SELECT key, n FROM usage WHERE kind = 'client' AND day = ? ORDER BY n DESC LIMIT 10")
            .bind(today),
          db.prepare('SELECT id, day, kind, key, n, ts FROM blocks ORDER BY ts DESC LIMIT 50')
        ]);
        const rs = i => (res[i] && res[i].results) || [];
        const d = { results: rs(0) }, tops = { results: rs(1) }, blk = { results: rs(2) };
        const days = (d.results || []).map(x => ({ d: x.day, n: x.n || 0 }));
        const todayN = (days.find(x => x.d === today) || {}).n || 0;
        return json({
          today, todayN, limits: LIMITS, days,
          // 기기 식별자는 앞 8자만. 한 기기를 특정할 이유는 '막을 때'뿐이다.
          topClients: (tops.results || []).map(x => ({ key: String(x.key || '').slice(0, 8), n: x.n || 0 })),
          blocks: (blk.results || []).map(x => ({
            id: x.id, day: x.day, kind: x.kind,
            // IP 는 개인정보다 — 뒤 두 마디를 가린다 (어느 대역인지는 남는다)
            key: x.kind === 'ip' ? String(x.key || '').replace(/^((?:\d+\.){2})\d+\.\d+$/, '$1x.x')
                                 : String(x.key || '').slice(0, 8),
            n: x.n || 0, ts: x.ts
          }))
        }, 200, cors);
      } catch (e) {
        return json({ today, todayN: 0, limits: LIMITS, days: [], topClients: [], blocks: [], error: 'no-table' }, 200, cors);
      }
    }

    // ── ⑤ 연락처 시도 감사 ────────────────────────────────────────────
    //  한두 번은 실수다. 같은 두 사람 사이에서 반복되면 직거래 유도다.
    if (path === '/admin/contact-attempts' && method === 'GET') {
      try {
        const res = await db.batch([
          db.prepare(
            `SELECT a.id, a.counselor_id, a.client_id, a.sender, a.n, a.ts, k.name cname
               FROM contact_attempts a LEFT JOIN counselors k ON k.id = a.counselor_id
              ORDER BY a.ts DESC LIMIT 100`),
          db.prepare(
            `SELECT counselor_id, client_id, COUNT(*) c, SUM(n) sn, MAX(ts) last
               FROM contact_attempts GROUP BY counselor_id, client_id
              HAVING c >= 3 ORDER BY c DESC LIMIT 20`)
        ]);
        const r = { results: (res[0] && res[0].results) || [] };
        const rep = { results: (res[1] && res[1].results) || [] };
        const key = (a, b) => a + '|' + String(b || '').slice(0, 8);
        const hot = {};
        (rep.results || []).forEach(x => { hot[key(x.counselor_id, x.client_id)] = x.c; });
        return json({
          items: (r.results || []).map(x => ({
            id: x.id, counselorId: x.counselor_id, counselorName: x.cname || '(삭제된 상담사)',
            clientId: String(x.client_id || '').slice(0, 8),
            sender: x.sender, n: x.n || 0, ts: x.ts,
            repeat: hot[key(x.counselor_id, x.client_id)] || 0
          })),
          repeats: (rep.results || []).map(x => ({
            counselorId: x.counselor_id, clientId: String(x.client_id || '').slice(0, 8),
            count: x.c, masked: x.sn || 0, lastTs: x.last
          })), now: t
        }, 200, cors);
      } catch (e) {
        return json({ items: [], repeats: [], error: 'no-table', now: t }, 200, cors);
      }
    }

    // ── ⑥ 리뷰 관리 ───────────────────────────────────────────────────
    //  욕설·개인정보가 섞인 후기는 상담사 카드에 그대로 붙는다. 지울 수 있어야 한다.
    if (path === '/admin/reviews' && method === 'GET') {
      const r = await db.prepare(
        `SELECT r.id, r.counselor_id, r.client_name, r.rating, r.body, r.reply, r.reply_ts, r.ts, k.name cname
           FROM reviews r LEFT JOIN counselors k ON k.id = r.counselor_id
          ORDER BY r.ts DESC LIMIT 100`).all();
      const items = (r.results || []).map(x => ({
        id: x.id, counselorId: x.counselor_id, counselorName: x.cname || '(삭제된 상담사)',
        clientName: x.client_name || '익명', rating: x.rating || 0,
        text: x.body || '', reply: x.reply || '', replyTs: x.reply_ts || 0, ts: x.ts
      }));
      const avg = items.length ? items.reduce((a, x) => a + x.rating, 0) / items.length : 0;
      return json({ items, avg: Math.round(avg * 10) / 10 }, 200, cors);
    }

    // 삭제는 되돌릴 수 없다 — 화면의 확인창만 믿지 않고 서버도 id 를 되묻는다
    if (path === '/admin/reviews/delete' && method === 'POST') {
      const id = s(body.id, MAX.id);
      if (!id) return json({ error: 'missing-id' }, 400, cors);
      if (body.confirm !== id) return json({ error: 'confirm 불일치' }, 400, cors);
      await db.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run();
      return json({ ok: true, id }, 200, cors);
    }

    // ── ⑥-2 결제 내역 ─────────────────────────────────────────────────
    //  캐시 충전은 실제 돈이 오간다. '오늘 얼마 들어왔나'와 '실패한 결제가
    //  몰리고 있나'를 운영자가 못 보면, 결제창이 죽어도 아무도 모른다.
    //  (pending 이 계속 쌓이면 결제창은 열리는데 승인이 안 되고 있다는 뜻이다)
    if (path === '/admin/payments' && method === 'GET') {
      try {
        const r = await db.prepare(
          `SELECT id, client_id, amount, cash, status, method, fail, created, paid_at
             FROM orders ORDER BY created DESC LIMIT 100`).all();
        const items = (r.results || []).map(x => ({
          id: x.id,
          clientId: String(x.client_id || '').slice(0, 8),   // 앞 8자만 — 식별에는 충분하다
          amount: x.amount || 0, cash: x.cash || 0,
          status: x.status || 'pending', method: x.method || '',
          fail: x.fail || '', created: x.created || 0, paidAt: x.paid_at || 0
        }));
        // 오늘 합계는 100건 제한과 무관해야 한다 — 따로 센다
        const g = await db.prepare(
          `SELECT COUNT(*) n, SUM(amount) amt, SUM(cash) cash FROM orders
            WHERE status = 'paid' AND paid_at >= ?`).bind(dayStart).first() || {};
        const f = await db.prepare(
          `SELECT COUNT(*) n FROM orders WHERE status = 'failed' AND created >= ?`)
          .bind(dayStart).first() || {};
        return json({
          items,
          today: { paid: g.n || 0, amount: g.amt || 0, cash: g.cash || 0, failed: f.n || 0 },
          now: t
        }, 200, cors);
      } catch (e) {
        return json({ items: [], today: null, error: 'no-table', now: t }, 200, cors);
      }
    }

    // ── ⑦ 전체 공지 ───────────────────────────────────────────────────
    //  점검 안내·정책 변경을 상담사 1,000명에게 개별 메일로 보낼 수는 없다.
    //  이미 매일 여는 화면(수신함)에 꽂는 것이 가장 확실하다.
    if (path === '/admin/broadcast' && method === 'POST') {
      const text = s(body.text, 2000).trim();
      if (!text) return json({ error: '내용을 적어주세요' }, 400, cors);
      const r = await db.prepare('SELECT id FROM counselors WHERE active = 1 LIMIT 500').all();
      const rows = r.results || [];
      if (!rows.length) return json({ ok: true, n: 0 }, 200, cors);
      const ts = nowMs();
      // 한 건씩 왕복하면 500명에 500번이다. batch 는 한 트랜잭션 한 왕복.
      await db.batch(rows.map(c => db.prepare(
        `INSERT INTO inbox (id, counselor_id, counselor_name, booking_id, client_id, client_name, body, read_at, ts)
         VALUES (?,?,?,'','admin',?,?,0,?)`
      ).bind(rid('ib'), c.id, '운영자', '운영자 공지', text, ts)));
      // 푸시는 응답을 붙잡지 않는다 — 500개 왕복을 기다리면 화면이 멈춘다
      const wake = Promise.all(rows.map(c => notifyCounselor(env, c.id).catch(() => {})));
      if (ctx && ctx.waitUntil) ctx.waitUntil(wake);
      return json({ ok: true, n: rows.length }, 200, cors);
    }

    // ── ⑧ 푸시 점검 ───────────────────────────────────────────────────
    //  "전화가 안 울려요" 문의의 9할은 구독이 없거나 죽은 것이다.
    //  운영자가 눌러 보면 바로 안다 — 상담사에게 설명을 시키지 않는다.
    if (path === '/admin/push-test' && method === 'POST') {
      const id = s(body.counselorId, MAX.id);
      if (!id) return json({ error: 'missing-id' }, 400, cors);
      const r = await notifyCounselor(env, id).catch(() => ({ sent: 0, total: 0 }));
      return json({ ok: true, sent: r.sent || 0, total: r.total || 0, vapid: !!env.VAPID_PRIVATE }, 200, cors);
    }
  }

  // 진단 로그 열람 (운영자만).
  //  /diag 는 쓰기만 있었다. 그래서 통화가 실기기에서 어느 단계에 죽는지
  //  알려면 wrangler d1 을 띄워 SQL 을 쳐야 했고, 결국 아무도 안 봤다.
  //  운영자 콘솔이 30초마다 이 목록을 새로 받아 표로 보여준다.
  //  본문에는 개인정보가 없다 (who 는 clientId 앞 12자, msg 는 200자 제한).
  if (path === '/admin/diag' && method === 'GET') {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const limit = Math.min(500, Math.max(1, num(q('limit')) || 200));
    const stage = s(q('stage'), 40);
    try {
      const r = stage
        ? await db.prepare(
            'SELECT id, ts, app, who, build, stage, msg FROM diag WHERE stage LIKE ? ORDER BY ts DESC LIMIT ?'
          ).bind('%' + stage + '%', limit).all()
        : await db.prepare(
            'SELECT id, ts, app, who, build, stage, msg FROM diag ORDER BY ts DESC LIMIT ?'
          ).bind(limit).all();
      const items = (r.results || []).map(x => ({
        id: x.id, ts: x.ts, app: x.app || '', who: x.who || '',
        build: x.build || '', stage: x.stage || '', msg: x.msg || ''
      }));
      return json({ items, fails: items.filter(x => /fail/.test(x.stage)).length }, 200, cors);
    } catch (e) {
      // diag 테이블이 아직 없는 배포도 있다 — 콘솔이 빈 표를 그리게 두고 사유만 알린다
      return json({ items: [], error: 'no-table' }, 200, cors);
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
//  반올림 오차는 플랫폼이 흡수한다 — 상담사 몫이 1원이라도 줄면 안 된다.
//  기관 몫은 2026-08-11 부로 배분 종료 (기관 수수료는 플랫폼 몫에서 별도 협의).
const SPLIT = { counselor: 70, hospital: 0, pg: 3, platform: 27 };
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
    tel: c.tel || '', addr: c.addr || '', addrDetail: c.addr_detail || '',
    intro: c.intro || '',
    // 본인 화면에는 사진 원본을 그대로 돌려준다 — 미리보기와 [사진 삭제]가
    //  '지금 뭐가 올라가 있는지'를 보여줘야 하기 때문이다.
    photo: c.photo || '',
    // 좌표는 읽기 전용이다. 서버가 주소로 구한 값이고 앱이 고칠 수 없다.
    lat: c.lat || 0, lng: c.lng || 0, geoAt: c.geo_at || 0,
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
