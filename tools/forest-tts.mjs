// 솔숲 명상 안내 음성 만들기 — js/forest.js 의 모든 문장을 mp3 로 (한 번만, 바뀐 문장만 다시).
//  파일 이름 = 문장의 FNV-1a 해시 (forest.js 의 _hash 와 같은 규칙). audio/forest/ 와 www/audio/forest/ 에 쓴다.
//  쓰는 법: node tools/forest-tts.mjs           (없는 것만)
//           node tools/forest-tts.mjs --all     (전부 다시)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTS = [path.join(R, 'audio/forest'), path.join(R, 'www/audio/forest')];
const API = 'https://cbt-proxy.hongcbt.workers.dev/api/tts';
const VOICE = 'sage';
const INSTRUCTIONS = '한국어 마음챙김 명상 안내자. 아주 차분하고 따뜻하게, 평소보다 느리게, 속삭이듯 부드럽게 말한다. 문장 사이와 쉼표에서 여유 있게 쉰다. 감정을 과장하지 않는다.';

const ctx = { window: {}, document: { addEventListener() {} }, navigator: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js/forest.js'), 'utf8'), ctx);
const F = ctx.window.Forest;
const all = process.argv.includes('--all');

const lines = [];
for (const p of Object.values(F.PRACTICES)) for (const [t] of p.lines) lines.push(t);
const uniq = [...new Set(lines)];
OUTS.forEach(d => fs.mkdirSync(d, { recursive: true }));

let made = 0, kept = 0, failed = 0;
for (const text of uniq) {
  const name = F._hash(text) + '.mp3';
  const main = path.join(OUTS[0], name);
  if (!all && fs.existsSync(main)) { kept++; OUTS.slice(1).forEach(d => fs.existsSync(path.join(d, name)) || fs.copyFileSync(main, path.join(d, name))); continue; }
  let ok = false;
  for (let tries = 0; tries < 3 && !ok; tries++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, model: 'gpt-4o-mini-tts', voice: VOICE, speed: 0.9, instructions: INSTRUCTIONS }) });
      if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 120));
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 2000) throw new Error('too small ' + buf.length);
      OUTS.forEach(d => fs.writeFileSync(path.join(d, name), buf));
      ok = true; made++;
      process.stdout.write('.');
    } catch (e) { if (tries === 2) { failed++; console.log('\nFAIL', name, text.slice(0, 30), e.message); } else await new Promise(r => setTimeout(r, 1500)); }
  }
}
// 스크립트에서 빠진 옛 문장 파일은 지운다
const want = new Set(uniq.map(t => F._hash(t) + '.mp3'));
let removed = 0;
for (const d of OUTS) for (const f of fs.readdirSync(d)) if (f.endsWith('.mp3') && !want.has(f)) { fs.unlinkSync(path.join(d, f)); removed++; }
const bytes = fs.readdirSync(OUTS[0]).reduce((s, f) => s + fs.statSync(path.join(OUTS[0], f)).size, 0);
console.log(`\n문장 ${uniq.length} · 새로 ${made} · 그대로 ${kept} · 실패 ${failed} · 지움 ${removed} · 합계 ${(bytes / 1048576).toFixed(1)}MB`);
