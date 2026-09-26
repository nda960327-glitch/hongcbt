// 병원(담당의) 연동 — 정신과에서 앱을 권한 환자를 담당의가 따라가게 한다.
//
//  역할
//   · 환자: 병원 코드를 넣어 담당 병원과 이어진다(동의). 상담 요약·숙제·담당의 피드백을 본다.
//           동의하면 주 1회 '상태 요약'(체크인 평균·횟수 같은 숫자 몇 개)이 병원에 올라간다.
//   · 상담사: 상담(예약·통화·채팅)이 끝나면 회기 기록(요약·계획·위험도·숙제)을 남긴다.
//             '긴급'을 찍으면 담당의에게 즉시 메일이 간다. 기록이 없는 상담은 정산되지 않는다(market.js).
//   · 소장(소장 콘솔 doc.mindinsideapp.com): 이메일 매직링크 또는 병원 코드로 들어온다.
//             연결된 환자 목록 → 타임라인·주간 상태 → 피드백.
//   · 운영자: 병원 등록(이메일 포함)·코드 발급·정지.
//
//  원칙
//   · 환자 기기 안의 대화 원문은 절대 서버로 오지 않는다. 서버에 있는 건
//     상담사가 쓴 회기 기록, 낸 숙제, 의사 피드백, 그리고 환자가 동의한 주간 숫자뿐이다.
//   · 환자는 계정이 없다(clientId + clientKey). 병원이 알아보게 이름·생년은 환자가 연결할 때 직접 준다.
//   · 회기 기록은 '담당 병원과 공유' 체크를 끄면 상담사 본인만 본다. 단 '긴급'은 공유 여부와 관계없이
//     사실(누가·언제·긴급)만은 담당의에게 알린다 — 요약은 공유일 때만 싣는다.
//
//  경로 (앱은 /api/… 로 부르고 Worker 가 /api 를 뗀다)
//   환자   POST /patient/link · /patient/unlink · /patient/consent · /patient/weekly · /patient/feedback/read
//          GET  /patient/hospital · /patient/records
//   상담사 POST /session-notes · GET /session-notes · GET /session-notes/pending · GET /doctor-feedback · POST /doctor-feedback/read
//   의사   POST /hospital/auth/request · /hospital/auth/verify · /hospital/auth/logout
//          GET  /hospital/me · /hospital/patients · /hospital/patient · POST /hospital/feedback
//          (hsession 또는 hcode 로 인증)
//   소장 콘솔(doc/, 2026-09 PC 개편) — 같은 인증
//          GET  /hospital/dashboard · /hospital/notes · /hospital/counselors · /hospital/applications
//               /hospital/bookings?from&to · /hospital/stats · /hospital/urgent · /hospital/memo?clientId · /hospital/info · /hospital/bank
//          POST /hospital/counselors/approve|remove {id} · /hospital/applications/approve|reject {id, reason}
//               /hospital/urgent/ack {noteId} · /hospital/memo/save {id?, clientId, text} · /hospital/memo/delete {id}
//               /hospital/info {bizno, tel, addr} · /hospital/bank {bank, bankNo, holder}
//          소속 상담사(counselors.hospital_id)는 상담소가 승인(hospital_ok=1)해야 상담소 채널로 정산된다.
//   운영자 GET /admin/hospitals · POST /admin/hospitals · /admin/hospitals/update · /active · /rotate
import { json, isAdmin, verifyClient, s, nowMs, payoutOf, maskAcct, approveApplication, rejectApplication } from './market.js';
import { resolveCounselor, sendHospitalLoginMail, sendUrgentMail } from './auth.js';

const rid = p => p + '_' + nowMs().toString(36) + Math.random().toString(36).slice(2, 7);
const RISKS = ['none', 'watch', 'urgent'];
const TO = ['counselor', 'patient', 'both'];
const KIND_LABEL = { booking: '예약 상담', call: '전화 상담', chat: '채팅 상담' };
const LINK_TTL = 15 * 60 * 1000;
const SESSION_TTL = 30 * 86400000;
const MAIL_PER_HOUR = 5;

function token(n) {
  const b = new Uint8Array(n || 32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
const normEmail = e => String(e || '').trim().toLowerCase().slice(0, 160);
const looksLikeEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// 병원 코드: H-XXXX-XXXX (상담사 코드와 한눈에 구별되게 H 로 시작)
function makeHospitalCode() {
  const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let out = 'H-';
  for (let i = 0; i < 8; i++) { out += AB[b[i] % AB.length]; if (i === 3) out += '-'; }
  return out;
}

const hospitalPublic = h => h ? { id: h.id, name: h.name, dept: h.dept || '', doctor: h.doctor || '', hasEmail: !!h.email } : null;
const rowNote = n => ({
  id: n.id, counselorId: n.counselor_id, counselor: n.counselor_name || '', clientId: n.client_id, clientName: n.client_name || '',
  bookingId: n.booking_id || '', callId: n.call_id || '', kind: n.kind || 'chat', ts: n.ts,
  summary: n.summary || '', plan: n.plan || '', risk: n.risk || 'none', homework: n.homework || '',
  shared: !!n.shared, updated: n.updated || n.ts, alertedAt: n.alerted_at || 0
});
const rowFb = f => ({
  id: f.id, hospitalId: f.hospital_id, hospital: f.hospital_name || '', doctor: f.doctor || '', clientId: f.client_id,
  noteId: f.note_id || '', to: f.to_who, text: f.text, ts: f.ts, readC: f.read_c || 0, readP: f.read_p || 0
});
const rowHw = h => ({
  id: h.id, counselor: h.counselor || '', text: h.text, why: h.why || '', assignedAt: h.assigned_at,
  dueAt: h.due_at || 0, doneAt: h.done_at || 0, note: h.note || ''
});
const rowWeek = w => ({
  weekKey: w.week_key, moodAvg: w.mood_avg == null ? null : Number(w.mood_avg), checkins: w.checkins || 0,
  missions: w.missions || 0, nights: w.nights || 0, records: w.records || 0, streak: w.streak || 0, ts: w.ts
});

// 세션(매직링크) 또는 병원 코드로 병원을 찾는다. 정지된 병원은 둘 다 통하지 않는다.
export async function resolveHospital(db, { hsession, hcode }) {
  if (hsession) {
    const r = await db.prepare(
      `SELECT h.*, s.token AS s_token FROM hospital_sessions s JOIN hospitals h ON h.id = s.hospital_id
        WHERE s.token = ? AND s.expires > ? AND h.active = 1`).bind(String(hsession).slice(0, 128), nowMs()).first();
    if (r) {
      await db.prepare('UPDATE hospital_sessions SET last_seen = ? WHERE token = ?').bind(nowMs(), r.s_token).run();
      return r;
    }
    return null;
  }
  if (hcode) return await db.prepare('SELECT * FROM hospitals WHERE code = ? AND active = 1').bind(String(hcode).trim().toUpperCase().slice(0, 64)).first();
  return null;
}

export async function handleHospital(request, env, cors, path, ctx) {
  if (!/^\/(patient\/|session-notes|hospital\/|admin\/hospitals|doctor-feedback)/.test(path)) return null;
  const db = env.DB;
  if (!db) return json({ error: 'db-not-bound' }, 503, cors);

  const url = new URL(request.url);
  const q = k => url.searchParams.get(k) || '';
  const method = request.method;
  let body = {};
  if (method === 'POST') { try { body = await request.json(); } catch (e) { body = {}; } }
  const code = s(body.code || q('code'), 64);
  const session = s(body.session || q('session'), 128);
  const cleanId = v => s(v, 64).replace(/[^\w-]/g, '');
  const hospitalByCode = async c => c ? await db.prepare('SELECT * FROM hospitals WHERE code = ? AND active = 1').bind(c).first() : null;
  const activeLink = async cid => await db.prepare(
    `SELECT l.*, h.name AS h_name, h.dept AS h_dept, h.doctor AS h_doctor, h.email AS h_email, h.active AS h_active
       FROM patient_links l JOIN hospitals h ON h.id = l.hospital_id
      WHERE l.client_id = ? AND l.unlinked_at = 0 ORDER BY l.linked_at DESC LIMIT 1`).bind(cid).first();
  const later = p => { if (ctx && ctx.waitUntil) ctx.waitUntil(p.catch(() => {})); else p.catch(() => {}); };

  // ══════════════ 환자 ══════════════
  if (path.startsWith('/patient/')) {
    const cid = cleanId(body.clientId || q('clientId'));
    if (!cid) return json({ error: 'missing' }, 400, cors);
    if (await verifyClient(env, cid, s(body.clientKey || q('clientKey'), 64)) === 'deny')
      return json({ error: 'forbidden' }, 403, cors);

    if (path === '/patient/link' && method === 'POST') {
      const h = await hospitalByCode(s(body.hcode || body.code, 64).trim().toUpperCase());
      if (!h) return json({ error: 'bad-code' }, 404, cors);
      const name = s(body.name, 40).trim();
      if (!name) return json({ error: 'missing-name' }, 400, cors);
      const t = nowMs();
      const shareWeekly = body.shareWeekly === false ? 0 : 1;
      // 다른 병원에 연결돼 있었으면 그 연결은 닫는다 — 담당 병원은 하나
      await db.prepare('UPDATE patient_links SET unlinked_at = ? WHERE client_id = ? AND unlinked_at = 0 AND hospital_id != ?').bind(t, cid, h.id).run();
      await db.prepare(`INSERT INTO patient_links (client_id, hospital_id, name, birth, linked_at, unlinked_at, share_weekly)
        VALUES (?,?,?,?,?,0,?)
        ON CONFLICT(client_id, hospital_id) DO UPDATE SET name = excluded.name, birth = excluded.birth, linked_at = excluded.linked_at, unlinked_at = 0, share_weekly = excluded.share_weekly`)
        .bind(cid, h.id, name, s(body.birth, 10), t, shareWeekly).run();
      return json({ ok: true, hospital: hospitalPublic(h), name, birth: s(body.birth, 10), linkedAt: t, shareWeekly: !!shareWeekly }, 200, cors);
    }
    if (path === '/patient/unlink' && method === 'POST') {
      await db.prepare('UPDATE patient_links SET unlinked_at = ? WHERE client_id = ? AND unlinked_at = 0').bind(nowMs(), cid).run();
      // 연결을 끊으면 올라가 있던 주간 숫자도 지운다 — 동의가 끝났으니 남길 이유가 없다
      await db.prepare('DELETE FROM patient_weekly WHERE client_id = ?').bind(cid).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/patient/consent' && method === 'POST') {
      const on = body.shareWeekly ? 1 : 0;
      await db.prepare('UPDATE patient_links SET share_weekly = ? WHERE client_id = ? AND unlinked_at = 0').bind(on, cid).run();
      if (!on) await db.prepare('DELETE FROM patient_weekly WHERE client_id = ?').bind(cid).run();
      return json({ ok: true, shareWeekly: !!on }, 200, cors);
    }
    // 주간 상태 요약 — 숫자만. 앱이 계산해서 올리고 서버는 주 단위로 덮어쓴다.
    if (path === '/patient/weekly' && method === 'POST') {
      const l = await activeLink(cid);
      if (!l) return json({ error: 'not-linked' }, 403, cors);
      if (!l.share_weekly) return json({ error: 'no-consent' }, 403, cors);
      const weeks = (Array.isArray(body.weeks) ? body.weeks : []).slice(0, 8);
      const t = nowMs();
      const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
      const jobs = [];
      for (const w of weeks) {
        const wk = String(w.weekKey || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) continue;
        const avg = w.moodAvg == null || isNaN(Number(w.moodAvg)) ? null : Math.max(1, Math.min(5, Math.round(Number(w.moodAvg) * 10) / 10));
        jobs.push(db.prepare(`INSERT INTO patient_weekly (client_id, week_key, mood_avg, checkins, missions, nights, records, streak, headline, ts)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(client_id, week_key) DO UPDATE SET mood_avg = excluded.mood_avg, checkins = excluded.checkins, missions = excluded.missions,
            nights = excluded.nights, records = excluded.records, streak = excluded.streak, headline = excluded.headline, ts = excluded.ts`)
          .bind(cid, wk, avg, num(w.checkins, 99), num(w.missions, 99), num(w.nights, 99), num(w.records, 99), num(w.streak, 9999), s(w.headline, 80), t));
      }
      if (jobs.length) await db.batch(jobs);
      return json({ ok: true, n: jobs.length }, 200, cors);
    }
    if (path === '/patient/hospital' && method === 'GET') {
      const l = await activeLink(cid);
      if (!l) return json({ link: null }, 200, cors);
      return json({ link: { name: l.name, birth: l.birth || '', linkedAt: l.linked_at, shareWeekly: !!l.share_weekly,
        hospital: { id: l.hospital_id, name: l.h_name, dept: l.h_dept || '', doctor: l.h_doctor || '' }, hospitalActive: !!l.h_active } }, 200, cors);
    }
    if (path === '/patient/records' && method === 'GET') {
      const notes = (await db.prepare(
        `SELECT id, counselor_name, kind, ts, summary, plan, homework FROM session_notes
          WHERE client_id = ? AND shared = 1 ORDER BY ts DESC LIMIT 100`).bind(cid).all()).results || [];
      const fb = (await db.prepare(
        `SELECT * FROM doctor_feedback WHERE client_id = ? AND to_who IN ('patient','both') ORDER BY ts DESC LIMIT 100`).bind(cid).all()).results || [];
      return json({
        notes: notes.map(n => ({ id: n.id, counselor: n.counselor_name || '', kind: n.kind, ts: n.ts, summary: n.summary, plan: n.plan || '', homework: n.homework || '' })),
        feedback: fb.map(rowFb)
      }, 200, cors);
    }
    if (path === '/patient/feedback/read' && method === 'POST') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(cleanId).filter(Boolean).slice(0, 50);
      for (const id of ids) await db.prepare('UPDATE doctor_feedback SET read_p = ? WHERE id = ? AND client_id = ? AND read_p = 0').bind(nowMs(), id, cid).run();
      return json({ ok: true }, 200, cors);
    }
    return null;
  }

  // ══════════════ 상담사 ══════════════
  if (path.startsWith('/session-notes') || path.startsWith('/doctor-feedback')) {
    const me = await resolveCounselor(db, { session, code });
    if (!me) return json({ error: 'bad-code' }, 403, cors);

    if (path === '/session-notes' && method === 'POST') {
      const clientId = cleanId(body.clientId);
      const summary = s(body.summary, 2000).trim();
      if (!clientId) return json({ error: 'missing-client' }, 400, cors);
      if (summary.length < 5) return json({ error: 'missing-summary' }, 400, cors);
      const risk = RISKS.includes(body.risk) ? body.risk : 'none';
      const kind = ['booking', 'call', 'chat'].includes(body.kind) ? body.kind : 'chat';
      const id = cleanId(body.id) || rid('sn');
      const t = nowMs();
      const shared = body.shared === false ? 0 : 1;
      // 내 기록만 고칠 수 있다
      const owned = await db.prepare('SELECT id, ts, alerted_at, client_name, kind FROM session_notes WHERE id = ? AND counselor_id = ?').bind(id, me.id).first();
      let noteTs = t, clientName = s(body.clientName, 40), noteKind = kind;
      if (owned) {
        await db.prepare(`UPDATE session_notes SET summary = ?, plan = ?, risk = ?, homework = ?, shared = ?, updated = ? WHERE id = ?`)
          .bind(summary, s(body.plan, 1000), risk, s(body.homework, 500), shared, t, id).run();
        noteTs = owned.ts; clientName = owned.client_name || clientName; noteKind = owned.kind || kind;
      } else {
        noteTs = Math.min(t, Math.max(0, Number(body.ts) || t));
        await db.prepare(`INSERT INTO session_notes (id, counselor_id, counselor_name, client_id, client_name, booking_id, call_id, kind, ts, summary, plan, risk, homework, shared, updated, alerted_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
          .bind(id, me.id, me.name || '', clientId, clientName, s(body.bookingId, 64), s(body.callId, 64), kind,
            noteTs, summary, s(body.plan, 1000), risk, s(body.homework, 500), shared, t).run();
      }
      // 긴급 → 담당의에게 즉시 메일. 한 기록당 한 번만 (고칠 때마다 또 보내지 않는다).
      let alerted = false;
      if (risk === 'urgent' && !(owned && owned.alerted_at)) {
        const l = await activeLink(clientId);
        if (l && l.h_email) {
          await db.prepare('UPDATE session_notes SET alerted_at = ? WHERE id = ?').bind(t, id).run();
          alerted = true;
          later(sendUrgentMail(env, db, l.h_email, {
            patientName: l.name || clientName, birth: l.birth || '', counselor: me.name || '상담사', ts: noteTs,
            kindLabel: KIND_LABEL[noteKind] || '상담', summary: shared ? summary : '', plan: shared ? s(body.plan, 1000) : ''
          }));
        }
      }
      return json({ ok: true, id, alerted }, 200, cors);
    }
    if (path === '/session-notes' && method === 'GET') {
      const clientId = cleanId(q('clientId'));
      const r = clientId
        ? await db.prepare('SELECT * FROM session_notes WHERE counselor_id = ? AND client_id = ? ORDER BY ts DESC LIMIT 100').bind(me.id, clientId).all()
        : await db.prepare('SELECT * FROM session_notes WHERE counselor_id = ? ORDER BY ts DESC LIMIT 300').bind(me.id).all();
      return json({ items: (r.results || []).map(rowNote) }, 200, cors);
    }
    // 기록을 아직 안 남긴 상담 — 지난 예약(30일 이내)과 연결됐던 통화.
    //  이 목록에 있는 예약·통화는 정산에 올라가지 않는다 (market.js /settle).
    if (path === '/session-notes/pending' && method === 'GET') {
      const t = nowMs();
      const since = t - 30 * 86400000;
      const out = [];
      const bk = (await db.prepare(
        `SELECT b.id, b.client_id, b.client_name, b.when_ts, b.status, b.price FROM bookings b
          WHERE b.counselor_id = ? AND b.status IN ('confirmed','done') AND b.when_ts <= ? AND b.when_ts >= ?
            AND NOT EXISTS (SELECT 1 FROM session_notes n WHERE n.booking_id = b.id)
          ORDER BY b.when_ts DESC LIMIT 30`).bind(me.id, t, since).all()).results || [];
      bk.forEach(b => out.push({ kind: 'booking', bookingId: b.id, clientId: b.client_id, clientName: b.client_name || '', ts: b.when_ts, status: b.status, price: b.price || 0 }));
      try {
        const calls = (await db.prepare(
          `SELECT c.id, c.client_id, c.connect_at, c.end_at, c.booking_id, c.billed FROM calls c
            WHERE c.counselor_id = ? AND c.end_at > 0 AND c.connect_at > 0 AND ((c.end_at - c.connect_at) >= 60000 OR COALESCE(c.billed, 0) > 0) AND c.end_at >= ?
              AND NOT EXISTS (SELECT 1 FROM session_notes n WHERE n.call_id = c.id OR (c.booking_id != '' AND n.booking_id = c.booking_id))
            ORDER BY c.end_at DESC LIMIT 30`).bind(me.id, since).all()).results || [];
        for (const c of calls) {
          let name = '';
          try { const cm = await db.prepare('SELECT client_name FROM chat_msgs WHERE client_id = ? AND client_name != "" ORDER BY ts DESC LIMIT 1').bind(c.client_id).first(); name = (cm && cm.client_name) || ''; } catch (e) {}
          out.push({ kind: 'call', callId: c.id, bookingId: c.booking_id || '', clientId: c.client_id, clientName: name, ts: c.end_at, secs: Math.round((c.end_at - c.connect_at) / 1000), price: c.billed || 0 });
        }
      } catch (e) { /* calls 표가 없는 배포도 있다 */ }
      out.sort((a, b) => b.ts - a.ts);
      return json({ items: out.slice(0, 40) }, 200, cors);
    }
    if (path === '/doctor-feedback' && method === 'GET') {
      const r = await db.prepare(
        `SELECT f.* FROM doctor_feedback f
          WHERE f.to_who IN ('counselor','both')
            AND f.client_id IN (SELECT DISTINCT client_id FROM session_notes WHERE counselor_id = ?)
          ORDER BY f.ts DESC LIMIT 100`).bind(me.id).all();
      return json({ items: (r.results || []).map(rowFb) }, 200, cors);
    }
    if (path === '/doctor-feedback/read' && method === 'POST') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(cleanId).filter(Boolean).slice(0, 50);
      for (const id of ids) await db.prepare('UPDATE doctor_feedback SET read_c = ? WHERE id = ? AND read_c = 0').bind(nowMs(), id).run();
      return json({ ok: true }, 200, cors);
    }
    return null;
  }

  // ══════════════ 의사 로그인 (이메일 매직링크) ══════════════
  //  상담사와 같은 방식. 등록 여부를 흘리지 않도록 응답은 언제나 같다.
  if (path.startsWith('/hospital/auth/')) {
    if (path === '/hospital/auth/request' && method === 'POST') {
      const email = normEmail(body.email);
      const generic = { ok: true, message: '등록된 주소라면 로그인 링크를 보냈어요. 메일함을 확인해주세요.' };
      if (!looksLikeEmail(email)) return json(generic, 200, cors);
      const h = await db.prepare('SELECT * FROM hospitals WHERE lower(email) = ? AND active = 1').bind(email).first();
      if (!h) return json(generic, 200, cors);
      const cnt = await db.prepare('SELECT COUNT(*) n FROM hospital_tokens WHERE hospital_id = ? AND created > ?').bind(h.id, nowMs() - 3600000).first();
      if ((cnt && cnt.n) >= MAIL_PER_HOUR) return json({ ok: true, message: '조금 뒤에 다시 시도해주세요. (요청이 많았어요)' }, 200, cors);
      const t = token(32);
      await db.prepare('INSERT INTO hospital_tokens (token, hospital_id, expires, used_at, created) VALUES (?,?,?,0,?)').bind(t, h.id, nowMs() + LINK_TTL, nowMs()).run();
      const base = String(env.DOC_URL || (url.origin + '/doc')).replace(/\/+$/, '');
      later(sendHospitalLoginMail(env, db, email, h, `${base}/?t=${t}`));
      return json(generic, 200, cors);
    }
    if (path === '/hospital/auth/verify' && method === 'POST') {
      const t = String(body.t || '').slice(0, 128);
      if (!t) return json({ error: 'no-token' }, 400, cors);
      const row = await db.prepare('SELECT * FROM hospital_tokens WHERE token = ?').bind(t).first();
      if (!row) return json({ error: 'invalid' }, 403, cors);
      if (row.used_at) return json({ error: 'used' }, 403, cors);
      if (row.expires < nowMs()) return json({ error: 'expired' }, 403, cors);
      await db.prepare('UPDATE hospital_tokens SET used_at = ? WHERE token = ?').bind(nowMs(), t).run();
      const h = await db.prepare('SELECT * FROM hospitals WHERE id = ? AND active = 1').bind(row.hospital_id).first();
      if (!h) return json({ error: 'inactive' }, 403, cors);
      const st = token(32);
      await db.prepare('INSERT INTO hospital_sessions (token, hospital_id, expires, created, last_seen, agent) VALUES (?,?,?,?,?,?)')
        .bind(st, h.id, nowMs() + SESSION_TTL, nowMs(), nowMs(), String(request.headers.get('user-agent') || '').slice(0, 160)).run();
      await db.prepare('DELETE FROM hospital_tokens WHERE expires < ?').bind(nowMs() - 86400000).run();
      await db.prepare('DELETE FROM hospital_sessions WHERE expires < ?').bind(nowMs()).run();
      return json({ ok: true, hsession: st, hospital: hospitalPublic(h) }, 200, cors);
    }
    if (path === '/hospital/auth/logout' && method === 'POST') {
      const st = String(body.hsession || '').slice(0, 128);
      if (st) await db.prepare('DELETE FROM hospital_sessions WHERE token = ?').bind(st).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/hospital/auth/logout-others' && method === 'POST') {
      const st = String(body.hsession || '').slice(0, 128);
      const h = await resolveHospital(db, { hsession: st });
      if (!h) return json({ error: 'no-session' }, 403, cors);
      await db.prepare('DELETE FROM hospital_sessions WHERE hospital_id = ? AND token != ?').bind(h.id, st).run();
      return json({ ok: true }, 200, cors);
    }
    return null;
  }

  // ══════════════ 의사 (세션 또는 병원 코드) ══════════════
  if (path.startsWith('/hospital/')) {
    const h = await resolveHospital(db, { hsession: s(body.hsession || q('hsession'), 128), hcode: s(body.hcode || q('hcode'), 64) });
    if (!h) return json({ error: 'bad-code' }, 403, cors);

    if (path === '/hospital/me' && method === 'GET') return json({ ok: true, hospital: hospitalPublic(h) }, 200, cors);

    if (path === '/hospital/patients' && method === 'GET') {
      const r = await db.prepare(
        `SELECT l.client_id, l.name, l.birth, l.linked_at, l.share_weekly,
           (SELECT MAX(n.ts) FROM session_notes n WHERE n.client_id = l.client_id AND n.shared = 1) AS last_note,
           (SELECT n.risk FROM session_notes n WHERE n.client_id = l.client_id AND n.shared = 1 ORDER BY n.ts DESC LIMIT 1) AS last_risk,
           (SELECT COUNT(*) FROM session_notes n WHERE n.client_id = l.client_id AND n.shared = 1) AS notes,
           (SELECT COUNT(*) FROM homework w WHERE w.client_id = l.client_id AND w.done_at = 0) AS hw_open,
           (SELECT MAX(f.ts) FROM doctor_feedback f WHERE f.client_id = l.client_id AND f.hospital_id = l.hospital_id) AS last_fb,
           (SELECT w.mood_avg FROM patient_weekly w WHERE w.client_id = l.client_id ORDER BY w.week_key DESC LIMIT 1) AS week_avg,
           (SELECT w.checkins FROM patient_weekly w WHERE w.client_id = l.client_id ORDER BY w.week_key DESC LIMIT 1) AS week_checkins,
           (SELECT w.week_key FROM patient_weekly w WHERE w.client_id = l.client_id ORDER BY w.week_key DESC LIMIT 1) AS week_key
         FROM patient_links l WHERE l.hospital_id = ? AND l.unlinked_at = 0
         ORDER BY COALESCE(last_note, l.linked_at) DESC LIMIT 300`).bind(h.id).all();
      return json({ hospital: hospitalPublic(h), items: (r.results || []).map(x => ({
        clientId: x.client_id, name: x.name, birth: x.birth || '', linkedAt: x.linked_at, shareWeekly: !!x.share_weekly,
        lastNote: x.last_note || 0, lastRisk: x.last_risk || 'none', notes: x.notes || 0, hwOpen: x.hw_open || 0, lastFeedback: x.last_fb || 0,
        week: x.week_key ? { weekKey: x.week_key, moodAvg: x.week_avg == null ? null : Number(x.week_avg), checkins: x.week_checkins || 0 } : null
      })) }, 200, cors);
    }

    if (path === '/hospital/patient' && method === 'GET') {
      const cid = cleanId(q('clientId'));
      const l = await db.prepare('SELECT * FROM patient_links WHERE client_id = ? AND hospital_id = ? AND unlinked_at = 0').bind(cid, h.id).first();
      if (!l) return json({ error: 'not-linked' }, 403, cors);
      const notes = (await db.prepare('SELECT * FROM session_notes WHERE client_id = ? AND shared = 1 ORDER BY ts DESC LIMIT 100').bind(cid).all()).results || [];
      let hw = [];
      try { hw = (await db.prepare('SELECT * FROM homework WHERE client_id = ? ORDER BY assigned_at DESC LIMIT 50').bind(cid).all()).results || []; } catch (e) {}
      const fb = (await db.prepare('SELECT * FROM doctor_feedback WHERE client_id = ? AND hospital_id = ? ORDER BY ts DESC LIMIT 100').bind(cid, h.id).all()).results || [];
      let bk = [];
      try { bk = (await db.prepare('SELECT id, counselor_name, when_ts, status FROM bookings WHERE client_id = ? ORDER BY when_ts DESC LIMIT 20').bind(cid).all()).results || []; } catch (e) {}
      const weeks = l.share_weekly ? ((await db.prepare('SELECT * FROM patient_weekly WHERE client_id = ? ORDER BY week_key DESC LIMIT 12').bind(cid).all()).results || []) : [];
      return json({
        patient: { clientId: cid, name: l.name, birth: l.birth || '', linkedAt: l.linked_at, shareWeekly: !!l.share_weekly },
        notes: notes.map(rowNote), homework: hw.map(rowHw), feedback: fb.map(rowFb),
        bookings: bk.map(b => ({ id: b.id, counselor: b.counselor_name || '', whenTs: b.when_ts, status: b.status })),
        weekly: weeks.map(rowWeek).reverse()
      }, 200, cors);
    }

    // ── 병원 정산 ────────────────────────────────────────────────────
    //  병원을 통해 등록한 내담자의 상담은 배분이 다르다: 병원 90 · 앱 7 · 결제 수수료 3.
    //  앱은 병원에만 지급하고, 상담사에게는 병원이 직접 지급한다.
    //  (앱이 상담사에게 직접 보내면 병원 쪽에서 환자 유인 소지가 생긴다 — 의료법 제27조)
    //  여기서는 병원이 "받을 돈"과 "상담사에게 보낸 돈"을 함께 본다. 보낸 기록은 병원이 적는다.
    if (path === '/hospital/settle' && method === 'GET') {
      const since = nowMs() - 400 * 86400000;
      const rows = [];
      const bk = (await db.prepare(
        `SELECT id, counselor_id, counselor_name, client_id, client_name, time_label, price, done_at, settled_at, channel
           FROM bookings WHERE hospital_id = ? AND channel IN ('hospital', 'referral') AND status = 'done' AND when_ts >= ?
          ORDER BY done_at DESC LIMIT 300`).bind(h.id, since).all()).results || [];
      bk.forEach(x => rows.push({ kind: 'booking', id: x.id, counselorId: x.counselor_id, counselor: x.counselor_name || '상담사',
        clientId: x.client_id, clientName: x.client_name || '', label: x.time_label || '', gross: x.price || 0,
        at: x.done_at || 0, appPaidAt: x.settled_at || 0, channel: x.channel || 'hospital' }));
      try {
        const cl = (await db.prepare(
          `SELECT c.id, c.counselor_id, c.client_id, c.billed, c.connect_at, c.end_at, c.settled_at, c.channel, k.name cname
             FROM calls c LEFT JOIN counselors k ON k.id = c.counselor_id
            WHERE c.hospital_id = ? AND c.channel IN ('hospital', 'referral') AND c.billed > 0 AND c.end_at >= ?
            ORDER BY c.end_at DESC LIMIT 300`).bind(h.id, since).all()).results || [];
        cl.forEach(x => {
          const secs = Math.max(0, Math.round(((x.end_at || 0) - (x.connect_at || 0)) / 1000));
          rows.push({ kind: 'call', id: x.id, counselorId: x.counselor_id, counselor: x.cname || '상담사',
            clientId: x.client_id, clientName: '', label: '전화 상담 ' + (secs >= 60 ? Math.floor(secs / 60) + '분 ' : '') + (secs % 60) + '초',
            gross: x.billed || 0, at: x.end_at || 0, appPaidAt: x.settled_at || 0, channel: x.channel || 'hospital' });
        });
      } catch (e) {}
      // 소개 채널(referral)은 상담소가 20% 소개료만 받고 상담사에게는 앱이 지급한다 — 지급 기록 칸이 없다
      rows.forEach(r => { const p = payoutOf(r.gross, r.channel); r.hospital = p.hospital; r.platform = p.platform; r.pg = p.pg; r.counselorByApp = r.channel === 'referral'; });
      rows.sort((a, b) => b.at - a.at);
      const paid = (await db.prepare(
        'SELECT * FROM hospital_payouts WHERE hospital_id = ? ORDER BY paid_at DESC LIMIT 500').bind(h.id).all()).results || [];
      const paidByRef = {};
      paid.forEach(p => { paidByRef[p.ref_id] = (paidByRef[p.ref_id] || 0) + (p.amount || 0); });
      rows.forEach(r => { r.paidToCounselor = paidByRef[r.id] || 0; });
      return json({
        hospital: hospitalPublic(h), items: rows,
        totals: {
          gross: rows.reduce((a, x) => a + x.gross, 0),
          hospital: rows.reduce((a, x) => a + x.hospital, 0),
          received: rows.filter(x => x.appPaidAt).reduce((a, x) => a + x.hospital, 0),
          paidOut: rows.reduce((a, x) => a + x.paidToCounselor, 0)
        },
        payouts: paid.map(p => ({ id: p.id, counselorId: p.counselor_id, kind: p.kind, refId: p.ref_id, amount: p.amount, paidAt: p.paid_at, memo: p.memo || '' }))
      }, 200, cors);
    }

    // 병원이 상담사에게 보낸 돈을 적는다 — 앱은 이 돈에 관여하지 않고 기록만 보관한다
    if (path === '/hospital/payout' && method === 'POST') {
      const refId = cleanId(body.refId);
      const amount = Math.max(0, Math.round(Number(body.amount) || 0));
      const kind = body.kind === 'call' ? 'call' : 'booking';
      if (!refId || !amount) return json({ error: 'missing' }, 400, cors);
      // 이 병원 건이 맞는지 확인한다 — 남의 상담에 지급 기록을 붙이지 못하게
      let counselorId = cleanId(body.counselorId);
      let ok = false;
      if (kind === 'booking') {
        const b2 = await db.prepare('SELECT counselor_id FROM bookings WHERE id = ? AND hospital_id = ?').bind(refId, h.id).first();
        if (b2) { ok = true; counselorId = counselorId || b2.counselor_id; }
      } else {
        try { const c2 = await db.prepare('SELECT counselor_id FROM calls WHERE id = ? AND hospital_id = ?').bind(refId, h.id).first(); if (c2) { ok = true; counselorId = counselorId || c2.counselor_id; } } catch (e) {}
      }
      if (!ok) return json({ error: 'not-found' }, 404, cors);
      const id = rid('hpay');
      await db.prepare(`INSERT INTO hospital_payouts (id, hospital_id, counselor_id, kind, ref_id, amount, paid_at, memo, created)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, h.id, counselorId, kind, refId, amount, Math.min(nowMs(), Number(body.paidAt) || nowMs()), s(body.memo, 120), nowMs()).run();
      return json({ ok: true, id }, 200, cors);
    }

    if (path === '/hospital/feedback' && method === 'POST') {
      const cid = cleanId(body.clientId);
      const text = s(body.text, 2000).trim();
      if (!cid || !text) return json({ error: 'missing' }, 400, cors);
      const l = await db.prepare('SELECT 1 AS ok FROM patient_links WHERE client_id = ? AND hospital_id = ? AND unlinked_at = 0').bind(cid, h.id).first();
      if (!l) return json({ error: 'not-linked' }, 403, cors);
      const id = rid('df');
      await db.prepare(`INSERT INTO doctor_feedback (id, hospital_id, hospital_name, doctor, client_id, note_id, to_who, text, ts, read_c, read_p)
        VALUES (?,?,?,?,?,?,?,?,?,0,0)`)
        .bind(id, h.id, h.name, h.doctor || '', cid, s(body.noteId, 64), TO.includes(body.to) ? body.to : 'both', text, nowMs()).run();
      return json({ ok: true, id }, 200, cors);
    }

    // ══════ 소장 콘솔 (2026-09 PC 개편) ══════
    //  아래 경로들은 모두 이 상담소(h.id)의 것만 본다. 새 칸·새 표가 아직 없는 배포에서는
    //  '없다'고 조용히 답하거나 { error: 'migrate' } 로 알린다 — 콘솔 전체가 안 뜨면 안 된다.
    const tNow = nowMs();
    const KST = 9 * 3600000;
    const kstNow = new Date(tNow + KST);
    const monthStartOf = (y, m) => Date.UTC(y, m, 1) - KST;        // KST 기준 그 달 1일 0시
    const monthStart = monthStartOf(kstNow.getUTCFullYear(), kstNow.getUTCMonth());
    const monthKeyOf = ts => { const d = new Date(ts + KST); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
    const noCol = e => /no such column/i.test(String(e && e.message || e));
    const noTable = e => /no such table/i.test(String(e && e.message || e));
    const maskEmail = e => { const m = String(e || '').match(/^([^@])[^@]*(@.+)$/); return m ? m[1] + '***' + m[2] : (e ? '***' : ''); };
    const safeJson = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (e) { return d; } };
    const profileJson = () => { try { return h.profile ? JSON.parse(h.profile) : {}; } catch (e) { return {}; } };
    // 이 상담소 소속 상담사 id — 예약 캘린더·통계에서 '상담소 채널이 아닌 소속 상담사의 상담'도 함께 본다
    const affiliatedIds = async () => {
      try { return ((await db.prepare('SELECT id FROM counselors WHERE hospital_id = ?').bind(h.id).all()).results || []).map(x => x.id); }
      catch (e) { return []; }
    };
    const inList = ids => ids.length ? ids.map(() => '?').join(',') : "''";

    // ── 대시보드 숫자 ──
    if (path === '/hospital/dashboard' && method === 'GET') {
      const weekAgo = tNow - 7 * 86400000;
      const one = async (sql, ...args) => { try { const r = await db.prepare(sql).bind(...args).first(); return r ? Number(r.n) || 0 : 0; } catch (e) { return 0; } };
      const patients = await one('SELECT COUNT(*) n FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0', h.id);
      const urgentWeek = await one(
        `SELECT COUNT(DISTINCT n.client_id) n FROM session_notes n
          WHERE n.risk = 'urgent' AND n.ts >= ? AND n.client_id IN (SELECT client_id FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0)`, weekAgo, h.id);
      const notes7d = await one(
        `SELECT COUNT(*) n FROM session_notes n WHERE n.shared = 1 AND n.ts >= ?
           AND n.client_id IN (SELECT client_id FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0)`, weekAgo, h.id);
      let cOk = 0, cPending = 0;
      try {
        const r = await db.prepare('SELECT COALESCE(hospital_ok, 0) ok, COUNT(*) n FROM counselors WHERE hospital_id = ? AND active = 1 GROUP BY COALESCE(hospital_ok, 0)').bind(h.id).all();
        (r.results || []).forEach(x => { if (Number(x.ok)) cOk += x.n; else cPending += x.n; });
      } catch (e) { cOk = await one('SELECT COUNT(*) n FROM counselors WHERE hospital_id = ? AND active = 1', h.id); }
      const appsPending = await one("SELECT COUNT(*) n FROM applications WHERE hospital_id = ? AND status = 'pending'", h.id);
      // 이번 달 상담소 채널 완료 상담 — 예약 + 통화
      let monthDone = 0, monthGross = 0, received = 0;
      try {
        const bk = (await db.prepare(`SELECT price, done_at, settled_at FROM bookings WHERE hospital_id = ? AND channel = 'hospital' AND status = 'done' AND done_at >= ?`).bind(h.id, tNow - 400 * 86400000).all()).results || [];
        bk.forEach(x => { if (x.done_at >= monthStart) { monthDone++; monthGross += x.price || 0; } if (x.settled_at) received += payoutOf(x.price || 0, 'hospital').hospital; });
      } catch (e) {}
      try {
        const cl = (await db.prepare(`SELECT billed, end_at, settled_at FROM calls WHERE hospital_id = ? AND channel = 'hospital' AND billed > 0 AND end_at >= ?`).bind(h.id, tNow - 400 * 86400000).all()).results || [];
        cl.forEach(x => { if (x.end_at >= monthStart) { monthDone++; monthGross += x.billed || 0; } if (x.settled_at) received += payoutOf(x.billed || 0, 'hospital').hospital; });
      } catch (e) {}
      const paidOut = await one('SELECT COALESCE(SUM(amount), 0) n FROM hospital_payouts WHERE hospital_id = ?', h.id);
      const newComments = await one(
        `SELECT COUNT(*) n FROM post_comments c JOIN posts p ON p.id = c.post_id
          WHERE p.hospital_id = ? AND c.ts >= ? AND c.hidden = 0 AND c.by_hospital = 0`, h.id, weekAgo);
      let urgentUnacked = 0;
      try {
        urgentUnacked = await one(
          `SELECT COUNT(*) n FROM session_notes n
            WHERE n.risk = 'urgent' AND n.ts >= ? AND n.client_id IN (SELECT client_id FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0)
              AND NOT EXISTS (SELECT 1 FROM hospital_urgent_ack a WHERE a.note_id = n.id AND a.hospital_id = ?)`, tNow - 90 * 86400000, h.id, h.id);
      } catch (e) { urgentUnacked = 0; }
      let bankSet = false; try { bankSet = !!h.bank_no; } catch (e) {}
      return json({ ok: true, now: tNow, monthStart,
        patients, urgentWeek, urgentUnacked, notes7d,
        counselors: { ok: cOk, pending: cPending }, appsPending,
        month: { done: monthDone, gross: monthGross, hospital: payoutOf(monthGross, 'hospital').hospital },
        received, paidOut, newComments, bankSet, hasEmail: !!h.email }, 200, cors);
    }

    // ── 회기 기록 타임라인 (연결 내담자 전체, 공유된 것만) ──
    if (path === '/hospital/notes' && method === 'GET') {
      const limit = Math.max(1, Math.min(300, Number(q('limit')) || 100));
      const r = await db.prepare(
        `SELECT n.*, l.name AS link_name FROM session_notes n
           JOIN patient_links l ON l.client_id = n.client_id AND l.hospital_id = ? AND l.unlinked_at = 0
          WHERE n.shared = 1 ORDER BY n.ts DESC LIMIT ?`).bind(h.id, limit).all();
      return json({ ok: true, items: (r.results || []).map(n => Object.assign(rowNote(n), { clientName: n.link_name || n.client_name || '' })) }, 200, cors);
    }

    // ── 소속 상담사 ──
    if (path === '/hospital/counselors' && method === 'GET') {
      const SEL = `c.id, c.name, c.license, c.email, c.tel, c.photo, c.available, c.active, c.created,
        (SELECT COUNT(*) FROM bookings b WHERE b.counselor_id = c.id AND b.status = 'done' AND b.done_at >= ?) AS m_done,
        (SELECT COUNT(*) FROM bookings b WHERE b.counselor_id = c.id AND b.status = 'done') AS all_done,
        (SELECT COUNT(*) FROM bookings b WHERE b.counselor_id = c.id AND b.status = 'confirmed' AND b.when_ts > ?) AS upcoming,
        (SELECT COALESCE(SUM(b.price), 0) FROM bookings b WHERE b.counselor_id = c.id AND b.status = 'done' AND b.done_at >= ?) AS m_gross,
        (SELECT MAX(b.done_at) FROM bookings b WHERE b.counselor_id = c.id AND b.status = 'done') AS last_done,
        (SELECT COUNT(*) FROM bookings b WHERE b.counselor_id = c.id AND b.status = 'done'
            AND NOT EXISTS (SELECT 1 FROM session_notes n WHERE n.booking_id = b.id)) AS no_note`;
      let rows = [], hasOkCol = true;
      try {
        rows = (await db.prepare(`SELECT ${SEL}, c.hospital_ok FROM counselors c WHERE c.hospital_id = ? ORDER BY COALESCE(c.hospital_ok, 0) ASC, c.active DESC, c.name`)
          .bind(monthStart, tNow, monthStart, h.id).all()).results || [];
      } catch (e) {
        if (!noCol(e)) throw e;
        hasOkCol = false;
        rows = (await db.prepare(`SELECT ${SEL} FROM counselors c WHERE c.hospital_id = ? ORDER BY c.active DESC, c.name`)
          .bind(monthStart, tNow, monthStart, h.id).all()).results || [];
        rows.forEach(x => { x.hospital_ok = 1; });
      }
      // 이번 달 통화 상담료도 합친다 (통화 표가 없는 배포는 건너뛴다)
      const callG = {};
      try {
        const ids = rows.map(x => x.id);
        if (ids.length) {
          const cl = (await db.prepare(`SELECT counselor_id, COALESCE(SUM(billed), 0) g, COUNT(*) n, MAX(end_at) last FROM calls WHERE counselor_id IN (${inList(ids)}) AND billed > 0 AND end_at >= ? GROUP BY counselor_id`)
            .bind(...ids, monthStart).all()).results || [];
          cl.forEach(x => { callG[x.counselor_id] = x; });
        }
      } catch (e) {}
      return json({ ok: true, now: tNow, monthStart, migrated: hasOkCol, items: rows.map(c => ({
        id: c.id, name: c.name, license: c.license || '', email: maskEmail(c.email), tel: c.tel || '', photo: c.photo || '',
        available: !!c.available, active: !!c.active, created: c.created, hospitalOk: !!c.hospital_ok,
        stats: {
          monthDone: (c.m_done || 0) + ((callG[c.id] || {}).n || 0), allDone: c.all_done || 0, upcoming: c.upcoming || 0,
          monthGross: (c.m_gross || 0) + ((callG[c.id] || {}).g || 0),
          lastDone: Math.max(c.last_done || 0, (callG[c.id] || {}).last || 0), noNote: c.no_note || 0
        }
      })) }, 200, cors);
    }
    if (path === '/hospital/counselors/approve' && method === 'POST') {
      const id = cleanId(body.id);
      try {
        const r = await db.prepare('UPDATE counselors SET hospital_ok = 1 WHERE id = ? AND hospital_id = ?').bind(id, h.id).run();
        if (!(r.meta && r.meta.changes)) return json({ error: 'not-found' }, 404, cors);
      } catch (e) { if (noCol(e)) return json({ error: 'migrate' }, 503, cors); throw e; }
      return json({ ok: true }, 200, cors);
    }
    if (path === '/hospital/counselors/remove' && method === 'POST') {
      const id = cleanId(body.id);
      let r;
      try { r = await db.prepare("UPDATE counselors SET hospital_id = NULL, hospital_ok = 0, hospital = '', updated = ? WHERE id = ? AND hospital_id = ?").bind(tNow, id, h.id).run(); }
      catch (e) { if (!noCol(e)) throw e; r = await db.prepare("UPDATE counselors SET hospital_id = NULL, hospital = '', updated = ? WHERE id = ? AND hospital_id = ?").bind(tNow, id, h.id).run(); }
      if (!(r.meta && r.meta.changes)) return json({ error: 'not-found' }, 404, cors);
      return json({ ok: true }, 200, cors);
    }

    // ── 입점 신청 (이 상담소 소속으로 낸 것) — 상담소가 직접 승인·반려한다 ──
    if (path === '/hospital/applications' && method === 'GET') {
      let rows = [];
      // 사진·자격증 사진은 심사 중(pending)인 것만 실어 보낸다 — 지난 신청까지 다 실으면 응답이 무거워진다.
      const APP_COLS = `id, name, license, career, price, intro, email, tel, tags, status, ts, reject_why, decided_at, counselor_id,
            CASE WHEN status = 'pending' THEN photo ELSE '' END AS photo`;
      try {
        try {
          rows = (await db.prepare(`SELECT ${APP_COLS}, CASE WHEN status = 'pending' THEN license_photo ELSE '' END AS license_photo
            FROM applications WHERE hospital_id = ? ORDER BY ts DESC LIMIT 100`).bind(h.id).all()).results || [];
        } catch (e) {
          if (!noCol(e) || !/license_photo/.test(String(e && e.message))) throw e;
          rows = (await db.prepare(`SELECT ${APP_COLS} FROM applications WHERE hospital_id = ? ORDER BY ts DESC LIMIT 100`).bind(h.id).all()).results || [];
        }
      } catch (e) { if (noTable(e) || noCol(e)) return json({ ok: true, items: [], missing: true }, 200, cors); throw e; }
      return json({ ok: true, items: rows.map(a => ({
        id: a.id, name: a.name, license: a.license || '', career: a.career || '', price: a.price || 0, intro: a.intro || '',
        email: maskEmail(a.email), tel: a.tel || '', tags: safeJson(a.tags, []), photo: a.photo || '', licensePhoto: a.license_photo || '',
        status: a.status, ts: a.ts, rejectWhy: a.reject_why || '', decidedAt: a.decided_at || 0, counselorId: a.counselor_id || '', hasBank: false
      })) }, 200, cors);
    }
    if (path === '/hospital/applications/approve' && method === 'POST') {
      const r = await approveApplication(env, db, body.id, { ctx, hospitalId: h.id, hospitalOk: true });
      if (!r.ok) return json({ error: r.error }, r.status || 400, cors);
      return json({ ok: true, counselorId: r.counselorId, name: r.name, code: r.code, mailed: r.mailed }, 200, cors);
    }
    if (path === '/hospital/applications/reject' && method === 'POST') {
      const r = await rejectApplication(env, db, body.id, body.reason || body.why, { hospitalId: h.id });
      if (!r.ok) return json({ error: r.error }, r.status || 400, cors);
      return json({ ok: true }, 200, cors);
    }

    // ── 예약 캘린더 — 상담소 채널 예약 + 소속 상담사의 모든 예약 ──
    if (path === '/hospital/bookings' && method === 'GET') {
      const from = Number(q('from')) || (tNow - 7 * 86400000);
      const to = Number(q('to')) || (from + 14 * 86400000);
      const ids = await affiliatedIds();
      let rows = [];
      try {
        rows = (await db.prepare(
          `SELECT b.id, b.counselor_id, b.counselor_name, b.client_id, b.client_name, b.when_ts, b.time_label, b.price, b.status, b.done_at, b.channel,
                  (SELECT l.name FROM patient_links l WHERE l.client_id = b.client_id AND l.hospital_id = ? AND l.unlinked_at = 0) AS link_name
             FROM bookings b WHERE (b.hospital_id = ? OR b.counselor_id IN (${inList(ids)})) AND b.when_ts >= ? AND b.when_ts < ?
            ORDER BY b.when_ts ASC LIMIT 500`).bind(h.id, h.id, ...ids, from, to).all()).results || [];
      } catch (e) { if (noCol(e)) rows = []; else throw e; }
      return json({ ok: true, from, to, items: rows.map(b => ({
        id: b.id, counselorId: b.counselor_id, counselor: b.counselor_name || '', clientId: b.client_id,
        clientName: b.link_name || b.client_name || '', linked: !!b.link_name, whenTs: b.when_ts, time: b.time_label || '',
        price: b.price || 0, status: b.status, doneAt: b.done_at || 0, channel: b.channel === 'hospital' ? 'hospital' : 'app'
      })) }, 200, cors);
    }

    // ── 월별 통계 (최근 6개월, KST) ──
    if (path === '/hospital/stats' && method === 'GET') {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - i, 1));
        months.push({ key: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'), done: 0, gross: 0, hospitalGross: 0, newPatients: 0, urgent: 0, notes: 0 });
      }
      const byKey = {}; months.forEach(m => { byKey[m.key] = m; });
      const start = monthStartOf(kstNow.getUTCFullYear(), kstNow.getUTCMonth() - 5);
      const ids = await affiliatedIds();
      try {
        const bk = (await db.prepare(`SELECT price, done_at, channel FROM bookings WHERE (hospital_id = ? OR counselor_id IN (${inList(ids)})) AND status = 'done' AND done_at >= ?`)
          .bind(h.id, ...ids, start).all()).results || [];
        bk.forEach(x => { const m = byKey[monthKeyOf(x.done_at)]; if (!m) return; m.done++; m.gross += x.price || 0; if (x.channel === 'hospital') m.hospitalGross += x.price || 0; });
      } catch (e) {}
      try {
        const cl = (await db.prepare(`SELECT billed, end_at, channel FROM calls WHERE (hospital_id = ? OR counselor_id IN (${inList(ids)})) AND billed > 0 AND end_at >= ?`)
          .bind(h.id, ...ids, start).all()).results || [];
        cl.forEach(x => { const m = byKey[monthKeyOf(x.end_at)]; if (!m) return; m.done++; m.gross += x.billed || 0; if (x.channel === 'hospital') m.hospitalGross += x.billed || 0; });
      } catch (e) {}
      try {
        const pl = (await db.prepare('SELECT linked_at FROM patient_links WHERE hospital_id = ? AND linked_at >= ?').bind(h.id, start).all()).results || [];
        pl.forEach(x => { const m = byKey[monthKeyOf(x.linked_at)]; if (m) m.newPatients++; });
      } catch (e) {}
      try {
        const sn = (await db.prepare(`SELECT ts, risk, shared FROM session_notes WHERE ts >= ? AND client_id IN (SELECT client_id FROM patient_links WHERE hospital_id = ? AND unlinked_at = 0)`).bind(start, h.id).all()).results || [];
        sn.forEach(x => { const m = byKey[monthKeyOf(x.ts)]; if (!m) return; if (x.risk === 'urgent') m.urgent++; if (x.shared) m.notes++; });
      } catch (e) {}
      return json({ ok: true, months }, 200, cors);
    }

    // ── 긴급 알림 로그 (최근 90일) + 확인 표시 ──
    if (path === '/hospital/urgent' && method === 'GET') {
      const since = tNow - 90 * 86400000;
      let rows = [], hasAck = true;
      try {
        rows = (await db.prepare(
          `SELECT n.*, l.name AS link_name, (SELECT a.acked_at FROM hospital_urgent_ack a WHERE a.note_id = n.id AND a.hospital_id = ?) AS acked_at
             FROM session_notes n JOIN patient_links l ON l.client_id = n.client_id AND l.hospital_id = ? AND l.unlinked_at = 0
            WHERE n.risk = 'urgent' AND n.ts >= ? ORDER BY n.ts DESC LIMIT 200`).bind(h.id, h.id, since).all()).results || [];
      } catch (e) {
        if (!noTable(e)) throw e;
        hasAck = false;
        rows = (await db.prepare(
          `SELECT n.*, l.name AS link_name FROM session_notes n JOIN patient_links l ON l.client_id = n.client_id AND l.hospital_id = ? AND l.unlinked_at = 0
            WHERE n.risk = 'urgent' AND n.ts >= ? ORDER BY n.ts DESC LIMIT 200`).bind(h.id, since).all()).results || [];
      }
      // 공유하지 않은 기록은 '누가·언제·긴급'만 — 요약은 비운다 (메일과 같은 규칙)
      return json({ ok: true, migrated: hasAck, items: rows.map(n => {
        const o = rowNote(n);
        if (!n.shared) { o.summary = ''; o.plan = ''; o.homework = ''; }
        return Object.assign(o, { clientName: n.link_name || n.client_name || '', ackedAt: n.acked_at || 0 });
      }) }, 200, cors);
    }
    if (path === '/hospital/urgent/ack' && method === 'POST') {
      const nid = cleanId(body.noteId);
      const n = await db.prepare(
        `SELECT n.id FROM session_notes n JOIN patient_links l ON l.client_id = n.client_id AND l.hospital_id = ? AND l.unlinked_at = 0 WHERE n.id = ?`).bind(h.id, nid).first();
      if (!n) return json({ error: 'not-found' }, 404, cors);
      try {
        if (body.undo) await db.prepare('DELETE FROM hospital_urgent_ack WHERE hospital_id = ? AND note_id = ?').bind(h.id, nid).run();
        else await db.prepare('INSERT OR REPLACE INTO hospital_urgent_ack (hospital_id, note_id, acked_at) VALUES (?,?,?)').bind(h.id, nid, tNow).run();
      } catch (e) { if (noTable(e)) return json({ error: 'migrate' }, 503, cors); throw e; }
      return json({ ok: true, ackedAt: body.undo ? 0 : tNow }, 200, cors);
    }

    // ── 상담소 쪽에서 내담자 연결을 끊는다 (내담자 앱의 /patient/unlink 와 같은 결과) ──
    if (path === '/hospital/patient/unlink' && method === 'POST') {
      const cid = cleanId(body.clientId);
      const r = await db.prepare('UPDATE patient_links SET unlinked_at = ? WHERE client_id = ? AND hospital_id = ? AND unlinked_at = 0').bind(tNow, cid, h.id).run();
      if (!(r.meta && r.meta.changes)) return json({ error: 'not-linked' }, 404, cors);
      // 연결이 끝났으니 올라와 있던 주간 숫자도 지운다 (동의가 끝났다)
      await db.prepare('DELETE FROM patient_weekly WHERE client_id = ?').bind(cid).run();
      return json({ ok: true }, 200, cors);
    }

    // ── 내담자 메모 (상담소만 본다. 상담사·내담자에게 가지 않는다) ──
    if (path === '/hospital/memo' && method === 'GET') {
      const cid = cleanId(q('clientId'));
      let rows = [];
      try { rows = (await db.prepare('SELECT * FROM hospital_notes WHERE hospital_id = ? AND client_id = ? ORDER BY ts DESC LIMIT 100').bind(h.id, cid).all()).results || []; }
      catch (e) { if (noTable(e)) return json({ ok: true, items: [], missing: true }, 200, cors); throw e; }
      return json({ ok: true, items: rows.map(m => ({ id: m.id, clientId: m.client_id, text: m.text, ts: m.ts, updated: m.updated || m.ts })) }, 200, cors);
    }
    if (path === '/hospital/memo/save' && method === 'POST') {
      const cid = cleanId(body.clientId), text = s(body.text, 2000).trim();
      if (!cid || !text) return json({ error: 'missing' }, 400, cors);
      const l = await db.prepare('SELECT 1 AS ok FROM patient_links WHERE client_id = ? AND hospital_id = ? AND unlinked_at = 0').bind(cid, h.id).first();
      if (!l) return json({ error: 'not-linked' }, 403, cors);
      let id = cleanId(body.id);
      try {
        if (id) {
          const r = await db.prepare('UPDATE hospital_notes SET text = ?, updated = ? WHERE id = ? AND hospital_id = ?').bind(text, tNow, id, h.id).run();
          if (!(r.meta && r.meta.changes)) return json({ error: 'not-found' }, 404, cors);
        } else {
          id = rid('hm');
          await db.prepare('INSERT INTO hospital_notes (id, hospital_id, client_id, text, ts, updated) VALUES (?,?,?,?,?,?)').bind(id, h.id, cid, text, tNow, tNow).run();
        }
      } catch (e) { if (noTable(e)) return json({ error: 'migrate' }, 503, cors); throw e; }
      const m = await db.prepare('SELECT * FROM hospital_notes WHERE id = ?').bind(id).first();
      return json({ ok: true, memo: { id: m.id, clientId: m.client_id, text: m.text, ts: m.ts, updated: m.updated || m.ts } }, 200, cors);
    }
    if (path === '/hospital/memo/delete' && method === 'POST') {
      try { await db.prepare('DELETE FROM hospital_notes WHERE id = ? AND hospital_id = ?').bind(cleanId(body.id), h.id).run(); }
      catch (e) { if (noTable(e)) return json({ error: 'migrate' }, 503, cors); throw e; }
      return json({ ok: true }, 200, cors);
    }

    // ── 상담소 정보(사업자등록번호·전화·주소) · 정산 계좌 ──
    //  bizno 는 한 번만 적을 수 있다 — 이미 있으면 운영팀이 고친다. tel·addr 는 상담소 페이지(profile JSON)와 같은 칸이다.
    const bankOf = () => h.bank_no ? { bank: h.bank || '', holder: h.bank_holder || '', masked: maskAcct(h.bank_no), set: true } : { set: false };
    const infoOf = () => { const p = profileJson(); return {
      id: h.id, name: h.name, dept: h.dept || '', doctor: h.doctor || '', email: h.email || '', hasEmail: !!h.email, created: h.created,
      code: h.code || '',        // 내담자 연결용 상담소 코드 — 소장 본인 화면에서만 보여준다(복사 버튼)
      bizno: h.bizno || '', biznoLocked: !!h.bizno, tel: p.tel || '', addr: p.addr || '', bank: bankOf(), migrated: h.bizno !== undefined && h.bank_no !== undefined
    }; };
    if (path === '/hospital/info' && method === 'GET') return json({ ok: true, info: infoOf() }, 200, cors);
    if (path === '/hospital/info' && method === 'POST') {
      const has = k => Object.prototype.hasOwnProperty.call(body, k);
      const p = profileJson();
      if (has('tel')) p.tel = s(body.tel, 30).replace(/[^0-9-+ ]/g, '').trim();
      if (has('addr')) p.addr = s(body.addr, 120).trim();
      const prof = { intro: p.intro || '', tel: p.tel || '', addr: p.addr || '', url: p.url || '', hours: p.hours || '' };
      await db.prepare('UPDATE hospitals SET profile = ? WHERE id = ?').bind(JSON.stringify(prof), h.id).run();
      h.profile = JSON.stringify(prof);
      if (has('bizno')) {
        const bz = s(body.bizno, 20).replace(/[^0-9]/g, '');
        if (bz && !/^\d{10}$/.test(bz)) return json({ error: 'bad-bizno' }, 400, cors);
        if (h.bizno && bz !== h.bizno) return json({ error: 'locked' }, 400, cors);
        if (!h.bizno && bz) {
          try { await db.prepare('UPDATE hospitals SET bizno = ? WHERE id = ?').bind(bz, h.id).run(); h.bizno = bz; }
          catch (e) { if (noCol(e)) return json({ error: 'migrate' }, 503, cors); throw e; }
        }
      }
      return json({ ok: true, info: infoOf() }, 200, cors);
    }
    if (path === '/hospital/bank' && method === 'GET') return json({ ok: true, bank: bankOf(), migrated: h.bank_no !== undefined }, 200, cors);
    if (path === '/hospital/bank' && method === 'POST') {
      const bank = s(body.bank, 40).trim(), no = s(body.bankNo || body.no, 40).replace(/[^0-9-]/g, ''), holder = s(body.holder || body.bankHolder, 40).trim();
      if (!bank || no.replace(/-/g, '').length < 6 || !holder) return json({ error: 'missing' }, 400, cors);
      try { await db.prepare('UPDATE hospitals SET bank = ?, bank_no = ?, bank_holder = ? WHERE id = ?').bind(bank, no, holder, h.id).run(); }
      catch (e) { if (noCol(e)) return json({ error: 'migrate' }, 503, cors); throw e; }
      h.bank = bank; h.bank_no = no; h.bank_holder = holder;
      return json({ ok: true, bank: bankOf() }, 200, cors);
    }
    return null;
  }

  // ══════════════ 운영자 ══════════════
  if (path.startsWith('/admin/hospitals')) {
    if (!isAdmin(env, code)) return json({ error: 'bad-code' }, 403, cors);
    const emailOf = v => { const e = normEmail(v); return looksLikeEmail(e) ? e : ''; };
    if (path === '/admin/hospitals' && method === 'GET') {
      const r = await db.prepare(
        `SELECT h.*, (SELECT COUNT(*) FROM patient_links l WHERE l.hospital_id = h.id AND l.unlinked_at = 0) AS patients,
                (SELECT COUNT(*) FROM doctor_feedback f WHERE f.hospital_id = h.id) AS feedbacks,
                (SELECT MAX(s.last_seen) FROM hospital_sessions s WHERE s.hospital_id = h.id) AS last_seen
           FROM hospitals h ORDER BY h.created DESC LIMIT 200`).all();
      return json({ items: (r.results || []).map(x => ({ id: x.id, name: x.name, dept: x.dept || '', doctor: x.doctor || '', email: x.email || '', code: x.code, active: !!x.active, created: x.created, patients: x.patients || 0, feedbacks: x.feedbacks || 0, lastSeen: x.last_seen || 0 })) }, 200, cors);
    }
    if (path === '/admin/hospitals' && method === 'POST') {
      const name = s(body.name, 60).trim();
      if (!name) return json({ error: 'missing-name' }, 400, cors);
      const id = rid('hp'), c = makeHospitalCode();
      await db.prepare('INSERT INTO hospitals (id, name, dept, doctor, email, code, active, created) VALUES (?,?,?,?,?,?,1,?)')
        .bind(id, name, s(body.dept, 40), s(body.doctor, 40), emailOf(body.email), c, nowMs()).run();
      return json({ ok: true, id, code: c }, 200, cors);
    }
    if (path === '/admin/hospitals/update' && method === 'POST') {
      await db.prepare('UPDATE hospitals SET name = ?, dept = ?, doctor = ?, email = ? WHERE id = ?')
        .bind(s(body.name, 60).trim(), s(body.dept, 40), s(body.doctor, 40), emailOf(body.email), cleanId(body.id)).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/admin/hospitals/active' && method === 'POST') {
      await db.prepare('UPDATE hospitals SET active = ? WHERE id = ?').bind(body.active ? 1 : 0, cleanId(body.id)).run();
      if (!body.active) await db.prepare('DELETE FROM hospital_sessions WHERE hospital_id = ?').bind(cleanId(body.id)).run();
      return json({ ok: true }, 200, cors);
    }
    if (path === '/admin/hospitals/rotate' && method === 'POST') {
      const c = makeHospitalCode();
      await db.prepare('UPDATE hospitals SET code = ? WHERE id = ?').bind(c, cleanId(body.id)).run();
      return json({ ok: true, code: c }, 200, cors);
    }
    return null;
  }
  return null;
}
