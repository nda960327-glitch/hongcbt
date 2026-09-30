-- 2026-10 예약·정산 결함 수정 (출시 전 점검)
--
--  ① 상담소 몫 지급 시각을 따로 둔다 — hospital_settled_at
--     소개(referral) 채널 한 건은 '상담사 70/55'와 '상담소 20'을 각각 지급하는데,
--     지금까지는 settled_at 한 칸에 같이 찍어서 한쪽만 보내도 다른 쪽이 정산 목록에서 사라졌다.
--     소속(hospital) 채널은 상담사 몫이 없으므로 상담소에 보낼 때 settled_at 도 함께 찍힌다(market.js /settle/pay).
--  ② 이중 예약 최후 방어선 — 같은 상담사·같은 시각의 살아 있는 예약은 한 건만.
--     (앞선 방어는 market.js /bookings 의 조건부 INSERT — 30분 겹침까지 거기서 막는다)
--  ③ 새 예약 상태 'late_cancel' — 24시간 이내 취소. 내담자는 50% 를 돌려받고 나머지 50% 는 정산된다.
--     칸 추가는 없다(status 는 TEXT). refund = 돌려준 금액.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-2026-10b.sql
--  ALTER 는 이미 칸이 있으면 오류가 난다 — 그 줄만 건너뛰고 나머지를 실행하면 된다.
--  코드는 칸이 없어도 예전 방식(settled_at 하나)으로 돌아간다.

ALTER TABLE bookings ADD COLUMN hospital_settled_at INTEGER NOT NULL DEFAULT 0;  -- 상담소 몫 지급 완료
ALTER TABLE calls    ADD COLUMN hospital_settled_at INTEGER NOT NULL DEFAULT 0;

-- 지난 지급 기록 옮기기: 예전에는 settled_at 하나가 '상담사·상담소 둘 다 보냄'을 뜻했다.
--  이걸 안 하면 이미 보낸 상담소 몫이 정산 목록에 다시 올라온다.
UPDATE bookings SET hospital_settled_at = settled_at
 WHERE settled_at > 0 AND hospital_settled_at = 0 AND channel IN ('hospital', 'referral');
UPDATE calls SET hospital_settled_at = settled_at
 WHERE COALESCE(settled_at, 0) > 0 AND hospital_settled_at = 0 AND channel IN ('hospital', 'referral');

-- 이중 예약 방지 인덱스. 만들기 전에 이미 겹친 행이 있는지 먼저 본다 — 있으면 인덱스 생성이 실패한다:
--   SELECT counselor_id, when_ts, COUNT(*) n FROM bookings
--    WHERE status IN ('confirmed','done','disputed') GROUP BY counselor_id, when_ts HAVING n > 1;
--  나오면 운영자가 한쪽을 환불·거절 처리한 뒤 다시 실행한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bk_slot ON bookings(counselor_id, when_ts)
  WHERE status IN ('confirmed', 'done', 'disputed');

-- 정산 목록(상담소 몫)용
CREATE INDEX IF NOT EXISTS idx_bk_hsettle ON bookings(hospital_settled_at, channel);
