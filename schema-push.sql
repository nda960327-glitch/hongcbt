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
  fail_count   INTEGER DEFAULT 0,
  kind         TEXT DEFAULT 'web'    -- web | fcm (아래 설명 참고)
);
CREATE INDEX IF NOT EXISTS idx_push_counselor ON push_subs(counselor_id);

-- ── 2025.08 추가: 스토어 앱은 FCM 으로 받는다 ────────────────────────────
--  Capacitor 앱은 원격 주소를 띄우는 웹뷰라 서비스워커가 등록되지 않는다.
--  서비스워커가 없으면 웹푸시를 받을 곳이 없다 — 앱만 FCM 으로 옮긴다.
--  kind = 'web'  → endpoint 는 푸시 서비스 주소 (기존 그대로)
--  kind = 'fcm'  → endpoint 자리에 기기 토큰이 들어간다
--
--  ※ 이미 만들어진 테이블에는 아래 한 줄을 한 번만 실행하면 된다.
--    (기존 행은 DEFAULT 'web' 이 되어 지금까지와 똑같이 동작한다)
--
--    npx wrangler d1 execute <DB이름> --remote --command "ALTER TABLE push_subs ADD COLUMN kind TEXT DEFAULT 'web'"
--  SQLite 에는 ADD COLUMN IF NOT EXISTS 가 없어서 이 파일에 그냥 넣어두면
--  다음번에 이 파일을 통째로 다시 돌릴 때 '중복 칸' 오류로 멈춘다.
--  그래서 실행문이 아니라 주석으로 둔다 — 위 명령을 한 번만 손으로 돌릴 것.
--
--  ALTER TABLE push_subs ADD COLUMN kind TEXT DEFAULT 'web';
--
--  ※ 칸이 없어도 서버는 죽지 않는다(push.js 가 kind 없는 조회로 되돌아간다).
--    다만 그 전까지는 앱의 FCM 구독이 저장되지 않는다 — 웹푸시만 나간다.
