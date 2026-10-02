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
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync } from 'node:fs';
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
  // 이용자 글(수다방·고민 Q&A·기능 제안) · 공지 · 신고 — community.js
  ["글 게시판", "ALTER TABLE posts ADD COLUMN board TEXT"],
  ["글 쓴 기기", "ALTER TABLE posts ADD COLUMN client_id TEXT"],
  ["글 게시판 색인", "CREATE INDEX IF NOT EXISTS idx_posts_board ON posts(board, created)"],
  ["신고 표", "CREATE TABLE IF NOT EXISTS post_reports (target TEXT NOT NULL, target_id TEXT NOT NULL, client_id TEXT NOT NULL, reason TEXT, ts INTEGER NOT NULL, PRIMARY KEY (target, target_id, client_id))"],
  ["커뮤니티 시스템 상담소", "INSERT OR IGNORE INTO hospitals (id, name, dept, doctor, email, code, active, created) VALUES ('community', '마인드 인사이드 커뮤니티', '', '', '', 'SYS-' || lower(hex(randomblob(12))), 1, 1790900000000)"],
  ["공지: 이용 규칙", "INSERT OR IGNORE INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, author_name, board) VALUES ('po_notice_rules', 'community', '커뮤니티 이용 규칙 — 꼭 읽어주세요', '# 서로의 마음을 다치게 하지 않는 것, 그게 이곳의 유일한 큰 규칙이에요.\n\n## 이런 글을 환영해요\n\n- 오늘 있었던 일, 웃긴 이야기, 소소한 자랑\n- AI 상담사와 나눈 대화 중 기억에 남는 장면 (캡처도 좋아요)\n- 요즘 마음이 어떤지, 어떻게 버티고 있는지\n- 상담이나 마음 돌봄에 대한 궁금증 (고민 Q&A 게시판)\n\n## 이것만은 지켜주세요\n\n**1. 비난·조롱·혐오 표현은 쓰지 않아요.** 특정 사람이나 집단을 깎아내리는 글과 댓글은 가려집니다.\n\n**2. 개인정보를 올리지 않아요.** 실명, 전화번호, 주소, 학교·직장, 얼굴이 나온 사진, 다른 사람과의 대화 캡처는 올리지 말아 주세요. 전화번호·이메일·메신저 아이디는 자동으로 가려집니다.\n\n**3. 진단하거나 약을 권하지 않아요.** \"그거 우울증이에요\", \"이 약 드세요\" 같은 말은 전문가의 몫이에요. 내 경험을 나누는 것은 좋아요.\n\n**4. 자해·자살의 방법을 적지 않아요.** 힘든 마음을 털어놓는 것은 괜찮습니다. 다만 구체적인 방법이나 수단은 다른 분께 위험할 수 있어 가려집니다.\n\n**5. 광고·홍보·외부 연락 유도는 안 돼요.** 상담사분들도 이곳에서는 연락처나 다른 곳으로 오라는 안내를 남길 수 없어요.\n\n## 신고와 가림\n\n글이나 댓글의 **신고** 버튼을 누르면 운영팀이 확인합니다. 여러 분이 신고한 글은 먼저 가려지고, 운영팀이 확인한 뒤 되살리거나 지웁니다. 규칙을 반복해서 어기면 글쓰기가 제한될 수 있어요.\n\n## 꼭 기억해 주세요\n\n{green|이곳의 글과 댓글은 전문 상담이나 진료를 대신하지 않아요.} 지금 많이 힘들다면 자살예방상담전화 **109**, 정신건강 위기상담 **1577-0199** 로 바로 연락해 주세요. 24시간 받습니다.', '', 1, 1, 0, 1790900000000 + 3, 1790900000000 + 3, '운영팀', 'notice')"],
  ["공지: 사용법", "INSERT OR IGNORE INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, author_name, board) VALUES ('po_notice_guide', 'community', '처음 오셨나요? 커뮤니티 사용법', '# 마인드 인사이드 커뮤니티에 오신 걸 환영해요.\n\n## 게시판은 다섯 곳이에요\n\n**상담사 칼럼** — 심리상담사와 상담소가 직접 쓰는 마음 돌봄 글이에요. 글쓴 상담사의 블로그에서 다른 글도 볼 수 있고, 마음에 들면 앱에서 바로 상담을 예약할 수 있어요.\n\n**수다방** — 누구나 편하게 쓰는 곳이에요. 오늘 있었던 일, 웃긴 이야기, AI 상담사 우렁이와 나눈 대화 캡처까지.\n\n**고민 Q&A** — 고민을 올리면 다른 분들과 상담사가 답을 남겨요. 상담사의 답에는 ''상담사'' 표시가 붙어요.\n\n**기능 제안** — 앱에 이런 기능이 있으면 좋겠다, 여기가 불편하다, 오류가 있다 — 무엇이든 남겨주세요. 공감이 많은 제안부터 살펴봅니다.\n\n**공지** — 운영팀이 알리는 소식이에요.\n\n## 이렇게 즐겨보세요\n\n- 글이 마음에 들면 **공감**을 눌러주세요. 공감이 많은 글은 ''지금 인기 글''에 올라가요.\n- 댓글에도 공감할 수 있어요. 공감을 많이 받은 댓글은 **베스트 댓글**이 됩니다.\n- 댓글에 **답글**을 달아 이야기를 이어갈 수 있어요.\n- 가입 없이 별명만 정하면 바로 쓸 수 있어요. 앱에서 쓰던 별명이 그대로 이어집니다.\n\n## 앱과 이어져 있어요\n\n마인드 인사이드 앱의 커뮤니티와 이 홈페이지는 같은 곳이에요. 앱에서 쓴 글이 여기에도 보이고, 여기서 쓴 글이 앱에도 보입니다.', '', 1, 1, 0, 1790900000000 + 2, 1790900000000 + 2, '운영팀', 'notice')"],
  ["공지: 기능 제안", "INSERT OR IGNORE INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, author_name, board) VALUES ('po_notice_idea', 'community', '기능 제안·오류 신고는 이렇게 남겨주세요', '# 앱을 쓰다가 떠오른 생각을 들려주세요.\n\n**기능 제안** 게시판은 운영팀이 매일 읽습니다.\n\n## 이렇게 쓰면 더 빨리 반영돼요\n\n**바라는 기능이라면** — 어떤 상황에서 필요했는지 한 줄만 적어주세요. \"잠들기 전에 우렁이랑 얘기하다가, 대화를 저장하고 싶었어요\"처럼요.\n\n**오류 신고라면** — 어느 화면에서, 무엇을 눌렀을 때, 어떻게 됐는지 적어주세요. 화면 캡처가 있으면 가장 좋아요.\n\n## 공감이 곧 투표예요\n\n다른 분의 제안이 마음에 들면 **공감**을 눌러주세요. 공감이 많은 제안부터 검토하고, 반영되면 댓글로 알려드릴게요.\n\n개인정보가 담긴 문의나 결제 문제는 게시판 대신 mindinsideapp@gmail.com 으로 보내주세요.', '', 1, 0, 0, 1790900000000 + 1, 1790900000000 + 1, '운영팀', 'notice')"],
  ["공지 문구: 가입", "UPDATE posts SET body = replace(body, '가입 없이 별명만 정하면 바로 쓸 수 있어요. 앱에서 쓰던 별명이 그대로 이어집니다.', '카카오·네이버·구글 계정으로 가입하면 글과 댓글을 쓸 수 있어요. 앱에서 로그인한 계정 그대로 이어집니다.') WHERE id = 'po_notice_guide'"],
  ["게시판 첫 글: 전문가 라운지", "INSERT OR IGNORE INTO posts (id, hospital_id, title, body, tags, published, pinned, hidden, created, updated, author_name, board) VALUES ('po_op_exp1', 'community', '전문가 라운지를 열었어요 — 현장 이야기를 나눠요', '# 정신건강의학과 의사, 심리상담사, 임상심리사분들을 위한 곳이에요.\n\n## 이런 이야기를 기다려요\n\n- 현장에서 느끼는 고민과 보람\n- 치료·상담 기법에 대한 생각과 공부한 것\n- 진료와 상담이 서로 어떻게 이어지면 좋을지\n- 후배와 학생에게 해주고 싶은 말\n\n## 꼭 지켜주세요\n\n내담자·환자를 알아볼 수 있는 정보는 한 줄도 적지 말아 주세요. 사례를 이야기할 때는 나이·직업·사연을 바꾸거나 빼 주세요.\n\n상담사 입점과 상담소 제휴는 앱 소개 페이지에서 신청할 수 있어요.', '', 1, 0, 0, 1790900000016, 1790900000016, '운영팀', 'expert')"],
  ['커뮤니티 프로필 표', 'CREATE TABLE IF NOT EXISTS user_profiles (user_id TEXT PRIMARY KEY, nick TEXT, photo TEXT, updated INTEGER NOT NULL DEFAULT 0)'],
  // 느루 → 우렁이 (2026-10-02) — 이미 들어간 커뮤니티 글·댓글의 이름
  ['이름 바꾸기: 글', "UPDATE posts SET title = replace(title, '\uB290\uB8E8', '우렁이'), body = replace(body, '\uB290\uB8E8', '우렁이') WHERE hospital_id = 'community' AND (title LIKE '%\uB290\uB8E8%' OR body LIKE '%\uB290\uB8E8%')"],
  ['이름 바꾸기: 댓글', "UPDATE post_comments SET text = replace(text, '\uB290\uB8E8', '우렁이') WHERE client_id = 'sys' AND text LIKE '%\uB290\uB8E8%'"],
  ['캐시 사용 장부 색인', 'CREATE INDEX IF NOT EXISTS idx_cash_spends_client ON cash_spends(client_id, voided_at)'],
];

// 커뮤니티 첫 글(편집팀 칼럼 + 사진, 게시판 여는 글) — 길어서 따로 둔 파일. INSERT OR IGNORE 라 몇 번 돌려도 한 번만 들어간다.
try { STEPS.push(...JSON.parse(readFileSync(new URL('./seed-community.json', import.meta.url), 'utf8'))); } catch (e) {}

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
