-- 웹 푸시 구독
--  한 상담사가 폰·태블릿·PC 를 같이 쓸 수 있으므로 endpoint 가 기본키다.
--  p256dh/auth 는 지금은 안 쓴다(본문 없는 깨우기 푸시).
--  나중에 본문을 실을 때 필요해서 받아만 둔다.
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint     TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  p256dh       TEXT DEFAULT '',
  auth         TEXT DEFAULT '',
  created_at   INTEGER NOT NULL,
  fail_count   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_counselor ON push_subs(counselor_id);
