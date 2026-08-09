-- 상담사 입점 신청을 서버로
--
--  지금은 신청서가 신청한 기기의 localStorage 에만 있습니다. 그래서
--  상담사가 A폰에서 신청하고 운영자가 B폰에서 콘솔을 열면 아무것도 없습니다.
--  "다른 핸드폰에서 등록해도 운영자 콘솔에 안 올라온다" 가 정확히 이 문제입니다.
--
--  민감정보가 들어갑니다 — 자격, 소속, 연락처, 그리고 정산 계좌.
--  계좌는 승인 전까지도 마스킹해서만 돌려줍니다.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-apply.sql

CREATE TABLE IF NOT EXISTS applications (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,          -- 신청한 기기 (본인 조회용)
  name        TEXT NOT NULL,
  license     TEXT,
  career      TEXT,
  price       INTEGER NOT NULL DEFAULT 0,
  intro       TEXT,
  hospital    TEXT,
  addr        TEXT,
  tel         TEXT,
  email       TEXT,
  tags        TEXT,                   -- JSON 배열
  photo       TEXT,                   -- data URI (256px 리사이즈본)
  bank        TEXT,
  bank_no     TEXT,
  bank_holder TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|delisted
  reject_why  TEXT,
  counselor_id TEXT,                  -- 승인되면 만들어진 상담사 id
  ts          INTEGER NOT NULL,
  decided_at  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_app_client ON applications(client_id, ts);
CREATE INDEX IF NOT EXISTS idx_app_status ON applications(status, ts);
