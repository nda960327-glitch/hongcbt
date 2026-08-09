-- 계정 동기화 저장소
--
--  대화 원문은 여기에 오지 않는다. 올라오는 것은 '결과물'뿐이다 —
--  장기기억 요약, 마음 리포트, 검사 점수, 레벨·아이템, 진행 상황.
--  무엇을 올릴지는 서버가 정하지 않고 클라이언트의 흰 목록(js/sync.js)이
--  정하며, 서버도 같은 목록으로 한 번 더 거른다. 한쪽이 뚫려도 안 샌다.
--
--  값은 통째로 암호화해서 넣는다(AES-GCM). D1 백업이 통째로 유출돼도
--  키 없이는 읽을 수 없다. 키는 시크릿(SYNC_KEY)으로만 들어온다.
--
--  키마다 갱신 시각을 따로 둔다. 폰과 태블릿을 같이 쓸 때
--  통째로 덮어쓰면 한쪽 기기의 변경이 통째로 사라진다.
CREATE TABLE IF NOT EXISTS user_data (
  user_id  TEXT NOT NULL,
  k        TEXT NOT NULL,               -- cbt_user_memory 같은 저장 키
  v        TEXT NOT NULL,               -- 암호화된 값 (iv.ciphertext, base64url)
  updated  INTEGER NOT NULL,            -- 이 키가 마지막으로 바뀐 시각
  bytes    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, k)
);
CREATE INDEX IF NOT EXISTS idx_udata_user ON user_data(user_id, updated);
