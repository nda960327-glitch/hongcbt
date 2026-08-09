-- 우렁의사 상담사 마켓 — Cloudflare D1 스키마
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
