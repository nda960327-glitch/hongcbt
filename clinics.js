// 대면상담 및 진료 — 내 주변 정신건강의학과를 거리순으로. (네이버)
//
//  데이터는 두 겹이다.
//   · 네이버 지역 검색(openapi.naver.com/v1/search/local) — 네이버 지도의 장소 데이터. 로그인에 쓰는
//     NAVER_CLIENT_ID/SECRET 을 그대로 쓴다(네이버 개발자센터 앱에 '검색' API 가 켜져 있어야 한다).
//     한 번에 5곳까지만 주고 좌표 반경 검색이 없다. 그래서 '주변'은 우리 D1 에 쌓인 것으로 계산하고,
//     네이버는 (1) 지역 이름 → 좌표, (2) 전국 수집(지역 이름으로 훑어 D1 채우기)에 쓴다.
//   · 우리 D1 clinics — 전국 수집으로 채운 정신과 + 운영자가 등록한 제휴 병원(partner=1).
//     담당 병원(hospitals)과 이어져 있으면 '앱 연동'으로 표시돼 환자가 진료 뒤 병원 코드로 담당의와 연결할 수 있다.
//
//  전국 수집은 눈덩이 방식이다. 전국 시군구 이름으로 "OO구 정신건강의학과"를 검색하고, 결과 주소에서 나온
//  동 이름으로 "OO구 OO동 정신건강의학과"를 다시 검색한다. 새 동이 안 나올 때까지. 한 호출에 25번씩 이어서.
//
//  위치는 검색 파라미터로만 쓰고 어디에도 남기지 않는다. (로그·D1 모두)
//
//  경로
//   앱     GET  /clinics/near?lat&lng&radius&q&limit     (q: 지역·역 이름 — 위치 권한 없을 때)
//   운영자 GET  /admin/clinics · POST /admin/clinics/save · /delete · /geocode · /sync
import { json, isAdmin, s, nowMs } from './market.js';

const NAVER = 'https://openapi.naver.com/v1/search/local.json';
const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v, d) => { if (v == null || v === '') return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
const stripTags = t => String(t || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();

// 두 점 사이 거리(m)
function dist(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 네이버 지역 검색. 키가 없으면 null — 그러면 D1 만으로 답한다.
async function naver(env, query, opts) {
  // 검색 전용 앱을 따로 만들었으면 그 키가 우선 (로그인 앱에 '검색' API 를 못 붙이는 경우가 있다)
  const id = env.NAVER_SEARCH_ID || env.NAVER_CLIENT_ID, secret = env.NAVER_SEARCH_SECRET || env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return null;
  const u = new URL(NAVER);
  u.searchParams.set('query', query);
  u.searchParams.set('display', String((opts && opts.display) || 5));
  u.searchParams.set('start', '1');
  u.searchParams.set('sort', (opts && opts.sort) || 'random');
  try {
    const r = await fetch(u.toString(), { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.text()).slice(0, 200); } catch (e) {}
      return { error: 'http-' + r.status, detail, items: [], total: 0 };
    }
    return await r.json();
  } catch (e) { return null; }
}

// 검색어에 '정신건강의학과'가 들어가도 상담센터·약국이 섞여 온다. 분류로 거른다.
const isPsy = d => {
  const cat = String(d.category || ''), name = stripTags(d.title);
  return cat.includes('정신건강의학과') || cat.includes('정신과') || /정신(건강의학)?과|신경정신과/.test(name);
};
const kindOf = (name, cat) => {
  if (/대학교?병원|대학병원|의료원|종합병원/.test(name) || /종합병원|대학병원/.test(cat)) return '종합병원';
  if (/병원/.test(name)) return '병원';
  if (/보건소|정신건강복지센터/.test(name)) return '공공';
  return '의원';
};
// 네이버는 장소 id 를 주지 않는다. 이름+주소로 안정적인 id 를 만든다.
function hashId(name, addr) {
  let h = 5381; const str = (name + '|' + addr).replace(/\s/g, '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return 'n' + (h >>> 0).toString(36);
}
const fromNaver = d => {
  const name = stripTags(d.title).slice(0, 80);
  const addr = String(d.address || '').slice(0, 160), road = String(d.roadAddress || '').slice(0, 160);
  // mapx/mapy 는 WGS84 경도·위도 × 10^7
  const lng = num(d.mapx, 0) / 1e7, lat = num(d.mapy, 0) / 1e7;
  return { id: hashId(name, road || addr), kakao_id: null, name, kind: kindOf(name, String(d.category || '')), addr, road_addr: road,
    tel: String(d.telephone || '').slice(0, 30), lat, lng, url: String(d.link || '').slice(0, 200), source: 'naver' };
};

// 네이버에서 온 것은 이름·주소·좌표만 갱신한다. 운영자가 붙인 제휴·메모·연동은 건드리지 않는다.
async function upsert(db, rows) {
  const t = nowMs();
  const jobs = rows.filter(r => r.lat > 32 && r.lat < 40 && r.lng > 123 && r.lng < 133).map(r => db.prepare(
    `INSERT INTO clinics (id, kakao_id, name, kind, addr, road_addr, tel, lat, lng, url, partner, note, tags, active, source, created, updated)
     VALUES (?,NULL,?,?,?,?,?,?,?,?,0,'','',1,'naver',?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, addr = excluded.addr, road_addr = excluded.road_addr,
       tel = CASE WHEN excluded.tel != '' THEN excluded.tel ELSE clinics.tel END, lat = excluded.lat, lng = excluded.lng, url = excluded.url, updated = excluded.updated`)
    .bind(r.id, r.name, r.kind, r.addr, r.road_addr, r.tel, r.lat, r.lng, r.url, t, t));
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

// 전국 시군구 — 눈덩이 수집의 씨앗. 구가 있는 시는 구 단위로 적는다(시 이름만으로는 5곳밖에 못 받는다).
const REGIONS = (() => {
  const M = {
    '서울': '종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구',
    '부산': '중구 서구 동구 영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 강서구 연제구 수영구 사상구 기장군',
    '대구': '중구 동구 서구 남구 북구 수성구 달서구 달성군 군위군',
    '인천': '중구 동구 미추홀구 연수구 남동구 부평구 계양구 서구 강화군 옹진군',
    '광주': '동구 서구 남구 북구 광산구',
    '대전': '동구 중구 서구 유성구 대덕구',
    '울산': '중구 남구 동구 북구 울주군',
    '세종': '세종시',
    '경기': '수원시장안구 수원시권선구 수원시팔달구 수원시영통구 성남시수정구 성남시중원구 성남시분당구 의정부시 안양시만안구 안양시동안구 부천시 광명시 평택시 동두천시 안산시상록구 안산시단원구 고양시덕양구 고양시일산동구 고양시일산서구 과천시 구리시 남양주시 오산시 시흥시 군포시 의왕시 하남시 용인시처인구 용인시기흥구 용인시수지구 파주시 이천시 안성시 김포시 화성시 광주시 양주시 포천시 여주시 연천군 가평군 양평군',
    '강원': '춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 고성군 양양군',
    '충북': '청주시상당구 청주시서원구 청주시흥덕구 청주시청원구 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군',
    '충남': '천안시동남구 천안시서북구 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군 청양군 홍성군 예산군 태안군',
    '전북': '전주시완산구 전주시덕진구 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군 순창군 고창군 부안군',
    '전남': '목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군 장흥군 강진군 해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군',
    '경북': '포항시남구 포항시북구 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군 청송군 영양군 영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군',
    '경남': '창원시의창구 창원시성산구 창원시마산합포구 창원시마산회원구 창원시진해구 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군 고성군 남해군 하동군 산청군 함양군 거창군 합천군',
    '제주': '제주시 서귀포시'
  };
  const out = [];
  Object.entries(M).forEach(([sido, list]) => list.split(' ').forEach(g => out.push(sido + ' ' + g.replace(/시(?=[가-힣]+구$)/, '시 '))));
  return out;
})();
const VARIANTS = ['정신건강의학과', '정신과', '신경정신과'];

// 주소에서 "OO구 OO동" 같은 다음 검색 씨앗을 뽑는다
function seedsFromAddress(addr) {
  const p = String(addr || '').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 1; i < p.length; i++) {
    if (/(동|읍|면|가|리)$/.test(p[i]) && /(구|군|시)$/.test(p[i - 1])) {
      const sig = /(시)$/.test(p[i - 1]) && i >= 2 && /(구)$/.test(p[i - 2]) ? p[i - 2] + ' ' + p[i - 1] : p[i - 1];
      out.push(`${sig} ${p[i]}`);
      break;
    }
  }
  return out;
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
  const later = p => { if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {})); else p.catch(() => {}); };
  const hasKey = !!((env.NAVER_SEARCH_ID || env.NAVER_CLIENT_ID) && (env.NAVER_SEARCH_SECRET || env.NAVER_CLIENT_SECRET));

  // ══════════════ 앱: 내 주변 ══════════════
  if (path === '/clinics/near' && method === 'GET') {
    let lat = num(q('lat'), NaN), lng = num(q('lng'), NaN);
    const radius = Math.min(50000, Math.max(1000, num(q('radius'), 10000)));
    const limit = Math.min(200, Math.max(10, num(q('limit'), 120)));
    let label = '';
    const place = s(q('q'), 60).trim();
    const fresh = [];
    // 위치 권한이 없으면 지역·역 이름으로 중심을 잡는다 — 그 동네 정신과도 이 참에 한 번 긁어 둔다
    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && place) {
      const g = await naver(env, place, { display: 5 });
      let d = g && g.items && g.items.find(x => num(x.mapx, 0) > 0);
      if (!d) {
        // 200 으로 준다 — 앱의 Api.json 은 4xx 를 '네트워크 오류'로 뭉뚱그려서 "못 찾았어요"를 따로 보여줄 수 없다
        return json({ error: g && g.error ? 'provider-' + g.error : 'not-found', live: hasKey && !(g && g.error) }, 200, cors);
      }
      lat = num(d.mapy, 0) / 1e7; lng = num(d.mapx, 0) / 1e7; label = stripTags(d.title) || place;
      const near = await naver(env, place + ' 정신건강의학과', { display: 5 });
      if (near && near.items) near.items.filter(isPsy).forEach(x => fresh.push(fromNaver(x)));
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'missing' }, 400, cors);
    if (lat < 32 || lat > 40 || lng < 123 || lng > 133) return json({ error: 'out-of-range' }, 400, cors);
    const center = { lat, lng, label };
    if (fresh.length) await upsert(db, fresh);   // 바로 아래 조회에 잡히도록 기다린다 (5곳이라 금방)

    const map = new Map();
    // 1) 제휴 병원 (운영자 등록) — 담당 병원 이름까지
    const partners = (await db.prepare(
      `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id AND h.active = 1
        WHERE c.partner = 1 AND c.active = 1 LIMIT 500`).all()).results || [];
    partners.forEach(r => map.set(r.id, r));
    // 2) 반경 안에 쌓인 것
    const dLat = radius / 111000, dLng = radius / (111000 * Math.cos(lat * Math.PI / 180));
    const near = (await db.prepare(
      `SELECT c.*, h.name AS hospital_name FROM clinics c LEFT JOIN hospitals h ON h.id = c.hospital_id AND h.active = 1
        WHERE c.active = 1 AND c.lat BETWEEN ? AND ? AND c.lng BETWEEN ? AND ? LIMIT 800`)
      .bind(lat - dLat, lat + dLat, lng - dLng, lng + dLng).all()).results || [];
    near.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });

    // 제휴로 따로 등록한 곳과 네이버에서 온 같은 곳이 두 번 뜨지 않게 이름·거리로 합친다
    const items = [...map.values()].map(r => rowOut(r, center));
    const norm = n => String(n || '').replace(/\s|의원|병원/g, '');
    const out = [];
    items.sort((a, b) => (b.partner - a.partner) || (a.dist - b.dist));
    for (const it of items) {
      const dup = out.find(o => o.partner && !it.partner && norm(o.name) === norm(it.name) && dist(o.lat, o.lng, it.lat, it.lng) < 150);
      if (dup) { if (!dup.url) dup.url = it.url; if (!dup.tel) dup.tel = it.tel; continue; }
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
      const tot = await db.prepare("SELECT COUNT(*) n, SUM(CASE WHEN source = 'naver' THEN 1 ELSE 0 END) k FROM clinics").first();
      const st = await db.prepare("SELECT v FROM clinic_sync WHERE k = 'grid'").first();
      let sync = null;
      if (st) { try { const j = JSON.parse(st.v); sync = { i: j.i, total: j.total, queued: (j.queue || []).length, done: !!j.done, found: j.found, calls: j.calls, started: j.started, updated: j.updated, lastError: j.lastError || '' }; } catch (e) {} }
      return json({
        partners: partners.map(r => ({ ...rowOut(r, null), active: !!r.active, source: r.source || '', updated: r.updated, kakaoId: r.kakao_id || '' })),
        total: (tot && tot.n) || 0, fromProvider: (tot && tot.k) || 0, sync, providerKey: hasKey, provider: 'naver'
      }, 200, cors);
    }

    // 주소·이름으로 후보 찾기 (운영자가 좌표를 손으로 안 치게)
    if (path === '/admin/clinics/geocode' && method === 'POST') {
      const query = s(body.q, 80).trim();
      if (!query) return json({ error: 'missing' }, 400, cors);
      const r = await naver(env, query, { display: 5 });
      if (!r) return json({ error: 'no-provider-key' }, 503, cors);
      // 네이버가 거절하면(검색 API 미설정 등) 운영자가 원인을 보게 그대로 알려준다
      return json({ items: (r.items || []).map(fromNaver).map(x => ({ ...x, kakaoId: '', roadAddr: x.road_addr, psy: /정신|신경정신/.test(x.name) })), providerError: r.error || '', providerDetail: r.detail || '' }, 200, cors);
    }

    if (path === '/admin/clinics/save' && method === 'POST') {
      const name = s(body.name, 80).trim();
      const lat = num(body.lat, NaN), lng = num(body.lng, NaN);
      if (!name) return json({ error: 'missing-name' }, 400, cors);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'missing-coords' }, 400, cors);
      let id = s(body.id, 64).replace(/[^\w-]/g, '') || hashId(name, s(body.roadAddr, 160) || s(body.addr, 160));
      const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',')).map(x => s(x, 20).trim()).filter(Boolean).slice(0, 8).join(',');
      const hospitalId = s(body.hospitalId, 64).replace(/[^\w-]/g, '');
      const t = nowMs();
      await db.prepare(
        `INSERT INTO clinics (id, kakao_id, name, kind, addr, road_addr, tel, lat, lng, url, partner, hospital_id, note, tags, active, source, created, updated)
         VALUES (?,NULL,?,?,?,?,?,?,?,?,1,?,?,?,?,'manual',?,?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind,
           addr = excluded.addr, road_addr = excluded.road_addr, tel = excluded.tel, lat = excluded.lat, lng = excluded.lng, url = excluded.url,
           partner = 1, hospital_id = excluded.hospital_id, note = excluded.note, tags = excluded.tags, active = excluded.active, updated = excluded.updated`)
        .bind(id, name, s(body.kind, 20) || '의원', s(body.addr, 160), s(body.roadAddr, 160), s(body.tel, 30), lat, lng, s(body.url, 200),
          hospitalId, s(body.note, 200), tags, body.active === false ? 0 : 1, t, t).run();
      return json({ ok: true, id }, 200, cors);
    }

    if (path === '/admin/clinics/delete' && method === 'POST') {
      const id = s(body.id, 64).replace(/[^\w-]/g, '');
      const row = await db.prepare('SELECT source FROM clinics WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'not-found' }, 404, cors);
      // 네이버에서 온 곳은 제휴만 떼고 남긴다 (검색에는 계속 나와야 한다). 손으로 넣은 곳은 지운다.
      if (row.source === 'naver') await db.prepare("UPDATE clinics SET partner = 0, hospital_id = '', note = '', tags = '', active = 1 WHERE id = ?").bind(id).run();
      else await db.prepare('DELETE FROM clinics WHERE id = ?').bind(id).run();
      return json({ ok: true }, 200, cors);
    }

    // ── 전국 수집 — 눈덩이 ──
    //  시군구 × 검색어로 시작해서, 결과 주소에서 나온 동 이름으로 다시 검색한다. 한 호출에 budget 번.
    if (path === '/admin/clinics/sync' && method === 'POST') {
      if (!hasKey) return json({ error: 'no-provider-key' }, 503, cors);
      let st = null;
      const saved = await db.prepare("SELECT v FROM clinic_sync WHERE k = 'grid'").first();
      if (saved && !body.reset) { try { st = JSON.parse(saved.v); } catch (e) { st = null; } }
      if (!st || st.done || body.reset || !Array.isArray(st.queue)) {
        const queue = [];
        REGIONS.forEach(r => VARIANTS.forEach(v => queue.push(`${r} ${v}`)));
        st = { i: 0, total: queue.length, queue, seen: {}, found: 0, calls: 0, done: false, started: nowMs(), updated: nowMs(), lastError: '' };
        queue.forEach(qq => { st.seen[qq] = 1; });
      }
      const budget = Math.min(40, Math.max(5, num(body.budget, 25)));
      let calls = 0;
      const rows = [];
      while (calls < budget && st.queue.length) {
        const query = st.queue.shift();
        const r = await naver(env, query, { display: 5 }); calls++;
        if (!r || r.error) { st.queue.unshift(query); st.lastError = (r && r.error) ? r.error + ' ' + (r.detail || '') : 'network'; break; }
        st.lastError = '';
        st.i++;
        const psy = (r.items || []).filter(isPsy);
        psy.forEach(d => {
          rows.push(fromNaver(d));
          // 이 결과의 동네를 씨앗으로 — 같은 동네에 더 있을 수 있다
          seedsFromAddress(d.address || d.roadAddress).forEach(seed => VARIANTS.slice(0, 2).forEach(v => {
            const nq = `${seed} ${v}`;
            if (!st.seen[nq]) { st.seen[nq] = 1; st.queue.push(nq); st.total++; }
          }));
        });
      }
      let found = 0;
      if (rows.length) { const uniq = new Map(); rows.forEach(r => uniq.set(r.id, r)); found = await upsert(db, [...uniq.values()]); }
      st.found += found; st.calls += calls; st.updated = nowMs();
      if (!st.queue.length) st.done = true;
      await db.prepare("INSERT INTO clinic_sync (k, v) VALUES ('grid', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(st)).run();
      const tot = await db.prepare('SELECT COUNT(*) n FROM clinics').first();
      return json({ ok: true, progress: { i: st.i, total: st.total, queued: st.queue.length, done: st.done, found: st.found, calls: st.calls, dbTotal: (tot && tot.n) || 0, lastError: st.lastError }, thisCall: { calls, found } }, 200, cors);
    }
    return null;
  }
  return null;
}
