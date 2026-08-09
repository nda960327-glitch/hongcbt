-- 앱 내 음성통화 (WebRTC) 시그널링
--
--  전화(tel:)를 쓰면 내담자 발신번호가 상담사 폰에 그대로 찍힌다.
--  안심번호를 붙여도 계약·비용이 들고, 결국 '번호'가 존재하는 한 새어 나간다.
--  번호 자체를 없앤다 — 양쪽 다 앱/브라우저에서 붙는다.
--
--  음성은 P2P 로 직접 흐른다. 서버는 '처음 만나는 것'만 도와주고
--  대화 내용은 지나가지 않는다. 그래서 여기 남는 건 연결 정보뿐이다.
--
--  적용:
--    wrangler d1 execute hongcbt --remote --file=./schema-rtc.sql

-- 주고받는 신호(offer/answer/ICE). 통화가 붙으면 곧 지운다.
CREATE TABLE IF NOT EXISTS rtc_signals (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  room    TEXT NOT NULL,
  sender  TEXT NOT NULL,          -- 'client' | 'counselor'
  kind    TEXT NOT NULL,          -- 'offer' | 'answer' | 'ice' | 'bye'
  payload TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rtc_room ON rtc_signals(room, seq);

-- 통화 기록. 과금은 '실제로 연결된 시간'으로만 한다 —
--  전화가 울리기만 한 시간에 돈을 받으면 안 된다.
CREATE TABLE IF NOT EXISTS calls (
  id            TEXT PRIMARY KEY,
  room          TEXT NOT NULL,
  counselor_id  TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  booking_id    TEXT,
  rate          INTEGER NOT NULL DEFAULT 0,   -- 30초당 캐시 (0이면 예약 회기권)
  ring_at       INTEGER NOT NULL,             -- 건 시각
  connect_at    INTEGER NOT NULL DEFAULT 0,   -- 실제로 붙은 시각 (과금 시작점)
  end_at        INTEGER NOT NULL DEFAULT 0,
  end_by        TEXT,                         -- 'client'|'counselor'|'timeout'|'failed'
  billed        INTEGER NOT NULL DEFAULT 0    -- 청구한 캐시
);
CREATE INDEX IF NOT EXISTS idx_calls_room ON calls(room);
CREATE INDEX IF NOT EXISTS idx_calls_counselor ON calls(counselor_id, ring_at);
