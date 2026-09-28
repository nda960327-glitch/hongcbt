// 이용자 설문 (mindinside.kr/survey) — 구독료 정하기 + 앱 효과 체감
//
//  · 익명이다. IP·기기 ID·이름을 저장하지 않는다. 답만 JSON 으로 남긴다.
//  · 남용은 IP 로 막되(rate_hits) IP 자체는 키에만 잠깐 쓰고 버린다.
//  · 결과는 운영자 코드로만 본다 (mindinside.kr/survey/results.html).
//
//  경로 (Worker 가 /api 를 떼어 넘긴다)
//    POST /survey/submit  {v, answers}      → {ok}
//    GET  /survey/results?code=ADMIN        → {items:[{id, ts, v, answers}]}
//
//  테이블 (schema.sql 에도 있다)
//    survey_responses (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, ver INTEGER NOT NULL, data TEXT NOT NULL)
import { json, nowMs } from './market.js';

const MAX_BYTES = 12000;

export async function handleSurvey(request, env, cors, path) {
  if (!path.startsWith('/survey')) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const method = request.method;

  if (path === '/survey/submit' && method === 'POST') {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json({ error: 'too-big' }, 413, cors);
    let body = {};
    try { body = JSON.parse(raw); } catch (e) { return json({ error: 'bad-json' }, 400, cors); }
    const answers = body && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : null;
    if (!answers || !Object.keys(answers).length) return json({ error: 'empty' }, 400, cors);

    // 한 IP 에서 1시간에 5번까지 — 한 사람이 여러 번 내서 결과를 흔들지 못하게
    const ip = request.headers.get('cf-connecting-ip') || '?';
    const key = 'survey:' + ip, now = nowMs();
    try {
      const c = await db.prepare('SELECT COUNT(*) n FROM rate_hits WHERE key = ? AND ts > ?').bind(key, now - 3600000).first();
      if ((c && c.n) >= 5) return json({ error: 'too-many', message: '이미 여러 번 제출하셨어요. 감사합니다!' }, 429, cors);
      await db.prepare('INSERT INTO rate_hits (key, ts) VALUES (?,?)').bind(key, now).run();
    } catch (e) {}

    const id = 'sv_' + now.toString(36) + Math.random().toString(36).slice(2, 7);
    const ver = Number(body.v) || 1;
    try {
      await db.prepare('INSERT INTO survey_responses (id, ts, ver, data) VALUES (?,?,?,?)')
        .bind(id, now, ver, JSON.stringify(answers)).run();
    } catch (e) {
      return json({ error: 'migrate', message: 'survey_responses 테이블이 없습니다' }, 503, cors);
    }
    return json({ ok: true }, 200, cors);
  }

  if (path === '/survey/results' && method === 'GET') {
    const code = new URL(request.url).searchParams.get('code') || '';
    if (!env.ADMIN_CODE || code !== env.ADMIN_CODE) return json({ error: 'bad-code' }, 403, cors);
    let rows = [];
    try { rows = (await db.prepare('SELECT id, ts, ver, data FROM survey_responses ORDER BY ts DESC LIMIT 5000').all()).results || []; }
    catch (e) { return json({ items: [], missing: true }, 200, cors); }
    return json({
      items: rows.map(r => { let a = {}; try { a = JSON.parse(r.data); } catch (e) {} return { id: r.id, ts: r.ts, v: r.ver, answers: a }; })
    }, 200, cors);
  }

  return null;
}
