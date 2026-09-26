-- 마인드 인사이드 상담사 마켓 — Cloudflare D1 스키마
--
--  적용:
--    wrangler d1 create hongcbt
--    wrangler d1 execute hongcbt --remote --file=./schema.sql
--
--  설계 원칙
--   · 내담자는 계정이 없다. 기기가 만든 임의 clientId 만 쓴다.
--   · 상담사는 발급 코드로 자기 것만 본다. 코드가 곧 열쇠다.
--   · 상담 대화 원문은 저장하지 않는다. 내담자가 '보내기'를 누른 요약본만 들어온다.

CREATE TABLE IF NOT EXISTS counselors (
  id          TEXT PRIMARY KEY,          -- 앱의 marketplace.js 와 같은 값 (c1, c2 …)
  name        TEXT NOT NULL,
  hospital    TEXT,
  code        TEXT NOT NULL UNIQUE,      -- 발급 코드. 이 사람의 유일한 인증 수단
  available   INTEGER NOT NULL DEFAULT 0,-- 바로상담 수신 ON/OFF
  busy_until  INTEGER NOT NULL DEFAULT 0,-- 통화 중 잠금. 35분 뒤 자동 해제
  active      INTEGER NOT NULL DEFAULT 1,-- 0 이면 코드 정지
  created     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  counselor_id   TEXT NOT NULL,
  counselor_name TEXT,
  client_id      TEXT NOT NULL,
  client_name    TEXT,
  when_ts        INTEGER NOT NULL,       -- 상담 시각
  time_label     TEXT,                   -- 화면에 그대로 쓰는 표기
  price          INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed|cancelled|declined|noshow
  created        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bk_counselor ON bookings(counselor_id, when_ts);
CREATE INDEX IF NOT EXISTS idx_bk_client    ON bookings(client_id, when_ts);

CREATE TABLE IF NOT EXISTS inbox (
  id             TEXT PRIMARY KEY,
  counselor_id   TEXT NOT NULL,
  counselor_name TEXT,
  booking_id     TEXT,
  client_id      TEXT NOT NULL,
  client_name    TEXT,
  body           TEXT NOT NULL,          -- 내담자가 동의하고 보낸 요약본
  read_at        INTEGER NOT NULL DEFAULT 0,
  ts             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_counselor ON inbox(counselor_id, ts);

CREATE TABLE IF NOT EXISTS reviews (
  id           TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  booking_id   TEXT,
  client_id    TEXT NOT NULL,
  client_name  TEXT,
  rating       INTEGER NOT NULL,
  body         TEXT,
  reply        TEXT,
  reply_ts     INTEGER NOT NULL DEFAULT 0,
  ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rv_counselor ON reviews(counselor_id, ts);
CREATE INDEX IF NOT EXISTS idx_rv_client    ON reviews(client_id, ts);

CREATE TABLE IF NOT EXISTS chat_msgs (
  id             TEXT PRIMARY KEY,
  counselor_id   TEXT NOT NULL,
  counselor_name TEXT,
  client_id      TEXT NOT NULL,
  client_name    TEXT,
  sender         TEXT NOT NULL,          -- 'client' | 'counselor'
  body           TEXT NOT NULL,
  ts             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cm_counselor ON chat_msgs(counselor_id, ts);
CREATE INDEX IF NOT EXISTS idx_cm_client    ON chat_msgs(client_id, ts);

CREATE TABLE IF NOT EXISTS call_queue (
  counselor_id TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  client_name  TEXT,
  ts           INTEGER NOT NULL,
  PRIMARY KEY (counselor_id, client_id)
);

-- 느루의 추천 — 운영자가 올리는 정신건강 영상·글과 이용자의 반응 (feed.js)
CREATE TABLE IF NOT EXISTS feed (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL DEFAULT 'youtube',  -- youtube | article
  title      TEXT NOT NULL,
  url        TEXT,
  video_id   TEXT,
  thumb      TEXT,
  author     TEXT,
  body       TEXT,                              -- 글 본문 (article)
  tags       TEXT,                              -- '불안,수면' 처럼 쉼표 구분
  note       TEXT,                              -- 느루 한마디
  published  INTEGER NOT NULL DEFAULT 1,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL,
  updated    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS feed_votes (
  feed_id    TEXT NOT NULL,
  client_id  TEXT NOT NULL,
  v          INTEGER NOT NULL,                  -- 1 도움됐어요 · -1 별로예요
  ts         INTEGER NOT NULL,
  PRIMARY KEY (feed_id, client_id)
);

-- 병원(담당의) 연동 — hospital.js. 환자 연결·회기 기록·의사 피드백
CREATE TABLE IF NOT EXISTS hospitals (id TEXT PRIMARY KEY, name TEXT NOT NULL, dept TEXT, doctor TEXT, email TEXT, code TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patient_links (client_id TEXT NOT NULL, hospital_id TEXT NOT NULL, name TEXT, birth TEXT, linked_at INTEGER NOT NULL, unlinked_at INTEGER NOT NULL DEFAULT 0, share_weekly INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (client_id, hospital_id));
CREATE INDEX IF NOT EXISTS idx_pl_hospital ON patient_links(hospital_id, unlinked_at);
CREATE TABLE IF NOT EXISTS session_notes (id TEXT PRIMARY KEY, counselor_id TEXT NOT NULL, counselor_name TEXT, client_id TEXT NOT NULL, client_name TEXT, booking_id TEXT, call_id TEXT, kind TEXT NOT NULL DEFAULT 'chat', ts INTEGER NOT NULL, summary TEXT NOT NULL, plan TEXT, risk TEXT NOT NULL DEFAULT 'none', homework TEXT, shared INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL, alerted_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_sn_client ON session_notes(client_id, ts);
CREATE INDEX IF NOT EXISTS idx_sn_counselor ON session_notes(counselor_id, ts);
CREATE TABLE IF NOT EXISTS doctor_feedback (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, hospital_name TEXT, doctor TEXT, client_id TEXT NOT NULL, note_id TEXT, to_who TEXT NOT NULL DEFAULT 'both', text TEXT NOT NULL, ts INTEGER NOT NULL, read_c INTEGER NOT NULL DEFAULT 0, read_p INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_df_client ON doctor_feedback(client_id, ts);
-- 의사 앱(doc.neurumind.com) · 주간 상태 요약 · 긴급 알림 (2026-09)
--  hospitals.email        담당의 메일 — 매직링크 로그인과 긴급 알림이 여기로 간다
--  patient_links.share_weekly  환자가 '주간 상태 요약 공유'에 동의했는지 (1 = 동의)
--  session_notes.alerted_at    긴급 메일을 보낸 시각 (한 기록당 한 번)
--  (기존 DB 에는 ALTER TABLE 로 추가: hospitals.email, patient_links.share_weekly, session_notes.alerted_at)
CREATE TABLE IF NOT EXISTS hospital_tokens (token TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, expires INTEGER NOT NULL, used_at INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS hospital_sessions (token TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, agent TEXT);
CREATE INDEX IF NOT EXISTS idx_hs_hospital ON hospital_sessions(hospital_id);
CREATE TABLE IF NOT EXISTS patient_weekly (client_id TEXT NOT NULL, week_key TEXT NOT NULL, mood_avg REAL, checkins INTEGER NOT NULL DEFAULT 0, missions INTEGER NOT NULL DEFAULT 0, nights INTEGER NOT NULL DEFAULT 0, records INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, headline TEXT, ts INTEGER NOT NULL, PRIMARY KEY (client_id, week_key));
-- 소개 페이지 테스트 코드 열람 등 가벼운 요청 제한용
CREATE TABLE IF NOT EXISTS rate_hits (key TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rate_key ON rate_hits(key, ts);
-- 대면상담 및 진료 — 내 주변 정신건강의학과 (2026-09)
--  clinics: 카카오 로컬에서 쌓이는 전국 정신과 + 운영자가 등록한 제휴 병원(partner=1, hospital_id 로 담당 병원과 연결)
--  clinic_sync: 전국 격자 수집 진행 상태
CREATE TABLE IF NOT EXISTS clinics (id TEXT PRIMARY KEY, kakao_id TEXT, name TEXT NOT NULL, kind TEXT, addr TEXT, road_addr TEXT, tel TEXT, lat REAL NOT NULL, lng REAL NOT NULL, url TEXT, partner INTEGER NOT NULL DEFAULT 0, hospital_id TEXT, note TEXT, tags TEXT, hours TEXT, active INTEGER NOT NULL DEFAULT 1, source TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_clinics_geo ON clinics(lat, lng);
CREATE INDEX IF NOT EXISTS idx_clinics_partner ON clinics(partner, active);
CREATE TABLE IF NOT EXISTS clinic_sync (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- clinics.hours: 요일별 진료시간 JSON {"1":["0900","1830"], … "7":일, "8":공휴일} (국립중앙의료원 병·의원 찾기 서비스)
--  (기존 DB: ALTER TABLE clinics ADD COLUMN hours TEXT)
-- 정산 채널 (2026-09) — 병원을 통해 등록한 내담자와 앱으로 그냥 온 내담자는 배분이 다르다.
--  bookings/calls.channel: 'hospital'(병원 90 / 앱 7 / PG 3) 또는 'app'(상담사 60 / 앱 37 / PG 3).
--  채널은 예약·통화가 만들어질 때 그 순간의 병원 연결로 정하고 이후 바뀌지 않는다(정산 분쟁 방지).
--  병원 채널은 앱이 상담사에게 지급하지 않는다 — 앱은 병원에 보내고, 병원이 상담사에게 보낸다.
--  hospital_payouts: 병원이 상담사에게 지급한 기록(병원이 직접 적는다. 미지급 분쟁·증빙 대비).
--  (기존 DB: ALTER TABLE bookings/calls ADD COLUMN channel TEXT NOT NULL DEFAULT 'app', hospital_id TEXT)
CREATE TABLE IF NOT EXISTS hospital_payouts (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, counselor_id TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT NOT NULL, amount INTEGER NOT NULL, paid_at INTEGER NOT NULL, memo TEXT, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_hp_hospital ON hospital_payouts(hospital_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_hp_ref ON hospital_payouts(ref_id);

-- 약관·개인정보·민감정보·국외이전 동의 기록 (js/consent.js → POST /api/consent)
-- items 가 'withdraw' 면 철회 기록. 분쟁 대비 증빙으로만 쓴다.
CREATE TABLE IF NOT EXISTS consents (client_id TEXT NOT NULL, ver TEXT NOT NULL, items TEXT NOT NULL, agent TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_consents_client ON consents(client_id, ts);

-- 상담소 소식(커뮤니티) — 상담소가 쓰는 글, 이용자의 좋아요·댓글 (community.js)
CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT, published INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts(published, hidden, created);
CREATE INDEX IF NOT EXISTS idx_posts_hosp ON posts(hospital_id, created);
CREATE TABLE IF NOT EXISTS post_likes (post_id TEXT NOT NULL, client_id TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (post_id, client_id));
CREATE TABLE IF NOT EXISTS post_comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, client_id TEXT NOT NULL, name TEXT, text TEXT NOT NULL, ts INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, by_hospital INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_pc_post ON post_comments(post_id, ts);
-- 상담소 페이지 프로필(소개·전화·주소·홈페이지·운영시간) — JSON 한 칸
-- ALTER TABLE hospitals ADD COLUMN profile TEXT;

-- 글 사진: images = JSON 배열(data:image/jpeg, 긴 변 640px·각 100KB 이하·4장까지), thumb = 첫 사진 240px 미리보기
-- ALTER TABLE posts ADD COLUMN images TEXT; ALTER TABLE posts ADD COLUMN thumb TEXT;

-- 상담사 소속 상담소 (hospitals.id). 있으면 그 상담사의 상담은 모두 상담소 채널로 정산하고 계좌를 받지 않는다
-- ALTER TABLE applications ADD COLUMN hospital_id TEXT; ALTER TABLE counselors ADD COLUMN hospital_id TEXT;

-- 소장 콘솔 PC 개편 (2026-09, doc/ · hospital.js). 적용 SQL 은 doc-migration2.sql 참고.
--  counselors.hospital_ok  소속 상담소가 소장 콘솔에서 승인했는지(1). 상담사가 소속을 고르거나 바꾸면 0 으로 돌아가고,
--                          승인 전에는 그 상담사의 상담이 앱 채널(상담사 계좌)로 정산된다 (market.js channelOf · rtc.js callChannel).
--                          상담소가 입점 신청을 직접 승인하면(/hospital/applications/approve) 곧바로 1.
--  hospitals.bank/bank_no/bank_holder  상담소 정산 계좌 — 앱이 상담소 몫(90%)을 보내는 곳. 없으면 콘솔에 빨간 안내.
--  hospitals.bizno         사업자등록번호(숫자 10자리). 소장이 한 번만 적을 수 있고 이후는 운영팀이 고친다.
-- ALTER TABLE counselors ADD COLUMN hospital_ok INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE hospitals ADD COLUMN bank TEXT; ALTER TABLE hospitals ADD COLUMN bank_no TEXT; ALTER TABLE hospitals ADD COLUMN bank_holder TEXT;
-- ALTER TABLE hospitals ADD COLUMN bizno TEXT;
-- 상담소 전용 내담자 메모 — 상담사·내담자에게 가지 않는다
CREATE TABLE IF NOT EXISTS hospital_notes (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, client_id TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_hn_client ON hospital_notes(hospital_id, client_id, ts);
-- 긴급 표시 회기 기록을 소장이 '확인했다'고 표시한 기록
CREATE TABLE IF NOT EXISTS hospital_urgent_ack (hospital_id TEXT NOT NULL, note_id TEXT NOT NULL, acked_at INTEGER NOT NULL, PRIMARY KEY (hospital_id, note_id));

-- 상담소(심리상담사업자) 직접 제휴 신청 — 승인하면 hospitals 로 옮긴다 (community.js /community/hospital-apply, /admin/hospital-apps)
CREATE TABLE IF NOT EXISTS hospital_apps (id TEXT PRIMARY KEY, client_id TEXT, name TEXT NOT NULL, doctor TEXT NOT NULL, email TEXT NOT NULL, tel TEXT, addr TEXT, bizno TEXT, dept TEXT, intro TEXT, hours TEXT, url TEXT, doc TEXT, status TEXT NOT NULL DEFAULT 'pending', ts INTEGER NOT NULL, decided INTEGER, reason TEXT, hospital_id TEXT);
CREATE INDEX IF NOT EXISTS idx_hospapps_status ON hospital_apps(status, ts);

-- 상담소 사업자등록번호 (제휴 승인 시 신청서에서 복사, 소장 콘솔에서 수정)
-- ALTER TABLE hospitals ADD COLUMN bizno TEXT;

-- 상담사 신청서 자격증 사진(필수, 앱에서 긴 변 1000px JPEG 로 줄임) — 운영자·소장이 심사할 때 본다
-- ALTER TABLE applications ADD COLUMN license_photo TEXT;
