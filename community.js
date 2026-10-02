// 상담소 소식 — 제휴 상담소가 블로그처럼 글을 올리고, 이용자는 좋아요·댓글만 단다.
//
//  · 글은 상담소(소장 앱, hsession/hcode 인증)와 그 상담소에 <소속이 확인된> 상담사(상담사 앱)가 쓴다. 이용자는 글을 쓸 수 없다.
//    상담사가 쓴 글은 posts.author_id/author_name 에 글쓴이가 남고, 상담사는 자기 글만 고치고 지운다. 소장은 상담소 글 전부를 관리한다.
//  · 이용자 반응은 좋아요(기기당 1개)와 댓글. clientKey 로 본인 확인. 댓글은 본인이 지울 수 있고,
//    상담소는 자기 글의 댓글을 숨길 수 있다. 운영자는 글·댓글 모두 숨길 수 있다.
//  · 상담소 페이지(프로필: 소개·전화·주소·홈페이지·운영시간)는 hospitals 표의 profile 칸(JSON)에 둔다.
//  · 댓글은 짧고(500자) 연락처를 지운다 — 플랫폼 밖 직거래 유도를 막는 규칙은 채팅과 같다.
//
//  본문 표기(앱·소장 앱이 같은 규칙으로 그린다): **굵게** · '# ' 큰 글씨 · '## ' 제목 · {red|글}(색: red orange green blue purple gray) · [img:0] 사진
//  경로 (앱은 /api/… 로 부르고 Worker 가 /api 를 뗀다)
//    공개   GET  /community?clientId=&cursor=&hospital=      글 목록(발행된 것만) + 내 좋아요
//                 &sort=hot(인기순, offset 으로 넘김) &tag= &q=(제목·본문 검색) &author= &authors=a,b &hospitals=x,y(구독) &ids=p1,p2(저장한 글)
//           GET  /community/tags                             요즘 많이 쓰인 태그
//           GET  /community/author?id=&clientId=             상담사 블로그(프로필 + 글 + 합계)
//           POST /community/comment/like {cid, clientId, clientKey}   댓글 공감 토글 — 공감 많은 댓글이 '베스트 댓글'
//           GET  /community/best                        요즘 공감 많이 받은 댓글(글 제목과 함께)
//    댓글은 한 단계 답글(parentId)까지. 답글의 답글은 같은 댓글 아래에 붙는다.
//    같은 글이 검색엔진용 HTML 로도 나간다 — blogpage.js (/blog/…)
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
//    상담사 GET  /pro/posts?session=|code=           내가 쓴 글(초안 포함) + 소속 상담소
//           POST /pro/posts/save {session|code, post: {id?, title, body, tags, published, images, thumb}}
//           POST /pro/posts/delete {session|code, id}
//    운영자 GET  /admin/community?code=   전체 글   POST /admin/community/hide {code, id, hidden}
//           POST /admin/community/comment/hide {code, cid, hidden}
import { json, isAdmin, verifyClient, s, nowMs } from './market.js';
import { resolveHospital } from './hospital.js';
import { pingIndexNow } from './blogpage.js';
import { sendHtml, mailWrap, sendApplicationToOps, OPS_REPLY, resolveCounselor } from './auth.js';

const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const PAGE = 20;
const TITLE_MAX = 80, BODY_MAX = 6000, COMMENT_MAX = 500, NAME_MAX = 20, TAGS_MAX = 5;
const COMMENT_PER_10MIN = 6;         // 기기당 댓글 도배 방지
const AUTHOR_PER_DAY = 5;            // 상담사 한 사람이 하루에 새로 올릴 수 있는 글 수
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
  author: r.author_name || '', authorId: r.author_id || '',
  title: r.title, body: r.body || '', excerpt: plainOf(r.body).slice(0, 120), thumb: r.thumb || '', images: r.images === undefined ? undefined : parseImages(r.images),
  tags: String(r.tags || '').split(',').filter(Boolean),
  published: !!r.published, pinned: !!r.pinned, hidden: !!r.hidden,
  likes: r.likes || 0, comments: r.comments || 0, views: r.views || 0, mine: !!mine,
  created: r.created, updated: r.updated || r.created
});
const rowComment = c => ({
  id: c.id, postId: c.post_id, clientId: c.client_id, name: c.name || '익명', text: c.text,
  ts: c.ts, hidden: !!c.hidden, byHospital: !!c.by_hospital, parentId: c.parent_id || '', likes: c.likes || 0, mine: !!c.mine
});

// 댓글 + 공감 수
const CM_SQL = 'SELECT c.*, (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes FROM post_comments c';
const LIST_COLS = 'p.id, p.hospital_id, p.title, p.body, p.tags, p.published, p.pinned, p.hidden, p.created, p.updated, p.thumb, p.author_id, p.author_name, p.views';
const LIST_SQL = `SELECT ${LIST_COLS}, h.name AS hospital_name, h.dept AS hospital_dept,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comments
  FROM posts p JOIN hospitals h ON h.id = p.hospital_id`;

export async function handleCommunity(request, env, cors, path, ctx) {
  if (!/^\/(community|hospital\/(posts|comments|profile)|pro\/posts|admin\/community|admin\/hospital-apps)/.test(path)) return null;
  const db = env.DB;
  // 답글이 붙을 댓글 — 답글의 답글은 맨 위 댓글 아래로 모은다(한 단계만). 없는 댓글이면 null.
  const rootOf = async (postId, parentId) => {
    if (!parentId) return '';
    const p = await db.prepare('SELECT id, parent_id FROM post_comments WHERE id = ? AND post_id = ? AND hidden = 0').bind(parentId, postId).first();
    return p ? (p.parent_id || p.id) : null;
  };
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
    const hot = q('sort') === 'hot';
    const offset = Math.max(0, Math.min(2000, Number(q('offset')) || 0));
    const listOf = v => s(v, 1400).split(',').map(cleanId).filter(Boolean).slice(0, 40);
    const authors = listOf(q('authors')), hosps = listOf(q('hospitals')), ids = listOf(q('ids'));
    const author = cleanId(q('author'));
    const tag = s(q('tag'), 12).trim(), kw = s(q('q'), 40).trim();
    const where = ['p.published = 1', 'p.hidden = 0', 'h.active = 1'], args = [];
    const inList = (col, arr) => `${col} IN (${arr.map(() => '?').join(',')})`;
    if (hosp) { where.push('p.hospital_id = ?'); args.push(hosp); }
    if (author) { where.push('p.author_id = ?'); args.push(author); }
    if (ids.length) { where.push(inList('p.id', ids)); args.push(...ids); }
    if (authors.length || hosps.length) {   // 구독 — 구독한 상담사의 글이거나 구독한 상담소의 글
      const or = [];
      if (authors.length) { or.push(inList('p.author_id', authors)); args.push(...authors); }
      if (hosps.length) { or.push(inList('p.hospital_id', hosps)); args.push(...hosps); }
      where.push('(' + or.join(' OR ') + ')');
    }
    if (tag) { where.push("(',' || COALESCE(p.tags, '') || ',') LIKE ?"); args.push('%,' + tag.replace(/[%_]/g, '') + ',%'); }
    if (kw) { const like = '%' + kw.replace(/[%_]/g, '') + '%'; where.push('(p.title LIKE ? OR p.body LIKE ? OR p.tags LIKE ? OR p.author_name LIKE ? OR h.name LIKE ?)'); args.push(like, like, like, like, like); }
    if (cursor && !hot) { where.push('p.created < ?'); args.push(cursor); }
    // 인기순: 좋아요·댓글·조회에 새 글 가산점(일주일 안의 글이 위로). 숫자가 바뀌는 순서라 offset 으로 넘긴다.
    const order = hot ? `(likes * 3 + comments * 4 + COALESCE(p.views, 0) * 0.3 + CASE WHEN p.created > ${nowMs() - 7 * 86400000} THEN 6 ELSE 0 END) DESC, p.created DESC`
      : (hosp ? 'p.pinned DESC, ' : '') + 'p.created DESC';
    let rows = [];
    try {
      rows = (await db.prepare(LIST_SQL + ` WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? ${hot ? 'OFFSET ?' : ''}`)
        .bind(...args, PAGE + 1, ...(hot ? [offset] : [])).all()).results || [];
    } catch (e) { if (noTable(e)) return json({ items: [], next: 0, missing: true }, 200, cors); throw e; }
    const more = rows.length > PAGE;
    if (more) rows.pop();
    const likes = await myLikes(cid, rows.map(r => r.id));
    return json({ items: rows.map(r => rowPost(r, likes.has(r.id))), next: more && !hot ? rows[rows.length - 1].created : 0, nextOffset: more && hot ? offset + PAGE : 0 }, 200, cors);
  }

  if (path === '/community/tags' && method === 'GET') {
    let rows = [];
    try { rows = (await db.prepare("SELECT p.tags FROM posts p JOIN hospitals h ON h.id = p.hospital_id WHERE p.published = 1 AND p.hidden = 0 AND h.active = 1 AND p.tags != '' ORDER BY p.created DESC LIMIT 300").all()).results || []; } catch (e) {}
    const n = {};
    rows.forEach(r => String(r.tags || '').split(',').filter(Boolean).forEach(t => { n[t] = (n[t] || 0) + 1; }));
    return json({ tags: Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 14).map(t => ({ tag: t, n: n[t] })) }, 200, cors);
  }

  // 상담사 블로그 — 글쓴이 한 사람의 소개와 글. 소속이 확인된 운영 중인 상담사만.
  if (path === '/community/author' && method === 'GET') {
    const id = cleanId(q('id')), cid = cleanId(q('clientId'));
    let a = null;
    try { a = await db.prepare('SELECT id, name, hospital, hospital_id, hospital_ok, intro, tags, license, photo FROM counselors WHERE id = ? AND active = 1').bind(id).first(); } catch (e) {}
    if (!a) return json({ error: 'not-found' }, 404, cors);
    const rows = (await db.prepare(LIST_SQL + ' WHERE p.author_id = ? AND p.published = 1 AND p.hidden = 0 AND h.active = 1 ORDER BY p.created DESC LIMIT 60').bind(id).all()).results || [];
    const likes = await myLikes(cid, rows.map(r => r.id));
    let tags = []; try { tags = JSON.parse(a.tags || '[]'); } catch (e) {}
    return json({ ok: true, author: { id: a.id, name: a.name, hospital: a.hospital || '', hospitalId: a.hospital_ok ? (a.hospital_id || '') : '', intro: a.intro || '', tags: Array.isArray(tags) ? tags.slice(0, 8) : [], license: a.license || '', photo: a.photo || '' },
      totals: { posts: rows.length, likes: rows.reduce((x, r) => x + (r.likes || 0), 0), views: rows.reduce((x, r) => x + (r.views || 0), 0) },
      items: rows.map(r => rowPost(r, likes.has(r.id))) }, 200, cors);
  }

  // ── 상담소 직접 등록 신청 (공개) ──
  //  운영자가 콘솔에서 대신 넣던 것을 상담소가 앱에서 직접 낸다. 심사 뒤 승인하면 hospitals 에 들어가고 소장에게 로그인 안내가 간다.
  if (path === '/community/hospital-apply' && method === 'POST') {
    const name = s(body.name, 60).trim(), doctor = s(body.doctor, 40).trim(), email = s(body.email, 160).trim().toLowerCase();
    if (!name || !doctor || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'missing' }, 400, cors);
    // 상담소는 사업자등록번호와 사업자등록증이 필수다(2026-09-26 지시) — 제휴계약·세금계산서·정산에 필요
    const bizno = s(body.bizno, 20).replace(/[^0-9]/g, '');
    if (bizno.length !== 10) return json({ error: 'bizno', message: '사업자등록번호 10자리를 확인해주세요' }, 400, cors);
    if (!jpegOk(body.doc, 200 * 1024)) return json({ error: 'doc', message: '사업자등록증 사진을 첨부해주세요' }, 400, cors);
    const cid = cleanId(body.clientId) || 'anon';
    const dup = await db.prepare("SELECT id FROM hospital_apps WHERE lower(email) = ? AND status = 'pending'").bind(email).first();
    if (dup) return json({ error: 'dup', message: '이미 심사 중인 신청이 있어요' }, 409, cors);
    const doc = body.doc;
    const id = rid('ha');
    await db.prepare(`INSERT INTO hospital_apps (id, client_id, name, doctor, email, tel, addr, bizno, dept, intro, hours, url, doc, status, ts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`)
      .bind(id, cid, name, doctor, email, s(body.tel, 30).replace(/[^0-9-+ ]/g, ''), s(body.addr, 200).trim(), bizno /* 숫자 10자리 그대로 — 콘솔(hospital.js /hospital/info)이 숫자만으로 비교한다 */,
        s(body.dept, 40).trim(), s(body.intro, 600).trim(), s(body.hours, 200).trim(), s(body.url, 200).trim(), doc, nowMs()).run();
    sendHtml(env, db, email, '[마인드 인사이드] 상담소 제휴 신청이 접수됐습니다', mailWrap('마인드 인사이드', name + ' 제휴 신청이 접수됐습니다', `
      <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">보내주신 상담소 정보를 확인하고 있습니다.<br><b>2~3일 안에</b> 승인 여부를 이 주소로 알려드릴게요.</p>
      <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
        <p style="font-size:13px;font-weight:700;margin:0 0 8px;">승인되면 이렇게 진행돼요</p>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0;">1. 이 주소로 <b>소장 앱(doc.mindinsideapp.com) 로그인 안내</b>와 상담소 코드가 갑니다<br>2. 내담자는 앱에서 상담소 코드로 상담소와 연결됩니다<br>3. 소속 상담사는 등록할 때 이 상담소를 고를 수 있고, 상담료는 상담소로 정산됩니다(상담소 90% · 앱 7% · 결제 수수료 3%)<br>4. 제휴계약서는 승인 메일과 함께 보내드립니다</p>
      </div>
      <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">문의: <a href="mailto:mindinsideapp@gmail.com" style="color:#4f8a6b;">mindinsideapp@gmail.com</a></p>`)).catch(() => {});
    sendApplicationToOps(env, db, `상담소 제휴 신청 — ${name}`, `${name}(소장 ${doctor})이 앱에서 제휴를 신청했습니다. 사업자등록증을 첨부했습니다.`,
      [['상담소', name], ['소장', doctor], ['이메일', email], ['전화', s(body.tel, 30)], ['사업자등록번호', bizno.replace(/^(\d{3})(\d{2})(\d{5})$/, '$1-$2-$3')],
       ['전문 분야', s(body.dept, 40)], ['주소', s(body.addr, 200)], ['운영시간', s(body.hours, 200)], ['홈페이지', s(body.url, 200)], ['소개', s(body.intro, 600)], ['신청 ID', id]],
      { attachments: [{ filename: '사업자등록증.jpg', content: String(doc).replace(/^data:image\/jpeg;base64,/, '') }] }).catch(() => {});
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
    const cm = (await db.prepare(CM_SQL + ' WHERE c.post_id = ? AND c.hidden = 0 ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || [];
    if (cid && cm.length) {
      const mineSet = new Set(((await db.prepare('SELECT comment_id FROM post_comment_likes WHERE client_id = ? AND comment_id IN (SELECT id FROM post_comments WHERE post_id = ?)').bind(cid, id).all()).results || []).map(x => x.comment_id));
      cm.forEach(x => { x.mine = mineSet.has(x.id); });
    }
    const hosp = await db.prepare('SELECT * FROM hospitals WHERE id = ?').bind(r.hospital_id).first();
    // 조회수 — 앱에서 글을 열 때마다 1. 응답을 기다리게 하지 않는다.
    const up = db.prepare('UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?').bind(id).run().catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(up); else await up;
    // 이어 볼 글 — 같은 글쓴이의 글 먼저, 모자라면 같은 상담소의 글
    let more = [];
    try {
      more = (await db.prepare(LIST_SQL + ` WHERE p.published = 1 AND p.hidden = 0 AND h.active = 1 AND p.id != ? AND (p.hospital_id = ? OR p.author_id = ?)
        ORDER BY (CASE WHEN p.author_id = ? THEN 0 ELSE 1 END), p.created DESC LIMIT 4`).bind(id, r.hospital_id, r.author_id || '-', r.author_id || '-').all()).results || [];
    } catch (e) {}
    return json({ ok: true, post: rowPost(r, likes.has(id)), comments: cm.map(rowComment), hospital: hospPublic(hosp), more: more.map(x => rowPost(x, false)) }, 200, cors);
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
    const parent = await rootOf(id, cleanId(body.parentId));
    if (parent === null) return json({ error: 'not-found' }, 404, cors);
    const c = { id: rid('cm'), post_id: id, client_id: cid, name, text, ts: nowMs(), hidden: 0, by_hospital: 0, parent_id: parent };
    await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,0,?)')
      .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts, parent || null).run();
    return json({ ok: true, comment: rowComment(c) }, 200, cors);
  }

  if (path === '/community/comment/like' && method === 'POST') {
    const cid = cleanId(body.clientId), cmid = cleanId(body.cid);
    if (!cid || !cmid) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const cm = await db.prepare('SELECT id FROM post_comments WHERE id = ? AND hidden = 0').bind(cmid).first();
    if (!cm) return json({ error: 'not-found' }, 404, cors);
    const had = await db.prepare('SELECT 1 x FROM post_comment_likes WHERE comment_id = ? AND client_id = ?').bind(cmid, cid).first();
    if (had) await db.prepare('DELETE FROM post_comment_likes WHERE comment_id = ? AND client_id = ?').bind(cmid, cid).run();
    else await db.prepare('INSERT INTO post_comment_likes (comment_id, client_id, ts) VALUES (?,?,?)').bind(cmid, cid, nowMs()).run();
    const n = await db.prepare('SELECT COUNT(*) n FROM post_comment_likes WHERE comment_id = ?').bind(cmid).first();
    return json({ ok: true, likes: (n && n.n) || 0, mine: !had }, 200, cors);
  }

  // 베스트 댓글 — 최근 30일에 공감을 많이 받은 댓글. 커뮤니티 첫 화면에 글 제목과 함께 보여준다.
  if (path === '/community/best' && method === 'GET') {
    let rows = [];
    try {
      rows = (await db.prepare(`SELECT c.id, c.post_id, c.name, c.text, c.ts, c.by_hospital, p.title,
          (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes
        FROM post_comments c JOIN posts p ON p.id = c.post_id JOIN hospitals h ON h.id = p.hospital_id
        WHERE c.hidden = 0 AND c.ts > ? AND p.published = 1 AND p.hidden = 0 AND h.active = 1
        ORDER BY likes DESC, c.ts DESC LIMIT 8`).bind(nowMs() - 30 * 86400000).all()).results || [];
    } catch (e) {}
    return json({ items: rows.filter(r => r.likes > 0).map(r => ({ id: r.id, postId: r.post_id, title: r.title, name: r.name || '익명', text: r.text, ts: r.ts, likes: r.likes, byHospital: !!r.by_hospital })) }, 200, cors);
  }

  if (path === '/community/comment/delete' && method === 'POST') {
    const cid = cleanId(body.clientId), cmid = cleanId(body.cid);
    if (!cid || !cmid) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey, 64)) === 'deny') return json({ error: 'forbidden' }, 403, cors);
    const r = await db.prepare('DELETE FROM post_comments WHERE id = ? AND client_id = ? AND by_hospital = 0').bind(cmid, cid).run();
    // 지운 댓글에 달린 답글도 함께 지운다 — 남겨 두면 어디에 단 말인지 알 수 없다
    if (r.meta && r.meta.changes) { await db.prepare('DELETE FROM post_comments WHERE parent_id = ?').bind(cmid).run(); await db.prepare('DELETE FROM post_comment_likes WHERE comment_id = ?').bind(cmid).run().catch(() => {}); }
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
      if (published) pingIndexNow(ctx, id, env);   // 네이버·빙에 새 글 주소를 알린다
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
      const cm = (await db.prepare(CM_SQL + ' WHERE c.post_id = ? ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || [];
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
      const parent = await rootOf(id, cleanId(body.parentId));
      if (parent === null) return json({ error: 'not-found' }, 404, cors);
      const c = { id: rid('cm'), post_id: id, client_id: 'hosp:' + h.id, name: h.name, text, ts: nowMs(), hidden: 0, by_hospital: 1, parent_id: parent };
      await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,1,?)')
        .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts, parent || null).run();
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

  // ══════════════ 소속 상담사 (상담사 앱) ══════════════
  //  소속이 확인된(hospital_ok) 상담사만 쓴다 — 상담소 이름을 걸고 나가는 글이라, 소장이 받아들인 사람이어야 한다.
  if (path.startsWith('/pro/posts')) {
    const me = await resolveCounselor(db, { session: s(body.session || q('session'), 128), code: s(body.code || q('code'), 64) });
    if (!me) return json({ error: 'bad-code' }, 403, cors);
    let c = null;
    try { c = await db.prepare('SELECT hospital_id, hospital_ok FROM counselors WHERE id = ?').bind(me.id).first(); } catch (e) {}
    const h = c && c.hospital_id && c.hospital_ok
      ? await db.prepare('SELECT id, name FROM hospitals WHERE id = ? AND active = 1').bind(c.hospital_id).first() : null;
    const MINE = LIST_SQL.replace(LIST_COLS, LIST_COLS + ', p.images');

    if (path === '/pro/posts' && method === 'GET') {
      if (!h) return json({ ok: true, canWrite: false, pending: !!(c && c.hospital_id && !c.hospital_ok), items: [] }, 200, cors);
      const rows = (await db.prepare(MINE + ' WHERE p.hospital_id = ? AND p.author_id = ? ORDER BY p.created DESC LIMIT 100').bind(h.id, me.id).all()).results || [];
      return json({ ok: true, canWrite: true, hospital: { id: h.id, name: h.name }, items: rows.map(r => rowPost(r, false)) }, 200, cors);
    }
    if (!h) return json({ error: 'no-hospital' }, 403, cors);

    if (path === '/pro/posts/save' && method === 'POST') {
      const it = body.post || {};
      const title = s(it.title, TITLE_MAX).trim(), text = s(it.body, BODY_MAX).trim();
      if (!title || !text) return json({ error: 'missing' }, 400, cors);
      const tags = tagsOf(it.tags).join(',');
      const published = it.published ? 1 : 0;
      const images = checkImages(it.images);
      if (!images) return json({ error: 'bad-image' }, 400, cors);
      const thumb = jpegOk(it.thumb, THUMB_BYTES) ? it.thumb : '';
      const imagesJson = images.length ? JSON.stringify(images) : null;
      let id = cleanId(it.id);
      if (id) {
        const own = await db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ? AND author_id = ?').bind(id, h.id, me.id).first();
        if (!own) return json({ error: 'not-found' }, 404, cors);
        // 상단 고정(pinned)은 소장이 정한다 — 여기서는 건드리지 않는다
        await db.prepare('UPDATE posts SET title = ?, body = ?, tags = ?, published = ?, updated = ?, images = ?, thumb = ? WHERE id = ?')
          .bind(title, text, tags, published, nowMs(), imagesJson, thumb, id).run();
      } else {
        const day = nowMs() - 86400000;
        const mineN = await db.prepare('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND created > ?').bind(me.id, day).first();
        const hospN = await db.prepare('SELECT COUNT(*) n FROM posts WHERE hospital_id = ? AND created > ?').bind(h.id, day).first();
        if ((mineN && mineN.n) >= AUTHOR_PER_DAY || (hospN && hospN.n) >= POST_PER_DAY) return json({ error: 'too-many' }, 429, cors);
        id = rid('po');
        await db.prepare('INSERT INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, images, thumb, author_id, author_name) VALUES (?,?,?,?,?,?,0,0,?,?,?,?,?,?)')
          .bind(id, h.id, title, text, tags, published, nowMs(), nowMs(), imagesJson, thumb, me.id, s(me.name, 40)).run();
      }
      const r = await db.prepare(MINE + ' WHERE p.id = ?').bind(id).first();
      if (published) pingIndexNow(ctx, id, env);
      return json({ ok: true, post: rowPost(r, false) }, 200, cors);
    }

    const ownPost = pid => db.prepare('SELECT id FROM posts WHERE id = ? AND hospital_id = ? AND author_id = ?').bind(pid, h.id, me.id).first();
    if (path === '/pro/posts/comments' && method === 'GET') {
      const id = cleanId(q('id'));
      if (!(await ownPost(id))) return json({ error: 'not-found' }, 404, cors);
      const cm = (await db.prepare(CM_SQL + ' WHERE c.post_id = ? ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || [];
      return json({ ok: true, comments: cm.map(rowComment) }, 200, cors);
    }
    if (path === '/pro/posts/reply' && method === 'POST') {
      const id = cleanId(body.id), text = maskContact(s(body.text, COMMENT_MAX)).trim();
      if (!id || !text) return json({ error: 'missing' }, 400, cors);
      if (!(await ownPost(id))) return json({ error: 'not-found' }, 404, cors);
      const parent = await rootOf(id, cleanId(body.parentId));
      if (parent === null) return json({ error: 'not-found' }, 404, cors);
      const c = { id: rid('cm'), post_id: id, client_id: 'pro:' + me.id, name: s(me.name, 20) + ' 상담사', text, ts: nowMs(), hidden: 0, by_hospital: 1, parent_id: parent };
      await db.prepare('INSERT INTO post_comments (id, post_id, client_id, name, text, ts, hidden, by_hospital, parent_id) VALUES (?,?,?,?,?,?,0,1,?)')
        .bind(c.id, c.post_id, c.client_id, c.name, c.text, c.ts, parent || null).run();
      return json({ ok: true, comment: rowComment(c) }, 200, cors);
    }
    if (path === '/pro/posts/comments/hide' && method === 'POST') {
      const cmid = cleanId(body.cid), hidden = body.hidden ? 1 : 0;
      await db.prepare('UPDATE post_comments SET hidden = ? WHERE id = ? AND post_id IN (SELECT id FROM posts WHERE hospital_id = ? AND author_id = ?)').bind(hidden, cmid, h.id, me.id).run();
      return json({ ok: true }, 200, cors);
    }

    if (path === '/pro/posts/delete' && method === 'POST') {
      const id = cleanId(body.id);
      const r = await db.prepare('DELETE FROM posts WHERE id = ? AND hospital_id = ? AND author_id = ?').bind(id, h.id, me.id).run();
      if (r.meta && r.meta.changes) await db.batch([
        db.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id),
        db.prepare('DELETE FROM post_comments WHERE post_id = ?').bind(id)
      ]);
      return json({ ok: true, deleted: !!(r.meta && r.meta.changes) }, 200, cors);
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
        db.prepare('INSERT INTO hospitals (id, name, dept, doctor, email, code, active, created, profile, bizno) VALUES (?,?,?,?,?,?,1,?,?,?)')
          .bind(hid, a.name, a.dept || '심리상담', a.doctor, a.email, code, nowMs(), profile, a.bizno || ''),
        db.prepare("UPDATE hospital_apps SET status = 'approved', hospital_id = ?, decided = ? WHERE id = ?").bind(hid, nowMs(), a.id)
      ]);
      const docUrl = String(env.DOC_URL || 'https://doc.mindinsideapp.com').replace(/\/+$/, '');
      sendHtml(env, db, a.email, '[마인드 인사이드] 상담소 제휴가 승인됐습니다', mailWrap('마인드 인사이드', a.name + ' 제휴가 승인됐습니다', `
        <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">${a.doctor} 소장님, 환영합니다. 아래 순서로 시작하세요.</p>
        <div style="background:#f6f1e7;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
          <p style="font-size:13px;line-height:1.9;color:#6b5f50;margin:0;">
            1. <a href="${docUrl}" style="color:#4f8a6b;font-weight:700;">소장 앱 ${docUrl.replace(/^https?:\/\//, '')}</a> 에서 이 이메일 주소로 로그인 링크를 받으세요<br>
            2. 상담소 코드: <b style="font-family:ui-monospace,monospace;font-size:16px;letter-spacing:.06em;">${code}</b><br>
            &nbsp;&nbsp;&nbsp;내담자에게 알려주면 앱 → 마이 → 담당 상담소 연결하기에 넣어 연결됩니다. 이 코드로는 소장 앱에 로그인할 수 없습니다(로그인은 1번의 이메일 링크로)<br>
            3. 소장 앱에서 상담소 페이지(소개·운영시간)를 확인하고, 소속 상담사의 등록을 안내해 주세요</p>
        </div>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">정산: 상담소 채널 상담료는 상담소 90% · 마인드 인사이드 7% · 결제 수수료 3%로 나뉘고, 소속 상담사에게는 상담소가 지급합니다.</p>
        <div style="background:#eef4ef;border-radius:12px;padding:14px 18px;margin:0 0 18px;">
          <p style="font-size:13px;font-weight:700;margin:0 0 6px;">제휴계약서를 첨부했습니다 — 회신 부탁드려요</p>
          <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0;">첨부한 심리상담사업자 제휴계약서를 읽어보시고, 동의하시면 <b>이 메일에 "동의합니다"라고 회신</b>해 주세요. 수정이 필요한 조항은 같은 메일로 알려주시면 협의합니다. 회신은 <a href="mailto:${OPS_REPLY}" style="color:#4f8a6b;">${OPS_REPLY}</a> 로 갑니다.</p>
        </div>
        <p style="font-size:12px;line-height:1.7;color:#8a7b68;margin:0;">문의: <a href="mailto:mindinsideapp@gmail.com" style="color:#4f8a6b;">mindinsideapp@gmail.com</a></p>`),
        { replyTo: OPS_REPLY, attachments: [{ filename: '마인드인사이드_심리상담사업자_제휴계약서.docx', path: String(env.APP_URL || 'https://mindinsideapp.com').replace(/\/+$/, '') + '/legal/partner-agreement.docx' }] }).catch(() => {});
      return json({ ok: true, hospitalId: hid, code }, 200, cors);
    }
    if (path === '/admin/hospital-apps/reject' && method === 'POST') {
      const a = await db.prepare("SELECT * FROM hospital_apps WHERE id = ? AND status = 'pending'").bind(cleanId(body.id)).first();
      if (!a) return json({ error: 'not-found' }, 404, cors);
      const reason = s(body.reason, 300).trim();
      await db.prepare("UPDATE hospital_apps SET status = 'rejected', reason = ?, decided = ? WHERE id = ?").bind(reason, nowMs(), a.id).run();
      sendHtml(env, db, a.email, '[마인드 인사이드] 상담소 제휴 신청 결과', mailWrap('마인드 인사이드', a.name + ' 제휴 신청을 보류합니다', `
        <p style="font-size:14px;line-height:1.8;margin:0 0 18px;">보내주신 신청을 검토했으나 이번에는 승인하지 못했습니다.${reason ? '<br><br><b>사유:</b> ' + reason.replace(/</g, '&lt;') : ''}</p>
        <p style="font-size:13px;line-height:1.8;color:#6b5f50;margin:0 0 18px;">보완이 가능하면 다시 신청해 주세요. 문의: <a href="mailto:mindinsideapp@gmail.com" style="color:#4f8a6b;">mindinsideapp@gmail.com</a></p>`)).catch(() => {});
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
