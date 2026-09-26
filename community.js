// 상담소 소식 — 제휴 상담소가 블로그처럼 글을 올리고, 이용자는 좋아요·댓글만 단다.
//
//  · 글은 상담소(소장 앱, hsession/hcode 인증)만 쓴다. 이용자는 글을 쓸 수 없다.
//  · 이용자 반응은 좋아요(기기당 1개)와 댓글. clientKey 로 본인 확인. 댓글은 본인이 지울 수 있고,
//    상담소는 자기 글의 댓글을 숨길 수 있다. 운영자는 글·댓글 모두 숨길 수 있다.
//  · 상담소 페이지(프로필: 소개·전화·주소·홈페이지·운영시간)는 hospitals 표의 profile 칸(JSON)에 둔다.
//  · 댓글은 짧고(500자) 연락처를 지운다 — 플랫폼 밖 직거래 유도를 막는 규칙은 채팅과 같다.
//
//  본문 표기(앱·소장 앱이 같은 규칙으로 그린다): **굵게** · '# ' 큰 글씨 · '## ' 제목 · {red|글}(색: red orange green blue purple gray) · [img:0] 사진
//  경로 (앱은 /api/… 로 부르고 Worker 가 /api 를 뗀다)
//    공개   GET  /community?clientId=&cursor=&hospital=      글 목록(발행된 것만) + 내 좋아요
//           GET  /community/post?id=&clientId=               글 하나 + 댓글
//           GET  /community/hospital?id=                     상담소 페이지(프로필 + 글 목록)
//    이용자 POST /community/like    {id, clientId, clientKey}            토글
//           POST /community/comment {id, text, name, clientId, clientKey}
//           POST /community/comment/delete {cid, clientId, clientKey}   본인 댓글
//    상담소 GET  /hospital/posts?hsession=            내 글 전체(초안 포함) + 댓글 수
//           POST /hospital/posts/save {hsession, post: {id?, title, body, tags, published, pinned}}
//           POST /hospital/posts/delete {hsession, id}
//           GET  /hospital/comments?hsession=&id=     내 글의 댓글(숨긴 것 포함)
//           POST /hospital/comments/hide {hsession, cid, hidden}
//           POST /hospital/profile {hsession, profile: {intro, tel, addr, url, hours}}
//    운영자 GET  /admin/community?code=   전체 글   POST /admin/community/hide {code, id, hidden}
//           POST /admin/community/comment/hide {code, cid, hidden}
import { json, isAdmin, verifyClient, s, nowMs } from './market.js';
import { resolveHospital } from './hospital.js';
import { sendHtml, mailWrap } from './auth.js';

const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const PAGE = 20;
const TITLE_MAX = 80, BODY_MAX = 6000, COMMENT_MAX = 500, NAME_MAX = 20, TAGS_MAX = 5;
const COMMENT_PER_10MIN = 6;         // 기기당 댓글 도배 방지
const POST_PER_DAY = 20;             // 상담소당 하루 글 수(실수로 스크립트가 돌아도 표가 터지지 않게)

// 전화번호·이메일·카톡 아이디 같은 연락처를 가린다 (chat 과 같은 규칙, 댓글은 공개 글이라 더 엄격)
const maskContact = t => String(t || '')
  .replace(/(\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, '[연락처]')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[이메일]')
  .replace(/(카톡|카카오톡|카카오|kakao|katalk|라인|line|텔레그램|telegram|인스타|insta)\s*(아이디|id|ID)?\s*[:：]?\s*[\w.-]{3,}/gi, '[아이디]');

const tagsOf = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(t => s(t, 12).trim()).filter(Boolean).slice(0, TAGS_MAX);

function profileOf(h) {
  let p = {};
  try { p = h && h.profile ? JSON.parse(h.profile) : {}; } catch (e) { p = {}; }
  return { intro: p.intro || '', tel: p.tel || '', addr: p.addr || '', url: p.url || '', hours: p.hours || '' };
}
const hospPublic = h => h ? { id: h.id, name: h.name, dept: h.dept || '', doctor: h.doctor || '', profile: profileOf(h) } : null;

// 화면 표기 기호를 뗀 순수 글 — 목록 발췌문과 검색용
const plainOf = b => String(b || '')
  .replace(/\[img:\d+\]/g, '').replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '$2')
  .replace(/\*\*/g, '').replace(/^#{1,2}\s+/gm, '').replace(/\s+/g, ' ').trim();
const parseImages = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, IMG_MAX) : []; } catch (e) { return []; } };
// 사진: 앱이 긴 변 640px·JPEG 로 줄여 보낸다. 서버가 다시 막는 이유는 상담사 사진(market.js checkPhoto)과 같다 —
//  fetch 한 줄이면 원본을 그대로 밀어 넣을 수 있고, 그러면 목록 응답이 통째로 무거워진다.
const IMG_MAX = 4, IMG_BYTES = 110 * 1024, THUMB_BYTES = 24 * 1024;
const jpegOk = (v, max) => typeof v === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= max;
function checkImages(list) {
  const arr = Array.isArray(list) ? list.slice(0, IMG_MAX) : [];
  for (const v of arr) if (!jpegOk(v, IMG_BYTES)) return null;
  return arr;
}

const rowPost = (r, mine) => ({
  id: r.id, hospitalId: r.hospital_id, hospital: r.hospital_name || '', dept: r.hospital_dept || '',
  title: r.title, body: r.body || '', excerpt: plainOf(r.body).slice(0, 120), thumb: r.thumb || '', images: r.images === undefined ? undefined : parseImages(r.images),
  tags: String(r.tags || '').split(',').filter(Boolean),
  published: !!r.published, pinned: !!r.pinned, hidden: !!r.hidden,
  likes: r.likes || 0, comments: r.comments || 0, mine: !!mine,
  created: r.created, updated: r.updated || r.created
});
const rowComment = c => ({
  id: c.id, postId: c.post_id, clientId: c.client_id, name: c.name || '익명', text: c.text,
  ts: c.ts, hidden: !!c.hidden, byHospital: !!c.by_hospital
});

const LIST_COLS = 'p.id, p.hospital_id, p.title, p.body, p.tags, p.published, p.pinned, p.hidden, p.created, p.updated, p.thumb';
const LIST_SQL = `SELECT ${LIST_COLS}, h.name AS hospital_name, h.dept AS hospital_dept,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comments
  FROM posts p JOIN hospitals h ON h.id = p.hospital_id`;

export async function handleCommunity(request, env, cors, path) {
  if (!/^\/(community|hospital\/(posts|comments|profile)|admin\/community|admin\/hospital-apps)/.test(path)) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);

  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const cleanId = v => s(v, 64).replace(/[^\w-]/g, '');
  const noTable = e => /no such table/i.test(String(e && e.message || e));

  // 내 좋아요 — 목록에 표시할 때만 쓴다. 키가 틀려도 목록은 준다(좋아요 표시만 빠진다).
  const myLikes = async (cid, ids) => {
    if (!cid || !ids.length) return new Set();
    const r = await db.prepare(`SELECT post_id FROM post_likes WHERE client_id = ? AND post_id IN (${ids.map(() => '?').join(',')})`)
      .bind(cid, ...ids).all();
    return new Set((r.results || []).map(x => x.post_id));
  };

  // ══════════════ 공개 ══════════════
  if (path === '/community' && method === 'GET') {
    const cid = cleanId(q('clientId'));
    const cursor = Number(q('cursor')) || 0;
    const hosp = cleanId(q('hospital'));
    let rows = [];
    try {
      rows = (await db.prepare(LIST_SQL + ` WHERE p.published = 1 AND p.hidden = 0 AND h.active = 1
        ${hosp ? 'AND p.hospital_id = ?' : ''} ${cursor ? 'AND p.created < ?' : ''}
        ORDER BY ${hosp ? 'p.pinned DESC, ' : ''}p.created DESC LIMIT ?`)
        .bind(...[hosp, cursor].filter(Boolean), PAGE + 1).all()).results || [];
    } catch (e) { if (noTable(e)) return json({ items: [], next: 0, missing: true }, 200, cors); throw e; }
    const more = rows.length > PAGE;
    if (more) rows.pop();
    const likes = await myLikes(cid, rows.map(r => r.id));
    return json({ items: rows.map(r => rowPost(r, likes.has(r.id))), next: more ? rows[rows.length - 1].created : 0 }, 200, cors);
  }

  // ── 상담소 직접 등록 신청 (공개) ──
  //  운영자가 콘솔에서 대신 넣던 것을 상담소가 앱에서 직접 낸다. 심사 뒤 승인하면 hospitals 에 들어가고 소장에게 로그인 안내가 간다.
  if (path === '/community/hospital-apply' && method === 'POST') {
    const name = s(body.name, 60).trim(), doctor = s(body.doctor, 40).trim(), email = s(body.email, 160).trim().toLowerCase();
    if (!name || !doctor || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'missing' }, 400, cors);
    const cid = cleanId(body.clientId) || 'anon';
    const dup = await db.prepare("SELECT id FROM hospital_apps WHERE lower(email) = ? AND status = 'pending'").bind(email).first();
    if (dup) return json({ error: 'dup', message: '이미 심사 중인 신청이 있어요' }, 409, cors);
    const doc = jpegOk(body.doc, 200 * 1024) ? body.doc : '';
    const id = rid('ha');
    await db.prepare(`INSERT INTO hospital_apps (id, client_id, name, doctor, email, tel, addr, bizno, dept, intro, hours, url, doc, status, ts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`)
      .bind(id, cid, name, doctor, email, s(body.tel, 30).replace(/[^0-9-+ ]/g, ''), s(body.addr, 200).trim(), s(body.bizno, 20).replace(/[^0-9-]/g, ''),
        s(body.dept, 40).trim(), s(body.intro, 600).trim(), s(body.hours, 200).trim(), s(body.url, 200).trim(), doc, nowMs()).run();
    sendHtml(env, db, email, '[마인드 인사이드] 상담소 제휴 신청이 접수됐습니다', mailWrap('마인드 인사이드', name + ' 제휴 신청이 접수됐습니다', `
      <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">보내주신 상담소 정보를 확인하고 있습니다.<br><b>2~3일 안에</b> 승인 여부를 이 주소로 알려드릴게요.</p>
      <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
        <p style="font-size:13px;font-weight:700;margin:0 0 8px;">승인되면 이렇게 진행돼요</p>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0;">1. 이 주소로 <b>소장 앱(doc.neurumind.com) 로그인 안내</b>와 상담소 코드가 갑니다<br>2. 내담자는 앱에서 상담소 코드로 상담소와 연결됩니다<br>3. 소속 상담사는 등록할 때 이 상담소를 고를 수 있고, 상담료는 상담소로 정산됩니다(상담소 90% · 앱 7% · 결제 수수료 3%)<br>4. 제휴계약서는 승인 메일과 함께 보내드립니다</p>
      </div>
      <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">문의: <a href="mailto:help@neurumind.com" style="color:#4f8a6b;">help@neurumind.com</a></p>`)).catch(() => {});
    return json({ ok: true, id }, 200, cors);
  }

  if (path === '/community/hospitals' && method === 'GET') {
    const rows = (await db.prepare('SELECT id, name, dept, profile FROM hospitals WHERE active = 1 ORDER BY name').all()).results || [];
    return json({ items: rows.map(h => ({ id: h.id, name: h.name, dept: h.dept || '', addr: profileOf(h).addr })) }, 200, cors);
  }

  if (path === '/community/post' && method === 'GET') {
    const id = cleanId(q('id')), cid = cleanId(q('clientId'));
    if (!id) return json({ error: 'missing' }, 400, cors);
    const r = await db.prepare(LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images') + ' WHERE p.id = ? AND p.published = 1 AND p.hidden = 0').bind(id).first();
    if (!r) return json({ error: 'not-found' }, 404, cors);
    const likes = await myLikes(cid, [id]);
    const cm = (await db.prepare('SELECT * FROM post_comments WHERE post_id = ? AND hidden = 0 ORDER BY ts ASC LIMIT 200').bind(id).all()).results || [];
    const hosp = await db.prepare('SELECT * FROM hospitals WHERE id = ?').bind(r.hospital_id).first();
    return json({ ok: true, post: rowPost(r, likes.has(id)), comments: cm.map(rowComment), hospital: hospPublic(hosp) }, 200, cors);
  }

  if (path === '/community/hospital' && method === 'GET') {
    const id = cleanId(q('id')), cid = cleanId(q('clientId'));
    const h = await db.prepare('SELECT * FROM hospitals WHERE id = ? AND active = 1').bind(id).first();
    if (!h) return json({ error: 'not-found' }, 404, cors);
    let rows = [];
    try {
      rows = (await db.prepare(LIST_SQL + ' WHERE p.hospital_id = ? AND p.published = 1 AND p.hidden = 0 ORDER BY p.pinned DESC, p.created DESC LIMIT 50').bind(id).all()).results || [];
    } catch (e) { if (!noTable(e)) throw e; }
    const likes = await myLikes(cid, rows.map(r => r.id));
    const stat = await db.prepare('SELECT COUNT(*) n FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0').bind(id).first();
    return json({ ok: true, hospital: hospPublic(h), linked: (stat && stat.n) || 0, items: rows.map(r => rowPost(r, likes.has(r.id))) }, 200, cors);
  }

  // ══════════════ 이용자 반응 ══════════════
  if (path === '/community/like' && method === 'POST') {
    const cid = cleanId(body.clientId), id = cleanId(body.id);
    if (!cid || !id) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const p = await db.prepare('SELECT id FROM posts WHERE id = ? AND published = 1 AND hidden = 0').bind(id).first();
    if (!p) return json({ error: 'not-found' }, 404, cors);
    const had = await db.prepare('SELECT 1 x FROM post_likes WHERE post_id = ? AND client_id = ?').bind(id, cid).first();
    if (had) await db.prepare('DELETE FROM post_likes WHERE post_id = ? AND client_id = ?').bind(id, cid).run();
    else await db.prepare('INSERT INTO post_likes (post_id, client_id, ts) VALUES (?,?,?)').bind(id, cid, nowMs()).run();
    const c = await db.prepare('SELECT COUNT(*) n FROM post_likes WHERE post_id = ?').bind(id).first();
    return json({ ok: true, likes: (c && c.n) || 0, mine: !had }, 200, cors);
  }

  if (path === '/community/comment' && method === 'POST') {
    const cid = cleanId(body.clientId), id = cleanId(body.id);
    const text = maskContact(s(body.text, COMMENT_MAX)).trim();
    const name = s(body.name, NAME_MAX).trim() || '익명';
    if (!cid || !id || !text) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const p = await db.prepare('SELECT id FROM posts WHERE id = ? AND published = 1 AND hidden = 0').bind(id).first();
    if (!p) return json({ error: 'not-found' }, 404, cors);
    const recent = await db.prepare('SELECT COUNT(*) n FROM post_comments WHERE client_id = ? AND ts > ?').bind(cid, nowMs() - 600000).first();
    if ((recent && recent.n) >= COMMENT_PER_10MIN) return json({ error: 'too-many' }, 429, cors);
    const c = { id: rid('cm'), post_id: id, client_id: cid, name, text, ts: nowMs(), hidden: 0, by_hospital: 0 };
    await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital) VALUES (?,?,?,?,?,?,0,0)')
      .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts).run();
    return json({ ok: true, comment: rowComment(c) }, 200, cors);
  }

  if (path === '/community/comment/delete' && method === 'POST') {
    const cid = cleanId(body.clientId), cmid = cleanId(body.cid);
    if (!cid || !cmid) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const r = await db.prepare('DELETE FROM post_comments WHERE id = ? AND client_id = ? AND by_hospital = 0').bind(cmid, cid).run();
    return json({ ok: true, deleted: !!(r.meta && r.meta.changes) }, 200, cors);
  }

  // ══════════════ 상담소 (소장 앱) ══════════════
  if (path.startsWith('/hospital/')) {
    const h = await resolveHospital(db, { hsession: s(body.hsession || q('hsession'), 128), hcode: s(body.hcode || q('hcode'), 64) });
    if (!h) return json({ error: 'bad-code' }, 403, cors);

    if (path === '/hospital/posts' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare(LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images') + ' WHERE p.hospital_id = ? ORDER BY p.pinned DESC, p.created DESC LIMIT 200').bind(h.id).all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], profile: profileOf(h), missing: true }, 200, cors); throw e; }
      return json({ ok: true, items: rows.map(r => rowPost(r, false)), profile: profileOf(h) }, 200, cors);
    }

    if (path === '/hospital/posts/save' && method === 'POST') {
      const it = body.post || {};
      const title = s(it.title, TITLE_MAX).trim(), text = s(it.body, BODY_MAX).trim();
      if (!title || !text) return json({ error: 'missing' }, 400, cors);
      const tags = tagsOf(it.tags).join(',');
      const published = it.published ? 1 : 0, pinned = it.pinned ? 1 : 0;
      const images = checkImages(it.images);
      if (!images) return json({ error: 'bad-image' }, 400, cors);
      const thumb = jpegOk(it.thumb, THUMB_BYTES) ? it.thumb : '';
      const imagesJson = images.length ? JSON.stringify(images) : null;
      let id = cleanId(it.id);
      if (id) {
        const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).first();
        if (!own) return json({ error: 'not-found' }, 404, cors);
        await db.prepare('UPDATE posts SET title = ?, body = ?, tags = ?, published = ?, pinned = ?, updated = ?, images = ?, thumb = ? WHERE id = ?')
          .bind(title, text, tags, published, pinned, nowMs(), imagesJson, thumb, id).run();
      } else {
        const today = await db.prepare('SELECT COUNT(*) n FROM posts WHERE hospital_id = ? AND created > ?').bind(h.id, nowMs() - 86400000).first();
        if ((today && today.n) >= POST_PER_DAY) return json({ error: 'too-many' }, 429, cors);
        id = rid('po');
        await db.prepare('INSERT INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, images, thumb) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)')
          .bind(id, h.id, title, text, tags, published, pinned, nowMs(), nowMs(), imagesJson, thumb).run();
      }
      const r = await db.prepare(LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images') + ' WHERE p.id = ?').bind(id).first();
      return json({ ok: true, post: rowPost(r, false) }, 200, cors);
    }

    if (path === '/hospital/posts/delete' && method === 'POST') {
      const id = cleanId(body.id);
      const r = await db.prepare('DELETE FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).run();
      if (r.meta && r.meta.changes) await db.batch([
        db.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id),
        db.prepare('DELETE FROM post_comments WHERE post_id = ?').bind(id)
      ]);
      return json({ ok: true }, 200, cors);
    }

    if (path === '/hospital/comments' && method === 'GET') {
      const id = cleanId(q('id'));
      const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).first();
      if (!own) return json({ error: 'not-found' }, 404, cors);
      const cm = (await db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY ts ASC LIMIT 300').bind(id).all()).results || [];
      return json({ ok: true, comments: cm.map(rowComment) }, 200, cors);
    }

    if (path === '/hospital/comments/hide' && method === 'POST') {
      const cmid = cleanId(body.cid), hidden = body.hidden ? 1 : 0;
      await db.prepare(`UPDATE post_comments SET hidden = ? WHERE id = ? AND post_id IN (SELECT id FROM posts WHERE hospital_id = ?)`).bind(hidden, cmid, h.id).run();
      return json({ ok: true }, 200, cors);
    }

    // 상담소가 자기 글에 다는 답글 — 이용자 댓글과 같은 표에 by_hospital=1 로 둔다
    if (path === '/hospital/comments/reply' && method === 'POST') {
      const id = cleanId(body.id), text = s(body.text, COMMENT_MAX).trim();
      if (!id || !text) return json({ error: 'missing' }, 400, cors);
      const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ?').bind(id, h.id).first();
      if (!own) return json({ error: 'not-found' }, 404, cors);
      const c = { id: rid('cm'), post_id: id, client_id: 'hosp:' + h.id, name: h.name, text, ts: nowMs(), hidden: 0, by_hospital: 1 };
      await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital) VALUES (?,?,?,?,?,?,0,1)')
        .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts).run();
      return json({ ok: true, comment: rowComment(c) }, 200, cors);
    }

    if (path === '/hospital/profile' && method === 'POST') {
      const p = body.profile || {};
      const prof = { intro: s(p.intro, 600).trim(), tel: s(p.tel, 30).replace(/[^0-9-+ ]/g, '').trim(), addr: s(p.addr, 120).trim(),
        url: s(p.url, 200).trim(), hours: s(p.hours, 200).trim() };
      if (prof.url && !/^https?:\/\//i.test(prof.url)) prof.url = 'https://' + prof.url;
      await db.prepare('UPDATE hospitals SET profile = ? WHERE id = ?').bind(JSON.stringify(prof), h.id).run();
      return json({ ok: true, profile: prof }, 200, cors);
    }
    return null;
  }

  // ══════════════ 운영자 — 상담소 신청 심사 ══════════════
  if (path.startsWith('/admin/hospital-apps')) {
    if (!isAdmin(env, s(body.code || q('code'), 64))) return json({ error: 'bad-code' }, 403, cors);
    const rowApp = a => ({ id: a.id, name: a.name, doctor: a.doctor, email: a.email, tel: a.tel || '', addr: a.addr || '', bizno: a.bizno || '',
      dept: a.dept || '', intro: a.intro || '', hours: a.hours || '', url: a.url || '', hasDoc: !!a.doc, status: a.status, ts: a.ts, reason: a.reason || '', hospitalId: a.hospital_id || '' });
    if (path === '/admin/hospital-apps' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare('SELECT id, client_id, name, doctor, email, tel, addr, bizno, dept, intro, hours, url, (doc IS NOT NULL AND doc != \'\') AS doc, status, ts, reason, hospital_id FROM hospital_apps ORDER BY ts DESC LIMIT 200').all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], missing: true }, 200, cors); throw e; }
      return json({ items: rows.map(rowApp) }, 200, cors);
    }
    if (path === '/admin/hospital-apps/doc' && method === 'GET') {
      const a = await db.prepare('SELECT doc FROM hospital_apps WHERE id = ?').bind(cleanId(q('id'))).first();
      return json({ doc: (a && a.doc) || '' }, 200, cors);
    }
    if (path === '/admin/hospital-apps/approve' && method === 'POST') {
      const a = await db.prepare("SELECT * FROM hospital_apps WHERE id = ? AND status = 'pending'").bind(cleanId(body.id)).first();
      if (!a) return json({ error: 'not-found' }, 404, cors);
      // hospital.js 의 코드 규칙과 같다 (H-XXXX-XXXX)
      const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = new Uint8Array(8); crypto.getRandomValues(b);
      let code = 'H-'; for (let i = 0; i < 8; i++) { code += AB[b[i] % AB.length]; if (i === 3) code += '-'; }
      const hid = rid('hp');
      const profile = JSON.stringify({ intro: a.intro || '', tel: a.tel || '', addr: a.addr || '', url: a.url || '', hours: a.hours || '' });
      await db.batch([
        db.prepare('INSERT INTO hospitals (id, name, dept, doctor, email, code, active, created, profile) VALUES (?,?,?,?,?,?,1,?,?)')
          .bind(hid, a.name, a.dept || '심리상담', a.doctor, a.email, code, nowMs(), profile),
        db.prepare("UPDATE hospital_apps SET status = 'approved', hospital_id = ?, decided = ? WHERE id = ?").bind(hid, nowMs(), a.id)
      ]);
      const docUrl = String(env.DOC_URL || 'https://doc.neurumind.com').replace(/\/+$/, '');
      sendHtml(env, db, a.email, '[마인드 인사이드] 상담소 제휴가 승인됐습니다', mailWrap('마인드 인사이드', a.name + ' 제휴가 승인됐습니다', `
        <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">${a.doctor} 소장님, 환영합니다. 아래 순서로 시작하세요.</p>
        <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
          <p style="font-size:13px;line-height:1.9;color:#6b5f50;margin:0;">
            1. <a href="${docUrl}" style="color:#4f8a6b;font-weight:700;">소장 앱 ${docUrl.replace(/^https?:\/\//, '')}</a> 에서 이 이메일 주소로 로그인 링크를 받으세요<br>
            2. 상담소 코드: <b style="font-family:ui-monospace,monospace;font-size:16px;letter-spacing:.06em;">${code}</b><br>
            &nbsp;&nbsp;&nbsp;내담자에게 알려주면 앱 → 마이 → 담당 상담소 연결하기에 넣어 연결됩니다. 소장 앱 비상 로그인에도 쓰이니 밖으로 새지 않게 관리해 주세요<br>
            3. 소장 앱에서 상담소 페이지(소개·운영시간)를 확인하고, 소속 상담사의 등록을 안내해 주세요</p>
        </div>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">정산: 상담소 채널 상담료는 상담소 90% · 마인드 인사이드 7% · 결제 수수료 3%로 나뉘고, 소속 상담사에게는 상담소가 지급합니다. 제휴계약서는 별도 메일로 보내드립니다.</p>
        <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">문의: <a href="mailto:help@neurumind.com" style="color:#4f8a6b;">help@neurumind.com</a></p>`)).catch(() => {});
      return json({ ok: true, hospitalId: hid, code }, 200, cors);
    }
    if (path === '/admin/hospital-apps/reject' && method === 'POST') {
      const a = await db.prepare("SELECT * FROM hospital_apps WHERE id = ? AND status = 'pending'").bind(cleanId(body.id)).first();
      if (!a) return json({ error: 'not-found' }, 404, cors);
      const reason = s(body.reason, 300).trim();
      await db.prepare("UPDATE hospital_apps SET status = 'rejected', reason = ?, decided = ? WHERE id = ?").bind(reason, nowMs(), a.id).run();
      sendHtml(env, db, a.email, '[마인드 인사이드] 상담소 제휴 신청 결과', mailWrap('마인드 인사이드', a.name + ' 제휴 신청을 보류합니다', `
        <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">보내주신 신청을 검토했으나 이번에는 승인하지 못했습니다.${reason ? '<br><br><b>사유:</b> ' + reason.replace(/</g, '&lt;') : ''}</p>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">보완이 가능하면 다시 신청해 주세요. 문의: <a href="mailto:help@neurumind.com" style="color:#4f8a6b;">help@neurumind.com</a></p>`)).catch(() => {});
      return json({ ok: true }, 200, cors);
    }
    return null;
  }

  // ══════════════ 운영자 ══════════════
  if (path.startsWith('/admin/community')) {
    if (!isAdmin(env, s(body.code || q('code'), 64))) return json({ error: 'bad-code' }, 403, cors);
    if (path === '/admin/community' && method === 'GET') {
      let rows = [];
      try { rows = (await db.prepare(LIST_SQL + ' ORDER BY p.created DESC LIMIT 300').all()).results || []; }
      catch (e) { if (noTable(e)) return json({ items: [], missing: true }, 200, cors); throw e; }
      return json({ items: rows.map(r => rowPost(r, false)) }, 200, cors);
    }
    if (path === '/admin/community/hide' && method === 'POST') {
      await db.prepare('UPDATE posts SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, cleanId(body.id)).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/admin/community/comment/hide' && method === 'POST') {
      await db.prepare('UPDATE post_comments SET hidden = ? WHERE id = ?').bind(body.hidden ? 1 : 0, cleanId(body.cid)).run();
      return json({ ok: true }, 200, cors);
    }
  }
  return null;
}
