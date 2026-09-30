-- 소셜 로그인 (카카오·네이버·구글)
--  '신원 확인'만 한다. 대화·검사·리포트는 여전히 기기 안에만 있고
--  여기로 올라오지 않는다. 그래서 이 표에는 상담 내용이 한 줄도 없다.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,            -- kakao | naver | google
  provider_uid TEXT NOT NULL,            -- 그 서비스에서의 고유 번호
  email        TEXT,                     -- 동의한 경우에만 들어온다
  nickname     TEXT,
  created      INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL DEFAULT 0
);
-- 같은 사람이 같은 서비스로 다시 로그인하면 새 계정이 생기면 안 된다
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_uid);

CREATE TABLE IF NOT EXISTS user_sessions (
  token     TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  expires   INTEGER NOT NULL,
  created   INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_usess_user ON user_sessions(user_id);

-- CSRF 방어용 state. 우리가 시작시킨 로그인인지 확인하는 데만 쓴다.
CREATE TABLE IF NOT EXISTS oauth_state (
  state    TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  back     TEXT,                        -- 끝나고 돌아갈 앱 주소
  expires  INTEGER NOT NULL,
  pair     TEXT                         -- 스토어 앱 '짝 번호' (없으면 웹 로그인)
);

-- 로그인 성공 뒤 앱으로 돌아갈 때 쓰는 1회용 교환권.
--  세션 토큰을 주소창에 실어 보내면 방문기록·리퍼러에 그대로 남는다.
--  대신 60초짜리 교환권을 주고, 앱이 POST 로 바꿔 가게 한다.
CREATE TABLE IF NOT EXISTS oauth_handoff (
  code    TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL,
  pair    TEXT,                         -- 스토어 앱 짝 번호 — 확인 번호를 맞히면 NULL 로 떼어 낸다
  pc      TEXT,                         -- 6자리 확인 번호 (로그인한 사람의 브라우저에만 보인다)
  tries   INTEGER NOT NULL DEFAULT 0    -- 확인 번호 오답 횟수 (5번이면 폐기)
);
CREATE INDEX IF NOT EXISTS idx_handoff_pair ON oauth_handoff(pair);
-- 기존 DB 는 schema-2026-10c.sql 의 ALTER 로 칸을 더한다.
