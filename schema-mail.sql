-- 메일 발송 기록
--  매직링크가 조용히 실패하면 상담사는 로그인을 못 하는데 아무도 모른다.
--  주소는 통째로 남기지 않는다 — 로그가 곧 연락처 목록이 되면 안 된다.
CREATE TABLE IF NOT EXISTS mail_log (
  id     TEXT PRIMARY KEY,
  addr   TEXT NOT NULL,        -- n*********@naver.com 형태로만
  ok     INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  detail TEXT,
  ts     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maillog_ts ON mail_log(ts);
