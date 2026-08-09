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

export default {
  async fetch(request, env) {
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

    // 상담사 마켓(D1)은 GET 도 받는다. 여기서 처리되지 않으면 null 이 와서
    //  아래 AI 경로로 흘러간다 — 두 기능이 한 Worker 를 쓰되 서로 모르게.
    if (!/^\/(tts|chat)?$/.test(path)) {
      const r = await handleMarket(request, env, cors, path);
      if (r) return r;
    }

    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
    if (!env.OPENAI_API_KEY) return json({ error: "Server not configured" }, 500, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Bad JSON" }, 400, cors); }

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

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  // OpenAI 응답을 그대로 전달 (클라이언트의 기존 파싱과 호환)
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
