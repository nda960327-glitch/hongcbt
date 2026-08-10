// 우렁의사 AI 프록시 (Cloudflare Worker)
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

const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o"];
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
import { resolveCounselor } from "./auth.js";
export { ChatHub } from "./hub.js";

// ── 남용 방어 ───────────────────────────────────────────────────────────
//  이 Worker 는 인증이 없다. 주소가 앱 JS 안에 그대로 있으니 누구나 긁어서
//  OpenAI 크레딧을 태울 수 있다. 공개 프록시는 발견되면 하루 만에 털린다.
//  계정을 요구하는 건 '가입 없음' 원칙과 충돌하므로 세 겹으로 막는다.
const LIMIT = {
  ip: 600,        // 한 IP 하루 (가족·공용 와이파이·통신사 NAT 를 감안해 넉넉히)
  client: 400,    // 한 기기 하루 (앱의 HARD_DAILY 와 같은 선)
  all: 300000     // 전체 하루 — 마지막 안전판. 이걸 넘으면 뭔가 잘못된 것이다
};

const utcDay = () => new Date().toISOString().slice(0, 10);

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
  if (!env.DB) return null;                    // DB 가 없으면 막지 않는다(서비스 우선)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const client = String((body && body.clientId) || '').slice(0, 64) || 'anon';
  try {
    const [nAll, nIp, nClient] = await bumpAll(env.DB, [
      ['all', 'total'], ['ip', ip], ['client', client]
    ]);
    if (nAll > LIMIT.all)       { await noteBlock(env.DB, 'all', 'total', nAll);   return 'all'; }
    if (nIp > LIMIT.ip)         { await noteBlock(env.DB, 'ip', ip, nIp);          return 'ip'; }
    if (nClient > LIMIT.client) { await noteBlock(env.DB, 'client', client, nClient); return 'client'; }
  } catch (e) { return null; }                 // 집계 실패로 서비스를 멈추지는 않는다
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    // CORS preflight
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const path = new URL(request.url).pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";

    // ── 실시간 웹소켓 (/ws?ch=cl:<clientId> | c:<counselorId>) ──────────
    //  받는 쪽이 8~15초 폴링을 기다리던 것을, 저장 즉시 밀어주는 것으로 바꾼다.
    //  상담사 채널은 자격증명으로 본인 확인 — 채널 이름만 알면 남의 대화를
    //  엿들을 수 있으면 안 된다. 내담자 채널은 기기 고유 clientId 가 곧 열쇠다
    //  (메시지 조회 GET 과 같은 신뢰 모델).
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
      if (!env.HUB) return json({ error: "no-hub" }, 503, cors);
      const stub = env.HUB.get(env.HUB.idFromName(ch));
      return stub.fetch("https://hub/connect", request);
    }

    // 상담사 마켓(D1)은 GET 도 받는다. 여기서 처리되지 않으면 null 이 와서
    //  아래 AI 경로로 흘러간다 — 두 기능이 한 Worker 를 쓰되 서로 모르게.
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
      return json({ error: { message: msg, reason: blocked } }, 429, cors);
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

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
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
