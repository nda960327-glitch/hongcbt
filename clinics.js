// 대면상담 및 진료 — 내 주변 정신건강의학과를 거리순으로.
//
//  데이터: 국립중앙의료원 '전국 병·의원 찾기 서비스'(data.go.kr, HsptlAsembySearchService).
//   진료과목 D004(정신건강의학과)로 걸러 받으면 전국 약 3,800곳이 이름·주소·전화·좌표·요일별 진료시간과 함께 온다.
//   지도 회사 API 가 필요 없다. 지도 보기·길찾기는 네이버 지도 링크로 연다(API 아님).
//   (카카오 로컬은 사장님 지시로 제외, 네이버 검색 API 는 신규 앱에 열리지 않음, 심평원 병원정보서비스는 활용신청이 안 된 상태)
//
//  두 겹
//   · D1 clinics — 공공데이터에서 받아 쌓은 전국 정신과(source='nmc') + 운영자가 등록한 제휴 병원(partner=1).
//     담당 병원(hospitals)과 이어져 있으면 '앱 연동'으로 표시돼 환자가 진료 뒤 병원 코드로 담당의와 연결할 수 있다.
//   · '내 주변'은 D1 반경 조회. 지역 이름 검색("수원 영통")은 주소에 그 말이 들어간 병원들의 중심을 잡는다.
//
//  위치는 검색 파라미터로만 쓰고 어디에도 남기지 않는다. (로그·D1 모두)
//
//  경로
//   앱     GET  /clinics/near?lat&lng&radius&q&limit     (q: 지역 이름 — 위치 권한 없을 때)
//   운영자 GET  /admin/clinics · POST /admin/clinics/save · /delete · /geocode(DB 에서 후보) · /sync(공공데이터 받기)
//  비밀값  DATA_GO_KEY (없으면 HIRA_KEY) — data.go.kr 일반 인증키(Decoding). 계정마다 하나라 서비스가 달라도 같은 키다.
import { json, isAdmin, s, nowMs } from './market.js';

const NMC = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire';
const PSY_QD = 'D004';          // 진료과목 코드: 정신건강의학과
const ROWS = 500;               // 한 페이지
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v, d) => { if (v == null || v === '') return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
const keyOf = env => env.DATA_GO_KEY || env.HIRA_KEY || '';

// 두 점 사이 거리(m)
function dist(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 공공데이터 한 페이지 (XML). data.go.kr 오류 응답도 XML 이다.
async function nmc(env, page) {
  const key = keyOf(env);
  if (!key) return null;
  const u = new URL(NMC);
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('QD', PSY_QD);
  u.searchParams.set('pageNo', String(page));
  u.searchParams.set('numOfRows', String(ROWS));
  let r;
  try { r = await fetch(u.toString()); } catch (e) { return { error: 'network', items: [], total: 0 }; }
  const text = await r.text();
  const auth = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || text.match(/"returnAuthMsg"\s*:\s*"([^"]*)"/);
  if (!r.ok || auth) return { error: 'http-' + r.status, detail: auth ? auth[1] : text.slice(0, 160), items: [], total: 0 };
  const code = text.match(/<resultCode>([^<]*)<\/resultCode>/);
  if (code && code[1] !== '00') { const msg = text.match(/<resultMsg>([^<]*)<\/resultMsg>/); return { error: 'api-' + code[1], detail: msg ? msg[1] : '', items: [], total: 0 }; }
  const items = (text.match(/<item>[\s\S]*?<\/item>/g) || []).map(b => {
    const o = {};
    b.replace(/<(\w+)>([^<]*)<\/\1>/g, (_, k, v) => { o[k] = v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); return ''; });
    return o;
  });
  const tc = text.match(/<totalCount>(\d+)<\/totalCount>/);
  return { items, total: tc ? Number(tc[1]) : items.length };
}

// 기관 구분 — dutyDivNam 은 자료가 들쭉날쭉해(종합병원이 '조산원'으로 오기도 한다) 이름을 먼저 본다
const DIV = { A: '종합병원', B: '병원', C: '의원', D: '요양병원', R: '공공' };
function kindOf(name, div) {
  const n = String(name || '');
  if (/대학교?병원|대학병원|의료원|종합병원/.test(n)) return '종합병원';
  if (/보건소|정신건강복지센터/.test(n)) return '공공';
  if (/요양병원/.test(n)) return '요양병원';
  if (/병원/.test(n)) return '병원';
  if (/의원/.test(n)) return '의원';
  return DIV[String(div || '').trim()] || '의원';
}
// 요일별 진료시간 {1:[s,c], … 7:일, 8:공휴일}. 값은 "0900" 같은 네 자리
function hoursOf(d) {
  const h = {};
  for (let i = 1; i <= 8; i++) {
    const a = String(d['dutyTime' + i + 's'] || '').trim(), b = String(d['dutyTime' + i + 'c'] || '').trim();
    if (/^\d{3,4}$/.test(a) && /^\d{3,4}$/.test(b)) h[i] = [a.padStart(4, '0'), b.padStart(4, '0')];
  }
  return Object.keys(h).length ? JSON.stringify(h) : '';
}
// 진료과목 필터(QD=D004)가 느슨해서 이비인후과·척추병원 같은 곳이 섞여 온다.
//  이름에 정신·마음·심리가 있거나 종합병원급·공공이면 남기고, 다른 과 이름이 뚜렷한 곳은 뺀다.
//  이름만으로 과를 알 수 없는 'OO의원'은 남긴다(정신과가 그런 이름을 쓰는 경우가 많다).
const PSY_NAME = /정신|신경정신|마음|심리|뇌건강|수면/;
const BIG = /대학교?병원|대학병원|의료원|종합병원|보건소|정신건강복지센터|국립.*병원|시립.*병원|도립.*병원/;
const OTHER = /이비인후|내과|외과|정형|피부|안과|치과|한의원|한방|산부인과|여성의원|여성병원|소아|재활|통증|척추|관절|비뇨|성형|영상의학|가정의학|유방|항문|내시경|검진|안이비|요양병원|이비|족부|수부|튼튼|365|연합의원|스포츠/;
const isPsyClinic = (name, kind) => PSY_NAME.test(name) || kind === '종합병원' || BIG.test(name) || !OTHER.test(name);
const fromNmc = d => {
  const name = String(d.dutyName || '').trim().slice(0, 80);
  return {
    id: 'm' + String(d.hpid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 30) || rid('m'),
    name, kind: kindOf(name, d.dutyDiv),
    addr: String(d.dutyAddr || '').trim().slice(0, 160),
    road_addr: String(d.dutyAddr || '').trim().slice(0, 160),   // 도로명 주소다
    tel: String(d.dutyTel1 || '').trim().slice(0, 30),
    lat: num(d.wgs84Lat, 0), lng: num(d.wgs84Lon, 0),
    url: '',
    hours: hoursOf(d),
    note_etc: String(d.dutyEtc || '').trim().slice(0, 120),
    tags: /정신|신경정신|마음/.test(name) ? '정신과전문' : '',
    source: 'nmc'
  };
};

// 공공데이터에서 온 것은 이름·주소·좌표·전화·진료시간만 갱신한다. 운영자가 붙인 제휴·메모·연동은 건드리지 않는다.
async function upsert(db, rows) {
  const t = nowMs();
  const jobs = rows.filter(r => r.name && r.lat > 32 && r.lat < 40 && r.lng > 123 && r.lng < 133).map(r => db.prepare(
    `INSERT INTO clinics (id, kakao_id, name, kind, addr, road_addr, tel, lat, lng, url, partner, note, tags, hours, active, source, created, updated)
     VALUES (?,NULL,?,?,?,?,?,?,?,'',0,'',?,?,1,'nmc',?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, addr = excluded.addr, road_addr = excluded.road_addr,
       tel = CASE WHEN excluded.tel != '' THEN excluded.tel ELSE clinics.tel END, lat = excluded.lat, lng = excluded.lng,
       hours = CASE WHEN excluded.hours != '' THEN excluded.hours ELSE clinics.hours END,
       tags = CASE WHEN clinics.partner = 1 THEN clinics.tags ELSE excluded.tags END, updated = excluded.updated`)
    .bind(r.id, r.name, r.kind, r.addr, r.road_addr, r.tel, r.lat, r.lng, r.tags, r.hours, t, t));
  for (let i = 0; i < jobs.length; i += 50) await db.batch(jobs.slice(i, i + 50));
  return jobs.length;
}

const parseHours = h => { if (!h) return null; try { return JSON.parse(h); } catch (e) { return null; } };
const rowOut = (r, center) => ({
  id: r.id, name: r.name, kind: r.kind || '의원', addr: r.addr || '', roadAddr: r.road_addr || '', tel: r.tel || '',
  lat: Number(r.lat), lng: Number(r.lng), url: r.url || '',
  partner: !!r.partner, note: r.note || '', tags: String(r.tags || '').split(',').map(x => x.trim()).filter(Boolean),
  hours: parseHours(r.hours),
  hospitalId: r.hospital_id || '', hospitalName: r.hospital_name || '',
  dist: center ? dist(center.lat, center.lng, Number(r.lat), Number(r.lng)) : null
});

// 지역 이름("수원 영통", "강남구 역삼동") → 주소에 그 말이 다 들어간 병원들의 중심
async function centerByName(db, place) {
  const toks = place.split(/\s+/).filter(t => t.length >= 2).slice(0, 4);
  if (!toks.length) return null;
  // '수원시' 라고 쳐도 '수원' 으로, '역삼동' 도 '역삼' 으로 맞춘다
  const likes = toks.map(t => '%' + t.replace(/(특별시|광역시|특별자치시|특별자치도|시|도|구|군|동|읍|면|리)$/, '') + '%');
  const where = likes.map(() => 'addr LIKE ?').join(' AND ');
  const r = await db.prepare(`SELECT lat, lng FROM clinics WHERE active = 1 AND ${where} LIMIT 200`).bind(...likes).all();
  const rows = (r.results || []).filter(x => x.lat && x.lng);
  if (!rows.length) return null;
  // 평균 대신 중앙값 — 한두 곳이 멀리 떨어져 있어도 중심이 튀지 않는다
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  return { lat: med(rows.map(x => x.lat)), lng: med(rows.map(x => x.lng)), n: rows.length };
}

export async function handleClinics(request, env, cors, path, ctx) {
  if (!/^\/(clinics\/|admin\/clinics)/.test(path)) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const hasKey = !!keyOf(env);

  // ══════════════ 앱: 내 주변 ══════════════
  if (path === '/clinics/near' && method === 'GET') {
    let lat = num(q('lat'), NaN), lng = num(q('lng'), NaN);
    const radius = Math.min(50000, Math.max(1000, num(q('radius'), 10000)));
    const limit = Math.min(200, Math.max(10, num(q('limit'), 120)));
    let label = '';
    const place = s(q('q'), 60).trim();
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && place) {
      const c = await centerByName(db, place);
      // 200 으로 준다 — 앱의 Api.json 은 4xx 를 '네트워크 오류'로 뭉뚱그려서 "못 찾았어요"를 따로 보여줄 수 없다
      if (!c) return json({ error: 'not-found', live: hasKey }, 200, cors);
      lat = c.lat; lng = c.lng; label = place;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'missing' }, 400, cors);
    if (lat < 32 || lat > 40 || lng < 123 || lng > 133) return json({ error: 'out-of-range' }, 400, cors);
    const center = { lat, lng, label };

    const map = new Map();
    // 1) 제휴 병원 (운영자 등록) — 담당 병원 이름까지
    const partners = (await db.prepare(
      `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id AND h.active = 1
        WHERE c.partner = 1 AND c.active = 1 LIMIT 500`).all()).results || [];
    partners.forEach(r => map.set(r.id, r));
    // 2) 반경 안
    const dLat = radius / 111000, dLng = radius / (111000 * Math.cos(lat * Math.PI / 180));
    const near = (await db.prepare(
      `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id AND h.active = 1
        WHERE c.active = 1 AND c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ? LIMIT 800`)
      .bind(lat - dLat, lat + dLat, lng - dLng, lng + dLng).all()).results || [];
    near.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });

    // 제휴로 따로 등록한 곳과 공공데이터에서 온 같은 곳이 두 번 뜨지 않게 이름·거리로 합친다
    const items = [...map.values()].map(r => rowOut(r, center));
    const norm = n => String(n || '').replace(/\s|의원|병원|정신건강의학과|정신과/g, '');
    const out = [];
    items.sort((a, b) => (b.partner - a.partner) || (a.dist - b.dist));
    for (const it of items) {
      const dup = out.find(o => o.partner && !it.partner && norm(o.name) === norm(it.name) && dist(o.lat, o.lng, it.lat, it.lng) < 200);
      if (dup) { if (!dup.url) dup.url = it.url; if (!dup.tel) dup.tel = it.tel; if (!dup.hours) dup.hours = it.hours; continue; }
      out.push(it);
    }
    const tot = await db.prepare('SELECT COUNT(*) n FROM clinics WHERE active = 1').first();
    const result = out.filter(it => it.dist <= radius || (it.partner && it.dist <= radius * 2)).sort((a, b) => a.dist - b.dist).slice(0, limit);
    return json({ center, items: result, live: hasKey, radius, registered: (tot && tot.n) || 0 }, 200, cors);
  }

  // ══════════════ 운영자 ══════════════
  if (path.startsWith('/admin/clinics')) {
    const code = s(body.code || q('code'), 64);
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);

    if (path === '/admin/clinics' && method === 'GET') {
      const partners = (await db.prepare(
        `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id
          WHERE c.partner = 1 ORDER BY c.updated DESC LIMIT 300`).all()).results || [];
      const tot = await db.prepare("SELECT COUNT(*) n, SUM(CASE WHEN source = 'nmc' THEN 1 ELSE 0 END) k FROM clinics").first();
      const st = await db.prepare("SELECT v FROM clinic_sync WHERE k = 'grid'").first();
      let sync = null;
      if (st) { try { const j = JSON.parse(st.v); sync = { i: j.i, total: j.total, queued: Math.max(0, j.total - j.i), done: !!j.done, found: j.found, calls: j.calls, started: j.started, updated: j.updated, lastError: j.lastError || '' }; } catch (e) {} }
      return json({
        partners: partners.map(r => ({ ...rowOut(r, null), active: !!r.active, source: r.source || '', updated: r.updated, kakaoId: '' })),
        total: (tot && tot.n) || 0, fromProvider: (tot && tot.k) || 0, sync, providerKey: hasKey, provider: 'nmc'
      }, 200, cors);
    }

    // 이름·주소로 후보 찾기 — 공공데이터가 이미 D1 에 있으니 거기서 찾는다
    if (path === '/admin/clinics/geocode' && method === 'POST') {
      const query = s(body.q, 80).trim();
      if (!query) return json({ error: 'missing' }, 400, cors);
      const toks = query.split(/\s+/).filter(Boolean).slice(0, 4);
      const where = toks.map(() => '(name LIKE ? OR addr LIKE ?)').join(' AND ');
      const args = []; toks.forEach(t => { args.push('%' + t + '%', '%' + t + '%'); });
      const r = await db.prepare(`SELECT * FROM clinics WHERE active = 1 AND ${where} ORDER BY partner DESC, name LIMIT 12`).bind(...args).all();
      const items = (r.results || []).map(x => ({ ...rowOut(x, null), kakaoId: '', psy: true, source: x.source || '' }));
      return json({ items, providerError: '', providerDetail: '', hint: items.length ? '' : (hasKey ? '전국 수집을 먼저 돌리면 여기서 바로 찾을 수 있어요. 없으면 아래에 직접 적어주세요.' : '공공데이터 인증키를 넣고 전국 수집을 돌리면 여기서 찾을 수 있어요.') }, 200, cors);
    }

    if (path === '/admin/clinics/save' && method === 'POST') {
      const name = s(body.name, 80).trim();
      const lat = num(body.lat, NaN), lng = num(body.lng, NaN);
      if (!name) return json({ error: 'missing-name' }, 400, cors);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'missing-coords' }, 400, cors);
      const id = s(body.id, 64).replace(/[^\w-]/g, '') || rid('cl');
      const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',')).map(x => s(x, 20).trim()).filter(Boolean).slice(0, 8).join(',');
      const hospitalId = s(body.hospitalId, 64).replace(/[^\w-]/g, '');
      const t = nowMs();
      const exists = await db.prepare('SELECT source FROM clinics WHERE id = ?').bind(id).first();
      await db.prepare(
        `INSERT INTO clinics (id, kakao_id, name, kind, addr, road_addr, tel, lat, lng, url, partner, hospital_id, note, tags, active, source, created, updated)
         VALUES (?,NULL,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
           addr = excluded.addr, road_addr = excluded.road_addr, tel = excluded.tel, lat = excluded.lat, lng = excluded.lng, url = excluded.url,
           partner = 1, hospital_id = excluded.hospital_id, note = excluded.note, tags = excluded.tags, active = excluded.active, updated = excluded.updated`)
        .bind(id, name, s(body.kind, 20) || '의원', s(body.addr, 160), s(body.roadAddr, 160), s(body.tel, 30), lat, lng, s(body.url, 200),
          hospitalId, s(body.note, 200), tags, body.active === false ? 0 : 1, (exists && exists.source) || 'manual', t, t).run();
      return json({ ok: true, id }, 200, cors);
    }

    if (path === '/admin/clinics/delete' && method === 'POST') {
      const id = s(body.id, 64).replace(/[^\w-]/g, '');
      const row = await db.prepare('SELECT source FROM clinics WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'not-found' }, 404, cors);
      // 공공데이터에서 온 곳은 제휴만 떼고 남긴다 (검색에는 계속 나와야 한다). 손으로 넣은 곳은 지운다.
      if (row.source === 'nmc' || row.source === 'hira') await db.prepare("UPDATE clinics SET partner = 0, hospital_id = '', note = '', tags = '', active = 1 WHERE id = ?").bind(id).run();
      else await db.prepare('DELETE FROM clinics WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, cors);
    }

    // ── 전국 수집 — 공공데이터 페이지를 차례로 받는다. 한 호출에 budget 페이지(페이지당 500곳).
    if (path === '/admin/clinics/sync' && method === 'POST') {
      if (!hasKey) return json({ error: 'no-provider-key' }, 503, cors);
      let st = null;
      const saved = await db.prepare("SELECT v FROM clinic_sync WHERE k = 'grid'").first();
      if (saved && !body.reset) { try { st = JSON.parse(saved.v); } catch (e) { st = null; } }
      if (!st || st.done || body.reset || st.provider !== 'nmc') st = { provider: 'nmc', page: 1, i: 0, total: 0, found: 0, calls: 0, done: false, started: nowMs(), updated: nowMs(), lastError: '' };
      const budget = Math.min(4, Math.max(1, num(body.budget, 2)));
      let calls = 0, found = 0;
      while (calls < budget && !st.done) {
        const r = await nmc(env, st.page); calls++;
        if (!r || r.error) { st.lastError = r ? (r.error + ' ' + (r.detail || '')).trim() : 'network'; break; }
        st.lastError = '';
        st.total = r.total || st.total;
        const rows = r.items.map(fromNmc).filter(x => isPsyClinic(x.name, x.kind));
        if (rows.length) found += await upsert(db, rows);
        st.i += r.items.length;
        st.page++;
        if (!r.items.length || st.i >= st.total) st.done = true;
      }
      st.found += found; st.calls += calls; st.updated = nowMs();
      await db.prepare("INSERT INTO clinic_sync (k, v) VALUES ('grid', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(st)).run();
      const tot = await db.prepare('SELECT COUNT(*) n FROM clinics').first();
      return json({ ok: true, progress: { i: st.i, total: st.total, queued: Math.max(0, st.total - st.i), done: st.done, found: st.found, calls: st.calls, dbTotal: (tot && tot.n) || 0, lastError: st.lastError }, thisCall: { calls, found } }, 200, cors);
    }
    return null;
  }
  return null;
}
