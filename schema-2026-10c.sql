-- 2026-10 출시 전 보안 수정 (소장 콘솔 열쇠 분리 · 구글 짝 번호 로그인 확인 번호)
--
--  적용: 한 줄씩 따로 실행하세요. 이미 있는 칸이면 'duplicate column name' 오류가 나는데,
--        그 줄만 건너뛰면 됩니다 (D1 은 ADD COLUMN IF NOT EXISTS 를 모른다).
--    npx wrangler d1 execute <DB이름> --remote --command "ALTER TABLE hospitals ADD COLUMN admin_code TEXT"
--
--  ⚠ Worker 를 배포하기 '전에' 적용할 것:
--    · oauth_handoff.pc / tries 가 없으면 스토어 앱 구글 로그인이 '점검 중' 화면에서 멈춘다(일부러 닫힌 쪽으로 실패).
--    · hospitals.admin_code 가 없으면 소장 콘솔 코드 로그인이 닫힌다(이메일 링크 로그인은 그대로 된다).

-- ── 소장 관리 코드 ──
--  예전에는 hospitals.code(H-XXXX-XXXX) 하나가 '내담자 연결 코드'이자 '소장 콘솔 로그인'이었다.
--  상담소가 이 코드를 환자에게 나눠주므로, 환자 누구나 콘솔에 들어가 그 상담소 내담자 전원의
--  기록을 볼 수 있었다. 이제 콘솔은 이메일 매직링크 또는 admin_code(HA-XXXX-XXXX-XXXX-XXXX)로만 연다.
--  기존 상담소는 admin_code 가 비어 있다 → 이메일 링크로 들어오거나, 운영자 콘솔에서 '소장 관리 코드 발급'.
ALTER TABLE hospitals ADD COLUMN admin_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitals_admin_code ON hospitals(admin_code) WHERE admin_code IS NOT NULL;

-- ── 구글 로그인 짝 번호 ──
--  pair 는 코드(oauth.js)가 이미 쓰고 있었지만 스키마 파일에 없던 칸이다. 운영 DB 에 이미 있으면 건너뛴다.
ALTER TABLE oauth_state ADD COLUMN pair TEXT;
ALTER TABLE oauth_handoff ADD COLUMN pair TEXT;
-- 새 칸: 6자리 확인 번호와 오답 횟수
ALTER TABLE oauth_handoff ADD COLUMN pc TEXT;
ALTER TABLE oauth_handoff ADD COLUMN tries INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_handoff_pair ON oauth_handoff(pair);
