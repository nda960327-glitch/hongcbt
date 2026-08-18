// 배포 판 번호를 한 번에 올린다.
//  세 곳(sw.js 캐시 이름 · index.html 의 APP_BUILD · version.json)이
//  같은 숫자를 봐야 한다. 손으로 맞추면 반드시 하나를 빠뜨리고,
//  그러면 앱이 '나는 최신인데?' 하며 옛 코드를 계속 쓴다.
//
//  쓰는 법:  node bump.js        (다음 번호로)
//            node bump.js 130    (특정 번호로)
const fs = require('fs');
const R = __dirname + '/';

let sw = fs.readFileSync(R + 'sw.js', 'utf8');
const cur = Number((sw.match(/cbt-app-v(\d+)/) || [])[1] || 0);
const next = Number(process.argv[2]) || cur + 1;

sw = sw.replace(/cbt-app-v\d+/g, 'cbt-app-v' + next);
fs.writeFileSync(R + 'sw.js', sw);

let html = fs.readFileSync(R + 'index.html', 'utf8');
// 모든 js·css 참조의 ?v= 도 같이 올린다 — 앱(웹뷰)에는 서비스워커가 없어서
//  이 번호가 유일한 캐시 파쇄기다. 없으면 새 index.html 이 4시간 묵은 JS 와
//  섞여 화면이 깨진다 (2026-08-11 실제로 겪음).
html = html.replace(/((?:src="js\/|href="css\/)[^"?]+\.(?:js|css))\?v=\d+/g, '$1?v=' + next);
if (/window\.APP_BUILD\s*=\s*\d+/.test(html)) {
  html = html.replace(/window\.APP_BUILD\s*=\s*\d+/, 'window.APP_BUILD = ' + next);
} else {
  // 처음 한 번: <head> 가 열리자마자 심는다. 다른 스크립트보다 먼저 있어야 한다.
  html = html.replace(/<head>/, '<head>\n  <script>window.APP_BUILD = ' + next + ';</script>');
}
fs.writeFileSync(R + 'index.html', html);

fs.writeFileSync(R + 'version.json', JSON.stringify({ build: next }) + '\n');

// 배포 대상(www)에도 그대로 복사
['sw.js', 'index.html', 'version.json'].forEach(f => fs.copyFileSync(R + f, R + 'www/' + f));

// js/·css/ 는 폴더째 옮긴다.
//  전에는 여기에 파일 이름을 손으로 적어 뒀다. 그래서 js 를 하나 고칠 때마다
//  사람이 목록도 같이 고쳐야 했고, 그러면 반드시 하나를 빠뜨린다.
//  빠뜨린 파일은 www 에 옛 내용으로 남는데 판 번호는 올라가 있어서,
//  화면에는 '고쳤는데 안 고쳐졌다'로만 보인다. 목록을 없애는 게 답이다.
let copied = 0;
for (const dir of ['js', 'css']) {
  const src = R + dir, dst = R + 'www/' + dir;
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (!fs.statSync(src + '/' + f).isFile()) continue;
    fs.copyFileSync(src + '/' + f, dst + '/' + f);
    copied++;
  }
}

// 상담사 앱(pro)도 같은 번호로 — pro 는 서비스워커가 없어서 ?v= 가 유일한 캐시 파쇄기다.
//  커스텀 도메인이 _headers 의 no-cache 를 무시하고 4시간 캐시를 붙이는 걸 실측했다
//  (pages.dev 직접 접속은 no-cache 가 붙는데 pro.neurumind.com 은 max-age=14400).
//  그래서 파일 내용이 바뀌면 주소 자체가 바뀌게 한다. index.html 은 항상 재검증되므로 안전하다.
let pro = fs.readFileSync(R + 'pro/index.html', 'utf8');
pro = pro.replace(/(src="js\/[^"?]+\.js)\?v=\d+/g, '$1?v=' + next);
fs.writeFileSync(R + 'pro/index.html', pro);

console.log('판 번호 ' + cur + ' → ' + next);
console.log('  sw.js · index.html(APP_BUILD) · version.json · www/(js·css ' + copied + '개 포함) · pro(?v=) 동기화 완료');
