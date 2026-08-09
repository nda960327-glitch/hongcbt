-- 상담사가 스스로 관리해야 하는 것들
--
--  병원을 옮기고, 상담료를 바꾸고, 계좌가 바뀌고, 이번 주는 수요일에 못 받는다 —
--  전부 실제로 일어나는 일인데 지금은 고칠 방법이 없었다.
--  운영자에게 매번 전화하게 만들면 상담사 1,000명은 감당이 안 된다.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-profile.sql

-- 프로필
ALTER TABLE counselors ADD COLUMN tel         TEXT;
ALTER TABLE counselors ADD COLUMN addr        TEXT;
ALTER TABLE counselors ADD COLUMN intro       TEXT;
ALTER TABLE counselors ADD COLUMN tags        TEXT;      -- JSON 배열 ["우울증","불안장애"]
ALTER TABLE counselors ADD COLUMN price       INTEGER NOT NULL DEFAULT 40000;  -- 30분 상담료
ALTER TABLE counselors ADD COLUMN call_rate   INTEGER NOT NULL DEFAULT 0;      -- 바로상담 30초당(0=자동)
ALTER TABLE counselors ADD COLUMN license     TEXT;      -- 자격
ALTER TABLE counselors ADD COLUMN updated     INTEGER NOT NULL DEFAULT 0;

-- 예약 가능 시간. JSON: {"1":["10:00","11:00"],"3":[...]}  (0=일 … 6=토)
ALTER TABLE counselors ADD COLUMN slots       TEXT;
-- 특정 날짜 휴무. JSON 배열 ["2026-08-15","2026-09-01"]
ALTER TABLE counselors ADD COLUMN offdays     TEXT;

-- 정산 계좌 — 민감정보.
--  본인과 운영자만 볼 수 있고, 목록·앱 어디에도 노출하지 않는다.
--  계좌번호는 뒤 4자리만 남기고 가려서 돌려준다.
ALTER TABLE counselors ADD COLUMN bank        TEXT;
ALTER TABLE counselors ADD COLUMN bank_no     TEXT;
ALTER TABLE counselors ADD COLUMN bank_holder TEXT;

-- 계좌가 바뀐 이력 (정산 사고 시 추적용 · 번호는 마스킹해서만 남긴다)
CREATE TABLE IF NOT EXISTS payout_changes (
  id           TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  masked       TEXT NOT NULL,
  ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pc_counselor ON payout_changes(counselor_id, ts);
