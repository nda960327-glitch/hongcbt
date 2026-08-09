-- 연락처 유출 시도 기록
--  채팅에서 전화번호·카톡ID·링크가 오가면 서버가 가리고, 그 사실을 남긴다.
--  한두 번은 실수일 수 있지만 반복되면 의도적인 이탈 유도다.
--  내용 자체는 저장하지 않는다 — 몇 번 시도했는지만 센다.
CREATE TABLE IF NOT EXISTS contact_attempts (
  id           TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  client_id    TEXT NOT NULL,
  sender       TEXT NOT NULL,      -- 'client' | 'counselor'
  n            INTEGER NOT NULL,   -- 그 메시지에서 걸린 개수
  ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ct_counselor ON contact_attempts(counselor_id, ts);
