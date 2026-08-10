var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// auth.js
var LINK_TTL = 15 * 60 * 1e3;
var SESSION_TTL = 30 * 864e5;
var RATE = { perEmail: 5, windowMs: 36e5 };
var nowMs = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
function token(n) {
  const b = new Uint8Array(n || 32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
__name(token, "token");
var normEmail = /* @__PURE__ */ __name((e) => String(e || "").trim().toLowerCase().slice(0, 160), "normEmail");
var looksLikeEmail = /* @__PURE__ */ __name((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e), "looksLikeEmail");
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors || {} }
  });
}
__name(json, "json");
async function resolveCounselor(db, { session, code }) {
  if (session) {
    const s2 = await db.prepare(
      `SELECT c.id, c.name, c.hospital, c.email, c.available, c.busy_until, c.active, s.token
         FROM sessions s JOIN counselors c ON c.id = s.counselor_id
        WHERE s.token = ? AND s.expires > ? AND c.active = 1`
    ).bind(String(session).slice(0, 128), nowMs()).first();
    if (s2) {
      await db.prepare("UPDATE sessions SET last_seen = ? WHERE token = ?").bind(nowMs(), s2.token).run();
      return s2;
    }
    return null;
  }
  if (code) {
    return await db.prepare(
      "SELECT id, name, hospital, email, available, busy_until, active FROM counselors WHERE code = ? AND active = 1"
    ).bind(String(code).slice(0, 64)).first();
  }
  return null;
}
__name(resolveCounselor, "resolveCounselor");
var SENDER_NAME = "\uC6B0\uB801\uC758\uC0AC";
function rfc2047(name) {
  const bytes = new TextEncoder().encode(name);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return `=?UTF-8?B?${btoa(bin)}?=`;
}
__name(rfc2047, "rfc2047");
function pickAddress(env) {
  const raw = String(env.MAIL_FROM || "").trim().replace(/^["']|["']$/g, "");
  const m = raw.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  if (m) return { addr: m[0], src: "mail_from" };
  const host = String(env.APP_URL || "").replace(/^https?:\/\//, "").replace(/[/:].*$/, "").trim();
  if (/^[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(host)) return { addr: "noreply@" + host, src: "app_url" };
  return { addr: "", src: "none" };
}
__name(pickAddress, "pickAddress");
function encodeFrom(env) {
  const { addr } = pickAddress(env);
  if (!addr) return String(env.MAIL_FROM || "");
  return `${rfc2047(SENDER_NAME)} <${addr}>`;
}
__name(encodeFrom, "encodeFrom");
async function sendMail(env, to, link, name) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "no-api-key" };
  if (!pickAddress(env).addr) return { sent: false, reason: "no-from-address" };
  const html = `
<div style="font-family:'Noto Sans KR',-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#3f352a;">
  <p style="font-size:13px;letter-spacing:.08em;color:#8a7b68;margin:0 0 6px;">\uC6B0\uB801\uC758\uC0AC \uC0C1\uB2F4\uC0AC</p>
  <h1 style="font-size:20px;margin:0 0 14px;letter-spacing:-.02em;">${name ? name + " \uC120\uC0DD\uB2D8, " : ""}\uB85C\uADF8\uC778 \uB9C1\uD06C\uC785\uB2C8\uB2E4</h1>
  <p style="font-size:14px;line-height:1.75;margin:0 0 20px;">
    \uC544\uB798 \uBC84\uD2BC\uC744 \uB204\uB974\uBA74 \uC0C1\uB2F4\uC0AC \uD398\uC774\uC9C0\uB85C \uBC14\uB85C \uB4E4\uC5B4\uAC11\uB2C8\uB2E4.<br>
    \uC774 \uB9C1\uD06C\uB294 <b>15\uBD84 \uB4A4\uC5D0 \uB9CC\uB8CC</b>\uB418\uACE0, <b>\uD55C \uBC88\uB9CC</b> \uC4F8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
  <a href="${link}" style="display:inline-block;background:#4f8a6b;color:#fff;text-decoration:none;
     padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;">\uC0C1\uB2F4\uC0AC \uD398\uC774\uC9C0 \uC5F4\uAE30</a>
  <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:22px 0 0;">
    \uBC84\uD2BC\uC774 \uC548 \uB20C\uB9AC\uBA74 \uC774 \uC8FC\uC18C\uB97C \uBCF5\uC0AC\uD574 \uC5F4\uC5B4\uC8FC\uC138\uC694:<br>
    <span style="word-break:break-all;color:#4f8a6b;">${link}</span></p>
  <hr style="border:0;border-top:1px solid #e8ddcd;margin:22px 0 12px;">
  <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">
    \uC694\uCCAD\uD55C \uC801\uC774 \uC5C6\uB2E4\uBA74 \uC774 \uBA54\uC77C\uC740 \uADF8\uB0E5 \uBC84\uB9AC\uC154\uB3C4 \uB429\uB2C8\uB2E4. \uC544\uBB34 \uC77C\uB3C4 \uC77C\uC5B4\uB098\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.<br>
    \uC774 \uB9C1\uD06C\uB97C \uB2E4\uB978 \uC0AC\uB78C\uC5D0\uAC8C \uC804\uB2EC\uD558\uC9C0 \uB9C8\uC138\uC694 \u2014 \uC5F4\uB78C \uAD8C\uD55C\uC774 \uADF8\uB300\uB85C \uB118\uC5B4\uAC11\uB2C8\uB2E4.</p>
</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: encodeFrom(env),
        to: [to],
        subject: "\uC6B0\uB801\uC758\uC0AC \uC0C1\uB2F4\uC0AC \uB85C\uADF8\uC778 \uB9C1\uD06C (15\uBD84 \uC720\uD6A8)",
        html
      })
    });
    if (r.ok) return { sent: true, reason: "" };
    let detail = "";
    try {
      detail = (await r.text()).slice(0, 220);
    } catch (e) {
    }
    const pick = pickAddress(env);
    detail += " | addr-src=" + pick.src + " domain=" + (pick.addr.split("@")[1] || "-");
    return { sent: false, reason: "http-" + r.status, detail };
  } catch (e) {
    return { sent: false, reason: "network", detail: String(e && e.message || e).slice(0, 200) };
  }
}
__name(sendMail, "sendMail");
async function sendApplyReceipt(env, db, to, name) {
  if (!env.RESEND_API_KEY || !to) return { sent: false, reason: "no-api-key" };
  if (!pickAddress(env).addr) return { sent: false, reason: "no-from-address" };
  const html = `
<div style="font-family:'Noto Sans KR',-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#3f352a;">
  <p style="font-size:13px;letter-spacing:.08em;color:#8a7b68;margin:0 0 6px;">\uC6B0\uB801\uC758\uC0AC</p>
  <h1 style="font-size:20px;margin:0 0 14px;letter-spacing:-.02em;">${name ? name + " \uC120\uC0DD\uB2D8, " : ""}\uC785\uC810 \uC2E0\uCCAD\uC774 \uC811\uC218\uB410\uC2B5\uB2C8\uB2E4</h1>
  <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">
    \uBCF4\uB0B4\uC8FC\uC2E0 \uC790\uACA9\uACFC \uC18C\uC18D \uAE30\uAD00\uC744 \uD655\uC778\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.<br>
    <b>2~3\uC77C \uC548\uC5D0</b> \uC2B9\uC778 \uC5EC\uBD80\uB97C \uC774 \uC8FC\uC18C\uB85C \uC54C\uB824\uB4DC\uB9B4\uAC8C\uC694.</p>
  <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
    <p style="font-size:13px;font-weight:700;margin:0 0 8px;color:#3f352a;">\uC2B9\uC778\uB418\uBA74 \uC774\uB807\uAC8C \uC9C4\uD589\uB3FC\uC694</p>
    <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0;">
      1. \uC774 \uC8FC\uC18C\uB85C <b>\uC0C1\uB2F4\uC0AC \uC571 \uB85C\uADF8\uC778 \uCF54\uB4DC</b>\uAC00 \uB3C4\uCC29\uD569\uB2C8\uB2E4<br>
      2. \uC6B0\uB801\uC758\uC0AC \uD504\uB85C\uC5D0\uC11C \uCF54\uB4DC\uB97C \uD55C \uBC88 \uB123\uC73C\uBA74 \uADF8 \uAE30\uAE30\uC5D0\uC11C \uACC4\uC18D \uC5F4\uB824\uC694<br>
      3. \uC608\uC57D \uAC00\uB2A5 \uC2DC\uAC04\uACFC \uC815\uC0B0 \uACC4\uC88C\uB97C \uD655\uC778\uD558\uBA74 \uC0C1\uB2F4\uC744 \uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4</p>
  </div>
  <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">
    \uC11C\uB958 \uBCF4\uC644\uC774 \uD544\uC694\uD558\uBA74 \uC0AC\uC720\uC640 \uD568\uAED8 \uC54C\uB824\uB4DC\uB9BD\uB2C8\uB2E4. \uBCF4\uC644 \uD6C4 \uB2E4\uC2DC \uC2E0\uCCAD\uD558\uC2E4 \uC218 \uC788\uC5B4\uC694.</p>
  <hr style="border:0;border-top:1px solid #e8ddcd;margin:22px 0 12px;">
  <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">
    \uC2E0\uCCAD\uD55C \uC801\uC774 \uC5C6\uB2E4\uBA74 \uC774 \uBA54\uC77C\uC740 \uADF8\uB0E5 \uBC84\uB9AC\uC154\uB3C4 \uB429\uB2C8\uB2E4.<br>
    \uBB38\uC758: <a href="mailto:help@neurumind.com" style="color:#4f8a6b;">help@neurumind.com</a></p>
</div>`;
  let res;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: encodeFrom(env),
        to: [to],
        subject: "[\uC6B0\uB801\uC758\uC0AC] \uC785\uC810 \uC2E0\uCCAD\uC774 \uC811\uC218\uB410\uC2B5\uB2C8\uB2E4",
        html
      })
    });
    if (r.ok) res = { sent: true, reason: "" };
    else {
      let detail = "";
      try {
        detail = (await r.text()).slice(0, 220);
      } catch (e) {
      }
      res = { sent: false, reason: "http-" + r.status, detail };
    }
  } catch (e) {
    res = { sent: false, reason: "network", detail: String(e && e.message || e).slice(0, 200) };
  }
  if (db) await logMail(db, to, res);
  return res;
}
__name(sendApplyReceipt, "sendApplyReceipt");
async function sendCodeMail(env, db, to, name, code, appUrl) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "no-api-key" };
  const { addr } = pickAddress(env);
  if (!addr) return { sent: false, reason: "no-from-address" };
  const base = String(appUrl || env.APP_URL || "").replace(/\/+$/, "");
  const proLink = String(env.PRO_URL || base + "/counselor.html").replace(/\/+$/, "") || "#";
  const html = `
<div style="font-family:'Noto Sans KR',-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px 22px;color:#3f352a;">
  <p style="font-size:13px;letter-spacing:.08em;color:#8a7b68;margin:0 0 6px;">\uC6B0\uB801\uC758\uC0AC</p>
  <h1 style="font-size:20px;margin:0 0 14px;letter-spacing:-.02em;">${name ? name + " \uC120\uC0DD\uB2D8, " : ""}\uC785\uC810\uC774 \uC2B9\uC778\uB410\uC2B5\uB2C8\uB2E4</h1>
  <p style="font-size:14px;line-height:1.75;margin:0 0 18px;">
    \uC544\uB798 \uC8FC\uC18C\uB85C \uB4E4\uC5B4\uAC00 \uCF54\uB4DC\uB97C \uC785\uB825\uD558\uC2DC\uBA74 \uC0C1\uB2F4\uC0AC \uD398\uC774\uC9C0\uAC00 \uC5F4\uB9BD\uB2C8\uB2E4.<br>
    \uD55C \uBC88 \uC785\uB825\uD558\uBA74 \uADF8 \uAE30\uAE30\uC5D0\uC11C\uB294 \uACC4\uC18D \uC5F4\uB824 \uC788\uC5B4\uC694.</p>
  <p style="margin:0 0 6px;font-size:13px;color:#8a7b68;">\uB0B4 \uC5F4\uB78C \uCF54\uB4DC</p>
  <p style="margin:0 0 18px;font-size:20px;font-weight:800;letter-spacing:.06em;
     background:#f2ece1;border-radius:10px;padding:12px 16px;display:inline-block;">${code}</p>
  <p style="margin:0 0 20px;">
    <a href="${proLink}" style="display:inline-block;background:#4f8a6b;color:#fff;
       text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;">\uC0C1\uB2F4\uC0AC \uD398\uC774\uC9C0 \uC5F4\uAE30</a></p>
  <p style="font-size:13px;line-height:1.8;color:#3f352a;margin:0 0 4px;"><b>\uC5EC\uAE30\uC11C \uD558\uC2E4 \uC218 \uC788\uB294 \uAC83</b></p>
  <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">
    \uC608\uC57D \uAC00\uB2A5 \uC2DC\uAC04 \uC124\uC815 \xB7 \uB0B4 \uC815\uBCF4 \uC218\uC815 \xB7 \uC815\uC0B0 \uACC4\uC88C \uB4F1\uB85D<br>
    \uC608\uC57D \uD655\uC778\uACFC \uC0C1\uB2F4 \uC644\uB8CC \uCC98\uB9AC \xB7 \uB0B4\uB2F4\uC790\uC5D0\uAC8C \uC219\uC81C \uB0B4\uC8FC\uAE30 \xB7 \uBC1B\uC740 \uC0C1\uB2F4 \uC790\uB8CC \uC5F4\uB78C</p>
  <hr style="border:0;border-top:1px solid #e8ddcd;margin:18px 0 12px;">
  <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">
    \uC774 \uCF54\uB4DC\uB294 \uBE44\uBC00\uBC88\uD638\uC640 \uAC19\uC2B5\uB2C8\uB2E4. \uB2E8\uD1A1\uBC29\uC774\uB098 \uBA54\uC2E0\uC800\uC5D0 \uC62C\uB9AC\uC9C0 \uB9C8\uC138\uC694.<br>
    \uCF54\uB4DC\uAC00 \uC0CC \uAC83 \uAC19\uC73C\uBA74 \uBC14\uB85C \uC54C\uB824\uC8FC\uC138\uC694 \u2014 \uC0C8\uB85C \uBC1C\uAE09\uD574 \uB4DC\uB9BD\uB2C8\uB2E4.<br>
    \uCF54\uB4DC\uB97C \uC783\uC5B4\uBC84\uB9AC\uBA74 \uC0C1\uB2F4\uC0AC \uD398\uC774\uC9C0\uC5D0\uC11C '\uCF54\uB4DC\uB97C \uC783\uC5B4\uBC84\uB838\uC5B4\uC694'\uB85C \uB2E4\uC2DC \uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: encodeFrom(env),
        to: [to],
        subject: "\uC6B0\uB801\uC758\uC0AC \uC785\uC810 \uC2B9\uC778 \xB7 \uC0C1\uB2F4\uC0AC \uD398\uC774\uC9C0 \uC811\uC18D \uCF54\uB4DC",
        html
      })
    });
    const res = r.ok ? { sent: true, reason: "" } : { sent: false, reason: "http-" + r.status, detail: (await r.text()).slice(0, 220) };
    await logMail(db, to, res);
    return res;
  } catch (e) {
    const res = { sent: false, reason: "network", detail: String(e && e.message || e).slice(0, 200) };
    await logMail(db, to, res);
    return res;
  }
}
__name(sendCodeMail, "sendCodeMail");
var maskMail = /* @__PURE__ */ __name((e) => {
  const s2 = String(e || "");
  const i = s2.indexOf("@");
  if (i < 1) return "***";
  return s2[0] + "*".repeat(Math.max(1, i - 1)) + s2.slice(i);
}, "maskMail");
async function logMail(db, to, res) {
  try {
    await db.prepare(
      "INSERT INTO mail_log (id, addr, ok, reason, detail, ts) VALUES (?,?,?,?,?,?)"
    ).bind(
      "ml_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      maskMail(to),
      res.sent ? 1 : 0,
      res.reason || "",
      res.detail || "",
      nowMs()
    ).run();
    await db.prepare("DELETE FROM mail_log WHERE ts < ?").bind(nowMs() - 30 * 864e5).run();
  } catch (e) {
  }
}
__name(logMail, "logMail");
async function handleAuth(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json({ error: "db-not-bound" }, 503, cors);
  if (path === "/auth/request" && request.method === "POST") {
    const email = normEmail(body.email);
    const generic = { ok: true, message: "\uB4F1\uB85D\uB41C \uC8FC\uC18C\uB77C\uBA74 \uB85C\uADF8\uC778 \uB9C1\uD06C\uB97C \uBCF4\uB0C8\uC5B4\uC694. \uBA54\uC77C\uD568\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694." };
    if (!looksLikeEmail(email)) return json(generic, 200, cors);
    const since = nowMs() - RATE.windowMs;
    const cnt = await db.prepare("SELECT COUNT(*) n FROM login_attempts WHERE email = ? AND ts > ?").bind(email, since).first();
    if ((cnt && cnt.n) >= RATE.perEmail) {
      return json({ ok: true, message: "\uC870\uAE08 \uB4A4\uC5D0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694. (\uC694\uCCAD\uC774 \uB9CE\uC558\uC5B4\uC694)" }, 200, cors);
    }
    await db.prepare("INSERT INTO login_attempts (email, ts) VALUES (?,?)").bind(email, nowMs()).run();
    await db.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(since).run();
    const c = await db.prepare("SELECT id, name FROM counselors WHERE email = ? AND active = 1").bind(email).first();
    if (!c) return json(generic, 200, cors);
    const t = token(32);
    await db.prepare(
      "INSERT INTO login_tokens (token, counselor_id, expires, used_at, created) VALUES (?,?,?,0,?)"
    ).bind(t, c.id, nowMs() + LINK_TTL, nowMs()).run();
    const base = (env.APP_URL || url.origin).replace(/\/+$/, "");
    const proBase = (env.PRO_URL || base + "/counselor.html").replace(/\/+$/, "");
    const link = /counselor\.html$/.test(proBase) ? `${proBase}?t=${t}` : `${proBase}/?t=${t}`;
    const mail = await sendMail(env, email, link, c.name);
    await logMail(db, email, mail);
    return json(generic, 200, cors);
  }
  if (path === "/auth/verify" && request.method === "POST") {
    const t = String(body.t || "").slice(0, 128);
    if (!t) return json({ error: "no-token" }, 400, cors);
    const row = await db.prepare(
      "SELECT token, counselor_id, expires, used_at FROM login_tokens WHERE token = ?"
    ).bind(t).first();
    if (!row) return json({ error: "invalid" }, 403, cors);
    if (row.used_at) return json({ error: "used" }, 403, cors);
    if (row.expires < nowMs()) return json({ error: "expired" }, 403, cors);
    await db.prepare("UPDATE login_tokens SET used_at = ? WHERE token = ?").bind(nowMs(), t).run();
    const c = await db.prepare("SELECT id, name FROM counselors WHERE id = ? AND active = 1").bind(row.counselor_id).first();
    if (!c) return json({ error: "inactive" }, 403, cors);
    const st = token(32);
    await db.prepare(
      "INSERT INTO sessions (token, counselor_id, expires, created, last_seen, agent) VALUES (?,?,?,?,?,?)"
    ).bind(
      st,
      c.id,
      nowMs() + SESSION_TTL,
      nowMs(),
      nowMs(),
      String(request.headers.get("user-agent") || "").slice(0, 160)
    ).run();
    await db.prepare("DELETE FROM login_tokens WHERE expires < ?").bind(nowMs() - 864e5).run();
    await db.prepare("DELETE FROM sessions WHERE expires < ?").bind(nowMs()).run();
    return json({ ok: true, session: st, name: c.name, id: c.id }, 200, cors);
  }
  if (path === "/auth/logout" && request.method === "POST") {
    const st = String(body.session || "").slice(0, 128);
    if (st) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(st).run();
    return json({ ok: true }, 200, cors);
  }
  if (path === "/auth/me" && request.method === "GET") {
    const st = url.searchParams.get("session") || "";
    const me = await resolveCounselor(db, { session: st });
    if (!me) return json({ error: "no-session" }, 403, cors);
    return json({ ok: true, id: me.id, name: me.name, email: me.email }, 200, cors);
  }
  if (path === "/auth/logout-others" && request.method === "POST") {
    const st = String(body.session || "").slice(0, 128);
    const me = await resolveCounselor(db, { session: st });
    if (!me) return json({ error: "no-session" }, 403, cors);
    await db.prepare("DELETE FROM sessions WHERE counselor_id = ? AND token != ?").bind(me.id, st).run();
    return json({ ok: true }, 200, cors);
  }
  return null;
}
__name(handleAuth, "handleAuth");

// push.js
var TTL = 60;
var MAX_FAIL = 3;
var enc = new TextEncoder();
function b64u(buf) {
  const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s2 = "";
  for (let i = 0; i < b.length; i++) s2 += String.fromCharCode(b[i]);
  return btoa(s2).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64u, "b64u");
function b64uToBuf(s2) {
  const pad = "=".repeat((4 - s2.length % 4) % 4);
  const raw = atob((s2 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
__name(b64uToBuf, "b64uToBuf");
function json2(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors || {} }
  });
}
__name(json2, "json");
var KEY = null;
async function signKey(env) {
  if (KEY) return KEY;
  if (!env.VAPID_PRIVATE) return null;
  try {
    KEY = await crypto.subtle.importKey(
      "pkcs8",
      b64uToBuf(env.VAPID_PRIVATE).buffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch (e) {
    KEY = null;
  }
  return KEY;
}
__name(signKey, "signKey");
async function vapidAuth(env, endpoint) {
  const key2 = await signKey(env);
  if (!key2 || !env.VAPID_PUBLIC) return "";
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claim = b64u(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1e3) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:help@neurumind.com"
  })));
  const unsigned = head + "." + claim;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key2, enc.encode(unsigned));
  return "vapid t=" + unsigned + "." + b64u(sig) + ", k=" + env.VAPID_PUBLIC;
}
__name(vapidAuth, "vapidAuth");
async function pushOne(env, db, row) {
  const auth = await vapidAuth(env, row.endpoint);
  if (!auth) return "no-key";
  let res;
  try {
    res = await fetch(row.endpoint, {
      method: "POST",
      headers: { "Authorization": auth, "TTL": String(TTL), "Urgency": "high", "Content-Length": "0" }
    });
  } catch (e) {
    return "net";
  }
  if (res.status === 404 || res.status === 410) {
    await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(row.endpoint).run();
    return "gone";
  }
  if (res.status >= 200 && res.status < 300) {
    if (row.fail_count) await db.prepare("UPDATE push_subs SET fail_count = 0 WHERE endpoint = ?").bind(row.endpoint).run();
    return "ok";
  }
  const n = (row.fail_count || 0) + 1;
  if (n >= MAX_FAIL) await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(row.endpoint).run();
  else await db.prepare("UPDATE push_subs SET fail_count = ? WHERE endpoint = ?").bind(n, row.endpoint).run();
  return "http-" + res.status;
}
__name(pushOne, "pushOne");
async function notifyCounselor(env, counselorId) {
  const db = env.DB;
  if (!db || !counselorId || !env.VAPID_PRIVATE) return { sent: 0 };
  let rows = [];
  try {
    const r = await db.prepare(
      "SELECT endpoint, fail_count FROM push_subs WHERE counselor_id = ? LIMIT 8"
    ).bind(String(counselorId)).all();
    rows = r && r.results || [];
  } catch (e) {
    return { sent: 0 };
  }
  const out = await Promise.all(rows.map((r) => pushOne(env, db, r).catch(() => "err")));
  return { sent: out.filter((x) => x === "ok").length, total: rows.length, results: out };
}
__name(notifyCounselor, "notifyCounselor");
async function notifyClient(env, clientId) {
  if (!clientId) return { sent: 0 };
  return notifyCounselor(env, "cl:" + String(clientId).slice(0, 64));
}
__name(notifyClient, "notifyClient");
async function handlePush(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json2({ error: "db-not-bound" }, 503, cors);
  const method = request.method;
  if (path === "/push/subscribe" && method === "POST") {
    const me = await resolveCounselor(db, {
      session: String(body.session || "").slice(0, 128),
      code: String(body.code || "").slice(0, 64)
    });
    if (!me) return json2({ error: "bad-code" }, 403, cors);
    const counselorId = me.id;
    const sub = body.sub || {};
    const endpoint = String(sub.endpoint || "").slice(0, 900);
    if (!/^https:\/\//.test(endpoint)) return json2({ error: "missing" }, 400, cors);
    const keys = sub.keys || {};
    await db.prepare(
      `INSERT INTO push_subs (endpoint, counselor_id, p256dh, auth, created_at, fail_count)
       VALUES (?,?,?,?,?,0)
       ON CONFLICT(endpoint) DO UPDATE SET counselor_id = excluded.counselor_id, fail_count = 0`
    ).bind(
      endpoint,
      counselorId,
      String(keys.p256dh || "").slice(0, 200),
      String(keys.auth || "").slice(0, 100),
      Date.now()
    ).run();
    return json2({ ok: true }, 200, cors);
  }
  if (path === "/push/client-subscribe" && method === "POST") {
    const clientId = String(body.clientId || "").slice(0, 64).replace(/[^\w-]/g, "");
    const sub = body.sub || {};
    const endpoint = String(sub.endpoint || "").slice(0, 900);
    if (!clientId || !/^https:\/\//.test(endpoint)) return json2({ error: "missing" }, 400, cors);
    const keys = sub.keys || {};
    await db.prepare(
      `INSERT INTO push_subs (endpoint, counselor_id, p256dh, auth, created_at, fail_count)
       VALUES (?,?,?,?,?,0)
       ON CONFLICT(endpoint) DO UPDATE SET counselor_id = excluded.counselor_id, fail_count = 0`
    ).bind(
      endpoint,
      "cl:" + clientId,
      String(keys.p256dh || "").slice(0, 200),
      String(keys.auth || "").slice(0, 100),
      Date.now()
    ).run();
    return json2({ ok: true }, 200, cors);
  }
  if (path === "/push/unsubscribe" && method === "POST") {
    const endpoint = String(body.sub && body.sub.endpoint || body.endpoint || "").slice(0, 900);
    if (endpoint) await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run();
    return json2({ ok: true }, 200, cors);
  }
  if (path === "/push/test" && method === "POST") {
    const me = await resolveCounselor(db, {
      session: String(body.session || "").slice(0, 128),
      code: String(body.code || "").slice(0, 64)
    });
    if (!me) return json2({ error: "bad-code" }, 403, cors);
    const r = await notifyCounselor(env, me.id);
    return json2({ ok: true, ...r, configured: !!env.VAPID_PRIVATE }, 200, cors);
  }
  return null;
}
__name(handlePush, "handlePush");

// rtc.js
var SIGNAL_TTL = 10 * 60 * 1e3;
var RING_TIMEOUT = 60 * 1e3;
var MAX_CALL_MS = 90 * 60 * 1e3;
var nowMs2 = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
var rid = /* @__PURE__ */ __name((p) => p + "_" + nowMs2().toString(36) + Math.random().toString(36).slice(2, 8), "rid");
function json3(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors || {} }
  });
}
__name(json3, "json");
var roomOf = /* @__PURE__ */ __name((counselorId, clientId) => "r_" + counselorId + "__" + clientId, "roomOf");
function billFor(rate, ms) {
  if (!rate || ms <= 0) return 0;
  return Math.ceil(ms / 3e4) * rate;
}
__name(billFor, "billFor");
function pushCallState(env, ctx, counselorId, clientId, state, extra) {
  if (!env.HUB || !ctx || !ctx.waitUntil) return;
  const evt = JSON.stringify({ type: "call-state", counselorId, clientId, state, ...extra || {} });
  const pub = /* @__PURE__ */ __name((ch) => env.HUB.get(env.HUB.idFromName(ch)).fetch("https://hub/publish", { method: "POST", body: evt }).catch(() => {
  }), "pub");
  ctx.waitUntil(Promise.all([pub("c:" + counselorId), pub("cl:" + clientId)]));
}
__name(pushCallState, "pushCallState");
async function logCallToChat(db, env, ctx, call, line, sender) {
  const t = nowMs2();
  const cmId = rid("cm");
  try {
    await db.prepare(
      `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(cmId, call.counselor_id, "", call.client_id, "", sender, "[\uD1B5\uD654] " + line, t).run();
  } catch (e) {
    return;
  }
  if (env.HUB && ctx && ctx.waitUntil) {
    const evt = JSON.stringify({
      type: "chat",
      msg: {
        id: cmId,
        counselorId: call.counselor_id,
        counselorName: "",
        clientId: call.client_id,
        clientName: "",
        from: sender,
        text: "[\uD1B5\uD654] " + line,
        ts: t
      }
    });
    const pub = /* @__PURE__ */ __name((ch) => env.HUB.get(env.HUB.idFromName(ch)).fetch("https://hub/publish", { method: "POST", body: evt }).catch(() => {
    }), "pub");
    ctx.waitUntil(Promise.all([pub("c:" + call.counselor_id), pub("cl:" + call.client_id)]));
  }
}
__name(logCallToChat, "logCallToChat");
async function handleRtc(request, env, cors, path, body, url, ctx) {
  const db = env.DB;
  if (!db) return json3({ error: "db-not-bound" }, 503, cors);
  const q = /* @__PURE__ */ __name((k) => url.searchParams.get(k) || "", "q");
  const method = request.method;
  const s2 = /* @__PURE__ */ __name((v, n) => String(v == null ? "" : v).slice(0, n || 64), "s");
  if (path === "/rtc/ice" && method === "GET") {
    const servers = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
    let turn = false;
    let dbg = "";
    if (env.CF_TURN_KEY_ID && env.CF_TURN_KEY_TOKEN) {
      try {
        const now = Date.now();
        if (!globalThis.__turnCache || globalThis.__turnCache.exp < now) {
          const call = /* @__PURE__ */ __name((ep) => fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/${ep}`,
            {
              method: "POST",
              headers: { "Authorization": `Bearer ${env.CF_TURN_KEY_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ ttl: 3600 })
            }
          ), "call");
          let r = await call("generate-ice-servers");
          dbg = "new:" + r.status;
          if (!r.ok) {
            r = await call("generate");
            dbg += " old:" + r.status;
          }
          if (r.ok) {
            const d = await r.json();
            const list = Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
            globalThis.__turnCache = { servers: list, exp: now + 30 * 6e4 };
          }
        }
        if (globalThis.__turnCache && globalThis.__turnCache.servers.length) {
          for (const s3 of globalThis.__turnCache.servers) servers.push(s3);
          turn = true;
        }
      } catch (e) {
        dbg += " err:" + String(e && e.message).slice(0, 60);
      }
    } else {
      dbg = "no-secrets";
    }
    if (!turn && env.TURN_URL && env.TURN_USER && env.TURN_CRED) {
      servers.push({
        urls: String(env.TURN_URL).split(",").map((x) => x.trim()).filter(Boolean),
        username: env.TURN_USER,
        credential: env.TURN_CRED
      });
      turn = true;
    }
    return json3(q("debug") ? { iceServers: servers, turn, dbg } : { iceServers: servers, turn }, 200, cors);
  }
  if (path === "/rtc/start" && method === "POST") {
    const counselorId = s2(body.counselorId), clientId = s2(body.clientId);
    if (!counselorId || !clientId) return json3({ error: "missing" }, 400, cors);
    const c = await db.prepare(
      "SELECT id, name, active FROM counselors WHERE id = ? AND active = 1"
    ).bind(counselorId).first();
    if (!c) return json3({ error: "\uC9C0\uAE08\uC740 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4\uC694" }, 404, cors);
    const room = roomOf(counselorId, clientId);
    const mine = await db.prepare(
      "SELECT * FROM calls WHERE room = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1"
    ).bind(room).first();
    if (mine) return json3({ ok: true, room, callId: mine.id, resumed: true }, 200, cors);
    const t = nowMs2();
    const lock = await db.prepare(
      "UPDATE counselors SET busy_until = ? WHERE id = ? AND (busy_until IS NULL OR busy_until <= ?)"
    ).bind(t + MAX_CALL_MS, counselorId, t).run();
    const won = lock && lock.meta && lock.meta.changes > 0;
    if (!won) {
      const busy = await db.prepare(
        "SELECT connect_at, ring_at FROM calls WHERE counselor_id = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1"
      ).bind(counselorId).first();
      return json3({
        error: "busy",
        message: busy && busy.connect_at ? `${c.name} \uC120\uC0DD\uB2D8\uC774 \uC9C0\uAE08 \uB2E4\uB978 \uBD84\uACFC \uC0C1\uB2F4 \uC911\uC774\uC5D0\uC694.` : `${c.name} \uC120\uC0DD\uB2D8\uC774 \uC9C0\uAE08 \uD1B5\uD654 \uC5F0\uACB0 \uC911\uC774\uC5D0\uC694.`,
        canQueue: true
      }, 409, cors);
    }
    const id = rid("call");
    await db.prepare(
      "INSERT INTO calls (id, room, counselor_id, client_id, booking_id, rate, ring_at, dir) VALUES (?,?,?,?,?,?,?,'to-counselor')"
    ).bind(id, room, counselorId, clientId, s2(body.bookingId), Math.max(0, Number(body.rate) || 0), t).run();
    const wake = notifyCounselor(env, counselorId).catch(() => {
    });
    if (ctx && ctx.waitUntil) ctx.waitUntil(wake);
    else await wake;
    pushCallState(env, ctx, counselorId, clientId, "ringing", { callId: id, room });
    return json3({ ok: true, room, callId: id }, 200, cors);
  }
  if (path === "/rtc/start-c2c" && method === "POST") {
    const me = await resolveCounselor(db, {
      session: s2(body.session, 128),
      code: s2(body.code, 64)
    });
    if (!me) return json3({ error: "bad-code" }, 403, cors);
    const clientId = s2(body.clientId);
    if (!clientId) return json3({ error: "missing" }, 400, cors);
    const knows = await db.prepare(
      "SELECT id FROM chat_msgs WHERE counselor_id = ? AND client_id = ? LIMIT 1"
    ).bind(me.id, clientId).first() || await db.prepare("SELECT id FROM bookings WHERE counselor_id = ? AND client_id = ? LIMIT 1").bind(me.id, clientId).first().catch(() => null);
    if (!knows) return json3({ error: "\uB300\uD654\uD55C \uC801 \uC788\uB294 \uB0B4\uB2F4\uC790\uC5D0\uAC8C\uB9CC \uAC78 \uC218 \uC788\uC5B4\uC694" }, 403, cors);
    const room = roomOf(me.id, clientId);
    const mine = await db.prepare(
      "SELECT * FROM calls WHERE room = ? AND end_at = 0 ORDER BY ring_at DESC LIMIT 1"
    ).bind(room).first();
    if (mine) return json3({ ok: true, room, callId: mine.id, resumed: true }, 200, cors);
    const t = nowMs2();
    const id = rid("call");
    await db.prepare(
      "INSERT INTO calls (id, room, counselor_id, client_id, booking_id, rate, ring_at, dir) VALUES (?,?,?,?,?,0,?,'to-client')"
    ).bind(id, room, me.id, clientId, "", t).run();
    const wake = notifyClient(env, clientId).catch(() => {
    });
    if (ctx && ctx.waitUntil) ctx.waitUntil(wake);
    else await wake;
    pushCallState(env, ctx, me.id, clientId, "ringing", { callId: id, room, from: "counselor", counselorName: me.name });
    return json3({ ok: true, room, callId: id }, 200, cors);
  }
  if (path === "/rtc/incoming-client" && method === "GET") {
    const cid = s2(q("clientId"));
    if (!cid) return json3({ call: null }, 200, cors);
    const t = nowMs2();
    try {
      const stale = await db.prepare(
        "SELECT id, room, counselor_id, client_id FROM calls WHERE client_id = ? AND dir = 'to-client' AND end_at = 0 AND connect_at = 0 AND ring_at <= ?"
      ).bind(cid, t - RING_TIMEOUT).all();
      for (const x of stale.results || []) {
        await db.prepare("UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE id = ?").bind(t, x.id).run();
        await db.prepare("DELETE FROM rtc_signals WHERE room = ?").bind(x.room).run();
        await logCallToChat(db, env, ctx, x, "\uBD80\uC7AC\uC911 \uC804\uD654 \u2014 \uC0C1\uB2F4\uC0AC\uB2D8\uC774 \uC804\uD654\uD588\uC5C8\uC5B4\uC694", "counselor");
      }
    } catch (e) {
    }
    const r = await db.prepare(
      "SELECT c.*, k.name AS cname FROM calls c LEFT JOIN counselors k ON k.id = c.counselor_id WHERE c.client_id = ? AND c.dir = 'to-client' AND c.end_at = 0 AND c.connect_at = 0 AND c.ring_at > ? ORDER BY c.ring_at DESC LIMIT 1"
    ).bind(cid, t - RING_TIMEOUT).first();
    if (!r) return json3({ call: null }, 200, cors);
    return json3({ call: { id: r.id, room: r.room, counselorId: r.counselor_id, counselorName: r.cname || "\uC0C1\uB2F4\uC0AC", ringAt: r.ring_at } }, 200, cors);
  }
  if (path === "/rtc/incoming" && method === "GET") {
    const me = await resolveCounselor(db, {
      session: s2(q("session"), 128),
      code: s2(q("code"), 64)
    });
    if (!me) return json3({ call: null, error: "bad-code" }, 403, cors);
    const counselorId = me.id;
    const t = nowMs2();
    try {
      const stale = await db.prepare(
        "SELECT id, room, counselor_id, client_id FROM calls WHERE counselor_id = ? AND dir != 'to-client' AND end_at = 0 AND connect_at = 0 AND ring_at <= ?"
      ).bind(counselorId, t - RING_TIMEOUT).all();
      for (const x of stale.results || []) {
        await db.prepare("UPDATE calls SET end_at = ?, end_by = 'timeout', billed = 0 WHERE id = ?").bind(t, x.id).run();
        await db.prepare("DELETE FROM rtc_signals WHERE room = ?").bind(x.room).run();
        await logCallToChat(db, env, ctx, x, "\uBD80\uC7AC\uC911 \uC804\uD654 (\uBC1B\uC9C0 \uC54A\uC558\uC5B4\uC694)", "client");
      }
      if ((stale.results || []).length) {
        await db.prepare("UPDATE counselors SET busy_until = 0 WHERE id = ?").bind(counselorId).run();
      }
    } catch (e) {
    }
    const r = await db.prepare(
      "SELECT * FROM calls WHERE counselor_id = ? AND dir != 'to-client' AND end_at = 0 AND connect_at = 0 AND ring_at > ? ORDER BY ring_at DESC LIMIT 1"
    ).bind(counselorId, t - RING_TIMEOUT).first();
    if (!r) return json3({ call: null }, 200, cors);
    return json3({
      call: { id: r.id, room: r.room, clientId: r.client_id, bookingId: r.booking_id, ringAt: r.ring_at }
    }, 200, cors);
  }
  if (path === "/rtc/connected" && method === "POST") {
    const id = s2(body.callId, 80);
    await db.prepare("UPDATE calls SET connect_at = ? WHERE id = ? AND connect_at = 0").bind(nowMs2(), id).run();
    const r = await db.prepare("SELECT counselor_id, client_id, connect_at, rate FROM calls WHERE id = ?").bind(id).first();
    if (r) pushCallState(env, ctx, r.counselor_id, r.client_id, "connected", { callId: id });
    return json3({ ok: true, connectAt: r ? r.connect_at : 0, rate: r ? r.rate : 0 }, 200, cors);
  }
  if (path === "/rtc/state" && method === "GET") {
    const id = s2(q("callId"), 80);
    const r = await db.prepare("SELECT * FROM calls WHERE id = ?").bind(id).first();
    if (!r) return json3({ error: "not-found" }, 404, cors);
    const live = r.end_at ? 0 : r.connect_at ? nowMs2() - r.connect_at : 0;
    return json3({
      id: r.id,
      connected: !!r.connect_at,
      ended: !!r.end_at,
      endBy: r.end_by || "",
      rate: r.rate,
      elapsedMs: r.end_at ? r.end_at - (r.connect_at || r.end_at) : live,
      billed: r.billed
    }, 200, cors);
  }
  if (path === "/rtc/end" && method === "POST") {
    const id = s2(body.callId, 80);
    const r = await db.prepare("SELECT * FROM calls WHERE id = ?").bind(id).first();
    if (!r) return json3({ error: "not-found" }, 404, cors);
    if (r.end_at) return json3({ ok: true, billed: r.billed, already: true }, 200, cors);
    const t = nowMs2();
    const ms = r.connect_at ? t - r.connect_at : 0;
    const billed = billFor(r.rate, ms);
    const by = s2(body.by, 20) || "client";
    await db.prepare("UPDATE calls SET end_at = ?, end_by = ?, billed = ? WHERE id = ?").bind(t, by, billed, id).run();
    await db.prepare("UPDATE counselors SET busy_until = 0 WHERE id = ?").bind(r.counselor_id).run();
    await db.prepare("DELETE FROM rtc_signals WHERE room = ?").bind(r.room).run();
    const mm = Math.floor(ms / 6e4), ss = Math.round(ms % 6e4 / 1e3);
    const line = !r.connect_at ? by === "counselor" ? "\uBD80\uC7AC\uC911 \uC804\uD654 \u2014 \uC0C1\uB2F4\uC0AC\uAC00 \uC9C0\uAE08 \uBC1B\uAE30 \uC5B4\uB824\uC6CC\uC694" : "\uBD80\uC7AC\uC911 \uC804\uD654 (\uBC1B\uC9C0 \uC54A\uC558\uC5B4\uC694)" : `\uC74C\uC131 \uC0C1\uB2F4 ${mm > 0 ? mm + "\uBD84 " : ""}${ss}\uCD08`;
    await logCallToChat(db, env, ctx, r, line, by === "counselor" ? "counselor" : "client");
    pushCallState(env, ctx, r.counselor_id, r.client_id, "ended", { callId: id });
    if (!r.connect_at && by !== "counselor") {
      const wake = notifyCounselor(env, r.counselor_id).catch(() => {
      });
      if (ctx && ctx.waitUntil) ctx.waitUntil(wake);
    }
    return json3({
      ok: true,
      billed,
      connected: !!r.connect_at,
      seconds: Math.round(ms / 1e3),
      noAnswer: !r.connect_at
    }, 200, cors);
  }
  if (path === "/rtc/signal" && method === "POST") {
    const room = s2(body.room, 160), sender = body.sender === "counselor" ? "counselor" : "client";
    const kind = s2(body.kind, 12);
    if (!room || !["offer", "answer", "ice", "bye", "ring"].includes(kind)) {
      return json3({ error: "bad-signal" }, 400, cors);
    }
    await db.prepare("INSERT INTO rtc_signals (room, sender, kind, payload, ts) VALUES (?,?,?,?,?)").bind(room, sender, kind, String(body.payload || "").slice(0, 2e4), nowMs2()).run();
    return json3({ ok: true }, 200, cors);
  }
  if (path === "/rtc/poll" && method === "GET") {
    const room = s2(q("room"), 160);
    const me = q("as") === "counselor" ? "counselor" : "client";
    const since = Number(q("since")) || 0;
    if (!room) return json3({ items: [], seq: since }, 200, cors);
    const r = await db.prepare(
      "SELECT seq, sender, kind, payload FROM rtc_signals WHERE room = ? AND seq > ? AND sender != ? ORDER BY seq ASC LIMIT 60"
    ).bind(room, since, me).all();
    const items = r.results || [];
    const last = items.length ? items[items.length - 1].seq : since;
    if (Math.random() < 0.05) {
      try {
        await db.prepare("DELETE FROM rtc_signals WHERE ts < ?").bind(nowMs2() - SIGNAL_TTL).run();
      } catch (e) {
      }
    }
    return json3({ items, seq: last }, 200, cors);
  }
  return null;
}
__name(handleRtc, "handleRtc");

// oauth.js
var STATE_TTL = 10 * 60 * 1e3;
var HANDOFF_TTL = 60 * 1e3;
var SESSION_TTL2 = 180 * 864e5;
var nowMs3 = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
var rid2 = /* @__PURE__ */ __name((p) => p + "_" + nowMs3().toString(36) + Math.random().toString(36).slice(2, 10), "rid");
function token2(n) {
  const b = new Uint8Array(n || 24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(token2, "token");
function json4(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors || {} }
  });
}
__name(json4, "json");
var PROVIDERS = {
  kakao: {
    name: "\uCE74\uCE74\uC624",
    auth: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
    scope: "account_email profile_nickname",
    // 카카오의 Client Secret 은 콘솔에서 켜야 생기는 '선택' 값이다.
    //  필수로 요구했더니 REST API 키만 넣은 상태에서 버튼이 아예 안 떴다.
    secretOptional: true,
    id: /* @__PURE__ */ __name((e) => e.KAKAO_CLIENT_ID, "id"),
    secret: /* @__PURE__ */ __name((e) => e.KAKAO_CLIENT_SECRET, "secret"),
    parse: /* @__PURE__ */ __name((p) => ({
      uid: String(p.id),
      email: p.kakao_account && p.kakao_account.email || "",
      nickname: p.kakao_account && p.kakao_account.profile && p.kakao_account.profile.nickname || ""
    }), "parse")
  },
  naver: {
    name: "\uB124\uC774\uBC84",
    auth: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    profile: "https://openapi.naver.com/v1/nid/me",
    scope: "",
    id: /* @__PURE__ */ __name((e) => e.NAVER_CLIENT_ID, "id"),
    secret: /* @__PURE__ */ __name((e) => e.NAVER_CLIENT_SECRET, "secret"),
    parse: /* @__PURE__ */ __name((p) => {
      const r = p.response || {};
      return { uid: String(r.id || ""), email: r.email || "", nickname: r.nickname || r.name || "" };
    }, "parse")
  },
  google: {
    name: "\uAD6C\uAE00",
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    profile: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
    id: /* @__PURE__ */ __name((e) => e.GOOGLE_CLIENT_ID, "id"),
    secret: /* @__PURE__ */ __name((e) => e.GOOGLE_CLIENT_SECRET, "secret"),
    parse: /* @__PURE__ */ __name((p) => ({ uid: String(p.sub || ""), email: p.email || "", nickname: p.name || "" }), "parse")
  }
};
var configured = /* @__PURE__ */ __name((env, key2) => {
  const p = PROVIDERS[key2];
  if (!p || !p.id(env)) return false;
  return p.secretOptional ? true : !!p.secret(env);
}, "configured");
var callbackUrl = /* @__PURE__ */ __name((env, url, key2) => (env.OAUTH_BASE || url.origin).replace(/\/+$/, "") + "/api/oauth/" + key2 + "/callback", "callbackUrl");
function safeBack(env, want) {
  const allow = [env.APP_URL, env.PRO_URL, "https://neurumind.com", "https://www.neurumind.com"].filter(Boolean).map((x) => String(x).replace(/\/+$/, ""));
  const w = String(want || "").replace(/\/+$/, "");
  if (w && allow.some((a) => w === a || w.startsWith(a + "/"))) return w;
  return allow[0] || "https://neurumind.com";
}
__name(safeBack, "safeBack");
async function upsertUser(db, provider, prof) {
  const t = nowMs3();
  const found = await db.prepare(
    "SELECT id FROM users WHERE provider = ? AND provider_uid = ?"
  ).bind(provider, prof.uid).first();
  if (found) {
    await db.prepare(
      "UPDATE users SET email = ?, nickname = ?, last_seen = ? WHERE id = ?"
    ).bind(prof.email || null, prof.nickname || null, t, found.id).run();
    return found.id;
  }
  const id = rid2("u");
  await db.prepare(
    "INSERT INTO users (id, provider, provider_uid, email, nickname, created, last_seen) VALUES (?,?,?,?,?,?,?)"
  ).bind(id, provider, prof.uid, prof.email || null, prof.nickname || null, t, t).run();
  return id;
}
__name(upsertUser, "upsertUser");
async function resolveUser(db, sessionToken) {
  if (!db || !sessionToken) return null;
  const s2 = await db.prepare(
    `SELECT u.id, u.provider, u.email, u.nickname, u.created, s.token
       FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires > ?`
  ).bind(String(sessionToken).slice(0, 128), nowMs3()).first();
  if (!s2) return null;
  await db.prepare("UPDATE user_sessions SET last_seen = ? WHERE token = ?").bind(nowMs3(), s2.token).run();
  return s2;
}
__name(resolveUser, "resolveUser");
function errPage(msg, back) {
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>\uB85C\uADF8\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694</title></head>
     <body style="font-family:'Noto Sans KR',-apple-system,sans-serif;background:#faf5ee;color:#362f28;
                  display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1.5rem;">
       <div style="max-width:320px;text-align:center;">
         <h1 style="font-size:1.05rem;margin:0 0 0.6rem;">\uB85C\uADF8\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694</h1>
         <p style="font-size:0.85rem;color:#7f7264;line-height:1.6;margin:0 0 1.2rem;">${msg}</p>
         <a href="${back}" style="display:inline-block;background:#4f8a6b;color:#fff;text-decoration:none;
            font-weight:700;font-size:0.92rem;padding:0.8rem 1.5rem;border-radius:999px;">\uC571\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30</a>
       </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
__name(errPage, "errPage");
async function handleOauth(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json4({ error: "db-not-bound" }, 503, cors);
  const method = request.method;
  const q = /* @__PURE__ */ __name((k) => url.searchParams.get(k) || "", "q");
  if (path === "/oauth/providers" && method === "GET") {
    return json4({
      items: Object.keys(PROVIDERS).filter((k) => configured(env, k)).map((k) => ({ key: k, name: PROVIDERS[k].name }))
    }, 200, cors);
  }
  const m = path.match(/^\/oauth\/(kakao|naver|google)\/(start|callback)$/);
  if (m) {
    const key2 = m[1], step = m[2], P = PROVIDERS[key2];
    const back = safeBack(env, q("back"));
    if (!configured(env, key2)) {
      return step === "start" ? errPage(`${P.name} \uB85C\uADF8\uC778\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`, back) : errPage(`${P.name} \uB85C\uADF8\uC778\uC774 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC5B4\uC694.`, back);
    }
    if (step === "start") {
      const st2 = token2(16);
      await db.prepare("INSERT INTO oauth_state (state, provider, back, expires) VALUES (?,?,?,?)").bind(st2, key2, back, nowMs3() + STATE_TTL).run();
      await db.prepare("DELETE FROM oauth_state WHERE expires < ?").bind(nowMs3()).run();
      const p = new URLSearchParams({
        response_type: "code",
        client_id: P.id(env),
        redirect_uri: callbackUrl(env, url, key2),
        state: st2
      });
      if (P.scope) p.set("scope", P.scope);
      return Response.redirect(P.auth + "?" + p.toString(), 302);
    }
    const code = q("code"), st = q("state");
    if (q("error")) return errPage("\uB85C\uADF8\uC778\uC744 \uCDE8\uC18C\uD558\uC168\uC5B4\uC694.", back);
    if (!code || !st) return errPage("\uB85C\uADF8\uC778 \uC815\uBCF4\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694.", back);
    const row = await db.prepare("SELECT * FROM oauth_state WHERE state = ? AND provider = ?").bind(st, key2).first();
    await db.prepare("DELETE FROM oauth_state WHERE state = ?").bind(st).run();
    if (!row || row.expires < nowMs3()) {
      return errPage("\uB85C\uADF8\uC778 \uC2DC\uAC04\uC774 \uB9CC\uB8CC\uB410\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.", back);
    }
    const realBack = safeBack(env, row.back);
    let tok;
    try {
      const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: P.id(env),
        redirect_uri: callbackUrl(env, url, key2),
        code,
        state: st
      });
      if (P.secret(env)) form.set("client_secret", P.secret(env));
      const r = await fetch(P.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      });
      tok = await r.json();
    } catch (e) {
      return errPage("\uB85C\uADF8\uC778 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694.", realBack);
    }
    if (!tok || !tok.access_token) {
      return errPage(`${P.name}\uC5D0\uC11C \uB85C\uADF8\uC778\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.`, realBack);
    }
    let prof;
    try {
      const r = await fetch(P.profile, { headers: { Authorization: "Bearer " + tok.access_token } });
      prof = P.parse(await r.json());
    } catch (e) {
      return errPage("\uD68C\uC6D0 \uC815\uBCF4\uB97C \uC77D\uC9C0 \uBABB\uD588\uC5B4\uC694.", realBack);
    }
    if (!prof || !prof.uid) return errPage("\uD68C\uC6D0 \uC815\uBCF4\uB97C \uC77D\uC9C0 \uBABB\uD588\uC5B4\uC694.", realBack);
    const userId = await upsertUser(db, key2, prof);
    const handoff = token2(20);
    await db.prepare("INSERT INTO oauth_handoff (code, user_id, expires) VALUES (?,?,?)").bind(handoff, userId, nowMs3() + HANDOFF_TTL).run();
    await db.prepare("DELETE FROM oauth_handoff WHERE expires < ?").bind(nowMs3()).run();
    return Response.redirect(realBack + "/?auth=" + handoff, 302);
  }
  if (path === "/oauth/exchange" && method === "POST") {
    const code = String(body.code || "").slice(0, 64);
    if (!code) return json4({ error: "missing" }, 400, cors);
    const h = await db.prepare("SELECT * FROM oauth_handoff WHERE code = ?").bind(code).first();
    await db.prepare("DELETE FROM oauth_handoff WHERE code = ?").bind(code).run();
    if (!h || h.expires < nowMs3()) return json4({ error: "expired" }, 403, cors);
    const s2 = token2(24);
    const t = nowMs3();
    await db.prepare(
      "INSERT INTO user_sessions (token, user_id, expires, created, last_seen) VALUES (?,?,?,?,?)"
    ).bind(s2, h.user_id, t + SESSION_TTL2, t, t).run();
    const u = await db.prepare("SELECT id, provider, email, nickname FROM users WHERE id = ?").bind(h.user_id).first();
    return json4({ ok: true, session: s2, user: u }, 200, cors);
  }
  if (path === "/oauth/me" && method === "GET") {
    const me = await resolveUser(db, q("session"));
    if (!me) return json4({ ok: false }, 200, cors);
    return json4({ ok: true, user: { id: me.id, provider: me.provider, email: me.email, nickname: me.nickname } }, 200, cors);
  }
  if (path === "/oauth/logout" && method === "POST") {
    const s2 = String(body.session || "").slice(0, 128);
    if (s2) await db.prepare("DELETE FROM user_sessions WHERE token = ?").bind(s2).run();
    return json4({ ok: true }, 200, cors);
  }
  if (path === "/oauth/delete" && method === "POST") {
    const me = await resolveUser(db, String(body.session || "").slice(0, 128));
    if (!me) return json4({ error: "bad-session" }, 403, cors);
    await db.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(me.id).run();
    await db.prepare("DELETE FROM users WHERE id = ?").bind(me.id).run();
    return json4({ ok: true }, 200, cors);
  }
  return null;
}
__name(handleOauth, "handleOauth");

// sync.js
var MAX_KEY_BYTES = 256 * 1024;
var MAX_TOTAL_KEYS = 80;
var ALLOW = /* @__PURE__ */ new Set([
  // 내가 누구인지 (연락처·전화번호는 없다)
  "cbt_user_name",
  "cbt_user_gender",
  "cbt_user_concerns",
  "cbt_active_persona",
  // 설정
  "cbt_lang",
  "cbt_font_scale",
  "cbt_sound_on",
  "cbt_haptic_on",
  "cbt_tts_enabled",
  "cbt_tts_gender",
  "cbt_checkin_mode",
  "cbt_checkin_times",
  // 장기기억 — 대화 원문이 아니라 우렁이가 간추린 요약
  "cbt_user_memory",
  // 마음 리포트와 검사
  "cbt_my_reports",
  "cbt_latest_summary_report",
  "cbt_assessments",
  "cbt_assess_history",
  "cbt_careplan",
  "cbt_careplan_history",
  "cbt_mood_log",
  "cbt_mood_entries",
  "cbt_distortion_stats",
  // 레벨·수집물
  "cbt_stamps",
  "cbt_badges",
  "cbt_level_seen",
  "cbt_quiz_best",
  "cbt_streak_shields",
  "cbt_closet_owned",
  "cbt_closet_equipped",
  "cbt_room_owned",
  "cbt_room_placed",
  "cbt_farm_plots",
  "cbt_farm_coins",
  "cbt_farm_water",
  "cbt_farm_stats",
  "cbt_sticker_packs",
  // 진행 상황
  "cbt_goals",
  "cbt_safety_plan",
  "cbt_homework",
  "cbt_weekly_letters",
  "cbt_mission_log",
  "cbt_rx_mission_log",
  "cbt_daily_mission",
  "cbt_active_days",
  "cbt_total_chats",
  "cbt_total_sessions",
  "cbt_checkin_count",
  "cbt_breath_count",
  "cbt_action_log",
  // 지갑·구독 (기기에만 두면 폰을 바꿀 때 산 것이 사라진다)
  "cbt_cash",
  "cbt_cash_history",
  "cbt_sub_until",
  "cbt_trial_start",
  "cbt_free_sessions",
  "cbt_pro_mode",
  // 상담
  "cbt_bookings",
  "cbt_reviews",
  "cbt_favs",
  "cbt_counselor_apps"
]);
var DENY = [
  /^cbt_messages$/,
  /^cbt_hchat_/,
  /^cbt_daily_chat$/,
  /^cbt_mem_turn$/,
  /^cbt_thought_records$/,
  /^cbt_night_/,
  /^cbt_wiz_draft$/,
  /^cbt_api_key$/,
  /^cbt_lock_/,
  /^cbt_client_id$/,
  /^cbt_user_phone$/,
  /^cbt_share/,
  /^cbt_auth$/
];
var allowed = /* @__PURE__ */ __name((k) => ALLOW.has(k) && !DENY.some((re) => re.test(k)), "allowed");
var nowMs4 = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
function json5(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors || {} }
  });
}
__name(json5, "json");
var enc2 = new TextEncoder();
var dec = new TextDecoder();
var KEY2 = null;
async function key(env) {
  if (KEY2) return KEY2;
  if (!env.SYNC_KEY) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc2.encode(String(env.SYNC_KEY)));
  KEY2 = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return KEY2;
}
__name(key, "key");
var b64u2 = /* @__PURE__ */ __name((b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64u");
function unb64u(s2) {
  const pad = "=".repeat((4 - s2.length % 4) % 4);
  const r = atob((s2 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const o = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) o[i] = r.charCodeAt(i);
  return o;
}
__name(unb64u, "unb64u");
async function seal(env, text) {
  const k = await key(env);
  if (!k) return "p." + b64u2(enc2.encode(text));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc2.encode(text));
  return "e." + b64u2(iv) + "." + b64u2(ct);
}
__name(seal, "seal");
async function open(env, blob) {
  const s2 = String(blob || "");
  if (s2.startsWith("p.")) return dec.decode(unb64u(s2.slice(2)));
  if (!s2.startsWith("e.")) return null;
  const k = await key(env);
  if (!k) return null;
  const [, ivs, cts] = s2.split(".");
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(ivs) }, k, unb64u(cts));
    return dec.decode(pt);
  } catch (e) {
    return null;
  }
}
__name(open, "open");
async function handleSync(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json5({ error: "db-not-bound" }, 503, cors);
  const method = request.method;
  const q = /* @__PURE__ */ __name((k) => url.searchParams.get(k) || "", "q");
  if (path === "/sync/scope" && method === "GET") {
    return json5({ keys: [...ALLOW].sort(), never: ["\uB300\uD654 \uC6D0\uBB38", "\uC0DD\uAC01\uAE30\uB85D", "\uBC24\uD3B8\uC9C0 \uCD08\uC548", "\uC804\uD654\uBC88\uD638"] }, 200, cors);
  }
  if (path === "/sync" && method === "GET") {
    const me = await resolveUser(db, q("session"));
    if (!me) return json5({ error: "bad-session" }, 403, cors);
    const since = Math.max(0, Number(q("since")) || 0);
    const r = await db.prepare(
      "SELECT k, v, updated FROM user_data WHERE user_id = ? AND updated > ?"
    ).bind(me.id, since).all();
    const items = {};
    for (const row of r.results || []) {
      if (!allowed(row.k)) continue;
      const plain = await open(env, row.v);
      if (plain === null) continue;
      items[row.k] = { v: plain, updated: row.updated };
    }
    return json5({ ok: true, items, now: nowMs4() }, 200, cors);
  }
  if (path === "/sync" && method === "POST") {
    const me = await resolveUser(db, String(body.session || "").slice(0, 128));
    if (!me) return json5({ error: "bad-session" }, 403, cors);
    const items = body.items && typeof body.items === "object" ? body.items : {};
    const keys = Object.keys(items).slice(0, MAX_TOTAL_KEYS);
    const rejected = [], saved = [];
    const stmts = [];
    for (const k of keys) {
      if (!allowed(k)) {
        rejected.push(k);
        continue;
      }
      const it = items[k] || {};
      const v = typeof it.v === "string" ? it.v : JSON.stringify(it.v);
      if (v == null) continue;
      const bytes = enc2.encode(v).length;
      if (bytes > MAX_KEY_BYTES) {
        rejected.push(k + "(\uB108\uBB34 \uD07C)");
        continue;
      }
      const updated = Math.min(nowMs4() + 6e4, Math.max(1, Number(it.updated) || nowMs4()));
      const sealed = await seal(env, v);
      stmts.push(db.prepare(
        `INSERT INTO user_data (user_id, k, v, updated, bytes) VALUES (?,?,?,?,?)
         ON CONFLICT(user_id, k) DO UPDATE SET
           v = excluded.v, updated = excluded.updated, bytes = excluded.bytes
         WHERE excluded.updated > user_data.updated`
      ).bind(me.id, k, sealed, updated, bytes));
      saved.push(k);
    }
    if (stmts.length) await db.batch(stmts);
    return json5({ ok: true, saved: saved.length, rejected, now: nowMs4() }, 200, cors);
  }
  if (path === "/sync/wipe" && method === "POST") {
    const me = await resolveUser(db, String(body.session || "").slice(0, 128));
    if (!me) return json5({ error: "bad-session" }, 403, cors);
    const r = await db.prepare("DELETE FROM user_data WHERE user_id = ?").bind(me.id).run();
    return json5({ ok: true, deleted: r.meta && r.meta.changes || 0 }, 200, cors);
  }
  return null;
}
__name(handleSync, "handleSync");

// market.js
var MAX = { text: 4e3, name: 40, id: 64 };
var CALL_LOCK_MS = 35 * 60 * 1e3;
var KEEP_MS = 180 * 864e5;
var s = /* @__PURE__ */ __name((v, n) => String(v == null ? "" : v).slice(0, n || MAX.name), "s");
var num = /* @__PURE__ */ __name((v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}, "num");
var nowMs5 = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
var rid3 = /* @__PURE__ */ __name((p) => p + "_" + nowMs5().toString(36) + Math.random().toString(36).slice(2, 8), "rid");
function makeCode() {
  const AB = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  let out = "";
  for (let i = 0; i < 20; i++) {
    out += AB[b[i] % AB.length];
    if (i % 5 === 4 && i !== 19) out += "-";
  }
  return out;
}
__name(makeCode, "makeCode");
function json6(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors || {} }
  });
}
__name(json6, "json");
async function whoami(db, cred) {
  const session = typeof cred === "object" && cred ? cred.session : "";
  const code = typeof cred === "object" && cred ? cred.code : cred;
  return await resolveCounselor(db, {
    session: s(session, 128),
    code: s(code, MAX.id)
  });
}
__name(whoami, "whoami");
var CRISIS_NUMS = ["109", "1577-0199", "15770199", "1366", "1388", "119", "129", "1393"];
function maskContacts(text) {
  let t = String(text || "");
  let hits = 0;
  const keep = [];
  CRISIS_NUMS.forEach((n, k) => {
    const re = new RegExp("(?<![0-9-])" + n.replace(/-/g, "[-]") + "(?![0-9-])", "g");
    if (re.test(t)) {
      const tk = "\uE000" + k + "\uE001";
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
  rules.forEach((re) => {
    t = t.replace(re, () => {
      hits++;
      return "[\uC5F0\uB77D\uCC98\uB294 \uC804\uB2EC\uB418\uC9C0 \uC54A\uC544\uC694]";
    });
  });
  keep.forEach(([tk, n]) => {
    t = t.split(tk).join(n);
  });
  return { text: t, hits };
}
__name(maskContacts, "maskContacts");
var isAdmin = /* @__PURE__ */ __name((env, code) => !!env.ADMIN_CODE && code === env.ADMIN_CODE, "isAdmin");
async function handleMarket(request, env, cors, path, ctx) {
  const db = env.DB;
  if (!db) return json6({ error: "db-not-bound" }, 503, cors);
  const url = new URL(request.url);
  const q = /* @__PURE__ */ __name((k) => url.searchParams.get(k) || "", "q");
  const method = request.method;
  let body = {};
  if (method === "POST") {
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }
  }
  const code = s(body.code || q("code"), MAX.id);
  const session = s(body.session || q("session"), 128);
  const cred = { session, code };
  if (path.startsWith("/auth/")) {
    const r = await handleAuth(request, env, cors, path, body, url);
    if (r) return r;
  }
  if (path.startsWith("/rtc/")) {
    const r = await handleRtc(request, env, cors, path, body, url, ctx);
    if (r) return r;
  }
  if (path.startsWith("/push/")) {
    const r = await handlePush(request, env, cors, path, body, url);
    if (r) return r;
  }
  if (path.startsWith("/oauth/")) {
    const r = await handleOauth(request, env, cors, path, body, url);
    if (r) return r;
  }
  if (path === "/sync" || path.startsWith("/sync/")) {
    const r = await handleSync(request, env, cors, path, body, url);
    if (r) return r;
  }
  if (path === "/counselors" && method === "GET") {
    const r = await db.prepare(
      `SELECT id, name, hospital, addr, intro, tags, price, call_rate, license, available, busy_until
         FROM counselors WHERE active = 1 ORDER BY created DESC`
    ).all();
    return json6({
      items: (r.results || []).map((c) => ({
        id: c.id,
        name: c.name,
        hospital: c.hospital || "",
        addr: c.addr || "",
        intro: c.intro || "",
        tags: safeJson(c.tags, []),
        price: c.price || 0,
        callRate: c.call_rate || 0,
        license: c.license || "",
        available: !!c.available,
        busyUntil: c.busy_until || 0
      }))
    }, 200, cors);
  }
  if (path === "/presence") {
    if (method === "GET" && (code || session)) {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      return json6({
        id: me.id,
        name: me.name,
        available: !!me.available,
        busy: me.busy_until > nowMs5()
      }, 200, cors);
    }
    if (method === "GET") {
      const r = await db.prepare(
        "SELECT id, available, busy_until FROM counselors WHERE active = 1"
      ).all();
      const presence = {};
      const t = nowMs5();
      (r.results || []).forEach((c) => {
        presence[c.id] = { available: !!c.available, busy: c.busy_until > t };
      });
      return json6({ presence }, 200, cors);
    }
    if (method === "POST") {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      await db.prepare("UPDATE counselors SET available = ? WHERE id = ?").bind(body.available ? 1 : 0, me.id).run();
      return json6({ ok: true }, 200, cors);
    }
  }
  if (path === "/bookings" && method === "GET") {
    if (isAdmin(env, code)) {
      const r2 = await db.prepare("SELECT * FROM bookings ORDER BY when_ts DESC LIMIT 500").all();
      return json6({ items: (r2.results || []).map(rowBooking), scope: "admin" }, 200, cors);
    }
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      const r2 = await db.prepare(
        "SELECT * FROM bookings WHERE counselor_id = ? ORDER BY when_ts DESC LIMIT 200"
      ).bind(me.id).all();
      return json6({
        items: (r2.results || []).map((x) => ({ ...rowBooking(x), cnote: x.cnote || "" })),
        scope: "counselor"
      }, 200, cors);
    }
    const cid = s(q("clientId"), MAX.id);
    if (!cid) return json6({ items: [] }, 200, cors);
    const r = await db.prepare(
      "SELECT * FROM bookings WHERE client_id = ? ORDER BY when_ts DESC LIMIT 100"
    ).bind(cid).all();
    return json6({ items: (r.results || []).map(rowBooking) }, 200, cors);
  }
  if (path === "/bookings" && method === "POST") {
    const id = s(body.id, MAX.id) || rid3("bk");
    const clientId = s(body.clientId, MAX.id);
    if (!clientId || !body.counselorId) return json6({ error: "missing" }, 400, cors);
    await db.prepare(
      `INSERT OR REPLACE INTO bookings
       (id, counselor_id, counselor_name, client_id, client_name, when_ts, time_label, price, status, created)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      s(body.counselorId, MAX.id),
      s(body.counselorName || body.name),
      clientId,
      s(body.clientName) || "\uC775\uBA85",
      num(body.whenTs),
      s(body.time, 120),
      num(body.price),
      "confirmed",
      nowMs5()
    ).run();
    return json6({ ok: true, id }, 200, cors);
  }
  for (const [seg, status, byCounselor] of [
    ["/bookings/cancel", "cancelled", false],
    ["/bookings/noshow", "noshow", false],
    ["/bookings/decline", "declined", true]
  ]) {
    if (path === seg && method === "POST") {
      const id = s(body.id, MAX.id);
      if (!id) return json6({ error: "missing-id" }, 400, cors);
      if (byCounselor) {
        const me = await whoami(db, cred);
        if (!me) return json6({ error: "bad-code" }, 403, cors);
        await db.prepare("UPDATE bookings SET status = ? WHERE id = ? AND counselor_id = ?").bind(status, id, me.id).run();
      } else {
        await db.prepare("UPDATE bookings SET status = ? WHERE id = ?").bind(status, id).run();
      }
      return json6({ ok: true }, 200, cors);
    }
  }
  const AUTO_CONFIRM_MS = 72 * 36e5;
  if (path === "/bookings/done" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    const id = s(body.id, MAX.id);
    const b = await db.prepare("SELECT * FROM bookings WHERE id = ? AND counselor_id = ?").bind(id, me.id).first();
    if (!b) return json6({ error: "not-found" }, 404, cors);
    if (b.status !== "confirmed") return json6({ error: "\uC644\uB8CC \uCC98\uB9AC\uD560 \uC218 \uC788\uB294 \uC0C1\uD0DC\uAC00 \uC544\uB2D9\uB2C8\uB2E4" }, 400, cors);
    if (b.when_ts > nowMs5()) return json6({ error: "\uC0C1\uB2F4 \uC2DC\uAC01 \uC804\uC5D0\uB294 \uC644\uB8CC \uCC98\uB9AC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4" }, 400, cors);
    const t = nowMs5();
    await db.prepare(
      "UPDATE bookings SET status = ?, done_at = ?, auto_at = ?, cnote = COALESCE(?, cnote) WHERE id = ?"
    ).bind("done", t, t + AUTO_CONFIRM_MS, s(body.note, 1e3) || null, id).run();
    return json6({ ok: true, autoAt: t + AUTO_CONFIRM_MS }, 200, cors);
  }
  if (path === "/bookings/confirm" && method === "POST") {
    const id = s(body.id, MAX.id), clientId = s(body.clientId, MAX.id);
    if (!id || !clientId) return json6({ error: "missing" }, 400, cors);
    const r = await db.prepare(
      "UPDATE bookings SET confirm_at = ? WHERE id = ? AND client_id = ? AND status = 'done' AND confirm_at = 0"
    ).bind(nowMs5(), id, clientId).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/bookings/dispute" && method === "POST") {
    const id = s(body.id, MAX.id), clientId = s(body.clientId, MAX.id);
    const why = s(body.why, 500);
    if (!id || !clientId || !why) return json6({ error: "\uC0AC\uC720\uB97C \uC801\uC5B4\uC8FC\uC138\uC694" }, 400, cors);
    await db.prepare(
      "UPDATE bookings SET dispute = ?, dispute_at = ?, status = 'disputed' WHERE id = ? AND client_id = ? AND settled_at = 0"
    ).bind(why, nowMs5(), id, clientId).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/bookings/note" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    await db.prepare("UPDATE bookings SET cnote = ? WHERE id = ? AND counselor_id = ?").bind(s(body.note, 1e3), s(body.id, MAX.id), me.id).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/bookings/refund" && method === "POST") {
    const id = s(body.id, MAX.id);
    const admin = isAdmin(env, code);
    let owner = null;
    if (!admin) {
      owner = await whoami(db, cred);
      if (!owner) return json6({ error: "bad-code" }, 403, cors);
    }
    const b = admin ? await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first() : await db.prepare("SELECT * FROM bookings WHERE id = ? AND counselor_id = ?").bind(id, owner.id).first();
    if (!b) return json6({ error: "not-found" }, 404, cors);
    if (b.settled_at) return json6({ error: "\uC774\uBBF8 \uC815\uC0B0\uC774 \uB05D\uB09C \uC0C1\uB2F4\uC785\uB2C8\uB2E4" }, 400, cors);
    const amount = Math.max(0, Math.min(b.price || 0, num(body.amount) || (b.price || 0)));
    await db.prepare(
      "UPDATE bookings SET status = 'refunded', refund = ?, refund_at = ?, refund_why = ? WHERE id = ?"
    ).bind(amount, nowMs5(), s(body.why, 300), id).run();
    return json6({ ok: true, refund: amount }, 200, cors);
  }
  if (path === "/settle" && method === "GET") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    const t = nowMs5();
    const r = await db.prepare(
      `SELECT b.*, c.name cname, c.bank, c.bank_no, c.bank_holder
         FROM bookings b LEFT JOIN counselors c ON c.id = b.counselor_id
        WHERE b.status = 'done' AND b.settled_at = 0
          AND (b.confirm_at > 0 OR b.auto_at <= ?)
        ORDER BY b.done_at ASC LIMIT 300`
    ).bind(t).all();
    const items = (r.results || []).map((x) => {
      const p = payoutOf(x.price || 0);
      return {
        id: x.id,
        counselorId: x.counselor_id,
        counselor: x.cname || x.counselor_name,
        clientName: x.client_name,
        time: x.time_label,
        price: x.price,
        doneAt: x.done_at,
        confirmed: !!x.confirm_at,
        auto: !x.confirm_at,
        payout: p,
        bank: x.bank_no ? { bank: x.bank, holder: x.bank_holder, masked: maskAcct(x.bank_no) } : null
      };
    });
    const sum = items.reduce((a, x) => a + x.payout.counselor, 0);
    return json6({ items, counselorTotal: sum }, 200, cors);
  }
  if (path === "/settle/pay" && method === "POST") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map((x) => s(x, MAX.id)).filter(Boolean).slice(0, 200);
    if (!ids.length) return json6({ error: "ids \uC5C6\uC74C" }, 400, cors);
    const t = nowMs5();
    await db.batch(ids.map((id) => db.prepare("UPDATE bookings SET settled_at = ? WHERE id = ? AND status = 'done' AND settled_at = 0").bind(t, id)));
    return json6({ ok: true, n: ids.length }, 200, cors);
  }
  if (path === "/homework" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    const clientId = s(body.clientId, MAX.id);
    const text = s(body.text, 200);
    if (!clientId || !text) return json6({ error: "\uB0B4\uB2F4\uC790\uC640 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694" }, 400, cors);
    const id = rid3("hw");
    const hwTs = nowMs5();
    await db.prepare(
      `INSERT INTO homework (id, counselor_id, counselor, client_id, booking_id, text, why, due_at, assigned_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      me.id,
      me.name,
      clientId,
      s(body.bookingId, MAX.id),
      text,
      s(body.why, 200),
      num(body.dueAt),
      hwTs
    ).run();
    try {
      const cmId = rid3("cm");
      await db.prepare(
        `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(
        cmId,
        me.id,
        me.name,
        clientId,
        s(body.clientName) || "",
        "counselor",
        `[\uC219\uC81C:${id}] ${text}`,
        hwTs
      ).run();
      if (env.HUB && ctx && ctx.waitUntil) {
        const evt = JSON.stringify({
          type: "chat",
          msg: {
            id: cmId,
            counselorId: me.id,
            counselorName: me.name,
            clientId,
            clientName: s(body.clientName) || "",
            from: "counselor",
            text: `[\uC219\uC81C:${id}] ${text}`,
            ts: hwTs
          }
        });
        const pub = /* @__PURE__ */ __name((ch) => env.HUB.get(env.HUB.idFromName(ch)).fetch("https://hub/publish", { method: "POST", body: evt }).catch(() => {
        }), "pub");
        ctx.waitUntil(Promise.all([pub("c:" + me.id), pub("cl:" + clientId)]));
      }
      if (ctx && ctx.waitUntil) ctx.waitUntil(notifyClient(env, clientId).catch(() => {
      }));
    } catch (e) {
    }
    return json6({ ok: true, id }, 200, cors);
  }
  if (path === "/homework" && method === "GET") {
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      const r2 = await db.prepare(
        "SELECT * FROM homework WHERE counselor_id = ? ORDER BY assigned_at DESC LIMIT 200"
      ).bind(me.id).all();
      return json6({ items: (r2.results || []).map(rowHw) }, 200, cors);
    }
    const cid = s(q("clientId"), MAX.id);
    if (!cid) return json6({ items: [] }, 200, cors);
    const r = await db.prepare(
      "SELECT * FROM homework WHERE client_id = ? ORDER BY assigned_at DESC LIMIT 50"
    ).bind(cid).all();
    return json6({ items: (r.results || []).map(rowHw) }, 200, cors);
  }
  if (path === "/homework/done" && method === "POST") {
    const id = s(body.id, MAX.id), clientId = s(body.clientId, MAX.id);
    if (!id || !clientId) return json6({ error: "missing" }, 400, cors);
    await db.prepare("UPDATE homework SET done_at = ?, note = ? WHERE id = ? AND client_id = ?").bind(nowMs5(), s(body.note, 300), id, clientId).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/inbox" && method === "GET") {
    if (isAdmin(env, code)) {
      const r2 = await db.prepare("SELECT * FROM inbox ORDER BY ts DESC LIMIT 300").all();
      return json6({ scope: "admin", items: (r2.results || []).map(rowInbox) }, 200, cors);
    }
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    const r = await db.prepare(
      "SELECT * FROM inbox WHERE counselor_id = ? ORDER BY ts DESC LIMIT 200"
    ).bind(me.id).all();
    return json6({
      scope: "counselor",
      counselorName: me.name,
      items: (r.results || []).map(rowInbox)
    }, 200, cors);
  }
  if (path === "/inbox" && method === "POST") {
    const text = s(body.text, MAX.text);
    const clientId = s(body.clientId, MAX.id);
    if (!text || !clientId) return json6({ error: "missing" }, 400, cors);
    const id = rid3("ib");
    await db.prepare(
      `INSERT INTO inbox (id, counselor_id, counselor_name, booking_id, client_id, client_name, body, read_at, ts)
       VALUES (?,?,?,?,?,?,?,0,?)`
    ).bind(
      id,
      s(body.counselorId, MAX.id),
      s(body.counselorName),
      s(body.bookingId, MAX.id),
      clientId,
      s(body.clientName) || "\uC775\uBA85",
      text,
      nowMs5()
    ).run();
    return json6({ ok: true, id }, 200, cors);
  }
  if (path === "/inbox/read" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    await db.prepare("UPDATE inbox SET read_at = ? WHERE id = ? AND counselor_id = ?").bind(nowMs5(), s(body.id, MAX.id), me.id).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/reviews" && method === "GET") {
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      const r2 = await db.prepare(
        "SELECT * FROM reviews WHERE counselor_id = ? ORDER BY ts DESC LIMIT 200"
      ).bind(me.id).all();
      return json6({ items: (r2.results || []).map(rowReview) }, 200, cors);
    }
    const cid = s(q("clientId"), MAX.id);
    if (!cid) return json6({ items: [] }, 200, cors);
    const r = await db.prepare(
      "SELECT * FROM reviews WHERE client_id = ? AND reply IS NOT NULL ORDER BY ts DESC LIMIT 50"
    ).bind(cid).all();
    return json6({ items: (r.results || []).map(rowReview) }, 200, cors);
  }
  if (path === "/reviews" && method === "POST") {
    const clientId = s(body.clientId, MAX.id);
    const rating = Math.max(1, Math.min(5, num(body.rating) || 5));
    if (!clientId || !body.counselorId) return json6({ error: "missing" }, 400, cors);
    const id = rid3("rv");
    await db.prepare(
      `INSERT INTO reviews (id, counselor_id, booking_id, client_id, client_name, rating, body, reply, reply_ts, ts)
       VALUES (?,?,?,?,?,?,?,NULL,0,?)`
    ).bind(
      id,
      s(body.counselorId, MAX.id),
      s(body.bookingId, MAX.id),
      clientId,
      s(body.clientName) || "\uC775\uBA85",
      rating,
      s(body.text, 600),
      nowMs5()
    ).run();
    return json6({ ok: true, id }, 200, cors);
  }
  if (path === "/reviews/reply" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    await db.prepare("UPDATE reviews SET reply = ?, reply_ts = ? WHERE id = ? AND counselor_id = ?").bind(s(body.text, 600), nowMs5(), s(body.id, MAX.id), me.id).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/chat-msg" && method === "GET") {
    if (code || session) {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      const r2 = await db.prepare(
        "SELECT * FROM chat_msgs WHERE counselor_id = ? ORDER BY ts ASC LIMIT 500"
      ).bind(me.id).all();
      return json6({ items: (r2.results || []).map(rowMsg) }, 200, cors);
    }
    const cid = s(q("clientId"), MAX.id);
    if (!cid) return json6({ items: [] }, 200, cors);
    const counselorId = s(q("counselorId"), MAX.id);
    const stmt = counselorId ? db.prepare("SELECT * FROM chat_msgs WHERE client_id = ? AND counselor_id = ? ORDER BY ts ASC LIMIT 300").bind(cid, counselorId) : db.prepare("SELECT * FROM chat_msgs WHERE client_id = ? ORDER BY ts ASC LIMIT 300").bind(cid);
    const r = await stmt.all();
    return json6({ items: (r.results || []).map(rowMsg) }, 200, cors);
  }
  if (path === "/chat-msg" && method === "POST") {
    const text = s(body.text, 2e3);
    if (!text) return json6({ error: "empty" }, 400, cors);
    const from = body.from === "counselor" ? "counselor" : "client";
    let counselorId = s(body.counselorId, MAX.id);
    let clientId = s(body.clientId, MAX.id);
    if (from === "counselor") {
      const me = await whoami(db, cred);
      if (!me) return json6({ error: "bad-code" }, 403, cors);
      counselorId = me.id;
      if (!clientId) {
        const prev = await db.prepare(
          "SELECT client_id FROM chat_msgs WHERE counselor_id = ? AND client_name = ? ORDER BY ts DESC LIMIT 1"
        ).bind(me.id, s(body.clientName)).first();
        clientId = prev ? prev.client_id : "";
      }
    }
    if (!clientId || !counselorId) return json6({ error: "missing" }, 400, cors);
    const clean = maskContacts(text);
    const id = rid3("cm");
    let wakeCounselor = false;
    let wakeClient = false;
    if (from === "client") {
      try {
        const recent = await db.prepare(
          "SELECT id FROM chat_msgs WHERE counselor_id = ? AND client_id = ? AND sender = 'client' AND ts > ? LIMIT 1"
        ).bind(counselorId, clientId, nowMs5() - 12e4).first();
        wakeCounselor = !recent;
      } catch (e) {
        wakeCounselor = true;
      }
    } else {
      try {
        const recent = await db.prepare(
          "SELECT id FROM chat_msgs WHERE counselor_id = ? AND client_id = ? AND sender = 'counselor' AND ts > ? LIMIT 1"
        ).bind(counselorId, clientId, nowMs5() - 12e4).first();
        wakeClient = !recent;
      } catch (e) {
        wakeClient = true;
      }
    }
    const msgTs = nowMs5();
    await db.prepare(
      `INSERT INTO chat_msgs (id, counselor_id, counselor_name, client_id, client_name, sender, body, ts)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      counselorId,
      s(body.counselorName),
      clientId,
      s(body.clientName) || "\uC775\uBA85",
      from,
      clean.text,
      msgTs
    ).run();
    if (wakeCounselor && ctx && ctx.waitUntil) {
      ctx.waitUntil(notifyCounselor(env, counselorId).catch(() => {
      }));
    }
    if (wakeClient && ctx && ctx.waitUntil) {
      ctx.waitUntil(notifyClient(env, clientId).catch(() => {
      }));
    }
    if (env.HUB && ctx && ctx.waitUntil) {
      const evt = JSON.stringify({
        type: "chat",
        msg: {
          id,
          counselorId,
          counselorName: s(body.counselorName),
          clientId,
          clientName: s(body.clientName) || "\uC775\uBA85",
          from,
          text: clean.text,
          ts: msgTs
        }
      });
      const pub = /* @__PURE__ */ __name((ch) => env.HUB.get(env.HUB.idFromName(ch)).fetch("https://hub/publish", { method: "POST", body: evt }).catch(() => {
      }), "pub");
      ctx.waitUntil(Promise.all([pub("c:" + counselorId), pub("cl:" + clientId)]));
    }
    if (clean.hits) {
      try {
        await db.prepare(
          "INSERT INTO contact_attempts (id, counselor_id, client_id, sender, n, ts) VALUES (?,?,?,?,?,?)"
        ).bind(rid3("ct"), counselorId, clientId, from, clean.hits, nowMs5()).run();
      } catch (e) {
      }
    }
    return json6({ ok: true, id, masked: clean.hits }, 200, cors);
  }
  if (path === "/call/queue" && method === "GET") {
    const counselorId = s(q("counselorId"), MAX.id);
    const clientId = s(q("clientId"), MAX.id);
    if (!counselorId || !clientId) return json6({ position: -1 }, 200, cors);
    const r = await db.prepare(
      "SELECT client_id FROM call_queue WHERE counselor_id = ? ORDER BY ts ASC"
    ).bind(counselorId).all();
    const list = (r.results || []).map((x) => x.client_id);
    const c = await db.prepare("SELECT available, busy_until FROM counselors WHERE id = ?").bind(counselorId).first();
    return json6({
      position: list.indexOf(clientId),
      // 0 이면 내 차례
      waiting: list.length,
      ready: !!(c && c.available && c.busy_until <= nowMs5() && list[0] === clientId)
    }, 200, cors);
  }
  if (path === "/call/queue" && method === "POST") {
    const counselorId = s(body.counselorId, MAX.id), clientId = s(body.clientId, MAX.id);
    if (!counselorId || !clientId) return json6({ error: "missing" }, 400, cors);
    await db.prepare(
      "INSERT OR REPLACE INTO call_queue (counselor_id, client_id, client_name, ts) VALUES (?,?,?,?)"
    ).bind(counselorId, clientId, s(body.clientName) || "\uC775\uBA85", nowMs5()).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/call/queue/leave" && method === "POST") {
    await db.prepare("DELETE FROM call_queue WHERE counselor_id = ? AND client_id = ?").bind(s(body.counselorId, MAX.id), s(body.clientId, MAX.id)).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/call/start" && method === "POST") {
    const counselorId = s(body.counselorId, MAX.id);
    if (!counselorId) return json6({ error: "missing" }, 400, cors);
    await db.prepare("UPDATE counselors SET busy_until = ? WHERE id = ?").bind(nowMs5() + CALL_LOCK_MS, counselorId).run();
    await db.prepare("DELETE FROM call_queue WHERE counselor_id = ? AND client_id = ?").bind(counselorId, s(body.clientId, MAX.id)).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/call/end" && method === "POST") {
    const counselorId = s(body.counselorId, MAX.id);
    if (!counselorId) return json6({ error: "missing" }, 400, cors);
    await db.prepare("UPDATE counselors SET busy_until = 0 WHERE id = ?").bind(counselorId).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path === "/stats" && method === "GET") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    const t = nowMs5();
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
    const aw = await db.prepare(`SELECT COUNT(*) n FROM (
        SELECT counselor_id, client_id, MAX(ts) mts FROM chat_msgs GROUP BY counselor_id, client_id
      ) g JOIN chat_msgs m
        ON m.counselor_id = g.counselor_id AND m.client_id = g.client_id AND m.ts = g.mts
      WHERE m.sender = 'client'`).first() || {};
    const gross = r.gross || 0;
    const SPLIT2 = { counselor: 70, hospital: 10, pg: 3, platform: 17 };
    return json6({
      // 앱의 운영자 콘솔이 기대하는 모양 그대로 (여기가 어긋나면 화면이 빈칸이 된다)
      uniqueClients: Math.max(r.clientsA || 0, r.clientsB || 0),
      counselors: r.counselors || 0,
      bookings: {
        total: r.bkTotal || 0,
        upcoming: r.bkUpcoming || 0,
        done: r.bkDone || 0,
        cancelled: r.bkCancelled || 0
      },
      chat: { threads: r.threads || 0, awaiting: aw.n || 0 },
      inbox: { total: r.ibTotal || 0, unread: r.ibUnread || 0 },
      reviews: { count: r.rvCount || 0, avg: Math.round((r.rvAvg || 0) * 10) / 10 },
      revenue: {
        gross,
        platform: Math.round(gross * SPLIT2.platform / 100),
        counselor: Math.round(gross * SPLIT2.counselor / 100),
        hospital: Math.round(gross * SPLIT2.hospital / 100),
        pg: Math.round(gross * SPLIT2.pg / 100),
        split: SPLIT2
      },
      // 메일 발송 설정 상태는 운영자만 본다 (로그인 응답에 담으면 가입 여부가 샌다)
      mailReady: !!env.RESEND_API_KEY,
      counselorsWithoutEmail: r.noMail || 0
    }, 200, cors);
  }
  if (path === "/badge" && method === "GET") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    const since = Math.max(0, num(q("since")));
    const t = Date.now();
    const res = await db.batch([
      db.prepare("SELECT COUNT(*) n FROM inbox WHERE counselor_id = ? AND read_at = 0").bind(me.id),
      db.prepare("SELECT COUNT(*) n FROM chat_msgs WHERE counselor_id = ? AND sender = 'client' AND ts > ?").bind(me.id, since),
      db.prepare("SELECT COUNT(*) n FROM bookings WHERE counselor_id = ? AND created > ?").bind(me.id, since),
      db.prepare("SELECT COUNT(*) n FROM calls WHERE counselor_id = ? AND end_at = 0 AND connect_at = 0 AND ring_at > ?").bind(me.id, t - 6e4)
    ]);
    const nOf = /* @__PURE__ */ __name((i) => {
      const r = res[i] && res[i].results && res[i].results[0];
      return r ? Number(r.n || 0) : 0;
    }, "nOf");
    const inbox = nOf(0), chats = nOf(1), bookings = nOf(2), ringing = nOf(3);
    return json6({
      ok: true,
      inbox,
      chats,
      bookings,
      ringing,
      total: inbox + chats + bookings + ringing,
      now: t
    }, 200, cors);
  }
  if (path === "/me") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    if (method === "GET") {
      const c = await db.prepare(
        `SELECT id,name,hospital,email,tel,addr,intro,tags,price,call_rate,license,
                slots,offdays,bank,bank_no,bank_holder,available,updated
           FROM counselors WHERE id = ?`
      ).bind(me.id).first();
      return json6({ ok: true, me: rowProfile(c) }, 200, cors);
    }
    if (method === "POST") {
      const p = {
        hospital: s(body.hospital, 120),
        tel: s(body.tel, 40),
        addr: s(body.addr, 200),
        intro: s(body.intro, 600),
        license: s(body.license, 80),
        price: Math.max(0, Math.min(1e6, num(body.price))),
        call_rate: Math.max(0, Math.min(1e5, num(body.callRate)))
      };
      let tags = "";
      try {
        const t = Array.isArray(body.tags) ? body.tags : [];
        tags = JSON.stringify(t.map((x) => s(x, 20)).filter(Boolean).slice(0, 6));
      } catch (e) {
        tags = "[]";
      }
      await db.prepare(
        `UPDATE counselors SET hospital=?, tel=?, addr=?, intro=?, license=?,
                price=?, call_rate=?, tags=?, updated=? WHERE id=?`
      ).bind(
        p.hospital,
        p.tel,
        p.addr,
        p.intro,
        p.license,
        p.price,
        p.call_rate,
        tags,
        nowMs5(),
        me.id
      ).run();
      return json6({ ok: true }, 200, cors);
    }
  }
  if (path === "/me/slots" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    const clean = {};
    const src = body.slots && typeof body.slots === "object" ? body.slots : {};
    for (let d = 0; d <= 6; d++) {
      const list = Array.isArray(src[d]) ? src[d] : Array.isArray(src[String(d)]) ? src[String(d)] : [];
      const ok = [...new Set(list.map((x) => String(x)).filter((x) => /^([01]\d|2[0-3]):(00|30)$/.test(x)))].sort();
      if (ok.length) clean[d] = ok.slice(0, 48);
    }
    const off = [...new Set((Array.isArray(body.offdays) ? body.offdays : []).map((x) => String(x)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].slice(0, 120);
    await db.prepare("UPDATE counselors SET slots=?, offdays=?, updated=? WHERE id=?").bind(JSON.stringify(clean), JSON.stringify(off), nowMs5(), me.id).run();
    return json6({ ok: true, slots: clean, offdays: off }, 200, cors);
  }
  if (path === "/me/payout" && method === "POST") {
    const me = await whoami(db, cred);
    if (!me) return json6({ error: "bad-code" }, 403, cors);
    const bank = s(body.bank, 40).trim();
    const noRaw = s(body.bankNo, 40).replace(/[^0-9-]/g, "");
    const holder = s(body.bankHolder, 40).trim();
    if (!bank || !noRaw || !holder) return json6({ error: "\uC740\uD589\xB7\uACC4\uC88C\uBC88\uD638\xB7\uC608\uAE08\uC8FC\uB97C \uBAA8\uB450 \uC801\uC5B4\uC8FC\uC138\uC694" }, 400, cors);
    if (noRaw.replace(/-/g, "").length < 8) return json6({ error: "\uACC4\uC88C\uBC88\uD638\uAC00 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4" }, 400, cors);
    await db.prepare("UPDATE counselors SET bank=?, bank_no=?, bank_holder=?, updated=? WHERE id=?").bind(bank, noRaw, holder, nowMs5(), me.id).run();
    await db.prepare("INSERT INTO payout_changes (id, counselor_id, masked, ts) VALUES (?,?,?,?)").bind(rid3("pc"), me.id, maskAcct(noRaw), nowMs5()).run();
    return json6({ ok: true, masked: maskAcct(noRaw) }, 200, cors);
  }
  if (path === "/slots" && method === "GET") {
    const cid = s(q("counselorId"), MAX.id);
    if (!cid) return json6({ slots: {}, offdays: [] }, 200, cors);
    const c = await db.prepare("SELECT slots, offdays, price FROM counselors WHERE id = ? AND active = 1").bind(cid).first();
    if (!c) return json6({ slots: {}, offdays: [] }, 200, cors);
    return json6({
      slots: safeJson(c.slots, {}),
      offdays: safeJson(c.offdays, []),
      price: c.price || 0
    }, 200, cors);
  }
  if (path === "/apply" && method === "POST") {
    const clientId = s(body.clientId, MAX.id);
    const name = s(body.name).trim();
    if (!clientId || !name) return json6({ error: "\uC774\uB984\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694" }, 400, cors);
    const acct = s(body.bankNo, 40).replace(/[^0-9-]/g, "");
    if (!s(body.bank, 40).trim() || !acct || !s(body.bankHolder, 40).trim()) {
      return json6({ error: "\uC815\uC0B0 \uACC4\uC88C\uB97C \uBAA8\uB450 \uC801\uC5B4\uC8FC\uC138\uC694" }, 400, cors);
    }
    if (!isAdmin(env, code)) {
      const dup = await db.prepare(
        "SELECT id FROM applications WHERE client_id = ? AND status = 'pending'"
      ).bind(clientId).first();
      if (dup) return json6({ error: "\uC774\uBBF8 \uC2EC\uC0AC \uC911\uC778 \uC2E0\uCCAD\uC774 \uC788\uC5B4\uC694" }, 409, cors);
    }
    const id = rid3("ca");
    let tags = "[]";
    try {
      tags = JSON.stringify((Array.isArray(body.tags) ? body.tags : []).map((x) => s(x, 20)).slice(0, 3));
    } catch (e) {
    }
    await db.prepare(
      `INSERT INTO applications
       (id, client_id, name, license, career, price, intro, hospital, addr, tel, email,
        tags, photo, bank, bank_no, bank_holder, status, ts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
    ).bind(
      id,
      clientId,
      name,
      s(body.license, 80),
      s(body.career, 20),
      num(body.price),
      s(body.intro, 600),
      s(body.hospital, 120),
      s(body.addr, 200),
      s(body.tel, 40),
      s(body.email, 160).toLowerCase(),
      tags,
      s(body.photo, 2e5) || null,
      // 256px 리사이즈본이라 넉넉히
      s(body.bank, 40),
      acct,
      s(body.bankHolder, 40),
      nowMs5()
    ).run();
    const mail = s(body.email, 160).toLowerCase();
    if (mail) {
      const receipt = sendApplyReceipt(env, db, mail, name).catch(() => {
      });
      if (ctx && ctx.waitUntil) ctx.waitUntil(receipt);
      else await receipt;
    }
    return json6({ ok: true, id }, 200, cors);
  }
  if (path === "/apply" && method === "GET") {
    if (isAdmin(env, code)) {
      const r2 = await db.prepare("SELECT * FROM applications ORDER BY ts DESC LIMIT 200").all();
      return json6({ items: (r2.results || []).map((a) => rowApp(a, true)), scope: "admin" }, 200, cors);
    }
    const cid = s(q("clientId"), MAX.id);
    if (!cid) return json6({ items: [] }, 200, cors);
    const r = await db.prepare(
      "SELECT * FROM applications WHERE client_id = ? ORDER BY ts DESC LIMIT 10"
    ).bind(cid).all();
    return json6({ items: (r.results || []).map((a) => rowApp(a, false)) }, 200, cors);
  }
  if (path === "/apply/approve" && method === "POST") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    const id = s(body.id, MAX.id);
    const a = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
    if (!a) return json6({ error: "not-found" }, 404, cors);
    if (a.status === "approved") return json6({ error: "\uC774\uBBF8 \uC2B9\uC778\uB41C \uC2E0\uCCAD\uC785\uB2C8\uB2E4" }, 400, cors);
    const cid = "c" + nowMs5().toString(36).slice(-6);
    const newCode = makeCode();
    await db.prepare(
      `INSERT INTO counselors (id, name, hospital, email, code, available, busy_until, active, created,
                               tel, addr, intro, tags, price, license, bank, bank_no, bank_holder, updated)
       VALUES (?,?,?,?,?,0,0,1,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      cid,
      a.name,
      a.hospital,
      a.email || null,
      newCode,
      nowMs5(),
      a.tel,
      a.addr,
      a.intro,
      a.tags,
      a.price,
      a.license,
      a.bank,
      a.bank_no,
      a.bank_holder,
      nowMs5()
    ).run();
    await db.prepare("UPDATE applications SET status='approved', counselor_id=?, decided_at=? WHERE id=?").bind(cid, nowMs5(), id).run();
    let mailed = null;
    if (a.email) mailed = await sendCodeMail(env, db, a.email, a.name, newCode, env.APP_URL);
    return json6({
      ok: true,
      counselorId: cid,
      name: a.name,
      code: newCode,
      email: a.email || "",
      mailed: mailed ? mailed.sent : null
    }, 200, cors);
  }
  if (path === "/apply/reject" && method === "POST") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    await db.prepare("UPDATE applications SET status='rejected', reject_why=?, decided_at=? WHERE id=?").bind(s(body.why, 300) || "\uC694\uAC74 \uBBF8\uCDA9\uC871", nowMs5(), s(body.id, MAX.id)).run();
    return json6({ ok: true }, 200, cors);
  }
  if (path.startsWith("/admin/counselors")) {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    if (path === "/admin/counselors" && method === "GET") {
      const r = await db.prepare(
        "SELECT id, name, hospital, email, code, available, busy_until, active, created FROM counselors ORDER BY created DESC"
      ).all();
      return json6({ items: r.results || [] }, 200, cors);
    }
    if (path === "/admin/counselors" && method === "POST") {
      const id = s(body.id, MAX.id).trim();
      const name = s(body.name).trim();
      if (!id || !name) return json6({ error: "id\xB7name \uD544\uC694" }, 400, cors);
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return json6({ error: "id \uB294 \uC601\uBB38\xB7\uC22B\uC790\uB9CC" }, 400, cors);
      const dup = await db.prepare("SELECT id FROM counselors WHERE id = ?").bind(id).first();
      if (dup) return json6({ error: "\uC774\uBBF8 \uC788\uB294 ID \uC785\uB2C8\uB2E4" }, 409, cors);
      const email = s(body.email, 160).trim().toLowerCase();
      if (email) {
        const de = await db.prepare("SELECT id FROM counselors WHERE email = ?").bind(email).first();
        if (de) return json6({ error: "\uC774\uBBF8 \uC4F0\uC774\uB294 \uC774\uBA54\uC77C\uC785\uB2C8\uB2E4" }, 409, cors);
      }
      const newCode = makeCode();
      await db.prepare(
        `INSERT INTO counselors (id, name, hospital, email, code, available, busy_until, active, created)
         VALUES (?,?,?,?,?,0,0,1,?)`
      ).bind(id, name, s(body.hospital, 120), email || null, newCode, nowMs5()).run();
      let mailed = null;
      if (email) mailed = await sendCodeMail(env, db, email, name, newCode, env.APP_URL);
      return json6({ ok: true, id, name, email, code: newCode, mailed: mailed ? mailed.sent : null }, 200, cors);
    }
    if (path === "/admin/counselors/email" && method === "POST") {
      const id = s(body.id, MAX.id);
      const email = s(body.email, 160).trim().toLowerCase();
      if (!email) return json6({ error: "\uC774\uBA54\uC77C\uC774 \uBE44\uC5C8\uC2B5\uB2C8\uB2E4" }, 400, cors);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json6({ error: "\uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4" }, 400, cors);
      const de = await db.prepare("SELECT id FROM counselors WHERE email = ? AND id != ?").bind(email, id).first();
      if (de) return json6({ error: "\uC774\uBBF8 \uC4F0\uC774\uB294 \uC774\uBA54\uC77C\uC785\uB2C8\uB2E4" }, 409, cors);
      await db.prepare("UPDATE counselors SET email = ? WHERE id = ?").bind(email, id).run();
      await db.prepare("DELETE FROM sessions WHERE counselor_id = ?").bind(id).run();
      return json6({ ok: true, email }, 200, cors);
    }
    if (path === "/admin/counselors/rotate" && method === "POST") {
      const id = s(body.id, MAX.id);
      const newCode = makeCode();
      await db.prepare("UPDATE counselors SET code = ? WHERE id = ?").bind(newCode, id).run();
      const who = await db.prepare("SELECT name, email FROM counselors WHERE id = ?").bind(id).first();
      let mailed = null;
      if (who && who.email) mailed = await sendCodeMail(env, db, who.email, who.name, newCode, env.APP_URL);
      return json6({ ok: true, id, code: newCode, mailed: mailed ? mailed.sent : null }, 200, cors);
    }
    if (path === "/admin/counselors/active" && method === "POST") {
      const id = s(body.id, MAX.id);
      await db.prepare("UPDATE counselors SET active = ? WHERE id = ?").bind(body.active ? 1 : 0, id).run();
      return json6({ ok: true }, 200, cors);
    }
    if (path === "/admin/counselors/delete" && method === "POST") {
      const id = s(body.id, MAX.id);
      if (body.confirm !== id) return json6({ error: "confirm \uBD88\uC77C\uCE58" }, 400, cors);
      for (const t of [
        "chat_msgs",
        "inbox",
        "bookings",
        "call_queue",
        "reviews",
        "homework",
        "calls",
        "sessions",
        "login_tokens",
        "push_subs"
      ]) {
        await db.prepare(`DELETE FROM ${t} WHERE counselor_id = ?`).bind(id).run();
      }
      await db.prepare("UPDATE applications SET status = 'delisted' WHERE counselor_id = ?").bind(id).run();
      await db.prepare("DELETE FROM counselors WHERE id = ?").bind(id).run();
      return json6({ ok: true }, 200, cors);
    }
  }
  if (path === "/maillog" && method === "GET") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    const r = await db.prepare(
      "SELECT addr, ok, reason, detail, ts FROM mail_log ORDER BY ts DESC LIMIT 30"
    ).all();
    const items = (r.results || []).map((x) => ({
      addr: x.addr,
      ok: !!x.ok,
      reason: x.reason || "",
      detail: x.detail || "",
      ts: x.ts
    }));
    return json6({ items, fails: items.filter((x) => !x.ok).length }, 200, cors);
  }
  if (path === "/purge" && method === "POST") {
    if (!isAdmin(env, code)) return json6({ error: "bad-code" }, 403, cors);
    const cut = nowMs5() - KEEP_MS;
    await db.prepare("DELETE FROM chat_msgs WHERE ts < ?").bind(cut).run();
    await db.prepare("DELETE FROM inbox WHERE ts < ?").bind(cut).run();
    await db.prepare("DELETE FROM call_queue WHERE ts < ?").bind(nowMs5() - 36e5).run();
    return json6({ ok: true }, 200, cors);
  }
  return null;
}
__name(handleMarket, "handleMarket");
function safeJson(v, fb) {
  try {
    return v ? JSON.parse(v) : fb;
  } catch (e) {
    return fb;
  }
}
__name(safeJson, "safeJson");
function maskAcct(n) {
  const d = String(n || "").replace(/[^0-9]/g, "");
  if (d.length < 4) return "****";
  return "*".repeat(Math.max(3, d.length - 4)) + d.slice(-4);
}
__name(maskAcct, "maskAcct");
var SPLIT = { counselor: 70, hospital: 10, pg: 3, platform: 17 };
function payoutOf(price) {
  const p = Math.max(0, Math.round(price || 0));
  const counselor = Math.round(p * SPLIT.counselor / 100);
  const hospital = Math.round(p * SPLIT.hospital / 100);
  const pg = Math.round(p * SPLIT.pg / 100);
  return { gross: p, counselor, hospital, pg, platform: p - counselor - hospital - pg, split: SPLIT };
}
__name(payoutOf, "payoutOf");
var rowApp = /* @__PURE__ */ __name((a, admin) => ({
  id: a.id,
  name: a.name,
  license: a.license || "",
  career: a.career || "",
  price: a.price || 0,
  intro: a.intro || "",
  hospital: a.hospital || "",
  addr: a.addr || "",
  tel: a.tel || "",
  email: a.email || "",
  tags: safeJson(a.tags, []),
  photo: a.photo || null,
  status: a.status,
  rejectWhy: a.reject_why || "",
  counselorId: a.counselor_id || "",
  ts: a.ts,
  decidedAt: a.decided_at || 0,
  bank: a.bank_no ? { bank: a.bank || "", holder: a.bank_holder || "", masked: maskAcct(a.bank_no) } : null,
  ...admin ? { clientId: a.client_id } : {}
}), "rowApp");
var rowHw = /* @__PURE__ */ __name((h) => ({
  id: h.id,
  counselorId: h.counselor_id,
  counselor: h.counselor,
  clientId: h.client_id,
  bookingId: h.booking_id,
  text: h.text,
  why: h.why || "",
  dueAt: h.due_at,
  assignedAt: h.assigned_at,
  doneAt: h.done_at,
  note: h.note || ""
}), "rowHw");
function rowProfile(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    hospital: c.hospital || "",
    email: c.email || "",
    tel: c.tel || "",
    addr: c.addr || "",
    intro: c.intro || "",
    license: c.license || "",
    tags: safeJson(c.tags, []),
    price: c.price || 0,
    callRate: c.call_rate || 0,
    slots: safeJson(c.slots, {}),
    offdays: safeJson(c.offdays, []),
    available: !!c.available,
    updated: c.updated || 0,
    payout: c.bank_no ? { bank: c.bank || "", holder: c.bank_holder || "", masked: maskAcct(c.bank_no), set: true } : { set: false }
  };
}
__name(rowProfile, "rowProfile");
var rowBooking = /* @__PURE__ */ __name((r) => ({
  id: r.id,
  counselorId: r.counselor_id,
  name: r.counselor_name,
  clientId: r.client_id,
  clientName: r.client_name,
  whenTs: r.when_ts,
  time: r.time_label,
  price: r.price,
  status: r.status,
  // 상담 이후 흐름 — 화면이 '지금 누가 무엇을 할 차례인지' 판단하는 근거
  doneAt: r.done_at || 0,
  confirmAt: r.confirm_at || 0,
  autoAt: r.auto_at || 0,
  settledAt: r.settled_at || 0,
  refund: r.refund || 0,
  refundAt: r.refund_at || 0,
  refundWhy: r.refund_why || "",
  dispute: r.dispute || "",
  disputeAt: r.dispute_at || 0,
  payout: payoutOf(r.price || 0)
  // cnote(상담사 메모)는 일부러 뺀다 — 내담자에게 나가면 안 된다
}), "rowBooking");
var rowInbox = /* @__PURE__ */ __name((r) => ({
  id: r.id,
  counselorId: r.counselor_id,
  counselorName: r.counselor_name,
  bookingId: r.booking_id,
  clientName: r.client_name,
  text: r.body,
  read: !!r.read_at,
  ts: r.ts
}), "rowInbox");
var rowReview = /* @__PURE__ */ __name((r) => ({
  id: r.id,
  counselorId: r.counselor_id,
  clientName: r.client_name,
  rating: r.rating,
  text: r.body,
  ts: r.ts,
  reply: r.reply ? { text: r.reply, ts: r.reply_ts } : null
}), "rowReview");
var rowMsg = /* @__PURE__ */ __name((r) => ({
  id: r.id,
  counselorId: r.counselor_id,
  counselorName: r.counselor_name,
  clientId: r.client_id,
  clientName: r.client_name,
  from: r.sender,
  text: r.body,
  ts: r.ts
}), "rowMsg");

// hub.js
var ChatHub = class {
  static {
    __name(this, "ChatHub");
  }
  constructor(state, env) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/publish" && request.method === "POST") {
      const text = await request.text();
      let n = 0;
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(text);
          n++;
        } catch (e) {
        }
      }
      return new Response(JSON.stringify({ ok: true, sent: n }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("not found", { status: 404 });
  }
  // 클라이언트의 생존 확인에만 답한다 — 대화 내용은 이 소켓으로 받지 않는다
  //  (쓰기는 전부 기존 HTTP 경로 → D1 저장 → publish. 소켓은 읽기 전용이라
  //   인증·마스킹·스로틀 같은 규칙이 한 곳에 남는다)
  webSocketMessage(ws, msg) {
    if (msg === "ping") {
      try {
        ws.send("pong");
      } catch (e) {
      }
    }
  }
  webSocketClose(ws) {
    try {
      ws.close();
    } catch (e) {
    }
  }
  webSocketError(ws) {
    try {
      ws.close();
    } catch (e) {
    }
  }
};

// cbtproxy.worker.js
var ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o"];
var ALLOWED_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];
var ALLOWED_VOICES = ["coral", "nova", "shimmer", "sage", "alloy", "echo", "ash", "onyx", "fable"];
var MAX_TOKENS_CAP = 8e3;
var MAX_MESSAGES = 40;
var MAX_TTS_CHARS = 2e3;
var LIMIT = {
  ip: 600,
  // 한 IP 하루 (가족·공용 와이파이·통신사 NAT 를 감안해 넉넉히)
  client: 400,
  // 한 기기 하루 (앱의 HARD_DAILY 와 같은 선)
  all: 3e5
  // 전체 하루 — 마지막 안전판. 이걸 넘으면 뭔가 잘못된 것이다
};
var utcDay = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "utcDay");
var UPSERT = `INSERT INTO usage (day, kind, key, n, first, last) VALUES (?,?,?,1,?,?)
   ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1, last = excluded.last
   RETURNING n`;
async function bumpAll(db, pairs) {
  const day = utcDay(), t = Date.now();
  const res = await db.batch(pairs.map(([kind, key2]) => db.prepare(UPSERT).bind(day, kind, String(key2).slice(0, 80), t, t)));
  return res.map((r) => {
    const rows = r && (r.results || r);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row && row.n || 0;
  });
}
__name(bumpAll, "bumpAll");
async function noteBlock(db, kind, key2, n) {
  try {
    await db.prepare("INSERT INTO blocks (id, day, kind, key, n, ts) VALUES (?,?,?,?,?,?)").bind(
      "bk_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      utcDay(),
      kind,
      String(key2).slice(0, 80),
      n,
      Date.now()
    ).run();
  } catch (e) {
  }
}
__name(noteBlock, "noteBlock");
async function abuseCheck(request, env, body) {
  if (!env.DB) return null;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const client = String(body && body.clientId || "").slice(0, 64) || "anon";
  try {
    const [nAll, nIp, nClient] = await bumpAll(env.DB, [
      ["all", "total"],
      ["ip", ip],
      ["client", client]
    ]);
    if (nAll > LIMIT.all) {
      await noteBlock(env.DB, "all", "total", nAll);
      return "all";
    }
    if (nIp > LIMIT.ip) {
      await noteBlock(env.DB, "ip", ip, nIp);
      return "ip";
    }
    if (nClient > LIMIT.client) {
      await noteBlock(env.DB, "client", client, nClient);
      return "client";
    }
  } catch (e) {
    return null;
  }
  return null;
}
__name(abuseCheck, "abuseCheck");
var cbtproxy_worker_default = {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    if (path === "/ws") {
      const u = new URL(request.url);
      const ch = (u.searchParams.get("ch") || "").slice(0, 120);
      if (!/^(c|cl):[\w-]{1,80}$/.test(ch)) return json7({ error: "bad-channel" }, 400, cors);
      if (ch.startsWith("c:") && env.DB) {
        const me = await resolveCounselor(env.DB, {
          session: (u.searchParams.get("session") || "").slice(0, 128),
          code: (u.searchParams.get("code") || "").slice(0, 64)
        }).catch(() => null);
        if (!me || "c:" + me.id !== ch) return json7({ error: "forbidden" }, 403, cors);
      }
      if (!env.HUB) return json7({ error: "no-hub" }, 503, cors);
      const stub = env.HUB.get(env.HUB.idFromName(ch));
      return stub.fetch("https://hub/connect", request);
    }
    if (!/^\/(tts|chat)?$/.test(path)) {
      const r = await handleMarket(request, env, cors, path, ctx);
      if (r) return r;
    }
    if (request.method !== "POST") return json7({ error: "Method not allowed" }, 405, cors);
    if (!env.OPENAI_API_KEY) return json7({ error: "Server not configured" }, 500, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json7({ error: "Bad JSON" }, 400, cors);
    }
    const blocked = await abuseCheck(request, env, body);
    if (blocked) {
      const msg = blocked === "client" ? "\uC624\uB298\uC740 \uC5EC\uAE30\uAE4C\uC9C0 \uD558\uACE0 \uC26C\uC5B4\uAC00\uC694. \uB0B4\uC77C \uB2E4\uC2DC \uB9CC\uB098\uC694." : "\uC9C0\uAE08 \uC694\uCCAD\uC774 \uBAB0\uB9AC\uACE0 \uC788\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.";
      return json7({ error: { message: msg, reason: blocked } }, 429, cors);
    }
    return path === "/tts" ? handleTts(body, env, cors) : handleChat(body, env, cors);
  }
};
async function handleChat(body, env, cors) {
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) return json7({ error: "messages required" }, 400, cors);
  const model = ALLOWED_MODELS.includes(body.model) ? body.model : "gpt-4o-mini";
  const max_tokens = Math.min(Number(body.max_tokens) || 600, MAX_TOKENS_CAP);
  const temperature = typeof body.temperature === "number" ? Math.max(0, Math.min(1.2, body.temperature)) : 0.75;
  const trimmed = messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages;
  const clamp2 = /* @__PURE__ */ __name((v) => typeof v === "number" ? Math.max(-2, Math.min(2, v)) : void 0, "clamp2");
  const payload = { model, messages: trimmed, temperature, max_tokens };
  const pp = clamp2(body.presence_penalty), fp = clamp2(body.frequency_penalty);
  if (pp !== void 0) payload.presence_penalty = pp;
  if (fp !== void 0) payload.frequency_penalty = fp;
  const wantStream = body.stream === true;
  if (wantStream) payload.stream = true;
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  if (wantStream && upstream.ok && upstream.body) {
    return new Response(upstream.body, {
      status: 200,
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  }
  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}
__name(handleChat, "handleChat");
async function handleTts(body, env, cors) {
  const input = typeof body.input === "string" ? body.input.slice(0, MAX_TTS_CHARS) : "";
  if (!input.trim()) return json7({ error: "input required" }, 400, cors);
  const model = ALLOWED_TTS_MODELS.includes(body.model) ? body.model : "gpt-4o-mini-tts";
  const voice = ALLOWED_VOICES.includes(body.voice) ? body.voice : "coral";
  const speed = Math.max(0.5, Math.min(2, Number(body.speed) || 1));
  const payload = { model, voice, input, speed, response_format: "mp3" };
  if (typeof body.instructions === "string") payload.instructions = body.instructions.slice(0, 500);
  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(err, { status: upstream.status, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { ...cors, "Content-Type": "audio/mpeg" }
  });
}
__name(handleTts, "handleTts");
function json7(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors || {}, "Content-Type": "application/json" }
  });
}
__name(json7, "json");
export {
  ChatHub,
  cbtproxy_worker_default as default
};
//# sourceMappingURL=cbtproxy.worker.js.map
