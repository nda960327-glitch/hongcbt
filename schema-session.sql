-- 상담 한 사이클을 끝까지 닫는다
--
--  지금은 '예약'까지만 있고 그 뒤가 비어 있었다. 그래서
--  "이 상담이 실제로 진행됐는가"를 아무도 기록하지 않고,
--  정산의 근거가 없었다.
--
--  상태 흐름
--    confirmed ─(상담사)완료─▶ done ─(내담자)확인─▶ settleable ─(운영자)지급─▶ settled
--                    │                    └─(72시간 무응답)─▶ 자동 확정
--                    └─ 취소/거절/미진행 ─▶ 환불
--    done 이후 내담자가 이의를 제기하면 disputed — 정산이 멈춘다
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-session.sql

ALTER TABLE bookings ADD COLUMN done_at      INTEGER NOT NULL DEFAULT 0;  -- 상담사 완료 처리
ALTER TABLE bookings ADD COLUMN confirm_at   INTEGER NOT NULL DEFAULT 0;  -- 내담자 확인
ALTER TABLE bookings ADD COLUMN auto_at      INTEGER NOT NULL DEFAULT 0;  -- 자동 확정 예정 시각
ALTER TABLE bookings ADD COLUMN settled_at   INTEGER NOT NULL DEFAULT 0;  -- 정산 지급 완료
ALTER TABLE bookings ADD COLUMN refund       INTEGER NOT NULL DEFAULT 0;  -- 환불 금액
ALTER TABLE bookings ADD COLUMN refund_at    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN refund_why   TEXT;
ALTER TABLE bookings ADD COLUMN dispute      TEXT;                        -- 내담자 이의 사유
ALTER TABLE bookings ADD COLUMN dispute_at   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN cnote        TEXT;                        -- 상담사 메모(내담자 비공개)

CREATE INDEX IF NOT EXISTS idx_bk_settle ON bookings(settled_at, done_at);

-- 상담사가 내담자에게 내주는 숙제.
--  앱에는 homework.js 가 이미 '받을' 준비가 돼 있는데 보내는 쪽이 없었다.
CREATE TABLE IF NOT EXISTS homework (
  id           TEXT PRIMARY KEY,
  counselor_id TEXT NOT NULL,
  counselor    TEXT,
  client_id    TEXT NOT NULL,
  booking_id   TEXT,
  text         TEXT NOT NULL,
  why          TEXT,
  due_at       INTEGER NOT NULL DEFAULT 0,
  assigned_at  INTEGER NOT NULL,
  done_at      INTEGER NOT NULL DEFAULT 0,
  note         TEXT                        -- 내담자가 해보고 남긴 한 줄
);
CREATE INDEX IF NOT EXISTS idx_hw_client    ON homework(client_id, assigned_at);
CREATE INDEX IF NOT EXISTS idx_hw_counselor ON homework(counselor_id, assigned_at);
