#!/usr/bin/env node
// ============================================================================
//  상담사 코드 발급기
//
//  코드가 곧 열쇠입니다. 이 링크를 받은 사람은 그 상담사의 수신함을 전부 봅니다.
//  그래서
//    · 22자 난수 (추측 불가)
//    · 사람이 옮겨 적을 일이 없도록 링크째로 전달
//    · 새면 즉시 정지 (아래 --revoke)
//
//  쓰는 법
//    node tools/issue-code.mjs --list
//    node tools/issue-code.mjs --new c1 "김유진 심리상담사" "연세 마음가득"
//    node tools/issue-code.mjs --rotate c1        (코드만 새로 발급)
//    node tools/issue-code.mjs --revoke c1        (즉시 정지)
//    node tools/issue-code.mjs --restore c1
//
//  출력된 SQL 을 D1 에 넣습니다:
//    wrangler d1 execute hongcbt --remote --command "..."
// ============================================================================
import crypto from 'node:crypto';

const APP_URL = process.env.HONGCBT_URL || 'https://hongcbt.pages.dev';
const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 0/O/1/I 는 뺀다

function makeCode() {
  const b = crypto.randomBytes(22);
  let out = '';
  for (let i = 0; i < 22; i++) {
    out += AB[b[i] % AB.length];
    if (i % 6 === 5 && i !== 21) out += '-';
  }
  return out;
}

const q = s => String(s).replace(/'/g, "''");
const args = process.argv.slice(2);
const cmd = args[0];

function issued(id, code) {
  console.log('');
  console.log('  상담사 ID : ' + id);
  console.log('  코드      : ' + code);
  console.log('  접속 링크 : ' + APP_URL + '/counselor.html');
  console.log('');
  console.log('  ※ 링크를 열고 코드를 붙여넣으면 로그인됩니다.');
  console.log('    코드는 비밀번호와 같습니다 — 단톡방에 올리지 마세요.');
}

if (cmd === '--new') {
  const [, id, name, hospital] = args;
  if (!id || !name) { console.error('사용법: --new <id> "<이름>" "<소속>"'); process.exit(1); }
  const code = makeCode();
  console.log(`INSERT INTO counselors (id,name,hospital,code,available,busy_until,active,created)
VALUES ('${q(id)}','${q(name)}','${q(hospital || '')}','${code}',0,0,1,${Date.now()});`);
  issued(id, code);

} else if (cmd === '--rotate') {
  const id = args[1];
  if (!id) { console.error('사용법: --rotate <id>'); process.exit(1); }
  const code = makeCode();
  console.log(`UPDATE counselors SET code='${code}' WHERE id='${q(id)}';`);
  issued(id, code);
  console.log('  ※ 이전 코드는 이 SQL 을 적용하는 즉시 무효가 됩니다.');

} else if (cmd === '--revoke') {
  const id = args[1];
  if (!id) { console.error('사용법: --revoke <id>'); process.exit(1); }
  console.log(`UPDATE counselors SET active=0 WHERE id='${q(id)}';`);
  console.log('\n  적용 즉시 이 상담사의 모든 조회가 403 이 됩니다.');

} else if (cmd === '--restore') {
  const id = args[1];
  console.log(`UPDATE counselors SET active=1 WHERE id='${q(id)}';`);

} else if (cmd === '--list') {
  console.log('SELECT id, name, hospital, active, available FROM counselors ORDER BY created;');
  console.log('\n  위 SQL 을 실행하세요:');
  console.log('    wrangler d1 execute hongcbt --remote --command "SELECT id,name,active FROM counselors;"');
  console.log('  (코드 자체는 일부러 출력하지 않습니다 — 필요하면 --rotate 로 새로 발급하세요)');

} else {
  console.log(`상담사 코드 발급기

  --list                              등록된 상담사 보기
  --new <id> "<이름>" "<소속>"         새 상담사 + 코드 발급
  --rotate <id>                       코드만 새로 발급 (유출 시)
  --revoke <id>                       즉시 정지
  --restore <id>                      정지 해제

  앱 주소는 HONGCBT_URL 환경변수로 바꿉니다.
  현재: ${APP_URL}`);
}
