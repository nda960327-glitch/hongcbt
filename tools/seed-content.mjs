// 커뮤니티에 편집팀 글(마음건강 백과·약 정보)과 게시판 예시 글을 넣는다 — 운영 DB(D1 hongcbt).
//
//  쓰는 법 (저장소 맨 위 폴더에서):  node tools/seed-content.mjs tools/seed-content-1.json
//   로컬 DB 에 먼저 돌려보기:        node tools/seed-content.mjs tools/seed-content-1.json --local
//
//  파일은 [이름, SQL] 의 배열. 글은 ON CONFLICT DO UPDATE 로 넣어서 몇 번 돌려도 같은 결과가 된다(고친 글은 다시 돌리면 반영).
//  한 줄씩 돌리면 너무 오래 걸려 30개씩 묶어 넣는다. 묶음이 실패하면 그 묶음만 한 줄씩 다시 돌려 어느 글이 문제인지 알려 준다.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2];
if (!file) { console.log('쓰는 법: node tools/seed-content.mjs <파일.json> [--local]'); process.exit(1); }
const extra = process.argv.slice(3);
const target = extra.includes('--local') ? extra : ['--remote', ...extra];
const SEED = JSON.parse(readFileSync(file, 'utf8'));
const SQL_FILE = join(mkdtempSync(join(tmpdir(), 'seed-')), 'step.sql');
const run = part => {
  writeFileSync(SQL_FILE, part.map(s => s[1] + ';').join('\n') + '\n');
  execSync(`npx wrangler d1 execute hongcbt ${target.join(' ')} --file="${SQL_FILE}"`, { stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
};
const SIZE = 30;
let bad = 0;
for (let i = 0; i < SEED.length; i += SIZE) {
  const part = SEED.slice(i, i + SIZE);
  try { run(part); console.log(`  완료   ${i + 1}~${i + part.length}`); }
  catch (e) {
    for (const one of part) {
      try { run([one]); }
      catch (e2) {
        bad++;
        const out = String((e2.stdout || '') + (e2.stderr || ''));
        console.log('  실패   ' + one[0] + '\n         ' + (out.match(/ERROR.*|error.*/i) || [out.slice(0, 200)])[0]);
      }
    }
    console.log(`  다시 돌림 ${i + 1}~${i + part.length}`);
  }
}
console.log(bad ? `\n${bad}개 실패 — 위 메시지를 확인하세요.` : `\n모두 끝났습니다 (${SEED.length}개).`);
process.exit(bad ? 1 : 0);
