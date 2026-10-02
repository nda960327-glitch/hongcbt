// 마인드 인사이드 AI 프록시 (Cloudflare Worker)
// -------------------------------------------------------------
// OpenAI API 키를 "서버에만" 보관하고, 브라우저에는 절대 노출하지 않습니다.
// 브라우저 → (키 없이) 이 Worker → (숨긴 키로) OpenAI → Worker → 브라우저
//
// [배포 방법]
//   1) npm i -g wrangler && wrangler login
//   2) wrangler secret put OPENAI_API_KEY     ← 새로 발급한 키를 붙여넣기
//   3) (선택) wrangler secret put ALLOWED_ORIGIN   ← 예: https://your-app.com
//   4) wrangler deploy
//   5) 출력된 주소(예: https://cbt-proxy.<계정>.workers.dev)를
//      js/llm.js 의 BACKEND_URL 에 넣으면 끝.
//
// [경로]
//   POST /chat  (또는 /api/chat, 그리고 하위호환용 /) → 채팅 응답 (JSON)
//   POST /tts   (또는 /api/tts)                      → 음성 합성 (mp3)
// -------------------------------------------------------------

// deepseek-chat 은 비교용 상담사 '우렁의사' 전용 — DeepSeek 의 OpenAI 호환 API 로 보낸다 (시크릿 DEEPSEEK_API_KEY)
const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "deepseek-chat"];
const ALLOWED_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];
const ALLOWED_VOICES = ["coral", "nova", "shimmer", "sage", "alloy", "echo", "ash", "onyx", "fable"];
// 상한을 1500 으로 두었더니 배포본에서 간판 기능이 통째로 죽어 있었습니다.
//  · AI 마음 리포트는 8,000 을 요청합니다 (carePlan 이 JSON 스키마 끝이라
//    잘리면 계획이 통째로 날아가고 파싱이 실패 → 캐시 환불로 끝납니다)
//  · 장기기억 정리는 2,600 (3,000자)
//  로컬 server.js 에는 캡이 없어서 개발 중에는 드러나지 않았습니다.
const MAX_TOKENS_CAP = 8000;
const MAX_MESSAGES = 40;
const MAX_TTS_CHARS = 2000;

import { handleMarket } from "./market.js";
import { handleFeed } from "./feed.js";
import { handleSurvey } from "./survey.js";
import { handleHospital } from "./hospital.js";
import { handleCommunity } from "./community.js";
import { handleBlog } from "./blogpage.js";
import { handleClinics } from "./clinics.js";
import { resolveCounselor } from "./auth.js";
import { verifyClient } from "./market.js";
import { notifyCounselor, notifyClient } from "./push.js";
export { ChatHub } from "./hub.js";

// ── 남용 방어 ───────────────────────────────────────────────────────────
//  이 Worker 는 인증이 없다. 주소가 앱 JS 안에 그대로 있으니 누구나 긁어서
//  OpenAI 크레딧을 태울 수 있다. 공개 프록시는 발견되면 하루 만에 털린다.
//  계정을 요구하는 건 '가입 없음' 원칙과 충돌하므로 세 겹으로 막는다.
//
//  주 방어선은 IP 다. clientId 는 요청 본문에 실려 오는 '자기 신고'라서
//  공격자가 매 요청마다 새로 지어내면 그 카운터는 없는 것과 같다.
//  IP 는 Cloudflare 가 붙여 주므로 위조할 수 없다 — 하루 총량과 분당 폭주를
//  둘 다 IP 로 잡고, clientId 는 '정상 사용자에게 오늘은 그만'을 알리는
//  부가 장치로만 남긴다.
const LIMIT = {
  ipMin: 90,      // 한 IP 1분 (사람이 앱을 아무리 빨리 눌러도 닿지 않는 선)
  ip: 600,        // 한 IP 하루 (가족·공용 와이파이·통신사 NAT 를 감안해 넉넉히)
  client: 400,    // 한 기기 하루 (앱의 HARD_DAILY 와 같은 선)
  all: 300000     // 전체 하루 — 마지막 안전판. 이걸 넘으면 뭔가 잘못된 것이다
};

const utcDay = () => new Date().toISOString().slice(0, 10);
// 분 버킷 — usage 표를 그대로 쓴다(kind='ipm'). 야간 청소가 day 기준으로 걷어간다.
const minuteKey = ip => ip + '|' + Math.floor(Date.now() / 60000).toString(36);

// 세 카운터를 '한 번의 배치'로 올린다.
//  처음에는 Promise.all 로 세 개를 동시에 던졌는데, D1 은 같은 연결에 동시 쓰기가
//  들어오면 일부가 실패한다. 그 예외가 catch 로 삼켜져 방어가 통째로 무력화됐다
//  (401번째 요청이 그대로 통과했다). batch 는 한 트랜잭션이라 이런 일이 없다.
const UPSERT =
  `INSERT INTO usage (day, kind, key, n, first, last) VALUES (?,?,?,1,?,?)
   ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1, last = excluded.last
   RETURNING n`;

async function bumpAll(db, pairs) {
  const day = utcDay(), t = Date.now();
  const res = await db.batch(pairs.map(([kind, key]) =>
    db.prepare(UPSERT).bind(day, kind, String(key).slice(0, 80), t, t)));
  return res.map(r => {
    const rows = r && (r.results || r);
    const row = Array.isArray(rows) ? rows[0] : null;
    return (row && row.n) || 0;
  });
}

async function noteBlock(db, kind, key, n) {
  try {
    await db.prepare('INSERT INTO blocks (id, day, kind, key, n, ts) VALUES (?,?,?,?,?,?)')
      .bind('bk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            utcDay(), kind, String(key).slice(0, 80), n, Date.now()).run();
  } catch (e) {}
}

// 통과하면 null, 막아야 하면 이유를 돌려준다
async function abuseCheck(request, env, body) {
  if (!env.DB) return null;                    // DB 바인딩 자체가 없는 배포(로컬·프리뷰)는 예외
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const client = String((body && body.clientId) || '').slice(0, 64) || 'anon';
  try {
    const [nAll, nIp, nMin, nClient] = await bumpAll(env.DB, [
      ['all', 'total'], ['ip', ip], ['ipm', minuteKey(ip)], ['client', client]
    ]);
    if (nMin > LIMIT.ipMin)     { await noteBlock(env.DB, 'ipm', ip, nMin);        return 'burst'; }
    if (nIp > LIMIT.ip)         { await noteBlock(env.DB, 'ip', ip, nIp);          return 'ip'; }
    if (nAll > LIMIT.all)       { await noteBlock(env.DB, 'all', 'total', nAll);   return 'all'; }
    if (nClient > LIMIT.client) { await noteBlock(env.DB, 'client', client, nClient); return 'client'; }
  } catch (e) {
    // 전에는 여기서 null(통과)을 돌려줬다. 그런데 카운터를 못 세는 상태는
    //  곧 '아무 제한이 없는 상태'다 — 남용 트래픽이 D1 을 밀어 넘어뜨리면
    //  그때부터 열쇠가 통째로 풀리는 셈이라, 공격자에게는 이게 더 쉬운 길이다.
    //  세지 못하면 열지 않는다.
    return 'error';
  }
  return null;
}

// ── 예약 30분 전 알림 ─────────────────────────────────────────────────────
//  예약은 잡아 두고 잊는다. 상담사도 내담자도 시간에 못 들어오면 노쇼가 되고,
//  노쇼는 정산 분쟁으로 번진다. 5분마다 '25~35분 뒤 시작'인 확정 예약을 찾아
//  양쪽에 한 번씩 알린다. 창을 10분으로 두는 이유: 크론이 한 번 늦거나 건너뛰어도
//  다음 번(5분 뒤)에 여전히 창 안에 있어 놓치지 않는다.
//  두 번 보내지 않는 건 reminded_at 의 '조건부 UPDATE' 가 맡는다 — 크론이 겹쳐 돌아도
//  UPDATE 를 이긴(changes > 0) 쪽만 알린다.
//  reminded_at 칸이 아직 없는 DB(schema-2026-10.sql 적용 전)에서는 조용히 건너뛴다 —
//  칸 없이 보내면 5분마다 같은 알림이 반복된다.
const REMIND_CRON = "*/5 * * * *";
const CLEANUP_CRON = "0 18 * * *";

// 상담 시각을 한국 시간 글자로 — 서버는 UTC 로 돈다. "오후 3:00" / 날짜가 다르면 "10월 2일 오후 3:00"
function kstLabel(ts, now) {
  const K = 9 * 3600000;
  const d = new Date(ts + K), n = new Date(now + K);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const hm = (h < 12 ? "오전 " : "오후 ") + ((h % 12) || 12) + ":" + String(m).padStart(2, "0");
  const sameDay = d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  return sameDay ? hm : (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일 " + hm;
}

async function remindBookings(env, ctx) {
  const db = env.DB;
  if (!db) return;
  const t = Date.now();
  let rows = [];
  try {
    const r = await db.prepare(
      `SELECT id, counselor_id, counselor_name, client_id, client_name, when_ts FROM bookings
        WHERE status = 'confirmed' AND when_ts BETWEEN ? AND ? AND COALESCE(reminded_at, 0) = 0
        LIMIT 50`
    ).bind(t + 25 * 60000, t + 35 * 60000).all();
    rows = (r && r.results) || [];
  } catch (e) { return; }                 // reminded_at 칸이 없다 — 반복 발송보다 안 보내는 게 낫다
  const jobs = [];
  for (const b of rows) {
    let won = false;
    try {
      const u = await db.prepare("UPDATE bookings SET reminded_at = ? WHERE id = ? AND COALESCE(reminded_at, 0) = 0 AND status = 'confirmed'")
        .bind(t, b.id).run();
      won = !!(u && u.meta && u.meta.changes > 0);
    } catch (e) { won = false; }
    if (!won) continue;
    const when = kstLabel(b.when_ts, t);
    const mins = Math.max(1, Math.round((b.when_ts - t) / 60000));
    jobs.push(notifyCounselor(env, b.counselor_id, {
      kind: "notice", type: "remind", ttl: 1800, act: "bookings",
      title: "상담 " + mins + "분 전",
      body: (b.client_name || "내담자") + " 님과의 상담이 " + when + "에 시작돼요."
    }).catch(() => {}));
    jobs.push(notifyClient(env, b.client_id, {
      kind: "notice", type: "remind", ttl: 1800, act: "counselors",
      title: "상담 " + mins + "분 전",
      body: (b.counselor_name || "상담사") + " 선생님과의 상담이 " + when + "에 시작돼요."
    }).catch(() => {}));
  }
  if (jobs.length) {
    const all = Promise.all(jobs);
    if (ctx && ctx.waitUntil) ctx.waitUntil(all); else await all;
  }
}

const APP = {
  // 크론은 두 개다 — 5분마다 예약 알림, 매일 KST 03:00 야간 청소.
  //  event.cron 으로 갈라야 한다. 안 가르면 5분마다 야간 청소(죽은 통화 강제 종료 포함)가 돈다.
  async scheduled(event, env, ctx) {
    const cron = (event && event.cron) || "";
    if (cron === REMIND_CRON) return remindBookings(env, ctx);
    if (cron && cron !== CLEANUP_CRON) return;
    return APP.cleanup(event, env, ctx);
  },

  // 야간 청소 (매일 KST 03:00) — 손으로 SQL 을 치던 정리를 자동으로.
  //  통화 신호·진단·사용량 카운터는 유통기한이 짧다. 안 치우면 D1 만 무거워진다.
  async cleanup(event, env, ctx) {
    const db = env.DB;
    if (!db) return;
    const t = Date.now();
    const jobs = [
      db.prepare('DELETE FROM rtc_signals WHERE ts < ?').bind(t - 30 * 60000),          // 신호 30분
      db.prepare('DELETE FROM diag WHERE ts < ?').bind(t - 7 * 86400000),               // 진단 7일
      db.prepare("DELETE FROM usage WHERE day < date('now', '-30 days')"),              // 카운터 30일
      db.prepare("DELETE FROM blocks WHERE day < date('now', '-30 days')"),
      // 죽은 통화 전역 수거 — 통화 중 양쪽이 다 사라진 뒤 아무 요청도 없으면
      //  요청-시점 리퍼가 영영 안 돌 수 있다. 하루 한 번은 반드시 청소한다.
      db.prepare("UPDATE calls SET end_at = ?, end_by = 'dead', billed = 0 WHERE end_at = 0 AND ring_at < ?").bind(t, t - 2 * 3600000),
      db.prepare('UPDATE counselors SET busy_until = 0 WHERE busy_until > 0 AND busy_until < ?').bind(t)
    ];
    try { await db.batch(jobs); } catch (e) {}
  },

  async fetch(request, env, ctx) {
    // CORS — '*' 대신 허용 목록으로 좁힌다. 단 앱을 깨뜨리면 안 되므로:
    //   · Origin 이 없는 요청(Capacitor 네이티브 웹뷰·서버-서버)은 그대로 허용한다.
    //     브라우저가 아닌 요청이라 CORS 가 애초에 의미가 없고, 막으면 앱이 죽는다.
    //   · 우리 도메인·Pages 미리보기(*.pages.dev)·localhost 만 echo 한다.
    //   · env.ALLOWED_ORIGIN(콤마 구분)이 있으면 목록에 더한다.
    //  CORS 는 브라우저에서 Origin 을 위조 못한다는 것뿐이라 근본 방어가 아니다 —
    //  curl 남용은 아래 IP 카운터가 막는다. 여기서는 '웹에서 남의 사이트가
    //  내 워커를 함부로 부르는' 크로스사이트만 차단한다.
    const reqOrigin = request.headers.get("Origin") || "";
    const ALLOW_ORIGINS = [
      "https://mindinsideapp.com", "https://www.mindinsideapp.com",
      "https://pro.mindinsideapp.com", "https://ops.mindinsideapp.com", "https://doc.mindinsideapp.com",
      // 홈페이지 — '직접 체험해 보기'(/intro/demo)를 부른다
      "https://mindinside.kr", "https://www.mindinside.kr", "https://mindinside-home.pages.dev",
      // 옛 도메인 — 안드로이드 앱(capacitor server.url)과 옛 링크가 아직 여기로 온다
      "https://neurumind.com", "https://www.neurumind.com",
      "https://pro.neurumind.com", "https://ops.neurumind.com", "https://doc.neurumind.com",
      "https://neurumind.pages.dev", "https://neurumind-pro.pages.dev",
      "https://neurumind-ops.pages.dev", "https://neurumind-doc.pages.dev",
      ...String(env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean),
    ];
    const originOk = !reqOrigin                                   // 네이티브·서버 요청 (Origin 없음)
      || ALLOW_ORIGINS.includes(reqOrigin)                        // 우리 도메인
      || /^https:\/\/[a-z0-9-]+\.neurumind-?(pro|ops|doc)?\.pages\.dev$/.test(reqOrigin)  // Pages 미리보기 해시
      || /^https?:\/\/localhost(:\d+)?$/.test(reqOrigin)          // 개발·일부 웹뷰
      || /^https:\/\/localhost$/.test(reqOrigin);
    // 허용되면 그 Origin 을 그대로 echo(자격증명 없는 API 라 * 대신 정확히),
    //  Origin 이 없으면 * (네이티브는 CORS 검사를 안 하므로 무해).
    const allowOrigin = reqOrigin ? (originOk ? reqOrigin : "https://mindinsideapp.com") : "*";
    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    // CORS preflight
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // ── 과부하·악용 차단 (앞단) ─────────────────────────────────────────
    //  스크립트로 요청을 퍼붓는 한 사람 때문에 서비스 전체가 멈추면, 그 피해 배상은 우리 몫이다.
    //  그래서 IP 단위로 먼저 끊는다. 바인딩이 없는 배포(로컬 등)에서는 그냥 통과한다.
    //  Cloudflare 가 L3/L4 DDoS 는 앞에서 흡수하고, 여기서는 정상 요청처럼 보이는 폭주를 막는다.
    {
      const ipKey = request.headers.get("cf-connecting-ip") || "?";
      const pth = new URL(request.url).pathname.replace(/^\/api/, "");
      const ok = async (b, key) => { if (!b || !b.limit) return true; try { return (await b.limit({ key })).success; } catch (e) { return true; } };
      const authy = /^\/(stats|admin\/|inbox|hospital\/me|hospital\/auth\/|auth\/|intro\/unlock|settle|purge)/.test(pth);
      let tooMany = !(await ok(env.RL_IP, "ip:" + ipKey));
      if (!tooMany && request.method === "POST") tooMany = !(await ok(env.RL_WRITE, "w:" + ipKey));
      if (!tooMany && authy) tooMany = !(await ok(env.RL_AUTH, "a:" + ipKey));
      if (tooMany) {
        return new Response(JSON.stringify({ error: "too-many", message: "요청이 너무 많아요. 1분 뒤에 다시 시도해주세요." }), {
          status: 429, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" }
        });
      }
    }

    const path = new URL(request.url).pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";

    // 상담소 블로그의 공개 웹 페이지(검색엔진용 HTML) — mindinsideapp.com/blog… 가 이 Worker 로 온다 (wrangler.toml routes)
    if (path === "/blog" || path.startsWith("/blog/") || (path === "/" && /(^|\.)mindinside\.kr$/.test(new URL(request.url).hostname))) {
      const r = await cachedBlog(request, env, ctx, path);
      if (r) return r;
    }

    // ── 실시간 웹소켓 (/ws?ch=cl:<clientId> | c:<counselorId>) ──────────
    //  받는 쪽이 8~15초 폴링을 기다리던 것을, 저장 즉시 밀어주는 것으로 바꾼다.
    //  상담사 채널은 자격증명으로 본인 확인 — 채널 이름만 알면 남의 대화를
    //  엿들을 수 있으면 안 된다. 내담자 채널도 마찬가지다: 상담사 답장 전문이 흐르는데
    //  clientId 는 상담사에게도 보이는 값이라, 이름만으로 열어 두면 엿들을 수 있었다.
    //  주인이 정해진 clientId 는 clientKey 로 증명해야 한다(아직 claim 전이면 유예 통과 —
    //  verifyClient 의 'pass').
    if (path === "/ws") {
      const u = new URL(request.url);
      const ch = (u.searchParams.get("ch") || "").slice(0, 120);
      if (!/^(c|cl):[\w-]{1,80}$/.test(ch)) return json({ error: "bad-channel" }, 400, cors);
      if (ch.startsWith("c:") && env.DB) {
        const me = await resolveCounselor(env.DB, {
          session: (u.searchParams.get("session") || "").slice(0, 128),
          code: (u.searchParams.get("code") || "").slice(0, 64)
        }).catch(() => null);
        if (!me || "c:" + me.id !== ch) return json({ error: "forbidden" }, 403, cors);
      }
      if (ch.startsWith("cl:") && env.DB) {
        const v = await verifyClient(env, ch.slice(3), (u.searchParams.get("clientKey") || "").slice(0, 64)).catch(() => "ok");
        if (v === "deny") return json({ error: "forbidden" }, 403, cors);
      }
      if (!env.HUB) return json({ error: "no-hub" }, 503, cors);
      const stub = env.HUB.get(env.HUB.idFromName(ch));
      return stub.fetch("https://hub/connect", request);
    }

    // 상담사 마켓(D1)은 GET 도 받는다. 여기서 처리되지 않으면 null 이 와서
    //  아래 AI 경로로 흘러간다 — 두 기능이 한 Worker 를 쓰되 서로 모르게.
    // 우렁이의 추천(영상·글) — 마켓과 같은 D1 을 쓰되 모듈은 따로
    // 이용자 설문(mindinside.kr/survey) — 익명 답 저장 · 운영자만 결과 조회
    if (path.startsWith("/survey")) {
      const r = await handleSurvey(request, env, cors, path);
      if (r) return r;
    }
    if (path.startsWith("/feed")) {
      const r = await handleFeed(request, env, cors, path);
      if (r) return r;
    }
    // 소개 페이지(neurumind.com/intro/) — 팀원이 비밀번호를 넣으면 테스트 코드를 본다.
    //  코드를 HTML 에 박아 두면 소스 보기로 다 보인다.
    //  운영자 코드(ADMIN_CODE)는 더 이상 주지 않는다. 비밀번호가 네 자리('1234')라 사실상
    //   공개인데, 그걸로 전체 이용자 데이터를 여는 마스터 코드가 나가고 있었다.
    //   페이지는 admin 이 비면 '—' 로 보여준다 — 운영자 코드는 사장님이 직접 전한다.
    //  상담사도 이름이 '테스트'로 시작하는 계정만 준다 — '첫 상담사'는 실제 상담사일 수 있다.
    //  IP 당 10분에 8번까지 + 전체 합산 10분에 30번 틀리면 모두 잠근다
    //  (IP 를 바꿔 가며 네 자리를 찍으면 IP 제한만으로는 못 막는다).
    if (path === "/intro/unlock" && request.method === "POST") {
      const db = env.DB;
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const ip = request.headers.get("cf-connecting-ip") || "?";
      const key = "intro:" + ip, now = Date.now();
      if (db) {
        try {
          const c = await db.prepare("SELECT COUNT(*) n FROM rate_hits WHERE key = ? AND ts > ?").bind(key, now - 600000).first();
          if ((c && c.n) >= 8) return json({ error: "too-many", message: "너무 많이 시도했어요. 10분 뒤에 다시 해주세요." }, 429, cors);
          await db.prepare("INSERT INTO rate_hits (key, ts) VALUES (?,?)").bind(key, now).run();
          await db.prepare("DELETE FROM rate_hits WHERE ts < ?").bind(now - 3600000).run();
        } catch (e) {}
      }
      if (db) {
        try {
          const g = await db.prepare("SELECT COUNT(*) n FROM rate_hits WHERE key = 'intro-fail' AND ts > ?").bind(now - 600000).first();
          if ((g && g.n) >= 30) return json({ error: "too-many", message: "잠시 잠겼어요. 10분 뒤에 다시 해주세요." }, 429, cors);
        } catch (e) {}
      }
      const pw = String(body.pw || "").trim();
      if (!env.INTRO_PW || pw !== String(env.INTRO_PW)) {
        if (db) { try { await db.prepare("INSERT INTO rate_hits (key, ts) VALUES ('intro-fail', ?)").bind(now).run(); } catch (e) {} }
        return json({ error: "bad-pw" }, 403, cors);
      }
      let hospital = null, counselor = null;
      if (db) {
        try {
          const h = await db.prepare("SELECT name, doctor, code, email FROM hospitals WHERE active = 1 AND name LIKE '테스트%' ORDER BY created ASC LIMIT 1").first();
          if (h) hospital = { name: h.name, doctor: h.doctor || "", code: h.code, email: h.email || "" };
          const k = await db.prepare("SELECT name, code, email FROM counselors WHERE active = 1 AND name LIKE '테스트%' ORDER BY created ASC LIMIT 1").first();
          if (k) counselor = { name: k.name, code: k.code, email: k.email || "" };
        } catch (e) {}
      }
      return json({
        ok: true, admin: "", hospital, counselor,
        urls: { app: env.APP_URL || "https://mindinsideapp.com", pro: env.PRO_URL || "https://pro.mindinsideapp.com", doc: env.DOC_URL || "https://doc.mindinsideapp.com", ops: "https://ops.mindinsideapp.com" }
      }, 200, cors);
    }
    // 홈페이지(mindinside.kr) '직접 체험해 보기' — 비밀번호(기본 0000)를 넣으면 테스트 계정 코드만 준다.
    //  운영자 코드는 절대 넣지 않는다: 0000 은 사실상 공개라, 여기 넣으면 실제 이용자 데이터가 열린다.
    //  테스트 상담사도 이름이 '테스트'로 시작하는 계정만 — intro/unlock 처럼 '첫 상담사'를 주면 실제 상담사가 새 나간다.
    if (path === "/intro/demo" && request.method === "POST") {
      const db = env.DB;
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const ip = request.headers.get("cf-connecting-ip") || "?";
      const key = "demo:" + ip, now = Date.now();
      if (db) {
        try {
          const c = await db.prepare("SELECT COUNT(*) n FROM rate_hits WHERE key = ? AND ts > ?").bind(key, now - 600000).first();
          if ((c && c.n) >= 20) return json({ error: "too-many", message: "너무 많이 시도했어요. 10분 뒤에 다시 해주세요." }, 429, cors);
          await db.prepare("INSERT INTO rate_hits (key, ts) VALUES (?,?)").bind(key, now).run();
        } catch (e) {}
      }
      if (String(body.pw || "").trim() !== String(env.DEMO_PW || "0000")) return json({ error: "bad-pw" }, 403, cors);
      let hospital = null, counselor = null;
      if (db) {
        try {
          const h = await db.prepare("SELECT name, code FROM hospitals WHERE active = 1 AND name LIKE '테스트%' ORDER BY created ASC LIMIT 1").first();
          if (h) hospital = { name: h.name, code: h.code };
          const k = await db.prepare("SELECT name, code FROM counselors WHERE active = 1 AND name LIKE '테스트%' ORDER BY created ASC LIMIT 1").first();
          if (k) counselor = { name: k.name, code: k.code };
        } catch (e) {}
      }
      return json({ ok: true, hospital, counselor }, 200, cors);
    }
    // 대면상담 및 진료 — 내 주변 정신건강의학과 (카카오 로컬 + D1)
    if (/^\/(clinics\/|admin\/clinics)/.test(path)) {
      const r = await handleClinics(request, env, cors, path, ctx);
      if (r) return r;
    }
    // 상담소 소식(커뮤니티) — 상담소 글·좋아요·댓글·상담소 페이지. /hospital/posts… 는 hospital.js 보다 먼저 본다.
    if (/^\/(community|hospital\/(posts|comments|profile|inquiries)|pro\/posts|pro\/board|admin\/community|admin\/hospital-apps)/.test(path)) {
      const r = await handleCommunity(request, env, cors, path, ctx);
      if (r) return r;
    }
    // 상담소(소장) 연동 — 내담자 연결·회기 기록·소장 피드백
    if (/^\/(patient\/|session-notes|hospital\/|admin\/hospitals|doctor-feedback)/.test(path)) {
      const r = await handleHospital(request, env, cors, path, ctx);
      if (r) return r;
    }
    if (!/^\/(tts|chat)?$/.test(path)) {
      const r = await handleMarket(request, env, cors, path, ctx);
      if (r) return r;
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
    if (!env.OPENAI_API_KEY) return json({ error: "Server not configured" }, 500, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Bad JSON" }, 400, cors); }

    // AI 호출만 사용량을 센다 (마켓 API 는 위에서 이미 돌아갔다)
    const blocked = await abuseCheck(request, env, body);
    if (blocked) {
      const msg = blocked === 'client'
        ? "오늘은 여기까지 하고 쉬어가요. 내일 다시 만나요."
        : "지금 요청이 몰리고 있어요. 잠시 후 다시 시도해주세요.";
      // 집계 자체가 안 되는 상황은 '내 잘못이 아니라 서버가 잠시 아픈 것' —
      //  503 으로 알려야 앱이 재시도할 수 있고, 하루 한도를 쓴 것과 구분된다.
      const st = blocked === 'error' ? 503 : 429;
      return new Response(JSON.stringify({ error: { message: msg, reason: blocked } }), {
        status: st,
        headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': blocked === 'burst' ? '60' : '30' }
      });
    }

    return path === "/tts" ? handleTts(body, env, cors) : handleChat(body, env, cors);
  },
};

// --- 채팅 완성 ---
async function handleChat(body, env, cors) {
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) return json({ error: "messages required" }, 400, cors);

  // 남용 방지: 모델 화이트리스트 / 토큰·메시지 상한 / 온도 클램프
  const model = ALLOWED_MODELS.includes(body.model) ? body.model : "gpt-4o-mini";
  const max_tokens = Math.min(Number(body.max_tokens) || 600, MAX_TOKENS_CAP);
  const temperature = typeof body.temperature === "number"
    ? Math.max(0, Math.min(1.2, body.temperature)) : 0.75;
  const trimmed = messages.length > MAX_MESSAGES
    ? messages.slice(messages.length - MAX_MESSAGES) : messages;

  // 반복 억제. 이걸 안 넘기면 배포본만 상투적인 말을 되풀이한다
  //  (llm.js 는 0.4 를 보내는데 여기서 버려지고 있었다)
  const clamp2 = v => typeof v === "number" ? Math.max(-2, Math.min(2, v)) : undefined;
  const payload = { model, messages: trimmed, temperature, max_tokens };
  const pp = clamp2(body.presence_penalty), fp = clamp2(body.frequency_penalty);
  if (pp !== undefined) payload.presence_penalty = pp;
  if (fp !== undefined) payload.frequency_penalty = fp;
  // 클라이언트가 원하면 스트리밍으로. 옛 클라이언트는 stream 을 안 보내므로 그대로 통짜 응답.
  const wantStream = body.stream === true;
  if (wantStream) payload.stream = true;

  // 모델에 따라 보낼 곳이 갈린다. DeepSeek 는 요청·응답 형식이 OpenAI 와 같아서 payload 를 그대로 쓴다.
  const isDeepSeek = model.startsWith("deepseek");
  if (isDeepSeek && !env.DEEPSEEK_API_KEY) return json({ error: "deepseek-key-missing" }, 503, cors);
  const upstream = await fetch(isDeepSeek ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${isDeepSeek ? env.DEEPSEEK_API_KEY : env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  // 스트리밍: SSE 를 버퍼링 없이 그대로 흘려보낸다.
  //  전에는 전체를 기다렸다 한 번에 줬는데, 그 몇 초가 사용자에게는 침묵이었다.
  if (wantStream && upstream.ok && upstream.body) {
    return new Response(upstream.body, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // OpenAI 응답을 그대로 전달 (클라이언트의 기존 파싱과 호환 · 스트림 요청이 실패한 경우 포함)
  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// --- 음성 합성 (TTS) — mp3 바이너리를 그대로 흘려보낸다 ---
async function handleTts(body, env, cors) {
  const input = typeof body.input === "string" ? body.input.slice(0, MAX_TTS_CHARS) : "";
  if (!input.trim()) return json({ error: "input required" }, 400, cors);

  const model = ALLOWED_TTS_MODELS.includes(body.model) ? body.model : "gpt-4o-mini-tts";
  const voice = ALLOWED_VOICES.includes(body.voice) ? body.voice : "coral";
  const speed = Math.max(0.5, Math.min(2, Number(body.speed) || 1));

  const payload = { model, voice, input, speed, response_format: "mp3" };
  if (typeof body.instructions === "string") payload.instructions = body.instructions.slice(0, 500);

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(err, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { ...cors, "Content-Type": "audio/mpeg" },
  });
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...(cors || {}), "Content-Type": "application/json" },
  });
}


// ══ 입구 래퍼 — 코드 찍어보기 잠금 ════════════════════════════════════
//  운영자·상담사·병원 코드는 전부 '맞히면 열리는 열쇠'다. 스크립트로 계속 찍어 보면 언젠가 열린다.
//  Cloudflare 요청 제한 바인딩은 빠르지만 대략 센다(서버마다 따로) — 실측에서 80번 연속이 그대로 통과했다.
//  그래서 여기서는 '틀린 횟수'만 DB 에 정확히 적고, 10분에 AUTH_FAIL_MAX 번 틀린 IP 는 잠근다.
//  맞힌 요청은 적지 않으므로 정상 사용에는 비용이 없다.
const AUTH_FAIL_MAX = 30;
const AUTH_FAIL_WINDOW = 10 * 60000;
const AUTHY = /^\/(stats|admin\/|inbox|hospital\/|auth\/|intro\/unlock|settle|purge|bookings\/done|session-notes|doctor-feedback)/;

// 만료된 로그인이 10초마다 새로고침하면 같은 값이 계속 틀린다 — 그걸로 병원 와이파이 전체가 잠기면 안 된다.
//  찍어보기는 매번 다른 값을 넣으므로 "서로 다른 틀린 값의 개수"로 센다.
const credOf = async (request) => {
  const u = new URL(request.url);
  let v = u.searchParams.get('code') || u.searchParams.get('session') || u.searchParams.get('hcode') || u.searchParams.get('hsession') || '';
  if (!v && request.method === 'POST') {
    try { const b = await request.clone().json(); v = (b && (b.code || b.session || b.hcode || b.hsession || b.pw || b.t)) || ''; } catch (e) {}
  }
  let h = 5381; const s = String(v);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// 커뮤니티 공개 쪽은 엣지에 15분 담아 둔다 — 검색 로봇이 글 천 개를 한꺼번에 읽으면 D1 무료 한도(하루 읽기 500만 행)를 넘겨
//  서비스 전체가 멈춘다(2026-10-03 실제로 멈췄다). 로그인 쿠키가 있는 요청(비공개 라운지)과 개인 화면은 담지 않는다.
//  DB 가 막혀 글을 못 찾은 것(404)은 '없는 글'이 아니라 '잠시 안 됨'(503)으로 알린다 — 검색엔진이 글을 지우지 않게.
async function cachedBlog(request, env, ctx, path) {
  const url = new URL(request.url);
  const ok = request.method === 'GET' && url.protocol === 'https:' && !/mi_s=/.test(request.headers.get('cookie') || '') && !/^\/blog\/(me|write|verify|login|join|saved)(\/|$)/.test(path);
  const key = ok ? new Request(url.origin + url.pathname + url.search, { method: 'GET' }) : null;
  if (key) { try { const hit = await caches.default.match(key); if (hit) return hit; } catch (e) {} }
  const r = await handleBlog(request, env, ctx, path);
  if (r && r.status === 404 && env.DB) {
    try { await env.DB.prepare('SELECT 1 x FROM posts LIMIT 1').first(); }
    catch (e) { return new Response('<!doctype html><meta charset="utf-8"><title>잠시 점검 중</title><p style="font-family:sans-serif;padding:2rem">잠시 점검 중이에요. 조금 뒤에 다시 열어 주세요.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3600', 'Cache-Control': 'no-store' } }); }
  }
  if (key && r && r.status === 200) {
    try {
      const c = new Response(r.body, r);
      c.headers.set('Cache-Control', 'public, max-age=60, s-maxage=900');
      ctx.waitUntil(caches.default.put(key, c.clone()));
      return c;
    } catch (e) {}
  }
  return r;
}

// 최고관리자의 운영자 콘솔 — code 자리에 'su_<로그인 세션>' 이 오면, 그 세션이 최고관리자(user_roles.role='super')일 때만 진짜 운영자 코드로 바꿔 넣는다.
//  GET 은 ?code=su_…, POST 는 ?su=1 을 붙이고 본문의 code 에 싣는다(모든 POST 본문을 읽지 않으려고 표시를 받는다).
async function suSwap(request, env) {
  try {
    if (!env.DB || !env.ADMIN_CODE || request.url.indexOf('su') < 0) return request;
    const url = new URL(request.url);
    const qc = url.searchParams.get('code') || '';
    const viaBody = request.method === 'POST' && url.searchParams.get('su') === '1';
    if (!qc.startsWith('su_') && !viaBody) return request;
    let b = null, tok = qc.startsWith('su_') ? qc.slice(3) : '';
    if (viaBody) { try { b = JSON.parse(await request.clone().text()); } catch (e) { return request; } if (b && typeof b.code === 'string' && b.code.startsWith('su_')) tok = b.code.slice(3); }
    if (!/^[a-f0-9]{64}$/.test(tok)) return request;
    const row = await env.DB.prepare("SELECT 1 x FROM user_sessions s JOIN user_roles r ON r.user_id = s.user_id WHERE s.token = ? AND s.expires > ? AND r.role = 'super' AND r.status = 'approved'").bind(tok, Date.now()).first();
    if (!row) return request;
    if (qc.startsWith('su_')) url.searchParams.set('code', env.ADMIN_CODE);
    url.searchParams.delete('su');
    if (b) { b.code = env.ADMIN_CODE; return new Request(url.toString(), { method: 'POST', headers: request.headers, body: JSON.stringify(b) }); }
    return new Request(url.toString(), request);
  } catch (e) { return request; }
}

export default {
  scheduled: (event, env, ctx) => APP.scheduled(event, env, ctx),
  async fetch(request, env, ctx) {
    // http 로 들어온 사이트 주소는 https 로 넘긴다 — 검색엔진이 같은 글을 두 주소로 보지 않게
    if (request.method === 'GET' && request.url.startsWith('http://') && /^http:\/\/(www\.)?mindinside(\.kr|app\.com)\//.test(request.url)) return Response.redirect('https://' + request.url.slice(7), 301);
    if (request.method === 'OPTIONS' || !env.DB) return APP.fetch(request, env, ctx);
    request = await suSwap(request, env);
    const pth = new URL(request.url).pathname.replace(/^\/api/, '');
    if (!AUTHY.test(pth)) return APP.fetch(request, env, ctx);
    const ip = request.headers.get('cf-connecting-ip') || '?';
    const prefix = 'af:' + ip + ':';
    try {
      const c = await env.DB.prepare('SELECT COUNT(DISTINCT key) n FROM rate_hits WHERE key LIKE ? AND ts > ?').bind(prefix + '%', Date.now() - AUTH_FAIL_WINDOW).first();
      if (c && c.n >= AUTH_FAIL_MAX) {
        const origin = request.headers.get('Origin') || '*';
        return new Response(JSON.stringify({ error: 'locked', message: '잘못된 코드를 너무 많이 입력했어요. 10분 뒤에 다시 시도해주세요.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '600', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
        });
      }
    } catch (e) {}
    const cred = await credOf(request);
    const res = await APP.fetch(request, env, ctx);
    if (res.status === 403) {
      try { await env.DB.prepare('INSERT INTO rate_hits (key, ts) VALUES (?,?)').bind(prefix + cred, Date.now()).run(); } catch (e) {}
    }
    return res;
  }
};
