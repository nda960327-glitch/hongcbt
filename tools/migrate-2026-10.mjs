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
