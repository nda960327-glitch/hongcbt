-- 남용 방어용 사용량 집계
--
--  Worker 의 /chat 은 인증이 없습니다. 주소는 앱 JS 안에 그대로 들어 있으니
--  누구나 긁어서 OpenAI 크레딧을 태울 수 있습니다. 실제로 이런 공개 프록시는
--  발견되면 하루 만에 수백 달러가 나갑니다.
--
--  완전한 인증(계정)은 이 앱의 '가입 없음' 원칙과 충돌하므로,
--  대신 세 겹으로 막습니다: IP · 기기 · 전체.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-usage.sql

CREATE TABLE IF NOT EXISTS usage (
  day    TEXT NOT NULL,        -- YYYY-MM-DD (UTC)
  kind   TEXT NOT NULL,        -- 'ip' | 'client' | 'all'
  key    TEXT NOT NULL,
  n      INTEGER NOT NULL DEFAULT 0,
  first  INTEGER NOT NULL,
  last   INTEGER NOT NULL,
  PRIMARY KEY (day, kind, key)
);
CREATE INDEX IF NOT EXISTS idx_usage_day ON usage(day, kind, n);

-- 차단 기록 — 어디서 얼마나 막혔는지 봐야 한도를 조절할 수 있다
CREATE TABLE IF NOT EXISTS blocks (
  id     TEXT PRIMARY KEY,
  day    TEXT NOT NULL,
  kind   TEXT NOT NULL,
  key    TEXT NOT NULL,
  n      INTEGER NOT NULL,
  ts     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_day ON blocks(day, ts);
