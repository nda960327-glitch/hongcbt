-- ============================================================================
--  내담자 소유 기록 (clientKey / TOFU)
--
--  내담자에게는 계정이 없다. 기기가 만든 clientId 가 곧 열쇠였는데,
--  그 값은 상담사 화면 등에 노출돼 IDOR(남의 상담 기록 열람)로 이어졌다.
--
--  이제 서버가 clientId 를 HMAC 서명한 clientKey 를 발급하고(결정적 함수라
--  언제든 재계산 가능), 개인정보 읽기 경로에서 그 서명을 함께 요구한다.
--  이 표는 clientKey 를 저장하지 않는다 — '누가 먼저 claim 해서 주인이
--  됐는가(TOFU: Trust On First Use)'만 기록한다. 재발급 거부가 보안의 핵심.
--
--  하위호환: 이 표가 비어 있는 동안(배포 직후·SQL 미적용)에는 어떤 clientId 도
--  claim 되지 않은 상태이므로 검증이 유예된다. 옛 앱은 그대로 동작하고,
--  기기가 앱을 한 번 열어 claim 하면 그때부터 그 기기만 접근할 수 있다.
--
--  실행: wrangler d1 execute <DB> --file schema-clients.sql
--    (원격 적용은 배포 담당이 --remote 로. 이 파일은 스키마 정의만 담는다.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,      -- clientId (u_...)
  claimed_at INTEGER NOT NULL       -- 최초 claim 시각(ms) — 이 기기가 주인이 된 때
);
