// 2026-10 출시 전 보강 — 운영 DB(D1 hongcbt)에 새 칸·색인을 한 번에 넣는다.
//
//  쓰는 법 (저장소 맨 위 폴더에서):  node tools/migrate-2026-10.mjs
//
//  왜 파일(--file) 한 방이 아니라 한 줄씩인가:
//   SQLite 에는 ADD COLUMN IF NOT EXISTS 가 없어서, 이미 있는 칸을 만나면 파일 전체가 거기서 멈춘다.
//   한 줄씩 돌리고 '이미 있음(duplicate column)'은 건너뛰면 몇 번을 돌려도 안전하다.
//
//  반드시 워커 배포(npx wrangler deploy)보다 먼저 돌린다. 칸이 없으면:
//   · 스토어 앱 구글 로그인이 '점검 중' 화면에서 멈춘다(oauth_handoff.pc 필요)
//   · 상담소장 관리 코드(HA-) 로그인이 막힌다(hospitals.admin_code 필요) — 이메일 링크 로그인은 된다
//   · 나머지(통화 신호 분리·예약 30분 전 알림·상담소 몫 정산 도장·상담 잔액 상한)는 조용히 옛 방식으로 돈다
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STEPS = [
  // ── 옛 스키마 파일에 주석으로만 적혀 있던 칸들 ─────────────────────────
  //  운영 DB 에는 이미 있다('이미 있음'으로 지나간다). 새로 만든 DB 에서는 이게 없으면 통화·정산이 500 을 낸다.
  ['통화 방향', 'ALTER TABLE calls ADD COLUMN dir TEXT'],
  ['통화 마지막 심박', 'ALTER TABLE calls ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0'],
  ['통화 채널', "ALTER TABLE calls ADD COLUMN channel TEXT NOT NULL DEFAULT 'app'"],
  ['통화 상담소', 'ALTER TABLE calls ADD COLUMN hospital_id TEXT'],
  ['통화 정산 시각', 'ALTER TABLE calls ADD COLUMN settled_at INTEGER NOT NULL DEFAULT 0'],
  ['예약 채널', "ALTER TABLE bookings ADD COLUMN channel TEXT NOT NULL DEFAULT 'app'"],
  ['예약 상담소', 'ALTER TABLE bookings ADD COLUMN hospital_id TEXT'],
  // 통화 — 다시 건 전화가 지난 통화의 '끊음' 신호를 집어 곧장 끊기던 문제 (rtc.js insertSignal)
  ['통화 신호에 통화 번호', "ALTER TABLE rtc_signals ADD COLUMN call_id TEXT DEFAULT ''"],
  // 유료 상담 — 동의 순간 잔액까지만 청구 (rtc.js endConsult)
  ['상담 청구 상한', 'ALTER TABLE calls ADD COLUMN consult_cap_ms INTEGER NOT NULL DEFAULT 0'],
  // 예약 30분 전 알림 — 한 번만 보내기 (cbtproxy.worker.js remindBookings)
  ['예약 알림 보낸 시각', 'ALTER TABLE bookings ADD COLUMN reminded_at INTEGER NOT NULL DEFAULT 0'],
  ['예약 알림 색인', 'CREATE INDEX IF NOT EXISTS idx_bk_status_when ON bookings(status, when_ts)'],
  // 정산 — 소개(referral) 건의 상담사 몫·상담소 몫을 따로 도장 찍는다 (market.js /settle/pay)
  ['예약 상담소 몫 지급', 'ALTER TABLE bookings ADD COLUMN hospital_settled_at INTEGER NOT NULL DEFAULT 0'],
  ['통화 상담소 몫 지급', 'ALTER TABLE calls ADD COLUMN hospital_settled_at INTEGER NOT NULL DEFAULT 0'],
  // 이미 지급한 상담소 건이 정산 목록에 다시 뜨지 않게 옛 도장을 옮긴다 (여러 번 돌려도 같은 결과)
  ['옛 지급 기록 옮기기(예약)', "UPDATE bookings SET hospital_settled_at = settled_at WHERE settled_at > 0 AND hospital_settled_at = 0 AND channel IN ('hospital', 'referral')"],
  ['옛 지급 기록 옮기기(통화)', "UPDATE calls SET hospital_settled_at = settled_at WHERE COALESCE(settled_at, 0) > 0 AND hospital_settled_at = 0 AND channel IN ('hospital', 'referral')"],
  ['상담소 정산 색인', 'CREATE INDEX IF NOT EXISTS idx_bk_hsettle ON bookings(hospital_settled_at, channel)'],
  // 같은 상담사·같은 시각 이중 예약을 DB 차원에서도 막는다 (이미 겹친 예약이 있으면 실패 — 그땐 운영자가 정리 후 다시)
  ['이중 예약 차단 색인', "CREATE UNIQUE INDEX IF NOT EXISTS uq_bk_slot ON bookings(counselor_id, when_ts) WHERE status IN ('confirmed', 'done', 'disputed')"],
  // 상담소 — 내담자에게 주는 상담소 코드와 소장 로그인 코드를 분리 (hospital.js resolveHospital)
  ['소장 관리 코드', 'ALTER TABLE hospitals ADD COLUMN admin_code TEXT'],
  ['소장 관리 코드 색인', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitals_admin_code ON hospitals(admin_code) WHERE admin_code IS NOT NULL'],
  // 구글 로그인(스토어 앱) — 6자리 확인 번호 (oauth.js)
  ['로그인 대기 pair(state)', 'ALTER TABLE oauth_state ADD COLUMN pair TEXT'],
  ['로그인 대기 pair(handoff)', 'ALTER TABLE oauth_handoff ADD COLUMN pair TEXT'],
  ['로그인 확인 번호', 'ALTER TABLE oauth_handoff ADD COLUMN pc TEXT'],
  ['로그인 확인 시도 수', 'ALTER TABLE oauth_handoff ADD COLUMN tries INTEGER NOT NULL DEFAULT 0'],
  ['로그인 대기 색인', 'CREATE INDEX IF NOT EXISTS idx_handoff_pair ON oauth_handoff(pair)'],
  // 앱 안 캐시 사용 장부 — 구독·리포트 등으로 쓴 돈을 서버 잔액에서도 뺀다 (market.js cashBalance)
  ['앱 안 캐시 사용 장부', 'CREATE TABLE IF NOT EXISTS cash_spends (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT, ts INTEGER NOT NULL, voided_at INTEGER NOT NULL DEFAULT 0)'],
  // 알림 종류별 끄기 — 앱이 꺼져 있을 때 서버가 보내는 푸시도 설정을 따르게 (push.js isMuted)
  ['알림 설정 표', 'CREATE TABLE IF NOT EXISTS push_prefs (owner TEXT PRIMARY KEY, muted TEXT, updated INTEGER NOT NULL DEFAULT 0)'],
  // 상담사·상담소장의 소셜 로그인 — 소셜 계정을 상담사·상담소 계정에 이어 둔 표 (oauth.js /oauth/staff/*)
  ['직원 소셜 로그인 연결 표', 'CREATE TABLE IF NOT EXISTS staff_links (user_id TEXT NOT NULL, role TEXT NOT NULL, ref_id TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user_id, role))'],
  ['직원 소셜 로그인 색인', 'CREATE INDEX IF NOT EXISTS idx_staff_links_ref ON staff_links(role, ref_id)'],
  // 소속 상담사가 쓴 상담소 글 — 글쓴이 (community.js /pro/posts)
  ['글 글쓴이', 'ALTER TABLE posts ADD COLUMN author_id TEXT'],
  ['글 글쓴이 이름', 'ALTER TABLE posts ADD COLUMN author_name TEXT'],
  ['글 글쓴이 색인', 'CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created)'],
  // 커뮤니티 고도화 — 조회수 · 답글(대댓글)
  ['글 조회수', 'ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0'],
  ['댓글의 윗댓글', 'ALTER TABLE post_comments ADD COLUMN parent_id TEXT'],
  ['댓글 공감 표', 'CREATE TABLE IF NOT EXISTS post_comment_likes (comment_id TEXT NOT NULL, client_id TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (comment_id, client_id))'],
  ['캐시 사용 장부 색인', 'CREATE INDEX IF NOT EXISTS idx_cash_spends_client ON cash_spends(client_id, voided_at)'],
];

// 시험용: node tools/migrate-2026-10.mjs --local [wrangler 추가 인자…] 로 로컬 DB 에 먼저 돌려볼 수 있다
const extra = process.argv.slice(2);
const target = extra.includes('--local') ? extra : ['--remote', ...extra];
const SQL_FILE = join(mkdtempSync(join(tmpdir(), 'mig-')), 'step.sql');
let bad = 0;
for (const [name, sql] of STEPS) {
  try {
    // --command 로 넘기면 윈도 셸이 따옴표·괄호를 쪼갠다 — 한 줄짜리 .sql 파일로 넘긴다
    writeFileSync(SQL_FILE, sql + ';\n');
    execSync(`npx wrangler d1 execute hongcbt ${target.join(' ')} --file="${SQL_FILE}"`,
      { stdio: 'pipe', encoding: 'utf8' });
    console.log('  완료   ' + name);
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || ''));
    if (/duplicate column/i.test(out)) { console.log('  이미 있음 ' + name); continue; }
    bad++;
    console.log('  실패   ' + name + '\n         ' + (out.match(/ERROR.*|error.*/i) || [out.slice(0, 200)])[0]);
  }
}
try { unlinkSync(SQL_FILE); } catch (e) {}
console.log(bad ? `\n${bad}개 실패 — 위 메시지를 확인하세요.` : '\n모두 끝났습니다. 이제 워커를 배포해도 됩니다.');
