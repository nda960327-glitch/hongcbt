// 마인드 인사이드 커뮤니티의 공개 웹 — 네이버·구글·다음이 읽을 수 있는 진짜 HTML 로 그리는 커뮤니티 포털.
//
//  mindinside.kr 의 첫 화면이 곧 커뮤니티다(앱 소개는 /about/). 앱(mindinsideapp.com)은 같은 화면을 /blog 주소로 앱 안에 띄운다.
//   · /  (mindinside.kr) · /blog      포털 첫 화면 — 인기 글 · 게시판별 새 글 · 베스트 댓글 · 인기 태그 · 활발한 상담사
//   · /blog?board=&sort=hot|new&tag=&q=&page=   글 목록
//   · /blog/<글 id>              글 하나 + 댓글·답글. 공감·댓글·답글·댓글 공감·신고는 페이지의 스크립트가 앱과 같은 API 로 한다
//   · /blog/write?board=         이용자 글쓰기(수다방 · 고민 Q&A · 심리학도 라운지 · 기능 제안)
//   · /blog/login · /blog/me     로그인·회원가입(카카오·네이버·구글 — 앱 계정과 같은 계정) · 내 정보와 내가 쓴 글
//   · /blog/videos · /blog/clinics  추천 영상(운영팀이 고른 유튜브) · 내 주변 정신건강의학과(공공데이터)
//   · /blog/a/<상담사 id>        상담사 블로그(자기 페이지)
//   · /blog/centers · /blog/h/<상담소 id>   제휴 상담소 찾기 · 상담소 페이지(소개 + 글)
//   · /blog/img/<글 id>/<n>.jpg · /blog/av/<상담사 id>.jpg       사진 (DB 에는 data: 로 들어 있다)
//   · /blog/sitemap.xml · /blog/rss.xml   검색엔진용
//  게시판(posts.board): 없음=상담사 칼럼 · free=수다방 · neru=느루 자랑방 · qna=고민 Q&A · meds=약 이야기 · student=심리학도 라운지 · resident=전공의 라운지 · expert=전문가 라운지 · idea=기능 제안 · notice=공지 (community.js 와 같은 규칙)
//  발행된(published=1) · 숨기지 않은(hidden=0) · 운영 중인 상담소(active=1)의 글만 내보낸다.
//  글이 발행되면 IndexNow 로 네이버·빙에 바로 알린다(pingIndexNow — community.js 가 부른다).
//  웹에서 누른 공감·댓글·글은 앱과 같은 표에 들어간다. 앱 도메인에서 열리면 앱의 기기 식별(cbt_client_id)을 그대로 쓴다 — 앱과 웹이 한 사람.
//  이용자끼리 1:1 로 연락하는 길(쪽지)은 일부러 두지 않는다 — 위기에 놓인 사람들이 서로를 따로 불러내는 통로가 되면 안 된다.
const BRAND = '마인드 인사이드';
const APP = 'https://mindinsideapp.com';
const API = 'https://cbt-proxy.hongcbt.workers.dev';
const BIZ = '마인드 인사이드 · 대표 노도아 · 사업자등록번호 448-87-03724 · 서울특별시 강남구 언주로98길 14, 4층 303호(역삼동, 예일빌딩) · mindinsideapp@gmail.com';
export const INDEXNOW_KEY = '7c1e5a9d3f8b4a62b0d4e6f1a2c3d5e7';   // <사이트>/<키>.txt 에 같은 값이 있어야 한다 (home/)
// 대표 주소 — 검색엔진에는 이 주소 하나로만 알린다(canonical). 같은 글이 두 도메인에서 열려도 중복으로 치지 않게.
export const siteOf = env => String((env && env.BLOG_SITE) || 'https://mindinside.kr').replace(/\/+$/, '');

const BOARD = {
  column: { name: '상담사 칼럼', desc: '심리상담사와 상담소가 직접 쓰는 마음 돌봄 이야기' },
  free: { name: '수다방', desc: '오늘 있었던 일, 웃긴 이야기, AI 상담사와 나눈 대화까지 — 편하게 떠들어요' },
  qna: { name: '고민 Q&A', desc: '고민을 올리면 다른 분들과 상담사가 답해요' },
  neru: { name: '느루 자랑방', desc: '내가 키운 느루, 느루와 나눈 대화, 오늘의 기록 — 캡처해서 마음껏 자랑해요' },
  meds: { name: '약 이야기', desc: '복용 경험과 궁금증을 나눠요. 약을 바꾸거나 끊는 결정은 주치의와 — 특정 약을 권하거나 용량을 알려주는 글은 가려져요' },
  student: { name: '심리학도 라운지', desc: '심리·상담을 공부하는 대학생·대학원생의 공부, 수련, 진로 이야기' },
  resident: { name: '전공의 라운지', desc: '정신건강의학과 전공의·수련의의 수련 생활, 공부, 진로 이야기' },
  expert: { name: '전문가 라운지', desc: '정신건강의학과 의사·심리상담사·임상심리사가 현장 이야기와 사례 고민(개인정보 없이)을 나누는 곳' },
  idea: { name: '기능 제안', desc: '앱에 바라는 기능, 불편한 점, 오류 신고 — 공감이 많은 제안부터 살펴봐요' },
  notice: { name: '공지', desc: '운영팀이 알리는 소식과 커뮤니티 규칙' }
};
const WRITABLE = ['free', 'neru', 'qna', 'meds', 'student', 'resident', 'expert', 'idea'];

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = b => String(b || '').replace(/\[img:\d+\]/g, '').replace(/\{(red|orange|green|blue|purple|gray)\|([^{}]*)\}/g, '$2')
  .replace(/\*\*/g, '').replace(/^#{1,2}\s+/gm, '').replace(/^- /gm, '').replace(/\s+/g, ' ').trim();
const images = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch (e) { return []; } };
const kdate = ts => { const d = new Date(Number(ts) + 9 * 3600000); return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`; };
const ago = ts => { const m = Math.floor((Date.now() - Number(ts)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.floor(m / 60) + '시간 전' : m < 10080 ? Math.floor(m / 1440) + '일 전' : kdate(ts); };
const iso = ts => new Date(Number(ts)).toISOString();
const cleanId = v => String(v || '').slice(0, 64).replace(/[^\w-]/g, '');
const tagsOf = v => String(v || '').split(',').filter(Boolean);
const boardOf = r => (r.board && BOARD[r.board]) ? r.board : 'column';
const jpeg = src => {
  const m = src && String(src).match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return new Response('not found', { status: 404 });
  const bin = atob(m[1]); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Response(u8, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
};

// 본문 표기 → HTML (앱 js/community.js _body 와 같은 규칙 + '- ' 목록). 사진은 /blog/img/… 주소로.
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
    if (t.split('\n').every(l => /^- /.test(l))) return '<ul>' + t.split('\n').map(l => '<li>' + inline(l.slice(2)) + '</li>').join('') + '</ul>';
    return '<p>' + inline(t).replace(/\[img:(\d+)\]/g, (m, n) => +n < nImg ? '</p>' + fig(+n) + '<p>' : '') + '</p>';
  }).join('').replace(/<p><\/p>/g, '');
}

const CSS = `*{box-sizing:border-box}html{scroll-behavior:smooth}[hidden]{display:none!important}
body{margin:0;font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f7f3ec;color:#2f2923;line-height:1.7;letter-spacing:-.01em;-webkit-text-size-adjust:100%}
a{color:#3d7659;text-decoration:none}a:hover{text-decoration:underline}button{font:inherit;cursor:pointer}
.serif,.hero h1,article.post h1,.cover h1,.feat h3{font-family:"Gowun Batang","Pretendard Variable",serif;letter-spacing:-.02em}
.top{background:rgba(255,255,255,.86);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid rgba(120,96,66,.12);position:sticky;top:0;z-index:20}
.top .in{max-width:1080px;margin:0 auto;padding:.65rem 1rem;display:flex;align-items:center;gap:.9rem}
.brand{font-weight:900;font-size:1.05rem;color:#2f2923;white-space:nowrap}.brand b{color:#4f8a6b}.brand:hover{text-decoration:none}
.top nav{display:flex;gap:.1rem;flex:1;overflow-x:auto;scrollbar-width:none}.top nav::-webkit-scrollbar{display:none}
.top nav a{padding:.4rem .55rem;border-radius:999px;font-weight:700;font-size:.87rem;color:#6b5f50;white-space:nowrap}.top nav a.on,.top nav a:hover{background:#eef6f0;color:#2f6b4c;text-decoration:none}
.btn{display:inline-block;background:#4f8a6b;color:#fff!important;font-weight:800;font-size:.85rem;padding:.55rem 1rem;border-radius:999px;border:0;white-space:nowrap;transition:transform .12s ease,background .12s ease}.btn:hover{text-decoration:none;background:#437a5d}.btn:active{transform:scale(.97)}
.btn.ghost{background:#fff;color:#2f2923!important;border:1.5px solid rgba(120,96,66,.18)}.btn.ghost:hover{background:#faf6ef}.btn.lg{font-size:.95rem;padding:.75rem 1.3rem}.btn:disabled{opacity:.6}
.wrap{max-width:1080px;margin:0 auto;padding:1rem}.grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:1.1rem;align-items:start}
@media(max-width:860px){.grid{grid-template-columns:minmax(0,1fr)}.top .btn.app{display:none}}
.hero{position:relative;overflow:hidden;border-radius:26px;padding:1.7rem;margin-bottom:1rem;color:#fff;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;background:radial-gradient(120% 140% at 0% 0%,#5c9a79 0%,#3f7a5c 55%,#2f6249 100%);box-shadow:0 18px 40px -22px rgba(47,98,73,.7)}
.hero::after{content:"";position:absolute;right:-60px;top:-80px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.08)}
.hero .sp{flex:1;min-width:240px;position:relative;z-index:1}.hero .new{display:inline-block;background:#fdecc4;color:#7a5400;font-weight:800;font-size:.74rem;padding:.15rem .7rem;border-radius:999px;margin-bottom:.5rem}
.hero h1{margin:0 0 .3rem;font-size:1.6rem;line-height:1.4}.hero p{margin:0;opacity:.93;font-size:.95rem}.hero .cta{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;position:relative;z-index:1;min-width:250px}.hero .cta .btn{text-align:center}.hero .cta .btn:first-child{grid-column:1/3}.hero .btn{background:#fff;color:#2f6b4c!important;box-shadow:0 6px 16px -8px rgba(0,0,0,.4)}.hero .btn.line{background:transparent;color:#fff!important;border:1.5px solid rgba(255,255,255,.6);box-shadow:none}
.tabs{display:flex;gap:.4rem;overflow-x:auto;scrollbar-width:none;margin-bottom:1rem;align-items:center}.tabs::-webkit-scrollbar{display:none}
.tabs a{flex-shrink:0;padding:.5rem 1rem;border-radius:999px;background:#fff;border:1.5px solid rgba(120,96,66,.14);font-weight:800;font-size:.88rem;color:#4a4037}.tabs a.on{background:#2f2923;border-color:#2f2923;color:#fff}.tabs a:hover{text-decoration:none}
.search{display:flex;gap:.4rem;margin-bottom:1rem}.search input{flex:1;font:inherit;padding:.8rem 1.2rem;border-radius:999px;border:1.5px solid rgba(120,96,66,.16);background:#fff;min-width:0;box-shadow:0 1px 2px rgba(60,45,25,.04)}.search input:focus{outline:none;border-color:#4f8a6b}
.card,article.post,.form,.cm .c{background:#fff;border:1px solid rgba(120,96,66,.12);box-shadow:0 1px 2px rgba(60,45,25,.04),0 8px 24px -12px rgba(60,45,25,.10)}
.card{border-radius:20px;padding:1.15rem 1.25rem;margin-bottom:1rem}.card>h2,.sec>h2{margin:0 0 .6rem;font-size:1.05rem;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:.4rem}.card>h2 a.all,.sec>h2 a.all{margin-left:auto;font-size:.78rem;font-weight:700;color:#8a7b68}
.notice{display:flex;gap:.6rem;align-items:center;padding:.45rem 0;border-top:1px solid rgba(120,96,66,.1);font-size:.92rem}.notice:first-of-type{border-top:0}.notice a{color:#2f2923;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lab{display:inline-block;flex-shrink:0;font-weight:800;font-size:.72rem;padding:.12rem .6rem;border-radius:999px;background:#eef6f0;color:#2f6b4c}.lab.gold{background:#fdecc4;color:#9a6b00}.lab.free{background:#e8effb;color:#2d64a8}.lab.qna{background:#f3e9fb;color:#7a4fb0}.lab.neru{background:#fff1d6;color:#a8690a}.lab.meds{background:#e7f3e2;color:#3f7a2a}.lab.student{background:#e0f3f0;color:#1f7a70}.lab.resident{background:#fbe9ec;color:#a8324a}.lab.expert{background:#e6ecf5;color:#33507d}.lab.idea{background:#fdeee0;color:#b5651d}.lab.notice{background:#2f2923;color:#fff}
.rank{list-style:none;margin:0;padding:0;counter-reset:r}.rank li{counter-increment:r;display:flex;gap:.7rem;align-items:flex-start;padding:.65rem 0;border-top:1px solid rgba(120,96,66,.1)}.rank li:first-child{border-top:0}
.rank li::before{content:counter(r);flex:0 0 1.6rem;height:1.6rem;border-radius:9px;background:#f6f1e8;color:#8a7b68;font-weight:900;font-size:.85rem;display:flex;align-items:center;justify-content:center}.rank li:nth-child(-n+3)::before{background:#4f8a6b;color:#fff}.rank[start] li:nth-child(3)::before{background:#f6f1e8;color:#8a7b68}
.rank a{color:#2f2923;font-weight:700;line-height:1.45;display:block}.m{color:#8a7b68;font-size:.76rem;font-weight:500}.cnt{color:#c9463d;font-weight:800;font-size:.8rem;margin-left:.25rem}
.feed{list-style:none;margin:0;padding:0}.feed li{border-top:1px solid rgba(120,96,66,.1)}.feed li:first-child{border-top:0}.feed a.row{display:flex;gap:.9rem;padding:1.05rem 0;color:inherit;align-items:center}.feed a.row:hover{text-decoration:none}.feed a.row:hover h3{color:#2f6b4c}
.feed h3{margin:0 0 .15rem;font-size:1.06rem;font-weight:800;letter-spacing:-.02em;line-height:1.45}.feed p{margin:0 0 .3rem;color:#6b5f50;font-size:.88rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.feed .th{width:104px;height:104px;border-radius:16px;flex-shrink:0;object-fit:cover}.who{display:flex;align-items:center;gap:.35rem;font-size:.78rem;color:#6b5f50;margin-bottom:.25rem}
.list{list-style:none;margin:0;padding:0}.list li{display:flex;gap:.5rem;align-items:baseline;padding:.42rem 0;border-top:1px solid rgba(120,96,66,.08);font-size:.93rem}.list li:first-child{border-top:0}.list a{color:#2f2923;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.list .m{margin-left:auto;flex-shrink:0}
.av{width:22px;height:22px;border-radius:50%;object-fit:cover;background:#dfeee5;color:#2f6b4c;font-weight:800;font-size:.7rem;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}.av.lg{width:76px;height:76px;font-size:1.6rem}#me-av{line-height:0}.cm .hd .av{margin-right:.1rem}.av.md{width:40px;height:40px;font-size:1rem}
.tags a,.tag{display:inline-block;background:#eef6f0;color:#2f6b4c;font-size:.82rem;font-weight:700;padding:.28rem .8rem;border-radius:999px;margin:0 .3rem .4rem 0}.tags a:hover{background:#dcefe3;text-decoration:none}
.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;margin-bottom:1rem}.boards .card{margin:0}
.best{list-style:none;margin:0;padding:0}.best li{position:relative;padding:.6rem 0 .6rem 1rem;border-top:1px solid rgba(120,96,66,.1)}.best li:first-child{border-top:0}.best li::before{content:"";position:absolute;left:0;top:.9rem;bottom:.9rem;width:3px;border-radius:3px;background:#f0c56b}.best q{display:block;font-size:.9rem;line-height:1.55;quotes:none}.best a{color:#2f2923}
.people{list-style:none;margin:0;padding:0}.people li{border-top:1px solid rgba(120,96,66,.1)}.people li:first-child{border-top:0}.people a{display:flex;align-items:center;gap:.6rem;padding:.5rem 0;color:#2f2923}.people a:hover{text-decoration:none}.people a:hover b{color:#2f6b4c}.people b{display:block;font-size:.9rem;line-height:1.3}
.appcard{background:#fff8ec;border-color:#f0dfbf}.appcard p{margin:.2rem 0 .7rem;font-size:.88rem;color:#6b5f50}
.pager{display:flex;gap:.5rem;justify-content:center;margin:1rem 0}
.ph{display:flex;align-items:flex-end;padding:.5rem .6rem;color:#fff;font-weight:800;font-size:.74rem;line-height:1.25;overflow:hidden}
.g0{background:linear-gradient(135deg,#7fb69a,#4f8a6b)}.g1{background:linear-gradient(135deg,#f0b98a,#d98a5a)}.g2{background:linear-gradient(135deg,#9bb6e0,#6a8cc7)}.g3{background:linear-gradient(135deg,#c9a9e0,#9a78c2)}.g4{background:linear-gradient(135deg,#e9c46a,#c99a2e)}.g5{background:linear-gradient(135deg,#8fcfc9,#4fa39b)}
.feat{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:1.1rem;color:inherit;margin-bottom:.4rem;padding-bottom:1rem;border-bottom:1px solid rgba(120,96,66,.1)}.feat:hover{text-decoration:none}.feat:hover h3{color:#2f6b4c}
.feat .cv{aspect-ratio:16/10;border-radius:18px;width:100%;object-fit:cover;display:block}.feat h3{margin:.3rem 0 .4rem;font-size:1.4rem;line-height:1.4}.feat p{margin:0 0 .5rem;color:#6b5f50;font-size:.93rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.feat .m{display:block}
article.post{border-radius:24px;padding:1.9rem 1.7rem}article.post h1{font-size:1.75rem;line-height:1.4;margin:.4rem 0 .8rem}article.post h2{font-size:1.2rem;font-weight:800;margin:2rem 0 .5rem;padding-left:.7rem;border-left:4px solid #4f8a6b}
article.post p,article.post li{font-size:1.05rem;line-height:1.85;color:#3a332c}article.post p{margin:0 0 1rem}article.post ul{margin:0 0 1rem;padding-left:1.3rem}article.post .big{font-size:1.2rem;font-weight:700;color:#2f2923}
figure{margin:.4rem 0 1.2rem}figure img{display:block;width:100%;height:auto;border-radius:16px}
.c-red{color:#c9463d}.c-orange{color:#d97a1c}.c-green{color:#2f7d4f}.c-blue{color:#2d64a8}.c-purple{color:#7a4fb0}.c-gray{color:#7f7264}
.byline{display:flex;align-items:center;gap:.7rem;padding-bottom:.9rem;margin-bottom:1.1rem;border-bottom:1px solid rgba(120,96,66,.1)}.byline b{display:block;line-height:1.3}.byline a{color:#2f2923}
.crisis{background:#fdf0ef;border:1px solid #f1c7c3;color:#8f2f28;border-radius:16px;padding:.8rem 1rem;margin-bottom:1rem;font-size:.9rem}
.acts{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1.3rem;padding-top:1rem;border-top:1px solid rgba(120,96,66,.1)}.act{background:#fff;border:1.5px solid rgba(120,96,66,.18);border-radius:999px;padding:.5rem 1rem;font-weight:800;font-size:.88rem;color:#2f2923;transition:transform .12s}.act:active{transform:scale(.96)}.act:hover{text-decoration:none}.act.on{border-color:#e9a6a1;background:#fdf0ef;color:#c9463d}.act.sub{margin-left:auto;border:0;color:#8a7b68;font-weight:600;padding:.5rem .4rem}
.cm{margin-top:1rem}.cm .c{border-radius:16px;padding:.8rem 1rem;margin:.5rem 0}.cm .c.r{margin-left:1.6rem;background:#fbf8f3}.cm .c.best{border-color:#f0c56b;background:#fffaf0}.cm .c.pro{border-color:#b9d9c6}
.cm .hd{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;font-size:.76rem;color:#8a7b68}.cm .hd b{font-size:.9rem;color:#2f2923}.badge{font-size:.68rem;font-weight:800;color:#2f6b4c;background:#eef6f0;border-radius:999px;padding:.05rem .5rem}.badge.gold{color:#9a6b00;background:#fdecc4}
.cm .c p{margin:.25rem 0 .35rem;white-space:pre-wrap;word-break:break-word}.cm .ft{display:flex;gap:.9rem}.cm .ft button{background:none;border:0;padding:0;font-size:.78rem;font-weight:700;color:#8a7b68}.cm .ft button.on{color:#c9463d}.cm .ft button.rp{margin-left:auto;font-weight:500}
.form{border-radius:18px;padding:.9rem;margin-top:.8rem}.form input,.form textarea,.form select{width:100%;font:inherit;border:1.5px solid rgba(120,96,66,.18);border-radius:12px;padding:.65rem .85rem;margin-bottom:.55rem;background:#fff;color:inherit}.form textarea{min-height:5rem;resize:vertical;line-height:1.7}.form input:focus,.form textarea:focus{outline:none;border-color:#4f8a6b}
.form .row{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}.form .row span{flex:1;font-size:.76rem;color:#8a7b68;min-width:160px}.form label.ck{display:flex;gap:.5rem;align-items:flex-start;font-size:.85rem;margin:.3rem 0 .7rem}.form label.ck input{width:auto;margin:.25rem 0 0}
.pick{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.7rem}.pick label{cursor:pointer}.pick input{position:absolute;opacity:0}.pick span{display:block;padding:.5rem 1rem;border-radius:999px;border:1.5px solid rgba(120,96,66,.18);font-weight:800;font-size:.88rem;background:#fff}.pick input:checked+span{background:#2f2923;border-color:#2f2923;color:#fff}
.thumbs{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem}.thumbs div{position:relative;width:76px;height:76px}.thumbs img{width:100%;height:100%;object-fit:cover;border-radius:12px}.thumbs button{position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:0;background:#2f2923;color:#fff;font-size:.8rem;line-height:1}
.cover{border-radius:26px;padding:1.9rem 1.6rem;margin-bottom:1rem;display:flex;gap:1.1rem;align-items:center;flex-wrap:wrap;background:radial-gradient(120% 140% at 0% 0%,#e3f1e8,#f7f3ec);border:1px solid rgba(120,96,66,.1)}.cover h1{margin:0;font-size:1.6rem}.cover p{margin:.2rem 0 0;color:#6b5f50}.stats{display:flex;gap:1.2rem;margin-top:.6rem;font-size:.85rem;color:#6b5f50}.stats b{color:#2f2923;font-size:1.05rem;margin-right:.2rem}
.facts{margin:.6rem 0 0;font-size:.88rem;color:#6b5f50}.facts b{color:#2f2923;margin-right:.4rem}
.bhead{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem}.bhead h1{margin:0;font-size:1.35rem}.bhead p{margin:0;color:#6b5f50;font-size:.9rem}.bhead div{flex:1;min-width:200px}
footer{max-width:1080px;margin:0 auto;padding:.5rem 1rem 2.5rem;color:#8a7b68;font-size:.78rem;line-height:1.9}
#toast{position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%);background:#2f2923;color:#fff;padding:.6rem 1rem;border-radius:999px;font-size:.85rem;opacity:0;transition:opacity .2s;pointer-events:none;z-index:50;max-width:92vw}#toast.on{opacity:1}
#say{position:fixed;inset:0;z-index:60;background:rgba(30,25,20,.45);display:flex;align-items:center;justify-content:center;padding:1rem}#say>div{background:#fff;border-radius:22px;padding:1.4rem 1.3rem;max-width:420px;width:100%;box-shadow:0 30px 60px -20px rgba(0,0,0,.4)}#say h3{margin:0 0 .5rem;font-size:1.1rem}#say p{margin:0 0 1rem;color:#4a4037;font-size:.95rem;white-space:pre-wrap}#say .row{display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap}
.fab{display:none}@media(max-width:860px){.fab{display:flex;position:fixed;right:1rem;bottom:1.1rem;z-index:30;box-shadow:0 10px 24px -8px rgba(47,98,73,.7);padding:.8rem 1.2rem;font-size:.95rem}}
@media(max-width:640px){.feat{grid-template-columns:1fr}.feat h3{font-size:1.2rem}.feed .th{width:84px;height:84px}.hero{padding:1.3rem 1.2rem}.hero h1{font-size:1.3rem}.wrap{padding:.8rem}article.post{padding:1.3rem 1.1rem}article.post h1{font-size:1.4rem}}
.roles{display:flex;flex-direction:column;gap:.5rem;margin-bottom:.8rem;text-align:left}.role{display:block;border:1.5px solid rgba(120,96,66,.16);border-radius:14px;padding:.7rem .9rem;color:#2f2923}.role:hover{text-decoration:none;border-color:#4f8a6b}.role.on{border-color:#4f8a6b;background:#eef6f0}.role b{display:block}.role span{font-size:.8rem;color:#6b5f50}
.steps{counter-reset:s;list-style:none;margin:0;padding:0}.steps li{counter-increment:s;position:relative;padding:.35rem 0 .35rem 2rem;font-size:.92rem}.steps li::before{content:counter(s);position:absolute;left:0;top:.4rem;width:1.4rem;height:1.4rem;border-radius:50%;background:#4f8a6b;color:#fff;font-weight:800;font-size:.78rem;display:flex;align-items:center;justify-content:center}
.jcard{display:flex;flex-direction:column;gap:.3rem;color:#2f2923}.jcard:hover{text-decoration:none;border-color:#4f8a6b}.jcard h2{margin:.4rem 0 0}.jcard p{margin:0 0 .8rem;color:#6b5f50;font-size:.9rem;flex:1}.jcard .btn{align-self:flex-start}.jcard .lab{align-self:flex-start}
.jform h3{margin:1.4rem 0 .7rem;font-size:1rem;padding-bottom:.4rem;border-bottom:1px solid rgba(120,96,66,.12)}.jform h3:first-child{margin-top:0}.fl{display:block;margin-bottom:.8rem}.fl>span{display:block;font-size:.82rem;font-weight:700;color:#4a4037;margin-bottom:.3rem}.fl em{display:block;font-style:normal;font-size:.76rem;color:#8a7b68;margin-top:-.25rem}.fl input,.fl select,.fl textarea{margin-bottom:.4rem}
.vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:1rem}.vcard{display:flex;flex-direction:column;gap:.25rem;color:#2f2923;background:#fff;border:1px solid rgba(120,96,66,.12);border-radius:18px;padding:.6rem .6rem .8rem;box-shadow:0 1px 2px rgba(60,45,25,.04),0 8px 24px -12px rgba(60,45,25,.10)}.vcard:hover{text-decoration:none}.vcard:hover b{color:#2f6b4c}.vcard img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;background:#eee}.vcard b{font-size:.93rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:.2rem}.vnote{font-size:.8rem;color:#6b5f50;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lgs{display:flex;flex-direction:column;gap:.6rem}.lg{border:0;border-radius:14px;padding:.9rem 1rem;font-weight:800;font-size:1rem;width:100%}.lg-kakao{background:#fee500;color:#191600}.lg-naver{background:#03c75a;color:#fff}.lg-google{background:#fff;color:#2f2923;border:1.5px solid rgba(120,96,66,.2)}
#acct .btn{padding:.42rem .85rem;max-width:9rem;overflow:hidden;text-overflow:ellipsis}.embed .top .btn.app,.embed footer,.embed .hero,.embed .appcard.side{display:none}.embed .top{position:static}.embed .wrap{padding-top:.6rem}`;

// 모든 페이지에 들어가는 스크립트 — 내 기기 식별(앱과 같은 방식) · 알림 · 앱 안에 띄워졌을 때의 처리.
const COMMON_JS = `<script>(function(){
var W=window.MI={};W.API=/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)?location.origin:${JSON.stringify(API)};
var inApp=/(^|\\.)mindinsideapp\\.com$/.test(location.hostname),MAP={mi_cid:'cbt_client_id',mi_ckey:'cbt_client_key',mi_name:'cbt_user_name'};
W.ls=function(k,v){try{if(inApp){k=MAP[k]||k;if(v===undefined){var x=localStorage.getItem(k);if(x==null)return'';try{var j=JSON.parse(x);return j==null?'':String(j)}catch(e){return x}}localStorage.setItem(k,JSON.stringify(v));return}
 if(v===undefined)return localStorage.getItem(k)||'';localStorage.setItem(k,v)}catch(e){return''}};
W.esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
W.toast=function(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on')},2600)};
// 알림창 — 서버가 글을 받지 않았을 때(위기 표현·욕설 등) 이유와 도움받을 곳을 보여준다
W.say=function(title,msg,crisis){var d=document.createElement('div');d.id='say';d.innerHTML='<div role="alertdialog" aria-modal="true"><h3>'+W.esc(title)+'</h3><p>'+W.esc(msg)+'</p><div class="row">'+(crisis?'<a class="btn ghost" href="tel:109">109 전화하기</a>':'')+'<button class="btn">확인</button></div></div>';
 d.addEventListener('click',function(e){if(e.target===d||e.target.closest('button'))d.remove()});document.body.appendChild(d)};
W.refused=function(j){if(j.error==='login'){W.setAuth('');W.needLogin();return true}if(j.error==='crisis'){W.say('지금 많이 힘드신 것 같아요',j.message,true);return true}if(j.error==='abuse'||j.error==='contact'||j.error==='short'){W.say('이 글은 올릴 수 없어요',j.message||'');return true}return false};
W.me=function(){var id=W.ls('mi_cid');if(!id){id='u_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);W.ls('mi_cid',id)}
 var key=W.ls('mi_ckey');if(key)return Promise.resolve({id:id,key:key});
 return fetch(W.API+'/client/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:id})}).then(function(r){return r.json()}).then(function(d){if(d&&d.clientKey)W.ls('mi_ckey',d.clientKey);return{id:id,key:(d&&d.clientKey)||''}}).catch(function(){return{id:id,key:''}})};
// 로그인 — 앱 계정과 같은 세션. 앱 도메인에서는 앱이 쓰는 칸(cbt_account_session)을 그대로 읽는다 → 앱에서 로그인했으면 여기서도 로그인.
var SK=inApp?'cbt_account_session':'mi_session',UK=inApp?'cbt_account_user':'mi_user';
W.session=function(){try{return localStorage.getItem(SK)||''}catch(e){return''}};
W.user=function(){try{return JSON.parse(localStorage.getItem(UK)||'null')}catch(e){return null}};
W.setAuth=function(s,u){try{if(s){localStorage.setItem(SK,s);localStorage.setItem(UK,JSON.stringify(u||null))}else{localStorage.removeItem(SK);localStorage.removeItem(UK)}}catch(e){}};
W.needLogin=function(){if(W.session())return false;
 if(emb&&inApp){try{window.parent.postMessage({mi:'login'},'*')}catch(x){}W.toast('앱의 마이 탭에서 로그인한 뒤 쓸 수 있어요');return true}
 location.href='/blog/login?next='+encodeURIComponent(location.pathname+location.search);return true};
W.post=function(p,b){b.session=W.session();return W.me().then(function(m){b.clientId=m.id;b.clientKey=m.key;return fetch(W.API+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){j._s=r.status;return j},function(){return{_s:r.status}})})})};
var emb=window.self!==window.top;if(emb)document.documentElement.classList.add('embed');
(function(){var a=document.getElementById('acct');if(!a)return;var u=W.session()?W.user():null;
 a.innerHTML=W.session()?'<a class="btn ghost" href="/blog/me">'+W.esc((u&&u.nickname)||'내 정보')+'</a>':'<a class="btn ghost" href="/blog/login?next='+encodeURIComponent(location.pathname+location.search)+'">로그인</a>'})();
// 앱 안에 띄워졌을 때: 앱으로 가는 링크(상담 예약 등)는 새 화면을 열지 않고 앱에게 알린다
document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a||!emb)return;var h=a.getAttribute('href');
 if(h.indexOf(${JSON.stringify(APP)})===0){e.preventDefault();try{window.parent.postMessage({mi:'app',href:h},'*')}catch(x){}}});
})();</script>`;

function page(c, { title, desc, path, body, ogImage, jsonld, type, noindex, nav, script }) {
  const url = c.site + path;
  const N = (k, href, label) => `<a href="${href}"${nav === k ? ' class="on"' : ''}>${label}</a>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="${type || 'website'}"><meta property="og:site_name" content="${BRAND}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(ogImage || c.site + '/icon.png')}"><meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}"><link rel="alternate" type="application/rss+xml" title="${BRAND} 커뮤니티" href="${c.site}/blog/rss.xml"><link rel="icon" href="/icon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700&display=swap">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}<style>${CSS}</style></head><body>
<header class="top"><div class="in"><a class="brand" href="${c.home}"><b>마인드</b> 인사이드</a><nav>${N('home', c.home, '홈')}${N('column', '/blog?board=column', '칼럼')}${N('free', '/blog?board=free', '수다방')}${N('neru', '/blog?board=neru', '느루 자랑')}${N('qna', '/blog?board=qna', '고민 Q&amp;A')}${N('meds', '/blog?board=meds', '약 이야기')}${N('videos', '/blog/videos', '추천 영상')}${N('clinics', '/blog/clinics', '병원 찾기')}${N('centers', '/blog/centers', '상담소 찾기')}${N('student', '/blog?board=student', '심리학도')}${N('resident', '/blog?board=resident', '전공의')}${N('expert', '/blog?board=expert', '전문가')}${N('idea', '/blog?board=idea', '기능 제안')}${N('notice', '/blog?board=notice', '공지')}<a href="${c.about}">앱 소개</a></nav><span id="acct"></span><a class="btn app" href="${APP}/">앱 열기</a></div></header>
<div class="wrap">${body}</div>
<footer><a href="${c.about}">${BRAND} 앱 소개</a> · <a href="/blog/install">앱 설치</a> · <a href="/blog/login">로그인·회원가입</a> · <a href="/blog/join/counselor">상담사 입점</a> · <a href="/blog/join/clinic">상담소 제휴</a> · <a href="/blog/po_notice_rules">커뮤니티 이용 규칙</a> · <a href="${APP}/terms.html">이용약관</a> · <a href="${APP}/privacy.html">개인정보처리방침</a> · <a href="/blog/rss.xml">RSS</a><br>
이곳의 글과 댓글은 전문 상담이나 진료를 대신하지 않아요. 위기 상황에는 자살예방상담전화 109 · 정신건강 위기상담 1577-0199 (24시간)<br>${BIZ}</footer><div id="toast"></div>${COMMON_JS}${script || ''}</body></html>`;
}
const html = (s, status, maxAge) => new Response(s, { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${maxAge == null ? 60 : maxAge}` } });
const xml = (s, type) => new Response(s, { headers: { 'Content-Type': (type || 'application/xml') + '; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });

const PUB = 'p.published = 1 AND p.hidden = 0 AND h.active = 1';
const FROM = 'FROM posts p JOIN hospitals h ON h.id = p.hospital_id';
const COLS = `p.client_id, p.id, p.title, substr(p.body, 1, 500) AS body, p.tags, p.created, p.updated, p.author_id, p.author_name, p.hospital_id, p.board, p.pinned, h.name AS hospital_name, COALESCE(p.views, 0) AS views,
  (p.images IS NOT NULL AND p.images != '') AS has_img,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id AND c.hidden = 0) AS comments`;
const score = r => (r.likes || 0) * 3 + (r.comments || 0) * 4 + (r.views || 0) * 0.3 + (Date.now() - r.created < 7 * 86400000 ? 6 : 0);
const avatar = (id, name, cls) => id ? `<img class="av ${cls || ''}" src="/blog/av/${esc(id)}.jpg" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;av ${cls || ''}&quot;>${esc(String(name || '상').slice(0, 1))}</span>'">` : `<span class="av ${cls || ''}">${esc(String(name || '익').slice(0, 1))}</span>`;
// 글쓴이 표시 — 상담사 칼럼은 '○○ 상담사 · 상담소'(글쓴이가 없으면 상담소 이름), 이용자 글은 별명
const isSys = r => r.hospital_id === 'community';
const nameOf = r => boardOf(r) === 'column' && !isSys(r) ? (r.author_name ? r.author_name + ' 상담사' : r.hospital_name) : (r.author_name || '익명');
// 이용자 글의 글쓴이 사진 — 계정('acc:<id>')으로 쓴 글만. 사진이 없으면 첫 글자.
const uidOf = v => { const m = String(v || '').match(/^acc:([\w-]+)$/); return m ? m[1] : ''; };
const avatarU = (clientId, name, cls) => { const u = uidOf(clientId); return u ? `<img class="av ${cls || ''}" src="/blog/uav/${esc(u)}.jpg" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;av ${cls || ''}&quot;>${esc(String(name || '익').slice(0, 1))}</span>'">` : `<span class="av ${cls || ''}">${esc(String(name || '익').slice(0, 1))}</span>`; };
const whoHtml0 = r => `<span class="who">${avatar(isSys(r) ? '' : r.author_id, nameOf(r))}<span>${esc(nameOf(r))}${boardOf(r) === 'column' && r.author_name && !isSys(r) ? ' · ' + esc(r.hospital_name) : ''}</span></span>`;
const whoHtml = r => (boardOf(r) !== 'column' && uidOf(r.client_id)) ? `<span class="who">${avatarU(r.client_id, nameOf(r))}<span>${esc(nameOf(r))}</span></span>` : whoHtml0(r);
const meta = r => `<span class="m">${ago(r.created)} · 조회 ${r.views || 0} · 공감 ${r.likes || 0}${r.comments ? ` · 댓글 ${r.comments}` : ''}</span>`;
const labOf = r => `<span class="lab ${boardOf(r)}">${BOARD[boardOf(r)].name}</span>`;
const hashOf = id => String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
const hue = id => 'g' + (hashOf(id) % 6);
// 사진이 없는 글에 대신 보여주는 기본 사진 — Pixabay(Pixabay Content License) 11장, home/img/stock/. 글 id 로 고르니 같은 글은 늘 같은 사진.
const STOCK = 'https://mindinside.kr/img/stock/';
const stockOf = id => STOCK + (hashOf(id) % 11) + '.jpg';
const cover = (r, cls) => `<img class="${cls}" src="${r.has_img ? `/blog/img/${esc(r.id)}/0.jpg` : stockOf(r.id)}" alt="" loading="lazy">`;
const feedHtml = (rows, withLab) => `<ul class="feed">${rows.map(r => `<li><a class="row" href="/blog/${esc(r.id)}"><div style="flex:1;min-width:0">${whoHtml(r)}<h3>${withLab ? labOf(r) + ' ' : ''}${esc(r.title)}${r.comments ? `<span class="cnt">[${r.comments}]</span>` : ''}</h3><p>${esc(plain(r.body).slice(0, 150))}</p>${meta(r)}</div>${cover(r, 'th')}</a></li>`).join('')}</ul>`;
const listHtml = rows => `<ul class="list">${rows.map(r => `<li><a href="/blog/${esc(r.id)}">${esc(r.title)}</a>${r.comments ? `<span class="cnt">[${r.comments}]</span>` : ''}<span class="m">${r.likes ? '공감 ' + r.likes + ' · ' : ''}${ago(r.created)}</span></li>`).join('')}</ul>`;
const appCard = c => `<div class="card appcard side"><h2>마인드 인사이드 앱</h2><p>AI 상담사 느루와 매일 마음을 돌보고, 필요할 때 심리상담사와 전화·채팅으로 상담할 수 있어요.</p><a class="btn" href="${APP}/">앱 열기</a> <a class="btn ghost" href="${c.about}">앱 소개 보기</a></div>`;
const writeCard = `<div class="card"><h2>이야기를 들려주세요</h2><p class="m" style="font-size:.86rem;margin:0 0 .7rem">카카오·네이버·구글로 가입하면 바로 쓸 수 있어요.</p><a class="btn" href="/blog/write?board=free">수다방 글쓰기</a> <a class="btn ghost" href="/blog/write?board=qna">고민 올리기</a></div>`;
const notFound = c => html(page(c, { title: '글을 찾을 수 없어요 — ' + BRAND, desc: '', path: '/blog', noindex: true, body: `<div class="card"><h2>이 글은 지금 볼 수 없어요</h2><p class="m">지워졌거나 가려진 글이에요.</p><p><a class="btn" href="${c.home}">커뮤니티 첫 화면으로</a></p></div>` }), 404, 30);
const profOf = h => { let p = {}; try { p = h && h.profile ? JSON.parse(h.profile) : {}; } catch (e) {} return p || {}; };

// 글 화면의 스크립트 — 공감·댓글·답글·댓글 공감·신고·내 글 지우기. 서버가 그린 댓글을 내 상태까지 넣어 다시 그린다.
const POST_JS = id => `<script>(function(){
var W=window.MI,PID=${JSON.stringify(id)},D=null,replyTo='',$=function(s){return document.querySelector(s)},esc=W.esc;
function ago(ts){var m=Math.floor((Date.now()-ts)/60000);if(m<1)return'방금';if(m<60)return m+'분 전';if(m<1440)return Math.floor(m/60)+'시간 전';var d=new Date(ts);return (d.getMonth()+1)+'월 '+d.getDate()+'일'}
function cHtml(c,cls,mine){var pro=c.byHospital;return '<div class="c '+cls+(pro?' pro':'')+'" data-c="'+esc(c.id)+'"><div class="hd">'+(/^acc:/.test(c.clientId||'')?'<img class="av" src="/blog/uav/'+esc(c.clientId.slice(4))+'.jpg" alt="" onerror="this.remove()">':'')+'<b>'+esc(c.name)+'</b>'+(pro?'<span class="badge">'+(/상담사$/.test(c.name)?'상담사':'상담소')+'</span>':'')+(cls.indexOf('best')>=0?'<span class="badge gold">베스트</span>':'')+'<span>'+ago(c.ts)+'</span></div><p>'+esc(c.text)+'</p><div class="ft"><button data-a="clike" class="'+(c.mine?'on':'')+'">공감 '+(c.likes||0)+'</button><button data-a="reply" data-root="'+esc(c.parentId||c.id)+'" data-n="'+esc(c.name)+'">답글</button>'+(mine&&mine===c.clientId?'<button data-a="cdel">삭제</button>':(pro?'':'<button class="rp" data-a="creport">신고</button>'))+'</div></div>'}
function draw(){if(!D)return;var p=D.post,cm=D.comments||[],my=D.me||'';
 var lk=$('[data-a=like]');lk.classList.toggle('on',!!p.mine);lk.textContent='♥ 공감 '+(p.likes||0);
 if(p.own&&$('[data-a=del]')){$('[data-a=del]').hidden=false;$('[data-a=report]').hidden=true}
 var roots=cm.filter(function(c){return!c.parentId}),kids=cm.filter(function(c){return c.parentId});
 var best=roots.filter(function(c){return(c.likes||0)>=2}).sort(function(a,b){return b.likes-a.likes}).slice(0,3);
 var h=best.map(function(c){return cHtml(c,'best',my)}).join('');
 h+=roots.map(function(c){return cHtml(c,'',my)+kids.filter(function(k){return k.parentId===c.id}).map(function(k){return cHtml(k,'r',my)}).join('')}).join('');
 $('#cm-list').innerHTML=h||'<p class="m">첫 댓글을 남겨보세요. 따뜻한 한마디면 충분해요.</p>';
 $('#cm-n').textContent=cm.length}
function load(){W.me().then(function(m){return fetch(W.API+'/community/post?id='+encodeURIComponent(PID)+'&clientId='+encodeURIComponent(m.id)+(m.key?'&clientKey='+encodeURIComponent(m.key):'')+(W.session()?'&session='+encodeURIComponent(W.session()):''))}).then(function(r){return r.json()}).then(function(d){if(d&&d.ok){D=d;draw()}}).catch(function(){})}
document.addEventListener('click',function(e){var b=e.target.closest('[data-a]');if(!b)return;var a=b.getAttribute('data-a');
 if(a==='like'){W.post('/community/like',{id:PID}).then(function(j){if(j.ok&&D){D.post.likes=j.likes;D.post.mine=j.mine;draw()}})}
 else if(a==='share'){var u=location.href.split('?')[0];if(navigator.share){navigator.share({title:document.title,url:u}).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){W.toast('주소를 복사했어요')})}}
 else if(a==='report'||a==='creport'){var cid=a==='creport'?b.closest('[data-c]').getAttribute('data-c'):PID;if(!confirm('이 '+(a==='creport'?'댓글':'글')+'을 신고할까요? 운영팀이 확인합니다.'))return;W.post('/community/report',{target:a==='creport'?'comment':'post',id:cid,reason:''}).then(function(){W.toast('신고했어요. 운영팀이 확인할게요')})}
 else if(a==='del'){if(!confirm('이 글을 지울까요? 댓글도 함께 지워져요.'))return;W.post('/community/write/delete',{id:PID}).then(function(j){if(j.ok&&j.deleted){location.href='/blog'}else W.toast('지우지 못했어요')})}
 else if(a==='clike'){var id=b.closest('[data-c]').getAttribute('data-c');W.post('/community/comment/like',{cid:id}).then(function(j){if(j.ok&&D){D.comments.forEach(function(c){if(c.id===id){c.likes=j.likes;c.mine=j.mine}});draw()}})}
 else if(a==='reply'){if(W.needLogin())return;replyTo=b.getAttribute('data-root');$('#cm-to').textContent=b.getAttribute('data-n')+' 님에게 답글 쓰는 중 · 취소';$('#cm-to').hidden=false;$('#cm-text').focus()}
 else if(a==='noreply'){replyTo='';$('#cm-to').hidden=true}
 else if(a==='cdel'){var c2=b.closest('[data-c]').getAttribute('data-c');if(!confirm('댓글을 지울까요?'))return;W.post('/community/comment/delete',{cid:c2}).then(function(j){if(j.ok&&D){D.comments=D.comments.filter(function(c){return c.id!==c2&&c.parentId!==c2});draw()}})}
 else if(a==='send'){if(W.needLogin())return;var t=$('#cm-text').value.trim(),n=$('#cm-name').value.trim();if(!t){$('#cm-text').focus();return}W.ls('mi_name',n);b.disabled=true;
  W.post('/community/comment',{id:PID,text:t,name:n||'익명',parentId:replyTo}).then(function(j){b.disabled=false;if(j.ok){if(D){D.comments.push(j.comment);draw()}$('#cm-text').value='';replyTo='';$('#cm-to').hidden=true;W.toast('댓글을 올렸어요')}else if(!W.refused(j))W.toast(j._s===429?'댓글을 너무 자주 올렸어요. 잠시 뒤에 다시 해주세요':'지금은 올리지 못했어요')}).catch(function(){b.disabled=false;W.toast('지금은 올리지 못했어요')})}
});
$('#cm-name').value=W.ls('mi_name')||((W.user()||{}).nickname||'');if(!W.session()){$('#cm-text').placeholder='로그인하면 댓글을 쓸 수 있어요';$('[data-a=send]').textContent='로그인하고 쓰기'}load();
})();</script>`;

const CENTERS_JS = "<script>(function(){\nvar W=window.MI,$=function(s){return document.querySelector(s)},cards=[].slice.call(document.querySelectorAll('[data-ct]')),region='',near=null;\nfunction dist(a,b,c,d){var R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,h=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(h))}\nfunction draw(){var k=$('#ct-q').value.trim().toLowerCase(),n=0;\n cards.forEach(function(c){var ok=(!k||c.getAttribute('data-ct').toLowerCase().indexOf(k)>=0)&&(!region||c.getAttribute('data-rg')===region);c.hidden=!ok;if(ok)n++;\n  var d=c.querySelector('[data-km]');if(near&&c.getAttribute('data-lat')){var km=dist(near[0],near[1],+c.getAttribute('data-lat'),+c.getAttribute('data-lng'));c._km=km;d.textContent=(km<1?Math.round(km*1000)+'m':km.toFixed(1)+'km')+' 거리';d.hidden=false}else{c._km=1e9;d.hidden=true}});\n if(near){var box=$('#ct-list');cards.slice().sort(function(a,b){return a._km-b._km}).forEach(function(c){box.appendChild(c)})}\n $('#ct-n').textContent=n+'곳';$('#ct-empty').hidden=n>0}\n$('#ct-q').addEventListener('input',draw);\n$('#ct-rg').addEventListener('click',function(e){var b=e.target.closest('[data-r]');if(!b)return;region=b.getAttribute('data-r');[].forEach.call(this.querySelectorAll('[data-r]'),function(x){x.classList.toggle('on',x===b)});draw()});\n$('#ct-near').addEventListener('click',function(){var b=this;if(!navigator.geolocation){W.toast('이 브라우저에서는 위치를 쓸 수 없어요');return}b.textContent='위치 확인 중…';\n navigator.geolocation.getCurrentPosition(function(p){near=[p.coords.latitude,p.coords.longitude];b.textContent='가까운 순으로 보는 중';b.classList.add('on');draw()},function(){b.textContent='내 위치에서 가까운 순';W.toast('위치를 확인하지 못했어요. 브라우저의 위치 권한을 확인해 주세요')},{timeout:8000,maximumAge:600000})});\ndraw();\n})();</script>";
const CLINICS_JS = "<script>(function(){\nvar W=window.MI,$=function(s){return document.querySelector(s)};\nfunction km(m){return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km'}\nfunction show(d){var it=(d&&d.items)||[];if(d&&d.error==='not-found'){$('#cl-list').innerHTML='<div class=\"card\"><p class=\"m\">그 지역을 찾지 못했어요. \"강남구\", \"수원 영통\"처럼 적어 보세요.</p></div>';return}\n $('#cl-n').textContent=it.length?(d.center&&d.center.label?d.center.label+' 근처 ':'내 위치 근처 ')+it.length+'곳':'';\n $('#cl-list').innerHTML=it.length?it.map(function(c){var a=c.roadAddr||c.addr;return '<div class=\"card\"><h2>'+W.esc(c.name)+'<span class=\"lab gold\" style=\"margin-left:auto\">'+km(c.dist)+'</span></h2><p class=\"m\" style=\"font-size:.84rem;margin:0 0 .3rem\">'+W.esc(c.kind)+(c.partner?' · 앱 연동 병원':'')+'</p>'+(a?'<p class=\"facts\"><b>주소</b>'+W.esc(a)+'</p>':'')+(c.tel?'<p class=\"facts\"><b>전화</b><a href=\"tel:'+W.esc(c.tel.replace(/[^0-9+]/g,''))+'\">'+W.esc(c.tel)+'</a></p>':'')+'<p style=\"margin:.7rem 0 0\"><a class=\"btn ghost\" target=\"_blank\" rel=\"noopener\" href=\"https://map.naver.com/p/search/'+encodeURIComponent(c.name+' '+(a||''))+'\">지도에서 보기</a></p></div>'}).join(''):'<div class=\"card\"><p class=\"m\">근처에서 찾지 못했어요. 지역 이름으로 다시 찾아보세요.</p></div>'}\nfunction load(qs){$('#cl-list').innerHTML='<div class=\"card\"><p class=\"m\">찾는 중…</p></div>';fetch(W.API+'/clinics/near?'+qs+'&radius=10000&limit=60').then(function(r){return r.json()}).then(show).catch(function(){$('#cl-list').innerHTML='<div class=\"card\"><p class=\"m\">불러오지 못했어요. 잠시 뒤 다시 해주세요.</p></div>'})}\n$('#cl-near').addEventListener('click',function(){if(!navigator.geolocation){W.toast('이 브라우저에서는 위치를 쓸 수 없어요');return}var b=this;b.disabled=true;\n navigator.geolocation.getCurrentPosition(function(p){b.disabled=false;load('lat='+p.coords.latitude+'&lng='+p.coords.longitude)},function(){b.disabled=false;W.toast('위치를 확인하지 못했어요. 지역 이름으로 찾아보세요')},{timeout:8000,maximumAge:600000})});\n$('#cl-form').addEventListener('submit',function(e){e.preventDefault();var v=$('#cl-q').value.trim();if(v)load('q='+encodeURIComponent(v))});\n})();</script>";
const JOIN_JS = "<script>(function(){\nvar W=window.MI,$=function(s){return document.querySelector(s)},F=$('#jf'),mode=F.getAttribute('data-mode'),pics={};\nfunction v(id){var e=$('#'+id);return e?e.value.trim():''}\nfunction shrink(file,px,budget,square,cb){var im=new Image();im.onload=function(){var w=im.naturalWidth,h=im.naturalHeight,cv=document.createElement('canvas'),cx=cv.getContext('2d');\n  var sides=[px,Math.round(px*.8),Math.round(px*.6),Math.round(px*.45)];\n  for(var i=0;i<sides.length;i++){if(square){var s=Math.min(w,h);cv.width=cv.height=Math.min(sides[i],s);cx.drawImage(im,(w-s)/2,(h-s)/2,s,s,0,0,cv.width,cv.height)}else{var sc=Math.min(1,sides[i]/Math.max(w,h));cv.width=Math.round(w*sc);cv.height=Math.round(h*sc);cx.drawImage(im,0,0,cv.width,cv.height)}\n   for(var q=.8;q>=.4;q-=.1){var u=cv.toDataURL('image/jpeg',q);if(u.length<=budget){cb(u);return}}}cb(null)};im.onerror=function(){cb(null)};im.src=URL.createObjectURL(file)}\n[].forEach.call(document.querySelectorAll('[data-pic]'),function(b){var k=b.getAttribute('data-pic'),inp=document.createElement('input');inp.type='file';inp.accept='image/*';\n b.addEventListener('click',function(){inp.click()});\n inp.addEventListener('change',function(){var f=inp.files&&inp.files[0];inp.value='';if(!f)return;var spec={photo:[256,150000,true],licensePhoto:[1000,340000,false],doc:[1000,195000,false]}[k];W.toast('사진을 줄이는 중…');\n  shrink(f,spec[0],spec[1],spec[2],function(u){if(!u){W.toast('이 사진은 쓸 수 없어요. 다른 사진으로 해주세요');return}pics[k]=u;b.textContent='다시 고르기';var pv=$('#pv-'+k);pv.src=u;pv.hidden=false;W.toast('사진을 넣었어요')})})});\nif(mode==='counselor'){fetch(W.API+'/community/hospitals').then(function(r){return r.json()}).then(function(d){var s=$('#j-hosp');(d.items||[]).forEach(function(h){var o=document.createElement('option');o.value=h.id;o.textContent=h.name+(h.addr?' — '+h.addr:'');s.appendChild(o)})}).catch(function(){});\n $('#j-hosp').addEventListener('change',function(){$('#solo').hidden=!!this.value})}\nfunction err(m,id){W.toast(m);var e=id&&$('#'+id);if(e)e.focus()}\nF.addEventListener('submit',function(e){e.preventDefault();var b=$('#j-send');\n if(!$('#j-ok').checked){err('안내 사항에 동의해 주세요');return}\n var body,path;\n if(mode==='counselor'){\n  if(!v('j-name')){err('이름을 적어주세요','j-name');return}if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v('j-email'))){err('이메일을 확인해 주세요','j-email');return}\n  if(!v('j-license')){err('자격을 적어주세요','j-license');return}if(!pics.licensePhoto){err('자격증 사진을 넣어주세요');return}\n  var hosp=v('j-hosp');if(!hosp&&(!v('j-bank')||!v('j-bankno')||!v('j-holder'))){err('정산 계좌를 모두 적어주세요','j-bank');return}\n  body={name:v('j-name'),email:v('j-email'),tel:v('j-tel'),license:v('j-license'),career:v('j-career'),price:Number(v('j-price'))||0,intro:v('j-intro'),tags:v('j-tags').split(',').map(function(x){return x.trim()}).filter(Boolean).slice(0,3),\n   hospitalId:hosp,hospital:hosp?'':v('j-place'),addr:hosp?'':v('j-addr'),bank:v('j-bank'),bankNo:v('j-bankno'),bankHolder:v('j-holder'),photo:pics.photo||'',licensePhoto:pics.licensePhoto};path='/apply'}\n else{\n  if(!v('j-name')){err('상담소 이름을 적어주세요','j-name');return}if(!v('j-doctor')){err('대표자 이름을 적어주세요','j-doctor');return}\n  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(v('j-email'))){err('이메일을 확인해 주세요','j-email');return}\n  if(v('j-bizno').replace(/[^0-9]/g,'').length!==10){err('사업자등록번호 10자리를 확인해 주세요','j-bizno');return}if(!pics.doc){err('사업자등록증 사진을 넣어주세요');return}\n  body={name:v('j-name'),doctor:v('j-doctor'),email:v('j-email'),tel:v('j-tel'),addr:v('j-addr'),bizno:v('j-bizno'),dept:v('j-dept'),intro:v('j-intro'),hours:v('j-hours'),url:v('j-url'),doc:pics.doc};path='/community/hospital-apply'}\n b.disabled=true;b.textContent='보내는 중…';\n W.post(path,body).then(function(j){if(j.ok||j.id){$('#jf').hidden=true;$('#j-done').hidden=false;window.scrollTo(0,0)}else{b.disabled=false;b.textContent='신청하기';W.say('신청을 접수하지 못했어요',(typeof j.error==='string'&&/[가-힣]/.test(j.error)?j.error:j.message)||'입력한 내용을 확인하고 다시 시도해 주세요.')}}).catch(function(){b.disabled=false;b.textContent='신청하기';W.toast('보내지 못했어요. 잠시 뒤 다시 시도해 주세요')})});\n})();</script>";
const LOGIN_JS = "<script>(function(){\nvar W=window.MI,$=function(s){return document.querySelector(s)},q=new URLSearchParams(location.search),auth=q.get('auth'),cn=q.get('cn');\nfunction ss(k,v){try{if(v===undefined)return sessionStorage.getItem(k)||'';sessionStorage.setItem(k,v)}catch(e){return''}}\nvar nx=q.get('next');if(nx&&/^\\/(blog|$)/.test(nx)&&nx.indexOf('//')<0)ss('mi_next',nx);\nfunction done(){var n=ss('mi_next')||'/blog/me';ss('mi_next','');location.replace(/^\\/blog\\/login/.test(n)?'/blog/me':n)}\nfunction fail(m){$('#lg-msg').textContent=m;$('#lg-box').hidden=false}\nif(auth){$('#lg-box').hidden=true;$('#lg-msg').textContent='로그인하는 중…';\n if(!cn||cn!==ss('mi_cn')){fail('이 브라우저에서 시작한 로그인이 아니에요. 다시 로그인해 주세요.')}\n else fetch(W.API+'/oauth/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:auth})}).then(function(r){return r.json()}).then(function(j){if(j&&j.ok){W.setAuth(j.session,j.user);ss('mi_cn','');done()}else fail('로그인이 만료됐어요. 다시 시도해 주세요.')}).catch(function(){fail('로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.')})}\nelse if(W.session()){done()}\nvar NAME={kakao:'카카오로 시작하기',naver:'네이버로 시작하기',google:'Google로 시작하기'};\nfetch(W.API+'/oauth/providers').then(function(r){return r.json()}).then(function(d){var it=(d&&d.items)||[];\n $('#lg-btns').innerHTML=it.map(function(p){return '<button class=\"lg lg-'+p.key+'\" data-p=\"'+p.key+'\">'+(NAME[p.key]||p.name)+'</button>'}).join('')||'<p class=\"m\">지금은 로그인을 쓸 수 없어요.</p>'}).catch(function(){$('#lg-btns').innerHTML='<p class=\"m\">로그인 서버에 연결하지 못했어요.</p>'});\n$('#lg-btns').addEventListener('click',function(e){var b=e.target.closest('[data-p]');if(!b)return;var c=Date.now().toString(36)+Math.random().toString(36).slice(2,12);ss('mi_cn',c);\n location.href=W.API+'/api/oauth/'+b.getAttribute('data-p')+'/start?back='+encodeURIComponent(location.origin+'/blog/login')+'&cn='+c});\n})();</script>";
const ME_JS = "<script>(function(){\nvar W=window.MI,$=function(s){return document.querySelector(s)},photo;\nif(W.needLogin())return;\nvar S=encodeURIComponent(W.session()),P={kakao:'카카오',naver:'네이버',google:'Google'};\nfunction ago(ts){var m=Math.floor((Date.now()-ts)/60000);if(m<60)return Math.max(1,m)+'분 전';if(m<1440)return Math.floor(m/60)+'시간 전';var d=new Date(ts);return (d.getMonth()+1)+'월 '+d.getDate()+'일'}\nfunction head(pf){$('#me-name').textContent=(pf.nick||'회원')+' 님';$('#me-sub').textContent=[P[pf.provider]||'',pf.email||''].filter(Boolean).join(' · ');$('#pf-nick').value=pf.nick||'';\n $('#me-av').innerHTML=pf.hasPhoto?'<img class=\"av lg\" src=\"/blog/uav/'+W.esc(pf.id)+'.jpg?t='+Date.now()+'\" alt=\"\">':'<span class=\"av lg\">'+W.esc(String(pf.nick||'회').slice(0,1))+'</span>';\n var u=W.user()||{};u.nickname=pf.nick||u.nickname;W.setAuth(W.session(),u);W.ls('mi_name',pf.nick||'')}\nfetch(W.API+'/community/profile?session='+S).then(function(r){return r.json()}).then(function(d){if(d&&d.ok)head(d.profile);else if(d&&d.error==='login'){W.setAuth('');W.needLogin()}});\nfetch(W.API+'/community?mine=1&session='+S).then(function(r){return r.json()}).then(function(d){var it=(d&&d.items)||[];\n $('#me-n').textContent=it.length;$('#me-posts').innerHTML=it.length?'<ul class=\"list\">'+it.map(function(p){return '<li><a href=\"/blog/'+W.esc(p.id)+'\">'+W.esc(p.title)+'</a>'+(p.comments?'<span class=\"cnt\">['+p.comments+']</span>':'')+'<span class=\"m\">공감 '+(p.likes||0)+' · 조회 '+(p.views||0)+'</span></li>'}).join('')+'</ul>':'<p class=\"m\">아직 쓴 글이 없어요.</p>'});\nfetch(W.API+'/community/mycomments?session='+S).then(function(r){return r.json()}).then(function(d){var it=(d&&d.items)||[];\n $('#me-cn').textContent=it.length;$('#me-cms').innerHTML=it.length?'<ul class=\"best\">'+it.map(function(c){return '<li><a href=\"/blog/'+W.esc(c.postId)+'\"><q>'+W.esc(String(c.text).slice(0,120))+'</q></a><span class=\"m\">'+W.esc(String(c.title).slice(0,30))+' · '+ago(c.ts)+(c.likes?' · 공감 '+c.likes:'')+'</span></li>'}).join('')+'</ul>':'<p class=\"m\">아직 쓴 댓글이 없어요.</p>'});\ndocument.querySelector('.tabs').addEventListener('click',function(e){var a=e.target.closest('[data-t]');if(!a)return;[].forEach.call(this.querySelectorAll('[data-t]'),function(x){x.classList.toggle('on',x===a)});$('#tab-posts').hidden=a.getAttribute('data-t')!=='posts';$('#tab-cms').hidden=a.getAttribute('data-t')!=='cms'});\n$('#pf-pick').addEventListener('click',function(){$('#pf-file').click()});\n$('#pf-file').addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(!f)return;var im=new Image();\n im.onload=function(){var s=Math.min(im.naturalWidth,im.naturalHeight),cv=document.createElement('canvas');cv.width=cv.height=160;cv.getContext('2d').drawImage(im,(im.naturalWidth-s)/2,(im.naturalHeight-s)/2,s,s,0,0,160,160);\n  for(var q=.8;q>=.4;q-=.1){var u=cv.toDataURL('image/jpeg',q);if(u.length<=38000){photo=u;$('#me-av').innerHTML='<img class=\"av lg\" src=\"'+u+'\" alt=\"\">';W.toast('저장을 누르면 사진이 바뀌어요');return}}W.toast('이 사진은 쓸 수 없어요')};\n im.onerror=function(){W.toast('이 사진은 쓸 수 없어요')};im.src=URL.createObjectURL(f)});\n$('#pf-save').addEventListener('click',function(){var b=this,body={nick:$('#pf-nick').value.trim()};if(photo!==undefined)body.photo=photo;b.disabled=true;\n W.post('/community/profile',body).then(function(j){b.disabled=false;if(j.ok){photo=undefined;head(j.profile);W.toast('저장했어요')}else if(!W.refused(j))W.toast('저장하지 못했어요')}).catch(function(){b.disabled=false;W.toast('저장하지 못했어요')})});\n$('#me-out').addEventListener('click',function(){fetch(W.API+'/oauth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:W.session()})}).catch(function(){}).then(function(){W.setAuth('');location.href='/blog'})});\n})();</script>";

// 글쓰기 화면의 스크립트 — 사진은 브라우저에서 640px·100KB 아래로 줄여 보낸다(서버도 다시 막는다).
const WRITE_JS = `<script>(function(){
var W=window.MI,$=function(s){return document.querySelector(s)},imgs=[],thumbs=[];
if(W.needLogin())return;
$('#w-name').value=W.ls('mi_name')||((W.user()||{}).nickname||'');
function scale(img,px,budget,q0){var w=img.naturalWidth,h=img.naturalHeight,cv=document.createElement('canvas'),cx=cv.getContext('2d');var sides=[px,Math.round(px*.75),Math.round(px*.5)];
 for(var i=0;i<sides.length;i++){var sc=Math.min(1,sides[i]/Math.max(w,h));cv.width=Math.max(1,Math.round(w*sc));cv.height=Math.max(1,Math.round(h*sc));cx.drawImage(img,0,0,cv.width,cv.height);
  for(var q=q0;q>=.45;q-=.09){var u=cv.toDataURL('image/jpeg',q);if(u.length<=budget)return u}}return null}
function drawImgs(){$('#w-thumbs').innerHTML=imgs.map(function(s,i){return '<div><img src="'+s+'" alt=""><button type="button" data-i="'+i+'" aria-label="사진 빼기">×</button></div>'}).join('')}
$('#w-file').addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(!f)return;if(imgs.length>=4){W.toast('사진은 4장까지 넣을 수 있어요');return}
 var im=new Image();im.onload=function(){var full=scale(im,640,100*1024,.72),th=scale(im,240,22*1024,.7);URL.revokeObjectURL(im.src);if(!full){W.toast('이 사진은 넣을 수 없어요');return}imgs.push(full);thumbs.push(th||'');drawImgs()};
 im.onerror=function(){W.toast('이 사진은 넣을 수 없어요')};im.src=URL.createObjectURL(f)});
$('#w-thumbs').addEventListener('click',function(e){var b=e.target.closest('[data-i]');if(!b)return;imgs.splice(+b.getAttribute('data-i'),1);thumbs.splice(+b.getAttribute('data-i'),1);drawImgs()});
$('#w-photo').addEventListener('click',function(){$('#w-file').click()});
$('#w-send').addEventListener('click',function(){var b=this,board=(document.querySelector('input[name=board]:checked')||{}).value,t=$('#w-title').value.trim(),x=$('#w-body').value.trim(),n=$('#w-name').value.trim();
 if(t.length<2){W.toast('제목을 적어주세요');$('#w-title').focus();return}if(x.length<5){W.toast('내용을 조금 더 적어주세요');$('#w-body').focus();return}
 if(!$('#w-ok').checked){W.toast('이용 규칙에 동의해 주세요');return}
 W.ls('mi_name',n);b.disabled=true;b.textContent='올리는 중…';
 var body=x+imgs.map(function(s,i){return '\\n\\n[img:'+i+']'}).join('');
 var back=function(){b.disabled=false;b.textContent='올리기'};
 W.post('/community/write',{board:board,title:t,body:body,name:n||'익명',images:imgs,thumb:thumbs[0]||''}).then(function(j){if(j.ok){location.href='/blog/'+j.post.id}else{back();if(!W.refused(j))W.toast(j._s===429?'글은 하루 5개까지, 30초에 하나씩 올릴 수 있어요':j.message||'지금은 올리지 못했어요')}}).catch(function(){back();W.toast('지금은 올리지 못했어요')})});
})();</script>`;

export async function handleBlog(request, env, ctx, path) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const isKr = /(^|\.)mindinside\.kr$/.test(url.hostname) || /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (path === '/' && isKr) path = '/blog';
  if (path !== '/blog' && !path.startsWith('/blog/')) return null;
  const site = siteOf(env);
  // 이 요청이 온 사이트의 길 — 홈페이지(mindinside.kr)에서는 첫 화면이 '/', 앱 도메인에서는 '/blog'
  const c = { site, home: isKr ? '/' : '/blog', about: isKr ? '/about/' : site + '/about/' };
  const db = env.DB;
  if (!db) return notFound(c);
  try {
    if (path === '/blog/sitemap.xml') {
      const rows = (await db.prepare(`SELECT p.id, p.updated, p.created, p.hospital_id, p.author_id, p.board ${FROM} WHERE ${PUB} ORDER BY p.created DESC LIMIT 5000`).all()).results || [];
      const hosps = [...new Set(rows.filter(r => r.hospital_id !== 'community').map(r => r.hospital_id))], authors = [...new Set(rows.map(r => r.author_id).filter(Boolean))];
      return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${site}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n<url><loc>${site}/about/</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n<url><loc>${site}/blog/join/counselor</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n<url><loc>${site}/blog/join/clinic</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n<url><loc>${site}/blog/videos</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>\n<url><loc>${site}/blog/clinics</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n<url><loc>${site}/blog/install</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
<url><loc>${site}/blog/centers</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`
        + Object.keys(BOARD).map(b => `<url><loc>${site}/blog?board=${b}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n`).join('')
        + authors.map(a => `<url><loc>${site}/blog/a/${esc(a)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`).join('')
        + hosps.map(h => `<url><loc>${site}/blog/h/${esc(h)}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>\n`).join('')
        + rows.map(r => `<url><loc>${site}/blog/${esc(r.id)}</loc><lastmod>${iso(r.updated || r.created).slice(0, 10)}</lastmod><priority>${r.board ? '0.6' : '0.8'}</priority></url>\n`).join('') + '</urlset>');
    }
    if (path === '/blog/rss.xml') {
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} ORDER BY p.created DESC LIMIT 40`).all()).results || [];
      return xml(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${BRAND} 커뮤니티</title><link>${site}/</link><description>심리상담사가 쓰는 마음 돌봄 이야기와 사람들의 수다</description><language>ko</language>\n`
        + rows.map(r => `<item><title>${esc(r.title)}</title><link>${site}/blog/${esc(r.id)}</link><guid isPermaLink="true">${site}/blog/${esc(r.id)}</guid><pubDate>${new Date(Number(r.created)).toUTCString()}</pubDate><author>${esc(nameOf(r))}</author><category>${esc(BOARD[boardOf(r)].name)}</category><description>${esc(plain(r.body).slice(0, 300))}</description></item>\n`).join('')
        + '</channel></rss>', 'application/rss+xml');
    }
    const img = path.match(/^\/blog\/img\/([\w-]+)\/(\d)\.jpg$/);
    if (img) {
      const r = await db.prepare(`SELECT p.images ${FROM} WHERE p.id = ? AND ${PUB}`).bind(img[1]).first();
      return jpeg(r ? images(r.images)[+img[2]] : null);
    }
    const uav = path.match(/^\/blog\/uav\/([\w-]+)\.jpg$/);
    if (uav) {
      let r = null; try { r = await db.prepare('SELECT photo FROM user_profiles WHERE user_id = ?').bind(uav[1]).first(); } catch (e) {}
      const res = jpeg(r && r.photo);
      if (res.status === 200) res.headers.set('Cache-Control', 'public, max-age=300');
      return res;
    }
    const av = path.match(/^\/blog\/av\/([\w-]+)\.jpg$/);
    if (av) {
      const r = await db.prepare('SELECT photo FROM counselors WHERE id = ? AND active = 1').bind(av[1]).first();
      return jpeg(r && r.photo);
    }

    // ── 글쓰기 ──
    if (path === '/blog/write') {
      const b0 = WRITABLE.includes(url.searchParams.get('board')) ? url.searchParams.get('board') : 'free';
      return html(page(c, { title: `글쓰기 — ${BRAND} 커뮤니티`, desc: '커뮤니티에 글을 남겨보세요.', path: '/blog/write', noindex: true, script: WRITE_JS,
        body: `<div class="bhead"><div><h1>글쓰기</h1><p>카카오·네이버·구글로 가입하면 바로 쓸 수 있어요.</p></div></div>
          <div class="grid"><div><div class="form" style="margin-top:0;padding:1.2rem">
            <div class="pick">${WRITABLE.map(b => `<label><input type="radio" name="board" value="${b}"${b === b0 ? ' checked' : ''}><span>${BOARD[b].name}</span></label>`).join('')}</div>
            <input id="w-name" maxlength="20" placeholder="별명 (비워 두면 가입한 이름)">
            <input id="w-title" maxlength="60" placeholder="제목">
            <textarea id="w-body" maxlength="3000" style="min-height:14rem" placeholder="편하게 적어주세요.&#10;&#10;오늘 있었던 일, 웃긴 이야기, AI 상담사와 나눈 대화, 요즘 고민, 앱에 바라는 점 — 무엇이든 좋아요."></textarea>
            <div id="w-thumbs" class="thumbs"></div><input id="w-file" type="file" accept="image/*" hidden>
            <div class="row" style="margin-bottom:.6rem"><button type="button" class="btn ghost" id="w-photo">사진·캡처 넣기</button><span>4장까지. 다른 사람의 얼굴이나 이름이 보이지 않게 해주세요.</span></div>
            <label class="ck"><input type="checkbox" id="w-ok"><span><a href="/blog/po_notice_rules" target="_blank">커뮤니티 이용 규칙</a>을 읽었고, 개인정보(실명·연락처·다른 사람의 대화)를 올리지 않을게요.</span></label>
            <div class="row"><span>욕설과 연락처는 올릴 수 없어요. 모두에게 공개되는 글이에요.</span><button class="btn lg" id="w-send">올리기</button></div>
          </div></div><aside>
            <div class="card"><h2>어디에 쓸까요</h2>${WRITABLE.map(b => `<p style="margin:.4rem 0;font-size:.88rem"><span class="lab ${b}">${BOARD[b].name}</span><br><span class="m">${BOARD[b].desc}</span></p>`).join('')}</div>
            <div class="crisis"><b>지금 많이 힘드신가요?</b><br>글을 쓰기 전에 먼저 연락해 주세요. 자살예방상담전화 <b>109</b> · 정신건강 위기상담 <b>1577-0199</b> — 24시간 받습니다.</div>
          </aside></div>` }), 200, 300);
    }

    // ── 로그인 · 회원가입 ── 카카오·네이버·구글 계정이 곧 회원 계정(앱과 같은 계정). 처음 로그인하면 가입된다.
    if (path === '/blog/login') {
      return html(page(c, { title: `로그인 — ${BRAND}`, desc: '마인드 인사이드 커뮤니티 로그인·회원가입', path: '/blog/login', noindex: true, script: LOGIN_JS,
        body: `<div style="max-width:440px;margin:1.5rem auto"><div class="card" style="padding:1.6rem 1.4rem;text-align:center">
          <h1 class="serif" style="font-size:1.45rem;margin:.2rem 0 .3rem">로그인 · 회원가입</h1>
          <p class="m" style="font-size:.9rem;margin:0 0 1.2rem" id="lg-msg">처음이라면 아래 버튼을 누르는 것만으로 가입돼요. 앱과 같은 계정이에요.</p>
          <div id="lg-box">
          <div class="roles"><div class="role on"><b>일반 회원</b><span>글·댓글 쓰기, AI 상담, 상담 예약</span></div></div>
          <div id="lg-btns" class="lgs"><p class="m">불러오는 중…</p></div>
          <p class="m" style="margin:1rem 0 0;line-height:1.7">계속하면 <a href="${APP}/terms.html">이용약관</a>과 <a href="${APP}/privacy.html">개인정보처리방침</a>, <a href="/blog/po_notice_rules">커뮤니티 이용 규칙</a>에 동의한 것으로 봐요.<br>글에는 별명만 보이고 계정 정보는 공개되지 않아요.</p>
          </div>
        </div>
        <div class="card" style="padding:1.2rem 1.3rem"><h2>상담사·상담소이신가요?</h2>
          <p class="m" style="font-size:.86rem;margin:0 0 .8rem">상담사와 상담소는 자격·사업자 확인을 거쳐 따로 가입해요. 승인되면 전용 앱으로 로그인합니다.</p>
          <div class="roles">
            <a class="role" href="/blog/join/counselor"><b>심리상담사</b><span>입점 신청 → 승인 → 상담사 앱에서 예약·채팅·통화·정산, 칼럼 쓰기</span></a>
            <a class="role" href="/blog/join/clinic"><b>상담소 · 정신건강의학과</b><span>제휴 신청(사업자등록증) → 승인 → 상담소 콘솔에서 내담자·소속 상담사 관리</span></a>
          </div>
          <p class="m" style="margin:.8rem 0 0">이미 승인받았다면 <a href="https://pro.mindinsideapp.com/"><b>상담사 앱 로그인</b></a> · <a href="https://doc.mindinsideapp.com/"><b>상담소 콘솔 로그인</b></a></p>
        </div></div>` }), 200, 0);
    }
    if (path === '/blog/me') {
      return html(page(c, { title: `내 정보 — ${BRAND}`, desc: '내 정보와 내가 쓴 글', path: '/blog/me', noindex: true, script: ME_JS,
        body: `<div class="cover"><span id="me-av"><span class="av lg"></span></span><div style="flex:1;min-width:200px"><h1 id="me-name">내 정보</h1><p id="me-sub"></p></div><button class="btn ghost" id="me-out">로그아웃</button></div>
          <div class="grid"><div>
            <div class="tabs"><a class="on" data-t="posts" href="javascript:void(0)">내가 쓴 글 <span id="me-n"></span></a><a data-t="cms" href="javascript:void(0)">내 댓글 <span id="me-cn"></span></a></div>
            <div class="card" id="tab-posts"><div id="me-posts"><p class="m">불러오는 중…</p></div></div>
            <div class="card" id="tab-cms" hidden><div id="me-cms"><p class="m">불러오는 중…</p></div></div>
          </div><aside>
            <div class="card"><h2>프로필</h2><div class="form" style="box-shadow:none;border:0;padding:0;margin:0"><input id="pf-nick" maxlength="20" placeholder="별명"><input id="pf-file" type="file" accept="image/*" hidden>
              <div class="row"><button class="btn ghost" id="pf-pick" type="button">사진 고르기</button><span>글과 댓글 옆에 보여요</span><button class="btn" id="pf-save" type="button">저장</button></div></div></div>
            ${writeCard}<div class="card appcard"><h2>앱과 같은 계정이에요</h2><p>상담 예약, 캐시 충전·사용 내역, 상담 기록은 앱의 마이 탭에서 볼 수 있어요. 이 계정으로 앱에 로그인하면 그대로 이어져요.</p><a class="btn" href="${APP}/">앱에서 내 정보 보기</a></div></aside></div>` }), 200, 0);
    }

    // ── 상담사 입점 신청 · 상담소 제휴 신청 ── 앱과 같은 접수 창구(/apply · /community/hospital-apply)로 바로 보낸다. 운영팀이 심사한다.
    const jm = path.match(/^\/blog\/join\/(counselor|clinic)$/);
    if (path === '/blog/join') {
      return html(page(c, { title: `가입 안내 — ${BRAND}`, desc: '일반 회원, 심리상담사, 상담소·정신건강의학과 — 어떤 분이신가요?', path: '/blog/join',
        body: `<div class="bhead"><div><h1>어떤 분이신가요?</h1><p>역할에 따라 가입하는 길이 달라요.</p></div></div>
          <div class="boards">
            <a class="card jcard" href="/blog/login"><span class="lab free">일반 회원</span><h2>마음을 돌보고 싶어요</h2><p>카카오·네이버·구글로 바로 가입해요. 커뮤니티 글·댓글, AI 상담, 상담 예약.</p><span class="btn">가입하기</span></a>
            <a class="card jcard" href="/blog/join/counselor"><span class="lab column">심리상담사</span><h2>상담사로 입점하고 싶어요</h2><p>입점비·월 구독료 없이 신청해요. 자격 확인 뒤 상담사 앱에서 예약·채팅·통화·정산.</p><span class="btn">입점 신청</span></a>
            <a class="card jcard" href="/blog/join/clinic"><span class="lab expert">상담소 · 정신건강의학과</span><h2>기관으로 제휴하고 싶어요</h2><p>사업자등록증으로 신청해요. 승인 뒤 콘솔에서 내담자와 소속 상담사를 한 화면에서 관리.</p><span class="btn">제휴 신청</span></a>
          </div><p class="m">이미 승인받았다면 <a href="https://pro.mindinsideapp.com/"><b>상담사 앱 로그인</b></a> · <a href="https://doc.mindinsideapp.com/"><b>상담소 콘솔 로그인</b></a></p>` }), 200, 300);
    }
    if (jm) {
      const co = jm[1] === 'counselor';
      const fld = (id, label, attr, hint) => `<label class="fl"><span>${label}</span><input id="${id}" ${attr || ''}>${hint ? `<em>${hint}</em>` : ''}</label>`;
      const pic = (k, label, hint) => `<div class="fl"><span>${label}</span><div class="row" style="justify-content:flex-start"><button type="button" class="btn ghost" data-pic="${k}">사진 고르기</button><img id="pv-${k}" hidden alt="" style="height:64px;border-radius:10px"></div>${hint ? `<em>${hint}</em>` : ''}</div>`;
      return html(page(c, { title: `${co ? '상담사 입점 신청' : '상담소 제휴 신청'} — ${BRAND}`, desc: co ? '심리상담사 입점 신청. 입점비·월 구독료 없이, 자격 확인 뒤 상담사 앱에서 바로 시작해요.' : '심리상담소·정신건강의학과 제휴 신청. 사업자등록증으로 신청하고 승인 뒤 콘솔에서 관리해요.', path, script: JOIN_JS,
        body: `<div style="max-width:720px;margin:0 auto">
          <div class="bhead"><div><h1>${co ? '상담사 입점 신청' : '상담소 제휴 신청'}</h1><p>${co ? '입점비와 월 구독료가 없어요. 보통 2~3일 안에 심사 결과를 이메일로 알려드려요.' : '심리상담소·심리상담센터·정신건강의학과가 신청할 수 있어요. 2~3일 안에 이메일로 알려드려요.'}</p></div><a class="btn ghost" href="${c.about}#${co ? 'counselor' : 'clinic'}">자세한 안내</a></div>
          <div class="card" id="j-done" hidden style="text-align:center;padding:2rem 1.4rem"><h2 style="justify-content:center;font-size:1.25rem">신청을 접수했어요</h2><p>적어주신 이메일로 접수 확인 메일을 보냈어요. 심사가 끝나면 ${co ? '상담사 앱 로그인 안내' : '상담소 콘솔 로그인 안내와 상담소 코드'}를 보내드릴게요.</p><a class="btn" href="${c.home}">커뮤니티로 돌아가기</a></div>
          <form class="form jform" id="jf" data-mode="${jm[1]}" style="padding:1.3rem 1.3rem 1.5rem;margin-top:0" novalidate>
            ${co ? `<h3>기본 정보</h3>
              ${fld('j-name', '이름 *', 'maxlength="40" autocomplete="name"')}
              ${fld('j-email', '이메일 *', 'type="email" maxlength="160" autocomplete="email"', '심사 결과와 로그인 안내가 이 주소로 가요')}
              ${fld('j-tel', '연락처', 'type="tel" maxlength="20" autocomplete="tel"', '운영팀 연락용이에요. 내담자에게 보이지 않아요')}
              <h3>자격과 소개</h3>
              ${fld('j-license', '자격 *', 'maxlength="80" placeholder="예: 상담심리사 1급, 임상심리전문가"')}
              ${fld('j-career', '상담 경력', 'maxlength="20" placeholder="예: 7년"')}
              ${pic('licensePhoto', '자격증 사진 *', '심사에만 쓰고 공개되지 않아요. 자동으로 줄여서 올라가요')}
              ${fld('j-tags', '전문 분야 (3개까지, 쉼표로)', 'maxlength="60" placeholder="불안, 관계, 직장 스트레스"')}
              <label class="fl"><span>소개</span><textarea id="j-intro" maxlength="600" placeholder="어떤 고민을 주로 함께하는지, 어떤 방식으로 상담하는지 적어주세요"></textarea></label>
              ${pic('photo', '프로필 사진', '내담자에게 보이는 사진이에요. 가운데를 정사각형으로 잘라요')}
              ${fld('j-price', '30분 상담료 (원)', 'type="number" min="0" step="1000" placeholder="30000"')}
              <h3>소속과 정산</h3>
              <label class="fl"><span>소속 상담소</span><select id="j-hosp"><option value="">소속기관 없음 (개인 상담사)</option></select><em>제휴 상담소 소속이면 상담료는 상담소로 정산되고, 상담소가 승인해요</em></label>
              <div id="solo">${fld('j-place', '상담 장소 이름', 'maxlength="120" placeholder="예: ○○심리상담실 (없으면 비워 두세요)"')}${fld('j-addr', '주소', 'maxlength="200"')}
                ${fld('j-bank', '정산 은행 *', 'maxlength="40" placeholder="예: 국민은행"')}${fld('j-bankno', '계좌번호 *', 'maxlength="40" inputmode="numeric"')}${fld('j-holder', '예금주 *', 'maxlength="40"')}</div>`
            : `<h3>기관 정보</h3>
              ${fld('j-name', '상담소(기관) 이름 *', 'maxlength="60"')}
              ${fld('j-doctor', '대표자(소장) 이름 *', 'maxlength="40"')}
              ${fld('j-email', '대표 이메일 *', 'type="email" maxlength="160" autocomplete="email"', '로그인 링크와 알림이 이 주소로 가요')}
              ${fld('j-tel', '전화', 'type="tel" maxlength="30"')}
              ${fld('j-addr', '주소', 'maxlength="200"')}
              ${fld('j-dept', '전문 분야', 'maxlength="40" placeholder="예: 심리상담, 정신건강의학과"')}
              <h3>사업자 확인</h3>
              ${fld('j-bizno', '사업자등록번호 *', 'maxlength="12" inputmode="numeric" placeholder="000-00-00000"')}
              ${pic('doc', '사업자등록증 사진 *', '심사에만 쓰고 공개되지 않아요')}
              <p class="m" style="margin:.2rem 0 .8rem">정신건강의학과 의사라면 <a href="/docs/psychiatrist-counseling-business-guide.pdf" target="_blank" rel="noopener">심리상담 사업자등록 안내(PDF)</a>를 참고하세요.</p>
              <h3>소개 (상담소 페이지에 보여요)</h3>
              <label class="fl"><span>소개</span><textarea id="j-intro" maxlength="600" placeholder="어떤 고민을 함께 다루는지, 어떤 분위기인지 적어주세요"></textarea></label>
              ${fld('j-hours', '운영시간', 'maxlength="200" placeholder="평일 10:00–20:00 · 토 10:00–15:00"')}
              ${fld('j-url', '홈페이지·블로그', 'maxlength="200" placeholder="https://"')}`}
            <label class="ck"><input type="checkbox" id="j-ok"><span>적은 내용이 사실이며, <a href="${APP}/terms.html" target="_blank">이용약관</a>과 <a href="${APP}/privacy.html" target="_blank">개인정보처리방침</a>에 따라 심사와 ${co ? '정산' : '제휴 계약'}에 쓰이는 데 동의해요.</span></label>
            <button class="btn lg" id="j-send" style="width:100%">신청하기</button>
          </form></div>` }), 200, 300);
    }

    // ── 추천 영상 ── 운영팀이 고른 정신건강 유튜브(앱의 '느루의 추천'과 같은 목록 — feed 표). 영상은 유튜브에서 열린다.
    if (path === '/blog/videos') {
      const tg = (url.searchParams.get('tag') || '').slice(0, 20);
      let rows = [];
      try { rows = (await db.prepare("SELECT id, title, url, video_id, author, tags, note, (SELECT COUNT(*) FROM feed_votes v WHERE v.feed_id = f.id AND v.v = 1) AS up FROM feed f WHERE published = 1 AND type = 'youtube' AND video_id != '' ORDER BY pinned DESC, created DESC LIMIT 200").all()).results || []; } catch (e) {}
      const tagN = {}; rows.forEach(r => tagsOf(r.tags).forEach(x => { tagN[x] = (tagN[x] || 0) + 1; }));
      const shown = tg ? rows.filter(r => tagsOf(r.tags).includes(tg)) : rows;
      return html(page(c, { title: `${tg ? tg + ' — ' : ''}추천 영상 — ${BRAND}`, desc: `마음 돌봄에 도움이 되는 영상 ${rows.length}편을 주제별로 골랐어요. 감정 조절, 스트레스, 마음챙김, 관계.`, path: '/blog/videos' + (tg ? '?tag=' + encodeURIComponent(tg) : ''), nav: 'videos',
        body: `<div class="bhead"><div><h1>추천 영상</h1><p>운영팀이 하나씩 보고 고른 마음 돌봄 영상이에요. 누르면 유튜브에서 열려요.</p></div></div>
          <div class="tabs"><a href="/blog/videos"${tg ? '' : ' class="on"'}>전체 ${rows.length}</a>${Object.keys(tagN).sort((a, b) => tagN[b] - tagN[a]).map(x => `<a href="/blog/videos?tag=${encodeURIComponent(x)}"${x === tg ? ' class="on"' : ''}>${esc(x)} ${tagN[x]}</a>`).join('')}</div>
          <div class="vgrid">${shown.map(v => `<a class="vcard" href="https://www.youtube.com/watch?v=${esc(v.video_id)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(v.video_id)}/mqdefault.jpg" alt="" loading="lazy"><b>${esc(v.title)}</b><span class="m">${esc(v.author || '')}${v.up ? ' · 도움됐어요 ' + v.up : ''}</span>${v.note ? `<span class="vnote">${esc(v.note)}</span>` : ''}</a>`).join('') || '<div class="card"><p class="m">아직 올라온 영상이 없어요.</p></div>'}</div>` }), 200, 300);
    }

    // ── 가까운 정신건강의학과 ── 공공데이터(국립중앙의료원)로 쌓은 전국 목록을 거리순으로. 위치는 찾는 데만 쓰고 남기지 않는다.
    if (path === '/blog/clinics') {
      return html(page(c, { title: `가까운 정신건강의학과 찾기 — ${BRAND}`, desc: '내 위치나 지역 이름으로 가까운 정신건강의학과를 거리순으로 찾아보세요. 전국 정신건강의학과 병·의원.', path: '/blog/clinics', nav: 'clinics', script: CLINICS_JS,
        body: `<div class="bhead"><div><h1>가까운 정신건강의학과 찾기</h1><p>진단이나 약이 필요할 때는 진료를 먼저 받아 보세요. 전국 병·의원 정보는 공공데이터(국립중앙의료원)를 써요.</p></div><a class="btn ghost" href="/blog/centers">심리상담소 찾기</a></div>
          <form class="search" id="cl-form"><input id="cl-q" placeholder="지역 이름으로 찾기 — 강남구, 수원 영통, 해운대…" aria-label="지역"><button class="btn">찾기</button><button class="btn ghost" type="button" id="cl-near">내 위치로</button></form>
          <p class="m" id="cl-n" style="margin:0 0 .6rem"></p>
          <div class="boards" id="cl-list"><div class="card"><p class="m">지역 이름을 적거나 '내 위치로'를 눌러 주세요.</p></div></div>
          <div class="crisis" style="margin-top:1rem"><b>지금 위급하다면</b> 병원을 찾기 전에 먼저 전화해 주세요. 자살예방상담전화 <b>109</b> · 정신건강 위기상담 <b>1577-0199</b> · 응급 <b>119</b></div>
          <p class="m">위치는 찾는 데만 쓰고 어디에도 남기지 않아요. 처음 가는 병원은 전화로 진료 시간을 확인해 주세요.</p>` }), 200, 300);
    }

    // ── 앱 설치 ── 앱은 웹앱(PWA)이라 내려받는 파일 없이 '설치'하면 휴대폰 홈 화면·PC 프로그램 목록에 들어간다.
    if (path === '/blog/install') {
      return html(page(c, { title: `앱 설치 — ${BRAND}`, desc: '마인드 인사이드 앱을 휴대폰과 PC에 설치하는 방법. 안드로이드·아이폰·윈도·맥.', path: '/blog/install',
        body: `<div class="bhead"><div><h1>앱 설치</h1><p>내려받을 파일 없이, 앱을 연 뒤 '설치'만 누르면 휴대폰 홈 화면과 PC 프로그램 목록에 들어가요.</p></div><a class="btn lg" href="${APP}/">앱 열기</a></div>
          <div class="boards">
            <div class="card"><h2>PC (윈도 · 맥)</h2><ol class="steps"><li>크롬이나 엣지에서 <a href="${APP}/"><b>mindinsideapp.com</b></a> 을 열어요</li><li>주소창 오른쪽의 <b>설치</b> 아이콘(모니터에 화살표)을 눌러요. 안 보이면 메뉴(⋮) → '마인드 인사이드 설치'</li><li><b>설치</b>를 누르면 바탕 화면·시작 메뉴에 프로그램으로 들어가요</li></ol><p class="m" style="margin:.6rem 0 0">설치한 뒤에는 브라우저 없이 따로 창으로 열려요.</p></div>
            <div class="card"><h2>안드로이드</h2><ol class="steps"><li>크롬에서 <a href="${APP}/"><b>mindinsideapp.com</b></a> 을 열어요</li><li>화면에 뜨는 <b>앱 설치</b>를 누르거나, 메뉴(⋮) → '홈 화면에 추가'</li><li>홈 화면의 아이콘으로 열어요. 알림도 받을 수 있어요</li></ol></div>
            <div class="card"><h2>아이폰 · 아이패드</h2><ol class="steps"><li>사파리에서 <a href="${APP}/"><b>mindinsideapp.com</b></a> 을 열어요</li><li>아래 <b>공유</b> 버튼 → '홈 화면에 추가'</li><li>홈 화면의 아이콘으로 열어요</li></ol></div>
            <div class="card"><h2>상담사 · 상담소</h2><p style="margin:0 0 .6rem;font-size:.92rem">상담사 앱과 상담소 콘솔도 같은 방법으로 설치해요.</p><a class="btn ghost" href="https://pro.mindinsideapp.com/">상담사 앱 열기</a> <a class="btn ghost" href="https://doc.mindinsideapp.com/">상담소 콘솔 열기</a></div>
          </div>` }), 200, 300);
    }

    // ── 제휴 상담소 찾기 ── 이름·주소 검색, 지역 고르기, 내 위치에서 가까운 순.
    //  좌표는 상담소가 적은 주소로 구해 profile(JSON)에 lat·lng 로 적어 둔다 — 한 번에 몇 곳씩, 응답 뒤에서(느린 무료 서비스라 화면을 기다리게 하지 않는다).
    if (path === '/blog/centers') {
      const hs = (await db.prepare("SELECT id, name, dept, doctor, profile FROM hospitals WHERE active = 1 AND id != 'community' ORDER BY name LIMIT 300").all()).results || [];
      const todo = hs.filter(h => { const p = profOf(h); return p.addr && !p.lat && !p.geoTried; }).slice(0, 3);
      if (todo.length) {
        const job = Promise.all(todo.map(async h => {
          const p = profOf(h);
          try {
            const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&q=' + encodeURIComponent(p.addr), { headers: { 'User-Agent': 'mindinside/1.0 (mindinsideapp@gmail.com)', 'Accept-Language': 'ko' } });
            const j = r.ok ? await r.json() : null, hit = Array.isArray(j) ? j[0] : null;
            if (hit && Number.isFinite(+hit.lat) && Number.isFinite(+hit.lon)) { p.lat = +hit.lat; p.lng = +hit.lon; } else p.geoTried = 1;
            await db.prepare('UPDATE hospitals SET profile = ? WHERE id = ?').bind(JSON.stringify(p), h.id).run();
          } catch (e) {}
        }));
        if (ctx && ctx.waitUntil) ctx.waitUntil(job);
      }
      const regionOf = a => { const w = String(a || '').trim().split(/\s+/); return w[0] ? (/^(서울|부산|대구|인천|광주|대전|울산|세종)/.test(w[0]) ? w[0].replace(/(특별시|광역시|특별자치시)$/, '') + (w[1] && /[구군]$/.test(w[1]) ? ' ' + w[1] : '') : w[0].replace(/(특별자치도|도)$/, '') + (w[1] ? ' ' + w[1] : '')) : ''; };
      const regions = [...new Set(hs.map(h => regionOf(profOf(h).addr)).filter(Boolean))].sort();
      return html(page(c, { title: `제휴 상담소 찾기 — ${BRAND}`, desc: `${BRAND}와 제휴한 심리상담소 ${hs.length}곳. 가까운 순·지역·이름으로 찾아보고 앱에서 바로 연결하세요.`, path, nav: 'centers', script: CENTERS_JS,
        body: `<div class="bhead"><div><h1>상담소 찾기</h1><p>마인드 인사이드와 제휴한 심리상담소예요. 앱에서 상담소 코드로 연결하면 상담 기록과 선생님의 피드백이 이어져요.</p></div><a class="btn lg" href="/blog/join/clinic">상담소 제휴 신청</a></div>
          <div class="search"><input id="ct-q" placeholder="상담소 이름, 동네, 전문 분야로 찾기" aria-label="상담소 검색"><button class="btn ghost" id="ct-near" type="button">내 위치에서 가까운 순</button></div>
          <div class="tabs" id="ct-rg"><a class="on" data-r="" href="javascript:void(0)">전체 <span id="ct-n"></span></a>${regions.map(r => `<a data-r="${esc(r)}" href="javascript:void(0)">${esc(r)}</a>`).join('')}</div>
          <div class="boards" id="ct-list">${hs.map(h => { const p = profOf(h); return `<div class="card" data-ct="${esc([h.name, h.dept, h.doctor, p.addr, plain(p.intro)].join(' '))}" data-rg="${esc(regionOf(p.addr))}"${p.lat ? ` data-lat="${+p.lat}" data-lng="${+p.lng}"` : ''}><h2><a href="/blog/h/${esc(h.id)}" style="color:#2f2923">${esc(h.name)}</a><span class="lab gold" data-km hidden style="margin-left:auto"></span></h2><p class="m" style="font-size:.84rem;margin:0 0 .4rem">${esc([h.dept, h.doctor ? h.doctor + ' 소장' : ''].filter(Boolean).join(' · ') || '심리상담')}</p>${p.intro ? `<p style="margin:0 0 .5rem;font-size:.9rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(plain(p.intro))}</p>` : ''}${p.addr ? `<p class="facts"><b>주소</b>${esc(p.addr)}</p>` : ''}${p.hours ? `<p class="facts"><b>운영</b>${esc(p.hours)}</p>` : ''}<p style="margin:.7rem 0 0"><a class="btn ghost" href="/blog/h/${esc(h.id)}">자세히 보기</a>${p.addr ? ` <a class="btn ghost" href="https://map.naver.com/p/search/${encodeURIComponent(p.addr)}" target="_blank" rel="noopener">지도</a>` : ''}</p></div>`; }).join('')}</div>
          <div class="card" id="ct-empty" hidden><p class="m" style="text-align:center;margin:1rem 0">조건에 맞는 상담소가 없어요.</p></div>
          <p class="m" style="margin-top:.5rem">위치는 가까운 순으로 늘어놓는 데만 쓰고 서버로 보내지 않아요.</p>` }), 200, 120);
    }

    // ── 상담사 블로그 (자기 페이지) ──
    const am = path.match(/^\/blog\/a\/([\w-]+)$/);
    if (am) {
      const a = await db.prepare('SELECT id, name, hospital, hospital_id, hospital_ok, intro, tags, license FROM counselors WHERE id = ? AND active = 1').bind(am[1]).first();
      if (!a) return notFound(c);
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} AND p.author_id = ? ORDER BY p.created DESC LIMIT 60`).bind(a.id).all()).results || [];
      let tg = []; try { tg = JSON.parse(a.tags || '[]'); } catch (e) {}
      const sum = k => rows.reduce((x, r) => x + (r[k] || 0), 0);
      return html(page(c, { title: `${a.name} 상담사의 블로그 — ${BRAND}`, desc: (a.intro || `${a.name} 상담사가 쓴 마음 돌봄 글 모음.`).slice(0, 150), path, type: 'profile', ogImage: `${site}/blog/av/${a.id}.jpg`, nav: 'column',
        jsonld: { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: a.name, jobTitle: '심리상담사', description: a.intro || '', worksFor: a.hospital ? { '@type': 'Organization', name: a.hospital } : undefined, image: `${site}/blog/av/${a.id}.jpg` } },
        body: `<div class="cover">${avatar(a.id, a.name, 'lg')}<div style="flex:1;min-width:220px"><h1>${esc(a.name)} 상담사</h1><p>${esc([a.hospital, a.license].filter(Boolean).join(' · '))}</p>
            <div class="stats"><span><b>${rows.length}</b>글</span><span><b>${sum('likes')}</b>공감</span><span><b>${sum('views')}</b>조회</span></div></div>
            <a class="btn lg" href="${APP}/?counselor=${esc(a.id)}">이 상담사와 상담하기</a></div>
          <div class="grid"><div><div class="card"><h2>쓴 글 ${rows.length}</h2>${rows.length ? feedHtml(rows) : '<p class="m">아직 올린 글이 없어요.</p>'}</div></div>
          <aside>${a.intro ? `<div class="card"><h2>소개</h2><p style="margin:0;white-space:pre-wrap">${esc(a.intro)}</p>${Array.isArray(tg) && tg.length ? `<div class="tags" style="margin-top:.7rem">${tg.slice(0, 8).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}</div>` : ''}
            ${a.hospital_ok && a.hospital_id ? `<div class="card"><h2>소속</h2><a href="/blog/h/${esc(a.hospital_id)}">${esc(a.hospital)} 페이지 보기</a></div>` : ''}${appCard(c)}</aside></div>` }));
    }

    // ── 상담소 페이지 (소개 + 글) ──
    const hm = path.match(/^\/blog\/h\/([\w-]+)$/);
    if (hm) {
      const h = await db.prepare("SELECT id, name, dept, doctor, profile FROM hospitals WHERE id = ? AND active = 1 AND id != 'community'").bind(hm[1]).first();
      if (!h) return notFound(c);
      const p = profOf(h);
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} AND p.hospital_id = ? ORDER BY p.pinned DESC, p.created DESC LIMIT 60`).bind(h.id).all()).results || [];
      return html(page(c, { title: `${h.name} — ${BRAND} 제휴 상담소`, desc: (plain(p.intro) || `${h.name}의 소개와 상담사가 쓴 글.`).slice(0, 150), path, nav: 'centers',
        jsonld: { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: h.name, description: plain(p.intro).slice(0, 300), address: p.addr || undefined, openingHours: p.hours || undefined, url: `${site}/blog/h/${h.id}` },
        body: `<div class="cover"><span class="av lg">${esc(String(h.name).slice(0, 1))}</span><div style="flex:1;min-width:220px"><h1>${esc(h.name)}</h1><p>${esc([h.dept, h.doctor ? h.doctor + ' 소장' : ''].filter(Boolean).join(' · ') || '심리상담')}</p>
            ${p.addr ? `<p class="facts"><b>주소</b>${esc(p.addr)}</p>` : ''}${p.hours ? `<p class="facts"><b>운영</b>${esc(p.hours)}</p>` : ''}</div>
            <a class="btn lg" href="${APP}/">앱에서 이 상담소와 연결하기</a></div>
          <div class="grid"><div><div class="card"><h2>${esc(h.name)}의 글 ${rows.length}</h2>${rows.length ? feedHtml(rows) : '<p class="m">아직 올린 글이 없어요.</p>'}</div></div>
          <aside>${p.intro ? `<div class="card"><h2>소개</h2>${bodyHtml(p.intro, h.id, 0, h.name)}</div>` : ''}${appCard(c)}</aside></div>` }));
    }

    const sort = url.searchParams.get('sort') || '', tag = (url.searchParams.get('tag') || '').slice(0, 12).trim(), kw = (url.searchParams.get('q') || '').slice(0, 40).trim();
    const board = BOARD[url.searchParams.get('board')] ? url.searchParams.get('board') : '';
    const pg = Math.max(0, Math.min(100, Number(url.searchParams.get('page')) || 0));

    // ── 글 목록 (게시판·인기순·최신순·태그·검색) ──
    if (path === '/blog' && (sort || tag || kw || pg || board)) {
      const where = [PUB], args = [];
      if (board === 'column') where.push("(p.board IS NULL OR p.board = '')");
      else if (board) { where.push('p.board = ?'); args.push(board); }
      if (tag) { where.push("(',' || COALESCE(p.tags, '') || ',') LIKE ?"); args.push('%,' + tag.replace(/[%_]/g, '') + ',%'); }
      if (kw) { const like = '%' + kw.replace(/[%_]/g, '') + '%'; where.push('(p.title LIKE ? OR p.body LIKE ? OR p.tags LIKE ? OR p.author_name LIKE ? OR h.name LIKE ?)'); args.push(like, like, like, like, like); }
      const hot = sort === 'hot' || (!sort && board === 'idea');
      const order = (board === 'notice' ? 'p.pinned DESC, ' : '') + (hot ? `(likes * 3 + comments * 4 + COALESCE(p.views, 0) * 0.3 + CASE WHEN p.created > ${Date.now() - 7 * 86400000} THEN 6 ELSE 0 END) DESC, p.created DESC` : 'p.created DESC');
      const rows = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 21 OFFSET ?`).bind(...args, pg * 20).all()).results || [];
      const more = rows.length > 20; if (more) rows.pop();
      const head = kw ? `"${kw}" 검색 결과` : tag ? `#${tag}` : board ? BOARD[board].name : hot ? '인기 글' : '최신 글';
      const sub = board && !kw && !tag ? BOARD[board].desc : '';
      const qs = o => { const u = new URLSearchParams(); const all = Object.assign({ board, sort, tag, q: kw }, o); Object.keys(all).forEach(k => { if (all[k]) u.set(k, all[k]); }); const s = u.toString(); return '/blog' + (s ? '?' + s : ''); };
      const canWrite = WRITABLE.includes(board);
      return html(page(c, { title: `${head} — ${BRAND} 커뮤니티`, desc: sub || `${BRAND} 커뮤니티의 ${head}.`, path: qs({ page: pg || '' }), noindex: !!(kw || pg), nav: board || '',
        body: `<div class="bhead"><div><h1>${esc(head)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${canWrite ? `<a class="btn lg" href="/blog/write?board=${board}">글쓰기</a>` : ''}</div>
          ${board === 'meds' ? `<div class="crisis" style="background:#f3f8ef;border-color:#cfe3c4;color:#35602a"><b>경험은 나누고, 결정은 주치의와.</b> 같은 약도 사람마다 달라요. 특정 약을 권하거나 용량을 알려주는 글, 끊으라는 글은 가려져요. <a href="/blog/po_op_meds1">안내 보기</a></div>` : ''}
          <div class="tabs"><a href="${esc(qs({ sort: 'new', page: '' }))}"${hot ? '' : ' class="on"'}>최신순</a><a href="${esc(qs({ sort: 'hot', page: '' }))}"${hot ? ' class="on"' : ''}>인기순</a></div>
          <form class="search" action="/blog" method="get">${board ? `<input type="hidden" name="board" value="${board}">` : ''}<input name="q" value="${esc(kw)}" placeholder="글·태그·글쓴이 검색" aria-label="검색"><button class="btn">검색</button></form>
          <div class="grid"><div><div class="card">${rows.length ? feedHtml(rows, !board) : `<p class="m" style="text-align:center;padding:1.5rem 0">아직 글이 없어요.${canWrite ? ' 첫 글의 주인공이 되어 주세요.' : ''}</p>`}</div>
          <div class="pager">${pg ? `<a class="btn ghost" href="${esc(qs({ page: pg - 1 || '' }))}">이전</a>` : ''}${more ? `<a class="btn ghost" href="${esc(qs({ page: pg + 1 }))}">다음</a>` : ''}</div></div><aside>${canWrite || !board ? writeCard : ''}${appCard(c)}</aside></div>
          ${canWrite ? `<a class="btn fab" href="/blog/write?board=${board}">글쓰기</a>` : ''}` }));
    }

    // ── 포털 첫 화면 ──
    if (path === '/blog') {
      const all = (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} ORDER BY p.created DESC LIMIT 200`).all()).results || [];
      const of = b => all.filter(r => boardOf(r) === b);
      const noNotice = all.filter(r => boardOf(r) !== 'notice');
      const hotRows = noNotice.slice().sort((a, b) => score(b) - score(a)).slice(0, 7);
      const tagN = {}; all.forEach(r => tagsOf(r.tags).forEach(t => { tagN[t] = (tagN[t] || 0) + 1; }));
      const topTags = Object.keys(tagN).sort((a, b) => tagN[b] - tagN[a]).slice(0, 14);
      const people = {}; of('column').forEach(r => { if (!r.author_id || isSys(r)) return; const p = people[r.author_id] || (people[r.author_id] = { id: r.author_id, name: r.author_name, hosp: r.hospital_name, n: 0, likes: 0 }); p.n++; p.likes += r.likes || 0; });
      const topPeople = Object.values(people).sort((a, b) => (b.n * 2 + b.likes) - (a.n * 2 + a.likes)).slice(0, 6);
      let best = [];
      try {
        best = (await db.prepare(`SELECT c.post_id, c.name, c.text, p.title, (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes
          FROM post_comments c JOIN posts p ON p.id = c.post_id JOIN hospitals h ON h.id = p.hospital_id
          WHERE c.hidden = 0 AND c.ts > ? AND ${PUB} ORDER BY likes DESC, c.ts DESC LIMIT 5`).bind(Date.now() - 30 * 86400000).all()).results || [];
      } catch (e) {}
      best = best.filter(b => b.likes > 0);
      const notices = of('notice').sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || b.created - a.created).slice(0, 3);
      const totalC = all.reduce((x, r) => x + (r.comments || 0), 0);
      const ideas = of('idea').slice().sort((a, b) => (b.likes || 0) - (a.likes || 0) || b.created - a.created).slice(0, 6);
      let vids = [];
      try { vids = (await db.prepare("SELECT title, video_id, author FROM feed WHERE published = 1 AND type = 'youtube' AND video_id != '' ORDER BY pinned DESC, created DESC LIMIT 4").all()).results || []; } catch (e) {}
      const boardCard = (b, rows, emptyMsg) => `<div class="card"><h2><span class="lab ${b}">${BOARD[b].name}</span> <a class="all" href="/blog?board=${b}">더 보기</a></h2>${rows.length ? listHtml(rows) : `<p class="m" style="margin:.3rem 0 .6rem">${emptyMsg}</p><a class="btn ghost" href="/blog/write?board=${b}">첫 글 쓰기</a>`}</div>`;
      return html(page(c, { title: `${BRAND} — 마음 이야기가 모이는 커뮤니티`, desc: '심리상담사가 쓰는 마음 돌봄 칼럼, 누구나 떠드는 수다방, 상담사가 답하는 고민 Q&A, 심리학도 라운지. 불안·우울·수면·관계 고민을 함께 나눠요.', path: c.home === '/' ? '/' : '/blog', nav: 'home',
        jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: site + '/', potentialAction: { '@type': 'SearchAction', target: site + '/blog?q={search_term_string}', 'query-input': 'required name=search_term_string' }, publisher: { '@type': 'Organization', name: BRAND, url: site + '/' } },
        body: `<div class="hero"><div class="sp"><span class="new">마인드 인사이드 앱 출시</span><h1>혼자 버티지 않게, 마음 이야기가 모이는 곳</h1><p>AI 상담사 느루와 매일 마음을 돌보고, 필요할 땐 심리상담사와 전화·채팅으로. 지금 글 ${noNotice.length}편과 댓글 ${totalC}개가 오가고 있어요.</p></div><div class="cta"><a class="btn lg" href="${APP}/">앱 무료로 시작하기</a><a class="btn lg line" href="/blog/install">설치 방법</a><a class="btn lg line" href="${c.about}">앱 소개</a></div></div>
          <form class="search" action="/blog" method="get"><input name="q" placeholder="고민을 검색해 보세요 — 불면, 번아웃, 관계…" aria-label="검색"><button class="btn">검색</button></form>
          <div class="grid"><div>
            ${notices.length ? `<div class="card" style="padding:.7rem 1.25rem">${notices.map(n => `<div class="notice"><span class="lab notice">공지</span><a href="/blog/${esc(n.id)}">${esc(n.title)}</a></div>`).join('')}</div>` : ''}
            <div class="card"><h2>지금 인기 글 <a class="all" href="/blog?sort=hot">더 보기</a></h2>
              ${hotRows[0] ? `<a class="feat" href="/blog/${esc(hotRows[0].id)}">${cover(hotRows[0], 'cv')}<div><span class="lab gold">가장 많이 읽는 글</span><h3>${esc(hotRows[0].title)}</h3><p>${esc(plain(hotRows[0].body).slice(0, 160))}</p>${whoHtml(hotRows[0])}${meta(hotRows[0])}</div></a>
              <ol class="rank" start="2" style="counter-reset:r 1">${hotRows.slice(1).map(r => `<li><div><a href="/blog/${esc(r.id)}">${esc(r.title)}${r.comments ? `<span class="cnt">[${r.comments}]</span>` : ''}</a><span class="m">${labOf(r)} ${esc(nameOf(r))} · 조회 ${r.views || 0} · 공감 ${r.likes || 0}</span></div></li>`).join('')}</ol>` : '<p class="m">아직 글이 없어요.</p>'}</div>
            <div class="boards">${boardCard('free', of('free').slice(0, 6), '아직 조용해요. 오늘 있었던 일을 들려주세요.')}${boardCard('neru', of('neru').slice(0, 6), '내가 키운 느루를 자랑해 주세요.')}</div>
            <div class="boards">${boardCard('qna', of('qna').slice(0, 6), '고민을 올리면 상담사가 답해요.')}${boardCard('meds', of('meds').slice(0, 6), '약에 대한 경험과 궁금증을 나눠요.')}</div>
            <div class="card"><h2><span class="lab column">상담사 칼럼</span> <a class="all" href="/blog?board=column">더 보기</a></h2>${of('column').length ? feedHtml(of('column').slice(0, 8)) : '<p class="m">아직 올라온 글이 없어요.</p>'}</div>
            ${vids.length ? `<div class="card"><h2>추천 영상 <a class="all" href="/blog/videos">더 보기</a></h2><div class="vgrid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.7rem">${vids.map(v => `<a class="vcard" style="box-shadow:none;padding:.4rem .4rem .6rem" href="https://www.youtube.com/watch?v=${esc(v.video_id)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(v.video_id)}/mqdefault.jpg" alt="" loading="lazy"><b>${esc(v.title)}</b><span class="m">${esc(v.author || '')}</span></a>`).join('')}</div></div>` : ''}
            <div class="boards">${boardCard('student', of('student').slice(0, 6), '심리·상담을 공부하는 분들의 이야기를 기다려요.')}${boardCard('resident', of('resident').slice(0, 6), '전공의·수련의분들의 수련 이야기를 기다려요.')}</div>
            <div class="boards">${boardCard('expert', of('expert').slice(0, 6), '정신건강의학과 의사·상담사분들의 현장 이야기를 기다려요.')}</div>
            <div class="boards">${boardCard('idea', ideas, '앱에 바라는 기능이나 불편한 점을 알려주세요.')}</div>
          </div><aside>${writeCard}
            ${best.length ? `<div class="card"><h2>베스트 댓글</h2><ul class="best">${best.map(b => `<li><a href="/blog/${esc(b.post_id)}"><q>${esc(String(b.text).slice(0, 90))}</q></a><span class="m">${esc(b.name || '익명')} · 공감 ${b.likes} · ${esc(String(b.title).slice(0, 24))}</span></li>`).join('')}</ul></div>` : ''}
            ${topTags.length ? `<div class="card"><h2>인기 태그</h2><div class="tags">${topTags.map(t => `<a href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div></div>` : ''}
            ${topPeople.length ? `<div class="card"><h2>활발한 상담사</h2><ul class="people">${topPeople.map(p => `<li><a href="/blog/a/${esc(p.id)}">${avatar(p.id, p.name, 'md')}<span><b>${esc(p.name)} 상담사</b><span class="m">${esc(p.hosp)} · 글 ${p.n} · 공감 ${p.likes}</span></span></a></li>`).join('')}</ul></div>` : ''}
            <div class="card"><h2>가까운 곳 찾기</h2><p class="m" style="font-size:.86rem;margin:0 0 .7rem">내 위치에서 가까운 정신건강의학과와 제휴 상담소를 찾아보세요.</p><a class="btn ghost" href="/blog/clinics">정신건강의학과</a> <a class="btn ghost" href="/blog/centers">심리상담소</a></div>
            ${appCard(c)}</aside></div><a class="btn fab" href="/blog/write">글쓰기</a>` }));
    }

    // ── 글 하나 ──
    const pm = path.match(/^\/blog\/([\w-]+)$/);
    if (!pm) return notFound(c);
    const id = pm[1];
    const r = await db.prepare(`SELECT p.*, h.name AS hospital_name, h.dept AS hospital_dept ${FROM} WHERE p.id = ? AND ${PUB}`).bind(id).first();
    if (!r) return notFound(c);
    const bd = boardOf(r), isCol = bd === 'column' && !isSys(r);
    let cm = [];
    try { cm = (await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM post_comment_likes l WHERE l.comment_id = c.id) AS likes FROM post_comments c WHERE c.post_id = ? AND c.hidden = 0 ORDER BY c.ts ASC LIMIT 300').bind(id).all()).results || []; }
    catch (e) { cm = (await db.prepare('SELECT * FROM post_comments WHERE post_id = ? AND hidden = 0 ORDER BY ts ASC LIMIT 300').bind(id).all()).results || []; }
    const likes = await db.prepare('SELECT COUNT(*) n FROM post_likes WHERE post_id = ?').bind(id).first();
    const moreRows = isCol
      ? (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} AND p.id != ? AND (p.board IS NULL OR p.board = '') AND (p.hospital_id = ? OR p.author_id = ?) ORDER BY (CASE WHEN p.author_id = ? THEN 0 ELSE 1 END), p.created DESC LIMIT 5`).bind(id, r.hospital_id, r.author_id || '-', r.author_id || '-').all()).results || []
      : (await db.prepare(`SELECT ${COLS} ${FROM} WHERE ${PUB} AND p.id != ? AND ${bd === 'column' ? "(p.board IS NULL OR p.board = '')" : 'p.board = ?'} ORDER BY p.created DESC LIMIT 5`).bind(...(bd === 'column' ? [id] : [id, bd])).all()).results || [];
    const imgs = images(r.images);
    const text = plain(r.body);
    const tags = tagsOf(r.tags);
    const who = nameOf(r);
    const roots = cm.filter(x => !x.parent_id), kids = cm.filter(x => x.parent_id && roots.some(y => y.id === x.parent_id));
    const cHtml = (x, cls) => `<div class="c ${cls}${x.by_hospital ? ' pro' : ''}"><div class="hd"><b>${esc(x.name || '익명')}</b>${x.by_hospital ? `<span class="badge">${/상담사$/.test(x.name || '') ? '상담사' : '상담소'}</span>` : ''}<time datetime="${iso(x.ts)}">${kdate(x.ts)}</time></div><p>${esc(x.text)}</p></div>`;
    const shown = roots.length + kids.length;
    return html(page(c, {
      title: `${r.title} — ${isCol ? who : BOARD[bd].name}`, desc: text.slice(0, 150), path: '/blog/' + id, type: 'article', nav: bd,
      ogImage: imgs.length ? `${site}/blog/img/${id}/0.jpg` : bd === 'column' ? stockOf(id) : '', script: POST_JS(id),
      jsonld: { '@context': 'https://schema.org', '@type': bd === 'column' ? 'BlogPosting' : 'DiscussionForumPosting', headline: r.title, description: text.slice(0, 150), text: text.slice(0, 3000),
        datePublished: iso(r.created), dateModified: iso(r.updated || r.created), mainEntityOfPage: `${site}/blog/${id}`, url: `${site}/blog/${id}`,
        author: isCol && r.author_name ? { '@type': 'Person', name: r.author_name, jobTitle: '심리상담사', url: `${site}/blog/a/${r.author_id}`, worksFor: { '@type': 'Organization', name: r.hospital_name } } : isCol ? { '@type': 'Organization', name: r.hospital_name } : { '@type': 'Person', name: who },
        publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: site + '/icon.png' } },
        image: imgs.map((x, i) => `${site}/blog/img/${id}/${i}.jpg`), keywords: tags.join(', '), commentCount: shown,
        interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: (likes && likes.n) || 0 },
        comment: roots.slice(0, 30).map(x => ({ '@type': 'Comment', text: x.text, dateCreated: iso(x.ts), author: { '@type': 'Person', name: x.name || '익명' } })) },
      body: `<div class="grid"><div><article class="post">
          <div><a href="/blog?board=${bd}">${labOf(r)}</a> ${tags.map(t => `<a class="tag" href="/blog?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>
          <h1>${esc(r.title)}</h1>
          <div class="byline">${isCol ? avatar(r.author_id, who, 'md') : avatarU(r.client_id, who, 'md')}<div style="flex:1"><b>${isCol && r.author_id ? `<a href="/blog/a/${esc(r.author_id)}">${esc(who)}</a>` : esc(who)}</b>
            <span class="m">${isCol ? `<a href="/blog/h/${esc(r.hospital_id)}">${esc(r.hospital_name)}</a> · ` : ''}<time datetime="${iso(r.created)}">${kdate(r.created)}</time>${r.updated && r.updated - r.created > 60000 ? ' · 수정됨' : ''} · 조회 ${r.views || 0}</span></div>
            ${isCol && r.author_id ? `<a class="btn ghost" href="/blog/a/${esc(r.author_id)}">블로그</a>` : ''}</div>
          ${bd === 'column' && !imgs.length ? `<figure><img src="${stockOf(id)}" alt="" style="aspect-ratio:16/9;object-fit:cover"></figure>` : ''}${bodyHtml(r.body, id, imgs.length, r.title)}
          <div class="acts"><button class="act" data-a="like">♥ 공감 ${(likes && likes.n) || 0}</button><button class="act" data-a="share">공유</button>${bd === 'notice' ? '' : `<button class="act sub" data-a="report">신고</button><button class="act sub" data-a="del" hidden>내 글 지우기</button>`}</div></article>
          ${isCol ? `<div class="card appcard" style="margin-top:1rem"><h2>이 글을 쓴 ${r.author_name ? '상담사' : '상담소'}와 이야기해 보고 싶다면</h2><p>마인드 인사이드 앱에서 전화·채팅으로 바로 상담을 예약할 수 있어요.</p><a class="btn" href="${APP}/${r.author_id ? '?counselor=' + esc(r.author_id) : ''}">상담 알아보기</a></div>` : bd === 'qna' ? `<div class="card appcard" style="margin-top:1rem"><h2>혼자 고민하기 벅차다면</h2><p>앱에서 AI 상담사 느루와 바로 이야기하거나, 심리상담사에게 전화·채팅 상담을 받을 수 있어요.</p><a class="btn" href="${APP}/">앱에서 상담하기</a></div>` : ''}
          <section class="cm"><div class="sec"><h2>${bd === 'qna' ? '답변·댓글' : '댓글'} <span id="cm-n">${shown}</span></h2></div>
            <div id="cm-list">${roots.length ? roots.map(x => cHtml(x, '') + kids.filter(k => k.parent_id === x.id).map(k => cHtml(k, 'r')).join('')).join('') : '<p class="m">첫 댓글을 남겨보세요. 따뜻한 한마디면 충분해요.</p>'}</div>
            <div class="form"><button id="cm-to" class="tag" data-a="noreply" hidden style="border:0"></button><input id="cm-name" maxlength="20" placeholder="별명 (비워 두면 가입한 이름)"><textarea id="cm-text" maxlength="500" placeholder="${bd === 'qna' ? '비슷한 경험이나 도움이 될 말을 남겨주세요' : '댓글을 남겨보세요'}"></textarea>
              <div class="row"><span>욕설과 연락처는 올릴 수 없어요. 모두에게 보이는 공개 댓글이에요.</span><button class="btn" data-a="send">올리기</button></div></div></section>
        </div><aside>${moreRows.length ? `<div class="card"><h2>${isCol ? '이어서 읽기' : BOARD[bd].name + '의 다른 글'}</h2>${listHtml(moreRows)}</div>` : ''}${isCol ? '' : writeCard}${appCard(c)}</aside></div>` }));
  } catch (e) {
    // 표나 칸이 아직 없는 배포에서도 앱 전체가 죽지 않게
    return notFound(c);
  }
}

// 글이 발행되면 네이버·빙(IndexNow)에 새 주소를 알린다 — 검색엔진이 지도를 다시 읽으러 올 때까지 기다리지 않게.
//  구글·다음은 이런 알림 창구가 없다(사이트맵을 주기적으로 읽는다).
export function pingIndexNow(ctx, id, env) {
  const u = encodeURIComponent(`${siteOf(env)}/blog/${cleanId(id)}`);
  const all = Promise.all(['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']
    .map(ep => fetch(`${ep}?url=${u}&key=${INDEXNOW_KEY}`).catch(() => {})));
  if (ctx && ctx.waitUntil) ctx.waitUntil(all);
  return all;
}
