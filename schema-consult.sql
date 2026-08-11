-- 상담 세션 — "통화는 무료, 상담만 유료, 시간은 서버가 잰다"
--
--  왜 바꾸나:
--   전에는 내담자 폰의 30초 setInterval 이 요금을 굴렸다. 화면이 잠기면
--   모바일 브라우저가 타이머를 얼려버려서, 3분 55초를 통화하고도 0원으로
--   끝난 실사고가 있었다 (calls.id = call_msob0myqq0gpt2, billed = 0).
--   반대 방향도 나쁘다 — 잘못 걸린 전화·안부 전화까지 연결만 되면 돈이 나갔다.
--
--  그래서 과금의 근거를 통화(connect_at)에서 '상담 세션'으로 옮긴다.
--   상담사가 [상담 시작]을 누르고 내담자가 동의한 순간부터가 유료 구간이고,
--   그 시각은 서버가 찍는다. 폰이 잠기든 앱이 죽든 서버 시계는 멈추지 않는다.
--
--  요금 = ceil((consult_end - consult_start) / 30초) × consult_rate
--   consult_rate 를 통화마다 박아 두는 이유: 상담사가 나중에 상담료를 올려도
--   지나간 상담의 요금이 따라 올라가면 안 되기 때문이다(캐시된 값).
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-consult.sql
--
--  ※ 이미 있는 컬럼에 다시 ALTER 하면 "duplicate column name" 으로 멈춘다.
--    그때는 그 줄만 빼고 다시 돌리면 된다 (D1 은 IF NOT EXISTS 를 지원하지 않는다).

ALTER TABLE calls ADD COLUMN consult_start INTEGER NOT NULL DEFAULT 0;  -- 내담자가 동의한 시각(0=상담 없음)
ALTER TABLE calls ADD COLUMN consult_end   INTEGER NOT NULL DEFAULT 0;  -- 마감 시각(0=아직 진행 중)
ALTER TABLE calls ADD COLUMN consult_rate  INTEGER NOT NULL DEFAULT 0;  -- 30초당 캐시 (시작 시점의 요금을 박아 둠)

-- 내담자 앱이 '놓친 차감'을 복구할 때 client_id + end_at 으로 훑는다
CREATE INDEX IF NOT EXISTS idx_calls_client ON calls(client_id, end_at);
