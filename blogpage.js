// 마인드 인사이드 커뮤니티의 공개 웹 — 네이버·구글이 읽을 수 있는 진짜 HTML 로 그리는 커뮤니티 포털.
//
//  상담소·상담사가 쓴 글은 앱 안(자바스크립트로 그리는 화면)에만 있어서 검색엔진이 읽지 못했다.
//  같은 글을 mindinside.kr/blog/… 주소의 완성된 HTML 로 내준다(이 Worker 가 그 주소를 맡는다 — wrangler.toml routes).
//   · /blog                     포털 첫 화면 — 인기 글 순위 · 최신 글 · 주제별 게시판 · 베스트 댓글 · 인기 태그 · 활발한 상담사
//   · /blog?sort=hot|new&tag=&q=&page=   글 목록(인기순·최신순·태그·검색)
//   · /blog/<글 id>             글 하나 + 댓글·답글. 좋아요·댓글·답글·댓글 공감은 페이지의 작은 스크립트가 앱과 같은 API 로 한다
//   · /blog/a/<상담사 id>       상담사 블로그(자기 페이지) — 소개 · 글 · 합계
//   · /blog/h/<상담소 id>       상담소의 글
//   · /blog/img/<글 id>/<n>.jpg · /blog/av/<상담사 id>.jpg   사진 (DB 에는 data: 로 들어 있다)
//   · /blog/sitemap.xml · /blog/rss.xml   검색엔진용
//  발행된(published=1) · 숨기지 않은(hidden=0) · 운영 중인 상담소(active=1)의 글만 내보낸다.
//  글이 발행되면 IndexNow 로 네이버·빙에 바로 알린다(pingIndexNow — community.js 가 부른다).
//  웹에서 누른 좋아요·댓글은 앱과 같은 표에 들어간다(이 브라우저의 clientId 로 — 앱의 기기 식별과 같은 방식).
const BRAND = '마인드 인사이드';
const APP = 'https://mindinsideapp.com';
const API = 'https://cbt-proxy.hongcbt.workers.dev';
export const INDEXNOW_KEY = '7c1e5a9d3f8b4a62b0d4e6f1a2c3d5e7';   // <사이트>/<키>.txt 에 같은 값이 있어야 한다 (home/ · www/)
// 대표 주소 — 검색엔진에는 이 주소 하나로만 알린다(canonical). 같은 글이 두 도메인에서 열려도 중복으로 치지 않게.
export const siteOf = env => String((env && env.BLOG_SITE) || 'https://mindinside.kr').replace(/\/+$/, '');

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = b => String(b || '').replace(/\[img:\d+\]/g, '').replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '$2')
  .replace(/\*\*/g, '').replace(/^#{1,2}\s+/gm, '').replace(/\s+/g, ' ').trim();
const images = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch (e) { return []; } };
const kdate = ts => { const d = new Date(Number(ts) + 9 * 3600000); return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`; };
const ago = ts => { const m = Math.floor((Date.now() - Number(ts)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.floor(m / 60) + '시간 전' : m < 10080 ? Math.floor(m / 1440) + '일 전' : kdate(ts); };
const iso = ts => new Date(Number(ts)).toISOString();
const cleanId = v => String(v || '').slice(0, 64).replace(/[^\w-]/g, '');
const tagsOf = v => String(v || '').split(',').filter(Boolean);
const jpeg = src => {
  const m = src && String(src).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return new Response('not found', { status: 404 });
  const bin = atob(m[1]); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Response(u8, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
};

// 본문 표기 → HTML (앱 js/community.js _body 와 같은 규칙). 사진은 /blog/img/… 주소로.
function bodyHtml(text, id, nImg, title) {
  const inline = t => esc(t)
    .replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '<span class="c-$1">$2</span>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  const fig = n => n < nImg ? `<figure><img src="/blog/img/${id}/${n}.jpg" alt="${esc(title)} 사진 ${n + 1}" loading="lazy"></figure>` : '';
  return String(text || '').split(/\n{2,}/).map(p => {
    const t = p.trim();
    if (!t) return '';
    const im = t.match(/^\[img:(\d+)\]$/);
    if (im) return fig(+im[1]);
    if (/^## /.test(t)) return '<h2>' + inline(t.slice(3)) + '</h2>';
    if (/^# /.test(t)) return '<p class="big">' + inline(t.slice(2)) + '</p>';
    return '<p>' + inline(t).replace(/\[img:(\d+)\]/g, (m, n) => +n < nImg ? '</p>' + fig(+n) + '<p>' : '') + '</p>';
  }).join('').replace(/<p><\/p>/g, '');
}

const CSS = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;background:#f6f1e8;color:#2f2923;line-height:1.7;-webkit-text-size-adjust:100%}
a{color:#3d7659;text-decoration:none}a:hover{text-decoration:underline}button{font:inherit;cursor:pointer}
.top{background:#fff;border-bottom:1px solid #e6dccb;position:sticky;top:0;z-index:20}.top .in{max-width:1080px;margin:0 auto;padding:.65rem 1rem;display:flex;align-items:center;gap:.9rem}
.brand{font-weight:900;font-size:1.05rem;color:#2f2923;white-space:nowrap}.brand b{color:#4f8a6b}
.top nav{display:flex;gap:.2rem;flex:1;overflow-x:auto;scrollbar-width:none}.top nav::-webkit-scrollbar{display:none}
.top nav a{padding:.4rem .7rem;border-radius:999px;font-weight:700;font-size:.88rem;color:#6b5f50;white-space:nowrap}.top nav a.on,.top nav a:hover{background:#eef6f0;color:#2f6b4c;text-decoration:none}
.btn{display:inline-block;background:#4f8a6b;color:#fff!important;font-weight:800;font-size:.85rem;padding:.5rem .95rem;border-radius:999px;border:0;white-space:nowrap}.btn:hover{text-decoration:none;background:#437a5d}.btn.ghost{background:#fff;color:#2f2923!important;border:1.5px solid #e6dccb}
.wrap{max-width:1080px;margin:0 auto;padding:1rem}.grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:1.1rem;align-items:start}
@media(max-width:860px){.grid{grid-template-columns:minmax(0,1fr)}.top .btn.app{display:none}}
.hero{background:linear-gradient(135deg,#4f8a6b,#3d7659);color:#fff;border-radius:22px;padding:1.3rem 1.4rem;margin-bottom:1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
.hero h1{margin:0 0 .2rem;font-size:1.35rem;line-height:1.4}.hero p{margin:0;opacity:.92;font-size:.92rem}.hero .sp{flex:1;min-width:240px}.hero .btn{background:#fff;color:#2f6b4c!important}
.search{display:flex;gap:.4rem;margin-bottom:1rem}.search input{flex:1;font:inherit;padding:.7rem 1rem;border-radius:999px;border:1.5px solid #e6dccb;background:#fff;min-width:0}.search input:focus{outline:none;border-color:#4f8a6b}
.card{background:#fff;border:1px solid #e6dccb;border-radius:18px;padding:1rem 1.1rem;margin-bottom:1rem}.card>h2,.sec>h2{margin:0 0 .6rem;font-size:1.02rem;display:flex;align-items:center;gap:.4rem}.card>h2 a.all,.sec>h2 a.all{margin-left:auto;font-size:.78rem;font-weight:700;color:#8a7b68}
.rank{list-style:none;margin:0;padding:0;counter-reset:r}.rank li{counter-increment:r;display:flex;gap:.7rem;align-items:flex-start;padding:.55rem 0;border-top:1px solid #f0e8da}.rank li:first-child{border-top:0}
.rank li::before{content:counter(r);flex:0 0 1.6rem;height:1.6rem;border-radius:8px;background:#f6f1e8;color:#8a7b68;font-weight:900;font-size:.85rem;display:flex;align-items:center;justify-content:center}.rank li:nth-child(-n+3)::before{background:#4f8a6b;color:#fff}
.rank a{color:#2f2923;font-weight:700;line-height:1.45;display:block}.rank .m,.m{color:#8a7b68;font-size:.76rem;font-weight:500}
.cnt{color:#c9463d;font-weight:800;font-size:.8rem;margin-left:.25rem}
.feed{list-style:none;margin:0;padding:0}.feed li{border-top:1px solid #f0e8da}.feed li:first-child{border-top:0}.feed a.row{display:flex;gap:.9rem;padding:.9rem 0;color:inherit}.feed a.row:hover{text-decoration:none}.feed a.row:hover h3{color:#2f6b4c}
.feed h3{margin:0 0 .15rem;font-size:1rem;line-height:1.45}.feed p{margin:0 0 .3rem;color:#6b5f50;font-size:.88rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.feed img.th{width:96px;height:96px;object-fit:cover;border-radius:12px;flex-shrink:0;background:#f6f1e8}.feed .who{display:flex;align-items:center;gap:.35rem;font-size:.78rem;color:#6b5f50;margin-bottom:.25rem}
.av{width:22px;height:22px;border-radius:50%;object-fit:cover;background:#dfeee5;color:#2f6b4c;font-weight:800;font-size:.7rem;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}.av.lg{width:72px;height:72px;font-size:1.6rem}.av.md{width:40px;height:40px;font-size:1rem}
.tags a,.tag{display:inline-block;background:#eef6f0;color:#2f6b4c;font-size:.8rem;font-weight:700;padding:.2rem .7rem;border-radius:999px;margin:0 .3rem .4rem 0}.tags a.on{background:#4f8a6b;color:#fff}
.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}.boards .card{margin:0}.boards ul{list-style:none;margin:0;padding:0}.boards li{padding:.3rem 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.9rem}.boards li a{color:#2f2923}
.best{list-style:none;margin:0;padding:0}.best li{padding:.6rem 0;border-top:1px solid #f0e8da}.best li:first-child{border-top:0}.best q{display:block;font-size:.9rem;line-height:1.55;quotes:none}.best a{color:#2f2923}
.people{list-style:none;margin:0;padding:0}.people li{border-top:1px solid #f0e8da}.people li:first-child{border-top:0}.people a{display:flex;align-items:center;gap:.6rem;padding:.5rem 0;color:#2f2923}.people b{display:block;font-size:.9rem;line-height:1.3}
.appcard{background:#fff8ec;border-color:#f0dfbf}.appcard p{margin:.2rem 0 .7rem;font-size:.88rem;color:#6b5f50}
.pager{display:flex;gap:.5rem;justify-content:center;margin:1rem 0}
article.post{background:#fff;border:1px solid #e6dccb;border-radius:20px;padding:1.4rem 1.3rem}article.post h1{font-size:1.55rem;line-height:1.4;margin:.3rem 0 .7rem}article.post h2{font-size:1.15rem;margin:1.6rem 0 .4rem}article.post p{margin:0 0 1rem;font-size:1.02rem}article.post .big{font-size:1.18rem;font-weight:700}
figure{margin:.4rem 0 1.1rem}figure img{display:block;width:100%;height:auto;border-radius:14px}
.c-red{color:#c9463d}.c-orange{color:#d97a1c}.c-green{color:#2f7d4f}.c-blue{color:#2d64a8}.c-purple{color:#7a4fb0}.c-gray{color:#7f7264}
.byline{display:flex;align-items:center;gap:.7rem;padding-bottom:.9rem;margin-bottom:1rem;border-bottom:1px solid #f0e8da}.byline b{display:block;line-height:1.3}.byline a{color:#2f2923}
.acts{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1.2rem;padding-top:1rem;border-top:1px solid #f0e8da}.act{background:#fff;border:1.5px solid #e6dccb;border-radius:999px;padding:.5rem 1rem;font-weight:800;font-size:.88rem;color:#2f2923}.act.on{border-color:#e9a6a1;background:#fdf0ef;color:#c9463d}
.cm{margin-top:1rem}.cm .c{background:#fff;border:1px solid #e6dccb;border-radius:14px;padding:.75rem .95rem;margin:.5rem 0}.cm .c.r{margin-left:1.6rem;background:#fbf8f3}.cm .c.best{border-color:#f0c56b;background:#fffaf0}
.cm .hd{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;font-size:.76rem;color:#8a7b68}.cm .hd b{font-size:.9rem;color:#2f2923}.badge{font-size:.68rem;font-weight:800;color:#2f6b4c;background:#eef6f0;border-radius:999px;padding:.05rem .5rem}.badge.gold{color:#9a6b00;background:#fdecc4}
.cm .c p{margin:.25rem 0 .35rem;white-space:pre-wrap;word-break:break-word}.cm .ft{display:flex;gap:.9rem}.cm .ft button{background:none;border:0;padding:0;font-size:.78rem;font-weight:700;color:#8a7b68}.cm .ft button.on{color:#c9463d}
.form{background:#fff;border:1px solid #e6dccb;border-radius:16px;padding:.8rem;margin-top:.8rem}.form input,.form textarea{width:100%;font:inherit;border:1.5px solid #e6dccb;border-radius:12px;padding:.6rem .8rem;margin-bottom:.5rem;background:#fff}.form textarea{min-height:5rem;resize:vertical}.form .row{display:flex;align-items:center;gap:.6rem}.form .row span{flex:1;font-size:.74rem;color:#8a7b68}
.cover{background:linear-gradient(135deg,#dfeee5,#f6f1e8);border-radius:22px;padding:1.6rem 1.3rem;margin-bottom:1rem;display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap}.cover h1{margin:0;font-size:1.4rem}.cover p{margin:.2rem 0 0;color:#6b5f50}.stats{display:flex;gap:1.2rem;margin-top:.6rem;font-size:.85rem;color:#6b5f50}.stats b{color:#2f2923;font-size:1.05rem;margin-right:.2rem}
footer{max-width:1080px;margin:0 auto;padding:.5rem 1rem 2.5rem;color:#8a7b68;font-size:.8rem}#toast{position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%);background:#2f2923;color:#fff;padding:.6rem 1rem;border-radius:999px;font-size:.85rem;opacity:0;transition:opacity .2s;pointer-events:none;z-index:50}#toast.on{opacity:1}
[hidden]{display:none!important}
.feat .who{display:flex;margin:.2rem 0 .15rem}.feat .m{display:block}.rank[start] li:nth-child(3)::before{background:#f6f1e8;color:#8a7b68}
footer{line-height:1.9}
body{font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f7f3ec;letter-spacing:-.01em}
.serif,.hero h1,article.post h1,.cover h1,.feat h3{font-family:"Gowun Batang","Pretendard Variable",serif;letter-spacing:-.02em}
.top{background:rgba(255,255,255,.86);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid rgba(120,96,66,.12)}
.card,article.post,.form,.cm .c{border-color:rgba(120,96,66,.12);box-shadow:0 1px 2px rgba(60,45,25,.04),0 8px 24px -12px rgba(60,45,25,.10)}
.card{border-radius:20px;padding:1.15rem 1.25rem}.card>h2,.sec>h2{font-size:1.05rem;font-weight:800;letter-spacing:-.02em}
.hero{position:relative;overflow:hidden;border-radius:26px;padding:1.7rem 1.7rem;background:radial-gradient(120% 140% at 0% 0%,#5c9a79 0%,#3f7a5c 55%,#2f6249 100%);box-shadow:0 18px 40px -22px rgba(47,98,73,.7)}
.hero::after{content:"";position:absolute;right:-60px;top:-80px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.08)}
.hero h1{font-size:1.6rem}.hero .btn{position:relative;z-index:1;box-shadow:0 6px 16px -8px rgba(0,0,0,.4)}
.search input{box-shadow:0 1px 2px rgba(60,45,25,.04);border-color:rgba(120,96,66,.16);padding:.8rem 1.2rem}
.btn{transition:transform .12s ease,background .12s ease}.btn:active{transform:scale(.97)}
.ph{display:flex;align-items:flex-end;padding:.5rem .6rem;color:#fff;font-weight:800;font-size:.74rem;line-height:1.25;overflow:hidden}
.g0{background:linear-gradient(135deg,#7fb69a,#4f8a6b)}.g1{background:linear-gradient(135deg,#f0b98a,#d98a5a)}.g2{background:linear-gradient(135deg,#9bb6e0,#6a8cc7)}.g3{background:linear-gradient(135deg,#c9a9e0,#9a78c2)}.g4{background:linear-gradient(135deg,#e9c46a,#c99a2e)}.g5{background:linear-gradient(135deg,#8fcfc9,#4fa39b)}
.feed .th{width:104px;height:104px;border-radius:16px;flex-shrink:0;object-fit:cover}.feed a.row{padding:1.05rem 0;align-items:center}.feed h3{font-size:1.06rem;font-weight:800;letter-spacing:-.02em}.feed li{border-color:rgba(120,96,66,.1)}
.feat{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:1.1rem;color:inherit;margin-bottom:.4rem;padding-bottom:1rem;border-bottom:1px solid rgba(120,96,66,.1)}.feat:hover{text-decoration:none}.feat:hover h3{color:#2f6b4c}
.feat .cv{aspect-ratio:16/10;border-radius:18px;width:100%;object-fit:cover;font-size:1rem;padding:1rem}.feat h3{margin:.3rem 0 .4rem;font-size:1.4rem;line-height:1.4}.feat p{margin:0 0 .5rem;color:#6b5f50;font-size:.93rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.feat .lab{display:inline-block;background:#fdecc4;color:#9a6b00;font-weight:800;font-size:.72rem;padding:.12rem .6rem;border-radius:999px}
@media(max-width:640px){.feat{grid-template-columns:1fr}.feat h3{font-size:1.2rem}.feed .th{width:84px;height:84px}.hero{padding:1.3rem 1.2rem}.hero h1{font-size:1.3rem}.wrap{padding:.8rem}}
.rank li{border-color:rgba(120,96,66,.1);padding:.65rem 0}.rank li::before{border-radius:9px}.rank a{font-weight:700}
.tags a,.tag{padding:.28rem .8rem;font-size:.82rem;transition:background .12s}.tags a:hover{background:#dcefe3;text-decoration:none}
.best li{position:relative;padding-left:1rem}.best li::before{content:"";position:absolute;left:0;top:.9rem;bottom:.9rem;width:3px;border-radius:3px;background:#f0c56b}
.people a:hover b{color:#2f6b4c}.people a:hover{text-decoration:none}
article.post{border-radius:24px;padding:1.9rem 1.7rem}article.post h1{font-size:1.75rem}article.post p{font-size:1.05rem;line-height:1.85;color:#3a332c}article.post h2{font-size:1.2rem;font-weight:800;margin-top:2rem;padding-left:.7rem;border-left:4px solid #4f8a6b}
@media(max-width:640px){article.post{padding:1.3rem 1.1rem}article.post h1{font-size:1.4rem}}
.act{transition:transform .12s}.act:active{transform:scale(.96)}.cm .c{border-radius:16px}.cover{border-radius:26px;padding:1.9rem 1.6rem;background:radial-gradient(120% 140% at 0% 0%,#e3f1e8,#f7f3ec)}.cover h1{font-size:1.6rem}`;

function page(site, { title, desc, path, body, ogImage, jsonld, type, noindex, nav, script }) {
  const url = site + path;
  const N = (k, href, label) => `<a href="${href}"${nav === k ? ' class="on"' : ''}>${label}</a>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="${type || 'website'}"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(ogImage || site + '/icon.png')}"><meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}"><link rel="alternate" type="application/rss+xml" title="${BRAND} 커뮤니티" href="${site}/blog/rss.xml"><link rel="icon" href="/icon.png"><link rel="preconnect" href="https://cdn.jsdelivr.net"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700&display=swap">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}<style>${CSS}</style></head><body>
<header class="top"><div class="in"><a class="brand" href="/blog"><b>마인드</b> 인사이드</a><nav>${N('home', '/blog', '커뮤니티')}${N('hot', '/blog?sort=hot', '인기')}${N('new', '/blog?sort=new', '최신')}<a href="/">앱 소개</a></nav><a class="btn app" href="${APP}/">앱 열기</a></div></header>
<div class="wrap">${body}</div>
<footer>심리상담소와 상담사가 직접 쓰는 마음 돌봄 이야기 · <a href="/">${BRAND} 소개</a> · <a href="/#faq">자주 묻는 질문</a> · <a href="${APP}/terms.html">이용약관</a> · <a href="${APP}/privacy.html">개인정보처리방침</a> · <a href="/blog/rss.xml">RSS</a><br>
위기 상황에는 자살예방상담전화 109 · 정신건강 위기상담 1577-0199 (24시간)<br>
마인드 인사이드 · 대표 노도아 · 사업자등록번호 448-87-03724 · 서울특별시 강남구 언주로98길 14, 4층 303호(역삼동, 예일빌딩) · mindinsideapp@gmail.com</footer><div id="toast"></div>${script || ''}</body></html>`;
}
const html = (s, status, maxAge) => new Response(s, { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge == null ? 120 : maxAge}` } });
const xml = (s, type) => new Response(s, { headers: { 'Content-Type': (type || 'application/xml') + '; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });

const PUB = 'p.published = 1 AND p.hidden = 0 AND h.active = 1';
const FROM = 'FROM posts p JOIN hospitals h ON h.id = p.hospital_id';
const COLS = `p.id, p.title, substr(p.body, 1, 500) AS body, p.tags, p.created, p.updated, p.author_id, p.author_name, p.hospital_id, h.name AS hospital_name, COALESCE(p.views, 0) AS views,
  (p.images IS NOT NULL AND p.images != '') AS has_img,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comments`;
const score = r => (r.likes || 0) * 3 + (r.comments || 0) * 4 + (r.views || 0) * 0.3 + (Date.now() - r.created < 7 * 86400000 ? 6 : 0);
const avatar = (id, name, cls) => id ? `<img class="av ${cls || ''}" src="/blog/av/${esc(id)}.jpg" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;av ${cls || ''}&quot;>${esc(String(name || '상').slice(0, 1))}</span>'">` : `<span class="av ${cls || ''}">${esc(String(name || '상').slice(0, 1))}</span>`;
const whoHtml = r => `<span class="who">${avatar(r.author_id, r.author_name || r.hospital_name)}<span>${esc(r.author_name ? r.author_name + ' 상담사' : r.hospital_name)}${r.author_name ? ' · ' + esc(r.hospital_name) : ''}</span></span>`;
const meta = r => `<span class="m">${ago(r.created)} · 조회 ${r.views || 0} · 공감 ${r.likes || 0}${r.comments ? ` · 댓글 ${r.comments}` : ''}</span>`;
const hue = id => 'g' + (String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6);
const cover = (r, cls) => r.has_img ? `<img class="${cls}" src="/blog/img/${esc(r.id)}/0.jpg" alt="" loading="lazy">` : `<span class="${cls} ph ${hue(r.id)}">${esc(tagsOf(r.tags)[0] ? '#' + tagsOf(r.tags)[0] : '마음 이야기')}</span>`;
const feedHtml = rows => `<ul class="feed">${rows.map(r => `<li><a class="row" href="/blog/${esc(r.id)}"><div style="flex:1;min-width:0">${whoHtml(r)}<h3>${esc(r.title)}${r.comments ? `<span class="cnt">[${r.comments}]</span>` : ''}</h3><p>${esc(plain(r.body).slice(0, 150))}</p>${meta(r)}</div>${cover(r, 'th')}</a></li>`).join('')}</ul>`;
const appCard = `<div class="card appcard"><h2>마인드 인사이드 앱</h2><p>AI 상담사 느루와 매일 마음을 돌보고, 필요할 때 이 글을 쓴 상담사와 전화·채팅으로 상담할 수 있어요.</p><a class="btn" href="${APP}/">앱 열기</a> <a class="btn ghost" href="/">앱 소개 보기</a></div>`;
const notFound = site => html(page(site, { title: '글을 찾을 수 없어요 — ' + BRAND, desc: '', path: '/blog', noindex: true, body: '<div class="card"><h2>이 글은 지금 볼 수 없어요</h2><p><a class="btn" href="/blog">커뮤니티 첫 화면으로</a></p></div>' }), 404, 60);

// 글 화면의 스크립트 — 좋아요·댓글·답글·댓글 공감·공유. 서버가 그린 댓글을 내 상태(내가 누른 것)까지 넣어 다시 그린다.
const POST_JS = id => `<script>(function(){
var API=/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?location.origin:${JSON.stringify(API)},PID=${JSON.stringify(id)},D=null,replyTo='';
function $(s){return document.querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on')},2200)}
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k)||'';localStorage.setItem(k,v)}catch(e){return ''}}
function me(){var id=ls('mi_cid');if(!id){id='u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);ls('mi_cid',id)}
 var key=ls('mi_ckey');if(key)return Promise.resolve({id:id,key:key});
 return fetch(API+'/client/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:id})}).then(function(r){return r.json()}).then(function(d){if(d&&d.clientKey)ls('mi_ckey',d.clientKey);return{id:id,key:(d&&d.clientKey)||''}}).catch(function(){return{id:id,key:''}})}
function post(p,b){return me().then(function(m){b.clientId=m.id;b.clientKey=m.key;return fetch(API+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){j._s=r.status;return j})})})}
function ago(ts){var m=Math.floor((Date.now()-ts)/60000);if(m<1)return'방금';if(m<60)return m+'분 전';if(m<1440)return Math.floor(m/60)+'시간 전';var d=new Date(ts);return (d.getMonth()+1)+'월 '+d.getDate()+'일'}
function cHtml(c,cls,mine){return '<div class="c '+cls+'" data-c="'+esc(c.id)+'"><div class="hd"><b>'+esc(c.name)+'</b>'+(c.byHospital?'<span class="badge">상담소</span>':'')+(cls.indexOf('best')>=0?'<span class="badge gold">베스트</span>':'')+'<span>'+ago(c.ts)+'</span></div><p>'+esc(c.text)+'</p><div class="ft"><button data-a="clike" class="'+(c.mine?'on':'')+'">공감 '+(c.likes||0)+'</button><button data-a="reply" data-root="'+esc(c.parentId||c.id)+'" data-n="'+esc(c.name)+'">답글</button>'+(mine===c.clientId?'<button data-a="cdel">삭제</button>':'')+'</div></div>'}
function draw(){if(!D)return;var p=D.post,cm=D.comments||[],my=ls('mi_cid');
 var lk=$('[data-a=like]');lk.classList.toggle('on',!!p.mine);lk.textContent='♥ 공감 '+(p.likes||0);
 var roots=cm.filter(function(c){return!c.parentId}),kids=cm.filter(function(c){return c.parentId});
 var best=roots.filter(function(c){return(c.likes||0)>=2}).sort(function(a,b){return b.likes-a.likes}).slice(0,3);
 var h=best.map(function(c){return cHtml(c,'best',my)}).join('');
 h+=roots.map(function(c){return cHtml(c,'',my)+kids.filter(function(k){return k.parentId===c.id}).map(function(k){return cHtml(k,'r',my)}).join('')}).join('');
 $('#cm-list').innerHTML=h||'<p class="m">첫 댓글을 남겨보세요. 따뜻한 한마디면 충분해요.</p>';
 $('#cm-n').textContent=cm.length}
function load(){me().then(function(m){return fetch(API+'/community/post?id='+encodeURIComponent(PID)+'&clientId='+encodeURIComponent(m.id)+(m.key?'&clientKey='+encodeURIComponent(m.key):''))}).then(function(r){return r.json()}).then(function(d){if(d&&d.ok){D=d;draw()}}).catch(function(){})}
document.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b)return;var a=b.getAttribute('data-a');
 if(a==='like'){post('/community/like',{id:PID}).then(function(j){if(j.ok&&D){D.post.likes=j.likes;D.post.mine=j.mine;draw()}})}
 else if(a==='share'){var u=location.href;if(navigator.share){navigator.share({title:document.title,url:u}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){toast('주소를 복사했어요')})}}
 else if(a==='clike'){var id=b.closest('[data-c]').getAttribute('data-c');post('/community/comment/like',{cid:id}).then(function(j){if(j.ok&&D){D.comments.forEach(function(c){if(c.id===id){c.likes=j.likes;c.mine=j.mine}});draw()}})}
 else if(a==='reply'){replyTo=b.getAttribute('data-root');$('#cm-to').textContent=b.getAttribute('data-n')+' 님에게 답글 쓰는 중 · 취소';$('#cm-to').hidden=false;$('#cm-text').focus()}
 else if(a==='noreply'){replyTo='';$('#cm-to').hidden=true}
 else if(a==='cdel'){var cid=b.closest('[data-c]').getAttribute('data-c');if(!confirm('댓글을 지울까요?'))return;post('/community/comment/delete',{cid:cid}).then(function(j){if(j.ok&&D){D.comments=D.comments.filter(function(c){return c.id!==cid&&c.parentId!==cid});draw()}})}
 else if(a==='send'){var t=$('#cm-text').value.trim(),n=$('#cm-name').value.trim();if(!t){$('#cm-text').focus();return}ls('mi_name',n);b.disabled=true;
  post('/community/comment',{id:PID,text:t,name:n||'익명',parentId:replyTo}).then(function(j){b.disabled=false;if(j.ok){if(D){D.comments.push(j.comment);draw()}$('#cm-text').value='';replyTo='';$('#cm-to').hidden=true;toast('댓글을 올렸어요')}else toast(j._s===429?'댓글을 너무 자주 올렸어요. 잠시 뒤에 다시 해주세요':'지금은 올리지 못했어요')}).catch(function(){b.disabled=false;toast('지금은 올리지 못했어요')})}
});
$('#cm-name').value=ls('mi_name');load();
})();</script>`;

export async function handleBlog(request, env, ctx, path) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (path !== '/blog' && !path.startsWith('/blog/')) return null;
  const site = siteOf(env);
  const db = env.DB;
  if (!db) return notFound(site);
  const url = new URL(request.url);
  try {
    if (path === '/blog/sitemap.xml') {
      const rows = (await db.prepare(`SELECT p.id, p.updated, p.created, p.hospital_id, p.author_id ${FROM} WHERE ${PUB} ORDER BY p.created DESC LIMIT 5000`).all()).results || [];
      const hosps = [...new Set(rows.map(r => r.hospital_id))], authors = [...new Set(rows.map(r => r.author_id).filter(Boolean))];
      return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${site}/blog</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`
        + authors.map(a => `<url><loc>${site}/blog/a/${esc(a)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`).join('')
        + hosps.map(h => `<url><loc>${site}/blog/h/${esc(h)}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n`).join('')
        + rows.map(r => `<url><loc>${site}/blog/${esc(r.id)}</loc><lastmod>${iso(r.updated || r.created).slice(0, 10)}</lastmod><priority>0.8</priority></url>\n`).join('') + '</urlset>');
    }
    if (path === '/blog/rss.xml') {
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} ORDER BY p.created DESC LIMIT 30`).all()).results || [];
      return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${BRAND} 커뮤니티</title><link>${site}/blog</link><description>심리상담소와 상담사가 직접 쓰는 마음 돌봄 이야기</description><language>ko</language>\n`
        + rows.map(r => `<item><title>${esc(r.title)}</title><link>${site}/blog/${esc(r.id)}</link><guid isPermaLink="true">${site}/blog/${esc(r.id)}</guid><pubDate>${new Date(Number(r.created)).toUTCString()}</pubDate><author>${esc(r.author_name ? r.author_name + ' 상담사' : r.hospital_name)}</author><description>${esc(plain(r.body).slice(0, 300))}</description></item>\n`).join('')
        + '</channel></rss>', 'application/rss+xml');
    }
    const img = path.match(/^\/blog\/img\/([\w-]+)\/(\d)\.jpg$/);
    if (img) {
      const r = await db.prepare(`SELECT p.images ${FROM} WHERE p.id = ? AND ${PUB}`).bind(img[1]).first();
      return jpeg(r ? images(r.images)[+img[2]] : null);
    }
    const av = path.match(/^\/blog\/av\/([\w-]+)\.jpg$/);
    if (av) {
      const r = await db.prepare('SELECT photo FROM counselors WHERE id = ? AND active = 1').bind(av[1]).first();
      return jpeg(r && r.photo);
    }

    // ── 상담사 블로그 (자기 페이지) ──
    const am = path.match(/^\/blog\/a\/([\w-]+)$/);
    if (am) {
      const a = await db.prepare('SELECT id, name, hospital, hospital_id, hospital_ok, intro, tags, license FROM counselors WHERE id = ? AND active = 1').bind(am[1]).first();
      if (!a) return notFound(site);
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} AND p.author_id = ? ORDER BY p.created DESC LIMIT 60`).bind(a.id).all()).results || [];
      let tg = []; try { tg = JSON.parse(a.tags || '[]'); } catch (e) {}
      const sum = k => rows.reduce((x, r) => x + (r[k] || 0), 0);
      return html(page(site, { title: `${a.name} 상담사의 블로그 — ${BRAND}`, desc: (a.intro || `${a.name} 상담사가 쓴 마음 돌봄 글 모음.`).slice(0, 150), path, type: 'profile', ogImage: `${site}/blog/av/${a.id}.jpg`,
        jsonld: { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: a.name, jobTitle: '심리상담사', description: a.intro || '', worksFor: a.hospital ? { '@type': 'Organization', name: a.hospital } : undefined, image: `${site}/blog/av/${a.id}.jpg` } },
        body: `<div class="cover">${avatar(a.id, a.name, 'lg')}<div style="flex:1;min-width:220px"><h1>${esc(a.name)} 상담사</h1><p>${esc([a.hospital, a.license].filter(Boolean).join(' · '))}</p>
            <div class="stats"><span><b>${rows.length}</b>글</span><span><b>${sum('likes')}</b>공감</span><span><b>${sum('views')}</b>조회</span></div></div>
            <a class="btn" href="${APP}/?counselor=${esc(a.id)}">이 상담사와 상담하기</a></div>
          <div class="grid"><div><div class="card"><h2>쓴 글 ${rows.length}</h2>${rows.length ? feedHtml(rows) : '<p class="m">아직 올린 글이 없어요.</p>'}</div></div>
          <aside>${a.intro ? `<div class="card"><h2>소개</h2><p style="margin:0;white-space:pre-wrap">${esc(a.intro)}</p>${Array.isArray(tg) && tg.length ? `<div class="tags" style="margin-top:.7rem">${tg.slice(0, 8).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}</div>` : ''}
            ${a.hospital_ok && a.hospital_id ? `<div class="card"><h2>소속</h2><a href="/blog/h/${esc(a.hospital_id)}">${esc(a.hospital)}의 글 보기</a></div>` : ''}${appCard}</aside></div>` }));
    }

    const hm = path.match(/^\/blog\/h\/([\w-]+)$/);
    const sort = url.searchParams.get('sort') || '', tag = (url.searchParams.get('tag') || '').slice(0, 12).trim(), kw = (url.searchParams.get('q') || '').slice(0, 40).trim();
    const pg = Math.max(0, Math.min(100, Number(url.searchParams.get('page')) || 0));

    // ── 글 목록 (인기순·최신순·태그·검색·상담소) ──
    if (hm || (path === '/blog' && (sort || tag || kw || pg))) {
      const where = [PUB], args = [];
      if (hm) { where.push('p.hospital_id = ?'); args.push(hm[1]); }
      if (tag) { where.push("(',' || COALESCE(p.tags, '') || ',') LIKE ?"); args.push('%,' + tag.replace(/[%_]/g, '') + ',%'); }
      if (kw) { const like = '%' + kw.replace(/[%_]/g, '') + '%'; where.push('(p.title LIKE ? OR p.body LIKE ? OR p.tags LIKE ? OR p.author_name LIKE ? OR h.name LIKE ?)'); args.push(like, like, like, like, like); }
      const hot = sort === 'hot';
      const order = hot ? `(likes * 3 + comments * 4 + COALESCE(p.views, 0) * 0.3 + CASE WHEN p.created > ${Date.now() - 7 * 86400000} THEN 6 ELSE 0 END) DESC, p.created DESC` : 'p.created DESC';
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 21 OFFSET ?`).bind(...args, pg * 20).all()).results || [];
      if (hm && !rows.length && !pg) return notFound(site);
      const more = rows.length > 20; if (more) rows.pop();
      const hname = hm && rows[0] ? rows[0].hospital_name : '';
      const head = hm ? `${hname}의 글` : kw ? `"${kw}" 검색 결과` : tag ? `#${tag}` : hot ? '인기 글' : '최신 글';
      const qs = o => { const u = new URLSearchParams(); const all = Object.assign({ sort, tag, q: kw }, o); Object.keys(all).forEach(k => { if (all[k]) u.set(k, all[k]); }); const s = u.toString(); return (hm ? path : '/blog') + (s ? '?' + s : ''); };
      return html(page(site, { title: `${head} — ${BRAND} 커뮤니티`, desc: `${BRAND} 커뮤니티의 ${head}. 심리상담소와 상담사가 직접 쓴 마음 돌봄 글.`, path: qs({ page: pg || '' }), noindex: !!(kw || pg), nav: hot ? 'hot' : sort === 'new' ? 'new' : '',
        body: `<form class="search" action="/blog" method="get"><input name="q" value="${esc(kw)}" placeholder="글·태그·상담사 검색" aria-label="검색"><button class="btn">검색</button></form>
          <div class="grid"><div><div class="card"><h2>${esc(head)}</h2>${rows.length ? feedHtml(rows) : '<p class="m">아직 글이 없어요.</p>'}</div>
          <div class="pager">${pg ? `<a class="btn ghost" href="${esc(qs({ page: pg - 1 || '' }))}">이전</a>` : ''}${more ? `<a class="btn ghost" href="${esc(qs({ page: pg + 1 }))}">다음</a>` : ''}</div></div><aside>${appCard}</aside></div>` }));
    }

    // ── 포털 첫 화면 ──
    if (path === '/blog') {
      const all = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} ORDER BY p.created DESC LIMIT 150`).all()).results || [];
      const hotRows = all.slice().sort((a, b) => score(b) - score(a)).slice(0, 7);
      const tagN = {}; all.forEach(r => tagsOf(r.tags).forEach(t => { tagN[t] = (tagN[t] || 0) + 1; }));
      const topTags = Object.keys(tagN).sort((a, b) => tagN[b] - tagN[a]).slice(0, 14);
      const people = {}; all.forEach(r => { if (!r.author_id) return; const p = people[r.author_id] || (people[r.author_id] = { id: r.author_id, name: r.author_name, hosp: r.hospital_name, n: 0, likes: 0 }); p.n++; p.likes += r.likes || 0; });
      const topPeople = Object.values(people).sort((a, b) => (b.n * 2 + b.likes) - (a.n * 2 + a.likes)).slice(0, 6);
      let best = [];
      try {
        best = (await db.prepare(`SELECT c.post_id, c.name, c.text, p.title, (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes
          FROM post_comments c JOIN posts p ON p.id = c.post_id JOIN hospitals h ON h.id = p.hospital_id
          WHERE c.hidden = 0 AND c.ts > ? AND ${PUB} ORDER BY likes DESC, c.ts DESC LIMIT 5`).bind(Date.now() - 30 * 86400000).all()).results || [];
      } catch (e) {}
      const boards = topTags.slice(0, 3).map(t => ({ t, rows: all.filter(r => tagsOf(r.tags).includes(t)).slice(0, 5) }));
      const totalC = all.reduce((x, r) => x + (r.comments || 0), 0);
      return html(page(site, { title: `${BRAND} 커뮤니티 — 심리상담사가 쓰는 마음 돌봄 이야기`, desc: '불안, 우울, 수면, 관계 고민까지 — 심리상담소와 상담사가 직접 쓰는 마음 돌봄 글과 사람들의 이야기.', path: '/blog', nav: 'home',
        jsonld: { '@context': 'https://schema.org', '@type': 'Blog', name: BRAND + ' 커뮤니티', url: site + '/blog', publisher: { '@type': 'Organization', name: BRAND, url: site } },
        body: `<div class="hero"><div class="sp"><h1>마음 이야기가 모이는 곳</h1><p>상담사가 직접 쓰는 글 ${all.length}편 · 댓글 ${totalC}개. 읽다가 마음이 움직이면, 그 상담사와 바로 이야기할 수 있어요.</p></div><a class="btn" href="${APP}/">앱에서 상담 시작하기</a></div>
          <form class="search" action="/blog" method="get"><input name="q" placeholder="고민을 검색해 보세요 — 불면, 번아웃, 관계…" aria-label="검색"><button class="btn">검색</button></form>
          <div class="grid"><div>
            <div class="card"><h2>지금 인기 글 <a class="all" href="/blog?sort=hot">더 보기</a></h2>
              ${hotRows[0] ? `<a class="feat" href="/blog/${esc(hotRows[0].id)}">${cover(hotRows[0], 'cv')}<div><span class="lab">가장 많이 읽는 글</span><h3>${esc(hotRows[0].title)}</h3><p>${esc(plain(hotRows[0].body).slice(0, 160))}</p>${whoHtml(hotRows[0])}${meta(hotRows[0])}</div></a>` : ''}
              <ol class="rank" start="2" style="counter-reset:r 1">${hotRows.slice(1).map(r => `<li><div><a href="/blog/${esc(r.id)}">${esc(r.title)}${r.comments ? `<span class="cnt">[${r.comments}]</span>` : ''}</a><span class="m">${esc(r.author_name ? r.author_name + ' 상담사' : r.hospital_name)} · 조회 ${r.views || 0} · 공감 ${r.likes || 0}</span></div></li>`).join('') || '<li><div class="m">아직 글이 없어요.</div></li>'}</ol></div>
            ${boards.length ? `<div class="boards" style="margin-bottom:1rem">${boards.map(b => `<div class="card"><h2>#${esc(b.t)} <a class="all" href="/blog?tag=${encodeURIComponent(b.t)}">더 보기</a></h2><ul>${b.rows.map(r => `<li><a href="/blog/${esc(r.id)}">${esc(r.title)}</a>${r.comments ? `<span class="cnt">[${r.comments}]</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : ''}
            <div class="card"><h2>새로 올라온 글 <a class="all" href="/blog?sort=new">더 보기</a></h2>${all.length ? feedHtml(all.slice(0, 12)) : '<p class="m">아직 올라온 글이 없어요.</p>'}</div>
          </div><aside>
            ${best.filter(b => b.likes > 0).length ? `<div class="card"><h2>베스트 댓글</h2><ul class="best">${best.filter(b => b.likes > 0).map(b => `<li><a href="/blog/${esc(b.post_id)}"><q>${esc(String(b.text).slice(0, 90))}</q></a><span class="m">${esc(b.name || '익명')} · 공감 ${b.likes} · ${esc(String(b.title).slice(0, 24))}</span></li>`).join('')}</ul></div>` : ''}
            ${topTags.length ? `<div class="card"><h2>인기 태그</h2><div class="tags">${topTags.map(t => `<a href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div></div>` : ''}
            ${topPeople.length ? `<div class="card"><h2>활발한 상담사</h2><ul class="people">${topPeople.map(p => `<li><a href="/blog/a/${esc(p.id)}">${avatar(p.id, p.name, 'md')}<span><b>${esc(p.name)} 상담사</b><span class="m">${esc(p.hosp)} · 글 ${p.n} · 공감 ${p.likes}</span></span></a></li>`).join('')}</ul></div>` : ''}
            ${appCard}</aside></div>` }));
    }

    // ── 글 하나 ──
    const pm = path.match(/^\/blog\/([\w-]+)$/);
    if (!pm) return notFound(site);
    const id = pm[1];
    const r = await db.prepare(`SELECT p.*, h.name AS hospital_name, h.dept AS hospital_dept ${FROM} WHERE p.id = ? AND ${PUB}`).bind(id).first();
    if (!r) return notFound(site);
    let cm = [];
    try { cm = (await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes FROM post_comments c WHERE c.post_id = ? AND c.hidden = 0 ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || []; }
    catch (e) { cm = (await db.prepare('SELECT * FROM post_comments WHERE post_id = ? AND hidden = 0 ORDER BY ts ASC LIMIT 300').bind(id).all()).results || []; }
    const likes = await db.prepare('SELECT COUNT(*) n FROM post_likes WHERE post_id = ?').bind(id).first();
    const moreRows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} AND p.id != ? AND (p.hospital_id = ? OR p.author_id = ?) ORDER BY (CASE WHEN p.author_id = ? THEN 0 ELSE 1 END), p.created DESC LIMIT 5`).bind(id, r.hospital_id, r.author_id || '-', r.author_id || '-').all()).results || [];
    const imgs = images(r.images);
    const text = plain(r.body);
    const tags = tagsOf(r.tags);
    const who = r.author_name ? r.author_name + ' 상담사' : r.hospital_name;
    const roots = cm.filter(c => !c.parent_id), kids = cm.filter(c => c.parent_id && roots.some(x => x.id === c.parent_id));
    const cHtml = (c, cls) => `<div class="c ${cls}"><div class="hd"><b>${esc(c.name || '익명')}</b>${c.by_hospital ? '<span class="badge">상담소</span>' : ''}<time datetime="${iso(c.ts)}">${kdate(c.ts)}</time></div><p>${esc(c.text)}</p></div>`;
    const shown = roots.length + kids.length;
    const app = `${APP}/?post=${encodeURIComponent(id)}`;
    return html(page(site, {
      title: `${r.title} — ${who}`, desc: text.slice(0, 150), path: '/blog/' + id, type: 'article',
      ogImage: imgs.length ? `${site}/blog/img/${id}/0.jpg` : '', script: POST_JS(id),
      jsonld: { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: r.title, description: text.slice(0, 150),
        datePublished: iso(r.created), dateModified: iso(r.updated || r.created), mainEntityOfPage: `${site}/blog/${id}`,
        author: r.author_name ? { '@type': 'Person', name: r.author_name, jobTitle: '심리상담사', url: `${site}/blog/a/${r.author_id}`, worksFor: { '@type': 'Organization', name: r.hospital_name } } : { '@type': 'Organization', name: r.hospital_name },
        publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: site + '/icon.png' } },
        image: imgs.map((x, i) => `${site}/blog/img/${id}/${i}.jpg`), keywords: tags.join(', '), commentCount: shown,
        interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: (likes && likes.n) || 0 },
        comment: roots.slice(0, 30).map(c => ({ '@type': 'Comment', text: c.text, dateCreated: iso(c.ts), author: { '@type': 'Person', name: c.name || '익명' } })) },
      body: `<div class="grid"><div><article class="post">
          <div class="tags">${tags.map(t => `<a href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>
          <h1>${esc(r.title)}</h1>
          <div class="byline">${avatar(r.author_id, r.author_name || r.hospital_name, 'md')}<div style="flex:1"><b>${r.author_id ? `<a href="/blog/a/${esc(r.author_id)}">${esc(who)}</a>` : esc(who)}</b>
            <span class="m"><a href="/blog/h/${esc(r.hospital_id)}">${esc(r.hospital_name)}</a> · <time datetime="${iso(r.created)}">${kdate(r.created)}</time>${r.updated && r.updated - r.created > 60000 ? ' · 수정됨' : ''} · 조회 ${r.views || 0}</span></div>
            ${r.author_id ? `<a class="btn ghost" href="/blog/a/${esc(r.author_id)}">블로그</a>` : ''}</div>
          ${bodyHtml(r.body, id, imgs.length, r.title)}
          <div class="acts"><button class="act" data-a="like">♥ 공감 ${(likes && likes.n) || 0}</button><button class="act" data-a="share">공유</button><a class="act" href="${esc(app)}">앱에서 보기</a></div></article>
          <div class="card appcard" style="margin-top:1rem"><h2>이 글을 쓴 ${r.author_name ? '상담사' : '상담소'}와 이야기해 보고 싶다면</h2><p>마인드 인사이드 앱에서 전화·채팅으로 바로 상담을 예약할 수 있어요.</p><a class="btn" href="${APP}/${r.author_id ? '?counselor=' + esc(r.author_id) : ''}">상담 알아보기</a></div>
          <section class="cm"><div class="sec"><h2>댓글 <span id="cm-n">${shown}</span></h2></div>
            <div id="cm-list">${roots.length ? roots.map(c => cHtml(c, '') + kids.filter(k => k.parent_id === c.id).map(k => cHtml(k, 'r')).join('')).join('') : '<p class="m">첫 댓글을 남겨보세요. 따뜻한 한마디면 충분해요.</p>'}</div>
            <div class="form"><button id="cm-to" class="tag" data-a="noreply" hidden style="border:0"></button><input id="cm-name" maxlength="20" placeholder="별명 (비워 두면 익명)"><textarea id="cm-text" maxlength="500" placeholder="댓글을 남겨보세요"></textarea>
              <div class="row"><span>연락처는 자동으로 가려져요. 모두에게 보이는 공개 댓글이에요.</span><button class="btn" data-a="send">올리기</button></div></div></section>
        </div><aside>${moreRows.length ? `<div class="card"><h2>이어서 읽기</h2><ol class="rank">${moreRows.map(m => `<li><div><a href="/blog/${esc(m.id)}">${esc(m.title)}</a><span class="m">${esc(m.author_name ? m.author_name + ' 상담사' : m.hospital_name)} · 공감 ${m.likes || 0}</span></div></li>`).join('')}</ol></div>` : ''}${appCard}</aside></div>` }));
  } catch (e) {
    // 표나 칸이 아직 없는 배포에서도 앱 전체가 죽지 않게
    return notFound(site);
  }
}

// 글이 발행되면 네이버·빙(IndexNow)에 새 주소를 알린다 — 검색엔진이 지도를 다시 읽으러 올 때까지 기다리지 않게.
//  구글은 이런 알림 창구가 없다(사이트맵을 주기적으로 읽는다).
export function pingIndexNow(ctx, id, env) {
  const u = encodeURIComponent(`${siteOf(env)}/blog/${cleanId(id)}`);
  const all = Promise.all(['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']
    .map(ep => fetch(`${ep}?url=${u}&key=${INDEXNOW_KEY}`).catch(() => {})));
  if (ctx && ctx.waitUntil) ctx.waitUntil(all);
  return all;
}
