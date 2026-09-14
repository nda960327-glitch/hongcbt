// 느루의 추천 — 운영자가 올리는 정신건강 영상·글, 이용자의 '도움됐어요/별로예요'
//
//  · 목록은 D1(feed)에만 있다. 앱은 켤 때 받아서 기기에 사본을 둔다.
//  · 반응(feed_votes)은 기기(clientId)당 한 표. clientKey 로 본인 확인.
//  · 유튜브는 링크만 넣으면 oEmbed 로 제목·채널을 채운다 (썸네일은 i.ytimg.com 규칙).
//
//  경로 (앱은 /api/feed… 로 부르고 Worker 가 /api 를 떼어 넘긴다)
//    GET  /feed?clientId=          공개 목록 + 내 반응
//    POST /feed/vote {id, v, clientId, clientKey}   v: 1 | -1 | 0(취소)
//    GET  /feed/admin?code=        전체(비공개 포함) + 반응 수
//    POST /feed/save  {code, item} 새로 만들거나 고친다
//    POST /feed/delete {code, id}
import { json, isAdmin, verifyClient, s, nowMs } from './market.js';

const TAGS = ['불안', '우울', '수면', '관계', '자존감', '스트레스'];

const ytId = url => {
  const m = String(url || '').match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
};

const row = (r, mine) => ({
  id: r.id, type: r.type, title: r.title, url: r.url || '', videoId: r.video_id || '',
  thumb: r.thumb || '', author: r.author || '', body: r.body || '',
  tags: String(r.tags || '').split(',').filter(Boolean), note: r.note || '',
  pinned: !!r.pinned, published: !!r.published,
  up: r.up || 0, down: r.down || 0, mine: mine || 0, created: r.created || 0
});

const LIST_SQL = `SELECT f.*,
  (SELECT COUNT(*) FROM feed_votes v WHERE v.feed_id = f.id AND v.v = 1)  AS up,
  (SELECT COUNT(*) FROM feed_votes v WHERE v.feed_id = f.id AND v.v = -1) AS down
  FROM feed f`;

export async function handleFeed(request, env, cors, path) {
  if (!path.startsWith('/feed')) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);

  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const code = s(body.code || q('code'), 64);
  const cleanId = v => s(v, 64).replace(/[^\w-]/g, '');

  // ── 공개 목록 ──
  if (path === '/feed' && method === 'GET') {
    let rows = [];
    try {
      rows = (await db.prepare(LIST_SQL + ' WHERE f.published = 1 ORDER BY f.pinned DESC, f.created DESC LIMIT 200').all()).results || [];
    } catch (e) { return json({ items: [], missing: true }, 200, cors); }   // 표가 아직 없어도 앱은 조용히
    const mine = {};
    const cid = cleanId(q('clientId'));
    if (cid) {
      try {
        const r = await db.prepare('SELECT feed_id, v FROM feed_votes WHERE client_id = ?').bind(cid).all();
        (r.results || []).forEach(x => { mine[x.feed_id] = x.v; });
      } catch (e) {}
    }
    return json({ items: rows.map(r => row(r, mine[r.id])), tags: TAGS }, 200, cors);
  }

  // ── 반응 ──
  if (path === '/feed/vote' && method === 'POST') {
    const cid = cleanId(body.clientId);
    const id = cleanId(body.id);
    const v = body.v === 1 || body.v === '1' ? 1 : body.v === -1 || body.v === '-1' ? -1 : 0;
    if (!cid || !id) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny')
      return json({ error: 'forbidden' }, 403, cors);
    if (v === 0) {
      await db.prepare('DELETE FROM feed_votes WHERE feed_id = ? AND client_id = ?').bind(id, cid).run();
    } else {
      await db.prepare(`INSERT INTO feed_votes (feed_id, client_id, v, ts) VALUES (?,?,?,?)
        ON CONFLICT(feed_id, client_id) DO UPDATE SET v = excluded.v, ts = excluded.ts`)
        .bind(id, cid, v, nowMs()).run();
    }
    const c = await db.prepare(
      'SELECT SUM(CASE WHEN v = 1 THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN v = -1 THEN 1 ELSE 0 END) AS down FROM feed_votes WHERE feed_id = ?'
    ).bind(id).first() || {};
    return json({ ok: true, up: c.up || 0, down: c.down || 0, mine: v }, 200, cors);
  }

  // ── 이하 운영자 ──
  if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);

  if (path === '/feed/admin' && method === 'GET') {
    let rows = [];
    try { rows = (await db.prepare(LIST_SQL + ' ORDER BY f.pinned DESC, f.created DESC LIMIT 200').all()).results || []; }
    catch (e) { return json({ items: [], tags: TAGS, missing: true }, 200, cors); }
    return json({ items: rows.map(r => row(r, 0)), tags: TAGS }, 200, cors);
  }

  if (path === '/feed/save' && method === 'POST') {
    const it = body.item || {};
    const id = cleanId(it.id) || ('fd_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 6));
    const type = it.type === 'article' ? 'article' : 'youtube';
    let link = s(it.url, 300).trim();
    let title = s(it.title, 120).trim();
    let thumb = s(it.thumb, 300).trim();
    let author = s(it.author, 80).trim();
    let videoId = '';
    if (type === 'youtube') {
      videoId = ytId(link);
      if (!videoId) return json({ error: 'bad-url' }, 400, cors);
      link = 'https://www.youtube.com/watch?v=' + videoId;
      if (!thumb) thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      if (!title || !author) {
        try {
          const o = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(link),
            { headers: { 'User-Agent': 'Mozilla/5.0 (mindinside feed)' } });
          if (o.ok) {
            const j = await o.json();
            if (!title) title = s(j.title, 120);
            if (!author) author = s(j.author_name, 80);
          }
        } catch (e) {}
      }
    }
    if (!title) return json({ error: 'missing-title' }, 400, cors);
    const tags = (Array.isArray(it.tags) ? it.tags : String(it.tags || '').split(','))
      .map(t => s(t, 12).trim()).filter(Boolean).slice(0, 6).join(',');
    const t = nowMs();
    await db.prepare(`INSERT INTO feed (id, type, title, url, video_id, thumb, author, body, tags, note, published, pinned, created, updated)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET type = excluded.type, title = excluded.title, url = excluded.url,
        video_id = excluded.video_id, thumb = excluded.thumb, author = excluded.author, body = excluded.body,
        tags = excluded.tags, note = excluded.note, published = excluded.published, pinned = excluded.pinned,
        updated = excluded.updated`)
      .bind(id, type, title, link, videoId, thumb, author, s(it.body, 20000), tags, s(it.note, 200).trim(),
        it.published === false || it.published === 0 ? 0 : 1, it.pinned ? 1 : 0, t, t).run();
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/feed/delete' && method === 'POST') {
    const id = cleanId(body.id);
    if (!id) return json({ error: 'missing' }, 400, cors);
    await db.prepare('DELETE FROM feed_votes WHERE feed_id = ?').bind(id).run();
    await db.prepare('DELETE FROM feed WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, cors);
  }

  return null;
}
