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

console.log('판 번호 ' + cur + ' → ' + next);
console.log('  sw.js · index.html(APP_BUILD) · version.json · www/ 동기화 완료');
