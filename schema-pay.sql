-- 우렁 캐시 충전 주문 (토스페이먼츠)
--
--  왜 주문을 서버에 남기나:
--   승인은 반드시 서버가 한다. 클라이언트가 보내온 금액을 그대로 토스에
--   넘기면, 5,000원짜리 결제창을 띄워 놓고 300,000원으로 승인을 요청하는
--   위조가 가능하다. /pay/ready 때 적어 둔 amount 와 반드시 대조한다.
--
--   지급할 캐시(보너스 포함)도 여기에 미리 적는다. 승인이 끝난 뒤
--   "얼마 주기로 했더라"를 클라이언트에게 물어보면 안 되기 때문이다.
--
--  status 흐름:  pending → paid   (승인 성공, 캐시 지급)
--                pending → failed (승인 거절 · 사용자가 결제창에서 실패)
--   pending 으로 남은 것은 '결제창을 열었지만 돌아오지 않은' 주문이다.
--   돈이 빠져나가지 않았으므로 지워도 되지만, 결제창이 죽었을 때
--   그 흔적이 유일한 단서라 남겨 둔다.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-pay.sql

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,                  -- orderId. 토스에 그대로 보낸다 (6~64자 [A-Za-z0-9_-])
  client_id   TEXT NOT NULL,                     -- 기기 식별자. 내담자는 계정이 없다
  amount      INTEGER NOT NULL,                  -- 실제 결제 금액(원)
  cash        INTEGER NOT NULL,                  -- 지급할 캐시 (보너스 포함)
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | failed
  payment_key TEXT NOT NULL DEFAULT '',          -- 토스 결제 키 (환불·조회에 필요)
  method      TEXT NOT NULL DEFAULT '',          -- 카드 · 간편결제 …
  fail        TEXT NOT NULL DEFAULT '',          -- 승인 거절 사유
  created     INTEGER NOT NULL,                  -- ready 시각 (ms)
  paid_at     INTEGER NOT NULL DEFAULT 0         -- 승인 시각 (ms)
);

-- 내 충전 내역 (/pay/history) — 기기별 최신순
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id, created);
-- 운영자 결제 내역 (/admin/payments) — 전체 최신순 · 오늘 매출 집계
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created);
CREATE INDEX IF NOT EXISTS idx_orders_paid ON orders(status, paid_at);
