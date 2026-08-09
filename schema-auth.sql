-- 상담사 로그인을 '발급 코드' → '이메일 매직링크' 로 올리는 마이그레이션
--
--  왜 바꾸나: 코드 한 줄이 곧 열쇠라 새면 그 상담사 수신함이 통째로 열린다.
--  상담사가 1,000명이 되면 코드를 카톡으로 돌리는 방식은 반드시 샌다.
--  이메일 링크는 (1) 본인 메일함을 거치고 (2) 15분이면 죽고 (3) 1회용이다.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-auth.sql

-- 상담사 이메일 (로그인 식별자)
ALTER TABLE counselors ADD COLUMN email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_counselor_email ON counselors(email);

-- 로그인 링크 토큰 — 15분, 1회용
CREATE TABLE IF NOT EXISTS login_tokens (
  token        TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  expires      INTEGER NOT NULL,
  used_at      INTEGER NOT NULL DEFAULT 0,
  created      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lt_expires ON login_tokens(expires);

-- 로그인 세션 — 30일. 기기마다 하나씩 생기고 개별 해지된다.
CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  expires      INTEGER NOT NULL,
  created      INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL DEFAULT 0,
  agent        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sess_counselor ON sessions(counselor_id);
CREATE INDEX IF NOT EXISTS idx_sess_expires   ON sessions(expires);

-- 링크 요청 기록 — 이메일 폭탄·주소 탐색 방지
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL,
  ts    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_la_email ON login_attempts(email, ts);
