// 우렁의사 CBT AI 프록시 (Cloudflare Worker)
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
// -------------------------------------------------------------

const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o"];
const MAX_TOKENS_CAP = 800;
const MAX_MESSAGES = 40;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    // CORS preflight
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

    if (!env.OPENAI_API_KEY) return json({ error: "Server not configured" }, 500, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Bad JSON" }, 400, cors); }

    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || !messages.length) return json({ error: "messages required" }, 400, cors);

    // 남용 방지: 모델 화이트리스트 / 토큰·메시지 상한 / 온도 클램프
    const model = ALLOWED_MODELS.includes(body.model) ? body.model : "gpt-4o-mini";
    const max_tokens = Math.min(Number(body.max_tokens) || 600, MAX_TOKENS_CAP);
    const temperature = typeof body.temperature === "number"
      ? Math.max(0, Math.min(1.2, body.temperature)) : 0.75;
    const trimmed = messages.length > MAX_MESSAGES
      ? messages.slice(messages.length - MAX_MESSAGES) : messages;

    // 서버가 숨긴 키로 OpenAI 호출
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages: trimmed, temperature, max_tokens }),
    });

    // OpenAI 응답을 그대로 전달 (클라이언트의 기존 파싱과 호환)
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...(cors || {}), "Content-Type": "application/json" },
  });
}
