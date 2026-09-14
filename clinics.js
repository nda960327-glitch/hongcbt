// 대면상담 및 진료 — 내 주변 정신건강의학과를 거리순으로.
//
//  데이터는 두 겹이다.
//   · 카카오 로컬(장소 검색) — 전국 정신건강의학과가 이미 다 들어 있다. 검색할 때마다 최신이다.
//     결과는 우리 D1(clinics)에 조용히 쌓아 두므로, 쓰면 쓸수록 '전국 등록'이 채워진다.
//     운영자는 '전국 수집'으로 한 번에 격자 스캔을 돌릴 수도 있다(/admin/clinics/sync).
//   · 우리 D1 의 제휴 병원(partner=1) — 운영자가 등록. 배지가 붙고, 담당 병원(hospitals)과 이어져 있으면
//     '앱 연동' 으로 표시돼 환자가 진료 뒤 병원 코드로 담당의와 연결할 수 있다.
//
//  위치는 검색 파라미터로만 쓰고 어디에도 남기지 않는다. (로그·D1 모두)
//
//  경로
//   앱     GET  /clinics/near?lat&lng&radius&q&limit     (q: 지역·역 이름 — 위치 권한 없을 때)
//   운영자 GET  /admin/clinics · POST /admin/clinics/save · /delete · /geocode · /sync
import { json, isAdmin, s, nowMs } from './market.js';

const KAKAO = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const QUERY = '정신건강의학과';
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v, d) => { if (v == null || v === '') return d; const n = Number(v); return Number.isFinite(n) ? n : d; };

// 두 점 사이 거리(m)
function dist(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 카카오 로컬 호출. 키(KAKAO_CLIENT_ID = REST API 키)가 없으면 null — 그러면 D1 만으로 답한다.
async function kakao(env, params) {
  const key = env.KAKAO_CLIENT_ID;
  if (!key) return null;
  const u = new URL(KAKAO);
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') u.searchParams.set(k, String(v)); });
  try {
    const r = await fetch(u.toString(), { headers: { Authorization: 'KakaoAK ' + key } });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 200); } catch (e) {}
      return { error: 'http-' + r.status, detail, documents: [], meta: { total_count: 0, is_end: true } };
    }
    return await r.json();
  } catch (e) { return null; }
}

// 검색어에 '정신건강의학과'가 들어가도 상담센터·약국이 섞여 온다. 진료과로 거른다.
const isPsy = d => {
  const cat = String(d.category_name || ''), name = String(d.place_name || '');
  return cat.includes('정신건강의학과') || cat.includes('정신과') || /정신(건강의학)?과|신경정신과/.test(name);
};
const kindOf = d => {
  const name = String(d.place_name || '');
  if (/대학교?병원|대학병원|의료원|종합병원/.test(name)) return '종합병원';
  if (/병원/.test(name)) return '병원';
  if (/보건소|정신건강복지센터/.test(name)) return '공공';
  return '의원';
};
const fromKakao = d => ({
  id: 'k' + d.id, kakao_id: String(d.id), name: String(d.place_name || '').slice(0, 80), kind: kindOf(d),
  addr: String(d.address_name || '').slice(0, 160), road_addr: String(d.road_address_name || '').slice(0, 160),
  tel: String(d.phone || '').slice(0, 30), lat: num(d.y, 0), lng: num(d.x, 0), url: String(d.place_url || '').slice(0, 200), source: 'kakao'
});

// 카카오에서 온 것은 이름·주소·좌표만 갱신한다. 운영자가 붙인 제휴·메모·연동은 건드리지 않는다.
async function upsert(db, rows) {
  const t = nowMs();
  const jobs = rows.filter(r => r.lat && r.lng).map(r => db.prepare(
    `INSERT INTO clinics (id, kakao_id, name, kind, addr, road_addr, tel, lat, lng, url, partner, note, tags, active, source, created, updated)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,'','',1,'kakao',?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, addr = excluded.addr, road_addr = excluded.road_addr,
       tel = excluded.tel, lat = excluded.lat, lng = excluded.lng, url = excluded.url, updated = excluded.updated`)
    .bind(r.id, r.kakao_id, r.name, r.kind, r.addr, r.road_addr, r.tel, r.lat, r.lng, r.url, t, t));
  for (let i = 0; i < jobs.length; i += 40) await db.batch(jobs.slice(i, i + 40));
  return jobs.length;
}

const rowOut = (r, center) => ({
  id: r.id, name: r.name, kind: r.kind || '의원', addr: r.addr || '', roadAddr: r.road_addr || '', tel: r.tel || '',
  lat: Number(r.lat), lng: Number(r.lng), url: r.url || '',
  partner: !!r.partner, note: r.note || '', tags: String(r.tags || '').split(',').map(x => x.trim()).filter(Boolean),
  hospitalId: r.hospital_id || '', hospitalName: r.hospital_name || '',
  dist: center ? dist(center.lat, center.lng, Number(r.lat), Number(r.lng)) : null
});

export async function handleClinics(request, env, cors, path, ctx) {
  if (!/^\/(clinics\/|admin\/clinics)/.test(path)) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const later = p => { if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {})); else p.catch(() => {}); };

  // ══════════════ 앱: 내 주변 ══════════════
  if (path === '/clinics/near' && method === 'GET') {
    let lat = num(q('lat'), NaN), lng = num(q('lng'), NaN);
    const radius = Math.min(50000, Math.max(1000, num(q('radius'), 10000)));
    const limit = Math.min(200, Math.max(10, num(q('limit'), 120)));
    let label = '';
    const place = s(q('q'), 60).trim();
    // 위치 권한이 없으면 지역·역 이름으로 중심을 잡는다
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && place) {
      const g = await kakao(env, { query: place, size: 5 });
      const d = g && g.documents && g.documents[0];
      // 200 으로 준다 — 앱의 Api.json 은 4xx 를 '네트워크 오류'로 뭉뚱그려서 "못 찾았어요"를 따로 보여줄 수 없다
      if (!d) return json({ error: 'not-found', live: !!(g && !g.error) }, 200, cors);
      lat = num(d.y, NaN); lng = num(d.x, NaN); label = d.place_name || place;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'missing' }, 400, cors);
    if (lat < 32 || lat > 40 || lng < 123 || lng > 133) return json({ error: 'out-of-range' }, 400, cors);
    const center = { lat, lng, label };

    const map = new Map();
    const put = (r, prefer) => {
      const k = r.kakao_id ? 'k' + r.kakao_id : r.id;
      const old = map.get(k);
      if (!old) { map.set(k, { ...r }); return; }
      // 카카오 최신 정보 + 우리 제휴 정보를 합친다
      map.set(k, prefer ? { ...old, ...r } : { ...r, ...old, name: old.name || r.name, lat: old.lat || r.lat, lng: old.lng || r.lng });
    };

    // 1) 제휴 병원 (운영자 등록) — 담당 병원 이름까지
    const partners = (await db.prepare(
      `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id AND h.active = 1
        WHERE c.partner = 1 AND c.active = 1 LIMIT 500`).all()).results || [];
    partners.forEach(r => put(r, true));

    // 2) 카카오 — 가까운 순 최대 45곳
    let kakaoOk = false;
    const fresh = [];
    for (let page = 1; page <= 3; page++) {
      const r = await kakao(env, { query: QUERY, x: lng, y: lat, radius: Math.min(20000, radius), sort: 'distance', size: 15, page });
      if (!r || r.error) break;
      kakaoOk = true;
      (r.documents || []).filter(isPsy).forEach(d => { const row = fromKakao(d); fresh.push(row); put(row, false); });
      if (!r.meta || r.meta.is_end) break;
    }
    if (fresh.length) later(upsert(db, fresh));

    // 3) 우리 D1 에 쌓인 것 (반경 안) — 카카오가 죽었거나 45곳 너머까지
    const dLat = radius / 111000, dLng = radius / (111000 * Math.cos(lat * Math.PI / 180));
    const near = (await db.prepare(
      `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id AND h.active = 1
        WHERE c.active = 1 AND c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ? LIMIT 600`)
      .bind(lat - dLat, lat + dLat, lng - dLng, lng + dLng).all()).results || [];
    near.forEach(r => put(r, false));

    // 제휴인데 kakao_id 가 없는 건 이름·거리로 카카오 것과 합친다 (같은 곳이 두 번 뜨지 않게)
    const items = [...map.values()].map(r => rowOut(r, center));
    const norm = n => String(n || '').replace(/\s|의원|병원/g, '');
    const out = [];
    items.sort((a, b) => (b.partner - a.partner) || (a.dist - b.dist));
    for (const it of items) {
      const dup = out.find(o => o.partner && !it.partner && norm(o.name) === norm(it.name) && dist(o.lat, o.lng, it.lat, it.lng) < 150);
      if (dup) { if (!dup.url) dup.url = it.url; if (!dup.tel) dup.tel = it.tel; continue; }
      out.push(it);
    }
    const result = out.filter(it => it.dist <= radius || (it.partner && it.dist <= radius * 2)).sort((a, b) => a.dist - b.dist).slice(0, limit);
    return json({ center, items: result, live: kakaoOk, radius }, 200, cors);
  }

  // ══════════════ 운영자 ══════════════
  if (path.startsWith('/admin/clinics')) {
    const code = s(body.code || q('code'), 64);
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);

    if (path === '/admin/clinics' && method === 'GET') {
      const partners = (await db.prepare(
        `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id
          WHERE c.partner = 1 ORDER BY c.updated DESC LIMIT 300`).all()).results || [];
      const tot = await db.prepare('SELECT COUNT(*) n, SUM(CASE WHEN source = \'kakao\' THEN 1 ELSE 0 END) k FROM clinics').first();
      const st = await db.prepare("SELECT v FROM clinic_sync WHERE k = 'grid'").first();
      return json({
        partners: partners.map(r => ({ ...rowOut(r, null), active: !!r.active, source: r.source || '', updated: r.updated, kakaoId: r.kakao_id || '' })),
        total: (tot && tot.n) || 0, fromKakao: (tot && tot.k) || 0,
        sync: st ? JSON.parse(st.v) : null, kakaoKey: !!env.KAKAO_CLIENT_ID
      }, 200, cors);
    }

    // 주소·이름으로 후보 찾기 (운영자가 좌표를 손으로 안 치게)
    if (path === '/admin/clinics/geocode' && method === 'POST') {
      const query = s(body.q, 80).trim();
      if (!query) return json({ error: 'missing' }, 400, cors);
      const r = await kakao(env, { query, size: 10 });
      if (!r) return json({ error: 'no-kakao-key' }, 503, cors);
      // 카카오가 거절하면(키 종류·권한) 운영자가 원인을 보게 그대로 알려준다
      return json({ items: (r.documents || []).map(fromKakao).map(x => ({ ...x, kakaoId: x.kakao_id, roadAddr: x.road_addr, psy: isPsy({ category_name: '', place_name: x.name }) })), kakaoError: r.error || '', kakaoDetail: r.detail || '' }, 200, cors);
    }

    if (path === '/admin/clinics/save' && method === 'POST') {
      const name = s(body.name, 80).trim();
      const lat = num(body.lat, NaN), lng = num(body.lng, NaN);
      if (!name) return json({ error: 'missing-name' }, 400, cors);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'missing-coords' }, 400, cors);
      const kakaoId = s(body.kakaoId, 32).replace(/\D/g, '');
      let id = s(body.id, 64).replace(/[^\w-]/g, '') || (kakaoId ? 'k' + kakaoId : rid('cl'));
      const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',')).map(x => s(x, 20).trim()).filter(Boolean).slice(0, 8).join(',');
      const hospitalId = s(body.hospitalId, 64).replace(/[^\w-]/g, '');
      const t = nowMs();
      await db.prepare(
        `INSERT INTO clinics (id, kakao_id, name, kind, addr, road_addr, tel, lat, lng, url, partner, hospital_id, note, tags, active, source, created, updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET kakao_id = COALESCE(NULLIF(excluded.kakao_id, ''), clinics.kakao_id), name = excluded.name, kind = excluded.kind,
           addr = excluded.addr, road_addr = excluded.road_addr, tel = excluded.tel, lat = excluded.lat, lng = excluded.lng, url = excluded.url,
           partner = 1, hospital_id = excluded.hospital_id, note = excluded.note, tags = excluded.tags, active = excluded.active, updated = excluded.updated`)
        .bind(id, kakaoId || null, name, s(body.kind, 20) || '의원', s(body.addr, 160), s(body.roadAddr, 160), s(body.tel, 30), lat, lng, s(body.url, 200),
          hospitalId, s(body.note, 200), tags, body.active === false ? 0 : 1, kakaoId ? 'kakao' : 'manual', t, t).run();
      return json({ ok: true, id }, 200, cors);
    }

    if (path === '/admin/clinics/delete' && method === 'POST') {
      const id = s(body.id, 64).replace(/[^\w-]/g, '');
      const row = await db.prepare('SELECT source FROM clinics WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'not-found' }, 404, cors);
      // 카카오에서 온 곳은 제휴만 떼고 남긴다 (검색에는 계속 나와야 한다). 손으로 넣은 곳은 지운다.
      if (row.source === 'kakao') await db.prepare("UPDATE clinics SET partner = 0, hospital_id = '', note = '', tags = '', active = 1 WHERE id = ?").bind(id).run();
      else await db.prepare('DELETE FROM clinics WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, cors);
    }

    // ── 전국 수집 — 한반도를 격자로 훑는다 ──
    //  카카오는 사각형(rect) 안 결과를 45곳까지만 준다. 45곳이 넘는 칸(도심)은 넷으로 쪼개 다시 본다.
    //  한 번 호출에 카카오를 budget 번만 부른다 (Worker 서브요청 한도). 운영자 콘솔이 끝날 때까지 반복 호출한다.
    if (path === '/admin/clinics/sync' && method === 'POST') {
      if (!env.KAKAO_CLIENT_ID) return json({ error: 'no-kakao-key' }, 503, cors);
      const GRID = { minLat: 33.05, maxLat: 38.65, minLng: 124.6, maxLng: 131.9, step: 0.09 };
      const cols = Math.ceil((GRID.maxLng - GRID.minLng) / GRID.step), rows = Math.ceil((GRID.maxLat - GRID.minLat) / GRID.step);
      let st = null;
      const saved = await db.prepare("SELECT v FROM clinic_sync WHERE k = 'grid'").first();
      if (saved && !body.reset) { try { st = JSON.parse(saved.v); } catch (e) { st = null; } }
      if (!st || st.done || body.reset) st = { i: 0, total: cols * rows, queue: [], found: 0, calls: 0, done: false, started: nowMs(), updated: nowMs() };
      const budget = Math.min(40, Math.max(5, num(body.budget, 25)));
      let calls = 0, found = 0;
      const rows2 = [];
      const scan = async (cell) => {   // cell: [minLng, minLat, maxLng, maxLat, depth]
        const rect = `${cell[0].toFixed(5)},${cell[1].toFixed(5)},${cell[2].toFixed(5)},${cell[3].toFixed(5)}`;
        let r = await kakao(env, { query: QUERY, rect, size: 15, page: 1 }); calls++;
        if (!r || r.error) { st.queue.unshift(cell); return false; }   // 실패하면 다음 번에 다시
        const total = (r.meta && r.meta.total_count) || 0;
        if (total > 45 && cell[4] < 5) {
          const mx = (cell[0] + cell[2]) / 2, my = (cell[1] + cell[3]) / 2, d = cell[4] + 1;
          st.queue.push([cell[0], cell[1], mx, my, d], [mx, cell[1], cell[2], my, d], [cell[0], my, mx, cell[3], d], [mx, my, cell[2], cell[3], d]);
          return true;
        }
        (r.documents || []).filter(isPsy).forEach(d => rows2.push(fromKakao(d)));
        for (let page = 2; page <= 3 && r.meta && !r.meta.is_end && calls < budget + 2; page++) {
          r = await kakao(env, { query: QUERY, rect, size: 15, page }); calls++;
          if (!r || r.error) break;
          (r.documents || []).filter(isPsy).forEach(d => rows2.push(fromKakao(d)));
        }
        return true;
      };
      while (calls < budget) {
        let cell = st.queue.shift();
        if (!cell) {
          if (st.i >= st.total) { st.done = true; break; }
          const c = st.i % cols, rr = Math.floor(st.i / cols); st.i++;
          const minLng = GRID.minLng + c * GRID.step, minLat = GRID.minLat + rr * GRID.step;
          cell = [minLng, minLat, Math.min(GRID.maxLng, minLng + GRID.step), Math.min(GRID.maxLat, minLat + GRID.step), 0];
        }
        const ok = await scan(cell);
        if (!ok) break;
      }
      if (rows2.length) {
        const uniq = new Map(); rows2.forEach(r => uniq.set(r.id, r));
        found = await upsert(db, [...uniq.values()]);
      }
      st.found += found; st.calls += calls; st.updated = nowMs();
      if (!st.queue.length && st.i >= st.total) st.done = true;
      await db.prepare("INSERT INTO clinic_sync (k, v) VALUES ('grid', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(st)).run();
      const tot = await db.prepare('SELECT COUNT(*) n FROM clinics').first();
      return json({ ok: true, progress: { i: st.i, total: st.total, queued: st.queue.length, done: st.done, found: st.found, calls: st.calls, dbTotal: (tot && tot.n) || 0 }, thisCall: { calls, found } }, 200, cors);
    }
    return null;
  }
  return null;
}
