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
CREATE TABLE IF NOT EXISTS hospitals (id TEXT PRIMARY KEY, name TEXT NOT NULL, dept TEXT, doctor TEXT, code TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patient_links (client_id TEXT NOT NULL, hospital_id TEXT NOT NULL, name TEXT, birth TEXT, linked_at INTEGER NOT NULL, unlinked_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (client_id, hospital_id));
CREATE INDEX IF NOT EXISTS idx_pl_hospital ON patient_links(hospital_id, unlinked_at);
CREATE TABLE IF NOT EXISTS session_notes (id TEXT PRIMARY KEY, counselor_id TEXT NOT NULL, counselor_name TEXT, client_id TEXT NOT NULL, client_name TEXT, booking_id TEXT, call_id TEXT, kind TEXT NOT NULL DEFAULT 'chat', ts INTEGER NOT NULL, summary TEXT NOT NULL, plan TEXT, risk TEXT NOT NULL DEFAULT 'none', homework TEXT, shared INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sn_client ON session_notes(client_id, ts);
CREATE INDEX IF NOT EXISTS idx_sn_counselor ON session_notes(counselor_id, ts);
CREATE TABLE IF NOT EXISTS doctor_feedback (id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL, hospital_name TEXT, doctor TEXT, client_id TEXT NOT NULL, note_id TEXT, to_who TEXT NOT NULL DEFAULT 'both', text TEXT NOT NULL, ts INTEGER NOT NULL, read_c INTEGER NOT NULL DEFAULT 0, read_p INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_df_client ON doctor_feedback(client_id, ts);
