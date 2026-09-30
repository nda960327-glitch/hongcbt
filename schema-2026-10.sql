-- 2026-10 출시 전 보강 — 칸 두 개와 색인 하나
--
--  ※ 한 번만 실행한다. SQLite 에는 ADD COLUMN IF NOT EXISTS 가 없어서
--    두 번 돌리면 '중복 칸(duplicate column)' 오류로 멈춘다 (이미 들어간 칸이니 무시해도 된다).
--    npx wrangler d1 execute hongcbt --remote --file=./schema-2026-10.sql
--
--  ※ 칸이 없어도 서버는 죽지 않는다 — 배포가 스키마보다 먼저 나가도 된다.
--    call_id 가 없으면: 통화 신호가 예전처럼 방 단위로만 돈다 (통화 시작 때 방 청소는 그대로 한다).
--    reminded_at 이 없으면: 예약 30분 전 알림이 조용히 꺼져 있다 (5분마다 같은 알림이 반복되는 것보다 낫다).

-- 통화 신호가 '어느 통화의 것인지'. 방 이름은 상담사·내담자 한 쌍마다 고정이라,
--  지난 통화의 bye/answer 가 남아 있으면 다시 건 전화가 그걸 집어 곧장 끊겼다.
--  폴링이 callId 로 거르면 끝난 통화의 신호는 새 통화에 섞이지 않는다 (rtc.js insertSignal).
ALTER TABLE rtc_signals ADD COLUMN call_id TEXT DEFAULT '';

-- 예약 30분 전 알림을 보낸 시각 (0 = 아직). 조건부 UPDATE 로 딱 한 번만 보낸다
--  (cbtproxy.worker.js remindBookings).
ALTER TABLE bookings ADD COLUMN reminded_at INTEGER NOT NULL DEFAULT 0;

-- 5분마다 도는 알림 조회(status='confirmed' AND when_ts 범위)가 표 전체를 훑지 않게
CREATE INDEX IF NOT EXISTS idx_bk_status_when ON bookings(status, when_ts);
