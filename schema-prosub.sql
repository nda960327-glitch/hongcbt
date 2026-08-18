-- 상담사 구독 — "상담료는 전액 상담사 몫, 플랫폼은 구독료로 산다"
--
--  왜 바꾸나 (2026-08-18 수익 구조 개편):
--   전에는 상담료를 70/0/3/27 로 쪼개 플랫폼 몫 27% 를 가져갔다.
--   상담사 입장에서는 상담을 많이 할수록 떼이는 돈이 커지고, 우리 입장에서도
--   '상담이 일어나야만' 수익이 생기는 구조라 서로 좋을 게 없었다.
--
--   그래서 분배를 폐지한다. 상담료는 PG 수수료 3% 만 빼고 97% 가 상담사 몫이고
--   (market.js 의 SPLIT), 플랫폼 수익은 상담사 월 구독료로 옮긴다.
--     · 월 99,000원 (market.js 의 PRO_SUB_PRICE)
--     · 등록 승인 후 첫 30일 무료 (PRO_SUB_FREE_DAYS)
--
--   구독이 끊기면 '새로 들어오는 일'만 막는다 — 매칭 목록 노출·신규 예약·
--   바로상담 수신. 이미 확정된 예약·정산·로그인은 그대로 돌아간다.
--   돈 받을 것 못 받게 만드는 잠금은 사고이지 정책이 아니다.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-prosub.sql
--
--  ※ 이미 있는 컬럼에 다시 ALTER 하면 "duplicate column name" 으로 멈춘다.
--    그때는 그 줄만 빼고 다시 돌리면 된다 (D1 은 IF NOT EXISTS 를 지원하지 않는다).

ALTER TABLE counselors ADD COLUMN sub_until   INTEGER NOT NULL DEFAULT 0;  -- 구독 만료 시각(ms). 0 = 구독 없음
ALTER TABLE counselors ADD COLUMN sub_started INTEGER NOT NULL DEFAULT 0;  -- 최초 구독 시작 시각(ms). 무료 기간 시작점

-- 만료 임박·만료된 상담사를 운영자가 훑는다 (/stats 의 구독 현황, ops 상담사 목록)
CREATE INDEX IF NOT EXISTS idx_counselors_sub ON counselors(sub_until);

-- 구독 결제 기록.
--  method 로 '어떤 경로로 연장됐는지'를 남긴다:
--    admin  운영자 수동 연장 (/admin/counselors/sub) — 실결제 연동 전까지는 이것뿐
--    play   Google Play 인앱 구독 (/pro/sub/confirm, 영수증 검증 후) — 아직 미연동
--    free   승인 직후 첫 달 무료 부여
--  amount 는 실제로 청구된 금액이다. 무료 부여는 0 으로 남는다 —
--   '공짜로 준 달'과 '돈 받은 달'을 나중에 구분할 수 없으면 매출 집계가 거짓말을 한다.
CREATE TABLE IF NOT EXISTS pro_sub_orders (
  id           TEXT PRIMARY KEY,                -- ps_…
  counselor_id TEXT NOT NULL,
  amount       INTEGER NOT NULL DEFAULT 0,      -- 청구 금액(원). 무료 부여는 0
  months       INTEGER NOT NULL DEFAULT 1,      -- 연장 개월 수
  method       TEXT NOT NULL DEFAULT '',        -- admin | play | free
  memo         TEXT NOT NULL DEFAULT '',        -- 운영 메모 (입금 확인 등)
  created      INTEGER NOT NULL                 -- 기록 시각(ms)
);

-- 상담사별 구독 이력 (ops 상세 화면) · 전체 최신순 (월 구독 매출 집계)
CREATE INDEX IF NOT EXISTS idx_prosub_counselor ON pro_sub_orders(counselor_id, created);
CREATE INDEX IF NOT EXISTS idx_prosub_created   ON pro_sub_orders(created);


-- ── 기존 상담사 마이그레이션 (배포 단계에서 수동 실행) ────────────────────
--
--  위의 ALTER 만 돌리면 이미 등록된 상담사 전원의 sub_until 이 0 이 된다.
--  그 순간 매칭 목록이 통째로 비고, 예약도 바로상담도 전부 409 로 막힌다.
--  그러니 컬럼을 추가한 직후, 반드시 아래 UPDATE 로 유예 기간을 준다.
--
--  아래 두 줄의 <배포시각+30일> / <배포시각> 을 실제 epoch ms 로 바꿔서 실행한다.
--   (값 구하기: node -e "const t=Date.now();console.log(t+30*86400000, t)")
--
--    wrangler d1 execute hongcbt --remote --command \
--      "UPDATE counselors SET sub_until = <배포시각+30일>, sub_started = <배포시각> WHERE COALESCE(sub_until,0) = 0"
--
--  30일을 주는 이유: 기존 상담사에게도 '개편 안내 → 결제' 사이의 시간이 필요하다.
--   개편했다고 다음 날부터 명부에서 지워버리면 그건 통보가 아니라 사고다.
--
--  ※ SQLite 에는 Date.now() 가 없다. strftime('%s','now')*1000 으로도 되지만
--    시각을 눈으로 확인하고 박아 넣는 편이 안전하다 (되돌릴 수 없는 UPDATE 다).
--    굳이 SQL 안에서 계산하려면:
--      UPDATE counselors
--         SET sub_until   = CAST(strftime('%s','now') AS INTEGER) * 1000 + 30*86400000,
--             sub_started = CAST(strftime('%s','now') AS INTEGER) * 1000
--       WHERE COALESCE(sub_until,0) = 0;
--
--  확인 (실행 후):
--    wrangler d1 execute hongcbt --remote --command \
--      "SELECT id, name, sub_until FROM counselors WHERE active = 1 ORDER BY sub_until"
