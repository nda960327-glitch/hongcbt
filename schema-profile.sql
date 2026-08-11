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

-- ═══════════════════════════════════════════════════════════════════════
--  2차 (2026-08-11) — 얼굴과 좌표
--
--  ⚠ 이 파일을 처음부터 다시 돌리면 위쪽 ALTER 에서 'duplicate column name'
--    으로 멈춘다(D1 은 첫 오류에서 배치를 끊는다). 위쪽을 이미 적용한
--    환경이라면 아래 다섯 줄만 골라 실행할 것:
--      wrangler d1 execute hongcbt --remote --command "ALTER TABLE counselors ADD COLUMN photo TEXT NOT NULL DEFAULT ''"
--    한 줄씩 따로 돌린다. 중간에 실패하면 실패한 그 줄부터 다시 하면 된다
--    (이미 들어간 컬럼은 duplicate 오류가 나므로 건너뛰어도 안전하다).
-- ═══════════════════════════════════════════════════════════════════════

-- 프로필 사진. 데이터URL(image/jpeg) 을 그대로 넣는다.
--  왜 R2·이미지 CDN 이 아니라 DB 냐: 상담사는 최대 수천 명이고 사진은 한 장씩이다.
--  긴 변 512px·품질 0.8 이면 40~60KB 라 전부 합쳐도 수백 MB 를 넘지 않는다.
--  버킷·서명 URL·만료를 관리하는 비용이 이득보다 크다. 서버에서 70KB 로 막는다.
ALTER TABLE counselors ADD COLUMN photo TEXT NOT NULL DEFAULT '';

-- 상세주소(층·호). 도로명 주소와 나눠 둔다 —
--  지오코딩에 "3층 302호"가 섞여 들어가면 좌표를 못 찾는다.
--  내담자에게는 둘을 합쳐서 한 줄로 보여준다.
ALTER TABLE counselors ADD COLUMN addr_detail TEXT NOT NULL DEFAULT '';

-- 주소의 좌표. 내담자 카드의 '내 위치에서 ○km' 가 이 값으로 계산된다.
--  0 은 '모른다'는 뜻이다. 앱의 calcDistance 는 0/빈값이면 거리를 안 그리고
--  주소 글자를 대신 보여준다 — 그래서 0 이어도 화면이 깨지지 않는다.
--  (전에는 이 값이 아예 없어서 '내 위치에서 null km' 가 찍혔다)
ALTER TABLE counselors ADD COLUMN lat    REAL NOT NULL DEFAULT 0;
ALTER TABLE counselors ADD COLUMN lng    REAL NOT NULL DEFAULT 0;
-- 좌표를 마지막으로 구한 시각. 0 이면 아직 한 번도 성공하지 못했다는 뜻이라,
--  운영자가 '이 사람은 왜 거리가 안 뜨지'를 추측하지 않아도 된다.
ALTER TABLE counselors ADD COLUMN geo_at INTEGER NOT NULL DEFAULT 0;

--  연락처 컬럼은 새로 만들지 않는다 — 맨 위의 tel 이 이미 그 칸이다.
--  phone 을 따로 두면 상담사가 프로 앱에서 고친 번호와 운영자가 보는 번호가
--  달라진다. 값이 두 곳에 있으면 반드시 어긋난다.
