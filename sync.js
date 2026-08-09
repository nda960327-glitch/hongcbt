// ============================================================================
//  계정 동기화 — 폰을 바꿔도 따라오게
//
//  올리는 것:  장기기억 요약 · 마음 리포트 · 검사 점수 · 레벨과 아이템 ·
//              진행 상황 · 지갑/구독 · 예약
//  올리지 않는 것: 대화 원문. 한 줄도.
//
//  대화는 이 앱에서 가장 사적인 것이고, 서버에 두면 언젠가 새거나
//  영장으로 열린다. 기기에만 두면 그럴 일이 없다. 대신 '우렁이가 기억하는
//  요약'만 올려서, 새 폰에서도 나를 알아보게 한다.
//
//  흰 목록은 클라이언트(js/sync.js)와 여기 두 곳에 있다. 같은 목록을
//  두 번 쓰는 건 중복이지만, 한쪽이 잘못돼도 대화가 올라가지 않게 하려면
//  서버가 마지막으로 한 번 더 걸러야 한다.
// ============================================================================

import { resolveUser } from './oauth.js';

const MAX_KEY_BYTES = 256 * 1024;      // 값 하나가 이보다 크면 뭔가 잘못된 것이다
const MAX_TOTAL_KEYS = 80;

// 올려도 되는 키. 여기 없으면 서버가 조용히 버린다.
const ALLOW = new Set([
  // 내가 누구인지 (연락처·전화번호는 없다)
  'cbt_user_name', 'cbt_user_gender', 'cbt_user_concerns', 'cbt_active_persona',
  // 설정
  'cbt_lang', 'cbt_font_scale', 'cbt_sound_on', 'cbt_haptic_on',
  'cbt_tts_enabled', 'cbt_tts_gender', 'cbt_checkin_mode', 'cbt_checkin_times',
  // 장기기억 — 대화 원문이 아니라 우렁이가 간추린 요약
  'cbt_user_memory',
  // 마음 리포트와 검사
  'cbt_my_reports', 'cbt_latest_summary_report', 'cbt_assessments',
  'cbt_assess_history', 'cbt_careplan', 'cbt_careplan_history',
  'cbt_mood_log', 'cbt_mood_entries', 'cbt_distortion_stats',
  // 레벨·수집물
  'cbt_stamps', 'cbt_badges', 'cbt_level_seen', 'cbt_quiz_best', 'cbt_streak_shields',
  'cbt_closet_owned', 'cbt_closet_equipped', 'cbt_room_owned', 'cbt_room_placed',
  'cbt_farm_plots', 'cbt_farm_coins', 'cbt_farm_water', 'cbt_farm_stats',
  'cbt_sticker_packs',
  // 진행 상황
  'cbt_goals', 'cbt_safety_plan', 'cbt_homework', 'cbt_weekly_letters',
  'cbt_mission_log', 'cbt_rx_mission_log', 'cbt_daily_mission',
  'cbt_active_days', 'cbt_total_chats', 'cbt_total_sessions',
  'cbt_checkin_count', 'cbt_breath_count', 'cbt_action_log',
  // 지갑·구독 (기기에만 두면 폰을 바꿀 때 산 것이 사라진다)
  'cbt_cash', 'cbt_cash_history', 'cbt_sub_until', 'cbt_trial_start',
  'cbt_free_sessions', 'cbt_pro_mode',
  // 상담
  'cbt_bookings', 'cbt_reviews', 'cbt_favs', 'cbt_counselor_apps'
]);

// 절대 올라오면 안 되는 것. 흰 목록에 없으니 이미 막히지만,
//  누군가 실수로 목록에 넣는 날을 대비해 이름으로도 한 번 더 막는다.
const DENY = [
  /^cbt_messages$/, /^cbt_hchat_/, /^cbt_daily_chat$/, /^cbt_mem_turn$/,
  /^cbt_thought_records$/, /^cbt_night_/, /^cbt_wiz_draft$/,
  /^cbt_api_key$/, /^cbt_lock_/, /^cbt_client_id$/, /^cbt_user_phone$/,
  /^cbt_share/, /^cbt_auth$/
];
const allowed = k => ALLOW.has(k) && !DENY.some(re => re.test(k));

const nowMs = () => Date.now();
function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) }
  });
}

// ── 저장할 때 암호화 ─────────────────────────────────────────────────
//  서버 키로 잠근다. D1 백업이 통째로 유출돼도 키 없이는 못 읽는다.
//  (서버 자체가 뚫리면 읽힌다 — 그건 이 방식으로 못 막는다. 그래서
//   애초에 대화 원문을 안 올린다.)
const enc = new TextEncoder(), dec = new TextDecoder();
let KEY = null;
async function key(env) {
  if (KEY) return KEY;
  if (!env.SYNC_KEY) return null;
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(String(env.SYNC_KEY)));
  KEY = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return KEY;
}
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(s) {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const r = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const o = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) o[i] = r.charCodeAt(i);
  return o;
}
async function seal(env, text) {
  const k = await key(env);
  if (!k) return 'p.' + b64u(enc.encode(text));      // 키가 없으면 평문 (설정 전)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(text));
  return 'e.' + b64u(iv) + '.' + b64u(ct);
}
async function open(env, blob) {
  const s = String(blob || '');
  if (s.startsWith('p.')) return dec.decode(unb64u(s.slice(2)));
  if (!s.startsWith('e.')) return null;
  const k = await key(env);
  if (!k) return null;
  const [, ivs, cts] = s.split('.');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(ivs) }, k, unb64u(cts));
    return dec.decode(pt);
  } catch (e) { return null; }        // 키를 바꾸면 예전 값은 못 읽는다
}

// ── 라우팅 ───────────────────────────────────────────────────────────
export async function handleSync(request, env, cors, path, body, url) {
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);
  const method = request.method;
  const q = k => url.searchParams.get(k) || '';

  // 어떤 키가 올라가는지 앱이 물어볼 수 있어야 한다.
  //  '무엇이 서버에 저장되나요'에 답할 수 없는 앱은 신뢰받지 못한다.
  if (path === '/sync/scope' && method === 'GET') {
    return json({ keys: [...ALLOW].sort(), never: ['대화 원문', '생각기록', '밤편지 초안', '전화번호'] }, 200, cors);
  }

  if (path === '/sync' && method === 'GET') {
    const me = await resolveUser(db, q('session'));
    if (!me) return json({ error: 'bad-session' }, 403, cors);
    const since = Math.max(0, Number(q('since')) || 0);
    const r = await db.prepare(
      'SELECT k, v, updated FROM user_data WHERE user_id = ? AND updated > ?'
    ).bind(me.id, since).all();

    const items = {};
    for (const row of (r.results || [])) {
      if (!allowed(row.k)) continue;                 // 예전에 들어간 것도 안 내보낸다
      const plain = await open(env, row.v);
      if (plain === null) continue;
      items[row.k] = { v: plain, updated: row.updated };
    }
    return json({ ok: true, items, now: nowMs() }, 200, cors);
  }

  if (path === '/sync' && method === 'POST') {
    const me = await resolveUser(db, String(body.session || '').slice(0, 128));
    if (!me) return json({ error: 'bad-session' }, 403, cors);

    const items = body.items && typeof body.items === 'object' ? body.items : {};
    const keys = Object.keys(items).slice(0, MAX_TOTAL_KEYS);
    const rejected = [], saved = [];

    const stmts = [];
    for (const k of keys) {
      if (!allowed(k)) { rejected.push(k); continue; }
      const it = items[k] || {};
      const v = typeof it.v === 'string' ? it.v : JSON.stringify(it.v);
      if (v == null) continue;
      const bytes = enc.encode(v).length;
      if (bytes > MAX_KEY_BYTES) { rejected.push(k + '(너무 큼)'); continue; }
      const updated = Math.min(nowMs() + 60000, Math.max(1, Number(it.updated) || nowMs()));
      const sealed = await seal(env, v);
      // 더 최신인 값만 덮는다. 두 기기를 같이 쓸 때 오래된 쪽이 이기면 안 된다.
      stmts.push(db.prepare(
        `INSERT INTO user_data (user_id, k, v, updated, bytes) VALUES (?,?,?,?,?)
         ON CONFLICT(user_id, k) DO UPDATE SET
           v = excluded.v, updated = excluded.updated, bytes = excluded.bytes
         WHERE excluded.updated > user_data.updated`
      ).bind(me.id, k, sealed, updated, bytes));
      saved.push(k);
    }
    // 한 번에 보낸다. D1 은 한 연결에서 동시 쓰기를 싫어한다.
    if (stmts.length) await db.batch(stmts);
    return json({ ok: true, saved: saved.length, rejected, now: nowMs() }, 200, cors);
  }

  // 계정에 올라간 것만 지운다 (기기 기록은 앱이 따로 지운다)
  if (path === '/sync/wipe' && method === 'POST') {
    const me = await resolveUser(db, String(body.session || '').slice(0, 128));
    if (!me) return json({ error: 'bad-session' }, 403, cors);
    const r = await db.prepare('DELETE FROM user_data WHERE user_id = ?').bind(me.id).run();
    return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 }, 200, cors);
  }

  return null;
}
