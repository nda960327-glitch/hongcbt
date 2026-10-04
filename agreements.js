// ============================================================================
//  전자 계약 — 상담사 입점계약서·상담소 제휴계약서를 앱 안에서 읽고 손글씨로 서명한다 (2026-10-04)
//
//  예전엔 승인 메일에 워드 파일을 붙여 "동의합니다"로 회신받았다 — 받으러 다니기 힘들고, 누가 어느 판에
//  동의했는지 한곳에 모이지 않았다. 이제는:
//   · 운영자 콘솔 › 계약서에서 본문을 고치고 [게시]한다. 게시된 판이 있어야 서명 화면이 뜬다
//     (지금 초안에는 [빈칸]·검토 메모가 남아 있다 — 변호사·세무사 검토 뒤 게시하라고 화면에 적어 둔다).
//   · 상담사 앱·상담소 콘솔은 들어올 때 /agreement/current 로 묻고, 아직 서명 안 한 판이면 서명 창을 띄운다.
//   · 서명하면 그 순간의 본문 전체(당사자 정보를 채운 것)와 SHA-256 지문, 손글씨 서명 그림, 시각·IP·기기를
//     함께 남긴다. 나중에 본문을 고쳐도 서명한 사람이 본 글은 그대로 남는다 — 이것이 증빙이다.
//   · 새 판을 게시하면 모두 다음 접속 때 다시 서명한다.
//
//  상담사   GET  /agreement/current?kind=counselor&session|code     POST /agreement/sign {kind, session|code, ver, signerName, signature}
//  상담소   GET  /agreement/current?kind=clinic&hsession|hcode      POST /agreement/sign {kind, hsession|hcode, …}
//           GET  /agreement/mine?kind=…&(인증)                       내가 서명한 계약서(본문·서명 그림)
//  운영자   GET  /admin/agreements?code=                             판·서명·미서명 목록
//           GET  /admin/agreements/version?code=&kind=&ver=           판 본문
//           POST /admin/agreements/save {code, kind, title, body}     초안 저장(게시 전 판이 있으면 그 판을 고친다)
//           POST /admin/agreements/publish {code, kind, ver}          게시
//           GET  /admin/agreements/sign?code=&id=                     서명한 계약서 한 건(증빙 전체)
// ============================================================================
import { resolveCounselor } from './auth.js';
import { resolveHospital } from './hospital.js';
import { AGREEMENT_DRAFTS } from './agreement-drafts.js';

const KINDS = { counselor: '상담사 입점계약서', clinic: '심리상담사업자 제휴계약서' };
// 갑(회사) — 개인정보처리방침·이용약관 하단과 같은 값
const COMPANY = '마인드 인사이드(대표자 노도아, 사업자등록번호 448-87-03724)';
const MAX_SIG = 200000;      // 서명 그림(data:image/png) 최대 길이 — 보통 10~40KB
const MAX_BODY = 60000;

const s = (v, n) => String(v == null ? '' : v).slice(0, n || 200);
const nowMs = () => Date.now();
function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) } });
}
async function sha256(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const kst = ms => {
  const d = new Date(ms + 9 * 3600000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

// 표 두 개 — 처음 쓰는 순간 만든다(마이그레이션 없이). 워커 한 개당 한 번만 확인한다.
let READY = false;
async function ensure(db) {
  if (READY) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS agreement_versions (kind TEXT NOT NULL, ver INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', created INTEGER NOT NULL, updated INTEGER NOT NULL, published_at INTEGER, PRIMARY KEY (kind, ver))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS agreement_signs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, ver INTEGER NOT NULL, party_id TEXT NOT NULL,
      party_name TEXT, signer_name TEXT NOT NULL, signer_email TEXT, title TEXT, body TEXT NOT NULL, body_hash TEXT NOT NULL, signature TEXT NOT NULL,
      ip TEXT, ua TEXT, signed_at INTEGER NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_agsign_party ON agreement_signs (kind, party_id, signed_at)')
  ]);
  // 판이 하나도 없으면 legal/ 초안을 '게시 전 초안'(1판)으로 넣는다
  for (const kind of Object.keys(KINDS)) {
    const has = await db.prepare('SELECT 1 FROM agreement_versions WHERE kind = ? LIMIT 1').bind(kind).first();
    if (!has && AGREEMENT_DRAFTS[kind]) {
      const t = nowMs();
      await db.prepare('INSERT OR IGNORE INTO agreement_versions (kind, ver, title, body, status, created, updated) VALUES (?, 1, ?, ?, ?, ?, ?)')
        .bind(kind, AGREEMENT_DRAFTS[kind].title, AGREEMENT_DRAFTS[kind].body, 'draft', t, t).run();
    }
  }
  READY = true;
}

const published = (db, kind) => db.prepare("SELECT * FROM agreement_versions WHERE kind = ? AND status = 'published' ORDER BY ver DESC LIMIT 1").bind(kind).first();

// 당사자 표식 채우기 — {{갑}} {{을}} {{을_이메일}} {{서명일}}
function fill(body, party, ts) {
  return String(body || '')
    .replace(/\{\{갑\}\}/g, COMPANY)
    .replace(/\{\{을\}\}/g, party.name || '')
    .replace(/\{\{을_이메일\}\}/g, party.email || '(이메일 미등록)')
    .replace(/\{\{서명일\}\}/g, kst(ts || nowMs()));
}

// 누가 묻는지 — 상담사(세션·코드) 또는 상담소(세션·소장 관리 코드)
async function partyOf(db, kind, q, body) {
  const g = k => s(body[k] || q(k), 128);
  if (kind === 'counselor') {
    const c = await resolveCounselor(db, { session: g('session'), code: g('code') });
    if (!c) return null;
    return { id: c.id, name: c.name || '', email: c.email || '', signer: c.name || '' };
  }
  if (kind === 'clinic') {
    const h = await resolveHospital(db, { hsession: g('hsession'), hcode: g('hcode') });
    if (!h) return null;
    return { id: h.id, name: h.name || '', email: h.email || '', signer: h.doctor || '' };
  }
  return null;
}

const lastSign = (db, kind, pid) => db.prepare('SELECT id, ver, signer_name, signed_at FROM agreement_signs WHERE kind = ? AND party_id = ? ORDER BY signed_at DESC LIMIT 1').bind(kind, pid).first();

export async function handleAgreements(request, env, cors, path) {
  if (!/^\/(agreement\/|admin\/agreements)/.test(path)) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  try { await ensure(db); } catch (e) { return json({ error: 'agreement-table', detail: String(e && e.message || e).slice(0, 120) }, 503, cors); }
  const kind = s(body.kind || q('kind'), 20);

  // ── 당사자(상담사·상담소) ──
  if (path === '/agreement/current' && method === 'GET') {
    if (!KINDS[kind]) return json({ error: 'bad-kind' }, 400, cors);
    const p = await partyOf(db, kind, q, body);
    if (!p) return json({ error: 'bad-code' }, 403, cors);
    const v = await published(db, kind);
    const last = await lastSign(db, kind, p.id);
    if (!v) return json({ published: false, signed: last ? { ver: last.ver, at: last.signed_at, name: last.signer_name, id: last.id } : null }, 200, cors);
    const need = !last || last.ver < v.ver;
    return json({
      published: true, ver: v.ver, title: v.title, publishedAt: v.published_at,
      body: need ? fill(v.body, p) : '', party: { name: p.name, email: p.email, signer: p.signer },
      signed: last ? { ver: last.ver, at: last.signed_at, name: last.signer_name, id: last.id } : null, needSign: need
    }, 200, cors);
  }

  if (path === '/agreement/sign' && method === 'POST') {
    if (!KINDS[kind]) return json({ error: 'bad-kind' }, 400, cors);
    const p = await partyOf(db, kind, q, body);
    if (!p) return json({ error: 'bad-code' }, 403, cors);
    const v = await published(db, kind);
    if (!v) return json({ error: 'not-published' }, 409, cors);
    if (Number(body.ver) !== v.ver) return json({ error: 'stale', ver: v.ver }, 409, cors);   // 읽는 사이 새 판이 게시됐다
    const name = s(body.signerName, 40).trim();
    if (name.length < 2) return json({ error: 'name' }, 400, cors);
    const sig = String(body.signature || '');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > MAX_SIG || sig.length < 400) return json({ error: 'signature' }, 400, cors);
    if (body.agree !== true) return json({ error: 'agree' }, 400, cors);
    const ts = nowMs();
    const text = fill(v.body, p, ts);
    const hash = await sha256(`${v.title}\n${text}`);
    const id = 'ag_' + ts.toString(36) + Math.random().toString(36).slice(2, 8);
    await db.prepare(`INSERT INTO agreement_signs (id, kind, ver, party_id, party_name, signer_name, signer_email, title, body, body_hash, signature, ip, ua, signed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, kind, v.ver, p.id, p.name, name, p.email, v.title, text, hash, sig,
        s(request.headers.get('CF-Connecting-IP'), 64), s(request.headers.get('User-Agent'), 300), ts).run();
    return json({ ok: true, id, ver: v.ver, at: ts, hash }, 200, cors);
  }

  if (path === '/agreement/mine' && method === 'GET') {
    if (!KINDS[kind]) return json({ error: 'bad-kind' }, 400, cors);
    const p = await partyOf(db, kind, q, body);
    if (!p) return json({ error: 'bad-code' }, 403, cors);
    const r = await db.prepare('SELECT id, ver, title, body, body_hash, signature, signer_name, signed_at FROM agreement_signs WHERE kind = ? AND party_id = ? ORDER BY signed_at DESC LIMIT 1').bind(kind, p.id).first();
    return json({ item: r || null }, 200, cors);
  }

  // ── 운영자 ──
  if (path.startsWith('/admin/agreements')) {
    const code = s(body.code || q('code'), 200);
    if (!env.ADMIN_CODE || code !== env.ADMIN_CODE) return json({ error: 'forbidden' }, 403, cors);

    if (path === '/admin/agreements' && method === 'GET') {
      const vs = (await db.prepare('SELECT kind, ver, title, status, created, updated, published_at, length(body) AS len FROM agreement_versions ORDER BY kind, ver DESC').all()).results || [];
      const signs = (await db.prepare('SELECT id, kind, ver, party_id, party_name, signer_name, signer_email, signed_at FROM agreement_signs ORDER BY signed_at DESC LIMIT 500').all()).results || [];
      let cs = [], hs = [];
      try { cs = (await db.prepare('SELECT id, name, email, hospital FROM counselors WHERE active = 1 ORDER BY name').all()).results || []; } catch (e) {}
      try { hs = (await db.prepare('SELECT id, name, email, doctor FROM hospitals WHERE active = 1 ORDER BY name').all()).results || []; } catch (e) {}
      const latest = {};
      for (const g of signs) { const k = g.kind + ':' + g.party_id; if (!latest[k]) latest[k] = g; }
      const pub = {}; for (const v of vs) if (v.status === 'published' && !pub[v.kind]) pub[v.kind] = v.ver;
      const party = (kind, list, sub) => list.map(x => { const g = latest[kind + ':' + x.id]; return { id: x.id, name: x.name, email: x.email || '', sub: x[sub] || '', signedVer: g ? g.ver : 0, signedAt: g ? g.signed_at : 0, signId: g ? g.id : '', current: !!(g && pub[kind] && g.ver >= pub[kind]) }; });
      return json({ kinds: KINDS, versions: vs, published: pub, signs, parties: { counselor: party('counselor', cs, 'hospital'), clinic: party('clinic', hs, 'doctor') } }, 200, cors);
    }
    if (path === '/admin/agreements/version' && method === 'GET') {
      const v = await db.prepare('SELECT * FROM agreement_versions WHERE kind = ? AND ver = ?').bind(kind, Number(q('ver')) || 0).first();
      return v ? json({ item: v }, 200, cors) : json({ error: 'not-found' }, 404, cors);
    }
    if (path === '/admin/agreements/save' && method === 'POST') {
      if (!KINDS[kind]) return json({ error: 'bad-kind' }, 400, cors);
      const title = s(body.title, 80).trim() || KINDS[kind];
      const text = String(body.body || '').replace(/\r\n/g, '\n').slice(0, MAX_BODY);
      if (text.trim().length < 50) return json({ error: 'body' }, 400, cors);
      const t = nowMs();
      const draft = await db.prepare("SELECT ver FROM agreement_versions WHERE kind = ? AND status = 'draft' ORDER BY ver DESC LIMIT 1").bind(kind).first();
      if (draft) {
        await db.prepare('UPDATE agreement_versions SET title = ?, body = ?, updated = ? WHERE kind = ? AND ver = ?').bind(title, text, t, kind, draft.ver).run();
        return json({ ok: true, ver: draft.ver }, 200, cors);
      }
      const mx = await db.prepare('SELECT MAX(ver) AS m FROM agreement_versions WHERE kind = ?').bind(kind).first();
      const ver = ((mx && mx.m) || 0) + 1;
      await db.prepare('INSERT INTO agreement_versions (kind, ver, title, body, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(kind, ver, title, text, 'draft', t, t).run();
      return json({ ok: true, ver }, 200, cors);
    }
    if (path === '/admin/agreements/publish' && method === 'POST') {
      const ver = Number(body.ver) || 0;
      const v = await db.prepare("SELECT ver FROM agreement_versions WHERE kind = ? AND ver = ? AND status = 'draft'").bind(kind, ver).first();
      if (!v) return json({ error: 'not-draft' }, 400, cors);
      await db.prepare("UPDATE agreement_versions SET status = 'published', published_at = ? WHERE kind = ? AND ver = ?").bind(nowMs(), kind, ver).run();
      return json({ ok: true, ver }, 200, cors);
    }
    if (path === '/admin/agreements/sign' && method === 'GET') {
      const r = await db.prepare('SELECT * FROM agreement_signs WHERE id = ?').bind(s(q('id'), 40)).first();
      return r ? json({ item: r }, 200, cors) : json({ error: 'not-found' }, 404, cors);
    }
  }
  return json({ error: 'not-found' }, 404, cors);
}
